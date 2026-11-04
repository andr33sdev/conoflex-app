// Clientes nuevos: un botón que manda a la IA a buscar en internet licitaciones, obras y empresas del rubro en toda
// la Argentina. Se marca el resultado de cada oportunidad, se siguen las licitaciones, se mira el mapa y la competencia.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "framer-motion";
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2, Radar, RotateCcw, Search, Sparkles, Swords } from "lucide-react";
import { api } from "./produccion/util";
import { getApiUrl } from "./apiConfig";
import { useToast } from "./produccion/useToast";
import { Vacio } from "./produccion/ui";
import Tarjeta from "./clientes/Tarjeta";
import Mapa from "./clientes/Mapa";
import Competencia from "./clientes/Competencia";
import Seguimiento from "./clientes/Seguimiento";
import Historial from "./clientes/Historial";
import { MAPA } from "./clientes/mapaArgentina";
import { SEGMENTOS, cuando, diasHasta, idProvincia } from "./clientes/util";

const EASE = [0.22, 1, 0.36, 1];
const PESTAÑAS = [
  { v: "novedades", t: "Novedades" },
  { v: "mapa", t: "Mapa" },
  { v: "seguimiento", t: "Seguimiento" },
  { v: "competencia", t: "Competencia" },
  { v: "historial", t: "Historial" },
];

function Cifra({ n, t, tono = "text-white" }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5">
      <span className={`block text-3xl font-extrabold tabular-nums leading-none ${tono}`}>{n}</span>
      <span className="block mt-1.5 text-xs font-bold text-zinc-500">{t}</span>
    </div>
  );
}

function Resumen({ texto }) {
  if (!texto) return null;
  return (
    <div className="rounded-3xl border border-[#FFD60A]/20 bg-[#FFD60A]/[0.04] p-5 sm:p-6 flex gap-4">
      <Sparkles size={22} className="text-[#FFD60A] shrink-0 mt-0.5" />
      <p className="text-[15px] sm:text-base text-zinc-200 leading-relaxed">{texto}</p>
    </div>
  );
}

