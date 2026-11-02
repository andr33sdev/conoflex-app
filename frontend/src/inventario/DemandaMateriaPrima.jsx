import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { api } from "../produccion/util";
import { nf } from "../ingenieria/formato";

function Dato({ k, v, tono = "" }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{k}</div>
      <div className={`text-xl font-extrabold mt-1 truncate ${tono || "text-white"}`}>{v}</div>
    </div>
  );
}

/** Materia prima contra el plan de la semana: lo que falta producir por su receta, contra el stock. Sin estimar demanda. */
export default function DemandaMateriaPrima({ item, abierto }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const id = item?.id;

  useEffect(() => {
    if (!abierto || !id) return undefined;
    let vivo = true;
    api(`/api/materias-primas/plan-semana?id=${id}`)
      .then((d) => vivo && (setDatos(d), setError("")))
      .catch((e) => vivo && (setError(e.message), setDatos(null)));
    return () => {
      vivo = false;
    };
  }, [abierto, id]);

  const m = datos?.materia;
  const u = (m?.unidad || item?.unidad_medida || "kg").toLowerCase().replace("kilos", "kg");

  return (
    <div>
      {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm px-3 py-2 mb-3">{error}</div>}
      {!datos && !error && <div className="py-16 text-center text-sm text-zinc-500">Calculando…</div>}
      {datos && !m && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 text-sm text-zinc-400">
          {datos.hay_plan ? "Este material no se usa en lo que falta producir del plan de esta semana." : "Todavía no hay plan de producción para esta semana."}
        </div>
      )}
      {m && (
        <>
          {m.falta > 0 && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 mb-3 flex gap-3">
              <AlertTriangle size={20} className="text-rose-300 shrink-0 mt-0.5" />
              <div className="text-sm text-rose-200">No alcanza para terminar la semana: <b>faltan {nf(m.falta, 1)} {u}</b>.</div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2.5">
            <Dato k="Stock actual" v={`${nf(m.stock_actual, 1)} ${u}`} />
            <Dato k="Falta producir usa" v={`${nf(m.necesidad, 1)} ${u}`} />
            <Dato k="Quedaría" v={`${nf(m.stock_despues, 1)} ${u}`} tono={m.stock_despues < 0 ? "text-rose-300" : ""} />
          </div>
          <div className="mt-5 text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Lotes de la semana que lo usan</div>
          <div className="space-y-1.5">
            {m.lotes.map((l, i) => (
              <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-sm font-semibold text-zinc-200 truncate"><span className="font-mono text-[11px] text-[#FFD60A] mr-2">{l.lote}</span>{l.semielaborado}</span>
                <span className="text-sm font-extrabold text-white shrink-0">{nf(l.cantidad, 1)} {u}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-zinc-500">Cuenta solo lo que falta producir del plan de esta semana.</p>
        </>
      )}
    </div>
  );
}
