import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";

export function Boton({ children, variante = "primario", cargando, className = "", ...p }) {
  const estilos = {
    primario: "bg-[#FF5A00] hover:bg-[#ff6d1f] text-black font-semibold",
    suave: "bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border border-zinc-800",
    peligro: "bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30",
    fantasma: "text-zinc-300 hover:bg-zinc-900",
  }[variante];
  return (
    <button {...p} disabled={p.disabled || cargando} className={`min-h-[40px] px-4 rounded-lg text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${estilos} ${className}`}>
      {cargando && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Chip({ children, tono = "neutro", className = "" }) {
  const t = {
    neutro: "bg-zinc-900 text-zinc-300 border-zinc-800",
    naranja: "bg-[#FF5A00]/10 text-[#ff8a4d] border-[#FF5A00]/25",
    verde: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    ambar: "bg-amber-500/10 text-amber-400 border-amber-500/25",
    rojo: "bg-red-500/10 text-red-400 border-red-500/25",
  }[tono];
  return <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border ${t} ${className}`}>{children}</span>;
}

/** Panel lateral (en el celular ocupa toda la pantalla). */
export function Panel({ titulo, subtitulo, onCerrar, children, pie, ancho = "max-w-2xl" }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCerrar]);
  return createPortal(
    <div className="fixed inset-0 z-[200] flex justify-end bg-black/70" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()} role="dialog" aria-modal="true" aria-label={titulo}>
      <div className={`w-full ${ancho} h-full bg-[#0c0c0d] border-l border-zinc-800 flex flex-col`}>
        <div className="flex items-start gap-3 px-5 py-4 border-b border-zinc-800">
          <div className="min-w-0 flex-1">
            {subtitulo && <p className="text-xs font-medium text-[#ff8a4d] truncate">{subtitulo}</p>}
            <h3 className="text-lg font-semibold text-white leading-snug break-words">{titulo}</h3>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="w-9 h-9 grid place-items-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer shrink-0"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {pie && <div className="px-5 py-3 border-t border-zinc-800 flex flex-wrap gap-2">{pie}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Modal({ titulo, onCerrar, children, pie, ancho = "max-w-lg" }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCerrar]);
  return createPortal(
    <div className="fixed inset-0 z-[210] grid place-items-center p-4 bg-black/75" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()} role="dialog" aria-modal="true" aria-label={titulo}>
      <div className={`w-full ${ancho} max-h-[90vh] bg-[#0c0c0d] border border-zinc-800 rounded-xl flex flex-col`}>
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-zinc-800">
          <h3 className="flex-1 text-base font-semibold text-white">{titulo}</h3>
          <button onClick={onCerrar} aria-label="Cerrar" className="w-8 h-8 grid place-items-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer"><X size={17} /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {pie && <div className="px-5 py-3 border-t border-zinc-800 flex flex-wrap justify-end gap-2">{pie}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Aviso({ tono = "ambar", children }) {
  const t = { ambar: "border-amber-500/30 bg-amber-500/5 text-amber-300", rojo: "border-red-500/30 bg-red-500/5 text-red-300", verde: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300", info: "border-zinc-700 bg-zinc-900/60 text-zinc-300" }[tono];
  return <div className={`rounded-lg border px-3.5 py-2.5 text-sm leading-snug ${t}`}>{children}</div>;
}

export function Vacio({ icono: Icono, titulo, texto, children }) {
  return (
    <div className="py-14 px-6 text-center">
      {Icono && <Icono size={34} className="mx-auto text-zinc-700 mb-3" />}
      <p className="text-sm font-semibold text-zinc-200">{titulo}</p>
      {texto && <p className="text-sm text-zinc-500 mt-1 max-w-md mx-auto">{texto}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/** Dos botones para decidir una cosa (ej: Agregar / No agregar). valor: "si" | "no" | undefined. */
export function Decision({ valor, onElegir, si, no, tonoSi }) {
  const on = tonoSi === "rojo" ? "bg-red-600 border-red-600 text-white font-semibold" : "bg-emerald-600 border-emerald-600 text-white font-semibold";
  return (
    <div className="flex gap-2 shrink-0" role="group">
      <button type="button" aria-pressed={valor === "si"} onClick={() => onElegir("si")} className={`px-3 min-h-[36px] rounded-lg text-sm border cursor-pointer transition-colors ${valor === "si" ? on : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}>{si}</button>
      <button type="button" aria-pressed={valor === "no"} onClick={() => onElegir("no")} className={`px-3 min-h-[36px] rounded-lg text-sm border cursor-pointer transition-colors ${valor === "no" ? "bg-zinc-600 border-zinc-600 text-white font-semibold" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}>{no}</button>
    </div>
  );
}
