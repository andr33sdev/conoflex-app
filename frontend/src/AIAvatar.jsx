import React from "react";
import { Sparkles, Activity } from "lucide-react";

export default function AIAvatar({
  estado = "idle",
  nombre = "Connie — Asistente IA Conoflex",
}) {
  // FOTO DE CONNIE (Joven, rubia, ejecutiva)
  const FOTO_CONNIE =
    "https://images.unsplash.com/photo-1781559877491-dd9ec3af858d?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NDZ8fG9mZmljZSUyMGdpcmwlMjBibG9uZGUlMjBleGVjdXRpdmV8ZW58MHx8MHx8fDA%3D";

  // ÚNICAMENTE SE CONSIDERA EN PROCESO SI EL ESTADO ES STRICTAMENTE "thinking"
  const estaPensando = estado === "thinking";

  return (
    <div className="relative flex flex-col items-center justify-center p-5 bg-gradient-to-b from-[#0f172a]/90 via-[#0e1422] to-[#070a12] border-b border-slate-800/80 backdrop-blur-xl shrink-0 transition-all">
      {/* MARCO CIRCULAR CON GLOW HUD */}
      <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center mb-4">
        {/* Anillo exterior animado */}
        <div
          className={`absolute inset-0 rounded-full border-2 border-dashed transition-all duration-700 ${
            estaPensando
              ? "border-amber-400 animate-spin shadow-[0_0_25px_rgba(245,158,11,0.35)]"
              : "border-emerald-500/40 opacity-70"
          }`}
        />

        {/* Resplandor de fondo */}
        <div
          className={`absolute inset-2 rounded-full transition-all duration-500 blur-md ${
            estaPensando ? "bg-amber-500/25" : "bg-emerald-500/10"
          }`}
        />

        {/* FOTO DE CONNIE */}
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-slate-700/80 bg-slate-950 shadow-inner flex items-center justify-center">
          <img
            src={FOTO_CONNIE}
            alt="Connie Conoflex"
            className={`w-full h-full object-cover object-center transition-all duration-500 ${
              estaPensando
                ? "scale-105 brightness-110"
                : "scale-100 grayscale-[5%]"
            }`}
          />

          {/* Filtro cibernético de superficie */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none" />
        </div>

        {/* Badge Indicador de Actividad Flotante */}
        <div
          className={`absolute -bottom-1 right-1 p-1.5 rounded-full border text-xs font-mono transition-all duration-300 ${
            estaPensando
              ? "bg-amber-500 text-slate-950 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.6)] animate-bounce"
              : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
          }`}
        >
          {estaPensando ? <Sparkles size={13} /> : <Activity size={13} />}
        </div>
      </div>

      {/* INFORMACIÓN Y ESTADO DE CONNIE DEBAJO DEL NOMBRE */}
      <div className="text-center flex flex-col items-center gap-1.5">
        <h4 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
          {nombre}
        </h4>

        <div
          className={`text-[9.5px] font-mono px-3 py-1 rounded-full border inline-flex items-center gap-2 transition-all ${
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
        </div>
      </div>
    </div>
  );
}
