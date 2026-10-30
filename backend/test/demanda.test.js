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

const { calcularDemandaMP, demandaMateriasPrimas } = require("../demanda");

test("demanda de materias primas: abre producto → semielaborado → materia prima y suma directos", () => {
  const r = calcularDemandaMP({
    meses: 6,
    ventas: [{ modelo: "BASE35", total: 600 }, { modelo: "CONO75", total: 300 }],
    productos: [{ id: 1, codigo: "BASE35", nombre: "Base" }, { id: 2, codigo: "CONO75", nombre: "Cono" }],
    ingenieriasPT: [{ id: 10, producto_terminado_id: 1 }, { id: 11, producto_terminado_id: 2 }],
    ingenieriasSE: [{ id: 20, semielaborado_id: 100 }],
    detalles: [
      { ingenieria_id: 10, semielaborado_id: 100, cantidad: 2 }, // base: 2 cuerpos
      { ingenieria_id: 11, semielaborado_id: 100, cantidad: 1 }, // cono: 1 cuerpo
      { ingenieria_id: 11, materia_prima_id: 7, cantidad: 0.5 }, // cono: 0,5 kg de EVA directo
      { ingenieria_id: 20, materia_prima_id: 7, cantidad: 1.2 }, // cuerpo: 1,2 kg de EVA
      { ingenieria_id: 20, materia_prima_id: 8, cantidad: 0.3 },
    ],
    materiasPrimas: [
      { id: 7, codigo: "MT_EVA", nombre: "EVA", unidad_medida: "KILOS", stock_actual: -2387.69, consumo_real_mensual: 100 },
      { id: 8, codigo: "PIG", nombre: "Pigmento", unidad_medida: "KILOS", stock_actual: 500 },
      { id: 9, codigo: "NADA", nombre: "Sin uso", unidad_medida: "KILOS", stock_actual: 1 },
    ],
    semielaborados: [{ id: 100, codigo: "CUERPO", nombre: "Cuerpo" }],
  });
  const eva = r.resultado.find((x) => x.codigo === "MT_EVA");
  // base 100/mes x 2 cuerpos + cono 50/mes x 1 cuerpo = 250 cuerpos/mes x 1,2 = 300 + cono directo 50 x 0,5 = 25
  assert.equal(eva.demanda_mensual, 325);
  assert.equal(eva.stock_actual, -2387.69);
  assert.equal(eva.dias_de_stock, 0);
  assert.equal(eva.a_reponer_1_mes, 2713); // 325 + 2387,69
  assert.equal(eva.consumo_real_mensual, 100);
  assert.deepEqual(eva.usado_en.map((u) => [u.producto, u.via, u.aporte_mensual]), [["Base", "Cuerpo", 240], ["Cono", "Cuerpo", 60], ["Cono", null, 25]]);
  const pig = r.resultado.find((x) => x.codigo === "PIG");
  assert.equal(pig.demanda_mensual, 75);
  assert.equal(pig.dias_de_stock, 200);
  assert.equal(pig.a_reponer_1_mes, 0);
  assert.equal(r.resultado.find((x) => x.codigo === "NADA").demanda_mensual, 0);
});

test("demanda de materias primas: avisa lo que queda afuera (sin ingeniería, semielaborado sin receta)", () => {
  const r = calcularDemandaMP({
    meses: 1,
    ventas: [{ modelo: "A", total: 10 }, { modelo: "B", total: 5 }],
    productos: [{ id: 1, codigo: "A", nombre: "A" }, { id: 2, codigo: "B", nombre: "B" }],
    ingenieriasPT: [{ id: 10, producto_terminado_id: 1 }],
    ingenieriasSE: [],
    detalles: [{ ingenieria_id: 10, semielaborado_id: 100, cantidad: 3 }],
    materiasPrimas: [],
    semielaborados: [{ id: 100, codigo: "S", nombre: "Pieza S" }],
  });
  assert.deepEqual(r.sinIngenieria, [{ producto: "B", unidades_vendidas: 5 }]);
  assert.deepEqual(r.semielaboradosSinReceta, [{ nombre: "Pieza S", unidades_por_mes: 30 }]);
});

test("demanda de materias primas: carga, filtra por nombre y por defecto usa 6 meses", async () => {
  const pool = {
    async query(sql) {
      if (/FROM estado_pedidos/.test(sql)) return [[{ modelo: "A", total: 60 }]];
      if (/FROM productos_terminados/.test(sql)) return [[{ id: 1, codigo: "A", nombre: "A" }]];
      if (/es_activa = 1 AND producto_terminado_id/.test(sql)) return [[{ id: 10, producto_terminado_id: 1 }]];
      if (/es_activa = 1 AND semielaborado_id/.test(sql)) return [[]];
      if (/FROM ingenieria_detalles/.test(sql)) return [[{ ingenieria_id: 10, materia_prima_id: 7, semielaborado_id: null, cantidad: 2 }]];
      if (/FROM semielaborados/.test(sql)) return [[]];
      if (/FROM materias_primas/.test(sql)) return [[{ id: 7, codigo: "MT_EVA", nombre: "EVA", unidad_medida: "KILOS", stock_actual: -10 }, { id: 8, codigo: "X", nombre: "Otro", unidad_medida: "KILOS", stock_actual: 5 }]];
      if (/FROM mp_movimientos/.test(sql)) return [[{ materia_prima_id: 7, total: 600 }]];
      throw new Error("consulta inesperada " + sql);
    },
  };
  const r = await demandaMateriasPrimas(pool, { ahora: new Date(2026, 9, 29) });
  assert.equal(r.meses, 6);
  assert.match(r.periodo, /2026-04-29 al 2026-10-29/);
  assert.deepEqual(r.materias_primas.map((m) => [m.codigo, m.demanda_mensual, m.consumo_real_mensual]), [["MT_EVA", 20, 100]]);
  const uno = await demandaMateriasPrimas(pool, { materia_prima: "mt_eva", ahora: new Date(2026, 9, 29) });
  assert.equal(uno.materias_primas[0].a_reponer_1_mes, 30);
  assert.ok((await demandaMateriasPrimas(pool, { materia_prima: "zzz" })).error);
});
