import { useEffect, useMemo, useState } from "react";
import { FileDown, Loader2, Search } from "lucide-react";
import { api } from "../produccion/util";

const fmt = (n, d = 1) => (n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toLocaleString("es-AR", { maximumFractionDigits: d }));
const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fechaCorta = (f) => `${f.slice(8)}/${f.slice(5, 7)}`;

function Dato({ titulo, valor, detalle }) {
  return (
    <div className="rounded-xl border border-white/[0.07] p-3.5">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-zinc-500">{titulo}</p>
      <p className="mt-1 text-[26px] leading-none font-bold text-white tabular-nums">{valor}</p>
      <p className="mt-1.5 text-[12px] text-zinc-500 leading-tight">{detalle}</p>
    </div>
  );
}

/** Texto en markdown de la ficha, para pasarla a PDF con el mismo generador de reportes. */
function fichaATexto(f) {
  const r = f.resumen;
  const filas = f.meses.filter((m) => m.con_datos).map((m) => `| ${m.nombre} | ${fmt(m.horas_normales)} | ${fmt(m.horas_extra)} | ${m.dias} | ${m.llegadas_tarde}${m.pierde_presentismo ? " (sin presentismo)" : ""} |`);
  return [
    `# Ficha de ${f.operario} · ${f.anio}`,
    "",
    `- Horas normales del año: ${fmt(r.horas_normales)}`,
    `- Horas extra del año: ${fmt(r.horas_extra)} (promedio ${fmt(r.promedio_extra_por_mes)} por mes)`,
    `- Días trabajados: ${r.dias_trabajados}`,
    `- Llegadas tarde: ${r.llegadas_tarde}`,
    `- Meses sin presentismo: ${r.meses_sin_presentismo.length ? r.meses_sin_presentismo.join(", ") : "ninguno"}`,
    "",
    "## Mes por mes",
    "",
    "| Mes | Normales | Extra | Días | Llegadas tarde |",
    "|---|---:|---:|---:|---:|",
    ...filas,
    ...(f.llegadas_tarde.length ? ["", "## Llegadas tarde", "", ...f.llegadas_tarde.map((l) => `- ${fechaCorta(l.fecha)} (${l.dia}): ingresó ${l.ingreso}, ${l.minutos_tarde} min tarde`)] : []),
  ].join("\n");
}

