import { useState } from "react";
import { Moon, Plus, Sun } from "lucide-react";
import { diaCorto, diaMes, hoyISO, nombreDia, num } from "../produccion/util";
import { estadoTurno } from "./reglas";

// Cada estado se marca con un punto de color y una palabra, no con fondos enormes.
const PUNTO = { verde: "bg-emerald-400", amarillo: "bg-[#FFD60A]", azul: "bg-sky-400", naranja: "bg-[#FF5A00]", gris: "bg-zinc-600" };
const TEXTO = { verde: "text-emerald-300", amarillo: "text-[#FFD60A]", azul: "text-sky-300", naranja: "text-[#ff8a4d]", gris: "text-zinc-500" };

function Celda({ fecha, turno, info, asigs, onAbrir, esHoy, ancha }) {
  const est = estadoTurno(info, asigs);
  const sin = info?.sin_produccion;
  const Icono = turno === "NOCHE" ? Moon : Sun;
  const maxFilas = ancha ? 4 : 2;

  return (
    <button
      onClick={() => onAbrir(fecha, turno)}
      aria-label={`${turno === "NOCHE" ? "Noche" : "Día"} del ${diaMes(fecha)}: ${est.texto}`}
      title={est.texto} className={`group relative w-full h-full text-left rounded-xl border p-2.5 flex flex-col gap-1.5 overflow-hidden transition-colors cursor-pointer ${ancha ? "min-h-[120px]" : "min-h-[112px]"} ${
        asigs.length || info?.lanzado
          ? "border-white/[0.09] bg-white/[0.035] hover:border-[#FF5A00]/60 hover:bg-white/[0.055]"
          : "border-dashed border-white/[0.08] bg-transparent hover:border-[#FF5A00]/45 hover:bg-white/[0.03]"
      } ${esHoy ? "ring-1 ring-[#FF5A00]/25" : ""}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-zinc-400">
          <Icono size={13} className={turno === "NOCHE" ? "text-sky-300" : "text-[#FFD60A]"} />
          {ancha ? (turno === "NOCHE" ? "Noche" : "Día") : ""}
        </span>
        {(asigs.length > 0 || info?.lanzado || sin) && (
          <span className={`inline-flex items-center gap-1.5 text-[10.5px] font-bold ${TEXTO[est.tono]}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${PUNTO[est.tono]}`} />
            <span className={ancha ? "" : "hidden 2xl:inline"}>{asigs.length || info?.lanzado || sin ? est.texto : ""}</span>
          </span>
        )}
      </span>

      {sin ? (
        <span className="text-[11px] text-zinc-500 leading-snug line-clamp-3">{info.motivo || "No se produce en este turno."}</span>
      ) : asigs.length ? (
        <span className="flex flex-col gap-1.5 min-w-0">
          {asigs.slice(0, maxFilas).map((a) => (
            <span key={a.id} className="block min-w-0 leading-tight">
              <span className="block text-[12.5px] font-semibold text-zinc-100 truncate">{a.semielaborado_nombre}</span>
              <span className="block text-[11.5px] text-zinc-500 tabular-nums">{num(a.real ? a.real.buenas : a.cantidad)} u</span>
            </span>
          ))}
          {asigs.length > maxFilas && <span className="text-[11px] font-bold text-zinc-500">+{asigs.length - maxFilas} más</span>}
        </span>
      ) : (
        <span className="mt-auto mb-auto self-center inline-flex items-center gap-1 text-[11px] text-zinc-700 group-hover:text-[#FF5A00] transition-colors">
          <Plus size={14} /> <span className={ancha ? "" : "hidden group-hover:inline"}>Armar turno</span>
        </span>
      )}

    </button>
  );
}

export default function TableroSemana({ plan, onAbrir }) {
  const hoy = hoyISO();
  // El día elegido solo vale dentro de la semana mostrada; si no, hoy (si está) o el lunes.
  const [elegido, setDiaSel] = useState(null);
  const diaSel = elegido && plan.dias.includes(elegido) ? elegido : plan.dias.includes(hoy) ? hoy : plan.dias[0];

  const infoDe = (fecha, turno) => plan.turnos.find((t) => t.fecha === fecha && t.turno === turno);
  const asigsDe = (fecha, turno) => plan.asignaciones.filter((a) => a.fecha === fecha && a.turno === turno);
  const puntoDia = (fecha) => (["DIA", "NOCHE"].some((t) => asigsDe(fecha, t).length) ? "bg-[#FF5A00]" : "bg-transparent");

  return (
    <section aria-label="Turnos de la semana">
      <p className="mb-2 text-[13px] text-zinc-500">Tocá un día y turno para armarlo o revisarlo.</p>
      {/* Escritorio: la semana entera en una sola grilla (días en columnas, Día y Noche en filas). */}
      <div className="hidden md:grid grid-cols-7 gap-2" style={{ gridTemplateRows: "auto 1fr 1fr" }}>
        {plan.dias.map((fecha) => {
          const esHoy = fecha === hoy;
          return (
            <div key={fecha} className={`rounded-xl px-2.5 py-2 flex items-baseline justify-between ${esHoy ? "bg-[#FF5A00] text-black" : "bg-white/[0.04] text-white"}`}>
              <span className="text-[13px] font-extrabold tracking-wide">{diaCorto(fecha)}</span>
              <span className={`text-[12px] tabular-nums font-semibold ${esHoy ? "text-black/70" : "text-zinc-500"}`}>{diaMes(fecha)}</span>
            </div>
          );
        })}
        {["DIA", "NOCHE"].map((turno) =>
          plan.dias.map((fecha) => (
            <Celda key={`${fecha}-${turno}`} fecha={fecha} turno={turno} info={infoDe(fecha, turno)} asigs={asigsDe(fecha, turno)} onAbrir={onAbrir} esHoy={fecha === hoy} />
          )),
        )}
      </div>

      {/* Celular: una tira de días y los dos turnos del día elegido. */}
      <div className="md:hidden">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1" role="tablist" aria-label="Día de la semana">
          {plan.dias.map((fecha) => {
            const sel = fecha === diaSel;
            return (
              <button key={fecha} role="tab" aria-selected={sel} onClick={() => setDiaSel(fecha)} className={`relative shrink-0 w-[52px] py-2 rounded-xl border text-center cursor-pointer transition-colors ${sel ? "bg-[#FF5A00] border-[#FF5A00] text-black" : "bg-white/[0.04] border-white/[0.08] text-zinc-300"}`}>
                <span className="block text-[11px] font-extrabold">{diaCorto(fecha)}</span>
                <span className={`block text-lg font-extrabold tabular-nums leading-tight ${sel ? "text-black" : "text-white"}`}>{diaMes(fecha).split(" ")[0]}</span>
                <span className={`absolute left-1/2 -translate-x-1/2 bottom-1 w-1 h-1 rounded-full ${sel ? "bg-black/60" : puntoDia(fecha)}`} />
                {fecha === hoy && !sel && <span className="absolute top-1 right-1.5 text-[8px] font-extrabold text-[#FF5A00]">HOY</span>}
              </button>
            );
          })}
        </div>
        <p className="text-sm font-bold text-white mb-2">{nombreDia(diaSel)} {diaMes(diaSel)}</p>
        <div className="grid grid-cols-1 gap-2">
          {["DIA", "NOCHE"].map((turno) => (
            <Celda key={turno} ancha fecha={diaSel} turno={turno} info={infoDe(diaSel, turno)} asigs={asigsDe(diaSel, turno)} onAbrir={onAbrir} esHoy={diaSel === hoy} />
          ))}
        </div>
      </div>
    </section>
  );
}
