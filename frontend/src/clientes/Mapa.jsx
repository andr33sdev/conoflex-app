import { useMemo } from "react";
import { MAPA } from "./mapaArgentina";
import { idProvincia } from "./util";

/** Mapa de la Argentina: cada provincia se pinta según cuántas oportunidades hay. Tocar una provincia filtra la lista. */
export default function Mapa({ ops, sel, onSel }) {
  const datos = useMemo(() => {
    const por = new Map();
    let sinProvincia = 0;
    for (const o of ops) {
      const id = idProvincia(o.provincia, MAPA.provincias);
      if (!id) {
        sinProvincia++;
        continue;
      }
      const e = por.get(id) || { total: 0, ya: 0 };
      e.total++;
      if (o.prioridad === 1) e.ya++;
      por.set(id, e);
    }
    return { por, sinProvincia, max: Math.max(1, ...[...por.values()].map((e) => e.total)) };
  }, [ops]);

  const relleno = (id) => {
    const e = datos.por.get(id);
    if (!e) return "rgba(255,255,255,0.04)";
    const a = 0.25 + 0.6 * (e.total / datos.max);
    return e.ya > 0 ? `rgba(255,90,0,${a.toFixed(2)})` : `rgba(255,214,10,${(a * 0.8).toFixed(2)})`;
  };
  const lista = MAPA.provincias.filter((p) => datos.por.has(p.id)).sort((a, b) => datos.por.get(b.id).total - datos.por.get(a.id).total);

  return (
    <div className="grid gap-6 sm:grid-cols-[minmax(0,260px)_1fr] items-start">
      <svg viewBox={`0 0 ${MAPA.ancho} ${MAPA.alto}`} role="group" aria-label="Mapa de oportunidades por provincia" className="w-full max-w-[260px] mx-auto sm:mx-0 max-h-[70dvh]">
        {MAPA.provincias.map((p) => {
          const e = datos.por.get(p.id);
          const activa = sel === p.id;
          return (
            <path
              key={p.id}
              d={p.path}
              fill={relleno(p.id)}
              stroke={activa ? "#FFD60A" : "rgba(255,255,255,0.22)"}
              strokeWidth={activa ? 3 : 1}
              strokeLinejoin="round"
              className={e ? "cursor-pointer transition-opacity hover:opacity-80" : ""}
              onClick={e ? () => onSel(activa ? "" : p.id) : undefined}
              role={e ? "button" : undefined}
              tabIndex={e ? 0 : undefined}
              aria-label={e ? `${p.nombre}: ${e.total} ${e.total === 1 ? "oportunidad" : "oportunidades"}` : undefined}
              aria-pressed={e ? activa : undefined}
              onKeyDown={e ? (ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), onSel(activa ? "" : p.id)) : undefined}
            >
              <title>{p.nombre}{e ? ` · ${e.total}` : ""}</title>
            </path>
          );
        })}
      </svg>
      <div className="min-w-0">
        <p className="text-sm text-zinc-500">Tocá una provincia para ver solo sus oportunidades.</p>
        <ul className="mt-3 flex flex-col gap-1.5">
          {lista.map((p) => {
            const e = datos.por.get(p.id);
            const activa = sel === p.id;
            return (
              <li key={p.id}>
                <button onClick={() => onSel(activa ? "" : p.id)} aria-pressed={activa} className={`w-full min-h-[44px] px-4 rounded-xl border flex items-center gap-3 text-left cursor-pointer transition-colors ${activa ? "border-[#FFD60A]/60 bg-[#FFD60A]/10" : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07]"}`}>
                  <span className="font-bold text-zinc-100 mr-auto">{p.nombre}</span>
                  {e.ya > 0 && <span className="text-xs font-extrabold text-[#ff8a4d]">{e.ya} para ir ya</span>}
                  <span className="tabular-nums font-extrabold text-white">{e.total}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {datos.sinProvincia > 0 && <p className="mt-3 text-xs text-zinc-600">{datos.sinProvincia} {datos.sinProvincia === 1 ? "oportunidad no indica" : "oportunidades no indican"} una provincia clara y no aparece en el mapa.</p>}
        <p className="mt-4 text-[11px] text-zinc-700">Mapa: Natural Earth (dominio público).</p>
      </div>
    </div>
  );
}