/** Pestaña "Personal" de Lía: elegís a una persona y ves su año de horas, extras, llegadas tarde y presentismo. */
export default function Ficha({ base, onReporte, onPreguntar }) {
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioActual);
  const [lista, setLista] = useState(null);
  const [errLista, setErrLista] = useState("");
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState("");
  const [ficha, setFicha] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLista(null);
    api(`${base}/personal?anio=${anio}`).then((r) => vivo && setLista(r.operarios)).catch((e) => vivo && setErrLista(e.message));
    return () => {
      vivo = false;
    };
  }, [base, anio]);

  useEffect(() => {
    if (!sel) return undefined;
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true);
    setError("");
    api(`${base}/personal/ficha?operario=${encodeURIComponent(sel)}&anio=${anio}`)
      .then((r) => vivo && setFicha(r))
      .catch((e) => vivo && (setFicha(null), setError(e.message)))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [base, sel, anio]);

  const visibles = useMemo(() => (lista || []).filter((o) => !busca || sinAcentos(o.nombre).includes(sinAcentos(busca))), [lista, busca]);
  const maxHoras = ficha ? Math.max(1, ...ficha.meses.map((m) => m.horas_normales + m.horas_extra)) : 1;
  const anios = [anioActual, anioActual - 1, anioActual - 2];

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-5 py-4 grid gap-4 md:grid-cols-[250px_1fr]">
      <aside>
        <div className="flex items-center gap-1.5 mb-2">
          {anios.map((a) => (
            <button key={a} onClick={() => setAnio(a)} aria-pressed={a === anio} className={`min-h-[34px] px-3 rounded-lg text-[13px] font-semibold ${a === anio ? "bg-white/[0.1] text-white" : "text-zinc-500 hover:text-zinc-200"}`}>{a}</button>
          ))}
        </div>
        <label className="relative block">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar persona" className="w-full h-10 pl-9 pr-3 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[14px] text-white placeholder:text-zinc-600 outline-none focus:border-white/30" />
        </label>
        <div className="mt-2 max-h-[46vh] md:max-h-[calc(100vh-260px)] overflow-y-auto custom-scrollbar rounded-xl border border-white/[0.07]">
          {errLista ? (
            <p className="p-4 text-sm text-zinc-400">{errLista}</p>
          ) : !lista ? (
            <div className="grid place-items-center py-8 text-zinc-500"><Loader2 className="animate-spin" size={18} /></div>
          ) : visibles.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500">No hay fichadas para mostrar.</p>
          ) : (
            visibles.map((o) => (
              <button key={o.nombre} onClick={() => setSel(o.nombre)} aria-pressed={o.nombre === sel} className={`block w-full text-left px-3.5 py-2.5 text-[14px] border-b border-white/[0.05] last:border-0 ${o.nombre === sel ? "bg-white/[0.09] text-white font-semibold" : "text-zinc-300 hover:bg-white/[0.04]"}`}>{o.nombre}</button>
            ))
          )}
        </div>
      </aside>

      <section className="min-w-0">
        {!sel && <p className="rounded-xl border border-white/[0.07] px-4 py-8 text-center text-[14px] text-zinc-500">Elegí a una persona para ver su año.</p>}
        {sel && cargando && <div className="grid place-items-center py-16 text-zinc-500"><Loader2 className="animate-spin" size={22} /></div>}
        {sel && !cargando && error && <p className="rounded-xl border border-white/[0.07] px-4 py-6 text-sm text-zinc-400">{error}</p>}
        {sel && !cargando && ficha && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[18px] font-bold text-white mr-auto">{ficha.operario} <span className="font-medium text-zinc-500">· {ficha.anio}</span></h3>
              <button onClick={() => onPreguntar(`¿Cómo viene ${ficha.operario} este año? Contame lo importante de su ficha.`)} className="min-h-[38px] px-3.5 rounded-lg text-[13px] font-semibold bg-white/[0.07] hover:bg-white/[0.12] text-zinc-100">Preguntarle a Lía</button>
              <button onClick={() => onReporte(fichaATexto(ficha), `Ficha de ${ficha.operario} ${ficha.anio}`)} className="min-h-[38px] px-3.5 rounded-lg text-[13px] font-semibold bg-white text-black hover:bg-zinc-200 inline-flex items-center gap-2"><FileDown size={16} /> PDF</button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <Dato titulo="Horas normales" valor={fmt(ficha.resumen.horas_normales, 0)} detalle={`${ficha.resumen.dias_trabajados} días trabajados`} />
              <Dato titulo="Horas extra" valor={fmt(ficha.resumen.horas_extra, 0)} detalle={`${fmt(ficha.resumen.promedio_extra_por_mes)} por mes en promedio`} />
              <Dato titulo="Llegadas tarde" valor={ficha.resumen.llegadas_tarde} detalle="más de 5 min de retraso" />
              <Dato titulo="Sin presentismo" valor={ficha.resumen.meses_sin_presentismo.length} detalle={ficha.resumen.meses_sin_presentismo.join(", ") || "ningún mes"} />
            </div>
            {ficha.resumen.fichadas_sin_salida > 0 && <p className="text-[13px] text-zinc-400">Ojo: hay {ficha.resumen.fichadas_sin_salida} {ficha.resumen.fichadas_sin_salida === 1 ? "turno sin salida fichada" : "turnos sin salida fichada"} en el año.</p>}

            <div className="rounded-xl border border-white/[0.09]">
              <ul className="divide-y divide-white/[0.06]">
                {ficha.meses.map((m) => (
                  <li key={m.mes} className="grid grid-cols-[84px_1fr_auto] items-center gap-3 px-4 py-2.5">
                    <span className="text-[13.5px] font-semibold text-zinc-200">{m.nombre}</span>
                    {m.con_datos ? (
                      <span className="flex h-3 bg-white/[0.05]" role="img" aria-label={`${fmt(m.horas_normales)} horas normales y ${fmt(m.horas_extra)} extra`}>
                        <span className="h-full bg-zinc-500" style={{ width: `${(m.horas_normales / maxHoras) * 100}%` }} />
                        <span className="h-full bg-[#FF5A00]" style={{ width: `${(m.horas_extra / maxHoras) * 100}%` }} />
                      </span>
                    ) : (
                      <span className="text-[12.5px] text-zinc-600">sin fichadas</span>
                    )}
                    <span className="text-right text-[12.5px] text-zinc-400 tabular-nums whitespace-nowrap">
                      {m.con_datos && <>{fmt(m.horas_normales, 0)} + <span className="text-[#FF5A00] font-semibold">{fmt(m.horas_extra, 0)}</span> h{m.llegadas_tarde > 0 && <> · {m.llegadas_tarde} tarde{m.pierde_presentismo ? " ✕" : ""}</>}</>}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="px-4 py-2 border-t border-white/[0.06] text-[12px] text-zinc-500"><span className="inline-block w-2 h-2 bg-zinc-500 mr-1" />normales <span className="inline-block w-2 h-2 bg-[#FF5A00] ml-3 mr-1" />extra · ✕ perdió el presentismo del mes</p>
            </div>

            {ficha.llegadas_tarde.length > 0 && (
              <div>
                <h4 className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-zinc-500 mb-2">Llegadas tarde</h4>
                <ul className="rounded-xl border border-white/[0.09] divide-y divide-white/[0.06]">
                  {ficha.llegadas_tarde.map((l) => (
                    <li key={l.fecha} className="flex items-baseline gap-3 px-4 py-2 text-[13.5px]">
                      <span className="w-24 text-zinc-300 tabular-nums">{fechaCorta(l.fecha)} · {l.dia}</span>
                      <span className="text-zinc-400">ingresó {l.ingreso}</span>
                      <span className="ml-auto text-zinc-500 tabular-nums">{l.minutos_tarde} min</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
