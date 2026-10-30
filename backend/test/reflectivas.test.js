const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizar, aplicarCambios } = require("../reflectivasRutas");

test("sin protector no puede haber aplicación", () => {
  assert.deepEqual(normalizar({ protector: false, aplic_completa: true, aplic_union: true }), { prograf: 0, china3m: 0, protector: 0, aplic_completa: 0, aplic_union: 0 });
});

test("con protector se conserva la aplicación", () => {
  const r = normalizar({ protector: true, aplic_completa: true });
  assert.equal(r.aplic_completa, 1);
  assert.equal(r.aplic_union, 0);
});

test("sacar el protector limpia la aplicación", () => {
  const r = aplicarCambios({ protector: 1, aplic_completa: 1, aplic_union: 1, prograf: 1 }, { protector: false });
  assert.deepEqual(r, { prograf: 1, china3m: 0, protector: 0, aplic_completa: 0, aplic_union: 0 });
});

test("tildar aplicación sin protector no tiene efecto", () => {
  const r = aplicarCambios({ protector: 0 }, { aplic_completa: true });
  assert.equal(r.aplic_completa, 0);
});

test("tildar protector y aplicación juntos funciona", () => {
  const r = aplicarCambios({}, { protector: true, aplic_union: true });
  assert.equal(r.protector, 1);
  assert.equal(r.aplic_union, 1);
});

test("prograf y china3m pueden convivir; los campos no enviados no cambian", () => {
  const r = aplicarCambios({ prograf: 1 }, { china3m: true });
  assert.equal(r.prograf, 1);
  assert.equal(r.china3m, 1);
});

const { validarNombre, limpiarIds } = require("../reflectivasRutas");

test("nombre: se limpian espacios y se rechaza vacío o demasiado largo", () => {
  assert.equal(validarNombre("  2071   Econo ").valor, "2071 Econo");
  assert.ok(validarNombre("   ").error);
  assert.ok(validarNombre(null).error);
  assert.ok(validarNombre("x".repeat(121)).error);
});

test("ids: solo enteros positivos y sin repetidos", () => {
  assert.deepEqual(limpiarIds([3, "4", 3, -1, 0, "a", 2.5, null]), [3, 4]);
  assert.deepEqual(limpiarIds("no"), []);
});