export default function ClientesNuevos() {
  const { mostrar: toast, nodo: toastNodo } = useToast();
  const [pestaña, setPestaña] = useState("novedades");
  const [dato, setDato] = useState(undefined); // última búsqueda de oportunidades; undefined = cargando, null = nunca se buscó
  const [comp, setComp] = useState(null);
  const [vista, setVista] = useState(null); // búsqueda anterior que se está mirando
  const [trabajo, setTrabajo] = useState(null);
  const [seg, setSeg] = useState([]);
  const [dormidos, setDormidos] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [descartadas, setDescartadas] = useState(null);
  const [error, setError] = useState("");
  const [iniciando, setIniciando] = useState(false);
  const [filtro, setFiltro] = useState("todas");
  const [provincia, setProvincia] = useState(""); // id del mapa
  const [fuentes, setFuentes] = useState(false);
  const [menuBajar, setMenuBajar] = useState(false);
  const previo = useRef(null);

  const cargarUltima = useCallback(async (tipo) => {
    try {
      const d = await api(`/api/clientes-nuevos/ultima?tipo=${tipo}`);
      if (tipo === "COMPETENCIA") setComp(d);
      else setDato(d);
      setError("");
      return d;
    } catch (e) {
      setError(e.message);
      if (tipo === "OPORTUNIDADES") setDato((d) => (d === undefined ? null : d));
      return null;
    }
  }, []);
  const cargarSeg = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([api("/api/clientes-nuevos/seguimiento"), api("/api/clientes-nuevos/dormidos")]);
      setSeg(s);
      setDormidos(d);
    } catch (e) {
      setError(e.message);
    }
  }, []);
  const cargarHistorial = useCallback(async () => {
    try {
      setHistorial(await api("/api/clientes-nuevos/historial"));
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    // Carga inicial: cada estado se actualiza al llegar su respuesta.
    /* eslint-disable react-hooks/set-state-in-effect */
    cargarUltima("OPORTUNIDADES");
    cargarUltima("COMPETENCIA");
    cargarSeg();
    api("/api/clientes-nuevos/trabajo").then(setTrabajo).catch(() => {});
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargarUltima, cargarSeg]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pestaña === "historial") cargarHistorial();
  }, [pestaña, cargarHistorial]);

  // Mientras hay una búsqueda en curso se pregunta cada 3 segundos cómo va; al terminar se recarga lo que corresponda.
  const enCurso = !!trabajo;
  useEffect(() => {
    if (!enCurso) return undefined;
    const id = setInterval(async () => {
      try {
        const t = await api("/api/clientes-nuevos/trabajo");
        if (t) {
          setTrabajo(t);
          return;
        }
        const tipo = previo.current?.tipo || "OPORTUNIDADES";
        setTrabajo(null);
        if (tipo === "SEGUIMIENTO") {
          await Promise.all([cargarSeg(), cargarUltima("SEGUIMIENTO")]);
          toast("Listo: revisé las licitaciones que seguís.", "ok");
          return;
        }
        const d = await cargarUltima(tipo);
        if (tipo === "OPORTUNIDADES") {
          setVista(null);
          cargarSeg();
        }
        toast(d?.estado === "LISTO" ? "Listo: ya está el resultado." : d?.error || "La búsqueda falló.", d?.estado === "LISTO" ? "ok" : "error");
      } catch {
        /* se reintenta en el próximo ciclo */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [enCurso, cargarUltima, cargarSeg, toast]);
  useEffect(() => {
    if (trabajo) previo.current = trabajo;
  }, [trabajo]);

  const copiar = useCallback(async (texto) => {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      toast("No pude copiar. Seleccioná el texto y copialo a mano.", "error");
      return false;
    }
  }, [toast]);

  const buscar = async (tipo) => {
    setIniciando(true);
    try {
      const r = await api("/api/clientes-nuevos/buscar", { method: "POST", body: { tipo } });
      if (r.ya_buscando) toast("Ya hay una búsqueda en curso.", "ok");
      setFiltro("todas");
      setProvincia("");
      setVista(null);
      setTrabajo(await api("/api/clientes-nuevos/trabajo"));
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setIniciando(false);
    }
  };

  // Marcar resultado / seguir / nota. Lo descartado sale de la lista y no vuelve en las próximas búsquedas.
  const cambiar = useCallback(async (id, cambios) => {
    try {
      const r = await api(`/api/clientes-nuevos/oportunidades/${id}`, { method: "PUT", body: cambios });
      const mezclar = (d) => d && d.resultado?.oportunidades ? { ...d, resultado: { ...d.resultado, oportunidades: d.resultado.oportunidades.map((o) => (o.id === id ? { ...o, estado: r.estado, siguiendo: r.siguiendo, nota: r.nota } : o)) } } : d;
      setDato(mezclar);
      setVista(mezclar);
      setSeg((l) => l.map((o) => (o.id === id ? { ...o, estado: r.estado, siguiendo: r.siguiendo, nota: r.nota } : o)));
      if (cambios.estado === "DESCARTADA") {
        toast("Descartada. No va a volver a aparecer en las búsquedas.", "ok");
        setDescartadas(null);
      }
      if (cambios.estado || cambios.siguiendo !== undefined) cargarSeg();
      if (cambios.siguiendo !== undefined) toast(r.siguiendo ? "La seguís: te aviso antes del cierre." : "Dejaste de seguirla.", "ok");
    } catch (e) {
      toast(e.message, "error");
    }
  }, [cargarSeg, toast]);

  const borrador = useCallback(async (id, cuerpo) => {
    try {
      await api(`/api/clientes-nuevos/oportunidades/${id}/borrador`, { method: "POST", body: cuerpo });
      toast("Borrador guardado en Gmail. Revisalo antes de enviarlo.", "ok");
      return true;
    } catch (e) {
      toast(e.message, "error");
      return false;
    }
  }, [toast]);

  const conocido = useCallback(async (empresa) => {
    try {
      await api("/api/clientes-nuevos/competidores/conocido", { method: "POST", body: { empresa } });
      setComp((d) => (d?.resultado?.competidores ? { ...d, resultado: { ...d.resultado, competidores: d.resultado.competidores.filter((x) => x.empresa !== empresa) } } : d));
      toast("Listo: no te lo vuelvo a mostrar.", "ok");
    } catch (e) {
      toast(e.message, "error");
    }
  }, [toast]);

  const abrirDescartadas = async () => {
    if (descartadas) return setDescartadas(null);
    try {
      setDescartadas(await api("/api/clientes-nuevos/descartadas"));
    } catch (e) {
      toast(e.message, "error");
    }
  };
  const restaurar = async (o) => {
    await cambiar(o.id, { estado: "PENDIENTE" });
    setDescartadas((l) => (l || []).filter((x) => x.id !== o.id));
    toast("Restaurada. Va a volver a aparecer en la próxima búsqueda.", "ok");
  };

  const abrirBusqueda = async (id) => {
    try {
      setVista(await api(`/api/clientes-nuevos/busqueda/${id}`));
      setPestaña("novedades");
      setFiltro("todas");
      setProvincia("");
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const bajar = async (id, formato) => {
    setMenuBajar(false);
    try {
      const res = await fetch(getApiUrl(`/api/clientes-nuevos/exportar/${id}?formato=${formato}`));
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No pude generar el archivo.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `clientes-nuevos.${formato}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const base = vista || dato;
  const r = base?.estado === "LISTO" ? base.resultado : null;
  const ops = useMemo(() => (r?.oportunidades || []).filter((o) => o.estado !== "DESCARTADA"), [r]);
  const cuentas = useMemo(() => {
    const c = { todas: ops.length, nuevas: ops.filter((o) => o.nueva).length, ya: ops.filter((o) => o.prioridad === 1).length, pronto: ops.filter((o) => { const d = diasHasta(o.fecha_iso); return o.fecha_tipo === "cierre" && d !== null && d >= 0 && d <= 15; }).length };
    for (const k of Object.keys(SEGMENTOS)) c[k] = ops.filter((o) => o.segmento === k).length;
    return c;
  }, [ops]);
  const provActiva = provincia && ops.some((o) => idProvincia(o.provincia, MAPA.provincias) === provincia) ? provincia : "";
  const visibles = ops.filter((o) => (filtro === "todas" ? true : filtro === "nuevas" ? o.nueva : o.segmento === filtro) && (!provActiva || idProvincia(o.provincia, MAPA.provincias) === provActiva));
  const PILDORAS = [{ v: "todas", t: "Todas" }, ...(cuentas.nuevas > 0 && cuentas.nuevas < cuentas.todas ? [{ v: "nuevas", t: "Nuevas" }] : []), ...Object.entries(SEGMENTOS).filter(([k]) => cuentas[k] > 0).map(([v, t]) => ({ v, t }))];
  const nombreProv = MAPA.provincias.find((p) => p.id === provActiva)?.nombre;
  const fallo = dato?.estado === "ERROR" ? dato.error : "";
  const rc = comp?.estado === "LISTO" ? comp.resultado : null;

  const accion = pestaña === "competencia" ? { tipo: "COMPETENCIA", t: rc ? "Buscar de nuevo" : "Buscar competencia", Icono: Swords } : pestaña === "seguimiento" ? { tipo: "SEGUIMIENTO", t: "Revisar novedades", Icono: Radar } : { tipo: "OPORTUNIDADES", t: r ? "Buscar de nuevo" : "Buscar novedades", Icono: Radar };
  const exportable = pestaña === "competencia" ? comp?.estado === "LISTO" && comp.id : pestaña === "novedades" ? r && base.id : null;
  const subtitulo = pestaña === "competencia" ? (rc ? `Última búsqueda: ${cuando(comp.terminado_at)}` : "Quién ganó licitaciones hace poco y qué empresas nuevas se mueven en el rubro.") : dato?.estado === "LISTO" ? `Última búsqueda: ${cuando(dato.terminado_at)}` : "Licitaciones, obras y empresas de toda la Argentina.";
  const tipoEnCurso = trabajo?.tipo;
  const corriendo = iniciando || enCurso;

  const cuerpo = () => {
    if (pestaña === "competencia") {
      if (enCurso && tipoEnCurso === "COMPETENCIA") return <Buscando trabajo={trabajo} />;
      if (rc) return <><Resumen texto={rc.resumen} /><div className="mt-6"><Competencia r={rc} onConocido={conocido} /></div><Aviso /></>;
      return <Vacio icono={Swords} titulo="Todavía no buscaste la competencia" texto="La IA revisa licitaciones adjudicadas hace poco y los movimientos de empresas del rubro: quién gana, a qué precio y quién se está moviendo." />;
    }
    if (pestaña === "seguimiento") {
      if (enCurso && tipoEnCurso === "SEGUIMIENTO") return <Buscando trabajo={trabajo} />;
      return <Seguimiento items={seg} dormidos={dormidos} onCopiar={copiar} onCambiar={cambiar} onBorrador={borrador} />;
    }
    if (pestaña === "historial") return <Historial lista={historial} abierta={vista?.id} onAbrir={abrirBusqueda} onExportar={bajar} />;
    if (enCurso && tipoEnCurso === "OPORTUNIDADES") return <Buscando trabajo={trabajo} />;
    if (!r) {
      return (
        <>
          {(fallo || error) && <div role="alert" className="mb-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{fallo || error}</div>}
          <Vacio icono={Radar} titulo="Todavía no buscaste novedades" texto="Apretá el botón y la IA revisa internet: licitaciones abiertas por vencer, obras que arrancan y empresas del rubro que se mueven, en toda la Argentina." />
        </>
      );
    }
    return (
      <>
        {vista && (
          <div className="mb-4 rounded-2xl border border-sky-400/30 bg-sky-400/10 px-4 py-3 flex flex-wrap items-center gap-3 text-sm text-sky-100">
            <span className="mr-auto">Estás viendo la búsqueda del <b>{cuando(vista.created_at)}</b>.</span>
            <button onClick={() => setVista(null)} className="min-h-[40px] px-3.5 rounded-xl bg-white/10 font-bold inline-flex items-center gap-2 cursor-pointer hover:bg-white/20"><RotateCcw size={14} /> Volver a la última</button>
          </div>
        )}
        {base.fallo_reciente && !vista && <div role="alert" className="mb-4 rounded-2xl border border-[#FF5A00]/30 bg-[#FF5A00]/10 px-4 py-3 text-sm text-orange-100">La última búsqueda no pudo completarse: {base.fallo_reciente} Te muestro la anterior.</div>}
        <Resumen texto={r.resumen} />
        {r.segmentos_sin_resultado?.length > 0 && <p className="mt-3 text-sm text-[#ff8a4d]">No pude buscar: {r.segmentos_sin_resultado.join(", ")}. Probá de nuevo para completarlo.</p>}
        {ops.length === 0 ? (
          <div className="mt-6"><Vacio icono={Search} titulo="No hay oportunidades para mostrar" texto="Probá de nuevo en unos días: las licitaciones y obras cambian todo el tiempo." /></div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Cifra n={cuentas.todas} t="Oportunidades" />
              <Cifra n={cuentas.ya} t="Para ir ya" tono="text-[#ff8a4d]" />
              <Cifra n={cuentas.pronto} t="Cierran en 15 días" tono="text-[#FFD60A]" />
              <Cifra n={cuentas.nuevas} t="Nuevas desde la última" tono="text-emerald-300" />
            </div>
            {pestaña === "mapa" ? (
              <div className="mt-8">
                <Mapa ops={ops} sel={provActiva} onSel={(id) => { setProvincia(id); }} />
                {provActiva && (
                  <div className="mt-8">
                    <div className="flex items-center gap-3"><h2 className="text-lg font-extrabold text-white mr-auto">{nombreProv}</h2><button onClick={() => setProvincia("")} className="min-h-[40px] px-3 text-sm font-bold text-zinc-400 hover:text-white cursor-pointer">Quitar filtro</button></div>
                    <div className="mt-4 flex flex-col gap-5">{visibles.map((o, i) => <Tarjeta key={o.id || o.clave || i} o={o} i={i} onCopiar={copiar} onCambiar={cambiar} onBorrador={borrador} />)}</div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {PILDORAS.length > 2 && (
                  <LayoutGroup id="cn-pildoras">
                    <div className="mt-6 flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1" role="tablist" aria-label="Filtro">
                      {PILDORAS.map((p) => {
                        const sel = filtro === p.v;
                        return (
                          <button key={p.v} role="tab" aria-selected={sel} onClick={() => setFiltro(p.v)} className={`relative shrink-0 min-h-[40px] px-4 rounded-full text-sm font-bold cursor-pointer border transition-colors ${sel ? "border-transparent text-black" : "border-white/[0.09] text-zinc-400 hover:text-white bg-white/[0.03]"}`}>
                            {sel && <motion.span layoutId="cn-fondo" className="absolute inset-0 rounded-full bg-[#FFD60A]" transition={{ duration: 0.35, ease: EASE }} />}
                            <span className="relative inline-flex items-center gap-2">{p.t}<span className={`tabular-nums text-xs ${sel ? "text-black/70" : "text-zinc-600"}`}>{cuentas[p.v]}</span></span>
                          </button>
                        );
                      })}
                    </div>
                  </LayoutGroup>
                )}
                {nombreProv && <p className="mt-4 text-sm text-zinc-400">Mostrando solo <b className="text-white">{nombreProv}</b>. <button onClick={() => setProvincia("")} className="font-bold text-[#FFD60A] cursor-pointer">Ver todas</button></p>}
                <div className="mt-5 flex flex-col gap-5">
                  {visibles.length === 0 ? <p className="py-10 text-center text-zinc-500">No hay oportunidades con ese filtro.</p> : visibles.map((o, i) => <Tarjeta key={o.id || o.clave || i} o={o} i={i} onCopiar={copiar} onCambiar={cambiar} onBorrador={borrador} />)}
                </div>
              </>
            )}
            {(r.vencidas_descartadas > 0 || r.viejas_descartadas > 0) && <p className="mt-4 text-sm text-zinc-600">Se ocultaron {(r.vencidas_descartadas || 0) + (r.viejas_descartadas || 0)} resultados que ya cerraron o eran viejos.</p>}
          </>
        )}
        <div className="mt-4">
          <button onClick={abrirDescartadas} aria-expanded={!!descartadas} className="inline-flex items-center gap-2 text-sm font-bold text-zinc-500 hover:text-white cursor-pointer min-h-[44px]">Ver descartadas <ChevronDown size={16} className={`transition-transform ${descartadas ? "rotate-180" : ""}`} /></button>
          {descartadas && (
            descartadas.length === 0 ? <p className="text-sm text-zinc-600">No descartaste ninguna.</p> : (
              <ul className="mt-1 flex flex-col gap-2">
                {descartadas.map((o) => (
                  <li key={o.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 flex items-center gap-3">
                    <span className="mr-auto min-w-0"><b className="block text-zinc-200 truncate">{o.titulo}</b><span className="block text-xs text-zinc-500 truncate">{o.organizacion}</span></span>
                    <button onClick={() => restaurar(o)} className="min-h-[44px] px-4 rounded-xl border border-white/[0.12] bg-white/[0.05] text-sm font-bold text-zinc-100 hover:bg-white/[0.1] cursor-pointer shrink-0">Restaurar</button>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
        {r.fuentes?.length > 0 && (
          <div className="mt-6">
            <button onClick={() => setFuentes((v) => !v)} aria-expanded={fuentes} className="inline-flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-white cursor-pointer min-h-[44px]">
              Fuentes consultadas ({r.fuentes.length}) <ChevronDown size={16} className={`transition-transform ${fuentes ? "rotate-180" : ""}`} />
            </button>
            {fuentes && <ul className="mt-1 flex flex-col gap-1">{r.fuentes.map((f) => <li key={f.url}><a href={f.url} target="_blank" rel="noreferrer noopener" className="text-sm text-zinc-500 hover:text-[#ff8a4d] hover:underline break-all">{f.titulo}</a></li>)}</ul>}
            <Aviso />
          </div>
        )}
      </>
    );
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="h-full overflow-y-auto custom-scrollbar bg-black text-zinc-200 relative selection:bg-[#FF5A00]/30">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(60%_100%_at_15%_0%,rgba(255,90,0,0.16),transparent_70%),radial-gradient(40%_80%_at_95%_0%,rgba(255,214,10,0.07),transparent_70%)]" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-9 pb-24">
          <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <div className="mr-auto min-w-0">
              <h1 className="text-[34px] sm:text-5xl font-extrabold tracking-tight text-white leading-none">Clientes <span className="text-[#FF5A00]">nuevos</span></h1>
              <p className="mt-2.5 text-[15px] text-zinc-500">{subtitulo}</p>
            </div>
            <div className="flex items-center gap-2.5">
              {exportable && (
                <div className="relative">
                  <button onClick={() => setMenuBajar((v) => !v)} aria-expanded={menuBajar} aria-haspopup="menu" className="min-h-[52px] px-5 rounded-2xl border border-white/[0.14] bg-white/[0.05] text-[15px] font-bold text-white inline-flex items-center gap-2 hover:bg-white/[0.1] cursor-pointer"><Download size={17} /> Exportar</button>
                  {menuBajar && (
                    <div role="menu" className="absolute z-30 right-0 mt-2 w-44 rounded-2xl border border-white/[0.12] bg-[#16161a] p-1.5 shadow-2xl">
                      <button role="menuitem" onClick={() => bajar(exportable, "pdf")} className="w-full min-h-[44px] px-3 rounded-xl text-left text-sm font-bold text-zinc-100 hover:bg-white/[0.07] flex items-center gap-2.5 cursor-pointer"><FileText size={16} /> PDF</button>
                      <button role="menuitem" onClick={() => bajar(exportable, "xlsx")} className="w-full min-h-[44px] px-3 rounded-xl text-left text-sm font-bold text-zinc-100 hover:bg-white/[0.07] flex items-center gap-2.5 cursor-pointer"><FileSpreadsheet size={16} /> Excel</button>
                    </div>
                  )}
                </div>
              )}
              {pestaña !== "historial" && (
                <button onClick={() => buscar(accion.tipo)} disabled={corriendo} className="min-h-[52px] px-6 rounded-2xl bg-[#FFD60A] text-black text-base font-extrabold inline-flex items-center gap-2.5 hover:bg-white active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait shadow-[0_10px_30px_rgba(255,214,10,0.2)]">
                  {corriendo ? <Loader2 size={19} className="animate-spin" /> : <accion.Icono size={19} />}
                  {corriendo ? "Buscando…" : accion.t}
                </button>
              )}
            </div>
          </motion.header>

          <LayoutGroup id="cn-pestanas">
            <div className="mt-7 flex gap-1 overflow-x-auto no-scrollbar border-b border-white/[0.08]" role="tablist" aria-label="Secciones">
              {PESTAÑAS.map((p) => {
                const sel = pestaña === p.v;
                return (
                  <button key={p.v} role="tab" aria-selected={sel} onClick={() => setPestaña(p.v)} className={`relative shrink-0 min-h-[46px] px-4 text-[15px] font-bold cursor-pointer transition-colors ${sel ? "text-white" : "text-zinc-500 hover:text-zinc-200"}`}>
                    {p.t}
                    {p.v === "seguimiento" && seg.length > 0 && <span className="ml-1.5 text-xs tabular-nums text-[#FFD60A]">{seg.length}</span>}
                    {sel && <motion.span layoutId="cn-subrayado" className="absolute left-3 right-3 -bottom-px h-[3px] rounded-full bg-[#FF5A00]" transition={{ duration: 0.3, ease: EASE }} />}
                  </button>
                );
              })}
            </div>
          </LayoutGroup>

          <div className="mt-7">
            {dato === undefined ? <div className="flex justify-center py-20 text-zinc-500"><Loader2 className="animate-spin" size={24} /></div> : <AnimatePresence mode="wait" initial={false}><motion.div key={pestaña} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>{cuerpo()}</motion.div></AnimatePresence>}
          </div>
        </div>
        {toastNodo}
      </div>
    </MotionConfig>
  );
}

function Buscando({ trabajo }) {
  return (
    <div className="rounded-3xl border border-white/[0.08] bg-[#0d0d10] p-8 sm:p-10 text-center" role="status">
      <div className="mx-auto w-16 h-16 rounded-2xl bg-[#FF5A00]/15 grid place-items-center text-[#FF5A00]"><Radar size={30} className="animate-pulse" /></div>
      <p className="mt-5 text-xl font-extrabold text-white">Saliendo a buscar…</p>
      <p className="mt-1.5 text-[15px] text-zinc-400">{trabajo?.progreso || "Empezando…"}</p>
      <p className="mt-4 text-sm text-zinc-600">Tarda entre uno y dos minutos. Podés dejar esta pantalla abierta.</p>
    </div>
  );
}

function Aviso() {
  return <p className="mt-3 text-xs text-zinc-600 leading-relaxed">La IA arma esto con información pública de internet. Verificá fechas y contactos antes de llamar: puede haber datos desactualizados.</p>;
}
