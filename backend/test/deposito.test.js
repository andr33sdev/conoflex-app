"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const D = require("../deposito");

const R = (o) => ({ op: "1001", fecha: "2026-11-10", cliente: "Vial SA", vendedor: "Ana", modelo: "CONO 75", detalles: "", cantidad: 10, estado: "En stock", preparado: "SIN PREPARAR", despacho: "SIN DESPACHAR", despachado: "no", ...o });

test("planilla: qué cuenta como hecho", () => {
  for (const v of ["", "-", "no", "SIN PREPARAR", "Sin despachar", null]) assert.equal(D.hechoEnPlanilla(v), false, String(v));
  for (const v of ["12/11/2026", "si", "Despachado"]) assert.equal(D.hechoEnPlanilla(v), true, v);
  assert.equal(D.normalizarOp("OP-1234"), "1234");
  assert.equal(D.normalizarOp(" op 77 "), "77");
});

test("agrupa por OP y fecha; la app manda sobre la planilla", () => {
  const renglones = [
    R({ op: "OP-1001", modelo: "CONO 75" }),
    R({ op: "1001", modelo: "TOPE", cantidad: 4 }),
    R({ op: "1001", fecha: "2025-01-02", modelo: "VIEJO" }), // misma OP de otro año: otro pedido
    R({ op: "1002", preparado: "05/11/2026" }),
    R({ op: "1003", preparado: "05/11/2026", despacho: "06/11/2026" }),
  ];
  const marcas = new Map([["1001|2026-11-10", { armado_at: new Date("2026-11-12T10:00:00"), armado_por: "Juan" }]]);
  const l = D.agruparPedidos(renglones, marcas);
  assert.equal(l.length, 4);
  const p = l.find((x) => x.op === "1001" && x.fecha === "2026-11-10");
  assert.equal(p.items, 2);
  assert.equal(p.unidades, 14);
  assert.equal(p.etapa, "ARMADO");
  assert.equal(p.armado_por, "Juan");
  assert.equal(l.find((x) => x.op === "1002").etapa, "ARMADO");
  assert.equal(l.find((x) => x.op === "1002").armado_txt, "05/11/2026");
  const d = l.find((x) => x.op === "1003");
  assert.equal(d.etapa, "DESPACHADO");
  assert.equal(d.despachado_en_planilla, true);
  assert.equal(l.find((x) => x.op === "1001" && x.fecha === "2025-01-02").etapa, "PENDIENTE");
  // más nuevos primero
  assert.equal(l[l.length - 1].fecha, "2025-01-02");
});

test("filtra, cuenta y pagina", () => {
  const l = D.agruparPedidos(Array.from({ length: 30 }, (_, i) => R({ op: String(2000 + i), cliente: i % 2 ? "Vial SA" : "Obras SRL", preparado: i < 5 ? "01/11/2026" : "-" })), new Map());
  let r = D.filtrarPedidos(l, { porPagina: 10 });
  assert.equal(r.total, 30);
  assert.equal(r.paginas, 3);
  assert.equal(r.pedidos.length, 10);
  assert.deepEqual(r.cuentas, { TODOS: 30, PENDIENTE: 25, ARMADO: 5, DESPACHADO: 0 });
  r = D.filtrarPedidos(l, { etapa: "ARMADO" });
  assert.equal(r.total, 5);
  r = D.filtrarPedidos(l, { q: "OP-2001" });
  assert.equal(r.total, 1);
  r = D.filtrarPedidos(l, { q: "obras", pagina: 99, porPagina: 5 });
  assert.equal(r.total, 15);
  assert.equal(r.pagina, 3);
});

test("semielaborados del pedido según receta", () => {
  const recetas = new Map([
    ["CONO 75", [{ semielaborado_id: 1, codigo: "B75", nombre: "Base", cantidad: 1, stock_33: 100 }, { semielaborado_id: 2, codigo: "T75", nombre: "Tubo", cantidad: 1, stock_33: 5 }]],
    ["COMBO", [{ semielaborado_id: 1, codigo: "B75", nombre: "Base", cantidad: 2, stock_33: 100 }]],
  ]);
  const r = D.semisDelPedido([{ modelo: "cono 75", cantidad: 10 }, { modelo: "COMBO", cantidad: 3 }, { modelo: "SIN RECETA", cantidad: 1 }], recetas);
  assert.deepEqual(r.sin_receta, ["SIN RECETA"]);
  assert.equal(r.semis.find((s) => s.codigo === "B75").cantidad, 16);
  assert.equal(r.semis.find((s) => s.codigo === "T75").queda, -5);
});

