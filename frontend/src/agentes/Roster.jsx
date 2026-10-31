import { Lock } from "lucide-react";
import { PROXIMOS } from "./proximos";

export function Avatar({ color = "#FF5A00", inicial, grande = false }) {
  return (
    <span
      className={`shrink-0 grid place-items-center rounded-xl font-black text-black ${grande ? "w-20 h-20 text-4xl rounded-3xl" : "w-9 h-9 text-base"}`}
      style={{ background: color, boxShadow: `0 ${grande ? 8 : 3}px 0 color-mix(in srgb, ${color} 55%, black)` }}
    >
      {inicial}
    </span>
  );
}

/** Lista de agentes: elegís con cuál hablar. Los que no están habilitados todavía aparecen como "Pronto". */
export default function Roster({ agentes, elegido, onElegir }) {
  return (
    <div role="tablist" aria-label="Agentes" className="shrink-0 flex gap-2 overflow-x-auto px-3 sm:px-4 py-2.5 border-b border-white/[0.06] bg-[#0e0e11] custom-scrollbar">
      {agentes.map((a) => {
        const activo = a.id === elegido;
        return (
          <button
            key={a.id}
            role="tab"
            aria-selected={activo}
            onClick={() => onElegir(a.id)}
            className={`shrink-0 flex items-center gap-2.5 min-h-[52px] pl-2 pr-4 rounded-2xl border text-left transition-colors ${activo ? "bg-white/[0.08] border-[#FF5A00]/60" : "border-white/[0.08] hover:border-white/25"}`}
          >
            <Avatar color={a.color} inicial={a.nombre[0]} />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[14px] font-extrabold text-white leading-tight">
                {a.nombre}
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {a.abiertos > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF5A00] text-black text-[10.5px] font-black grid place-items-center">{a.abiertos}</span>}
              </span>
              <span className="block text-[11.5px] text-zinc-400 leading-tight">{a.puesto}</span>
            </span>
          </button>
        );
      })}
      {PROXIMOS.map((a) => {
        const activo = a.id === elegido;
        return (
          <button
            key={a.id}
            role="tab"
            aria-selected={activo}
            onClick={() => onElegir(a.id)}
            className={`shrink-0 flex items-center gap-2.5 min-h-[52px] pl-2 pr-4 rounded-2xl border text-left transition-colors ${activo ? "bg-white/[0.06] border-white/30" : "border-dashed border-white/[0.1] hover:border-white/25"}`}
          >
            <span className="opacity-50"><Avatar color={a.color} inicial={a.nombre[0]} /></span>
            <span className="min-w-0 opacity-80">
              <span className="flex items-center gap-1.5 text-[14px] font-extrabold text-zinc-200 leading-tight">
                {a.nombre}
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-400 bg-white/[0.07] rounded-full px-1.5 py-0.5"><Lock size={9} /> Pronto</span>
              </span>
              <span className="block text-[11.5px] text-zinc-500 leading-tight">{a.puesto}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Proximamente({ agente }) {
  return (
    <div className="h-full overflow-y-auto grid place-items-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="flex justify-center"><Avatar color={agente.color} inicial={agente.nombre[0]} grande /></div>
        <p className="mt-5 text-2xl font-black text-white">{agente.nombre}</p>
        <p className="text-sm font-semibold" style={{ color: agente.color }}>{agente.puesto}</p>
        <span className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-300 bg-white/[0.07] border border-white/10 rounded-full px-3 py-1"><Lock size={11} /> En preparación</span>
        <ul className="mt-6 space-y-2.5 text-left">
          {agente.queHara.map((q) => (
            <li key={q} className="flex gap-3 rounded-2xl bg-[#111116] border border-white/[0.07] px-4 py-3 text-[14px] text-zinc-300 leading-snug">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: agente.color }} />
              {q}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-xs text-zinc-500">Todavía no está disponible. Cuando se active, la vas a ver acá con su propio escritorio y se habilita por rol.</p>
      </div>
    </div>
  );
}
