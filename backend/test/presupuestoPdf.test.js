"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { presupuestoPdf } = require("../comercial/presupuestoPdf");

test("presupuestoPdf devuelve un PDF válido con nombre y buffer", () => {
  const { nombre, datos } = presupuestoPdf({
    cliente: "Ferretería Díaz",
    lineas: [
      { codigo: "B2071", nombre: "Base para cono 2kg 35x35", cantidad: 100, unitario: 1500, subtotal: 150000 },
      { codigo: "C70", nombre: "Cono vial 70cm", cantidad: 50, unitario: 8200, subtotal: 410000 },
    ],
    total: 560000,
    nota: "Precios + IVA. Envío a coordinar.",
  });
  assert.match(nombre, /^Presupuesto_Conoflex_.*\.pdf$/);
  assert.ok(Buffer.isBuffer(datos));
  assert.ok(datos.length > 400, "el PDF debería tener contenido");
  assert.equal(datos.slice(0, 5).toString("latin1"), "%PDF-");
  assert.equal(datos.slice(-6).toString("latin1").trim(), "%%EOF");
});

test("presupuestoPdf funciona sin cliente ni nota", () => {
  const { datos } = presupuestoPdf({
    lineas: [{ codigo: "X", nombre: "Producto", cantidad: 1, unitario: 10, subtotal: 10 }],
    total: 10,
  });
  assert.equal(datos.slice(0, 5).toString("latin1"), "%PDF-");
});

test("presupuestoPdf no explota con muchas líneas (pagina)", () => {
  const lineas = Array.from({ length: 40 }, (_, i) => ({
    codigo: "P" + i,
    nombre: "Producto número " + i,
    cantidad: i + 1,
    unitario: 100,
    subtotal: (i + 1) * 100,
  }));
  const { datos } = presupuestoPdf({ cliente: "Cliente grande", lineas, total: 82000 });
  assert.ok(datos.length > 1000);
  assert.equal(datos.slice(0, 5).toString("latin1"), "%PDF-");
});
