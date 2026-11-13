// Pruebas: qué se probó, en qué pieza, cuándo, con qué resultado, fotos, quién lo aprobó o por qué se rechazó, y comentarios.
import { useRef, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, Loader2, MessageSquare, Pencil, Plus, RotateCcw, Send, Trash2, X } from "lucide-react";
import { api } from "../produccion/util";
import { PRUEBA, botonPrimario, botonSecundario, campo, etiqueta, fechaHora, fechaLarga, hoyISO } from "./formato";
import { ImagenPrivada, Modal } from "./util";
import { subirArchivos } from "./api";

function FormPrueba({ inicial, onGuardar, onCerrar }) {
  const [f, setF] = useState(inicial);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal titulo={inicial.id ? "Editar prueba" : "Nueva prueba"} onCerrar={onCerrar}>
      <form onSubmit={(e) => { e.preventDefault(); onGuardar(f); }} className="flex flex-col gap-3.5">
        <label className={etiqueta}>Qué se prueba<input autoFocus required maxLength={200} value={f.que} onChange={set("que")} placeholder="Ej: Adherencia de la pintura al doblar" className={campo} /></label>
        <div className="grid sm:grid-cols-[1fr_150px] gap-3">
          <label className={etiqueta}>En qué pieza o producto<input maxLength={200} value={f.pieza || ""} onChange={set("pieza")} placeholder="Ej: Cono 2071 naranja" className={campo} /></label>
          <label className={etiqueta}>Cuándo<input type="date" value={f.fecha || ""} max={hoyISO()} onChange={set("fecha")} className={campo} /></label>
        </div>
        <label className={etiqueta}>Cómo se probó <span className="font-normal text-zinc-600">(opcional)</span><input maxLength={400} value={f.metodo || ""} onChange={set("metodo")} placeholder="Ej: doblar 90° diez veces, 5 muestras" className={campo} /></label>
        <label className={etiqueta}>Resultado <span className="font-normal text-zinc-600">(opcional, se puede cargar después)</span><textarea value={f.resultado || ""} onChange={set("resultado")} rows={3} placeholder="Qué se vio" className={`${campo} resize-y`} /></label>
        <button type="submit" disabled={!f.que.trim()} className={`${botonPrimario} mt-1`}>Guardar</button>
      </form>
    </Modal>
  );
}

function Visor({ fotos, inicio, onCerrar }) {
  const [i, setI] = useState(inicio);
  const a = fotos[i];
  return (
    <div className="fixed inset-0 z-[350] bg-black/95 flex flex-col" role="dialog" aria-modal="true" aria-label="Ver foto" onKeyDown={(e) => e.key === "Escape" && onCerrar()}>
      <div className="flex items-center gap-3 p-3 text-sm text-zinc-300">
        <span className="flex-1 truncate">{a.nombre}</span>
        <span className="text-zinc-500 tabular-nums">{i + 1} / {fotos.length}</span>
        <button onClick={onCerrar} autoFocus aria-label="Cerrar" className="w-10 h-10 grid place-items-center rounded-lg hover:bg-zinc-900 cursor-pointer"><X size={20} /></button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center relative px-12">
        <ImagenPrivada key={a.id} id={a.id} completa alt={a.nombre} className="max-w-full max-h-full object-contain" />
        {fotos.length > 1 && (
          <>
            <button onClick={() => setI((x) => (x - 1 + fotos.length) % fotos.length)} aria-label="Anterior" className="absolute left-2 w-10 h-10 grid place-items-center rounded-full bg-zinc-900/80 hover:bg-zinc-800 cursor-pointer"><ChevronLeft /></button>
            <button onClick={() => setI((x) => (x + 1) % fotos.length)} aria-label="Siguiente" className="absolute right-2 w-10 h-10 grid place-items-center rounded-full bg-zinc-900/80 hover:bg-zinc-800 cursor-pointer"><ChevronRight /></button>
          </>
        )}
      </div>
    </div>
  );
}

