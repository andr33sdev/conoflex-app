"use strict";
// Liquidación de horas del fichero (convenio UOYEP + LCT).
//
// Las reglas de armado de turnos y de cálculo de horas son las MISMAS que usa
// el módulo Fichero (frontend/src/FicheroModule.jsx: calcularDatosCalendario y
// calcularHorasDelTurno), portadas acá para que Connie liquide igual que la
// pantalla. Si cambia una regla en el frontend, cambiarla también acá.

const pad = (n) => String(n).padStart(2, "0");
const redondear = (n, d = 2) => Math.round((Number(n) + Number.EPSILON) * 10 ** d) / 10 ** d;

/** 'YYYY-MM-DD HH:MM:SS' (o Date) -> partes en hora local naive (sin zona). */
function partes(valor) {
  if (valor instanceof Date) {
    return {
      y: valor.getFullYear(), m: valor.getMonth() + 1, d: valor.getDate(),
      h: valor.getHours(), mi: valor.getMinutes(), s: valor.getSeconds(),
    };
  }
  const m = String(valor).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3], h: +m[4], mi: +m[5], s: +(m[6] || 0) };
}
const aFecha = (p) => new Date(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
const fechaISO = (p) => `${p.y}-${pad(p.m)}-${pad(p.d)}`;
const horaCorta = (p) => `${pad(p.h)}:${pad(p.mi)}`;

const MEDIA_HORA = (min) => Math.floor(min / 30) * 0.5; // se liquida por media hora cumplida

/**
 * Horas de un turno según las reglas de la casa.
 * ajuste: { horaInicio:'HH:MM'|null, horasNormales:number|null, todasExtra:boolean } | null
 */
function calcularHorasDelTurno({ entrada, salida, esNoche, esSiguienteDia, esFeriado, ajuste }) {
  const diaSemana = entrada.getDay();
  let hIn = entrada.getHours();
  let mIn = entrada.getMinutes();

  if (ajuste && ajuste.horaInicio) {
    const [ph, pm] = String(ajuste.horaInicio).split(":").map(Number);
    hIn = ph; mIn = pm;
  } else if (mIn >= 45) {
    hIn = (hIn + 1) % 24; mIn = 0;
  } else if (mIn <= 10) {
    mIn = 0;
  }

  const minIn = hIn * 60 + mIn;
  let minOut = salida.getHours() * 60 + salida.getMinutes();
  if (esSiguienteDia || minOut < minIn) minOut += 24 * 60;
  const duracion = Math.max(0, minOut - minIn);

  const esSabadoDiurno = diaSemana === 6 && !esNoche;
  const extraTotal = esSabadoDiurno || esFeriado || !!(ajuste && ajuste.todasExtra);
  const limiteMin = ((ajuste && ajuste.horasNormales) || 9.0) * 60;

  let normales = 0, extD = 0, extN = 0, extNReales = 0;
  if (extraTotal) {
    const t = MEDIA_HORA(duracion);
    if (esNoche) { extN = t; extNReales = t; } else { extD = t; }
  } else if (esNoche) {
    normales = MEDIA_HORA(Math.min(duracion, limiteMin));
    const base = MEDIA_HORA(Math.max(0, duracion - limiteMin));
    extNReales = base;
    // Desde 3 hs extra nocturnas se liquidan x1.5 (viernes noche x1.5 x2)
    extN = base >= 3.0 ? (diaSemana === 5 ? base * 1.5 * 2.0 : base * 1.5) : base;
  } else {
    normales = MEDIA_HORA(Math.min(duracion, limiteMin));
    extD = MEDIA_HORA(Math.max(0, duracion - limiteMin));
  }

  return {
    horasNormales: normales,
    extrasDiurnas: extD,
    extrasNocturnas: extN, // ya con el multiplicador de la casa aplicado
    extrasRealesDiurnas: extD,
    extrasRealesNocturnas: extNReales, // horas físicas, sin multiplicador
    duracionMinutos: duracion,
  };
}

/**
 * Arma los turnos por día a partir de las fichadas de UN operario.
 * fichadas: [{ fecha_hora, tipo }]; feriados: Set|Object de 'YYYY-MM-DD';
 * ajustes: Map|Object 'YYYY-MM-DD' -> ajuste.
 */
function construirDias(fichadas, { feriados = {}, ajustes = {} } = {}) {
  const esFer = (f) => (feriados instanceof Set ? feriados.has(f) : !!feriados[f]);
  const getAj = (f) => (ajustes instanceof Map ? ajustes.get(f) : ajustes[f]) || null;
  const ordenadas = fichadas
    .map((f) => ({ tipo: f.tipo, p: partes(f.fecha_hora) }))
    .filter((f) => f.p)
    .sort((a, b) => aFecha(a.p) - aFecha(b.p));

  const dias = {};
  let pendiente = null; // { fecha, ts, p }

  const cerrar = (finP, ts) => {
    const d = dias[pendiente.fecha];
    d.egreso = horaCorta(finP);
    d.egresoTs = ts;
    if (pendiente.fecha !== fechaISO(finP)) d.esSiguienteDia = true;
    const ajuste = getAj(pendiente.fecha);
    Object.assign(
      d,
      calcularHorasDelTurno({
        entrada: new Date(pendiente.ts), salida: new Date(ts),
        esNoche: d.esNoche, esSiguienteDia: d.esSiguienteDia,
        esFeriado: esFer(pendiente.fecha), ajuste,
      }),
    );
    d.completo = true;
    pendiente = null;
  };

  for (const f of ordenadas) {
    const fecha = fechaISO(f.p);
    const ts = aFecha(f.p).getTime();
    if (!dias[fecha]) {
      dias[fecha] = {
        fecha, ingreso: null, egreso: null, esNoche: false, esSiguienteDia: false,
        horasNormales: 0, extrasDiurnas: 0, extrasNocturnas: 0,
        extrasRealesDiurnas: 0, extrasRealesNocturnas: 0,
        esFeriado: esFer(fecha), tieneAjuste: !!getAj(fecha), completo: false,
        ingresoTs: null, egresoTs: null,
      };
    }
    if (f.tipo === "ENTRADA") {
      if (pendiente && ts - pendiente.ts > 3600000 && ts - pendiente.ts <= 18 * 3600000) {
        cerrar(f.p, ts);
      } else if (!dias[fecha].ingreso) {
        dias[fecha].ingreso = horaCorta(f.p);
        dias[fecha].ingresoTs = ts;
        if (f.p.h >= 18 || f.p.h < 6) dias[fecha].esNoche = true;
        pendiente = { fecha, ts, p: f.p };
      }
    } else if (f.tipo === "SALIDA") {
      if (pendiente && ts - pendiente.ts <= 18 * 3600000) {
        cerrar(f.p, ts);
      } else if (!dias[fecha].egreso) {
        dias[fecha].egreso = horaCorta(f.p);
      }
    }
  }
  return dias;
}

/** Controles de la LCT / Decreto 484/00 sobre los días liquidados. */
function controlesLCT(listaDias) {
  const avisos = [];
  let extrasMes = 0;
  const ord = [...listaDias].sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const d of ord) {
    const reales = (d.extrasRealesDiurnas || 0) + (d.extrasRealesNocturnas || 0);
    extrasMes += reales;
    if (reales > 3) avisos.push(`${d.fecha}: ${reales} hs extra en el día (el límite legal es 3 hs diarias, Decreto 484/00).`);
    if (d.ingreso && !d.egreso) avisos.push(`${d.fecha}: hay ingreso (${d.ingreso}) pero no se registró la salida; ese día no suma horas.`);
  }
  if (extrasMes > 30) avisos.push(`En el mes hay ${redondear(extrasMes, 1)} hs extra (el límite legal es 30 hs mensuales, Decreto 484/00).`);
  for (let i = 1; i < ord.length; i++) {
    const a = ord[i - 1], b = ord[i];
    if (a.egresoTs && b.ingresoTs) {
      const descansoH = (b.ingresoTs - a.egresoTs) / 3600000;
      if (descansoH >= 0 && descansoH < 12) {
        avisos.push(`Entre el turno del ${a.fecha} y el del ${b.fecha} hay solo ${redondear(descansoH, 1)} hs de descanso (mínimo legal: 12 hs, art. 197 LCT).`);
      }
    }
  }
  return { avisos, extrasRealesMes: redondear(extrasMes, 2) };
}

