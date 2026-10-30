import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ClipboardList, Pencil, Plus, Trash2, X } from "lucide-react";
import { Boton, Vacio } from "../produccion/ui";
import { api, num } from "../produccion/util";

function Renglon({ item, onCambio, toast }) {
  const [editando, setEditando] = useState(false);
  const [cant, setCant] = useState(String(item.cantidad_semana));
  const [quitar, setQuitar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const de_mas = item.asignado > item.cantidad_semana;
  const restante = Math.max(0, item.cantidad_semana - item.asignado);
  const pct = (v) => (item.cantidad_semana > 0 ? Math.min(100, (v / item.cantidad_semana) * 100) : 0);

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
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="group px-3 py-2.5 border-b border-white/[0.05] last:border-b-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-[10.5px] font-bold text-[#FFD60A] shrink-0">{item.lote}</span>
        <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-white truncate" title={item.nombre}>{item.nombre}</span>
        {item.origen === "SUGERIDO" && <span className="text-[9.5px] font-bold uppercase tracking-wider text-sky-300 shrink-0">Sug.</span>}
        <span className="flex items-center shrink-0 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button onClick={() => setEditando((v) => !v)} aria-label="Cambiar cantidad" className="w-8 h-8 grid place-items-center rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] cursor-pointer"><Pencil size={14} /></button>
          <button onClick={() => setQuitar((v) => !v)} aria-label="Quitar de la lista" className="w-8 h-8 grid place-items-center rounded-lg text-zinc-500 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"><Trash2 size={14} /></button>
        </span>
      </div>

      {editando ? (
        <div className="mt-2 flex items-center gap-2">
          <input type="number" inputMode="numeric" min="1" value={cant} onChange={(e) => setCant(e.target.value)} onKeyDown={(e) => e.key === "Enter" && guardar()} autoFocus className="w-28 min-h-[38px] rounded-lg bg-[#17171c] border border-white/[0.12] px-3 text-sm text-white focus:outline-none focus:border-[#FF5A00]/70" />
          <Boton variante="naranja" onClick={guardar} disabled={ocupado} icono={Check}>Guardar</Boton>
          <Boton variante="fantasma" onClick={() => { setEditando(false); setCant(String(item.cantidad_semana)); }} icono={X} aria-label="Cancelar" />
        </div>
      ) : (
        <div className="mt-1.5">
          <div className="h-1 rounded-full bg-white/[0.07] overflow-hidden relative">
            <div className="absolute inset-y-0 left-0 bg-[#FF5A00]/40" style={{ width: `${pct(item.asignado)}%` }} />
            <div className="absolute inset-y-0 left-0 bg-emerald-400" style={{ width: `${pct(item.producido)}%` }} />
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-zinc-500 tabular-nums">
            <span><b className={item.producido > 0 ? "text-emerald-300" : "text-zinc-400"}>{num(item.producido)}</b> de <b className="text-zinc-300">{num(item.cantidad_semana)}</b></span>
            <span className="truncate">
              {de_mas ? <b className="text-rose-300">asignado de más</b> : restante > 0 ? <>faltan asignar <b className="text-zinc-300">{num(restante)}</b></> : <b className="text-[#ff8a4d]">todo en turnos</b>}
              {item.por_aprobar > 0 && <> · <b className="text-[#FFD60A]">{num(item.por_aprobar)}</b> por aprobar</>}
            </span>
          </div>
          {item.notas && <p className="mt-1 text-[11px] text-zinc-500 italic truncate">“{item.notas}”</p>}
        </div>
      )}

      <AnimatePresence>
        {quitar && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/25 p-2">
              <p className="text-xs text-rose-100 flex-1">¿Quitar {item.lote}?</p>
              <Boton variante="peligro" onClick={borrar} disabled={ocupado} className="!min-h-[32px] !px-3 !text-xs">Quitar</Boton>
              <Boton variante="fantasma" onClick={() => setQuitar(false)} className="!min-h-[32px] !px-3 !text-xs">No</Boton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export default function ListaSemana({ items, onAgregar, onCambio, toast }) {
  return (
    <section aria-label="Lista de la semana" className="rounded-2xl border border-white/[0.07] bg-[#0f0f12] flex flex-col min-h-0 xl:max-h-full overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-white/[0.06] shrink-0">
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-zinc-400">Lista de la semana <span className="text-zinc-600 ml-1">{items.length}</span></h2>
        <Boton variante="suave" icono={Plus} onClick={onAgregar} className="!min-h-[34px] !px-3 !text-[13px]">Agregar</Boton>
      </div>
      {items.length === 0 ? (
        <Vacio icono={ClipboardList} titulo="Nada planificado todavía" texto="Agregá lo que se va a producir esta semana, desde las sugerencias o a mano.">
          <Boton variante="primario" icono={Plus} onClick={onAgregar}>Agregar a la lista</Boton>
        </Vacio>
      ) : (
        <ul className="overflow-y-auto custom-scrollbar min-h-0">
          <AnimatePresence initial={false}>
            {items.map((it) => (
              <Renglon key={it.id} item={it} onCambio={onCambio} toast={toast} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
