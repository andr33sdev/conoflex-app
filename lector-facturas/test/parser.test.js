// Prueba el lector con una factura armada a mano (mismas posiciones que los PDF reales, datos inventados).
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../parser");

const w = (s, x, y) => ({ s, x, y });
const factura = [
  w("FCA", 345, 786), w("Punto de Venta:", 342, 758), w("0002", 414, 758), w("Comp. Nro:", 444, 758), w("00012345", 498, 758),
  w("COD.", 278, 746), w("001", 299, 746), w("de Conoplas S.R.L", 114, 746), w("Fecha de Emisión:", 342, 746), w("6/11/2026", 431, 746),
  w("Apellido y Nombre / Razón Social:", 30, 642), w("CLIENTE PRUEBA SA", 180, 642),
  w("CUIT :", 30, 606), w("30111111118", 66, 606), w("Nro. Remito:", 382, 606), w("00020557", 439, 606),
  w("Orden de Compra:", 380, 594), w("7770", 466, 594),
  w("Cant.", 24, 564), w("Codigo", 84, 564), w("Descripcion", 144, 564), w("Detalle", 253, 564),
  w("100,00", 22, 545), w("UN", 54, 545), w("2051-1R NA", 72, 545), w("CONO MOD. CIUDAD", 132, 545), w("MAYORISTA", 235, 545), w("OFERTA", 258, 545),
  w("16.897,69", 323, 545), w("0,00", 363, 545), w("0,00", 384, 545), w("0,00", 410, 545), w("16.897,69", 428, 545), w("1.689.769,00", 461, 545), w("21.00%", 504, 545), w("2.044.620,49", 529, 545),
  w("SEMIFLEXIBLE CON BASE", 132, 537), w("NARANJA", 132, 521),
  w("1.200,00", 22, 513), w("PAR", 54, 513), w("4000-2R", 72, 513), w("CALZA 2R", 132, 513), w("MAYORISTA", 235, 513),
  w("52.262,91", 323, 513), w("35,00", 359, 513), w("0,00", 384, 513), w("0,00", 410, 513), w("33.970,89", 428, 513), w("2.717.671,32", 461, 513), w("21.00%", 504, 513), w("3.288.382,30", 529, 513),
  w("Obs:", 24, 237), w("Importe Total: $", 406, 158), w("6.158.160,47", 499, 158),
];

test("lee cabecera, ítems con descripción en varios renglones y total", () => {
  const r = P.leerComprobante([factura], "01 0002-00012345 30111111118.pdf");
  assert.equal(r.tipo, "FACTURA");
  assert.equal(r.empresa, "CONOPLAS");
  assert.equal(r.numero, "00012345");
  assert.equal(r.fecha, "2026-11-06");
  assert.equal(r.cliente_cuit, "30111111118");
  assert.equal(r.total, 6158160.47);
  assert.deepEqual(r.items.map((i) => [i.cantidad, i.unidad, i.codigo, i.descripcion, i.subtotal]), [
    [100, "UN", "2051-1R NA", "CONO MOD. CIUDAD SEMIFLEXIBLE CON BASE NARANJA", 1689769],
    [1200, "PAR", "4000-2R", "CALZA 2R", 2717671.32],
  ]);
});

test("nota de crédito: tipo por el código y referencia a la factura anulada", () => {
  const nc = factura.map((x) => (x.s === "001" ? { ...x, s: "003" } : x.s === "7770" ? { ...x, s: "FC 0002-00015228 1" } : x));
  const r = P.leerComprobante([nc], "");
  assert.equal(r.tipo, "NOTA_CREDITO");
  assert.equal(r.signo, -1);
  assert.equal(r.referencia, "0002-00015228");
});

test("si el PDF no trae el código, el tipo sale del nombre del archivo", () => {
  const sinCod = factura.filter((x) => x.s !== "COD." && x.s !== "001");
  assert.equal(P.leerComprobante([sinCod], "03 0002-00000704 30708706392.pdf").tipo, "NOTA_CREDITO");
  assert.match(P.leerComprobante([sinCod], "raro.pdf").error, /desconocido/);
});

test("números en los dos formatos", () => {
  assert.equal(P.numero("1.689.769,00"), 1689769);
  assert.equal(P.numero("5,089,388.82"), 5089388.82);
  assert.equal(P.numero("-17.573,68"), -17573.68);
});

test("facturas de exportación (E): tipo por el código o por el nombre, aunque el nombre no traiga CUIT", () => {
  const e = factura.map((x) => (x.s === "001" ? { ...x, s: "019" } : x));
  assert.equal(P.leerComprobante([e], "").letra, "E");
  const sinCod = factura.filter((x) => x.s !== "COD." && x.s !== "001");
  const r = P.leerComprobante([sinCod], "19 0004-00000103.pdf");
  assert.equal(r.tipo, "FACTURA");
  assert.equal(r.letra, "E");
  assert.equal(P.leerComprobante([sinCod], "21 0004-00000009 55000000018.pdf").tipo, "NOTA_CREDITO");
});

test("factura B: el importe del ítem viene con IVA y se le saca con el Iva Contenido del pie", () => {
  const b = [
    w("B", 288, 773), w("FACTURA", 342, 773),
    w("COD.", 282, 758), w("006", 312, 758), w("Punto de Venta:", 342, 758), w("0006", 414, 758), w("Comp. Nro:", 444, 758), w("00001282", 498, 758),
    w("de Serenplas S.R.L", 120, 747), w("Fecha de Emisión:", 342, 747), w("10/11/2026", 431, 747),
    w("Cant.", 30, 564), w("Codigo", 105, 564), w("Descripcion", 184, 564), w("Detalle", 318, 564), w("Total", 542, 564),
    w("10,00", 29, 545), w("UN", 54, 545), w("2071LE-2R NA", 72, 545), w("CONO MOD. ECONO", 174, 545), w("MAYORISTA", 264, 545), w("MARKETPLACE", 289, 545),
    w("24.915,00", 384, 545), w("0,00", 420, 545), w("0,00", 449, 545), w("0,00", 469, 545), w("24.915,00", 490, 545), w("249.150,00", 534, 545),
    w("LE ALT. 70 cm 2 REF.", 174, 537),
    w("Obs:", 36, 238), w("Perc. de IIBB pcia. Bs.As.: $", 377, 171), w("0,00", 536, 171),
    w("Iva Contenido :", 37, 159), w("43240.91", 151, 159), w("Importe Total: $", 411, 159), w("249.150,00", 507, 159),
  ];
  const r = P.leerComprobante([b], "06 0006-00001282 20222222223.pdf");
  assert.equal(r.letra, "B");
  assert.equal(r.total, 249150);
  assert.deepEqual(r.items.map((i) => [i.cantidad, i.codigo, i.precio_unitario, i.subtotal]), [[10, "2071LE-2R NA", 20590.91, 205909.09]]);
});
