"use strict";
// Motor de la llamada de voz con Aldana, por turnos (como Jared), para que suene fluida y bien pronunciada.
//
// Idea: el navegador transcribe lo que decís (reconocimiento de voz del navegador) y manda el texto.
// Acá se genera la respuesta con Gemini en streaming, y apenas hay una oración COMPLETA se la manda a
// ElevenLabs para convertirla en voz. Cada oración es un audio limpio y entero → nada entrecortado y
// buena pronunciación. La primera oración sale enseguida; el navegador suelta una muletilla al instante.
//
// No usa el servicio voz/ (WebRTC) ni Meta: anda solo con la clave de ElevenLabs y la de Gemini.
const { instruccionesVoz, NOMBRE_VOZ } = require("./whatsappVoz");
const { catalogoTexto, corto } = require("./whatsapp");

const MODELO = process.env.VOZ_LLM || "gemini-2.5-flash";
const ELEVEN_VOZ = () => process.env.VOZ_ELEVEN_VOZ || "";
const ELEVEN_MODELO = () => process.env.VOZ_ELEVEN_MODELO || "eleven_flash_v2_5";
const MAX_TURNOS = 40; // cuántos pares de ida y vuelta se recuerdan en la llamada
const MAX_MINUTOS = 12;

// Palabras que la voz suele decir "en inglés": se escriben como suenan en castellano.
// Se amplía sin tocar código con VOZ_PRONUNCIAR="palabra=como suena;otra=como suena".
const PRONUNCIAR = {
  semiflexible: "semi flexible",
  semiflexibles: "semi flexibles",
  pvc: "pe ve ce",
  "king cone": "king con",
  light: "lait",
  "wet floor": "uet flor",
};

function tablaPronunciacion() {
  const t = { ...PRONUNCIAR };
  for (const par of String(process.env.VOZ_PRONUNCIAR || "").split(";")) {
    const i = par.indexOf("=");
    if (i > 0) t[par.slice(0, i).trim().toLowerCase()] = par.slice(i + 1).trim();
  }
  return t;
}

