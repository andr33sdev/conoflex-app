import { ArrowLeft, LayoutGrid, Lock } from "lucide-react";
import { Avatar8 } from "./pixel";
import { estadoDe, useSlotEstado } from "./estados";
import { PROXIMOS } from "./proximos";

/** Riel angosto con el equipo: la oficina y cada agente. Arriba a la izquierda en escritorio; una tira en el celular. */
export function Riel({ agentes, activo, onElegir, modo, abiertosVivo, vivoId }) {
  useSlotEstado();
  const item = (sel) => `relative shrink-0 flex flex-col items-center gap-1 rounded-xl py-2 px-1 w-[76px] lg:w-full transition-colors ${sel ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"}`;
  const barra = (sel) => sel && <span className="absolute left-0 top-3 bottom-3 w-[2px] bg-[#FF5A00] max-lg:hidden" />;
  return (
    <nav role="tablist" aria-label="Equipo" className="flex lg:flex-col gap-1 p-2 overflow-x-auto lg:overflow-y-auto custom-scrollbar">
      <button role="tab" aria-selected={activo === "oficina"} onClick={() => onElegir("oficina")} className={item(activo === "oficina")} title="Oficina">
        {barra(activo === "oficina")}
        <span className="w-12 h-12 grid place-items-center rounded-[10px] border border-white/[0.08] bg-[#1a1a20] text-zinc-300"><LayoutGrid size={20} /></span>
        <span className="text-[11.5px] font-semibold text-zinc-300 leading-none">Oficina</span>
      </button>
      {agentes.map((a) => {
        const sel = a.id === activo;
        const propio = a.id === vivoId;
        const abiertos = propio && abiertosVivo != null ? abiertosVivo : a.abiertos || 0;
        const est = estadoDe(a.id, a.nombre, { modo: propio ? modo : "idle", abiertos });
        return (
          <button key={a.id} role="tab" aria-selected={sel} onClick={() => onElegir(a.id)} className={item(sel)} title={`${a.nombre}: ${est.texto}`}>
            {barra(sel)}
            <Avatar8 id={a.id} tam={48} modo={est.modo} ojos={est.ojos} burbuja={false} />
            <span className="text-[11.5px] font-semibold text-white leading-none">{a.nombre}{abiertos > 0 && <span className="ml-1 font-medium text-zinc-500">{abiertos}</span>}</span>
          </button>
        );
      })}
      {PROXIMOS.map((a) => (
        <button key={a.id} role="tab" aria-selected={a.id === activo} onClick={() => onElegir(a.id)} className={item(a.id === activo)} title={`${a.nombre}: pronto`}>
          {barra(a.id === activo)}
          <Avatar8 id="ventas" tam={48} dormido burbuja={false} className="opacity-50" />
          <span className="text-[11.5px] font-semibold text-zinc-500 leading-none inline-flex items-center gap-1">{a.nombre} <Lock size={9} /></span>
        </button>
      ))}
    </nav>
  );
}

export function Proximamente({ agente, onVolver }) {
  return (
    <div className="h-full min-h-0 flex flex-col bg-[#0c0c0f]">
      <div className="shrink-0 h-12 px-2 flex items-center">
        <button onClick={onVolver} className="h-10 px-3 inline-flex items-center gap-2 rounded-lg text-[13px] font-semibold text-zinc-300 hover:bg-white/[0.07]"><ArrowLeft size={17} /> Oficina</button>
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
