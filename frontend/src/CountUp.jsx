import { useEffect, useRef, useState } from "react";

/** Cifra que sube hasta su valor la primera vez y cuando cambia. Respeta "reducir movimiento". */
export default function CountUp({ value, duration = 700 }) {
  const destino = Number(value) || 0;
  const [mostrado, setMostrado] = useState(destino);
  const desdeRef = useRef(0);

  useEffect(() => {
    const reducir = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reducir) {
      const id = requestAnimationFrame(() => setMostrado(destino));
      return () => cancelAnimationFrame(id);
    }
    const desde = desdeRef.current;
    const t0 = performance.now();
    let raf;
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / duration);
      const suave = 1 - Math.pow(1 - k, 3);
      setMostrado(desde + (destino - desde) * suave);
      if (k < 1) raf = requestAnimationFrame(paso);
      else desdeRef.current = destino;
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [destino, duration]);

  const dec = Math.min(3, (String(destino).split(".")[1] || "").length);
  const n = dec === 0 ? Math.round(mostrado) : Number(mostrado.toFixed(dec));
  return <>{n.toLocaleString(undefined, { maximumFractionDigits: dec })}</>;
}
