"use strict";
// Materias primas según el plan de producción de la semana (y nada más):
// de cada lote del plan se toma lo que TODAVÍA falta fabricar (planificado - producción aprobada), se lo multiplica por la receta y se
// compara con el stock actual. No hay estimaciones de demanda en el tiempo: lo que no está en el plan de la semana no se calcula, y
// cuando la semana termina, lo que quedó sin producir deja de descontar del stock teórico (el plan de la semana siguiente es otro).
const P = require("./produccionPlan");

const r1 = (n) => Math.round((Number(n) + Number.EPSILON) * 10) / 10;
const r3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

function hoyArgentina(ahora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ahora);
}

/**
 * Cálculo puro.
 *  items:     [{ id, lote, semielaborado_id, nombre, cantidad }]   lotes del plan de la semana
 *  aprobados: { [item_id]: unidades buenas aprobadas }
 *  recetas:   { [semielaborado_id]: [{ mp_id, cantidad }] }          cantidad de materia prima por unidad
 *  stocks:    Map(mp_id -> { id, codigo, nombre, unidad, stock })
 */
function armarMpSemana({ items = [], aprobados = {}, recetas = {}, stocks = new Map() }) {
  const porMp = new Map();
  for (const it of items) {
    const restante = Math.max(0, (Number(it.cantidad) || 0) - (Number(aprobados[it.id]) || 0));
    if (!(restante > 0)) continue;
    for (const ing of recetas[it.semielaborado_id] || []) {
      const mp = stocks.get(ing.mp_id);
      const kg = restante * (Number(ing.cantidad) || 0);
      if (!mp || !(kg > 0)) continue;
      const fila = porMp.get(mp.id) || { id: mp.id, codigo: mp.codigo, nombre: mp.nombre, unidad: mp.unidad || "Kg", stock_actual: Number(mp.stock) || 0, necesidad: 0, lotes: [] };
      fila.necesidad += kg;
      fila.lotes.push({ lote: it.lote, semielaborado: it.nombre, unidades_que_faltan: restante, cantidad: r3(kg) });
      porMp.set(mp.id, fila);
    }
  }
  return [...porMp.values()]
    .map((f) => {
      const despues = f.stock_actual - f.necesidad;
      return { ...f, necesidad: r1(f.necesidad), stock_despues: r1(despues), falta: despues < 0 ? r1(-despues) : 0 };
    })
    .sort((a, b) => b.falta - a.falta || a.stock_despues - b.stock_despues);
}

/** Lee el plan de la semana en curso. Devuelve [] si todavía no hay plan (o no existen las tablas). */
async function calcularMpSemana(pool, { ahora = new Date() } = {}) {
  const lunes = P.lunesDe(hoyArgentina(ahora));
  let items;
  try {
    [items] = await pool.query("SELECT id, lote, semielaborado_id, semielaborado_nombre AS nombre, cantidad_semana AS cantidad FROM prod_plan_items WHERE semana_inicio = ?", [lunes]);
  } catch {
    return { semana: lunes, materias: [] };
  }
  if (!items.length) return { semana: lunes, materias: [] };
  const [aprob] = await pool.query(
    "SELECT item_id, SUM(total_producido - fallas) AS buenas FROM prod_cargas WHERE estado = 'APROBADA' AND item_id IN (?) GROUP BY item_id",
    [items.map((i) => i.id)],
  );
  const aprobados = Object.fromEntries(aprob.map((a) => [a.item_id, Number(a.buenas) || 0]));
  const [det] = await pool.query(
    `SELECT ing.semielaborado_id, d.materia_prima_id AS mp_id, d.cantidad
       FROM ingenierias ing JOIN ingenieria_detalles d ON d.ingenieria_id = ing.id AND d.materia_prima_id IS NOT NULL
      WHERE ing.es_activa = 1 AND ing.semielaborado_id IN (?)`,
    [[...new Set(items.map((i) => i.semielaborado_id))]],
  );
  const recetas = {};
  for (const d of det) (recetas[d.semielaborado_id] ||= []).push({ mp_id: d.mp_id, cantidad: d.cantidad });
  const [mps] = await pool.query("SELECT id, codigo, nombre, unidad_medida AS unidad, stock_actual AS stock FROM materias_primas WHERE id IN (?)", [[...new Set(det.map((d) => d.mp_id))].concat([0])]);
  return { semana: lunes, materias: armarMpSemana({ items, aprobados, recetas, stocks: new Map(mps.map((m) => [m.id, m])) }) };
}

module.exports = { armarMpSemana, calcularMpSemana };
