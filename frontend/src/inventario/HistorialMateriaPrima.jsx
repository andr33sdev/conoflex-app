import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Calendar, ChevronDown, Factory, History, PackagePlus, SlidersHorizontal, Undo2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Drawer } from "../produccion/ui";
import { api } from "../produccion/util";
import { fechaHora, nf } from "../ingenieria/formato";

const TIPOS = {
  CONSUMO_PRODUCCION: { texto: "Producción", icono: Factory, color: "text-rose-300", fondo: "bg-rose-500/10 border-rose-500/25" },
  INGRESO_COMPRA: { texto: "Compra", icono: PackagePlus, color: "text-emerald-300", fondo: "bg-emerald-500/10 border-emerald-500/25" },
  AJUSTE_COMPRA: { texto: "Corrección de compra", icono: Undo2, color: "text-amber-300", fondo: "bg-amber-500/10 border-amber-500/25" },
  AJUSTE_MANUAL: { texto: "Ajuste manual", icono: SlidersHorizontal, color: "text-sky-300", fondo: "bg-sky-500/10 border-sky-500/25" },
};
const FILTROS = [
  { id: "", texto: "Todo" },
  { id: "CONSUMO_PRODUCCION", texto: "Producción" },
  { id: "INGRESO_COMPRA", texto: "Compras" },
  { id: "AJUSTE_MANUAL", texto: "Ajustes" },
];

const kg = (n, u) => `${nf(Math.abs(n), 3)} ${u}`;

function Dato({ k, v }) {
  if (v === null || v === undefined || v === "") return null;
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">{k}</div>
      <div className="text-sm font-semibold text-zinc-200 break-words">{v}</div>
    </div>
  );
}

function Detalle({ m, u }) {
  const d = m.detalle || {};
  if (m.tipo === "CONSUMO_PRODUCCION") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
        <Dato k="Lote" v={d.lote || m.referencia_texto} />
        <Dato k="Turno" v={d.turno} />
        <Dato k="Máquina" v={d.maquina} />
        <Dato k="Operario" v={d.operario} />
        <Dato k="Piezas" v={d.total != null ? `${nf(d.total, 0)} (${nf(d.buenas, 0)} buenas + ${nf(d.fallas, 0)} fallas)` : null} />
        <Dato k="Por pieza" v={d.kg_por_pieza != null ? kg(d.kg_por_pieza, u) : null} />
        <Dato k="En piezas buenas" v={d.kg_buenas != null ? kg(d.kg_buenas, u) : null} />
        <Dato k="En fallas" v={d.kg_fallas != null ? kg(d.kg_fallas, u) : null} />
        <Dato k="Aprobado por" v={m.usuario} />
      </div>
    );
  }
  if (m.tipo === "INGRESO_COMPRA" || m.tipo === "AJUSTE_COMPRA") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
        <Dato k="Solicitud" v={d.solicitud_id ? `SC-${String(d.solicitud_id).padStart(5, "0")}` : m.referencia_texto} />
        <Dato k="Proveedor" v={d.proveedor} />
        <Dato k="Orden de compra" v={d.numero_oc} />
        <Dato k="Artículo pedido" v={d.articulo} />
        <Dato k="Cantidad pedida" v={d.solicitada != null ? `${nf(d.solicitada, 3)} ${u}` : null} />
        <Dato k="Registrado por" v={m.usuario} />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      <Dato k="Motivo" v={m.referencia_texto} />
      <Dato k="Hecho por" v={m.usuario} />
    </div>
  );
}

