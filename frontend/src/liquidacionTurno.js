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
