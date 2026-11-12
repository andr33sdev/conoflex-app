const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const L = require("../desarrolloLogica");
const D = require("../desarrollo");
const { asegurarTablasNotificaciones, crearNotificacion } = require("../notificaciones");

test("código de proyecto correlativo por año", () => {
  assert.equal(L.siguienteCodigo(null, 2026), "DP-2026-001");
  assert.equal(L.siguienteCodigo("DP-2026-009", 2026), "DP-2026-010");
  assert.equal(L.siguienteCodigo("DP-2025-041", 2026), "DP-2026-001");
});

test("progreso: una etapa aprobable cuenta solo aprobada; «no aplica» cuenta; los cambios no cuentan", () => {
  const p = L.progreso("NUEVO", [
    { etapa: "ENTRADAS", estado: "LISTA", aprobacion_estado: "APROBADA" },
    { etapa: "MATRICERO", estado: "NO_APLICA" },
    { etapa: "VERIFICACION", estado: "LISTA", aprobacion_estado: "PEDIDA" },
    { etapa: "CAMBIOS", estado: "LISTA" },
  ]);
  assert.deepEqual([p.cerradas, p.total, p.pct, p.etapa_actual], [2, 5, 40, "VERIFICACION"]);
  assert.equal(L.progreso("MODIFICACION", [{ etapa: "ENTRADAS", estado: "LISTA", aprobacion_estado: "APROBADA" }]).total, 2);
});

test("sumarPuntos agrega viñetas sin repetir", () => {
  assert.equal(L.sumarPuntos("- Peso 1,1 kg\n-", ["peso 1,1 kg", "Espesor 3 mm"]), "- Peso 1,1 kg\n- Espesor 3 mm");
});

test("limpiarSugerencia descarta etapas inexistentes y valores raros", () => {
  const s = L.limpiarSugerencia({ resumen: "ok", etapas: [{ etapa: "verificacion", puntos: ["Espesor 3 mm", ""] }, { etapa: "INVENTADA", puntos: ["x"] }], pruebas: [{ tipo: "otra", que: "Espesor", cumple: "quizas" }, { que: "" }] }, "NUEVO");
  assert.deepEqual(s.etapas, [{ etapa: "VERIFICACION", puntos: ["Espesor 3 mm"] }]);
  assert.deepEqual(s.pruebas.map((x) => [x.tipo, x.que, x.cumple]), [["VERIFICACION", "Espesor", "PENDIENTE"]]);
  // En una modificación no existe la etapa de verificación.
  assert.deepEqual(L.limpiarSugerencia({ etapas: [{ etapa: "VERIFICACION", puntos: ["x"] }] }, "MODIFICACION").etapas, []);
});

test("revisión ISO de un producto nuevo: qué falta y cómo resolverlo", () => {
  const vacia = L.revisionIso({ tipo: "NUEVO", etapas: [], archivos: [], pruebas: [], items: [] });
  assert.equal(vacia.ok, 1); // "ninguna prueba pendiente" se cumple sin pruebas
  assert.equal(vacia.completo, false);
  assert.ok(vacia.items.find((x) => x.id === "oficial").como);
  const ap = (etapa) => ({ etapa, estado: "LISTA", aprobacion_estado: "APROBADA", detalle: "- algo" });
  const lleno = L.revisionIso({
    tipo: "NUEVO",
    etapas: ["ENTRADAS", "VERIFICACION", "VALIDACION", "ESPECIFICACIONES"].map(ap),
    archivos: [{ es_oficial: true }],
    pruebas: [{ tipo: "VERIFICACION", metodo: "Calibre", resultado: "3,1 mm", cumple: "SI" }, { tipo: "VALIDACION", cumple: "NO", accion: "Se reforzó el encastre" }],
    items: [{ tipo: "PT", tiene_receta: true }],
  });
  assert.equal(lleno.completo, true);
  assert.equal(lleno.pct, 100);
});

test("revisión ISO de una modificación: aprobación de Dirección y enterados", () => {
  const r = L.revisionIso({ tipo: "MODIFICACION", etapas: [{ etapa: "ENTRADAS", detalle: "- Cambio de ojo de gato por cinta", estado: "LISTA", aprobacion_estado: "APROBADA" }], avisos: [{ enterado_at: "2026-01-01" }, { enterado_at: null }] });
  assert.deepEqual(r.items.map((x) => x.ok), [true, true, true, false, false]);
});

