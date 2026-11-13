const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const L = require("../proyectosLogica");
const P = require("../proyectos");
const { asegurarTablasNotificaciones, crearNotificacion } = require("../notificaciones");

test("código correlativo por año", () => {
  assert.equal(L.siguienteCodigo(null, 2026), "PP-2026-001");
  assert.equal(L.siguienteCodigo("PP-2026-041", 2026), "PP-2026-042");
  assert.equal(L.siguienteCodigo("PP-2025-009", 2026), "PP-2026-001");
});

test("salud: olvidado si está abierto y sin novedades hace 14 días; paso vencido; las ideas y pausados no se olvidan", () => {
  const hoy = new Date("2026-11-13T12:00:00");
  const s = L.salud({ estado: "EN_CURSO", ultimo_movimiento: "2026-10-20 09:00:00", proximo_paso: "Llamar al proveedor", proximo_paso_fecha: "2026-11-10" }, hoy);
  assert.deepEqual([s.olvidado, s.paso_vencido, s.dias_sin_novedad], [true, true, 24]);
  assert.equal(L.salud({ estado: "ESPERANDO", ultimo_movimiento: "2026-11-05 09:00:00" }, hoy).olvidado, false);
  assert.equal(L.salud({ estado: "PAUSADO", ultimo_movimiento: "2026-01-01" }, hoy).olvidado, false);
  assert.equal(L.salud({ estado: "LOGRADO", ultimo_movimiento: "2026-01-01" }, hoy).olvidado, false);
  assert.equal(L.salud({ estado: "EN_CURSO", ultimo_movimiento: "2026-11-12" }, hoy).sin_proximo_paso, true);
});

test("limpiarSugerencia: estados y pruebas válidos, sin inventar", () => {
  const s = L.limpiarSugerencia({ novedad: "Se probó", estado: "esperando", proximo_paso: "Esperar respuesta", proximo_paso_fecha: "2026-11-20", pruebas: [{ que: "Adherencia", estado: "rechazada", motivo: "Se descascara" }, { que: "" }, { que: "Brillo", estado: "quizás" }] });
  assert.equal(s.estado, "ESPERANDO");
  assert.deepEqual(s.pruebas.map((x) => [x.que, x.estado, x.motivo]), [["Adherencia", "RECHAZADA", "Se descascara"], ["Brillo", "PENDIENTE", ""]]);
  assert.equal(L.limpiarSugerencia({ estado: "VOLANDO", proximo_paso_fecha: "mañana" }).estado, null);
  assert.equal(L.limpiarSugerencia({ proximo_paso_fecha: "mañana" }).proximo_paso_fecha, null);
});

// ---------------------------------------------------------------- recorrido contra MariaDB

const TABLAS = ["pp_archivos", "pp_eventos", "pp_pruebas", "pp_interesados", "pp_proyectos", "notificaciones_leidas", "notificaciones", "permisos_roles", "usuarios"];

