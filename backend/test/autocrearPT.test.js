"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { asegurarPTDesdePedidos } = require("../mpCostos");

// Verifica que los PT solo se auto-crean desde pedidos con fecha >= corte (de hoy en adelante).
async function conBase(fn) {
  let mysql;
  try { mysql = require("mysql2/promise"); } catch { return false; }
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return false; }
  try {
    for (const t of ["reglas", "estado_pedidos", "productos_terminados"]) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await pool.query("CREATE TABLE reglas (clave VARCHAR(100) PRIMARY KEY, valor TEXT)");
    await pool.query("CREATE TABLE estado_pedidos (id INT AUTO_INCREMENT PRIMARY KEY, modelo VARCHAR(255), fecha DATE)");
    await pool.query("CREATE TABLE productos_terminados (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(255) UNIQUE, nombre VARCHAR(255))");
    await pool.query("INSERT INTO estado_pedidos (modelo, fecha) VALUES ('VIEJO','2020-01-01'), ('HOY', CURDATE())");
    await fn(pool);
    return true;
  } finally {
    await pool.end();
  }
}
const codigos = async (pool) => (await pool.query("SELECT codigo FROM productos_terminados ORDER BY codigo"))[0].map((r) => r.codigo);

test("auto-crear PT: solo desde pedidos de hoy en adelante, no hacia atrás", async () => {
  const corrio = await conBase(async (pool) => {
    await asegurarPTDesdePedidos(pool);
    assert.deepEqual(await codigos(pool), ["HOY"]); // VIEJO (2020) no se crea
    // quedó guardada la fecha de corte
    const [[r]] = await pool.query("SELECT valor FROM reglas WHERE clave = 'pt_autocrear_desde'");
    assert.ok(r && r.valor, "se guardó pt_autocrear_desde");
  });
  if (!corrio) console.log("  (saltado: sin MariaDB)");
});

test("auto-crear PT: un PT viejo borrado a mano no vuelve", async () => {
  const corrio = await conBase(async (pool) => {
    await asegurarPTDesdePedidos(pool);
    // alguien crea y borra el PT VIEJO a mano
    await pool.query("INSERT INTO productos_terminados (codigo, nombre) VALUES ('VIEJO','Viejo')");
    await pool.query("DELETE FROM productos_terminados WHERE codigo = 'VIEJO'");
    await asegurarPTDesdePedidos(pool); // recarga
    assert.deepEqual(await codigos(pool), ["HOY"]); // VIEJO no reaparece
  });
  if (!corrio) console.log("  (saltado: sin MariaDB)");
});

test("auto-crear PT: un modelo de hoy sí se vuelve a crear", async () => {
  const corrio = await conBase(async (pool) => {
    await asegurarPTDesdePedidos(pool);
    await pool.query("DELETE FROM productos_terminados WHERE codigo = 'HOY'");
    await asegurarPTDesdePedidos(pool);
    assert.deepEqual(await codigos(pool), ["HOY"]); // vuelve porque su pedido es de hoy
  });
  if (!corrio) console.log("  (saltado: sin MariaDB)");
});
