"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const { prepararFilas, semisPdf, semisExcel } = require("../semisExport");

const BASE = [
  { id: 1, codigo: "SE_A", nombre: "SEMI A", demanda_mensual: 100, stock_total: 50, dias_stock: 15, seguir_demanda: 1, origen: "PARAGUAY" },
  { id: 2, codigo: "SE_B", nombre: "SEMI B", demanda_mensual: 300, stock_total: 900, dias_stock: 90, seguir_demanda: 1, origen: "PROVEEDOR" },
  { id: 3, codigo: "SE_C", nombre: "SEMI C", demanda_mensual: 200, stock_total: 0, dias_stock: null, seguir_demanda: 0, origen: "PROPIA" },
];

test("prepararFilas: ordena por demanda mensual de mayor a menor", () => {
  const r = prepararFilas(BASE, { filtro: "todos" });
  assert.deepEqual(r.map((x) => x.demanda_mensual), [300, 200, 100]);
});

test("prepararFilas: filtro 'bajo' deja solo los seguidos con <= 15 días", () => {
  const r = prepararFilas(BASE, { filtro: "bajo" });
  assert.deepEqual(r.map((x) => x.codigo), ["SE_A"]);
});

test("prepararFilas: filtro 'nosigue' deja los que no siguen demanda", () => {
  const r = prepararFilas(BASE, { filtro: "nosigue" });
  assert.deepEqual(r.map((x) => x.codigo), ["SE_C"]);
});

test("semisPdf: genera un PDF válido con el logo embebido", () => {
  const buf = semisPdf(prepararFilas(BASE, { filtro: "todos" }), { meses: 3, filtro: "todos", usuario: "Andrés" });
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(buf.slice(0, 5).toString("latin1"), "%PDF-");
  // el logo oficial va embebido como XObject de imagen JPEG
  assert.ok(buf.includes(Buffer.from("/Subtype /Image")), "debe incluir una imagen (el logo)");
  assert.ok(buf.includes(Buffer.from("/DCTDecode")), "la imagen debe ser JPEG");
});

test("semisExcel: ordena por demanda y arma el encabezado esperado", () => {
  const buf = semisExcel(prepararFilas(BASE, { filtro: "todos" }), { meses: 3, filtro: "todos" });
  const wb = XLSX.read(buf);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Semielaborados"], { header: 1 });
  assert.deepEqual(rows[3], ["Código", "Semielaborado", "Demanda mensual (u.)", "Stock total (u.)", "Días de stock", "Sigue demanda", "Origen"]);
  // primera fila de datos = la de mayor demanda
  assert.equal(rows[4][0], "SE_B");
  assert.equal(rows[4][2], 300);
  assert.equal(rows[4][5], "Sí");
});

test("semisExcel simple: solo código, semielaborado y demanda", () => {
  const buf = semisExcel(prepararFilas(BASE, { filtro: "todos" }), { meses: 3, filtro: "todos", detalle: "simple" });
  const wb = XLSX.read(buf);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Semielaborados"], { header: 1 });
  assert.deepEqual(rows[3], ["Código", "Semielaborado", "Demanda mensual (u.)"]);
  assert.equal(rows[4].length, 3);
  assert.equal(rows[4][0], "SE_B");
  assert.equal(rows[4][2], 300);
});

test("semisPdf simple: genera PDF válido con el logo", () => {
  const buf = semisPdf(prepararFilas(BASE, { filtro: "todos" }), { meses: 3, filtro: "todos", detalle: "simple", usuario: "Andrés" });
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(buf.slice(0, 5).toString("latin1"), "%PDF-");
  assert.ok(buf.includes(Buffer.from("/Subtype /Image")), "debe incluir el logo");
});
