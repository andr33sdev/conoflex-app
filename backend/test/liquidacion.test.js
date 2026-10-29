"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { liquidarTurno, liquidarPeriodo, emparejarTurnos, CATEGORIAS } = require("../liquidacion");
const { normalizarGrafico, graficoDesdeTabla } = require("../graficos");
const { calcular } = require("../calculadora");
const { resolverFechas, elegirPeriodo } = require("../liquidacionDb");

const VH = 10000;
const ts = (fecha, hora) => {
  const [y, m, d] = fecha.split("-").map(Number);
  const [h, mi] = hora.split(":").map(Number);
  return new Date(y, m - 1, d, h, mi).getTime();
};
// 2026-10-05 lunes, 06 martes, 09 viernes, 10 sábado, 11 domingo, 12 lunes
const turno = (f1, h1, f2, h2, extra = {}) =>
  liquidarTurno({ entradaTs: ts(f1, h1), salidaTs: ts(f2, h2), valorHora: VH, ...extra });
const horas = (liq, cat) => liq.porCategoria[cat]?.horas ?? 0;

test("factores de las categorías", () => {
  assert.equal(CATEGORIAS.normal_diurna.factor, 1);
  assert.equal(CATEGORIAS.normal_nocturna.factor, 1.1333);
  assert.equal(CATEGORIAS.extra50_diurna.factor, 1.5);
  assert.ok(Math.abs(CATEGORIAS.extra50_nocturna.factor - 1.69995) < 1e-9);
  assert.equal(CATEGORIAS.extra100_diurna.factor, 2);
  assert.ok(Math.abs(CATEGORIAS.extra100_nocturna.factor - 2.2666) < 1e-9);
});

test("lunes 07 a 16 (9 hs): todo normal diurno", () => {
  const l = turno("2026-10-05", "07:00", "2026-10-05", "16:00");
  assert.equal(horas(l, "normal_diurna"), 9);
  assert.equal(l.importe, 90000);
});

test("lunes 07 a 18: 9 normales + 2 extras al 50% diurnas", () => {
  const l = turno("2026-10-05", "07:00", "2026-10-05", "18:00");
  assert.equal(horas(l, "normal_diurna"), 9);
  assert.equal(horas(l, "extra50_diurna"), 2);
  assert.equal(l.importe, 120000);
});

test("lunes 07 a 22: las extras que pasan las 21 son extra nocturna al 50% (sobre la hora nocturna)", () => {
  const l = turno("2026-10-05", "07:00", "2026-10-05", "22:00");
  assert.equal(horas(l, "normal_diurna"), 9);
  assert.equal(horas(l, "extra50_diurna"), 5);
  assert.equal(horas(l, "extra50_nocturna"), 1);
  assert.equal(l.importe, 90000 + 75000 + 16999.5);
});

test("noche de lunes 22 a martes 06: 8 hs normales nocturnas (+13,33%)", () => {
  const l = turno("2026-10-05", "22:00", "2026-10-06", "06:00");
  assert.equal(horas(l, "normal_nocturna"), 8);
  assert.equal(l.importe, 90664);
});

test("viernes 21 a sábado 09: las primeras 9 hs son normales aunque crucen al sábado; después extra al 50%", () => {
  const l = turno("2026-10-09", "21:00", "2026-10-10", "09:00");
  assert.equal(horas(l, "normal_nocturna"), 9); // viernes 21 a sábado 06
  assert.equal(horas(l, "extra50_diurna"), 3); // sábado 06 a 09
  assert.equal(l.importe, 101997 + 45000);
});

test("sábado 07 a 17: hasta las 13 extra al 50%; desde las 13, extra al 100% (no hay horas normales)", () => {
  const l = turno("2026-10-10", "07:00", "2026-10-10", "17:00");
  assert.equal(horas(l, "normal_diurna"), 0);
  assert.equal(horas(l, "extra50_diurna"), 6);
  assert.equal(horas(l, "extra100_diurna"), 4);
  assert.equal(l.importe, 90000 + 80000);
});

test("domingo 08 a 12: todo extra al 100%", () => {
  const l = turno("2026-10-11", "08:00", "2026-10-11", "12:00");
  assert.equal(horas(l, "extra100_diurna"), 4);
  assert.equal(l.importe, 80000);
});

test("feriado: todo al 100%", () => {
  const l = turno("2026-10-12", "07:00", "2026-10-12", "15:00", { esFeriado: (f) => f === "2026-10-12" });
  assert.equal(horas(l, "extra100_diurna"), 8);
  assert.equal(l.importe, 160000);
});

