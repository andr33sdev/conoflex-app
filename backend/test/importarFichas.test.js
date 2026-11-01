"use strict";
const test = require("node:test");
const assert = require("node:assert");
const F = require("../comercial/fichasPdf");
const I = require("../comercial/importarFichas");

// Necesita base real (si no hay credenciales de prueba, se saltea sola).
async function conBase(fn) {
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
    await pool.query("CREATE TABLE IF NOT EXISTS productos (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(50), nombre VARCHAR(200))");
    await pool.query("CREATE TABLE IF NOT EXISTS categorias_pdf (nombre VARCHAR(100) PRIMARY KEY, pdf_filename VARCHAR(255), total_productos INT)");
    const [cols] = await pool.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'productos'");
    const hay = new Set(cols.map((c) => c.COLUMN_NAME));
    for (const [c, t] of [["descripcion", "TEXT"], ["aplicacion", "TEXT"], ["usos_recomendados", "TEXT"], ["advertencias", "TEXT"], ["medidas", "TEXT"], ["categoria", "VARCHAR(100)"], ["ficha_editada", "TINYINT(1) NOT NULL DEFAULT 0"], ["ficha_origen", "VARCHAR(200) NULL"], ["ficha_actualizada", "DATETIME NULL"]]) {
      if (!hay.has(c)) await pool.query(`ALTER TABLE productos ADD COLUMN ${c} ${t}`);
    }
    await F.asegurarTablasFichasPdf(pool);
    await pool.query("DELETE FROM productos WHERE codigo LIKE 'ZT-%'");
    await fn(pool);
  } finally {
    await pool.query("DELETE FROM productos WHERE codigo LIKE 'ZT-%'").catch(() => {});
    await pool.query("DROP TABLE IF EXISTS fichas_pdf_productos").catch(() => {});
    await pool.query("DROP TABLE IF EXISTS fichas_pdf").catch(() => {});
    await pool.end();
  }
}
const pdf = (nombre, productos) => ({ nombre, buffer: Buffer.from("%PDF-1.4 " + nombre), productos });
const prod = (codigo, d) => ({ codigo, nombre: "Prod " + codigo, descripcion: d, usos: "Uso A: " + d, advertencias: "", medidas: "" });
const leer = async (db, codigo) => (await db.query("SELECT * FROM productos WHERE codigo = ?", [codigo]))[0][0];

test("PDF nuevo sobre un producto ya cargado por otro PDF: avisa y solo reemplaza lo aceptado", () => conBase(async (db) => {
  await I.aplicar({ db, archivos: [pdf("A.pdf", [prod("ZT-1", "desc A1"), prod("ZT-2", "desc A2")])], categoria: "Conos" });
  const b = [pdf("B.pdf", [prod("ZT-1", "desc B1"), prod("ZT-2", "desc B2"), prod("ZT-3", "desc B3")])];
  const conf = await I.buscarConflictos({ db, archivos: b });
  assert.deepStrictEqual(conf.map((c) => c.codigo).sort(), ["ZT-1", "ZT-2"]);
  assert.strictEqual(conf[0].anterior.pdf, "A.pdf");
  assert.match(conf[0].anterior.fecha, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  const id1 = (await leer(db, "ZT-1")).id;
  const r = await I.aplicar({ db, archivos: b, categoria: "Conos", reemplazar: new Set([id1]) });
  assert.strictEqual((await leer(db, "ZT-1")).descripcion, "desc B1");
  assert.strictEqual((await leer(db, "ZT-2")).descripcion, "desc A2"); // se conservó
  assert.strictEqual((await leer(db, "ZT-3")).descripcion, "desc B3"); // nuevo
  assert.strictEqual(r.conservados.length, 1);
}));

test("las fichas corregidas a mano no entran en conflicto ni se pisan", () => conBase(async (db) => {
  await I.aplicar({ db, archivos: [pdf("A.pdf", [prod("ZT-1", "desc A")])], categoria: "Conos" });
  await db.query("UPDATE productos SET ficha_editada = 1, descripcion = 'a mano' WHERE codigo = 'ZT-1'");
  assert.strictEqual((await I.buscarConflictos({ db, archivos: [pdf("B.pdf", [prod("ZT-1", "desc B")])] })).length, 0);
  await I.aplicar({ db, archivos: [pdf("B.pdf", [prod("ZT-1", "desc B")])], categoria: "Conos" });
  assert.strictEqual((await leer(db, "ZT-1")).descripcion, "a mano");
}));

test("eliminar un PDF borra usos y descripciones que había puesto; si pisó a otro PDF, vuelve a lo anterior", () => conBase(async (db) => {
  await I.aplicar({ db, archivos: [pdf("A.pdf", [prod("ZT-1", "desc A1")])], categoria: "Conos" });
  await I.aplicar({ db, archivos: [pdf("B.pdf", [prod("ZT-1", "desc B1"), prod("ZT-9", "desc B9")])], categoria: "Conos", reemplazar: new Set([(await leer(db, "ZT-1")).id]) });
  const fichas = await F.listarFichas(db);
  const B = fichas.find((f) => f.nombre === "B.pdf");
  const r = await I.eliminarFicha(db, B.id);
  assert.strictEqual(r.restaurados, 1);
  assert.strictEqual(r.limpiados, 1);
  const p1 = await leer(db, "ZT-1");
  assert.strictEqual(p1.descripcion, "desc A1");
  assert.strictEqual(p1.ficha_origen, "A.pdf");
  const p9 = await leer(db, "ZT-9");
  assert.strictEqual(p9.descripcion, "");
  assert.strictEqual(p9.usos_recomendados, "");
  assert.strictEqual(p9.ficha_origen, null);
  assert.strictEqual((await F.listarFichas(db)).length, 1);
  // Eliminar el último PDF deja el producto sin ficha.
  const A = (await F.listarFichas(db))[0];
  await I.eliminarFicha(db, A.id);
  assert.strictEqual((await leer(db, "ZT-1")).descripcion, "");
}));

test("eliminar no toca productos corregidos a mano ni los que otro PDF ya reemplazó", () => conBase(async (db) => {
  await I.aplicar({ db, archivos: [pdf("A.pdf", [prod("ZT-1", "A1"), prod("ZT-2", "A2")])], categoria: "Conos" });
  await db.query("UPDATE productos SET ficha_editada = 1, descripcion = 'a mano' WHERE codigo = 'ZT-1'");
  await I.aplicar({ db, archivos: [pdf("B.pdf", [prod("ZT-2", "B2")])], categoria: "Conos", reemplazar: new Set([(await leer(db, "ZT-2")).id]) });
  const A = (await F.listarFichas(db)).find((f) => f.nombre === "A.pdf");
  const r = await I.eliminarFicha(db, A.id);
  assert.strictEqual(r.sinTocar.length, 2);
  assert.strictEqual((await leer(db, "ZT-1")).descripcion, "a mano");
  assert.strictEqual((await leer(db, "ZT-2")).descripcion, "B2");
}));
