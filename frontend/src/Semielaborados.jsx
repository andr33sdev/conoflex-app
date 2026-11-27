// Semielaborados: tablero con stock por depósito, demanda y días de stock. El seguimiento contra la demanda
// se edita en la propia tabla (tildes + "Confirmar cambios"), sin abrir cada semielaborado.
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "framer-motion";
import { BellRing, Check, ChevronLeft, ChevronRight, FileDown, FileSpreadsheet, Loader2, PackageSearch, RefreshCw, Search, Truck, Undo2, X } from "lucide-react";
import { api, sinSemi } from "./produccion/util";
import { getApiUrl } from "./apiConfig";
import { useToast } from "./produccion/useToast";
import { Vacio } from "./produccion/ui";
import { nf, norm } from "./materias/util";
import CamionParaguay from "./semielaborados/CamionParaguay";
import FichaSemi from "./semielaborados/FichaSemi";
import InterruptorAlerta from "./componentes/InterruptorAlerta";
import SincronizarSemis from "./semielaborados/SincronizarSemis";
import Comprometido from "./deposito/Comprometido";
import ConfirmarBorrado from "./produccion/ConfirmarBorrado";

const EASE = [0.22, 1, 0.36, 1];
const PAGINA = 25;
const DEPOSITOS = [
  { v: "GENERAL", t: "Todos" },
  { v: "33", t: "33" },
  { v: "26", t: "26" },
  { v: "AYOLAS", t: "Ayolas" },
  { v: "37", t: "37" },
];
const ORDENES = [
  { v: "codigo", t: "Código" },
  { v: "nombre", t: "Nombre" },
  { v: "dias", t: "Menos días de stock primero" },
  { v: "demanda", t: "Más demanda primero" },
  { v: "stock_asc", t: "Menos stock primero" },
  { v: "stock_desc", t: "Más stock primero" },
];

const sigue = (x) => x.seguir_demanda !== 0;
const stockDe = (x, dep) =>
  dep === "33" ? Number(x.stock_33) || 0
  : dep === "26" ? Number(x.stock_26) || 0
  : dep === "AYOLAS" ? Number(x.stock_ayolas) || 0
  : dep === "37" ? Number(x.stock_37) || 0
  : (Number(x.stock_33) || 0) + (Number(x.stock_26) || 0) + (Number(x.stock_ayolas) || 0) + (Number(x.stock_37) || 0);

function Segmentado({ opciones, valor, onChange, etiqueta, id }) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="inline-flex p-1 rounded-xl bg-white/[0.05] border border-white/[0.07]">
      {opciones.map((o) => {
        const sel = valor === o.v;
        return (
          <button key={o.v} role="radio" aria-checked={sel} onClick={() => onChange(o.v)} className={`relative min-h-[38px] px-3 sm:px-3.5 rounded-lg text-[13px] font-bold cursor-pointer transition-colors ${sel ? "text-white" : "text-zinc-500 hover:text-zinc-200"}`}>
            {sel && <motion.span layoutId={id} className="absolute inset-0 rounded-lg bg-white/[0.11]" transition={{ duration: 0.3, ease: EASE }} />}
            <span className="relative">{o.t}</span>
          </button>
        );
      })}
    </div>
  );
}

/** "30 comprometido en el 33": abre de qué pedidos armados sale. */
function ChipComprometido({ n, onClick }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} title="Comprometido en pedidos armados sin despachar (33). Tocá para ver cuáles." className="mt-0.5 block ml-auto rounded-full border border-sky-400/30 bg-sky-400/[0.08] px-2 py-0.5 text-[11px] font-bold text-sky-200 hover:bg-sky-400/20 cursor-pointer whitespace-nowrap tabular-nums">
      {nf(n)} comprometido
    </button>
  );
}

