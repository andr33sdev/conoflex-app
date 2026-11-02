import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Ban, Building2, CheckCircle2, FilePlus2, Loader2, MessageSquareText, Package } from "lucide-react";
import { Boton, Chip, Drawer, Etiqueta } from "../produccion/ui";
import { api } from "../produccion/util";
import { formatFechaArg, formatHoraArg, hace } from "../solicitudes/util";
import { AvisoEnCurso } from "./FormularioSugerencia";
import { RayasUrgencia } from "./Urgencia";
import { ESTADO, abrev, areaDe, idSC, nf } from "./util";

function Paso({ color, titulo, fecha, usuario, children, ultimo }) {
  return (
    <li className="relative pl-7 pb-5 last:pb-0">
      <span className={`absolute left-0 top-1 w-3.5 h-3.5 rounded-full border-2 border-[#0d0d10] ${color}`} />
      {!ultimo && <span className="absolute left-[6px] top-5 bottom-0 w-px bg-white/[0.08]" />}
      <p className="text-[15px] font-bold text-white">{titulo}{usuario && <span className="font-medium text-zinc-400"> · {usuario}</span>}</p>
      <p className="text-xs text-zinc-500 tabular-nums">{formatFechaArg(fecha)} · {formatHoraArg(fecha)} hs</p>
      {children}
    </li>
  );
}

function Auditoria({ id }) {
  const [eventos, setEventos] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let vivo = true;
    api(`/api/sugerencias-compra/${id}/auditoria`)
      .then((r) => vivo && setEventos(r))
      .catch((e) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [id]);
  if (error) return <p className="text-sm text-rose-300">{error}</p>;
  if (!eventos) return <div className="h-20 rounded-2xl bg-white/[0.04] animate-pulse" />;
  return (
    <ol>
      {eventos.map((e, i) => {
        const d = e.detalle || {};
        const ultimo = i === eventos.length - 1;
        if (e.tipo === "SUGERIDA") return <Paso key={i} ultimo={ultimo} color="bg-zinc-300" titulo="Sugerida" usuario={e.usuario} fecha={e.fecha}><p className="mt-1 text-sm text-zinc-400">{nf(d.cantidad, 3)} · urgencia {d.urgencia}{d.motivo ? ` · ${d.motivo}` : ""}</p></Paso>;
        if (e.tipo === "AGREGADA")
          return (
            <Paso key={i} ultimo={ultimo} color="bg-emerald-400" titulo={`Agregada a ${idSC(d.solicitud_id)}`} usuario={e.usuario} fecha={e.fecha}>
              <p className="mt-1 text-sm text-zinc-400">{nf(d.cantidad, 3)}{Number(d.cantidad) !== Number(d.cantidad_sugerida) ? ` (se sugirió ${nf(d.cantidad_sugerida, 3)})` : " tal cual se sugirió"} · {d.proveedor || "proveedor a definir"}</p>
              {d.ya_solicitado?.length > 0 && <p className="mt-1 text-xs font-semibold text-amber-300">Ya estaba solicitada ({d.ya_solicitado.map((p) => idSC(p.solicitud_id)).join(", ")}) y se confirmó agregarla igual.</p>}
            </Paso>
          );
        return <Paso key={i} ultimo={ultimo} color="bg-rose-400" titulo="Descartada" usuario={e.usuario} fecha={e.fecha}>{d.motivo && <p className="mt-1 text-sm text-zinc-400">{d.motivo}</p>}</Paso>;
      })}
    </ol>
  );
}

