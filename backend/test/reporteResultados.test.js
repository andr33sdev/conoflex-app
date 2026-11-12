const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../reporteResultados");
const F = require("../facturas");

test("familia por la descripción de la factura", () => {
  assert.equal(R.familia("CONO MOD. ECONO LE ALT. 70 cm"), "Conos");
  assert.equal(R.familia("TACHA TRAPEZOIDAL LINEA ESTANDAR"), "Tachas");
  assert.equal(R.familia("LOMO DE BURRO MAYORISTA LIGHT"), "Reductores de velocidad");
  assert.equal(R.familia("TOPE DE ESTACIONAMIENT O REFORZADO"), "Topes");
  assert.equal(R.familia("DELINEADOR ( T ) MAYORISTA"), "Delineadores");
  assert.equal(R.familia("VALLA PREMIUM CFC"), "Vallas y barreras");
  assert.equal(R.familia("BARRICADA ALT. 95 cm"), "Vallas y barreras");
  assert.equal(R.familia("CALZA 2R"), "Otros");
});

test("unidades por familia y mes, con notas de crédito restando", () => {
  const f = R.unidadesPorFamilia([
    { mes: 1, descripcion: "CONO X", cantidad: 10, signo: 1 },
    { mes: 1, descripcion: "CONO Y", cantidad: 2, signo: -1 },
    { mes: 3, descripcion: "TACHA Z", cantidad: 5, signo: 1 },
  ]);
  assert.deepEqual(f.map((x) => [x.familia, x.meses[0], x.meses[2]]), [["Conos", 8, 0], ["Tachas", 0, 5]]);
});

test("ventas mensuales en US$ con el dólar de cierre de cada mes", () => {
  const hist = [{ fecha: "2025-01-30", venta: 1000 }, { fecha: "2025-01-31", venta: 1050 }, { fecha: "2026-01-31", venta: 1500 }];
  const v = R.ventasMensuales([{ anio: 2025, mes: 1, neto: 2100000 }, { anio: 2026, mes: 1, neto: 3000000 }], [2025, 2026], hist, "2026-02-15");
  assert.deepEqual(v[0][2025], { neto: 2100000, tc: 1050, usd: 2000 });
  assert.deepEqual(v[0][2026], { neto: 3000000, tc: 1500, usd: 2000 });
  assert.equal(v[2][2026], null); // marzo 2026 todavía no llegó
});

test("alertas: precio casi regalado, muy bajo contra el promedio, pérdidas y sin costo", () => {
  const L = [
    { codigo: "B3701", descripcion: "BASE", cantidad: 1, subtotal: 4.59, signo: 1, archivo: "a.pdf" },
    ...[1, 2, 3].map((i) => ({ codigo: "C1", descripcion: "CONO", cantidad: 10, subtotal: 100000, signo: 1, archivo: `c${i}.pdf` })),
    { codigo: "C1", descripcion: "CONO", cantidad: 10, subtotal: 20000, signo: 1, archivo: "barato.pdf" },
  ];
  const filas = [
    { codigo: "X", descripcion: "x", rentabilidad: -5, importe_neto: 1 },
    { codigo: "Y", descripcion: "y", rentabilidad: 5, margen_final: -2, importe_neto: 2 },
    { codigo: "Z", descripcion: "z", observacion: "El producto terminado no tiene receta activa", importe_neto: 3 },
  ];
  const a = R.alertas(L, filas);
  assert.deepEqual(a.map((x) => [x.tipo, x.codigo, x.comprobante]), [
    ["Precio", "B3701", "a.pdf"],
    ["Precio", "C1", "barato.pdf"],
    ["Rentabilidad negativa", "X", ""],
    ["Margen final negativo", "Y", ""],
    ["Costo", "Z", ""],
  ]);
});

test("informe: precio unitario, CMG % y margen final con gastos y cargos de MercadoLibre", () => {
  const lineas = F.repartirTotales([
    { factura_id: 1, total_factura: 1210, codigo: "A", cantidad: 10, signo: 1, subtotal: 1000, ml: false },
    { factura_id: 2, total_factura: 1210, codigo: "A", cantidad: 10, signo: 1, subtotal: 1000, ml: true },
  ]);
  const r = F.armarInforme(lineas, [{ codigo: "A", costo: 0.4, completo: true }], { tipoCambio: 100, gastosPct: 50, mlPct: 30 });
  const a = r.filas[0];
  // venta US$ 20; costo 8; CMG 12 (60%); gastos 50% de 20 = 10; cargos ML 30% de 10 = 3 → margen −1
  assert.deepEqual([a.venta_usd, a.precio_unitario, a.precio_unitario_usd, a.rentabilidad, a.rentabilidad_pct, a.margen_final, a.margen_final_pct], [20, 100, 1, 12, 0.6, -1, -0.05]);
  assert.equal(r.totales.margen_final, -1);
  assert.equal(r.totales.rentabilidad_pct, 0.6);
  // Sin porcentaje de gastos no hay margen final.
  assert.equal(F.armarInforme(lineas, [{ codigo: "A", costo: 0.4, completo: true }], { tipoCambio: 100 }).filas[0].margen_final, null);
});
