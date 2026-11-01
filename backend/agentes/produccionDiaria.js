"use strict";
// Detalle diario de la producción para Romi: qué se asignó cada día y turno (máquina, operario, cantidad), qué se produjo,
// qué falta de cada lote y un reparto sugerido del resto de la semana. Solo lee; el reparto es una propuesta, no se carga nada.
const P = require("../produccionPlan");

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const TURNOS = P.TURNOS;
const FECHA = (c) => `DATE_FORMAT(${c}, '%Y-%m-%d')`;
const n0 = (v) => Math.round(Number(v) || 0);

function hoyArgentina(ahora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ahora);
}
const sumarDias = (iso, k) => P.sumarDias(iso, k);
const nombreDia = (iso) => DIAS[P.parseISO(iso).getUTCDay()];

/** Estado de una asignación según sus cargas (la carga vigente es la más nueva que no fue rechazada). */
function estadoAsignacion(cargas) {
  const vigente = cargas.find((c) => c.estado !== "RECHAZADA");
  if (vigente) return { estado: vigente.estado === "APROBADA" ? "aprobada" : "pendiente_de_aprobar", producido: n0(vigente.total_producido) - n0(vigente.fallas), fallas: n0(vigente.fallas), cargo: vigente.operario };
  if (cargas.length) return { estado: "rechazada", producido: 0, fallas: 0, cargo: null };
  return { estado: "sin_cargar", producido: 0, fallas: 0, cargo: null };
}

async function cargarSemanaDetallada(pool, ahora = new Date()) {
  const hoy = hoyArgentina(ahora);
  const lunes = P.lunesDe(hoy);
  const fin = sumarDias(lunes, 6);
  const [items] = await pool.query(
    `SELECT id, lote, semielaborado_nombre AS nombre, cantidad_semana AS planificado FROM prod_plan_items WHERE semana_inicio = ? ORDER BY lote`,
    [lunes],
  );
  const [asig] = await pool.query(
    `SELECT a.id, a.item_id, ${FECHA("a.fecha")} AS fecha, a.turno, a.cantidad, a.operario, m.nombre AS maquina
       FROM prod_asignaciones a LEFT JOIN prod_maquinas m ON m.id = a.maquina_id
      WHERE a.fecha BETWEEN ? AND ? ORDER BY a.fecha, a.turno, m.nombre, a.id`,
    [lunes, fin],
  );
  const [turnos] = await pool.query(`SELECT ${FECHA("fecha")} AS fecha, turno, sin_produccion, motivo, lanzado, comentario FROM prod_turnos WHERE fecha BETWEEN ? AND ?`, [lunes, fin]);
  const [cargas] = await pool.query(
    `SELECT id, asignacion_id, item_id, ${FECHA("fecha")} AS fecha, turno, operario, maquina, modelo_nombre, total_producido, fallas, estado
       FROM prod_cargas WHERE fecha BETWEEN ? AND ? ORDER BY id DESC`,
    [lunes, fin],
  );
  let maquinas = [];
  try {
    [maquinas] = await pool.query("SELECT nombre FROM prod_maquinas WHERE activa = 1 ORDER BY orden, nombre");
  } catch {
    maquinas = [];
  }
  const porItem = new Map(items.map((i) => [i.id, i]));
  const asignaciones = asig.map((a) => {
    const it = porItem.get(a.item_id);
    const st = estadoAsignacion(cargas.filter((c) => c.asignacion_id === a.id));
    return { id: a.id, item_id: a.item_id, fecha: a.fecha, turno: a.turno, lote: it?.lote || null, semielaborado: it?.nombre || null, maquina: a.maquina || "sin máquina", operario: a.operario || "sin operario", planificado: n0(a.cantidad), ...st };
  });
  const sueltas = cargas.filter((c) => !c.asignacion_id);
  const dias = Array.from({ length: 7 }, (_, i) => {
    const fecha = sumarDias(lunes, i);
    return {
      fecha, dia: nombreDia(fecha), es_hoy: fecha === hoy, pasado: fecha < hoy,
      turnos: TURNOS.map((tn) => {
        const t = turnos.find((x) => x.fecha === fecha && x.turno === tn);
        return {
          turno: tn, sin_produccion: !!t?.sin_produccion, motivo: t?.motivo || null, lanzado: !!t?.lanzado, comentario: t?.comentario || null,
          asignaciones: asignaciones.filter((a) => a.fecha === fecha && a.turno === tn),
          cargas_sin_asignacion: sueltas.filter((c) => c.fecha === fecha && c.turno === tn).map((c) => ({ operario: c.operario, maquina: c.maquina, semielaborado: c.modelo_nombre, producido: n0(c.total_producido) - n0(c.fallas), estado: c.estado })),
        };
      }),
    };
  });
  const lotes = items.map((it) => {
    const propias = cargas.filter((c) => c.item_id === it.id && c.estado !== "RECHAZADA");
    const aprobado = propias.filter((c) => c.estado === "APROBADA").reduce((s, c) => s + n0(c.total_producido) - n0(c.fallas), 0);
    const pendiente = propias.filter((c) => c.estado !== "APROBADA").reduce((s, c) => s + n0(c.total_producido) - n0(c.fallas), 0);
    // Lo asignado de hoy en adelante que todavía no tiene carga: es producción prevista que falta hacer.
    const previsto = asignaciones.filter((a) => a.item_id === it.id && a.fecha >= hoy && a.estado === "sin_cargar").reduce((s, a) => s + a.planificado, 0);
    const planificado = n0(it.planificado);
    const falta = Math.max(0, planificado - aprobado - pendiente);
    return { item_id: it.id, lote: it.lote, semielaborado: it.nombre, planificado_semana: planificado, producido_aprobado: aprobado, producido_pendiente_de_aprobar: pendiente, falta, ya_asignado_de_hoy_en_adelante: previsto, sin_asignar: Math.max(0, falta - previsto) };
  });
  return { hoy, dia_hoy: nombreDia(hoy), lunes, domingo: fin, dias, lotes, maquinas: maquinas.map((m) => m.nombre) };
}

