import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../produccion/util";
import { aNum, lineasIniciales } from "./formula";

const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toLocaleString("es-AR", { maximumFractionDigits: d }) : "—");

/** Fórmula por tachada con porcentajes. Solo se puede tocar si el operario toca "Cambiar" (por si se usó otra). */
export default function FormulaUsada({ lineas, setLineas, original }) {
  const [editando, setEditando] = useState(false);
  const [materias, setMaterias] = useState(null);
  const [buscar, setBuscar] = useState("");
  const total = useMemo(() => lineas.reduce((a, l) => a + (aNum(l.kg) || 0), 0), [lineas]);
  const cambio = useMemo(() => JSON.stringify(lineas.map((l) => [l.mp_id, aNum(l.kg)])) !== JSON.stringify(lineasIniciales(original).map((l) => [l.mp_id, aNum(l.kg)])), [lineas, original]);

  useEffect(() => {
    if (!editando || materias) return;
    api("/api/prod/materias-primas").then(setMaterias).catch(() => setMaterias([]));
  }, [editando, materias]);

  const candidatas = useMemo(() => {
    if (!materias) return [];
    const t = buscar.trim().toLowerCase();
    const usadas = new Set(lineas.map((l) => l.mp_id));
    return materias.filter((m) => !usadas.has(m.id) && (!t || `${m.codigo} ${m.nombre}`.toLowerCase().includes(t))).slice(0, 6);
  }, [materias, buscar, lineas]);

  const cambiarKg = (id, v) => setLineas((ls) => ls.map((l) => (l.mp_id === id ? { ...l, kg: v.replace(/[^\d.,]/g, "") } : l)));

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-zinc-400">Fórmula por tachada</p>
          <p className="text-sm text-zinc-500">{fmt(total, 2)} kg en total</p>
        </div>
        {cambio && <span className="text-xs font-bold text-[#FFD60A] border border-[#FFD60A]/40 rounded-full px-2.5 py-1">Distinta a la definida</span>}
        <button type="button" onClick={() => setEditando((v) => !v)} className="min-h-[44px] px-4 rounded-xl bg-white/[0.07] text-sm font-bold text-zinc-200 hover:bg-white/[0.12] cursor-pointer">
          {editando ? "Listo" : "Cambiar"}
        </button>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {lineas.map((l) => {
          const kg = aNum(l.kg) || 0;
          const pct = total > 0 ? (kg / total) * 100 : 0;
          return (
            <li key={l.mp_id} className="rounded-xl bg-[#17171c] border border-white/[0.06] px-3.5 py-2.5">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-white truncate">{l.nombre || l.codigo}</p>
                  <p className="text-xs text-zinc-500">{l.codigo}</p>
                </div>
                {editando ? (
                  <>
                    <input value={l.kg} onChange={(e) => cambiarKg(l.mp_id, e.target.value)} inputMode="decimal" aria-label={`Kg de ${l.nombre || l.codigo}`} className="w-24 min-h-[48px] rounded-xl bg-[#0f0f12] border border-white/[0.12] px-3 text-xl font-extrabold text-white text-right tabular-nums focus:outline-none focus:border-[#FF5A00]" />
                    <span className="text-sm font-bold text-zinc-500">kg</span>
                    <button type="button" onClick={() => setLineas((ls) => ls.filter((x) => x.mp_id !== l.mp_id))} aria-label={`Quitar ${l.nombre || l.codigo}`} className="w-11 h-11 grid place-items-center rounded-xl text-rose-300 hover:bg-rose-500/10 cursor-pointer"><Trash2 size={18} /></button>
                  </>
                ) : (
                  <div className="text-right shrink-0">
                    <p className="text-lg font-extrabold text-white tabular-nums">{fmt(kg, 3)} kg</p>
                    <p className="text-xs font-bold text-[#ff9a63] tabular-nums">{fmt(pct, 1)} %</p>
                  </div>
                )}
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.3 }} className="h-full rounded-full bg-gradient-to-r from-[#FF5A00] to-[#FFD60A]" />
              </div>
            </li>
          );
        })}
      </ul>

      <AnimatePresence initial={false}>
        {editando && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="pt-3">
              <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Agregar otro material…" className="w-full min-h-[52px] rounded-xl bg-[#17171c] border border-white/[0.1] px-4 text-base text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF5A00]" />
              <div className="mt-2 flex flex-wrap gap-2">
                {candidatas.map((m) => (
                  <button key={m.id} type="button" onClick={() => { setLineas((ls) => [...ls, { mp_id: m.id, codigo: m.codigo, nombre: m.nombre, kg: "" }]); setBuscar(""); }} className="min-h-[44px] px-3.5 rounded-xl bg-white/[0.05] border border-white/[0.09] text-sm font-bold text-zinc-200 hover:bg-white/[0.1] inline-flex items-center gap-2 cursor-pointer">
                    <Plus size={15} /> {m.nombre}
                  </button>
                ))}
                {materias && !candidatas.length && <p className="text-sm text-zinc-600">No hay más materiales para agregar.</p>}
              </div>
              <p className="mt-3 text-sm text-zinc-500">Si usaron otra fórmula, cargá los kg reales de la tachada. El jefe de producción ve la diferencia.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
