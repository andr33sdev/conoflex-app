// Fotos, renders, planos y documentos del proyecto (reemplaza la carpeta de Drive).
import { useEffect, useRef, useState } from "react";
import { BadgeCheck, ChevronLeft, ChevronRight, Download, ExternalLink, ImagePlus, Loader2, Star, Trash2, UploadCloud, X } from "lucide-react";
import { api } from "../produccion/util";
import { getApiUrl } from "../apiConfig";
import { IconoArchivo, ImagenPrivada } from "./util";
import { TIPOS_ARCHIVO, abrirArchivo, fechaCorta, pesoArchivo } from "./formato";

const NOMBRE_ETAPA = { ENTRADAS: "Entradas", MATRICERO: "Matricero", VERIFICACION: "Verificación", VALIDACION: "Validación", ESPECIFICACIONES: "Especificaciones", CAMBIOS: "Cambios" };

function Visor({ lista, inicio, onCerrar }) {
  const [i, setI] = useState(inicio);
  useEffect(() => {
    const t = (e) => {
      if (e.key === "Escape") onCerrar();
      if (e.key === "ArrowRight") setI((x) => (x + 1) % lista.length);
      if (e.key === "ArrowLeft") setI((x) => (x - 1 + lista.length) % lista.length);
    };
    document.addEventListener("keydown", t);
    return () => document.removeEventListener("keydown", t);
  }, [lista.length, onCerrar]);
  const a = lista[i];
  return (
    <div className="fixed inset-0 z-[350] bg-black/95 flex flex-col" role="dialog" aria-modal="true" aria-label="Ver imagen">
      <div className="flex items-center gap-3 p-3 text-sm text-zinc-300">
        <span className="flex-1 truncate">{a.nombre}{a.es_oficial && <span className="ml-2 text-emerald-300">· oficial</span>}</span>
        <span className="text-zinc-500 tabular-nums">{i + 1} / {lista.length}</span>
        <button onClick={onCerrar} aria-label="Cerrar" className="w-10 h-10 grid place-items-center rounded-lg hover:bg-zinc-900 cursor-pointer"><X size={20} /></button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center relative px-12">
        <ImagenPrivada key={a.id} id={a.id} completa alt={a.nombre} className="max-w-full max-h-full object-contain" />
        {lista.length > 1 && (
          <>
            <button onClick={() => setI((x) => (x - 1 + lista.length) % lista.length)} aria-label="Anterior" className="absolute left-2 w-10 h-10 grid place-items-center rounded-full bg-zinc-900/80 hover:bg-zinc-800 cursor-pointer"><ChevronLeft /></button>
            <button onClick={() => setI((x) => (x + 1) % lista.length)} aria-label="Siguiente" className="absolute right-2 w-10 h-10 grid place-items-center rounded-full bg-zinc-900/80 hover:bg-zinc-800 cursor-pointer"><ChevronRight /></button>
          </>
        )}
      </div>
      {a.descripcion && <p className="p-4 text-center text-sm text-zinc-300">{a.descripcion}</p>}
    </div>
  );
}

