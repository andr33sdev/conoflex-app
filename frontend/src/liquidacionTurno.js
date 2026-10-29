// Liquidación de UN turno con las reglas de Conoflex.
// Es el mismo cálculo que hace Connie en el backend (backend/liquidacion.js):
// si cambia una regla hay que cambiarla en los dos lugares (hay un test de paridad).
//
//  - Hora diurna 06:00–21:00; nocturna 21:00–06:00 con +13,33%.
//  - Jornada normal: 9 hs desde el ingreso; el resto es extra al 50%.
//  - Turno que ingresa un sábado: hasta las 13:00 todo extra al 50%. Un turno que ingresa
//    de lunes a viernes mantiene sus primeras 9 hs normales aunque pasen al sábado.
//  - Sábados desde las 13:00, domingos y feriados: todo extra al 100%.
//  - Sin tope de horas extra.
//  - Redondeo: ingreso :45–:59 -> hora siguiente, :00–:10 -> en punto, :11–:44 tal cual;
//    duración en bloques de media hora completos.

// Categorías MENSUALES: el "valor hora" de la escala es el sueldo del mes; la hora normal
// ordinaria es ese sueldo / 180 (45 hs semanales). Espejo de backend/escala.js.
export const HORAS_MENSUALES = 180;
export const UMBRAL_MENSUAL = 100000;
export function esMensual(marca, valorEscala) {
  if (marca === 1 || marca === true || marca === "1") return true;
  if (marca === 0 || marca === false || marca === "0") return false;
  return Number(valorEscala) >= UMBRAL_MENSUAL;
}
export function valorHoraOrdinaria(valorEscala, mensual) {
  const v = Number(valorEscala) || 0;
  return mensual ? v / HORAS_MENSUALES : v;
}

export const REGLAS = {
  jornadaNormalHoras: 9,
  nocturnoDesde: 21,
  nocturnoHasta: 6,
  recargoNocturno: 0.1333,
  sabadoCorteHora: 13,
};

const F_NOCT = 1 + REGLAS.recargoNocturno;
export const FACTORES = {
  normal_diurna: 1,
  normal_nocturna: F_NOCT,
  extra50_diurna: 1.5,
  extra50_nocturna: F_NOCT * 1.5,
  extra100_diurna: 2,
  extra100_nocturna: F_NOCT * 2,
};

const pad = (n) => String(n).padStart(2, "0");
const isoDeDate = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function ingresoRedondeado(entradaTs) {
  const d = new Date(entradaTs);
  d.setSeconds(0, 0);
  const mi = d.getMinutes();
  if (mi >= 45) d.setHours(d.getHours() + 1, 0, 0, 0);
  else if (mi <= 10) d.setMinutes(0, 0, 0);
  return d.getTime();
}

/**
 * entradaTs / salidaTs en ms. ajuste: { horaInicio, horasNormales, todasExtra } | null
 * Devuelve minutos por categoría (min), inicio/fin computados y el total.
 */
export function liquidarTurnoMinutos({ entradaTs, salidaTs, esFeriado = () => false, ajuste = null }) {
  let inicio;
  if (ajuste && ajuste.horaInicio) {
    const [ph, pm] = String(ajuste.horaInicio).split(":").map(Number);
    const d = new Date(entradaTs);
    d.setHours(ph, pm, 0, 0);
    inicio = d.getTime();
  } else {
    inicio = ingresoRedondeado(entradaTs);
  }
  const salidaMin = Math.floor(salidaTs / 60000) * 60000;
  let totalMin = Math.max(0, Math.floor((salidaMin - inicio) / 60000));
  totalMin = Math.floor(totalMin / 30) * 30;

  const limiteNormalMin =
    ((ajuste && ajuste.horasNormales) || REGLAS.jornadaNormalHoras) * 60;
  const todasExtra = !!(ajuste && ajuste.todasExtra);
  const entradaSabado = new Date(entradaTs).getDay() === 6;

  const min = {};
  for (let m = 0; m < totalMin; m++) {
    const d = new Date(inicio + m * 60000);
    const dow = d.getDay();
    const hora = d.getHours();
    const doble =
      esFeriado(isoDeDate(d)) ||
      dow === 0 ||
      (dow === 6 && hora >= REGLAS.sabadoCorteHora);
    const noche = hora >= REGLAS.nocturnoDesde || hora < REGLAS.nocturnoHasta;
    let cat;
    if (doble) cat = noche ? "extra100_nocturna" : "extra100_diurna";
    else if ((dow === 6 && entradaSabado) || todasExtra || m >= limiteNormalMin)
      cat = noche ? "extra50_nocturna" : "extra50_diurna";
    else cat = noche ? "normal_nocturna" : "normal_diurna";
    min[cat] = (min[cat] || 0) + 1;
  }
  return { min, totalMin, inicioTs: inicio, finTs: inicio + totalMin * 60000 };
}

// Presentismo: llegadas tarde. Espejo de backend/presentismo.js.
//  Entrada 07:00 (diurno) o 19:00 (nocturno), tolerancia de 15 min; es llegada tarde ingresar más
//  de 5 min después (07:06 o más). Hasta 2 por mes; la tercera en el mismo mes hace perder el presentismo.
export const PRESENTISMO = { gracia: 5, tolerancia: 15, permitidas: 2, ventana: 180 };
const aMinutos = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};
export function evaluarIngreso({ fecha, ingreso, horaPactada = null, esFeriado = false }) {
  const [y, m, d] = String(fecha).split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  if (dow === 0 || esFeriado) return null;
  const real = aMinutos(ingreso);
  let prog;
  if (horaPactada) {
    prog = aMinutos(horaPactada);
  } else {
    let mejor = null;
    for (const p of [7 * 60, 19 * 60]) {
      let dif = real - p;
      if (dif > 720) dif -= 1440;
      if (dif < -720) dif += 1440;
      if (!mejor || Math.abs(dif) < Math.abs(mejor.dif)) mejor = { dif, p };
    }
    if (Math.abs(mejor.dif) > PRESENTISMO.ventana) return null;
    prog = mejor.p;
  }
  let tarde = real - prog;
  if (tarde > 720) tarde -= 1440;
  if (tarde < -720) tarde += 1440;
  return {
    minutosTarde: Math.max(0, tarde),
    tarde: tarde > PRESENTISMO.gracia,
    fueraDeTolerancia: tarde > PRESENTISMO.tolerancia,
  };
}
