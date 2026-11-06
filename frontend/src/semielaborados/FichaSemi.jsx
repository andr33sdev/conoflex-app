import { lazy, Suspense } from "react";
import { Sparkle } from "lucide-react";
import { Drawer } from "../produccion/ui";
import Movimientos from "./Movimientos";
import { modeloDe } from "../visor3d/modelos";

const Visor3D = lazy(() => import("../visor3d/Visor3D")); // three.js solo se descarga si el semielaborado tiene modelo

const ORIGENES = [["FABRICA", "Se fabrica"], ["PROVEEDOR", "Se compra"], ["PARAGUAY", "De Paraguay"]];
const n0 = (v) => Number(v || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 });

/** Ficha lateral de un semielaborado: cómo se consigue, stock por depósito, movimientos y pegado. */
export default function FichaSemi({ item, seguir, onCerrar, onClasificar, onCambio }) {
  const en3d = item ? modeloDe(item) : null;
  return (
    <Drawer
      abierto={!!item}
      onCerrar={onCerrar}
      titulo={item ? <span className="flex items-center gap-3"><span className="font-mono text-[#FFD60A]">{item.codigo}</span></span> : ""}
      subtitulo={item?.nombre}
    >
      {item && (
        <div className="flex flex-col gap-7">
          {en3d && (
            <section>
              <Suspense fallback={<div className="h-[280px] rounded-2xl border border-white/[0.07] bg-white/[0.03]" />}>
                <Visor3D archivo={en3d.modelo.archivo} color={en3d.color.hex} />
              </Suspense>
              <p className="mt-2 text-xs text-zinc-500 text-center">{en3d.modelo.titulo} · {en3d.color.nombre}</p>
            </section>
          )}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500 mb-3">¿Cómo se consigue?</h3>
            <div className="grid grid-cols-3 gap-2">
              {ORIGENES.map(([v, t]) => {
                const sel = (item.origen || "FABRICA") === v;
                return (
                  <button key={v} onClick={() => onClasificar(item, { origen: v })} aria-pressed={sel} className={`min-h-[46px] rounded-xl text-sm font-bold border cursor-pointer transition-colors ${sel ? "bg-[#FF5A00] border-[#FF5A00] text-black" : "border-white/[0.09] bg-white/[0.03] text-zinc-400 hover:text-white hover:bg-white/[0.07]"}`}>
                    {t}
                  </button>
                );
              })}
            </div>
            <label className="mt-4 flex items-start gap-3 cursor-pointer rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
              <input type="checkbox" checked={seguir} onChange={(e) => onClasificar(item, { seguir_demanda: e.target.checked ? 1 : 0 })} className="mt-0.5 w-5 h-5 accent-[#FF5A00] cursor-pointer" />
              <span className="text-sm text-zinc-200 font-semibold">
                Seguir su stock contra la demanda
                <span className="block text-zinc-500 font-normal mt-0.5">Si lo apagás, solo se muestra la demanda promedio y no se avisa ni se prioriza.</span>
              </span>
            </label>
          </section>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500 mb-3">Stock por depósito</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[["Depósito 33", item.stock_33], ["Depósito 26", item.stock_26], ["Ayolas", item.stock_ayolas], ["Depósito 37", item.stock_37]].map(([t, v]) => (
                <div key={t} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500">{t}</span>
                  <strong className={`block mt-1 text-2xl font-extrabold tabular-nums ${Number(v) > 0 ? "text-white" : "text-zinc-600"}`}>{n0(v)}</strong>
                </div>
              ))}
            </div>
          </section>

          <Movimientos item={item} alCambiar={onCambio} />

          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500 inline-flex items-center gap-1.5"><Sparkle size={14} className="text-cyan-400" /> Especificación de pegado</h3>
              <span className="text-xs font-bold text-cyan-300 rounded-full border border-cyan-400/25 bg-cyan-400/[0.07] px-2.5 py-0.5">{item.pegado_nombre || "Sin pegado"}</span>
            </div>
            {item.pegado_nombre ? (
              <div className="mt-3 grid grid-cols-3 gap-2.5">
                {[["Reflectiva", item.reflectiva || "Ninguna"], ["Orajet", item.protector_orajet ? "Sí" : "No"], ["Aplicación", item.protector_orajet ? item.aplicacion_protector || "Completa" : "No aplica"]].map(([t, v]) => (
                  <div key={t} className="rounded-xl bg-black/30 p-3">
                    <span className="block text-[10px] font-bold uppercase tracking-[0.06em] text-zinc-500">{t}</span>
                    <strong className="block mt-1 text-sm text-white truncate">{v}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">No requiere pegado.</p>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