test("sábado 20 a domingo 04: pasa a 100% nocturno; el domingo es 100% desde las 00:00", () => {
  const l = turno("2026-10-10", "20:00", "2026-10-11", "04:00");
  assert.equal(horas(l, "extra100_diurna"), 1);
  assert.equal(horas(l, "extra100_nocturna"), 7);
  assert.equal(l.importe, 20000 + 7 * 22666);
});

test("turno que cruza a un feriado: desde las 00:00 del feriado es 100%", () => {
  // domingo-noche no; usamos lunes 11 -> martes 12 feriado
  const l = turno("2026-10-11", "22:00", "2026-10-12", "06:00", { esFeriado: (f) => f === "2026-10-12" });
  // domingo 22 a 24 = 2 hs al 100% nocturnas; feriado 00 a 06 = 6 hs al 100% nocturnas
  assert.equal(horas(l, "extra100_nocturna"), 8);
});

test("ajuste: todas extra y jornada normal pactada", () => {
  const a = turno("2026-10-05", "07:00", "2026-10-05", "15:00", { ajuste: { horaInicio: null, horasNormales: null, todasExtra: true } });
  assert.equal(horas(a, "extra50_diurna"), 8);
  const b = turno("2026-10-05", "07:00", "2026-10-05", "16:00", { ajuste: { horaInicio: null, horasNormales: 8, todasExtra: false } });
  assert.equal(horas(b, "normal_diurna"), 8);
  assert.equal(horas(b, "extra50_diurna"), 1);
  const c = turno("2026-10-05", "06:30", "2026-10-05", "16:00", { ajuste: { horaInicio: "07:00", horasNormales: null, todasExtra: false } });
  assert.equal(c.horasTotales, 9);
});

test("sin tope de horas extra: 16 hs un lunes se pagan todas", () => {
  const l = turno("2026-10-05", "07:00", "2026-10-05", "23:00");
  assert.equal(l.horasTotales, 16);
  assert.equal(horas(l, "extra50_diurna") + horas(l, "extra50_nocturna"), 7);
});

test("redondeo: duración en bloques de media hora completos", () => {
  const l = turno("2026-10-05", "07:00", "2026-10-05", "16:20");
  assert.equal(horas(l, "extra50_diurna"), 0);
  const l2 = turno("2026-10-05", "07:00", "2026-10-05", "16:35");
  assert.equal(l2.porCategoria.extra50_diurna.hhmm, "0:30");
  const l3 = turno("2026-10-05", "07:00", "2026-10-05", "19:08");
  assert.equal(l3.horasTotales, 12);
});

test("redondeo del ingreso: :45+ sube, :00-:10 baja, :11-:44 se respeta", () => {
  assert.equal(turno("2026-10-05", "06:57", "2026-10-05", "15:57").horasTotales, 8.5);
  assert.equal(turno("2026-10-05", "06:57", "2026-10-05", "16:00").horasTotales, 9);
  assert.equal(turno("2026-10-05", "07:08", "2026-10-05", "16:00").horasTotales, 9);
  assert.equal(turno("2026-10-05", "07:20", "2026-10-05", "16:20").horasTotales, 9);
  assert.equal(turno("2026-10-05", "07:20", "2026-10-05", "16:10").horasTotales, 8.5);
  assert.equal(turno("2026-10-05", "07:44", "2026-10-05", "16:44").horasTotales, 9);
});

test("desglose por tramos: horario, día, tipo, valor hora aplicado e importe", () => {
  const l = turno("2026-10-10", "07:00", "2026-10-10", "17:00");
  assert.equal(l.segmentos.length, 2);
  assert.match(l.segmentos[0].motivo, /sábado hasta las 13:00: todas las horas son extra al 50%/);
  assert.match(l.segmentos[1].motivo, /sábado desde las 13:00/);
  assert.deepEqual(
    { d: l.segmentos[1].desde, h: l.segmentos[1].hasta, dia: l.segmentos[1].dia, cat: l.segmentos[1].categoria, v: l.segmentos[1].valor_hora_aplicado, i: l.segmentos[1].importe },
    { d: "13:00", h: "17:00", dia: "sábado", cat: "extra100_diurna", v: 20000, i: 80000 },
  );
});

