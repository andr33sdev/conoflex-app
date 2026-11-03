import { Modal } from "../produccion/ui";

const fmt = (n, d = 3) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString("es-AR", { maximumFractionDigits: d }) : "—");

/**
 * Receta de lo que se va a producir: material y cantidad. En inyección la cantidad es por tachada (con el total de la tachada);
 * en rotomoldeo, por pieza. Si el producto no tiene fórmula definida, se muestra la receta de la ingeniería.
 */
export default function RecetaProduccion({ asignacion: a, onCerrar }) {
  const f = a?.formula;
  const porTachada = f ? !!f.con_tachada : true;
  const filas = f?.lineas?.length
    ? f.lineas.map((l) => ({ id: l.mp_id, codigo: l.codigo, nombre: l.nombre, cantidad: Number(l.kg_tachada), unidad: "kg", pct: l.pct }))
    : (a?.receta || []).map((r, i) => ({ id: `${r.codigo}-${i}`, codigo: r.codigo, nombre: r.nombre, cantidad: Number(r.cantidad), unidad: String(r.unidad || "kg").toLowerCase() === "kilos" ? "kg" : String(r.unidad || "kg").toLowerCase(), pct: null }));
  const total = filas.reduce((t, x) => t + (x.unidad === "kg" ? x.cantidad || 0 : 0), 0);
  const titulo = f ? (porTachada ? "Receta por tachada" : "Receta por pieza") : "Receta";

  return (
    <Modal abierto={!!a} onCerrar={onCerrar} titulo={a ? titulo : ""} subtitulo={a ? `${a.modelo_nombre} · Lote ${a.lote}` : ""} ancho="max-w-xl">
      {a && (
        <div className="flex flex-col gap-4">
          {filas.length === 0 ? (
            <p className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-5 py-8 text-center text-base text-zinc-400">Este producto todavía no tiene receta cargada. Consultá con ingeniería.</p>
          ) : (
            <>
              <ul className="rounded-3xl border border-white/[0.08] bg-white/[0.03] divide-y divide-white/[0.06] overflow-hidden">
                {filas.map((x) => (
                  <li key={x.id} className="flex items-center gap-4 px-5 py-4">
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-bold text-white leading-snug break-words">{x.nombre || x.codigo}</span>
                      {x.nombre && x.codigo && <span className="block font-mono text-xs font-bold text-[#ff8a4d]">{x.codigo}</span>}
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <b className="text-2xl font-extrabold text-[#FFD60A]">{fmt(x.cantidad)}</b> <span className="text-sm font-semibold text-zinc-500">{x.unidad}</span>
                      {Number.isFinite(x.pct) && <span className="block text-xs text-zinc-500">{fmt(x.pct, 1)} %</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {total > 0 && (
                <div className="flex items-baseline justify-between gap-3 rounded-2xl bg-white/[0.05] px-5 py-3.5">
                  <span className="text-sm font-extrabold uppercase tracking-[0.08em] text-zinc-400">{f ? (porTachada ? "Total de la tachada" : "Peso de la pieza") : "Total"}</span>
                  <span className="tabular-nums"><b className="text-2xl font-extrabold text-white">{fmt(total)}</b> <span className="text-sm font-semibold text-zinc-500">kg</span></span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
