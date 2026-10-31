import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import logo from "./assets/logo.svg";

const CONSEJOS = [
  "Buscá cualquier módulo al instante con Ctrl + K.",
  "Lía, la agente de RRHH, vigila el presentismo todos los días.",
  "Tocá a Lía en el módulo Agentes IA y te saluda.",
  "Connie puede liquidar horas y graficar tus ventas.",
  "En el celular, el menú de abajo te lleva a cada módulo.",
  "Los conos salen de la inyectora… y las ideas, de acá.",
];
const ETAPAS = ["Encendiendo la planta", "Calentando las inyectoras", "Apilando conos", "Afilando los lápices de RRHH", "Ordenando el depósito", "Listo para producir"];
const SEGMENTOS = 24;

function Segmentos({ pct }) {
  const activos = Math.round((pct / 100) * SEGMENTOS);
  return (
    <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${SEGMENTOS}, minmax(0, 1fr))` }} aria-hidden>
      {Array.from({ length: SEGMENTOS }, (_, i) => {
        const on = i < activos;
        const cabeza = on && i === activos - 1;
        const t = i / (SEGMENTOS - 1);
        return (
          <span
            key={i}
            className={`h-3.5 rounded-[3px] transition-colors duration-150 ${on ? "cf-seg-activo" : "bg-white/[0.07]"}`}
            style={on ? { backgroundColor: `hsl(${22 + t * 26} 92% ${cabeza ? 66 : 52}%)`, boxShadow: cabeza ? "0 0 14px rgba(255,140,40,0.95)" : "0 0 6px rgba(255,100,20,0.35)" } : undefined}
          />
        );
      })}
    </div>
  );
}

function Anillos({ tam = 168 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 168 168" className="absolute inset-0 m-auto" aria-hidden>
      <g className="cf-carga-anim" style={{ transformOrigin: "84px 84px", animation: "cf-spin 6s linear infinite" }}>
        <circle cx="84" cy="84" r="78" fill="none" stroke="#e85c0d" strokeWidth="5" strokeLinecap="round" strokeDasharray="44 22" />
      </g>
      <g className="cf-carga-anim" style={{ transformOrigin: "84px 84px", animation: "cf-spin-rev 4s linear infinite" }}>
        <circle cx="84" cy="84" r="68" fill="none" stroke="#ffd60a" strokeWidth="3" strokeLinecap="round" strokeDasharray="10 16" opacity="0.9" />
      </g>
    </svg>
  );
}

/** Pantalla de carga de toda la app: aparece al entrar y se va cuando `listo` es verdadero (con un mínimo de duración). */
export default function PantallaCarga({ listo, onTerminar }) {
  const [pct, setPct] = useState(0);
  const [fin, setFin] = useState(false);
  const [consejo, setConsejo] = useState(() => Math.floor(Math.random() * CONSEJOS.length));
  const refListo = useRef(listo);
  const refTerminar = useRef(onTerminar);

  useEffect(() => {
    refListo.current = listo;
    refTerminar.current = onTerminar;
  });

  useEffect(() => {
    let raf = 0;
    let ult = performance.now();
    let valor = 0;
    let terminado = false;
    const paso = (ahora) => {
      const dt = Math.max(0, Math.min(0.05, (ahora - ult) / 1000));
      ult = ahora;
      // avanza rápido al principio y se frena en 92% esperando que todo esté cargado
      const tope = refListo.current ? 100 : 92;
      const vel = refListo.current ? 140 : Math.max(6, (tope - valor) * 1.6);
      valor = Math.min(tope, valor + vel * dt);
      setPct(valor);
      if (valor >= 100 && !terminado) {
        terminado = true;
        setFin(true);
        setTimeout(() => refTerminar.current?.(), 520);
        return;
      }
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setConsejo((c) => (c + 1) % CONSEJOS.length), 1700);
    return () => clearInterval(id);
  }, []);

  const etapa = ETAPAS[Math.max(0, Math.min(ETAPAS.length - 1, Math.floor((pct / 100) * (ETAPAS.length - 0.01))))];
  const titulo = "CONOFLEX".split("");

  return (
    <motion.div
      role="status"
      aria-label="Cargando Conoflex"
      className="fixed inset-0 z-[300] overflow-hidden bg-[#07070a] text-white"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.08 }}
      transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {/* fondo: piso en perspectiva, resplandor, partículas y líneas de monitor */}
      <div className="absolute inset-x-0 bottom-0 h-[62%] overflow-hidden pointer-events-none">
        <div className="cf-carga-grid absolute inset-0" />
      </div>
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(60% 50% at 50% 42%, rgba(232,92,13,0.28), transparent 70%)" }} />
      {Array.from({ length: 16 }, (_, i) => (
        <span
          key={i}
          className="cf-carga-anim absolute bottom-0 block bg-[#ffd60a] pointer-events-none"
          style={{ left: `${(i * 61) % 100}%`, width: i % 3 ? 4 : 6, height: i % 3 ? 4 : 6, opacity: 0, animation: `cf-pixel ${3.2 + (i % 5) * 0.7}s linear ${(i % 7) * 0.35}s infinite` }}
        />
      ))}
      <div className="cf-carga-scan absolute inset-0 pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(0,0,0,0.75))" }} />

      <div className="relative h-full flex flex-col items-center justify-center px-6">
        {/* logo con anillos */}
        <div className="relative w-[168px] h-[168px] grid place-items-center">
          <span className="cf-carga-anim absolute inset-4 rounded-full bg-[#e85c0d]/40 blur-2xl" style={{ animation: "cf-glow 1.8s ease-in-out infinite" }} />
          <Anillos />
          <motion.div
            initial={{ scale: 0.4, opacity: 0, rotate: -25 }}
            animate={fin ? { scale: 1.25, opacity: 1, rotate: 0 } : { scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 15 }}
            className="relative w-[112px] h-[112px]"
          >
            <div className="cf-carga-anim w-full h-full" style={{ animation: "cf-bob 2.2s ease-in-out infinite" }}>
              <div className="relative w-full h-full rounded-full overflow-hidden shadow-[0_0_40px_rgba(232,92,13,0.6)]">
                <img src={logo} alt="" className="w-full h-full" draggable={false} />
                <span className="cf-carga-anim absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent" style={{ animation: "cf-glint 2.2s ease-in-out infinite" }} />
              </div>
            </div>
          </motion.div>
        </div>

        {/* título que aparece letra por letra */}
        <h1 className="mt-7 flex font-black italic text-[34px] sm:text-5xl tracking-tight leading-none" aria-label="Conoflex">
          {titulo.map((l, i) => (
            <span key={i} className="cf-carga-anim inline-block" style={{ opacity: 0, animation: `cf-letra 0.5s cubic-bezier(0.2,0.8,0.2,1) ${0.15 + i * 0.07}s forwards`, color: i < 4 ? "#fff" : "#ffd60a" }}>
              {l}
            </span>
          ))}
        </h1>
        <p className="mt-2 text-[11px] sm:text-xs font-bold tracking-[0.42em] text-[#ff8a4d]">SISTEMA DE PLANTA</p>

        {/* barra de progreso por segmentos */}
        <div className="mt-9 w-full max-w-[440px]">
          <div className="flex items-end justify-between mb-2 font-mono">
            <span className="text-[11.5px] font-bold tracking-widest text-zinc-300">
              {fin ? "¡LISTO!" : etapa.toUpperCase()}
              {!fin && <span className="cf-carga-anim" style={{ animation: "cf-blink 1s steps(1) infinite" }}>_</span>}
            </span>
            <span className="text-2xl font-black text-[#ffd60a] tabular-nums leading-none">{String(Math.floor(pct)).padStart(3, "0")}%</span>
          </div>
          <div className="p-1.5 rounded-lg bg-black/50 border border-white/10">
            <Segmentos pct={pct} />
          </div>
        </div>

        <div className="mt-7 h-12 w-full max-w-[440px] text-center">
          <p className="text-[10.5px] font-bold tracking-[0.3em] text-zinc-500">CONSEJO</p>
          <motion.p key={consejo} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mt-1 text-[13.5px] text-zinc-300 leading-snug">
            {CONSEJOS[consejo]}
          </motion.p>
        </div>
      </div>
    </motion.div>
  );
}

/** Versión chica para cuando un módulo todavía se está descargando dentro de la app. */
export function CargandoModulo() {
  return (
    <div className="h-full min-h-[320px] grid place-items-center" role="status" aria-label="Cargando módulo">
      <div className="flex flex-col items-center gap-5">
        <div className="relative w-[104px] h-[104px] grid place-items-center">
          <span className="absolute inset-3 rounded-full bg-[#e85c0d]/35 blur-xl" />
          <Anillos tam={104} />
          <img src={logo} alt="" className="relative w-16 h-16 rounded-full cf-carga-anim" style={{ animation: "cf-bob 1.6s ease-in-out infinite" }} />
        </div>
        <div className="w-44 h-2 rounded-full bg-white/[0.07] overflow-hidden">
          <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-[#e85c0d] to-[#ffd60a] cf-carga-anim" style={{ animation: "cf-slide 1.2s ease-in-out infinite" }} />
        </div>
        <p className="font-mono text-[11px] font-bold tracking-[0.3em] text-zinc-500">CARGANDO</p>
      </div>
    </div>
  );
}
