// Reflectivas & Pegado: cada fila es un artículo que arma el administrador (ej: "2071 Econo") y que agrupa las variantes
// (semielaborados 2071NA, 2071RO…) que él elige. Qué lleva: reflectiva (Prograf / China 3M), protector Orajet y su aplicación.
// Todos los usuarios con acceso lo ven; solo el administrador modifica (el servidor también lo exige).
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, ChevronDown, Layers, Lock, Loader2, Pencil, Plus, Search, ShieldCheck, Sparkles, SquareStack, X } from "lucide-react";
import { api } from "./produccion/util";
import { useToast } from "./produccion/useToast";
import { Casilla, Pildora } from "./reflectivas/Tilde";
import { TONOS } from "./reflectivas/tonos";
import Editor from "./reflectivas/Editor";

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

// Sello del artículo: el código si empieza con uno (2071), si no las iniciales.
function sello(nombre) {
  const palabras = String(nombre || "").trim().split(/\s+/).filter(Boolean);
  if (!palabras.length) return "·";
  if (/\d/.test(palabras[0])) return palabras[0].slice(0, 5).toUpperCase();
  return palabras.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function Dato({ icono: Icono, t, v, tono = "text-white", className = "" }) {
  return (
    <div className={`rounded-2xl border border-white/[0.07] bg-gradient-to-b from-[#141418] to-[#0f0f12] px-4 py-3 min-w-0 ${className}`}>
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
        <div key={i} className="h-[76px] rounded-2xl bg-white/[0.04] animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  );
}

/** Variantes del artículo: botón que las despliega como fichas. Si hay búsqueda, resalta las que coinciden. */
function Variantes({ r, abierto, alternar, busqueda }) {
  const n = r.variantes.length;
  const t = norm(busqueda).trim();
  const coinciden = t ? r.variantes.filter((v) => norm(v.codigo).includes(t) || norm(v.nombre).includes(t)) : [];
  return (
    <div className="mt-1.5">
      <button type="button" onClick={alternar} aria-expanded={abierto} className="inline-flex items-center gap-1 -ml-1 px-1 min-h-[32px] rounded-lg text-xs font-bold text-zinc-400 hover:text-white cursor-pointer">
        <SquareStack size={13} /> {n} {n === 1 ? "variante" : "variantes"}
        <motion.span animate={{ rotate: abierto ? 180 : 0 }} transition={{ duration: 0.2 }}><ChevronDown size={14} /></motion.span>
      </button>
      {!abierto && coinciden.length > 0 && coinciden.length < n && (
        <span className="ml-1 text-xs text-[#ff9a63] font-mono">· {coinciden.slice(0, 3).map((v) => v.codigo).join(", ")}{coinciden.length > 3 ? "…" : ""}</span>
      )}
      <AnimatePresence initial={false}>
        {abierto && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: suave }} className="overflow-hidden flex flex-wrap gap-1.5">
            {r.variantes.map((v) => {
              const marca = t && (norm(v.codigo).includes(t) || norm(v.nombre).includes(t));
              return (
                <li key={v.id} title={v.nombre} className={`mt-1 rounded-lg border px-2 py-1 text-[12px] font-bold font-mono ${marca ? "border-[#FF5A00]/60 bg-[#FF5A00]/15 text-[#ffb386]" : "border-white/[0.09] bg-white/[0.04] text-zinc-300"}`}>{v.codigo}</li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function Sello({ nombre }) {
  return (
    <span aria-hidden className="shrink-0 min-w-11 h-11 px-2 rounded-xl bg-gradient-to-br from-[#FF5A00]/25 to-[#FFD60A]/10 border border-[#FF5A00]/25 grid place-items-center text-[13px] font-extrabold text-[#ffb386] tabular-nums tracking-tight">
      {sello(nombre)}
    </span>
  );
}

// ---------------------------------------------------------------- vista de escritorio / tablet
function Tabla({ cambiados, recien, filas, admin, seleccion, alternar, alternarTodos, cambiar, editar, q, abiertos, alternarAbierto }) {
  const todas = filas.length > 0 && filas.every((r) => seleccion.has(r.id));
  const algunas = filas.some((r) => seleccion.has(r.id));
  return (
    <div className="hidden md:block rounded-3xl border border-white/[0.08] bg-[#0f0f12] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-zinc-400">
              {admin && <th rowSpan={2} className="sticky left-0 z-20 w-14 bg-[#141418] border-b border-white/[0.07]" scope="col"><div className="grid place-items-center"><Casilla tam="h-9 w-9" on={todas} indeterminada={!todas && algunas} onChange={() => alternarTodos(!todas)} etiqueta="Seleccionar todos los artículos visibles" /></div></th>}
              <th rowSpan={2} scope="col" className={`${admin ? "" : "sticky left-0"} z-10 bg-[#141418] text-left px-4 border-b border-white/[0.07] min-w-[300px]`}>Artículo</th>
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
              const fondo = sel ? "bg-[#1c120d]" : "bg-[#0f0f12] group-hover:bg-[#131316]";
              return (
                <motion.tr
                  key={r.id}
                  initial={i < 14 ? { opacity: 0, y: 8 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i < 14 ? i * 0.025 : 0, ease: suave }}
                  className={`group transition-colors duration-700 ${sel ? "bg-[#FF5A00]/[0.07]" : cambiados.has(r.id) ? "bg-[#FFD60A]/[0.06]" : recien.has(r.id) ? "bg-emerald-500/[0.10]" : "hover:bg-white/[0.025]"}`}
                >
                  {admin && (
                    <td className={`sticky left-0 z-10 border-b border-white/[0.05] ${fondo}`}>
                      <div className="grid place-items-center py-3"><Casilla tam="h-9 w-9" on={sel} onChange={() => alternar(r.id)} etiqueta={`Seleccionar ${r.nombre}`} /></div>
                    </td>
                  )}
                  <th scope="row" className={`${admin ? "" : "sticky left-0"} z-10 text-left px-4 py-3 font-normal border-b border-white/[0.05] ${fondo}`}>
                    <div className="flex items-start gap-3">
                      <Sello nombre={r.nombre} />
                      <div className="min-w-0 flex-1">
                        <span className="block font-bold text-white leading-snug break-words">{r.nombre}</span>
                        {cambiados.has(r.id) && <span className="mt-1 inline-block text-[10px] font-extrabold uppercase tracking-wide text-[#FFD60A] border border-[#FFD60A]/40 rounded-full px-2 py-0.5">Sin guardar</span>}
                        <Variantes r={r} abierto={abiertos.has(r.id)} alternar={() => alternarAbierto(r.id)} busqueda={q} />
                      </div>
                      {admin && (
                        <button type="button" onClick={() => editar(r)} aria-label={`Editar ${r.nombre}`} className="shrink-0 w-10 h-10 grid place-items-center rounded-xl text-zinc-500 hover:text-white hover:bg-white/[0.08] cursor-pointer"><Pencil size={16} /></button>
                      )}
                    </div>
                  </th>
                  {CAMPOS.map((c, k) => (
                    <td key={c.id} className={`border-b border-white/[0.05] text-center ${k === 0 || k === 2 || k === 3 ? "border-l border-l-white/[0.05]" : ""}`}>
                      <div className="grid place-items-center py-3">
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
function Tarjetas({ cambiados, recien, filas, admin, seleccion, alternar, cambiar, editar, q, abiertos, alternarAbierto }) {
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
            className={`rounded-3xl border p-4 transition-colors duration-700 ${sel ? "border-[#FF5A00]/50 bg-[#FF5A00]/[0.06]" : cambiados.has(r.id) ? "border-[#FFD60A]/50 bg-[#FFD60A]/[0.05]" : recien.has(r.id) ? "border-emerald-400/50 bg-emerald-500/[0.07]" : "border-white/[0.08] bg-gradient-to-b from-[#141418] to-[#111114]"}`}
          >
            <div className="flex items-start gap-3">
              {admin && <Casilla on={sel} onChange={() => alternar(r.id)} etiqueta={`Seleccionar ${r.nombre}`} tam="h-11 w-11 shrink-0" />}
              <Sello nombre={r.nombre} />
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-extrabold text-white leading-snug break-words">{r.nombre}</p>
                {cambiados.has(r.id) && <span className="mt-1 inline-block text-[10px] font-extrabold uppercase tracking-wide text-[#FFD60A] border border-[#FFD60A]/40 rounded-full px-2 py-0.5">Sin guardar</span>}
                <Variantes r={r} abierto={abiertos.has(r.id)} alternar={() => alternarAbierto(r.id)} busqueda={q} />
              </div>
              {admin ? (
                <button type="button" onClick={() => editar(r)} aria-label={`Editar ${r.nombre}`} className="shrink-0 w-11 h-11 grid place-items-center rounded-xl bg-white/[0.05] text-zinc-300 active:bg-white/[0.12] cursor-pointer"><Pencil size={17} /></button>
              ) : (
                sinDatos && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-zinc-500 border border-white/[0.1] rounded-full px-2 py-1">Sin definir</span>
              )}
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

function BarraSeleccion({ cantidad, onLimpiar, onAplicar, ocupado, subida }) {
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
      className={`fixed z-[60] left-3 right-3 ${subida ? "bottom-[calc(10.5rem+env(safe-area-inset-bottom))] lg:bottom-28" : "bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-6"} lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:w-[min(760px,calc(100vw-8rem))]`}
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
            {hay ? `Preparar cambio en ${cantidad}` : "Elegí qué cambiar"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------- confirmar cambios
function BarraConfirmar({ cantidad, ocupado, onDescartar, onConfirmar }) {
  return (
    <motion.div
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 120, opacity: 0 }}
      transition={{ duration: 0.32, ease: suave }}
      role="region"
      aria-label="Cambios sin guardar"
      className="fixed z-[70] left-3 right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-6 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:w-[min(760px,calc(100vw-8rem))]"
    >
      <div className="rounded-3xl border border-[#FFD60A]/45 bg-[#1a1707]/95 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] p-3 sm:p-3.5 flex items-center gap-2 sm:gap-3">
        <span className="relative hidden sm:grid place-items-center w-10 h-10 shrink-0 rounded-full bg-[#FFD60A]/15 text-[#FFD60A]">
          <span className="absolute inset-0 rounded-full bg-[#FFD60A]/20 animate-ping" aria-hidden />
          <Pencil size={18} className="relative" />
        </span>
        <p className="flex-1 min-w-0 text-[14px] sm:text-[15px] font-bold text-white leading-tight">
          {cantidad} {cantidad === 1 ? "artículo con cambios" : "artículos con cambios"}
          <span className="hidden sm:block text-xs font-medium text-zinc-400">Todavía no se guardó nada.</span>
        </p>
        <button onClick={onDescartar} disabled={ocupado} className="min-h-[48px] px-3 sm:px-4 rounded-2xl bg-white/[0.07] text-sm font-bold text-zinc-200 hover:bg-white/[0.13] disabled:opacity-40 cursor-pointer">Descartar</button>
        <button onClick={onConfirmar} disabled={ocupado} className="min-h-[48px] px-5 rounded-2xl bg-[#FFD60A] text-black text-[15px] font-extrabold inline-flex items-center justify-center gap-2 hover:bg-white active:scale-[0.98] transition-all disabled:opacity-60 cursor-pointer shadow-[0_8px_24px_rgba(255,214,10,0.2)] shrink-0">
          {ocupado ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} strokeWidth={3} />}
          {ocupado ? "Guardando…" : "Confirmar"}<span className="sr-only"> cambios</span>
        </button>
      </div>
    </motion.div>
  );
}

function Guardado({ cantidad }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status" className="fixed inset-0 z-[150] grid place-items-center bg-[#09090b]/80 backdrop-blur-sm pointer-events-none">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="text-center px-6">
        <span className="mx-auto w-24 h-24 rounded-full grid place-items-center bg-emerald-500/15 border-2 border-emerald-400 text-emerald-300 shadow-[0_0_60px_rgba(16,185,129,0.3)]">
          <Check size={52} strokeWidth={3} />
        </span>
        <p className="mt-5 text-3xl font-extrabold text-white">¡Cambios guardados!</p>
        <p className="mt-2 text-lg text-zinc-400">{cantidad === 1 ? "Se actualizó 1 artículo" : `Se actualizaron ${cantidad} artículos`}</p>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------- módulo
export default function Reflectivas({ usuarioActual }) {
  const admin = String(usuarioActual?.rol || "").toUpperCase() === "ADMIN";
  const [articulos, setArticulos] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [abiertos, setAbiertos] = useState(() => new Set());
  const [ocupado, setOcupado] = useState(false);
  const [borrador, setBorrador] = useState({});
  const [recien, setRecien] = useState(() => new Set());
  const [guardadoN, setGuardadoN] = useState(0);
  const [editor, setEditor] = useState({ k: 0, articulo: null });
  const [editorAbierto, setEditorAbierto] = useState(false);
  const { mostrar: toast, nodo: toastNodo } = useToast();

  const cargar = useCallback(async () => {
    try {
      setArticulos(await api("/api/reflectivas"));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    let vivo = true;
    api("/api/reflectivas")
      .then((d) => vivo && setArticulos(d))
      .catch((e) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  // Lo que se ve = lo guardado + los cambios todavía sin confirmar.
  const vista = useMemo(() => (articulos ? articulos.map((r) => (borrador[r.id] ? conRegla({ ...r, ...borrador[r.id] }) : r)) : null), [articulos, borrador]);
  const cambiados = useMemo(() => new Set(Object.keys(borrador).map(Number)), [borrador]);
  useEffect(() => {
    if (!cambiados.size) return undefined;
    const aviso = (e) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [cambiados.size]);

  const visibles = useMemo(() => {
    if (!vista) return [];
    const t = norm(q).trim();
    const f = FILTROS.find((x) => x.id === filtro) || FILTROS[0];
    return vista.filter((r) => f.ok(r) && (!t || norm(r.nombre).includes(t) || r.variantes.some((v) => norm(v.codigo).includes(t) || norm(v.nombre).includes(t))));
  }, [vista, q, filtro]);

  const conteo = useMemo(() => {
    const l = vista || [];
    return {
      total: l.length,
      variantes: l.reduce((a, r) => a + r.variantes.length, 0),
      prograf: l.filter((r) => r.prograf).length,
      china3m: l.filter((r) => r.china3m).length,
      protector: l.filter((r) => r.protector).length,
    };
  }, [vista]);

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
  const alternarAbierto = (id) => setAbiertos((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const abrirEditor = (articulo) => {
    setEditor((e) => ({ k: e.k + 1, articulo }));
    setEditorAbierto(true);
  };
  const guardado = (a) => setArticulos((l) => {
    const sin = (l || []).filter((x) => x.id !== a.id);
    return [...sin, a].sort((x, y) => x.nombre.localeCompare(y.nombre, "es", { numeric: true }));
  });
  const eliminado = (id) => {
    setArticulos((l) => l.filter((x) => x.id !== id));
    setBorrador((b) => {
      const n = { ...b };
      delete n[id];
      return n;
    });
    setSeleccion((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  };

  // Los cambios no se guardan solos: quedan como borrador hasta que el admin los confirma.
  const cambiar = (ids, cambios, alTerminar) => {
    let sinProtector = 0;
    setBorrador((b) => {
      const n = { ...b };
      for (const id of ids) {
        const base = articulos.find((x) => x.id === id);
        if (!base) continue;
        const mezcla = { ...(n[id] || {}), ...cambios };
        const final = conRegla({ ...base, ...mezcla });
        if ((cambios.aplic_completa === true || cambios.aplic_union === true) && !final.protector) sinProtector++;
        const dif = {};
        for (const c of CAMPOS.map((x) => x.id)) if (final[c] !== base[c]) dif[c] = final[c];
        if (Object.keys(dif).length) n[id] = dif;
        else delete n[id];
      }
      return n;
    });
    if (sinProtector) toast(`${sinProtector} sin protector: no se les puede poner aplicación.`, "error");
    alTerminar?.();
  };

  const descartar = () => setBorrador({});
  const confirmar = async () => {
    const ids = Object.keys(borrador).map(Number);
    if (!ids.length) return;
    setOcupado(true);
    const ok = [];
    let falla = "";
    for (const id of ids) {
      try {
        const r = await api(`/api/reflectivas/articulos/${id}`, { method: "PUT", body: borrador[id] });
        guardado(r.articulo);
        ok.push(id);
      } catch (e) {
        falla = e.message;
      }
    }
    setBorrador((b) => {
      const n = { ...b };
      for (const id of ok) delete n[id];
      return n;
    });
    setOcupado(false);
    if (falla) toast(ok.length ? `Se guardaron ${ok.length}, pero hubo un error: ${falla}` : falla, "error");
    if (ok.length) {
      setGuardadoN(ok.length);
      setRecien(new Set(ok));
      setTimeout(() => setGuardadoN(0), 1700);
      setTimeout(() => setRecien(new Set()), 2600);
    }
  };

  const aplicarLote = (plan, limpiar) => cambiar([...seleccion], plan, () => { limpiar(); setSeleccion(new Set()); });
  const hayArticulos = (articulos?.length || 0) > 0;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className={`max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 ${seleccion.size ? "pb-96 lg:pb-72" : cambiados.size ? "pb-52 lg:pb-32" : "pb-28 lg:pb-10"}`}>
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div className="flex items-stretch gap-3">
            <span aria-hidden className="block w-[3px] rounded-full shrink-0" style={{ backgroundImage: "repeating-linear-gradient(to bottom,#FFD60A 0 7px,transparent 7px 12px)" }} />
            <div>
              <h1 className="cf-h1-largo text-2xl sm:text-3xl font-extrabold uppercase text-white">Reflectivas &amp; Pegado</h1>
              <p className="mt-1 text-sm text-zinc-400">Qué lleva cada artículo y todas sus variantes de color.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${admin ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/[0.1] bg-white/[0.04] text-zinc-400"}`}>
              {admin ? <ShieldCheck size={14} /> : <Lock size={14} />}
              {admin ? "Podés modificar" : "Solo lectura"}
            </span>
            {admin && (
              <button onClick={() => abrirEditor(null)} className="min-h-[46px] px-5 rounded-2xl bg-[#FFD60A] text-black text-[15px] font-extrabold inline-flex items-center gap-2 hover:bg-white active:scale-[0.98] transition-all shadow-[0_8px_24px_rgba(255,214,10,0.18)] cursor-pointer flex-1 sm:flex-none justify-center">
                <Plus size={18} strokeWidth={3} /> Agregar artículo
              </button>
            )}
          </div>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <Dato icono={Layers} t="Artículos" v={conteo.total} />
          <Dato icono={SquareStack} t="Variantes" v={conteo.variantes} />
          <Dato t="Prograf" v={conteo.prograf} tono="text-[#ff9a63]" />
          <Dato t="China 3M" v={conteo.china3m} tono="text-sky-300" />
          <Dato t="Con protector" v={conteo.protector} tono="text-[#FFD60A]" className="col-span-2 sm:col-span-1" />
        </div>

        {hayArticulos && (
          <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 mb-4 bg-[#09090b]/90 backdrop-blur-md border-b border-white/[0.05]">
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar artículo o código de variante…"
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
        )}

        {error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-100 flex items-start gap-3">
            <AlertTriangle className="shrink-0 mt-0.5" size={20} />
            <div><b>No se pudo cargar.</b><p className="text-sm mt-1">{error}</p><button onClick={cargar} className="mt-3 min-h-[44px] px-4 rounded-xl bg-white/10 font-bold cursor-pointer">Reintentar</button></div>
          </div>
        ) : !articulos ? (
          <Esqueleto />
        ) : !hayArticulos ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: suave }} className="rounded-3xl border border-dashed border-white/[0.14] bg-white/[0.02] px-6 py-16 text-center">
            <span className="mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-[#FF5A00]/25 to-[#FFD60A]/10 border border-[#FF5A00]/25 grid place-items-center text-[#ff9a63]"><Sparkles size={34} /></span>
            <p className="mt-5 text-xl font-extrabold text-white">Todavía no hay artículos</p>
            <p className="mt-2 text-sm text-zinc-400 max-w-md mx-auto">
              {admin ? "Creá un artículo (por ejemplo “2071 Econo”) y elegí qué variantes incluye: 2071NA, 2071RO, 2071AM… Cargás la reflectiva una sola vez para todas." : "El administrador todavía no cargó ningún artículo."}
            </p>
            {admin && <button onClick={() => abrirEditor(null)} className="mt-6 min-h-[50px] px-6 rounded-2xl bg-[#FFD60A] text-black text-base font-extrabold inline-flex items-center gap-2 hover:bg-white cursor-pointer"><Plus size={18} strokeWidth={3} /> Agregar el primero</button>}
          </motion.div>
        ) : visibles.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/[0.12] bg-white/[0.02] px-6 py-14 text-center">
            <span className="mx-auto w-16 h-16 rounded-full bg-white/[0.05] grid place-items-center text-zinc-500"><Search size={26} /></span>
            <p className="mt-4 text-lg font-extrabold text-white">No encontré nada</p>
            <p className="mt-1 text-sm text-zinc-500">Probá con otra búsqueda o mirá todos los artículos.</p>
            <button onClick={() => { setQ(""); setFiltro("todos"); }} className="mt-4 min-h-[44px] px-5 rounded-xl bg-white/[0.08] text-sm font-bold text-white cursor-pointer">Ver todos</button>
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-500 mb-3 px-1">{visibles.length === articulos.length ? `${articulos.length} ${articulos.length === 1 ? "artículo" : "artículos"}` : `${visibles.length} de ${articulos.length} artículos`}</p>
            <Tabla cambiados={cambiados} recien={recien} filas={visibles} admin={admin} seleccion={seleccion} alternar={alternar} alternarTodos={alternarTodos} cambiar={cambiar} editar={abrirEditor} q={q} abiertos={abiertos} alternarAbierto={alternarAbierto} />
            <Tarjetas cambiados={cambiados} recien={recien} filas={visibles} admin={admin} seleccion={seleccion} alternar={alternar} cambiar={cambiar} editar={abrirEditor} q={q} abiertos={abiertos} alternarAbierto={alternarAbierto} />
          </>
        )}
      </div>

      <AnimatePresence>
        {admin && seleccion.size > 0 && <BarraSeleccion key="barra" cantidad={seleccion.size} ocupado={ocupado} onLimpiar={() => setSeleccion(new Set())} onAplicar={aplicarLote} subida={cambiados.size > 0} />}
        {admin && cambiados.size > 0 && <BarraConfirmar key="confirmar" cantidad={cambiados.size} ocupado={ocupado} onDescartar={descartar} onConfirmar={confirmar} />}
        {guardadoN > 0 && <Guardado key="guardado" cantidad={guardadoN} />}
      </AnimatePresence>
      {admin && <Editor clave={editor.k} abierto={editorAbierto} articulo={editor.articulo} onCerrar={() => setEditorAbierto(false)} onGuardado={(a) => { guardado(a); setGuardadoN(1); setTimeout(() => setGuardadoN(0), 1700); }} onEliminado={eliminado} toast={toast} />}
      {toastNodo}
    </div>
  );
}
