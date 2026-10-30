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
