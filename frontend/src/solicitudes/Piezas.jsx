import { ESTADO, PASOS, URGENCIA } from "./util";

export function ChipEstado({ estado }) {
  const e = ESTADO[estado] || ESTADO.SOLICITADO;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none ${e.clase}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${e.punto}`} />
      {e.texto}
    </span>
  );
}

export function ChipUrgencia({ urgencia }) {
  const u = URGENCIA[urgencia] || URGENCIA.BAJA;
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide leading-none ${u.clase}`}>{u.texto}</span>;
}

/** Cuatro tramos: Solicitado → Atendido → Disponible → Entregado. */
export function Recorrido({ estado }) {
  if (estado === "CANCELADO") return <div className="h-1 rounded-full bg-rose-500/40" aria-label="Cancelada" />;
  const idx = Math.max(0, PASOS.indexOf(estado));
  return (
    <div className="flex gap-1" role="img" aria-label={`Paso ${idx + 1} de 4: ${ESTADO[estado]?.texto || ""}`}>
      {PASOS.map((p, i) => (
        <span key={p} className={`h-1 flex-1 rounded-full transition-colors ${i <= idx ? (estado === "ENTREGADO" ? "bg-emerald-400" : "bg-gradient-to-r from-[#FF5A00] to-[#FFD60A]") : "bg-white/[0.08]"}`} />
      ))}
    </div>
  );
}

export function BarraRetiro({ retirada, total }) {
  const pct = total > 0 ? Math.min(100, (retirada / total) * 100) : 0;
  return (
    <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
      <div className="h-full rounded-full bg-gradient-to-r from-[#FF5A00] to-[#FFD60A] transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Campo({ etiqueta, ayuda, children, derecha }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-zinc-500">{etiqueta}</span>
        {derecha}
      </div>
      {children}
      {ayuda && <p className="mt-1.5 text-xs text-zinc-500">{ayuda}</p>}
    </div>
  );
}

export const inputCls =
  "w-full min-h-[52px] rounded-2xl bg-[#17171c] border border-white/[0.1] px-4 text-base text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF5A00]/70 focus:bg-[#1b1b21] transition-colors";
