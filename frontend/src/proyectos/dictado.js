// Dictado con el reconocimiento de voz del navegador (Chrome, Edge, Android). Cada frase dictada se suma al texto.
import { useEffect, useRef, useState } from "react";

export function useDictado(alTexto) {
  const [escuchando, setEscuchando] = useState(false);
  const rec = useRef(null);
  const Reconocedor = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const alternar = () => {
    if (!Reconocedor) return;
    if (escuchando) {
      rec.current?.stop();
      return;
    }
    const r = new Reconocedor();
    r.lang = "es-AR";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      const t = Array.from(e.results).slice(e.resultIndex).map((x) => x[0].transcript).join(" ");
      if (t.trim()) alTexto(t.trim());
    };
    r.onend = () => setEscuchando(false);
    r.onerror = () => setEscuchando(false);
    rec.current = r;
    r.start();
    setEscuchando(true);
  };
  useEffect(() => () => rec.current?.stop(), []);
  return { disponible: !!Reconocedor, escuchando, alternar };
}
