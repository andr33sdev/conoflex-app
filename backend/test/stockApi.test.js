"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const stockApi = require("../stockApi");

const KEY = "clave-super-secreta-de-stock-1234";

function conKey(fn) {
  const prev = process.env.STOCK_API_KEY;
  process.env.STOCK_API_KEY = KEY;
  try { return fn(); } finally { if (prev === undefined) delete process.env.STOCK_API_KEY; else process.env.STOCK_API_KEY = prev; }
}

test("estadoClaveApi: sin STOCK_API_KEY configurada => sin_configurar", () => {
  const prev = process.env.STOCK_API_KEY;
  delete process.env.STOCK_API_KEY;
  try {
    assert.equal(stockApi.estadoClaveApi({ headers: { "x-api-key": "lo-que-sea" }, query: {} }), "sin_configurar");
  } finally { if (prev !== undefined) process.env.STOCK_API_KEY = prev; }
});

test("estadoClaveApi: key corta se considera sin configurar (no habilita)", () => {
  const prev = process.env.STOCK_API_KEY;
  process.env.STOCK_API_KEY = "corta";
  try {
    assert.equal(stockApi.estadoClaveApi({ headers: { "x-api-key": "corta" }, query: {} }), "sin_configurar");
  } finally { if (prev === undefined) delete process.env.STOCK_API_KEY; else process.env.STOCK_API_KEY = prev; }
});

test("estadoClaveApi: key correcta por header x-api-key => ok", () => {
  conKey(() => assert.equal(stockApi.estadoClaveApi({ headers: { "x-api-key": KEY }, query: {} }), "ok"));
});

test("estadoClaveApi: key correcta por Authorization Bearer => ok", () => {
  conKey(() => assert.equal(stockApi.estadoClaveApi({ headers: { authorization: `Bearer ${KEY}` }, query: {} }), "ok"));
});

test("estadoClaveApi: key correcta por ?key= => ok", () => {
  conKey(() => assert.equal(stockApi.estadoClaveApi({ headers: {}, query: { key: KEY } }), "ok"));
});

test("estadoClaveApi: key incorrecta o ausente => invalida", () => {
  conKey(() => {
    assert.equal(stockApi.estadoClaveApi({ headers: { "x-api-key": "otra" }, query: {} }), "invalida");
    assert.equal(stockApi.estadoClaveApi({ headers: {}, query: {} }), "invalida");
  });
});

test("formatearStock: nunca negativo, redondeo a 1 decimal", () => {
  assert.equal(stockApi.formatearStock(-5), 0);
  assert.equal(stockApi.formatearStock(12.34), 12.3);
  assert.equal(stockApi.formatearStock("8"), 8);
  assert.equal(stockApi.formatearStock(null), 0);
  assert.equal(stockApi.formatearStock(undefined), 0);
});

test("depositoConfigurado: default 33, y respeta STOCK_API_DEPOSITO válido; cae a 33 si es inválido", () => {
  const prev = process.env.STOCK_API_DEPOSITO;
  try {
    delete process.env.STOCK_API_DEPOSITO;
    assert.equal(stockApi.depositoConfigurado().columna, "stock_33");
    process.env.STOCK_API_DEPOSITO = "ayolas";
    assert.equal(stockApi.depositoConfigurado().columna, "stock_ayolas");
    process.env.STOCK_API_DEPOSITO = "99";
    assert.equal(stockApi.depositoConfigurado().columna, "stock_33");
  } finally { if (prev === undefined) delete process.env.STOCK_API_DEPOSITO; else process.env.STOCK_API_DEPOSITO = prev; }
});

test("listarStock: trae solo codigo, nombre y stock (depósito configurado), clamp y orden", async () => {
  const prev = process.env.STOCK_API_DEPOSITO;
  process.env.STOCK_API_DEPOSITO = "33";
  const db = {
    async query(sql) {
      assert.match(sql, /SELECT codigo, nombre, stock_33 AS stock FROM semielaborados/);
      assert.doesNotMatch(sql, /costo|receta|stock_26|stock_37|stock_ayolas/);
      // La query hace "stock_33 AS stock", así que la fila llega con la clave "stock".
      return [[
        { codigo: "B2071", nombre: "Base 2kg", stock: -3 },
        { codigo: "C70", nombre: "Cono 70", stock: 15.27 },
      ]];
    },
  };
  try {
    const r = await stockApi.listarStock(db);
    assert.deepEqual(r, [
      { codigo: "B2071", nombre: "Base 2kg", stock: 0 },
      { codigo: "C70", nombre: "Cono 70", stock: 15.3 },
    ]);
    // Cada item expone exactamente 3 claves: nada se filtra de más.
    for (const it of r) assert.deepEqual(Object.keys(it).sort(), ["codigo", "nombre", "stock"]);
  } finally { if (prev === undefined) delete process.env.STOCK_API_DEPOSITO; else process.env.STOCK_API_DEPOSITO = prev; }
});

test("stockDe: devuelve el item o null si no existe", async () => {
  const dbOk = { async query() { return [[{ codigo: "C70", nombre: "Cono 70", stock: 4 }]]; } };
  const dbVacio = { async query() { return [[]]; } };
  assert.deepEqual(await stockApi.stockDe(dbOk, "C70"), { codigo: "C70", nombre: "Cono 70", stock: 4 });
  assert.equal(await stockApi.stockDe(dbVacio, "NOPE"), null);
});

test("limiteSuperado: deja pasar los primeros y corta al excederse", () => {
  const ip = "test-" + Math.random();
  let cortado = false;
  for (let i = 0; i < 130; i++) cortado = stockApi.limiteSuperado(ip) || cortado;
  assert.ok(cortado, "debería cortar después de 120 pedidos");
});
