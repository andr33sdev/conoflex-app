import { lazy, Suspense, useState } from "react";
import { Flame, Sparkle, Trash2 } from "lucide-react";
import { Drawer } from "../produccion/ui";
import { sinSemi } from "../produccion/util";
import Movimientos from "./Movimientos";
import { modeloDe } from "../visor3d/modelos";

/** Stock mínimo para el DEPÓSITO 33: avisa cuando el 33 llega o baja de este valor. 0 = sin aviso. */
function StockMinimo({ item, onClasificar }) {
  const minimo = Number(item.stock_minimo) || 0;
  const bajo = minimo > 0 && (Number(item.stock_33) || 0) <= minimo;
  return (
    <div className={`mt-3 rounded-2xl border p-4 ${bajo ? "border-rose-500/35 bg-rose-500/[0.07]" : "border-white/[0.07] bg-white/[0.03]"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-zinc-200 font-semibold">Stock mínimo (Depósito 33)</p>
        {bajo && <span className="text-xs font-bold text-rose-300 rounded-full border border-rose-400/30 bg-rose-400/[0.1] px-2.5 py-0.5">Bajo mínimo</span>}
      </div>
      <p className="text-zinc-500 text-sm mt-0.5">Cuando el Depósito 33 llega o baja de este valor, salta una alerta. Solo aplica al 33. Poné 0 para no controlarlo.</p>
      <div className="mt-3 flex items-center gap-2">
        <input
          key={item.id}
          type="number"
          min="0"
          step="1"
          defaultValue={minimo}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= 0 && v !== minimo) onClasificar(item, { stock_minimo: v });
          }}
          className="w-32 rounded-xl border border-white/[0.09] bg-black/30 px-3 py-2 text-white text-lg font-bold tabular-nums focus:border-[#FF5A00] focus:outline-none"
        />
        <span className="text-zinc-400 font-bold">unidades</span>
        <span className="text-zinc-600 text-xs ml-1">Se guarda al salir del campo.</span>
      </div>
    </div>
  );
}

/** Marcar el semielaborado como "producto caliente" (reservado / requiere autorización para retirar). Solo admin. */
function ProductoCaliente({ item, onCaliente }) {
  const activo = Number(item.caliente) === 1;
  const [editando, setEditando] = useState(false);
  const [motivo, setMotivo] = useState(item.caliente_motivo || "");
  return (
    <section className={`rounded-2xl border p-4 ${activo ? "border-amber-500/30 bg-amber-500/[0.06]" : "border-white/[0.07] bg-white/[0.03]"}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500 inline-flex items-center gap-1.5"><Flame size={14} className={activo ? "text-amber-400" : "text-zinc-500"} /> Producto caliente</h3>
        {activo && <span className="text-xs font-bold text-amber-300 rounded-full border border-amber-400/25 bg-amber-400/[0.08] px-2.5 py-0.5">Activo</span>}
      </div>
      <p className="mt-2 text-sm text-zinc-500">Reservado o con autorización previa para retirar. Al solicitarlo, queda pendiente de autorización.</p>
      {activo && !editando && item.caliente_motivo && <p className="mt-2 text-sm text-amber-200"><span className="font-bold">Motivo:</span> {item.caliente_motivo}</p>}
      {editando ? (
        <div className="mt-3 flex flex-col gap-2">
          <input type="text" maxLength={255} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (ej: reservado para licitación)" className="w-full min-h-[46px] rounded-xl border border-white/[0.09] bg-black/30 px-3 text-white focus:border-[#FF5A00] focus:outline-none" />
          <div className="flex gap-2">
            <button onClick={() => { onCaliente(item, { caliente: true, motivo: motivo.trim() }); setEditando(false); }} className="flex-1 min-h-[46px] rounded-xl bg-amber-500 text-black font-extrabold cursor-pointer">Guardar</button>
            <button onClick={() => { setEditando(false); setMotivo(item.caliente_motivo || ""); }} className="min-h-[46px] px-4 rounded-xl text-zinc-300 font-bold hover:bg-white/[0.07] cursor-pointer">Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button onClick={() => setEditando(true)} className="min-h-[46px] px-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm font-bold text-amber-200 cursor-pointer">{activo ? "Cambiar motivo" : "Marcar como caliente"}</button>
          {activo && <button onClick={() => onCaliente(item, { caliente: false, motivo: "" })} className="min-h-[46px] px-4 rounded-xl text-sm font-bold text-zinc-300 hover:bg-white/[0.07] cursor-pointer">Quitar</button>}
        </div>
      )}
    </section>
  );
}

const Visor3D = lazy(() => import("../visor3d/Visor3D")); // three.js solo se descarga si el semielaborado tiene modelo

const ORIGENES = [["FABRICA", "Se fabrica"], ["PROVEEDOR", "Se compra"], ["PARAGUAY", "De Paraguay"]];
const n0 = (v) => Number(v || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 });

/** Ficha lateral de un semielaborado: cómo se consigue, stock por depósito, movimientos y pegado. */
export default function FichaSemi({ item, seguir, onCerrar, onClasificar, onCambio, comprometido = 0, onVerComprometido, onEliminar, esAdmin = false, onCaliente }) {
  const en3d = item ? modeloDe(item) : null;
  return (
    <Drawer
      abierto={!!item}
      onCerrar={onCerrar}
      titulo={item ? <span className="flex items-center gap-3"><span className="font-mono text-[#FFD60A]">{item.codigo}</span></span> : ""}
      subtitulo={sinSemi(item?.nombre)}
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

          {esAdmin && onCaliente && <ProductoCaliente item={item} onCaliente={onCaliente} />}

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500 mb-3">Tienda oficial (web)</h3>
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
              <p className="text-sm text-zinc-200 font-semibold">Margen de resguardo para la web</p>
              <p className="text-zinc-500 text-sm mt-0.5">La tienda muestra <span className="text-emerald-400 font-semibold">Entrega inmediata</span> solo si el disponible del Depósito 33 supera lo que pide el cliente en este porcentaje. Si no, muestra <span className="text-[#FFD60A] font-semibold">Consultar</span>. La web nunca ve la cantidad.</p>
              <div className="mt-3 flex items-center gap-2">
                <input
                  key={item.id}
                  type="number"
                  min="0"
                  max="1000"
                  step="1"
                  defaultValue={item.margen_web ?? 10}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 0 && v <= 1000 && v !== Number(item.margen_web ?? 10)) onClasificar(item, { margen_web: v });
                  }}
                  className="w-28 rounded-xl border border-white/[0.09] bg-black/30 px-3 py-2 text-white text-lg font-bold tabular-nums focus:border-[#FF5A00] focus:outline-none"
                />
                <span className="text-zinc-400 font-bold text-lg">%</span>
                <span className="text-zinc-600 text-xs ml-1">Se guarda al salir del campo.</span>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500 mb-3">Stock por depósito</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[["Depósito 33", item.stock_33], ["Depósito 26", item.stock_26], ["Ayolas", item.stock_ayolas], ["Depósito 37", item.stock_37]].map(([t, v]) => (
                <div key={t} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500">{t}</span>
                  <strong className={`block mt-1 text-2xl font-extrabold tabular-nums ${Number(v) > 0 ? "text-white" : "text-zinc-600"}`}>{n0(v)}</strong>
                  {t === "Depósito 33" && comprometido > 0 && (
                    <button onClick={onVerComprometido} className="mt-1.5 text-left text-xs font-bold text-sky-200 hover:underline cursor-pointer">
                      {n0(comprometido)} comprometido · {n0(Number(v) - comprometido)} disponible
                    </button>
                  )}
                </div>
              ))}
            </div>
            <StockMinimo item={item} onClasificar={onClasificar} />
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

          {onEliminar && (
            <section className="pt-1">
              <button
                onClick={() => onEliminar(item)}
                className="w-full min-h-[48px] rounded-2xl border border-rose-500/25 bg-rose-500/[0.06] text-sm font-bold text-rose-300 hover:bg-rose-500/[0.12] inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Trash2 size={16} /> Eliminar semielaborado
              </button>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}
