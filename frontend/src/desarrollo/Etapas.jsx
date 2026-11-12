// Etapas del R.032: detalle, estado y aprobación de cada una.
import { useState } from "react";
import { Ban, Check, Clock, Loader2, Pencil, Send, X } from "lucide-react";
import { api } from "../produccion/util";
import { botonPrimario, botonSecundario, campo, fechaCorta, fechaHora } from "./formato";

function Aprobacion({ e }) {
  if (e.estado === "NO_APLICA") return <span className="text-xs text-zinc-500">No aplica</span>;
  if (e.aprobacion_estado === "APROBADA") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300"><Check size={14} /> Aprobó {e.aprobador_nombre} · {fechaHora(e.aprobado_at)}</span>;
  if (e.aprobacion_estado === "PEDIDA") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300"><Clock size={14} /> Esperando a {e.aprobador_nombre}</span>;
  if (e.aprobacion_estado === "RECHAZADA") return <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-300"><X size={14} /> No aprobó {e.aprobador_nombre}</span>;
  return null;
}

function Etapa({ e, p, accion, usuarios, n }) {
  const [editando, setEditando] = useState(false);
  const [detalle, setDetalle] = useState(e.detalle || "");
  const [pidiendo, setPidiendo] = useState(false);
  const [aprobador, setAprobador] = useState("");
  const [guardando, setGuardando] = useState(false);
  const url = `/api/desarrollo/proyectos/${p.id}/etapas/${e.etapa}`;

  const guardar = async () => {
    setGuardando(true);
    const yaAprobada = e.aprobacion_estado === "APROBADA" && detalle !== (e.detalle || "");
    if (await accion(() => api(url, { method: "PUT", body: { detalle } }), yaAprobada ? "Guardado. Como cambió el contenido, hay que volver a aprobarla." : "Etapa guardada.")) setEditando(false);
    setGuardando(false);
  };
  const pedir = async () => {
    if (await accion(() => api(`${url}/pedir-aprobacion`, { method: "POST", body: { aprobador_id: Number(aprobador) } }), "Listo, le llegó el aviso.")) setPidiendo(false);
  };
  const noAplica = () => accion(() => api(url, { method: "PUT", body: { estado: e.estado === "NO_APLICA" ? "EN_CURSO" : "NO_APLICA" } }), e.estado === "NO_APLICA" ? "La etapa vuelve a contar." : "Marcada como «no aplica».");
  const cerrar = () => accion(() => api(url, { method: "PUT", body: { estado: "LISTA" } }), "Etapa cerrada.");

  const vacio = !String(e.detalle || "").replace(/[\s-]/g, "");
  return (
    <li className={`rounded-2xl border bg-[#0b0b0c] ${e.cerrada ? "border-emerald-500/25" : e.aprobacion_estado === "PEDIDA" ? "border-amber-500/30" : "border-zinc-800"}`}>
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className={`w-8 h-8 shrink-0 rounded-full grid place-items-center text-sm font-semibold ${e.cerrada ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-900 text-zinc-400"}`}>{e.cerrada ? <Check size={16} /> : n}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
              <h3 className="text-base font-semibold text-white">{e.nombre}</h3>
              <Aprobacion e={e} />
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">{e.ayuda}</p>
          </div>
          {!editando && e.estado !== "NO_APLICA" && (
            <button onClick={() => { setDetalle(e.detalle || ""); setEditando(true); }} aria-label={`Editar ${e.nombre}`} className="w-9 h-9 grid place-items-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer shrink-0"><Pencil size={16} /></button>
          )}
        </div>

        <div className="mt-3 sm:pl-11">
          {editando ? (
            <>
              <textarea autoFocus value={detalle} onChange={(ev) => setDetalle(ev.target.value)} rows={Math.min(14, Math.max(4, detalle.split("\n").length + 1))} placeholder={"- Un punto por renglón\n- Con números y unidades"} className={`${campo} font-mono text-[13px] leading-relaxed resize-y`} />
              {e.aprobacion_estado === "APROBADA" && <p className="mt-2 text-xs text-amber-300">Ya está aprobada: si cambiás el contenido, la aprobación queda sin efecto y hay que pedirla de nuevo.</p>}
              <div className="mt-3 flex gap-2">
                <button onClick={guardar} disabled={guardando} className={botonPrimario}>{guardando && <Loader2 size={16} className="animate-spin" />} Guardar</button>
                <button onClick={() => setEditando(false)} className={botonSecundario}>Cancelar</button>
              </div>
            </>
          ) : vacio ? (
            <p className="text-sm text-zinc-600">{e.estado === "NO_APLICA" ? "Marcada como «no aplica»." : "Sin cargar todavía."}</p>
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-200 leading-relaxed">{e.detalle}</pre>
          )}
          {!editando && e.aprobacion_estado === "RECHAZADA" && e.aprobacion_comentario && <p className="mt-2 text-sm text-rose-300">Motivo: {e.aprobacion_comentario}</p>}
          {!editando && e.aprobacion_estado === "APROBADA" && e.aprobacion_comentario && <p className="mt-2 text-sm text-emerald-200/80">“{e.aprobacion_comentario}”</p>}
          {!editando && (e.fecha || e.actualizado_por) && <p className="mt-2 text-xs text-zinc-600">{e.fecha && `Fecha: ${fechaCorta(e.fecha)}`}{e.actualizado_por && ` · última edición: ${e.actualizado_por}`}</p>}

          {!editando && p.estado !== "DESCARTADO" && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {e.aprobable && !vacio && e.estado !== "NO_APLICA" && e.aprobacion_estado !== "APROBADA" && e.aprobacion_estado !== "PEDIDA" && !pidiendo && (
                <button onClick={() => setPidiendo(true)} className={botonSecundario}><Send size={15} /> Pedir aprobación</button>
              )}
              {e.aprobacion_estado === "PEDIDA" && !pidiendo && <button onClick={() => setPidiendo(true)} className="text-xs text-zinc-400 hover:text-white cursor-pointer">Pedírsela a otra persona</button>}
              {!e.aprobable && !vacio && e.estado !== "LISTA" && <button onClick={cerrar} className={botonSecundario}><Check size={15} /> Marcar como lista</button>}
              {e.etapa !== "ENTRADAS" && e.aprobacion_estado !== "APROBADA" && e.aprobacion_estado !== "PEDIDA" && (
                <button onClick={noAplica} className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white cursor-pointer px-2 py-2"><Ban size={14} /> {e.estado === "NO_APLICA" ? "Sí aplica" : "No aplica"}</button>
              )}
            </div>
          )}
          {pidiendo && (
            <div className="mt-3 flex gap-2 flex-wrap items-center">
              <select value={aprobador} onChange={(ev) => setAprobador(ev.target.value)} aria-label="Quién aprueba" className={`${campo} w-auto min-w-[200px]`}>
                <option value="">¿Quién aprueba?</option>
                {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
              <button onClick={pedir} disabled={!aprobador} className={botonPrimario}><Send size={15} /> Enviar</button>
              <button onClick={() => setPidiendo(false)} className={botonSecundario}>Cancelar</button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export default function Etapas({ p, accion, usuarios }) {
  return (
    <div className="max-w-3xl">
      <p className="text-sm text-zinc-500 mb-4">Cada etapa se aprueba con el usuario de quien aprueba, con fecha y hora. Si después cambia el contenido, la aprobación se cae sola.</p>
      <ol className="flex flex-col gap-3">
        {p.etapas.map((e, i) => <Etapa key={e.etapa} e={e} n={i + 1} p={p} accion={accion} usuarios={usuarios} />)}
      </ol>
    </div>
  );
}
