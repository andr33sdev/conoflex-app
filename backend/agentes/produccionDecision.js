"use strict";
// Decisiones de producción de Maru: cruza lo que hay que entregar (pedidos abiertos), lo que hay en el depósito
// (semielaborados), lo que ya está en el plan de la semana y la gente que está en planta, y ordena qué conviene
// fabricar primero. Es aritmética y reglas simples: el modelo no calcula nada, solo lo cuenta.
const { cargarStock, armarPanorama } = require("./vigilanteStock");

const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const r0 = (n) => Math.round(Number(n) || 0);

function lunesDe(fecha = new Date()) {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Un pedido usa un semielaborado si el artículo del pedido coincide con alguno de los productos donde ese semielaborado se usa. */
function usaSemi(semi, pedido) {
  const art = sinAcentos(pedido.articulo);
  if (!art) return false;
  return (semi.usado_en || []).some((u) => {
    const p = sinAcentos(u.producto);
    const c = sinAcentos(u.codigo);
    return (p && (p.includes(art) || art.includes(p))) || (c && c === art);
  });
}

/**
 * semis: semielaborados del panorama de Nati; pedidos: abiertos [{op, cliente, articulo, total, completada}];
 * plan: [{codigo, nombre, planificado, producido}]; mps_criticas: cantidad de materias primas críticas.
 */
function priorizar({ semis = [], pedidos = [], plan = [], mpsCriticas = 0, limite = 10 }) {
  const abiertos = pedidos.map((p) => ({ ...p, falta: Math.max(0, Number(p.total || 0) - Number(p.completada || 0)) })).filter((p) => p.falta > 0);
  const enPlan = new Map(plan.map((p) => [sinAcentos(p.codigo), p]));
  const filas = semis
    .filter((s) => s.nivel !== "sin_demanda" || abiertos.some((p) => usaSemi(s, p)))
    .map((s) => {
      const peds = abiertos.filter((p) => usaSemi(s, p));
      const unidadesPedidas = peds.reduce((a, p) => a + p.falta, 0);
      const p = enPlan.get(sinAcentos(s.codigo)) || null;
      const aFabricar = Math.max(0, r0(Math.max(s.demanda_mensual || 0, unidadesPedidas) - (s.stock_total || 0)));
      let puntos = { negativo: 4, critico: 4, bajo: 2, ok: 0, exceso: -1, sin_demanda: 0 }[s.nivel] ?? 0;
      const motivos = [];
      if (s.nivel === "critico" || s.nivel === "negativo") motivos.push(`stock crítico${s.dias != null ? ` (${s.dias} días)` : ""}`);
      else if (s.nivel === "bajo") motivos.push(`stock bajo${s.dias != null ? ` (${s.dias} días)` : ""}`);
      if (peds.length) {
        puntos += 2 + Math.min(2, peds.length - 1);
        motivos.push(`${peds.length} ${peds.length === 1 ? "pedido abierto lo usa" : "pedidos abiertos lo usan"} (${r0(unidadesPedidas)} u. por entregar)`);
      }
      if (p && p.planificado > 0 && p.producido < p.planificado) {
        motivos.push(`ya está en el plan de la semana (${r0(p.producido)} de ${r0(p.planificado)})`);
        puntos -= 0.5;
      } else if (!p && puntos >= 2) {
        puntos += 1;
        motivos.push("todavía no está en el plan de la semana");
      }
      return {
        semielaborado: s.nombre, codigo: s.codigo, stock_total: s.stock_total, demanda_mensual: s.demanda_mensual, dias: s.dias, nivel: s.nivel,
        a_fabricar: aFabricar, pedidos_que_lo_usan: peds.map((x) => `${x.op || "s/OP"} · ${x.cliente || ""} · ${x.articulo}`.trim()).slice(0, 4),
        en_plan_semana: p ? { planificado: r0(p.planificado), producido: r0(p.producido) } : null, motivos, _puntos: puntos,
      };
    })
    .filter((f) => f._puntos > 0 && f.a_fabricar > 0)
    .sort((a, b) => b._puntos - a._puntos || (a.dias ?? 1e9) - (b.dias ?? 1e9))
    .slice(0, limite)
    .map(({ _puntos, ...f }, i) => ({ orden: i + 1, ...f }));
  return {
    prioridades: filas,
    pedidos_abiertos: abiertos.length,
    materias_primas_criticas: mpsCriticas,
    ...(mpsCriticas > 0 ? { ojo_materia_prima: `Hay ${mpsCriticas} ${mpsCriticas === 1 ? "materia prima crítica" : "materias primas críticas"}: antes de lanzar una fabricación conviene confirmar con Nati que alcance el material.` } : {}),
    nota: "El cruce de pedidos con semielaborados se hace por el nombre del producto de la ingeniería: si un pedido no figura es porque el nombre no coincide, no porque no se pueda fabricar.",
  };
}

async function cargarPedidosAbiertos(pool) {
  const [rows] = await pool.query(
    `SELECT p.id, p.op, p.cliente, p.articulo, p.cantidad_total AS total, p.cantidad_completada AS completada, p.estado, DATE_FORMAT(p.fecha, '%Y-%m-%d') AS fecha
       FROM pedidos p WHERE UPPER(COALESCE(p.estado,'')) NOT LIKE 'COMPLET%' AND UPPER(COALESCE(p.estado,'')) NOT IN ('CANCELADO','ENTREGADO','ANULADO','FINALIZADO')
      ORDER BY p.fecha ASC, p.id ASC LIMIT 300`,
  );
  return rows.map((r) => ({ ...r, total: Number(r.total) || 0, completada: Number(r.completada) || 0 }));
}

async function cargarPlanSemana(pool, ahora = new Date()) {
  const lunes = lunesDe(ahora);
  try {
    const [rows] = await pool.query(
      `SELECT i.id, i.lote, i.semielaborado_codigo AS codigo, i.semielaborado_nombre AS nombre, i.cantidad_semana AS planificado,
              (SELECT COALESCE(SUM(c.total_producido - c.fallas),0) FROM prod_cargas c WHERE c.item_id = i.id AND c.estado = 'APROBADA') AS producido
         FROM prod_plan_items i WHERE i.semana_inicio = ? ORDER BY i.lote`,
      [lunes],
    );
    return { semana: lunes, items: rows.map((r) => ({ ...r, planificado: Number(r.planificado) || 0, producido: Number(r.producido) || 0 })) };
  } catch {
    return { semana: lunes, items: [] }; // todavía no existe el plan
  }
}

/** Quién está en planta ahora: la última fichada de las últimas 20 horas es una ENTRADA. */
async function cargarPersonalEnPlanta(pool, ahora = new Date()) {
  const desde = new Date(ahora.getTime() - 20 * 3600000);
  try {
    const [rows] = await pool.query("SELECT nombre, tipo, fecha_hora FROM fichadas WHERE fecha_hora >= ? ORDER BY fecha_hora", [desde]);
    const ult = new Map();
    for (const r of rows) ult.set(r.nombre, r);
    const en = [...ult.values()].filter((r) => r.tipo === "ENTRADA").map((r) => ({ nombre: r.nombre, desde: String(r.fecha_hora instanceof Date ? r.fecha_hora.toISOString() : r.fecha_hora).replace("T", " ").slice(11, 16) }));
    return { en_planta: en.length, personas: en.sort((a, b) => a.nombre.localeCompare(b.nombre)), fichadas_leidas: rows.length };
  } catch {
    return { en_planta: 0, personas: [], fichadas_leidas: 0 };
  }
}

/** Todo junto: es lo que usan el chat de Maru y su pestaña de prioridades. */
async function decisionProduccion(pool, { limite = 10 } = {}) {
  const [stock, pedidos, plan, personal] = await Promise.all([cargarStock(pool), cargarPedidosAbiertos(pool).catch(() => []), cargarPlanSemana(pool), cargarPersonalEnPlanta(pool)]);
  const pano = armarPanorama(stock);
  const usados = new Map(stock.semis.map((s) => [s.codigo, s.usado_en || []]));
  const semis = pano.semielaborados.map((s) => ({ ...s, usado_en: usados.get(s.codigo) || [] }));
  const dec = priorizar({ semis, pedidos, plan: plan.items, mpsCriticas: pano.resumen.criticas, limite });
  return { ...dec, plan_semana: plan, personal, pedidos, resumen: { ...pano.resumen, pedidos_abiertos: pedidos.length, en_planta: personal.en_planta } };
}

module.exports = { priorizar, usaSemi, lunesDe, cargarPedidosAbiertos, cargarPlanSemana, cargarPersonalEnPlanta, decisionProduccion };
