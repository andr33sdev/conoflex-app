"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const w = require("../whatsapp");

test("firma de Meta: válida, inválida y faltante", () => {
  const cuerpo = Buffer.from('{"hola":1}');
  const firma = "sha256=" + crypto.createHmac("sha256", "secreto").update(cuerpo).digest("hex");
  assert.ok(w.firmaValida(cuerpo, firma, "secreto"));
  assert.ok(!w.firmaValida(cuerpo, firma, "otro"));
  assert.ok(!w.firmaValida(cuerpo, "sha256=abc", "secreto"));
  assert.ok(!w.firmaValida(null, firma, "secreto"));
  assert.ok(!w.firmaValida(cuerpo, undefined, "secreto"));
});

test("extrae mensajes del aviso de Meta e ignora estados de entrega", () => {
  const body = {
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ wa_id: "5491122334455", profile: { name: "Juan" } }],
              messages: [
                { id: "w1", from: "5491122334455", type: "text", text: { body: "precio cono 75" }, timestamp: "1" },
                { id: "w2", from: "5491122334455", type: "audio", audio: { id: "m1", mime_type: "audio/ogg" } },
                { id: "w3", from: "5491122334455", type: "image", image: { id: "m2", caption: "este" } },
              ],
            },
          },
          { value: { statuses: [{ id: "x", status: "delivered" }] } },
        ],
      },
    ],
  };
  const ms = w.extraerMensajes(body);
  assert.equal(ms.length, 3);
  assert.deepEqual([ms[0].texto, ms[0].nombre, ms[0].telefono], ["precio cono 75", "Juan", "5491122334455"]);
  assert.equal(ms[1].mediaId, "m1");
  assert.equal(ms[2].texto, "este");
  assert.equal(w.extraerMensajes({}).length, 0);
});

const productos = [
  { codigo: "1025", nombre: "Cono 75 cm", precio_lista: "$10.000,50", foto_catalogo: "http://66.97.34.163:3001/imagenes/cono.jpg" },
  { codigo: "2400-2R", nombre: "Reductor", precio_lista: "SIN FIJACIÓN $34.303,34 | HORMIGÓN - H / ASFALTO - A $55.430,57" },
  { codigo: "9999", nombre: "Sin precio", precio_lista: "Consultar" },
];

test("el servidor hace las cuentas; variantes y sin precio quedan afuera", () => {
  const c = w.calcularItems([{ codigo: "1025", cantidad: 3 }, { codigo: "2400-2R", cantidad: 2 }, { codigo: "9999", cantidad: 1 }, { codigo: "NOEXISTE", cantidad: 1 }, { codigo: "1025", cantidad: -1 }], productos);
  assert.equal(c.lineas.length, 1); // solo 1025: variantes, sin precio, inexistente y cantidad inválida quedan afuera
  assert.equal(c.lineas[0].subtotal, 30001.5);
  assert.equal(c.total, 30001.5);
  assert.equal(w.calcularItems([], productos), null);
  const t = w.textoCalculo(c, "más IVA");
  assert.match(t, /3 × Cono 75 cm/);
  assert.match(t, /\*Total: \$30\.001,50\* más IVA/);
});

test("pausa del bot y ventana de 24 h", () => {
  const ahora = new Date("2026-11-06T12:00:00Z");
  assert.ok(w.botPuedeResponder({ global: true, pausadoHasta: null }, ahora));
  assert.ok(!w.botPuedeResponder({ global: false, pausadoHasta: null }, ahora));
  assert.ok(!w.botPuedeResponder({ global: true, pausadoHasta: "2026-11-06T13:00:00Z" }, ahora));
  assert.ok(w.botPuedeResponder({ global: true, pausadoHasta: "2026-11-06T11:00:00Z" }, ahora));
  assert.ok(w.ventanaAbierta("2026-11-06T00:00:00Z", ahora));
  assert.ok(!w.ventanaAbierta("2026-11-05T11:00:00Z", ahora));
  assert.ok(!w.ventanaAbierta(null, ahora));
});

