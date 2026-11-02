const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const S = require("../sugerenciasCompra");
const { asegurarTablasNotificaciones, crearNotificacion } = require("../notificaciones");
const G = require("../comprasGestion");

test("validarSugerencia: pide materia de la lista, cantidad > 0 y urgencia 1 a 5", () => {
  assert.deepEqual(S.validarSugerencia({ materia_prima_id: "4", cantidad: "12,5", urgencia: 4, motivo: " se acaba " }).valores, { materia_prima_id: 4, cantidad: 12.5, urgencia: 4, motivo: "se acaba" });
  assert.match(S.validarSugerencia({ cantidad: 1, urgencia: 3 }).error, /materia prima/);
  assert.match(S.validarSugerencia({ materia_prima_id: 1, cantidad: 0, urgencia: 3 }).error, /cantidad/);
  assert.match(S.validarSugerencia({ materia_prima_id: 1, cantidad: 5, urgencia: 6 }).error, /1 al 5/);
  assert.match(S.validarSugerencia({ materia_prima_id: 1, cantidad: 5 }).error, /1 al 5/);
});

const TABLAS = ["sugerencias_compra_eventos", "sugerencias_compra", "notificaciones_leidas", "notificaciones", "solicitudes_compra_eliminadas", "solicitudes_compra_items", "solicitudes_compra", "permisos_roles", "usuarios", "materias_primas"];

async function conBase(fn) {
  let mysql;
  try { mysql = require("mysql2/promise"); } catch { return; }
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  let servidor;
  try {
    for (const t of TABLAS) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await pool.query("CREATE TABLE materias_primas (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(255), nombre VARCHAR(255), unidad_medida VARCHAR(50), stock_actual DOUBLE DEFAULT 0, stock_minimo DOUBLE DEFAULT 0)");
    await pool.query("CREATE TABLE usuarios (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100), rol VARCHAR(40))");
    await pool.query("CREATE TABLE permisos_roles (rol_nombre VARCHAR(40), modulo_id VARCHAR(80))");
    await pool.query("CREATE TABLE solicitudes_compra (id INT AUTO_INCREMENT PRIMARY KEY, fecha DATE NULL, estado VARCHAR(20) DEFAULT 'ABIERTA', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
    await pool.query("CREATE TABLE solicitudes_compra_items (id INT AUTO_INCREMENT PRIMARY KEY, solicitud_id INT NOT NULL, articulo VARCHAR(255), proveedor VARCHAR(255), cantidad_solicitada DECIMAL(14,3) DEFAULT 0, cantidad_recibida DECIMAL(14,3) DEFAULT 0, prioridad INT DEFAULT 3, numero_oc VARCHAR(50) NULL, materia_prima_id INT NULL)");
    await G.asegurarColumnasGestion(pool);
    await asegurarTablasNotificaciones(pool);
    await S.asegurarTablasSugerencias(pool);
    await pool.query("INSERT INTO materias_primas (codigo, nombre, unidad_medida, stock_actual) VALUES ('PEAD','Polietileno alta densidad','KILOS',50),('TAPA','Tapa pasacable','UNIDADES',10)");
    await pool.query("INSERT INTO usuarios (nombre, rol) VALUES ('Ana Depósito','DEPOSITO'),('Pablo Planta','PRODUCCION'),('Andrés','ADMIN'),('Lucía Compras','COMPRAS')");
    await pool.query("INSERT INTO permisos_roles (rol_nombre, modulo_id) VALUES ('DEPOSITO','sugerencias-compra'),('PRODUCCION','sugerencias-compra'),('COMPRAS','sugerencias-compra'),('COMPRAS','solicitudes-compra')");
    const permiso = (modulo) => async (req, res, next) => {
      const [[u]] = await pool.query("SELECT rol FROM usuarios WHERE id = ?", [req.user?.id]);
      if (u?.rol === "ADMIN") return next();
      const [p] = await pool.query("SELECT 1 FROM permisos_roles WHERE rol_nombre = ? AND modulo_id = ?", [u?.rol, modulo]);
      return p.length ? next() : res.status(403).json({ error: "Tu rol no tiene acceso a este módulo." });
    };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: Number(req.headers["x-uid"]) }; next(); });
    S.registrarRutasSugerencias(app, { db: pool, requirePermiso: permiso, nombreDeUsuario: async () => "x", crearNotificacion });
    servidor = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
    const base = `http://127.0.0.1:${servidor.address().port}`;
    const ids = { dep: 1, plan: 2, admin: 3, compras: 4 };
    const http = async (uid, metodo, ruta, body) => {
      const r = await fetch(base + ruta, { method: metodo, headers: { "content-type": "application/json", "x-uid": String(uid) }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, body: await r.json() };
    };
    await fn({ pool, http, ids });
  } finally {
    if (servidor) await new Promise((r) => servidor.close(r));
    for (const t of TABLAS) await pool.query(`DROP TABLE IF EXISTS ${t}`).catch(() => {});
    await pool.end();
  }
}

