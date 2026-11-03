import { useState } from "react";
import { ChevronDown, Crown, Globe, Lightbulb, Swords } from "lucide-react";
import { dominio } from "./util";

function Fuentes({ lista }) {
  if (!lista?.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {lista.slice(0, 3).map((f) => (
        <a key={f.url} href={f.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 max-w-[180px] rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-0.5 text-xs font-bold text-zinc-400 hover:text-white">
          <Globe size={11} className="shrink-0" /> <span className="truncate">{dominio(f.url)}</span>
        </a>
      ))}
    </span>
  );
}

function Ganador({ g, pos }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <li className="rounded-2xl border border-white/[0.08] bg-[#0d0d10]">
      <button onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} className="w-full min-h-[60px] px-4 sm:px-5 py-3 flex items-center gap-3 text-left cursor-pointer">
        <span className={`w-8 h-8 shrink-0 rounded-full grid place-items-center text-sm font-extrabold ${pos === 0 ? "bg-[#FFD60A] text-black" : "bg-white/[0.07] text-zinc-300"}`}>{pos === 0 ? <Crown size={16} /> : pos + 1}</span>
        <span className="min-w-0 mr-auto">
          <b className="block text-white font-extrabold truncate">{g.empresa}</b>
          {g.provincias.length > 0 && <span className="block text-xs text-zinc-500 truncate">{g.provincias.join(" · ")}</span>}
        </span>
        <span className="text-right shrink-0"><b className="text-xl font-extrabold text-white tabular-nums">{g.victorias}</b><span className="block text-[11px] text-zinc-500">{g.victorias === 1 ? "licitación ganada" : "licitaciones ganadas"}</span></span>
        <ChevronDown size={16} className={`shrink-0 text-zinc-500 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <ul className="px-4 sm:px-5 pb-4 flex flex-col gap-2 border-t border-white/[0.06] pt-3">
          {g.ejemplos.map((a, i) => (
            <li key={i} className="text-sm text-zinc-300 leading-relaxed">
              <b className="text-zinc-100">{a.objeto}</b> · {a.organismo}{a.provincia ? ` (${a.provincia})` : ""}
              {(a.monto || a.precio_unitario) && <span className="text-emerald-300 font-bold"> · {a.precio_unitario || a.monto}</span>}
              {a.fecha && <span className="text-zinc-500"> · {a.fecha}</span>} <Fuentes lista={a.fuentes} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Resultado de la búsqueda de competencia: quién gana, a qué precio y quiénes son. */
export default function Competencia({ r }) {
  const [todas, setTodas] = useState(false);
  const adj = todas ? r.adjudicaciones : r.adjudicaciones.slice(0, 6);
  return (
    <div className="flex flex-col gap-8">
      {r.conclusiones?.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.1em] text-[#FFD60A]"><Lightbulb size={16} /> Qué conviene saber</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {r.conclusiones.map((c, i) => <li key={i} className="rounded-2xl border border-[#FFD60A]/20 bg-[#FFD60A]/[0.04] px-4 py-3 text-[15px] text-zinc-200 leading-relaxed">{c}</li>)}
          </ul>
        </section>
      )}
      {r.ranking?.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.1em] text-zinc-400"><Crown size={16} /> Quién gana las licitaciones</h2>
          <ul className="mt-3 flex flex-col gap-2.5">{r.ranking.slice(0, 10).map((g, i) => <Ganador key={g.empresa} g={g} pos={i} />)}</ul>
        </section>
      )}
      {r.adjudicaciones?.length > 0 && (
        <section>
          <h2 className="text-sm font-extrabold uppercase tracking-[0.1em] text-zinc-400">Licitaciones adjudicadas ({r.adjudicaciones.length})</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {adj.map((a, i) => (
              <li key={i} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-zinc-300 leading-relaxed">
                <b className="text-white">{a.objeto}</b> · {a.organismo}{a.provincia ? ` (${a.provincia})` : ""}
                <span className="block mt-1">{a.ganador ? <>Ganó <b className="text-zinc-100">{a.ganador}</b></> : <span className="text-zinc-600">Ganador no informado</span>}{(a.precio_unitario || a.monto) && <b className="text-emerald-300"> · {[a.precio_unitario, a.monto].filter(Boolean).join(" · ")}</b>}{a.fecha && <span className="text-zinc-500"> · {a.fecha}</span>}</span>
                <span className="block mt-1.5"><Fuentes lista={a.fuentes} /></span>
              </li>
            ))}
          </ul>
          {r.adjudicaciones.length > 6 && <button onClick={() => setTodas((v) => !v)} className="mt-2 min-h-[44px] text-sm font-bold text-zinc-400 hover:text-white cursor-pointer">{todas ? "Ver menos" : `Ver las ${r.adjudicaciones.length}`}</button>}
        </section>
      )}
      {r.competidores?.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.1em] text-zinc-400"><Swords size={16} /> Competidores</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {r.competidores.map((c, i) => (
              <li key={i} className="rounded-2xl border border-white/[0.08] bg-[#0d0d10] p-4">
                <b className="text-white font-extrabold">{c.empresa}</b>
                {c.provincia && <span className="text-xs text-zinc-500"> · {c.provincia}</span>}
                {c.que_vende && <p className="mt-1.5 text-sm text-zinc-300 leading-relaxed">{c.que_vende}</p>}
                {c.fortaleza && <p className="mt-1.5 text-sm text-[#ff8a4d] leading-relaxed">{c.fortaleza}</p>}
                <p className="mt-2 flex flex-wrap items-center gap-2">
                  {c.web && <a href={c.web} target="_blank" rel="noreferrer noopener" className="text-xs font-bold text-zinc-400 hover:text-white underline">{dominio(c.web)}</a>}
                  <Fuentes lista={c.fuentes} />
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
