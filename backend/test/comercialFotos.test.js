"use strict";
const test = require("node:test");
const assert = require("node:assert");
const F = require("../comercial/fotos");

test("tipoImagen: reconoce por contenido, no por extensión", () => {
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(8)]);
  assert.strictEqual(F.tipoImagen(jpg).ext, ".jpg");
  assert.strictEqual(F.tipoImagen(png).ext, ".png");
  assert.strictEqual(F.tipoImagen(webp).ext, ".webp");
  assert.strictEqual(F.tipoImagen(Buffer.from("<svg onload=alert(1)></svg>........")), null);
  assert.strictEqual(F.tipoImagen(Buffer.from("%PDF-1.4 ................")), null);
  assert.strictEqual(F.tipoImagen(Buffer.alloc(3)), null);
});

test("codigoDesdeArchivo: saca extensión y sufijos de copia", () => {
  assert.strictEqual(F.codigoDesdeArchivo("1025.jpg"), "1025");
  assert.strictEqual(F.codigoDesdeArchivo("1570L-2R NA (2).PNG"), "1570L-2R NA");
  assert.strictEqual(F.codigoDesdeArchivo("1025 - copia.webp"), "1025");
});

test("productoParaArchivo: exacto, con guiones bajos, ambiguo y sin match", () => {
  const ps = [{ id: 1, codigo: "1025" }, { id: 2, codigo: "1570L-2R NA" }, { id: 3, codigo: "500 / 501" }, { id: 4, codigo: "700" }, { id: 5, codigo: "700" }];
  assert.strictEqual(F.productoParaArchivo("1025.jpg", ps).producto.id, 1);
  assert.strictEqual(F.productoParaArchivo("1570L-2R_NA.png", ps).producto.id, 2);
  assert.strictEqual(F.productoParaArchivo("501.jpg", ps).producto.id, 3);
  assert.match(F.productoParaArchivo("700.jpg", ps).motivo, /2 productos/);
  assert.match(F.productoParaArchivo("999.jpg", ps).motivo, /no hay/);
});
