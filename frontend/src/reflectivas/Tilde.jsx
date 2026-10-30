import { motion } from "framer-motion";
import { TONOS } from "./tonos";

/** Marca de verificación que se dibuja al activarse. */
export function Marca({ on, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <motion.path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
        transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      />
    </svg>
  );
}

/** Casilla: botón cuadrado con tilde. Si no se puede modificar se ve igual pero sin interacción. */
export function Casilla({ on, tono = "naranja", etiqueta, onChange, bloqueada, soloLectura, indeterminada, tam = "h-10 w-10" }) {
  const t = TONOS[tono];
  const interactiva = !bloqueada && !soloLectura;
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={indeterminada ? "mixed" : on}
      aria-label={etiqueta}
      disabled={!interactiva}
      onClick={() => interactiva && onChange(!on)}
      whileTap={interactiva ? { scale: 0.86 } : undefined}
      className={`${tam} rounded-xl border-2 grid place-items-center transition-colors duration-150 ${on || indeterminada ? t.on : t.off} ${interactiva ? "cursor-pointer" : soloLectura ? "cursor-default" : "cursor-not-allowed opacity-30"}`}
    >
      {indeterminada && !on ? <span className="w-3 h-0.5 rounded bg-black" /> : <Marca on={on} />}
    </motion.button>
  );
}

/** Píldora con tilde (para celular): más grande y con texto. */
export function Pildora({ on, tono, children, onChange, bloqueada, soloLectura }) {
  const t = TONOS[tono];
  const interactiva = !bloqueada && !soloLectura;
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={on}
      disabled={!interactiva}
      onClick={() => interactiva && onChange(!on)}
      whileTap={interactiva ? { scale: 0.95 } : undefined}
      className={`min-h-[44px] pl-2.5 pr-4 rounded-full border text-[14px] font-bold inline-flex items-center gap-2 transition-colors ${on ? t.chip : "border-white/[0.1] bg-white/[0.03] text-zinc-500"} ${interactiva ? "cursor-pointer" : soloLectura ? "cursor-default" : "cursor-not-allowed opacity-40"}`}
    >
      <span className={`w-6 h-6 rounded-lg border-2 grid place-items-center ${on ? t.on : "border-white/[0.16] text-transparent"}`}>
        <Marca on={on} size={14} />
      </span>
      {children}
    </motion.button>
  );
}
