import { CheckCircle2, PenLine } from "lucide-react";

const ESTADOS = {
  COMPLETADA: { t: "Completada", c: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300", p: "bg-emerald-400" },
  CANCELADA: { t: "Cancelada", c: "border-rose-500/40 bg-rose-500/10 text-rose-300", p: "bg-rose-400" },
  PENDIENTE: { t: "Pendiente", c: "border-amber-500/40 bg-amber-500/10 text-amber-300", p: "bg-amber-400" },
};

export function ChipEstado({ estado }) {
  const e = ESTADOS[estado] || ESTADOS.PENDIENTE;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none whitespace-nowrap ${e.c}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${e.p}`} />{e.t}
    </span>
  );
}

export function ChipFirma({ rol, firmada }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none whitespace-nowrap ${firmada ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300" : "border-white/[0.1] text-zinc-500"}`}>
      {firmada ? <CheckCircle2 size={12} /> : <PenLine size={12} />} {rol}
    </span>
  );
}

export function BarraAvance({ pct }) {
  return (
    <div className="h-2 rounded-full bg-white/[0.07] overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de recepción">
      <div className={`h-full rounded-full transition-[width] duration-500 ${pct >= 100 ? "bg-emerald-400" : "bg-gradient-to-r from-[#FF5A00] to-[#FFD60A]"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ChipUrgente() {
  return <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-extrabold leading-none text-rose-300">Urgente</span>;
}