test("depósito sugiere: queda pendiente, avisa por la campanita y deja auditoría", () => conBase(async ({ pool, http, ids }) => {
  const r = await http(ids.dep, "POST", "/api/sugerencias-compra", { materia_prima_id: 1, cantidad: 500, urgencia: 5, motivo: "Queda para 2 días" });
  assert.equal(r.status, 200);
  const l = await http(ids.plan, "GET", "/api/sugerencias-compra");
  assert.equal(l.body.sugerencias.length, 1);
  assert.equal(l.body.sugerencias[0].sugerida_por, "Ana Depósito");
  assert.equal(l.body.puede_gestionar, false);
  const [n] = await pool.query("SELECT * FROM notificaciones WHERE tipo = 'SUGERENCIA_COMPRA'");
  assert.equal(n.length, 1);
  assert.match(n[0].titulo, /Depósito sugiere comprar: Polietileno/);
  assert.equal(n[0].ruta, "/sugerencias-compra");
  assert.ok(n[0].roles.split(",").includes("ADMIN") && n[0].roles.split(",").includes("COMPRAS"));
  const a = await http(ids.dep, "GET", `/api/sugerencias-compra/${r.body.id}/auditoria`);
  assert.deepEqual(a.body.map((e) => e.tipo), ["SUGERIDA"]);
  assert.equal(a.body[0].usuario, "Ana Depósito");
}));

test("solo se elige de las materias primas y se valida lo que llega", () => conBase(async ({ http, ids }) => {
  assert.equal((await http(ids.dep, "POST", "/api/sugerencias-compra", { materia_prima_id: 999, cantidad: 5, urgencia: 3 })).status, 404);
  assert.equal((await http(ids.dep, "POST", "/api/sugerencias-compra", { materia_prima_id: 1, cantidad: 5, urgencia: 9 })).status, 400);
  assert.equal((await http(ids.dep, "POST", "/api/sugerencias-compra", { articulo: "algo libre", cantidad: 5, urgencia: 3 })).status, 400);
}));

test("agregar a una solicitud abierta: cantidad cambiada, proveedor asignado y auditoría; quien sugiere no puede gestionar", () => conBase(async ({ pool, http, ids }) => {
  const { body: { id } } = await http(ids.dep, "POST", "/api/sugerencias-compra", { materia_prima_id: 1, cantidad: 500, urgencia: 4 });
  const [s] = await pool.query("INSERT INTO solicitudes_compra (fecha) VALUES ('2026-11-02')");
  assert.equal((await http(ids.dep, "POST", `/api/sugerencias-compra/${id}/agregar`, { solicitud_id: s.insertId })).status, 403);
  const ok = await http(ids.compras, "POST", `/api/sugerencias-compra/${id}/agregar`, { solicitud_id: s.insertId, cantidad: 400, proveedor: "Droquimar" });
  assert.equal(ok.status, 200);
  const [[it]] = await pool.query("SELECT * FROM solicitudes_compra_items WHERE id = ?", [ok.body.item_id]);
  assert.equal(it.articulo, "Polietileno alta densidad");
  assert.equal(it.proveedor, "Droquimar");
  assert.equal(Number(it.cantidad_solicitada), 400);
  assert.equal(Number(it.cantidad_sugerida), 500);
  assert.equal(it.prioridad, 4);
  assert.equal(it.materia_prima_id, 1);
  const [[sg]] = await pool.query("SELECT * FROM sugerencias_compra WHERE id = ?", [id]);
  assert.equal(sg.estado, "AGREGADA");
  assert.equal(sg.solicitud_id, s.insertId);
  assert.equal(sg.resuelta_por, "Lucía Compras");
  const a = await http(ids.admin, "GET", `/api/sugerencias-compra/${id}/auditoria`);
  assert.deepEqual(a.body.map((e) => e.tipo), ["SUGERIDA", "AGREGADA"]);
  assert.equal(a.body[1].detalle.proveedor, "Droquimar");
  assert.equal(a.body[1].detalle.cantidad, 400);
  // ya agregada: no se puede volver a agregar
  assert.equal((await http(ids.admin, "POST", `/api/sugerencias-compra/${id}/agregar`, { solicitud_id: s.insertId })).status, 409);
}));

