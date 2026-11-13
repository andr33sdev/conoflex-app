// Lista de proyectos y pruebas: primero lo que necesita atención (olvidados, pasos vencidos), después todo lo demás.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Check, Clock, Loader2, Plus, Search, X } from "lucide-react";
import { api } from "../produccion/util";
import { CERRADOS, ESTADOS, TIPOS, hace, vencimiento } from "./formato";
import { ImagenPrivada } from "./util";
import Nuevo from "./Nuevo";

const VISTAS = [
  { id: "abiertos", texto: "Abiertos", ok: (p) => !CERRADOS.has(p.estado) },
  { id: "mios", texto: "Míos", ok: (p) => !CERRADOS.has(p.estado) && (p.mio || p.sigo) },
  { id: "cerrados", texto: "Cerrados", ok: (p) => CERRADOS.has(p.estado) },
  { id: "todos", texto: "Todos", ok: () => true },
];

function Tarjeta({ p, onAbrir }) {
  const t = TIPOS[p.tipo] || TIPOS.OTRO;
  const I = t.icono;
  const v = vencimiento(p.proximo_paso_fecha);
  const cerrado = CERRADOS.has(p.estado);
  return (
    <li>
      <button onClick={() => onAbrir(p.id)} className={`group w-full text-left rounded-2xl border bg-[#0b0b0c] hover:border-zinc-600 p-4 flex gap-4 cursor-pointer transition-colors ${p.salud.olvidado ? "border-amber-500/40" : "border-zinc-800"}`}>
        <div className={`relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-xl overflow-hidden grid place-items-center ${t.fondo}`}>
          {p.portada_id ? <ImagenPrivada id={p.portada_id} alt="" className="w-full h-full object-cover" /> : <I size={28} className={t.color} />}
          {p.portada_id && <span className={`absolute bottom-1 left-1 w-6 h-6 rounded-md grid place-items-center bg-black/70 ${t.color}`}><I size={13} /></span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-semibold ${t.color}`}>{t.texto}</span>
            {p.proveedor && <span className="text-[11px] text-zinc-500 truncate">· {p.proveedor}</span>}
            <span className={`ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full border ${ESTADOS[p.estado]?.clase}`}>{ESTADOS[p.estado]?.texto}</span>
          </div>
          <h3 className="mt-1 text-[15px] sm:text-base font-semibold text-white leading-snug line-clamp-2">{p.titulo}</h3>

          {!cerrado && p.proximo_paso ? (
            <p className={`mt-1.5 text-[13px] flex items-start gap-1.5 ${v?.tarde ? "text-rose-300" : "text-zinc-300"}`}>
              <CalendarClock size={14} className="mt-0.5 shrink-0 opacity-70" />
              <span className="min-w-0"><span className="text-zinc-500">Próximo:</span> {p.proximo_paso}{p.proximo_paso_quien ? ` · ${p.proximo_paso_quien}` : ""}{v ? <b className={`ml-1 font-semibold ${v.tarde ? "" : v.hoy ? "text-amber-300" : "text-zinc-400"}`}>({v.texto})</b> : null}</span>
            </p>
          ) : p.ultima_novedad ? (
            <p className="mt-1.5 text-[13px] text-zinc-400 line-clamp-1">{p.ultima_novedad.texto}</p>
          ) : null}

          <div className="mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-zinc-500">
            {p.salud.olvidado ? (
              <span className="inline-flex items-center gap-1 font-semibold text-amber-300"><AlertTriangle size={12} /> Sin novedades hace {p.salud.dias_sin_novedad} días</span>
            ) : (
              <span className="inline-flex items-center gap-1"><Clock size={12} /> {hace(p.ultimo_movimiento)}</span>
            )}
            {p.pruebas.total > 0 && (
              <span className="inline-flex items-center gap-2">
                {p.pruebas.aprobadas > 0 && <span className="inline-flex items-center gap-0.5 text-emerald-300"><Check size={12} />{p.pruebas.aprobadas}</span>}
                {p.pruebas.rechazadas > 0 && <span className="inline-flex items-center gap-0.5 text-rose-300"><X size={12} />{p.pruebas.rechazadas}</span>}
                {p.pruebas.pendientes > 0 && <span className="inline-flex items-center gap-0.5"><Clock size={11} />{p.pruebas.pendientes}</span>}
                <span>prueba{p.pruebas.total === 1 ? "" : "s"}</span>
              </span>
            )}
            {p.interesados.length > 0 && <span className="truncate">Esperan: {p.interesados.join(", ")}</span>}
            {p.responsable_nombre && <span className="truncate">· {p.responsable_nombre}</span>}
          </div>
        </div>
      </button>
    </li>
  );
}

export default function Lista({ onAbrir, aviso }) {
  const [datos, setDatos] = useState(null);
  const [vista, setVista] = useState("abiertos");
  const [tipo, setTipo] = useState("");
  const [q, setQ] = useState("");
  const [nuevo, setNuevo] = useState(false);

  useEffect(() => {
    api("/api/proyectos").then(setDatos).catch((e) => aviso(e.message, "error"));
  }, [aviso]);

  const proyectos = useMemo(() => datos?.proyectos || [], [datos]);
  const atencion = useMemo(() => proyectos.filter((p) => !CERRADOS.has(p.estado) && (p.salud.olvidado || p.salud.paso_vencido)), [proyectos]);
  const visibles = useMemo(() => {
    const v = VISTAS.find((x) => x.id === vista);
    const t = q.trim().toLowerCase();
    return proyectos.filter((p) => v.ok(p) && (!tipo || p.tipo === tipo) && (!t || `${p.codigo} ${p.titulo} ${p.proveedor || ""} ${p.responsable_nombre || ""}`.toLowerCase().includes(t)));
  }, [proyectos, vista, tipo, q]);
  const tiposUsados = useMemo(() => Object.keys(TIPOS).filter((k) => proyectos.some((p) => p.tipo === k)), [proyectos]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-7">
        <header className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">Proyectos y pruebas</h1>
            <p className="text-sm text-zinc-500 mt-1">Pruebas, máquinas, objetivos e ideas: en qué quedó cada uno y qué sigue.</p>
          </div>
          <button onClick={() => setNuevo(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#FF5A00] hover:bg-[#ff7a2e] text-black cursor-pointer"><Plus size={18} /> Nuevo</button>
        </header>

        {atencion.length > 0 && vista !== "cerrados" && (
          <section className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-500/[0.05] p-4" aria-label="Necesitan atención">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><AlertTriangle size={16} className="text-amber-400" /> Necesitan atención</h2>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {atencion.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <button onClick={() => onAbrir(p.id)} className="w-full text-left flex items-center gap-3 rounded-xl bg-black/40 hover:bg-black/70 border border-zinc-800 px-3 py-2 cursor-pointer">
                    <span className="flex-1 min-w-0 text-sm text-white truncate">{p.titulo}</span>
                    <span className="text-xs text-amber-300 shrink-0">{p.salud.paso_vencido ? `Paso ${vencimiento(p.proximo_paso_fecha)?.texto}` : `Sin novedades hace ${p.salud.dias_sin_novedad} días`}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-6 flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 p-1 rounded-xl bg-zinc-900/70 border border-zinc-800" role="tablist">
            {VISTAS.map((v) => (
              <button key={v.id} role="tab" aria-selected={vista === v.id} onClick={() => setVista(v.id)} className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer ${vista === v.id ? "bg-zinc-800 text-white font-medium" : "text-zinc-400 hover:text-white"}`}>{v.texto}</button>
            ))}
          </div>
          <label className="relative flex-1 min-w-[180px] max-w-xs ml-auto">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" aria-label="Buscar" className="w-full bg-black border border-zinc-800 focus:border-[#FF5A00] rounded-xl pl-9 pr-3 py-2 text-sm text-white outline-none" />
          </label>
        </div>
        {tiposUsados.length > 1 && (
          <div className="mt-3 flex gap-1.5 flex-wrap">
            <button onClick={() => setTipo("")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border ${!tipo ? "border-zinc-500 text-white" : "border-zinc-800 text-zinc-400 hover:text-white"}`}>Todo</button>
            {tiposUsados.map((k) => {
              const I = TIPOS[k].icono;
              return (
                <button key={k} onClick={() => setTipo(tipo === k ? "" : k)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border ${tipo === k ? `border-zinc-500 text-white ${TIPOS[k].fondo}` : "border-zinc-800 text-zinc-400 hover:text-white"}`}><I size={13} className={TIPOS[k].color} /> {TIPOS[k].texto}</button>
              );
            })}
          </div>
        )}

        {!datos ? (
          <div className="py-24 grid place-items-center text-zinc-500"><Loader2 className="animate-spin" /></div>
        ) : visibles.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-zinc-300 font-medium">{proyectos.length ? "No hay nada en esta vista." : "Todavía no hay proyectos."}</p>
            {!proyectos.length && <p className="text-sm text-zinc-500 mt-1 max-w-md mx-auto">Cargá una prueba con un proveedor, una máquina nueva o algo que se propusieron: queda todo en un lugar, con fotos, y nunca más se pierde en qué quedó.</p>}
          </div>
        ) : (
          <ul className="mt-5 flex flex-col gap-3">
            {visibles.map((p) => <Tarjeta key={p.id} p={p} onAbrir={onAbrir} />)}
          </ul>
        )}
      </div>
      {nuevo && (
        <Nuevo
          onCerrar={() => setNuevo(false)}
          onCreado={(id) => {
            setNuevo(false);
            aviso("Creado.");
            onAbrir(id);
          }}
          aviso={aviso}
        />
      )}
    </div>
  );
}
