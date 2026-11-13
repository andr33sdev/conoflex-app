// Piezas compartidas: imágenes privadas del módulo (pasan por la sesión) y subida de archivos.
import { useEffect, useState } from "react";
import { FileText, ImageOff, Loader2 } from "lucide-react";
import { getApiUrl } from "../apiConfig";

export { Modal } from "../desarrollo/util";

const cache = new Map();
export function ImagenPrivada({ id, completa = false, alt = "", className = "" }) {
  const clave = `${id}:${completa ? 1 : 0}`;
  const [url, setUrl] = useState(() => cache.get(clave) || null);
  const [falla, setFalla] = useState(false);
  useEffect(() => {
    if (!id || cache.has(clave)) return undefined;
    let vivo = true;
    fetch(getApiUrl(`/api/proyectos/archivos/${id}${completa ? "" : "/miniatura"}`))
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
  if (falla) return <div className={`grid place-items-center bg-zinc-900 text-zinc-600 ${className}`}><ImageOff size={18} /></div>;
  if (!url) return <div className={`grid place-items-center bg-zinc-900 text-zinc-600 ${className}`}><Loader2 size={16} className="animate-spin" /></div>;
  return <img src={url} alt={alt} className={className} />;
}

export function Miniatura({ archivo, className = "" }) {
  if (archivo.tiene_miniatura) return <ImagenPrivada id={archivo.id} alt={archivo.nombre} className={`object-cover ${className}`} />;
  const ext = (archivo.nombre.split(".").pop() || "").toUpperCase().slice(0, 5);
  return (
    <div className={`grid place-items-center bg-zinc-900 text-zinc-400 ${className}`}>
      <div className="flex flex-col items-center gap-1"><FileText size={22} /><span className="text-[10px] font-bold">{ext}</span></div>
    </div>
  );
}
