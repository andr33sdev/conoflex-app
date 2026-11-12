// Desarrollo de productos (procedimiento P-11, registro R.032): proyectos de productos nuevos y modificaciones.
// Sin proyecto elegido muestra la lista; con ?p=<id> en la dirección, el proyecto.
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import Lista from "./desarrollo/Lista";
import Proyecto from "./desarrollo/Proyecto";

const proyectoDeUrl = () => Number(new URLSearchParams(window.location.search).get("p")) || null;

export default function DesarrolloProductos() {
  const [abierto, setAbierto] = useState(proyectoDeUrl);
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const aviso = useCallback((message, type = "success") => {
    setToast({ message, type });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  // Botón atrás del navegador y enlaces de la campanita (/desarrollo?p=12).
  useEffect(() => {
    const alCambiar = () => setAbierto(proyectoDeUrl());
    window.addEventListener("popstate", alCambiar);
    return () => window.removeEventListener("popstate", alCambiar);
  }, []);

  const abrir = (id) => {
    window.history.pushState({}, document.title, id ? `/desarrollo?p=${id}` : "/desarrollo");
    setAbierto(id);
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#050505] text-zinc-100 overflow-hidden relative font-sans">
      {abierto ? <Proyecto id={abierto} onVolver={() => abrir(null)} aviso={aviso} /> : <Lista onAbrir={abrir} aviso={aviso} />}
      {toast && (
        <div role="status" className={`fixed bottom-5 left-1/2 -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0 z-[400] max-w-[92vw] sm:max-w-md flex items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl bg-[#0c0c0d] ${toast.type === "error" ? "border-red-500/40" : "border-emerald-500/30"}`}>
          {toast.type === "error" ? <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" /> : <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />}
          <p className="text-sm text-zinc-100 leading-snug flex-1">{toast.message}</p>
          <button onClick={() => setToast(null)} aria-label="Cerrar aviso" className="text-zinc-500 hover:text-white cursor-pointer"><X size={15} /></button>
        </div>
      )}
    </div>
  );
}
