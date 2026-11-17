"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { registrarRutasSemis } = require("../semisGestion");

// Prueba el borrado de semielaborados contra MariaDB local (se saltea si no hay base).
async function conBase(fn) {
  let mysql;
  try { mysql = require("mysql2/promise"); } catch { return false; }
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test", multipleStatements: true });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return false; }
  let server;
  try {
    await pool.query("SET FOREIGN_KEY_CHECKS=0");
    for (const t of ["ingenieria_detalles", "ingenierias", "semielaborados", "productos_terminados"]) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await pool.query("SET FOREIGN_KEY_CHECKS=1");
    await pool.query("CREATE TABLE semielaborados (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(255) UNIQUE, nombre VARCHAR(255))");
    await pool.query("CREATE TABLE productos_terminados (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(255) UNIQUE, nombre VARCHAR(255))");
    await pool.query(`CREATE TABLE ingenierias (id INT AUTO_INCREMENT PRIMARY KEY, semielaborado_id INT, producto_terminado_id INT,
      FOREIGN KEY (semielaborado_id) REFERENCES semielaborados(id) ON DELETE CASCADE,
      FOREIGN KEY (producto_terminado_id) REFERENCES productos_terminados(id) ON DELETE CASCADE)`);
    await pool.query(`CREATE TABLE ingenieria_detalles (id INT AUTO_INCREMENT PRIMARY KEY, ingenieria_id INT NOT NULL, semielaborado_id INT, materia_prima_id INT, cantidad DOUBLE,
      FOREIGN KEY (ingenieria_id) REFERENCES ingenierias(id) ON DELETE CASCADE,
      FOREIGN KEY (semielaborado_id) REFERENCES semielaborados(id) ON DELETE CASCADE)`);

    // A = ingrediente de una receta de PT; B = tiene receta propia; C = sin uso.
    await pool.query("INSERT INTO semielaborados (id, codigo, nombre) VALUES (1,'A','Semi A'),(2,'B','Semi B'),(3,'C','Semi C')");
    await pool.query("INSERT INTO productos_terminados (id, codigo, nombre) VALUES (1,'PT1','Producto 1')");
    await pool.query("INSERT INTO ingenierias (id, producto_terminado_id) VALUES (1,1)"); // receta de PT1
    await pool.query("INSERT INTO ingenierias (id, semielaborado_id) VALUES (2,2)");      // receta propia de B
    await pool.query("INSERT INTO ingenieria_detalles (ingenieria_id, semielaborado_id, cantidad) VALUES (1,1,2)"); // PT1 usa A
    await pool.query("INSERT INTO ingenieria_detalles (ingenieria_id, materia_prima_id, cantidad) VALUES (2,99,1)"); // receta de B usa una MP

    const app = express();
    app.use(express.json());
    registrarRutasSemis(app, { db: pool, nombreDeUsuario: async () => "Test" });
    server = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const pedir = async (ruta, method = "DELETE") => {
      const r = await fetch(base + ruta, { method });
      return { status: r.status, json: await r.json().catch(() => null) };
    };
    const cuenta = async (tabla) => Number((await pool.query(`SELECT COUNT(*) n FROM ${tabla}`))[0][0].n);
    await fn({ pool, pedir, cuenta });
    return true;
  } finally {
    if (server) await new Promise((r) => server.close(r));
    await pool.end();
  }
}

test("borrar semi: sin ?forzar solo devuelve el impacto y no borra", async () => {
  const corrio = await conBase(async ({ pedir, cuenta }) => {
    const r = await pedir("/api/semielaborados/1");
    assert.equal(r.status, 200);
    assert.equal(r.json.impacto, true);
    assert.equal(r.json.recetas_usan, 1);
    assert.equal(r.json.recetas_propias, 0);
    assert.equal(await cuenta("semielaborados"), 3); // sigue estando
  });
  if (!corrio) console.log("  (saltado: sin MariaDB)");
});

test("borrar semi usado: con ?forzar=1 lo borra y quita su línea de la receta (la receta sigue)", async () => {
  const corrio = await conBase(async ({ pedir, cuenta }) => {
    const r = await pedir("/api/semielaborados/1?forzar=1");
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.equal(await cuenta("semielaborados"), 2);
    assert.equal(await cuenta("ingenieria_detalles"), 1); // se borró la línea que usaba A
    assert.equal(await cuenta("ingenierias"), 2);        // la receta del PT sigue existiendo
  });
  if (!corrio) console.log("  (saltado: sin MariaDB)");
});

test("borrar semi con receta propia: se borra su receta en cascada", async () => {
  const corrio = await conBase(async ({ pedir, cuenta }) => {
    const r = await pedir("/api/semielaborados/2?forzar=1");
    assert.equal(r.status, 200);
    assert.equal(await cuenta("semielaborados"), 2);
    assert.equal(await cuenta("ingenierias"), 1);        // se fue la receta propia de B
  });
  if (!corrio) console.log("  (saltado: sin MariaDB)");
});

test("borrar semi inexistente: 404", async () => {
  const corrio = await conBase(async ({ pedir }) => {
    const r = await pedir("/api/semielaborados/999?forzar=1");
    assert.equal(r.status, 404);
  });
  if (!corrio) console.log("  (saltado: sin MariaDB)");
});
