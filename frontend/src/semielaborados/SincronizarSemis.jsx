import { useState } from "react";
import { CheckCircle2, Layers, Loader2, Plus } from "lucide-react";
import { Modal } from "../produccion/ui";

const n = (v) => Number(v || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 });

function Bloque({ titulo, icono: Icono, color, filas, sel, set, clave, linea, alternar }) {
  if (filas.length === 0) return null;
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
        <input type="checkbox" aria-label={`Elegir todos: ${titulo}`} checked={sel.length === filas.length} onChange={(e) => set(e.target.checked ? filas.map(clave) : [])} className="w-5 h-5 cursor-pointer" style={{ accentColor: color }} />
        <h3 className="text-sm font-extrabold inline-flex items-center gap-2" style={{ color }}><Icono size={16} /> {titulo} <span className="text-zinc-500 font-bold">({filas.length})</span></h3>
      </div>
      <div className="max-h-64 overflow-y-auto custom-scrollbar divide-y divide-white/[0.05]">
        {filas.map((f) => (
          <label key={clave(f)} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-white/[0.03]">
            <input type="checkbox" checked={sel.includes(clave(f))} onChange={() => alternar(sel, set, clave(f))} className="w-4 h-4 cursor-pointer" style={{ accentColor: color }} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-white truncate"><span className="font-mono text-xs mr-2" style={{ color }}>{f.codigo}</span>{f.nombre}</span>
              <span className="block text-xs text-zinc-400 tabular-nums">{linea(f)}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

/** Revisión de lo que trae la planilla antes de aplicarlo. Se remonta con key en cada apertura. */
const alternar = (lista, set, id) => set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

export default function SincronizarSemis({ datos, aplicando, onCerrar, onAplicar }) {
  const [nuevos, setNuevos] = useState(() => datos.nuevos.map((x) => x.codigo));
  const [mods, setMods] = useState(() => datos.modificados.map((x) => x.id));
  const total = nuevos.length + mods.length;
  const vacio = datos.nuevos.length === 0 && datos.modificados.length === 0;

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Sincronizar con la planilla"
      subtitulo="Revisá qué va a cambiar antes de aplicarlo."
      ancho="max-w-2xl"
      pie={
        <div className="flex items-center justify-between gap-3">
          <button onClick={onCerrar} className="min-h-[46px] px-5 rounded-xl border border-white/[0.1] text-sm font-bold text-zinc-300 hover:bg-white/[0.06] cursor-pointer">Cancelar</button>
          {!vacio && (
            <button onClick={() => onAplicar({ nuevos: datos.nuevos.filter((x) => nuevos.includes(x.codigo)), modificados: datos.modificados.filter((x) => mods.includes(x.id)) })} disabled={aplicando || total === 0} className="min-h-[46px] px-6 rounded-xl bg-[#FFD60A] text-black text-sm font-extrabold inline-flex items-center gap-2 hover:bg-white disabled:opacity-40 cursor-pointer">
              {aplicando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Aplicar {total} {total === 1 ? "cambio" : "cambios"}
            </button>
          )}
        </div>
      }
    >
      {vacio ? (
        <div className="py-12 text-center">
          <CheckCircle2 size={44} className="mx-auto text-emerald-400" />
          <p className="mt-3 text-lg font-extrabold text-white">Todo al día</p>
          <p className="text-sm text-zinc-500 mt-1">La planilla y la app coinciden.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Bloque alternar={alternar} titulo="Semielaborados nuevos" icono={Plus} color="#FF5A00" filas={datos.nuevos} sel={nuevos} set={setNuevos} clave={(f) => f.codigo} linea={(f) => `33: ${n(f.stock_33)} · 26: ${n(f.stock_26)} · Ayolas: ${n(f.stock_ayolas)} · 37: ${n(f.stock_37)}`} />
          <Bloque alternar={alternar} titulo="Stocks a actualizar" icono={Layers} color="#FFD60A" filas={datos.modificados} sel={mods} set={setMods} clave={(f) => f.id} linea={(f) => `33: ${n(f.actual.stock_33)} → ${n(f.nuevo.stock_33)} · 26: ${n(f.actual.stock_26)} → ${n(f.nuevo.stock_26)}`} />
          {datos.sin_planilla?.length > 0 && <p className="text-xs text-zinc-500">{datos.sin_planilla.length} {datos.sin_planilla.length === 1 ? "código de la app no figura" : "códigos de la app no figuran"} en la planilla y no se tocan.</p>}
        </div>
      )}
    </Modal>
  );
}