const f = (fecha_hora, tipo) => ({ fecha_hora, tipo });
const par = (dia, hi, hs) => [f(`2026-10-${dia} ${hi}:00`, "ENTRADA"), f(`2026-10-${dia} ${hs}:00`, "SALIDA")];

test("emparejamiento: turno nocturno se asigna al día de ingreso", () => {
  const t = emparejarTurnos([f("2026-10-05 22:00:00", "ENTRADA"), f("2026-10-06 06:00:00", "SALIDA")]);
  assert.equal(t.length, 1);
  assert.equal(t[0].fecha, "2026-10-05");
  assert.equal(t[0].egreso, "06:00");
});

test("liquidarPeriodo: solo cuenta los días pedidos, desglosa cada uno y suma bien", () => {
  const fichadas = [...par("05", "07:00", "18:00"), ...par("06", "07:00", "16:00"), ...par("10", "07:00", "17:00")];
  const r = liquidarPeriodo({
    fichadas, fechasIncluidas: new Set(["2026-10-05", "2026-10-10"]), valorHoraDe: () => VH, detalle: "completo",
  });
  assert.equal(r.turnos_liquidados, 2);
  assert.deepEqual(r.dias.map((d) => d.fecha), ["2026-10-05", "2026-10-10"]);
  assert.equal(r.dias[0].importe, 120000);
  assert.equal(r.dias[1].importe, 170000);
  assert.equal(r.importe_total, 290000);
  assert.ok(r.dias[1].desglose.length === 2);
  assert.equal(r.por_categoria.extra100_diurna.horas, 4);
  assert.equal(r.horas_normales, 9);
  assert.equal(r.horas_extra, 12);
});

test("liquidarPeriodo: feriado agrega nota y salida sin registrar avisa", () => {
  const r = liquidarPeriodo({
    fichadas: [...par("12", "07:00", "15:00"), f("2026-10-13 07:00:00", "ENTRADA")],
    fechasIncluidas: new Set(["2026-10-12", "2026-10-13"]), feriados: new Set(["2026-10-12"]), valorHoraDe: () => VH, detalle: "completo",
  });
  assert.ok(r.dias[0].notas.includes("feriado"));
  assert.match(r.dias[0].desglose[0].motivo, /feriado: todas las horas son extra al 100%/);
  assert.ok(r.avisos.some((a) => /no se registró la salida/.test(a)));
  assert.equal(r.dias[1].sin_salida, true);
});

test("liquidarPeriodo: el valor hora puede cambiar según el día (escala por mes)", () => {
  const r = liquidarPeriodo({
    fichadas: [...par("05", "07:00", "16:00")], fechasIncluidas: new Set(["2026-10-05"]),
    valorHoraDe: (fecha) => (fecha.startsWith("2026-10") ? 12000 : 9000),
  });
  assert.equal(r.importe_total, 108000);
});

test("resolverFechas: quincenas, mes, rango y días sueltos (todo inclusive)", () => {
  const q1 = resolverFechas({ mes: "2026-10", quincena: 1 });
  assert.equal(q1.fechas.size, 15);
  assert.ok(q1.fechas.has("2026-10-01") && q1.fechas.has("2026-10-15") && !q1.fechas.has("2026-10-16"));
  const q2 = resolverFechas({ mes: "2026-10", quincena: 2 });
  assert.equal(q2.fechas.size, 16);
  assert.ok(q2.fechas.has("2026-10-16") && q2.fechas.has("2026-10-31"));
  assert.equal(resolverFechas({ mes: "2026-02", quincena: 2 }).fechas.size, 13); // 16..28
  assert.equal(resolverFechas({ mes: "2028-02", quincena: 2 }).fechas.size, 14); // bisiesto: 16..29
  assert.equal(resolverFechas({ mes: "2026-10" }).fechas.size, 31);
  assert.equal(resolverFechas({ desde: "2026-10-05", hasta: "2026-10-05" }).fechas.size, 1);
  assert.equal(resolverFechas({ desde: "2026-10-05", hasta: "2026-10-09" }).fechas.size, 5);
  const sueltas = resolverFechas({ fechas: ["2026-10-07", "2026-10-03", "2026-10-07"] });
  assert.equal(sueltas.fechas.size, 2);
  assert.equal(sueltas.sueltas, true);
  assert.ok(resolverFechas({ mes: "2026-10", quincena: 3 }).error);
  assert.ok(resolverFechas({ desde: "2026-02-31", hasta: "2026-03-01" }).error);
  assert.ok(resolverFechas({ desde: "2026-10-09", hasta: "2026-10-05" }).error);
  assert.ok(resolverFechas({}).error);
});

