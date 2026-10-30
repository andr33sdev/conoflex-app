// Reflectivas & Pegado: una fila por artículo con su reflectiva (Prograf / China 3M), protector Orajet y cómo se aplica.
// Todos los usuarios con acceso lo ven; solo el administrador puede modificar (el servidor también lo exige).
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Layers, Lock, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { api } from "./produccion/util";
import { useToast } from "./produccion/useToast";
import { Casilla, Pildora } from "./reflectivas/Tilde";
import { TONOS } from "./reflectivas/tonos";

const suave = [0.2, 0.8, 0.2, 1];

// Campos de la tabla, con su grupo y color.
const CAMPOS = [
  { id: "prograf", label: "Prograf", grupo: "reflectiva", tono: "naranja" },
  { id: "china3m", label: "China 3M", grupo: "reflectiva", tono: "celeste" },
  { id: "protector", label: "Orajet", grupo: "protector", tono: "amarillo" },
  { id: "aplic_completa", label: "Completa", grupo: "aplicacion", tono: "verde" },
  { id: "aplic_union", label: "Unión / puntas", grupo: "aplicacion", tono: "verde" },
];

const FILTROS = [
  { id: "todos", label: "Todos", ok: () => true },
  { id: "prograf", label: "Prograf", ok: (r) => r.prograf },
  { id: "china3m", label: "China 3M", ok: (r) => r.china3m },
  { id: "protector", label: "Con protector", ok: (r) => r.protector },
  { id: "sindefinir", label: "Sin definir", ok: (r) => !r.prograf && !r.china3m && !r.protector },
];

const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// La aplicación del protector solo existe si hay protector (mismo criterio que el servidor).
const conRegla = (r) => (r.protector ? r : { ...r, aplic_completa: false, aplic_union: false });

