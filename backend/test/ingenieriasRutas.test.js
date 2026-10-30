const test = require("node:test");
const assert = require("node:assert/strict");
const { prepararReceta, resumenCambios, formulaDeFoto } = require("../ingenieriasRutas");

const base = { nombre_version: "V1", peso_pieza_kg: 1.48, ingredientes: [{ materia_prima_id: 1, cantidad_tachada: 20 }, { materia_prima_id: 2, cantidad_tachada: 4 }, { materia_prima_id: 3, cantidad_tachada: "0,2" }] };

test("receta con fórmula: calcula los kg por pieza que suman el peso", () => {
  const r = prepararReceta(base);
  assert.equal(r.filas.length, 3);
  assert.ok(Math.abs(r.filas.reduce((a, f) => a + f.cantidad, 0) - 1.48) < 1e-5);
  assert.equal(r.filas[2].cantidad_tachada, 0.2);
  assert.equal(r.peso, 1.48);
});

test("receta con fórmula: exige peso, nombre y cantidades válidas", () => {
  assert.ok(prepararReceta({ ...base, peso_pieza_kg: "" }).error);
  assert.ok(prepararReceta({ ...base, nombre_version: " " }).error);
  assert.ok(prepararReceta({ ...base, ingredientes: [{ materia_prima_id: 1, cantidad_tachada: 20 }, { materia_prima_id: 1, cantidad_tachada: 2 }] }).error);
  assert.ok(prepararReceta({ ...base, ingredientes: [{ materia_prima_id: 1, cantidad_tachada: -1 }] }).error);
});

test("receta anterior (sin tachada) sigue valiéndose con kg por pieza", () => {
  const r = prepararReceta({ nombre_version: "vieja", ingredientes: [{ materia_prima_id: 1, cantidad: 1.2, unidad_medida: "Kg" }, { semielaborado_id: 9, cantidad: 2 }] });
  assert.equal(r.filas.length, 2);
  assert.equal(r.filas[0].cantidad_tachada, null);
  assert.ok(prepararReceta({ nombre_version: "x", ingredientes: [{ materia_prima_id: 1, cantidad: 0 }] }).error);
});

test("resumen de cambios nombra qué se tocó", () => {
  const a = { nombre_version: "V1", peso_pieza_kg: 1.48, es_activa: true, ingredientes: [{ tipo: "MP", id: 1, nombre: "Grumo", cantidad_tachada: 20, cantidad: 1 }, { tipo: "MP", id: 2, nombre: "PE", cantidad_tachada: 4, cantidad: 1 }] };
  const b = { ...a, ingredientes: [{ ...a.ingredientes[0], cantidad_tachada: 22 }, { tipo: "MP", id: 3, nombre: "Carbonato", cantidad_tachada: 1, cantidad: 1 }] };
  const t = resumenCambios(a, b);
  assert.match(t, /Grumo: 20 → 22/);
  assert.match(t, /Agregó Carbonato/);
  assert.match(t, /Quitó PE/);
  assert.equal(resumenCambios(a, a), "Sin cambios en los datos.");
});

test("fórmula de una receta anterior: los kg por pieza sirven de tachada", () => {
  const f = formulaDeFoto({ peso_pieza_kg: null, ingredientes: [{ tipo: "MP", id: 1, codigo: "A", nombre: "A", cantidad: 1, cantidad_tachada: null }, { tipo: "MP", id: 2, codigo: "B", nombre: "B", cantidad: 0.5, cantidad_tachada: null }] });
  assert.equal(f.peso, 1.5);
  assert.equal(f.con_tachada, false);
});
