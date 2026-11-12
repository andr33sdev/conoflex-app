// Piezas compartidas del módulo Desarrollo de productos.
import { useEffect, useState } from "react";
import { FileText, ImageOff, Loader2, X } from "lucide-react";
import { getApiUrl } from "../apiConfig";
import { NARANJA } from "./formato";

const cache = new Map();
/** Imagen privada del proyecto (miniatura o completa), cargada con la sesión del usuario. */
export function ImagenPrivada({ id, completa = false, alt = "", className = "" }) {
  const clave = `${id}:${completa ? 1 : 0}`;
  const [url, setUrl] = useState(() => cache.get(clave) || null);
  const [falla, setFalla] = useState(false);
  useEffect(() => {
    if (!id || cache.has(clave)) return undefined;
    let vivo = true;
    fetch(getApiUrl(`/api/desarrollo/archivos/${id}${completa ? "" : "/miniatura"}`))
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => {
        const u = URL.createObjectURL(b);
        cache.set(clave, u);
        if (vivo) setUrl(u);
      })
      .catch(() => vivo && setFalla(true));
    return () => {
      vivo = false;
    };
  }, [id, clave, completa]);
  if (falla) return <div className={`grid place-items-center bg-zinc-900 text-zinc-600 ${className}`}><ImageOff size={20} /></div>;
  if (!url) return <div className={`grid place-items-center bg-zinc-900 text-zinc-600 ${className}`}><Loader2 size={18} className="animate-spin" /></div>;
  return <img src={url} alt={alt} className={className} />;
}

export function IconoArchivo({ archivo, className = "" }) {
  if (archivo.tiene_miniatura) return <ImagenPrivada id={archivo.id} alt={archivo.nombre} className={`object-cover ${className}`} />;
  const ext = (archivo.nombre.split(".").pop() || "").toUpperCase().slice(0, 5);
  return (
    <div className={`grid place-items-center bg-zinc-900 text-zinc-400 ${className}`}>
      <div className="flex flex-col items-center gap-1">
        <FileText size={26} />
        <span className="text-[10px] font-bold tracking-wider">{ext}</span>
      </div>
    </div>
  );
}

export function Modal({ titulo, subtitulo, onCerrar, children, ancho = "max-w-lg" }) {
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onCerrar]);
  return (
    <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className={`w-full ${ancho} max-h-[94vh] overflow-y-auto bg-[#0b0b0c] border border-zinc-800 rounded-t-2xl sm:rounded-2xl shadow-2xl`}>
        <div className="sticky top-0 z-10 bg-[#0b0b0c] flex items-start gap-3 px-5 pt-5 pb-4 border-b border-zinc-800">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-white">{titulo}</h2>
            {subtitulo && <p className="text-sm text-zinc-500 mt-0.5">{subtitulo}</p>}
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="w-9 h-9 -mr-2 grid place-items-center rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-900 cursor-pointer"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** Barra de avance del proyecto. */
export function Avance({ progreso, chico = false }) {
  const pct = progreso?.pct || 0;
  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 ${chico ? "h-1.5" : "h-2"} rounded-full bg-zinc-800 overflow-hidden`}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "#34d399" : NARANJA }} />
      </div>
      <span className="text-xs text-zinc-400 tabular-nums">{progreso?.cerradas || 0}/{progreso?.total || 0}</span>
    </div>
  );
}
