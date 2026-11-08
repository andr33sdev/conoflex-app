"use strict";
// Bot de WhatsApp (API oficial de Meta, Cloud API).
//
// Cómo funciona:
//   1) Meta llama a /api/public/whatsapp/webhook cada vez que un cliente escribe (Vercel reenvía al VPS).
//   2) Se guarda el mensaje (audios y fotos se pasan a texto con la IA, así quedan legibles en la bandeja).
//   3) Se esperan unos segundos por si el cliente manda varios mensajes seguidos y se responde todo junto.
//   4) La IA usa el mismo catálogo, lista de precios y reglas que Comercial IA, más las reglas y
//      correcciones propias de WhatsApp. Las cuentas (cantidad × precio) las hace el servidor, nunca la IA.
//   5) Si la IA no puede resolver (o el cliente pide hablar con alguien) deriva: el bot se pausa en esa
//      conversación y se avisa al equipo. Una persona puede responder desde el módulo WhatsApp.
//
// Variables del .env:
//   WHATSAPP_TOKEN            token permanente (usuario del sistema de Meta Business)
//   WHATSAPP_PHONE_NUMBER_ID  id del número (no es el número de teléfono)
//   WHATSAPP_VERIFY_TOKEN     texto cualquiera, el mismo que se carga en Meta al configurar el webhook
//   WHATSAPP_APP_SECRET       "clave secreta de la app" de Meta: valida que los avisos vengan de Meta
//   WHATSAPP_PUBLIC_BASE      (opcional) dirección pública para las fotos, por defecto https://conoflex-app.vercel.app
//   WHATSAPP_API_VERSION      (opcional) por defecto v23.0
const crypto = require("crypto");
const { leerPrecios } = require("./comercial/catalogo");

const MODELO = "gemini-2.5-flash";
const ESPERA_MS = 3000; // junta los mensajes que el cliente manda seguidos
const PAUSA_HORAS = 12; // cuánto queda pausado el bot cuando interviene una persona o deriva
const MAX_HISTORIAL = 24;
const MAX_FOTOS = 3;
const MAX_MEDIA_BYTES = 12 * 1024 * 1024;
const ROLES_AVISO = ["ADMIN", "COMERCIAL"];

const cfg = () => ({
  token: process.env.WHATSAPP_TOKEN || "",
  phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
  appSecret: process.env.WHATSAPP_APP_SECRET || "",
  version: process.env.WHATSAPP_API_VERSION || "v23.0",
  base: (process.env.WHATSAPP_PUBLIC_BASE || "https://conoflex-app.vercel.app").replace(/\/+$/, ""),
});
const configurado = (c = cfg()) => !!(c.token && c.phoneId && c.verifyToken && c.appSecret);

// ---------------------------------------------------------------- funciones puras (con tests)

