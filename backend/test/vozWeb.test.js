"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const V = require("../vozWeb");
const { instruccionesVoz } = require("../whatsappVoz");

const SDP = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";
const SECRETO = "s".repeat(32);

test("link usable: activo y sin vencer", () => {
  const ahora = new Date("2026-11-13T12:00:00");
  assert.ok(V.linkUsable({ activo: 1, vence_at: null }, ahora));
  assert.ok(V.linkUsable({ activo: 1, vence_at: "2026-11-14T00:00:00" }, ahora));
  assert.ok(!V.linkUsable({ activo: 1, vence_at: "2026-11-13T11:00:00" }, ahora));
  assert.ok(!V.linkUsable({ activo: 0, vence_at: null }, ahora));
  assert.ok(!V.linkUsable(null, ahora));
});

test("oferta: solo audio WebRTC, tamaño acotado", () => {
  assert.ok(V.ofertaValida({ type: "offer", sdp: SDP }));
  assert.ok(!V.ofertaValida({ type: "answer", sdp: SDP }));
  assert.ok(!V.ofertaValida({ type: "offer", sdp: "hola" }));
  assert.ok(!V.ofertaValida({ type: "offer", sdp: SDP.replace("m=audio", "m=video") }));
  assert.ok(!V.ofertaValida({ type: "offer", sdp: SDP + "x".repeat(20000) }));
  assert.ok(!V.ofertaValida(null));
});

test("token, transcripción y contacto se limpian", () => {
  assert.ok(V.tokenValido("a".repeat(32)));
  assert.ok(!V.tokenValido("../../etc"));
  assert.deepEqual(V.limpiarTranscripcion([{ rol: "bot", texto: " Hola " }, { rol: "x", texto: "precio" }, { rol: "bot", texto: "  " }]), [
    { rol: "bot", texto: "Hola" },
    { rol: "cliente", texto: "precio" },
  ]);
  assert.equal(V.limpiarContacto({ nombre: "Juan" }), null);
  const c = V.limpiarContacto({ nombre: "  Juan   Pérez ", telefono: "11 5555 1234", motivo: "200 conos" });
  assert.equal(c.nombre, "Juan Pérez");
  assert.equal(V.contactoTexto(c), "Nombre: Juan Pérez · Tel: 11 5555 1234 · Necesita: 200 conos");
});

test("instrucciones para la web: sin WhatsApp, toma el contacto", () => {
  const i = instruccionesVoz({ catalogo: "1025 | Cono", canal: "web", nombreCliente: "Gonzalo" });
  for (const x of ["dejar_contacto", "calcular_presupuesto", "cortar_llamada", "Gonzalo", "1025 | Cono", "desde la web"]) assert.ok(i.includes(x), x);
  assert.ok(!i.includes("enviar_por_whatsapp"));
  assert.ok(!i.includes("derivar_a_persona"));
});

// ---- integración con MariaDB local (se saltea si no hay base)
async function conBase(fn) {
  let mysql;
  try {
    mysql = require("mysql2/promise");
  } catch {
    return;
  }
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch {
    if (pool) await pool.end().catch(() => {});
    return;
  }
  const servidores = [];
  const secretoAntes = process.env.VOZ_SECRETO;
  process.env.VOZ_SECRETO = SECRETO;
  try {
    for (const t of ["voz_llamadas", "voz_links", "usuarios"]) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await pool.query("CREATE TABLE usuarios (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100), rol VARCHAR(40))");
    await pool.query("INSERT INTO usuarios (nombre, rol) VALUES ('Gonzalo Pérez','DIRECCION')");
    await V.asegurarTablasVozWeb(pool);

    // servicio de voz falso: devuelve una respuesta y guarda lo que recibió
    const recibido = [];
    const voz = express();
    voz.use(express.json());
    voz.post("/web/oferta", (req, res) => {
      if (req.headers["x-voz-secreto"] !== SECRETO) return res.sendStatus(403);
      recibido.push(req.body);
      if (req.body.sdp.includes("lleno")) return res.sendStatus(429);
      res.json({ sdp: "v=0 respuesta", type: "answer", pc_id: "x" });
    });
    const sVoz = await new Promise((r) => { const s = voz.listen(0, "127.0.0.1", () => r(s)); });
    servidores.push(sVoz);

    const notifs = [];
    let atiende = true;
    const bot = { botGlobal: async () => atiende, contexto: async () => ({ productos: [{ codigo: "1025", nombre: "Cono", precio_lista: "$10.000,50" }], reglasComerciales: "Más IVA" }) };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: Number(req.headers["x-uid"]) || null }; next(); });
    const permiso = () => (req, res, next) => (req.user.id ? next() : res.status(403).json({ error: "Sin acceso" }));
    V.registrarRutasVozWeb(app, { db: pool, bot, requirePermiso: permiso, crearNotificacion: (_db, n) => notifs.push(n), puertoVoz: sVoz.address().port });
    const sApp = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
    servidores.push(sApp);
    const base = `http://127.0.0.1:${sApp.address().port}`;
    const pedir = async (ruta, { method = "GET", body, uid = 1, secreto } = {}) => {
      const r = await fetch(base + ruta, { method, headers: { "Content-Type": "application/json", ...(uid ? { "x-uid": String(uid) } : {}), ...(secreto ? { "x-voz-secreto": secreto } : {}) }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, json: await r.json().catch(() => null) };
    };
    await fn({ pool, pedir, recibido, notifs, setAtiende: (v) => (atiende = v) });
  } finally {
    process.env.VOZ_SECRETO = secretoAntes;
    for (const s of servidores) await new Promise((r) => s.close(r));
    await pool.end();
  }
}

