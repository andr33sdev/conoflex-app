// Editar la producción planificada aunque el turno esté en la tablet y ya tenga producción cargada.
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { asegurarTablasProduccion, registrarRutasProduccion } = require("../produccionRutas");
const { asegurarTablaMovimientos } = require("../stockMovimientos");

const TABLAS = ["prod_cargas", "prod_asignaciones", "prod_turnos", "prod_plan_items", "prod_maquinas", "prod_semi_stock_movs", "mp_movimientos", "ingenieria_alertas", "registro_produccion", "ingenieria_detalles", "ingenierias", "materias_primas", "semielaborados", "usuarios"];

async function conBase(fn) {
  let mysql;
  try { mysql = require("mysql2/promise"); } catch { return; }
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test", connectionLimit: 4 });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  let servidor;
  const limpiar = async () => {
    const c = await pool.getConnection();
    await c.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const t of TABLAS) await c.query(`DROP TABLE IF EXISTS ${t}`);
    await c.query("SET FOREIGN_KEY_CHECKS = 1");
    c.release();
  };
  try {
    await limpiar();
    await pool.query("CREATE TABLE usuarios (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100), rol VARCHAR(40))");
    await pool.query("CREATE TABLE semielaborados (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(255), nombre VARCHAR(255), stock_actual DOUBLE DEFAULT 0)");
    await pool.query("CREATE TABLE materias_primas (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(255), nombre VARCHAR(255), stock_actual DOUBLE DEFAULT 0, unidad_medida VARCHAR(20))");
    await pool.query("CREATE TABLE ingenierias (id INT AUTO_INCREMENT PRIMARY KEY, semielaborado_id INT, producto_terminado_id INT NULL, nombre_version VARCHAR(100), es_activa TINYINT DEFAULT 1, proceso VARCHAR(20) NULL, peso_pieza_kg DOUBLE NULL)");
    await pool.query("CREATE TABLE ingenieria_detalles (id INT AUTO_INCREMENT PRIMARY KEY, ingenieria_id INT, materia_prima_id INT NULL, semielaborado_id INT NULL, cantidad DOUBLE, cantidad_tachada DOUBLE NULL, unidad_medida VARCHAR(20))");
    await pool.query("CREATE TABLE registro_produccion (id INT AUTO_INCREMENT PRIMARY KEY)");
    await pool.query("CREATE TABLE ingenieria_alertas (id INT AUTO_INCREMENT PRIMARY KEY, carga_id INT, estado VARCHAR(20))");
    await asegurarTablaMovimientos(pool);
    await asegurarTablasProduccion(pool);
    await pool.query("INSERT INTO usuarios (nombre, rol) VALUES ('Andrés', 'ADMIN')");
    await pool.query("INSERT INTO semielaborados (codigo, nombre) VALUES ('2071NA', 'ECONO NARANJA'), ('2051NA', 'CIUDAD NARANJA')");
    await pool.query("INSERT INTO materias_primas (codigo, nombre, stock_actual) VALUES ('PVC', 'PVC flexible', 95)");
    await pool.query("INSERT INTO ingenierias (semielaborado_id, nombre_version) VALUES (1, 'v1'), (2, 'v1')");
    await pool.query("INSERT INTO prod_maquinas (nombre, categoria, activa) VALUES ('Iny 1', 'INYECCION', 1)");

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: 1 }; next(); });
    registrarRutasProduccion(app, pool, () => (_req, _res, next) => next());
    servidor = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
    const base = `http://127.0.0.1:${servidor.address().port}`;
    const http = async (metodo, ruta, body) => {
      const r = await fetch(base + ruta, { method: metodo, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, body: await r.json().catch(() => null) };
    };
    await fn({ pool, http });
  } finally {
    if (servidor) await new Promise((r) => servidor.close(r));
    await limpiar().catch(() => {});
    await pool.end();
  }
}

