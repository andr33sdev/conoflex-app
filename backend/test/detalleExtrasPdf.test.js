"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { liquidarPeriodo } = require("../liquidacion");
const { detalleExtrasPdf } = require("../asistencia/detalleExtrasPdf");

// Arma el shape individual de liquidarDesdeBD (solo_extras) a partir de liquidarPeriodo, sin DB.
function liqIndividual() {
  const fich = [];
  const add = (f, h, tipo) => fich.push({ tipo, fecha_hora: `2026-11-${String(f).padStart(2, "0")} ${h}:00` });
  const turnos = [[9, "18:53", 10, "07:04"], [10, "18:54", 11, "07:00"], [12, "18:53", 13, "07:00"]];
  for (const [de, he, ds, hs] of turnos) { add(de, he, "ENTRADA"); add(ds, hs, "SALIDA"); }
  const r = liquidarPeriodo({
    fichadas: fich,
    fechasIncluidas: new Set(turnos.map((t) => `2026-11-${String(t[0]).padStart(2, "0")}`)),
    feriados: new Set(["2026-11-09"]),
    valorHoraDe: () => 7959.28,
    jornadaHoras: 9,
    detalle: "completo",
  });
  return {
    operario: "Damian Ruiz",
    categoria: "OPERADOR",
    liquidacion_de: "mes completo 2026-11",
    pago: { tipo: "hora", valor_hora_ordinaria: 7959.28 },
    resumen: { horas_extra: r.horas_extra, valor_extras: r.importe_extras },
    dias: r.dias
      .filter((d) => d.horas_extra > 0)
      .map((d) => ({ ...d, desglose: (d.desglose || []).filter((s) => s.categoria.startsWith("extra")) })),
  };
}

test("detalleExtrasPdf devuelve un PDF válido con nombre y buffer", () => {
  const { nombre, datos } = detalleExtrasPdf(liqIndividual(), { usuario: "Andrés" });
  assert.match(nombre, /^Extras_Damian_Ruiz.*\.pdf$/);
  assert.ok(Buffer.isBuffer(datos) && datos.length > 1000);
  assert.equal(datos.slice(0, 5).toString("latin1"), "%PDF-");
  assert.equal(datos.slice(-6).toString("latin1").trim(), "%%EOF");
});

test("detalleExtrasPdf: sin días con extra muestra el mensaje y no rompe", () => {
  const { datos } = detalleExtrasPdf({ operario: "X", categoria: "OPERADOR", liquidacion_de: "mes 2026-11", resumen: { horas_extra: 0, valor_extras: 0 }, dias: [] });
  assert.equal(datos.slice(0, 5).toString("latin1"), "%PDF-");
});

test("detalleExtrasPdf: día sin desglose no rompe (cae al resumen del día)", () => {
  const liq = {
    operario: "Y", categoria: "OPERADOR", liquidacion_de: "mes 2026-11",
    resumen: { horas_extra: 3, valor_extras: 1000 },
    dias: [{ fecha: "2026-11-12", dia: "jueves", ingreso: "19:00", egreso: "07:00", termina_al_dia_siguiente: true, horas_extra: 3, importe: 1000, horas_por_categoria: { extra50_nocturna: 3 } }],
  };
  const { datos } = detalleExtrasPdf(liq);
  assert.equal(datos.slice(0, 5).toString("latin1"), "%PDF-");
});
