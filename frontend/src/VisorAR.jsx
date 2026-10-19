import React, { useState, useEffect, useRef } from "react";
import { Smartphone, Layers, Triangle } from "lucide-react";

export default function VisorAR() {
  const [modeloSeleccionado, setModeloSeleccionado] = useState("cono");
  const [scriptCargado, setScriptCargado] = useState(false);
  const modelViewerRef = useRef(null);

  // Inyección dinámica de model-viewer (evita fallos de build en Vite y Vercel)
  useEffect(() => {
    if (customElements.get("model-viewer")) {
      setScriptCargado(true);
      return;
    }

    const script = document.createElement("script");
    script.type = "module";
    script.src =
      "https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js";
    script.onload = () => setScriptCargado(true);
    document.head.appendChild(script);
  }, []);

  const productos = {
    cono: {
      src: "/models/cono.glb",
      titulo: "Cono Base 70cm",
      descripcion: "Visualizá el anclaje y tamaño del cono en el suelo.",
    },
    ensamblado: {
      src: "/models/ensamblado.glb",
      titulo: "Conjunto Completo 1.15m",
      descripcion: "Cono + Paleta encastrada a altura real.",
    },
  };

  const actual = productos[modeloSeleccionado];

  return (
    <div className="flex-1 relative flex flex-col w-full h-full bg-zinc-950">
      {!scriptCargado ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-[#FF5A00] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs uppercase tracking-widest text-zinc-400 font-bold">
            Cargando motor 3D...
          </p>
        </div>
      ) : (
        <model-viewer
          ref={modelViewerRef}
          src={actual.src}
          alt={actual.titulo}
          ar
          ar-modes="scene-viewer quick-look webxr"
          ar-scale="fixed"
          camera-controls
          auto-rotate
          rotation-per-second="30deg"
          shadow-intensity="1.5"
          shadow-softness="1"
          exposure="1"
          style={{ width: "100%", height: "100%", backgroundColor: "#09090b" }}
        >
          <div
            slot="progress-bar"
            className="absolute top-0 left-0 h-1 bg-[#FF5A00] transition-all duration-300"
          />

          <button
            slot="ar-button"
            className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-[#FF5A00] hover:bg-white text-black font-extrabold uppercase tracking-widest text-xs px-8 py-4 rounded-full shadow-[0_0_30px_rgba(255,90,0,0.6)] flex items-center gap-2.5 active:scale-95 transition-all cursor-pointer z-30"
          >
            <Smartphone size={18} /> VER EN MI ESPACIO
          </button>
        </model-viewer>
      )}

      {/* Selector inferior */}
      <div className="absolute bottom-0 left-0 w-full bg-black/80 backdrop-blur-xl border-t border-white/10 p-5 rounded-t-3xl flex flex-col gap-4 z-20">
        <div className="text-center">
          <h2 className="text-white font-black uppercase tracking-wider text-lg">
            {actual.titulo}
          </h2>
          <p className="text-zinc-400 text-xs mt-1">{actual.descripcion}</p>
        </div>

        <div className="flex bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
          <button
            onClick={() => setModeloSeleccionado("cono")}
            className={`flex-1 flex justify-center items-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              modeloSeleccionado === "cono"
                ? "bg-zinc-800 text-white shadow-md"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Triangle size={16} /> Solo Cono
          </button>

          <button
            onClick={() => setModeloSeleccionado("ensamblado")}
            className={`flex-1 flex justify-center items-center gap-2 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              modeloSeleccionado === "ensamblado"
                ? "bg-[#FF5A00]/20 text-[#FF5A00] border border-[#FF5A00]/30 shadow-md"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Layers size={16} /> Ensamblado
          </button>
        </div>
      </div>
    </div>
  );
}
