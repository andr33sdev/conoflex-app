import React, { useEffect, useRef } from "react";
import "@google/model-viewer";
import { Smartphone, Sparkles } from "lucide-react";

export default function VisorAR() {
  const modelViewerRef = useRef(null);

  return (
    <div className="flex-1 relative bg-zinc-950 font-sans text-zinc-200 flex flex-col h-screen w-full">
      {/* Visualizador 3D y AR oficial de Google */}
      <model-viewer
        ref={modelViewerRef}
        src="/models/cono.glb" // Ruta a tu modelo en /public
        alt="Cono de Seguridad Conoflex"
        ar // Habilita Realidad Aumentada
        ar-modes="scene-viewer webxr quick-look" // Prioriza el motor nativo de Android e iOS
        ar-scale="fixed" // Bloquea el modelo a escala 1:1 estricta
        camera-controls // Permite rotar e inspeccionar en 3D en la web
        touch-action="pan-y"
        shadow-intensity="1.5" // Sombra suave en el piso real
        shadow-softness="1"
        exposure="1"
        style={{ width: "100%", height: "100%", backgroundColor: "#09090b" }}
      >
        {/* Botón flotante para abrir la cámara AR */}
        <button
          slot="ar-button"
          className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-[#FF5A00] hover:bg-[#ff6e1f] text-black font-extrabold uppercase tracking-widest text-xs px-8 py-4 rounded-full shadow-[0_0_30px_rgba(255,90,0,0.5)] flex items-center gap-2.5 active:scale-95 transition-all cursor-pointer z-30"
        >
          <Smartphone size={18} /> VER EN MI ESPACIO (AR)
        </button>

        {/* Indicador de carga inicial */}
        <div
          slot="progress-bar"
          className="absolute top-0 left-0 w-full h-1 bg-[#FF5A00]"
        />
      </model-viewer>
    </div>
  );
}
