"use strict";
// Liquidación de horas de Conoflex.
//
// REGLAS (definidas por la empresa):
//  - Hora diurna: de 06:00 a 21:00. Hora nocturna: de 21:00 a 06:00, con un
//    recargo base de 13,33% sobre la hora diurna.
//  - Jornada normal: 9 horas desde el ingreso. De ahí en más son horas extra
//    hasta que el operario se retira.
//  - Extras sobre horas comunes (días de semana y sábados hasta las 13:00):
//    50% sobre la hora diurna o nocturna, según corresponda.
//  - Sábados desde las 13:00, domingos completos y feriados: todo es hora extra
//    al 100% (doble, diurna o nocturna según corresponda).
//  - No hay tope de horas extra, ni diario ni mensual.
//
// Cada minuto trabajado se clasifica por su fecha y hora reales (un turno que
// cruza la medianoche cambia de tipo de día al pasar las 00:00).

const REGLAS = {
  jornadaNormalHoras: 9,
  nocturnoDesde: 21, // 21:00
  nocturnoHasta: 6, // 06:00
  recargoNocturno: 0.1333,
  recargoExtraComun: 0.5,
  recargoExtraDoble: 1.0,
  sabadoCorteHora: 13,
};

const pad = (n) => String(n).padStart(2, "0");
const redondear = (n, d = 2) => Math.round((Number(n) + Number.EPSILON) * 10 ** d) / 10 ** d;
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Categorías de pago: clave -> { factor sobre el valor hora diurno, etiqueta } */
const F_NOCT = 1 + REGLAS.recargoNocturno;
const CATEGORIAS = {
  normal_diurna: { factor: 1, etiqueta: "hora normal diurna" },
  normal_nocturna: { factor: F_NOCT, etiqueta: "hora normal nocturna (+13,33%)" },
  extra50_diurna: { factor: 1 + REGLAS.recargoExtraComun, etiqueta: "hora extra diurna al 50%" },
  extra50_nocturna: { factor: F_NOCT * (1 + REGLAS.recargoExtraComun), etiqueta: "hora extra nocturna al 50%" },
  extra100_diurna: { factor: 1 + REGLAS.recargoExtraDoble, etiqueta: "hora extra diurna al 100%" },
  extra100_nocturna: { factor: F_NOCT * (1 + REGLAS.recargoExtraDoble), etiqueta: "hora extra nocturna al 100%" },
};