test("sin cambiar nada toma la cantidad tal cual y el proveedor queda 'A definir'", () => conBase(async ({ pool, http, ids }) => {
  const { body: { id } } = await http(ids.plan, "POST", "/api/sugerencias-compra", { materia_prima_id: 2, cantidad: 420, urgencia: 4 });
  const [s] = await pool.query("INSERT INTO solicitudes_compra (fecha) VALUES ('2026-11-02')");
  const ok = await http(ids.admin, "POST", `/api/sugerencias-compra/${id}/agregar`, { solicitud_id: s.insertId });
  const [[it]] = await pool.query("SELECT * FROM solicitudes_compra_items WHERE id = ?", [ok.body.item_id]);
  assert.equal(Number(it.cantidad_solicitada), 420);
  assert.equal(it.cantidad_sugerida, null);
  assert.equal(it.proveedor, "A definir");
}));

test("aviso: si ya está solicitado y sin recibir, frena hasta confirmar; recibido completo no avisa", () => conBase(async ({ pool, http, ids }) => {
  const [s1] = await pool.query("INSERT INTO solicitudes_compra (fecha) VALUES ('2026-10-30')");
  await pool.query("INSERT INTO solicitudes_compra_items (solicitud_id, articulo, proveedor, cantidad_solicitada, cantidad_recibida, materia_prima_id) VALUES (?, 'Polietileno alta densidad', 'Droquimar', 1000, 200, 1)", [s1.insertId]);
  // renglón sin materia vinculada, reconocido por el nombre
  await pool.query("INSERT INTO solicitudes_compra_items (solicitud_id, articulo, proveedor, cantidad_solicitada, cantidad_recibida) VALUES (?, 'tapa pasacable', 'Plast SA', 100, 0)", [s1.insertId]);
  const [s2] = await pool.query("INSERT INTO solicitudes_compra (fecha) VALUES ('2026-11-02')");
  const { body: { id } } = await http(ids.dep, "POST", "/api/sugerencias-compra", { materia_prima_id: 1, cantidad: 300, urgencia: 3 });
  const m = await http(ids.dep, "GET", "/api/sugerencias-compra/materias");
  assert.equal(m.body.find((x) => x.id === 1).en_curso.length, 1);
  assert.equal(m.body.find((x) => x.id === 2).en_curso.length, 1);
  const frena = await http(ids.admin, "POST", `/api/sugerencias-compra/${id}/agregar`, { solicitud_id: s2.insertId });
  assert.equal(frena.status, 409);
  assert.equal(frena.body.codigo, "YA_SOLICITADO");
  assert.match(frena.body.error, /esperando recepción/);
  assert.deepEqual(frena.body.pedidos.map((p) => [p.solicitud_id, p.proveedor, p.pedida, p.recibida]), [[s1.insertId, "Droquimar", 1000, 200]]);
  const [[nada]] = await pool.query("SELECT COUNT(*) AS n FROM solicitudes_compra_items WHERE solicitud_id = ?", [s2.insertId]);
  assert.equal(Number(nada.n), 0);
  const forzada = await http(ids.admin, "POST", `/api/sugerencias-compra/${id}/agregar`, { solicitud_id: s2.insertId, confirmar_duplicado: true });
  assert.equal(forzada.status, 200);
  const a = await http(ids.admin, "GET", `/api/sugerencias-compra/${id}/auditoria`);
  assert.equal(a.body[1].detalle.ya_solicitado[0].proveedor, "Droquimar");
  // lo recibido completo ya no avisa
  await pool.query("UPDATE solicitudes_compra_items SET cantidad_recibida = cantidad_solicitada WHERE solicitud_id = ?", [s1.insertId]);
  const m2 = await http(ids.dep, "GET", "/api/sugerencias-compra/materias");
  assert.equal(m2.body.find((x) => x.id === 1).en_curso.length, 1); // queda el que se acaba de agregar a s2 (sin recibir)
  assert.equal(m2.body.find((x) => x.id === 2).en_curso.length, 0);
}));

