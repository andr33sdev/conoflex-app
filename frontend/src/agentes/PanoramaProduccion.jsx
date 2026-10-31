import { Loader2 } from "lucide-react";

const fmt = (n, d = 0) => (n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toLocaleString("es-AR", { maximumFractionDigits: d }));
const Titulo = ({ children }) => <h4 className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-zinc-500 mb-2">{children}</h4>;

function Dato({ titulo, valor, detalle }) {
  return (
    <div className="rounded-xl border border-white/[0.07] p-3.5">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-zinc-500">{titulo}</p>
      <p className="mt-1 text-[26px] leading-none font-bold text-white tabular-nums">{valor}</p>
      <p className="mt-1.5 text-[12px] text-zinc-500 leading-tight">{detalle}</p>
    </div>
  );
}

/** Panel de Maru: qué conviene fabricar primero (cruce de pedidos, stock y plan), el plan de la semana y la gente en planta. */
export default function PanoramaProduccion({ datos, error, onPreguntar }) {
  if (error) return <div className="p-6 text-center text-sm text-zinc-400">{error}</div>;
  if (!datos) return <div className="h-full grid place-items-center text-zinc-500 py-16"><Loader2 className="animate-spin" size={22} /></div>;
  const { prioridades = [], plan_semana: plan, personal, resumen: r = {} } = datos;
  const items = plan?.items || [];
  const total = items.reduce((a, i) => a + i.planificado, 0);
  const hecho = items.reduce((a, i) => a + Math.min(i.producido, i.planificado), 0);
  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-5 py-4 space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Dato titulo="Pedidos abiertos" valor={fmt(datos.pedidos_abiertos)} detalle="por entregar" />
        <Dato titulo="Plan de la semana" valor={total ? `${Math.round((hecho / total) * 100)}%` : "—"} detalle={total ? `${fmt(hecho)} de ${fmt(total)} u.` : "sin plan cargado"} />
        <Dato titulo="En planta" valor={fmt(personal?.en_planta)} detalle="con entrada sin salida" />
        <Dato titulo="Materias críticas" valor={fmt(r.criticas)} detalle={r.criticas ? "confirmar con Nati" : "sin urgencias"} />
      </div>

      <section>
        <Titulo>Qué fabricar primero</Titulo>
        {prioridades.length === 0 ? (
          <p className="rounded-xl border border-white/[0.07] px-4 py-5 text-[14px] text-zinc-400">No hay nada urgente para fabricar con lo que hay cargado.</p>
        ) : (
          <ol className="rounded-xl border border-white/[0.09] divide-y divide-white/[0.06]">
            {prioridades.map((p) => (
              <li key={p.codigo} className="flex gap-3 px-4 py-3">
                <span className="w-6 shrink-0 text-[15px] font-bold text-zinc-500 tabular-nums">{p.orden}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-semibold text-white leading-snug break-words">{p.semielaborado}</span>
                  <span className="block mt-0.5 text-[12.5px] text-zinc-500 leading-snug">{p.motivos.join(" · ")}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[15px] font-bold text-white tabular-nums">{fmt(p.a_fabricar)}</span>
                  <span className="block text-[11.5px] text-zinc-500">a fabricar</span>
                </span>
              </li>
            ))}
          </ol>
        )}
        {datos.ojo_materia_prima && <p className="mt-2 text-[12.5px] text-zinc-400">{datos.ojo_materia_prima}</p>}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button onClick={() => onPreguntar("¿Qué conviene fabricar primero esta semana? Explicame por qué.")} className="min-h-[38px] px-3.5 rounded-lg text-[13px] font-semibold bg-white text-black hover:bg-zinc-200">Que me lo explique</button>
          <button onClick={() => onPreguntar("¿Qué pedidos tengo más atrasados?")} className="min-h-[38px] px-3.5 rounded-lg text-[13px] font-semibold bg-white/[0.07] hover:bg-white/[0.12] text-zinc-100">Pedidos atrasados</button>
        </div>
      </section>

      <section>
        <Titulo>Plan de la semana{plan?.semana ? ` · desde el ${plan.semana.slice(8)}/${plan.semana.slice(5, 7)}` : ""}</Titulo>
        {items.length === 0 ? (
          <p className="rounded-xl border border-white/[0.07] px-4 py-4 text-[14px] text-zinc-400">Todavía no hay un plan cargado para esta semana.</p>
        ) : (
          <ul className="rounded-xl border border-white/[0.09] divide-y divide-white/[0.06]">
            {items.map((i) => {
              const pct = i.planificado ? Math.min(100, Math.round((i.producido / i.planificado) * 100)) : 0;
              return (
                <li key={i.id} className="px-4 py-2.5">
                  <div className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 text-[14px] font-semibold text-white truncate">{i.nombre}</span>
                    <span className="text-[12.5px] text-zinc-400 tabular-nums">{fmt(i.producido)} / {fmt(i.planificado)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 bg-white/[0.07]"><div className="h-full bg-zinc-400" style={{ width: `${pct}%` }} /></div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <Titulo>En planta ahora</Titulo>
        {personal?.personas?.length ? (
          <p className="text-[14px] text-zinc-300 leading-relaxed">{personal.personas.map((p) => `${p.nombre} (${p.desde})`).join(" · ")}</p>
        ) : (
          <p className="text-[14px] text-zinc-500">No hay nadie con entrada sin salida en las últimas horas.</p>
        )}
      </section>
    </div>
  );
}
