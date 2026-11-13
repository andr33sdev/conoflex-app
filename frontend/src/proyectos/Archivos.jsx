// Todas las fotos, videos y documentos del proyecto (de las pruebas y sueltos).
import { useRef, useState } from "react";
import { Download, ExternalLink, ImagePlus, Loader2, Star, Trash2, UploadCloud } from "lucide-react";
import { api } from "../produccion/util";
import { fechaCorta } from "./formato";
import { Miniatura } from "./util";
import { abrirArchivo, subirArchivos } from "./api";

export default function Archivos({ p, accion, aviso, recargar }) {
  const [subiendo, setSubiendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const input = useRef(null);
  const subir = async (files) => {
    if (!files?.length) return;
    setSubiendo(true);
    try {
      const r = await subirArchivos(p.id, files);
      aviso(r.archivos.length === 1 ? "Archivo subido." : `${r.archivos.length} archivos subidos.`);
      await recargar();
    } catch (e) {
      aviso(e.message, "error");
    } finally {
      setSubiendo(false);
      if (input.current) input.current.value = "";
    }
  };
  const abrir = (a, desc) => abrirArchivo(a, desc).catch((e) => aviso(e.message, "error"));
  const pruebaDe = (id) => p.pruebas.find((x) => x.id === id)?.que;

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); subir(e.dataTransfer.files); }}
        className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${arrastrando ? "border-[#FF5A00] bg-[#FF5A00]/5" : "border-zinc-800"}`}
      >
        {subiendo ? <Loader2 className="mx-auto animate-spin text-[#FF5A00]" /> : <UploadCloud className="mx-auto text-zinc-500" />}
        <p className="mt-2 text-sm text-zinc-300">Arrastrá fotos, videos, presupuestos o manuales</p>
        <button onClick={() => input.current?.click()} disabled={subiendo} className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-zinc-700 hover:border-zinc-500 text-white cursor-pointer"><ImagePlus size={16} /> Elegir archivos</button>
        <p className="mt-2 text-xs text-zinc-600">Hasta 25 MB cada uno. Las fotos de una prueba se suben desde la prueba.</p>
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => subir(e.target.files)} />
      </div>
      <ul className="mt-5 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {p.archivos.map((a) => (
          <li key={a.id} className="rounded-2xl border border-zinc-800 bg-[#0b0b0c] overflow-hidden">
            <button onClick={() => abrir(a)} className="relative block w-full aspect-square cursor-zoom-in" aria-label={`Abrir ${a.nombre}`}>
              <Miniatura archivo={a} className="w-full h-full" />
              {p.portada_id === a.id && <span className="absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/70 text-white">Portada</span>}
              {a.prueba_id && pruebaDe(a.prueba_id) && <span className="absolute bottom-2 left-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-black/70 text-zinc-200 truncate">Prueba: {pruebaDe(a.prueba_id)}</span>}
            </button>
            <div className="p-2.5">
              <p className="text-xs font-medium text-white truncate" title={a.nombre}>{a.nombre}</p>
              <p className="text-[11px] text-zinc-500">{a.subido_por} · {fechaCorta(a.created_at)}</p>
              <div className="mt-1.5 flex items-center gap-0.5">
                {a.tiene_miniatura && p.portada_id !== a.id && <button onClick={() => accion(() => api(`/api/proyectos/archivos/${a.id}`, { method: "PUT", body: { portada: true } }), "Portada cambiada.")} title="Usar de portada" aria-label="Usar de portada" className="w-8 h-8 grid place-items-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer"><Star size={14} /></button>}
                <span className="flex-1" />
                <button onClick={() => abrir(a)} title="Abrir" aria-label="Abrir" className="w-8 h-8 grid place-items-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer"><ExternalLink size={14} /></button>
                <button onClick={() => abrir(a, true)} title="Descargar" aria-label="Descargar" className="w-8 h-8 grid place-items-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer"><Download size={14} /></button>
                <button onClick={() => window.confirm(`¿Quitar «${a.nombre}»?`) && accion(() => api(`/api/proyectos/archivos/${a.id}`, { method: "DELETE" }), "Archivo quitado.")} title="Quitar" aria-label="Quitar" className="w-8 h-8 grid place-items-center rounded-lg text-zinc-500 hover:text-rose-300 hover:bg-zinc-900 cursor-pointer"><Trash2 size={14} /></button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
