import { MoreHorizontal } from "lucide-react";
import { archivada, hace, motivoDe, solId } from "./util";
import { BarraRetiro, ChipEstado, ChipUrgencia } from "./Piezas";
import { accionPrincipal, BOTON } from "./acciones";

const COLS = "grid-cols-[84px_minmax(0,1.5fr)_minmax(0,1fr)_130px_84px_112px_184px_44px]";

/** Vista de tabla para pantallas grandes. */
export default function TablaSolicitudes({ items, permisos, onAccion, onMenu, ahora }) {
  return (
    <div className="rounded-3xl border border-white/[0.07] bg-[#0e0e11] overflow-hidden">
      <div className={`grid ${COLS} gap-3 items-center px-5 h-11 border-b border-white/[0.06] text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500`}>
        <span>ID</span><span>Semielaborado</span><span>Destino</span><span>Retirado</span><span>Prioridad</span><span>Estado</span><span className="text-right">Acción</span><span />
      </div>
      <ul>
        {items.map((s) => {
          const arch = archivada(s);
          const accion = !arch ? accionPrincipal(s, permisos) : null;
          const total = Number(s.cantidadSolicitada) || 0;
          const ret = Number(s.cantidadRetirada) || 0;
          return (
            <li key={s.id} className={`grid ${COLS} gap-3 items-center px-5 min-h-[64px] border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.025] transition-colors ${arch ? "opacity-70" : ""}`}>
              <span className="font-mono text-[12px] font-bold text-zinc-400">{solId(s)}</span>
              <span className="min-w-0">
                <span className="block text-[14.5px] font-bold text-white truncate">{s.semielaboradoNombre}</span>
                <span className="block text-xs text-zinc-500 truncate"><span className="font-mono text-[#ff8a4d]">{s.semielaboradoCodigo}</span> · {hace(s.solicitadoAt || s.solicitado_at, ahora)}</span>
              </span>
              <span className="text-[13px] font-semibold uppercase text-zinc-300 truncate">{motivoDe(s) || "—"}</span>
              <span>
                <span className="block text-[13px] tabular-nums text-zinc-300 mb-1"><b className="text-emerald-300">{ret}</b> / {total}</span>
                <BarraRetiro retirada={ret} total={total} />
              </span>
              <span>{!arch && <ChipUrgencia urgencia={s.urgencia} />}</span>
              <span><ChipEstado estado={s.estado} /></span>
              <span className="flex justify-end">
                {accion && (
                  <button type="button" onClick={() => onAccion(accion.id, s)} className={`min-h-[40px] px-4 rounded-xl inline-flex items-center gap-2 text-sm font-extrabold whitespace-nowrap cursor-pointer transition-all active:scale-[0.97] ${BOTON[accion.estilo]}`}>
                    <accion.icono size={16} /> {accion.texto}
                  </button>
                )}
              </span>
              <button type="button" onClick={() => onMenu(s)} aria-label={`Más opciones de ${solId(s)}`} className="w-10 h-10 rounded-xl text-zinc-400 grid place-items-center hover:bg-white/[0.07] hover:text-white cursor-pointer">
                <MoreHorizontal size={20} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
