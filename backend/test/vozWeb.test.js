"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const V = require("../vozWeb");
const L = require("../vozLlamada");

// --- helpers puros (sin red) -------------------------------------------------

test("Oraciones: la primera sale corta, las siguientes se agrupan", () => {
  const o = new L.Oraciones();
  assert.deepEqual(o.feed("Hola. "), ["Hola."]);
  assert.deepEqual(o.feed("Tenemos "), []);
  assert.deepEqual(o.feed("conos naranjas de ciento veinte centímetros. "), ["Tenemos conos naranjas de ciento veinte centímetros."]);
  assert.deepEqual(o.flush(), []);
});

test("paraVoz: saca HTML, markdown, emojis, marcadores y arregla la pronunciación", () => {
  assert.equal(L.paraVoz("El **Semiflexible** de PVC 🙂 <b>x</b>"), "El semi flexible de pe ve ce x");
  assert.equal(L.paraVoz("Listo.\n@CONTACTO nombre=Juan"), "Listo.");
  assert.equal(L.paraVoz("Precio más IVA"), "Precio más IVA");
});

test("leerMarcadores: contacto y cortar", () => {
  const m = L.leerMarcadores("Gracias.\n@CONTACTO nombre=Juan Pérez; empresa=Vial SA; telefono=1155551234; motivo=300 conos\n@CORTAR");
  assert.equal(m.cortar, true);
  assert.equal(m.contacto.nombre, "Juan Pérez");
  assert.equal(m.contacto.telefono, "1155551234");
  assert.deepEqual(L.leerMarcadores("Dale, gracias."), { contacto: null, cortar: false });
  assert.equal(L.leerMarcadores("@CONTACTO nombre=Juan").contacto, null);
});

// --- motor con una IA falsa (sin red salvo ElevenLabs, que stubbeamos) -------

function aiFalsa(respuestas) {
  let i = 0;
  const next = () => respuestas[Math.min(i++, respuestas.length - 1)];
  return {
    models: {
      generateContent: async () => ({ text: next() }),
      generateContentStream: async function* () {
        const txt = next();
        for (const trozo of txt.match(/.{1,12}/gs) || [txt]) yield { text: trozo };
      },
    },
  };
}

function stubEleven() {
  const real = global.fetch;
  global.fetch = async (url, opts) => {
    if (String(url).includes("elevenlabs.io")) return { ok: true, arrayBuffer: async () => Buffer.from("mp3-falso") };
    return real(url, opts); // el resto (localhost del test) pasa de largo con sus opciones
  };
  return () => (global.fetch = real);
}

const CTX = async () => ({ productos: [{ codigo: "2300", nombre: "Vencedor", categoria: "Conos", especificacion: "Altura: 120 cm", precio_lista: "$10.000" }], reglasComerciales: "Precios más IVA", reglasWhatsapp: "", notas: "", correcciones: "" });

test("motor: saludo, turno en streaming y transcripción", async () => {
  const prev = { k: process.env.ELEVENLABS_API_KEY, v: process.env.VOZ_ELEVEN_VOZ };
  process.env.ELEVENLABS_API_KEY = "x";
  process.env.VOZ_ELEVEN_VOZ = "voz1";
  const restore = stubEleven();
  try {
    const ai = aiFalsa([
      "Hola Gonzalo, soy Aldana de Conoflex. ¿En qué te ayudo?",
      "Claro que sí. El Vencedor sale diez mil pesos más IVA. ¿Cuántos necesitás?",
      "Perfecto, le paso tus datos a un vendedor. ¡Un saludo!\n@CONTACTO nombre=Gonzalo; telefono=1155; motivo=200 conos\n@CORTAR",
    ]);
    const motor = L.crearMotorLlamada({ ai, contexto: CTX });
    const saludo = await motor.iniciar(1, { quien: "Gonzalo" });
    assert.match(saludo.texto, /Aldana/);
    assert.ok(saludo.audio, "el saludo trae audio");
    assert.ok(Array.isArray(saludo.muletillas) && saludo.muletillas.length > 0, "trae muletillas");

    let chunks = [];
    let fin = null;
    for await (const ev of motor.turno(1, "Hola, precio del Vencedor")) {
      if (ev.tipo === "chunk") chunks.push(ev);
      if (ev.tipo === "fin") fin = ev;
    }
    assert.ok(chunks.length >= 1, "al menos una oración");
    assert.ok(chunks[0].audio, "cada oración trae audio");
    assert.ok(chunks.some((c) => /diez mil/.test(c.texto)));
    assert.ok(fin && !fin.cortar);

    chunks = [];
    fin = null;
    for await (const ev of motor.turno(1, "Sí, pasame con alguien")) {
      if (ev.tipo === "chunk") chunks.push(ev);
      if (ev.tipo === "fin") fin = ev;
    }
    assert.ok(!chunks.some((c) => c.texto.includes("@")), "los marcadores no se pronuncian");
    assert.equal(fin.cortar, true);
    assert.equal(fin.contacto.nombre, "Gonzalo");

    const r = motor.terminar(1);
    assert.ok(r.duracion >= 0);
    assert.ok(r.transcripcion.length >= 4);
    assert.equal(r.contacto.telefono, "1155");
    assert.equal(motor.existe(1), false);
  } finally {
    restore();
    process.env.ELEVENLABS_API_KEY = prev.k;
    process.env.VOZ_ELEVEN_VOZ = prev.v;
  }
});

