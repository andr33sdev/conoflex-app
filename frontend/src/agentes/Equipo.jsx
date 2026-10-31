import { ArrowLeft, Lock } from "lucide-react";
import { Avatar8 } from "./pixel";
import { estadoDe, useSlotEstado } from "./estados";
import { PROXIMOS } from "./proximos";

/** Lista del equipo: cada agente con su avatar, qué hace ahora y, si hay, cuántos avisos tiene. */
export function Equipo({ agentes, activo, onElegir, modo, abiertosVivo, vivoId }) {
  useSlotEstado();
  return (
    <>
      <div className="shrink-0 px-5 h-[76px] flex items-end pb-3">
        <div>
          <h1 className="text-[18px] font-bold text-white leading-none">Equipo</h1>
          <p className="mt-1.5 text-[12.5px] text-zinc-500">{agentes.length} {agentes.length === 1 ? "agente" : "agentes"} a tu disposición</p>
        </div>
      </div>
      <ul role="tablist" aria-label="Agentes" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 pb-4 space-y-1">
        {agentes.map((a) => {
          const sel = a.id === activo;
          const propio = a.id === vivoId;
          const abiertos = propio && abiertosVivo != null ? abiertosVivo : a.abiertos || 0;
          const est = estadoDe(a.id, a.nombre, { modo: propio ? modo : "idle", abiertos });
          return (
            <li key={a.id}>
              <button
                role="tab"
                aria-selected={sel}
                onClick={() => onElegir(a.id)}
                className={`relative w-full flex items-center gap-3.5 text-left rounded-xl pl-3 pr-3 py-3 transition-colors ${sel ? "bg-white/[0.06]" : "hover:bg-white/[0.035]"}`}
              >
                {sel && <span className="absolute left-0 top-3 bottom-3 w-[2px] bg-[#FF5A00]" />}
                <Avatar8 id={a.id} tam={64} modo={est.modo} ojos={est.ojos} icono={est.icono} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[15.5px] font-bold text-white leading-tight">{a.nombre}</span>
                    {abiertos > 0 && <span className="text-[11.5px] font-semibold text-zinc-500 tabular-nums">{abiertos} {abiertos === 1 ? "aviso" : "avisos"}</span>}
                  </span>
                  <span className="block text-[12.5px] text-zinc-500 leading-tight">{a.puesto}</span>
                  <span className="block mt-1.5 text-[12.5px] text-zinc-300 leading-snug line-clamp-2" key={est.texto}><span className="cf-estado">{est.texto}</span></span>
                </span>
              </button>
            </li>
          );
        })}
        {PROXIMOS.map((a) => {
          const sel = a.id === activo;
          return (
            <li key={a.id}>
              <button
                role="tab"
                aria-selected={sel}
                onClick={() => onElegir(a.id)}
                className={`relative w-full flex items-center gap-3.5 text-left rounded-xl pl-3 pr-3 py-3 transition-colors ${sel ? "bg-white/[0.06]" : "hover:bg-white/[0.035]"}`}
              >
                {sel && <span className="absolute left-0 top-3 bottom-3 w-[2px] bg-zinc-500" />}
                <Avatar8 id="ventas" tam={64} dormido burbuja={false} className="opacity-60" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15.5px] font-bold text-zinc-300 leading-tight">{a.nombre}</span>
                  <span className="block text-[12.5px] text-zinc-600 leading-tight">{a.puesto}</span>
                  <span className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-zinc-600"><Lock size={11} /> Pronto</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function Proximamente({ agente, onVolver }) {
  return (
    <div className="h-full min-h-0 flex flex-col bg-[#0c0c0f]">
      <div className="lg:hidden shrink-0 h-14 px-2 flex items-center">
        <button onClick={onVolver} aria-label="Volver al equipo" className="w-10 h-10 grid place-items-center rounded-lg text-zinc-300 hover:bg-white/[0.07]"><ArrowLeft size={20} /></button>
      </div>
      <div className="flex-1 overflow-y-auto grid place-items-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="flex justify-center"><Avatar8 id="ventas" tam={96} dormido burbuja={false} className="opacity-70" /></div>
          <p className="mt-5 text-2xl font-bold text-white">{agente.nombre}</p>
          <p className="text-sm text-zinc-500">{agente.puesto}</p>
          <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-500">En preparación</p>
          <ul className="mt-6 space-y-2 text-left">
            {agente.queHara.map((q) => (
              <li key={q} className="rounded-xl border border-white/[0.07] px-4 py-3 text-[14px] text-zinc-300 leading-snug">{q}</li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-zinc-600">Todavía no está disponible. Cuando se active, vas a poder hablar con {agente.nombre} desde acá.</p>
        </div>
      </div>
    </div>
  );
}
