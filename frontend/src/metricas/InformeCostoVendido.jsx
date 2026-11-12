// Reporte de facturación: en un rango de fechas, cada producto terminado FACTURADO (facturas menos notas de
// crédito, leídas de los PDF del sistema de facturación) con sus unidades y las columnas que se elijan:
// importes, precio unitario, costo (según la receta actual, en US$), rentabilidad y margen final. El modo
// "completo" suma el resumen por hoja, unidades por familia, ventas mes a mes y alertas (como el de la contadora).
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
  { id: "importe_neto", titulo: "Importe neto", nota: "$ sin IVA, y en US$ si hay dólar" },
  { id: "importe_total", titulo: "Importe total", nota: "$, con IVA" },
  { id: "precio_unitario", titulo: "Precio unitario", nota: "$ y US$, importe neto ÷ unidades" },
  { id: "costo_unitario", titulo: "Costo unitario por producto", nota: "US$, según la receta actual" },
  { id: "costo_total", titulo: "Costo total", nota: "US$, costo unitario × unidades" },
  { id: "rentabilidad", titulo: "Rentabilidad (contribución marginal)", nota: "US$ y %, importe neto − costo total" },
  { id: "margen_final", titulo: "Margen final", nota: "US$ y %, rentabilidad − gastos operativos − cargos ML" },
];
const TODAS = Object.fromEntries(OPCIONES.map((o) => [o.id, true]));
const PARAMS_KEY = "reporte_facturacion_params";
const leerParams = () => {
  try {
    return { gastos: "53", cargosMl: "34", ...JSON.parse(localStorage.getItem(PARAMS_KEY) || "{}") };
  } catch {
    return { gastos: "53", cargosMl: "34" };
  }
};

function puedeVerInforme() {
  try {
    const u = JSON.parse(localStorage.getItem("usuario_conoflex") || "{}");
    return String(u.rol || "").toUpperCase() === "ADMIN" || (u.permisos || []).some((p) => p === "*" || p === "costo-vendido");
  } catch {
    return false;
  }
}

const MODOS = [
  { id: "completo", titulo: "Completo (resultados)" },
  { id: "elegir", titulo: "Elegir columnas" },
];
const EMPRESAS = [
  { id: "juntas", titulo: "Todo junto" },
  { id: "separadas", titulo: "Una hoja por empresa" },
];
const MERCADOLIBRE = [
  { id: "junto", titulo: "Junto con el resto" },
  { id: "separar", titulo: "En hoja aparte" },
  { id: "solo", titulo: "Solo MercadoLibre" },
  { id: "sin", titulo: "Sin MercadoLibre" },
];

const PLATA = "#,##0.00";
const USD4 = "#,##0.0000";
const PCT = "0.0%";

