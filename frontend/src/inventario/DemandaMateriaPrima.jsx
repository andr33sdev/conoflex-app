import { useEffect, useState } from "react";
import { AlertTriangle, TrendingDown } from "lucide-react";
import { api } from "../produccion/util";
import { nf } from "../ingenieria/formato";

const PERIODOS = [3, 6, 12];

function Dato({ k, v, sub, tono = "" }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{k}</div>
      <div className={`text-xl font-extrabold mt-1 truncate ${tono || "text-white"}`}>{v}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

/** Demanda de una materia prima: ventas de los últimos N meses abiertas por receta, contra el stock actual. */
export default function DemandaMateriaPrima({ item, abierto }) {
  const [meses, setMeses] = useState(6);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const id = item?.id;

  useEffect(() => {
    if (!abierto || !id) return undefined;
    let vivo = true;
    api(`/api/materias-primas/demanda?id=${id}&meses=${meses}`)
      .then((d) => vivo && (setDatos(d), setError("")))
      .catch((e) => vivo && (setError(e.message), setDatos(null)));
    return () => {
      vivo = false;
    };
  }, [abierto, id, meses]);

  const f = datos?.materias_primas?.[0];
  const u = (f?.unidad || item?.unidad_medida || "kg").toLowerCase().replace("kilos", "kg");
  const negativo = f && f.stock_actual < 0;
  const maxAporte = Math.max(1, ...(f?.usado_en || []).map((x) => x.aporte_mensual));

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Ventas de los últimos</span>
        <div className="flex gap-1.5" role="tablist" aria-label="Período">
          {PERIODOS.map((p) => (
            <button key={p} role="tab" aria-selected={meses === p} onClick={() => setMeses(p)} className={`min-h-[38px] px-4 rounded-full text-sm font-bold border cursor-pointer transition-colors ${meses === p ? "bg-[#FF5A00] border-[#FF5A00] text-white" : "bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white"}`}>
              {p} meses
            </button>
          ))}
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm px-3 py-2 mb-3">{error}</div>}
      {!f && !error && <div className="py-16 text-center text-sm text-zinc-500">Calculando…</div>}

      {f && (
        <>
          {negativo && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 mb-3 flex gap-3">
              <AlertTriangle size={20} className="text-rose-300 shrink-0 mt-0.5" />
              <div className="text-sm text-rose-200">
                Hay un <b>faltante de {nf(Math.abs(f.stock_actual), 2)} {u}</b>: el stock está en negativo. Revisá si falta cargar compras o si hay que corregir el stock.
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            <Dato k="Demanda por mes" v={`${nf(f.demanda_mensual, 0)} ${u}`} sub={`según ventas y recetas`} />
            <Dato k="Stock actual" v={`${nf(f.stock_actual, 2)} ${u}`} tono={negativo ? "text-rose-300" : ""} />
            <Dato k="Alcanza para" v={f.dias_de_stock == null ? "—" : f.stock_actual <= 0 ? "Sin stock" : `${f.dias_de_stock} días`} tono={f.dias_de_stock != null && f.dias_de_stock < 15 ? "text-amber-300" : ""} />
            <Dato k="Reponer (1 mes)" v={f.demanda_mensual > 0 ? `${nf(f.a_reponer_1_mes, 0)} ${u}` : "—"} sub="para cubrir un mes de demanda" tono={f.a_reponer_1_mes > 0 ? "text-[#FFD60A]" : ""} />
          </div>
          {f.consumo_real_mensual != null && (
            <div className="mt-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3 flex items-center gap-3">
              <TrendingDown size={18} className="text-zinc-500 shrink-0" />
              <div className="text-sm text-zinc-400">
                Producción aprobada descontó <b className="text-zinc-200">{nf(f.consumo_real_mensual, 0)} {u}/mes</b> en el mismo período.
              </div>
            </div>
          )}

          <div className="mt-5 text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Dónde se usa</div>
          {f.usado_en.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-sm text-zinc-500">
              Ningún producto vendido en este período usa este material en su ingeniería activa.
            </div>
          ) : (
            <div className="space-y-1.5">
              {f.usado_en.map((x, i) => (
                <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-sm font-semibold text-zinc-200 truncate">{x.producto}{x.via ? <span className="text-zinc-500 font-normal"> · vía {x.via}</span> : null}</span>
                    <span className="text-sm font-extrabold text-white shrink-0">{nf(x.aporte_mensual, 0)} {u}/mes</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/[0.06] mt-2 overflow-hidden"><div className="h-full rounded-full bg-[#FF5A00]" style={{ width: `${(x.aporte_mensual / maxAporte) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}

          {(datos.productos_vendidos_sin_ingenieria_activa?.length > 0 || datos.semielaborados_sin_receta_activa?.length > 0) && (
            <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-3.5 text-xs text-amber-200 space-y-1">
              <div className="font-bold">Esta demanda no incluye:</div>
              {datos.productos_vendidos_sin_ingenieria_activa.slice(0, 5).map((p) => <div key={p.producto}>• {p.producto} ({nf(p.unidades_vendidas, 0)} u. vendidas, sin ingeniería activa)</div>)}
              {datos.semielaborados_sin_receta_activa.slice(0, 5).map((s) => <div key={s.nombre}>• {s.nombre} (semielaborado sin receta activa)</div>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
