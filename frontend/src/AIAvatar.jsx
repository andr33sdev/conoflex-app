import React from "react";
import { Sparkles, Bot } from "lucide-react";

export default function AIAvatar({
  estado = "idle",
  nombre = "Connie — Asistente de Planta",
}) {
  const FOTO_CONNIE =
    "https://images.unsplash.com/photo-1781559877491-dd9ec3af858d?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NDZ8fG9mZmljZSUyMGdpcmwlMjBibG9uZGUlMjBleGVjdXRpdmV8ZW58MHx8MHx8fDA%3D";

  const estaPensando = estado === "thinking";

  return (
    <div className="bg-[#050505] border border-zinc-800/90 p-3.5 px-5 flex items-center gap-4 shrink-0 shadow-lg">
      {/* MARCO DE FOTO ESTILO CONOFLEX */}
      <div className="relative shrink-0">
        <div
          className={`relative w-14 h-14 sm:w-16 sm:h-16 overflow-hidden border-2 bg-black transition-all duration-300 ${
            estaPensando
              ? "border-[#FF5A00] shadow-[0_0_15px_rgba(255,90,0,0.4)]"
              : "border-zinc-700/80 hover:border-[#FF5A00]/60"
          }`}
        >
          <img
            src={FOTO_CONNIE}
            alt="Connie Conoflex"
            className={`w-full h-full object-cover object-center transition-all duration-300 ${
              estaPensando ? "scale-105 brightness-110" : "grayscale-[10%]"
            }`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
        </div>

        {/* INDICADOR DE ACTIVIDAD */}
        <div
          className={`absolute -bottom-1 -right-1 p-1 border text-black transition-all ${
            estaPensando
              ? "bg-[#FFD700] border-white shadow-[0_0_10px_#FFD700] animate-pulse"
              : "bg-emerald-500 border-black"
          }`}
        >
          {estaPensando ? <Sparkles size={11} /> : <Bot size={11} />}
        </div>
      </div>

      {/* INFORMACIÓN DE CONNIE */}
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-xs sm:text-sm font-extrabold italic text-white uppercase tracking-wider truncate">
            {nombre}
          </h4>
        </div>

        <div>
          <span
            className={`text-[9px] font-black px-2.5 py-0.5 border inline-flex items-center gap-1.5 uppercase tracking-widest ${
              estaPensando
                ? "bg-[#FF5A00]/15 text-[#FF5A00] border-[#FF5A00]/40"
                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                estaPensando
                  ? "bg-[#FF5A00] animate-ping"
                  : "bg-emerald-400 shadow-[0_0_6px_#10b981]"
              }`}
            />
            {estaPensando
              ? "ANALIZANDO BASE DE DATOS..."
              : "EN LÍNEA • OPERATIVA"}
          </span>
        </div>
      </div>
    </div>
  );
}