/** Columnas del Excel según lo tildado. z: formato de número; tot: valor de la fila de totales. */
function columnas(sel, conDolar) {
  const cols = [
    { t: "Código", w: 18, v: (f) => f.codigo, tot: () => "TOTAL" },
    { t: "Descripción", w: 48, v: (f) => f.descripcion, tot: () => "" },
    { t: "Unidades facturadas", w: 12, v: (f) => f.unidades, tot: (t) => t.unidades, z: "#,##0" },
  ];
  if (sel.importe_neto) {
    cols.push({ t: "Venta neta sin IVA ($)", w: 18, v: (f) => f.importe_neto, tot: (t) => t.importe_neto, z: PLATA });
    if (conDolar) cols.push({ t: "Venta neta (US$)", w: 14, v: (f) => f.venta_usd, tot: (t) => t.venta_usd, z: PLATA });
  }
  if (sel.importe_total) cols.push({ t: "Venta total con IVA ($)", w: 18, v: (f) => f.importe_total, tot: (t) => t.importe_total, z: PLATA });
  if (sel.precio_unitario) {
    cols.push({ t: "Precio venta unit. ($)", w: 16, v: (f) => f.precio_unitario, tot: () => "", z: PLATA });
    if (conDolar) cols.push({ t: "Precio venta unit. (US$)", w: 16, v: (f) => f.precio_unitario_usd, tot: () => "", z: USD4 });
  }
  if (sel.costo_unitario) cols.push({ t: "Costo unit. (US$)", w: 14, v: (f) => f.costo_unitario, tot: () => "", z: USD4 });
  if (sel.costo_total) cols.push({ t: "Costo total (US$)", w: 14, v: (f) => f.costo_total, tot: (t) => t.costo_total, z: PLATA });
  if (sel.rentabilidad) {
    cols.push({ t: "Rentabilidad CMG (US$)", w: 16, v: (f) => f.rentabilidad, tot: (t) => t.rentabilidad, z: PLATA });
    cols.push({ t: "Rentabilidad CMG %", w: 12, v: (f) => f.rentabilidad_pct, tot: (t) => t.rentabilidad_pct, z: PCT });
  }
  if (sel.margen_final) {
    cols.push({ t: "Margen final (US$)", w: 14, v: (f) => f.margen_final, tot: (t) => t.margen_final, z: PLATA });
    cols.push({ t: "Margen final %", w: 12, v: (f) => f.margen_final_pct, tot: (t) => t.margen_final_pct, z: PCT });
  }

  const conCosto = sel.costo_unitario || sel.costo_total || sel.rentabilidad || sel.margen_final;
  const conImporte = sel.importe_neto || sel.importe_total || sel.precio_unitario || sel.rentabilidad || sel.margen_final;
  const obs = (f) => {
    const o = [];
    if (conCosto && f.observacion) o.push(f.observacion);
    if (conImporte && f.aviso_importe) o.push(f.aviso_importe);
    if ((sel.rentabilidad || sel.margen_final) && f.rentabilidad == null && !o.length) o.push("Sin rentabilidad: falta costo o importe.");
    return o.join(" ");
  };
  cols.push({ t: "Observación", w: 60, v: obs, tot: () => "" });
  return { cols, conCosto, conImporte };
}

