import { ChevronRight, PackagePlus } from "lucide-react";
import { BarraAvance, ChipEstado, ChipFirma, ChipUrgente } from "./Piezas";
import { cerradaSC, formatFecha, nroSC, resumenSC, textoProveedores } from "./formato";

const COLS = "grid-cols-[112px_92px_minmax(0,1fr)_minmax(140px,0.8fr)_172px_112px_212px]";

export default function TablaSC({ solicitudes, onAbrir, onRecibir }) {
  return (
    <div className="rounded-3xl border border-white/[0.07] bg-[#101013] overflow-hidden">
      <div className={`grid ${COLS} gap-4 px-5 h-11 items-center text-[11px] font-bold uppercase tracking-[0.09em] text-zinc-500 border-b border-white/[0.06] bg-white/[0.02]`}>
        <span>Solicitud</span><span>Fecha</span><span>Proveedores</span><span>Avance</span><span>Firmas</span><span>Estado</span><span className="text-right pr-1">Acciones</span>
      </div>
      <ul>
        {solicitudes.map((sc) => {
          const r = resumenSC(sc);
          const cerrada = cerradaSC(sc);
          return (
            <li key={sc.id} className={`grid ${COLS} gap-4 px-5 min-h-[72px] py-2 items-center border-b border-white/[0.05] last:border-b-0 hover:bg-white/[0.025] transition-colors ${sc.estado === "CANCELADA" ? "opacity-70" : ""}`}>
              <span className="flex flex-col items-start gap-1.5 min-w-0">
                <span className="font-extrabold text-white tabular-nums whitespace-nowrap">{nroSC(sc.id)}</span>
                {r.urgente && <ChipUrgente />}
              </span>
              <span className="text-[13px] font-semibold text-zinc-400 tabular-nums">{formatFecha(sc.fecha)}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-zinc-200 truncate" title={r.proveedores.join(", ")}>{textoProveedores(r.proveedores)}</span>
                <span className="block text-xs text-zinc-500">{sc.items.length} {sc.items.length === 1 ? "artículo" : "artículos"}</span>
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline justify-between mb-1.5 text-sm tabular-nums"><b className="text-white">{r.completos}<span className="text-zinc-600 font-bold"> / {sc.items.length}</span></b><span className="text-xs font-bold text-zinc-400">{r.pct}%</span></span>
                <BarraAvance pct={r.pct} />
              </span>
              <span className="flex gap-1.5"><ChipFirma rol="Jefe" firmada={!!sc.firma_jefe} /><ChipFirma rol="Gerente" firmada={!!sc.firma_gerente} /></span>
              <span><ChipEstado estado={sc.estado} /></span>
              <span className="flex items-center justify-end gap-2">
                {!cerrada && <button type="button" onClick={() => onRecibir(sc)} className="min-h-[40px] px-3.5 rounded-xl bg-[#FFD60A] hover:bg-white text-black text-sm font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"><PackagePlus size={16} /> Recibir</button>}
                <button type="button" onClick={() => onAbrir(sc)} className="min-h-[40px] px-3.5 rounded-xl border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-zinc-100 text-sm font-bold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors">Detalle <ChevronRight size={15} /></button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
