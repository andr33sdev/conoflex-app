import { NIVELES_PRIORIDAD } from "./prioridades";

/** Selector de prioridad: 5 botones, siempre visibles (sin menú desplegable). */
export default function PrioridadPills({ valor, onChange }) {
  return (
    <div role="radiogroup" aria-label="Prioridad" className="grid grid-cols-5 gap-1.5">
      {NIVELES_PRIORIDAD.map((p) => {
        const activo = Number(valor) === p.valor;
        return (
          <button
            key={p.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onChange(p.valor)}
            title={p.label}
            className={`min-h-[44px] rounded-xl border text-sm font-extrabold transition-all cursor-pointer flex flex-col items-center justify-center leading-none gap-1 ${activo ? `${p.badgeBg} ${p.border} ${p.text}` : "border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:text-zinc-200"}`}
          >
            <span className="tabular-nums text-base">{p.valor}</span>
            <span className="text-[9px] font-bold uppercase tracking-wider">{p.label.split(" - ")[1]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ChipPrioridad({ valor }) {
  const p = NIVELES_PRIORIDAD.find((x) => x.valor === Number(valor)) || NIVELES_PRIORIDAD[2];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${p.badgeBg} ${p.border} ${p.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
      {p.label.split(" - ")[1]}
    </span>
  );
}
