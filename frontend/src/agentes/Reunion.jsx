import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { api } from "../produccion/util";
import { Avatar8 } from "./pixel";
import { cuando } from "./formato";

const fechaLarga = (f) => {
  const [a, m, d] = f.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
};

/** La reunión de las 08:00: qué dijo cada agente. */
export default function Reunion({ reunion, esAdmin, onRehacer, onElegir }) {
  const [rehaciendo, setRehaciendo] = useState(false);
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
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#111114]" aria-label="Reunión de las 08:00">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3.5 pb-2">
        <h2 className="text-[15px] font-bold text-white">Reunión de las 08:00</h2>
        <span className="text-[12.5px] text-zinc-500">
          {reunion.hay ? (reunion.hoy && reunion.generada ? cuando(reunion.generada) : fechaLarga(reunion.fecha)) : "Lunes a viernes, a las 08:00"}
        </span>
        {reunion.hay && <span className="text-[12.5px] font-semibold text-zinc-400">{reunion.urgentes ? `${reunion.urgentes} ${reunion.urgentes === 1 ? "tema urgente" : "temas urgentes"}` : "nada urgente"}</span>}
        {esAdmin && (
          <button onClick={rehacer} disabled={rehaciendo} className="ml-auto h-8 px-2.5 rounded-lg text-[12px] font-semibold text-zinc-400 hover:text-white hover:bg-white/[0.07] inline-flex items-center gap-1.5 disabled:opacity-50" title="Rehacer la reunión de hoy (no avisa a nadie)">
            {rehaciendo ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Rehacer
          </button>
        )}
      </header>
      {!reunion.hay ? (
        <p className="px-4 pb-4 text-[13.5px] text-zinc-400">Todavía no hubo ninguna reunión. La primera es el próximo día hábil a las 08:00.</p>
      ) : (
        <ul className="grid gap-px bg-white/[0.06] sm:grid-cols-2 rounded-b-2xl overflow-hidden">
          {reunion.secciones.map((s) => (
            <li key={s.agente} className="bg-[#111114] p-3.5 flex gap-3">
              <Avatar8 id={s.agente} tam={48} burbuja={false} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-bold text-white leading-tight">{s.nombre} <span className="font-medium text-zinc-500">· {s.puesto}</span></p>
                <p className={`mt-0.5 text-[13.5px] leading-snug ${s.urgente ? "text-white font-semibold" : "text-zinc-300"}`}>{s.resumen}</p>
                {s.lineas.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {s.lineas.map((l) => <li key={l} className="text-[12.5px] text-zinc-500 leading-snug">· {l}</li>)}
                  </ul>
                )}
                <button onClick={() => onElegir(s.agente)} className="mt-1.5 text-[12.5px] font-semibold text-zinc-400 hover:text-white">Hablar con {s.nombre} →</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
