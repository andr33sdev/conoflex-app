// Reporte de facturación: en un rango de fechas, cada producto terminado FACTURADO (facturas menos notas de
// crédito, leídas de los PDF del sistema de facturación) con sus unidades y las columnas que se elijan:
// costo unitario y total (según la receta actual, en US$), importe neto y total (en $) y rentabilidad (US$).
// Se descarga en Excel. Lo ve quien tenga el permiso "Costo de lo vendido" (y los administradores).
import { useState } from "react";
import { Check, FileSpreadsheet, Loader2, X } from "lucide-react";
import { api } from "../produccion/util";

const hoy = () => new Date().toISOString().slice(0, 10);
const inicioMes = () => `${hoy().slice(0, 8)}01`;
const fechaAR = (f) => (f ? String(f).slice(0, 10).split("-").reverse().join("/") : "—");
const plata = (n, signo) => (n == null ? "—" : `${signo} ${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
// "1.450,5" · "1450,5" · "1450.5" · "1.450" → número. Con coma, los puntos son de miles.
const aNum = (t) => {
  const x = String(t ?? "").trim();
  if (x.includes(",")) return Number(x.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(x)) return Number(x.replace(/\./g, ""));
  return Number(x);
};

const OPCIONES = [
  { id: "costo_unitario", titulo: "Costo unitario por producto", nota: "US$, según la receta actual" },
  { id: "costo_total", titulo: "Costo total", nota: "US$, costo unitario × unidades" },
  { id: "importe_neto", titulo: "Importe neto", nota: "$, sin IVA" },
  { id: "importe_total", titulo: "Importe total", nota: "$, con IVA" },
  { id: "rentabilidad", titulo: "Rentabilidad", nota: "US$, importe neto − costo total" },
];

function puedeVerInforme() {
  try {
    const u = JSON.parse(localStorage.getItem("usuario_conoflex") || "{}");
    return String(u.rol || "").toUpperCase() === "ADMIN" || (u.permisos || []).some((p) => p === "*" || p === "costo-vendido");
  } catch {
    return false;
  }
}

/** Arma el Excel solo con las columnas elegidas. */
async function descargarExcel(d, sel) {
  const XLSX = await import("xlsx");
  const cols = [
    { t: "Código", w: 18, v: (f) => f.codigo, tot: () => "TOTAL" },
    { t: "Descripción", w: 48, v: (f) => f.descripcion, tot: () => "" },
    { t: "Unidades facturadas", w: 18, v: (f) => f.unidades, tot: (t) => t.unidades },
  ];
  if (sel.costo_unitario) cols.push({ t: "Costo unitario (US$)", w: 18, v: (f) => f.costo_unitario, tot: () => "" });
  if (sel.costo_total) cols.push({ t: "Costo total (US$)", w: 18, v: (f) => f.costo_total, tot: (t) => t.costo_total });
  if (sel.importe_neto) cols.push({ t: "Importe neto sin IVA ($)", w: 20, v: (f) => f.importe_neto, tot: (t) => t.importe_neto });
  if (sel.importe_total) cols.push({ t: "Importe total con IVA ($)", w: 20, v: (f) => f.importe_total, tot: (t) => t.importe_total });
  if (sel.rentabilidad) cols.push({ t: "Rentabilidad (US$)", w: 18, v: (f) => f.rentabilidad, tot: (t) => t.rentabilidad });

  const conCosto = sel.costo_unitario || sel.costo_total || sel.rentabilidad;
  const conImporte = sel.importe_neto || sel.importe_total || sel.rentabilidad;
  const obs = (f) => {
    const o = [];
    if (conCosto && f.observacion) o.push(f.observacion);
    if (conImporte && f.aviso_importe) o.push(f.aviso_importe);
    if (sel.rentabilidad && f.rentabilidad == null && !o.length) o.push("Sin rentabilidad: falta costo o importe.");
    return o.join(" ");
  };
  cols.push({ t: "Observación", w: 60, v: obs, tot: () => "" });

  const detalle = [`Del ${fechaAR(d.desde)} al ${fechaAR(d.hasta)}`, `${d.comprobantes.facturas} facturas y ${d.comprobantes.notas_credito} notas de crédito`];
  if (conCosto) detalle.push("costo actual según receta, en US$");
  if (conImporte) detalle.push("importes en $");
  if (sel.rentabilidad) detalle.push(`rentabilidad con dólar a $ ${Number(d.tipo_cambio).toLocaleString("es-AR")}`);

  const filas = [
    ["Reporte de facturación (solo facturado)"],
    [detalle.join(" · ")],
    [],
    cols.map((c) => c.t),
    ...d.filas.map((f) => cols.map((c) => c.v(f))),
    [],
    cols.map((c) => c.tot(d.totales)),
  ];
  const hoja = XLSX.utils.aoa_to_sheet(filas);
  hoja["!cols"] = cols.map((c) => ({ wch: c.w }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Facturación");
  XLSX.writeFile(libro, `reporte-facturacion_${d.desde}_a_${d.hasta}.xlsx`);
}

export default function InformeCostoVendido() {
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState(inicioMes);
  const [hasta, setHasta] = useState(hoy);
  const [sel, setSel] = useState({ costo_unitario: true, costo_total: true, importe_neto: false, importe_total: false, rentabilidad: false });
  const [tc, setTc] = useState("");
  const [buscandoTc, setBuscandoTc] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [ultimo, setUltimo] = useState(null);

  if (!puedeVerInforme()) return null;

  const ninguna = !Object.values(sel).some(Boolean);
  const tcNum = aNum(tc);
  const faltaTc = sel.rentabilidad && !(tcNum > 0);

  const alternar = async (id) => {
    const nuevo = !sel[id];
    setSel((s) => ({ ...s, [id]: nuevo }));
    setUltimo(null);
    // La rentabilidad necesita el dólar: se precarga el oficial del día (se puede cambiar).
    if (id === "rentabilidad" && nuevo && !tc) {
      setBuscandoTc(true);
      try {
        const d = await api("/api/informes/dolar-oficial");
        if (d?.venta) setTc(String(d.venta).replace(".", ","));
      } catch {
        // Si no responde, lo escribe a mano.
      } finally {
        setBuscandoTc(false);
      }
    }
  };

  const exportar = async () => {
    setCargando(true);
    setError("");
    try {
      const q = new URLSearchParams({ desde, hasta });
      if (sel.rentabilidad) q.set("tc", String(tcNum));
      const d = await api(`/api/informes/costo-vendido?${q}`);
      await descargarExcel(d, sel);
      setUltimo(d);
    } catch (e) {
      setError(e.message || "No se pudo armar el reporte.");
    } finally {
      setCargando(false);
    }
  };

  const campoFecha = "bg-black border border-zinc-800 focus:border-[#FF5A00] px-3 py-2.5 text-sm text-white outline-none [color-scheme:dark]";

  return (
    <>
      <button onClick={() => setAbierto(true)} className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 px-5 py-2.5 font-bold text-xs uppercase tracking-widest bg-black border border-zinc-800 hover:border-[#FF5A00] text-white cursor-pointer transition-colors">
        <FileSpreadsheet size={16} className="text-[#FF5A00]" /> Exportar reporte facturación
      </button>

      {abierto && (
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && !cargando && setAbierto(false)}>
          <div role="dialog" aria-modal="true" aria-label="Reporte de facturación" className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-[#0a0a0a] border border-zinc-800 shadow-2xl">
            <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-zinc-800">
              <div className="flex-1">
                <h2 className="text-lg font-extrabold text-white">Reporte de facturación</h2>
                <p className="text-sm text-zinc-500 mt-0.5">Solo lo facturado (menos notas de crédito), por producto.</p>
              </div>
              <button onClick={() => !cargando && setAbierto(false)} aria-label="Cerrar" className="w-9 h-9 grid place-items-center text-zinc-500 hover:text-white cursor-pointer"><X size={18} /></button>
            </div>

            <div className="p-5 flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Desde
                  <input type="date" value={desde} max={hasta} onChange={(e) => { setDesde(e.target.value); setUltimo(null); }} className={campoFecha} />
                </label>
                <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Hasta
                  <input type="date" value={hasta} min={desde} onChange={(e) => { setHasta(e.target.value); setUltimo(null); }} className={campoFecha} />
                </label>
              </div>

              <fieldset>
                <legend className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Qué incluir</legend>
                <div className="flex flex-col gap-1.5">
                  {OPCIONES.map((o) => (
                    <button key={o.id} type="button" role="checkbox" aria-checked={sel[o.id]} onClick={() => alternar(o.id)} className={`w-full min-h-[52px] flex items-center gap-3 px-3 py-2 border text-left cursor-pointer transition-colors ${sel[o.id] ? "border-[#FF5A00] bg-[#FF5A00]/10" : "border-zinc-800 hover:border-zinc-600"}`}>
                      <span className={`w-5 h-5 shrink-0 grid place-items-center border ${sel[o.id] ? "bg-[#FF5A00] border-[#FF5A00] text-black" : "border-zinc-600"}`}>{sel[o.id] && <Check size={14} strokeWidth={3} />}</span>
                      <span className="flex-1">
                        <span className="block text-sm font-bold text-white">{o.titulo}</span>
                        <span className="block text-xs text-zinc-500">{o.nota}</span>
                      </span>
                    </button>
                  ))}
                </div>
                {ninguna && <p className="mt-2 text-sm text-amber-300">Elegí al menos una opción.</p>}
              </fieldset>

              {sel.rentabilidad && (
                <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Dólar para la rentabilidad ($ por US$)
                  <div className="relative">
                    <input value={tc} onChange={(e) => { setTc(e.target.value.replace(/[^\d.,]/g, "")); setUltimo(null); }} inputMode="decimal" placeholder="Ej: 1450" className={`w-full ${campoFecha} ${faltaTc && !buscandoTc ? "border-amber-500/70" : ""}`} />
                    {buscandoTc && <Loader2 size={16} className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />}
                  </div>
                  <span className="normal-case tracking-normal font-normal text-zinc-500">Viene con el dólar oficial de hoy. Cambialo si querés usar otro.</span>
                </label>
              )}

              {error && <p className="text-sm text-rose-300">{error}</p>}
              {ultimo && (
                <div className="text-sm text-zinc-300 border border-zinc-800 p-3 flex flex-col gap-1">
                  <span>Descargado: {ultimo.totales.productos} productos, {ultimo.totales.unidades.toLocaleString("es-AR")} unidades.</span>
                  {sel.costo_total && <span>Costo total: <b className="text-white">{plata(ultimo.totales.costo_total, "US$")}</b></span>}
                  {sel.importe_neto && <span>Importe neto: <b className="text-white">{plata(ultimo.totales.importe_neto, "$")}</b></span>}
                  {sel.importe_total && <span>Importe total: <b className="text-white">{plata(ultimo.totales.importe_total, "$")}</b></span>}
                  {sel.rentabilidad && <span>Rentabilidad: <b className="text-white">{plata(ultimo.totales.rentabilidad, "US$")}</b></span>}
                  {(sel.costo_unitario || sel.costo_total || sel.rentabilidad) && ultimo.totales.sin_costo > 0 && <span className="text-amber-300">{ultimo.totales.sin_costo} productos no tienen costo: figuran en el Excel pero no suman.</span>}
                  {sel.rentabilidad && ultimo.totales.sin_rentabilidad > 0 && <span className="text-amber-300">{ultimo.totales.sin_rentabilidad} productos sin rentabilidad (falta costo completo o importe): no suman.</span>}
                  <span className="text-xs text-zinc-500">Última factura leída: {fechaAR(ultimo.ultima_factura)}</span>
                </div>
              )}
              <button onClick={exportar} disabled={cargando || ninguna || faltaTc || !desde || !hasta || desde > hasta} className="w-full flex items-center justify-center gap-2 px-5 py-3 font-bold text-xs uppercase tracking-widest bg-[#FFD700] hover:bg-white text-black cursor-pointer disabled:opacity-50">
                {cargando ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />} Exportar Excel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
