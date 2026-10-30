import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Minus, Pencil, Plus, RotateCcw, Search, X } from "lucide-react";
import { api } from "../produccion/util";
import { aNum, lineasIniciales } from "./formula";

const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toLocaleString("es-AR", { maximumFractionDigits: d }) : "—");
const redondear = (n) => Math.round(n * 1e4) / 1e4;
const claves = (ls) => JSON.stringify(ls.map((l) => [l.mp_id, aNum(l.kg)]).sort((a, b) => a[0] - b[0]));
const pasoDe = (kg, porTachada) => (porTachada ? (kg >= 10 ? 1 : kg >= 1 ? 0.5 : 0.1) : 0.05);

/**
 * ¿Usaron la receta definida? Si sí, un toque y listo. Si no, se ajustan los kg de cada material,
 * se quita el que no se usó o se suma otro. No muestra comparaciones ni sugerencias: solo los números que usaron.
 */
export default function FormulaUsada({ lineas, setLineas, original, version, porTachada = true, onTotal }) {
  const base = useMemo(() => lineasIniciales(original), [original]);
  const cambio = claves(lineas) !== claves(base);
  const [otra, setOtra] = useState(() => cambio || base.length === 0);
  const [abrirAgregar, setAbrirAgregar] = useState(false);
  const [materias, setMaterias] = useState(null);
  const [buscar, setBuscar] = useState("");
  const unidad = porTachada ? "tachada" : "pieza";

  useEffect(() => {
    if (!abrirAgregar || materias) return;
    api("/api/prod/materias-primas").then(setMaterias).catch(() => setMaterias([]));
  }, [abrirAgregar, materias]);

  const poner = (nuevas) => {
    setLineas(nuevas);
    if (onTotal) onTotal(redondear(nuevas.reduce((a, l) => a + (aNum(l.kg) || 0), 0)));
  };
  const total = lineas.reduce((a, l) => a + (aNum(l.kg) || 0), 0);

  const elegirIgual = () => {
    setOtra(false);
    setAbrirAgregar(false);
    poner(base);
  };
  const cambiarKg = (id, v) => poner(lineas.map((l) => (l.mp_id === id ? { ...l, kg: v.replace(/[^\d.,]/g, "") } : l)));
  const sumar = (l, d) => cambiarKg(l.mp_id, String(Math.max(0, redondear((aNum(l.kg) || 0) + d))).replace(".", ","));

  const candidatas = useMemo(() => {
    if (!materias) return [];
    const t = buscar.trim().toLowerCase();
    const usadas = new Set(lineas.map((l) => l.mp_id));
    return materias.filter((m) => !usadas.has(m.id) && (!t || `${m.codigo} ${m.nombre}`.toLowerCase().includes(t))).slice(0, 8);
  }, [materias, buscar, lineas]);

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
      <p className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-zinc-400">Receta</p>
      <p className="mt-1 text-xl font-extrabold text-white leading-snug">¿Usaron {version ? <>“{version}”</> : "la receta definida"}?</p>

      <div className="mt-3 grid grid-cols-2 gap-3" role="radiogroup" aria-label="¿Usaron la receta definida?">
        <button type="button" role="radio" aria-checked={!otra} onClick={elegirIgual} className={`min-h-[68px] rounded-2xl border-2 text-lg font-extrabold inline-flex items-center justify-center gap-2.5 cursor-pointer transition-colors ${!otra ? "border-emerald-400 bg-emerald-500/15 text-emerald-200" : "border-white/[0.1] bg-[#17171c] text-zinc-400"}`}>
          <Check size={22} strokeWidth={3} /> Sí, la misma
        </button>
        <button type="button" role="radio" aria-checked={otra} onClick={() => setOtra(true)} className={`min-h-[68px] rounded-2xl border-2 text-lg font-extrabold inline-flex items-center justify-center gap-2.5 cursor-pointer transition-colors ${otra ? "border-[#FFD60A] bg-[#FFD60A]/12 text-[#FFD60A]" : "border-white/[0.1] bg-[#17171c] text-zinc-400"}`}>
          <Pencil size={20} /> No, usaron otra
        </button>
      </div>

      {!otra ? (
        <ul className="mt-4 flex flex-col gap-1.5">
          {base.map((l) => {
            const kg = aNum(l.kg) || 0;
            return (
              <li key={l.mp_id} className="flex items-center gap-3 px-1 text-base">
                <span className="flex-1 min-w-0 truncate text-zinc-200 font-semibold">{l.nombre || l.codigo}</span>
                <span className="font-bold text-white tabular-nums">{fmt(kg, 3)} kg</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-4">
          <p className="text-base text-zinc-400 leading-snug">Kg de cada material por {unidad}:</p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {lineas.map((l) => {
              const kg = aNum(l.kg) || 0;
              return (
                <li key={l.mp_id} className="rounded-2xl border border-white/[0.07] bg-[#17171c] px-3.5 py-3">
                  <p className="text-base font-bold text-white truncate">{l.nombre || l.codigo}</p>
                  <div className="mt-2 flex items-stretch gap-2">
                    <button type="button" onClick={() => sumar(l, -pasoDe(kg, porTachada))} aria-label={`Restar a ${l.nombre || l.codigo}`} className="w-14 min-h-[52px] rounded-xl bg-white/[0.07] text-zinc-200 grid place-items-center active:bg-white/[0.15] cursor-pointer"><Minus size={22} /></button>
                    <div className="flex-1 min-w-0 flex items-center justify-center rounded-xl bg-[#0f0f12] border border-white/[0.12] focus-within:border-[#FF5A00]">
                      <input value={l.kg} onChange={(e) => cambiarKg(l.mp_id, e.target.value)} inputMode="decimal" aria-label={`Kg de ${l.nombre || l.codigo}`} className="w-full min-w-0 bg-transparent text-center text-2xl font-extrabold text-white tabular-nums py-2 focus:outline-none" />
                      <span className="pr-3 text-sm font-bold text-zinc-500">kg</span>
                    </div>
                    <button type="button" onClick={() => sumar(l, pasoDe(kg, porTachada))} aria-label={`Sumar a ${l.nombre || l.codigo}`} className="w-14 min-h-[52px] rounded-xl bg-white/[0.07] text-[#FFD60A] grid place-items-center active:bg-white/[0.15] cursor-pointer"><Plus size={22} /></button>
                    <button type="button" onClick={() => poner(lineas.filter((x) => x.mp_id !== l.mp_id))} aria-label={`Quitar ${l.nombre || l.codigo}`} className="w-12 min-h-[52px] rounded-xl text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 grid place-items-center cursor-pointer"><X size={20} /></button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex items-center justify-between gap-3 text-base">
            <span className="text-zinc-400">Total por {unidad}: <b className="text-white tabular-nums">{fmt(total, 3)} kg</b></span>
            {cambio && <button type="button" onClick={elegirIgual} className="min-h-[44px] px-3.5 rounded-xl text-sm font-bold text-zinc-300 hover:bg-white/[0.07] inline-flex items-center gap-1.5 cursor-pointer"><RotateCcw size={15} /> Volver a la receta</button>}
          </div>

          <button type="button" onClick={() => setAbrirAgregar((v) => !v)} className="mt-2 w-full min-h-[56px] rounded-2xl border border-dashed border-white/[0.2] text-base font-bold text-zinc-200 hover:bg-white/[0.05] inline-flex items-center justify-center gap-2 cursor-pointer">
            <Plus size={18} /> {abrirAgregar ? "Cerrar" : "Agregar un material"}
          </button>
          <AnimatePresence initial={false}>
            {abrirAgregar && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="pt-3">
                  <div className="relative">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar material…" className="w-full min-h-[52px] rounded-xl bg-[#17171c] border border-white/[0.1] pl-11 pr-4 text-base text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF5A00]" />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {candidatas.map((m) => (
                      <button key={m.id} type="button" onClick={() => { poner([...lineas, { mp_id: m.id, codigo: m.codigo, nombre: m.nombre, kg: "" }]); setBuscar(""); setAbrirAgregar(false); }} className="min-h-[48px] px-4 rounded-xl bg-white/[0.05] border border-white/[0.09] text-base font-bold text-zinc-100 hover:bg-white/[0.1] inline-flex items-center gap-2 cursor-pointer">
                        <Plus size={15} /> {m.nombre}
                      </button>
                    ))}
                    {!materias && <p className="text-sm text-zinc-600">Cargando…</p>}
                    {materias && !candidatas.length && <p className="text-sm text-zinc-600">No hay más materiales para agregar.</p>}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