function Fila({ m, u }) {
  const [abierta, setAbierta] = useState(false);
  const t = TIPOS[m.tipo] || TIPOS.AJUSTE_MANUAL;
  const Icono = t.icono;
  const entra = m.cantidad > 0;
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
      <button onClick={() => setAbierta((a) => !a)} aria-expanded={abierta} className="w-full flex items-center gap-3 px-3.5 py-3 text-left cursor-pointer hover:bg-white/[0.03] transition-colors">
        <span className={`w-10 h-10 rounded-xl border grid place-items-center shrink-0 ${t.fondo} ${t.color}`}><Icono size={18} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-white truncate">{t.texto}{m.referencia_texto && m.tipo !== "AJUSTE_MANUAL" ? ` · ${m.referencia_texto}` : ""}</span>
          <span className="block text-xs text-zinc-500 truncate">{fechaHora(m.fecha)}{m.usuario ? ` · ${m.usuario}` : ""}</span>
        </span>
        <span className="text-right shrink-0">
          <span className={`flex items-center justify-end gap-1 text-base font-extrabold ${entra ? "text-emerald-400" : "text-rose-400"}`}>
            {entra ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
            {entra ? "+" : "−"}{nf(Math.abs(m.cantidad), 3)}
          </span>
          <span className="block text-[11px] text-zinc-500">stock {nf(m.stock_resultante, 3)}</span>
        </span>
        <ChevronDown size={16} className={`text-zinc-600 shrink-0 transition-transform ${abierta ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {abierta && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-3.5 pb-4 pt-1 border-t border-white/[0.05]"><div className="pt-3"><Detalle m={m} u={u} /></div></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Historial detallado de una materia prima: en qué se gastó y qué compras la repusieron. */
export default function HistorialMateriaPrima({ item, abierto, onCerrar }) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [tipo, setTipo] = useState("");
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const id = item?.id;

  useEffect(() => {
    if (!abierto || !id) return undefined;
    let vivo = true;
    const q = new URLSearchParams();
    if (desde) q.set("desde", desde);
    if (hasta) q.set("hasta", hasta);
    if (tipo) q.set("tipo", tipo);
    api(`/api/materias-primas/${id}/historial?${q}`)
      .then((d) => vivo && (setDatos(d), setError("")))
      .catch((e) => vivo && (setError(e.message), setDatos({ movimientos: [] })));
    return () => {
      vivo = false;
    };
  }, [abierto, id, desde, hasta, tipo]);

  const u = (item?.unidad_medida || "kg").toLowerCase().replace("kilos", "kg");
  const movs = datos?.movimientos;
  const totales = useMemo(() => {
    let sale = 0;
    let entra = 0;
    (movs || []).forEach((m) => (m.cantidad < 0 ? (sale += -m.cantidad) : (entra += m.cantidad)));
    return { sale, entra };
  }, [movs]);

  return (
    <Drawer abierto={abierto} onCerrar={onCerrar} titulo={item?.nombre || item?.codigo || "Materia prima"} subtitulo={`${item?.codigo || ""} · Historial de movimientos`} ancho="sm:w-[600px] lg:w-[680px]">
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Stock actual</div>
          <div className="text-xl font-extrabold text-white mt-1">{nf(Number(datos?.materia_prima?.stock_actual ?? item?.stock_actual), 2)}<span className="text-xs text-zinc-500 ml-1">{u}</span></div>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/70">Entró</div>
          <div className="text-xl font-extrabold text-emerald-300 mt-1">{nf(totales.entra, 2)}</div>
        </div>
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.05] p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-rose-400/70">Salió</div>
          <div className="text-xl font-extrabold text-rose-300 mt-1">{nf(totales.sale, 2)}</div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="Tipo de movimiento">
        {FILTROS.map((f) => (
          <button key={f.id} role="tab" aria-selected={tipo === f.id} onClick={() => setTipo(f.id)} className={`shrink-0 min-h-[38px] px-4 rounded-full text-sm font-bold border transition-colors cursor-pointer ${tipo === f.id ? "bg-[#FF5A00] border-[#FF5A00] text-white" : "bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white"}`}>
            {f.texto}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5 mt-3 mb-4">
        {[["Desde", desde, setDesde], ["Hasta", hasta, setHasta]].map(([l, v, set]) => (
          <label key={l} className="flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 min-h-[44px] focus-within:border-[#FF5A00]/60">
            <Calendar size={15} className="text-zinc-500 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">{l}</span>
            <input type="date" value={v} onChange={(e) => set(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-zinc-200 outline-none [color-scheme:dark]" />
          </label>
        ))}
      </div>

      {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm px-3 py-2 mb-3">{error}</div>}
      {!movs ? (
        <div className="py-16 text-center text-sm text-zinc-500">Cargando…</div>
      ) : movs.length === 0 ? (
        <div className="py-16 text-center">
          <History size={28} className="mx-auto text-zinc-700" />
          <div className="text-sm text-zinc-500 mt-3">No hay movimientos para este filtro.</div>
        </div>
      ) : (
        <div className="space-y-2">{movs.map((m) => <Fila key={m.id} m={m} u={u} />)}</div>
      )}
    </Drawer>
  );
}
