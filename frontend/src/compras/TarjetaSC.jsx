import { motion } from "framer-motion";
import { Building2, ChevronRight, PackagePlus } from "lucide-react";
import { ChipPrioridad } from "./PrioridadPills";
import { BarraAvance, ChipEstado, ChipFirma, ChipUrgente } from "./Piezas";
import { cerradaSC, formatFecha, nroSC, resumenSC, textoProveedores } from "./formato";

/** Tarjeta de celular y tablet: número, estado y avance. Los artículos se ven en el detalle. */
export default function TarjetaSC({ sc, indice = 0, onAbrir, onRecibir }) {
  const r = resumenSC(sc);
  const cerrada = cerradaSC(sc);
  const n = sc.items.length;
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(indice, 8) * 0.03, ease: [0.2, 0.8, 0.2, 1] }}
      className={`relative overflow-hidden rounded-3xl border bg-[#101013] ${r.urgente ? "border-rose-500/35" : "border-white/[0.07]"} ${sc.estado === "CANCELADA" ? "opacity-70" : ""}`}
    >
      {r.urgente && <span className="absolute left-0 top-5 bottom-5 w-1 rounded-r-full bg-rose-400" aria-hidden />}
      <div className="p-4 pl-5 flex flex-col gap-3.5 h-full">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xl font-extrabold text-white tabular-nums leading-none">{nroSC(sc.id)}</h3>
            <p className="mt-1.5 text-[13px] text-zinc-500">{formatFecha(sc.fecha)}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <ChipEstado estado={sc.estado} />
            {r.urgente && <ChipUrgente />}
          </div>
        </div>

        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[14px] text-zinc-300">
          <span><b className="text-white tabular-nums">{n}</b> {n === 1 ? "artículo" : "artículos"}</span>
          <span className="inline-flex items-center gap-1.5 min-w-0 text-zinc-400"><Building2 size={14} className="shrink-0 text-zinc-500" /><span className="truncate">{textoProveedores(r.proveedores)}</span></span>
        </div>

        <div>
          <div className="flex items-end justify-between mb-2">
            <span className="text-[13px] text-zinc-500">Recibido <b className="text-zinc-200 tabular-nums">{r.completos}</b> de <b className="text-zinc-200 tabular-nums">{n}</b></span>
            <span className={`text-2xl font-extrabold tabular-nums leading-none ${r.pct >= 100 ? "text-emerald-300" : "text-[#FFD60A]"}`}>{r.pct}%</span>
          </div>
          <BarraAvance pct={r.pct} />
        </div>

        {r.masUrgente && !cerrada && n > 0 && (
          <div className="flex items-center gap-2 rounded-2xl bg-white/[0.035] border border-white/[0.06] px-3 py-2.5">
            <ChipPrioridad valor={r.masUrgente.prioridad} />
            <p className="min-w-0 flex-1 text-[13px] text-zinc-300 truncate">{r.masUrgente.articulo}</p>
            {n > 1 && <span className="shrink-0 text-xs font-bold text-zinc-500">+{n - 1}</span>}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <ChipFirma rol="Jefe" firmada={!!sc.firma_jefe} />
          <ChipFirma rol="Gerente" firmada={!!sc.firma_gerente} />
        </div>

        <div className="flex items-center gap-2 pt-0.5 mt-auto">
          {!cerrada && (
            <button type="button" onClick={() => onRecibir(sc)} className="flex-1 min-h-[52px] rounded-2xl bg-[#FFD60A] hover:bg-white text-black text-base font-extrabold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer">
              <PackagePlus size={20} /> Recibir
            </button>
          )}
          <button type="button" onClick={() => onAbrir(sc)} className={`min-h-[52px] rounded-2xl border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-zinc-100 text-base font-bold inline-flex items-center justify-center gap-1 active:scale-[0.98] transition-all cursor-pointer ${cerrada ? "flex-1" : "px-5"}`}>
            Ver detalle <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </motion.li>
  );
}
