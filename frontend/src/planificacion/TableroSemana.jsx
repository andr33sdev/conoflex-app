import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { Chip } from "../produccion/ui";
import { diaCorto, diaMes, hoyISO, num } from "../produccion/util";
import { estadoTurno } from "./reglas";

function Celda({ fecha, turno, info, asigs, onAbrir, pasado }) {
  const vacioPasado = pasado && !asigs.length && !info?.sin_produccion && !info?.lanzado;
  const Icono = turno === "NOCHE" ? Moon : Sun;
  const est = estadoTurno(info, asigs);
  const sin = info?.sin_produccion;
  return (
    <button
      onClick={() => onAbrir(fecha, turno)}
      aria-label={`${turno === "NOCHE" ? "Noche" : "Día"} del ${diaMes(fecha)}: ${est.texto}`}
      className={`group w-full text-left rounded-2xl border p-3 ${vacioPasado ? "min-h-[56px] opacity-60" : "min-h-[104px]"} flex flex-col gap-2 transition-all cursor-pointer hover:-translate-y-0.5 ${
        info?.lanzado
          ? "border-emerald-500/30 bg-emerald-500/[0.06] hover:border-emerald-400/60"
          : sin
            ? "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.18]"
            : asigs.length
              ? "border-[#FF5A00]/30 bg-[#FF5A00]/[0.05] hover:border-[#FF5A00]/70"
              : "border-dashed border-white/[0.1] bg-transparent hover:border-[#FF5A00]/50 hover:bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-zinc-300">
          <Icono size={14} className={turno === "NOCHE" ? "text-sky-300" : "text-[#FFD60A]"} />
          {turno === "NOCHE" ? "Noche" : "Día"}
        </span>
        <Chip tono={est.tono} className="!text-[10px] !px-2 whitespace-nowrap shrink-0">{est.texto}</Chip>
      </div>
      {sin ? (
        <p className="text-xs text-zinc-500 leading-snug">{info.motivo || "No se produce en este turno."}</p>
      ) : asigs.length ? (
        <ul className="flex flex-col gap-1 min-w-0">
          {asigs.slice(0, 3).map((a) => (
            <li key={a.id} className="text-xs leading-tight min-w-0">
              <span className="font-bold text-white tabular-nums">{num(a.cantidad)}</span>{" "}
              <span className="text-zinc-300 truncate">{a.semielaborado_nombre}</span>
              <span className="block text-[11px] text-zinc-500 truncate">{a.maquina || "sin máquina"}{a.operario ? ` · ${a.operario}` : ""}</span>
            </li>
          ))}
          {asigs.length > 3 && <li className="text-[11px] font-bold text-zinc-500">+{asigs.length - 3} más</li>}
        </ul>
      ) : (
        <p className="text-xs text-zinc-600 group-hover:text-zinc-400 transition-colors">{vacioPasado ? "Sin plan cargado" : "Tocá para armar el turno"}</p>
      )}
    </button>
  );
}

export default function TableroSemana({ plan, onAbrir }) {
  const hoy = hoyISO();
  const filaHoy = useRef(null);
  // Al abrir una semana que incluye hoy, baja hasta el día de hoy (los anteriores ya pasaron).
  useEffect(() => {
    if (!plan.dias.includes(hoy)) return;
    const t = setTimeout(() => filaHoy.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 350);
    return () => clearTimeout(t);
  }, [plan.semana, plan.dias, hoy]);
  return (
    <section aria-label="Turnos de la semana" className="flex flex-col gap-3">
      {plan.dias.map((fecha, i) => {
        const esHoy = fecha === hoy;
        return (
          <motion.div
            key={fecha}
            ref={esHoy ? filaHoy : null}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * i, duration: 0.3 }}
            className={`grid gap-3 rounded-3xl border p-3 sm:grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)] ${esHoy ? "border-[#FF5A00]/50 bg-[#FF5A00]/[0.04]" : "border-white/[0.06] bg-[#0f0f12]"}`}
          >
            <div className="flex sm:flex-col items-baseline sm:items-start justify-between sm:justify-start gap-x-3 sm:gap-1 px-1 sm:pt-1.5">
              <span className="text-lg font-extrabold text-white tracking-wide">{diaCorto(fecha)}</span>
              <span className="text-sm text-zinc-500 tabular-nums">{diaMes(fecha)}</span>
              {esHoy && <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#FF5A00] sm:mt-1">Hoy</span>}
            </div>
            {["DIA", "NOCHE"].map((turno) => (
              <Celda
                key={turno}
                fecha={fecha}
                turno={turno}
                info={plan.turnos.find((t) => t.fecha === fecha && t.turno === turno)}
                asigs={plan.asignaciones.filter((a) => a.fecha === fecha && a.turno === turno)}
                onAbrir={onAbrir}
                pasado={fecha < hoy}
              />
            ))}
          </motion.div>
        );
      })}
    </section>
  );
}
