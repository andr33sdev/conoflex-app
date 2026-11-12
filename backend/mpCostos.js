"use strict";
// Materias primas: sincronización con el Excel del sistema de gestión, y costos (solo administradores).
//
// SINCRONIZACIÓN CON EL EXCEL
//   - Código que ya está en la app: se deja como está (no se toca stock, nombre ni nada).
//   - Código que está en el Excel y no en la app: se da de alta con stock 0.
//   - Código que está en la app y no en el Excel: se propone eliminarla. Si se usa en recetas, borrarla
//     también borra esa línea de las recetas (la base lo hace sola), por eso se avisa y el admin elige.
//     Lo eliminado queda guardado en mp_eliminadas (materia prima + líneas de receta) por si hay que volver atrás.
//
// COSTOS (en dólares, por unidad de medida de cada materia prima)
//   - El costo de cada materia prima vive en una tabla aparte (mp_costos), así ninguna pantalla ni agente
//     que lea materias_primas puede mostrarlo sin querer. Solo rutas de administrador lo leen o lo cambian.
//   - Semielaborado = suma de (cantidad por pieza × costo) de su receta activa (materias primas y otros semis).
//   - Producto terminado (códigos de estado_pedidos) = lo mismo con su receta activa (semis + materias primas).
//   - Si falta algún costo, el total se muestra igual pero marcado como incompleto, con lo que falta.

const UNIDADES_EXCEL = {
  UN: "UNIDADES",
  UNID: "UNIDADES",
  UNIDAD: "UNIDADES",
  UNIDADES: "UNIDADES",
  PAR: "UNIDADES",
  ART: "UNIDADES",
  HS: "UNIDADES",
  KG: "KILOS",
  KILOS: "KILOS",
  METRO: "METROS",
  METROS: "METROS",
  M: "METROS",
  M2: "M2",
  LITRO: "LITROS",
  LITROS: "LITROS",
  LT: "LITROS",
  ROLLO: "ROLLOS",
  ROLLOS: "ROLLOS",
  PAQUETE: "PAQUETES",
  PAQUETES: "PAQUETES",
};

const clave = (v) => String(v ?? "").trim().toUpperCase();
const redondear = (n, d = 4) => Math.round((Number(n) + Number.EPSILON) * 10 ** d) / 10 ** d;

function unidadDesdeExcel(u) {
  const k = clave(u).replace(/\./g, "");
  return UNIDADES_EXCEL[k] || "UNIDADES";
}

/** Normaliza lo que manda el navegador (filas leídas del Excel). Descarta vacías y repetidas. */
function filasValidas(filas) {
  const vistos = new Set();
  const out = [];
  for (const f of Array.isArray(filas) ? filas : []) {
    const codigo = clave(f?.codigo).replace(/\s+/g, " ").slice(0, 255);
    if (!codigo || vistos.has(codigo)) continue;
    vistos.add(codigo);
    out.push({ codigo, nombre: String(f?.nombre ?? "").trim().slice(0, 255) || codigo, unidad_medida: unidadDesdeExcel(f?.unidad) });
  }
  return out;
}

/**
 * Compara el Excel con la app.
 *  actuales: [{ id, codigo, nombre, unidad_medida, stock_actual }]
 *  usos: Map(materia_prima_id → [nombres de recetas que la usan])
 */
function compararConExcel(filas, actuales, usos = new Map()) {
  const excel = filasValidas(filas);
  const enExcel = new Set(excel.map((f) => f.codigo));
  const enApp = new Set(actuales.map((m) => clave(m.codigo).replace(/\s+/g, " ")));
  const nuevas = excel.filter((f) => !enApp.has(f.codigo));
  const iguales = excel.length - nuevas.length;
  const eliminar = actuales
    .filter((m) => !enExcel.has(clave(m.codigo).replace(/\s+/g, " ")))
    .map((m) => ({ id: m.id, codigo: m.codigo, nombre: m.nombre, unidad_medida: m.unidad_medida, stock_actual: Number(m.stock_actual) || 0, recetas: usos.get(m.id) || [] }))
    .sort((a, b) => b.recetas.length - a.recetas.length || String(a.codigo).localeCompare(String(b.codigo)));
  return { total_excel: excel.length, nuevas, iguales, eliminar };
}