// ---------------------------------------------------------------- recorrido completo contra MariaDB

const TABLAS = ["dp_avisos", "dp_items", "dp_pruebas", "dp_archivos", "dp_eventos", "dp_etapas", "dp_proyectos", "notificaciones_leidas", "notificaciones", "permisos_roles", "usuarios", "productos_terminados", "semielaborados"];

async function conBase(fn) {
  let mysql;
  try { mysql = require("mysql2/promise"); } catch { return; }
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  let servidor;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dp-"));
  try {
    await pool.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const t of TABLAS) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");
    await pool.query("CREATE TABLE usuarios (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100), rol VARCHAR(40))");
    await pool.query("CREATE TABLE permisos_roles (rol_nombre VARCHAR(40), modulo_id VARCHAR(80))");
    await pool.query("CREATE TABLE productos_terminados (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(255) UNIQUE NOT NULL, nombre VARCHAR(255) NOT NULL)");
    await pool.query("CREATE TABLE semielaborados (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(255) UNIQUE NOT NULL, nombre VARCHAR(255) NOT NULL)");
    await asegurarTablasNotificaciones(pool);
    await D.asegurarTablasDesarrollo(pool);
    await pool.query("INSERT INTO usuarios (nombre, rol) VALUES ('Andrés','PRODUCCION'),('Gonzalo','DIRECCION'),('Fernando','ADMIN'),('Lucía','VENTAS'),('Sin acceso','DEPOSITO')");
    await pool.query("INSERT INTO permisos_roles VALUES ('PRODUCCION','desarrollo'),('DIRECCION','desarrollo'),('VENTAS','desarrollo')");
    const permiso = (modulo) => async (req, res, next) => {
      const [[u]] = await pool.query("SELECT rol FROM usuarios WHERE id = ?", [req.user?.id]);
      if (u?.rol === "ADMIN") return next();
      const [p] = await pool.query("SELECT 1 FROM permisos_roles WHERE rol_nombre = ? AND modulo_id = ?", [u?.rol, modulo]);
      return p.length ? next() : res.status(403).json({ error: "Tu rol no tiene acceso a este módulo." });
    };
    const ia = {
      models: {
        generateContent: async () => ({ text: JSON.stringify({ resumen: "Se midió el espesor", etapas: [{ etapa: "VERIFICACION", puntos: ["Espesor medido 3,1 mm (objetivo 3 mm)"] }], pruebas: [{ tipo: "VERIFICACION", que: "Espesor de pared", metodo: "Calibre", objetivo: "3 mm", resultado: "3,1 mm", cumple: "SI" }] }) }),
      },
    };
    const costosCompletos = async () => ({ productos: [], semielaborados: [] });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: Number(req.headers["x-uid"]) }; next(); });
    D.registrarRutasDesarrollo(app, { db: pool, requirePermiso: permiso, crearNotificacion, ai: ia, multer: require("multer"), costosCompletos, dir });
    servidor = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
    const base = `http://127.0.0.1:${servidor.address().port}`;
    const http = async (uid, metodo, ruta, body) => {
      const esForm = body instanceof FormData;
      const r = await fetch(base + ruta, { method: metodo, headers: esForm ? { "x-uid": String(uid) } : { "content-type": "application/json", "x-uid": String(uid) }, body: esForm ? body : body ? JSON.stringify(body) : undefined });
      const tipo = r.headers.get("content-type") || "";
      return { status: r.status, body: tipo.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) };
    };
    await fn({ pool, http, ids: { andres: 1, gonzalo: 2, fernando: 3, lucia: 4, nadie: 5 }, dir });
  } finally {
    if (servidor) await new Promise((r) => servidor.close(r));
    for (const t of TABLAS) await pool.query(`DROP TABLE IF EXISTS ${t}`).catch(() => {});
    await pool.end();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("recorrido: crear, aprobar con la persona correcta, archivos, pruebas, ítems, asistente y difusión", () => conBase(async ({ pool, http, ids, dir }) => {
  assert.equal((await http(ids.nadie, "GET", "/api/desarrollo/proyectos")).status, 403);

  const c = await http(ids.andres, "POST", "/api/desarrollo/proyectos", { nombre: "Cono Vial 1176 PVC-PE", descripcion: "Alternativa económica con base negra reciclada", punto_partida: "Base del Rutero 1200", origen: "DIRECCION" });
  assert.equal(c.status, 200);
  assert.match(c.body.codigo, /^DP-\d{4}-001$/);
  const id = c.body.id;
  let p = (await http(ids.andres, "GET", `/api/desarrollo/proyectos/${id}`)).body;
  assert.equal(p.etapas.length, 6);
  assert.match(p.etapas[0].detalle, /- Alternativa económica[\s\S]*- Punto de partida: Base del Rutero 1200/);
  assert.equal(p.responsable_nombre, "Andrés");

  // Pedir aprobación a Gonzalo: Lucía no puede aprobar, Gonzalo sí; la notificación le llega a su rol.
  assert.equal((await http(ids.andres, "POST", `/api/desarrollo/proyectos/${id}/etapas/MATRICERO/pedir-aprobacion`, { aprobador_id: ids.gonzalo })).status, 400); // sin detalle
  assert.equal((await http(ids.andres, "POST", `/api/desarrollo/proyectos/${id}/etapas/ENTRADAS/pedir-aprobacion`, { aprobador_id: ids.gonzalo })).status, 200);
  const [n] = await pool.query("SELECT roles, ruta FROM notificaciones WHERE tipo = 'DESARROLLO'");
  assert.deepEqual([n[0].roles, n[0].ruta], ["DIRECCION", `/desarrollo?p=${id}`]);
  const lista = (await http(ids.gonzalo, "GET", "/api/desarrollo/proyectos")).body;
  assert.deepEqual(lista.proyectos[0].espera_mi_aprobacion, ["ENTRADAS"]);
  assert.equal((await http(ids.lucia, "POST", `/api/desarrollo/proyectos/${id}/etapas/ENTRADAS/aprobar`, {})).status, 403);
  assert.equal((await http(ids.gonzalo, "POST", `/api/desarrollo/proyectos/${id}/etapas/ENTRADAS/aprobar`, { decision: "RECHAZADA" })).status, 400); // rechazo sin motivo
  assert.equal((await http(ids.gonzalo, "POST", `/api/desarrollo/proyectos/${id}/etapas/ENTRADAS/aprobar`, { comentario: "Adelante" })).status, 200);
  p = (await http(ids.andres, "GET", `/api/desarrollo/proyectos/${id}`)).body;
  const ent = p.etapas.find((e) => e.etapa === "ENTRADAS");
  assert.deepEqual([ent.aprobacion_estado, ent.aprobador_nombre, ent.cerrada], ["APROBADA", "Gonzalo", true]);
  assert.equal(p.progreso.cerradas, 1);

  // Si cambia el detalle después de aprobado, la aprobación se cae y queda en la bitácora.
  const ed = await http(ids.andres, "PUT", `/api/desarrollo/proyectos/${id}/etapas/ENTRADAS`, { detalle: "- Otra cosa" });
  assert.equal(ed.body.aprobacion_caida, true);
  p = (await http(ids.andres, "GET", `/api/desarrollo/proyectos/${id}`)).body;
  assert.equal(p.etapas[0].aprobacion_estado, null);
  assert.match(p.eventos[0].texto, /aprobación anterior quedó sin efecto/);

  // Archivos: imagen con miniatura, plano; portada automática; oficial; borrar va a la papelera.
  const png = await require("sharp")({ create: { width: 800, height: 600, channels: 3, background: "#ff5a00" } }).png().toBuffer();
  const fd = new FormData();
  fd.append("archivos", new Blob([png], { type: "image/png" }), "render cono.png");
  fd.append("archivos", new Blob([Buffer.from("%PDF-1.4")], { type: "application/pdf" }), "plano 1176.pdf");
  const up = await http(ids.andres, "POST", `/api/desarrollo/proyectos/${id}/archivos`, fd);
  assert.equal(up.status, 200);
  assert.deepEqual(up.body.archivos.map((a) => a.tipo), ["FOTO", "PLANO"]);
  const [foto, plano] = up.body.archivos;
  const mini = await http(ids.lucia, "GET", `/api/desarrollo/archivos/${foto.id}/miniatura`);
  assert.equal(mini.status, 200);
  assert.ok(mini.body.length > 100);
  assert.equal((await http(ids.andres, "PUT", `/api/desarrollo/archivos/${plano.id}`, { es_oficial: true })).status, 200);
  assert.equal((await http(ids.andres, "DELETE", `/api/desarrollo/archivos/${plano.id}`)).status, 403); // oficial
  assert.equal((await http(ids.andres, "DELETE", `/api/desarrollo/archivos/${foto.id}`)).status, 200);
  assert.equal(fs.readdirSync(path.join(dir, String(id), "papelera")).length, 2); // archivo + miniatura
  p = (await http(ids.andres, "GET", `/api/desarrollo/proyectos/${id}`)).body;
  assert.equal(p.portada_id, null);
  assert.equal(p.archivos.length, 1);

  // Asistente: propone y se aplica (puntos en la etapa + prueba estructurada).
  const s = await http(ids.andres, "POST", `/api/desarrollo/proyectos/${id}/asistente`, { texto: "medimos el espesor con calibre, dio 3,1, el objetivo era 3" });
  assert.equal(s.body.pruebas[0].que, "Espesor de pared");
  assert.equal((await http(ids.andres, "POST", `/api/desarrollo/proyectos/${id}/asistente/aplicar`, s.body)).status, 200);
  p = (await http(ids.andres, "GET", `/api/desarrollo/proyectos/${id}`)).body;
  assert.match(p.etapas.find((e) => e.etapa === "VERIFICACION").detalle, /Espesor medido 3,1 mm/);
  assert.deepEqual(p.pruebas.map((x) => [x.que, x.cumple]), [["Espesor de pared", "SI"]]);
  assert.ok(p.iso.items.find((x) => x.id === "verificacion").ok);

  // Ítems: si no existe, avisa que se puede crear; al crearlo queda en la app.
  const no = await http(ids.andres, "POST", `/api/desarrollo/proyectos/${id}/items`, { tipo: "PT", codigo: "1176LSF-2R NA" });
  assert.deepEqual([no.status, no.body.puede_crear], [404, true]);
  assert.equal((await http(ids.andres, "POST", `/api/desarrollo/proyectos/${id}/items`, { tipo: "PT", codigo: "1176LSF-2R NA", nombre: "Cono vial semiflexible", crear: true })).body.creado, true);
  const [[pt]] = await pool.query("SELECT * FROM productos_terminados WHERE codigo = '1176LSF-2R NA'");
  assert.equal(pt.nombre, "Cono vial semiflexible");

  // Difusión: Lucía confirma enterado; la revisión lo ve.
  assert.equal((await http(ids.gonzalo, "POST", `/api/desarrollo/proyectos/${id}/difusion`, { usuarios: [ids.lucia, ids.andres], mensaje: "Se lanza el 1176: actualizar lista" })).body.avisados, 2);
  assert.equal((await http(ids.lucia, "GET", `/api/desarrollo/proyectos/${id}`)).body.mi_aviso.mensaje, "Se lanza el 1176: actualizar lista");
  assert.equal((await http(ids.lucia, "POST", `/api/desarrollo/proyectos/${id}/enterado`, { comentario: "Lista actualizada" })).status, 200);
  p = (await http(ids.andres, "GET", `/api/desarrollo/proyectos/${id}`)).body;
  assert.deepEqual(p.avisos.map((a) => [a.usuario_nombre, !!a.enterado_at]).sort(), [["Andrés", false], ["Lucía", true]]);

  // Terminar: queda con fecha de lanzamiento y todo en la bitácora.
  await http(ids.andres, "PUT", `/api/desarrollo/proyectos/${id}`, { estado: "TERMINADO" });
  p = (await http(ids.andres, "GET", `/api/desarrollo/proyectos/${id}`)).body;
  assert.ok(p.fecha_lanzamiento);
  const tipos = new Set(p.eventos.map((e) => e.tipo));
  for (const t of ["CREADO", "APROBACION", "ETAPA", "ARCHIVO", "PRUEBA", "ITEM", "DIFUSION", "ESTADO", "NOTA"]) assert.ok(tipos.has(t), `falta ${t} en la bitácora`);
}));
