"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluarIngreso, analizarPresentismo } = require("../presentismo");

const ev = (fecha, ingreso, extra = {}) => evaluarIngreso({ fecha, ingreso, ...extra });
// 2026-10-05 lunes ... 10-10 sábado, 10-11 domingo

test("llegada tarde: más de 5 minutos (07:06 en adelante)", () => {
  assert.equal(ev("2026-10-05", "06:50").tarde, false);
  assert.equal(ev("2026-10-05", "07:00").tarde, false);
  assert.equal(ev("2026-10-05", "07:05").tarde, false);
  assert.equal(ev("2026-10-05", "07:06").tarde, true);
  assert.equal(ev("2026-10-05", "07:15").fuera_de_tolerancia, false);
  assert.equal(ev("2026-10-05", "07:16").fuera_de_tolerancia, true);
  assert.equal(ev("2026-10-05", "07:12").minutos_tarde, 12);
});

test("turno nocturno: entrada a las 19:00", () => {
  const e = ev("2026-10-05", "19:08");
  assert.equal(e.turno, "nocturno");
  assert.equal(e.tarde, true);
  assert.equal(ev("2026-10-05", "19:04").tarde, false);
  assert.equal(ev("2026-10-05", "18:55").tarde, false);
});

test("no se evalúan domingos, feriados ni ingresos que no son de un turno regular", () => {
  assert.equal(ev("2026-10-11", "07:30"), null); // domingo
  assert.equal(ev("2026-10-12", "07:30", { esFeriado: true }), null);
  assert.equal(ev("2026-10-05", "13:00"), null);
  assert.equal(ev("2026-10-10", "07:10").tarde, true); // sábado sí
});

test("hora de inicio pactada del día reemplaza a 07/19", () => {
  const e = ev("2026-10-05", "08:20", { horaPactada: "08:00" });
  assert.equal(e.minutos_tarde, 20);
  assert.equal(e.hora_programada, "08:00");
});

const t = (fecha, ingreso) => ({ fecha, ingreso });
const analizar = (turnos, desde, hasta) => analizarPresentismo({ turnos, desde, hasta });

test("dos llegadas tarde en el mes: no pierde el presentismo", () => {
  const r = analizar([t("2026-10-05", "07:10"), t("2026-10-20", "07:08"), t("2026-10-21", "07:00")], "2026-10-01", "2026-10-31");
  assert.equal(r.pierde_presentismo, false);
  assert.equal(r.meses[0].llegadas_tarde_en_el_mes, 2);
});

test("la tercera cae en la primera quincena", () => {
  const r = analizar([t("2026-10-05", "07:10"), t("2026-10-07", "07:08"), t("2026-10-13", "07:07")], "2026-10-01", "2026-10-15");
  assert.equal(r.pierde_presentismo, true);
  assert.equal(r.meses[0].tercera_llegada_tarde.quincena, 1);
  assert.equal(r.meses[0].tercera_ocurre_dentro_del_periodo_pedido, true);
  assert.match(r.aviso, /PIERDE EL PRESENTISMO de 2026-10/);
});

test("la tercera cae en la segunda quincena: pidiendo solo la primera se informa que se pierde después", () => {
  const turnos = [t("2026-10-05", "07:10"), t("2026-10-07", "07:08"), t("2026-10-22", "19:09")];
  const q1 = analizar(turnos, "2026-10-01", "2026-10-15");
  assert.equal(q1.pierde_presentismo, true); // el presentismo es del mes
  assert.equal(q1.meses[0].tercera_ocurre_dentro_del_periodo_pedido, false);
  assert.equal(q1.llegadas_tarde_en_el_periodo, 2);
  const q2 = analizar(turnos, "2026-10-16", "2026-10-31");
  assert.equal(q2.meses[0].tercera_ocurre_dentro_del_periodo_pedido, true);
  assert.equal(q2.meses[0].tercera_llegada_tarde.quincena, 2);
});

test("dos en una quincena y una en la otra: la tercera es la que pierde", () => {
  const turnos = [t("2026-10-13", "07:10"), t("2026-10-15", "07:20"), t("2026-10-16", "07:07")];
  const r = analizar(turnos, "2026-10-01", "2026-10-31");
  assert.equal(r.meses[0].tercera_llegada_tarde.fecha, "2026-10-16");
});

test("el conteo es por mes: no se arrastra de un mes a otro", () => {
  const turnos = [t("2026-09-28", "07:10"), t("2026-09-29", "07:10"), t("2026-10-01", "07:10"), t("2026-10-02", "07:10")];
  const r = analizar(turnos, "2026-09-01", "2026-10-31");
  assert.equal(r.pierde_presentismo, false);
  assert.equal(r.meses.length, 2);
});
