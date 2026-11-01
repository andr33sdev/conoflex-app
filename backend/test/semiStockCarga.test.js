"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");
const S = require("../semiStockCarga");

test("aprobar suma al semielaborado y eliminar la aprobada resta lo mismo (una sola vez)", async () => {
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  try {
    for (const t of ["prod_semi_stock_movs", "semielaborados", "prod_plan_items"]) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await pool.query("CREATE TABLE semielaborados (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(50), stock_33 DOUBLE DEFAULT 0, stock_26 DOUBLE DEFAULT 0, stock_ayolas DOUBLE DEFAULT 0, stock_37 DOUBLE DEFAULT 0)");
    await pool.query("CREATE TABLE prod_plan_items (id INT AUTO_INCREMENT PRIMARY KEY, semielaborado_id INT)");
    await S.asegurarSemiStockCarga(pool);
    await pool.query("INSERT INTO semielaborados (codigo, stock_33) VALUES ('S1', 100), ('S2', 5)");
    await pool.query("INSERT INTO prod_plan_items (semielaborado_id) VALUES (1)");
    const stock = async (id) => Number((await pool.query("SELECT stock_33 s FROM semielaborados WHERE id=?", [id]))[0][0].s);

    assert.equal(await S.sumarPorCarga(pool, { id: 10, item_id: 1 }, 40), 40);
    assert.equal(await stock(1), 140);
    assert.equal(await S.sumarPorCarga(pool, { id: 10, item_id: 1 }, 40), 0, "no suma dos veces la misma carga");
    assert.equal(await S.sumarPorCarga(pool, { id: 11, modelo_codigo: "s2" }, 7), 7, "sin lote, busca por código");
    assert.equal(await stock(2), 12);

    assert.equal(await S.devolverPorCarga(pool, 10), 40);
    assert.equal(await stock(1), 100);
    assert.equal(await S.devolverPorCarga(pool, 10), 0, "devolver dos veces no resta de más");
    assert.equal(await stock(1), 100);
    assert.equal(await S.sumarPorCarga(pool, { id: 12, item_id: 99 }, 5), 0, "sin semielaborado no toca nada");
  } finally {
    for (const t of ["prod_semi_stock_movs", "semielaborados", "prod_plan_items"]) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await pool.end();
  }
});