// --- endpoints (MariaDB local; se saltea si no hay base) ---------------------

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
  const prev = { k: process.env.ELEVENLABS_API_KEY, v: process.env.VOZ_ELEVEN_VOZ };
  process.env.ELEVENLABS_API_KEY = "x";
  process.env.VOZ_ELEVEN_VOZ = "voz1";
  const restore = stubEleven();
  let server;
  try {
    for (const t of ["voz_llamadas", "voz_links", "usuarios"]) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await pool.query("CREATE TABLE usuarios (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(100))");
    await pool.query("INSERT INTO usuarios (nombre) VALUES ('Gonzalo Pérez')");
    await V.asegurarTablasVozWeb(pool);
    const notifs = [];
    const ai = aiFalsa([
      "Hola Gonzalo, soy Aldana. ¿En qué te ayudo?",
      "El Vencedor sale diez mil más IVA.\n@CONTACTO nombre=Gonzalo; telefono=1155; motivo=conos\n@CORTAR",
    ]);
    const bot = { botGlobal: async () => true, contexto: CTX };
    const app = express();
    app.use(express.json());
    app.use((req, _r, next) => { req.user = { id: Number(req.headers["x-uid"] ?? 1) }; next(); });
    V.registrarRutasVozWeb(app, { db: pool, bot, ai, requirePermiso: () => (q, s, n) => (q.user.id ? n() : s.sendStatus(403)), crearNotificacion: (_db, n) => notifs.push(n) });
    server = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const pedir = async (ruta, { method = "POST", body, uid = 1 } = {}) => {
      const r = await fetch(base + ruta, { method, headers: { "Content-Type": "application/json", "x-uid": String(uid) }, body: body ? JSON.stringify(body) : undefined });
      const ct = r.headers.get("content-type") || "";
      const nd = ct.includes("ndjson");
      return { status: r.status, json: ct.includes("json") && !nd ? await r.json().catch(() => null) : null, text: nd ? await r.text() : null };
    };
    await fn({ pool, pedir, notifs });
  } finally {
    if (server) await new Promise((r) => server.close(r));
    restore();
    process.env.ELEVENLABS_API_KEY = prev.k;
    process.env.VOZ_ELEVEN_VOZ = prev.v;
    await pool.end();
  }
}

test("endpoints: inicio, turno (NDJSON), contacto y fin", async () => {
  await conBase(async ({ pool, pedir, notifs }) => {
    let r = await pedir("/api/voz/llamar/inicio");
    assert.equal(r.status, 200);
    const id = r.json.llamada_id;
    assert.ok(id > 0);
    assert.match(r.json.texto, /Aldana/);

    r = await pedir("/api/voz/llamar/turno", { body: { llamada_id: id, texto: "precio del vencedor" } });
    assert.equal(r.status, 200);
    const eventos = r.text.trim().split("\n").map((l) => JSON.parse(l));
    assert.ok(eventos.some((e) => e.tipo === "chunk" && e.audio));
    assert.ok(eventos.some((e) => e.tipo === "fin"));
    assert.ok(!eventos.some((e) => e.tipo === "chunk" && e.texto.includes("@")));

    assert.equal(notifs.length, 1);
    assert.match(notifs[0].texto, /1155/);

    assert.equal((await pedir("/api/voz/llamar/turno", { body: { llamada_id: 9999, texto: "hola" } })).status, 404);
    assert.equal((await pedir("/api/voz/llamar/turno", { body: { llamada_id: id, texto: "  " } })).status, 400);

    r = await pedir("/api/voz/llamar/fin", { body: { llamada_id: id } });
    assert.equal(r.status, 200);
    const [[c]] = await pool.query("SELECT duracion, transcripcion, contacto FROM voz_llamadas WHERE id = ?", [id]);
    assert.ok(c.duracion >= 0);
    assert.ok(JSON.parse(c.transcripcion).length >= 2);
    assert.equal(JSON.parse(c.contacto).telefono, "1155");

    assert.equal((await pedir("/api/voz/llamar/inicio", { uid: 0 })).status, 403);
  });
});

test("links: crear, usar desde el público, listar y desactivar", async () => {
  await conBase(async ({ pedir }) => {
    let r = await pedir("/api/voz/links", { body: { nombre: "Gerencia", dias: 7 } });
    assert.equal(r.status, 200);
    const token = r.json.token;
    assert.equal((await pedir("/api/voz/links", { body: { nombre: " " } })).status, 400);

    assert.equal((await pedir(`/api/public/voz-web/${token}`, { method: "GET", uid: 0 })).status, 200);
    r = await pedir(`/api/public/voz-web/${token}/inicio`, { uid: 0 });
    assert.equal(r.status, 200);
    assert.ok(r.json.llamada_id > 0);

    assert.equal((await pedir(`/api/public/voz-web/${"0".repeat(32)}/inicio`, { uid: 0 })).status, 404);

    r = await pedir("/api/voz/links", { method: "GET" });
    assert.equal(r.json[0].usos, 1);
    await pedir(`/api/voz/links/${r.json[0].id}`, { method: "DELETE" });
    assert.equal((await pedir(`/api/public/voz-web/${token}/inicio`, { uid: 0 })).status, 404);
  });
});
