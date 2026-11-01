// Solicitudes de compra: pedir materiales, recibirlos (suma al stock de la materia prima), firmar y exportar a PDF.
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, Loader2, Plus, RefreshCw, Search, X } from "lucide-react";
import { api } from "./produccion/util";
import { useToast } from "./produccion/useToast";
import Confirmacion from "./ingenieria/Confirmacion";
import FirmaSolicitudPublica from "./FirmaSolicitudPublica";
import FormularioSolicitud from "./compras/FormularioSolicitud";
import RecepcionSolicitud from "./compras/RecepcionSolicitud";
import FirmasModal from "./compras/FirmasModal";
import SolicitudPDF from "./compras/SolicitudPDF";
import { CSS_IMPRESION } from "./compras/impresion";
import TarjetaSC from "./compras/TarjetaSC";
import TablaSC from "./compras/TablaSC";
import DetalleSC from "./compras/DetalleSC";
import { avance, cerradaSC as cerrada, faltaFirma as sinFirmar, norm, nroSC } from "./compras/formato";
const PASO = 24;
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
  const [detalleId, setDetalleId] = useState(null);
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
  const detalle = lista.find((s) => s.id === detalleId) || null;
  const abrirRecibir = (sc) => {
    setDetalleId(null);
    setRecepcionId(sc.id);
  };
  const cambiarFiltro = (f) => {
    setFiltro(f);
    setLimite(PASO);
  };

  const botonNueva = (
    <button type="button" onClick={() => setForm({ k: Date.now(), solicitud: null })} className="inline-flex items-center justify-center gap-2 min-h-[52px] px-6 rounded-2xl bg-[#FFD60A] text-black font-extrabold text-base shadow-[0_10px_30px_rgba(255,214,10,0.2)] hover:bg-white active:scale-[0.98] transition-all cursor-pointer">
      <Plus size={22} strokeWidth={3} /> <span className="hidden min-[400px]:inline">Nueva solicitud</span><span className="min-[400px]:hidden">Nueva</span>
    </button>
  );

  return (
    <div className="h-full overflow-y-auto custom-scrollbar print:h-auto print:overflow-visible print:bg-white">
      <style>{CSS_IMPRESION}</style>

      <div className="print-hidden max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-36 lg:pb-10">
        <header className="flex items-end justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h1 className="text-[26px] sm:text-3xl font-extrabold tracking-tight text-white leading-none">Solicitudes de compra</h1>
            <p className="mt-2 text-sm text-zinc-500">
              {conteo.abiertas ? `${conteo.abiertas} ${conteo.abiertas === 1 ? "pendiente" : "pendientes"}${conteo.urgentes ? ` · ${conteo.urgentes} ${conteo.urgentes === 1 ? "urgente" : "urgentes"}` : ""}${conteo.sinfirma ? ` · ${conteo.sinfirma} sin firmar` : ""}.` : "Pedí materiales, registrá lo que llega y mantené el stock al día."}
            </p>
          </div>
          <div className="hidden lg:flex items-center gap-2 shrink-0">
            <button type="button" onClick={cargar} aria-label="Recargar" title="Recargar" className="w-[52px] h-[52px] grid place-items-center rounded-2xl border border-white/[0.1] bg-white/[0.04] text-zinc-300 hover:text-white cursor-pointer"><RefreshCw size={18} className={cargando ? "animate-spin text-[#FF5A00]" : ""} /></button>
            {botonNueva}
          </div>
        </header>

        <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-2 pb-3 bg-[#08080a]/92 backdrop-blur-md">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative lg:w-[280px] shrink-0">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimite(PASO); }} placeholder="Buscar por número, artículo, proveedor u O.C.…" aria-label="Buscar" className="w-full min-h-[52px] rounded-2xl bg-[#17171c] border border-white/[0.1] pl-11 pr-11 text-base text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF5A00]/70 transition-colors" />
              {q && <button type="button" onClick={() => setQ("")} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl grid place-items-center text-zinc-500 hover:text-white cursor-pointer"><X size={17} /></button>}
            </div>
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5 flex-1" role="tablist" aria-label="Filtrar">
                {FILTROS.map((f) => {
                  const sel = filtro === f.id;
                  const n = f.id === "todas" ? lista.length : conteo[f.id];
                  return (
                    <button key={f.id} role="tab" aria-selected={sel} onClick={() => cambiarFiltro(f.id)} className={`shrink-0 min-h-[46px] pl-4 pr-3 lg:min-h-[42px] lg:pl-3.5 lg:pr-2.5 rounded-full border text-[14.5px] font-bold inline-flex items-center gap-2 cursor-pointer transition-colors ${sel ? "bg-[#FF5A00] border-[#FF5A00] text-black" : "bg-white/[0.04] border-white/[0.09] text-zinc-300 hover:text-white hover:bg-white/[0.08]"}`}>
                      {f.label}
                      <span className={`min-w-[24px] h-6 px-1.5 rounded-full grid place-items-center text-xs font-extrabold tabular-nums ${sel ? "bg-black/80 text-[#FFD60A]" : "bg-white/[0.09] text-zinc-300"}`}>{n}</span>
                    </button>
                  );
                })}
              </div>
              <select value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Ordenar" className="hidden lg:block shrink-0 min-h-[42px] rounded-full bg-white/[0.04] border border-white/[0.09] px-4 text-sm font-bold text-zinc-300 focus:outline-none cursor-pointer">
                {ORDENES.map((o) => <option key={o.id} value={o.id} className="bg-[#111114]">{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-100 flex items-start gap-3 mt-3">
            <AlertTriangle className="shrink-0 mt-0.5" size={20} />
            <div><b>No se pudo cargar.</b><p className="text-sm mt-1">{error}</p><button type="button" onClick={cargar} className="mt-3 min-h-[44px] px-4 rounded-xl bg-white/10 font-bold cursor-pointer">Reintentar</button></div>
          </div>
        )}

        <div className="mt-3">
          {!solicitudes ? (
            <div className="flex items-center justify-center gap-3 py-28 text-zinc-500" aria-busy="true"><Loader2 className="animate-spin" size={22} /> Cargando solicitudes…</div>
          ) : visibles.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/[0.12] bg-white/[0.02] py-16 px-6 text-center">
              <span className="w-16 h-16 mx-auto rounded-3xl grid place-items-center bg-white/[0.05] text-zinc-500 mb-4"><ClipboardList size={28} /></span>
              <p className="text-lg font-extrabold text-zinc-200">{lista.length ? "No hay solicitudes con ese filtro" : "Todavía no hay solicitudes"}</p>
              <p className="mt-1 text-sm text-zinc-500 max-w-sm mx-auto">{lista.length ? "Probá con otra búsqueda o cambiá el filtro." : "Creá la primera con “Nueva solicitud”."}</p>
            </div>
          ) : (
            <>
              <div className="hidden lg:block">
                <TablaSC solicitudes={mostrados} onAbrir={(s) => setDetalleId(s.id)} onRecibir={abrirRecibir} />
              </div>
              <ul className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3 lg:hidden">
                {mostrados.map((sc, i) => <TarjetaSC key={sc.id} sc={sc} indice={i} onAbrir={(s) => setDetalleId(s.id)} onRecibir={abrirRecibir} />)}
              </ul>
              {visibles.length > limite && (
                <div className="mt-5 text-center">
                  <button type="button" onClick={() => setLimite((l) => l + PASO)} className="min-h-[52px] px-8 rounded-2xl border border-white/[0.1] bg-white/[0.05] text-base font-bold text-zinc-200 hover:bg-white/[0.1] cursor-pointer">Ver más ({visibles.length - limite})</button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="lg:hidden fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30">{botonNueva}</div>

        {detalle && (
          <DetalleSC
            key={detalle.id}
            sc={detalle}
            onCerrar={() => setDetalleId(null)}
            onRecibir={abrirRecibir}
            onEditar={(s) => { setDetalleId(null); setForm({ k: Date.now(), solicitud: s }); }}
            onFirmas={(s) => { setDetalleId(null); setFirmasDe(s); }}
            onPDF={(s) => { setDetalleId(null); imprimir(s); }}
            proveedores={proveedores}
            onCorregir={async (item, datos) => {
              try {
                await api(`/api/compras/items/${item.id}/pedido`, { method: "PATCH", body: datos });
                await cargar();
                avisar("Pedido corregido", item.articulo);
                return true;
              } catch (e) {
                toast(e.message, "error");
                return false;
              }
            }}
            onEliminar={async (s, forzar) => {
              try {
                await api(`/api/compras/solicitudes/${s.id}${forzar ? "?forzar=1" : ""}`, { method: "DELETE" });
                setDetalleId(null);
                await cargar();
                avisar("Solicitud eliminada", nroSC(s.id));
                return true;
              } catch (e) {
                toast(e.message, "error");
                return false;
              }
            }}
          />
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
