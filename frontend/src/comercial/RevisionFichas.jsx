import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2, Lock, Search, X } from "lucide-react";
import { api } from "../produccion/util";

const FILTROS = [
  { id: "todos", texto: "Todos", cuenta: (r) => r.total },
  { id: "incompletos", texto: "Incompletos", cuenta: (r) => r.total - r.completos },
  { id: "descripción", texto: "Sin descripción", cuenta: (r) => r.sin_descripcion },
  { id: "usos", texto: "Sin usos", cuenta: (r) => r.sin_usos },
  { id: "precio", texto: "Sin precio", cuenta: (r) => r.sin_precio },
  { id: "precio con variantes", texto: "Precio con variantes", cuenta: (r) => r.con_variantes },
  { id: "foto", texto: "Sin foto", cuenta: (r) => r.sin_foto },
  { id: "editados", texto: "Corregidos a mano", cuenta: (r) => r.editados },
];

const usosALineas = (t) => String(t || "").split(/\s*\|\s*|\r?\n/).map((x) => x.trim()).filter(Boolean).join("\n");
const lineasAUsos = (t) => String(t || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean).join(" | ");
const peso = (n) => Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Editor({ p, onCerrar, onGuardado }) {
  const [f, setF] = useState({
    descripcion: p.descripcion || "",
    usos: usosALineas(p.usos_recomendados || p.aplicacion),
    advertencias: p.advertencias || "",
    categoria: p.categoria || "General",
    proteger: true,
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const guardar = async () => {
    setGuardando(true);
    setError("");
    try {
      await api(`/api/catalogo/fichas/${p.id}`, {
        method: "PUT",
        body: { descripcion: f.descripcion, usos_recomendados: lineasAUsos(f.usos), advertencias: f.advertencias, categoria: f.categoria, ficha_editada: f.proteger },
      });
      onGuardado();
    } catch (e) {
      setError(e.message || "No pude guardar.");
      setGuardando(false);
    }
  };
  const campo = "w-full bg-black border border-zinc-800 focus:border-[#FF5A00] rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none";
  const etiqueta = "block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1";
  return createPortal(
    <div className="fixed inset-0 z-[200] bg-black/70 flex justify-end" role="dialog" aria-modal="true" aria-label={`Ficha de ${p.nombre}`}>
      <div className="w-full max-w-xl h-full bg-[#0b0b0b] border-l border-zinc-800 flex flex-col">
        <div className="flex items-start gap-3 p-4 border-b border-zinc-800">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#FF5A00]">{p.codigo}</p>
            <h3 className="text-base font-extrabold text-white truncate">{p.nombre}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{p.medidas || "Sin medidas cargadas"}</p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="w-9 h-9 grid place-items-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="rounded-lg border border-zinc-800 p-3 text-xs text-zinc-400">
            <p className={etiqueta}>Precio de lista (viene de la lista de precios)</p>
            {p.estado.precio.valores.length === 0 ? (
              <p className="text-amber-400">Sin precio cargado: la IA no podrá cotizarlo.</p>
            ) : (
              <ul className="space-y-0.5">
                {p.estado.precio.valores.map((v, i) => <li key={i}><b className="text-white">${peso(v.valor)}</b>{v.etiqueta ? ` · ${v.etiqueta}` : ""}</li>)}
              </ul>
            )}
            {p.estado.precio.valores.length > 1 && <p className="mt-1 text-amber-400">Tiene variantes: la IA no elegirá una sola sin que lo indiques en el pedido.</p>}
          </div>
          <div>
            <label className={etiqueta} htmlFor="f-cat">Categoría</label>
            <input id="f-cat" className={campo} value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} />
          </div>
          <div>
            <label className={etiqueta} htmlFor="f-desc">Descripción</label>
            <textarea id="f-desc" rows={5} className={campo} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
          </div>
          <div>
            <label className={etiqueta} htmlFor="f-usos">Usos recomendados (uno por línea)</label>
            <textarea id="f-usos" rows={8} className={campo} value={f.usos} onChange={(e) => setF({ ...f, usos: e.target.value })} placeholder={"Fútbol: marcar estaciones de práctica\nLogística: organizar sectores de trabajo"} />
          </div>
          <div>
            <label className={etiqueta} htmlFor="f-adv">Cuándo NO ofrecerlo / advertencias</label>
            <textarea id="f-adv" rows={3} className={campo} value={f.advertencias} onChange={(e) => setF({ ...f, advertencias: e.target.value })} placeholder="Ej: no para canalizar tránsito en rutas; priorizar interiores." />
          </div>
          <label className="flex items-start gap-2.5 text-xs text-zinc-300 cursor-pointer">
            <input type="checkbox" checked={f.proteger} onChange={(e) => setF({ ...f, proteger: e.target.checked })} className="mt-0.5 accent-[#FF5A00]" />
            <span>Proteger esta ficha: si subís de nuevo el PDF, no la pisa con lo que lea.</span>
          </label>
          {error && <p className="text-sm text-red-400 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</p>}
        </div>
        <div className="p-4 border-t border-zinc-800 flex gap-2">
          <button onClick={guardar} disabled={guardando} className="flex-1 min-h-[44px] rounded-lg bg-[#FF5A00] hover:bg-[#ff6d1f] text-black font-extrabold uppercase tracking-wider text-xs disabled:opacity-60 flex items-center justify-center gap-2">
            {guardando && <Loader2 size={15} className="animate-spin" />} Guardar ficha
          </button>
          <button onClick={onCerrar} className="min-h-[44px] px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-bold uppercase tracking-wider">Cancelar</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Revisión de las fichas que salieron de los PDF: qué le falta a cada producto y corrección a mano. */
export default function RevisionFichas() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("incompletos");
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState(null);

  const cargar = useCallback(() => {
    api("/api/catalogo/fichas").then((d) => { setDatos(d); setError(""); }).catch((e) => setError(e.message || "No pude cargar las fichas."));
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const lista = useMemo(() => {
    if (!datos) return [];
    const t = q.trim().toLowerCase();
    return datos.productos.filter((p) => {
      if (t && !`${p.codigo} ${p.nombre} ${p.categoria}`.toLowerCase().includes(t)) return false;
      if (filtro === "todos") return true;
      if (filtro === "incompletos") return !p.estado.completo;
      if (filtro === "editados") return p.ficha_editada;
      return p.estado.faltan.includes(filtro);
    });
  }, [datos, filtro, q]);

  if (error) return <div className="p-6 text-sm text-red-400 flex items-center gap-2"><AlertCircle size={16} /> {error}</div>;
  if (!datos) return <div className="p-10 grid place-items-center text-zinc-500"><Loader2 className="animate-spin" /></div>;
  const r = datos.resumen;

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2 mb-4">
          <div>
            <h2 className="text-lg font-extrabold text-white">Revisión de fichas</h2>
            <p className="text-xs text-zinc-500 max-w-xl">Lo que la IA sabe de cada producto para ofrecerlo y venderlo. Corregí lo que haya leído mal del PDF: tus cambios quedan protegidos.</p>
          </div>
          <p className="ml-auto text-sm text-zinc-300"><b className="text-white">{r.completos}</b> de {r.total} fichas completas</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {FILTROS.map((fl) => (
            <button key={fl.id} onClick={() => setFiltro(fl.id)} aria-pressed={filtro === fl.id} className={`px-3 min-h-[36px] rounded-lg text-xs font-bold border transition-colors ${filtro === fl.id ? "bg-[#FF5A00] text-black border-[#FF5A00]" : "text-zinc-300 border-zinc-800 hover:bg-zinc-900"}`}>
              {fl.texto} <span className={filtro === fl.id ? "text-black/70" : "text-zinc-500"}>{fl.cuenta(r)}</span>
            </button>
          ))}
        </div>
        <div className="relative mb-4 max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código, nombre o categoría" className="w-full bg-[#090909] border border-zinc-800 focus:border-[#FF5A00] rounded-lg pl-9 pr-3 min-h-[40px] text-sm text-zinc-100 outline-none" />
        </div>

        {lista.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">No hay productos en este filtro.</p>
        ) : (
          <ul className="grid gap-2">
            {lista.map((p) => (
              <li key={p.id} className="bg-[#0b0b0b] border border-zinc-800 rounded-lg p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1 basis-60">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#FF5A00] truncate">{p.codigo} <span className="text-zinc-600">· {p.categoria || "General"}</span></p>
                  <p className="text-sm font-bold text-white truncate">{p.nombre}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 basis-64 flex-1">
                  {p.estado.completo ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400"><CheckCircle2 size={13} /> Completa</span>
                  ) : (
                    p.estado.faltan.map((x) => <span key={x} className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Falta {x}</span>)
                  )}
                  {p.ficha_editada && <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-white/5 text-zinc-300 border border-zinc-700"><Lock size={11} /> Corregida</span>}
                </div>
                <button onClick={() => setEditando(p)} className="min-h-[38px] px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-100 text-xs font-bold uppercase tracking-wider">Revisar</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editando && <Editor key={editando.id} p={editando} onCerrar={() => setEditando(null)} onGuardado={() => { setEditando(null); cargar(); }} />}
    </div>
  );
}
