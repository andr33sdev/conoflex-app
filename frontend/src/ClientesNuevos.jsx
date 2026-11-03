// Clientes nuevos: un botón que manda a la IA a buscar en internet licitaciones, obras y empresas del rubro en toda
// la Argentina, y muestra las novedades ordenadas de más a menos urgentes.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "framer-motion";
import { ArrowUpRight, Calendar, ChevronDown, Loader2, MapPin, Package, Radar, Search, Sparkles } from "lucide-react";
import { api } from "./produccion/util";
import { useToast } from "./produccion/useToast";
import { Vacio } from "./produccion/ui";

const EASE = [0.22, 1, 0.36, 1];
const SEGMENTOS = { licitaciones: "Licitaciones", obras: "Obras", empresas: "Empresas" };
const PRIORIDAD = {
  1: { t: "Ir ya", clase: "bg-[#FF5A00]/15 text-[#ff8a4d] border-[#FF5A00]/40" },
  2: { t: "Interesante", clase: "bg-[#FFD60A]/10 text-[#FFD60A] border-[#FFD60A]/30" },
  3: { t: "A futuro", clase: "bg-white/[0.05] text-zinc-400 border-white/[0.1]" },
};

const cuando = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

/** Convierte en enlace lo que parezca una web o un mail dentro del contacto. */
function Contacto({ texto }) {
  const t = String(texto || "").trim();
  if (!t || /^no figura/i.test(t)) return <span className="text-zinc-600">No figura</span>;
  const partes = t.split(/(https?:\/\/\S+|[\w.+-]+@[\w-]+\.[\w.-]+|(?:www\.)[\w-]+\.[\w./-]+)/g);
  return (
    <span className="break-words">
      {partes.map((p, i) => {
        if (/^https?:\/\//.test(p) || /^www\./.test(p)) return <a key={i} href={p.startsWith("http") ? p : `https://${p}`} target="_blank" rel="noreferrer noopener" className="text-[#ff8a4d] hover:underline">{p}</a>;
        if (/@/.test(p) && /^[\w.+-]+@/.test(p)) return <a key={i} href={`mailto:${p}`} className="text-[#ff8a4d] hover:underline">{p}</a>;
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
}

function Dato({ icono: Icono, titulo, children }) {
  return (
    <div className="min-w-0">
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500"><Icono size={13} /> {titulo}</span>
      <div className="mt-1 text-sm text-zinc-200 leading-snug">{children}</div>
    </div>
  );
}

function Tarjeta({ o, i }) {
  const p = PRIORIDAD[o.prioridad] || PRIORIDAD[2];
  return (
    <motion.article layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE, delay: Math.min(i, 8) * 0.04 }} className="rounded-3xl border border-white/[0.08] bg-[#0d0d10] p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${p.clase}`}>{p.t}</span>
        {o.nueva && <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-bold text-emerald-300">Nueva</span>}
        <span className="text-xs font-bold text-zinc-500">{SEGMENTOS[o.segmento] || "Oportunidad"}</span>
        {o.confianza === "baja" && <span className="text-xs text-zinc-500">· dato a confirmar</span>}
      </div>
      <h3 className="mt-3 text-lg sm:text-xl font-extrabold text-white leading-snug">{o.titulo}</h3>
      <p className="mt-1 text-[15px] text-zinc-400">
        <b className="text-zinc-200 font-bold">{o.organizacion}</b>
        {o.provincia && <span className="inline-flex items-center gap-1 ml-2 text-zinc-500"><MapPin size={13} /> {o.provincia}</span>}
      </p>
      <p className="mt-3 text-[15px] text-zinc-300 leading-relaxed">{o.que_paso}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 pt-4 border-t border-white/[0.06]">
        {o.producto && <Dato icono={Package} titulo="Qué ofrecerle">{o.producto}</Dato>}
        {o.fecha && <Dato icono={Calendar} titulo="Fecha">{o.fecha}</Dato>}
        <Dato icono={ArrowUpRight} titulo="Contacto"><Contacto texto={o.contacto} /></Dato>
        {o.fuente && <Dato icono={Search} titulo="Visto en">{o.fuente}</Dato>}
      </div>
    </motion.article>
  );
}

export default function ClientesNuevos() {
  const { mostrar: toast, nodo: toastNodo } = useToast();
  const [dato, setDato] = useState(undefined); // undefined = cargando, null = nunca se buscó
  const [error, setError] = useState("");
  const [iniciando, setIniciando] = useState(false);
  const [filtro, setFiltro] = useState("todas");
  const [fuentes, setFuentes] = useState(false);
  const aviso = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const d = await api("/api/clientes-nuevos/ultima");
      setDato(d);
      setError("");
      return d;
    } catch (e) {
      setError(e.message);
      setDato((d) => (d === undefined ? null : d));
      return null;
    }
  }, []);

  useEffect(() => {
    // Carga inicial: el estado se actualiza al llegar la respuesta.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  const buscando = dato?.estado === "BUSCANDO";
  useEffect(() => {
    if (!buscando) return undefined;
    const id = setInterval(async () => {
      const d = await cargar();
      if (d && d.estado !== "BUSCANDO" && aviso.current !== d.id) {
        aviso.current = d.id;
        toast(d.estado === "LISTO" ? "Listo: ya están las novedades." : d.error || "La búsqueda falló.", d.estado === "LISTO" ? "ok" : "error");
      }
    }, 3000);
    return () => clearInterval(id);
  }, [buscando, cargar, toast]);

  const buscar = async () => {
    setIniciando(true);
    try {
      await api("/api/clientes-nuevos/buscar", { method: "POST", body: {} });
      setFiltro("todas");
      await cargar();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setIniciando(false);
    }
  };

  const r = dato?.estado === "LISTO" ? dato.resultado : null;
  const ops = useMemo(() => r?.oportunidades || [], [r]);
  const cuentas = useMemo(() => {
    const c = { todas: ops.length, nuevas: ops.filter((o) => o.nueva).length };
    for (const k of Object.keys(SEGMENTOS)) c[k] = ops.filter((o) => o.segmento === k).length;
    return c;
  }, [ops]);
  const visibles = ops.filter((o) => (filtro === "todas" ? true : filtro === "nuevas" ? o.nueva : o.segmento === filtro));
  const PILDORAS = [{ v: "todas", t: "Todas" }, ...(cuentas.nuevas > 0 && cuentas.nuevas < cuentas.todas ? [{ v: "nuevas", t: "Nuevas" }] : []), ...Object.entries(SEGMENTOS).filter(([k]) => cuentas[k] > 0).map(([v, t]) => ({ v, t }))];
  const ultimaListaFecha = dato?.estado === "LISTO" ? cuando(dato.terminado_at) : "";
  const fallo = dato?.estado === "ERROR" ? dato.error : "";

  return (
    <MotionConfig reducedMotion="user">
      <div className="h-full overflow-y-auto custom-scrollbar bg-black text-zinc-200 relative selection:bg-[#FF5A00]/30">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(60%_100%_at_15%_0%,rgba(255,90,0,0.16),transparent_70%),radial-gradient(40%_80%_at_95%_0%,rgba(255,214,10,0.07),transparent_70%)]" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-9 pb-24">
          <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <div className="mr-auto min-w-0">
              <h1 className="text-[34px] sm:text-5xl font-extrabold tracking-tight text-white leading-none">Clientes <span className="text-[#FF5A00]">nuevos</span></h1>
              <p className="mt-2.5 text-[15px] text-zinc-500">
                {ultimaListaFecha ? <>Última búsqueda: <b className="text-zinc-300 font-bold">{ultimaListaFecha}</b></> : "Licitaciones, obras y empresas de toda la Argentina."}
              </p>
            </div>
            <button onClick={buscar} disabled={iniciando || buscando} className="min-h-[52px] px-6 rounded-2xl bg-[#FFD60A] text-black text-base font-extrabold inline-flex items-center gap-2.5 hover:bg-white active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait shadow-[0_10px_30px_rgba(255,214,10,0.2)]">
              {iniciando || buscando ? <Loader2 size={19} className="animate-spin" /> : <Radar size={19} />}
              {buscando ? "Buscando…" : r ? "Buscar de nuevo" : "Buscar novedades"}
            </button>
          </motion.header>

          <div className="mt-8">
            {dato === undefined ? (
              <div className="flex justify-center py-20 text-zinc-500"><Loader2 className="animate-spin" size={24} /></div>
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                {buscando ? (
                  <motion.div key="buscando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-3xl border border-white/[0.08] bg-[#0d0d10] p-8 sm:p-10 text-center" role="status">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-[#FF5A00]/15 grid place-items-center text-[#FF5A00]"><Radar size={30} className="animate-pulse" /></div>
                    <p className="mt-5 text-xl font-extrabold text-white">Saliendo a buscar…</p>
                    <p className="mt-1.5 text-[15px] text-zinc-400">{dato.progreso || "Empezando…"}</p>
                    <p className="mt-4 text-sm text-zinc-600">Tarda entre uno y dos minutos. Podés dejar esta pantalla abierta.</p>
                  </motion.div>
                ) : r ? (
                  <motion.div key="listo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    {r.resumen && (
                      <div className="rounded-3xl border border-[#FFD60A]/20 bg-[#FFD60A]/[0.04] p-5 sm:p-6 flex gap-4">
                        <Sparkles size={22} className="text-[#FFD60A] shrink-0 mt-0.5" />
                        <p className="text-[15px] sm:text-base text-zinc-200 leading-relaxed">{r.resumen}</p>
                      </div>
                    )}
                    {r.segmentos_sin_resultado?.length > 0 && <p className="mt-3 text-sm text-[#ff8a4d]">No pude buscar: {r.segmentos_sin_resultado.join(", ")}. Probá de nuevo para completarlo.</p>}
                    {ops.length === 0 ? (
                      <div className="mt-6"><Vacio icono={Search} titulo="No encontré oportunidades esta vez" texto="Probá de nuevo en unos días: las licitaciones y obras cambian todo el tiempo." /></div>
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
                        <div className="mt-5 flex flex-col gap-4">
                          {visibles.map((o, i) => <Tarjeta key={o.clave || i} o={o} i={i} />)}
                        </div>
                      </>
                    )}
                    {r.fuentes?.length > 0 && (
                      <div className="mt-8">
                        <button onClick={() => setFuentes((v) => !v)} aria-expanded={fuentes} className="inline-flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-white cursor-pointer min-h-[44px]">
                          Fuentes consultadas ({r.fuentes.length}) <ChevronDown size={16} className={`transition-transform ${fuentes ? "rotate-180" : ""}`} />
                        </button>
                        {fuentes && (
                          <ul className="mt-1 flex flex-col gap-1">
                            {r.fuentes.map((f) => <li key={f.url}><a href={f.url} target="_blank" rel="noreferrer noopener" className="text-sm text-zinc-500 hover:text-[#ff8a4d] hover:underline break-all">{f.titulo}</a></li>)}
                          </ul>
                        )}
                        <p className="mt-3 text-xs text-zinc-600 leading-relaxed">La IA arma esto con información pública de internet. Verificá fechas y contactos antes de llamar: puede haber datos desactualizados.</p>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div key="vacio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    {(fallo || error) && <div role="alert" className="mb-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{fallo || error}</div>}
                    <Vacio icono={Radar} titulo="Todavía no buscaste novedades" texto="Apretá el botón y la IA revisa internet: licitaciones abiertas, obras viales y empresas del rubro de toda la Argentina." />
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        </div>
        {toastNodo}
      </div>
    </MotionConfig>
  );
}
