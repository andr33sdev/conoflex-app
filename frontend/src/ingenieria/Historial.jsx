import { motion } from "framer-motion";
import { CheckCircle2, FilePlus2, History, Pencil, Trash2, Zap } from "lucide-react";
import { fechaHora } from "./formato";

const ICONOS = { CREADA: FilePlus2, MODIFICADA: Pencil, ACTIVADA: Zap, ELIMINADA: Trash2, ADOPTADA: CheckCircle2 };
const TONOS = { CREADA: "text-sky-300 bg-sky-500/15 border-sky-400/30", MODIFICADA: "text-[#FFD60A] bg-[#FFD60A]/10 border-[#FFD60A]/30", ACTIVADA: "text-emerald-300 bg-emerald-500/15 border-emerald-400/30", ELIMINADA: "text-rose-300 bg-rose-500/15 border-rose-400/30", ADOPTADA: "text-emerald-300 bg-emerald-500/15 border-emerald-400/30" };

/** Línea de tiempo de todo lo que se hizo con las recetas del producto: qué, quién y cuándo. */
export default function Historial({ eventos }) {
  if (!eventos.length) {
    return (
      <div className="rounded-3xl border border-dashed border-white/[0.14] px-6 py-12 text-center">
        <span className="mx-auto w-14 h-14 rounded-full bg-white/[0.05] grid place-items-center text-zinc-500"><History size={24} /></span>
        <p className="mt-3 text-base font-extrabold text-white">Todavía no hay movimientos</p>
        <p className="mt-1 text-sm text-zinc-500">Desde ahora, cada receta creada o modificada queda registrada acá.</p>
      </div>
    );
  }
  return (
    <ol className="relative flex flex-col gap-3 before:absolute before:left-[19px] before:top-3 before:bottom-3 before:w-px before:bg-white/[0.08]">
      {eventos.map((e, i) => {
        const Icono = ICONOS[e.accion] || History;
        return (
          <motion.li key={e.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25, delay: Math.min(i, 8) * 0.03 }} className="relative flex gap-3">
            <span className={`relative z-[1] shrink-0 w-10 h-10 rounded-full border grid place-items-center ${TONOS[e.accion] || "text-zinc-300 bg-white/[0.06] border-white/[0.1]"}`}><Icono size={16} /></span>
            <div className="min-w-0 flex-1 rounded-2xl border border-white/[0.07] bg-[#111114] px-4 py-3">
              <p className="text-sm font-extrabold text-white">{e.accion_texto}{e.nombre_version ? <span className="text-zinc-400 font-bold"> · {e.nombre_version}</span> : null}</p>
              {e.resumen && <p className="mt-1 text-sm text-zinc-400 break-words">{e.resumen}</p>}
              <p className="mt-1.5 text-xs text-zinc-500"><b className="text-zinc-300">{e.usuario || "—"}</b> · {fechaHora(e.fecha)}</p>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