test("elegirPeriodo", () => {
  const per = [{ periodo: "2026-08" }, { periodo: "2026-10" }];
  assert.equal(elegirPeriodo(per, "2026-10"), "2026-10");
  assert.equal(elegirPeriodo(per, "2026-09"), "2026-08");
  assert.equal(elegirPeriodo(per, "2026-01"), "2026-10");
});

test("gráficos: validación y normalización", () => {
  assert.ok(normalizarGrafico({ tipo: "radar", etiquetas: ["a"], series: [{ valores: [1] }] }).error);
  assert.ok(normalizarGrafico({ tipo: "barras", etiquetas: ["a", "b"], series: [{ valores: [1] }] }).error);
  const ok = normalizarGrafico({ tipo: "barras", titulo: "T", etiquetas: ["a", "b"], series: [{ nombre: "x", valores: ["1", 2] }] });
  assert.deepEqual(ok.grafico.series[0].valores, [1, 2]);
  const torta = normalizarGrafico({ tipo: "torta", etiquetas: Array.from({ length: 20 }, (_, i) => `c${i}`), series: [{ valores: Array.from({ length: 20 }, (_, i) => 20 - i) }] });
  assert.equal(torta.grafico.etiquetas.length, 12);
  assert.equal(torta.grafico.etiquetas[11], "Otros");
  const desdeTabla = graficoDesdeTabla({ tipo: "lineas", columnas: ["mes", "total"], filas: [["2026-01", 5], ["2026-02", 7]] });
  assert.equal(desdeTabla.grafico.series[0].nombre, "total");
  assert.ok(graficoDesdeTabla({ tipo: "barras", columnas: ["solo"], filas: [[1]] }).error);
});

test("calculadora: precedencia, porcentajes, decimales con coma y rechazo de código", () => {
  assert.equal(calcular("2 + 3 * 4").resultado, 14);
  assert.equal(calcular("(2 + 3) * 4").resultado, 20);
  assert.equal(calcular("1250000 * 1,15 / 3").resultado, 479166.666667);
  assert.equal(calcular("200 * 15%").resultado, 30);
  assert.equal(calcular("2 ^ 3 ^ 2").resultado, 512);
  assert.equal(calcular("-5 + 10").resultado, 5);
  assert.ok(calcular("1/0").error);
  assert.ok(calcular("process.exit()").error);
  assert.ok(calcular("2 +").error);
});

test("doble toque del reloj (ENTRADA y SALIDA a segundos) no genera un turno de 0 hs: se toma la primera y se avisa", () => {
  // viernes: entrada de la mañana, y a las 18:56 el reloj grabó el mismo toque como ENTRADA y como SALIDA
  const fich = [
    f("2026-10-23 06:55:00", "ENTRADA"),
    f("2026-10-23 18:56:45", "ENTRADA"),
    f("2026-10-23 18:56:51", "SALIDA"),
  ];
  const r = liquidarPeriodo({ fichadas: fich, fechasIncluidas: new Set(["2026-10-23"]), valorHoraDe: () => VH, detalle: "completo" });
  assert.equal(r.turnos_liquidados, 1);
  assert.equal(r.dias[0].egreso, "18:56");
  assert.equal(r.horas_totales, 11.5); // 07:00 (redondeado) a 18:56 -> 11 h 56 -> 11,5
  assert.ok(r.avisos.some((a) => /dos marcas casi juntas/.test(a)));
});

test("doble toque sin entrada de la mañana: queda sin salida (no 0 hs)", () => {
  const fich = [f("2026-10-23 18:56:45", "ENTRADA"), f("2026-10-23 18:56:51", "SALIDA")];
  const r = liquidarPeriodo({ fichadas: fich, fechasIncluidas: new Set(["2026-10-23"]), valorHoraDe: () => VH, detalle: "completo" });
  assert.equal(r.dias[0].sin_salida, true);
  assert.ok(r.avisos.some((a) => /no se registró la salida/.test(a)));
});

