"use strict";
// Paridad entre el motor del backend (liquidacion.js) y el del front (frontend/src/liquidacionTurno.js).
// Los dos tienen que liquidar EXACTAMENTE los mismos minutos por categoría en cada turno; si no,
// la pantalla mostraría un número y la liquidación guardaría otro. Este test carga el motor del
// front (que es un módulo ESM) transformándolo a CommonJS en memoria y compara contra el backend.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { liquidarTurno } = require("../liquidacion");

// --- Cargar el motor del front (ESM) como CommonJS, sin tocar el archivo original ---
const rutaFront = path.join(__dirname, "../../frontend/src/liquidacionTurno.js");
const fuente = fs.readFileSync(rutaFront, "utf8");
const nombresExportados = [...fuente.matchAll(/export\s+(?:const|function)\s+(\w+)/g)].map((m) => m[1]);
const fuenteCjs = fuente.replace(/export\s+(const|function)\s+/g, "$1 ") + `\nmodule.exports = { ${nombresExportados.join(", ")} };`;
const modulo = { exports: {} };
vm.runInNewContext(fuenteCjs, { module: modulo, exports: modulo.exports, Date, Math, Number, String, Array, Object });
const { liquidarTurnoMinutos } = modulo.exports;

const ts = (iso) => new Date(iso).getTime();

// Compara minutos por categoría del front contra el backend para un mismo turno.
function parear(nombre, { entrada, salida, feriados = new Set(), ajuste = null, jornadaHoras = 9 }) {
  const esFeriado = (f) => (feriados instanceof Set ? feriados.has(f) : !!feriados[f]);
  const front = liquidarTurnoMinutos({ entradaTs: ts(entrada), salidaTs: ts(salida), esFeriado, ajuste, jornadaHoras });
  const back = liquidarTurno({ entradaTs: ts(entrada), salidaTs: ts(salida), esFeriado, ajuste, valorHora: 1000, jornadaHoras });
  const minFront = front.min;
  const minBack = Object.fromEntries(Object.entries(back.porCategoria).map(([k, v]) => [k, v.min]));
  // Normalizar: sacar categorías en 0
  const limpiar = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v > 0));
  assert.deepEqual(limpiar(minFront), limpiar(minBack), `minutos por categoría difieren en: ${nombre}`);
  assert.equal(front.totalMin, back.minutosTotales, `total de minutos difiere en: ${nombre}`);
}

test("paridad: turno diurno normal de lunes a viernes", () => {
  parear("miércoles 07:00-17:00", { entrada: "2026-11-04 07:00:00", salida: "2026-11-04 17:00:00" });
});

test("paridad: turno noche normal (cruza medianoche)", () => {
  parear("martes 19:00 -> miércoles 07:00", { entrada: "2026-11-17 19:00:00", salida: "2026-11-18 07:00:00" });
});

test("paridad: sábado (todo extra al 50% hasta 13:00, 100% después)", () => {
  parear("sábado 07:00-15:00", { entrada: "2026-11-07 07:00:00", salida: "2026-11-07 15:00:00" });
});

test("paridad: viernes noche que cruza al sábado", () => {
  parear("viernes 19:00 -> sábado 07:00", { entrada: "2026-11-06 19:00:00", salida: "2026-11-07 07:00:00" });
});

test("paridad: domingo completo (todo al 100%)", () => {
  parear("domingo 08:00-16:00", { entrada: "2026-11-08 08:00:00", salida: "2026-11-08 16:00:00" });
});

test("paridad: los 5 turnos de la captura (feriados 9 y 11)", () => {
  const feriados = new Set(["2026-11-09", "2026-11-11"]);
  const turnos = [
    ["2026-11-09 18:53:00", "2026-11-10 07:04:00"],
    ["2026-11-10 18:54:00", "2026-11-11 07:00:00"],
    ["2026-11-11 18:57:00", "2026-11-12 07:03:00"],
    ["2026-11-12 18:53:00", "2026-11-13 07:00:00"],
    ["2026-11-13 18:58:00", "2026-11-14 07:00:00"],
  ];
  turnos.forEach(([e, s], i) => parear(`captura día ${9 + i}`, { entrada: e, salida: s, feriados }));
});

test("paridad: con ajuste todasExtra", () => {
  parear("todasExtra", { entrada: "2026-11-04 07:00:00", salida: "2026-11-04 17:00:00", ajuste: { horasNormales: 0, todasExtra: true } });
});

test("paridad: con ajuste de horas normales personalizadas", () => {
  parear("6 hs normales", { entrada: "2026-11-04 07:00:00", salida: "2026-11-04 17:00:00", ajuste: { horasNormales: 6, todasExtra: false } });
});

test("paridad: con hora de inicio pactada", () => {
  parear("inicio pactado 07:00", { entrada: "2026-11-04 07:12:00", salida: "2026-11-04 17:00:00", ajuste: { horaInicio: "07:00", horasNormales: 9, todasExtra: false } });
});

test("paridad: categoría administrativa (jornada 8 hs)", () => {
  parear("adm 8 hs", { entrada: "2026-11-04 07:00:00", salida: "2026-11-04 17:00:00", jornadaHoras: 8 });
});

test("paridad: redondeo de ingreso (:57 -> hora siguiente)", () => {
  parear("ingreso 06:57", { entrada: "2026-11-04 06:57:00", salida: "2026-11-04 17:03:00" });
});
