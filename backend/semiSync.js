"use strict";
// Sincronización de semielaborados con la planilla (botón "Sincronizar"): la planilla manda. Después de aplicarla, el stock de cada
// depósito de la app queda IGUAL a la pestaña correspondiente (STOCK 33, 26, Ayolas y 37).
// Reglas para que no queden cosas disparejas:
//  - Si alguna pestaña no se puede leer (o viene vacía) no se cambia nada: antes se salteaba en silencio y ese depósito quedaba en cero.
//  - Los números se leen bien aunque vengan con punto de miles ("1.280") o coma decimal ("12,5").
//  - Una fila sin número en la columna de stock no cuenta (no pisa con cero).
//  - Un código que la planilla trae en una pestaña pero no en otra queda en 0 en esa otra (la planilla es la verdad).
//  - Los códigos de la app que no figuran en ninguna pestaña no se tocan: se informan aparte.
const { filasCSV, numeroPlanilla } = require("./semiMovimientos");

const NOMBRE = { stock_33: "STOCK 33", stock_26: "STOCK 26", stock_ayolas: "STOCK AYOLAS", stock_37: "STOCK 37" };

const DEPOSITOS = ["stock_33", "stock_26", "stock_ayolas", "stock_37"];

/** Filas de una pestaña de stock: código en A, nombre en B, stock en E. Devuelve Map CÓDIGO → { nombre, stock }. */
function leerPestana(texto, excluidos = []) {
  const out = new Map();
  for (const f of filasCSV(texto)) {
    if (f.length < 5 || !f[0]) continue;
    const codigo = f[0].toUpperCase().trim();
    if (excluidos.includes(codigo)) continue;
    const v = numeroPlanilla(f[4]);
    if (v === null) continue;
    out.set(codigo, { nombre: (f[1] || "").trim() || codigo, stock: v });
  }
  return out;
}

/**
 * Lee las cuatro pestañas. urls = { stock_33: url, ... }. Si una falla o no trae ningún código lanza un error que dice cuál:
 * así nunca se aplica una planilla a medias.
 */
async function leerPlanilla(urls, { traer, excluidos = [] }) {
  const por = {};
  for (const dep of DEPOSITOS) {
    if (!urls[dep]) continue;
    let texto;
    try {
      texto = await traer(urls[dep]);
    } catch (e) {
      throw new Error(`No pude leer la pestaña ${NOMBRE[dep]} de la planilla (${e.message}). No se cambió nada.`);
    }
    const mapa = leerPestana(texto, excluidos);
    if (!mapa.size) throw new Error(`La pestaña ${NOMBRE[dep]} de la planilla vino vacía o con otro formato. No se cambió nada.`);
    por[dep] = mapa;
  }
  const codigos = new Map();
  for (const dep of Object.keys(por)) for (const [c, v] of por[dep]) if (!codigos.has(c)) codigos.set(c, v.nombre);
  const filas = {};
  for (const [codigo, nombre] of codigos) {
    filas[codigo] = { codigo, nombre };
    for (const dep of DEPOSITOS) filas[codigo][dep] = por[dep] ? por[dep].get(codigo)?.stock ?? 0 : undefined;
  }
  return filas;
}

/** Compara la planilla con lo que hay en la app. */
function compararPlanilla(filas, semis) {
  const porCodigo = new Map(semis.map((s) => [String(s.codigo).toUpperCase().trim(), s]));
  const nuevos = [];
  const modificados = [];
  for (const [codigo, h] of Object.entries(filas)) {
    const s = porCodigo.get(codigo);
    if (!s) {
      nuevos.push({ codigo, nombre: h.nombre, ...Object.fromEntries(DEPOSITOS.map((d) => [d, h[d] ?? 0])) });
      continue;
    }
    const actual = Object.fromEntries(DEPOSITOS.map((d) => [d, Number(s[d]) || 0]));
    // Un depósito que la planilla no trae queda como está en la app.
    const nuevo = Object.fromEntries(DEPOSITOS.map((d) => [d, h[d] === undefined ? actual[d] : h[d]]));
    if (DEPOSITOS.some((d) => Math.abs(nuevo[d] - actual[d]) > 0.001)) modificados.push({ id: s.id, codigo: s.codigo, nombre: s.nombre, actual, nuevo });
  }
  const sinPlanilla = semis.filter((s) => !(String(s.codigo).toUpperCase().trim() in filas)).map((s) => ({ id: s.id, codigo: s.codigo, nombre: s.nombre }));
  return { nuevos, modificados, sin_planilla: sinPlanilla };
}

/** Aplica nuevos y modificados. Devuelve cuántos. Un código que ya existe no se duplica: se actualiza. */
async function aplicarPlanilla(db, { nuevos = [], modificados = [] }) {
  const conn = await db.getConnection();
  let creados = 0;
  let actualizados = 0;
  try {
    await conn.beginTransaction();
    for (const n of nuevos) {
      const codigo = String(n.codigo || "").toUpperCase().trim();
      if (!codigo) continue;
      const vals = DEPOSITOS.map((d) => Number(n[d]) || 0);
      const [ya] = await conn.query("SELECT id FROM semielaborados WHERE UPPER(TRIM(codigo)) = ? LIMIT 1", [codigo]);
      if (ya.length) {
        await conn.query(`UPDATE semielaborados SET ${DEPOSITOS.map((d) => `${d} = ?`).join(", ")} WHERE id = ?`, [...vals, ya[0].id]);
        actualizados++;
      } else {
        await conn.query(`INSERT INTO semielaborados (codigo, nombre, ${DEPOSITOS.join(", ")}) VALUES (?, ?, ?, ?, ?, ?)`, [codigo, n.nombre || codigo, ...vals]);
        creados++;
      }
    }
    for (const m of modificados) {
      if (!m.id || !m.nuevo) continue;
      const [r] = await conn.query(`UPDATE semielaborados SET ${DEPOSITOS.map((d) => `${d} = ?`).join(", ")} WHERE id = ?`, [...DEPOSITOS.map((d) => Number(m.nuevo[d]) || 0), m.id]);
      actualizados += r.affectedRows ? 1 : 0;
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
  return { creados, actualizados };
}

module.exports = { leerPestana, leerPlanilla, compararPlanilla, aplicarPlanilla, DEPOSITOS };
