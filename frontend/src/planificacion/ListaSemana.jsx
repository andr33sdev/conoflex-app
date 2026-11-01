import { useState } from "react";
import { Check, ChevronDown, ClipboardList, Pencil, Plus, Trash2, X } from "lucide-react";
import { Boton, Vacio } from "../produccion/ui";
import { api, num } from "../produccion/util";

function Renglon({ item, onCambio, toast }) {
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [cant, setCant] = useState(String(item.cantidad_semana));
  const [quitar, setQuitar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const deMas = item.asignado > item.cantidad_semana;
  const restante = Math.max(0, item.cantidad_semana - item.asignado);

  const guardar = async () => {
    setOcupado(true);
    try {
      await api(`/api/prod/plan/items/${item.id}`, { method: "PUT", body: { cantidad: Number(cant) } });
      setEditando(false);
      onCambio();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setOcupado(false);
    }
  };
  const borrar = async () => {
    setOcupado(true);
    try {
      await api(`/api/prod/plan/items/${item.id}`, { method: "DELETE" });
      onCambio();
    } catch (e) {
      toast(e.message, "error");
      setQuitar(false);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <li className="border-b border-white/[0.05] last:border-b-0">
      <button onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-white/[0.03]">
        <span className="font-mono text-[11px] font-bold text-[#FFD60A] shrink-0">{item.lote}</span>
        <span className="min-w-0 flex-1 text-[14px] font-semibold text-white truncate">{item.nombre}</span>
        <span className="shrink-0 text-[12.5px] tabular-nums">
          {deMas ? <b className="text-rose-300">Asignado de más</b> : restante > 0 ? <span className="text-zinc-400">Falta repartir <b className="text-white">{num(restante)}</b></span> : <b className="text-emerald-300">Repartido</b>}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-zinc-500 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div className="px-4 pb-3.5 pl-[3.25rem]">
          <p className="text-[13px] text-zinc-400 tabular-nums">
            Se pidieron <b className="text-zinc-200">{num(item.cantidad_semana)}</b> · producidas <b className="text-zinc-200">{num(item.producido)}</b>
            {item.por_aprobar > 0 && <> · <b className="text-[#FFD60A]">{num(item.por_aprobar)}</b> esperan aprobación</>}
          </p>
          {item.notas && <p className="mt-1 text-[12.5px] text-zinc-500 italic">“{item.notas}”</p>}
          {editando ? (
            <div className="mt-2.5 flex items-center gap-2">
              <input type="number" inputMode="numeric" min="1" value={cant} onChange={(e) => setCant(e.target.value)} onKeyDown={(e) => e.key === "Enter" && guardar()} autoFocus className="w-28 min-h-[38px] rounded-lg bg-[#17171c] border border-white/[0.12] px-3 text-sm text-white focus:outline-none focus:border-[#FF5A00]/70" />
              <Boton variante="naranja" onClick={guardar} disabled={ocupado} icono={Check}>Guardar</Boton>
              <Boton variante="fantasma" onClick={() => { setEditando(false); setCant(String(item.cantidad_semana)); }} icono={X} aria-label="Cancelar" />
            </div>
          ) : quitar ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-rose-200">¿Quitar {item.lote} de la semana? Se liberan sus turnos.</span>
              <Boton variante="peligro" onClick={borrar} disabled={ocupado} className="!min-h-[34px] !px-3 !text-xs">Quitar</Boton>
              <Boton variante="fantasma" onClick={() => setQuitar(false)} className="!min-h-[34px] !px-3 !text-xs">No</Boton>
            </div>
          ) : (
            <div className="mt-2 flex gap-1.5 -ml-2">
              <button onClick={() => setEditando(true)} className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-lg text-[13px] font-semibold text-zinc-300 hover:text-white hover:bg-white/[0.06] cursor-pointer"><Pencil size={14} /> Cambiar cantidad</button>
              <button onClick={() => setQuitar(true)} className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-lg text-[13px] font-semibold text-zinc-500 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"><Trash2 size={14} /> Quitar</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function ListaSemana({ items, onAgregar, onCambio, toast }) {
  return (
    <section aria-label="Lo que se produce esta semana" className="mt-5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="text-[15px] font-bold text-white">Qué se produce esta semana <span className="text-zinc-500 font-medium">({items.length})</span></h2>
        {items.length > 0 && <Boton variante="fantasma" icono={Plus} onClick={onAgregar} className="!min-h-[36px] !px-3 !text-[13px]">Agregar</Boton>}
      </div>
      {items.length === 0 ? (
        <Vacio icono={ClipboardList} titulo="Nada planificado todavía" texto="">
          <Boton variante="primario" icono={Plus} onClick={onAgregar}>Agregar a la lista</Boton>
        </Vacio>
      ) : (
        <ul className="rounded-2xl border border-white/[0.07] bg-[#0f0f12] overflow-hidden">
          {items.map((it) => (
            <Renglon key={it.id} item={it} onCambio={onCambio} toast={toast} />
          ))}
        </ul>
      )}
    </section>
  );
}
