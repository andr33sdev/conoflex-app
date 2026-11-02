// Sugerencias de compra: producción y depósito sugieren comprar una materia prima con una urgencia del 1 al 5;
// quien compra las revisa y las agrega a una solicitud de compra abierta.
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "framer-motion";
import { Lightbulb, Plus, Search, X } from "lucide-react";
import { api } from "./produccion/util";
import { useToast } from "./produccion/useToast";
import { Vacio } from "./produccion/ui";
import TarjetaSugerencia from "./sugerencias/TarjetaSugerencia";
import FormularioSugerencia from "./sugerencias/FormularioSugerencia";
import AgregarASolicitud from "./sugerencias/AgregarASolicitud";
import FichaSugerencia from "./sugerencias/FichaSugerencia";
import { idSC, norm } from "./sugerencias/util";

const EASE = [0.22, 1, 0.36, 1];

export default function SugerenciasCompra() {
  const { mostrar: toast, nodo: toastNodo } = useToast();
  const [datos, setDatos] = useState({ sugerencias: [], puede_gestionar: false, yo: null });
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [filtro, setFiltro] = useState("PENDIENTE");
  const [busqueda, setBusqueda] = useState("");

  const [materias, setMaterias] = useState([]);
  const [cargandoMaterias, setCargandoMaterias] = useState(false);
  const [form, setForm] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [ficha, setFicha] = useState(null); // id
  const [agregando, setAgregando] = useState(null); // sugerencia
  const [agregarKey, setAgregarKey] = useState(0);
  const [abiertas, setAbiertas] = useState({ lista: [], cargando: false });
  const [proveedores, setProveedores] = useState([]);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const d = await api("/api/sugerencias-compra");
      setDatos({ sugerencias: d.sugerencias || [], puede_gestionar: !!d.puede_gestionar, yo: d.yo || null });
      setErrorCarga("");
    } catch (e) {
      setErrorCarga(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    // Carga inicial: el estado se actualiza al llegar la respuesta.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  const abrirForm = async () => {
    setFormKey((k) => k + 1);
    setForm(true);
    setCargandoMaterias(true);
    try {
      setMaterias(await api("/api/sugerencias-compra/materias"));
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setCargandoMaterias(false);
    }
  };

  const abrirAgregar = async (s) => {
    setAgregarKey((k) => k + 1);
    setAgregando(s);
    setAbiertas({ lista: [], cargando: true });
    try {
      const [sol, prov] = await Promise.all([api("/api/sugerencias-compra/solicitudes-abiertas"), api("/api/proveedores").catch(() => [])]);
      setAbiertas({ lista: sol, cargando: false });
      setProveedores(Array.isArray(prov) ? prov : []);
    } catch (e) {
      setAbiertas({ lista: [], cargando: false });
      toast(e.message, "error");
    }
  };

  const enviar = async (cuerpo) => {
    await api("/api/sugerencias-compra", { method: "POST", body: cuerpo });
    setForm(false);
    setFiltro("PENDIENTE");
    toast("Sugerencia enviada");
    await cargar(true);
  };

  const agregar = async (cuerpo) => {
    const r = await api(`/api/sugerencias-compra/${agregando.id}/agregar`, { method: "POST", body: cuerpo });
    setAgregando(null);
    setFicha(null);
    toast(`Agregada a ${idSC(r.solicitud_id)}`);
    await cargar(true);
  };

  const descartar = async (s, motivo) => {
    try {
      await api(`/api/sugerencias-compra/${s.id}/descartar`, { method: "POST", body: { motivo } });
      setFicha(null);
      toast("Sugerencia descartada");
      await cargar(true);
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const cuentas = useMemo(() => {
    const c = { PENDIENTE: 0, AGREGADA: 0, DESCARTADA: 0 };
    for (const s of datos.sugerencias) c[s.estado] = (c[s.estado] || 0) + 1;
    return c;
  }, [datos.sugerencias]);

  const lista = useMemo(() => {
    const t = norm(busqueda);
    const r = datos.sugerencias.filter((s) => s.estado === filtro && (!t || norm(`${s.mp_codigo} ${s.mp_nombre} ${s.sugerida_por} ${s.motivo || ""}`).includes(t)));
    return filtro === "PENDIENTE" ? [...r].sort((a, b) => b.urgencia - a.urgencia || a.id - b.id) : r;
  }, [datos.sugerencias, filtro, busqueda]);

  const urgentes = datos.sugerencias.filter((s) => s.estado === "PENDIENTE" && s.urgencia >= 4).length;
  const abierta = datos.sugerencias.find((s) => s.id === ficha) || null;
  const PILDORAS = [
    { v: "PENDIENTE", t: "Pendientes", n: cuentas.PENDIENTE, alerta: true },
    { v: "AGREGADA", t: "Agregadas", n: cuentas.AGREGADA },
    { v: "DESCARTADA", t: "Descartadas", n: cuentas.DESCARTADA },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <div className="h-full overflow-y-auto custom-scrollbar bg-black text-zinc-200 relative selection:bg-[#FF5A00]/30">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(60%_100%_at_15%_0%,rgba(255,90,0,0.16),transparent_70%),radial-gradient(40%_80%_at_95%_0%,rgba(255,214,10,0.07),transparent_70%)]" />
        <div className="relative max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-9 pb-40 sm:pb-24">
          <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <div className="mr-auto min-w-0">
              <h1 className="text-[34px] sm:text-5xl font-extrabold tracking-tight text-white leading-none">Sugerencias <span className="text-[#FF5A00]">de compra</span></h1>
              <p className="mt-2.5 text-[15px] text-zinc-500">
                {cargando ? "Cargando…" : (<><b className="text-zinc-200 font-bold">{cuentas.PENDIENTE}</b> {cuentas.PENDIENTE === 1 ? "pendiente" : "pendientes"}{urgentes > 0 && <> · <span className="font-bold text-rose-300">{urgentes} {urgentes === 1 ? "urgente" : "urgentes"}</span></>}</>)}
              </p>
            </div>
            <button onClick={abrirForm} className="hidden sm:inline-flex min-h-[46px] px-5 rounded-xl bg-[#FFD60A] text-black text-sm font-extrabold items-center gap-2 hover:bg-white active:scale-[0.98] transition-all cursor-pointer shadow-[0_10px_30px_rgba(255,214,10,0.2)]">
              <Plus size={18} strokeWidth={3} /> Sugerir compra
            </button>
          </motion.header>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.08 }} className="mt-6 flex flex-wrap items-center gap-3">
            <LayoutGroup id="sug-pildoras">
              <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1" role="tablist" aria-label="Estado">
                {PILDORAS.map((p) => {
                  const sel = filtro === p.v;
                  return (
                    <button key={p.v} role="tab" aria-selected={sel} onClick={() => setFiltro(p.v)} className={`relative shrink-0 min-h-[40px] px-4 rounded-full text-sm font-bold cursor-pointer border transition-colors ${sel ? "border-transparent text-black" : "border-white/[0.09] text-zinc-400 hover:text-white bg-white/[0.03]"}`}>
                      {sel && <motion.span layoutId="sug-pildora-fondo" className={`absolute inset-0 rounded-full ${p.alerta ? "bg-[#FF5A00]" : "bg-[#FFD60A]"}`} transition={{ duration: 0.35, ease: EASE }} />}
                      <span className="relative inline-flex items-center gap-2">{p.t}<span className={`tabular-nums text-xs ${sel ? "text-black/70" : "text-zinc-600"}`}>{p.n}</span></span>
                    </button>
                  );
                })}
              </div>
            </LayoutGroup>
            <div className="relative w-full sm:w-72 sm:ml-auto">
              <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar…" className="w-full min-h-[44px] rounded-xl bg-white/[0.05] border border-white/[0.08] focus:border-[#FF5A00]/60 pl-10 pr-10 text-[15px] text-white placeholder:text-zinc-600 outline-none transition-colors" />
              {busqueda && <button onClick={() => setBusqueda("")} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] cursor-pointer"><X size={15} /></button>}
            </div>
          </motion.div>

          <div className="mt-6">
            {errorCarga && !datos.sugerencias.length ? (
              <Vacio icono={Lightbulb} titulo="No se pudieron cargar las sugerencias" texto={errorCarga}>
                <button onClick={() => cargar()} className="min-h-[46px] px-5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] font-bold text-white cursor-pointer">Reintentar</button>
              </Vacio>
            ) : cargando ? (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[210px] rounded-3xl bg-white/[0.04] animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />)}
              </div>
            ) : lista.length === 0 ? (
              <Vacio icono={Lightbulb} titulo={busqueda ? "No hay sugerencias con esa búsqueda" : filtro === "PENDIENTE" ? "No hay sugerencias pendientes" : filtro === "AGREGADA" ? "Todavía no se agregó ninguna a una solicitud" : "No hay sugerencias descartadas"} texto={filtro === "PENDIENTE" && !busqueda ? "Cuando falte algo, sugerí comprarlo y le llega el aviso a quien compra." : undefined}>
                {filtro === "PENDIENTE" && !busqueda && <button onClick={abrirForm} className="min-h-[46px] px-5 rounded-xl bg-[#FFD60A] text-black font-extrabold cursor-pointer inline-flex items-center gap-2"><Plus size={18} strokeWidth={3} /> Sugerir compra</button>}
              </Vacio>
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                <AnimatePresence mode="popLayout">
                  {lista.map((s, i) => <TarjetaSugerencia key={s.id} s={s} indice={i} onAbrir={(x) => setFicha(x.id)} />)}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {!form && !ficha && !agregando && (
            <motion.button initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 24 }} onClick={abrirForm} aria-label="Sugerir compra" className="sm:hidden fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 w-16 h-16 rounded-full bg-[#FFD60A] text-black grid place-items-center shadow-[0_14px_40px_rgba(255,214,10,0.35)] active:scale-95 cursor-pointer">
              <Plus size={30} strokeWidth={3} />
            </motion.button>
          )}
        </AnimatePresence>

        <FormularioSugerencia key={`f${formKey}`} abierto={form} materias={materias} cargando={cargandoMaterias} onCerrar={() => setForm(false)} onEnviar={enviar} />
        <FichaSugerencia s={abierta} puedeGestionar={datos.puede_gestionar} yoId={datos.yo?.id} onCerrar={() => setFicha(null)} onAgregar={abrirAgregar} onDescartar={descartar} />
        <AgregarASolicitud key={`a${agregarKey}`} abierto={!!agregando} sugerencia={agregando} solicitudes={abiertas.lista} proveedores={proveedores} cargando={abiertas.cargando} onCerrar={() => setAgregando(null)} onAgregar={agregar} />
        {toastNodo}
      </div>
    </MotionConfig>
  );
}
