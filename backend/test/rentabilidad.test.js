"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { calcularRentabilidad, rentabilidadProductos, resolverPeriodo } = require("../rentabilidad");

const filas = [
  { modelo: "a-1", cantidad: 10, punisiva: 5000, cosusd: 3 }, // $5 - 3 = 2 x 10 = 20
  { modelo: "A-1 ", cantidad: 5, punisiva: 6000, cosusd: 3.5 }, // $6 - 3,5 = 2,5 x 5 = 12,5 (otro precio en otro pedido)
  { modelo: "B-2", cantidad: 4, punisiva: 2000, cosusd: 2.5 }, // $2 - 2,5 = -0,5 x 4 = -2
  { modelo: "C-3", cantidad: 100, punisiva: 9000, cosusd: 0 }, // sin costo: no entra
  { modelo: "D-4", cantidad: 7, punisiva: 0, cosusd: 1 }, // sin precio: no entra
];

test("convierte el precio a dólares antes de multiplicar y suma renglón por renglón", () => {
  const r = calcularRentabilidad({ filas, tipoCambio: 1000 });
  const a = r.productos.find((p) => p.modelo === "A-1");
  assert.equal(a.unidades_vendidas, 15);
  assert.equal(a.ingresos_usd, 80);
  assert.equal(a.costos_usd, 47.5);
  assert.equal(a.rentabilidad_usd, 32.5);
  assert.equal(a.rentabilidad_pesos, 32500);
  assert.equal(a.margen_porcentual, 40.6);
  const b = r.productos.find((p) => p.modelo === "B-2");
  assert.equal(b.rentabilidad_usd, -2);
});

test("ordena de mayor a menor y puede dar los menos rentables", () => {
  const r = calcularRentabilidad({ filas, tipoCambio: 1000 });
  assert.deepEqual(r.productos.map((p) => [p.puesto, p.modelo]), [[1, "A-1"], [2, "B-2"]]);
  const peor = calcularRentabilidad({ filas, tipoCambio: 1000, ascendente: true, top: 1 });
  assert.deepEqual(peor.productos.map((p) => p.modelo), ["B-2"]);
});

test("nunca devuelve productos que no están en los datos, aunque pidan un top 10", () => {
  const r = calcularRentabilidad({ filas, tipoCambio: 1000, top: 10 });
  assert.equal(r.productos.length, 2);
  assert.equal(r.cantidad_de_productos_con_datos, 2);
  const nombres = new Set(filas.map((f) => f.modelo.trim().toUpperCase()));
  for (const p of r.productos) assert.ok(nombres.has(p.modelo));
});

test("los renglones sin precio o sin costo quedan afuera y se informan", () => {
  const r = calcularRentabilidad({ filas, tipoCambio: 1000 });
  assert.equal(r.excluidos_por_datos_incompletos.renglones, 2);
  assert.equal(r.excluidos_por_datos_incompletos.renglones_sin_costo, 1);
  assert.equal(r.excluidos_por_datos_incompletos.renglones_sin_precio, 1);
  assert.equal(r.excluidos_por_datos_incompletos.unidades, 107);
  assert.ok(!r.productos.some((p) => p.modelo === "C-3"));
  assert.equal(r.totales.rentabilidad_usd, 30.5);
  assert.equal(r.totales.renglones_calculados, 3);
});

test("el tipo de cambio cambia el resultado y es obligatorio", () => {
  const r = calcularRentabilidad({ filas: [{ modelo: "X", cantidad: 2, punisiva: 3000, cosusd: 1 }], tipoCambio: 1500 });
  assert.equal(r.productos[0].rentabilidad_usd, 2); // (3000/1500 - 1) x 2
  assert.ok(calcularRentabilidad({ filas, tipoCambio: 0 }).error);
  assert.ok(calcularRentabilidad({ filas, tipoCambio: null }).error);
});

test("sin datos no inventa nada", () => {
  const r = calcularRentabilidad({ filas: [], tipoCambio: 1000 });
  assert.deepEqual(r.productos, []);
  assert.equal(r.totales.rentabilidad_usd, 0);
});

test("período: mes completo, rango, y error si falta", () => {
  assert.deepEqual(resolverPeriodo({ mes: "2026-10" }), { desde: "2026-10-01", hasta: "2026-10-31" });
  assert.deepEqual(resolverPeriodo({ mes: "2026-02" }), { desde: "2026-02-01", hasta: "2026-02-28" });
  assert.deepEqual(resolverPeriodo({ desde: "2026-10-01", hasta: "2026-10-15" }), { desde: "2026-10-01", hasta: "2026-10-15" });
  assert.ok(resolverPeriodo({}).error);
  assert.ok(resolverPeriodo({ mes: "2026-13" }).error);
  assert.ok(resolverPeriodo({ desde: "2026-10-20", hasta: "2026-10-01" }).error);
});

test("rentabilidadProductos lee la tabla con el período y excluye cancelados", async () => {
  const llamadas = [];
  const pool = {
    async query(sql, params) {
      llamadas.push({ sql, params });
      if (/MIN\(fecha\)/.test(sql)) return [[{ primera: "2024-01-02", ultima: "2026-10-28" }]];
      return [filas];
    },
  };
  const r = await rentabilidadProductos(pool, { mes: "2026-10", tipoCambio: 1000, top: 5 });
  assert.deepEqual(llamadas[0].params, ["2026-10-01", "2026-10-31"]);
  assert.match(llamadas[0].sql, /NOT LIKE 'CANCELAD%'/);
  assert.equal(r.productos[0].modelo, "A-1");
  assert.equal(r.datos_disponibles_hasta, "2026-10-28");
  const sinPeriodo = await rentabilidadProductos(pool, { tipoCambio: 1000 });
  assert.match(sinPeriodo.error, /período/);
});

test("muestra precio y costo unitario promedio y advierte márgenes de 90% o más", () => {
  const r = calcularRentabilidad({ filas, tipoCambio: 1000 });
  const a = r.productos.find((p) => p.modelo === "A-1");
  assert.equal(a.precio_unitario_promedio_pesos, 5333.33); // (50 + 30) USD x 1000 / 15 u.
  assert.equal(a.costo_unitario_promedio_usd, 3.17);
  assert.equal(r.advertencias, undefined);
  // precio cargado como total del renglón: el margen se va a 99% y debe avisar
  const raro = calcularRentabilidad({ filas: [{ modelo: "Z", cantidad: 1000, punisiva: 5000000, cosusd: 4 }], tipoCambio: 1000 });
  assert.ok(raro.productos[0].margen_porcentual >= 99);
  assert.match(raro.advertencias[0], /no es creíble/);
});