/** Valida la firma X-Hub-Signature-256 que manda Meta con el cuerpo crudo. */
function firmaValida(rawBody, firma, secreto) {
  if (!rawBody || !firma || !secreto) return false;
  const esperada = "sha256=" + crypto.createHmac("sha256", secreto).update(rawBody).digest("hex");
  const a = Buffer.from(String(firma));
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Saca del aviso de Meta los mensajes entrantes, en una forma simple. Ignora estados de entrega y otros eventos. */
function extraerMensajes(body) {
  const out = [];
  for (const entry of body?.entry || []) {
    for (const ch of entry?.changes || []) {
      const v = ch?.value;
      if (!v?.messages) continue;
      const nombres = new Map((v.contacts || []).map((c) => [String(c.wa_id), c?.profile?.name || null]));
      for (const m of v.messages) {
        if (!m?.id || !m?.from) continue;
        const base = { waId: String(m.id), telefono: String(m.from), nombre: nombres.get(String(m.from)) || null, tipo: String(m.type || "desconocido"), texto: null, mediaId: null, mime: null, ts: Number(m.timestamp) || null };
        if (m.type === "text") base.texto = String(m.text?.body || "");
        else if (m.type === "image") Object.assign(base, { mediaId: m.image?.id, mime: m.image?.mime_type, texto: m.image?.caption || null });
        else if (m.type === "audio") Object.assign(base, { mediaId: m.audio?.id, mime: m.audio?.mime_type });
        else if (m.type === "document") Object.assign(base, { mediaId: m.document?.id, mime: m.document?.mime_type, texto: m.document?.caption || `[documento: ${m.document?.filename || "sin nombre"}]` });
        else if (m.type === "button") base.texto = String(m.button?.text || "");
        else if (m.type === "interactive") base.texto = String(m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || "");
        else if (m.type === "location") base.texto = `[ubicación: ${m.location?.name || ""} ${m.location?.address || ""} (${m.location?.latitude}, ${m.location?.longitude})]`.replace(/\s+/g, " ");
        else base.texto = `[${m.type}]`;
        out.push(base);
      }
    }
  }
  return out;
}

function parsearJson(texto) {
  const t = String(texto || "").replace(/^```json|^```|```$/gim, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const m = /\{[\s\S]*\}/.exec(t);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

const corto = (t, n) => {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

/** Catálogo compacto, una línea por producto. Es lo que la IA "sabe" de productos y precios. */
function catalogoTexto(productos) {
  return productos
    .filter((p) => p.codigo || p.nombre)
    .map((p) => {
      const uso = corto(p.aplicacion || p.descripcion || "", 180);
      const usos = corto(String(p.usos_recomendados || "").split(/\s*\|\s*/).map((u) => u.split(":")[0].trim()).filter(Boolean).slice(0, 5).join(", "), 120);
      return [p.codigo, p.nombre, p.categoria, p.medidas && `medidas: ${corto(p.medidas, 80)}`, `precio: ${corto(p.precio_lista, 160) || "consultar"}`, uso && `para qué sirve: ${uso}`, usos && `usos: ${usos}`, p.advertencias && `ojo: ${corto(p.advertencias, 120)}`, (p.foto_catalogo || p.foto_tecnica) ? "tiene foto" : null]
        .filter(Boolean)
        .map((x) => String(x).replace(/\|/g, "/"))
        .join(" | ");
    })
    .join("\n");
}

const pesos = (n) => `$${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const redondear2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const normCodigo = (c) => String(c || "").trim().toUpperCase().replace(/\s+/g, " ");

/**
 * Cálculo exacto de lo que la IA marcó como pedido. Solo productos del catálogo con precio único;
 * los que tienen variantes o no tienen precio quedan afuera (la IA los explica en el texto).
 */
function calcularItems(items, productos) {
  const porCodigo = new Map(productos.map((p) => [normCodigo(p.codigo), p]));
  const lineas = [];
  for (const it of Array.isArray(items) ? items.slice(0, 10) : []) {
    const p = porCodigo.get(normCodigo(it?.codigo));
    const cant = Number(it?.cantidad);
    if (!p || !Number.isFinite(cant) || cant <= 0 || cant > 1e6) continue;
    const precio = leerPrecios(p.precio_lista);
    if (!precio.unico) continue;
    lineas.push({ codigo: p.codigo, nombre: p.nombre, cantidad: cant, unitario: precio.unico, subtotal: redondear2(cant * precio.unico) });
  }
  if (!lineas.length) return null;
  return { lineas, total: redondear2(lineas.reduce((s, l) => s + l.subtotal, 0)) };
}

function textoCalculo(calc, nota) {
  if (!calc) return "";
  const filas = calc.lineas.map((l) => `• ${l.cantidad.toLocaleString("es-AR")} × ${l.nombre} (${pesos(l.unitario)} c/u) = ${pesos(l.subtotal)}`);
  return ["*Cálculo con precios de lista*", ...filas, `*Total: ${pesos(calc.total)}*${nota ? ` ${corto(nota, 120)}` : ""}`].join("\n");
}

/** ¿El bot puede responder en esta conversación ahora? */
function botPuedeResponder({ global, pausadoHasta }, ahora = new Date()) {
  if (!global) return false;
  if (!pausadoHasta) return true;
  return new Date(pausadoHasta).getTime() <= ahora.getTime();
}

/** ¿Pasaron menos de 24 h desde el último mensaje del cliente? Meta solo deja responder texto libre dentro de esa ventana. */
function ventanaAbierta(ultimoCliente, ahora = new Date()) {
  if (!ultimoCliente) return false;
  return ahora.getTime() - new Date(ultimoCliente).getTime() < 24 * 3600 * 1000;
}

function instrucciones({ reglasComerciales, reglasWhatsapp, notas, correcciones, catalogo, tieneLista }) {
  return `Sos quien atiende el WhatsApp de ventas de Conoflex Argentina, fábrica de productos de seguridad vial (conos, reductores de velocidad, topes de estacionamiento, separadores de carril, delineadores y más).

CÓMO ESCRIBIR
- Es WhatsApp: mensajes cortos, claros y amables. Español rioplatense (vos). Nada de párrafos largos ni listas eternas.
- Para resaltar usá *negrita* de WhatsApp (un asterisco). Nunca uses markdown con ** ni títulos con #.
- Respondé exactamente lo que preguntan. Si falta un dato para ayudar (cantidad, medida, uso), preguntalo en una línea.
- No saludes de nuevo si ya hay conversación.

PRODUCTOS Y PRECIOS
- Solo ofrecé productos del CATÁLOGO de abajo. Nunca inventes productos, medidas, stock, plazos ni precios.
- Podés pasar precios de lista a cualquiera que pregunte, tal cual figuran en el catálogo (respetá las condiciones de las reglas: IVA, envío, etc.).
- Si un precio tiene variantes (ej. con o sin fijación), mostralas o preguntá cuál necesita.
- NUNCA hagas cuentas vos. Si el cliente da cantidades, completá "items" con código y cantidad: el sistema agrega el cálculo exacto debajo de tu mensaje. En tu texto no escribas totales.
- Si el cliente manda una foto de otro producto (de la competencia o roto), ofrecé el equivalente del catálogo y explicá por qué.
- Si quieren ver un producto, poné su código en "fotos" (solo si dice "tiene foto"; máximo ${MAX_FOTOS}).
${tieneLista ? '- Si piden la lista de precios completa o el catálogo, poné "enviar_lista": true.' : "- Hoy no hay lista de precios en PDF para mandar: pasá los precios por mensaje."}

CUÁNDO DERIVAR A UNA PERSONA ("derivar": true)
- Piden hablar con alguien, un reclamo, una devolución, factura, un pago, estado de un pedido ya hecho, un descuento especial o algo que no está en el catálogo ni en las reglas.
- En ese caso avisá en tu respuesta que alguien del equipo le escribe a la brevedad, sin prometer horarios.

REGLAS COMERCIALES (escritas para los presupuestos por MAIL: tomá solo lo comercial —precios, IVA, descuentos, entregas, pagos—. Ignorá todo lo de formato: HTML, tablas, estilos, imágenes incrustadas, saludos y firmas de mail)
${reglasComerciales || "(sin reglas cargadas)"}
${notas ? `\n${notas}\n` : ""}
REGLAS PROPIAS DE WHATSAPP (mandan sobre todo lo anterior)
${reglasWhatsapp || "(sin reglas propias)"}
${correcciones ? `\nCORRECCIONES DEL EQUIPO: así se debe responder en estos casos. Seguí el criterio y el tono.\n${correcciones}\n` : ""}
CATÁLOGO (código | nombre | categoría | medidas | precio | uso)
${catalogo || "(catálogo vacío: no pases precios y derivá)"}

RECORDÁ: "respuesta" es texto plano de WhatsApp. NUNCA HTML (<div>, <table>, <b>, style=…), NUNCA markdown con ** ni #. Solo texto, saltos de línea y *negrita*.

FORMATO DE SALIDA: solo un JSON así:
{"respuesta": "texto para el cliente", "items": [{"codigo": "...", "cantidad": 0}], "nota_total": "ej: más IVA", "fotos": ["codigo"], "enviar_lista": false, "derivar": false, "motivo": "por qué derivás (solo si derivar)"}`;
}

/** Arma el historial para la IA: los mensajes en orden, cada uno con quién lo escribió. */
function historialContents(mensajes) {
  const contents = [];
  for (const m of mensajes) {
    const role = m.direccion === "IN" ? "user" : "model";
    const texto = String(m.texto || "").trim() || `[${m.tipo}]`;
    const prev = contents[contents.length - 1];
    if (prev && prev.role === role) prev.parts[0].text += `\n${texto}`;
    else contents.push({ role, parts: [{ text: texto }] });
  }
  // La conversación tiene que empezar por el cliente.
  while (contents.length && contents[0].role !== "user") contents.shift();
  return contents;
}

/**
 * Deja el texto listo para WhatsApp aunque la IA haya devuelto HTML o markdown:
 * negrita → *texto*, bloques → saltos de línea, el resto de las etiquetas se borran.
 */
function textoWhatsapp(texto) {
  let t = String(texto || "");
  if (/<[a-z][\s\S]*?>/i.test(t)) {
    t = t
      .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
      .replace(/<img[^>]*>/gi, "")
      .replace(/<\s*(b|strong)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, (_, __, x) => `*${x.replace(/<[^>]+>/g, "").trim()}*`)
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\s*li\b[^>]*>/gi, "\n• ")
      .replace(/<\s*\/\s*(p|div|tr|li|ul|ol|table|h[1-6])\s*>/gi, "\n")
      .replace(/<\s*\/\s*td\s*>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  }
  return t
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/^#{1,6}\s+/gm, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizarSalida(crudo) {
  if (!crudo || typeof crudo.respuesta !== "string" || !crudo.respuesta.trim()) return null;
  return {
    respuesta: textoWhatsapp(crudo.respuesta).slice(0, 3500),
    items: Array.isArray(crudo.items) ? crudo.items : [],
    notaTotal: typeof crudo.nota_total === "string" ? crudo.nota_total : "",
    fotos: Array.isArray(crudo.fotos) ? crudo.fotos.map(String).slice(0, MAX_FOTOS) : [],
    enviarLista: crudo.enviar_lista === true,
    derivar: crudo.derivar === true,
    motivo: typeof crudo.motivo === "string" ? crudo.motivo.slice(0, 300) : "",
  };
}

// ---------------------------------------------------------------- base de datos

async function asegurarTablasWhatsapp(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS wa_conversaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    telefono VARCHAR(32) NOT NULL UNIQUE,
    nombre VARCHAR(160) NULL,
    pausado_hasta DATETIME NULL,
    derivada TINYINT(1) NOT NULL DEFAULT 0,
    motivo_derivacion VARCHAR(300) NULL,
    no_leidos INT NOT NULL DEFAULT 0,
    ultimo_texto VARCHAR(300) NULL,
    ultimo_mensaje_en DATETIME NULL,
    ultimo_cliente_en DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS wa_mensajes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversacion_id INT NOT NULL,
    wa_id VARCHAR(128) NULL UNIQUE,
    direccion VARCHAR(3) NOT NULL,
    autor VARCHAR(12) NOT NULL,
    tipo VARCHAR(20) NOT NULL DEFAULT 'text',
    texto TEXT NULL,
    usuario_id INT NULL,
    error VARCHAR(300) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX (conversacion_id, id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS wa_correcciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pregunta TEXT NOT NULL,
    respuesta TEXT NOT NULL,
    activa TINYINT(1) NOT NULL DEFAULT 1,
    creada_por INT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function leerRegla(db, clave) {
  const [r] = await db.query("SELECT valor FROM reglas WHERE clave = ?", [clave]);
  return r[0]?.valor ?? null;
}
const guardarRegla = (db, clave, valor) => db.query("INSERT INTO reglas (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [clave, valor]);

// ---------------------------------------------------------------- API de Meta

async function graph(ruta, { method = "GET", body, form } = {}) {
  const c = cfg();
  const res = await fetch(`https://graph.facebook.com/${c.version}/${ruta}`, {
    method,
    headers: { Authorization: `Bearer ${c.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.error_data?.details || json?.error?.message || `Meta respondió ${res.status}`);
  return json;
}

const enviarTexto = (to, texto) => graph(`${cfg().phoneId}/messages`, { method: "POST", body: { messaging_product: "whatsapp", to, type: "text", text: { body: texto, preview_url: false } } });
const enviarImagen = (to, link, caption) => graph(`${cfg().phoneId}/messages`, { method: "POST", body: { messaging_product: "whatsapp", to, type: "image", image: { link, caption } } });

async function enviarDocumento(to, { nombre, datos }) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append("file", new Blob([datos], { type: "application/pdf" }), nombre);
  const subida = await graph(`${cfg().phoneId}/media`, { method: "POST", form });
  return graph(`${cfg().phoneId}/messages`, { method: "POST", body: { messaging_product: "whatsapp", to, type: "document", document: { id: subida.id, filename: nombre } } });
}

/** Marca como leído y muestra "escribiendo…" mientras se arma la respuesta. Si falla no importa. */
const marcarLeido = (waId) => graph(`${cfg().phoneId}/messages`, { method: "POST", body: { messaging_product: "whatsapp", status: "read", message_id: waId, typing_indicator: { type: "text" } } }).catch(() => null);

async function descargarMedia(mediaId) {
  const info = await graph(mediaId);
  if (info.file_size && info.file_size > MAX_MEDIA_BYTES) throw new Error("archivo muy grande");
  const res = await fetch(info.url, { headers: { Authorization: `Bearer ${cfg().token}` } });
  if (!res.ok) throw new Error(`no se pudo descargar (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_MEDIA_BYTES) throw new Error("archivo muy grande");
  return { mimeType: String(info.mime_type || "application/octet-stream").split(";")[0], data: buf.toString("base64") };
}

/** URL pública de una foto guardada (se guardan con la dirección del servidor; se pide por la del sitio). */
function urlFotoPublica(url) {
  if (!url) return null;
  const i = String(url).indexOf("/imagenes/");
  if (i < 0) return null;
  return encodeURI(cfg().base + String(url).slice(i));
}

// ---------------------------------------------------------------- el bot

function crearBotWhatsapp({ db, ai, leerLista, notasTexto, crearNotificacion }) {
  const temporizadores = new Map(); // conversacion_id → timer
  const ocupadas = new Set(); // conversaciones respondiendo ahora mismo
  const pendientes = new Set(); // llegaron mensajes mientras se respondía

  async function contexto() {
    const [productos] = await db.query("SELECT codigo, nombre, categoria, medidas, precio_lista, aplicacion, descripcion, usos_recomendados, advertencias, foto_catalogo, foto_tecnica FROM productos");
    const [corr] = await db.query("SELECT pregunta, respuesta FROM wa_correcciones WHERE activa = 1 ORDER BY id DESC LIMIT 40");
    return {
      productos,
      reglasComerciales: (await leerRegla(db, "prompt_comercial")) || "",
      reglasWhatsapp: (await leerRegla(db, "prompt_whatsapp")) || "",
      notas: notasTexto ? await notasTexto(db).catch(() => "") : "",
      correcciones: corr.map((c) => `Cliente: ${corto(c.pregunta, 400)}\nRespuesta correcta: ${corto(c.respuesta, 700)}`).join("\n---\n"),
      tieneLista: !!leerLista?.(),
    };
  }

  /** Lo que respondería el bot a esta conversación. No envía nada (lo usa también la pestaña Probar). */
  async function pensar(mensajes) {
    const ctx = await contexto();
    const sistema = instrucciones({ ...ctx, catalogo: catalogoTexto(ctx.productos) });
    const contents = historialContents(mensajes.slice(-MAX_HISTORIAL));
    if (!contents.length) throw new Error("No hay mensajes del cliente para responder.");
    const r = await ai.models.generateContent({ model: MODELO, contents, config: { systemInstruction: sistema, responseMimeType: "application/json", temperature: 0.3 } });
    const salida = normalizarSalida(parsearJson(r.text));
    if (!salida) throw new Error("La IA no devolvió una respuesta legible.");
    const calc = calcularItems(salida.items, ctx.productos);
    const texto = [salida.respuesta, textoCalculo(calc, salida.notaTotal)].filter(Boolean).join("\n\n");
    const porCodigo = new Map(ctx.productos.map((p) => [normCodigo(p.codigo), p]));
    const fotos = salida.fotos
      .map((c) => porCodigo.get(normCodigo(c)))
      .filter(Boolean)
      .map((p) => ({ codigo: p.codigo, nombre: p.nombre, url: urlFotoPublica(p.foto_catalogo || p.foto_tecnica) }))
      .filter((f) => f.url);
    return { texto, fotos, enviarLista: salida.enviarLista && ctx.tieneLista, derivar: salida.derivar, motivo: salida.motivo };
  }

  async function guardarMensaje(conversacionId, { waId = null, direccion, autor, tipo = "text", texto, usuarioId = null, error = null }) {
    const [r] = await db.query("INSERT IGNORE INTO wa_mensajes (conversacion_id, wa_id, direccion, autor, tipo, texto, usuario_id, error) VALUES (?,?,?,?,?,?,?,?)", [conversacionId, waId, direccion, autor, tipo, texto, usuarioId, error]);
    if (!r.affectedRows) return null; // repetido: Meta a veces avisa dos veces el mismo mensaje
    const resumen = corto(texto || `[${tipo}]`, 280);
    if (direccion === "IN") await db.query("UPDATE wa_conversaciones SET ultimo_texto = ?, ultimo_mensaje_en = NOW(), ultimo_cliente_en = NOW(), no_leidos = no_leidos + 1 WHERE id = ?", [resumen, conversacionId]);
    else await db.query("UPDATE wa_conversaciones SET ultimo_texto = ?, ultimo_mensaje_en = NOW() WHERE id = ?", [resumen, conversacionId]);
    return r.insertId;
  }

  /** Audios y fotos se pasan a texto con la IA: así el bot los entiende y en la bandeja se pueden leer. */
  async function aTexto(m) {
    if (!m.mediaId || !["audio", "image"].includes(m.tipo)) return m.texto;
    try {
      const media = await descargarMedia(m.mediaId);
      const pedido =
        m.tipo === "audio"
          ? "Transcribí este audio de WhatsApp tal cual, en español. Devolvé solo la transcripción."
          : "Describí esta foto que mandó un cliente a una fábrica de productos de seguridad vial: qué producto se ve, color, forma, medidas aproximadas, texto visible y estado. Máximo 3 oraciones.";
      const r = await ai.models.generateContent({ model: MODELO, contents: [{ inlineData: media }, pedido], config: { temperature: 0 } });
      const t = String(r.text || "").trim();
      return m.tipo === "audio" ? `🎤 Audio: ${t}` : `📷 Foto: ${t}${m.texto ? `\nTexto del cliente: ${m.texto}` : ""}`;
    } catch (e) {
      console.error("[whatsapp] media:", e.message);
      return m.tipo === "audio" ? "🎤 [audio que no se pudo escuchar]" : `📷 [foto que no se pudo ver]${m.texto ? ` ${m.texto}` : ""}`;
    }
  }

  async function botGlobal() {
    return (await leerRegla(db, "whatsapp_bot_activo")) !== "0";
  }

  async function recibir(m) {
    await db.query("INSERT INTO wa_conversaciones (telefono, nombre) VALUES (?, ?) ON DUPLICATE KEY UPDATE nombre = COALESCE(VALUES(nombre), nombre)", [m.telefono, m.nombre]);
    const [[conv]] = await db.query("SELECT id FROM wa_conversaciones WHERE telefono = ?", [m.telefono]);
    // Primero se reserva el id del mensaje (evita procesar dos veces el mismo audio).
    const id = await guardarMensaje(conv.id, { waId: m.waId, direccion: "IN", autor: "CLIENTE", tipo: m.tipo, texto: m.mediaId && ["audio", "image"].includes(m.tipo) ? "…" : m.texto });
    if (!id) return;
    marcarLeido(m.waId);
    if (m.mediaId && ["audio", "image"].includes(m.tipo)) {
      const texto = await aTexto(m);
      await db.query("UPDATE wa_mensajes SET texto = ? WHERE id = ?", [texto, id]);
      await db.query("UPDATE wa_conversaciones SET ultimo_texto = ? WHERE id = ?", [corto(texto, 280), conv.id]);
    }
    programar(conv.id);
  }

  function programar(conversacionId) {
    clearTimeout(temporizadores.get(conversacionId));
    temporizadores.set(
      conversacionId,
      setTimeout(() => {
        temporizadores.delete(conversacionId);
        responder(conversacionId).catch((e) => console.error("[whatsapp] responder:", e.message));
      }, ESPERA_MS),
    );
  }

  async function responder(conversacionId) {
    if (ocupadas.has(conversacionId)) return void pendientes.add(conversacionId);
    ocupadas.add(conversacionId);
    try {
      const [[conv]] = await db.query("SELECT * FROM wa_conversaciones WHERE id = ?", [conversacionId]);
      if (!conv || !botPuedeResponder({ global: await botGlobal(), pausadoHasta: conv.pausado_hasta })) return;
      const [mensajes] = await db.query("SELECT direccion, tipo, texto FROM (SELECT id, direccion, tipo, texto FROM wa_mensajes WHERE conversacion_id = ? AND error IS NULL ORDER BY id DESC LIMIT ?) t ORDER BY id", [conversacionId, MAX_HISTORIAL]);
      if (!mensajes.length || mensajes[mensajes.length - 1].direccion !== "IN") return; // ya se respondió
      let r;
      try {
        r = await pensar(mensajes);
      } catch (e) {
        console.error("[whatsapp] IA:", e.message);
        r = { texto: "Gracias por escribirnos. En un momento te responde alguien del equipo.", fotos: [], enviarLista: false, derivar: true, motivo: "El bot no pudo responder (error de la IA)." };
      }
      try {
        const env = await enviarTexto(conv.telefono, r.texto);
        await guardarMensaje(conversacionId, { waId: env?.messages?.[0]?.id, direccion: "OUT", autor: "BOT", texto: r.texto });
      } catch (e) {
        await guardarMensaje(conversacionId, { direccion: "OUT", autor: "BOT", texto: r.texto, error: corto(e.message, 290) });
        throw e;
      }
      for (const f of r.fotos) {
        try {
          const env = await enviarImagen(conv.telefono, f.url, f.nombre);
          await guardarMensaje(conversacionId, { waId: env?.messages?.[0]?.id, direccion: "OUT", autor: "BOT", tipo: "image", texto: `📷 ${f.nombre}` });
        } catch (e) {
          console.error("[whatsapp] foto:", e.message);
        }
      }
      if (r.enviarLista) {
        try {
          const env = await enviarDocumento(conv.telefono, leerLista());
          await guardarMensaje(conversacionId, { waId: env?.messages?.[0]?.id, direccion: "OUT", autor: "BOT", tipo: "document", texto: "📄 Lista de precios (PDF)" });
        } catch (e) {
          console.error("[whatsapp] lista:", e.message);
        }
      }
      if (r.derivar) {
        await db.query(`UPDATE wa_conversaciones SET derivada = 1, motivo_derivacion = ?, pausado_hasta = NOW() + INTERVAL ${PAUSA_HORAS} HOUR WHERE id = ?`, [corto(r.motivo || "Pidió hablar con una persona", 290), conversacionId]);
        crearNotificacion?.(db, { tipo: "WHATSAPP", titulo: `WhatsApp: ${conv.nombre || conv.telefono} necesita una persona`, texto: r.motivo || null, ruta: "whatsapp", roles: ROLES_AVISO, push: true });
      }
    } finally {
      ocupadas.delete(conversacionId);
      if (pendientes.delete(conversacionId)) programar(conversacionId);
    }
  }

  /** Mensaje escrito por una persona desde el módulo. Pausa el bot en esa conversación. */
  async function enviarPersona(conversacionId, texto, usuarioId) {
    const [[conv]] = await db.query("SELECT * FROM wa_conversaciones WHERE id = ?", [conversacionId]);
    if (!conv) throw Object.assign(new Error("No existe la conversación."), { status: 404 });
    if (!ventanaAbierta(conv.ultimo_cliente_en)) throw Object.assign(new Error("Pasaron más de 24 h desde el último mensaje del cliente: WhatsApp no deja escribirle hasta que vuelva a escribir."), { status: 409 });
    const env = await enviarTexto(conv.telefono, texto);
    await guardarMensaje(conversacionId, { waId: env?.messages?.[0]?.id, direccion: "OUT", autor: "PERSONA", texto, usuarioId });
    await db.query(`UPDATE wa_conversaciones SET pausado_hasta = NOW() + INTERVAL ${PAUSA_HORAS} HOUR, derivada = 0, motivo_derivacion = NULL WHERE id = ?`, [conversacionId]);
  }

  return { recibir, pensar, enviarPersona, botGlobal, responder };
}

// ---------------------------------------------------------------- rutas

function registrarRutasWhatsapp(app, { db, requirePermiso, bot }) {
  // Público: verificación del webhook (Meta la llama una vez al configurarlo).
  app.get("/api/public/whatsapp/webhook", (req, res) => {
    const c = cfg();
    if (req.query["hub.mode"] === "subscribe" && c.verifyToken && req.query["hub.verify_token"] === c.verifyToken) return res.status(200).send(String(req.query["hub.challenge"] || ""));
    res.sendStatus(403);
  });

  // Público: mensajes entrantes. Se contesta 200 enseguida (Meta reintenta si tarda) y se procesa después.
  app.post("/api/public/whatsapp/webhook", (req, res) => {
    const c = cfg();
    if (!configurado(c)) {
      console.warn("[whatsapp] webhook rechazado: faltan variables WHATSAPP_* en el .env");
      return res.sendStatus(401);
    }
    if (!firmaValida(req.rawBody, req.headers["x-hub-signature-256"], c.appSecret)) {
      console.warn(`[whatsapp] webhook rechazado: firma inválida (¿WHATSAPP_APP_SECRET correcto?) firma=${req.headers["x-hub-signature-256"] ? "sí" : "no"} cuerpo=${req.rawBody ? req.rawBody.length : 0} bytes`);
      return res.sendStatus(401);
    }
    res.sendStatus(200);
    const mensajes = extraerMensajes(req.body);
    console.log(`[whatsapp] webhook recibido: ${mensajes.length} mensaje(s)`);
    for (const m of mensajes) bot.recibir(m).catch((e) => console.error("[whatsapp] recibir:", e.message));
  });

  const permiso = requirePermiso("whatsapp");
  const err = (res, e) => res.status(e.status || 500).json({ error: e.message });

  app.get("/api/whatsapp/estado", permiso, async (req, res) => {
    try {
      const c = cfg();
      const faltan = [!c.token && "WHATSAPP_TOKEN", !c.phoneId && "WHATSAPP_PHONE_NUMBER_ID", !c.verifyToken && "WHATSAPP_VERIFY_TOKEN", !c.appSecret && "WHATSAPP_APP_SECRET"].filter(Boolean);
      res.json({ configurado: !faltan.length, faltan, botActivo: await bot.botGlobal(), webhook: `${c.base}/api/public/whatsapp/webhook` });
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/whatsapp/bot", permiso, async (req, res) => {
    try {
      await guardarRegla(db, "whatsapp_bot_activo", req.body?.activo ? "1" : "0");
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  app.get("/api/whatsapp/conversaciones", permiso, async (req, res) => {
    try {
      const [rows] = await db.query("SELECT id, telefono, nombre, pausado_hasta, pausado_hasta > NOW() AS pausado, derivada, motivo_derivacion, no_leidos, ultimo_texto, ultimo_mensaje_en, ultimo_cliente_en, ultimo_cliente_en > (NOW() - INTERVAL 24 HOUR) AS ventana FROM wa_conversaciones ORDER BY derivada DESC, ultimo_mensaje_en DESC LIMIT 200");
      res.json(rows);
    } catch (e) {
      err(res, e);
    }
  });

  app.get("/api/whatsapp/conversaciones/:id/mensajes", permiso, async (req, res) => {
    try {
      const [rows] = await db.query("SELECT id, direccion, autor, tipo, texto, error, created_at FROM (SELECT * FROM wa_mensajes WHERE conversacion_id = ? ORDER BY id DESC LIMIT 300) t ORDER BY id", [req.params.id]);
      await db.query("UPDATE wa_conversaciones SET no_leidos = 0 WHERE id = ?", [req.params.id]);
      res.json(rows);
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/whatsapp/conversaciones/:id/enviar", permiso, async (req, res) => {
    try {
      const texto = String(req.body?.texto || "").trim();
      if (!texto) return res.status(400).json({ error: "Escribí un mensaje." });
      await bot.enviarPersona(Number(req.params.id), texto.slice(0, 4000), req.user?.id || null);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  // Devolverle la conversación al bot (o pausarlo a mano).
  app.post("/api/whatsapp/conversaciones/:id/bot", permiso, async (req, res) => {
    try {
      if (req.body?.activo) await db.query("UPDATE wa_conversaciones SET pausado_hasta = NULL, derivada = 0, motivo_derivacion = NULL WHERE id = ?", [req.params.id]);
      else await db.query(`UPDATE wa_conversaciones SET pausado_hasta = NOW() + INTERVAL ${PAUSA_HORAS} HOUR WHERE id = ?`, [req.params.id]);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  app.get("/api/whatsapp/reglas", permiso, async (req, res) => {
    try {
      res.json({ reglas: (await leerRegla(db, "prompt_whatsapp")) || "" });
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/whatsapp/reglas", permiso, async (req, res) => {
    try {
      await guardarRegla(db, "prompt_whatsapp", String(req.body?.reglas || "").slice(0, 20000));
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  app.get("/api/whatsapp/correcciones", permiso, async (req, res) => {
    try {
      const [rows] = await db.query("SELECT id, pregunta, respuesta, created_at FROM wa_correcciones WHERE activa = 1 ORDER BY id DESC");
      res.json(rows);
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/whatsapp/correcciones", permiso, async (req, res) => {
    try {
      const pregunta = String(req.body?.pregunta || "").trim();
      const respuesta = String(req.body?.respuesta || "").trim();
      if (pregunta.length < 2 || respuesta.length < 2) return res.status(400).json({ error: "Completá lo que preguntó el cliente y cómo hay que responder." });
      await db.query("INSERT INTO wa_correcciones (pregunta, respuesta, creada_por) VALUES (?,?,?)", [pregunta.slice(0, 2000), respuesta.slice(0, 3000), req.user?.id || null]);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  app.delete("/api/whatsapp/correcciones/:id", permiso, async (req, res) => {
    try {
      await db.query("UPDATE wa_correcciones SET activa = 0 WHERE id = ?", [req.params.id]);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  // Probar el bot sin WhatsApp: recibe la charla y devuelve lo que respondería (no envía nada).
  app.post("/api/whatsapp/probar", permiso, async (req, res) => {
    try {
      const mensajes = (Array.isArray(req.body?.mensajes) ? req.body.mensajes : [])
        .slice(-MAX_HISTORIAL)
        .map((m) => ({ direccion: m.deCliente ? "IN" : "OUT", tipo: "text", texto: String(m.texto || "").slice(0, 2000) }));
      if (!mensajes.length || mensajes[mensajes.length - 1].direccion !== "IN") return res.status(400).json({ error: "Escribí un mensaje como si fueras el cliente." });
      const r = await bot.pensar(mensajes);
      res.json({ texto: r.texto, fotos: r.fotos, enviarLista: r.enviarLista, derivar: r.derivar, motivo: r.motivo });
    } catch (e) {
      err(res, e);
    }
  });
}

module.exports = {
  firmaValida,
  extraerMensajes,
  parsearJson,
  catalogoTexto,
  calcularItems,
  textoCalculo,
  botPuedeResponder,
  ventanaAbierta,
  historialContents,
  normalizarSalida,
  textoWhatsapp,
  instrucciones,
  urlFotoPublica,
  asegurarTablasWhatsapp,
  crearBotWhatsapp,
  registrarRutasWhatsapp,
};
