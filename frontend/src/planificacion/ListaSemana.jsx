import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ClipboardList, Pencil, Plus, Trash2, X } from "lucide-react";
import { Barra, Boton, Chip, Vacio } from "../produccion/ui";
import { api, num } from "../produccion/util";

function Renglon({ item, onCambio, toast }) {
  const [editando, setEditando] = useState(false);
  const [cant, setCant] = useState(String(item.cantidad_semana));
  const [quitar, setQuitar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const de_mas = item.asignado > item.cantidad_semana;
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
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl border border-white/[0.07] bg-[#111114] p-4"
    >
      <div className="flex items-start gap-2 flex-wrap">
        <span className="font-mono text-[12px] font-bold text-[#FFD60A] bg-[#FFD60A]/10 border border-[#FFD60A]/25 rounded-lg px-2 py-0.5">{item.lote}</span>
        {item.origen === "SUGERIDO" && <Chip tono="azul">Sugerido</Chip>}
        {de_mas && <Chip tono="rojo">Asignado de más</Chip>}
        <div className="ml-auto flex items-center gap-1">
          {!editando && (
            <button onClick={() => setEditando(true)} aria-label="Cambiar cantidad" className="w-9 h-9 grid place-items-center rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] cursor-pointer">
              <Pencil size={15} />
            </button>
          )}
          <button onClick={() => setQuitar((v) => !v)} aria-label="Quitar de la lista" className="w-9 h-9 grid place-items-center rounded-lg text-zinc-500 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <p className="mt-2 text-[15px] font-bold text-white leading-snug">{item.nombre}</p>
      <p className="text-xs text-zinc-500">{item.codigo}</p>

      {editando ? (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={cant}
            onChange={(e) => setCant(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && guardar()}
            autoFocus
            className="w-32 min-h-[40px] rounded-xl bg-[#17171c] border border-white/[0.12] px-3 text-white focus:outline-none focus:border-[#FF5A00]/70"
          />
          <Boton variante="naranja" onClick={guardar} disabled={ocupado} icono={Check}>Guardar</Boton>
          <Boton variante="fantasma" onClick={() => { setEditando(false); setCant(String(item.cantidad_semana)); }} icono={X} aria-label="Cancelar" />
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex items-end justify-between mb-1.5">
            <span className="text-2xl font-extrabold tabular-nums text-white">
              <span className={item.producido > 0 ? "text-emerald-300" : "text-zinc-500"}>{num(item.producido)}</span>
              <span className="text-base font-semibold text-zinc-500"> de {num(item.cantidad_semana)}</span>
              <span className="text-xs font-semibold text-zinc-500 ml-1">aprobadas / pedidas</span>
            </span>
          </div>
          <Barra total={item.cantidad_semana} hecho={item.producido} asignado={item.asignado} />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
            <span><b className="text-zinc-300 tabular-nums">{num(item.asignado)}</b> en turnos</span>
            {item.por_aprobar > 0 && <span><b className="text-[#FFD60A] tabular-nums">{num(item.por_aprobar)}</b> por aprobar</span>}
            {!de_mas && restante > 0 && <span>faltan asignar <b className="text-zinc-300 tabular-nums">{num(restante)}</b></span>}
          </div>
        </div>
      )}
      {item.notas && <p className="mt-2 text-xs text-zinc-400 italic">“{item.notas}”</p>}

      <AnimatePresence>
        {quitar && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/25 p-3">
              <p className="text-sm text-rose-100 flex-1">¿Quitar {item.lote} de la lista?</p>
              <Boton variante="peligro" onClick={borrar} disabled={ocupado}>Quitar</Boton>
              <Boton variante="fantasma" onClick={() => setQuitar(false)}>No</Boton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export default function ListaSemana({ items, onAgregar, onCambio, toast }) {
  return (
    <section aria-label="Lista de la semana" className="flex flex-col min-h-0 xl:sticky xl:top-2 xl:max-h-[calc(100dvh-5rem)] xl:overflow-y-auto custom-scrollbar xl:pr-1">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-extrabold uppercase tracking-[0.1em] text-zinc-400">Lista de la semana</h2>
        <Boton variante="primario" icono={Plus} onClick={onAgregar}>Agregar</Boton>
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02]">
          <Vacio icono={ClipboardList} titulo="Todavía no hay nada planificado" texto="Agregá lo que se va a producir esta semana, desde las sugerencias o a mano. Cada renglón recibe su número de lote.">
            <Boton variante="primario" icono={Plus} onClick={onAgregar}>Agregar a la lista</Boton>
          </Vacio>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
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
