import { Archive, ArchiveRestore, ChevronRight, FileText } from "lucide-react";
import { avancePedido, formatFechaArg } from "./util";
import { BarraAvance, ChipEstado, ChipOP } from "./Piezas";

const COLS = "grid-cols-[88px_104px_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(150px,0.9fr)_116px_160px]";

export default function TablaPedidos({ pedidos, esAdmin, onAbrir, onArchivar }) {
  return (
    <div className="rounded-3xl border border-white/[0.07] bg-[#101013] overflow-hidden">
      <div className={`grid ${COLS} gap-4 px-5 h-11 items-center text-[11px] font-bold uppercase tracking-[0.09em] text-zinc-500 border-b border-white/[0.06] bg-white/[0.02]`}>
        <span>Fecha</span><span>N° OP</span><span>Cliente</span><span>Artículo</span><span>Avance</span><span>Estado</span><span className="text-right pr-1">Acciones</span>
      </div>
      <ul>
        {pedidos.map((p) => {
          const a = avancePedido(p);
          const arch = Boolean(p.archivado);
          const nota = (p.observaciones || p.nota || "").trim();
          return (
            <li key={p.id} className={`grid ${COLS} gap-4 px-5 min-h-[68px] py-2 items-center border-b border-white/[0.05] last:border-b-0 hover:bg-white/[0.025] transition-colors ${arch ? "opacity-75" : ""}`}>
              <span className="text-[13px] font-semibold text-zinc-400 tabular-nums">{formatFechaArg(p.fecha)}</span>
              <span><ChipOP op={p.op} /></span>
              <span className="text-sm font-extrabold text-white uppercase truncate" title={p.cliente}>{p.cliente}</span>
              <span className="flex items-center gap-1.5 min-w-0 text-sm font-semibold text-zinc-300">
                <span className="truncate" title={p.articulo}>{p.articulo || "Sin especificar"}</span>
                {nota && <span title={nota} className="shrink-0 text-amber-300/90"><FileText size={14} /></span>}
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline justify-between mb-1.5 text-sm tabular-nums"><b className="text-white">{a.hecho}<span className="text-zinc-600 font-bold"> / {a.total}</span></b><span className="text-xs font-bold text-zinc-400">{a.pct}%</span></span>
                <BarraAvance pct={a.pct} completo={a.total > 0 && a.hecho >= a.total} />
              </span>
              <span><ChipEstado estado={p.estado} /></span>
              <span className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => onAbrir(p)} className="min-h-[40px] px-3.5 rounded-xl bg-[#FFD60A] hover:bg-white text-black text-sm font-extrabold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors">Detalle <ChevronRight size={15} /></button>
                {esAdmin && (
                  <button type="button" onClick={() => onArchivar(p)} aria-label={arch ? "Restaurar a activos" : "Archivar pedido"} title={arch ? "Restaurar a activos" : "Archivar pedido"} className="w-10 h-10 rounded-xl border border-white/[0.09] bg-white/[0.04] text-zinc-400 hover:text-white grid place-items-center cursor-pointer transition-colors">
                    {arch ? <ArchiveRestore size={17} className="text-emerald-300" /> : <Archive size={17} />}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