async function conBase(fn) {
  let mysql;
  try { mysql = require("mysql2/promise"); } catch { return; }
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  let servidor;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pp-"));
  try {
    for (const t of TABLAS) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await pool.query("CREATE TABLE usuarios (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100), rol VARCHAR(40))");
    await pool.query("CREATE TABLE permisos_roles (rol_nombre VARCHAR(40), modulo_id VARCHAR(80))");
    await asegurarTablasNotificaciones(pool);
    await P.asegurarTablasProyectos(pool);
    await pool.query("INSERT INTO usuarios (nombre, rol) VALUES ('Andrés','PRODUCCION'),('Martín','COMPRAS'),('Sin acceso','DEPOSITO')");
    await pool.query("INSERT INTO permisos_roles VALUES ('PRODUCCION','proyectos'),('COMPRAS','proyectos')");
    const permiso = (m) => async (req, res, next) => {
      const [[u]] = await pool.query("SELECT rol FROM usuarios WHERE id = ?", [req.user?.id]);
      const [p] = await pool.query("SELECT 1 FROM permisos_roles WHERE rol_nombre = ? AND modulo_id = ?", [u?.rol, m]);
      return p.length ? next() : res.status(403).json({ error: "Sin acceso" });
    };
    const ia = {
      models: {
        generateContent: async ({ contents }) => ({
          text: /perdió el rastro/.test(contents)
            ? JSON.stringify({ en_que_quedo: "Se probó la pintura y se rechazó por adherencia.", sugerencia: "Pedir otra muestra." })
            : JSON.stringify({ novedad: "Probamos la pintura en 20 conos: se descascara al doblar.", resumen: "Pintura rechazada", estado: "ESPERANDO", proximo_paso: "Pedir otra muestra al proveedor", proximo_paso_fecha: "2026-11-20", pruebas: [{ que: "Adherencia al doblar", pieza: "Cono 2071 naranja", estado: "RECHAZADA", motivo: "Se descascara" }] }),
        }),
      },
    };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: Number(req.headers["x-uid"]) }; next(); });
    P.registrarRutasProyectos(app, { db: pool, requirePermiso: permiso, crearNotificacion, ai: ia, multer: require("multer"), dir });
    servidor = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
    const base = `http://127.0.0.1:${servidor.address().port}`;
    const http = async (uid, metodo, ruta, body) => {
      const esForm = body instanceof FormData;
      const r = await fetch(base + ruta, { method: metodo, headers: esForm ? { "x-uid": String(uid) } : { "content-type": "application/json", "x-uid": String(uid) }, body: esForm ? body : body ? JSON.stringify(body) : undefined });
      const tipo = r.headers.get("content-type") || "";
      return { status: r.status, body: tipo.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
    };
    await fn({ pool, http });
  } finally {
    if (servidor) await new Promise((r) => servidor.close(r));
    for (const t of TABLAS) await pool.query(`DROP TABLE IF EXISTS ${t}`).catch(() => {});
    await pool.end();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("recorrido: prueba de pintura con Compras esperando, fotos, rechazo con motivo, IA y olvidados", () => conBase(async ({ pool, http }) => {
  const A = 1, M = 2;
  assert.equal((await http(3, "GET", "/api/proyectos")).status, 403);
  const c = await http(A, "POST", "/api/proyectos", { tipo: "PRUEBA", titulo: "Pintura nueva de Pinturerías Sur", proveedor: "Pinturerías Sur", interesados: [M], proximo_paso: "Pintar 20 conos de prueba" });
  assert.match(c.body.codigo, /^PP-\d{4}-001$/);
  const id = c.body.id;
  let n = (await pool.query("SELECT roles FROM notificaciones"))[0];
  assert.deepEqual(n.map((x) => x.roles), ["COMPRAS"]); // Martín se entera de que lo sumaron

  // Prueba con foto; Martín (Compras) ve la miniatura.
  const pr = await http(A, "POST", `/api/proyectos/${id}/pruebas`, { que: "Adherencia al doblar", pieza: "Cono 2071 naranja", metodo: "Doblar 90° 10 veces" });
  const png = await require("sharp")({ create: { width: 400, height: 300, channels: 3, background: "#ff5a00" } }).png().toBuffer();
  const fd = new FormData();
  fd.append("prueba_id", String(pr.body.id));
  fd.append("archivos", new Blob([png], { type: "image/png" }), "cono doblado.png");
  const up = await http(A, "POST", `/api/proyectos/${id}/archivos`, fd);
  assert.equal(up.status, 200);
  assert.equal((await http(M, "GET", `/api/proyectos/archivos/${up.body.archivos[0].id}/miniatura`)).status, 200);

  // Rechazar exige motivo; aprobar puede cargarse a nombre de otro (queda quién lo cargó). Compras recibe el aviso.
  assert.equal((await http(A, "POST", `/api/proyectos/pruebas/${pr.body.id}/decidir`, { decision: "RECHAZADA" })).status, 400);
  assert.equal((await http(A, "POST", `/api/proyectos/pruebas/${pr.body.id}/decidir`, { decision: "RECHAZADA", motivo: "Se descascara al doblar", nombre: "Ing. Rigoni" })).status, 200);
  let p = (await http(M, "GET", `/api/proyectos/${id}`)).body;
  const prueba = p.pruebas[0];
  assert.deepEqual([prueba.estado, prueba.decidido_por, prueba.decision_cargada_por, prueba.motivo, prueba.archivos.length], ["RECHAZADA", "Ing. Rigoni", "Andrés", "Se descascara al doblar", 1]);
  assert.equal(p.portada_id, up.body.archivos[0].id);
  n = (await pool.query("SELECT titulo, roles FROM notificaciones ORDER BY id DESC LIMIT 1"))[0][0];
  assert.match(n.titulo, /Prueba rechazada/);
  assert.equal(n.roles, "COMPRAS");

  // Comentario sobre la prueba (Martín) y próximo paso con fecha.
  assert.equal((await http(M, "POST", `/api/proyectos/${id}/novedades`, { texto: "Necesito el resultado antes del viernes", prueba_id: pr.body.id })).status, 200);
  await http(A, "PUT", `/api/proyectos/${id}`, { proximo_paso: "Pedir otra muestra", proximo_paso_fecha: "2026-11-20", proximo_paso_quien: "Martín" });
  p = (await http(A, "GET", `/api/proyectos/${id}`)).body;
  assert.equal(p.pruebas[0].comentarios[0].texto, "Necesito el resultado antes del viernes");
  assert.deepEqual([p.proximo_paso, p.proximo_paso_fecha, p.proximo_paso_quien], ["Pedir otra muestra", "2026-11-20", "Martín"]);
  assert.match(p.eventos[0].texto, /Próximo paso: Pedir otra muestra \(Martín\), para el 20\/11\/2026/);
  // Mismo paso otra vez: no ensucia la historia.
  const antes = p.eventos.length;
  await http(A, "PUT", `/api/proyectos/${id}`, { proximo_paso: "Pedir otra muestra", proximo_paso_fecha: "2026-11-20" });
  assert.equal((await http(A, "GET", `/api/proyectos/${id}`)).body.eventos.length, antes);

  // Asistente: propone y se aplica (novedad + prueba decidida + estado + próximo paso).
  const s = await http(A, "POST", `/api/proyectos/${id}/asistente`, { texto: "probamos la pintura en 20 conos, se descascara" });
  assert.equal(s.body.estado, "ESPERANDO");
  assert.equal((await http(A, "POST", `/api/proyectos/${id}/asistente/aplicar`, s.body)).status, 200);
  p = (await http(A, "GET", `/api/proyectos/${id}`)).body;
  assert.equal(p.estado, "ESPERANDO");
  assert.deepEqual([p.resumen_pruebas.rechazadas, p.resumen_pruebas.total], [2, 2]);
  assert.equal((await http(A, "POST", `/api/proyectos/${id}/resumen-ia`)).body.en_que_quedo, "Se probó la pintura y se rechazó por adherencia.");

  // Olvidados: la máquina embaladora sin novedades hace un mes aparece marcada en la lista.
  const e = await http(A, "POST", "/api/proyectos", { tipo: "MAQUINA", titulo: "Embaladora", proveedor: "Maquinarias del Sur" });
  await pool.query("UPDATE pp_proyectos SET ultimo_movimiento = DATE_SUB(NOW(), INTERVAL 30 DAY) WHERE id = ?", [e.body.id]);
  const lista = (await http(A, "GET", "/api/proyectos")).body.proyectos;
  const emb = lista.find((x) => x.id === e.body.id);
  assert.deepEqual([emb.salud.olvidado, emb.salud.dias_sin_novedad >= 30], [true, true]);
  assert.equal(lista.find((x) => x.id === id).ultima_novedad.tipo, "PASO");

  // Cerrar con resultado avisa y queda en la historia.
  await http(A, "PUT", `/api/proyectos/${id}`, { estado: "DESCARTADO", resultado: "No sirve para PVC flexible" });
  p = (await http(A, "GET", `/api/proyectos/${id}`)).body;
  assert.match(p.eventos[0].texto, /Pasó a «Descartado»: No sirve para PVC flexible/);
  assert.equal(p.salud.abierto, false);
}));
