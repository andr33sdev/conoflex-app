import { motion } from "framer-motion";
import { NIVELES, nivel } from "./util";

const EASE = [0.22, 1, 0.36, 1];

/** Elegir la urgencia del 1 al 5: cinco botones grandes. */
export function EscalaUrgencia({ valor, onChange }) {
  return (
    <div role="radiogroup" aria-label="Urgencia" className="grid grid-cols-5 gap-2">
      {NIVELES.map((n) => {
        const sel = valor === n.valor;
        return (
          <button key={n.valor} type="button" role="radio" aria-checked={sel} onClick={() => onChange(n.valor)} className={`relative min-h-[76px] rounded-2xl border flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${sel ? "border-transparent" : "border-white/[0.09] bg-white/[0.03] hover:bg-white/[0.07]"}`}>
            {sel && <motion.span layoutId="urgencia-sel" className="absolute inset-0 rounded-2xl" style={{ background: `${n.color}26`, boxShadow: `inset 0 0 0 2px ${n.color}` }} transition={{ duration: 0.3, ease: EASE }} />}
            <span className="relative text-2xl font-extrabold tabular-nums" style={{ color: sel ? n.color : "#a1a1aa" }}>{n.valor}</span>
            <span className={`relative text-[11px] font-bold ${sel ? "text-white" : "text-zinc-500"}`}>{n.nombre}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Cinco rayitas que se llenan hasta el nivel (solo lectura). */
export function RayasUrgencia({ valor, grande }) {
  const n = nivel(valor);
  return (
    <span className="inline-flex items-center gap-2" role="img" aria-label={`Urgencia ${n.valor} de 5: ${n.nombre}`}>
      <span className="flex gap-[3px]">
        {NIVELES.map((x) => (
          <span key={x.valor} className={`rounded-full ${grande ? "h-2 w-5" : "h-1.5 w-3.5"}`} style={{ background: x.valor <= n.valor ? n.color : "rgba(255,255,255,0.1)" }} />
        ))}
      </span>
      <span className={`font-bold ${grande ? "text-sm" : "text-xs"}`} style={{ color: n.color }}>{n.valor} · {n.nombre}</span>
    </span>
  );
}