test("historial: junta mensajes seguidos y empieza por el cliente", () => {
  const h = w.historialContents([
    { direccion: "OUT", texto: "hola de antes" },
    { direccion: "IN", texto: "hola" },
    { direccion: "IN", texto: "precio?" },
    { direccion: "OUT", texto: "te paso" },
  ]);
  assert.equal(h.length, 2);
  assert.equal(h[0].role, "user");
  assert.equal(h[0].parts[0].text, "hola\nprecio?");
  assert.equal(h[1].role, "model");
});

test("salida de la IA: negrita de WhatsApp y campos seguros", () => {
  const s = w.normalizarSalida(w.parsearJson('```json\n{"respuesta":"El **cono** sale","fotos":["1025",2],"derivar":true}\n```'));
  assert.equal(s.respuesta, "El *cono* sale");
  assert.deepEqual(s.fotos, ["1025", "2"]);
  assert.equal(s.derivar, true);
  assert.equal(s.enviarLista, false);
  assert.equal(w.normalizarSalida({ respuesta: "  " }), null);
  assert.equal(w.normalizarSalida(null), null);
});

test("catálogo compacto y foto pública", () => {
  const t = w.catalogoTexto(productos);
  assert.equal(t.split("\n").length, 3);
  assert.match(t, /1025 \| Cono 75 cm \| precio: \$10\.000,50 \| tiene foto/);
  assert.equal(w.urlFotoPublica("http://66.97.34.163:3001/imagenes/cono 1.jpg"), "https://conoflex-app.vercel.app/imagenes/cono%201.jpg");
  assert.equal(w.urlFotoPublica(""), null);
});

test("instrucciones incluyen reglas, correcciones y catálogo", () => {
  const i = w.instrucciones({ reglasComerciales: "Precios más IVA", reglasWhatsapp: "Firmá como Equipo Conoflex", notas: "", correcciones: "Cliente: x\nRespuesta correcta: y", catalogo: "1025 | Cono", tieneLista: true });
  assert.match(i, /Precios más IVA/);
  assert.match(i, /Firmá como Equipo Conoflex/);
  assert.match(i, /CORRECCIONES DEL EQUIPO/);
  assert.match(i, /enviar_lista/);
});

test("si la IA devuelve HTML de mail, queda texto plano de WhatsApp", () => {
  const html = '<div style="font-family: Arial; color: #1A1A1A;">\n  ¡Hola! Soy de <b>Conoflex Argentina</b>.&nbsp;Contame el uso.\n</div>\n<div>Adjunto precios:</div>\n<table><tr><td><img src="x.jpg"></td><td><strong>Cono 75</strong></td><td>$10.000</td></tr></table>';
  const t = w.textoWhatsapp(html);
  assert.doesNotMatch(t, /<|style=|&nbsp;/);
  assert.match(t, /\*Conoflex Argentina\*/);
  assert.match(t, /\*Cono 75\* \$10\.000/);
  assert.equal(w.textoWhatsapp("Hola **vos**\n\n\n\n## Precios"), "Hola *vos*\n\nPrecios");
  assert.equal(w.normalizarSalida({ respuesta: "<div>Hola <b>che</b></div>" }).respuesta, "Hola *che*");
});

test("qué falta responder: el último mensaje del cliente posterior al ya respondido", () => {
  const msgs = [{ id: 1, direccion: "IN" }, { id: 2, direccion: "OUT" }, { id: 3, direccion: "IN" }, { id: 4, direccion: "OUT" }];
  assert.equal(w.ultimoSinResponder(msgs, null), 3);
  assert.equal(w.ultimoSinResponder(msgs, 1), 3); // el 3 llegó mientras el bot pensaba: queda antes de la respuesta, pero falta
  assert.equal(w.ultimoSinResponder(msgs, 3), null);
  assert.equal(w.ultimoSinResponder([], 0), null);
});