/**
 * Costo de semielaborados y productos terminados según sus recetas activas.
 *  costosMP: Map(mp_id → costo | null)
 *  recetas: [{ id, semielaborado_id, producto_terminado_id }]   (solo activas)
 *  detalles: [{ ingenieria_id, materia_prima_id, semielaborado_id, cantidad }]
 *  nombres: { mp: Map(id → {codigo, nombre, unidad}), se: Map(id → {codigo, nombre}) }
 * Devuelve { se: Map(id → resultado), pt: Map(id → resultado) }; resultado = { costo, completo, faltan, lineas }
 */
function calcularCostos({ costosMP, recetas, detalles, nombres = { mp: new Map(), se: new Map() } }) {
  const lineasDe = new Map();
  for (const d of detalles) {
    if (!lineasDe.has(d.ingenieria_id)) lineasDe.set(d.ingenieria_id, []);
    lineasDe.get(d.ingenieria_id).push(d);
  }
  const recetaSE = new Map();
  const recetaPT = new Map();
  for (const r of recetas) {
    if (r.semielaborado_id && !recetaSE.has(r.semielaborado_id)) recetaSE.set(r.semielaborado_id, r.id);
    else if (r.producto_terminado_id && !recetaPT.has(r.producto_terminado_id)) recetaPT.set(r.producto_terminado_id, r.id);
  }

  const memo = new Map();
  const enCurso = new Set();

  function costoReceta(recetaId, cadena) {
    let costo = 0;
    const faltan = new Set();
    const lineas = [];
    for (const d of lineasDe.get(recetaId) || []) {
      const cant = Number(d.cantidad) || 0;
      if (d.materia_prima_id) {
        const unit = costosMP.get(d.materia_prima_id);
        const n = nombres.mp.get(d.materia_prima_id) || {};
        const ok = unit != null && Number.isFinite(Number(unit));
        if (ok) costo += cant * Number(unit);
        else faltan.add(`Falta el costo de la materia prima ${n.codigo || d.materia_prima_id}`);
        lineas.push({ tipo: "MP", id: d.materia_prima_id, codigo: n.codigo || null, nombre: n.nombre || null, unidad: n.unidad || null, cantidad: cant, unitario: ok ? Number(unit) : null, subtotal: ok ? redondear(cant * Number(unit)) : null });
      } else if (d.semielaborado_id) {
        const sub = costoSE(d.semielaborado_id, cadena);
        const n = nombres.se.get(d.semielaborado_id) || {};
        if (sub.costo != null) costo += cant * sub.costo;
        for (const f of sub.faltan) faltan.add(f);
        lineas.push({ tipo: "SE", id: d.semielaborado_id, codigo: n.codigo || null, nombre: n.nombre || null, unidad: "u", cantidad: cant, unitario: sub.costo, subtotal: sub.costo != null ? redondear(cant * sub.costo) : null, completo: sub.completo });
      }
    }
    return { costo, faltan, lineas };
  }

  function costoSE(id, cadena = new Set()) {
    if (memo.has(id)) return memo.get(id);
    const n = nombres.se.get(id) || {};
    if (enCurso.has(id) || cadena.has(id)) return { costo: null, completo: false, faltan: [`La receta del semielaborado ${n.codigo || id} se incluye a sí misma`], lineas: [] };
    const recetaId = recetaSE.get(id);
    if (!recetaId) {
      const r = { costo: null, completo: false, faltan: [`El semielaborado ${n.codigo || id} no tiene receta activa`], lineas: [], sin_receta: true };
      memo.set(id, r);
      return r;
    }
    enCurso.add(id);
    const sigCadena = new Set(cadena).add(id);
    const c = costoReceta(recetaId, sigCadena);
    enCurso.delete(id);
    const r = { costo: redondear(c.costo), completo: c.faltan.size === 0, faltan: [...c.faltan], lineas: c.lineas, receta_id: recetaId };
    memo.set(id, r);
    return r;
  }

  const se = new Map();
  for (const id of new Set([...recetaSE.keys(), ...nombres.se.keys()])) se.set(id, costoSE(id));
  const pt = new Map();
  for (const [ptId, recetaId] of recetaPT) {
    const c = costoReceta(recetaId, new Set());
    pt.set(ptId, { costo: redondear(c.costo), completo: c.faltan.size === 0, faltan: [...c.faltan], lineas: c.lineas, receta_id: recetaId });
  }
  return { se, pt };
}