test("llamar desde la app, desde un link, transcripción y contacto", async () => {
  await conBase(async ({ pool, pedir, recibido, notifs, setAtiende }) => {
    // desde la app
    let r = await pedir("/api/voz/llamar", { method: "POST", body: { type: "offer", sdp: SDP } });
    assert.equal(r.status, 200);
    assert.equal(r.json.sdp, "v=0 respuesta");
    assert.equal(recibido[0].ctx.quien, "Gonzalo");
    assert.ok(recibido[0].ctx.instrucciones.includes("dejar_contacto"));
    assert.deepEqual(recibido[0].ctx.precios, [{ codigo: "1025", nombre: "Cono", unitario: 10000.5 }]);
    const llamadaApp = r.json.llamada_id;

    assert.equal((await pedir("/api/voz/llamar", { method: "POST", body: { type: "offer", sdp: "x" } })).status, 400);
    assert.equal((await pedir("/api/voz/llamar", { method: "POST", uid: 0, body: { type: "offer", sdp: SDP } })).status, 403);

    // servicio lleno: no queda la llamada colgada en la base
    r = await pedir("/api/voz/llamar", { method: "POST", body: { type: "offer", sdp: SDP + "a=lleno\r\n" } });
    assert.equal(r.status, 429);
    const [[{ n }]] = await pool.query("SELECT COUNT(*) n FROM voz_llamadas");
    assert.equal(n, 1);

    // bot apagado
    setAtiende(false);
    assert.equal((await pedir("/api/voz/llamar", { method: "POST", body: { type: "offer", sdp: SDP } })).status, 503);
    setAtiende(true);

    // links
    r = await pedir("/api/voz/links", { method: "POST", body: { nombre: "Gerencia", dias: 7 } });
    assert.equal(r.status, 200);
    const token = r.json.token;
    assert.equal((await pedir("/api/voz/links", { method: "POST", body: { nombre: " " } })).status, 400);
    assert.equal((await pedir(`/api/public/voz-web/${token}`, { uid: 0 })).status, 200);
    assert.equal((await pedir(`/api/public/voz-web/${"0".repeat(32)}`, { uid: 0 })).status, 404);
    r = await pedir(`/api/public/voz-web/${token}/llamar`, { method: "POST", uid: 0, body: { type: "offer", sdp: SDP } });
    assert.equal(r.status, 200);
    const llamadaLink = r.json.llamada_id;
    assert.equal(recibido.at(-1).ctx.quien, null);

    // fin y contacto: solo el servicio de voz (localhost + secreto)
    assert.equal((await pedir("/api/public/voz/web-fin", { method: "POST", body: { llamada_id: llamadaApp } })).status, 403);
    r = await pedir("/api/public/voz/web-fin", { method: "POST", secreto: SECRETO, body: { llamada_id: llamadaApp, duracion: 42.4, transcripcion: [{ rol: "bot", texto: "Hola, soy Aldana" }, { rol: "cliente", texto: "precio conos" }] } });
    assert.equal(r.status, 200);
    assert.equal((await pedir("/api/public/voz/web-contacto", { method: "POST", secreto: SECRETO, body: { llamada_id: llamadaLink, nombre: "Juan" } })).status, 400);
    r = await pedir("/api/public/voz/web-contacto", { method: "POST", secreto: SECRETO, body: { llamada_id: llamadaLink, nombre: "Juan", empresa: "Vial SA", telefono: "1155551234", motivo: "300 conos" } });
    assert.equal(r.status, 200);
    assert.equal(notifs.length, 1);
    assert.match(notifs[0].titulo, /Juan/);
    assert.match(notifs[0].texto, /1155551234/);

    r = await pedir("/api/voz/llamadas");
    const porId = Object.fromEntries(r.json.map((c) => [c.id, c]));
    assert.equal(porId[llamadaApp].duracion, 42);
    assert.equal(porId[llamadaApp].transcripcion.length, 2);
    assert.equal(porId[llamadaLink].contacto.empresa, "Vial SA");
    assert.equal(porId[llamadaLink].link, "Gerencia");

    // el link cuenta usos y se puede desactivar
    r = await pedir("/api/voz/links");
    assert.equal(r.json[0].usos, 1);
    await pedir(`/api/voz/links/${r.json[0].id}`, { method: "DELETE" });
    assert.equal((await pedir(`/api/public/voz-web/${token}/llamar`, { method: "POST", uid: 0, body: { type: "offer", sdp: SDP } })).status, 404);
  });
});

