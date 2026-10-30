import { motion } from "framer-motion";
import { Archive, ArchiveRestore, ChevronRight, FileText, ListChecks } from "lucide-react";
import { avancePedido, formatFechaArg } from "./util";
import { BarraAvance, ChipEstado, ChipOP } from "./Piezas";

const nota = (p) => (p.observaciones || p.nota || "").trim();

/** Tarjeta de celular y tablet: lo importante grande, un solo botón. */
export default function TarjetaPedido({ p, esAdmin, onAbrir, onArchivar, indice = 0 }) {
  const a = avancePedido(p);
  const arch = Boolean(p.archivado);
  const completo = a.total > 0 && a.hecho >= a.total;
  return (
    <motion.li
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(indice, 8) * 0.03, ease: [0.2, 0.8, 0.2, 1] }}
      className={`relative overflow-hidden rounded-3xl border border-white/[0.07] bg-[#101013] ${arch ? "opacity-75" : ""}`}
    >
      <div className="p-4 flex flex-col gap-3.5 h-full">
        <div className="flex items-center gap-2">
          <ChipOP op={p.op} />
          <span className="text-[12px] font-semibold text-zinc-500">{formatFechaArg(p.fecha)}</span>
          <span className="ml-auto"><ChipEstado estado={p.estado} /></span>
        </div>

        <div className="min-w-0">
          <h3 className="text-[17px] font-extrabold text-white leading-snug uppercase break-words">{p.cliente}</h3>
          <p className="mt-1 text-[14px] font-semibold text-zinc-400 break-words line-clamp-2">{p.articulo || "Sin especificar"}</p>
        </div>

        <div>
          <div className="flex items-end justify-between gap-3 mb-2">
            <span className="text-3xl font-extrabold tabular-nums text-white leading-none">
              {a.hecho}<span className="text-lg font-bold text-zinc-600"> / {a.total}</span><span className="ml-1 text-sm font-semibold text-zinc-500">u.</span>
            </span>
            <span className={`text-lg font-extrabold tabular-nums ${completo ? "text-emerald-300" : "text-[#FFD60A]"}`}>{a.pct}%</span>
          </div>
          <BarraAvance pct={a.pct} completo={completo} />
          <div className="mt-2 flex items-center gap-3 text-[12px] text-zinc-500">
            {Number(p.total_items) > 0 && (
              <span className="inline-flex items-center gap-1"><ListChecks size={13} />{Number(p.items_completados) || 0} de {p.total_items} tareas</span>
            )}
            {nota(p) && <span className="inline-flex items-center gap-1 text-amber-300/90 min-w-0"><FileText size={13} className="shrink-0" /><span className="truncate">Tiene notas</span></span>}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-auto">
          <button type="button" onClick={() => onAbrir(p)} className="flex-1 min-h-[52px] rounded-2xl bg-[#FFD60A] hover:bg-white text-black text-base font-extrabold inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer">
            Ver detalle <ChevronRight size={19} />
          </button>
          {esAdmin && (
            <button type="button" onClick={() => onArchivar(p)} aria-label={arch ? "Restaurar a activos" : "Archivar pedido"} title={arch ? "Restaurar a activos" : "Archivar pedido"} className="w-[52px] min-h-[52px] rounded-2xl border border-white/[0.09] bg-white/[0.04] text-zinc-300 grid place-items-center hover:bg-white/[0.09] active:scale-95 transition-all cursor-pointer">
              {arch ? <ArchiveRestore size={20} className="text-emerald-300" /> : <Archive size={20} />}
            </button>
          )}
        </div>
      </div>
    </motion.li>
  );
}
