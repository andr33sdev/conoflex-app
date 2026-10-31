import { useState } from "react";
import { ChevronDown, Lightbulb, Loader2, RefreshCw } from "lucide-react";
import { api } from "../produccion/util";
import { Avatar8 } from "./pixel";
import { cuando } from "./formato";

const fechaLarga = (f) => {
  const [a, m, d] = f.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
};

/** Una nota del tablero. */
function Nota({ texto, fuerte }) {
  return (
    <li className={`px-2.5 py-2 text-[13px] leading-snug border-l-2 bg-white/[0.035] ${fuerte ? "border-white text-white font-semibold" : "border-white/20 text-zinc-300"}`}>{texto}</li>
  );
}

/** Tablero: lo que cada agente lleva anotado para la próxima reunión de las 08:00. */
function Temario({ temario, onElegir }) {
  if (!temario) return <div className="p-5 grid place-items-center text-zinc-500"><Loader2 size={18} className="animate-spin" /></div>;
  if (temario.error || !temario.secciones.length) return <p className="px-4 pb-4 text-[13.5px] text-zinc-400">Todavía no hay temas anotados para la próxima reunión.</p>;
  return (
    <ul className="grid gap-px bg-white/[0.06] sm:grid-cols-2 xl:grid-cols-4 border-y border-white/[0.06]">
      {temario.secciones.map((s) => (
        <li key={s.agente} className="bg-[#111114] p-3.5">
          <div className="flex items-center gap-2.5">
            <Avatar8 id={s.agente} tam={40} burbuja={false} />
            <p className="min-w-0 text-[13.5px] font-bold text-white leading-tight">{s.nombre}<span className="block text-[12px] font-medium text-zinc-500">{s.puesto}</span></p>
          </div>
          <ul className="mt-2.5 space-y-1.5">
            <Nota texto={s.resumen} fuerte={s.urgente} />
            {s.lineas.map((l) => <Nota key={l} texto={l} />)}
          </ul>
          <button onClick={() => onElegir(s.agente)} className="mt-2 text-[12.5px] font-semibold text-zinc-400 hover:text-white">Hablar con {s.nombre} →</button>
        </li>
      ))}
    </ul>
  );
}

function Ideas({ lista, titulo }) {
  if (!lista?.length) return null;
  return (
    <div className="px-4 py-3.5">
      <h3 className="flex items-center gap-2 text-[13.5px] font-bold text-white"><Lightbulb size={15} /> {titulo}</h3>
      <ul className="mt-2 space-y-2">
        {lista.map((i, n) => (
          <li key={n} className="flex gap-2.5 text-[13.5px] leading-snug text-zinc-300">
            <Avatar8 id={i.agente} tam={28} burbuja={false} className="shrink-0 mt-0.5" />
            <span>{i.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Reunión de las 08:00: tablero con el temario en vivo, las ideas de mejora y lo que se dijo en la última reunión. */
export default function Reunion({ reunion, temario, esAdmin, onRehacer, onElegir }) {
  const [rehaciendo, setRehaciendo] = useState(false);
  const [abierta, setAbierta] = useState(false);
  if (!reunion) return <div className="rounded-2xl border border-white/[0.08] p-5 grid place-items-center text-zinc-500"><Loader2 size={18} className="animate-spin" /></div>;
  const rehacer = async () => {
    setRehaciendo(true);
    try {
      await api("/api/agentes/reunion/ahora", { method: "POST" });
      onRehacer();
    } catch {
      /* el botón vuelve a quedar disponible */
    } finally {
      setRehaciendo(false);
    }
  };
  const cuandoFue = reunion.hay ? (reunion.hoy && reunion.generada ? `hoy ${cuando(reunion.generada).replace(/^hoy /, "")}` : fechaLarga(reunion.fecha)) : "";
  const ideas = reunion.sugerencias?.length ? reunion.sugerencias : temario?.sugerencias;
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#111114] overflow-hidden" aria-label="Reunión de las 08:00">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3.5 pb-2.5">
        <h2 className="text-[15px] font-bold text-white">Reunión de las 08:00</h2>
        <span className="text-[12.5px] text-zinc-500">Próxima: {temario?.proxima?.cuando || "lunes a viernes, a las 08:00"}</span>
        {temario && !temario.error && temario.secciones.length > 0 && (
          <span className="text-[12.5px] font-semibold text-zinc-400">{temario.urgentes ? `${temario.urgentes} ${temario.urgentes === 1 ? "tema urgente anotado" : "temas urgentes anotados"}` : "nada urgente anotado"}</span>
        )}
        {esAdmin && (
          <button onClick={rehacer} disabled={rehaciendo} className="ml-auto h-8 px-2.5 rounded-lg text-[12px] font-semibold text-zinc-400 hover:text-white hover:bg-white/[0.07] inline-flex items-center gap-1.5 disabled:opacity-50" title="Rehacer la reunión de hoy (no avisa a nadie)">
            {rehaciendo ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Rehacer
          </button>
        )}
      </header>
      <p className="px-4 pb-2.5 text-[12.5px] text-zinc-500">Temario: lo que cada uno fue anotando para tratar. Se actualiza solo durante el día.</p>
      <Temario temario={temario} onElegir={onElegir} />
      <Ideas lista={ideas} titulo={reunion.sugerencias?.length ? `Ideas que salieron de la reunión (${cuandoFue})` : "Ideas para mejorar (si hoy se hiciera la reunión)"} />
      <div className="border-t border-white/[0.06]">
        <button onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} className="w-full flex items-center gap-2 px-4 py-3 text-left text-[13.5px] font-semibold text-zinc-300 hover:text-white">
          <ChevronDown size={16} className={`transition-transform ${abierta ? "rotate-180" : ""}`} />
          {reunion.hay ? `Lo que se dijo en la última reunión · ${cuandoFue}` : "Todavía no hubo ninguna reunión"}
        </button>
        {abierta && reunion.hay && (
          <ul className="grid gap-px bg-white/[0.06] sm:grid-cols-2">
            {reunion.secciones.map((s) => (
              <li key={s.agente} className="bg-[#111114] p-3.5">
                <p className="text-[13.5px] font-bold text-white leading-tight">{s.nombre} <span className="font-medium text-zinc-500">· {s.puesto}</span></p>
                <p className={`mt-0.5 text-[13.5px] leading-snug ${s.urgente ? "text-white font-semibold" : "text-zinc-300"}`}>{s.resumen}</p>
                {s.lineas.length > 0 && <ul className="mt-1.5 space-y-0.5">{s.lineas.map((l) => <li key={l} className="text-[12.5px] text-zinc-500 leading-snug">· {l}</li>)}</ul>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
