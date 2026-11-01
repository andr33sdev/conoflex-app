"use strict";
const test = require("node:test");
const assert = require("node:assert");
const G = require("../comprasGestion");
const L = require("../agentes/listaCompra");

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
    for (const t of ["solicitudes_compra_eliminadas", "agentes_compras_listas", "solicitudes_compra_items", "solicitudes_compra"]) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await pool.query("CREATE TABLE solicitudes_compra (id INT AUTO_INCREMENT PRIMARY KEY, fecha DATE NULL, estado VARCHAR(20) DEFAULT 'ABIERTA', firma_jefe VARCHAR(100) NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
    await pool.query("CREATE TABLE solicitudes_compra_items (id INT AUTO_INCREMENT PRIMARY KEY, solicitud_id INT NOT NULL, articulo VARCHAR(255), proveedor VARCHAR(255), cantidad_solicitada DECIMAL(14,3) DEFAULT 0, cantidad_recibida DECIMAL(14,3) DEFAULT 0, prioridad INT DEFAULT 3, numero_oc VARCHAR(50) NULL, materia_prima_id INT NULL)");
    await L.asegurarTablaListas(pool);
    await G.asegurarColumnasGestion(pool);
    await fn(pool);
  } finally {
    for (const t of ["solicitudes_compra_eliminadas", "agentes_compras_listas", "solicitudes_compra_items", "solicitudes_compra"]) await pool.query(`DROP TABLE IF EXISTS ${t}`).catch(() => {});
    await pool.end();
  }
}
const nueva = async (db, items) => {
  const [s] = await db.query("INSERT INTO solicitudes_compra (fecha) VALUES ('2026-11-01')");
  const ids = [];
  for (const [a, p, c, r] of items) ids.push((await db.query("INSERT INTO solicitudes_compra_items (solicitud_id, articulo, proveedor, cantidad_solicitada, cantidad_recibida) VALUES (?,?,?,?,?)", [s.insertId, a, p, c, r || 0]))[0].insertId);
  return { id: s.insertId, ids };
};

test("corregir lo pedido: cambia proveedor y cantidad, guarda lo sugerido y lo informa", () => conBase(async (db) => {
  const s = await nueva(db, [["Eva", "Mundileno", 100]]);
  const r = await G.corregirPedido(db, { itemId: s.ids[0], proveedor: "Droquimar", cantidad: 250 });
  assert.ok(r.ok);
  const [[it]] = await db.query("SELECT * FROM solicitudes_compra_items WHERE id = ?", [s.ids[0]]);
  assert.strictEqual(it.proveedor, "Droquimar");
  assert.strictEqual(Number(it.cantidad_solicitada), 250);
  assert.strictEqual(it.proveedor_sugerido, "Mundileno");
  assert.strictEqual(Number(it.cantidad_sugerida), 100);
  // Una segunda corrección no pisa lo sugerido originalmente.
  await G.corregirPedido(db, { itemId: s.ids[0], proveedor: "Otro SA" });
  const [[it2]] = await db.query("SELECT * FROM solicitudes_compra_items WHERE id = ?", [s.ids[0]]);
  assert.strictEqual(it2.proveedor_sugerido, "Mundileno");
  assert.strictEqual(it2.proveedor, "Otro SA");
}));

test("corregir: no deja bajar la cantidad por debajo de lo recibido y recalcula el estado", () => conBase(async (db) => {
  const s = await nueva(db, [["Eva", "A", 100, 60], ["PE", "B", 10, 10]]);
  const mal = await G.corregirPedido(db, { itemId: s.ids[0], cantidad: 50 });
  assert.strictEqual(mal.status, 409);
  assert.strictEqual((await G.corregirPedido(db, { itemId: s.ids[0], cantidad: 0 })).status, 400);
  await G.corregirPedido(db, { itemId: s.ids[0], cantidad: 60 }); // ahora queda todo recibido
  assert.strictEqual((await db.query("SELECT estado FROM solicitudes_compra WHERE id = ?", [s.id]))[0][0].estado, "COMPLETADA");
  await G.corregirPedido(db, { itemId: s.ids[0], cantidad: 80 }); // vuelve a faltar
  assert.strictEqual((await db.query("SELECT estado FROM solicitudes_compra WHERE id = ?", [s.id]))[0][0].estado, "ABIERTA");
}));

test("eliminar una solicitud: borra renglones y deja copia; con mercadería recibida pide confirmación", () => conBase(async (db) => {
  const a = await nueva(db, [["Eva", "A", 100], ["PE", "B", 10]]);
  const r = await G.eliminarSolicitud(db, { id: a.id, usuario: "Andrés" });
  assert.ok(r.ok);
  assert.strictEqual((await db.query("SELECT COUNT(*) n FROM solicitudes_compra WHERE id = ?", [a.id]))[0][0].n, 0);
  assert.strictEqual((await db.query("SELECT COUNT(*) n FROM solicitudes_compra_items WHERE solicitud_id = ?", [a.id]))[0][0].n, 0);
  const [[copia]] = await db.query("SELECT * FROM solicitudes_compra_eliminadas WHERE solicitud_id = ?", [a.id]);
  assert.strictEqual(copia.eliminado_por, "Andrés");
  assert.strictEqual(JSON.parse(copia.datos).items.length, 2);

  const b = await nueva(db, [["Eva", "A", 100, 40]]);
  const pide = await G.eliminarSolicitud(db, { id: b.id });
  assert.strictEqual(pide.requiereConfirmacion, true);
  assert.strictEqual((await db.query("SELECT COUNT(*) n FROM solicitudes_compra WHERE id = ?", [b.id]))[0][0].n, 1);
  assert.ok((await G.eliminarSolicitud(db, { id: b.id, forzar: true })).ok);
  assert.strictEqual((await G.eliminarSolicitud(db, { id: 999999 })).status, 404);
}));

test("Vera: eliminar la lista en armado la deja sin ninguna", () => conBase(async (db) => {
  const s = await nueva(db, [["Eva", "A", 100]]);
  await db.query("INSERT INTO agentes_compras_listas (usuario_id, solicitud_id) VALUES (7, ?)", [s.id]);
  assert.strictEqual((await L.leerLista(db, 7)).abierta, true);
  const r = await L.eliminarLista(db, { id: 7, nombre: "Andrés" }, { eliminarSolicitud: G.eliminarSolicitud });
  assert.ok(r.ok);
  assert.strictEqual((await L.leerLista(db, 7)).abierta, false);
  assert.strictEqual((await L.eliminarLista(db, { id: 7 }, { eliminarSolicitud: G.eliminarSolicitud })).error, "No hay una lista de compra en armado.");
}));