export default function Archivos({ p, accion, aviso, recargar }) {
  const [subiendo, setSubiendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [filtro, setFiltro] = useState("TODOS");
  const [visor, setVisor] = useState(null);
  const input = useRef(null);

  const subir = async (files) => {
    if (!files?.length) return;
    setSubiendo(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("archivos", f);
      const r = await fetch(getApiUrl(`/api/desarrollo/proyectos/${p.id}/archivos`), { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No se pudieron subir.");
      aviso(j.archivos.length === 1 ? "Archivo subido." : `${j.archivos.length} archivos subidos.`);
      await recargar();
    } catch (e) {
      aviso(e.message, "error");
    } finally {
      setSubiendo(false);
      if (input.current) input.current.value = "";
    }
  };
  const editar = (a, body, ok) => accion(() => api(`/api/desarrollo/archivos/${a.id}`, { method: "PUT", body }), ok);
  const borrar = (a) => {
    if (window.confirm(`¿Quitar «${a.nombre}» del proyecto?`)) accion(() => api(`/api/desarrollo/archivos/${a.id}`, { method: "DELETE" }), "Archivo quitado.");
  };

  const tipos = [...new Set(p.archivos.map((a) => a.tipo))];
  const visibles = p.archivos.filter((a) => filtro === "TODOS" || (filtro === "OFICIAL" ? a.es_oficial : a.tipo === filtro));
  const imagenes = visibles.filter((a) => a.tiene_miniatura);

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); subir(e.dataTransfer.files); }}
        className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${arrastrando ? "border-[#FF5A00] bg-[#FF5A00]/5" : "border-zinc-800"}`}
      >
        {subiendo ? <Loader2 className="mx-auto animate-spin text-[#FF5A00]" /> : <UploadCloud className="mx-auto text-zinc-500" />}
        <p className="mt-2 text-sm text-zinc-300">Arrastrá fotos, renders, planos (PDF, DWG, STEP) o documentos</p>
        <button onClick={() => input.current?.click()} disabled={subiendo} className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-zinc-700 hover:border-zinc-500 text-white cursor-pointer"><ImagePlus size={16} /> Elegir archivos</button>
        <p className="mt-2 text-xs text-zinc-600">Hasta 25 MB cada uno. Desde el celular podés sacar la foto directamente.</p>
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => subir(e.target.files)} />
      </div>

      {p.archivos.length > 0 && (
        <div className="mt-5 flex gap-1.5 flex-wrap">
          {[["TODOS", "Todos"], ["OFICIAL", "Oficiales"], ...tipos.map((t) => [t, TIPOS_ARCHIVO[t]])].map(([k, t]) => (
            <button key={k} onClick={() => setFiltro(k)} className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer border ${filtro === k ? "border-[#FF5A00] text-white bg-[#FF5A00]/10" : "border-zinc-800 text-zinc-400 hover:text-white"}`}>{t}</button>
          ))}
        </div>
      )}

      <ul className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {visibles.map((a) => (
          <li key={a.id} className={`rounded-2xl border bg-[#0b0b0c] overflow-hidden ${a.es_oficial ? "border-emerald-500/40" : "border-zinc-800"}`}>
            <button onClick={() => (a.tiene_miniatura ? setVisor(imagenes.findIndex((x) => x.id === a.id)) : abrirArchivo(a).catch((e) => aviso(e.message, "error")))} className="relative block w-full aspect-[4/3] cursor-zoom-in" aria-label={`Ver ${a.nombre}`}>
              <IconoArchivo archivo={a} className="w-full h-full" />
              {a.es_oficial && <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/90 text-black"><BadgeCheck size={12} /> Oficial</span>}
              {p.portada_id === a.id && <span className="absolute top-2 right-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/70 text-white">Portada</span>}
            </button>
            <div className="p-3">
              <p className="text-sm font-medium text-white truncate" title={a.nombre}>{a.nombre}</p>
              <p className="text-xs text-zinc-500">{a.subido_por} · {fechaCorta(a.created_at)}{a.tamano ? ` · ${pesoArchivo(a.tamano)}` : ""}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select value={a.tipo} onChange={(e) => editar(a, { tipo: e.target.value })} aria-label="Tipo de archivo" className="bg-black border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200">
                  {Object.entries(TIPOS_ARCHIVO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={a.etapa || ""} onChange={(e) => editar(a, { etapa: e.target.value || null })} aria-label="Etapa" className="bg-black border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200">
                  <option value="">Sin etapa</option>
                  {p.etapas.map((e) => <option key={e.etapa} value={e.etapa}>{NOMBRE_ETAPA[e.etapa]}</option>)}
                </select>
              </div>
              <input defaultValue={a.descripcion || ""} onBlur={(e) => e.target.value !== (a.descripcion || "") && editar(a, { descripcion: e.target.value })} placeholder="Descripción" aria-label="Descripción" className="mt-2 w-full bg-black border border-zinc-800 focus:border-[#FF5A00] rounded-lg px-2 py-1.5 text-xs text-zinc-200 outline-none" />
              <div className="mt-2 flex items-center gap-1">
                <button onClick={() => editar(a, { es_oficial: !a.es_oficial }, a.es_oficial ? "Ya no es la imagen oficial." : "Marcada como imagen oficial 2D/3D aprobada.")} title="Imagen 2D/3D oficial aprobada antes de la primera producción" className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs cursor-pointer ${a.es_oficial ? "text-emerald-300 bg-emerald-500/10" : "text-zinc-400 hover:text-white hover:bg-zinc-900"}`}><BadgeCheck size={14} /> {a.es_oficial ? "Oficial" : "Marcar oficial"}</button>
                {a.tiene_miniatura && p.portada_id !== a.id && <button onClick={() => editar(a, { portada: true }, "Portada cambiada.")} title="Usar de portada" aria-label="Usar de portada" className="w-8 h-8 grid place-items-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer"><Star size={14} /></button>}
                <div className="flex-1" />
                <button onClick={() => abrirArchivo(a).catch((e) => aviso(e.message, "error"))} title="Abrir" aria-label="Abrir" className="w-8 h-8 grid place-items-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer"><ExternalLink size={14} /></button>
                <button onClick={() => abrirArchivo(a, true).catch((e) => aviso(e.message, "error"))} title="Descargar" aria-label="Descargar" className="w-8 h-8 grid place-items-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer"><Download size={14} /></button>
                <button onClick={() => borrar(a)} title="Quitar" aria-label="Quitar" className="w-8 h-8 grid place-items-center rounded-lg text-zinc-500 hover:text-rose-300 hover:bg-zinc-900 cursor-pointer"><Trash2 size={14} /></button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {visor != null && imagenes.length > 0 && <Visor lista={imagenes} inicio={Math.max(0, visor)} onCerrar={() => setVisor(null)} />}
    </div>
  );
}
