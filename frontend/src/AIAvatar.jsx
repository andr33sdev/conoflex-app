import React from "react";
import { Sparkles, Activity } from "lucide-react";

export default function AIAvatar({
  estado = "idle",
  nombre = "Connie — Asistente de Planta",
}) {
  // FOTO DE CONNIE (Joven, rubia, ejecutiva)
  const FOTO_CONNIE =
    "https://images.unsplash.com/photo-1781559877491-dd9ec3af858d?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NDZ8fG9mZmljZSUyMGdpcmwlMjBibG9uZGUlMjBleGVjdXRpdmV8ZW58MHx8MHx8fDA%3D";

  const estaPensando = estado === "thinking";

  return (
    <div className="bg-gradient-to-r from-[#0f172a]/90 via-[#0e1422] to-[#070a12] border-b border-slate-800/80 p-3.5 px-5 flex items-center gap-4 shrink-0 backdrop-blur-xl">
      {/* FOTO DE CONNIE MÁS GRANDE Y MEJOR UBICADA */}
      <div className="relative shrink-0">
        {/* Anillo exterior animado en estado 'pensando' */}
        <div
          className={`absolute -inset-1 rounded-2xl border-2 border-dashed transition-all duration-700 ${
            estaPensando
              ? "border-amber-400 animate-spin shadow-[0_0_20px_rgba(245,158,11,0.35)]"
              : "border-emerald-500/40 opacity-60"
          }`}
        />

        {/* MARCO DE FOTO DE CONNIE */}
        <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 border-slate-700/80 bg-slate-950 shadow-md">
          <img
            src={FOTO_CONNIE}
            alt="Connie Conoflex"
            className={`w-full h-full object-cover object-center transition-all duration-500 ${
              estaPensando
                ? "scale-105 brightness-110"
                : "scale-100 grayscale-[5%]"
            }`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent pointer-events-none" />
        </div>

        {/* BADGE FLOTANTE DE ESTADO */}
        <div
          className={`absolute -bottom-1 -right-1 p-1 rounded-lg border text-xs transition-all duration-300 ${
            estaPensando
              ? "bg-amber-500 text-slate-950 border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.6)] animate-bounce"
              : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
          }`}
        >
          {estaPensando ? <Sparkles size={12} /> : <Activity size={12} />}
        </div>
      </div>

      {/* INFORMACIÓN Y ESTADO UBICADOS A LA DERECHA */}
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
            {nombre}
          </h4>
        </div>

        <div>
          <span
            className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full border inline-flex items-center gap-1.5 transition-all ${
              estaPensando
                ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                estaPensando
                  ? "bg-amber-400 animate-pulse"
                  : "bg-emerald-400 animate-ping"
              }`}
            />
            {estaPensando ? "PENSANDO..." : "ESPERANDO TU CONSULTA..."}
          </span>
        </div>
      </div>
    </div>
  );
}