function Dias({ d }) {
  if (d === null || d === undefined) return <span className="text-zinc-600">—</span>;
  const tono = d <= 5 ? "bg-rose-500/12 text-rose-300 border-rose-500/30" : d <= 15 ? "bg-[#FFD60A]/10 text-[#FFD60A] border-[#FFD60A]/30" : "bg-white/[0.04] text-zinc-300 border-white/[0.09]";
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold tabular-nums ${tono}`}>{d} {d === 1 ? "día" : "días"}</span>;
}

function Origen({ o }) {
  if (o === "PARAGUAY") return <span className="shrink-0 rounded-full border border-cyan-400/30 bg-cyan-400/[0.07] px-2 py-0.5 text-[11px] font-bold text-cyan-300">Paraguay</span>;
  if (o === "PROVEEDOR") return <span className="shrink-0 rounded-full border border-white/[0.12] bg-white/[0.04] px-2 py-0.5 text-[11px] font-bold text-zinc-300">Se compra</span>;
  return null;
}

/** Casilla de seguimiento: marca el valor que queda, con un puntito si todavía no se confirmó. */
function Tilde({ marcado, cambiado, onChange, etiqueta }) {
  return (
    <label onClick={(e) => e.stopPropagation()} className="relative inline-grid place-items-center w-11 h-11 cursor-pointer" title={etiqueta}>
      <input type="checkbox" checked={marcado} onChange={(e) => onChange(e.target.checked)} aria-label={etiqueta} className="peer sr-only" />
      <span className={`w-6 h-6 rounded-lg border-2 grid place-items-center transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#FF5A00] ${marcado ? "bg-[#FF5A00] border-[#FF5A00]" : "border-zinc-600 bg-transparent"}`}>
        {marcado && <Check size={15} strokeWidth={3.5} className="text-black" />}
      </span>
      {cambiado && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[#FFD60A] ring-2 ring-black" aria-hidden="true" />}
    </label>
  );
}

export default function Semielaborados({ usuarioActual } = {}) {
  const esAdmin = String(usuarioActual?.rol || "").toUpperCase() === "ADMIN";
  const { mostrar: toast, nodo: toastNodo } = useToast();
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [meses, setMeses] = useState(() => {
    try {
      return parseInt(localStorage.getItem("conoflex_meses_historial"), 10) || 3;
    } catch {
      return 3;
    }
  });

  const [busqueda, setBusqueda] = useState("");
  const [dep, setDep] = useState("GENERAL");
  const [filtro, setFiltro] = useState("todos");
  const [orden, setOrden] = useState("codigo");
  const [pag, setPag] = useState({ firma: "", n: 1 });

  const [fichaId, setFichaId] = useState(null);
  // Comprometido en pedidos armados sin despachar (módulo Depósito): { semielaborado_id: cantidad }.
  const [comprometido, setComprometido] = useState({});
  const [verComprometido, setVerComprometido] = useState(null);
  const [verCamion, setVerCamion] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [sheets, setSheets] = useState(null);
  const [sheetsKey, setSheetsKey] = useState(0);

  // Cambios de "seguir demanda" tildados en la tabla y todavía sin confirmar: { id: 0 | 1 }.
  const [pend, setPend] = useState({});
  const [guardando, setGuardando] = useState(false);
  // Borrado de un semielaborado: { item, impacto, borrando } mientras se confirma.
  const [borrar, setBorrar] = useState(null);
  const [exportando, setExportando] = useState("");
  // "completo" = todas las columnas; "simple" = solo código, semielaborado y demanda.
  const [modoExport, setModoExport] = useState("completo");

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const d = await api(`/api/semielaborados?meses=${meses}`);
      api("/api/deposito/comprometido").then(setComprometido).catch(() => {});
      setItems(Array.isArray(d) ? d : []);
      setErrorCarga("");
      return Array.isArray(d) ? d : [];
    } catch (e) {
      setErrorCarga(e.message);
      return null;
    } finally {
      setCargando(false);
    }
  }, [meses]);

  // Exporta la lista (ordenada por demanda, mayor a menor) a PDF o Excel, respetando el filtro activo.
  // El PDF lleva el logo oficial de Conoflex. El interceptor global agrega el token a la petición.
  const exportar = useCallback(
    async (formato) => {
      if (exportando) return;
      setExportando(formato);
      try {
        const res = await fetch(getApiUrl(`/api/semielaborados/export.${formato}?meses=${meses}&filtro=${filtro}&detalle=${modoExport}`));
        if (!res.ok) throw new Error("No se pudo generar la exportación.");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const stamp = new Date().toLocaleDateString("es-AR").replace(/\//g, "-");
        if (formato === "pdf") {
          window.open(url, "_blank");
        } else {
          const a = document.createElement("a");
          a.href = url;
          a.download = `Control de demanda ${stamp}.xlsx`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (e) {
        toast(e.message || "No se pudo exportar.", "error");
      } finally {
        setExportando("");
      }
    },
    [exportando, meses, filtro, modoExport, toast]
  );

  useEffect(() => {
    try {
      localStorage.setItem("conoflex_meses_historial", String(meses));
    } catch {
      /* sin almacenamiento */
    }
    // Carga de datos al abrir y al cambiar los meses de demanda.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar, meses]);

  const efectivo = useCallback((x) => (pend[x.id] !== undefined ? pend[x.id] === 1 : sigue(x)), [pend]);

  const cuentas = useMemo(() => {
    const c = { todos: items.length, sigue: 0, nosigue: 0, comprado: 0, paraguay: 0, bajo: 0 };
    for (const x of items) {
      if (sigue(x)) c.sigue++;
      else c.nosigue++;
      if (x.origen === "PROVEEDOR") c.comprado++;
      if (x.origen === "PARAGUAY") c.paraguay++;
      if (sigue(x) && x.dias_stock !== null && x.dias_stock <= 15) c.bajo++;
    }
    return c;
  }, [items]);

  const lista = useMemo(() => {
    const t = norm(busqueda);
    const r = items.filter((x) => {
      if (t && !norm(`${x.codigo} ${x.nombre}`).includes(t)) return false;
      if (filtro === "sigue") return sigue(x);
      if (filtro === "nosigue") return !sigue(x);
      if (filtro === "comprado") return x.origen === "PROVEEDOR";
      if (filtro === "paraguay") return x.origen === "PARAGUAY";
      if (filtro === "bajo") return sigue(x) && x.dias_stock !== null && x.dias_stock <= 15;
      return true;
    });
    const dias = (x) => (x.dias_stock === null || x.dias_stock === undefined ? 1e9 : x.dias_stock);
    const por = {
      codigo: (a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true }),
      nombre: (a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"),
      dias: (a, b) => dias(a) - dias(b),
      demanda: (a, b) => (Number(b.demanda_mensual) || 0) - (Number(a.demanda_mensual) || 0),
      stock_asc: (a, b) => stockDe(a, dep) - stockDe(b, dep),
      stock_desc: (a, b) => stockDe(b, dep) - stockDe(a, dep),
    }[orden];
    return [...r].sort(por);
  }, [items, busqueda, filtro, orden, dep]);

  const firma = `${busqueda}|${filtro}|${orden}|${dep}`;
  const paginas = Math.max(1, Math.ceil(lista.length / PAGINA));
  const pagina = Math.min(pag.firma === firma ? pag.n : 1, paginas);
  const visibles = lista.slice((pagina - 1) * PAGINA, pagina * PAGINA);
  const ficha = items.find((x) => x.id === fichaId) || null;

  // ---- seguimiento de demanda en la tabla ----
  const marcar = (x, valor) =>
    setPend((p) => {
      const n = { ...p };
      if ((valor ? 1 : 0) === (sigue(x) ? 1 : 0)) delete n[x.id];
      else n[x.id] = valor ? 1 : 0;
      return n;
    });
  const marcarVisibles = (valor) => visibles.forEach((x) => marcar(x, valor));
  const todosMarcados = visibles.length > 0 && visibles.every(efectivo);
  const nPend = Object.keys(pend).length;
  const aActivar = Object.values(pend).filter((v) => v === 1).length;
  const aDesactivar = nPend - aActivar;

  const confirmar = async () => {
    setGuardando(true);
    const cambios = Object.entries(pend);
    const res = await Promise.allSettled(cambios.map(([id, v]) => api(`/api/semielaborados/${id}/clasificacion`, { method: "PUT", body: { seguir_demanda: v } })));
    const fallos = cambios.filter((_, i) => res[i].status === "rejected");
    // Se vuelve a leer del servidor: lo que se ve es lo que quedó guardado.
    const fresco = await cargar(true);
    const quedaron = new Set(fallos.map(([id]) => id));
    setPend((p) => Object.fromEntries(Object.entries(p).filter(([id]) => quedaron.has(id))));
    setGuardando(false);
    const ok = cambios.length - fallos.length;
    let verificados = ok;
    if (fresco) {
      const porId = new Map(fresco.map((x) => [String(x.id), x]));
      verificados = cambios.filter(([id, v], i) => res[i].status === "fulfilled" && porId.get(id) && (sigue(porId.get(id)) ? 1 : 0) === v).length;
    }
    if (fallos.length === 0) toast(`${ok} ${ok === 1 ? "cambio guardado" : "cambios guardados"}${fresco && verificados === ok ? " y verificados en el servidor" : ""}`);
    else toast(`Se guardaron ${ok} de ${cambios.length}. ${fallos.length} no se pudieron guardar y siguen marcados.`, "error");
    if (fresco && verificados < ok) toast("Ojo: al volver a leer, algún cambio no figura guardado. Revisalo.", "error");
  };

  // ---- ficha: guarda al instante (clasificación puntual) ----
  const clasificar = async (item, cambios) => {
    try {
      await api(`/api/semielaborados/${item.id}/clasificacion`, { method: "PUT", body: cambios });
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, ...cambios } : x)));
      if (cambios.seguir_demanda !== undefined) setPend((p) => { const n = { ...p }; delete n[item.id]; return n; });
    } catch (e) {
      toast(e.message, "error");
    }
  };

  // Marcar / desmarcar producto caliente (reservado o con autorización previa para retirar). Solo admin.
  const marcarCaliente = async (item, { caliente, motivo }) => {
    try {
      const r = await api(`/api/semielaborados/${item.id}/caliente`, { method: "PUT", body: { caliente: caliente ? 1 : 0, motivo } });
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, caliente: r.caliente, caliente_motivo: r.motivo } : x)));
      toast(caliente ? "Marcado como producto caliente" : "Ya no es producto caliente");
    } catch (e) {
      toast(e.message, "error");
    }
  };

  // ---- borrar semielaborado ----
  const pedirBorrar = async (item) => {
    setBorrar({ item, impacto: null, borrando: false });
    try {
      const d = await api(`/api/semielaborados/${item.id}`, { method: "DELETE" });
      setBorrar((b) => (b && b.item.id === item.id ? { ...b, impacto: d } : b));
    } catch (e) {
      setBorrar(null);
      toast(e.message || "No se pudo preparar el borrado.", "error");
    }
  };
  const confirmarBorrar = async () => {
    if (!borrar) return;
    const { item } = borrar;
    setBorrar((b) => ({ ...b, borrando: true }));
    try {
      await api(`/api/semielaborados/${item.id}?forzar=1`, { method: "DELETE" });
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      setPend((p) => { const n = { ...p }; delete n[item.id]; return n; });
      setFichaId((f) => (f === item.id ? null : f));
      setBorrar(null);
      toast(`${item.codigo} eliminado`);
    } catch (e) {
      setBorrar((b) => (b ? { ...b, borrando: false } : b));
      toast(e.message || "No se pudo eliminar.", "error");
    }
  };

  // ---- planilla ----
  const sincronizar = async () => {
    setSincronizando(true);
    try {
      const d = await api("/api/semielaborados/previsualizar-sheets", { method: "POST", body: {} });
      setSheetsKey((k) => k + 1);
      setSheets(d);
    } catch (e) {
      toast(e.message || "No se pudo leer la planilla. No se cambió nada.", "error");
    } finally {
      setSincronizando(false);
    }
  };
  const aplicarSheets = async (cambios) => {
    setAplicando(true);
    try {
      const r = await api("/api/semielaborados/aplicar-sincronizacion", { method: "POST", body: cambios });
      toast(`Sincronizado: ${r.actualizados || 0} actualizados${r.creados ? `, ${r.creados} nuevos` : ""}${r.aviso ? `. ${r.aviso}` : ""}`);
      setSheets(null);
      await cargar(true);
    } catch (e) {
      toast(e.message || "No se pudo aplicar la sincronización.", "error");
    } finally {
      setAplicando(false);
    }
  };

  const PILDORAS = [
    { v: "todos", t: "Todos", n: cuentas.todos },
    { v: "bajo", t: "Poco stock", n: cuentas.bajo, alerta: true },
    { v: "sigue", t: "Con seguimiento", n: cuentas.sigue },
    { v: "nosigue", t: "Sin seguimiento", n: cuentas.nosigue },
    { v: "comprado", t: "Se compran", n: cuentas.comprado },
    { v: "paraguay", t: "Paraguay", n: cuentas.paraguay },
  ];
  const nombreDep = DEPOSITOS.find((d) => d.v === dep)?.t;
  const th = "px-3 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500";

  return (
    <MotionConfig reducedMotion="user">
      <div className="h-full overflow-y-auto custom-scrollbar bg-black text-zinc-200 relative selection:bg-[#FF5A00]/30">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(60%_100%_at_15%_0%,rgba(255,90,0,0.16),transparent_70%),radial-gradient(40%_80%_at_95%_0%,rgba(255,214,10,0.07),transparent_70%)]" />

        <div className="relative max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-9 pb-40 sm:pb-28">
          <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <div className="mr-auto min-w-0">
              <h1 className="text-[34px] sm:text-5xl font-extrabold tracking-tight text-white leading-none">Semi<span className="text-[#FF5A00]">elaborados</span></h1>
              <p className="mt-2.5 text-[15px] text-zinc-500">
                {cargando ? "Cargando…" : (<><b className="text-zinc-200 font-bold">{nf(items.length, 0)}</b> artículos{cuentas.bajo > 0 && <> · <button onClick={() => setFiltro("bajo")} className="font-bold text-[#ff8a4d] hover:underline cursor-pointer">{cuentas.bajo} con poco stock</button></>}</>)}
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button onClick={() => setVerCamion(true)} className="min-h-[46px] px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.09] text-sm font-bold text-zinc-100 inline-flex items-center gap-2 cursor-pointer transition-colors">
                <Truck size={16} /> <span className="hidden sm:inline">Camión Paraguay</span><span className="sm:hidden">Camión</span>
              </button>
              <button onClick={sincronizar} disabled={sincronizando} className="min-h-[46px] px-4 rounded-xl bg-[#FFD60A] text-black text-sm font-extrabold inline-flex items-center gap-2 hover:bg-white active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 shadow-[0_10px_30px_rgba(255,214,10,0.2)]">
                <RefreshCw size={16} className={sincronizando ? "animate-spin" : ""} /> Sincronizar
              </button>
            </div>
          </motion.header>

          {esAdmin && (
            <div className="mt-5">
              <InterruptorAlerta campo="alertasStockMinSemi" icono={BellRing} esAdmin={esAdmin} etiqueta="Alertas de stock mínimo" descripcion="Avisan cuando el Depósito 33 llega al mínimo de un semielaborado. Apagalas o prendelas todas desde acá." />
            </div>
          )}

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.08 }} className="mt-6 sm:sticky sm:top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 sm:bg-black/75 sm:backdrop-blur-xl sm:border-b border-white/[0.05]">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[220px]">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por código o nombre…" className="w-full min-h-[50px] rounded-2xl bg-white/[0.05] border border-white/[0.08] focus:border-[#FF5A00]/60 focus:bg-white/[0.07] pl-11 pr-12 text-[15px] text-white placeholder:text-zinc-600 outline-none transition-colors" />
                  {busqueda && <button onClick={() => setBusqueda("")} aria-label="Borrar búsqueda" className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] cursor-pointer"><X size={16} /></button>}
                </div>
                <div className="flex w-full sm:w-auto items-center gap-3 flex-wrap">
                  <LayoutGroup id="semi-dep">
                    <Segmentado id="dep-sel" etiqueta="Depósito" valor={dep} onChange={setDep} opciones={DEPOSITOS} />
                  </LayoutGroup>
                  <select value={meses} onChange={(e) => setMeses(Number(e.target.value))} aria-label="Meses para calcular la demanda" className="min-h-[46px] flex-1 sm:flex-none rounded-xl bg-white/[0.05] border border-white/[0.08] px-3 text-sm font-bold text-zinc-200 outline-none focus:border-[#FF5A00]/60 cursor-pointer">
                    {[1, 2, 3, 4, 5, 6].map((m) => <option key={m} value={m} className="bg-[#111]">Demanda de {m === 1 ? "1 mes" : `${m} meses`}</option>)}
                  </select>
                  <select value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Ordenar" className="min-h-[46px] flex-1 sm:flex-none rounded-xl bg-white/[0.05] border border-white/[0.08] px-3 text-sm font-bold text-zinc-200 outline-none focus:border-[#FF5A00]/60 cursor-pointer">
                    {ORDENES.map((o) => <option key={o.v} value={o.v} className="bg-[#111]">{o.t}</option>)}
                  </select>
                  <div className="flex items-center gap-2" role="group" aria-label="Exportar la lista">
                    <select
                      value={modoExport}
                      onChange={(e) => setModoExport(e.target.value)}
                      aria-label="Tipo de reporte al exportar"
                      title="Qué incluir en la exportación"
                      className="min-h-[46px] rounded-xl bg-white/[0.05] border border-white/[0.08] px-3 text-sm font-bold text-zinc-200 outline-none focus:border-[#FF5A00]/60 cursor-pointer"
                    >
                      <option value="completo" className="bg-[#111]">Reporte completo</option>
                      <option value="simple" className="bg-[#111]">Solo demanda</option>
                    </select>
                    <button
                      onClick={() => exportar("pdf")}
                      disabled={!!exportando || cargando || !lista.length}
                      title={modoExport === "simple" ? "Exportar a PDF (solo código, semielaborado y demanda)" : "Exportar a PDF (completo, con el logo de Conoflex)"}
                      className="min-h-[46px] inline-flex items-center gap-2 rounded-xl bg-white/[0.05] border border-white/[0.08] px-3.5 text-sm font-bold text-zinc-200 hover:bg-white/[0.09] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {exportando === "pdf" ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}PDF
                    </button>
                    <button
                      onClick={() => exportar("xlsx")}
                      disabled={!!exportando || cargando || !lista.length}
                      title={modoExport === "simple" ? "Exportar a Excel (solo código, semielaborado y demanda)" : "Exportar a Excel (completo)"}
                      className="min-h-[46px] inline-flex items-center gap-2 rounded-xl bg-white/[0.05] border border-white/[0.08] px-3.5 text-sm font-bold text-zinc-200 hover:bg-white/[0.09] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {exportando === "xlsx" ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}Excel
                    </button>
                  </div>
                </div>
              </div>
              <LayoutGroup id="semi-pildoras">
                <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1" role="tablist" aria-label="Filtro">
                  {PILDORAS.map((p) => {
                    const sel = filtro === p.v;
                    return (
                      <button key={p.v} role="tab" aria-selected={sel} onClick={() => setFiltro(p.v)} className={`relative shrink-0 min-h-[40px] px-4 rounded-full text-sm font-bold cursor-pointer border transition-colors ${sel ? "border-transparent text-black" : "border-white/[0.09] text-zinc-400 hover:text-white bg-white/[0.03]"}`}>
                        {sel && <motion.span layoutId="semi-pildora-fondo" className={`absolute inset-0 rounded-full ${p.alerta ? "bg-[#FF5A00]" : "bg-[#FFD60A]"}`} transition={{ duration: 0.35, ease: EASE }} />}
                        <span className="relative inline-flex items-center gap-2">{p.t}<span className={`tabular-nums text-xs ${sel ? "text-black/70" : "text-zinc-600"}`}>{p.n}</span></span>
                      </button>
                    );
                  })}
                </div>
              </LayoutGroup>
            </div>
          </motion.div>

          <div className="mt-6">
            {errorCarga && !items.length ? (
              <Vacio icono={PackageSearch} titulo="No se pudieron cargar los artículos" texto={errorCarga}>
                <button onClick={() => cargar()} className="min-h-[46px] px-5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] font-bold text-white cursor-pointer">Reintentar</button>
              </Vacio>
            ) : cargando ? (
              <div className="flex flex-col gap-2" aria-busy="true">
                {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-[60px] rounded-2xl bg-white/[0.04] animate-pulse" style={{ animationDelay: `${i * 70}ms` }} />)}
              </div>
            ) : lista.length === 0 ? (
              <Vacio icono={PackageSearch} titulo="No hay artículos para mostrar" texto="Probá con otra búsqueda o con otro filtro.">
                {(busqueda || filtro !== "todos") && <button onClick={() => { setBusqueda(""); setFiltro("todos"); }} className="min-h-[46px] px-5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] font-bold text-white cursor-pointer">Ver todos</button>}
              </Vacio>
            ) : (
              <>
                {/* Escritorio: tabla */}
                <div className="hidden md:block rounded-3xl border border-white/[0.07] bg-[#0c0c0f]/70 overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/[0.02] border-b border-white/[0.05]">
                        <th className={`${th} w-[160px]`}>Código</th>
                        <th className={th}>Artículo</th>
                        <th className={`${th} text-right`}>Demanda</th>
                        <th className={`${th} text-center`}>Días de stock</th>
                        <th className={`${th} text-right`}>Stock {dep === "GENERAL" ? "" : nombreDep}</th>
                        <th className={`${th} text-center w-[170px]`}>
                          <label className="inline-flex items-center gap-1.5 cursor-pointer select-none" title="Tildar o destildar todos los de esta página">
                            <input type="checkbox" checked={todosMarcados} onChange={(e) => marcarVisibles(e.target.checked)} aria-label="Seguir demanda en todos los de esta página" className="w-4 h-4 accent-[#FF5A00] cursor-pointer" />
                            Seguir demanda
                          </label>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map((x) => {
                        const st = stockDe(x, dep);
                        const marcado = efectivo(x);
                        const cambiado = pend[x.id] !== undefined;
                        return (
                          <tr key={x.id} onClick={() => setFichaId(x.id)} className={`border-t border-white/[0.04] cursor-pointer transition-colors hover:bg-white/[0.035] ${cambiado ? "bg-[#FFD60A]/[0.04]" : ""}`}>
                            <td className="px-4 py-3.5"><span className="font-mono text-[13px] font-semibold tracking-tight text-[#FFD60A]/90">{x.codigo}</span></td>
                            <td className="px-4 py-3.5">
                              <span className="flex items-center gap-2 min-w-0">
                                <span className={`text-[15px] font-semibold truncate ${marcado ? "text-zinc-100" : "text-zinc-500"}`}>{sinSemi(x.nombre)}</span>
                                <Origen o={x.origen} />
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right text-sm tabular-nums text-zinc-400">{x.demanda_mensual ? `${nf(x.demanda_mensual, 0)} u.` : "—"}</td>
                            <td className="px-4 py-3.5 text-center">{marcado ? <Dias d={x.dias_stock} /> : <span className="text-zinc-600 text-xs">sin seguimiento</span>}</td>
                            <td className={`px-4 py-3.5 text-right text-base font-extrabold tabular-nums ${st <= 0 ? "text-rose-300" : "text-zinc-50"}`}>
                              {nf(st)}
                              {comprometido[x.id] > 0 && (dep === "33" || dep === "GENERAL") && <ChipComprometido n={comprometido[x.id]} onClick={() => setVerComprometido(x)} />}
                            </td>
                            <td className="px-4 py-3.5 text-center"><Tilde marcado={marcado} cambiado={cambiado} onChange={(v) => marcar(x, v)} etiqueta={`Seguir demanda de ${x.codigo}`} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Celular: tarjetas */}
                <div className="md:hidden flex flex-col gap-3">
                  {visibles.map((x) => {
                    const st = stockDe(x, dep);
                    const marcado = efectivo(x);
                    const cambiado = pend[x.id] !== undefined;
                    return (
                      <div key={x.id} onClick={() => setFichaId(x.id)} className={`rounded-2xl border p-4 cursor-pointer active:scale-[0.99] transition-transform ${cambiado ? "border-[#FFD60A]/40 bg-[#FFD60A]/[0.05]" : "border-white/[0.08] bg-[#0d0d10]"}`}>
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-xs font-bold text-[#FFD60A]">{x.codigo}</span><Origen o={x.origen} /></div>
                            <p className={`mt-1 text-[15px] font-bold leading-snug ${marcado ? "text-white" : "text-zinc-400"}`}>{sinSemi(x.nombre)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`block text-2xl font-extrabold tabular-nums leading-none ${st <= 0 ? "text-rose-300" : "text-white"}`}>{nf(st)}</span>
                            <span className="text-[11px] text-zinc-500">stock {dep === "GENERAL" ? "total" : nombreDep}</span>
                            {comprometido[x.id] > 0 && (dep === "33" || dep === "GENERAL") && <ChipComprometido n={comprometido[x.id]} onClick={() => setVerComprometido(x)} />}
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between gap-3">
                          <div className="text-xs text-zinc-500">{x.demanda_mensual ? `Demanda ${nf(x.demanda_mensual, 0)} u.` : "Sin demanda"}{marcado && x.dias_stock !== null && <span className="ml-2"><Dias d={x.dias_stock} /></span>}</div>
                          <label onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs font-bold text-zinc-300 cursor-pointer">
                            Seguir demanda
                            <Tilde marcado={marcado} cambiado={cambiado} onChange={(v) => marcar(x, v)} etiqueta={`Seguir demanda de ${x.codigo}`} />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {lista.length > PAGINA && (
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <p className="text-sm text-zinc-500 tabular-nums">{(pagina - 1) * PAGINA + 1}–{Math.min(lista.length, pagina * PAGINA)} de {lista.length}</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setPag({ firma, n: pagina - 1 })} disabled={pagina <= 1} aria-label="Página anterior" className="w-11 h-11 grid place-items-center rounded-xl border border-white/[0.09] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.1] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"><ChevronLeft size={18} /></button>
                      <span className="text-sm font-bold text-zinc-300 tabular-nums px-1">{pagina} / {paginas}</span>
                      <button onClick={() => setPag({ firma, n: pagina + 1 })} disabled={pagina >= paginas} aria-label="Página siguiente" className="w-11 h-11 grid place-items-center rounded-xl border border-white/[0.09] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.1] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"><ChevronRight size={18} /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Barra de confirmación de los cambios de seguimiento */}
        <AnimatePresence>
          {nPend > 0 && (
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} role="region" aria-label="Cambios sin confirmar" className="fixed bottom-20 sm:bottom-4 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-40 rounded-2xl border border-[#FFD60A]/35 bg-[#16140a]/95 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.7)] px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-3 sm:min-w-[520px]">
              <div className="mr-auto">
                <p className="text-sm font-extrabold text-white">{nPend} {nPend === 1 ? "cambio sin confirmar" : "cambios sin confirmar"}</p>
                <p className="text-xs text-zinc-400">{aActivar > 0 && `${aActivar} pasan a seguirse`}{aActivar > 0 && aDesactivar > 0 && " · "}{aDesactivar > 0 && `${aDesactivar} dejan de seguirse`}</p>
              </div>
              <button onClick={() => setPend({})} disabled={guardando} className="min-h-[44px] px-4 rounded-xl border border-white/[0.12] text-sm font-bold text-zinc-300 hover:bg-white/[0.07] inline-flex items-center gap-2 cursor-pointer disabled:opacity-40"><Undo2 size={15} /> Descartar</button>
              <button onClick={confirmar} disabled={guardando} className="min-h-[44px] px-5 rounded-xl bg-[#FFD60A] text-black text-sm font-extrabold inline-flex items-center gap-2 hover:bg-white cursor-pointer disabled:opacity-60">
                {guardando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />} Confirmar cambios
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {toastNodo}
        <Comprometido key={verComprometido?.id || "nada"} semi={verComprometido} onCerrar={() => setVerComprometido(null)} />
        <FichaSemi item={ficha} comprometido={ficha ? comprometido[ficha.id] || 0 : 0} onVerComprometido={() => setVerComprometido(ficha)} seguir={ficha ? efectivo(ficha) : false} onCerrar={() => setFichaId(null)} onClasificar={clasificar} onCambio={() => cargar(true)} onEliminar={pedirBorrar} esAdmin={esAdmin} onCaliente={marcarCaliente} />
        <ConfirmarBorrado
          abierto={!!borrar}
          titulo={borrar ? `¿Eliminar ${borrar.item.codigo}?` : ""}
          mensaje={borrar ? `Se elimina “${sinSemi(borrar.item.nombre)}”. Esta acción no se puede deshacer.` : ""}
          lineas={borrar?.impacto ? [
            ...(borrar.impacto.recetas_usan > 0 ? [`Se quita de ${borrar.impacto.recetas_usan} ${borrar.impacto.recetas_usan === 1 ? "receta que lo usa" : "recetas que lo usan"} como ingrediente.`] : []),
            ...(borrar.impacto.recetas_propias > 0 ? [`Se borran sus ${borrar.impacto.recetas_propias} ${borrar.impacto.recetas_propias === 1 ? "receta propia" : "recetas propias"}.`] : []),
            ...(!borrar.impacto.recetas_usan && !borrar.impacto.recetas_propias ? ["No está en ninguna receta."] : []),
          ] : (borrar ? ["Calculando impacto…"] : [])}
          borrando={borrar?.borrando}
          onConfirmar={confirmarBorrar}
          onCancelar={() => setBorrar(null)}
          textoConfirmar="Eliminar"
        />
        {verCamion && <CamionParaguay onClose={() => setVerCamion(false)} />}
        {sheets && <SincronizarSemis key={sheetsKey} datos={sheets} aplicando={aplicando} onCerrar={() => setSheets(null)} onAplicar={aplicarSheets} />}
      </div>
    </MotionConfig>
  );
}
