"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { calcularDemanda, demandaSemielaborados } = require("../demanda");

const base = {
  meses: 3,
  ventas: [
    { modelo: "BASE35", total: 300 },
    { modelo: "CONO75", total: 150 },
    { modelo: "SIN-CARGAR", total: 60 },
    { modelo: "SINRECETA", total: 90 },
  ],
  productos: [
    { id: 1, codigo: "BASE35", nombre: "Base de cono 35" },
    { id: 2, codigo: "CONO75", nombre: "Cono 75" },
    { id: 3, codigo: "SINRECETA", nombre: "Producto sin receta" },
    { id: 4, codigo: "NOVENDE", nombre: "No se vende" },
  ],
  ingenieriasPT: [{ id: 10, producto_terminado_id: 1 }, { id: 11, producto_terminado_id: 2 }],
  detalles: [
    { ingenieria_id: 10, semielaborado_id: 100, cantidad: 1 }, // base lleva 1 cuerpo
    { ingenieria_id: 10, semielaborado_id: 101, cantidad: 2 }, // y 2 tapas
    { ingenieria_id: 11, semielaborado_id: 100, cantidad: 3 }, // el cono lleva 3 cuerpos
  ],
  semielaborados: [
    { id: 100, codigo: "CUERPO", nombre: "Cuerpo", stock_total: 1000 },
    { id: 101, codigo: "TAPA", nombre: "Tapa", stock_total: 50 },
    { id: 102, codigo: "OTRO", nombre: "Otro", stock_total: 5 },
  ],
};

test("demanda mensual = suma, sobre todos los productos donde participa, de ventas/mes x cantidad", () => {
  const { resultado } = calcularDemanda(base);
  const por = Object.fromEntries(resultado.map((r) => [r.codigo, r]));
  // CUERPO: base 300/3=100 x1 + cono 150/3=50 x3 = 100 + 150 = 250
  assert.equal(por.CUERPO.demanda_mensual, 250);
  assert.equal(por.CUERPO.usado_en.length, 2);
  assert.equal(por.CUERPO.dias_de_stock, Math.round((1000 / 250) * 30));
  // TAPA: 100 x 2 = 200
  assert.equal(por.TAPA.demanda_mensual, 200);
  assert.equal(por.OTRO.demanda_mensual, 0);
});

test("avisa productos vendidos sin ingeniería y modelos vendidos que no están cargados", () => {
  const r = calcularDemanda(base);
  assert.deepEqual(r.sinIngenieria.map((x) => x.producto), ["Producto sin receta"]);
  assert.deepEqual(r.modelosSinProducto.map((x) => x.modelo), ["SIN-CARGAR"]);
});

test("la cantidad de meses cambia el promedio", () => {
  const { resultado } = calcularDemanda({ ...base, meses: 6 });
  assert.equal(resultado.find((r) => r.codigo === "CUERPO").demanda_mensual, 125);
});

test("demandaSemielaborados: ventana, cancelados, filtro por semielaborado y por producto", async () => {
  const consultas = [];
  const pool = {
    async query(sql, params) {
      consultas.push({ sql, params });
      if (/FROM estado_pedidos/.test(sql)) return [[{ modelo: "BASE35", total: 300 }, { modelo: "CONO75", total: 150 }]];
      if (/FROM productos_terminados/.test(sql)) return [base.productos];
      if (/FROM ingenierias/.test(sql)) return [base.ingenieriasPT];
      if (/FROM ingenieria_detalles/.test(sql)) return [base.detalles];
      if (/FROM semielaborados/.test(sql)) return [base.semielaborados.map((s) => ({ ...s, stock_33: s.stock_total, stock_26: 0, stock_ayolas: 0, stock_37: 0 }))];
      throw new Error("consulta inesperada " + sql);
    },
  };
  const ahora = new Date(2026, 9, 29);
  const r = await demandaSemielaborados(pool, { meses: 3, ahora });
  assert.match(r.periodo, /2026-07-29 al 2026-10-29/);
  assert.match(r.periodo, /sin pedidos cancelados/);
  assert.deepEqual(r.semielaborados.map((s) => s.codigo), ["CUERPO", "TAPA"]); // ordenados, sin los de demanda 0
  assert.match(consultas[0].sql, /NOT LIKE 'CANCELAD%'/);
  const c = await demandaSemielaborados(pool, { meses: 3, ahora, incluir_cancelados: true });
  assert.doesNotMatch(consultas.at(-5).sql, /CANCELAD/);
  assert.match(c.periodo, /estado_pedidos$/);
  const uno = await demandaSemielaborados(pool, { semielaborado: "tapa", ahora });
  assert.equal(uno.semielaborados.length, 1);
  assert.equal(uno.semielaborados[0].demanda_mensual, 200);
  const pr = await demandaSemielaborados(pool, { producto: "cono 75", ahora });
  assert.deepEqual(pr.semielaborados.map((s) => [s.codigo, s.demanda_mensual]), [["CUERPO", 150]]);
  const nada = await demandaSemielaborados(pool, { semielaborado: "zzz", ahora });
  assert.ok(nada.error);
});
