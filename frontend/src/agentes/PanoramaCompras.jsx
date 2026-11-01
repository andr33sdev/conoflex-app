import { useState } from "react";
import { ChevronDown, Loader2, Trash2 } from "lucide-react";
import { api } from "../produccion/util";

const fmt = (n, d = 0) => (n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toLocaleString("es-AR", { maximumFractionDigits: d }));
const PRIO = { 5: "Urgente", 4: "Alta", 3: "Normal", 2: "Baja", 1: "Baja" };

/** Sección cerrada hasta que se pide: el título dice cuántos hay. */
function Plegable({ titulo, cuenta, children }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <section className="border-t border-white/[0.06] pt-1">
      <button onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} className="w-full flex items-center gap-2 py-3 text-left text-[14px] font-semibold text-zinc-300 hover:text-white">
        <ChevronDown size={16} className={`transition-transform ${abierta ? "rotate-180" : ""}`} />
        {titulo} <span className="text-zinc-500 font-medium">({cuenta})</span>
      </button>
      {abierta && <div className="pb-3">{children}</div>}
    </section>
  );
}

/** Panel de Vera: la lista de compra que está armando (en vivo), lo que espera firma, lo que no llegó y cómo cumple cada proveedor. */
export default function PanoramaCompras({ datos, error, onPreguntar, base, alCambiar, mostrar }) {
  const [confirmaBorrar, setConfirmaBorrar] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const eliminar = async () => {
    setBorrando(true);
    try {
      await api(`${base}/lista/eliminar`, { method: "POST" });
      mostrar?.("Listo: eliminé la lista. Quedó sin ningún renglón.");
      setConfirmaBorrar(false);
      alCambiar?.();
    } catch (e) {
      mostrar?.(e.message, "error");
    } finally {
      setBorrando(false);
    }
  };
  if (error) return <div className="p-6 text-center text-sm text-zinc-400">{error}</div>;
  if (!datos) return <div className="h-full grid place-items-center text-zinc-500 py-16"><Loader2 className="animate-spin" size={22} /></div>;
  const { lista, resumen: r } = datos;
  const accion = "min-h-[38px] px-3.5 rounded-lg text-[13px] font-semibold";
  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-5 py-4 space-y-5">
      <section className="rounded-xl border border-white/[0.09]">
        <header className="flex flex-wrap items-baseline gap-x-2 px-4 pt-3.5 pb-1">
          <h3 className="text-[15px] font-semibold text-white">{lista.abierta ? `Solicitud #${lista.solicitud_id} en armado` : "Todavía no hay una lista en armado"}</h3>
          {lista.abierta && <span className="text-[12.5px] text-zinc-500">{lista.total_renglones} {lista.total_renglones === 1 ? "renglón" : "renglones"}</span>}
        </header>
        {lista.abierta ? (
          <>
            <ul className="px-4 divide-y divide-white/[0.06]">
              {lista.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold text-white leading-snug break-words">{i.articulo}</span>
                    <span className="block text-[12px] text-zinc-500">{i.proveedor || "Proveedor a definir"} · {PRIO[i.prioridad] || "Normal"}</span>
                  </span>
                  <span className="text-[15px] font-bold text-white tabular-nums shrink-0">{fmt(i.cantidad, 1)}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-1.5 px-3 pb-3 pt-2">
              <button onClick={() => onPreguntar("Dejá la lista lista para firmar")} className={`${accion} bg-white text-black hover:bg-zinc-200`}>Cerrar para firma</button>
              <button onClick={() => onPreguntar("Agregá a la lista lo que hace falta comprar")} className={`${accion} text-zinc-300 hover:bg-white/[0.07]`}>Sumar lo que falta</button>
              <button onClick={() => setConfirmaBorrar(true)} className={`${accion} ml-auto text-rose-300 hover:bg-rose-500/10 inline-flex items-center gap-1.5`}><Trash2 size={14} /> Eliminar lista</button>
            </div>
            {confirmaBorrar && (
              <div className="mx-3 mb-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3 text-[13.5px] text-rose-100 leading-snug">
                <p>¿Eliminar la solicitud #{lista.solicitud_id} con sus {lista.total_renglones} {lista.total_renglones === 1 ? "renglón" : "renglones"}? Queda sin ninguna lista en armado. Se guarda una copia por seguridad.</p>
                <div className="mt-2.5 flex gap-1.5">
                  <button onClick={eliminar} disabled={borrando} className={`${accion} bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-60`}>{borrando ? "Eliminando…" : "Sí, eliminar"}</button>
                  <button onClick={() => setConfirmaBorrar(false)} disabled={borrando} className={`${accion} bg-white/[0.07] hover:bg-white/[0.12] text-zinc-100`}>Cancelar</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="px-4 pb-4">
            <p className="text-sm text-zinc-400">Pedime materiales con cantidades, o decile a Nati que me pase lo que falta: todo se suma a una misma solicitud.</p>
            <button onClick={() => onPreguntar("Armame la lista con lo que hace falta comprar")} className={`mt-3 ${accion} bg-white text-black hover:bg-zinc-200`}>Armar con lo que falta</button>
          </div>
        )}
      </section>

      {datos.por_firmar.length > 0 && (
        <Plegable titulo="Esperan firma" cuenta={datos.por_firmar.length}>
          <ul className="divide-y divide-white/[0.06]">
            {datos.por_firmar.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-2.5 text-[13.5px]">
                <b className="text-white">#{s.id}</b>
                <span className="text-zinc-500">hace {s.dias} {s.dias === 1 ? "día" : "días"}</span>
                <span className="ml-auto text-[12px] text-zinc-400">Jefe {s.firmo_jefe ? "✓" : "—"} · Gerente {s.firmo_gerente ? "✓" : "—"}</span>
              </li>
            ))}
          </ul>
        </Plegable>
      )}

      {r.sin_recibir > 0 && (
        <p className="text-[13.5px] text-zinc-400">
          <b className="text-zinc-200">{r.sin_recibir}</b> {r.sin_recibir === 1 ? "renglón pedido todavía sin recibir" : "renglones pedidos todavía sin recibir"}.{" "}
          <button onClick={() => onPreguntar("¿Qué compras pedidas todavía no llegaron?")} className="font-semibold text-zinc-300 hover:text-white underline underline-offset-2">Ver cuáles</button>
        </p>
      )}

      {datos.proveedores.length > 0 && (
        <Plegable titulo="Cumplimiento de proveedores" cuenta={datos.proveedores.length}>
          <ul className="space-y-3">
            {datos.proveedores.map((p) => (
              <li key={p.proveedor}>
                <div className="flex items-baseline gap-2 text-[13.5px]">
                  <span className="font-semibold text-white truncate">{p.proveedor}</span>
                  <span className="text-zinc-500 text-[12px]">{p.renglones} renglones</span>
                  <span className={`ml-auto font-bold tabular-nums ${p.cumplido_pct < 50 ? "text-[#ff8a4d]" : "text-zinc-200"}`}>{p.cumplido_pct}%</span>
                </div>
                <div className="mt-1 h-1.5 bg-white/[0.07]"><div className="h-full bg-zinc-500" style={{ width: `${Math.max(2, p.cumplido_pct)}%` }} /></div>
              </li>
            ))}
          </ul>
        </Plegable>
      )}
    </div>
  );
}
