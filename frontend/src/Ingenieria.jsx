// Ingenierías: las recetas de cada semielaborado (fórmula por tachada) y la lista de materiales de cada producto terminado.
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, BellRing, ChevronRight, DownloadCloud, FlaskConical, Layers, Loader2, RefreshCw, Search, ShieldAlert, X } from "lucide-react";
import { api } from "./produccion/util";
import { useToast } from "./produccion/useToast";
import Confirmacion from "./ingenieria/Confirmacion";
import EditorReceta from "./ingenieria/EditorReceta";
import LibroRecetas from "./ingenieria/LibroRecetas";
import { fechaCorta, kgLindo, norm } from "./ingenieria/formato";

const suave = [0.2, 0.8, 0.2, 1];
const PASO = 40;
const FILTROS = [
  { id: "todos", label: "Todos" },
  { id: "con", label: "Con receta" },
  { id: "sin", label: "Sin receta" },
  { id: "avisos", label: "Con aviso" },
];
const ORDENES = [
  { id: "codigo", label: "Código" },
  { id: "nombre", label: "Nombre" },
  { id: "recetas", label: "Más recetas" },
  { id: "reciente", label: "Modificadas hace poco" },
];
const PROCESOS = { INYECCION: "Inyección", ROTOMOLDEO: "Rotomoldeo", EXTRUSION: "Extrusión" };
const natural = (a, b) => String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" });

const Dato = ({ icono: Icono, t, v, tono = "text-white", className = "" }) => (
  <div className={`rounded-2xl border border-white/[0.07] bg-[#111114] px-4 py-3 ${className}`}>
    <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-zinc-500 flex items-center gap-1.5">{Icono && <Icono size={13} />}{t}</p>
    <p className={`mt-1 text-2xl font-extrabold tabular-nums ${tono}`}>{v}</p>
  </div>
);

function Estado({ r }) {
  if (!r?.ingenieria_id) return <span className="inline-flex items-center rounded-full border border-white/[0.1] px-2.5 py-1 text-xs font-bold text-zinc-500">Sin receta activa</span>;
  return (
    <div className="min-w-0">
      <p className="text-sm font-bold text-white truncate">{r.version}</p>
      <p className="text-xs text-zinc-500 truncate">
        {r.proceso && <span className="text-[#FFD60A] font-bold">{PROCESOS[r.proceso]} · </span>}
        {r.con_formula ? <span className="text-emerald-300 font-bold">Fórmula</span> : <span>Por pieza</span>}
        {r.peso_pieza_kg ? <> · pieza {kgLindo(r.peso_pieza_kg)}</> : null}
      </p>
    </div>
  );
}

function Ultima({ r }) {
  if (!r?.ingenieria_id || !r.actualizado_at) return <span className="text-xs text-zinc-600">—</span>;
  return (
    <p className="text-xs text-zinc-400 leading-snug">
      <b className="text-zinc-300">{r.actualizado_por || "—"}</b>
      <span className="block text-zinc-500">{fechaCorta(r.actualizado_at)}</span>
    </p>
  );
}