test("solo se agrega a solicitudes abiertas y se puede descartar con auditoría", () => conBase(async ({ pool, http, ids }) => {
  const { body: { id } } = await http(ids.dep, "POST", "/api/sugerencias-compra", { materia_prima_id: 1, cantidad: 10, urgencia: 1 });
  const [c] = await pool.query("INSERT INTO solicitudes_compra (fecha, estado) VALUES ('2026-11-02', 'COMPLETADA')");
  assert.equal((await http(ids.admin, "POST", `/api/sugerencias-compra/${id}/agregar`, { solicitud_id: c.insertId })).status, 409);
  assert.equal((await http(ids.plan, "POST", `/api/sugerencias-compra/${id}/descartar`, {})).status, 403); // otro encargado, sin gestión
  const d = await http(ids.dep, "POST", `/api/sugerencias-compra/${id}/descartar`, { motivo: "Me equivoqué" });
  assert.equal(d.status, 200);
  const a = await http(ids.dep, "GET", `/api/sugerencias-compra/${id}/auditoria`);
  assert.deepEqual(a.body.map((e) => e.tipo), ["SUGERIDA", "DESCARTADA"]);
  assert.equal(a.body[1].detalle.motivo, "Me equivoqué");
  assert.equal((await http(ids.dep, "POST", `/api/sugerencias-compra/${id}/descartar`, {})).status, 409);
}));

test("Vera ve las sugerencias pendientes, con lo ya pedido sin recibir", () => conBase(async ({ pool, http, ids }) => {
  const [s1] = await pool.query("INSERT INTO solicitudes_compra (fecha) VALUES ('2026-10-30')");
  await pool.query("INSERT INTO solicitudes_compra_items (solicitud_id, articulo, proveedor, cantidad_solicitada, materia_prima_id) VALUES (?, 'Tapa pasacable', 'Plast SA', 100, 2)", [s1.insertId]);
  await http(ids.dep, "POST", "/api/sugerencias-compra", { materia_prima_id: 1, cantidad: 50, urgencia: 2 });
  await http(ids.plan, "POST", "/api/sugerencias-compra", { materia_prima_id: 2, cantidad: 420, urgencia: 5 });
  const v = await S.pendientesParaVera(pool);
  assert.deepEqual(v.map((x) => [x.codigo, x.urgencia]), [["TAPA", 5], ["PEAD", 2]]);
  assert.equal(v[0].area, "PRODUCCION");
  assert.equal(v[0].ya_solicitado_sin_recibir[0].proveedor, "Plast SA");
  assert.equal(v[1].ya_solicitado_sin_recibir.length, 0);
}));

test("sin permiso del módulo no se puede ni ver", () => conBase(async ({ pool, http }) => {
  await pool.query("INSERT INTO usuarios (nombre, rol) VALUES ('Visita','COMERCIAL')");
  assert.equal((await http(5, "GET", "/api/sugerencias-compra")).status, 403);
  assert.equal((await http(5, "POST", "/api/sugerencias-compra", { materia_prima_id: 1, cantidad: 5, urgencia: 3 })).status, 403);
}));
