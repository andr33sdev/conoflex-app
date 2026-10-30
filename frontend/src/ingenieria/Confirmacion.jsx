import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";

/** Confirmación visual a pantalla completa: tilde que aparece con resorte, se va sola. */
export default function Confirmacion({ texto, detalle }) {
  return (
    <AnimatePresence>
      {texto && (
        <motion.div key="conf" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status" className="fixed inset-0 z-[200] grid place-items-center bg-[#09090b]/80 backdrop-blur-sm pointer-events-none">
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="text-center px-6">
            <span className="mx-auto w-24 h-24 rounded-full grid place-items-center bg-emerald-500/15 border-2 border-emerald-400 text-emerald-300 shadow-[0_0_60px_rgba(16,185,129,0.3)]">
              <Check size={52} strokeWidth={3} />
            </span>
            <p className="mt-5 text-3xl font-extrabold text-white">{texto}</p>
            {detalle && <p className="mt-2 text-lg text-zinc-400">{detalle}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
