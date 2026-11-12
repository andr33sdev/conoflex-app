// Lista de desarrollos: primero lo que espera una acción tuya, después los proyectos como tarjetas.
import { useEffect, useMemo, useState } from "react";
import { BellRing, FlaskConical, Image as ImageIcon, Loader2, Plus, Search, Wrench } from "lucide-react";
import { api } from "../produccion/util";
import { Avance, ImagenPrivada } from "./util";
import { ESTADOS, hace } from "./formato";
import Nuevo from "./Nuevo";

const FILTROS = [
  { id: "curso", texto: "En curso", ok: (p) => p.estado === "EN_CURSO" || p.estado === "PAUSADO" },
  { id: "lanzados", texto: "Lanzados", ok: (p) => p.estado === "TERMINADO" },
  { id: "todos", texto: "Todos", ok: () => true },
];
const NOMBRE_ETAPA = { ENTRADAS: "Entradas", MATRICERO: "Matricero", VERIFICACION: "Verificación", VALIDACION: "Validación", ESPECIFICACIONES: "Especificaciones" };

export default function Lista({ onAbrir, aviso }) {
  const [datos, setDatos] = useState(null);
  const [filtro, setFiltro] = useState("curso");
  const [q, setQ] = useState("");
  const [nuevo, setNuevo] = useState(false);

  const cargar = () =>
    api("/api/desarrollo/proyectos")
      .then(setDatos)
      .catch((e) => aviso(e.message, "error"));
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const proyectos = useMemo(() => datos?.proyectos || [], [datos]);
  const pendientes = proyectos.filter((p) => p.espera_mi_aprobacion.length || p.espera_mi_enterado);
  const visibles = useMemo(() => {
    const f = FILTROS.find((x) => x.id === filtro);
    const t = q.trim().toLowerCase();
    return proyectos.filter((p) => f.ok(p) && (!t || `${p.codigo} ${p.nombre} ${p.cliente || ""}`.toLowerCase().includes(t)));
  }, [proyectos, filtro, q]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-7">
        <header className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">Desarrollo de productos</h1>
            <p className="text-sm text-zinc-500 mt-1">Productos nuevos y cambios, de la idea al lanzamiento.</p>
          </div>
          <button onClick={() => setNuevo(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#FF5A00] hover:bg-[#ff7a2e] text-black cursor-pointer">
            <Plus size={18} /> Nuevo
          </button>
        </header>

        {pendientes.length > 0 && (
          <section className="mt-6 rounded-2xl border border-[#FF5A00]/40 bg-[#FF5A00]/[0.06] p-4" aria-label="Te esperan">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><BellRing size={16} className="text-[#FF5A00]" /> Te esperan</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {pendientes.map((p) => (
                <li key={p.id}>
                  <button onClick={() => onAbrir(p.id)} className="w-full text-left flex items-center gap-3 rounded-xl bg-black/40 hover:bg-black/70 border border-zinc-800 px-3 py-2.5 cursor-pointer">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-white truncate">{p.nombre}</span>
                      <span className="block text-xs text-zinc-400">
                        {p.espera_mi_aprobacion.length > 0 && `Aprobar: ${p.espera_mi_aprobacion.map((e) => NOMBRE_ETAPA[e] || e).join(", ")}`}
                        {p.espera_mi_aprobacion.length > 0 && p.espera_mi_enterado && " · "}
                        {p.espera_mi_enterado && "Confirmar que estás enterado"}
                      </span>
                    </span>
                    <span className="text-xs font-semibold text-[#FF5A00] shrink-0">Ver</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-6 flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 p-1 rounded-xl bg-zinc-900/70 border border-zinc-800" role="tablist">
            {FILTROS.map((f) => (
              <button key={f.id} role="tab" aria-selected={filtro === f.id} onClick={() => setFiltro(f.id)} className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer ${filtro === f.id ? "bg-zinc-800 text-white font-medium" : "text-zinc-400 hover:text-white"}`}>
                {f.texto}
              </button>
            ))}
          </div>
          <label className="relative flex-1 min-w-[180px] max-w-xs ml-auto">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" aria-label="Buscar desarrollo" className="w-full bg-black border border-zinc-800 focus:border-[#FF5A00] rounded-xl pl-9 pr-3 py-2 text-sm text-white outline-none" />
          </label>
        </div>

        {!datos ? (
          <div className="py-24 grid place-items-center text-zinc-500"><Loader2 className="animate-spin" /></div>
        ) : visibles.length === 0 ? (
          <div className="py-20 text-center">
            <FlaskConical size={36} className="mx-auto text-zinc-700" />
            <p className="mt-3 text-zinc-300 font-medium">{proyectos.length ? "No hay desarrollos en esta vista." : "Todavía no hay desarrollos."}</p>
            {!proyectos.length && <p className="text-sm text-zinc-500 mt-1">Creá el primero con «Nuevo»: fotos, etapas, pruebas y aprobaciones quedan todas en un solo lugar.</p>}
          </div>
        ) : (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibles.map((p) => (
              <li key={p.id}>
                <button onClick={() => onAbrir(p.id)} className="group w-full text-left rounded-2xl border border-zinc-800 hover:border-zinc-600 bg-[#0b0b0c] overflow-hidden cursor-pointer transition-colors">
                  <div className="relative aspect-[16/9] bg-zinc-950">
                    {p.portada_id ? <ImagenPrivada id={p.portada_id} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" /> : <div className="w-full h-full grid place-items-center text-zinc-800">{p.tipo === "MODIFICACION" ? <Wrench size={40} /> : <ImageIcon size={40} />}</div>}
                    <span className={`absolute top-2.5 left-2.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border backdrop-blur ${ESTADOS[p.estado]?.clase}`}>{ESTADOS[p.estado]?.texto}</span>
                    {(p.espera_mi_aprobacion.length > 0 || p.espera_mi_enterado) && <span className="absolute top-2.5 right-2.5 w-3 h-3 rounded-full bg-[#FF5A00] ring-4 ring-black/40" title="Espera una acción tuya" />}
                  </div>
                  <div className="p-4">
                    <p className="text-[11px] text-zinc-500 font-medium tracking-wide">{p.codigo} · {p.tipo === "MODIFICACION" ? "Modificación" : "Producto nuevo"}</p>
                    <h3 className="mt-1 text-base font-semibold text-white leading-snug line-clamp-2">{p.nombre}</h3>
                    <div className="mt-3"><Avance progreso={p.progreso} chico /></div>
                    <p className="mt-2 text-xs text-zinc-500 truncate">
                      {p.estado === "TERMINADO" ? "Lanzado" : p.progreso.etapa_actual_nombre ? `Ahora: ${p.progreso.etapa_actual_nombre}` : "Todas las etapas cerradas"}
                      {" · "}
                      {hace(p.ultimo_movimiento)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {nuevo && (
        <Nuevo
          onCerrar={() => setNuevo(false)}
          onCreado={(id) => {
            setNuevo(false);
            aviso("Desarrollo creado.");
            onAbrir(id);
          }}
          aviso={aviso}
        />
      )}
    </div>
  );
}
