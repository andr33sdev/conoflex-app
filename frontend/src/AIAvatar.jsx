import { useState } from "react";
import { Sparkles } from "lucide-react";

const FOTO_CONNIE =
  "https://images.unsplash.com/photo-1781559877491-dd9ec3af858d?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NDZ8fG9mZmljZSUyMGdpcmwlMjBibG9uZGUlMjBleGVjdXRpdmV8ZW58MHx8MHx8fDA%3D";

export default function AIAvatar({
  estado = "idle",
  nombre = "Connie, asistente de planta",
}) {
  const [fotoRota, setFotoRota] = useState(false);
  const pensando = estado === "thinking";

  return (
    <div className="flex items-center gap-3.5 min-w-0">
      <div className="relative shrink-0">
        <div
          className={`w-12 h-12 rounded-full overflow-hidden bg-[#1c1c22] grid place-items-center ring-2 transition-shadow duration-300 ${
            pensando
              ? "ring-[#FF5A00] shadow-[0_0_0_6px_rgba(255,90,0,0.15)]"
              : "ring-white/10"
          }`}
        >
          {fotoRota ? (
            <Sparkles size={20} className="text-[#FF5A00]" />
          ) : (
            <img
              src={FOTO_CONNIE}
              alt="Connie"
              onError={() => setFotoRota(true)}
              className="w-full h-full object-cover"
            />
          )}
        </div>
        <span
          className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-[#0e0e11] ${
            pensando ? "bg-[#FFD60A] animate-pulse" : "bg-emerald-500"
          }`}
        />
      </div>
      <div className="min-w-0">
        <p className="text-[15px] font-bold text-white truncate leading-tight">
          {nombre}
        </p>
        <p
          className={`text-[13px] leading-tight mt-0.5 ${pensando ? "text-[#FF5A00]" : "text-zinc-500"}`}
        >
          {pensando ? "Consultando la base de datos…" : "En línea"}
        </p>
      </div>
    </div>
  );
}