/** Hoja a partir de filas; aplica formatos de número por columna desde la fila `desde` (0 = primera). */
function hojaConFormato(XLSX, filas, formatos, desde) {
  const hoja = XLSX.utils.aoa_to_sheet(filas);
  for (let r = desde; r < filas.length; r++) {
    formatos.forEach((z, c) => {
      const celda = hoja[XLSX.utils.encode_cell({ r, c })];
      if (z && celda && typeof celda.v === "number") celda.z = z;
    });
  }
  return hoja;
}

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** Hojas del reporte completo: unidades por familia, ventas mes a mes y alertas. */
function hojasExtra(XLSX, libro, d) {
  if (d.familias) {
    const filas = [
      [`Unidades vendidas por familia · ${d.anio}`],
      ["Todas las empresas y canales. Facturas menos notas de crédito. La familia sale de la descripción de la factura."],
      [],
      ["Familia", ...MESES, "Total"],
      ...d.familias.map((f) => [f.familia, ...f.meses, f.meses.reduce((a, b) => a + b, 0)]),
    ];
    const hoja = hojaConFormato(XLSX, filas, Array(14).fill("#,##0"), 4);
    hoja["!cols"] = [{ wch: 26 }, ...Array(13).fill({ wch: 11 })];
    XLSX.utils.book_append_sheet(libro, hoja, "Unidades por familia");
  }
  if (d.ventas_mensuales) {
    const [a1, a2] = d.ventas_mensuales.anios;
    const vari = (m) => (m[a1]?.usd > 0 && m[a2]?.usd != null ? m[a2].usd / m[a1].usd - 1 : null);
    const tot = (anio, k) => d.ventas_mensuales.meses.reduce((s, m) => s + (m[anio]?.[k] || 0), 0);
    const filas = [
      [`Ventas netas mes a mes · ${a1} contra ${a2}`],
      ["Todas las empresas y canales, sin IVA. US$ con el dólar oficial (venta) de cierre de cada mes."],
      [],
      ["Mes", `${a1} ($)`, `Dólar ${a1}`, `${a1} (US$)`, `${a2} ($)`, `Dólar ${a2}`, `${a2} (US$)`, "Variación US$"],
      ...d.ventas_mensuales.meses.map((m) => [MESES[m.mes - 1], m[a1]?.neto ?? "", m[a1]?.tc ?? "", m[a1]?.usd ?? "", m[a2]?.neto ?? "", m[a2]?.tc ?? "", m[a2]?.usd ?? "", vari(m) ?? ""]),
      [],
      ["TOTAL", tot(a1, "neto"), "", tot(a1, "usd"), tot(a2, "neto"), "", tot(a2, "usd"), ""],
    ];
    const hoja = hojaConFormato(XLSX, filas, ["", PLATA, PLATA, PLATA, PLATA, PLATA, PLATA, PCT], 4);
    hoja["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 13 }];
    XLSX.utils.book_append_sheet(libro, hoja, "Ventas mes a mes");
  }
  if (d.alertas) {
    const filas = [
      ["Alertas para revisar"],
      [`Del ${fechaAR(d.desde)} al ${fechaAR(d.hasta)} · ${d.alertas.length} alertas`],
      [],
      ["Tipo", "Código", "Descripción", "Qué pasa", "Comprobante", "Fecha", "Importe neto ($)"],
      ...d.alertas.map((a) => [a.tipo, a.codigo, a.descripcion, a.detalle, a.comprobante, a.fecha ? fechaAR(a.fecha) : "", a.importe ?? ""]),
    ];
    const hoja = hojaConFormato(XLSX, filas, ["", "", "", "", "", "", PLATA], 4);
    hoja["!cols"] = [{ wch: 22 }, { wch: 18 }, { wch: 40 }, { wch: 70 }, { wch: 34 }, { wch: 11 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(libro, hoja, "Alertas");
  }
}

/** Arma el Excel: una hoja por grupo (empresa / MercadoLibre) con las columnas elegidas, un resumen si hay varias y las hojas extra. */
async function descargarExcel(d, sel) {
  const XLSX = await import("xlsx");
  const conDolar = !!d.tipo_cambio;
  const { cols, conCosto, conImporte } = columnas(sel, conDolar);
  const notas = [];
  if (conCosto) notas.push("costo actual según receta, en US$");
  if (conImporte) notas.push("importes sin IVA salvo «con IVA»");
  if (conDolar) notas.push(`dólar a $ ${Number(d.tipo_cambio).toLocaleString("es-AR")}`);
  if (sel.margen_final) notas.push(`gastos operativos ${d.gastos_pct}% de la venta${d.ml_pct ? ` y cargos ML ${d.ml_pct}% de lo vendido por ML` : ""}`);
  const libro = XLSX.utils.book_new();
  const hojas = d.hojas?.length ? d.hojas : [{ nombre: "Facturación", ...d }];

  if (hojas.length > 1) {
    const tot = cols.filter((c) => c.tot({}) !== "" && c.t !== "Código");
    const filas = [
      ["Reporte de facturación (solo facturado) · Resumen"],
      [[`Del ${fechaAR(d.desde)} al ${fechaAR(d.hasta)}`, ...notas].join(" · ")],
      [],
      ["Hoja", "Facturas", "Notas de crédito", "Productos", ...tot.map((c) => c.t)],
      ...hojas.map((h) => [h.nombre, h.comprobantes.facturas, h.comprobantes.notas_credito, h.totales.productos, ...tot.map((c) => c.tot(h.totales))]),
      [],
      ["TOTAL", d.comprobantes.facturas, d.comprobantes.notas_credito, d.totales.productos, ...tot.map((c) => c.tot(d.totales))],
    ];
    if (sel.rentabilidad || sel.margen_final) filas.push([], ["Los % se calculan sobre la venta de los productos que tienen rentabilidad (costo completo)."]);
    const hoja = hojaConFormato(XLSX, filas, ["", "#,##0", "#,##0", "#,##0", ...tot.map((c) => c.z || "")], 4);
    hoja["!cols"] = [{ wch: 30 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, ...tot.map((c) => ({ wch: c.w }))];
    XLSX.utils.book_append_sheet(libro, hoja, "Resumen");
  }

  for (const h of hojas) {
    const filas = [
      [`Reporte de facturación (solo facturado)${hojas.length > 1 ? ` · ${h.nombre}` : ""}`],
      [[`Del ${fechaAR(d.desde)} al ${fechaAR(d.hasta)}`, `${h.comprobantes.facturas} facturas y ${h.comprobantes.notas_credito} notas de crédito`, ...notas].join(" · ")],
      [],
      cols.map((c) => c.t),
      ...h.filas.map((f) => cols.map((c) => c.v(f) ?? "")),
      [],
      cols.map((c) => c.tot(h.totales) ?? ""),
    ];
    const hoja = hojaConFormato(XLSX, filas, cols.map((c) => c.z || ""), 4);
    hoja["!cols"] = cols.map((c) => ({ wch: c.w }));
    XLSX.utils.book_append_sheet(libro, hoja, h.nombre.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  }
  hojasExtra(XLSX, libro, d);
  XLSX.writeFile(libro, `reporte-facturacion_${d.desde}_a_${d.hasta}.xlsx`);
}

const TITULO = "text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2";

/** Opciones de a una (se elige solo una). */
function Selector({ etiqueta, nota, opciones, valor, onCambio }) {
  return (
    <fieldset>
      <legend className={TITULO}>{etiqueta}</legend>
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={etiqueta}>
        {opciones.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={valor === o.id} onClick={() => onCambio(o.id)} className={`min-h-[44px] px-3 py-2 border text-sm font-bold text-left cursor-pointer transition-colors ${valor === o.id ? "border-[#FF5A00] bg-[#FF5A00]/10 text-white" : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white"}`}>
            {o.titulo}
          </button>
        ))}
      </div>
      {nota && <p className="mt-1.5 text-xs text-zinc-500">{nota}</p>}
    </fieldset>
  );
}

export default function InformeCostoVendido() {
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState(inicioMes);
  const [hasta, setHasta] = useState(hoy);
  const [modo, setModo] = useState("completo");
  const [elegidas, setElegidas] = useState({ costo_unitario: true, costo_total: true });
  const [params, setParams] = useState(leerParams);
  const [empresas, setEmpresas] = useState("separadas");
  const [ml, setMl] = useState("separar");
  const [tc, setTc] = useState("");
  const [buscandoTc, setBuscandoTc] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [ultimo, setUltimo] = useState(null);

  if (!puedeVerInforme()) return null;

  const completo = modo === "completo";
  const sel = completo ? TODAS : elegidas;
  const ninguna = !Object.values(sel).some(Boolean);
  const tcNum = aNum(tc);
  const pideDolar = sel.rentabilidad || sel.margen_final;
  const faltaTc = pideDolar && !(tcNum > 0);
  const gastosNum = aNum(params.gastos);
  const mlNum = aNum(params.cargosMl);
  const faltaPct = sel.margen_final && (!(gastosNum >= 0 && gastosNum < 100) || !(mlNum >= 0 && mlNum < 100) || params.gastos === "");

  // La rentabilidad y el margen necesitan el dólar: se precarga el oficial del día (se puede cambiar).
  const traerDolar = async () => {
    if (tc) return;
    setBuscandoTc(true);
    try {
      const d = await api("/api/informes/dolar-oficial");
      if (d?.venta) setTc(String(d.venta).replace(".", ","));
    } catch {
      // Si no responde, lo escribe a mano.
    } finally {
      setBuscandoTc(false);
    }
  };

  const elegirModo = (m) => {
    setModo(m);
    setUltimo(null);
    if (m === "completo") {
      setEmpresas("separadas");
      setMl("separar");
      traerDolar();
    }
  };

  const alternar = (id) => {
    const nuevo = !elegidas[id];
    setElegidas((s) => ({ ...s, [id]: nuevo }));
    setUltimo(null);
    if ((id === "rentabilidad" || id === "margen_final") && nuevo) traerDolar();
  };

  const cambiarParam = (k, v) => {
    const p = { ...params, [k]: v.replace(/[^\d.,]/g, "") };
    setParams(p);
    setUltimo(null);
    try {
      localStorage.setItem(PARAMS_KEY, JSON.stringify(p));
    } catch {
      // Sin almacenamiento: se usa igual, no se recuerda.
    }
  };

  const exportar = async () => {
    setCargando(true);
    setError("");
    try {
      const q = new URLSearchParams({ desde, hasta, empresas, ml });
      if (pideDolar || (tcNum > 0 && (sel.importe_neto || sel.precio_unitario))) q.set("tc", String(tcNum));
      if (sel.margen_final) {
        q.set("gastos", String(gastosNum));
        q.set("cargos_ml", String(mlNum));
      }
      if (completo) q.set("extras", "1");
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
      <button onClick={() => { setAbierto(true); if (completo) traerDolar(); }} className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 px-5 py-2.5 font-bold text-xs uppercase tracking-widest bg-black border border-zinc-800 hover:border-[#FF5A00] text-white cursor-pointer transition-colors">
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

              <Selector etiqueta="Reporte" opciones={MODOS} valor={modo} onCambio={elegirModo} nota={completo ? "Todas las columnas, resumen por hoja, unidades por familia, ventas mes a mes y alertas." : null} />
              <Selector etiqueta="Empresas" opciones={EMPRESAS} valor={empresas} onCambio={(v) => { setEmpresas(v); setUltimo(null); }} nota={empresas === "separadas" ? "Conoplas y Serenplas, cada una en su hoja." : null} />
              <Selector etiqueta="MercadoLibre (punto de venta 0006)" opciones={MERCADOLIBRE} valor={ml} onCambio={(v) => { setMl(v); setUltimo(null); }} />

              {!completo && (
                <fieldset>
                  <legend className={TITULO}>Qué incluir</legend>
                  <div className="flex flex-col gap-1.5">
                    {OPCIONES.map((o) => (
                      <button key={o.id} type="button" role="checkbox" aria-checked={!!elegidas[o.id]} onClick={() => alternar(o.id)} className={`w-full min-h-[52px] flex items-center gap-3 px-3 py-2 border text-left cursor-pointer transition-colors ${elegidas[o.id] ? "border-[#FF5A00] bg-[#FF5A00]/10" : "border-zinc-800 hover:border-zinc-600"}`}>
                        <span className={`w-5 h-5 shrink-0 grid place-items-center border ${elegidas[o.id] ? "bg-[#FF5A00] border-[#FF5A00] text-black" : "border-zinc-600"}`}>{elegidas[o.id] && <Check size={14} strokeWidth={3} />}</span>
                        <span className="flex-1">
                          <span className="block text-sm font-bold text-white">{o.titulo}</span>
                          <span className="block text-xs text-zinc-500">{o.nota}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  {ninguna && <p className="mt-2 text-sm text-amber-300">Elegí al menos una opción.</p>}
                </fieldset>
              )}

              {pideDolar && (
                <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Dólar ($ por US$)
                  <div className="relative">
                    <input value={tc} onChange={(e) => { setTc(e.target.value.replace(/[^\d.,]/g, "")); setUltimo(null); }} inputMode="decimal" placeholder="Ej: 1450" className={`w-full ${campoFecha} ${faltaTc && !buscandoTc ? "border-amber-500/70" : ""}`} />
                    {buscandoTc && <Loader2 size={16} className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />}
                  </div>
                  <span className="normal-case tracking-normal font-normal text-zinc-500">Viene con el dólar oficial de hoy. Para un mes cerrado, poné el del último día del mes.</span>
                </label>
              )}

              {sel.margen_final && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-widest text-zinc-500">
                    Gastos operativos %
                    <input value={params.gastos} onChange={(e) => cambiarParam("gastos", e.target.value)} inputMode="decimal" className={campoFecha} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-widest text-zinc-500">
                    Cargos MercadoLibre %
                    <input value={params.cargosMl} onChange={(e) => cambiarParam("cargosMl", e.target.value)} inputMode="decimal" className={campoFecha} />
                  </label>
                  <span className="col-span-2 text-xs text-zinc-500">Margen final = rentabilidad − gastos operativos (sobre toda la venta) − cargos ML (solo sobre lo vendido por ML). Quedan guardados para la próxima vez.</span>
                </div>
              )}

              {error && <p className="text-sm text-rose-300">{error}</p>}
              {ultimo && (
                <div className="text-sm text-zinc-300 border border-zinc-800 p-3 flex flex-col gap-1">
                  <span>Descargado: {ultimo.totales.productos} productos, {ultimo.totales.unidades.toLocaleString("es-AR")} unidades{ultimo.hojas?.length > 1 ? `, en ${ultimo.hojas.length} hojas más el resumen` : ""}.</span>
                  {sel.costo_total && <span>Costo total: <b className="text-white">{plata(ultimo.totales.costo_total, "US$")}</b></span>}
                  {sel.importe_neto && <span>Importe neto: <b className="text-white">{plata(ultimo.totales.importe_neto, "$")}</b></span>}
                  {sel.importe_total && <span>Importe total: <b className="text-white">{plata(ultimo.totales.importe_total, "$")}</b></span>}
                  {sel.rentabilidad && <span>Rentabilidad: <b className="text-white">{plata(ultimo.totales.rentabilidad, "US$")}</b>{ultimo.totales.rentabilidad_pct != null && ` (${(ultimo.totales.rentabilidad_pct * 100).toFixed(1)}%)`}</span>}
                  {sel.margen_final && <span>Margen final: <b className="text-white">{plata(ultimo.totales.margen_final, "US$")}</b>{ultimo.totales.margen_final_pct != null && ` (${(ultimo.totales.margen_final_pct * 100).toFixed(1)}%)`}</span>}
                  {ultimo.alertas?.length > 0 && <span className="text-amber-300">{ultimo.alertas.length} alertas para revisar, en la hoja «Alertas».</span>}
                  {(sel.costo_unitario || sel.costo_total || sel.rentabilidad || sel.margen_final) && ultimo.totales.sin_costo > 0 && <span className="text-amber-300">{ultimo.totales.sin_costo} productos no tienen costo: figuran en el Excel pero no suman.</span>}
                  {(sel.rentabilidad || sel.margen_final) && ultimo.totales.sin_rentabilidad > 0 && <span className="text-amber-300">{ultimo.totales.sin_rentabilidad} productos sin rentabilidad (falta costo completo o importe): no suman.</span>}
                  <span className="text-xs text-zinc-500">Última factura leída: {fechaAR(ultimo.ultima_factura)}</span>
                </div>
              )}
              <button onClick={exportar} disabled={cargando || ninguna || faltaTc || faltaPct || !desde || !hasta || desde > hasta} className="w-full flex items-center justify-center gap-2 px-5 py-3 font-bold text-xs uppercase tracking-widest bg-[#FFD700] hover:bg-white text-black cursor-pointer disabled:opacity-50">
                {cargando ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />} Exportar Excel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
