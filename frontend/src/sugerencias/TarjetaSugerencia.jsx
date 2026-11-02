import { memo } from "react";
import { motion } from "framer-motion";
import { Building2, CheckCircle2, Clock, MessageSquareText, XCircle } from "lucide-react";
import { Chip } from "../produccion/ui";
import { hace } from "../solicitudes/util";
import { RayasUrgencia } from "./Urgencia";
import { abrev, areaDe, idSC, nf, nivel } from "./util";

const EASE = [0.22, 1, 0.36, 1];

function TarjetaSugerencia({ s, indice, onAbrir }) {
  const n = nivel(s.urgencia);
  const pendiente = s.estado === "PENDIENTE";
  const enCurso = s.en_curso?.length > 0;
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.4, ease: EASE, delay: Math.min(indice, 12) * 0.035 }}
      whileHover={{ y: -3 }}
      onClick={() => onAbrir(s)}
      className={`relative overflow-hidden text-left flex flex-col gap-3 rounded-3xl border bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-4 sm:p-5 cursor-pointer transition-[border-color,box-shadow] duration-300 hover:shadow-[0_18px_50px_-22px_rgba(255,90,0,0.4)] ${pendiente ? "border-white/[0.08] hover:border-[#FF5A00]/45" : "border-white/[0.05] opacity-80 hover:opacity-100"}`}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: pendiente ? n.color : "rgba(255,255,255,0.12)" }} />
      <span className="flex items-center gap-2">
        <RayasUrgencia valor={s.urgencia} />
        <span className="ml-auto">
          {s.estado === "AGREGADA" && <Chip tono="verde" icono={CheckCircle2}>En {idSC(s.solicitud_id)}</Chip>}
          {s.estado === "DESCARTADA" && <Chip tono="gris" icono={XCircle}>Descartada</Chip>}
          {pendiente && enCurso && <Chip tono="azul" icono={Clock}>Ya pedida</Chip>}
        </span>
      </span>
      <span>
        <span className="block font-mono text-[12px] font-bold tracking-wide text-[#ff8a4d]">{s.mp_codigo}</span>
        <span className="block mt-0.5 text-[17px] leading-snug font-bold text-white line-clamp-2">{s.mp_nombre}</span>
      </span>
      <span className="tabular-nums leading-none">
        <b className="text-[30px] font-extrabold text-white">{nf(s.cantidad, 3)}</b> <span className="text-sm font-semibold text-zinc-500">{abrev(s.unidad)}</span>
        {s.estado === "AGREGADA" && s.cantidad_pedida !== null && Number(s.cantidad_pedida) !== Number(s.cantidad) && <span className="ml-2 text-xs font-bold text-emerald-300">se pidió {nf(s.cantidad_pedida, 3)}</span>}
      </span>
      {s.motivo && (
        <span className="flex items-start gap-1.5 text-[13px] text-zinc-400 leading-snug"><MessageSquareText size={14} className="mt-0.5 shrink-0 text-zinc-600" /><span className="line-clamp-2">{s.motivo}</span></span>
      )}
      <span className="mt-auto flex items-center gap-1.5 text-xs text-zinc-500 pt-1">
        <Building2 size={13} className="shrink-0" />
        <span className="truncate">{[areaDe(s.sugerida_por_rol), s.sugerida_por].filter(Boolean).join(" · ")}</span>
        <span className="ml-auto shrink-0">{hace(s.created_at)}</span>
      </span>
    </motion.button>
  );
}

export default memo(TarjetaSugerencia);
