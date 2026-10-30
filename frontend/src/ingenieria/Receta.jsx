import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Pencil, Trash2, Zap } from "lucide-react";
import { COLORES, conPct, fechaHora, kgLindo, nf } from "./formato";

/** Barra apilada con el reparto de la fórmula. */
export function BarraComposicion({ lineas, alto = "h-2.5" }) {
  const l = conPct(lineas);
  return (
    <div className={`flex ${alto} w-full overflow-hidden rounded-full bg-white/[0.06]`} role="img" aria-label="Reparto de la fórmula">
      {l.map((x, i) => (
        <motion.div key={x.mp_id ?? i} initial={{ width: 0 }} animate={{ width: `${x.pct}%` }} transition={{ duration: 0.5, delay: i * 0.05, ease: [0.2, 0.8, 0.2, 1] }} style={{ background: COLORES[i % COLORES.length] }} title={`${x.nombre}: ${nf(x.pct, 1)} %`} />
      ))}
    </div>
  );
}

/** Tarjeta de una receta: composición, quién la hizo y acciones. */
export default function Receta({ r, onActivar, onEditar, onEliminar, ocupado }) {
  const [confirmar, setConfirmar] = useState(false);
  const mp = (r.ingredientes || []).filter((i) => i.item_type === "MP");
  const se = (r.ingredientes || []).filter((i) => i.item_type === "SE");
  const conFormula = mp.length > 0 && mp.every((i) => i.cantidad_tachada != null);
  const lineas = conFormula ? mp.map((i) => ({ mp_id: i.materia_prima_id, nombre: i.item_nombre, codigo: i.item_codigo, kg_tachada: Number(i.cantidad_tachada), kg_pieza: Number(i.cantidad) })) : [];
  const total = lineas.reduce((a, l) => a + l.kg_tachada, 0);
  const pcts = conPct(lineas);
  const modificada = r.updated_at && r.created_at && Math.abs(new Date(r.updated_at) - new Date(r.created_at)) > 60000;

  return (
    <motion.article layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className={`rounded-3xl border p-4 sm:p-5 ${r.es_activa ? "border-emerald-500/40 bg-gradient-to-b from-emerald-500/[0.07] to-transparent" : "border-white/[0.08] bg-[#111114]"}`}>
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-extrabold text-white leading-tight break-words">{r.nombre_version}</h3>
            {r.es_activa && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-emerald-300">
                <CheckCircle2 size={13} /> Activa en planta
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
            Creada por <b className="text-zinc-300">{r.creado_por || "—"}</b> · {fechaHora(r.created_at)}
            {modificada && (
              <>
                <br />
                Última modificación por <b className="text-zinc-300">{r.actualizado_por || "—"}</b> · {fechaHora(r.updated_at)}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!r.es_activa && (
            <button onClick={onActivar} disabled={ocupado} className="min-h-[40px] px-3.5 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-sm font-bold text-emerald-200 hover:bg-emerald-500/25 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
              <Zap size={14} /> Activar
            </button>
          )}
          <button onClick={onEditar} aria-label={`Editar ${r.nombre_version}`} className="w-10 h-10 grid place-items-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08] cursor-pointer"><Pencil size={16} /></button>
          {confirmar ? (
            <span className="inline-flex items-center gap-1">
              <button onClick={() => { setConfirmar(false); onEliminar(); }} className="min-h-[40px] px-3 rounded-xl bg-rose-500/20 border border-rose-400/40 text-sm font-bold text-rose-200 cursor-pointer">Sí, eliminar</button>
              <button onClick={() => setConfirmar(false)} className="min-h-[40px] px-3 rounded-xl text-sm font-bold text-zinc-400 hover:text-white cursor-pointer">No</button>
            </span>
          ) : (
            <button onClick={() => setConfirmar(true)} aria-label={`Eliminar ${r.nombre_version}`} className="w-10 h-10 grid place-items-center rounded-xl text-zinc-500 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"><Trash2 size={16} /></button>
          )}
        </div>
      </header>

      {conFormula ? (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2 mb-3 text-xs font-bold">
            <span className="rounded-full bg-white/[0.06] px-3 py-1.5 text-zinc-300">Pieza <b className="text-white">{nf(Number(r.peso_pieza_kg), 3)} kg</b></span>
            <span className="rounded-full bg-white/[0.06] px-3 py-1.5 text-zinc-300">Tachada <b className="text-white">{nf(total, 2)} kg</b></span>
          </div>
          <BarraComposicion lineas={lineas} />
          <ul className="mt-3 divide-y divide-white/[0.05]">
            {pcts.map((l, i) => (
              <li key={l.mp_id} className="flex items-center gap-3 py-2.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORES[i % COLORES.length] }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate">{l.nombre}</p>
                  <p className="text-xs text-zinc-500">{l.codigo}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-extrabold text-white tabular-nums">{kgLindo(l.kg_tachada)} <span className="text-zinc-500 font-bold">por tachada</span></p>
                  <p className="text-xs text-zinc-400 tabular-nums"><b className="text-[#ff9a63]">{nf(l.pct, 1)} %</b> · {kgLindo(l.kg_pieza)} por pieza</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : mp.length > 0 ? (
        <div className="mt-4">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-zinc-500 mb-2">Cantidad por unidad producida</p>
          <ul className="divide-y divide-white/[0.05]">
            {mp.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2.5">
                <p className="min-w-0 flex-1 text-sm font-bold text-white truncate">{i.item_nombre} <span className="text-xs font-normal text-zinc-500">{i.item_codigo}</span></p>
                <span className="text-sm font-extrabold text-white tabular-nums">{nf(Number(i.cantidad), 4)} {i.unidad_medida || "Kg"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">Esta receta se cargó por pieza. Al editarla podés pasarla a fórmula por tachada.</p>
        </div>
      ) : null}

      {se.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-zinc-500 mb-2">Semielaborados que lleva</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {se.map((i) => (
              <li key={i.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2.5">
                <p className="min-w-0 flex-1 text-sm font-bold text-white truncate">{i.item_nombre}<span className="block text-xs font-normal text-zinc-500">{i.item_codigo}</span></p>
                <span className="text-sm font-extrabold text-white tabular-nums">× {nf(Number(i.cantidad), 3)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!mp.length && !se.length && <p className="mt-4 text-sm text-zinc-500">Esta receta no tiene materiales.</p>}
    </motion.article>
  );
}
