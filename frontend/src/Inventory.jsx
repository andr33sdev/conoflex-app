// Materias primas: un tablero de tarjetas con el estado de cada insumo, ficha lateral con el detalle,
// alta/edición con proveedor y sincronización con Google Sheets.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "framer-motion";
import { LayoutGrid, List, PackageSearch, Plus, RefreshCw, Search, X } from "lucide-react";
import { api } from "./produccion/util";
import { useToast } from "./produccion/useToast";
import { Vacio } from "./produccion/ui";
import HistorialMateriaPrima from "./inventario/HistorialMateriaPrima";
import TarjetaMP from "./materias/TarjetaMP";
import FichaMP from "./materias/FichaMP";
import FormularioMP from "./materias/FormularioMP";
import SincronizarSheets from "./materias/SincronizarSheets";
import { estadoDe, nf, norm } from "./materias/util";

const EASE = [0.22, 1, 0.36, 1];
const PAGINA = 48;

const ORDENES = [
  { v: "codigo", t: "Código" },
  { v: "nombre", t: "Nombre" },
  { v: "urgencia", t: "Más urgentes primero" },
  { v: "stock_asc", t: "Menos stock primero" },
  { v: "stock_desc", t: "Más stock primero" },
];

const leerVista = () => {
  try {
    return localStorage.getItem("cf_mp_vista") === "lista" ? "lista" : "tarjetas";
  } catch {
    return "tarjetas";
  }
};

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