/** Valida un costo que carga el admin: vacío = sin costo; si no, número ≥ 0 (acepta coma decimal). */
function validarCosto(v) {
  if (v === null || v === undefined || String(v).trim() === "") return { costo: null };
  const n = Number(String(v).trim().replace(/\./g, (m, i, s) => (s.includes(",") ? "" : m)).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return { error: "El costo tiene que ser un número mayor o igual a cero." };
  if (n > 1e9) return { error: "Ese costo es demasiado alto." };
  return { costo: redondear(n, 6) };
}

// ---------------------------------------------------------------- base de datos

/**
 * Guarda un costo y deja el cambio en el historial (solo si de verdad cambió).
 * `conn` puede ser el pool o una conexión dentro de una transacción.
 */
async function guardarCosto(conn, { id, costo, usuario, origen = "MANUAL", detalle = null }) {
  const [[mp]] = await conn.query("SELECT m.codigo, c.costo FROM materias_primas m LEFT JOIN mp_costos c ON c.materia_prima_id = m.id WHERE m.id = ?", [id]);
  if (!mp) return { cambio: false, existe: false };
  const antes = mp.costo == null ? null : Number(mp.costo);
  const igual = (antes == null && costo == null) || (antes != null && costo != null && Math.abs(antes - costo) < 1e-9);
  if (igual) return { cambio: false, existe: true };
  await conn.query("INSERT INTO mp_costos (materia_prima_id, costo, actualizado_por) VALUES (?,?,?) ON DUPLICATE KEY UPDATE costo = VALUES(costo), actualizado_por = VALUES(actualizado_por), updated_at = NOW()", [id, costo, usuario || null]);
  await conn.query("INSERT INTO mp_costos_historial (materia_prima_id, codigo, antes, despues, origen, detalle, usuario) VALUES (?,?,?,?,?,?,?)", [id, mp.codigo, antes, costo, origen, detalle ? String(detalle).slice(0, 255) : null, usuario || null]);
  return { cambio: true, existe: true, antes };
}

async function asegurarTablasCostos(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS mp_costos (
    materia_prima_id INT PRIMARY KEY,
    costo DOUBLE NULL,
    actualizado_por VARCHAR(120) NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  // Trazabilidad: cada cambio de costo, quién, cuándo, de cuánto a cuánto y de dónde salió.
  await db.query(`CREATE TABLE IF NOT EXISTS mp_costos_historial (
    id INT AUTO_INCREMENT PRIMARY KEY,
    materia_prima_id INT NOT NULL,
    codigo VARCHAR(255) NULL,
    antes DOUBLE NULL,
    despues DOUBLE NULL,
    origen VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
    detalle VARCHAR(255) NULL,
    usuario VARCHAR(120) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX (materia_prima_id, id)
  )`);
  // Último aviso de "costo viejo" por materia prima (para no repetir la misma notificación todos los días).
  await db.query(`CREATE TABLE IF NOT EXISTS mp_costos_avisos (
    materia_prima_id INT PRIMARY KEY,
    avisado_at DATETIME NOT NULL
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS mp_eliminadas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    materia_prima_id INT NOT NULL,
    codigo VARCHAR(255) NOT NULL,
    datos LONGTEXT NOT NULL,
    lineas_receta LONGTEXT NULL,
    eliminada_por VARCHAR(120) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

/** Los productos terminados salen de los modelos de estado_pedidos: se agregan los que falten (no se borra nada). */
async function asegurarPTDesdePedidos(db) {
  try {
    const [r] = await db.query(
      `INSERT IGNORE INTO productos_terminados (codigo, nombre)
       SELECT DISTINCT UPPER(TRIM(modelo)), UPPER(TRIM(modelo)) FROM estado_pedidos WHERE modelo IS NOT NULL AND TRIM(modelo) <> ''`,
    );
    return r.affectedRows || 0;
  } catch (e) {
    console.error("[costos] no se pudieron traer los productos de estado_pedidos:", e.message);
    return 0;
  }
}

async function usosEnRecetas(db, ids) {
  const usos = new Map();
  if (!ids.length) return usos;
  const [rows] = await db.query(
    `SELECT d.materia_prima_id AS mp, i.nombre_version, i.es_activa, COALESCE(s.codigo, p.codigo) AS padre
       FROM ingenieria_detalles d
       JOIN ingenierias i ON i.id = d.ingenieria_id
       LEFT JOIN semielaborados s ON s.id = i.semielaborado_id
       LEFT JOIN productos_terminados p ON p.id = i.producto_terminado_id
      WHERE d.materia_prima_id IN (?)`,
    [ids],
  );
  for (const r of rows) {
    if (!usos.has(r.mp)) usos.set(r.mp, []);
    usos.get(r.mp).push(`${r.padre || "?"} · ${r.nombre_version}${Number(r.es_activa) ? " (activa)" : ""}`);
  }
  return usos;
}

async function previsualizar(db, filas) {
  const [actuales] = await db.query("SELECT id, codigo, nombre, unidad_medida, stock_actual FROM materias_primas");
  const base = compararConExcel(filas, actuales);
  const usos = await usosEnRecetas(db, base.eliminar.map((m) => m.id));
  return compararConExcel(filas, actuales, usos);
}

/** Aplica: alta de las nuevas (stock 0) y baja de las elegidas (solo si siguen fuera del Excel). Todo o nada. */
async function aplicar(db, filas, eliminarIds, usuario) {
  const plan = await previsualizar(db, filas);
  const permitidas = new Map(plan.eliminar.map((m) => [m.id, m]));
  const aBorrar = [...new Set((Array.isArray(eliminarIds) ? eliminarIds : []).map(Number))].filter((id) => permitidas.has(id));
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const n of plan.nuevas) {
      await conn.query("INSERT INTO materias_primas (codigo, nombre, unidad_medida, stock_actual) VALUES (?, ?, ?, 0)", [n.codigo, n.nombre, n.unidad_medida]);
    }
    let lineasBorradas = 0;
    for (const id of aBorrar) {
      const [[mp]] = await conn.query("SELECT * FROM materias_primas WHERE id = ? FOR UPDATE", [id]);
      if (!mp) continue;
      const [lineas] = await conn.query("SELECT * FROM ingenieria_detalles WHERE materia_prima_id = ?", [id]);
      const [[costo]] = await conn.query("SELECT costo FROM mp_costos WHERE materia_prima_id = ?", [id]);
      await conn.query("INSERT INTO mp_eliminadas (materia_prima_id, codigo, datos, lineas_receta, eliminada_por) VALUES (?,?,?,?,?)", [id, mp.codigo, JSON.stringify({ ...mp, costo: costo?.costo ?? null }), lineas.length ? JSON.stringify(lineas) : null, usuario || null]);
      await conn.query("DELETE FROM sugerencias_compra WHERE materia_prima_id = ? AND estado = 'PENDIENTE'", [id]).catch(() => {}); // sugerencias de compra que ya no tienen sentido
      await conn.query("DELETE FROM mp_costos WHERE materia_prima_id = ?", [id]);
      await conn.query("DELETE FROM materias_primas WHERE id = ?", [id]); // las líneas de receta se van con ella (ON DELETE CASCADE)
      lineasBorradas += lineas.length;
    }
    await conn.commit();
    return { altas: plan.nuevas.length, bajas: aBorrar.length, iguales: plan.iguales, lineas_receta_borradas: lineasBorradas, quedaron_sin_borrar: plan.eliminar.length - aBorrar.length };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function costosCompletos(db) {
  await asegurarPTDesdePedidos(db);
  const [mps] = await db.query(
    `SELECT m.id, m.codigo, m.nombre, m.unidad_medida, c.costo, c.actualizado_por,
            COALESCE((SELECT MAX(h.created_at) FROM mp_costos_historial h WHERE h.materia_prima_id = m.id), c.updated_at) AS updated_at
       FROM materias_primas m LEFT JOIN mp_costos c ON c.materia_prima_id = m.id ORDER BY m.codigo`,
  );
  const [ses] = await db.query("SELECT id, codigo, nombre FROM semielaborados ORDER BY codigo");
  const [pts] = await db.query("SELECT id, codigo, nombre FROM productos_terminados ORDER BY codigo");
  const [recetas] = await db.query("SELECT id, semielaborado_id, producto_terminado_id FROM ingenierias WHERE es_activa = 1 ORDER BY id DESC");
  const [detalles] = recetas.length ? await db.query("SELECT ingenieria_id, materia_prima_id, semielaborado_id, cantidad FROM ingenieria_detalles WHERE ingenieria_id IN (?)", [recetas.map((r) => r.id)]) : [[]];
  const nombres = {
    mp: new Map(mps.map((m) => [m.id, { codigo: m.codigo, nombre: m.nombre, unidad: m.unidad_medida }])),
    se: new Map(ses.map((s) => [s.id, { codigo: s.codigo, nombre: s.nombre }])),
  };
  const costosMP = new Map(mps.map((m) => [m.id, m.costo == null ? null : Number(m.costo)]));
  const r = calcularCostos({ costosMP, recetas, detalles, nombres });
  const armar = (lista, mapa) =>
    lista.map((x) => {
      const c = mapa.get(x.id);
      return { id: x.id, codigo: x.codigo, nombre: x.nombre, costo: c?.costo ?? null, completo: !!c?.completo, sin_receta: !c || !!c.sin_receta, faltan: c?.faltan || [], lineas: c?.lineas || [] };
    });
  return {
    materias: mps.map((m) => ({ id: m.id, codigo: m.codigo, nombre: m.nombre, unidad: m.unidad_medida, costo: m.costo == null ? null : Number(m.costo), actualizado: m.updated_at, actualizado_por: m.actualizado_por, dias: m.costo == null || !m.updated_at ? null : Math.floor((Date.now() - new Date(m.updated_at).getTime()) / 86400000) })),
    semielaborados: armar(ses, r.se),
    productos: armar(pts, r.pt),
  };
}

function registrarRutasCostos(app, { db, requireAdmin }) {
  const err = (res, e) => {
    console.error("[costos]", e);
    res.status(500).json({ error: e.message });
  };
  const usuarioDe = (req) => req.user?.nombre || req.user?.email || (req.user?.id ? `usuario ${req.user.id}` : null);

  app.post("/api/materias-primas/excel/previsualizar", requireAdmin, async (req, res) => {
    try {
      const filas = req.body?.filas;
      if (!filasValidas(filas).length) return res.status(400).json({ error: "El Excel no tiene códigos de materias primas." });
      res.json(await previsualizar(db, filas));
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/materias-primas/excel/aplicar", requireAdmin, async (req, res) => {
    try {
      const filas = req.body?.filas;
      if (!filasValidas(filas).length) return res.status(400).json({ error: "El Excel no tiene códigos de materias primas." });
      res.json(await aplicar(db, filas, req.body?.eliminar, usuarioDe(req)));
    } catch (e) {
      err(res, e);
    }
  });

  app.get("/api/costos", requireAdmin, async (req, res) => {
    try {
      res.json(await costosCompletos(db));
    } catch (e) {
      err(res, e);
    }
  });

  app.get("/api/materias-primas/:id/costo", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [[c]] = await db.query("SELECT costo, actualizado_por, updated_at FROM mp_costos WHERE materia_prima_id = ?", [id]);
      const [historial] = await db.query("SELECT id, antes, despues, origen, detalle, usuario, created_at FROM mp_costos_historial WHERE materia_prima_id = ? ORDER BY id DESC LIMIT 100", [id]);
      res.json({ costo: c?.costo ?? null, actualizado_por: c?.actualizado_por ?? null, actualizado: c?.updated_at ?? null, historial });
    } catch (e) {
      err(res, e);
    }
  });

  app.put("/api/materias-primas/:id/costo", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: "Materia prima no válida." });
      const v = validarCosto(req.body?.costo);
      if (v.error) return res.status(400).json({ error: v.error });
      const r = await guardarCosto(db, { id, costo: v.costo, usuario: usuarioDe(req), origen: "MANUAL" });
      if (!r.existe) return res.status(404).json({ error: "Esa materia prima no existe." });
      res.json({ ok: true, costo: v.costo, cambio: r.cambio });
    } catch (e) {
      err(res, e);
    }
  });
}

module.exports = {
  unidadDesdeExcel,
  filasValidas,
  compararConExcel,
  calcularCostos,
  validarCosto,
  guardarCosto,
  asegurarTablasCostos,
  asegurarPTDesdePedidos,
  previsualizar,
  aplicar,
  costosCompletos,
  registrarRutasCostos,
};
