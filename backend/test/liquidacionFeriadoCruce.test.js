"use strict";
// Regla A (elegida por la empresa): cada minuto se paga por su FECHA real.
// Un turno noche que cruza a un feriado paga al 100% las horas que caen dentro del feriado,
// aunque haya entrado un día común; y un turno que entra en el feriado paga como día común
// las horas que caen después de medianoche en un día ordinario.
// Este test fija los números del escenario real (Damian Ruiz, nov 2026, feriados 9 y 11)
// para que un cambio futuro no los altere sin que nos demos cuenta.
const test = require("node:test");
const assert = require("node:assert/strict");
const { liquidarPeriodo } = require("../liquidacion");

const VH = 1000;
const fich = [];
const add = (f, h, tipo) => fich.push({ tipo, fecha_hora: `2026-11-${String(f).padStart(2, "0")} ${h}:00` });
const turnos = [
  [9, "18:53", 10, "07:04"],
  [10, "18:54", 11, "07:00"],
  [11, "18:57", 12, "07:03"],
  [12, "18:53", 13, "07:00"],
  [13, "18:58", 14, "07:00"],
];
for (const [de, he, ds, hs] of turnos) { add(de, he, "ENTRADA"); add(ds, hs, "SALIDA"); }

function liquidar() {
  return liquidarPeriodo({
    fichadas: fich,
    fechasIncluidas: new Set(turnos.map((t) => `2026-11-${String(t[0]).padStart(2, "0")}`)),
    feriados: new Set(["2026-11-09", "2026-11-11"]),
    valorHoraDe: () => VH,
    jornadaHoras: 9,
  });
}

test("regla A: números exactos de los 5 turnos con feriados 9 y 11", () => {
  const r = liquidar();
  const porFecha = Object.fromEntries(r.dias.map((d) => [d.fecha, d]));
  const esperado = {
    "2026-11-09": { normales: 4, extra: 8 }, // entra en feriado: 5h@100 (noche feriado) + 4h norm + 3h@50
    "2026-11-10": { normales: 5, extra: 7 }, // común que cruza al feriado 11: 5h norm + 7h@100
    "2026-11-11": { normales: 4, extra: 8 }, // entra en feriado
    "2026-11-12": { normales: 9, extra: 3 }, // noche común
    "2026-11-13": { normales: 9, extra: 3 }, // noche común
  };
  for (const [fecha, exp] of Object.entries(esperado)) {
    assert.equal(porFecha[fecha].horas_normales, exp.normales, `horas normales de ${fecha}`);
    assert.equal(porFecha[fecha].horas_extra, exp.extra, `horas extra de ${fecha}`);
  }
});

test("regla A: el día 10 (común) difiere del 12/13 solo por cruzar el feriado", () => {
  const r = liquidar();
  const porFecha = Object.fromEntries(r.dias.map((d) => [d.fecha, d]));
  // 10, 12 y 13 son turnos noche de la misma duración; 10 paga más SOLO por el feriado del 11.
  assert.ok(porFecha["2026-11-10"].horas_extra > porFecha["2026-11-12"].horas_extra);
  assert.equal(porFecha["2026-11-12"].horas_extra, porFecha["2026-11-13"].horas_extra);
  // La diferencia del 10 son horas al 100% (feriado), no al 50%.
  const cat10 = porFecha["2026-11-10"].horas_por_categoria;
  const e100 = (cat10.extra100_diurna || 0) + (cat10.extra100_nocturna || 0);
  assert.equal(e100, 7);
});

test("regla A: sin feriados, los tres turnos noche dan lo mismo", () => {
  const r = liquidarPeriodo({
    fichadas: fich,
    fechasIncluidas: new Set(["2026-11-10", "2026-11-12", "2026-11-13"]),
    feriados: new Set(), // sin feriados
    valorHoraDe: () => VH,
    jornadaHoras: 9,
  });
  const extra = r.dias.map((d) => d.horas_extra);
  assert.deepEqual(extra, [3, 3, 3], "sin feriados los tres turnos noche dan 3h extra");
});