export default function FichaSugerencia({ s, puedeGestionar, yoId, onCerrar, onAgregar, onDescartar }) {
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const pendiente = s?.estado === "PENDIENTE";
  const puedeDescartar = pendiente && (puedeGestionar || s?.sugerida_por_id === yoId);
  const cerrar = () => {
    setConfirmando(false);
    setMotivo("");
    onCerrar();
  };
  const descartar = async () => {
    setTrabajando(true);
    try {
      await onDescartar(s, motivo);
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <Drawer
      abierto={!!s}
      onCerrar={cerrar}
      titulo={s?.mp_nombre || ""}
      subtitulo={s && <span className="font-mono text-[#ff8a4d] font-bold">{s.mp_codigo}</span>}
      derecha={s && <Chip tono={ESTADO[s.estado].tono}>{ESTADO[s.estado].texto}</Chip>}
      pie={
        s && pendiente && (puedeGestionar || puedeDescartar) ? (
          confirmando ? (
            <div className="flex flex-col gap-3">
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Motivo (opcional)" className="w-full min-h-[48px] rounded-xl bg-[#17171c] border border-white/[0.09] px-3.5 text-[15px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-rose-400/60" />
              <div className="flex gap-3">
                <button type="button" onClick={() => setConfirmando(false)} className="min-h-[52px] px-5 rounded-2xl text-zinc-300 hover:bg-white/[0.06] font-bold cursor-pointer">No</button>
                <button type="button" onClick={descartar} disabled={trabajando} className="flex-1 min-h-[52px] rounded-2xl bg-rose-500 text-white font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">{trabajando && <Loader2 size={18} className="animate-spin" />} Sí, descartar</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              {puedeDescartar && <Boton variante="peligro" grande icono={Ban} onClick={() => setConfirmando(true)}>Descartar</Boton>}
              {puedeGestionar && <button type="button" onClick={() => onAgregar(s)} className="flex-1 min-h-[52px] rounded-2xl bg-[#FFD60A] text-black text-lg font-extrabold inline-flex items-center justify-center gap-2.5 hover:bg-white active:scale-[0.99] transition-all cursor-pointer"><FilePlus2 size={20} /> Agregar a una solicitud</button>}
            </div>
          )
        ) : undefined
      }
    >
      {s && (
        <div className="flex flex-col gap-6">
          <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5 flex flex-col gap-4">
            <div className="flex items-end justify-between gap-3">
              <span className="tabular-nums leading-none"><b className="text-[40px] font-extrabold text-white">{nf(s.cantidad, 3)}</b> <span className="text-base font-semibold text-zinc-500">{abrev(s.unidad)}</span></span>
              <RayasUrgencia valor={s.urgencia} grande />
            </div>
            {s.motivo && <p className="flex items-start gap-2 text-[15px] text-zinc-300"><MessageSquareText size={16} className="mt-0.5 shrink-0 text-zinc-500" />{s.motivo}</p>}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><Etiqueta>Sugerida por</Etiqueta><p className="font-semibold text-zinc-200 flex items-center gap-1.5"><Building2 size={14} className="text-zinc-500" />{s.sugerida_por}</p><p className="text-xs text-zinc-500">{[areaDe(s.sugerida_por_rol), hace(s.created_at)].filter(Boolean).join(" · ")}</p></div>
              <div><Etiqueta>Stock actual</Etiqueta><p className="font-semibold text-zinc-200 flex items-center gap-1.5"><Package size={14} className="text-zinc-500" />{nf(s.stock_actual, 2)} {abrev(s.unidad)}</p></div>
            </div>
          </div>

          {pendiente && s.en_curso?.length > 0 && <AvisoEnCurso materia={{ en_curso: s.en_curso }} />}
          {s.estado === "AGREGADA" && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] px-4 py-3 text-sm text-emerald-100 flex items-start gap-2.5">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-300" />
              <span>En <b>{idSC(s.solicitud_id)}</b>: {nf(s.cantidad_pedida, 3)} {abrev(s.unidad)}{s.proveedor_asignado ? ` a ${s.proveedor_asignado}` : ", proveedor a definir"}.</span>
            </motion.div>
          )}

          <div>
            <Etiqueta className="mb-3">Auditoría</Etiqueta>
            <Auditoria key={`${s.id}-${s.estado}`} id={s.id} />
          </div>
        </div>
      )}
    </Drawer>
  );
}
