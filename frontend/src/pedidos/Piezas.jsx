import { ESTADOS, nroOP } from "./util";

export function ChipEstado({ estado }) {
  const e = ESTADOS[estado] || ESTADOS.PENDIENTE;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none whitespace-nowrap ${e.clase}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${e.punto}`} />
      {e.texto}
    </span>
  );
}

export function ChipOP({ op }) {
  return <span className="inline-flex items-center rounded-lg bg-[#FF5A00]/12 border border-[#FF5A00]/25 px-2 py-1 font-mono text-[12px] font-bold text-[#ff8a4d] leading-none whitespace-nowrap">{nroOP(op)}</span>;
}

export function BarraAvance({ pct, completo }) {
  return (
    <div className="h-2 rounded-full bg-white/[0.07] overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-[width] duration-500 ${completo ? "bg-emerald-400" : "bg-gradient-to-r from-[#FF5A00] to-[#FFD60A]"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export const inputCls =
  "w-full min-h-[52px] rounded-2xl bg-[#17171c] border border-white/[0.1] px-4 text-base text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF5A00]/70 focus:bg-[#1b1b21] transition-colors";
