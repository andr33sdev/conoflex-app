// Voz de los agentes. Primero intenta la voz natural del servidor (Gemini, siempre femenina);
// si no está disponible, usa la voz del dispositivo pero SOLO si es femenina (si no hay ninguna, no habla).
import { getApiUrl } from "../apiConfig";

export const soportaDictado = () => typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
export const soportaAudio = () => typeof window !== "undefined" && typeof Audio !== "undefined";

/** Texto apto para leer: sin markdown, sin símbolos de tablas ni emojis, y acotado (el detalle queda en pantalla). */
export function textoParaVoz(texto, max = 420) {
  let t = String(texto || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*\|?[-:| ]{3,}\|?\s*$/gm, " ")
    .replace(/\|/g, ", ")
    .replace(/[*_`#>~]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\$\s?(\d[\d.,]*)/g, "$1 pesos")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ". ")
    .replace(/\.\s*\./g, ".")
    .trim();
  if (t.length > max) {
    const corte = t.slice(0, max);
    const fin = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("? "), corte.lastIndexOf("! "));
    t = (fin > 120 ? corte.slice(0, fin + 1) : corte.replace(/\s\S*$/, "")) + " El detalle completo lo tenés en pantalla.";
  }
  return t;
}

// ---------- voz del dispositivo (solo femenina) ----------
const FEMENINAS = /helena|paulina|sabina|m[oó]nica|monica|elena|laura|luc[ií]a|lucia|sof[ií]a|sofia|elsa|marisol|paloma|marina|carolina|valentina|camila|female|mujer|google espa[nñ]ol|google us espa|dalia|elvira|ximena|catalina|isabela|natalia|mia|luciana/i;
const MASCULINAS = /jorge|diego|carlos|juan|pablo|ra[uú]l|raul|enrique|miguel|alvaro|[aá]lvaro|andr[eé]s|alberto|antonio|fernando|male|hombre|jaime|pedro|luis|ricardo|alex\b|tom\b|daniel|david|jorge/i;
let cache;
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
  cache = orden.find(Boolean) || null;
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
  u.rate = 1;
  u.pitch = 1.08;
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

// ---------- voz natural (servidor) con análisis del volumen para mover la boca ----------
let audioCtx = null;
function hablarNatural(blob, { onInicio, onFin, onNivel }) {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  let raf = 0;
  let terminado = false;
  let analizador = null;
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
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const fuente = audioCtx.createMediaElementSource(audio);
    analizador = audioCtx.createAnalyser();
    analizador.fftSize = 512;
    fuente.connect(analizador);
    analizador.connect(audioCtx.destination);
    audioCtx.resume?.();
  } catch {
    analizador = null; // sin análisis: la boca sigue un ritmo propio
  }
  const datos = analizador ? new Uint8Array(analizador.fftSize) : null;
  const medir = () => {
    if (analizador) {
      analizador.getByteTimeDomainData(datos);
      let suma = 0;
      for (let i = 0; i < datos.length; i++) {
        const x = (datos[i] - 128) / 128;
        suma += x * x;
      }
      onNivel?.(Math.min(1, Math.sqrt(suma / datos.length) * 3.2));
    }
    raf = requestAnimationFrame(medir);
  };
  audio.onended = fin;
  audio.onerror = fin;
  const listo = audio.play().then(() => {
    onInicio?.();
    if (analizador) medir();
    return true;
  });
  return { cortar: fin, listo };
}

/**
 * Lee `texto` con la voz de Lía. Devuelve { cortar } y avisa por callbacks.
 * Orden: voz natural del servidor → voz femenina del dispositivo → nada (y onSinVoz).
 */
export function hablar(texto, { base, onInicio, onFin, onPulso, onNivel, onSinVoz }) {
  let cancelado = false;
  let cortarActual = () => {};
  const usarDispositivo = () => {
    if (cancelado) return;
    if (!hayVozFemenina()) {
      onSinVoz?.();
      onFin?.();
      return;
    }
    cortarActual = hablarDispositivo(texto, { onInicio, onFin, onPulso });
  };
  (async () => {
    try {
      const res = await fetch(getApiUrl(`${base}/voz`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
      if (!res.ok) throw new Error("sin voz natural");
      const blob = await res.blob();
      if (cancelado) return;
      const r = hablarNatural(blob, { onInicio, onFin, onNivel });
      cortarActual = r.cortar;
      await r.listo;
    } catch {
      usarDispositivo();
    }
  })();
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
