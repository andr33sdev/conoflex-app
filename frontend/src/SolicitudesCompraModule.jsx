// Solicitudes de compra: pedir materiales, recibirlos (suma al stock de la materia prima), firmar y exportar a PDF.
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardList, Flame, Loader2, PackagePlus, PenLine, Pencil, Plus, Printer, RefreshCw, Search, ShoppingCart, X } from "lucide-react";
import { api } from "./produccion/util";
import { useToast } from "./produccion/useToast";
import Confirmacion from "./ingenieria/Confirmacion";
import FirmaSolicitudPublica from "./FirmaSolicitudPublica";
import FormularioSolicitud from "./compras/FormularioSolicitud";
import RecepcionSolicitud from "./compras/RecepcionSolicitud";
import FirmasModal from "./compras/FirmasModal";
import SolicitudPDF from "./compras/SolicitudPDF";
import { CSS_IMPRESION } from "./compras/impresion";
import { avance, formatFecha, norm, nroSC } from "./compras/formato";

const suave = [0.2, 0.8, 0.2, 1];
const PASO = 30;
const FILTROS = [
  { id: "todas", label: "Todas" },
  { id: "abiertas", label: "Pendientes" },
  { id: "urgentes", label: "Urgentes" },
  { id: "sinfirma", label: "Sin firmar" },
  { id: "completas", label: "Completadas" },
];
const ORDENES = [
  { id: "nuevas", label: "Más nuevas" },
  { id: "viejas", label: "Más viejas" },
  { id: "fecha", label: "Por fecha" },
  { id: "estado", label: "Por estado" },
];

const cerrada = (sc) => sc.estado === "COMPLETADA" || sc.estado === "CANCELADA";
const sinFirmar = (sc) => !sc.firma_jefe || !sc.firma_gerente;

const Dato = ({ icono: Icono, t, v, tono = "text-white" }) => (
  <div className="rounded-2xl border border-white/[0.07] bg-[#111114] px-4 py-3">
    <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-zinc-500 flex items-center gap-1.5">{Icono && <Icono size={13} />}{t}</p>
    <p className={`mt-1 text-2xl font-extrabold tabular-nums ${tono}`}>{v}</p>
  </div>
);

function ChipEstado({ estado }) {
  const c = estado === "COMPLETADA" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : estado === "CANCELADA" ? "border-rose-500/40 bg-rose-500/10 text-rose-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300";
  const t = estado === "COMPLETADA" ? "Completada" : estado === "CANCELADA" ? "Cancelada" : "Pendiente";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-extrabold ${c}`}>{t}</span>;
}

function ChipFirma({ rol, firmada }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${firmada ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-white/[0.1] text-zinc-500"}`}>
      {firmada ? <CheckCircle2 size={12} /> : <PenLine size={12} />} {rol}
    </span>
  );
}

function Boton({ icono: Icono, children, onClick, etiqueta, primario }) {
  return (
    <button onClick={onClick} aria-label={etiqueta} title={etiqueta} className={`min-h-[44px] rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold cursor-pointer transition-colors ${children ? "px-3.5" : "w-11"} ${primario ? "bg-[#FFD60A] text-black hover:bg-white font-extrabold" : "bg-white/[0.06] text-zinc-200 hover:bg-white/[0.12] hover:text-white"}`}>
      <Icono size={16} />{children}
    </button>
  );
}