/** Aprobar o rechazar: quién (libre, por defecto uno mismo), cuándo y por qué. */
function Decidir({ x, decision, yo, usuarios, accion, onListo }) {
  const [f, setF] = useState({ nombre: yo || "", fecha: hoyISO(), motivo: "" });
  const rechazo = decision === "RECHAZADA";
  const guardar = async (e) => {
    e.preventDefault();
    if (await accion(() => api(`/api/proyectos/pruebas/${x.id}/decidir`, { method: "POST", body: { decision, ...f } }), rechazo ? "Prueba rechazada. Se avisó a los interesados." : "Prueba aprobada. Se avisó a los interesados.")) onListo();
  };
  return (
    <form onSubmit={guardar} className={`mt-3 rounded-xl border p-3 flex flex-col gap-2.5 ${rechazo ? "border-rose-500/40 bg-rose-500/[0.05]" : "border-emerald-500/40 bg-emerald-500/[0.05]"}`}>
      <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
        <label className={etiqueta}>
          {rechazo ? "¿Quién lo rechazó?" : "¿Quién lo aprobó?"}
          <input list={`dec-${x.id}`} required value={f.nombre} onChange={(e) => setF((v) => ({ ...v, nombre: e.target.value }))} maxLength={120} className={campo} />
          <datalist id={`dec-${x.id}`}>{usuarios.map((u) => <option key={u.id} value={u.nombre} />)}</datalist>
        </label>
        <label className={etiqueta}>Cuándo<input type="date" required max={hoyISO()} value={f.fecha} onChange={(e) => setF((v) => ({ ...v, fecha: e.target.value }))} className={campo} /></label>
      </div>
      <label className={etiqueta}>
        {rechazo ? "¿Por qué se rechaza?" : "Comentario (opcional)"}
        <textarea required={rechazo} autoFocus value={f.motivo} onChange={(e) => setF((v) => ({ ...v, motivo: e.target.value }))} rows={2} maxLength={600} placeholder={rechazo ? "Ej: se descascara al doblar; no sirve para PVC flexible" : ""} className={`${campo} resize-y`} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={rechazo && !f.motivo.trim()} className={rechazo ? "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer disabled:opacity-50" : botonPrimario}>
          {rechazo ? <X size={15} /> : <Check size={15} />} {rechazo ? "Rechazar" : "Aprobar"}
        </button>
        <button type="button" onClick={onListo} className={botonSecundario}>Cancelar</button>
      </div>
    </form>
  );
}

