import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

const suave = [0.2, 0.8, 0.2, 1];

/** Aviso temporal abajo. mostrar(texto, "ok" | "error") */
export function useToast() {
  const [t, setT] = useState(null);
  const timer = useRef(null);
  const mostrar = useCallback((texto, tipo = "ok") => {
    clearTimeout(timer.current);
    setT({ texto, tipo, k: Date.now() });
    timer.current = setTimeout(() => setT(null), tipo === "error" ? 6000 : 3200);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const nodo = (
    <div className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-[200] pointer-events-none px-4 w-full max-w-md">
      <AnimatePresence>
        {t && (
          <motion.div
            key={t.k}
            role="status"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.22, ease: suave }}
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl px-4 py-3 text-sm font-semibold shadow-2xl border ${
              t.tipo === "error"
                ? "bg-[#2a1012] border-rose-500/40 text-rose-100"
                : "bg-[#0f2218] border-emerald-500/40 text-emerald-100"
            }`}
          >
            {t.tipo === "error" ? <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-400" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" />}
            <span className="leading-snug">{t.texto}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
  return { mostrar, nodo };
}