/** 'YYYY-MM-DD HH:MM:SS' (o Date) -> partes en hora local naive (sin zona). */
function partes(valor) {
  if (valor instanceof Date) {
    return { y: valor.getFullYear(), m: valor.getMonth() + 1, d: valor.getDate(), h: valor.getHours(), mi: valor.getMinutes(), s: valor.getSeconds() };
  }
  const m = String(valor).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3], h: +m[4], mi: +m[5], s: +(m[6] || 0) };
}
const aFecha = (p) => new Date(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
const fechaISO = (p) => `${p.y}-${pad(p.m)}-${pad(p.d)}`;
const horaCorta = (p) => `${pad(p.h)}:${pad(p.mi)}`;
const isoDeDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (min) => `${Math.floor(min / 60)}:${pad(Math.round(min % 60))}`;

/**
 * Arma los turnos de UN operario a partir de sus fichadas (ENTRADA/SALIDA).
 * Devuelve [{ fecha, ingreso, egreso, entradaTs, salidaTs|null }] por fecha de ingreso.
 * Es el mismo emparejamiento que usa el módulo Fichero: una ENTRADA que llega entre 1 y
 * 18 hs después de otra sin salida se toma como la salida (el reloj a veces rotula mal).
 */
function emparejarTurnos(fichadas) {
  const ordenadas = fichadas
    .map((f) => ({ tipo: f.tipo, p: partes(f.fecha_hora) }))
    .filter((f) => f.p)
    .sort((a, b) => aFecha(a.p) - aFecha(b.p));

  const porFecha = new Map(); // fecha -> turno
  let pendiente = null;
  const cerrar = (finP, ts) => {
    const t = pendiente;
    t.egreso = horaCorta(finP);
    t.salidaTs = ts;
    pendiente = null;
  };

  for (const f of ordenadas) {
    const fecha = fechaISO(f.p);
    const ts = aFecha(f.p).getTime();
    if (f.tipo === "ENTRADA") {
      if (pendiente && ts - pendiente.entradaTs > 3600000 && ts - pendiente.entradaTs <= 18 * 3600000) {
        cerrar(f.p, ts);
      } else if (!porFecha.has(fecha)) {
        const t = { fecha, ingreso: horaCorta(f.p), egreso: null, entradaTs: ts, salidaTs: null };
        porFecha.set(fecha, t);
        pendiente = t;
      }
    } else if (f.tipo === "SALIDA") {
      if (pendiente && ts - pendiente.entradaTs <= 18 * 3600000) cerrar(f.p, ts);
    }
  }
  return [...porFecha.values()].sort((a, b) => a.entradaTs - b.entradaTs);
}

/** Clasifica un minuto: ¿zona de 100%? ¿nocturno? */
function clasificarMinuto(ts, esFeriado) {
  const d = new Date(ts);
  const dow = d.getDay();
  const hora = d.getHours();
  const fecha = isoDeDate(d);
  let motivoDoble = null;
  if (esFeriado(fecha)) motivoDoble = "feriado";
  else if (dow === 0) motivoDoble = "domingo";
  else if (dow === 6 && hora >= REGLAS.sabadoCorteHora) motivoDoble = "sábado desde las 13:00";
  const noche = hora >= REGLAS.nocturnoDesde || hora < REGLAS.nocturnoHasta;
  return { doble: !!motivoDoble, motivoDoble, noche, dow, fecha };
}

/**
 * Liquida UN turno minuto a minuto.
 * ajuste: { horaInicio:'HH:MM'|null, horasNormales:number|null, todasExtra:boolean } | null
 */
function liquidarTurno({ entradaTs, salidaTs, esFeriado = () => false, ajuste = null, valorHora = 0 }) {
  let inicio = entradaTs;
  if (ajuste && ajuste.horaInicio) {
    const [ph, pm] = String(ajuste.horaInicio).split(":").map(Number);
    const d = new Date(entradaTs);
    d.setHours(ph, pm, 0, 0);
    inicio = d.getTime();
  }
  const totalMin = Math.max(0, Math.floor((salidaTs - inicio) / 60000));
  const limiteNormalMin = ((ajuste && ajuste.horasNormales) || REGLAS.jornadaNormalHoras) * 60;
  const todasExtra = !!(ajuste && ajuste.todasExtra);

  const minutos = {}; // categoría -> minutos
  const segmentos = [];
  let seg = null;
  for (let m = 0; m < totalMin; m++) {
    const ts = inicio + m * 60000;
    const c = clasificarMinuto(ts, esFeriado);
    let cat;
    let motivo;
    const hs = limiteNormalMin / 60;
    if (c.doble) {
      cat = c.noche ? "extra100_nocturna" : "extra100_diurna";
      motivo = `${c.motivoDoble}: todas las horas son extra al 100%`;
    } else if (todasExtra) {
      cat = c.noche ? "extra50_nocturna" : "extra50_diurna";
      motivo = "ajuste del día: todas las horas son extra al 50%";
    } else if (m >= limiteNormalMin) {
      cat = c.noche ? "extra50_nocturna" : "extra50_diurna";
      motivo = `superó las ${hs} hs de jornada normal: extra al 50%`;
    } else {
      cat = c.noche ? "normal_nocturna" : "normal_diurna";
      motivo = `dentro de las ${hs} hs de jornada normal`;
    }
    minutos[cat] = (minutos[cat] || 0) + 1;
    if (seg && seg.cat === cat && seg.fecha === c.fecha && seg.motivo === motivo) {
      seg.min++;
      seg.finTs = ts + 60000;
    } else {
      seg = { cat, motivo, fecha: c.fecha, dow: c.dow, min: 1, inicioTs: ts, finTs: ts + 60000 };
      segmentos.push(seg);
    }
  }

  const porCategoria = {};
  let importe = 0;
  for (const [cat, min] of Object.entries(minutos)) {
    const factor = CATEGORIAS[cat].factor;
    const horas = min / 60;
    const imp = horas * valorHora * factor;
    importe += imp;
    porCategoria[cat] = { min, horas: redondear(horas), hhmm: hhmm(min), importe: redondear(imp) };
  }

  const horaDe = (ts) => {
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const lineas = segmentos.map((s) => {
    const factor = CATEGORIAS[s.cat].factor;
    const horas = s.min / 60;
    return {
      desde: horaDe(s.inicioTs),
      hasta: horaDe(s.finTs),
      fecha: s.fecha,
      dia: DIAS[s.dow],
      categoria: s.cat,
      detalle: CATEGORIAS[s.cat].etiqueta,
      motivo: s.motivo,
      horas: redondear(horas),
      hhmm: hhmm(s.min),
      valor_hora_aplicado: redondear(valorHora * factor),
      importe: redondear(horas * valorHora * factor),
    };
  });

  return {
    inicioTs: inicio,
    minutosTotales: totalMin,
    horasTotales: redondear(totalMin / 60),
    porCategoria,
    segmentos: lineas,
    importe: redondear(importe),
    importeSinRedondear: importe,
  };
}

/** Notas del día (feriado, ajustes manuales aplicados). */
function notasDelDia({ feriado, ajuste }) {
  const notas = [];
  if (feriado) notas.push("feriado");
  if (ajuste?.todasExtra) notas.push("ajuste del día: todas las horas son extra");
  if (ajuste?.horasNormales) notas.push(`ajuste del día: jornada normal de ${ajuste.horasNormales} hs`);
  if (ajuste?.horaInicio) notas.push(`ajuste del día: se cuenta desde las ${ajuste.horaInicio}`);
  return notas;
}

/**
 * Liquida los turnos de un operario cuyo ingreso cae en `fechasIncluidas` (Set de 'YYYY-MM-DD').
 * valorHoraDe(fecha) -> valor hora diurno vigente ese día.
 */
function liquidarPeriodo({
  fichadas, fechasIncluidas, feriados = new Set(), ajustes = {}, valorHoraDe = () => 0, detalle = "completo",
}) {
  const esFeriado = (f) => (feriados instanceof Set ? feriados.has(f) : !!feriados[f]);
  const getAj = (f) => (ajustes instanceof Map ? ajustes.get(f) : ajustes[f]) || null;
  const turnos = emparejarTurnos(fichadas).filter((t) => fechasIncluidas.has(t.fecha));

  const totales = {};
  const dias = [];
  const avisos = [];
  let importeTotal = 0;
  let minTotal = 0;

  for (const t of turnos) {
    const p = partes(new Date(t.entradaTs));
    const diaNombre = DIAS[new Date(t.entradaTs).getDay()];
    if (!t.salidaTs) {
      avisos.push(`${t.fecha} (${diaNombre}): hay ingreso a las ${t.ingreso} pero no se registró la salida; ese día no suma horas.`);
      dias.push({ fecha: t.fecha, dia: diaNombre, ingreso: t.ingreso, egreso: null, sin_salida: true, horas_totales: 0, importe: 0 });
      continue;
    }
    const vh = valorHoraDe(t.fecha) || 0;
    const ajuste = getAj(t.fecha);
    const liq = liquidarTurno({ entradaTs: t.entradaTs, salidaTs: t.salidaTs, esFeriado, ajuste, valorHora: vh });
    const notas = notasDelDia({ feriado: esFeriado(t.fecha), ajuste });

    minTotal += liq.minutosTotales;
    importeTotal += liq.importe;
    for (const [cat, v] of Object.entries(liq.porCategoria)) {
      const acc = (totales[cat] ||= { min: 0, importeSuma: 0 });
      acc.min += v.min;
      acc.importeSuma += v.importe;
    }
    const dia = {
      fecha: t.fecha, dia: diaNombre, ingreso: t.ingreso, egreso: t.egreso,
      ...(t.egreso && partes(new Date(t.salidaTs)).d !== p.d ? { termina_al_dia_siguiente: true } : {}),
      ...(esFeriado(t.fecha) ? { feriado: true } : {}),
      horas_totales: liq.horasTotales,
      horas_por_categoria: Object.fromEntries(Object.entries(liq.porCategoria).map(([k, v]) => [k, v.horas])),
      importe: liq.importe,
    };
    if (detalle === "completo") {
      dia.desglose = liq.segmentos;
      if (notas.length) dia.notas = notas;
    }
    dias.push(dia);
  }

  const resumen = {};
  for (const [cat, acc] of Object.entries(totales)) {
    resumen[cat] = {
      horas: redondear(acc.min / 60),
      factor_sobre_hora_diurna: redondear(CATEGORIAS[cat].factor, 4),
      importe: redondear(acc.importeSuma),
      detalle: CATEGORIAS[cat].etiqueta,
    };
  }
  const horasNormales = Object.entries(resumen).filter(([k]) => k.startsWith("normal")).reduce((a, [, v]) => a + v.horas, 0);
  const horasExtra = Object.entries(resumen).filter(([k]) => k.startsWith("extra")).reduce((a, [, v]) => a + v.horas, 0);

  return {
    turnos_liquidados: dias.filter((d) => !d.sin_salida).length,
    horas_totales: redondear(minTotal / 60),
    horas_normales: redondear(horasNormales),
    horas_extra: redondear(horasExtra),
    por_categoria: resumen,
    importe_total: redondear(dias.reduce((a, d) => a + d.importe, 0)),
    dias,
    avisos,
  };
}

module.exports = {
  REGLAS, CATEGORIAS, DIAS, emparejarTurnos, liquidarTurno, liquidarPeriodo, redondear,
};
