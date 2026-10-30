// Piezas de interfaz compartidas por Planificación OT y Carga de producción.
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

const suave = [0.2, 0.8, 0.2, 1];

/** Fondo oscuro + panel centrado (en celular sube desde abajo). Cierra con Escape o tocando afuera. */
export function Modal({ abierto, onCerrar, titulo, subtitulo, children, ancho = "max-w-2xl", pie }) {
  useEscape(abierto, onCerrar);
  return (
    <AnimatePresence>
      {abierto && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            className={`w-full ${ancho} max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-white/[0.08] bg-[#0f0f12] shadow-[0_30px_90px_rgba(0,0,0,0.7)] overflow-hidden`}
            initial={{ opacity: 0, y: 36, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.28, ease: suave }}
          >
            <div className="flex items-start gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-white/[0.06] shrink-0">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-extrabold text-white leading-tight">{titulo}</h2>
                {subtitulo && <p className="text-sm text-zinc-500 mt-0.5">{subtitulo}</p>}
              </div>
              <button
                onClick={onCerrar}
                aria-label="Cerrar"
                className="w-10 h-10 -mr-2 -mt-1 grid place-items-center rounded-xl text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 sm:px-6 py-5">{children}</div>
            {pie && <div className="px-5 sm:px-6 py-4 border-t border-white/[0.06] bg-[#0c0c0f] shrink-0">{pie}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Panel lateral que entra desde la derecha (pantalla completa en celular). */
export function Drawer({ abierto, onCerrar, titulo, subtitulo, children, pie, derecha, ancho = "sm:w-[560px] lg:w-[640px]" }) {
  useEscape(abierto, onCerrar);
  return (
    <AnimatePresence>
      {abierto && (
        <motion.div
          className="fixed inset-0 z-[110] flex justify-end bg-black/60 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
        >
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            className={`h-full w-full ${ancho} flex flex-col bg-[#0d0d10] border-l border-white/[0.08] shadow-[-30px_0_80px_rgba(0,0,0,0.6)]`}
            initial={{ x: 80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 80, opacity: 0 }}
            transition={{ duration: 0.3, ease: suave }}
          >
            <div className="flex items-start gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-white/[0.06] shrink-0">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-extrabold text-white leading-tight">{titulo}</h2>
                {subtitulo && <div className="text-sm text-zinc-500 mt-1">{subtitulo}</div>}
              </div>
              {derecha}
              <button
                onClick={onCerrar}
                aria-label="Cerrar"
                className="w-10 h-10 -mr-2 -mt-1 grid place-items-center rounded-xl text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 sm:px-6 py-5">{children}</div>
            {pie && <div className="px-5 sm:px-6 py-4 border-t border-white/[0.06] bg-[#0b0b0e] shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">{pie}</div>}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function useEscape(activo, fn) {
  useEffect(() => {
    if (!activo) return;
    const h = (e) => e.key === "Escape" && fn();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [activo, fn]);
}

const TONOS = {
  gris: "bg-white/[0.06] text-zinc-300 border-white/[0.08]",
  naranja: "bg-[#FF5A00]/12 text-[#ff8a4d] border-[#FF5A00]/30",
  amarillo: "bg-[#FFD60A]/12 text-[#FFD60A] border-[#FFD60A]/30",
  verde: "bg-emerald-500/12 text-emerald-300 border-emerald-500/30",
  rojo: "bg-rose-500/12 text-rose-300 border-rose-500/30",
  azul: "bg-sky-500/12 text-sky-300 border-sky-500/30",
};
export function Chip({ tono = "gris", children, className = "", icono: Icono }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${TONOS[tono]} ${className}`}>
      {Icono && <Icono size={12} />}
      {children}
    </span>
  );
}

/** Barra de avance con dos capas: lo producido (verde) y lo asignado (naranja suave). */
export function Barra({ total, hecho = 0, asignado = 0 }) {
  const pct = (v) => (total > 0 ? Math.min(100, (v / total) * 100) : 0);
  return (
    <div className="h-2 rounded-full bg-white/[0.07] overflow-hidden relative">
      <motion.div className="absolute inset-y-0 left-0 bg-[#FF5A00]/35" initial={{ width: 0 }} animate={{ width: `${pct(asignado)}%` }} transition={{ duration: 0.6, ease: suave }} />
      <motion.div className="absolute inset-y-0 left-0 bg-emerald-400" initial={{ width: 0 }} animate={{ width: `${pct(hecho)}%` }} transition={{ duration: 0.6, ease: suave }} />
    </div>
  );
}

const BOTONES = {
  primario: "bg-[#FFD60A] text-black hover:bg-white shadow-[0_8px_24px_rgba(255,214,10,0.18)]",
  naranja: "bg-[#FF5A00] text-black hover:bg-[#ff7a30]",
  suave: "bg-white/[0.06] text-zinc-100 hover:bg-white/[0.11] border border-white/[0.08]",
  peligro: "bg-rose-500/12 text-rose-300 hover:bg-rose-500/20 border border-rose-500/30",
  fantasma: "text-zinc-400 hover:text-white hover:bg-white/[0.06]",
};
export function Boton({ variante = "suave", grande, className = "", icono: Icono, children, ...p }) {
  return (
    <button
      {...p}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] ${grande ? "min-h-[52px] px-6 text-base" : "min-h-[40px] px-4 text-sm"} ${BOTONES[variante]} ${className}`}
    >
      {Icono && <Icono size={grande ? 20 : 16} className="shrink-0" />}
      {children}
    </button>
  );
}

export function Etiqueta({ children, className = "" }) {
  return <span className={`block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 mb-1.5 ${className}`}>{children}</span>;
}

export function Vacio({ icono: Icono, titulo, texto, children }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      {Icono && (
        <span className="w-14 h-14 rounded-2xl grid place-items-center bg-white/[0.05] text-zinc-500 mb-4">
          <Icono size={26} />
        </span>
      )}
      <p className="text-base font-bold text-zinc-200">{titulo}</p>
      {texto && <p className="text-sm text-zinc-500 mt-1 max-w-sm leading-relaxed">{texto}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