test("turno de 22 horas seguidas (entra 19:00, sale 17:00 del día siguiente): un solo turno", () => {
  // lunes 5 19:00 -> martes 6 17:00
  const fich = [f("2026-10-05 19:00:00", "ENTRADA"), f("2026-10-06 17:00:00", "SALIDA")];
  const r = liquidarPeriodo({ fichadas: fich, fechasIncluidas: new Set(["2026-10-05"]), valorHoraDe: () => VH, detalle: "completo" });
  assert.equal(r.turnos_liquidados, 1);
  assert.equal(r.horas_totales, 22);
  const c = r.por_categoria;
  assert.equal(c.normal_diurna.horas, 2); // 19 a 21
  assert.equal(c.normal_nocturna.horas, 7); // 21 a 04 (completa las 9 hs normales)
  assert.equal(c.extra50_nocturna.horas, 2); // 04 a 06
  assert.equal(c.extra50_diurna.horas, 11); // 06 a 17
  assert.equal(r.horas_normales, 9);
  assert.equal(r.horas_extra, 13);
});

test("turno que arranca el viernes 19:00 y sale el sábado 17:00: 9 normales, extra 50% hasta las 13:00 y 100% desde las 13:00", () => {
  const fich = [f("2026-10-23 19:00:00", "ENTRADA"), f("2026-10-24 17:00:00", "SALIDA")];
  const r = liquidarPeriodo({ fichadas: fich, fechasIncluidas: new Set(["2026-10-23"]), valorHoraDe: () => VH, detalle: "completo" });
  assert.equal(r.horas_totales, 22);
  const c = r.por_categoria;
  assert.equal(c.normal_diurna.horas, 2); // viernes 19 a 21
  assert.equal(c.normal_nocturna.horas, 7); // viernes 21 a sábado 04 (completa las 9 hs normales)
  assert.equal(c.extra50_nocturna.horas, 2); // sábado 04 a 06
  assert.equal(c.extra50_diurna.horas, 7); // sábado 06 a 13
  assert.equal(c.extra100_diurna.horas, 4); // sábado 13 a 17
});

test("una ENTRADA 24 hs después sigue siendo un turno nuevo (no cierra al anterior)", () => {
  const fich = [f("2026-10-05 07:00:00", "ENTRADA"), f("2026-10-06 07:00:00", "ENTRADA"), f("2026-10-06 16:00:00", "SALIDA")];
  const t = emparejarTurnos(fich);
  assert.equal(t.length, 2);
  assert.equal(t[0].salidaTs, null);
  assert.equal(t[1].egreso, "16:00");
});

const { esMensual, valorHoraOrdinaria, HORAS_MENSUALES } = require("../escala");

test("escala: categoría mensual -> hora ordinaria = sueldo / 180", () => {
  assert.equal(HORAS_MENSUALES, 180);
  assert.equal(esMensual(null, 1722532), true);
  assert.equal(esMensual(null, 14422.19), false);
  assert.equal(esMensual(0, 1722532), false); // marca manual manda
  assert.equal(esMensual(1, 9000), true);
  assert.equal(Math.round(valorHoraOrdinaria(1722532, true) * 100) / 100, 9569.62);
  assert.equal(valorHoraOrdinaria(9000, false), 9000);
});

test("mensual: extras sobre la hora ordinaria (sueldo/180), no sobre el sueldo entero", () => {
  const vh = 1722532 / 180;
  // lunes 07 a 18: 9 normales (incluidas en el sueldo) + 2 extras al 50%
  const l = turno("2026-10-05", "07:00", "2026-10-05", "18:00", { valorHora: vh, mensual: true });
  assert.equal(l.porCategoria.normal_diurna.importe, 0);
  assert.equal(l.importe, Math.round(2 * vh * 1.5 * 100) / 100);
  assert.ok(l.importe < 30000); // y no ~5 millones
});

test("mensual: de las horas normales nocturnas se paga solo el recargo nocturno", () => {
  const vh = 9000;
  const l = turno("2026-10-05", "21:00", "2026-10-06", "06:00", { valorHora: vh, mensual: true });
  assert.equal(l.porCategoria.normal_nocturna.horas, 9);
  assert.equal(Math.round(l.importe), Math.round(9 * vh * 0.1333));
});

test("liquidarPeriodo: mensualDe se aplica por día", () => {
  const r = liquidarPeriodo({
    fichadas: [...par("05", "07:00", "18:00")], fechasIncluidas: new Set(["2026-10-05"]),
    valorHoraDe: () => 9569.62, mensualDe: () => true, detalle: "completo",
  });
  assert.equal(r.importe_normales, 0);
  assert.equal(r.importe_extras, Math.round(2 * 9569.62 * 1.5 * 100) / 100);
  assert.match(r.dias[0].desglose[0].motivo, /incluida en el sueldo mensual/);
});
