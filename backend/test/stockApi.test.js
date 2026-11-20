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

test("estadoClaveApi: key correcta por header, Bearer o ?key= => ok; incorrecta/ausente => invalida", () => {
  conKey(() => {
    assert.equal(stockApi.estadoClaveApi({ headers: { "x-api-key": KEY }, query: {} }), "ok");
    assert.equal(stockApi.estadoClaveApi({ headers: { authorization: `Bearer ${KEY}` }, query: {} }), "ok");
    assert.equal(stockApi.estadoClaveApi({ headers: {}, query: { key: KEY } }), "ok");
    assert.equal(stockApi.estadoClaveApi({ headers: { "x-api-key": "otra" }, query: {} }), "invalida");
    assert.equal(stockApi.estadoClaveApi({ headers: {}, query: {} }), "invalida");
  });
});

test("estadoDisponibilidad: 'disponible' solo si el stock supera lo pedido + margen", () => {
  // margen 10%: pedir 100 exige 110 disponibles.
  assert.equal(stockApi.estadoDisponibilidad(110, 100, 10), "disponible");
  assert.equal(stockApi.estadoDisponibilidad(109, 100, 10), "consultar");
  assert.equal(stockApi.estadoDisponibilidad(100, 100, 10), "consultar"); // justo, sin margen -> consultar
  assert.equal(stockApi.estadoDisponibilidad(50, 100, 10), "consultar"); // no alcanza
  // margen 0%: alcanza con igualar lo pedido.
  assert.equal(stockApi.estadoDisponibilidad(100, 100, 0), "disponible");
  // margen 50%: pedir 10 exige 15.
  assert.equal(stockApi.estadoDisponibilidad(15, 10, 50), "disponible");
  assert.equal(stockApi.estadoDisponibilidad(14, 10, 50), "consultar");
  // cantidad por defecto 1; margen inválido cae a 10%.
  assert.equal(stockApi.estadoDisponibilidad(2, undefined, undefined), "disponible"); // 1*1.1=1.1, 2>=1.1
  assert.equal(stockApi.estadoDisponibilidad(1, 1, 10), "consultar"); // 1 < 1.1
  // disponible negativo (más comprometido que stock) -> consultar.
  assert.equal(stockApi.estadoDisponibilidad(-5, 1, 10), "consultar");
});

test("listarEstados: devuelve solo codigo/nombre/estado/texto (NUNCA cantidad)", async () => {
  const prev = process.env.STOCK_API_DEPOSITO;
  process.env.STOCK_API_DEPOSITO = "33";
  const db = {
    async query(sql) {
      assert.match(sql, /SELECT id, codigo, nombre, stock_33 AS stock, margen_web FROM semielaborados/);
      assert.doesNotMatch(sql, /costo|receta|stock_26|stock_37|stock_ayolas/);
      return [[
        { id: 1, codigo: "A", nombre: "Alfa", stock: 200, margen_web: 10 }, // 200 - 50 comp = 150 >= 100*1.1 -> disponible
        { id: 2, codigo: "B", nombre: "Beta", stock: 100, margen_web: 10 }, // 100 - 0 = 100 < 110 -> consultar
        { id: 3, codigo: "C", nombre: "Ceta", stock: 5, margen_web: 0 },   // margen 0: 5 >= 100? no -> consultar
      ]];
    },
  };
  const comp = new Map([[1, 50]]);
  try {
    const r = await stockApi.listarEstados(db, 100, comp);
    assert.deepEqual(r, [
      { codigo: "A", nombre: "Alfa", estado: "disponible", texto: "Entrega inmediata" },
      { codigo: "B", nombre: "Beta", estado: "consultar", texto: "Consultar" },
      { codigo: "C", nombre: "Ceta", estado: "consultar", texto: "Consultar" },
    ]);
    // Garantía dura: ningún item expone números/cantidad.
    for (const it of r) {
      assert.deepEqual(Object.keys(it).sort(), ["codigo", "estado", "nombre", "texto"]);
      for (const v of Object.values(it)) assert.equal(typeof v, "string");
    }
  } finally { if (prev === undefined) delete process.env.STOCK_API_DEPOSITO; else process.env.STOCK_API_DEPOSITO = prev; }
});

test("estadoDe: estado de un producto para la cantidad pedida, o null si no existe", async () => {
  const prev = process.env.STOCK_API_DEPOSITO;
  process.env.STOCK_API_DEPOSITO = "33";
  const dbOk = { async query() { return [[{ id: 7, codigo: "C70", nombre: "Cono 70", stock: 30, margen_web: 20 }]]; } };
  const dbVacio = { async query() { return [[]]; } };
  try {
    // pide 20, margen 20% -> exige 24; disponible 30-4=26 >= 24 -> disponible
    assert.deepEqual(await stockApi.estadoDe(dbOk, "C70", 20, new Map([[7, 4]])), { codigo: "C70", nombre: "Cono 70", estado: "disponible", texto: "Entrega inmediata" });
    // pide 25 -> exige 30; disponible 26 < 30 -> consultar
    assert.equal((await stockApi.estadoDe(dbOk, "C70", 25, new Map([[7, 4]]))).estado, "consultar");
    assert.equal(await stockApi.estadoDe(dbVacio, "NOPE", 1, new Map()), null);
  } finally { if (prev === undefined) delete process.env.STOCK_API_DEPOSITO; else process.env.STOCK_API_DEPOSITO = prev; }
});

test("depositoConfigurado: default 33, respeta STOCK_API_DEPOSITO válido; cae a 33 si inválido", () => {
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

test("limiteSuperado: deja pasar los primeros y corta al excederse", () => {
  const ip = "test-" + Math.random();
  let cortado = false;
  for (let i = 0; i < 130; i++) cortado = stockApi.limiteSuperado(ip) || cortado;
  assert.ok(cortado, "debería cortar después de 120 pedidos");
});
