import { useCallback, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, FileSpreadsheet, Inbox, Package, Sliders, X } from "lucide-react";
import Bandeja from "./comercial/Bandeja";
import Productos from "./comercial/Productos";
import ListaPrecios from "./comercial/ListaPrecios";
import Reglas from "./comercial/Reglas";

const TABS = [
  { id: "consultas", texto: "Consultas", icono: Inbox },
  { id: "productos", texto: "Productos", icono: Package },
  { id: "precios", texto: "Lista de precios", icono: FileSpreadsheet },
  { id: "reglas", texto: "Reglas de la IA", icono: Sliders },
];

export default function ComercialIA() {
  const [tab, setTab] = useState("consultas");
  const [toast, setToast] = useState(null);
  const [cuentaMails, setCuentaMails] = useState(null);
  const [refrescar, setRefrescar] = useState(0);
  const timer = useRef(null);

  const aviso = useCallback((message, type = "success") => {
    setToast({ message, type });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#050505] text-zinc-100 overflow-hidden relative font-sans">
      <header className="px-4 sm:px-6 pt-4 sm:pt-5 border-b border-zinc-800 bg-[#080808] shrink-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">Comercial <span className="text-[#FF5A00]">IA</span></h1>
          <p className="text-sm text-zinc-500">Consultas, productos y precios en un solo lugar</p>
        </div>
        <nav className="flex gap-1 mt-3 -mb-px overflow-x-auto" aria-label="Secciones">
          {TABS.map(({ id, texto, icono: Icono }) => (
            <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined} className={`px-4 py-2.5 text-sm font-medium border-b-2 inline-flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${tab === id ? "border-[#FF5A00] text-white" : "border-transparent text-zinc-500 hover:text-zinc-200"}`}>
              <Icono size={16} className={tab === id ? "text-[#FF5A00]" : ""} /> {texto}
              {id === "consultas" && cuentaMails > 0 && <span className="text-[11px] font-semibold bg-[#FF5A00] text-black rounded-full px-1.5 min-w-[18px] text-center">{cuentaMails}</span>}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 min-h-0 relative">
        {/* La bandeja queda montada para no perder el borrador que se está revisando. */}
        <div className={tab === "consultas" ? "h-full" : "hidden"}><Bandeja aviso={aviso} onCuenta={setCuentaMails} /></div>
        {tab === "productos" && <Productos aviso={aviso} refrescarKey={refrescar} onCambio={() => {}} />}
        {tab === "precios" && <ListaPrecios aviso={aviso} onCambioPrecios={() => setRefrescar((n) => n + 1)} irAProductos={() => setTab("productos")} />}
        {tab === "reglas" && <Reglas aviso={aviso} />}
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