function Tarjeta({ sc, i, onRecibir, onEditar, onFirmas, onPDF }) {
  const av = avance(sc);
  const urgente = !cerrada(sc) && av.maxPrioridad >= 4;
  const nombres = sc.items.map((x) => x.articulo);
  return (
    <motion.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.03, ease: suave }} className={`rounded-2xl border bg-[#111114] p-4 sm:p-5 ${urgente ? "border-rose-500/30" : "border-white/[0.07]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-lg font-extrabold text-white tabular-nums">{nroSC(sc.id)}</h3>
            <ChipEstado estado={sc.estado} />
            {urgente && <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-xs font-extrabold text-rose-300"><Flame size={12} /> Urgente</span>}
          </div>
          <p className="text-sm text-zinc-500 mt-1">{formatFecha(sc.fecha)} · {sc.items.length} {sc.items.length === 1 ? "artículo" : "artículos"}</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <ChipFirma rol="Jefe" firmada={!!sc.firma_jefe} />
          <ChipFirma rol="Gerente" firmada={!!sc.firma_gerente} />
        </div>
      </div>

      <p className="text-sm text-zinc-300 mt-3 line-clamp-2 leading-relaxed" title={nombres.join(", ")}>{nombres.join(" · ")}</p>

      <div className="mt-3.5 flex items-center gap-3">
        <div className="h-2 flex-1 rounded-full bg-white/[0.07] overflow-hidden" role="progressbar" aria-valuenow={av.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de recepción">
          <div className={`h-full rounded-full ${av.pct >= 100 ? "bg-emerald-500" : "bg-[#FF5A00]"}`} style={{ width: `${av.pct}%` }} />
        </div>
        <span className="text-sm font-extrabold text-zinc-200 tabular-nums w-11 text-right">{av.pct}%</span>
        <span className="text-xs text-zinc-500 hidden sm:inline">{av.completos}/{sc.items.length} completos</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Boton icono={PackagePlus} onClick={() => onRecibir(sc)} primario>Recibir</Boton>
        <Boton icono={Pencil} onClick={() => onEditar(sc)} etiqueta="Editar solicitud">Editar</Boton>
        <Boton icono={PenLine} onClick={() => onFirmas(sc)} etiqueta="Firmar o compartir para firma">Firmas</Boton>
        <Boton icono={Printer} onClick={() => onPDF(sc)} etiqueta="Exportar a PDF">PDF</Boton>
      </div>
    </motion.article>
  );
}

export default function SolicitudesCompraModule() {
  const [solicitudes, setSolicitudes] = useState(null);
  const [proveedores, setProveedores] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const { mostrar: toast, nodo: toastNodo } = useToast();
  const [conf, setConf] = useState(null);

  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [orden, setOrden] = useState("nuevas");
  const [limite, setLimite] = useState(PASO);

  const [form, setForm] = useState(null); // { k, solicitud }
  const [recepcionId, setRecepcionId] = useState(null);
  const [firmasDe, setFirmasDe] = useState(null);
  const [firmaManual, setFirmaManual] = useState(null);
  const [imprimiendo, setImprimiendo] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [sc, pr, mp] = await Promise.all([api("/api/compras/solicitudes"), api("/api/proveedores").catch(() => []), api("/api/materias-primas").catch(() => [])]);
      setSolicitudes(Array.isArray(sc) ? sc : []);
      setProveedores(Array.isArray(pr) ? pr : []);
      setMaterias(Array.isArray(mp) ? mp : []);
      setError("");
    } catch (e) {
      setError(e.message);
      setSolicitudes((s) => s || []);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    Promise.resolve().then(() => vivo && cargar());
    return () => {
      vivo = false;
    };
  }, [cargar]);

  const avisar = (texto, detalle) => {
    setConf({ texto, detalle });
    setTimeout(() => setConf(null), 1700);
  };

  const lista = useMemo(() => solicitudes || [], [solicitudes]);
  const conteo = useMemo(
    () => ({
      abiertas: lista.filter((s) => !cerrada(s)).length,
      completas: lista.filter((s) => s.estado === "COMPLETADA").length,
      sinfirma: lista.filter((s) => !cerrada(s) && sinFirmar(s)).length,
      urgentes: lista.filter((s) => !cerrada(s) && avance(s).maxPrioridad >= 4).length,
    }),
    [lista],
  );

  const visibles = useMemo(() => {
    const t = norm(q);
    const f = lista.filter((sc) => {
      if (filtro === "abiertas" && cerrada(sc)) return false;
      if (filtro === "completas" && sc.estado !== "COMPLETADA") return false;
      if (filtro === "sinfirma" && (cerrada(sc) || !sinFirmar(sc))) return false;
      if (filtro === "urgentes" && (cerrada(sc) || avance(sc).maxPrioridad < 4)) return false;
      if (!t) return true;
      return norm(`${sc.id} ${nroSC(sc.id)} ${sc.items.map((i) => `${i.articulo} ${i.proveedor || ""} ${i.numero_oc || ""}`).join(" ")}`).includes(t);
    });
    const por = {
      nuevas: (a, b) => b.id - a.id,
      viejas: (a, b) => a.id - b.id,
      fecha: (a, b) => new Date(b.fecha) - new Date(a.fecha) || b.id - a.id,
      estado: (a, b) => String(a.estado).localeCompare(String(b.estado)) || b.id - a.id,
    }[orden];
    return [...f].sort(por);
  }, [lista, q, filtro, orden]);

  const recepcion = lista.find((s) => s.id === recepcionId) || null;

  const imprimir = (sc) => {
    setImprimiendo(sc);
    setTimeout(() => {
      window.print();
      setImprimiendo(null);
    }, 300);
  };

  const whatsapp = (scId, rol) => {
    const enlaceFirma = `${window.location.origin}/?firmar_sc=${scId}&rol=${rol}`;
    const rolTexto = rol === "gerente" ? "Gerente de Producción (Autorización)" : "Jefe de Producción (Solicitud)";
    const mensaje = `Hola, te comparto la Solicitud de Compra Nº SC-${String(scId).padStart(5, "0")} para tu revisión y firma digital como ${rolTexto}:\n\n${enlaceFirma}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(mensaje)}`, "_blank");
  };

  const mostrados = visibles.slice(0, limite);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar print:h-auto print:overflow-visible print:bg-white">
      <style>{CSS_IMPRESION}</style>

      <div className="print-hidden max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 pb-28 lg:pb-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div className="flex items-stretch gap-3">
            <span aria-hidden className="block w-[3px] rounded-full shrink-0" style={{ backgroundImage: "repeating-linear-gradient(to bottom,#FFD60A 0 7px,transparent 7px 12px)" }} />
            <div>
              <h1 className="cf-h1-largo text-2xl sm:text-3xl font-extrabold uppercase text-white">Solicitudes de compra</h1>
              <p className="mt-1 text-sm text-zinc-400">Pedí materiales, registrá lo que llega y mantené el stock al día.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setForm({ k: Date.now(), solicitud: null })} className="min-h-[46px] px-5 rounded-2xl bg-[#FFD60A] text-black text-sm font-extrabold inline-flex items-center gap-2 hover:bg-white transition-colors cursor-pointer"><Plus size={17} /> Nueva solicitud</button>
            <button onClick={cargar} aria-label="Recargar" title="Recargar" className="w-[46px] h-[46px] grid place-items-center rounded-2xl border border-white/[0.1] bg-white/[0.04] text-zinc-300 hover:text-white cursor-pointer"><RefreshCw size={17} className={cargando ? "animate-spin text-[#FF5A00]" : ""} /></button>
          </div>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Dato icono={ShoppingCart} t="Pendientes" v={conteo.abiertas} tono={conteo.abiertas ? "text-[#FFD60A]" : "text-white"} />
          <Dato icono={Flame} t="Urgentes" v={conteo.urgentes} tono={conteo.urgentes ? "text-rose-300" : "text-white"} />
          <Dato icono={PenLine} t="Sin firmar" v={conteo.sinfirma} tono={conteo.sinfirma ? "text-[#FF5A00]" : "text-white"} />
          <Dato icono={CheckCircle2} t="Completadas" v={conteo.completas} tono="text-emerald-300" />
        </div>

        <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 mb-4 bg-[#09090b]/90 backdrop-blur-md border-b border-white/[0.05]">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setLimite(PASO); }} placeholder="Buscar por número, artículo, proveedor u O.C.…" aria-label="Buscar" className="w-full min-h-[48px] rounded-2xl bg-[#17171c] border border-white/[0.1] pl-11 pr-11 text-[15px] text-white placeholder:text-zinc-600 outline-none focus:border-[#FF5A00]/70" />
            {q && <button onClick={() => setQ("")} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-lg text-zinc-500 hover:text-white cursor-pointer"><X size={16} /></button>}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5 flex-1 min-w-0" role="tablist" aria-label="Filtrar">
              {FILTROS.map((f) => (
                <button key={f.id} role="tab" aria-selected={filtro === f.id} onClick={() => { setFiltro(f.id); setLimite(PASO); }} className={`shrink-0 min-h-[38px] px-4 rounded-full text-sm font-bold border transition-colors cursor-pointer ${filtro === f.id ? "bg-[#FF5A00] border-[#FF5A00] text-white" : "bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white"}`}>{f.label}</button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-100 flex items-start gap-3 mb-4">
            <AlertTriangle className="shrink-0 mt-0.5" size={20} />
            <div><b>No se pudo cargar.</b><p className="text-sm mt-1">{error}</p><button onClick={cargar} className="mt-3 min-h-[44px] px-4 rounded-xl bg-white/10 font-bold cursor-pointer">Reintentar</button></div>
          </div>
        )}

        {!solicitudes ? (
          <div className="flex items-center justify-center gap-2 py-20 text-zinc-500 text-sm" aria-busy="true"><Loader2 className="animate-spin" size={18} /> Cargando solicitudes…</div>
        ) : visibles.length === 0 ? (
          <div className="flex flex-col items-center text-center py-16 px-6">
            <span className="w-14 h-14 rounded-2xl grid place-items-center bg-white/[0.05] text-zinc-500 mb-4"><ClipboardList size={26} /></span>
            <p className="text-base font-bold text-zinc-200">{lista.length ? "No hay solicitudes con ese filtro" : "Todavía no hay solicitudes"}</p>
            <p className="text-sm text-zinc-500 mt-1">{lista.length ? "Probá con otra búsqueda o cambiá el filtro." : "Creá la primera con “Nueva solicitud”."}</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-sm text-zinc-500">{visibles.length} {visibles.length === 1 ? "solicitud" : "solicitudes"}</p>
              <select value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Ordenar" className="shrink-0 min-h-[38px] rounded-full bg-white/[0.04] border border-white/[0.08] px-3 text-sm font-bold text-zinc-300 focus:outline-none cursor-pointer">
              {ORDENES.map((o) => <option key={o.id} value={o.id} className="bg-[#111114]">{o.label}</option>)}
            </select>
            </div>
            <div className="space-y-3">
              {mostrados.map((sc, i) => (
                <Tarjeta key={sc.id} sc={sc} i={i} onRecibir={(s) => setRecepcionId(s.id)} onEditar={(s) => setForm({ k: Date.now(), solicitud: s })} onFirmas={setFirmasDe} onPDF={imprimir} />
              ))}
            </div>
            {visibles.length > limite && (
              <button onClick={() => setLimite((l) => l + PASO)} className="mt-4 w-full min-h-[52px] rounded-2xl border border-white/[0.1] bg-white/[0.04] text-zinc-200 font-bold hover:bg-white/[0.08] cursor-pointer inline-flex items-center justify-center gap-2">Mostrar {Math.min(PASO, visibles.length - limite)} más <ChevronRight size={16} /></button>
            )}
          </>
        )}

        {form && (
          <FormularioSolicitud
            key={form.k}
            abierto
            solicitud={form.solicitud}
            materias={materias}
            proveedores={proveedores}
            onCerrar={() => setForm(null)}
            onGuardado={(nueva, id) => {
              setForm(null);
              cargar();
              avisar(nueva ? "¡Solicitud creada!" : "¡Cambios guardados!", nroSC(id));
            }}
            toast={toast}
          />
        )}

        <RecepcionSolicitud abierto={recepcionId != null} solicitud={recepcion} materias={materias} onCerrar={() => setRecepcionId(null)} onCambio={cargar} toast={toast} />

        <FirmasModal
          solicitud={firmasDe ? lista.find((s) => s.id === firmasDe.id) || firmasDe : null}
          onCerrar={() => setFirmasDe(null)}
          onWhatsApp={whatsapp}
          onFirmar={(id, rol) => {
            setFirmasDe(null);
            setFirmaManual({ id, rol });
          }}
        />

        {firmaManual && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/85 p-4 overflow-y-auto">
            <div className="w-full max-w-xl">
              <FirmaSolicitudPublica
                id={firmaManual.id}
                rol={firmaManual.rol}
                onVolver={() => {
                  setFirmaManual(null);
                  cargar();
                }}
              />
            </div>
          </div>
        )}

        <Confirmacion texto={conf?.texto} detalle={conf?.detalle} />
        {toastNodo}
      </div>

      <SolicitudPDF solicitud={imprimiendo} />
    </div>
  );
}
