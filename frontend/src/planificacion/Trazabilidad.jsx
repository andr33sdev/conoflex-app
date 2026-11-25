// Trazabilidad por lote: buscás un lote y ves toda su historia en una ficha simple:
// qué es y por qué se planificó, dónde y quién lo produjo, y qué materia prima se usó.
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { api, diaMes, num, sinSemi, turnoLabel } from "../produccion/util";

function Ficha({ lote, onVolver }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let vivo = true;
    setData(null);
    setError("");
    api(`/api/prod/trazabilidad?lote=${encodeURIComponent(lote)}`).then((d) => vivo && setData(d)).catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [lote]);

  return (
    <div>
      <button onClick={onVolver} className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-400 hover:text-white mb-3 cursor-pointer"><ArrowLeft size={15} /> Volver a buscar</button>
      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>
      ) : !data ? (
        <div className="flex items-center justify-center gap-3 py-16 text-zinc-500"><Loader2 className="animate-spin" size={20} /> Cargando…</div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#131317] p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-[#FFD60A]">{data.item.lote}</span>
              <span className="text-xs text-zinc-500">semana del {diaMes(data.item.semana)}</span>
            </div>
            <p className="mt-1 text-lg font-bold text-white leading-snug">{sinSemi(data.item.nombre)}</p>
            <p className="text-xs text-zinc-500">{data.item.codigo}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-zinc-400">
              <span>Planificado: <b className="text-zinc-200 tabular-nums">{num(data.item.cantidad_semana)}</b> u</span>
              {data.item.motivo && <span>Motivo: <b className="text-zinc-200">{data.item.motivo}</b></span>}
            </div>
          </div>

          <div>
            <h3 className="text-[13px] font-bold text-white mb-2">Dónde y quién lo produjo</h3>
            {data.cargas.length === 0 ? (
              <p className="text-sm text-zinc-500 rounded-xl border border-dashed border-white/[0.1] p-4">Todavía no se cargó producción de este lote.</p>
            ) : (
              <ul className="rounded-2xl border border-white/[0.08] bg-[#131317] overflow-hidden divide-y divide-white/[0.05]">
                {data.cargas.map((c, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">{diaMes(c.fecha)} · {turnoLabel(c.turno)}</p>
                      <p className="text-xs text-zinc-500">{c.maquina || "sin máquina"} · {c.operario}{c.color ? ` · ${c.color}` : ""}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm tabular-nums"><b className="text-emerald-300">{num(c.buenas)}</b> <span className="text-zinc-500">buenas</span>{c.fallas > 0 && <span className="text-rose-300"> · {num(c.fallas)} fallas</span>}</p>
                      <p className="text-[11px] font-semibold" style={{ color: c.estado === "APROBADA" ? "#34d399" : "#FFD60A" }}>{c.estado === "APROBADA" ? "Aprobada" : "Por aprobar"}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-[13px] font-bold text-white mb-2">Materia prima usada</h3>
            {data.materiales.length === 0 ? (
              <p className="text-sm text-zinc-500 rounded-xl border border-dashed border-white/[0.1] p-4">Se registra cuando se aprueba la producción.</p>
            ) : (
              <ul className="rounded-2xl border border-white/[0.08] bg-[#131317] overflow-hidden divide-y divide-white/[0.05]">
                {data.materiales.map((m, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1 text-sm text-zinc-200 truncate">{m.nombre} <span className="text-zinc-600 text-xs">{m.codigo}</span></span>
                    <span className="shrink-0 text-sm tabular-nums text-zinc-300">{num(m.cantidad, 3)} {m.unidad}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Trazabilidad() {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState(null);
  const [sel, setSel] = useState(null);

  useEffect(() => {
    if (sel) return;
    if (q.trim().length < 2) { setResultados(null); return; }
    let vivo = true;
    const t = setTimeout(() => {
      api(`/api/prod/trazabilidad?q=${encodeURIComponent(q.trim())}`).then((d) => vivo && setResultados(d.resultados)).catch(() => vivo && setResultados([]));
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [q, sel]);

  if (sel) return <Ficha lote={sel} onVolver={() => setSel(null)} />;

  return (
    <section aria-label="Trazabilidad por lote">
      <div className="relative mb-4 max-w-lg">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscá por lote, producto o código…"
          autoFocus
          className="w-full min-h-[46px] rounded-xl bg-[#131317] border border-white/[0.1] pl-10 pr-3 text-[15px] text-white focus:outline-none focus:border-[#FF5A00]/70"
        />
      </div>
      {q.trim().length < 2 ? (
        <p className="text-sm text-zinc-500">Escribí un lote (ej. L-4821), un producto o un código para ver toda su historia.</p>
      ) : resultados === null ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm"><Loader2 className="animate-spin" size={16} /> Buscando…</div>
      ) : resultados.length === 0 ? (
        <p className="text-sm text-zinc-500">No encontré lotes con eso.</p>
      ) : (
        <ul className="flex flex-col gap-2 max-w-lg">
          {resultados.map((r) => (
            <li key={r.lote}>
              <button onClick={() => setSel(r.lote)} className="w-full text-left flex items-center gap-3 rounded-xl border border-white/[0.07] bg-[#131317] hover:border-[#FF5A00]/50 px-4 py-3 transition-colors cursor-pointer">
                <span className="font-mono text-[11px] font-bold text-[#FFD60A] shrink-0">{r.lote}</span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-white truncate">{sinSemi(r.nombre)}</span>
                <span className="shrink-0 text-xs text-zinc-500">{diaMes(r.semana)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