function Prueba({ x, p, accion, aviso, recargar, usuarios, yo, onEditar }) {
  const [decidiendo, setDecidiendo] = useState(null);
  const [comentario, setComentario] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [visor, setVisor] = useState(null);
  const input = useRef(null);
  const fotos = x.archivos.filter((a) => a.tiene_miniatura);
  const otros = x.archivos.filter((a) => !a.tiene_miniatura);
  const e = PRUEBA[x.estado];

  const subir = async (files) => {
    if (!files?.length) return;
    setSubiendo(true);
    try {
      await subirArchivos(p.id, files, { pruebaId: x.id });
      await recargar();
    } catch (err) {
      aviso(err.message, "error");
    } finally {
      setSubiendo(false);
      if (input.current) input.current.value = "";
    }
  };
  const comentar = async (ev) => {
    ev.preventDefault();
    if (await accion(() => api(`/api/proyectos/${p.id}/novedades`, { method: "POST", body: { texto: comentario, prueba_id: x.id } }))) setComentario("");
  };

  return (
    <li className={`rounded-2xl border bg-[#0b0b0c] overflow-hidden ${x.estado === "APROBADA" ? "border-emerald-500/30" : x.estado === "RECHAZADA" ? "border-rose-500/30" : "border-zinc-800"}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${e.clase}`}>{e.texto}</span>
              <span className="text-xs text-zinc-500">{fechaLarga(x.fecha)}{x.creado_por ? ` · cargó ${x.creado_por}` : ""}</span>
            </div>
            <h3 className="mt-1.5 text-base font-semibold text-white leading-snug">{x.que}</h3>
            {x.pieza && <p className="text-sm text-zinc-400">En: {x.pieza}</p>}
          </div>
          <button onClick={() => onEditar(x)} aria-label="Editar prueba" className="w-9 h-9 grid place-items-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer"><Pencil size={15} /></button>
          <button onClick={() => window.confirm(`¿Borrar la prueba «${x.que}»? Las fotos quedan en el proyecto.`) && accion(() => api(`/api/proyectos/pruebas/${x.id}`, { method: "DELETE" }), "Prueba borrada.")} aria-label="Borrar prueba" className="w-9 h-9 grid place-items-center rounded-lg text-zinc-500 hover:text-rose-300 hover:bg-zinc-900 cursor-pointer"><Trash2 size={15} /></button>
        </div>

        {(x.metodo || x.resultado) && (
          <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            {x.metodo && <><dt className="text-zinc-500">Cómo</dt><dd className="text-zinc-300">{x.metodo}</dd></>}
            {x.resultado && <><dt className="text-zinc-500">Resultado</dt><dd className="text-zinc-100 whitespace-pre-wrap">{x.resultado}</dd></>}
          </dl>
        )}

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {fotos.map((a, i) => (
            <button key={a.id} onClick={() => setVisor(i)} className="shrink-0 cursor-zoom-in" aria-label={`Ver ${a.nombre}`}>
              <ImagenPrivada id={a.id} alt={a.nombre} className="w-24 h-24 sm:w-28 sm:h-28 object-cover rounded-xl border border-zinc-800" />
            </button>
          ))}
          <button onClick={() => input.current?.click()} disabled={subiendo} className="shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-xl border-2 border-dashed border-zinc-700 hover:border-[#FF5A00] text-zinc-500 hover:text-[#FF5A00] grid place-items-center cursor-pointer" aria-label="Agregar fotos">
            {subiendo ? <Loader2 className="animate-spin" /> : <span className="flex flex-col items-center gap-1 text-xs"><Camera size={20} /> Fotos</span>}
          </button>
          <input ref={input} type="file" accept="image/*,video/*,.pdf" multiple className="hidden" onChange={(ev) => subir(ev.target.files)} />
        </div>
        {otros.length > 0 && <p className="mt-1 text-xs text-zinc-500">También: {otros.map((a) => a.nombre).join(", ")} (en «Fotos y archivos»).</p>}

        {x.estado === "PENDIENTE" ? (
          decidiendo ? (
            <Decidir x={x} decision={decidiendo} yo={yo} usuarios={usuarios} accion={accion} onListo={() => setDecidiendo(null)} />
          ) : (
            <div className="mt-3 flex gap-2">
              <button onClick={() => setDecidiendo("APROBADA")} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 cursor-pointer"><Check size={15} /> Aprobar</button>
              <button onClick={() => setDecidiendo("RECHAZADA")} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 cursor-pointer"><X size={15} /> Rechazar</button>
            </div>
          )
        ) : (
          <div className={`mt-3 rounded-xl px-3 py-2.5 flex items-start gap-2 ${x.estado === "APROBADA" ? "bg-emerald-500/[0.07]" : "bg-rose-500/[0.07]"}`}>
            {x.estado === "APROBADA" ? <Check size={16} className="text-emerald-400 mt-0.5 shrink-0" /> : <X size={16} className="text-rose-400 mt-0.5 shrink-0" />}
            <div className="flex-1 min-w-0 text-sm">
              <p className={x.estado === "APROBADA" ? "text-emerald-200" : "text-rose-200"}>
                {x.estado === "APROBADA" ? "Aprobó" : "Rechazó"} <b>{x.decidido_por}</b> · {fechaLarga(x.decidido_at)}
                {x.decision_cargada_por && <span className="text-zinc-500 text-xs"> (lo cargó {x.decision_cargada_por})</span>}
              </p>
              {x.motivo && <p className="mt-0.5 text-zinc-200">{x.estado === "RECHAZADA" ? "Motivo: " : ""}{x.motivo}</p>}
            </div>
            <button onClick={() => accion(() => api(`/api/proyectos/pruebas/${x.id}/decidir`, { method: "POST", body: { decision: "PENDIENTE" } }), "Volvió a pendiente.")} title="Volver a pendiente" aria-label="Volver a pendiente" className="w-8 h-8 grid place-items-center rounded-lg text-zinc-500 hover:text-white hover:bg-black/30 cursor-pointer"><RotateCcw size={14} /></button>
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800 bg-black/30 px-4 py-3">
        {x.comentarios.length > 0 && (
          <ul className="mb-2.5 flex flex-col gap-2">
            {x.comentarios.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="text-xs text-zinc-500"><b className="text-zinc-300 font-semibold">{c.usuario_nombre}</b> · {fechaHora(c.created_at)}</span>
                <p className="text-zinc-200 whitespace-pre-wrap">{c.texto}</p>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={comentar} className="flex gap-2">
          <label className="relative flex-1">
            <MessageSquare size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input value={comentario} onChange={(ev) => setComentario(ev.target.value)} placeholder="Comentar esta prueba" aria-label="Comentario" className="w-full bg-black border border-zinc-800 focus:border-[#FF5A00] rounded-xl pl-9 pr-3 py-2 text-sm text-white outline-none" />
          </label>
          <button type="submit" disabled={!comentario.trim()} aria-label="Enviar comentario" className="w-10 h-10 grid place-items-center rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white cursor-pointer disabled:opacity-40"><Send size={15} /></button>
        </form>
      </div>
      {visor != null && <Visor fotos={fotos} inicio={visor} onCerrar={() => setVisor(null)} />}
    </li>
  );
}

export default function Pruebas({ p, accion, aviso, recargar, usuarios }) {
  const [form, setForm] = useState(null);
  const guardar = async (f) => {
    const ok = await accion(() => (f.id ? api(`/api/proyectos/pruebas/${f.id}`, { method: "PUT", body: f }) : api(`/api/proyectos/${p.id}/pruebas`, { method: "POST", body: f })), "Prueba guardada.");
    if (ok) setForm(null);
  };
  const r = p.resumen_pruebas;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <h2 className="text-lg font-semibold text-white">Pruebas</h2>
          <p className="text-xs text-zinc-500">{r.total ? `${r.aprobadas} aprobada${r.aprobadas === 1 ? "" : "s"} · ${r.rechazadas} rechazada${r.rechazadas === 1 ? "" : "s"} · ${r.pendientes} pendiente${r.pendientes === 1 ? "" : "s"}` : "Cada prueba con sus fotos, su resultado y quién la aprobó o por qué se rechazó."}</p>
        </div>
        <button onClick={() => setForm({ que: "", pieza: "", fecha: hoyISO(), metodo: "", resultado: "" })} className={botonPrimario}><Plus size={16} /> Nueva prueba</button>
      </div>
      {p.pruebas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 py-12 text-center">
          <p className="text-sm text-zinc-400">Todavía no hay pruebas.</p>
          <p className="text-xs text-zinc-600 mt-1">También las arma la IA si las contás en «Novedades».</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {p.pruebas.map((x) => <Prueba key={x.id} x={x} p={p} accion={accion} aviso={aviso} recargar={recargar} usuarios={usuarios} yo={p.yo?.nombre} onEditar={(v) => setForm({ ...v })} />)}
        </ul>
      )}
      {form && <FormPrueba inicial={form} onGuardar={guardar} onCerrar={() => setForm(null)} />}
    </div>
  );
}
