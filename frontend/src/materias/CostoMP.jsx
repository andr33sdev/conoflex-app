// Costo de una materia prima (en dólares por su unidad de medida). Solo lo ve y lo cambia un administrador.
import { useEffect, useState } from "react";
import { Check, ChevronDown, DollarSign, Loader2, Pencil } from "lucide-react";
import { api } from "../produccion/util";
import { abrev, usd } from "./util";

export default function CostoMP({ m, onGuardado }) {
  const [dato, setDato] = useState(undefined);
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    api(`/api/materias-primas/${m.id}/costo`)
      .then((d) => vivo && setDato(d))
      .catch(() => vivo && setDato(null));
    return () => {
      vivo = false;
    };
  }, [m.id]);

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError("");
    try {
      const r = await api(`/api/materias-primas/${m.id}/costo`, { method: "PUT", body: { costo: valor } });
      if (r.cambio) {
        const d = await api(`/api/materias-primas/${m.id}/costo`).catch(() => null);
        if (d) setDato(d);
      }
      setEditando(false);
      onGuardado?.(r.costo);
    } catch (err) {
      setError(err.message || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  if (dato === undefined) return <Loader2 size={16} className="animate-spin text-zinc-500" />;
  if (dato === null) return <p className="text-sm text-zinc-500">No se pudo cargar el costo.</p>;

  if (editando)
    return (
      <form onSubmit={guardar} className="flex flex-col gap-2">
        <label htmlFor={`costo-${m.id}`} className="text-sm text-zinc-400">US$ por {abrev(m.unidad_medida)} (dejalo vacío para quitarlo)</label>
        <div className="flex gap-2">
          <input id={`costo-${m.id}`} autoFocus inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ej: 2,60" className="flex-1 min-h-[46px] rounded-xl bg-white/[0.05] border border-white/[0.1] focus:border-[#FF5A00]/60 px-3 text-white outline-none" />
          <button type="submit" disabled={guardando} aria-label="Guardar costo" className="min-h-[46px] px-4 rounded-xl bg-[#FFD60A] text-black font-extrabold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50">
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
          </button>
        </div>
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <button type="button" onClick={() => setEditando(false)} className="self-start text-sm text-zinc-500 hover:text-white cursor-pointer">Cancelar</button>
      </form>
    );

  return (
    <div className="flex flex-col gap-3">
    <div className="flex items-center gap-3">
      <DollarSign size={18} className="text-emerald-300 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-lg font-extrabold text-white tabular-nums">{dato.costo == null ? <span className="text-zinc-500 font-bold text-base">Sin costo cargado</span> : <>{usd(dato.costo)} <span className="text-sm font-semibold text-zinc-500">/ {abrev(m.unidad_medida)}</span></>}</p>
        {dato.actualizado_por && <p className="text-xs text-zinc-500">Último cambio: {dato.actualizado_por}</p>}
      </div>
      <button onClick={() => { setValor(dato.costo == null ? "" : String(dato.costo).replace(".", ",")); setEditando(true); }} aria-label="Editar costo" className="w-10 h-10 grid place-items-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08] cursor-pointer"><Pencil size={16} /></button>
    </div>
    <Historial lista={dato.historial || []} unidad={m.unidad_medida} />
    </div>
  );
}

const fecha = (f) => new Date(f).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Quién cambió el costo, cuándo, de cuánto a cuánto y de dónde salió. */
function Historial({ lista, unidad }) {
  const [todo, setTodo] = useState(false);
  if (!lista.length) return null;
  const vista = todo ? lista : lista.slice(0, 3);
  return (
    <div className="border-t border-white/[0.06] pt-3">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-zinc-500 mb-2">Cambios de costo</p>
      <ul className="flex flex-col gap-2">
        {vista.map((h) => (
          <li key={h.id} className="text-sm">
            <span className="text-zinc-300 tabular-nums">{h.antes == null ? "sin costo" : usd(h.antes)} → <b className="text-white">{h.despues == null ? "sin costo" : usd(h.despues)}</b></span>
            <span className="text-zinc-500"> /{abrev(unidad)}</span>
            <span className="block text-xs text-zinc-500">
              {fecha(h.created_at)} · {h.usuario || "sin usuario"} · {h.origen === "PLANILLA" ? `planilla${h.detalle ? ` (${h.detalle})` : ""}` : "a mano"}
            </span>
          </li>
        ))}
      </ul>
      {lista.length > 3 && (
        <button onClick={() => setTodo((v) => !v)} className="mt-2 text-xs font-bold text-zinc-400 hover:text-white inline-flex items-center gap-1 cursor-pointer">
          <ChevronDown size={14} className={todo ? "rotate-180" : ""} /> {todo ? "Ver menos" : `Ver los ${lista.length} cambios`}
        </button>
      )}
    </div>
  );
}