/** Deja solo lo que se dice en voz alta: sin HTML, markdown, emojis ni marcadores internos, con la pronunciación arreglada. */
function paraVoz(texto, tabla = tablaPronunciacion()) {
  let t = String(texto || "")
    .replace(/@(?:CONTACTO|CORTAR)\b[^\n]*/gi, "") // marcadores internos, nunca se pronuncian
    .replace(/<[^>]+>/g, " ") // etiquetas HTML
    .replace(/[*_#`~|>]+/g, " ") // markdown
    .replace(/\p{Extended_Pictographic}/gu, "") // emojis
    .replace(/[ \t]+/g, " ")
    .trim();
  const claves = Object.keys(tabla).filter((k) => tabla[k].toLowerCase() !== k).sort((a, b) => b.length - a.length);
  if (claves.length) {
    const re = new RegExp("(?<![\\p{L}\\p{N}])(" + claves.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?![\\p{L}\\p{N}])", "giu");
    t = t.replace(re, (m) => tabla[m.toLowerCase()] ?? m);
  }
  return t.trim();
}

/** Separa el texto que va llegando en oraciones completas para decir en voz.
 *  La primera sale apenas termina (aunque sea corta) para empezar a hablar enseguida. */
class Oraciones {
  constructor(minLen = 25) {
    this.buf = "";
    this.minLen = minLen;
    this.empezo = false;
  }
  feed(delta) {
    this.buf += delta;
    const out = [];
    const re = /[.!?…]+(?=\s)|\n/g;
    let m;
    while ((m = re.exec(this.buf))) {
      const fin = m.index + m[0].length;
      const trozo = this.buf.slice(0, fin).trim();
      if (trozo && (trozo.length >= this.minLen || !this.empezo)) {
        out.push(trozo);
        this.buf = this.buf.slice(fin);
        this.empezo = true;
        re.lastIndex = 0;
      }
    }
    return out;
  }
  flush() {
    const resto = this.buf.trim();
    this.buf = "";
    return resto ? [resto] : [];
  }
}

/** Saca de la respuesta los marcadores que el modelo agrega (contacto a tomar, cortar la llamada). */
function leerMarcadores(texto) {
  const res = { contacto: null, cortar: false };
  const t = String(texto || "");
  if (/@CORTAR\b/i.test(t)) res.cortar = true;
  const m = t.match(/@CONTACTO\b([^\n]*)/i);
  if (m) {
    const campos = {};
    for (const par of m[1].split(";")) {
      const i = par.indexOf("=");
      if (i > 0) campos[par.slice(0, i).trim().toLowerCase()] = par.slice(i + 1).trim();
    }
    const c = {
      nombre: corto(campos.nombre || "", 120),
      empresa: corto(campos.empresa || "", 120),
      telefono: corto(campos.telefono || "", 40),
      mail: corto(campos.mail || "", 120),
      motivo: corto(campos.motivo || "", 500),
    };
    if (c.telefono || c.mail) res.contacto = c;
  }
  return res;
}

const INSTRUCCIONES_TURNOS = `

CÓMO RESPONDER EN LA LLAMADA (muy importante)
- Es una charla telefónica: contestá en 1 a 3 frases cortas y naturales, y dejá hablar al cliente. Si el tema da para más, decí lo principal y preguntá si querés que siga.
- Escribí SOLO texto plano, tal como se dice en voz alta: nada de HTML, listas, símbolos, asteriscos ni emojis.
- Los precios decilos en palabras ("veinticuatro mil doscientos pesos más IVA"), redondeando los centavos. No leas códigos salvo que te los pidan.
- Mantené acento rioplatense natural toda la llamada.
- Cuando el cliente quiera una cotización formal, comprar, o algo que no podés resolver, pedile nombre, empresa y un teléfono o mail (de a uno, con naturalidad), y SOLO cuando ya los tengas, agregá al final una línea aparte EXACTA: @CONTACTO nombre=...; empresa=...; telefono=...; mail=...; motivo=... (poné solo los datos que tengas). Esa línea no se pronuncia.
- Cuando el cliente se despide o no necesita más, despedite en una frase y agregá al final, en una línea aparte: @CORTAR`;

function sistemaDeLlamada(ctx, quien) {
  return instruccionesVoz({ ...ctx, catalogo: catalogoTexto(ctx.productos), nombreCliente: quien, canal: "web" }) + INSTRUCCIONES_TURNOS;
}

function contents(mensajes) {
  return mensajes.slice(-MAX_TURNOS * 2).map((m) => ({ role: m.rol === "bot" ? "model" : "user", parts: [{ text: m.texto }] }));
}

// --- ElevenLabs -------------------------------------------------------------

function vozConfigurada() {
  return !!(process.env.ELEVENLABS_API_KEY && ELEVEN_VOZ());
}

async function sintetizar(texto) {
  const clean = paraVoz(texto);
  if (!clean) return null;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOZ()}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, accept: "audio/mpeg", "Content-Type": "application/json" },
    body: JSON.stringify({ text: clean, model_id: ELEVEN_MODELO(), language_code: "es" }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}`);
  return Buffer.from(await r.arrayBuffer()).toString("base64");
}

// Muletillas pregrabadas (una vez): el navegador suelta una al instante mientras se piensa la respuesta.
const FRASES_MULETILLA = ["Mmm, a ver.", "A ver...", "Dale, sí.", "Perfecto.", "Mirá..."];
let cacheMuletillas = null;
async function muletillas() {
  if (cacheMuletillas) return cacheMuletillas;
  const out = [];
  for (const f of FRASES_MULETILLA) {
    try {
      const a = await sintetizar(f);
      if (a) out.push(a);
    } catch {
      /* si falla una, seguimos con las que haya */
    }
  }
  cacheMuletillas = out;
  return out;
}

/**
 * Motor de una llamada. Guarda el historial en memoria mientras dura.
 * `ai`: cliente de Gemini (generateContent / generateContentStream).
 */
function crearMotorLlamada({ ai, contexto }) {
  const sesiones = new Map(); // llamadaId → { mensajes, quien, sistema, contacto, cortar, inicio }
  let activas = 0;

  async function iniciar(llamadaId, { quien = null, maxActivas = Number(process.env.VOZ_WEB_MAX || 6) } = {}) {
    // Soltar llamadas que quedaron colgadas (el navegador se cerró sin avisar "fin"): así no se tapa el cupo.
    const limite = MAX_MINUTOS * 60000;
    for (const [id, s] of sesiones) {
      if (Date.now() - s.inicio > limite) {
        sesiones.delete(id);
        activas = Math.max(0, activas - 1);
      }
    }
    if (activas >= maxActivas) throw Object.assign(new Error(`${NOMBRE_VOZ} está con muchas llamadas a la vez. Probá en un minuto.`), { status: 429 });
    const ctx = await contexto();
    const s = { mensajes: [], quien, sistema: sistemaDeLlamada(ctx, quien), contacto: null, cortar: false, inicio: Date.now() };
    sesiones.set(llamadaId, s);
    activas++;
    const seed = quien
      ? `(${quien} te acaba de llamar por voz. Atendé con un saludo cortito presentándote como ${NOMBRE_VOZ} de Conoflex, y preguntale en qué lo podés ayudar.)`
      : `(Un cliente entró a una llamada de voz desde la web. Atendé con un saludo cortito presentándote como ${NOMBRE_VOZ} de Conoflex, y preguntale en qué lo podés ayudar.)`;
    const texto = await generar(s, seed, { guardarUsuario: false });
    return { texto: paraVoz(texto), audio: await sintetizar(texto).catch(() => null), muletillas: await muletillas().catch(() => []), pausa_ms: Number(process.env.VOZ_PAUSA_MS || 600) };
  }

  /** Una respuesta completa (sin streaming): el saludo de apertura. El `seed` es una instrucción, no se guarda como mensaje del cliente. */
  async function generar(s, seed, { guardarUsuario = true } = {}) {
    const base = guardarUsuario ? contents(s.mensajes) : [];
    const r = await ai.models.generateContent({
      model: MODELO,
      contents: [...base, { role: "user", parts: [{ text: seed }] }],
      config: { systemInstruction: s.sistema, temperature: 0.5 },
    });
    const salida = (r.text || "").trim() || "Hola, soy Aldana de Conoflex. ¿En qué te puedo ayudar?";
    aplicar(s, salida);
    return salida;
  }

  function aplicar(s, salida) {
    const marc = leerMarcadores(salida);
    if (marc.contacto) s.contacto = marc.contacto;
    if (marc.cortar) s.cortar = true;
    s.mensajes.push({ rol: "bot", texto: paraVoz(salida) });
  }

  /**
   * Un turno en streaming. `onOracion(audioBase64, texto)` se llama por cada oración lista.
   * Devuelve { textoCompleto, contacto, cortar }.
   */
  async function* turno(llamadaId, textoUsuario) {
    const s = sesiones.get(llamadaId);
    if (!s) throw Object.assign(new Error("La llamada ya no está activa."), { status: 404 });
    if (Date.now() - s.inicio > MAX_MINUTOS * 60000) {
      yield { tipo: "chunk", texto: "Se nos acabó el tiempo de la llamada. Si querés te sigo por WhatsApp. ¡Un saludo!", audio: await sintetizar("Se nos acabó el tiempo de la llamada. Si querés te sigo por WhatsApp. ¡Un saludo!").catch(() => null) };
      s.cortar = true;
      yield { tipo: "fin", contacto: s.contacto, cortar: true };
      return;
    }
    s.mensajes.push({ rol: "cliente", texto: textoUsuario });
    const oraciones = new Oraciones();
    let completo = "";
    const emitir = async (frase) => {
      const limpio = paraVoz(frase);
      if (!limpio) return null;
      return { tipo: "chunk", texto: limpio, audio: await sintetizar(frase).catch(() => null) };
    };
    try {
      const stream = await ai.models.generateContentStream({
        model: MODELO,
        contents: contents(s.mensajes),
        config: { systemInstruction: s.sistema, temperature: 0.5 },
      });
      for await (const ev of stream) {
        const delta = ev.text || "";
        if (!delta) continue;
        completo += delta;
        for (const frase of oraciones.feed(delta)) {
          const chunk = await emitir(frase);
          if (chunk) yield chunk;
        }
      }
      for (const frase of oraciones.flush()) {
        const chunk = await emitir(frase);
        if (chunk) yield chunk;
      }
    } catch (e) {
      const fallback = "Perdoná, se me cortó. ¿Me repetís lo último?";
      completo = completo || fallback;
      const chunk = await emitir(fallback).catch(() => null);
      if (chunk) yield chunk;
    }
    const marc = leerMarcadores(completo);
    if (marc.contacto) s.contacto = marc.contacto;
    if (marc.cortar) s.cortar = true;
    s.mensajes.push({ rol: "bot", texto: paraVoz(completo) });
    yield { tipo: "fin", contacto: marc.contacto, cortar: marc.cortar };
  }

  function terminar(llamadaId) {
    const s = sesiones.get(llamadaId);
    if (!s) return null;
    sesiones.delete(llamadaId);
    activas = Math.max(0, activas - 1);
    return {
      duracion: Math.round((Date.now() - s.inicio) / 1000),
      transcripcion: s.mensajes.map((m) => ({ rol: m.rol, texto: m.texto })),
      contacto: s.contacto,
    };
  }

  function existe(llamadaId) {
    return sesiones.has(llamadaId);
  }

  return { iniciar, turno, terminar, existe, _sesiones: sesiones };
}

module.exports = { crearMotorLlamada, Oraciones, paraVoz, leerMarcadores, tablaPronunciacion, vozConfigurada, sintetizar, muletillas, NOMBRE_VOZ };
