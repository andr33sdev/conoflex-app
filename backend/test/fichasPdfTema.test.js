"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { normalizarTema } = require("../tema");
const F = require("../comercial/fichasPdf");

test("tema: solo oscuro o claro", () => {
  assert.strictEqual(normalizarTema("Claro"), "claro");
  assert.strictEqual(normalizarTema("oscuro"), "oscuro");
  assert.strictEqual(normalizarTema("azul"), null);
  assert.strictEqual(normalizarTema(undefined), null);
});

// Con base real (si hay credenciales de prueba): guarda un PDF con los productos que afectó y los lista.
test("fichas PDF: guarda el archivo y qué productos afectó", async (t) => {
  let mysql;
  try { mysql = require("mysql2/promise"); } catch { return; }
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  try {
    await pool.query("DROP TABLE IF EXISTS fichas_pdf_productos");
    await pool.query("DROP TABLE IF EXISTS fichas_pdf");
    await pool.query("DROP TABLE IF EXISTS productos");
    await pool.query("CREATE TABLE productos (id INT PRIMARY KEY, codigo VARCHAR(50), nombre VARCHAR(200), ficha_origen VARCHAR(200) NULL)");
    await pool.query("INSERT INTO productos (id, codigo, nombre) VALUES (90001, 'C-1', 'Cono uno')");
    const p = { insertId: 90001 };
    await F.asegurarTablasFichasPdf(pool);
    const buf = Buffer.from("%PDF-1.4 prueba");
    const id = await F.guardarFicha(pool, { nombre: "usos.pdf", buffer: buf, categoria: "Conos", usuario: "Andrés", afectados: [{ producto_id: p.insertId, codigo: "C-1", accion: "ACTUALIZADO" }, { producto_id: null, codigo: "ZZ", accion: "OMITIDO" }] });
    await F.guardarFicha(pool, { nombre: "roto.pdf", buffer: buf, leido: false });
    const lista = await F.listarFichas(pool);
    assert.strictEqual(lista.length, 2);
    const f = lista.find((x) => x.id === id);
    assert.strictEqual(f.actualizados, 1);
    assert.strictEqual(f.omitidos, 1);
    assert.strictEqual(f.productos[0].nombre, "Cono uno");
    assert.strictEqual(lista.find((x) => x.nombre === "roto.pdf").leido, 0);
  } finally {
    await pool.query("DROP TABLE IF EXISTS productos").catch(() => {});
    await pool.query("DROP TABLE IF EXISTS fichas_pdf_productos").catch(() => {});
    await pool.query("DROP TABLE IF EXISTS fichas_pdf").catch(() => {});
    await pool.end();
  }
});