test("con base: dos fotos seguidas → el bot espera a mirar las dos y responde por la última", async () => {
  let mysql;
  try {
    mysql = require("mysql2/promise");
  } catch {
    return;
  }
  const db = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
  try {
    await db.query("SELECT 1");
  } catch {
    await db.end().catch(() => {});
    return;
  }
  const fetchOriginal = global.fetch;
  const envVars = ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"];
  try {
    for (const t of ["wa_mensajes", "wa_conversaciones", "wa_correcciones", "reglas", "productos"]) await db.query(`DROP TABLE IF EXISTS ${t}`);
    await db.query("CREATE TABLE reglas (clave VARCHAR(255) PRIMARY KEY, valor TEXT)");
    await db.query("CREATE TABLE productos (codigo VARCHAR(50), nombre VARCHAR(255), categoria VARCHAR(100), medidas TEXT, precio_lista TEXT, aplicacion TEXT, descripcion TEXT, usos_recomendados TEXT, advertencias TEXT, foto_catalogo TEXT, foto_tecnica TEXT)");
    await w.asegurarTablasWhatsapp(db);
    process.env.WHATSAPP_TOKEN = "t";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1";

    const enviados = [];
    global.fetch = async (url, opts = {}) => {
      const u = String(url);
      const json = (o) => ({ ok: true, status: 200, json: async () => o, arrayBuffer: async () => new ArrayBuffer(4), headers: { get: () => "image/jpeg" } });
      if (u.endsWith("/messages")) {
        const b = JSON.parse(opts.body);
        if (b.type === "text") enviados.push(b.text.body);
        return json({ messages: [{ id: `wamid.${enviados.length}` }] });
      }
      if (/\/media1$|\/media2$/.test(u)) return json({ url: `https://lookaside/${u.slice(-6)}`, mime_type: "image/jpeg" });
      return json({});
    };
    const pedidosIA = [];
    const espera = (ms) => new Promise((r) => setTimeout(r, ms));
    const ai = {
      models: {
        generateContent: async (p) => {
          if (p.contents?.[0]?.inlineData) {
            // Describir la foto: la primera tarda menos que la segunda.
            const cual = pedidosIA.filter((x) => x === "foto").length === 0 ? "CARTEL PORTÁTIL" : "CONO 65 CM";
            pedidosIA.push("foto");
            await espera(cual === "CARTEL PORTÁTIL" ? 200 : 4500);
            return { text: cual };
          }
          pedidosIA.push(p.contents);
          return { text: JSON.stringify({ respuesta: "ok" }) };
        },
      },
    };
    const bot = w.crearBotWhatsapp({ db, ai, leerLista: () => null, notasTexto: async () => "" });
    const foto = (n, waId) => ({ waId, telefono: "549111", nombre: "Jefa", tipo: "image", mediaId: `media${n}`, mime: "image/jpeg", texto: null });
    await bot.recibir(foto(1, "w1")); // la primera se describe rápido y el bot espera 3 s para responder
    await espera(1000);
    const p2 = bot.recibir(foto(2, "w2")); // la segunda llega en esa espera y tarda en describirse
    await espera(3000); // vence la espera de la primera: antes respondía acá, sin haber visto la foto 2
    assert.equal(enviados.length, 0);
    await p2;
    await espera(3300);
    assert.equal(enviados.length, 1); // una sola respuesta, con las dos fotos ya vistas
    const ultimoPedido = pedidosIA.filter((x) => x !== "foto").pop();
    const ultimoTurnoCliente = ultimoPedido.filter((c) => c.role === "user").pop().parts[0].text;
    assert.match(ultimoTurnoCliente, /CONO 65 CM/);
    // Nada más para responder.
    await bot.responder((await db.query("SELECT id FROM wa_conversaciones"))[0][0].id);
    assert.equal(enviados.length, 1);
  } finally {
    global.fetch = fetchOriginal;
    for (const v of envVars) delete process.env[v];
    await db.end();
  }
});

test("catálogo: suma la especificación (altura de los conos)", () => {
  const t = w.catalogoTexto([{ codigo: "2300-2R", nombre: "VENCEDOR", categoria: "Conos", medidas: "Base: 45x45cm.", especificacion: "Altura: 120 cm. / Peso: 6 kg." }]);
  assert.match(t, /altura: 120 cm/);
  assert.match(t, /datos: Altura: 120 cm\. \/ Peso: 6 kg\./);
});