/**
 * Liquida el mes de un operario.
 * valorHora: valor hora normal de su categoría (escala UOYEP del período).
 */
function liquidarMes({ mes, fichadas, feriados, ajustes, valorHora, sumaNoRemunerativa = null }) {
  const dias = construirDias(fichadas, { feriados, ajustes });
  const delMes = Object.values(dias).filter((d) => d.fecha.startsWith(mes));
  let normales = 0, extD = 0, extN = 0;
  for (const d of delMes) { normales += d.horasNormales; extD += d.extrasDiurnas; extN += d.extrasNocturnas; }
  const vNormal = Number(valorHora) || 0;
  const vExtra = vNormal * 1.5;
  const detalle = delMes
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((d) => ({
      fecha: d.fecha, ingreso: d.ingreso, egreso: d.egreso,
      normales: d.horasNormales, extras_diurnas: d.extrasDiurnas, extras_nocturnas: d.extrasNocturnas,
      feriado: d.esFeriado || undefined, noche: d.esNoche || undefined, ajustado: d.tieneAjuste || undefined,
    }));
  const ctrl = controlesLCT(delMes);
  return {
    mes,
    dias_trabajados: delMes.filter((d) => d.completo).length,
    horas_normales: redondear(normales, 2),
    horas_extra_diurnas: redondear(extD, 2),
    horas_extra_nocturnas_liquidadas: redondear(extN, 2),
    valor_hora_normal: redondear(vNormal),
    valor_hora_extra: redondear(vExtra),
    importe_normales: redondear(normales * vNormal),
    importe_extras: redondear((extD + extN) * vExtra),
    importe_total: redondear(normales * vNormal + (extD + extN) * vExtra),
    suma_no_remunerativa_escala: sumaNoRemunerativa,
    controles: ctrl.avisos,
    horas_extra_reales_mes: ctrl.extrasRealesMes,
    detalle_dias: detalle,
  };
}

