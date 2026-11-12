// Un desarrollo: encabezado con su avance, lo que te toca hacer y las secciones del proyecto.
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, BadgeCheck, Check, ChevronDown, ClipboardList, FileImage, FlaskConical, History, Loader2, Megaphone, Package, Printer, ShieldCheck } from "lucide-react";
import { api } from "../produccion/util";
import { ImagenPrivada } from "./util";
import { ESTADOS, ORIGENES, botonPrimario, campo, fechaCorta } from "./formato";
import Bitacora from "./Bitacora";
import Etapas from "./Etapas";
import Archivos from "./Archivos";
import Pruebas from "./Pruebas";
import Producto from "./Producto";
import Difusion from "./Difusion";
import RevisionIso from "./RevisionIso";
import ImprimirR032 from "./ImprimirR032";

const SECCIONES = [
  { id: "bitacora", texto: "Bitácora", icono: History },
  { id: "etapas", texto: "Etapas", icono: ClipboardList },
  { id: "archivos", texto: "Archivos", icono: FileImage },
  { id: "pruebas", texto: "Pruebas", icono: FlaskConical, soloNuevo: true },
  { id: "producto", texto: "Producto", icono: Package },
  { id: "difusion", texto: "Difusión", icono: Megaphone },
];

export default function Proyecto({ id, onVolver, aviso }) {
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  const [seccion, setSeccion] = useState("bitacora");
  const [usuarios, setUsuarios] = useState([]);
  const [menu, setMenu] = useState(false);
  const [iso, setIso] = useState(false);
  const [imprimir, setImprimir] = useState(false);

  const cargar = useCallback(
    () =>
      api(`/api/desarrollo/proyectos/${id}`)
        .then((d) => {
          setP(d);
          setError(null);
        })
        .catch((e) => setError(e.message)),
    [id],
  );
  useEffect(() => {
    cargar();
    api("/api/desarrollo/usuarios").then(setUsuarios).catch(() => {});
  }, [cargar]);

  const accion = async (fn, ok) => {
    try {
      await fn();
      if (ok) aviso(ok);
      await cargar();
      return true;
    } catch (e) {
      aviso(e.message, "error");
      return false;
    }
  };
  const cambiarEstado = (estado, texto) => {
    setMenu(false);
    accion(() => api(`/api/desarrollo/proyectos/${id}`, { method: "PUT", body: { estado } }), texto);
  };

  if (error) {
    return (
      <div className="flex-1 grid place-items-center p-6 text-center">
        <div>
          <p className="text-zinc-300">{error}</p>
          <button onClick={onVolver} className="mt-4 text-sm text-[#FF5A00] cursor-pointer">Volver a la lista</button>
        </div>
      </div>
    );
  }
  if (!p) return <div className="flex-1 grid place-items-center text-zinc-500"><Loader2 className="animate-spin" /></div>;

  const secciones = SECCIONES.filter((s) => !s.soloNuevo || p.tipo !== "MODIFICACION");
  const etapasCuentan = p.etapas.filter((e) => e.etapa !== "CAMBIOS");
  const props = { p, recargar: cargar, accion, aviso, usuarios };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="shrink-0 border-b border-zinc-800 bg-[#080808]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
          <div className="flex items-start gap-3">
            <button onClick={onVolver} aria-label="Volver a la lista" className="mt-1 w-9 h-9 grid place-items-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer shrink-0"><ArrowLeft size={18} /></button>
            {p.portada_id && <ImagenPrivada id={p.portada_id} alt="" className="hidden sm:block w-16 h-16 rounded-xl object-cover border border-zinc-800 shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-500 font-medium">
                {p.codigo} · {p.tipo === "MODIFICACION" ? "Modificación" : "Producto nuevo"}
                {p.origen && ` · lo pide ${ORIGENES[p.origen]?.toLowerCase()}${p.cliente ? ` (${p.cliente})` : ""}`}
              </p>
              <h1 className="text-xl sm:text-2xl font-semibold text-white leading-tight mt-0.5">{p.nombre}</h1>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs">
                <span className={`font-semibold px-2 py-0.5 rounded-full border ${ESTADOS[p.estado]?.clase}`}>{ESTADOS[p.estado]?.texto}</span>
                <button onClick={() => setIso(true)} className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full border cursor-pointer ${p.iso.completo ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`} title="Qué pide el procedimiento P-11 y qué falta">
                  <ShieldCheck size={13} /> ISO {p.iso.ok}/{p.iso.total}
                </button>
                {p.responsable_nombre && <span className="text-zinc-500">Responsable: {p.responsable_nombre}</span>}
                {p.fecha_objetivo && p.estado === "EN_CURSO" && <span className="text-zinc-500">Objetivo: {fechaCorta(p.fecha_objetivo)}</span>}
                {p.fecha_lanzamiento && <span className="text-zinc-500">Lanzado: {fechaCorta(p.fecha_lanzamiento)}</span>}
              </div>
            </div>
            <div className="relative shrink-0">
              <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-800 hover:border-zinc-600 text-sm text-zinc-200 cursor-pointer">
                Más <ChevronDown size={15} />
              </button>
              {menu && (
                <div className="absolute right-0 mt-2 w-60 z-30 rounded-xl border border-zinc-800 bg-[#0e0e10] shadow-2xl p-1.5 text-sm" onMouseLeave={() => setMenu(false)}>
                  <button onClick={() => { setMenu(false); setImprimir(true); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-900 text-left cursor-pointer"><Printer size={15} /> Imprimir R.032</button>
                  <div className="my-1 border-t border-zinc-800" />
                  {p.estado !== "TERMINADO" && <button onClick={() => cambiarEstado("TERMINADO", "Desarrollo marcado como lanzado.")} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-900 text-left text-emerald-300 cursor-pointer"><BadgeCheck size={15} /> Marcar como lanzado</button>}
                  {p.estado === "EN_CURSO" && <button onClick={() => cambiarEstado("PAUSADO", "Desarrollo pausado.")} className="w-full px-3 py-2 rounded-lg hover:bg-zinc-900 text-left cursor-pointer">Pausar</button>}
                  {p.estado !== "EN_CURSO" && <button onClick={() => cambiarEstado("EN_CURSO", "Desarrollo reabierto.")} className="w-full px-3 py-2 rounded-lg hover:bg-zinc-900 text-left cursor-pointer">Volver a «en curso»</button>}
                  {p.estado !== "DESCARTADO" && <button onClick={() => cambiarEstado("DESCARTADO", "Desarrollo descartado.")} className="w-full px-3 py-2 rounded-lg hover:bg-zinc-900 text-left text-rose-300 cursor-pointer">Descartar</button>}
                </div>
              )}
            </div>
          </div>

          {/* Avance: una píldora por etapa. */}
          <ol className="mt-4 flex gap-1.5 overflow-x-auto pb-1" aria-label="Etapas">
            {etapasCuentan.map((e, i) => {
              const actual = e.etapa === p.progreso.etapa_actual;
              return (
                <li key={e.etapa} className={`${actual ? "flex-[3] sm:flex-1" : "flex-1"} min-w-[24px] sm:min-w-[96px]`}>
                  <button onClick={() => setSeccion("etapas")} className="w-full text-left cursor-pointer" title={e.nombre}>
                    <div className={`h-1.5 rounded-full ${e.cerrada ? "bg-emerald-400" : actual ? "bg-[#FF5A00]" : e.aprobacion_estado === "PEDIDA" ? "bg-amber-400" : "bg-zinc-800"}`} />
                    <span className={`mt-1.5 items-center gap-1 text-[11px] truncate ${actual ? "flex" : "hidden sm:flex"} ${e.cerrada ? "text-emerald-300" : actual ? "text-white font-medium" : "text-zinc-500"}`}>
                      {e.cerrada ? <Check size={12} /> : <span className="tabular-nums">{i + 1}.</span>} {e.nombre}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <nav className="flex gap-1 mt-2 -mb-px overflow-x-auto" aria-label="Secciones">
            {secciones.map(({ id: sid, texto, icono: Icono }) => (
              <button key={sid} onClick={() => setSeccion(sid)} aria-current={seccion === sid ? "page" : undefined} className={`px-3.5 py-2.5 text-sm font-medium border-b-2 inline-flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${seccion === sid ? "border-[#FF5A00] text-white" : "border-transparent text-zinc-500 hover:text-zinc-200"}`}>
                <Icono size={15} className={seccion === sid ? "text-[#FF5A00]" : ""} /> {texto}
                {sid === "archivos" && p.archivos.length > 0 && <span className="text-[11px] text-zinc-500">{p.archivos.length}</span>}
                {sid === "pruebas" && p.pruebas.length > 0 && <span className="text-[11px] text-zinc-500">{p.pruebas.length}</span>}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
          <TeToca {...props} completo={seccion === "bitacora"} onVer={() => setSeccion("bitacora")} />
          {seccion === "bitacora" && <Bitacora {...props} />}
          {seccion === "etapas" && <Etapas {...props} />}
          {seccion === "archivos" && <Archivos {...props} />}
          {seccion === "pruebas" && <Pruebas {...props} />}
          {seccion === "producto" && <Producto {...props} />}
          {seccion === "difusion" && <Difusion {...props} />}
        </div>
      </main>

      {iso && <RevisionIso p={p} onCerrar={() => setIso(false)} />}
      {imprimir && <ImprimirR032 p={p} onCerrar={() => setImprimir(false)} />}
    </div>
  );
}

/** Lo que espera una acción del usuario: aprobar una etapa o confirmar un aviso. */
function TeToca({ p, accion, completo, onVer }) {
  const [comentario, setComentario] = useState({});
  const [enterado, setEnterado] = useState("");
  const pendientes = p.etapas.filter((e) => p.puedo_aprobar.includes(e.etapa));
  if (!pendientes.length && !p.mi_aviso) return null;
  // Fuera de la bitácora, solo un recordatorio de una línea.
  if (!completo) {
    const que = [pendientes.length && `aprobar ${pendientes.map((e) => `«${e.nombre}»`).join(", ")}`, p.mi_aviso && "confirmar que estás enterado"].filter(Boolean).join(" y ");
    return (
      <button onClick={onVer} className="mb-5 w-full text-left flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/[0.06] px-4 py-2.5 cursor-pointer hover:bg-amber-500/10">
        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
        <span className="flex-1 text-sm text-zinc-200">Te toca {que}.</span>
        <span className="text-xs font-semibold text-amber-300 shrink-0">Ver</span>
      </button>
    );
  }
  const decidir = (etapa, decision) =>
    accion(() => api(`/api/desarrollo/proyectos/${p.id}/etapas/${etapa}/aprobar`, { method: "POST", body: { decision, comentario: comentario[etapa] || "" } }), decision === "APROBADA" ? "Aprobado. Quedó registrado con tu nombre y la fecha." : "Quedó registrado que no se aprueba.");

  return (
    <section className="mb-5 flex flex-col gap-3" aria-label="Te toca">
      {pendientes.map((e) => (
        <div key={e.etapa} className="rounded-2xl border border-amber-500/40 bg-amber-500/[0.06] p-4">
          <p className="text-xs font-semibold text-amber-300">Te piden aprobar · {e.aprobacion_pedida_por}</p>
          <h3 className="mt-1 text-base font-semibold text-white">{e.nombre}</h3>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-zinc-300 leading-relaxed">{e.detalle}</pre>
          <input value={comentario[e.etapa] || ""} onChange={(ev) => setComentario((c) => ({ ...c, [e.etapa]: ev.target.value }))} placeholder="Comentario (obligatorio si no aprobás)" className={`${campo} mt-3`} />
          <div className="mt-3 flex gap-2">
            <button onClick={() => decidir(e.etapa, "APROBADA")} className={botonPrimario}><Check size={16} /> Aprobar</button>
            <button onClick={() => decidir(e.etapa, "RECHAZADA")} className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-zinc-700 hover:border-rose-500/60 text-zinc-200 cursor-pointer">No aprobar</button>
          </div>
        </div>
      ))}
      {p.mi_aviso && (
        <div className="rounded-2xl border border-sky-500/40 bg-sky-500/[0.06] p-4">
          <p className="text-xs font-semibold text-sky-300">Novedad de {p.mi_aviso.enviado_por}</p>
          <p className="mt-1 text-sm text-white whitespace-pre-wrap">{p.mi_aviso.mensaje}</p>
          <input value={enterado} onChange={(ev) => setEnterado(ev.target.value)} placeholder="Qué hiciste (opcional): ej. avisé al proveedor, actualicé la ficha" className={`${campo} mt-3`} />
          <button onClick={() => accion(() => api(`/api/desarrollo/proyectos/${p.id}/enterado`, { method: "POST", body: { comentario: enterado } }), "Listo, quedó registrado que estás enterado.")} className={`${botonPrimario} mt-3`}><Check size={16} /> Estoy enterado</button>
        </div>
      )}
    </section>
  );
}
