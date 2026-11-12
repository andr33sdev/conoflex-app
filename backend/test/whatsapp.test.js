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

test("texto de una foto: producto reconocido, marca nuestra y parecidos", () => {
  const productos = [
    { codigo: "2301CS", nombre: "Cono Obrador Classic" },
    { codigo: "2853-3R", nombre: "Columna con base" },
  ];
  const t = w.textoFoto({ vista: { descripcion: "Cono naranja alto con cabezal", marca: "CONOFLEX", candidatos: ["2301CS", "2853-3R"] }, eleccion: { codigo: "2301cs", seguridad: "alta" }, productos, textoCliente: "Estoy buscando este cono" });
  assert.equal(t, "📷 Foto: Cono naranja alto con cabezal\nMarca: es un producto Conoflex (nuestro).\nProducto reconocido: 2301CS Cono Obrador Classic (seguridad alta).\nTexto del cliente: Estoy buscando este cono");
  const dudosa = w.textoFoto({ vista: { descripcion: "x", marca: "NO SE VE", candidatos: ["2853-3R", "NOEXISTE", "2301CS"] }, eleccion: { codigo: "2853-3R", seguridad: "baja" }, productos });
  assert.equal(dudosa, "📷 Foto: x\nProductos parecidos del catálogo: 2853-3R Columna con base · 2301CS Cono Obrador Classic.");
});

test("ruta en disco de una foto del catálogo", () => {
  assert.equal(w.rutaImagenLocal("http://66.97.34.163:3001/imagenes/cono%20obrador.jpg", "/app/public/imagenes"), "/app/public/imagenes/cono obrador.jpg");
  assert.equal(w.rutaImagenLocal("http://x/imagenes/../../etc/passwd", "/app/public/imagenes"), null);
  assert.equal(w.rutaImagenLocal("https://otra.com/foto.jpg", "/dir"), null);
  assert.equal(w.rutaImagenLocal("x", null), null);
});

test("con base: la foto se compara con el catálogo y con sus fotos, y el bot ve el producto reconocido", async () => {
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
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "imagenes-"));
  fs.writeFileSync(path.join(dir, "obrador.jpg"), Buffer.from("foto-obrador"));
  fs.writeFileSync(path.join(dir, "columna.jpg"), Buffer.from("foto-columna"));
  const fetchOriginal = global.fetch;
  try {
    for (const t of ["wa_mensajes", "wa_conversaciones", "wa_correcciones", "reglas", "productos"]) await db.query(`DROP TABLE IF EXISTS ${t}`);
    await db.query("CREATE TABLE reglas (clave VARCHAR(255) PRIMARY KEY, valor TEXT)");
    await db.query("CREATE TABLE productos (codigo VARCHAR(50), nombre VARCHAR(255), categoria VARCHAR(100), medidas TEXT, precio_lista TEXT, aplicacion TEXT, descripcion TEXT, usos_recomendados TEXT, advertencias TEXT, foto_catalogo TEXT, foto_tecnica TEXT)");
    await db.query("INSERT INTO productos (codigo, nombre, precio_lista, foto_catalogo) VALUES ('2301CS','Cono Obrador Classic','$50.000','http://66.97.34.163:3001/imagenes/obrador.jpg'),('2853-3R','Columna con base','$74.219,01','http://66.97.34.163:3001/imagenes/columna.jpg')");
    await w.asegurarTablasWhatsapp(db);
    process.env.WHATSAPP_TOKEN = "t";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1";
    global.fetch = async (url, opts = {}) => {
      const json = (o) => ({ ok: true, status: 200, json: async () => o, arrayBuffer: async () => new ArrayBuffer(4), headers: { get: () => "image/jpeg" } });
      if (String(url).endsWith("/messages")) return json({ messages: [{ id: `wamid.${Math.random()}` }] });
      return json({ url: "https://lookaside/x", mime_type: "image/jpeg" });
    };
    const pasos = [];
    let pedidoRespuesta = null;
    const ai = {
      models: {
        generateContent: async (p) => {
          if (Array.isArray(p.contents) && p.contents[0]?.inlineData) {
            pasos.push("catalogo");
            assert.match(p.contents[1], /2301CS \| Cono Obrador Classic/);
            return { text: JSON.stringify({ descripcion: "Cono naranja de más de 1 m con cabezal y 2 bandas", marca: "CONOFLEX", candidatos: ["2853-3R", "2301CS"] }) };
          }
          const partes = p.contents?.[0]?.parts;
          if (partes?.some((x) => x.inlineData)) {
            pasos.push("fotos");
            const fotos = partes.filter((x) => x.inlineData).map((x) => Buffer.from(x.inlineData.data, "base64").toString());
            assert.deepEqual(fotos.slice(1), ["foto-columna", "foto-obrador"]); // las del catálogo, en el orden de los candidatos
            return { text: JSON.stringify({ codigo: "2301CS", seguridad: "alta", motivo: "mismo cabezal" }) };
          }
          pedidoRespuesta = p;
          return { text: JSON.stringify({ respuesta: "Es nuestro Obrador Classic" }) };
        },
      },
    };
    const bot = w.crearBotWhatsapp({ db, ai, leerLista: () => null, notasTexto: async () => "", imagenesDir: dir });
    await bot.recibir({ waId: "wf1", telefono: "549222", nombre: "Jefa", tipo: "image", mediaId: "m1", mime: "image/jpeg", texto: "Estoy buscando este cono" });
    await new Promise((r) => setTimeout(r, 3400));
    assert.deepEqual(pasos, ["catalogo", "fotos"]);
    const [[m]] = await db.query("SELECT texto FROM wa_mensajes WHERE direccion = 'IN'");
    assert.match(m.texto, /Producto reconocido: 2301CS Cono Obrador Classic \(seguridad alta\)/);
    assert.match(m.texto, /Marca: es un producto Conoflex/);
    assert.match(pedidoRespuesta.contents.at(-1).parts[0].text, /Producto reconocido: 2301CS/);
    assert.match(pedidoRespuesta.config.systemInstruction, /Nunca digas que un producto es "de otra marca"/);
  } finally {
    global.fetch = fetchOriginal;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    fs.rmSync(dir, { recursive: true, force: true });
    await db.end();
  }
});
