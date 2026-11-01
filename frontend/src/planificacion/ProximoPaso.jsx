import { Check } from "lucide-react";
import { Boton } from "../produccion/ui";

const PASOS = ["Lista", "Turnos", "Tablet", "Aprobar"];

/** Una sola tarjeta que dice qué toca hacer ahora y qué pasa si se hace. */
export default function ProximoPaso({ sugerencia, onAccion, pctHecho }) {
  const { paso, titulo, ayuda, accion } = sugerencia;
  return (
    <section aria-label="Próximo paso" className="rounded-2xl border border-white/[0.07] bg-[#0f0f12] p-4 sm:p-5 mb-4">
      <ol className="flex items-center gap-2 text-[12px] font-semibold mb-3.5" aria-label="Pasos de la semana">
        {PASOS.map((t, i) => {
          const n = i + 1;
          const hecho = paso > n;
          const actual = paso === n;
          return (
            <li key={t} className="flex items-center gap-2">
              <span className={`w-5 h-5 rounded-full grid place-items-center text-[11px] font-extrabold ${hecho ? "bg-emerald-400 text-black" : actual ? "bg-[#FF5A00] text-black" : "bg-white/[0.08] text-zinc-500"}`}>{hecho ? <Check size={12} strokeWidth={3} /> : n}</span>
              <span className={`${actual ? "text-white" : "hidden sm:inline " + (hecho ? "text-zinc-400" : "text-zinc-600")}`}>{t}</span>
              {n < PASOS.length && <span className="w-3 sm:w-8 h-px bg-white/[0.1]" />}
            </li>
          );
        })}
        {pctHecho > 0 && <span className="ml-auto text-zinc-500 font-medium tabular-nums">{pctHecho}% producido</span>}
      </ol>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-[260px]">
          <h2 className="text-[17px] sm:text-lg font-bold text-white leading-snug">{titulo}</h2>
          <p className="mt-1 text-[13.5px] text-zinc-400 leading-snug">{ayuda}</p>
        </div>
        {accion && <Boton variante="primario" onClick={() => onAccion(accion)}>{accion.texto}</Boton>}
      </div>
    </section>
  );
}
