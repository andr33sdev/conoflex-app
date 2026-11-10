// Informe "Costo de lo vendido": en un rango de fechas, cada producto terminado FACTURADO (facturas menos notas de
// crédito, leídas de los PDF del sistema de facturación) con sus unidades y el costo según su receta actual.
// Se descarga en Excel. Lo ve quien tenga el permiso "Costo de lo vendido" (y los administradores).
import { useState } from "react";
import { FileSpreadsheet, Loader2, X } from "lucide-react";
import { api } from "../produccion/util";

const hoy = () => new Date().toISOString().slice(0, 10);
const inicioMes = () => `${hoy().slice(0, 8)}01`;
const fechaAR = (f) => (f ? String(f).slice(0, 10).split("-").reverse().join("/") : "—");
const usd = (n) => (n == null ? "—" : `US$ ${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

function puedeVerInforme() {
  try {
    const u = JSON.parse(localStorage.getItem("usuario_conoflex") || "{}");
    return String(u.rol || "").toUpperCase() === "ADMIN" || (u.permisos || []).some((p) => p === "*" || p === "costo-vendido");
  } catch {
    return false;
  }
}

async function descargarExcel(d) {
  const XLSX = await import("xlsx");
  const filas = [
    ["Costo de lo vendido (solo facturado)"],
    [`Del ${fechaAR(d.desde)} al ${fechaAR(d.hasta)} · ${d.comprobantes.facturas} facturas y ${d.comprobantes.notas_credito} notas de crédito · costo actual según receta, en US$`],
    [],
    ["Código", "Descripción", "Unidades facturadas", "Costo unitario (US$)", "Costo total (US$)", "Observación"],
    ...d.filas.map((f) => [f.codigo, f.descripcion, f.unidades, f.costo_unitario, f.costo_total, f.observacion]),
    [],
    ["TOTAL", "", d.totales.unidades, "", d.totales.costo_total, d.totales.sin_costo ? `${d.totales.sin_costo} productos sin costo no suman` : ""],
  ];
  const hoja = XLSX.utils.aoa_to_sheet(filas);
  hoja["!cols"] = [{ wch: 18 }, { wch: 48 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 45 }];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Costo vendido");
  XLSX.writeFile(libro, `costo-vendido_${d.desde}_a_${d.hasta}.xlsx`);
}

export default function InformeCostoVendido() {
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState(inicioMes);
  const [hasta, setHasta] = useState(hoy);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [ultimo, setUltimo] = useState(null);

  if (!puedeVerInforme()) return null;

  const exportar = async () => {
    setCargando(true);
    setError("");
    try {
      const d = await api(`/api/informes/costo-vendido?desde=${desde}&hasta=${hasta}`);
      await descargarExcel(d);
      setUltimo(d);
    } catch (e) {
      setError(e.message || "No se pudo armar el informe.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <>
      <button onClick={() => setAbierto(true)} className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 px-5 py-2.5 font-bold text-xs uppercase tracking-widest bg-black border border-zinc-800 hover:border-[#FF5A00] text-white cursor-pointer transition-colors">
        <FileSpreadsheet size={16} className="text-[#FF5A00]" /> Costo de lo vendido
      </button>

      {abierto && (
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && !cargando && setAbierto(false)}>
          <div role="dialog" aria-modal="true" aria-label="Costo de lo vendido" className="w-full max-w-md bg-[#0a0a0a] border border-zinc-800 shadow-2xl">
            <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-zinc-800">
              <div className="flex-1">
                <h2 className="text-lg font-extrabold text-white">Costo de lo vendido</h2>
                <p className="text-sm text-zinc-500 mt-0.5">Solo lo facturado (menos notas de crédito), por producto, con su costo actual.</p>
              </div>
              <button onClick={() => !cargando && setAbierto(false)} aria-label="Cerrar" className="w-9 h-9 grid place-items-center text-zinc-500 hover:text-white cursor-pointer"><X size={18} /></button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Desde
                  <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="bg-black border border-zinc-800 focus:border-[#FF5A00] px-3 py-2.5 text-sm text-white outline-none [color-scheme:dark]" />
                </label>
                <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Hasta
                  <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className="bg-black border border-zinc-800 focus:border-[#FF5A00] px-3 py-2.5 text-sm text-white outline-none [color-scheme:dark]" />
                </label>
              </div>
              {error && <p className="text-sm text-rose-300">{error}</p>}
              {ultimo && (
                <div className="text-sm text-zinc-300 border border-zinc-800 p-3 flex flex-col gap-1">
                  <span>Descargado: {ultimo.totales.productos} productos, {ultimo.totales.unidades.toLocaleString("es-AR")} unidades, <b className="text-white">{usd(ultimo.totales.costo_total)}</b>.</span>
                  {ultimo.totales.sin_costo > 0 && <span className="text-amber-300">{ultimo.totales.sin_costo} productos no tienen costo (sin receta o no están en productos terminados): figuran en el Excel pero no suman.</span>}
                  <span className="text-xs text-zinc-500">Última factura leída: {fechaAR(ultimo.ultima_factura)}</span>
                </div>
              )}
              <button onClick={exportar} disabled={cargando || !desde || !hasta || desde > hasta} className="w-full flex items-center justify-center gap-2 px-5 py-3 font-bold text-xs uppercase tracking-widest bg-[#FFD700] hover:bg-white text-black cursor-pointer disabled:opacity-50">
                {cargando ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />} Exportar Excel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