test("turno en la tablet: se agrega, edita y saca producción, aun con producción cargada y aprobada", () => conBase(async ({ pool, http }) => {
  const fecha = "2026-11-10"; // un día pasado de la semana: también se puede tocar
  const semana = "2026-11-09";
  const lote1 = (await http("POST", "/api/prod/plan/items", { semana, semielaborado_id: 1, cantidad: 100 })).body;
  const lote2 = (await http("POST", "/api/prod/plan/items", { semana, semielaborado_id: 2, cantidad: 50 })).body;
  const a1 = (await http("POST", "/api/prod/asignaciones", { item_id: lote1.id, fecha, turno: "DIA", cantidad: 100, maquina_id: 1, operario: "Juan" })).body;
  await http("PUT", `/api/prod/asignaciones/${a1.id}/confirmar-receta`, { ingenieria_id: 1 });
  assert.equal((await http("POST", "/api/prod/turnos/lanzar", { fecha, turno: "DIA" })).status, 200);

  // Con el turno en la tablet: se suma otra producción (antes daba 409) y no aparece hasta estar completa.
  const a2 = await http("POST", "/api/prod/asignaciones", { item_id: lote2.id, fecha, turno: "DIA", cantidad: 50 });
  assert.equal(a2.status, 200);
  let tablet = (await http("GET", `/api/prod/tablet?fecha=${fecha}`)).body;
  assert.deepEqual(tablet.turnos.find((t) => t.turno === "DIA").asignaciones.map((a) => a.id), [a1.id]);
  await http("PUT", `/api/prod/asignaciones/${a2.body.id}`, { maquina_id: 1, operario: "Pedro" });
  assert.equal((await http("PUT", `/api/prod/asignaciones/${a2.body.id}/confirmar-receta`, { ingenieria_id: 2 })).status, 200);
  tablet = (await http("GET", `/api/prod/tablet?fecha=${fecha}`)).body;
  assert.equal(tablet.turnos.find((t) => t.turno === "DIA").asignaciones.length, 2);

  // Editar la cantidad de una producción ya lanzada.
  assert.equal((await http("PUT", `/api/prod/asignaciones/${a1.id}`, { cantidad: 120 })).status, 200);

  // Producción cargada: una por aprobar y una aprobada que consumió 5 de PVC.
  await pool.query("INSERT INTO prod_cargas (asignacion_id, item_id, lote, fecha, turno, operario, total_producido, estado) VALUES (?,?,?,?,?,?,?,?)", [a1.id, lote1.id, lote1.lote, fecha, "DIA", "Juan", 60, "PENDIENTE"]);
  const [c2] = await pool.query("INSERT INTO prod_cargas (asignacion_id, item_id, lote, fecha, turno, operario, total_producido, estado) VALUES (?,?,?,?,?,?,?,?)", [a1.id, lote1.id, lote1.lote, fecha, "DIA", "Juan", 40, "APROBADA"]);
  await pool.query("INSERT INTO mp_movimientos (materia_prima_id, tipo, cantidad, stock_resultante, referencia_tipo, referencia_id) VALUES (1, 'CONSUMO_PRODUCCION', -5, 95, 'CARGA', ?)", [c2.insertId]);

  // Sacarla pide confirmación y explica qué pasa.
  const sin = await http("DELETE", `/api/prod/asignaciones/${a1.id}`);
  assert.equal(sin.status, 409);
  assert.deepEqual([sin.body.tiene_cargas, sin.body.aprobadas], [2, 1]);
  assert.match(sin.body.error, /se devuelve la materia prima al stock/);
  // Confirmada: se borran las cargas y vuelve la materia prima.
  const con = await http("DELETE", `/api/prod/asignaciones/${a1.id}?con_cargas=1`);
  assert.deepEqual([con.status, con.body.cargas_eliminadas, con.body.materiales_devueltos], [200, 2, 1]);
  const [[mp]] = await pool.query("SELECT stock_actual FROM materias_primas WHERE id = 1");
  assert.equal(Number(mp.stock_actual), 100);
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM prod_cargas");
  assert.equal(Number(n), 0);
  // El turno sigue en la tablet porque le queda otra producción.
  let [[t]] = await pool.query("SELECT lanzado FROM prod_turnos WHERE fecha = ? AND turno = 'DIA'", [fecha]);
  assert.equal(t.lanzado, 1);

  // Quitar el lote de la semana con su turno: si el turno queda vacío, sale de la tablet.
  const q = await http("DELETE", `/api/prod/plan/items/${lote2.id}`);
  assert.deepEqual([q.status, q.body.turnos_quitados], [200, 1]);
  [[t]] = await pool.query("SELECT lanzado FROM prod_turnos WHERE fecha = ? AND turno = 'DIA'", [fecha]);
  assert.equal(t.lanzado, 0);
}));
