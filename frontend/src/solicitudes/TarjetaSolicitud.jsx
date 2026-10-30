import { motion } from "framer-motion";
import { AlertTriangle, Clock, MoreHorizontal, Tag } from "lucide-react";
import { accionPrincipal } from "./acciones";
import { BOTON, ESPERA } from "./acciones";
import { archivada, hace, horasDesde, motivoDe, solId, URGENCIA } from "./util";
import { BarraRetiro, ChipEstado, ChipUrgencia, Recorrido } from "./Piezas";

export default function TarjetaSolicitud({ s, permisos, onAccion, onMenu, ahora, indice = 0 }) {
  const arch = archivada(s);
  const accion = !arch ? accionPrincipal(s, permisos) : null;
  const total = Number(s.cantidadSolicitada) || 0;
  const retirada = Number(s.cantidadRetirada) || 0;
  const horas = s.estado === "DISPONIBLE" ? horasDesde(s.disponibleAt, ahora) : null;
  const demorada = horas != null && horas >= 8;
  const motivo = motivoDe(s);

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.28, delay: Math.min(indice, 8) * 0.03, ease: [0.2, 0.8, 0.2, 1] }}
      className={`relative overflow-hidden rounded-3xl border bg-[#101013] ${demorada ? "border-rose-500/40" : "border-white/[0.07]"} ${arch ? "opacity-75" : ""}`}
    >
      {!arch && <span className={`absolute left-0 top-5 bottom-5 w-1 rounded-r-full ${(URGENCIA[s.urgencia] || URGENCIA.BAJA).borde}`} aria-hidden />}
      <div className="p-4 pl-5 flex flex-col gap-3.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[12px] font-bold text-zinc-400">{solId(s)}</span>
          {!arch && <ChipUrgencia urgencia={s.urgencia} />}
          <span className="ml-auto"><ChipEstado estado={s.estado} /></span>
        </div>

        <div className="min-w-0">
          <h3 className="text-[17px] font-extrabold text-white leading-snug line-clamp-2">{s.semielaboradoNombre}</h3>
          <div className="mt-1.5 flex items-center gap-x-3 gap-y-1 flex-wrap text-[13px] text-zinc-500">
            <span className="font-mono font-bold text-[#ff8a4d]">{s.semielaboradoCodigo}</span>
            {motivo && <span className="inline-flex items-center gap-1 min-w-0"><Tag size={12} className="shrink-0" /><span className="truncate uppercase font-semibold text-zinc-400">{motivo}</span></span>}
            <span className="inline-flex items-center gap-1"><Clock size={12} />{hace(s.solicitadoAt || s.solicitado_at, ahora)}</span>
          </div>
        </div>

        <div>
          <div className="flex items-end justify-between mb-2">
            <span className="text-3xl font-extrabold tabular-nums text-white leading-none">{total}<span className="ml-1 text-sm font-semibold text-zinc-500">u.</span></span>
            {(retirada > 0 || s.estado === "DISPONIBLE") && (
              <span className="text-sm text-zinc-400 tabular-nums">retiradas <b className="text-emerald-300">{retirada}</b> de {total}</span>
            )}
          </div>
          {retirada > 0 || s.estado === "DISPONIBLE" ? <BarraRetiro retirada={retirada} total={total} /> : <Recorrido estado={s.estado} />}
        </div>

        {demorada && (
          <p className="flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/25 px-3 py-2 text-[13px] font-semibold text-rose-200">
            <AlertTriangle size={15} className="shrink-0" /> Disponible hace más de 8 h sin retirar.
          </p>
        )}

        <div className="flex items-center gap-2 pt-0.5">
          {accion ? (
            <button type="button" onClick={() => onAccion(accion.id, s)} className={`flex-1 min-h-[52px] rounded-2xl inline-flex items-center justify-center gap-2 text-base font-extrabold active:scale-[0.98] transition-all cursor-pointer ${BOTON[accion.estilo]}`}>
              <accion.icono size={20} /> {accion.texto}
            </button>
          ) : (
            <p className="flex-1 text-sm text-zinc-500 px-1">{arch ? (s.estado === "ENTREGADO" ? "Entrega completa" : "Solicitud cancelada") : ESPERA[s.estado]}</p>
          )}
          <button type="button" onClick={() => onMenu(s)} aria-label={`Más opciones de ${solId(s)}`} className="w-[52px] min-h-[52px] rounded-2xl border border-white/[0.09] bg-white/[0.04] text-zinc-300 grid place-items-center hover:bg-white/[0.09] active:scale-95 transition-all cursor-pointer">
            <MoreHorizontal size={22} />
          </button>
        </div>
      </div>
    </motion.li>
  );
}
