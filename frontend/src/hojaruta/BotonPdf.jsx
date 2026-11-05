import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";

/** Descarga el PDF de la hoja de ruta de un día (carga la librería recién al primer clic). */
export default function BotonPdf({ fecha, usuario, orden, km, etiqueta = "PDF", className = "" }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const exportar = async () => {
    setOcupado(true); setError("");
    try { const { descargarPdfDia } = await import("./pdfDia"); await descargarPdfDia({ fecha, usuario, orden, km }); }
    catch (e) { setError(e.message); } finally { setOcupado(false); }
  };
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <button type="button" onClick={exportar} disabled={ocupado} title="Exportar el día en PDF" className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-200 border border-zinc-600 hover:bg-zinc-800 rounded-md px-3 py-2 disabled:opacity-60 normal-case">
        {ocupado ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}{etiqueta}
      </button>
      {error && <span className="text-[11px] text-red-400 normal-case font-normal">{error}</span>}
    </span>
  );
}
