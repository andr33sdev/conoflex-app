"use strict";
// Reglas del módulo Proyectos y pruebas (sin base de datos): tipos, estados, olvidados y lo que propone la IA.

const TIPOS = {
  PRUEBA: "Prueba",
  MAQUINA: "Máquina",
  OBJETIVO: "Objetivo",
  IDEA: "Idea",
  MEJORA: "Mejora",
  OTRO: "Otro",
};
const ESTADOS = {
  IDEA: "Idea",
  EN_CURSO: "En curso",
  ESPERANDO: "Esperando a alguien",
  PAUSADO: "Pausado",
  LOGRADO: "Logrado",
  DESCARTADO: "Descartado",
};
const CERRADOS = new Set(["LOGRADO", "DESCARTADO"]);
const PRIORIDADES = ["ALTA", "MEDIA", "BAJA"];
const ESTADOS_PRUEBA = ["PENDIENTE", "APROBADA", "RECHAZADA"];
const DIAS_OLVIDO = 14;

const aFecha = (v) => (v instanceof Date ? v : new Date(String(v).length <= 10 ? `${String(v).slice(0, 10)}T12:00:00` : v));
// Días de calendario entre dos fechas (no importa la hora: ayer a la noche y hoy a la mañana es 1 día).
const soloDia = (v) => {
  const d = aFecha(v);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};
const diasEntre = (desde, hasta) => Math.round((soloDia(hasta) - soloDia(desde)) / 86400000);

/** Próximo código: PP-2026-001, PP-2026-002… */
function siguienteCodigo(ultimo, anio) {
  const m = String(ultimo || "").match(/^PP-(\d{4})-(\d+)$/);
  const n = m && Number(m[1]) === anio ? Number(m[2]) + 1 : 1;
  return `PP-${anio}-${String(n).padStart(3, "0")}`;
}

/**
 * Cómo viene un proyecto: si está olvidado (abierto y sin novedades hace 14 días o más), si el próximo paso está vencido
 * y cuántos días hace de la última novedad.
 */
function salud(p, hoy = new Date()) {
  const abierto = !CERRADOS.has(p.estado);
  const dias = p.ultimo_movimiento ? diasEntre(p.ultimo_movimiento, hoy) : null;
  const vencido = abierto && !!p.proximo_paso && !!p.proximo_paso_fecha && diasEntre(p.proximo_paso_fecha, hoy) > 0;
  const olvidado = abierto && p.estado !== "PAUSADO" && p.estado !== "IDEA" && dias != null && dias >= DIAS_OLVIDO;
  return { abierto, dias_sin_novedad: dias, olvidado, paso_vencido: vencido, sin_proximo_paso: abierto && p.estado !== "IDEA" && !p.proximo_paso };
}

/** Resumen de las pruebas: cuántas aprobadas, rechazadas y pendientes. */
function resumenPruebas(pruebas) {
  const r = { total: 0, aprobadas: 0, rechazadas: 0, pendientes: 0 };
  for (const x of pruebas || []) {
    r.total++;
    if (x.estado === "APROBADA") r.aprobadas++;
    else if (x.estado === "RECHAZADA") r.rechazadas++;
    else r.pendientes++;
  }
  return r;
}

const fechaOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));

/** Limpia lo que propone la IA a partir de una novedad contada en texto libre. */
function limpiarSugerencia(s) {
  const txt = (v, max) => String(v ?? "").trim().slice(0, max);
  const estado = ESTADOS[String(s?.estado || "").toUpperCase()] ? String(s.estado).toUpperCase() : null;
  const pruebas = (Array.isArray(s?.pruebas) ? s.pruebas : [])
    .map((x) => ({
      que: txt(x?.que, 200),
      pieza: txt(x?.pieza, 200),
      metodo: txt(x?.metodo, 400),
      resultado: txt(x?.resultado, 600),
      estado: ESTADOS_PRUEBA.includes(String(x?.estado || "").toUpperCase()) ? String(x.estado).toUpperCase() : "PENDIENTE",
      motivo: txt(x?.motivo, 400),
    }))
    .filter((x) => x.que)
    .slice(0, 8);
  return {
    resumen: txt(s?.resumen, 300),
    novedad: txt(s?.novedad, 2000),
    estado,
    proximo_paso: txt(s?.proximo_paso, 300) || null,
    proximo_paso_fecha: fechaOk(s?.proximo_paso_fecha) ? s.proximo_paso_fecha : null,
    pruebas,
  };
}

module.exports = { TIPOS, ESTADOS, CERRADOS, PRIORIDADES, ESTADOS_PRUEBA, DIAS_OLVIDO, siguienteCodigo, salud, resumenPruebas, limpiarSugerencia, diasEntre };
