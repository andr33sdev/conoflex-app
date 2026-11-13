import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FlaskConical, GraduationCap, MessagesSquare, PhoneCall, X } from "lucide-react";
import { api } from "./produccion/util";
import Conversaciones from "./whatsapp/Conversaciones";
import Entrenar from "./whatsapp/Entrenar";
import Probar from "./whatsapp/Probar";
import Llamar from "./whatsapp/Llamar";

const TABS = [
  { id: "conversaciones", texto: "Conversaciones", icono: MessagesSquare },
  { id: "entrenar", texto: "Entrenar", icono: GraduationCap },
  { id: "probar", texto: "Probar", icono: FlaskConical },
  { id: "llamar", texto: "Llamar", icono: PhoneCall },
];

export default function WhatsApp() {
  const [tab, setTab] = useState("conversaciones");
  const [estado, setEstado] = useState(null);
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const aviso = useCallback((message, type = "success") => {
    setToast({ message, type });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const cargarEstado = useCallback(() => api("/api/whatsapp/estado").then(setEstado).catch(() => {}), []);
  useEffect(() => {
    cargarEstado();
  }, [cargarEstado]);

  const cambiarBot = async () => {
    try {
      await api("/api/whatsapp/bot", { method: "POST", body: { activo: !estado.botActivo } });
      aviso(estado.botActivo ? "Bot apagado: nadie recibe respuestas automáticas." : "Bot encendido.");
      cargarEstado();
    } catch (e) {
      aviso(e.message, "error");
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#050505] text-zinc-100 overflow-hidden relative font-sans">
      <header className="px-4 sm:px-6 pt-4 sm:pt-5 border-b border-zinc-800 bg-[#080808] shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">WhatsApp</h1>
          {estado?.configurado && (
            <button onClick={cambiarBot} className="inline-flex items-center gap-2 text-xs font-medium px-2.5 py-1 rounded-full border border-zinc-800 hover:border-zinc-600 cursor-pointer" title={estado.botActivo ? "Apagar el bot" : "Encender el bot"}>
              <span className={`w-2 h-2 rounded-full ${estado.botActivo ? "bg-emerald-400" : "bg-zinc-600"}`} />
              {estado.botActivo ? "Bot encendido" : "Bot apagado"}
            </button>
          )}
        </div>
        <nav className="flex gap-1 mt-3 -mb-px overflow-x-auto" aria-label="Secciones">
          {TABS.map(({ id, texto, icono: Icono }) => (
            <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined} className={`px-4 py-2.5 text-sm font-medium border-b-2 inline-flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${tab === id ? "border-[#FF5A00] text-white" : "border-transparent text-zinc-500 hover:text-zinc-200"}`}>
              <Icono size={16} className={tab === id ? "text-[#FF5A00]" : ""} /> {texto}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 min-h-0 relative">
        {tab === "conversaciones" && <Conversaciones aviso={aviso} estado={estado} />}
        {tab === "entrenar" && <Entrenar aviso={aviso} />}
        {tab === "probar" && <Probar aviso={aviso} />}
        {tab === "llamar" && <Llamar aviso={aviso} />}
      </main>

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