function Dato({ icono: Icono, t, v, tono = "text-white" }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#111114] px-4 py-3 min-w-0">
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500">
        {Icono && <Icono size={13} />} {t}
      </span>
      <span className={`block mt-0.5 text-2xl font-extrabold tabular-nums ${tono}`}>{v}</span>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-3" aria-label="Cargando">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-[72px] rounded-2xl bg-white/[0.04] animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- vista de escritorio / tablet
function Tabla({ filas, admin, seleccion, alternar, alternarTodos, cambiar }) {
  const todas = filas.length > 0 && filas.every((r) => seleccion.has(r.id));
  const algunas = filas.some((r) => seleccion.has(r.id));
  return (
    <div className="hidden md:block rounded-3xl border border-white/[0.07] bg-[#0f0f12] overflow-hidden">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-zinc-400">
              {admin && <th rowSpan={2} className="sticky left-0 z-20 w-14 bg-[#141418] border-b border-white/[0.07]" scope="col"><div className="grid place-items-center"><Casilla tam="h-9 w-9" on={todas} indeterminada={!todas && algunas} onChange={() => alternarTodos(!todas)} etiqueta="Seleccionar todos los artículos visibles" /></div></th>}
              <th rowSpan={2} scope="col" className={`${admin ? "" : "sticky left-0"} z-10 bg-[#141418] text-left px-4 border-b border-white/[0.07] min-w-[240px]`}>Modelo</th>
              <th colSpan={2} scope="colgroup" className="bg-[#141418] py-2.5 border-l border-white/[0.07] text-[#ff9a63]">Reflectiva</th>
              <th scope="col" rowSpan={2} className="bg-[#141418] border-l border-white/[0.07] border-b border-white/[0.07] px-3 text-[#FFD60A]">Protector</th>
              <th colSpan={2} scope="colgroup" className="bg-[#141418] py-2.5 border-l border-white/[0.07] text-emerald-300">Aplicación del protector</th>
            </tr>
            <tr className="text-[11px] font-bold tracking-wide text-zinc-500">
              <th scope="col" className="bg-[#141418] border-l border-b border-white/[0.07] py-2 w-28">Prograf</th>
              <th scope="col" className="bg-[#141418] border-b border-white/[0.07] py-2 w-28">China 3M</th>
              <th scope="col" className="bg-[#141418] border-l border-b border-white/[0.07] py-2 w-28">Completa</th>
              <th scope="col" className="bg-[#141418] border-b border-white/[0.07] py-2 w-32">Unión / puntas</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((r, i) => {
              const sel = seleccion.has(r.id);
              return (
                <motion.tr
                  key={r.id}
                  initial={i < 14 ? { opacity: 0, y: 8 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i < 14 ? i * 0.025 : 0, ease: suave }}
                  className={`group transition-colors ${sel ? "bg-[#FF5A00]/[0.07]" : "hover:bg-white/[0.025]"}`}
                >
                  {admin && (
                    <td className={`sticky left-0 z-10 border-b border-white/[0.05] ${sel ? "bg-[#1c120d]" : "bg-[#0f0f12] group-hover:bg-[#131316]"}`}>
                      <div className="grid place-items-center py-2.5"><Casilla tam="h-9 w-9" on={sel} onChange={() => alternar(r.id)} etiqueta={`Seleccionar ${r.nombre}`} /></div>
                    </td>
                  )}
                  <th scope="row" className={`${admin ? "" : "sticky left-0"} z-10 text-left px-4 py-2.5 font-normal border-b border-white/[0.05] ${sel ? "bg-[#1c120d]" : "bg-[#0f0f12] group-hover:bg-[#131316]"}`}>
                    <span className="block font-bold text-white leading-snug">{r.nombre}</span>
                    <span className="block text-xs text-zinc-500">{r.codigo}</span>
                  </th>
                  {CAMPOS.map((c, k) => (
                    <td key={c.id} className={`border-b border-white/[0.05] text-center ${k === 0 || k === 2 || k === 3 ? "border-l border-l-white/[0.05]" : ""}`}>
                      <div className="grid place-items-center py-2.5">
                        <Casilla on={r[c.id]} tono={c.tono} soloLectura={!admin} bloqueada={c.grupo === "aplicacion" && !r.protector} onChange={(v) => cambiar([r.id], { [c.id]: v })} etiqueta={`${c.label} de ${r.nombre}`} />
                      </div>
                    </td>
                  ))}
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- vista de celular
function Tarjetas({ filas, admin, seleccion, alternar, cambiar }) {
  return (
    <ul className="md:hidden flex flex-col gap-3">
      {filas.map((r, i) => {
        const sel = seleccion.has(r.id);
        const sinDatos = !r.prograf && !r.china3m && !r.protector;
        return (
          <motion.li
            key={r.id}
            initial={i < 8 ? { opacity: 0, y: 14 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i < 8 ? i * 0.04 : 0, ease: suave }}
            className={`rounded-3xl border p-4 transition-colors ${sel ? "border-[#FF5A00]/50 bg-[#FF5A00]/[0.06]" : "border-white/[0.08] bg-[#111114]"}`}
          >
            <div className="flex items-start gap-3">
              {admin && <Casilla on={sel} onChange={() => alternar(r.id)} etiqueta={`Seleccionar ${r.nombre}`} tam="h-11 w-11 shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-extrabold text-white leading-snug break-words">{r.nombre}</p>
                <p className="text-xs text-zinc-500">{r.codigo}</p>
              </div>
              {sinDatos && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-zinc-500 border border-white/[0.1] rounded-full px-2 py-1">Sin definir</span>}
            </div>

            <div className="mt-4 grid gap-3.5">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#ff9a63] mb-2">Reflectiva</p>
                <div className="flex flex-wrap gap-2">
                  {CAMPOS.filter((c) => c.grupo === "reflectiva").map((c) => (
                    <Pildora key={c.id} on={r[c.id]} tono={c.tono} soloLectura={!admin} onChange={(v) => cambiar([r.id], { [c.id]: v })}>{c.label}</Pildora>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#FFD60A] mb-2">Protector</p>
                <Pildora on={r.protector} tono="amarillo" soloLectura={!admin} onChange={(v) => cambiar([r.id], { protector: v })}>Orajet</Pildora>
              </div>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-emerald-300 mb-2">Aplicación del protector</p>
                <div className="flex flex-wrap gap-2">
                  {CAMPOS.filter((c) => c.grupo === "aplicacion").map((c) => (
                    <Pildora key={c.id} on={r[c.id]} tono={c.tono} soloLectura={!admin} bloqueada={!r.protector} onChange={(v) => cambiar([r.id], { [c.id]: v })}>{c.label}</Pildora>
                  ))}
                </div>
                {!r.protector && <p className="mt-1.5 text-xs text-zinc-600">Se habilita cuando el artículo lleva protector.</p>}
              </div>
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- barra de acciones sobre varios artículos
const SIGUIENTE = { undefined: true, true: false, false: undefined };

function BarraSeleccion({ cantidad, onLimpiar, onAplicar, ocupado }) {
  const [plan, setPlan] = useState({});
  const ciclar = (id) => setPlan((p) => {
    const sig = SIGUIENTE[String(p[id])];
    const n = { ...p };
    if (sig === undefined) delete n[id];
    else n[id] = sig;
    return n;
  });
  const hay = Object.keys(plan).length > 0;
  return (
    <motion.div
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 120, opacity: 0 }}
      transition={{ duration: 0.32, ease: suave }}
      className="fixed z-[60] left-3 right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-6 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:w-[min(760px,calc(100vw-8rem))]"
    >
      <div className="rounded-3xl border border-[#FF5A00]/40 bg-[#17120f]/95 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] p-4">
        <div className="flex items-center gap-3">
          <span className="min-w-9 h-9 px-2 rounded-full bg-[#FF5A00] text-black text-base font-extrabold grid place-items-center tabular-nums">{cantidad}</span>
          <p className="flex-1 text-[15px] font-bold text-white leading-tight">{cantidad === 1 ? "artículo elegido" : "artículos elegidos"}<span className="block text-xs font-medium text-zinc-400">Tocá cada dato para poner ✓ o sacar ✕</span></p>
          <button onClick={onLimpiar} aria-label="Quitar la selección" className="w-11 h-11 grid place-items-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.07] cursor-pointer"><X size={20} /></button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {CAMPOS.map((c) => {
            const v = plan[c.id];
            const t = TONOS[c.tono];
            return (
              <button
                key={c.id}
                onClick={() => ciclar(c.id)}
                aria-label={`${c.label}: ${v === true ? "poner" : v === false ? "sacar" : "sin cambios"}`}
                className={`min-h-[44px] px-3.5 rounded-full border text-[14px] font-bold inline-flex items-center gap-2 transition-colors cursor-pointer ${v === true ? t.chip : v === false ? "border-rose-400/50 bg-rose-500/15 text-rose-300" : "border-white/[0.1] bg-white/[0.04] text-zinc-400 hover:text-white"}`}
              >
                <span className="w-5 text-center">{v === true ? "✓" : v === false ? "✕" : "·"}</span>
                {c.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            disabled={!hay || ocupado}
            onClick={() => onAplicar(plan, () => setPlan({}))}
            className="flex-1 min-h-[50px] rounded-2xl bg-[#FFD60A] text-black text-base font-extrabold hover:bg-white active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {hay ? `Aplicar a ${cantidad}` : "Elegí qué cambiar"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------- módulo
export default function Reflectivas({ usuarioActual }) {
  const admin = String(usuarioActual?.rol || "").toUpperCase() === "ADMIN";
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [ocupado, setOcupado] = useState(false);
  const { mostrar: toast, nodo: toastNodo } = useToast();

  const cargar = useCallback(async () => {
    try {
      setFilas(await api("/api/reflectivas"));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    let vivo = true;
    api("/api/reflectivas")
      .then((d) => vivo && setFilas(d))
      .catch((e) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  const visibles = useMemo(() => {
    if (!filas) return [];
    const t = norm(q);
    const f = FILTROS.find((x) => x.id === filtro) || FILTROS[0];
    return filas.filter((r) => f.ok(r) && (!t || norm(r.nombre).includes(t) || norm(r.codigo).includes(t)));
  }, [filas, q, filtro]);

  const conteo = useMemo(() => {
    const l = filas || [];
    return { total: l.length, prograf: l.filter((r) => r.prograf).length, china3m: l.filter((r) => r.china3m).length, protector: l.filter((r) => r.protector).length };
  }, [filas]);

  const alternar = (id) => setSeleccion((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const alternarTodos = (marcar) => setSeleccion((s) => {
    const n = new Set(s);
    for (const r of visibles) marcar ? n.add(r.id) : n.delete(r.id);
    return n;
  });

  // Cambia ya en pantalla y confirma con el servidor; si falla, vuelve atrás y avisa.
  const cambiar = async (ids, cambios, alTerminar) => {
    const antes = filas;
    const set = new Set(ids);
    setFilas((l) => l.map((r) => (set.has(r.id) ? conRegla({ ...r, ...cambios }) : r)));
    setOcupado(true);
    try {
      const r = ids.length === 1 ? await api(`/api/reflectivas/${ids[0]}`, { method: "PUT", body: cambios }) : await api("/api/reflectivas/lote", { method: "PUT", body: { ids, cambios } });
      if (ids.length > 1) {
        await cargar();
        toast(r.sin_protector ? `Listo. ${r.sin_protector} artículo(s) sin protector: no se les pudo poner la aplicación.` : `Listo: se actualizaron ${r.actualizados} artículos.`);
      }
      alTerminar?.();
    } catch (e) {
      setFilas(antes);
      toast(e.message, "error");
    } finally {
      setOcupado(false);
    }
  };

  const aplicarLote = (plan, limpiar) => cambiar([...seleccion], plan, () => { limpiar(); setSeleccion(new Set()); });

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className={`max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 ${seleccion.size ? "pb-72 lg:pb-56" : "pb-28 lg:pb-10"}`}>
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-5">
          <div>
            <h1 className="cf-h1-largo text-2xl font-extrabold uppercase text-white">Reflectivas &amp; Pegado</h1>
            <p className="mt-1 text-sm text-zinc-500">Qué lleva cada artículo: reflectiva, protector y cómo se aplica.</p>
          </div>
          <span className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-xs font-bold ${admin ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/[0.1] bg-white/[0.04] text-zinc-400"}`}>
            {admin ? <ShieldCheck size={14} /> : <Lock size={14} />}
            {admin ? "Podés modificar" : "Solo lectura"}
          </span>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Dato icono={Layers} t="Artículos" v={conteo.total} />
          <Dato t="Prograf" v={conteo.prograf} tono="text-[#ff9a63]" />
          <Dato t="China 3M" v={conteo.china3m} tono="text-sky-300" />
          <Dato t="Con protector" v={conteo.protector} tono="text-[#FFD60A]" />
        </div>

        <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 mb-4 bg-[#09090b]/90 backdrop-blur-md border-b border-white/[0.05]">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar modelo o código…"
              aria-label="Buscar artículo"
              className="w-full min-h-[48px] rounded-2xl bg-[#17171c] border border-white/[0.1] pl-11 pr-11 text-base text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF5A00]/70"
            />
            {q && <button onClick={() => setQ("")} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-lg text-zinc-500 hover:text-white cursor-pointer"><X size={16} /></button>}
          </div>
          <div className="mt-2.5 flex gap-2 overflow-x-auto no-scrollbar pb-0.5" role="tablist" aria-label="Filtrar">
            {FILTROS.map((f) => (
              <button key={f.id} role="tab" aria-selected={filtro === f.id} onClick={() => setFiltro(f.id)} className={`shrink-0 min-h-[38px] px-4 rounded-full text-sm font-bold border transition-colors cursor-pointer ${filtro === f.id ? "bg-[#FF5A00] border-[#FF5A00] text-black" : "bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:bg-white/[0.09]"}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-100 flex items-start gap-3">
            <AlertTriangle className="shrink-0 mt-0.5" size={20} />
            <div><b>No se pudo cargar.</b><p className="text-sm mt-1">{error}</p><button onClick={cargar} className="mt-3 min-h-[44px] px-4 rounded-xl bg-white/10 font-bold cursor-pointer">Reintentar</button></div>
          </div>
        ) : !filas ? (
          <Esqueleto />
        ) : visibles.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/[0.12] bg-white/[0.02] px-6 py-16 text-center">
            <span className="mx-auto w-16 h-16 rounded-full bg-white/[0.05] grid place-items-center text-zinc-500"><Sparkles size={28} /></span>
            <p className="mt-4 text-lg font-extrabold text-white">{filas.length === 0 ? "Todavía no hay artículos" : "No encontré nada con ese filtro"}</p>
            <p className="mt-1 text-sm text-zinc-500">{filas.length === 0 ? "Los artículos se cargan en el módulo Semielaborados." : "Probá con otra búsqueda o mirá todos los artículos."}</p>
            {filas.length > 0 && <button onClick={() => { setQ(""); setFiltro("todos"); }} className="mt-4 min-h-[44px] px-5 rounded-xl bg-white/[0.08] text-sm font-bold text-white cursor-pointer">Ver todos</button>}
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-500 mb-3 px-1">{visibles.length === filas.length ? `${filas.length} artículos` : `${visibles.length} de ${filas.length} artículos`}</p>
            <Tabla filas={visibles} admin={admin} seleccion={seleccion} alternar={alternar} alternarTodos={alternarTodos} cambiar={cambiar} />
            <Tarjetas filas={visibles} admin={admin} seleccion={seleccion} alternar={alternar} cambiar={cambiar} />
          </>
        )}
      </div>

      <AnimatePresence>
        {admin && seleccion.size > 0 && <BarraSeleccion key="barra" cantidad={seleccion.size} ocupado={ocupado} onLimpiar={() => setSeleccion(new Set())} onAplicar={aplicarLote} />}
      </AnimatePresence>
      {toastNodo}
    </div>
  );
}
