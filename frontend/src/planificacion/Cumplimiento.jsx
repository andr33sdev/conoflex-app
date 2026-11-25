// Cumplimiento del plan de la semana: lo planificado vs lo producido, con los productos que
// quedaron cortos. Es lo primero que mira un jefe: ¿se cumplió lo que se planeó?
import { useState } from "react";
import { ChevronDown, Target } from "lucide-react";
import { num, sinSemi } from "../produccion/util";

export default function Cumplimiento({ items }) {
  const [abierto, setAbierto] = useState(false);
  if (!items || items.length === 0) return null;

  const planificado = items.reduce((t, i) => t + (Number(i.cantidad_semana) || 0), 0);
  const producido = items.reduce((t, i) => t + (Number(i.producido) || 0), 0);
  const porAprobar = items.reduce((t, i) => t + (Number(i.por_aprobar) || 0), 0);
  const pct = planificado > 0 ? Math.round((producido / planificado) * 100) : 0;
  const cortos = items
    .map((i) => ({ ...i, falta: (Number(i.cantidad_semana) || 0) - (Number(i.producido) || 0) }))
    .filter((i) => i.falta > 0)
    .sort((a, b) => b.falta - a.falta);

  const color = pct >= 90 ? "#34d399" : pct >= 60 ? "#FFD60A" : "#ff8a4d";

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0f0f12] p-4 mb-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase tracking-wider">
          <Target size={15} className="text-[#FF5A00]" /> Cumplimiento de la semana
        </div>
        <div className="flex items-baseline gap-2 ml-auto">
          <span className="text-2xl font-extrabold tabular-nums" style={{ color }}>{pct}%</span>
          <span className="text-xs text-zinc-500 tabular-nums">{num(producido)} de {num(planificado)} u</span>
        </div>
      </div>
      <div className="mt-2.5 h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 flex-wrap text-xs text-zinc-500">
        <span>{porAprobar > 0 && <>+{num(porAprobar)} u esperan aprobación · </>}{cortos.length === 0 ? "Todo al día" : `${cortos.length} ${cortos.length === 1 ? "producto corto" : "productos cortos"}`}</span>
        {cortos.length > 0 && (
          <button onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} className="inline-flex items-center gap-1 font-semibold text-zinc-400 hover:text-white cursor-pointer">
            {abierto ? "Ocultar" : "Ver cuáles"} <ChevronDown size={13} className={`transition-transform ${abierto ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
      {abierto && cortos.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5 border-t border-white/[0.06] pt-3">
          {cortos.map((i) => (
            <li key={i.id} className="flex items-center gap-2 text-[13px]">
              <span className="font-mono text-[10px] font-bold text-[#FFD60A] shrink-0">{i.lote}</span>
              <span className="min-w-0 flex-1 truncate text-zinc-200">{sinSemi(i.nombre)}</span>
              <span className="shrink-0 tabular-nums text-zinc-400">{num(i.producido)}/{num(i.cantidad_semana)} · <span className="text-[#ff8a4d]">faltan {num(i.falta)}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
