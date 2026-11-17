import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

const suave = [0.2, 0.8, 0.2, 1];

/**
 * Modal de confirmación para borrar algo. Acento rojo, dos pasos claros.
 * props: abierto, titulo, mensaje, lineas (array de strings con el impacto),
 *        borrando, onConfirmar, onCancelar, textoConfirmar.
 */
export default function ConfirmarBorrado({ abierto, titulo, mensaje, lineas = [], borrando = false, onConfirmar, onCancelar, textoConfirmar = "Eliminar" }) {
  return (
    <AnimatePresence>
      {abierto && (
        <motion.div
          key="borrar"
          className="fixed inset-0 z-[160] grid place-items-center p-4 bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => e.target === e.currentTarget && !borrando && onCancelar?.()}
          role="dialog"
          aria-modal="true"
          aria-label={titulo}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0, y: 6 }}
            transition={{ duration: 0.22, ease: suave }}
            className="w-full max-w-[440px] rounded-3xl border border-rose-500/20 bg-[#121013] shadow-[0_30px_80px_rgba(0,0,0,0.7)] overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <span className="shrink-0 w-12 h-12 grid place-items-center rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300">
                  <AlertTriangle size={24} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-extrabold text-white leading-tight">{titulo}</h2>
                  {mensaje && <p className="mt-1.5 text-sm text-zinc-400 leading-relaxed">{mensaje}</p>}
                </div>
              </div>

              {lineas.length > 0 && (
                <ul className="mt-4 space-y-1.5 rounded-2xl border border-rose-500/15 bg-rose-500/[0.05] p-3.5">
                  {lineas.map((l, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-rose-200/90">
                      <span className="mt-[7px] w-1 h-1 rounded-full bg-rose-300 shrink-0" />
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex gap-2.5 px-6 pb-6">
              <button
                onClick={onCancelar}
                disabled={borrando}
                className="flex-1 min-h-[48px] rounded-2xl border border-white/[0.1] bg-white/[0.04] text-sm font-bold text-zinc-200 hover:bg-white/[0.08] cursor-pointer transition-colors disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirmar}
                disabled={borrando}
                className="flex-1 min-h-[48px] rounded-2xl bg-rose-600 text-white text-sm font-extrabold inline-flex items-center justify-center gap-2 hover:bg-rose-500 active:scale-[0.98] cursor-pointer transition-all disabled:opacity-60"
              >
                {borrando ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={16} />}
                {textoConfirmar}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