// ---------- integración (MariaDB local; se saltea si no hay base) ----------
async function conBase(fn) {
  let mysql;
  try {
    mysql = require("mysql2/promise");
  } catch {
    return;
  }
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch {
    if (pool) await pool.end().catch(() => {});
    return;
  }
  let server;
  try {
    await pool.query("SET FOREIGN_KEY_CHECKS=0");
    for (const t of ["deposito_descuentos", "deposito_pedidos", "estado_pedidos", "ingenieria_detalles", "ingenierias", "productos_terminados", "semielaborados", "semi_ajustes", "usuarios", "reglas"]) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await pool.query("SET FOREIGN_KEY_CHECKS=1");
    await pool.query("CREATE TABLE usuarios (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100), rol VARCHAR(40))");
    await pool.query("INSERT INTO usuarios (nombre, rol) VALUES ('Juan Depósito','DEPOSITO'), ('Andrés','ADMIN')");
    await pool.query("CREATE TABLE reglas (clave VARCHAR(100) PRIMARY KEY, valor TEXT)");
    await pool.query("CREATE TABLE semi_ajustes (id INT AUTO_INCREMENT PRIMARY KEY, semielaborado_id INT, deposito VARCHAR(20), antes DOUBLE, despues DOUBLE, delta DOUBLE, nota VARCHAR(255), usuario VARCHAR(255), creado DATETIME DEFAULT CURRENT_TIMESTAMP)");
    await pool.query("CREATE TABLE semielaborados (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(50), nombre VARCHAR(100), stock_33 DOUBLE DEFAULT 0)");
    await pool.query("INSERT INTO semielaborados (codigo, nombre, stock_33) VALUES ('B75','Base 75',100), ('T75','Tubo 75',50), ('X','Otro',7)");
    await pool.query("CREATE TABLE productos_terminados (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(100), nombre VARCHAR(100))");
    await pool.query("INSERT INTO productos_terminados (codigo, nombre) VALUES ('CONO 75','Cono 75'), ('TOPE','Tope')");
    await pool.query("CREATE TABLE ingenierias (id INT AUTO_INCREMENT PRIMARY KEY, semielaborado_id INT, producto_terminado_id INT, nombre_version VARCHAR(100), es_activa INT DEFAULT 1)");
    await pool.query("INSERT INTO ingenierias (producto_terminado_id, nombre_version, es_activa) VALUES (1,'v1',0), (1,'v2',1)");
    await pool.query("CREATE TABLE ingenieria_detalles (id INT AUTO_INCREMENT PRIMARY KEY, ingenieria_id INT, materia_prima_id INT, semielaborado_id INT, cantidad DOUBLE)");
    await pool.query("INSERT INTO ingenieria_detalles (ingenieria_id, semielaborado_id, cantidad) VALUES (1,3,9), (2,1,1), (2,2,1)");
    await pool.query("CREATE TABLE estado_pedidos (id INT AUTO_INCREMENT PRIMARY KEY, fecha DATE, op VARCHAR(40), cliente VARCHAR(255), modelo VARCHAR(255), detalles TEXT, cantidad INT, estado VARCHAR(60), preparado VARCHAR(60), despacho VARCHAR(60), despachado VARCHAR(10), vendedor VARCHAR(100))");
    const hoy = new Date();
    const f = (dias) => D.desdeSeisMeses(new Date(hoy.getFullYear(), hoy.getMonth() + 6, hoy.getDate() - dias));
    const reciente = f(3);
    const viejo = f(400);
    await pool.query("INSERT INTO estado_pedidos (fecha, op, cliente, modelo, cantidad, preparado, despacho, despachado) VALUES ?", [[
      [reciente, "OP-5001", "Vial SA", "CONO 75", 10, "SIN PREPARAR", "SIN DESPACHAR", "no"],
      [reciente, "5001", "Vial SA", "TOPE", 2, "SIN PREPARAR", "SIN DESPACHAR", "no"],
      [reciente, "5002", "Obras SRL", "CONO 75", 3, "SIN PREPARAR", "SIN DESPACHAR", "no"],
      [reciente, "5003", "Ruta SA", "CONO 75", 1, "01/11/2026", "02/11/2026", "si"],
      [viejo, "4000", "Viejo SA", "CONO 75", 1, "-", "-", "no"],
    ]]);
    await D.asegurarTablasDeposito(pool);

    const app = express();
    app.use(express.json());
    app.use((req, _r, next) => { req.user = { id: Number(req.headers["x-uid"]) || 1 }; next(); });
    D.registrarRutasDeposito(app, { db: pool, requirePermiso: () => (q, s, n) => n(), estadoEspejo: () => ({ ultima: null }), sincronizarPedidos: async () => ({ success: true }) });
    server = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const pedir = async (ruta, { method = "GET", body, uid = 1 } = {}) => {
      const r = await fetch(base + ruta, { method, headers: { "Content-Type": "application/json", "x-uid": String(uid) }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, json: await r.json().catch(() => null) };
    };
    await fn({ pool, pedir, reciente });
  } finally {
    if (server) await new Promise((r) => server.close(r));
    await pool.end();
  }
}

test("armar, comprometer, despachar, deshacer y la llave del 33", async () => {
  await conBase(async ({ pool, pedir, reciente }) => {
    let r = await pedir("/api/deposito/pedidos");
    assert.equal(r.status, 200);
    assert.equal(r.json.total, 3); // el de hace más de 6 meses no entra
    assert.deepEqual(r.json.cuentas, { TODOS: 3, PENDIENTE: 2, ARMADO: 0, DESPACHADO: 1 });

    r = await pedir(`/api/deposito/pedidos/OP-5001/${reciente}`);
    assert.equal(r.status, 200);
    assert.equal(r.json.items.length, 2);
    assert.deepEqual(r.json.sin_receta, ["TOPE"]);
    assert.equal(r.json.semis.find((s) => s.codigo === "B75").cantidad, 10); // receta activa (v2), no la vieja

    // armar: no descuenta, compromete
    r = await pedir(`/api/deposito/pedidos/5001/${reciente}/armar`, { method: "POST" });
    assert.equal(r.status, 200);
    assert.equal((await pedir(`/api/deposito/pedidos/5001/${reciente}/armar`, { method: "POST" })).status, 409);
    let [[b]] = await pool.query("SELECT stock_33 FROM semielaborados WHERE codigo = 'B75'");
    assert.equal(b.stock_33, 100);
    r = await pedir("/api/deposito/comprometido");
    assert.equal(r.json["1"], 10);
    r = await pedir("/api/deposito/comprometido/1");
    assert.equal(r.json.pedidos[0].op, "5001");
    assert.equal(r.json.pedidos[0].armado_por, "Juan Depósito");
    const [[ep]] = await pool.query("SELECT preparado FROM estado_pedidos WHERE op = 'OP-5001'");
    assert.match(ep.preparado, /^\d{2}\/\d{2}\/\d{4}$/);

    // despachar: descuenta y deja de estar comprometido
    r = await pedir(`/api/deposito/pedidos/5001/${reciente}/despachar`, { method: "POST" });
    assert.equal(r.status, 200);
    assert.equal(r.json.descontados.length, 2);
    [[b]] = await pool.query("SELECT stock_33 FROM semielaborados WHERE codigo = 'B75'");
    assert.equal(b.stock_33, 90);
    assert.deepEqual((await pedir("/api/deposito/comprometido")).json, {});
    const [[aj]] = await pool.query("SELECT COUNT(*) n FROM semi_ajustes WHERE nota = 'Despacho OP 5001'");
    assert.equal(aj.n, 2);
    assert.equal((await pedir(`/api/deposito/pedidos/5001/${reciente}/despachar`, { method: "POST" })).status, 409);
    r = await pedir(`/api/deposito/pedidos/5001/${reciente}`);
    assert.equal(r.json.descontado.length, 2);
    assert.equal(r.json.pedido.etapa, "DESPACHADO");

    // lo despachado en la planilla no se vuelve a descontar
    assert.equal((await pedir(`/api/deposito/pedidos/5003/${reciente}/despachar`, { method: "POST" })).status, 409);

    // despachar directo (sin armar) también lo deja armado
    r = await pedir(`/api/deposito/pedidos/5002/${reciente}/despachar`, { method: "POST", uid: 2 });
    assert.equal(r.status, 200);
    [[b]] = await pool.query("SELECT stock_33 FROM semielaborados WHERE codigo = 'B75'");
    assert.equal(b.stock_33, 87);

    // deshacer el despacho devuelve el stock
    r = await pedir(`/api/deposito/pedidos/5002/${reciente}/deshacer`, { method: "POST" });
    assert.equal(r.json.deshecho, "despacho");
    [[b]] = await pool.query("SELECT stock_33 FROM semielaborados WHERE codigo = 'B75'");
    assert.equal(b.stock_33, 90);
    r = await pedir(`/api/deposito/pedidos/5002/${reciente}`);
    assert.equal(r.json.pedido.etapa, "ARMADO");
    assert.equal((await pedir("/api/deposito/comprometido")).json["1"], 3);

    // la planilla se recarga entera: las marcas de la app se vuelven a escribir
    await pool.query("UPDATE estado_pedidos SET preparado = 'SIN PREPARAR', despacho = 'SIN DESPACHAR', despachado = 'no' WHERE op IN ('OP-5001','5001')");
    await D.aplicarMarcasEnPedidos(pool);
    const [[ep2]] = await pool.query("SELECT despacho, despachado FROM estado_pedidos WHERE op = '5001'");
    assert.equal(ep2.despachado, "si");
    r = await pedir("/api/deposito/pedidos?etapa=despachado");
    assert.equal(r.json.total, 2);

    // llave de la sincronización: solo admin
    r = await pedir("/api/deposito/sincronizacion-33");
    assert.equal(r.json.activo, true);
    assert.equal(r.json.puede_cambiar, false);
    assert.equal((await pedir("/api/deposito/sincronizacion-33", { method: "PUT", body: { activo: false } })).status, 403);
    r = await pedir("/api/deposito/sincronizacion-33", { method: "PUT", uid: 2, body: { activo: false } });
    assert.equal(r.json.activo, false);
    assert.equal(await D.espejoActivo(pool), false);
  });
});
