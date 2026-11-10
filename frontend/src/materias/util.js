import { useEffect, useState } from "react";
import { animate } from "framer-motion";

export const UNIDADES = [
  { v: "KILOS", c: "kg", t: "Kilos" },
  { v: "UNIDADES", c: "u", t: "Unidades" },
  { v: "METROS", c: "m", t: "Metros" },
  { v: "M2", c: "m²", t: "Metros²" },
  { v: "LITROS", c: "l", t: "Litros" },
  { v: "PAQUETES", c: "paq", t: "Paquetes" },
  { v: "ROLLOS", c: "rollo", t: "Rollos" },
];
export const abrev = (u) => UNIDADES.find((x) => x.v === String(u || "KILOS").toUpperCase())?.c || String(u || "kg").toLowerCase();
export const PLANTAS = ["Argentina", "Paraguay"];

/** Costo en dólares: "US$ 2,60". */
export const usd = (n) => (n == null || !Number.isFinite(Number(n)) ? "—" : `US$ ${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`);
export const nf = (n, d = 2) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString("es-AR", { maximumFractionDigits: d }) : "—");
export const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** sin = no hay; reponer = en o por debajo del punto de pedido; ok = bien. */
export function estadoDe(m) {
  const stock = Number(m.stock_actual) || 0;
  const min = Number(m.stock_minimo) || 0;
  if (stock <= 0) return "sin";
  if (min > 0 && stock <= min) return "reponer";
  return "ok";
}

export const TONO = {
  sin: { texto: "Sin stock", color: "#fb7185", clase: "text-rose-300", punto: "bg-rose-400", chip: "bg-rose-500/12 text-rose-300 border-rose-500/30" },
  reponer: { texto: "Reponer", color: "#FF5A00", clase: "text-[#ff8a4d]", punto: "bg-[#FF5A00]", chip: "bg-[#FF5A00]/12 text-[#ff8a4d] border-[#FF5A00]/30" },
  ok: { texto: "Stock ok", color: "#34d399", clase: "text-emerald-300", punto: "bg-emerald-400", chip: "bg-emerald-500/12 text-emerald-300 border-emerald-500/30" },
};

/** Cuánto llena la barra: el punto de pedido queda al 50 %. Sin punto de pedido no hay referencia. */
export function fraccion(m) {
  const stock = Math.max(0, Number(m.stock_actual) || 0);
  const min = Number(m.stock_minimo) || 0;
  if (min > 0) return Math.min(1, stock / (min * 2));
  return stock > 0 ? 1 : 0;
}

const prefiereQuieto = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Número que "sube" hasta su valor al aparecer. Respeta quien prefiere menos movimiento. */
export function useContar(valor, { duracion = 0.9 } = {}) {
  const [v, setV] = useState(0);
  const quieto = prefiereQuieto();
  useEffect(() => {
    if (quieto) return undefined;
    const c = animate(0, Number(valor) || 0, { duration: duracion, ease: [0.22, 1, 0.36, 1], onUpdate: setV });
    return () => c.stop();
  }, [valor, duracion, quieto]);
  return quieto ? Number(valor) || 0 : v;
}