export default function Ingenieria({ usuarioActual }) {
  const admin = String(usuarioActual?.rol || "").toUpperCase() === "ADMIN";
  const [tab, setTab] = useState("SE");
  const [listas, setListas] = useState({ SE: null, PT: null });
  const [resumen, setResumen] = useState({ SE: {}, PT: {} });
  const [materias, setMaterias] = useState([]);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [orden, setOrden] = useState("codigo");
  const [limite, setLimite] = useState(PASO);
  const [parent, setParent] = useState(null);
  const [libroAbierto, setLibroAbierto] = useState(false);
  const [version, setVersion] = useState(0);
  const [editor, setEditor] = useState({ k: 0, receta: null, cantidad: 0 });
  const [editorAbierto, setEditorAbierto] = useState(false);
  const [conf, setConf] = useState(null);
  const [alertaPendiente, setAlertaPendiente] = useState(() => new URLSearchParams(window.location.search).get("alerta"));
  const { mostrar: toast, nodo: toastNodo } = useToast();

  // Catálogos + resumen de recetas activas (se recarga con el botón o al guardar cambios).
  useEffect(() => {
    let vivo = true;
    queueMicrotask(() => vivo && setCargando(true));
    Promise.all([
      api("/api/semielaborados"),
      api("/api/productos-terminados"),
      api("/api/materias-primas"),
      api("/api/ingenierias/resumen?parent_type=SE").catch(() => ({})),
      api("/api/ingenierias/resumen?parent_type=PT").catch(() => ({})),
    ])
      .then(([se, pt, mp, rse, rpt]) => {
        if (!vivo) return;
        setListas({ SE: se, PT: pt });
        setMaterias(mp);
        setResumen({ SE: rse, PT: rpt });
        setError("");
      })
      .catch((e) => vivo && setError(e.message))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [tick]);

  // Entrada desde la campanita: /ingenieria?alerta=ID abre el producto con el aviso.
  useEffect(() => {
    const alCambiar = () => setAlertaPendiente(new URLSearchParams(window.location.search).get("alerta"));
    window.addEventListener("popstate", alCambiar);
    return () => window.removeEventListener("popstate", alCambiar);
  }, []);
  useEffect(() => {
    if (!alertaPendiente || !listas.SE) return undefined;
    let vivo = true;
    api("/api/ingenierias/alertas?estado=todas")
      .then((todas) => {
        if (!vivo) return;
        window.history.replaceState({}, document.title, "/ingenieria");
        setAlertaPendiente(null);
        const a = todas.find((x) => String(x.id) === String(alertaPendiente));
        const se = a && listas.SE.find((x) => x.id === a.semielaborado_id);
        if (!se) {
          toast("No encontré ese aviso. Puede que ya se haya resuelto.", "error");
          return;
        }
        setTab("SE");
        setParent({ ...se, type: "SE" });
        setLibroAbierto(true);
      })
      .catch(() => vivo && setAlertaPendiente(null));
    return () => {
      vivo = false;
    };
  }, [alertaPendiente, listas.SE, toast]);

  const lista = listas[tab];
  const res = resumen[tab];

  const visibles = useMemo(() => {
    if (!lista) return [];
    const t = norm(q).trim();
    let r = lista.filter((x) => {
      if (t && !norm(`${x.codigo} ${x.nombre}`).includes(t)) return false;
      const tiene = !!res[x.id]?.ingenieria_id || Number(x.recetas_count) > 0;
      if (filtro === "con") return tiene;
      if (filtro === "sin") return !tiene;
      if (filtro === "avisos") return (res[x.id]?.alertas || 0) > 0;
      return true;
    });
    r = [...r].sort((a, b) => {
      if (orden === "nombre") return natural(a.nombre, b.nombre);
      if (orden === "recetas") return (Number(b.recetas_count) || 0) - (Number(a.recetas_count) || 0) || natural(a.codigo, b.codigo);
      if (orden === "reciente") return new Date(res[b.id]?.actualizado_at || 0) - new Date(res[a.id]?.actualizado_at || 0) || natural(a.codigo, b.codigo);
      return natural(a.codigo, b.codigo);
    });
    return r;
  }, [lista, q, filtro, orden, res]);

  const conteo = useMemo(() => {
    const l = lista || [];
    const con = l.filter((x) => !!res[x.id]?.ingenieria_id || Number(x.recetas_count) > 0).length;
    return { total: l.length, con, sin: l.length - con, avisos: Object.values(res).reduce((a, r) => a + (r.alertas || 0), 0) };
  }, [lista, res]);

  const abrir = (x) => {
    setParent({ ...x, type: tab });
    setLibroAbierto(true);
  };
  const abrirEditor = (receta, cantidad) => {
    setEditor((e) => ({ k: e.k + 1, receta, cantidad }));
    setEditorAbierto(true);
  };
  const avisar = useCallback((texto, detalle) => {
    setConf({ texto, detalle });
    setTimeout(() => setConf(null), 1700);
    setTick((t) => t + 1);
  }, []);

  const sincronizarVentas = async () => {
    setSincronizando(true);
    try {
      const r = await api("/api/productos-terminados/sincronizar-ventas", { method: "POST" });
      toast(`Sincronización exitosa: ${r.count} modelos de productos terminados.`);
      setTick((t) => t + 1);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSincronizando(false);
    }
  };

  const cambiarTab = (t) => {
    setTab(t);
    setFiltro("todos");
    setLimite(PASO);
  };
  const mostrados = visibles.slice(0, limite);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 pb-28 lg:pb-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div className="flex items-stretch gap-3">
            <span aria-hidden className="block w-[3px] rounded-full shrink-0" style={{ backgroundImage: "repeating-linear-gradient(to bottom,#FFD60A 0 7px,transparent 7px 12px)" }} />
            <div>
              <h1 className="cf-h1-largo text-2xl sm:text-3xl font-extrabold uppercase text-white">Ingenierías</h1>
              <p className="mt-1 text-sm text-zinc-400">Recetas por tachada de cada semielaborado y materiales de cada producto.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {tab === "PT" && (
              <button onClick={sincronizarVentas} disabled={sincronizando} className="min-h-[46px] px-4 rounded-2xl bg-[#FFD60A] text-black text-sm font-extrabold inline-flex items-center gap-2 hover:bg-white disabled:opacity-60 cursor-pointer">
                {sincronizando ? <Loader2 size={16} className="animate-spin" /> : <DownloadCloud size={16} />} Sincronizar ventas
              </button>
            )}
            <button onClick={() => setTick((t) => t + 1)} aria-label="Recargar catálogo" title="Recargar catálogo" className="w-[46px] h-[46px] grid place-items-center rounded-2xl border border-white/[0.1] bg-white/[0.04] text-zinc-300 hover:text-white hover:bg-white/[0.09] cursor-pointer">
              <RefreshCw size={17} className={cargando ? "animate-spin text-[#FF5A00]" : ""} />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Dato icono={Layers} t={tab === "SE" ? "Semielaborados" : "Productos"} v={conteo.total} />
          <Dato icono={FlaskConical} t="Con receta" v={conteo.con} tono="text-emerald-300" />
          <Dato icono={ShieldAlert} t="Sin receta" v={conteo.sin} tono={conteo.sin ? "text-[#FFD60A]" : "text-white"} />
          <Dato icono={BellRing} t="Avisos abiertos" v={conteo.avisos} tono={conteo.avisos ? "text-[#FF5A00]" : "text-white"} />
        </div>

        <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 mb-4 bg-[#09090b]/90 backdrop-blur-md border-b border-white/[0.05]">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="inline-flex rounded-2xl border border-white/[0.1] bg-white/[0.04] p-1 shrink-0 self-start" role="tablist" aria-label="Tipo de producto">
              {[["SE", "Semielaborados", listas.SE?.length], ["PT", "Terminados", listas.PT?.length]].map(([id, label, n]) => (
                <button key={id} role="tab" aria-selected={tab === id} onClick={() => cambiarTab(id)} className={`min-h-[42px] px-4 rounded-xl text-sm font-bold cursor-pointer transition-colors whitespace-nowrap ${tab === id ? "bg-[#FF5A00] text-black" : "text-zinc-400 hover:text-white"}`}>
                  {label}{n != null ? ` (${n})` : ""}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-0">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setLimite(PASO); }} placeholder="Buscar por código o nombre…" aria-label="Buscar" className="w-full min-h-[48px] rounded-2xl bg-[#17171c] border border-white/[0.1] pl-11 pr-11 text-base text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF5A00]/70" />
              {q && <button onClick={() => setQ("")} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-lg text-zinc-500 hover:text-white cursor-pointer"><X size={16} /></button>}
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5 flex-1 min-w-0" role="tablist" aria-label="Filtrar">
              {FILTROS.filter((f) => f.id !== "avisos" || tab === "SE").map((f) => (
                <button key={f.id} role="tab" aria-selected={filtro === f.id} onClick={() => { setFiltro(f.id); setLimite(PASO); }} className={`shrink-0 min-h-[38px] px-4 rounded-full text-sm font-bold border transition-colors cursor-pointer ${filtro === f.id ? "bg-[#FF5A00] border-[#FF5A00] text-black" : "bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:bg-white/[0.09]"}`}>{f.label}</button>
              ))}
            </div>
            <select value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Ordenar" className="shrink-0 min-h-[38px] rounded-full bg-white/[0.04] border border-white/[0.08] px-3 text-sm font-bold text-zinc-300 focus:outline-none cursor-pointer">
              {ORDENES.map((o) => <option key={o.id} value={o.id} className="bg-[#111114]">{o.label}</option>)}
            </select>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-100 flex items-start gap-3">
            <AlertTriangle className="shrink-0 mt-0.5" size={20} />
            <div><b>No se pudo cargar.</b><p className="text-sm mt-1">{error}</p><button onClick={() => setTick((t) => t + 1)} className="mt-3 min-h-[44px] px-4 rounded-xl bg-white/10 font-bold cursor-pointer">Reintentar</button></div>
          </div>
        ) : !lista ? (
          <div className="flex flex-col gap-2.5" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[68px] rounded-2xl bg-white/[0.04] animate-pulse" />)}
          </div>
        ) : visibles.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/[0.12] bg-white/[0.02] px-6 py-14 text-center">
            <span className="mx-auto w-16 h-16 rounded-full bg-white/[0.05] grid place-items-center text-zinc-500"><Search size={26} /></span>
            <p className="mt-4 text-lg font-extrabold text-white">No encontré nada</p>
            <p className="mt-1 text-sm text-zinc-500">Probá con otra búsqueda o cambiá el filtro.</p>
            <button onClick={() => { setQ(""); setFiltro("todos"); }} className="mt-4 min-h-[44px] px-5 rounded-xl bg-white/[0.08] text-sm font-bold text-white cursor-pointer">Ver todos</button>
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-500 mb-3 px-1">{visibles.length === lista.length ? `${lista.length} ${lista.length === 1 ? "producto" : "productos"}` : `${visibles.length} de ${lista.length} productos`}</p>

            <div className="hidden md:block rounded-3xl border border-white/[0.08] bg-[#0f0f12] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
              <div className="grid grid-cols-[150px_minmax(0,1fr)_minmax(0,220px)_160px_40px] gap-x-4 px-5 py-3 bg-[#141418] border-b border-white/[0.07] text-[11px] font-extrabold uppercase tracking-[0.1em] text-zinc-400">
                <span>Código</span><span>Artículo</span><span>Receta activa</span><span>Última modificación</span><span />
              </div>
              {mostrados.map((x, i) => {
                const r = res[x.id];
                return (
                  <motion.button key={x.id} initial={i < 14 ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: i < 14 ? i * 0.02 : 0, ease: suave }} onClick={() => abrir(x)} className="w-full text-left grid grid-cols-[150px_minmax(0,1fr)_minmax(0,220px)_160px_40px] gap-x-4 items-center px-5 py-3.5 border-b border-white/[0.05] last:border-b-0 hover:bg-white/[0.04] transition-colors cursor-pointer group">
                    <span className="inline-flex"><span className="rounded-lg border border-[#FF5A00]/25 bg-[#FF5A00]/10 px-2.5 py-1 text-xs font-extrabold text-[#ff9a63] truncate max-w-full group-hover:bg-[#FF5A00] group-hover:text-black transition-colors">{x.codigo}</span></span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-bold text-white truncate">{x.nombre}</span>
                      <span className="block text-xs text-zinc-500">{Number(x.recetas_count) || 0} {Number(x.recetas_count) === 1 ? "versión" : "versiones"}{r?.alertas ? <b className="ml-2 inline-flex items-center gap-1 text-[#FFD60A]"><BellRing size={11} /> {r.alertas} {r.alertas === 1 ? "aviso" : "avisos"}</b> : null}</span>
                    </span>
                    <Estado r={r} />
                    <Ultima r={r} />
                    <ChevronRight size={18} className="text-zinc-600 group-hover:text-white transition-colors" />
                  </motion.button>
                );
              })}
            </div>

            <ul className="md:hidden flex flex-col gap-3">
              {mostrados.map((x, i) => {
                const r = res[x.id];
                return (
                  <motion.li key={x.id} initial={i < 8 ? { opacity: 0, y: 14 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i < 8 ? i * 0.04 : 0, ease: suave }}>
                    <button onClick={() => abrir(x)} className="w-full text-left rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#141418] to-[#111114] p-4 active:scale-[0.99] transition-transform cursor-pointer">
                      <div className="flex items-start gap-3">
                        <span className="rounded-lg border border-[#FF5A00]/25 bg-[#FF5A00]/10 px-2.5 py-1 text-xs font-extrabold text-[#ff9a63] shrink-0">{x.codigo}</span>
                        <span className="min-w-0 flex-1 text-[16px] font-extrabold text-white leading-snug break-words">{x.nombre}</span>
                        <ChevronRight size={18} className="text-zinc-600 shrink-0 mt-0.5" />
                      </div>
                      <div className="mt-3 flex items-end justify-between gap-3">
                        <Estado r={r} />
                        <Ultima r={r} />
                      </div>
                      {r?.alertas ? <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#FFD60A]/40 bg-[#FFD60A]/10 px-3 py-1 text-xs font-extrabold text-[#FFD60A]"><BellRing size={12} /> {r.alertas} {r.alertas === 1 ? "aviso de producción" : "avisos de producción"}</p> : null}
                    </button>
                  </motion.li>
                );
              })}
            </ul>

            {visibles.length > mostrados.length && (
              <div className="mt-5 text-center">
                <button onClick={() => setLimite((l) => l + PASO)} className="min-h-[50px] px-6 rounded-2xl bg-white/[0.07] border border-white/[0.1] text-base font-bold text-white hover:bg-white/[0.12] cursor-pointer">Mostrar {Math.min(PASO, visibles.length - mostrados.length)} más <span className="text-zinc-500">({visibles.length - mostrados.length} restantes)</span></button>
              </div>
            )}
          </>
        )}
      </div>

      <LibroRecetas parent={parent} abierto={libroAbierto} onCerrar={() => setLibroAbierto(false)} onCambio={avisar} onNueva={(n) => abrirEditor(null, n)} onEditar={abrirEditor} version={version} admin={admin} toast={toast} />
      <EditorReceta
        abierto={editorAbierto}
        clave={editor.k}
        parent={parent}
        receta={editor.receta}
        cantidadRecetas={editor.cantidad ?? 0}
        materias={materias}
        semis={listas.SE || []}
        procesoSugerido={parent?.type === "SE" ? resumen.SE?.[parent.id]?.proceso : undefined}
        onCerrar={() => setEditorAbierto(false)}
        onGuardado={(nueva, nombre) => {
          setEditorAbierto(false);
          setVersion((v) => v + 1);
          avisar(nueva ? "¡Receta creada!" : "¡Cambios guardados!", `“${nombre}”`);
        }}
        toast={toast}
      />
      <Confirmacion texto={conf?.texto} detalle={conf?.detalle} />
      {toastNodo}
    </div>
  );
}
