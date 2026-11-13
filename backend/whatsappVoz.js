"use strict";
// Puente entre el chat de WhatsApp (este backend) y el servicio de voz (carpeta voz/, en Python).
//
// El servicio de voz atiende las llamadas de WhatsApp y le pide a este backend:
//   GET  /api/public/voz/contexto?telefono=…  qué sabe el bot (catálogo, precios, reglas, charla previa)
//   POST /api/public/voz/fin                   la transcripción al cortar (queda en Conversaciones)
//   POST /api/public/voz/derivar               pasar el cliente a una persona
//   POST /api/public/voz/enviar                mandarle algo por escrito al chat durante la llamada
// Solo responde a pedidos del mismo servidor (127.0.0.1) que traigan el secreto VOZ_SECRETO.
const crypto = require("crypto");
const { leerPrecios } = require("./comercial/catalogo");
const { catalogoTexto, corto, enviarTexto } = require("./whatsapp");

const NOMBRE_VOZ = "Aldana";

function instruccionesVoz({ reglasComerciales, reglasWhatsapp, notas, correcciones, catalogo, nombreCliente, charlaPrevia, canal = "whatsapp" }) {
  const web = canal === "web";
  const quien = web
    ? `Sos ${NOMBRE_VOZ}, de Conoflex Argentina, fábrica de productos de seguridad vial (conos, reductores de velocidad, topes de estacionamiento, separadores de carril, delineadores y más). Atendés llamadas de voz que entran desde la web y la app de Conoflex.`
    : `Sos ${NOMBRE_VOZ}, y atendés por teléfono las llamadas de WhatsApp de Conoflex Argentina, fábrica de productos de seguridad vial (conos, reductores de velocidad, topes de estacionamiento, separadores de carril, delineadores y más).`;
  const porEscrito = web
    ? `- Esta llamada no está conectada a un chat: no podés mandar nada por escrito. Si quiere precios por escrito o una cotización formal, pedile nombre, empresa y un teléfono o mail, y usá dejar_contacto para que un vendedor le escriba.`
    : `- Si el cliente quiere los precios por escrito, fotos, la lista o un resumen, usá enviar_por_whatsapp con un texto corto y claro (ahí sí podés usar *negrita*), y avisale que se lo mandaste al chat.`;
  const derivar = web
    ? `- Reclamos, devoluciones, facturas, pagos, estado de un pedido ya hecho, descuentos especiales, un pedido concreto o algo que no está en el catálogo ni en las reglas: pedile nombre, empresa y un teléfono o mail (de a uno, con naturalidad), repetí el teléfono para confirmarlo y usá dejar_contacto. Decile que un vendedor lo contacta a la brevedad, sin prometer horarios.`
    : `- Reclamos, devoluciones, facturas, pagos, estado de un pedido ya hecho, descuentos especiales o algo que no está en el catálogo ni en las reglas: usá derivar_a_persona y decile que alguien del equipo le escribe por WhatsApp a la brevedad, sin prometer horarios.`;
  return `${quien}

CÓMO HABLAR (esto es una llamada, no un chat)
- Hablá como una vendedora argentina amable y segura: español rioplatense, con "vos", natural y cálida.
- Frases cortas: una o dos oraciones por turno, y dejá hablar al cliente. Nunca leas listas largas: ofrecé como mucho dos o tres opciones y preguntá cuál le sirve.
- Si te interrumpen, cortá lo que estabas diciendo y escuchá.
- Si no entendés algo, pedí que lo repita con naturalidad.
- Los precios decilos como los diría una persona: "treinta y cinco mil trescientos pesos más IVA" (redondeá los centavos). No leas códigos de producto salvo que te los pidan.
- Nada de símbolos, asteriscos ni formato: todo lo que digas se escucha.
${nombreCliente ? `- Quien llama figura como "${nombreCliente}". Podés llamarlo por el nombre si suena natural.\n` : ""}
PRODUCTOS Y PRECIOS
- Solo ofrecé productos del CATÁLOGO de abajo. Nunca inventes productos, medidas, stock, plazos ni precios.
- Podés pasar precios de lista a cualquiera que pregunte, respetando las condiciones de las reglas (IVA, envío, etc.).
- NUNCA hagas cuentas de cabeza: si el cliente da cantidades, usá la herramienta calcular_presupuesto y decí el total que te devuelve.
${porEscrito}

CUÁNDO PASAR A UNA PERSONA
${derivar}

CORTAR
- Cuando el cliente se despide o ya no necesita nada, despedite en una frase y usá cortar_llamada.

REGLAS COMERCIALES (escritas para presupuestos por mail: tomá solo lo comercial —precios, IVA, descuentos, entregas, pagos— e ignorá todo lo de formato)
${reglasComerciales || "(sin reglas cargadas)"}
${notas ? `\n${notas}\n` : ""}
REGLAS PROPIAS DE WHATSAPP (mandan sobre todo lo anterior; lo que hable de formato escrito no aplica a la llamada)
${reglasWhatsapp || "(sin reglas propias)"}
${correcciones ? `\nCORRECCIONES DEL EQUIPO (vienen del chat; seguí el criterio y el tono):\n${correcciones}\n` : ""}${charlaPrevia ? `\nLO ÚLTIMO QUE HABLÓ ESTE CLIENTE POR CHAT (para no preguntarle de nuevo):\n${charlaPrevia}\n` : ""}
CATÁLOGO (código | nombre | categoría | medidas | precio | uso)
${catalogo || "(catálogo vacío: no pases precios y derivá)"}`;
}

