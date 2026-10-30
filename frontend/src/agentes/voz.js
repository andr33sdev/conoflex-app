// Voz del navegador: dictado (SpeechRecognition) y lectura en voz alta (speechSynthesis).
// No usa servicios pagos ni tokens: depende de lo que soporte el navegador/celular de cada persona.

export const soportaDictado = () => typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
export const soportaLectura = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

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

let vozElegida;
function elegirVoz() {
  if (vozElegida !== undefined) return vozElegida;
  const voces = window.speechSynthesis.getVoices();
  if (!voces.length) return null; // todavía no cargaron: se reintenta en la próxima
  const es = voces.filter((v) => /^es/i.test(v.lang));
  const femenina = /helena|paulina|sabina|m[oó]nica|elena|laura|luc[ií]a|sof[ií]a|elsa|marisol|paloma|female|mujer|google espa/i;
  const orden = [
    es.find((v) => /es[-_]AR/i.test(v.lang) && femenina.test(v.name)),
    es.find((v) => /es[-_](AR|419|MX|US|UY|CL)/i.test(v.lang) && femenina.test(v.name)),
    es.find((v) => femenina.test(v.name)),
    es.find((v) => /es[-_]AR/i.test(v.lang)),
    es[0],
  ];
  vozElegida = orden.find(Boolean) || null;
  return vozElegida;
}

/** Lee `texto` en voz alta. Devuelve una función para cortar. onPulso se llama en cada palabra (sincroniza la boca). */
export function hablar(texto, { onInicio, onFin, onPulso } = {}) {
  if (!soportaLectura() || !texto) {
    onFin?.();
    return () => {};
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  const v = elegirVoz();
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  } else u.lang = "es-AR";
  u.rate = 1.04;
  u.pitch = 1.12;
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

export function cortarVoz() {
  if (soportaLectura()) window.speechSynthesis.cancel();
}

/** Dictado. Devuelve { parar } y avisa por callbacks: onTexto(texto, esFinal), onFin(error?). */
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
  return { parar: () => { try { r.stop(); } catch { /* ya estaba detenido */ } } };
}
