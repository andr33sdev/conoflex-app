// Voz de los agentes. Primero intenta la voz natural del servidor (Gemini, siempre femenina);
// si no está disponible, usa la voz del dispositivo pero SOLO si es femenina (si no hay ninguna, no habla).
import { getApiUrl } from "../apiConfig";

export const soportaDictado = () => typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
export const soportaAudio = () => typeof window !== "undefined" && typeof Audio !== "undefined";

/** Limpia markdown, símbolos y emojis para que se pueda leer en voz alta. */
function limpiarParaVoz(texto) {
  return String(texto || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*\|?[-:| ]{3,}\|?\s*$/gm, " ")
    .replace(/\|/g, ", ")
    .replace(/[*_`#>~]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\$\s?(\d[\d.,]*)/g, "$1 pesos")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, ". ")
    .replace(/\.\s*\./g, ".")
    .trim();
}

/**
 * Lo que Lía dice en voz alta. Respuestas cortas: se leen enteras. Respuestas largas (listas, tablas o mucho texto):
 * solo la primera frase, a modo de introducción ("Listo, te preparé la liquidación"), y el detalle se lee en pantalla.
 */
export function textoParaVoz(texto, { maxIntro = 230, maxCorto = 300 } = {}) {
  const crudo = String(texto || "").trim();
  const lineasLista = (crudo.match(/^\s*([-*•]\s|\d+[.)]\s|\|)/gm) || []).length;
  const largo = crudo.length > maxCorto || lineasLista >= 2 || /\n#{1,4}\s/.test(crudo);
  if (!largo) return limpiarParaVoz(crudo);
  const primero = crudo.split(/\n\s*\n/)[0].split("\n").filter((l) => !/^\s*([-*•]\s|\d+[.)]\s|\||#)/.test(l)).join(" ");
  let intro = limpiarParaVoz(primero);
  if (intro.length > maxIntro) {
    const corte = intro.slice(0, maxIntro);
    const fin = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("? "), corte.lastIndexOf("! "));
    intro = fin > 60 ? corte.slice(0, fin + 1) : corte.replace(/\s\S*$/, "") + ".";
  }
  if (!intro) intro = "Listo, ya lo tengo.";
  return /pantalla/i.test(intro) ? intro : `${intro} El detalle lo tenés en pantalla.`;
}

// ---------- voz del dispositivo (solo femenina) ----------
const FEMENINAS = /helena|paulina|sabina|m[oó]nica|monica|elena|laura|luc[ií]a|lucia|sof[ií]a|sofia|elsa|marisol|paloma|marina|carolina|valentina|camila|female|mujer|google espa[nñ]ol|google us espa|dalia|elvira|ximena|catalina|isabela|natalia|mia|luciana/i;
const MASCULINAS = /jorge|diego|carlos|juan|pablo|ra[uú]l|raul|enrique|miguel|alvaro|[aá]lvaro|andr[eé]s|alberto|antonio|fernando|male|hombre|jaime|pedro|luis|ricardo|alex\b|tom\b|daniel|david|jorge/i;
let cache;
// Cada agente suena distinto también con la voz del dispositivo: otra voz femenina si hay más de una, y otro tono y ritmo.
let perfilVoz = { indice: 0, tono: 1.08, ritmo: 1 };
export function fijarVozAgente(v) {
  perfilVoz = { indice: 0, tono: 1.08, ritmo: 1, ...v };
  cache = undefined;
}
export function vozFemenina() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voces = window.speechSynthesis.getVoices();
  if (!voces.length) return undefined; // aún no cargaron
  if (cache) return cache;
  const es = voces.filter((v) => /^es/i.test(v.lang) && !MASCULINAS.test(v.name));
  const fem = es.filter((v) => FEMENINAS.test(v.name));
  const orden = [
    fem.find((v) => /es[-_]AR/i.test(v.lang)),
    fem.find((v) => /es[-_](419|MX|US|UY|CL|CO)/i.test(v.lang)),
    fem[0],
  ];
  const base = orden.find(Boolean) || null;
  // Con indice > 0 se prefiere otra voz femenina distinta de la primera (si el dispositivo tiene más de una).
  const otras = fem.filter((v) => v !== base);
  cache = perfilVoz.indice > 0 && otras.length ? otras[(perfilVoz.indice - 1) % otras.length] : base;
  return cache;
}
export const hayVozFemenina = () => !!vozFemenina();

function hablarDispositivo(texto, { onInicio, onFin, onPulso }) {
  const v = vozFemenina();
  if (!v) {
    onFin?.();
    return () => {};
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.voice = v;
  u.lang = v.lang;
  u.rate = perfilVoz.ritmo;
  u.pitch = perfilVoz.tono;
  let terminado = false;
  const fin = () => {
    if (terminado) return;
    terminado = true;
    onFin?.();
  };
  u.onstart = () => onInicio?.();
  u.onboundary = () => onPulso?.();
  u.onend = fin;
  u.onerror = fin;
  synth.speak(u);
  return () => {
    synth.cancel();
    fin();
  };
}

// ---------- voz natural (servidor) ----------
// El audio se reproduce con un <audio> común (sin enganchar nada del AudioContext, que si queda "suspendido" deja todo mudo).
// La boca se mueve con una envolvente de volumen calculada de antemano a partir del propio WAV.
const VENTANA = 0.025; // segundos por muestra de la envolvente

/** Envolvente de volumen (0..1) de un WAV PCM de 16 bits mono. Devuelve null si el formato no es el esperado. */
export async function envolventeDeWav(blob) {
  try {
    const buf = await blob.arrayBuffer();
    const dv = new DataView(buf);
    if (dv.byteLength < 48 || dv.getUint32(0) !== 0x52494646) return null; // "RIFF"
    const frecuencia = dv.getUint32(24, true) || 24000;
    const bits = dv.getUint16(34, true);
    if (bits !== 16) return null;
    let pos = 12;
    let ini = -1;
    let largo = 0;
    while (pos + 8 <= dv.byteLength) {
      const id = dv.getUint32(pos);
      const tam = dv.getUint32(pos + 4, true);
      if (id === 0x64617461) { // "data"
        ini = pos + 8;
        largo = Math.min(tam, dv.byteLength - ini);
        break;
      }
      pos += 8 + tam + (tam % 2);
    }
    if (ini < 0) return null;
    const porVentana = Math.max(1, Math.round(frecuencia * VENTANA));
    const n = Math.floor(largo / 2 / porVentana);
    const env = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let suma = 0;
      for (let k = 0; k < porVentana; k++) {
        const x = dv.getInt16(ini + (i * porVentana + k) * 2, true) / 32768;
        suma += x * x;
      }
      env[i] = Math.sqrt(suma / porVentana);
    }
    const orden = Array.from(env).sort((x, y) => x - y);
    const p90 = orden[Math.floor(orden.length * 0.9)] || 0.1;
    const k = 0.75 / Math.max(0.02, p90);
    for (let i = 0; i < n; i++) env[i] = Math.min(1, env[i] * k);
    return env;
  } catch {
    return null;
  }
}

function hablarNatural(prep, { onInicio, onFin, onNivel, onFallo }) {
  const url = URL.createObjectURL(prep.blob);
  const audio = new Audio(url);
  audio.preload = "auto";
  let raf = 0;
  let terminado = false;
  const limpiar = () => {
    cancelAnimationFrame(raf);
    audio.pause();
    URL.revokeObjectURL(url);
  };
  const fin = () => {
    if (terminado) return;
    terminado = true;
    limpiar();
    onFin?.();
  };
  const medir = () => {
    const env = prep.envolvente;
    if (env && env.length) {
      const i = Math.min(env.length - 1, Math.floor(audio.currentTime / VENTANA));
      const suave = (env[i] + (env[i + 1] ?? env[i])) / 2;
      onNivel?.(suave);
    } else {
      onNivel?.(0.35 + 0.3 * Math.abs(Math.sin(audio.currentTime * 9)));
    }
    raf = requestAnimationFrame(medir);
  };
  audio.onended = fin;
  audio.onerror = () => {
    if (terminado) return;
    terminado = true;
    limpiar();
    onFallo?.();
  };
  audio.volume = 1;
  audio.play().then(
    () => {
      if (terminado) return;
      onInicio?.();
      medir();
    },
    () => {
      if (terminado) return;
      terminado = true;
      limpiar();
      onFallo?.();
    },
  );
  return { cortar: fin };
}

const esperarVoces = () =>
  new Promise((ok) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return ok();
    if (window.speechSynthesis.getVoices().length) return ok();
    const t = setTimeout(ok, 1200);
    window.speechSynthesis.addEventListener?.("voiceschanged", () => { clearTimeout(t); ok(); }, { once: true });
  });

/**
 * Prepara la voz ANTES de mostrar la respuesta, para que texto, voz y animación arranquen juntos.
 * Devuelve { tipo: "natural", blob, envolvente } | { tipo: "dispositivo" } | { tipo: "nada" }.
 */
export async function prepararVoz(texto, { base, timeoutMs = 14000 } = {}) {
  for (let intento = 0; intento < 2; intento++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(getApiUrl(`${base}/voz`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }), signal: ctl.signal });
      if (res.status === 403 || res.status === 429 || res.status === 400) throw Object.assign(new Error(`voz ${res.status}`), { definitivo: true });
      if (!res.ok) throw new Error(`voz ${res.status}`);
      const blob = await res.blob();
      if (!blob.size) throw new Error("audio vacío");
      return { tipo: "natural", blob, envolvente: await envolventeDeWav(blob) };
    } catch (e) {
      console.warn("[Lía] voz natural no disponible:", e.message);
      if (e.definitivo) break;
    } finally {
      clearTimeout(t);
    }
  }
  await esperarVoces();
  return hayVozFemenina() ? { tipo: "dispositivo" } : { tipo: "nada" };
}

/**
 * Reproduce una voz ya preparada. Devuelve { cortar } y avisa por callbacks.
 * Si la natural falla al reproducirse, cae a la voz femenina del dispositivo; si no hay, onSinVoz.
 */
export function reproducirVoz(prep, texto, { onInicio, onFin, onPulso, onNivel, onSinVoz }) {
  let cortarActual = () => {};
  let cancelado = false;
  const usarDispositivo = () => {
    if (cancelado) return;
    if (!hayVozFemenina()) {
      onSinVoz?.();
      onFin?.();
      return;
    }
    cortarActual = hablarDispositivo(texto, { onInicio, onFin, onPulso });
  };
  if (prep?.tipo === "natural") {
    const r = hablarNatural(prep, { onInicio, onFin, onNivel, onFallo: usarDispositivo });
    cortarActual = r.cortar;
  } else if (prep?.tipo === "dispositivo") usarDispositivo();
  else {
    onSinVoz?.();
    onFin?.();
  }
  return {
    cortar: () => {
      cancelado = true;
      cortarActual();
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    },
  };
}

/** Dictado. Devuelve { parar } y avisa por callbacks: onTexto(texto, esFinal), onFin(error?, ultimo). */
export function dictar({ onTexto, onFin }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    onFin?.("no-soportado");
    return { parar: () => {} };
  }
  const r = new SR();
  r.lang = "es-AR";
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  let ultimo = "";
  let error = null;
  r.onresult = (ev) => {
    let texto = "";
    let final = false;
    for (let i = 0; i < ev.results.length; i++) {
      texto += ev.results[i][0].transcript;
      if (ev.results[i].isFinal) final = true;
    }
    ultimo = texto;
    onTexto?.(texto.trim(), final);
  };
  r.onerror = (ev) => {
    error = ev.error || "error";
  };
  r.onend = () => onFin?.(error, ultimo.trim());
  try {
    r.start();
  } catch {
    onFin?.("no-iniciado");
  }
  return {
    parar: () => {
      try {
        r.stop();
      } catch {
        /* ya estaba detenido */
      }
    },
  };
}
