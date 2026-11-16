import { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { api } from "../produccion/util";
import { Modal } from "../produccion/ui";
import { cant, fechaCorta, fechaHora, primerNombre } from "./formato";

/** Pedidos armados (sin despachar) que comprometen un semielaborado del 33, con el detalle de cada uno. */
export default function Comprometido({ semi, onCerrar }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState(null);
  useEffect(() => {
    if (!semi) return;
    api(`/api/deposito/comprometido/${semi.id}`).then(setD).catch((e) => setError(e.message));
  }, [semi]);

  const stock = Number(semi?.stock_33) || 0;
  return (
    <Modal abierto={!!semi} onCerrar={onCerrar} titulo={semi ? `${semi.codigo} · comprometido` : ""} subtitulo={semi?.nombre} ancho="max-w-xl">
      {error ? <p className="text-sm text-rose-300">{error}</p> : !d ? (
        <div className="py-10 grid place-items-center"><Loader2 className="animate-spin text-zinc-600" /></div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-3 gap-2.5">
            {[["Stock 33", stock, "text-white"], ["Comprometido", d.cantidad, "text-sky-200"], ["Disponible", stock - d.cantidad, stock - d.cantidad < 0 ? "text-rose-300" : "text-emerald-200"]].map(([t, v, c]) => (
              <div key={t} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
                <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500">{t}</span>
                <strong className={`block mt-1 text-2xl font-extrabold tabular-nums ${c}`}>{cant(v)}</strong>
              </div>
            ))}
          </div>

          {d.pedidos.length === 0 ? (
            <p className="text-sm text-zinc-500">No hay pedidos armados esperando despacho que lleven este semielaborado.</p>
          ) : (
            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500 mb-2.5">En {d.pedidos.length === 1 ? "1 pedido armado" : `${d.pedidos.length} pedidos armados`}</h3>
              <ul className="rounded-2xl border border-white/[0.07] divide-y divide-white/[0.05] overflow-hidden">
                {d.pedidos.map((p) => {
                  const k = `${p.op}|${p.fecha}`;
                  const ver = abierto === k;
                  return (
                    <li key={k}>
                      <button onClick={() => setAbierto(ver ? null : k)} aria-expanded={ver} className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-white/[0.03] cursor-pointer">
                        <span className="font-mono text-sm font-extrabold text-[#FFD60A] w-[70px] shrink-0">{p.op}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-zinc-100 truncate">{p.cliente || "—"}</span>
                          <span className="block text-xs text-zinc-500">
                            Pedido {fechaCorta(p.fecha)} · armado {p.armado_at ? `${fechaHora(p.armado_at).toLowerCase()} por ${primerNombre(p.armado_por)}` : p.armado_txt ? `${p.armado_txt} (planilla)` : ""}
                          </span>
                        </span>
                        <span className="text-base font-extrabold tabular-nums text-sky-200 shrink-0">{cant(p.cantidad)}</span>
                        <ChevronDown size={16} className={`text-zinc-600 shrink-0 transition-transform ${ver ? "rotate-180" : ""}`} />
                      </button>
                      {ver && (
                        <div className="px-3.5 pb-3.5 pl-[96px] flex flex-col gap-3">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-600 mb-1">Sale de</span>
                            {p.por.map((x, i) => <p key={i} className="text-xs text-zinc-300"><b className="tabular-nums">{cant(x.cantidad)}</b> por {x.modelo}</p>)}
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-600 mb-1">Pedido completo</span>
                            {p.items.map((x, i) => <p key={i} className="text-xs text-zinc-400"><b className="tabular-nums text-zinc-200">{cant(x.cantidad)}</b> {x.modelo}{x.detalles ? ` · ${x.detalles}` : ""}</p>)}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
