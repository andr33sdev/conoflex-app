"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { liquidarMes, construirDias, calcularImporteHoras, controlesLCT } = require("../liquidacion");
const { normalizarGrafico, graficoDesdeTabla } = require("../graficos");
const { calcular } = require("../calculadora");
const { elegirPeriodo, rangoMes } = require("../liquidacionDb");

const f = (fecha_hora, tipo) => ({ fecha_hora, tipo });
// 2026-10-05 es lunes
const turno = (dia, hi, hs) => [f(`2026-10-${dia} ${hi}`, "ENTRADA"), f(`2026-10-${dia} ${hs}`, "SALIDA")];

test("día normal de 9 hs: todo normal, sin extras", () => {
  const d = construirDias(turno("05", "07:00:00", "16:00:00"))["2026-10-05"];
  assert.equal(d.horasNormales, 9);
  assert.equal(d.extrasDiurnas, 0);
});

test("lunes con 2 hs extra: 9 normales + 2 extras diurnas", () => {
  const d = construirDias(turno("05", "07:00:00", "18:00:00"))["2026-10-05"];
  assert.equal(d.horasNormales, 9);
  assert.equal(d.extrasDiurnas, 2);
});

test("redondeo: la hora de entrada 07:50 cuenta desde las 08:00; media hora cumplida", () => {
  const d = construirDias(turno("05", "07:50:00", "17:20:00"))["2026-10-05"];
  // 08:00 a 17:20 = 9h20 -> 9 normales, 20 min de extra no completan media hora
  assert.equal(d.horasNormales, 9);
  assert.equal(d.extrasDiurnas, 0);
});

test("sábado diurno y feriado: todo es extra", () => {
  const sab = construirDias(turno("10", "07:00:00", "13:00:00"))["2026-10-10"];
  assert.equal(sab.horasNormales, 0);
  assert.equal(sab.extrasDiurnas, 6);
  const fer = construirDias(turno("06", "07:00:00", "15:00:00"), { feriados: new Set(["2026-10-06"]) })["2026-10-06"];
  assert.equal(fer.horasNormales, 0);
  assert.equal(fer.extrasDiurnas, 8);
});

test("turno nocturno cruza la medianoche y se asigna al día de entrada", () => {
  const d = construirDias([f("2026-10-05 22:00:00", "ENTRADA"), f("2026-10-06 06:00:00", "SALIDA")])["2026-10-05"];
  assert.equal(d.esNoche, true);
  assert.equal(d.esSiguienteDia, true);
  assert.equal(d.horasNormales, 8);
});

test("viernes noche con 3 hs extra: x1,5 x2 (regla de la casa)", () => {
  // viernes 2026-10-09 21:00 -> sábado 09:00 = 12 hs: 9 normales + 3 extras reales
  const d = construirDias([f("2026-10-09 21:00:00", "ENTRADA"), f("2026-10-10 09:00:00", "SALIDA")])["2026-10-09"];
  assert.equal(d.extrasRealesNocturnas, 3);
  assert.equal(d.extrasNocturnas, 9);
});

test("ajuste del día: horas normales pactadas y 'todas extra'", () => {
  const aj = { "2026-10-05": { horaInicio: null, horasNormales: 8, todasExtra: false }, "2026-10-07": { horaInicio: null, horasNormales: null, todasExtra: true } };
  const dias = construirDias([...turno("05", "07:00:00", "16:00:00"), ...turno("07", "07:00:00", "15:00:00")], { ajustes: aj });
  assert.equal(dias["2026-10-05"].horasNormales, 8);
  assert.equal(dias["2026-10-05"].extrasDiurnas, 1);
  assert.equal(dias["2026-10-07"].horasNormales, 0);
  assert.equal(dias["2026-10-07"].extrasDiurnas, 8);
});

test("liquidarMes: importes con valor hora y extras x1,5", () => {
  const r = liquidarMes({
    mes: "2026-10",
    fichadas: [...turno("05", "07:00:00", "18:00:00"), ...turno("06", "07:00:00", "16:00:00")],
    feriados: new Set(), ajustes: {}, valorHora: 10000,
  });
  assert.equal(r.horas_normales, 18);
  assert.equal(r.horas_extra_diurnas, 2);
  assert.equal(r.importe_normales, 180000);
  assert.equal(r.importe_extras, 30000); // 2 x 15000
  assert.equal(r.importe_total, 210000);
  assert.equal(r.dias_trabajados, 2);
});

test("liquidarMes: ignora días de otro mes (borde) y avisa salida sin registrar", () => {
  const r = liquidarMes({
    mes: "2026-10",
    fichadas: [...turno("30", "07:00:00", "16:00:00"), f("2026-10-12 07:00:00", "ENTRADA")],
    feriados: new Set(), ajustes: {}, valorHora: 1000,
  });
  assert.ok(r.controles.some((c) => /no se registró la salida/.test(c)));
  const nov = liquidarMes({ mes: "2026-11", fichadas: turno("30", "07:00:00", "16:00:00"), feriados: new Set(), ajustes: {}, valorHora: 1000 });
  assert.equal(nov.horas_normales, 0);
});

test("controles LCT: más de 3 hs extra por día y descanso menor a 12 hs", () => {
  const dias = Object.values(construirDias([
    ...turno("05", "07:00:00", "20:00:00"),
    f("2026-10-06 06:00:00", "ENTRADA"), f("2026-10-06 15:00:00", "SALIDA"),
  ]));
  const { avisos } = controlesLCT(dias);
  assert.ok(avisos.some((a) => /límite legal es 3 hs diarias/.test(a)));
  assert.ok(avisos.some((a) => /12 hs/.test(a)));
});

test("calcularImporteHoras: 50% y 100% con aportes del 17%", () => {
  const r = calcularImporteHoras({ valor_hora: 10000, horas_normales: 10, horas_extra_50: 2, horas_extra_100: 3 });
  assert.equal(r.importe_normales, 100000);
  assert.equal(r.importe_extra_50, 30000);
  assert.equal(r.importe_extra_100, 60000);
  assert.equal(r.bruto, 190000);
  assert.equal(r.aportes_estimados, 32300);
  assert.equal(r.neto_estimado, 157700);
  assert.ok(calcularImporteHoras({ valor_hora: 0 }).error);
  assert.equal(calcularImporteHoras({ valor_hora: 1000, horas_extra_50: 1, adicional_porcentaje: 10 }).importe_extra_50, 1650);
});

test("elegirPeriodo y rangoMes", () => {
  const per = [{ periodo: "2026-08" }, { periodo: "2026-10" }];
  assert.equal(elegirPeriodo(per, "2026-10"), "2026-10");
  assert.equal(elegirPeriodo(per, "2026-09"), "2026-08");
  assert.equal(elegirPeriodo(per, "2026-01"), "2026-10"); // no hay anterior: el más nuevo
  assert.equal(rangoMes("2026-10").desde, "2026-09-29 00:00:00");
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
