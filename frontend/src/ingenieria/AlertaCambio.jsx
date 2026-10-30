import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, BellRing, Check, Loader2 } from "lucide-react";
import { conPct, fechaCorta, nf } from "./formato";

/** Compara la fórmula definida con la que se usó en producción y ofrece quedarse con una u otra. */
export default function AlertaCambio({ alerta, ocupado, onAdoptar, onDescartar }) {
  const [nombre, setNombre] = useState("");
  const def = conPct(alerta.diferencias?.definida?.lineas || []);
  const usa = conPct(alerta.formula_usada?.lineas || []);
  const ids = [...new Set([...def.map((l) => l.mp_id), ...usa.map((l) => l.mp_id)])];
  const filas = ids.map((id) => {
    const a = def.find((l) => l.mp_id === id);
    const b = usa.find((l) => l.mp_id === id);
    return { id, nombre: (a || b).nombre, codigo: (a || b).codigo, a: a?.pct ?? 0, b: b?.pct ?? 0, estado: !a ? "nuevo" : !b ? "falta" : Math.abs(a.pct - b.pct) > 0.1 ? "cambio" : "igual" };
  });
  const peso = alerta.diferencias?.peso;

  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-[#FFD60A]/40 bg-gradient-to-b from-[#FFD60A]/[0.09] to-transparent p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <span className="shrink-0 w-11 h-11 rounded-2xl bg-[#FFD60A]/15 border border-[#FFD60A]/30 grid place-items-center text-[#FFD60A]"><BellRing size={20} /></span>
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold text-white leading-tight">Se produjo con una fórmula distinta</h3>
          <p className="text-sm text-zinc-400 mt-0.5">Lote <b className="text-zinc-200">{alerta.lote || "—"}</b> · {fechaCorta(alerta.fecha_carga)}. Lo que usaron no coincide con la receta activa.</p>
        </div>
      </header>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.08]">
        <div className="grid grid-cols-[1fr_72px_20px_72px] sm:grid-cols-[1fr_96px_24px_96px] gap-x-2 px-3.5 py-2 bg-white/[0.04] text-[11px] font-extrabold uppercase tracking-[0.08em] text-zinc-400">
          <span>Material</span><span className="text-right">Definida</span><span /><span className="text-right">Usada</span>
        </div>
        {filas.map((f) => (
          <div key={f.id} className={`grid grid-cols-[1fr_72px_20px_72px] sm:grid-cols-[1fr_96px_24px_96px] gap-x-2 items-center px-3.5 py-2.5 border-t border-white/[0.05] ${f.estado === "igual" ? "" : "bg-[#FFD60A]/[0.05]"}`}>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{f.nombre}</p>
              <p className="text-xs text-zinc-500">{f.estado === "nuevo" ? "No estaba en la receta" : f.estado === "falta" ? "No se usó" : f.estado === "cambio" ? "Distinto porcentaje" : f.codigo}</p>
            </div>
            <span className="text-right text-sm font-bold text-zinc-300 tabular-nums">{nf(f.a, 1)} %</span>
            <ArrowRight size={14} className={f.estado === "igual" ? "text-zinc-700" : "text-[#FFD60A]"} />
            <span className={`text-right text-sm font-extrabold tabular-nums ${f.estado === "igual" ? "text-zinc-300" : "text-[#FFD60A]"}`}>{nf(f.b, 1)} %</span>
          </div>
        ))}
        {peso && (
          <div className="px-3.5 py-2.5 border-t border-white/[0.05] bg-[#FFD60A]/[0.05] text-sm text-zinc-300">
            Peso de la pieza: <b className="text-white">{nf(peso.definido, 3)} kg</b> definido → <b className="text-[#FFD60A]">{nf(peso.usado, 3)} kg</b> usado
          </div>
        )}
      </div>

      <label className="block mt-4">
        <span className="block text-[12px] font-extrabold uppercase tracking-[0.1em] text-zinc-400 mb-2">Nombre de la receta nueva (opcional)</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={`Usada en ${alerta.lote || "producción"}`} maxLength={120} className="w-full min-h-[48px] rounded-2xl bg-[#17171c] border border-white/[0.1] px-4 text-base text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF5A00]/70" />
      </label>
      <div className="mt-3 flex flex-col sm:flex-row gap-2.5">
        <button onClick={() => onAdoptar(nombre.trim())} disabled={ocupado} className="flex-1 min-h-[52px] rounded-2xl bg-[#FFD60A] text-black text-base font-extrabold inline-flex items-center justify-center gap-2 hover:bg-white active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer">
          {ocupado ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} strokeWidth={3} />}
          Usar la fórmula que se usó
        </button>
        <button onClick={onDescartar} disabled={ocupado} className="min-h-[52px] px-5 rounded-2xl bg-white/[0.07] text-base font-bold text-zinc-200 hover:bg-white/[0.12] disabled:opacity-50 cursor-pointer">Mantener la actual</button>
      </div>
      <p className="mt-2.5 text-xs text-zinc-500">Si usás la fórmula usada, se crea una receta nueva, queda activa y se registra quién lo hizo. La actual se conserva en el historial.</p>
    </motion.section>
  );
}
