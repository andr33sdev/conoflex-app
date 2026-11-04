"use strict";
// Nati y el paso de semielaborados del depósito 26 al 33.
// La planilla (pestaña ENTRADA 33) dice cuándo algo entró al 33 "desde 26". Esa entrada tiene que quedar reflejada en la app como
// una transferencia 26 → 33. Nati lee la planilla en el momento, arma la lista de lo que falta pasar y se la ofrece a la persona:
// no modifica nada hasta que se toca el botón. Solo propone lo que la planilla dice que vino del 26 y todavía no se pasó en la app.
const crypto = require("crypto");
const { sincronizarHojas, entradasPendientes, transferir } = require("../semiMovimientos");
const { esAdmin } = require("./ajusteStock");

const VIGENCIA_MS = 10 * 60 * 1000;
const DIAS_BUSQUEDA = 30;
const propuestas = new Map();

function limpiarVencidas(ahora = Date.now()) {
  for (const [k, p] of propuestas) if (p.vence < ahora) propuestas.delete(k);
}

/** Las entradas al 33 que vinieron del 26 y siguen sin pasarse en la app, agrupadas por semielaborado. */
async function pendientesDel26(db, { dias = DIAS_BUSQUEDA, desde = null, hasta = null, codigo = null } = {}) {
  const todas = (await entradasPendientes(db, { dias })).filter((e) => e.deposito === "26");
  const q = codigo ? String(codigo).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim() : "";
  const entradas = todas.filter((e) => {
    if (desde && e.fecha < desde) return false;
    if (hasta && e.fecha > hasta) return false;
    if (q && !`${e.codigo} ${e.nombre}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q)) return false;
    return true;
  });
  const [filas] = await db.query("SELECT id, codigo, nombre, stock_26, stock_33 FROM semielaborados");
  const porCodigo = new Map(filas.map((s) => [String(s.codigo).toUpperCase().trim(), s]));
  const grupos = new Map();
  const noEncontradas = [];
  for (const e of entradas) {
    const s = porCodigo.get(String(e.codigo).toUpperCase().trim());
    if (!s) {
      noEncontradas.push({ codigo: e.codigo, cantidad: Number(e.cantidad), fecha: e.fecha });
      continue;
    }
    const g = grupos.get(s.id) || { semielaborado_id: s.id, codigo: s.codigo, nombre: s.nombre, stock26: Number(s.stock_26) || 0, stock33: Number(s.stock_33) || 0, cantidad: 0, entradas: [] };
    g.cantidad += Number(e.cantidad);
    g.entradas.push({ id: e.id, fecha: e.fecha, cantidad: Number(e.cantidad), op: e.op || null });
    grupos.set(s.id, g);
  }
  return { grupos: [...grupos.values()], noEncontradas, fueraDelFiltro: todas.length - entradas.length };
}

/**
 * Lee la planilla ahora, arma la lista y deja una propuesta para confirmar.
 * Devuelve { error } | { vacio, ... } | { propuesta, ... }.
 */
async function armarPropuestaPasar26({ db, usuario, leerPlanilla = true, traer = null, ahora = Date.now(), filtro = {} }) {
  if (!esAdmin(usuario)) return { error: "Solo un administrador puede pasar stock entre depósitos. Pedile a un administrador que lo confirme." };
  let planillaLeida = false;
  let errorPlanilla = null;
  if (leerPlanilla) {
    try {
      const r = await sincronizarHojas(db, traer ? { traer } : undefined);
      const e = Object.values(r).find((x) => x?.error);
      if (e) errorPlanilla = e.error;
      else planillaLeida = true;
    } catch (e) {
      errorPlanilla = e.message;
    }
  }
  const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null);
  const { grupos, noEncontradas, fueraDelFiltro } = await pendientesDel26(db, { desde: iso(filtro.desde), hasta: iso(filtro.hasta), codigo: filtro.codigo || null });
  const pasables = grupos.filter((g) => g.stock26 + 1e-9 >= g.cantidad);
  const noAlcanzan = grupos.filter((g) => g.stock26 + 1e-9 < g.cantidad).map((g) => ({ codigo: g.codigo, nombre: g.nombre, cantidad: g.cantidad, stock26: g.stock26 }));
  const base = { planilla_leida_ahora: planillaLeida, ...(errorPlanilla ? { error_planilla: errorPlanilla } : {}), no_alcanzan: noAlcanzan, sin_codigo: noEncontradas, total_pendientes: grupos.length, entradas_fuera_del_filtro: fueraDelFiltro };
  if (!pasables.length) return { vacio: true, ...base };
  limpiarVencidas(ahora);
  const token = crypto.randomBytes(12).toString("hex");
  const items = pasables.map((g) => ({ semielaborado_id: g.semielaborado_id, codigo: g.codigo, nombre: g.nombre, cantidad: g.cantidad, stock26: g.stock26, stock33: g.stock33, entradas: g.entradas }));
  propuestas.set(token, { token, usuarioId: usuario.id, items, vence: ahora + VIGENCIA_MS });
  return { ...base, propuesta: { tipo: "transferencia", token, items: items.map((i) => ({ ...i, stock26Nuevo: i.stock26 - i.cantidad, stock33Nuevo: i.stock33 + i.cantidad })), total: items.reduce((a, i) => a + i.cantidad, 0) } };
}

/** Pasa lo propuesto (revisando de nuevo que siga pendiente y que haya stock). Un solo uso. */
async function confirmarPasar26({ db, usuario, token, ahora = Date.now() }) {
  limpiarVencidas(ahora);
  const p = propuestas.get(String(token || ""));
  if (!p || p.usuarioId !== usuario?.id) return { error: "Esa confirmación venció o ya se usó. Pedímelo de nuevo.", status: 404 };
  if (!esAdmin(usuario)) return { error: "Solo un administrador puede pasar stock entre depósitos.", status: 403 };
  propuestas.delete(p.token);
  const hechas = [];
  const omitidas = [];
  const fallidas = [];
  for (const it of p.items) {
    const [vigentes] = await db.query("SELECT id, cantidad FROM semi_hoja_movs WHERE tipo = 'ENTRADA' AND atendida = 0 AND id IN (?)", [it.entradas.map((e) => e.id)]);
    const cantidad = vigentes.reduce((a, e) => a + Number(e.cantidad), 0);
    if (!(cantidad > 0)) {
      omitidas.push({ codigo: it.codigo, nombre: it.nombre, motivo: "ya estaba pasado" });
      continue;
    }
    try {
      const r = await transferir(db, { semielaborado_id: it.semielaborado_id, desde: "26", hasta: "33", cantidad, nota: "Entrada 33 de la planilla (confirmado con Nati)", usuario: usuario.nombre || "Admin" });
      hechas.push({ codigo: it.codigo, nombre: it.nombre, cantidad, stock26: r.stock_desde });
    } catch (e) {
      fallidas.push({ codigo: it.codigo, nombre: it.nombre, cantidad, motivo: e.status ? e.message : "No se pudo pasar." });
    }
  }
  return { ok: fallidas.length === 0, hechas, omitidas, fallidas };
}

function cancelarPasar26({ usuario, token }) {
  const p = propuestas.get(String(token || ""));
  if (p && p.usuarioId === usuario?.id) propuestas.delete(p.token);
  return { ok: true };
}

const HORA_AVISO = 8; // Argentina: el aviso sale en la primera revisión desde esta hora

/**
 * Aviso diario: si hay entradas del 26 sin pasar (según lo último que leyó de la planilla) y hoy todavía no avisó,
 * devuelve el texto para la notificación. No lee la planilla: la revisión de Nati ya la acaba de leer.
 * hoy = 'YYYY-MM-DD' y hora = 0..23 en Argentina.
 */
async function avisoDiario26(db, { hoy, hora }) {
  if (hora < HORA_AVISO) return null;
  const [ya] = await db.query("SELECT id FROM agentes_actividad WHERE agente = 'stock' AND tipo = 'DIARIO_26' AND detalle = ? LIMIT 1", [hoy]);
  if (ya.length) return null;
  const { grupos } = await pendientesDel26(db);
  if (!grupos.length) return null;
  const unidades = grupos.reduce((a, g) => a + g.cantidad, 0);
  const n = grupos.length;
  const num = (v) => Math.round(v).toLocaleString("es-AR");
  const titulo = n === 1 ? "Nati: tenés 1 semielaborado del 26 sin pasar al 33" : `Nati: tenés ${n} semielaborados del 26 sin pasar al 33`;
  const texto = `Son ${num(unidades)} u. que la planilla ya tomó del 26. Entrá a Nati y pedile que los pase: vos decidís con un botón.`;
  return { titulo, texto, detalle: hoy, n, unidades };
}

module.exports = { avisoDiario26, HORA_AVISO, pendientesDel26, armarPropuestaPasar26, confirmarPasar26, cancelarPasar26, DIAS_BUSQUEDA };
