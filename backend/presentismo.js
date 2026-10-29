"use strict";
// Presentismo: llegadas tarde.
//
// Reglas de Conoflex:
//  - Turno diurno: ingreso a las 07:00. Turno nocturno: ingreso a las 19:00. (Si el día tiene una hora de
//    inicio pactada, se usa esa.)
//  - Tolerancia de ingreso: hasta 15 minutos desde la hora de entrada.
//  - Una llegada es "tarde" cuando el ingreso es más de 5 minutos posterior a la hora de entrada
//    (07:06 o después). Cada mes se permiten hasta 2 llegadas tarde; la TERCERA en el mismo mes
//    hace perder el presentismo (del mes, aunque caiga en la segunda quincena).
//  - Se evalúan los turnos de lunes a sábado que no son feriado; domingos y feriados no cuentan.

const REGLAS_PRESENTISMO = {
  turnos: [{ nombre: "diurno", hora: "07:00" }, { nombre: "nocturno", hora: "19:00" }],
  minutosDeGracia: 5, // se cuenta como tarde a partir de gracia + 1 minuto
  toleranciaMin: 15,
  llegadasTardePermitidasPorMes: 2,
  ventanaMin: 180, // un ingreso a más de 3 hs de ambas horas de entrada no es de un turno regular: no se evalúa
};

const pad = (n) => String(n).padStart(2, "0");
const aMin = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/**
 * Evalúa un ingreso. Devuelve null si no corresponde evaluarlo, o
 * { turno, hora_programada, ingreso, minutos_tarde, tarde, fuera_de_tolerancia }.
 *  fecha 'YYYY-MM-DD', ingreso 'HH:MM' (hora real de la marca), horaPactada 'HH:MM'|null.
 */
function evaluarIngreso({ fecha, ingreso, horaPactada = null, esFeriado = false }) {
  const [y, m, d] = String(fecha).split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  if (dow === 0 || esFeriado) return null;
  const real = aMin(ingreso);
  let turno;
  let prog;
  if (horaPactada) {
    prog = aMin(horaPactada);
    turno = "pactado";
  } else {
    let mejor = null;
    for (const t of REGLAS_PRESENTISMO.turnos) {
      const p = aMin(t.hora);
      let dif = real - p;
      if (dif > 720) dif -= 1440;
      if (dif < -720) dif += 1440;
      if (!mejor || Math.abs(dif) < Math.abs(mejor.dif)) mejor = { dif, t, p };
    }
    if (Math.abs(mejor.dif) > REGLAS_PRESENTISMO.ventanaMin) return null;
    prog = mejor.p;
    turno = mejor.t.nombre;
  }
  let tarde = real - prog;
  if (tarde > 720) tarde -= 1440;
  if (tarde < -720) tarde += 1440;
  return {
    turno,
    hora_programada: `${pad(Math.floor(prog / 60))}:${pad(prog % 60)}`,
    ingreso: `${pad(Math.floor(real / 60))}:${pad(real % 60)}`,
    minutos_tarde: Math.max(0, tarde),
    tarde: tarde > REGLAS_PRESENTISMO.minutosDeGracia,
    fuera_de_tolerancia: tarde > REGLAS_PRESENTISMO.toleranciaMin,
  };
}

/**
 * Presentismo de los meses de un rango, para UN operario.
 *  turnos: [{ fecha, ingreso:'HH:MM' }] (todos los del mes, no solo los del período pedido)
 *  getAjuste(fecha) -> { horaInicio } | null ; esFeriado(fecha) -> bool
 *  desde/hasta: rango pedido 'YYYY-MM-DD' (para saber cuántas caen adentro y si la tercera ya ocurrió)
 */
function analizarPresentismo({ turnos, esFeriado = () => false, getAjuste = () => null, desde, hasta }) {
  const porMes = new Map();
  for (const t of turnos) {
    const mes = t.fecha.slice(0, 7);
    if (mes < desde.slice(0, 7) || mes > hasta.slice(0, 7)) continue;
    const aj = getAjuste(t.fecha);
    const ev = evaluarIngreso({ fecha: t.fecha, ingreso: t.ingreso, horaPactada: aj?.horaInicio || null, esFeriado: esFeriado(t.fecha) });
    if (!ev || !ev.tarde) continue;
    const dow = DIAS[new Date(+t.fecha.slice(0, 4), +t.fecha.slice(5, 7) - 1, +t.fecha.slice(8, 10)).getDay()];
    if (!porMes.has(mes)) porMes.set(mes, []);
    porMes.get(mes).push({ fecha: t.fecha, dia: dow, ...ev });
  }
  const meses = [];
  for (const [mes, lista] of [...porMes.entries()].sort()) {
    lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const max = REGLAS_PRESENTISMO.llegadasTardePermitidasPorMes;
    const tercera = lista.length > max ? lista[max] : null;
    const quincenaDe = (f) => (Number(f.slice(8, 10)) <= 15 ? 1 : 2);
    meses.push({
      mes,
      llegadas_tarde_en_el_mes: lista.length,
      llegadas_tarde: lista.map((l) => ({
        fecha: l.fecha, dia: l.dia, turno: l.turno, hora_programada: l.hora_programada, ingreso: l.ingreso,
        minutos_tarde: l.minutos_tarde, quincena: quincenaDe(l.fecha),
        ...(l.fuera_de_tolerancia ? { fuera_de_tolerancia: true } : {}),
        dentro_del_periodo_pedido: l.fecha >= desde && l.fecha <= hasta,
      })),
      pierde_presentismo_del_mes: lista.length > max,
      ...(tercera ? {
        tercera_llegada_tarde: { fecha: tercera.fecha, dia: tercera.dia, quincena: quincenaDe(tercera.fecha), ingreso: tercera.ingreso, hora_programada: tercera.hora_programada },
        tercera_ocurre_dentro_del_periodo_pedido: tercera.fecha >= desde && tercera.fecha <= hasta,
      } : {}),
    });
  }
  const pierden = meses.filter((x) => x.pierde_presentismo_del_mes);
  return {
    reglas: "Entrada 07:00 (diurno) o 19:00 (nocturno), tolerancia de 15 min. Es llegada tarde ingresar más de 5 min después (07:06 / 19:06 o más). Hasta 2 por mes; la tercera en el mismo mes hace perder el presentismo.",
    meses,
    llegadas_tarde_en_el_periodo: meses.reduce((a, m) => a + m.llegadas_tarde.filter((l) => l.dentro_del_periodo_pedido).length, 0),
    pierde_presentismo: pierden.length > 0,
    ...(pierden.length ? {
      aviso: pierden.map((m) => `PIERDE EL PRESENTISMO de ${m.mes}: tuvo ${m.llegadas_tarde_en_el_mes} llegadas tarde en el mes (${m.llegadas_tarde.map((l) => `${l.fecha.slice(8)}/${l.fecha.slice(5, 7)} ${l.ingreso}`).join(", ")}); la tercera fue el ${m.tercera_llegada_tarde.fecha} (${m.tercera_llegada_tarde.quincena === 1 ? "primera" : "segunda"} quincena).`).join(" "),
    } : {}),
  };
}

module.exports = { REGLAS_PRESENTISMO, evaluarIngreso, analizarPresentismo };