export default function Inventory() {
  const esAdmin = (() => {
    try {
      return String(JSON.parse(localStorage.getItem("usuario_conoflex") || "{}").rol || "").toUpperCase() === "ADMIN";
    } catch {
      return false;
    }
  })();
  const { mostrar: toast, nodo: toastNodo } = useToast();

  const [items, setItems] = useState([]);
  const [recetas, setRecetas] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [plan, setPlan] = useState(new Map());
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [planta, setPlanta] = useState("todas");
  const [orden, setOrden] = useState("codigo");
  const [vista, setVista] = useState(leerVista);
  const [mas, setMas] = useState({ firma: "", n: PAGINA });

  const [ficha, setFicha] = useState(null); // id de la materia prima abierta
  const [form, setForm] = useState(null); // { modo: "nuevo" | "editar", id? }
  const [formKey, setFormKey] = useState(0);
  const abrirForm = (f) => {
    setFormKey((k) => k + 1);
    setForm(f);
  };
  const [historial, setHistorial] = useState(null); // "historial" | "demanda"
  const [sheets, setSheets] = useState(null);
  const [sheetsKey, setSheetsKey] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const buscador = useRef(null);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const [mp, rec, prov, pl] = await Promise.all([
        api("/api/materias-primas"),
        api("/api/ingenierias/recetas-activas-bulk").catch(() => []),
        api("/api/proveedores").catch(() => []),
        api("/api/materias-primas/plan-semana").catch(() => null),
      ]);
      setItems(Array.isArray(mp) ? mp : []);
      setRecetas(Array.isArray(rec) ? rec : []);
      setProveedores(Array.isArray(prov) ? prov : []);
      setPlan(new Map((pl?.materias || []).map((m) => [m.id, m])));
      setErrorCarga("");
    } catch (e) {
      setErrorCarga(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    // Carga inicial de datos: el estado se actualiza al llegar la respuesta.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar(true);
  }, [cargar]);

  // "/" salta al buscador, como en los buscadores de siempre.
  useEffect(() => {
    const h = (e) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
      e.preventDefault();
      buscador.current?.focus();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const cambiarVista = (v) => {
    setVista(v);
    try {
      localStorage.setItem("cf_mp_vista", v);
    } catch {
      /* sin almacenamiento */
    }
  };

  const provPorId = useMemo(() => new Map(proveedores.map((p) => [p.id, p])), [proveedores]);

  const cuentas = useMemo(() => {
    const c = { todas: items.length, reponer: 0, semana: 0, sinprov: 0 };
    for (const m of items) {
      if (estadoDe(m) !== "ok") c.reponer++;
      if (plan.get(m.id)?.falta > 0) c.semana++;
      if (!m.proveedor_id) c.sinprov++;
    }
    return c;
  }, [items, plan]);

  const lista = useMemo(() => {
    const t = norm(busqueda);
    let r = items.filter((m) => {
      if (t && !norm(`${m.codigo} ${m.nombre} ${provPorId.get(m.proveedor_id)?.nombre || ""}`).includes(t)) return false;
      if (planta !== "todas" && String(m.planta || "Argentina").toLowerCase() !== planta) return false;
      if (filtro === "reponer") return estadoDe(m) !== "ok";
      if (filtro === "semana") return plan.get(m.id)?.falta > 0;
      if (filtro === "sinprov") return !m.proveedor_id;
      return true;
    });
    const stock = (m) => Number(m.stock_actual) || 0;
    const urg = (m) => {
      if (plan.get(m.id)?.falta > 0) return -1;
      const e = estadoDe(m);
      const min = Number(m.stock_minimo) || 0;
      return e === "sin" ? 0 : e === "reponer" ? 1 + (min ? stock(m) / min : 0) : 10 + (min ? stock(m) / min : 5);
    };
    const por = {
      codigo: (a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true }),
      nombre: (a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"),
      urgencia: (a, b) => urg(a) - urg(b),
      stock_asc: (a, b) => stock(a) - stock(b),
      stock_desc: (a, b) => stock(b) - stock(a),
    }[orden];
    r = [...r].sort(por);
    return r;
  }, [items, busqueda, filtro, planta, orden, plan, provPorId]);

  // Cada vez que cambia la búsqueda o un filtro se vuelve a la primera tanda.
  const firma = `${busqueda}|${filtro}|${planta}|${orden}`;
  const visibles = mas.firma === firma ? mas.n : PAGINA;

  const abierta = items.find((m) => m.id === ficha) || null;
  const editando = form?.modo === "editar" ? items.find((m) => m.id === form.id) : null;

  const usos = useMemo(() => {
    if (!abierta) return [];
    return recetas.filter((r) => r.ingredientes.some((ing) => ing.item_codigo === abierta.codigo || ing.item_nombre === abierta.nombre));
  }, [abierta, recetas]);

  const guardar = async ({ editando: edita, f, codigo }) => {
    const minimo = f.minimo === "" ? 0 : Number(String(f.minimo).replace(",", "."));
    if (edita) {
      const it = editando;
      await api(`/api/materias-primas/${it.id}/stock`, {
        method: "PUT",
        body: {
          stock: esAdmin && f.stock !== "" ? Number(String(f.stock).replace(",", ".")) : Number(it.stock_actual),
          motivo: f.motivo,
          stock_minimo: minimo,
          unidad_medida: f.unidad,
          planta: f.planta,
          proveedor_id: f.proveedor_id || null,
        },
      });
      toast("Cambios guardados");
      setForm(null);
      await cargar(true);
      return;
    }
    const nueva = await api("/api/materias-primas", {
      method: "POST",
      body: { codigo, nombre: f.nombre, unidad_medida: f.unidad, proveedor_id: f.proveedor_id || null, planta: f.planta, stock_minimo: minimo, ...(esAdmin && f.stock !== "" ? { stock_inicial: f.stock } : {}) },
    });
    toast(`${codigo} creada`);
    setForm(null);
    setFiltro("todas");
    setBusqueda("");
    await cargar(true);
    if (nueva?.id) setFicha(nueva.id);
  };

  const sincronizar = async () => {
    setSincronizando(true);
    try {
      const d = await api("/api/materias-primas/previsualizar-sheets", { method: "POST", body: {} });
      setSheetsKey((k) => k + 1);
      setSheets(d);
    } catch (e) {
      toast(e.message || "No se pudo conectar con Google Sheets.", "error");
    } finally {
      setSincronizando(false);
    }
  };
  const aplicarSheets = async (cambios) => {
    setAplicando(true);
    try {
      const r = await api("/api/materias-primas/aplicar-sincronizacion", { method: "POST", body: cambios });
      toast(`Sincronizado: ${r.nuevosCount || 0} nuevas, ${r.modificadosCount || 0} stocks actualizados`);
      setSheets(null);
      await cargar(true);
    } catch (e) {
      toast(e.message || "No se pudo aplicar la sincronización.", "error");
    } finally {
      setAplicando(false);
    }
  };

  const PILDORAS = [
    { v: "todas", t: "Todas", n: cuentas.todas },
    { v: "reponer", t: "Para reponer", n: cuentas.reponer, alerta: true },
    ...(cuentas.semana > 0 || filtro === "semana" ? [{ v: "semana", t: "No alcanzan esta semana", n: cuentas.semana, alerta: true }] : []),
    { v: "sinprov", t: "Sin proveedor", n: cuentas.sinprov },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <div className="h-full overflow-y-auto custom-scrollbar bg-black text-zinc-200 relative selection:bg-[#FF5A00]/30">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(60%_100%_at_15%_0%,rgba(255,90,0,0.16),transparent_70%),radial-gradient(40%_80%_at_95%_0%,rgba(255,214,10,0.07),transparent_70%)]" />

        <div className="relative max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-9 pb-40 sm:pb-24">
          {/* Encabezado */}
          <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <div className="mr-auto min-w-0">
              <h1 className="text-[34px] sm:text-5xl font-extrabold tracking-tight text-white leading-none">Materias <span className="text-[#FF5A00]">primas</span></h1>
              <p className="mt-2.5 text-[15px] text-zinc-500">
                {cargando ? "Cargando…" : (<><b className="text-zinc-200 font-bold">{nf(items.length, 0)}</b> insumos{cuentas.reponer > 0 && <> · <button onClick={() => setFiltro("reponer")} className="font-bold text-[#ff8a4d] hover:underline cursor-pointer">{cuentas.reponer} para reponer</button></>}</>)}
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button onClick={sincronizar} disabled={sincronizando} className="min-h-[46px] px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.09] text-sm font-bold text-zinc-100 inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-colors">
                <RefreshCw size={16} className={sincronizando ? "animate-spin" : ""} /> <span className="hidden sm:inline">Sincronizar Sheets</span><span className="sm:hidden">Sheets</span>
              </button>
              <button onClick={() => abrirForm({ modo: "nuevo" })} className="hidden sm:inline-flex min-h-[46px] px-5 rounded-xl bg-[#FFD60A] text-black text-sm font-extrabold items-center gap-2 hover:bg-white active:scale-[0.98] transition-all cursor-pointer shadow-[0_10px_30px_rgba(255,214,10,0.2)]">
                <Plus size={18} strokeWidth={3} /> Nueva materia prima
              </button>
            </div>
          </motion.header>

          {/* Controles */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.08 }} className="mt-6 sm:sticky sm:top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 sm:bg-black/75 sm:backdrop-blur-xl sm:border-b border-white/[0.05]">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[220px]">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input ref={buscador} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar insumo o proveedor…" className="w-full min-h-[50px] rounded-2xl bg-white/[0.05] border border-white/[0.08] focus:border-[#FF5A00]/60 focus:bg-white/[0.07] pl-11 pr-20 text-[15px] text-white placeholder:text-zinc-600 outline-none transition-colors" />
                  {busqueda ? (
                    <button onClick={() => setBusqueda("")} aria-label="Borrar búsqueda" className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] cursor-pointer"><X size={16} /></button>
                  ) : (
                    <kbd className="hidden md:block absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-bold text-zinc-600 border border-white/[0.1] rounded-md px-1.5 py-0.5">/</kbd>
                  )}
                </div>
                <div className="flex w-full sm:w-auto items-center gap-3">
                <LayoutGroup id="mp-controles">
                  <Segmentado id="planta-sel" etiqueta="Planta" valor={planta} onChange={setPlanta} opciones={[{ v: "todas", t: "Ambas" }, { v: "argentina", t: "Argentina" }, { v: "paraguay", t: "Paraguay" }]} />
                </LayoutGroup>
                <select value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Ordenar" className="min-h-[46px] min-w-0 flex-1 sm:flex-none rounded-xl bg-white/[0.05] border border-white/[0.08] px-3 text-sm font-bold text-zinc-200 outline-none focus:border-[#FF5A00]/60 cursor-pointer">
                  {ORDENES.map((o) => <option key={o.v} value={o.v} className="bg-[#111]">{o.t}</option>)}
                </select>
                </div>
                <div className="hidden lg:inline-flex p-1 rounded-xl bg-white/[0.05] border border-white/[0.07]" role="radiogroup" aria-label="Vista">
                  {[["tarjetas", LayoutGrid, "Tarjetas"], ["lista", List, "Lista"]].map(([v, Icono, t]) => (
                    <button key={v} role="radio" aria-checked={vista === v} aria-label={t} onClick={() => cambiarVista(v)} className={`w-10 h-[38px] grid place-items-center rounded-lg cursor-pointer transition-colors ${vista === v ? "bg-white/[0.12] text-white" : "text-zinc-500 hover:text-zinc-200"}`}><Icono size={17} /></button>
                  ))}
                </div>
              </div>
              <LayoutGroup id="mp-pildoras">
                <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1" role="tablist" aria-label="Filtro">
                  {PILDORAS.map((p) => {
                    const sel = filtro === p.v;
                    return (
                      <button key={p.v} role="tab" aria-selected={sel} onClick={() => setFiltro(p.v)} className={`relative shrink-0 min-h-[40px] px-4 rounded-full text-sm font-bold cursor-pointer border transition-colors ${sel ? "border-transparent text-black" : "border-white/[0.09] text-zinc-400 hover:text-white bg-white/[0.03]"}`}>
                        {sel && <motion.span layoutId="pildora-fondo" className={`absolute inset-0 rounded-full ${p.alerta ? "bg-[#FF5A00]" : "bg-[#FFD60A]"}`} transition={{ duration: 0.35, ease: EASE }} />}
                        <span className="relative inline-flex items-center gap-2">{p.t}<span className={`tabular-nums text-xs ${sel ? "text-black/70" : "text-zinc-600"}`}>{p.n}</span></span>
                      </button>
                    );
                  })}
                </div>
              </LayoutGroup>
            </div>
          </motion.div>

          {/* Contenido */}
          <div className="mt-6">
            {errorCarga && !items.length ? (
              <Vacio icono={PackageSearch} titulo="No se pudieron cargar las materias primas" texto={errorCarga}>
                <button onClick={() => cargar()} className="min-h-[46px] px-5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] font-bold text-white cursor-pointer">Reintentar</button>
              </Vacio>
            ) : cargando ? (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-busy="true">
                {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-[196px] rounded-3xl bg-white/[0.04] animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />)}
              </div>
            ) : lista.length === 0 ? (
              <Vacio icono={PackageSearch} titulo={items.length ? "No hay materias primas con ese filtro" : "Todavía no hay materias primas"} texto={items.length ? "Probá con otra búsqueda o sacá los filtros." : "Creá la primera con su proveedor, o traelas desde Google Sheets."}>
                {items.length ? (
                  <button onClick={() => { setBusqueda(""); setFiltro("todas"); setPlanta("todas"); }} className="min-h-[46px] px-5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] font-bold text-white cursor-pointer">Quitar filtros</button>
                ) : (
                  <button onClick={() => abrirForm({ modo: "nuevo" })} className="min-h-[46px] px-5 rounded-xl bg-[#FFD60A] text-black font-extrabold cursor-pointer inline-flex items-center gap-2"><Plus size={18} strokeWidth={3} /> Nueva materia prima</button>
                )}
              </Vacio>
            ) : (
              <>
                <div className={vista === "lista" ? "flex flex-col gap-2" : "grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"}>
                  {lista.slice(0, visibles).map((m, i) => (
                    <TarjetaMP key={`${vista}-${m.id}`} m={m} indice={i} modo={vista} plan={plan.get(m.id)} proveedor={provPorId.get(m.proveedor_id)} onAbrir={(x) => setFicha(x.id)} onEditar={(x) => abrirForm({ modo: "editar", id: x.id })} />
                  ))}
                </div>
                {lista.length > visibles && (
                  <div className="mt-6 flex justify-center">
                    <button onClick={() => setMas({ firma, n: visibles + PAGINA })} className="min-h-[50px] px-6 rounded-2xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.09] font-bold text-zinc-100 cursor-pointer">Mostrar más <span className="text-zinc-500 font-semibold">({lista.length - visibles} restantes)</span></button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Botón flotante para celular */}
        <AnimatePresence>
          {!form && !ficha && (
            <motion.button initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 24 }} onClick={() => abrirForm({ modo: "nuevo" })} aria-label="Nueva materia prima" className="sm:hidden fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 w-16 h-16 rounded-full bg-[#FFD60A] text-black grid place-items-center shadow-[0_14px_40px_rgba(255,214,10,0.35)] active:scale-95 cursor-pointer">
              <Plus size={30} strokeWidth={3} />
            </motion.button>
          )}
        </AnimatePresence>

        <FichaMP m={abierta} proveedor={abierta ? provPorId.get(abierta.proveedor_id) : null} plan={abierta ? plan.get(abierta.id) || null : null} planCargando={cargando} usos={usos} esAdmin={esAdmin} onCerrar={() => setFicha(null)} onEditar={(m) => abrirForm({ modo: "editar", id: m.id })} onHistorial={() => setHistorial("historial")} onSemana={() => setHistorial("demanda")} />
        <HistorialMateriaPrima key={`${abierta?.id}-${historial}`} vistaInicial={historial || "historial"} item={abierta} abierto={!!historial && !!abierta} onCerrar={() => setHistorial(null)} />
        <FormularioMP key={formKey} abierto={!!form && (form.modo === "nuevo" || !!editando)} modo={form?.modo} item={editando} items={items} proveedores={proveedores} esAdmin={esAdmin} onCerrar={() => setForm(null)} onGuardado={guardar} />
        <SincronizarSheets key={sheetsKey} datos={sheets} aplicando={aplicando} onCerrar={() => setSheets(null)} onAplicar={aplicarSheets} />
        {toastNodo}
      </div>
    </MotionConfig>
  );
}
