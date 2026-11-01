"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizarCodigo, mismoProducto, leerPrecios, estadoFicha, resumenFichas } = require("../comercial/catalogo");

test("códigos: coincidencia exacta o con sufijo separado, nunca por 'contiene'", () => {
  assert.equal(normalizarCodigo(" 1570l-2r  na "), "1570L-2R NA");
  assert.ok(mismoProducto("1570L-2R", "1570L-2R NA"));
  assert.ok(mismoProducto("2051-1R", "2051L-1R / 2051-1R"));
  assert.ok(mismoProducto("1025", "1025"));
  assert.ok(!mismoProducto("1025", "11025"));
  assert.ok(!mismoProducto("1570-2R", "1570B-2R NA"));
  assert.ok(!mismoProducto("1570-2R", "1570L-2R NA"));
  assert.ok(!mismoProducto("2400-2R", "2401-2R"));
  assert.ok(!mismoProducto("", "1025"));
});

test("precios: único, con variantes y unidad", () => {
  assert.deepEqual(leerPrecios("$35.210,07").unico, 35210.07);
  assert.equal(leerPrecios("35210,07").unico, 35210.07);
  assert.equal(leerPrecios("$5.275,18 más IVA").unico, 5275.18);
  const v = leerPrecios("SIN FIJACIÓN $34.303,34 | HORMIGÓN - H / ASFALTO - A $55.430,57");
  assert.equal(v.valores.length, 2);
  assert.equal(v.unico, null);
  assert.equal(v.valores[0].valor, 34303.34);
  assert.equal(v.valores[0].etiqueta, "SIN FIJACIÓN");
  assert.equal(v.valores[1].etiqueta, "HORMIGÓN - H / ASFALTO - A");
  assert.equal(leerPrecios("").valores.length, 0);
  assert.equal(leerPrecios("Consultar").unico, null);
  assert.equal(leerPrecios("$5.891,17 Precio por metro.").unidad, "metro");
  assert.equal(leerPrecios("$10.014,95").unidad, null);
});

test("estado de ficha y resumen", () => {
  const ok = estadoFicha({ descripcion: "d", usos_recomendados: "u", precio_lista: "$100,00", foto_tecnica: "x" });
  assert.equal(ok.completo, true);
  const mal = estadoFicha({ descripcion: "", usos_recomendados: "", aplicacion: "", precio_lista: "A $1,00 | B $2,00", foto_tecnica: "", foto_catalogo: "" });
  assert.deepEqual(mal.faltan, ["descripción", "usos", "precio con variantes", "foto"]);
  const r = resumenFichas([{ estado: ok, ficha_editada: true }, { estado: mal }]);
  assert.equal(r.total, 2);
  assert.equal(r.completos, 1);
  assert.equal(r.sin_usos, 1);
  assert.equal(r.con_variantes, 1);
  assert.equal(r.editados, 1);
});