/** Precios únicos por código, para que el servicio de voz calcule totales exactos. */
function preciosVoz(productos) {
  return productos
    .map((p) => ({ codigo: p.codigo, nombre: p.nombre, unitario: leerPrecios(p.precio_lista).unico }))
    .filter((p) => p.codigo && p.unitario);
}

const duracionTexto = (seg) => {
  const s = Math.max(0, Math.round(Number(seg) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Texto que queda en la bandeja al cortar: "📞 Llamada (2:31)" + lo que se dijo. */
function transcripcionTexto({ duracion, transcripcion }) {
  const lineas = (Array.isArray(transcripcion) ? transcripcion : [])
    .map((t) => ({ quien: t?.rol === "bot" ? NOMBRE_VOZ : "Cliente", texto: corto(t?.texto, 1200) }))
    .filter((t) => t.texto)
    .map((t) => `${t.quien}: ${t.texto}`);
  const cabeza = `📞 Llamada${duracion ? ` (${duracionTexto(duracion)})` : ""}`;
  return [cabeza, ...(lineas.length ? lineas : ["(sin transcripción)"])].join("\n").slice(0, 60000);
}

/** Solo el propio servidor, con el secreto compartido. */
function esLocalConSecreto(req) {
  const ip = String(req.socket?.remoteAddress || "");
  const local = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  const secreto = process.env.VOZ_SECRETO || "";
  const recibido = String(req.headers["x-voz-secreto"] || "");
  if (!local || secreto.length < 16 || recibido.length !== secreto.length) return false;
  return crypto.timingSafeEqual(Buffer.from(recibido), Buffer.from(secreto));
}

function registrarRutasVoz(app, { db, bot }) {
  const soloLocal = (req, res, next) => (esLocalConSecreto(req) ? next() : res.sendStatus(403));
  const err = (res, e) => {
    console.error("[voz]", e.message);
    res.status(500).json({ error: e.message });
  };
  const telefonoDe = (v) => String(v || "").replace(/\D/g, "").slice(0, 20);

  app.get("/api/public/voz/contexto", soloLocal, async (req, res) => {
    try {
      const telefono = telefonoDe(req.query.telefono);
      const ctx = await bot.contexto();
      let nombreCliente = null;
      let charlaPrevia = "";
      if (telefono) {
        const [[conv]] = await db.query("SELECT id, nombre FROM wa_conversaciones WHERE telefono = ?", [telefono]);
        if (conv) {
          nombreCliente = conv.nombre;
          const [msgs] = await db.query("SELECT direccion, texto FROM (SELECT id, direccion, texto FROM wa_mensajes WHERE conversacion_id = ? AND error IS NULL ORDER BY id DESC LIMIT 12) t ORDER BY id", [conv.id]);
          charlaPrevia = msgs.map((m) => `${m.direccion === "IN" ? "Cliente" : "Conoflex"}: ${corto(m.texto, 300)}`).join("\n");
        }
      }
      res.json({
        atender: (await bot.botGlobal()) && process.env.VOZ_ACTIVA !== "0",
        nombre: NOMBRE_VOZ,
        instrucciones: instruccionesVoz({ ...ctx, catalogo: catalogoTexto(ctx.productos), nombreCliente, charlaPrevia }),
        precios: preciosVoz(ctx.productos),
      });
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/public/voz/fin", soloLocal, async (req, res) => {
    try {
      const telefono = telefonoDe(req.body?.telefono);
      if (!telefono) return res.status(400).json({ error: "falta telefono" });
      const conv = await bot.asegurarConversacion(telefono, req.body?.nombre);
      await bot.guardarMensaje(conv.id, { direccion: "OUT", autor: "LLAMADA", tipo: "call", texto: transcripcionTexto(req.body || {}) });
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/public/voz/derivar", soloLocal, async (req, res) => {
    try {
      const telefono = telefonoDe(req.body?.telefono);
      if (!telefono) return res.status(400).json({ error: "falta telefono" });
      const conv = await bot.asegurarConversacion(telefono, req.body?.nombre);
      await bot.derivar(conv, `📞 En llamada: ${req.body?.motivo || "pidió hablar con una persona"}`);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/public/voz/enviar", soloLocal, async (req, res) => {
    try {
      const telefono = telefonoDe(req.body?.telefono);
      const texto = String(req.body?.texto || "").trim().slice(0, 3500);
      if (!telefono || !texto) return res.status(400).json({ error: "faltan datos" });
      const conv = await bot.asegurarConversacion(telefono, req.body?.nombre);
      const env = await enviarTexto(telefono, texto);
      await bot.guardarMensaje(conv.id, { waId: env?.messages?.[0]?.id, direccion: "OUT", autor: "BOT", texto });
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });
}

module.exports = { instruccionesVoz, preciosVoz, transcripcionTexto, duracionTexto, esLocalConSecreto, registrarRutasVoz, NOMBRE_VOZ };