/** Qué máquina usó cada semielaborado y cuánto rindió por turno, según las cargas aprobadas de los últimos 60 días. */
async function cargarRendimientos(pool, ahora = new Date()) {
  const desde = sumarDias(hoyArgentina(ahora), -60);
  try {
    const [rows] = await pool.query(
      `SELECT modelo_nombre AS nombre, maquina, COUNT(*) AS cargas, AVG(total_producido - fallas) AS por_turno
         FROM prod_cargas WHERE estado = 'APROBADA' AND fecha >= ? AND maquina IS NOT NULL AND maquina <> '' GROUP BY modelo_nombre, maquina`,
      [desde],
    );
    return rows.map((r) => ({ nombre: r.nombre, maquina: r.maquina, cargas: Number(r.cargas), por_turno: n0(r.por_turno) }));
  } catch {
    return [];
  }
}

/**
 * Reparte lo que falta (y no está asignado) en los turnos libres de hoy en adelante.
 * Prefiere la máquina que más rindió ese semielaborado; la cantidad por turno es lo que esa máquina suele sacar
 * (o, sin historial, lo que falta dividido entre los turnos que quedan). Devuelve una propuesta, nunca carga nada.
 */
function sugerirReparto(semana, rendimientos = [], { incluirSabado = false } = {}) {
  const ultimo = incluirSabado ? 5 : 4; // índice dentro de la semana (lunes = 0): hasta viernes o sábado
  const libres = [];
  semana.dias.forEach((d, i) => {
    if (i > ultimo || d.fecha < semana.hoy) return;
    for (const t of d.turnos) if (!t.sin_produccion && !(d.fecha === semana.hoy && t.lanzado)) libres.push({ fecha: d.fecha, dia: d.dia, turno: t.turno, ocupadas: new Set(t.asignaciones.map((a) => a.maquina)) });
  });
  const norm = (s) => String(s || "").toLowerCase();
  const propuesta = [];
  const sinResolver = [];
  for (const lote of semana.lotes.filter((l) => l.sin_asignar > 0)) {
    const hist = rendimientos.filter((r) => norm(r.nombre) === norm(lote.semielaborado)).sort((a, b) => b.por_turno - a.por_turno);
    let resta = lote.sin_asignar;
    const turnosPosibles = libres.length || 1;
    const parejo = Math.max(1, Math.ceil(resta / turnosPosibles));
    for (const slot of libres) {
      if (resta <= 0) break;
      const candidatas = hist.length ? hist.map((h) => h.maquina) : semana.maquinas;
      const maquina = candidatas.find((m) => !slot.ocupadas.has(m));
      if (!maquina) continue;
      const tipico = hist.find((h) => h.maquina === maquina)?.por_turno || parejo;
      const cantidad = Math.min(resta, Math.max(1, tipico));
      slot.ocupadas.add(maquina);
      resta -= cantidad;
      propuesta.push({ lote: lote.lote, semielaborado: lote.semielaborado, fecha: slot.fecha, dia: slot.dia, turno: slot.turno, maquina, cantidad, base: hist.find((h) => h.maquina === maquina) ? `rinde unas ${tipico} u. por turno en esa máquina` : "sin historial en esa máquina: reparto parejo" });
    }
    if (resta > 0) sinResolver.push({ lote: lote.lote, semielaborado: lote.semielaborado, sin_lugar: resta });
  }
  return { propuesta, sin_lugar_en_la_semana: sinResolver, aviso: "Es una propuesta: no se cargó nada. El operario lo definís vos al cargar la asignación." };
}

/** Detalle de un solo día, listo para contárselo a la persona. */
function detalleDia(semana, fecha) {
  const d = semana.dias.find((x) => x.fecha === fecha);
  if (!d) return { error: `Esa fecha no está en la semana del ${semana.lunes} al ${semana.domingo}.` };
  return d;
}

module.exports = { cargarSemanaDetallada, cargarRendimientos, sugerirReparto, detalleDia, estadoAsignacion, hoyArgentina, nombreDia };