/**
 * Importe de horas con los recargos de la LCT (art. 201): 50% días hábiles,
 * 100% sábados desde las 13 hs, domingos y feriados. Aportes de ley del
 * trabajador: 11% jubilación + 3% PAMI + 3% obra social = 17%.
 */
function calcularImporteHoras({
  valor_hora, horas_normales = 0, horas_extra_50 = 0, horas_extra_100 = 0,
  adicional_porcentaje = 0, aportes_porcentaje = 17,
}) {
  const v = Number(valor_hora);
  if (!(v > 0)) return { error: "valor_hora debe ser mayor a 0." };
  const num = (x) => Math.max(0, Number(x) || 0);
  const hN = num(horas_normales), h50 = num(horas_extra_50), h100 = num(horas_extra_100);
  const adic = 1 + num(adicional_porcentaje) / 100;
  const vBase = v * adic;
  const normales = hN * vBase;
  const extra50 = h50 * vBase * 1.5;
  const extra100 = h100 * vBase * 2;
  const bruto = normales + extra50 + extra100;
  const aportes = bruto * (num(aportes_porcentaje) / 100);
  return {
    valor_hora_usado: redondear(vBase),
    importe_normales: redondear(normales),
    importe_extra_50: redondear(extra50),
    importe_extra_100: redondear(extra100),
    bruto: redondear(bruto),
    aportes_estimados: redondear(aportes),
    neto_estimado: redondear(bruto - aportes),
    nota: "Neto estimativo: solo descuenta los aportes de ley indicados; cuota sindical y otros descuentos del convenio no están incluidos.",
  };
}

module.exports = {
  calcularHorasDelTurno, construirDias, controlesLCT, liquidarMes, calcularImporteHoras, redondear,
};
