// Un proyecto: arriba "¿En qué quedó?" (estado, lo último que pasó y el próximo paso), abajo novedades, pruebas y archivos.
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarClock, Check, ChevronDown, FileImage, FlaskConical, History, Loader2, Pencil, Printer, Settings2, Sparkles, X } from "lucide-react";
import { api } from "../produccion/util";
import { CERRADOS, ESTADOS, TIPOS, botonPrimario, botonSecundario, campo, fechaHora, hace, vencimiento } from "./formato";
import { ImagenPrivada, Modal } from "./util";
import Novedades from "./Novedades";
import Pruebas from "./Pruebas";
import Archivos from "./Archivos";
import Datos from "./Datos";
import Informe from "./Informe";

const SECCIONES = [
  { id: "novedades", texto: "Novedades", icono: History },
  { id: "pruebas", texto: "Pruebas", icono: FlaskConical },
  { id: "archivos", texto: "Fotos y archivos", icono: FileImage },
  { id: "datos", texto: "Datos", icono: Settings2 },
];
const ULTIMOS = new Set(["NOVEDAD", "DECISION", "PRUEBA", "ESTADO", "COMENTARIO"]);

/** Cambiar el estado. Al cerrar (logrado / descartado) se pide el resultado: es lo que se lee dentro de un año. */
function CambiarEstado({ p, accion }) {
  const [abierto, setAbierto] = useState(false);
  const [cerrando, setCerrando] = useState(null);
  const [resultado, setResultado] = useState(p.resultado || "");
  const elegir = (e) => {
    setAbierto(false);
    if (CERRADOS.has(e)) setCerrando(e);
    else accion(() => api(`/api/proyectos/${p.id}`, { method: "PUT", body: { estado: e } }), `Ahora está «${ESTADOS[e].texto}».`);
  };
  return (
    <div className="relative">
      <button onClick={() => setAbierto((x) => !x)} aria-expanded={abierto} className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border cursor-pointer ${ESTADOS[p.estado]?.clase}`}>
        {ESTADOS[p.estado]?.texto} <ChevronDown size={13} />
      </button>
      {abierto && (
        <div className="absolute left-0 mt-2 w-56 z-30 rounded-xl border border-zinc-800 bg-[#0e0e10] shadow-2xl p-1.5" onMouseLeave={() => setAbierto(false)}>
          {Object.entries(ESTADOS).map(([k, e]) => (
            <button key={k} onClick={() => elegir(k)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-900 text-left text-sm cursor-pointer">
              <span className={`w-2 h-2 rounded-full border ${e.clase}`} /> <span className="flex-1">{e.texto}</span> {p.estado === k && <Check size={14} className="text-zinc-400" />}
            </button>
          ))}
        </div>
      )}
      {cerrando && (
        <Modal titulo={cerrando === "LOGRADO" ? "¿Cómo terminó?" : "¿Por qué se descarta?"} subtitulo="Es lo que se va a leer más adelante cuando alguien pregunte en qué quedó." onCerrar={() => setCerrando(null)}>
          <textarea autoFocus value={resultado} onChange={(e) => setResultado(e.target.value)} rows={4} placeholder={cerrando === "LOGRADO" ? "Ej: la pintura quedó aprobada, Compras ya pidió 200 litros." : "Ej: la embaladora no da la velocidad que necesitamos; se devolvió al proveedor."} className={`${campo} resize-y`} />
          <button
            disabled={!resultado.trim()}
            onClick={async () => {
              if (await accion(() => api(`/api/proyectos/${p.id}`, { method: "PUT", body: { estado: cerrando, resultado } }), cerrando === "LOGRADO" ? "Marcado como logrado." : "Marcado como descartado.")) setCerrando(null);
            }}
            className={`${botonPrimario} mt-3 w-full`}
          >
            <Check size={16} /> Cerrar como «{ESTADOS[cerrando].texto}»
          </button>
        </Modal>
      )}
    </div>
  );
}

/** El próximo paso: qué, quién y para cuándo. Editable en el lugar. */
function ProximoPaso({ p, accion, usuarios }) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ proximo_paso: "", proximo_paso_quien: "", proximo_paso_fecha: "" });
  const v = vencimiento(p.proximo_paso_fecha);
  const abrir = () => {
    setF({ proximo_paso: p.proximo_paso || "", proximo_paso_quien: p.proximo_paso_quien || p.responsable_nombre || "", proximo_paso_fecha: p.proximo_paso_fecha || "" });
    setEditando(true);
  };
  const guardar = async (e) => {
    e.preventDefault();
    if (await accion(() => api(`/api/proyectos/${p.id}`, { method: "PUT", body: f }), f.proximo_paso.trim() ? "Próximo paso guardado." : "Próximo paso quitado.")) setEditando(false);
  };
  if (editando) {
    return (
      <form onSubmit={guardar} className="flex flex-col gap-2">
        <input autoFocus value={f.proximo_paso} onChange={(e) => setF((x) => ({ ...x, proximo_paso: e.target.value }))} maxLength={300} placeholder="¿Qué hay que hacer ahora?" aria-label="Próximo paso" className={campo} />
        <div className="grid grid-cols-[1fr_150px] gap-2">
          <input list="pp-quien" value={f.proximo_paso_quien} onChange={(e) => setF((x) => ({ ...x, proximo_paso_quien: e.target.value }))} maxLength={120} placeholder="¿Quién?" aria-label="Quién" className={campo} />
          <datalist id="pp-quien">{usuarios.map((u) => <option key={u.id} value={u.nombre} />)}</datalist>
          <input type="date" value={f.proximo_paso_fecha} onChange={(e) => setF((x) => ({ ...x, proximo_paso_fecha: e.target.value }))} aria-label="Para cuándo" className={campo} />
        </div>
        <div className="flex gap-2">
          <button type="submit" className={botonPrimario}><Check size={15} /> Guardar</button>
          <button type="button" onClick={() => setEditando(false)} className={botonSecundario}>Cancelar</button>
        </div>
      </form>
    );
  }
  return (
    <button onClick={abrir} className="group w-full text-left flex items-start gap-3 rounded-xl border border-dashed border-zinc-700 hover:border-zinc-500 p-3 cursor-pointer">
      <CalendarClock size={18} className={`mt-0.5 shrink-0 ${v?.tarde ? "text-rose-400" : "text-[#FF5A00]"}`} />
      <span className="flex-1 min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Próximo paso</span>
        {p.proximo_paso ? (
          <>
            <span className="block text-[15px] text-white leading-snug">{p.proximo_paso}</span>
            <span className={`block text-xs mt-0.5 ${v?.tarde ? "text-rose-300 font-semibold" : "text-zinc-400"}`}>{[p.proximo_paso_quien, v?.texto].filter(Boolean).join(" · ") || "Sin fecha"}</span>
          </>
        ) : (
          <span className="block text-sm text-zinc-500">{CERRADOS.has(p.estado) ? "Cerrado." : "Sin definir. Tocá para decir qué sigue, quién y para cuándo."}</span>
        )}
      </span>
      <Pencil size={14} className="text-zinc-600 group-hover:text-zinc-300 mt-1" />
    </button>
  );
}

function EnQueQuedo({ p, accion, aviso, usuarios }) {
  const [ia, setIa] = useState(null);
  const [pensando, setPensando] = useState(false);
  const ultimo = p.eventos.find((e) => ULTIMOS.has(e.tipo));
  const pedir = async () => {
    setPensando(true);
    try {
      setIa(await api(`/api/proyectos/${p.id}/resumen-ia`, { method: "POST" }));
    } catch (e) {
      aviso(e.message, "error");
    } finally {
      setPensando(false);
    }
  };
  return (
    <section className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-[#101012] to-[#0a0a0b] p-4 sm:p-5" aria-label="En qué quedó">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-white flex-1">¿En qué quedó?</h2>
        <button onClick={pedir} disabled={pensando} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#FF5A00]/40 text-[#FF5A00] hover:bg-[#FF5A00]/10 cursor-pointer disabled:opacity-60">
          {pensando ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Resumen con IA
        </button>
      </div>
      {ia && (
        <div className="mt-3 rounded-xl border border-[#FF5A00]/30 bg-[#FF5A00]/[0.05] p-3.5 relative">
          <button onClick={() => setIa(null)} aria-label="Cerrar resumen" className="absolute top-2 right-2 w-7 h-7 grid place-items-center rounded text-zinc-500 hover:text-white cursor-pointer"><X size={14} /></button>
          <p className="text-sm text-zinc-100 leading-relaxed pr-6">{ia.en_que_quedo}</p>
          {ia.sugerencia && <p className="mt-2 text-sm text-[#ffb27a]"><b className="font-semibold">Sugerencia:</b> {ia.sugerencia}</p>}
        </div>
      )}
      {p.salud.olvidado && (
        <p className="mt-3 flex items-center gap-2 text-sm text-amber-300"><AlertTriangle size={15} /> Sin novedades hace {p.salud.dias_sin_novedad} días.</p>
      )}
      {CERRADOS.has(p.estado) && p.resultado && (
        <div className="mt-3 rounded-xl bg-black/40 border border-zinc-800 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Cómo terminó</p>
          <p className="mt-1 text-sm text-white whitespace-pre-wrap">{p.resultado}</p>
        </div>
      )}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-black/40 border border-zinc-800 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Lo último</p>
          {ultimo ? (
            <>
              <p className="mt-1 text-sm text-zinc-100 leading-snug line-clamp-4 whitespace-pre-wrap">{ultimo.texto}</p>
              <p className="mt-1 text-xs text-zinc-500">{ultimo.usuario_nombre} · {hace(ultimo.created_at)} ({fechaHora(ultimo.created_at)})</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-zinc-500">Todavía no hay novedades.</p>
          )}
        </div>
        <ProximoPaso key={`${p.proximo_paso}|${p.proximo_paso_fecha}`} p={p} accion={accion} usuarios={usuarios} />
      </div>
    </section>
  );
}

export default function Proyecto({ id, onVolver, aviso }) {
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  const [seccion, setSeccion] = useState("novedades");
  const [usuarios, setUsuarios] = useState([]);
  const [informe, setInforme] = useState(false);

  const cargar = useCallback(
    () =>
      api(`/api/proyectos/${id}`)
        .then((d) => {
          setP(d);
          setError(null);
        })
        .catch((e) => setError(e.message)),
    [id],
  );
  useEffect(() => {
    cargar();
    api("/api/proyectos/usuarios").then(setUsuarios).catch(() => {});
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

  if (error) {
    return (
      <div className="flex-1 grid place-items-center p-6 text-center">
        <div><p className="text-zinc-300">{error}</p><button onClick={onVolver} className="mt-4 text-sm text-[#FF5A00] cursor-pointer">Volver a la lista</button></div>
      </div>
    );
  }
  if (!p) return <div className="flex-1 grid place-items-center text-zinc-500"><Loader2 className="animate-spin" /></div>;

  const t = TIPOS[p.tipo] || TIPOS.OTRO;
  const I = t.icono;
  const props = { p, recargar: cargar, accion, aviso, usuarios };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="shrink-0 border-b border-zinc-800 bg-[#080808]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4">
          <div className="flex items-start gap-3">
            <button onClick={onVolver} aria-label="Volver a la lista" className="mt-1 w-9 h-9 grid place-items-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer shrink-0"><ArrowLeft size={18} /></button>
            <div className={`hidden sm:grid w-14 h-14 rounded-xl overflow-hidden place-items-center shrink-0 ${t.fondo}`}>
              {p.portada_id ? <ImagenPrivada id={p.portada_id} alt="" className="w-full h-full object-cover" /> : <I size={24} className={t.color} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-500 font-medium"><span className={t.color}>{t.texto}</span> · {p.codigo}{p.proveedor ? ` · ${p.proveedor}` : ""}</p>
              <h1 className="text-xl sm:text-2xl font-semibold text-white leading-tight mt-0.5">{p.titulo}</h1>
              <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-zinc-500">
                <CambiarEstado p={p} accion={accion} />
                {p.responsable_nombre && <span>Responsable: {p.responsable_nombre}</span>}
                {p.interesados.length > 0 && <span>· Esperan: {p.interesados.map((i) => i.usuario_nombre).join(", ")}</span>}
              </div>
            </div>
            <button onClick={() => setInforme(true)} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-800 hover:border-zinc-600 text-sm text-zinc-200 cursor-pointer" title="Informe para imprimir o mandar">
              <Printer size={15} /> <span className="hidden sm:inline">Informe</span>
            </button>
          </div>
          <nav className="flex gap-1 mt-3 -mb-px overflow-x-auto" aria-label="Secciones">
            {SECCIONES.map(({ id: sid, texto, icono: Icono }) => (
              <button key={sid} onClick={() => setSeccion(sid)} aria-current={seccion === sid ? "page" : undefined} className={`px-3.5 py-2.5 text-sm font-medium border-b-2 inline-flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors ${seccion === sid ? "border-[#FF5A00] text-white" : "border-transparent text-zinc-500 hover:text-zinc-200"}`}>
                <Icono size={15} className={seccion === sid ? "text-[#FF5A00]" : ""} /> {texto}
                {sid === "pruebas" && p.pruebas.length > 0 && <span className="text-[11px] text-zinc-500">{p.pruebas.length}</span>}
                {sid === "archivos" && p.archivos.length > 0 && <span className="text-[11px] text-zinc-500">{p.archivos.length}</span>}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-5">
          {seccion === "novedades" && <EnQueQuedo {...props} />}
          {seccion === "novedades" && <Novedades {...props} />}
          {seccion === "pruebas" && <Pruebas {...props} />}
          {seccion === "archivos" && <Archivos {...props} />}
          {seccion === "datos" && <Datos key={p.ultimo_movimiento} {...props} />}
        </div>
      </main>
      {informe && <Informe p={p} onCerrar={() => setInforme(false)} />}
    </div>
  );
}
