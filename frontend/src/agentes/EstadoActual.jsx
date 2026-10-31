import { AnimatePresence, motion } from "framer-motion";

/** "Ahora está…": el texto cambia con una animación cada vez que Lía pasa a otra actividad. */
export default function EstadoActual({ texto, compacto = false, className = "" }) {
  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
      </span>
      <div className="min-w-0 relative h-[1.35em] flex-1 overflow-hidden" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={texto}
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -14, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            className={`absolute inset-0 truncate leading-[1.35] ${compacto ? "text-[12.5px] font-semibold text-zinc-100" : "text-[14.5px] font-bold text-white"}`}
          >
            {texto || "Preparándose…"}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
