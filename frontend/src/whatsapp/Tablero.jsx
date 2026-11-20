import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquare, FileText, DollarSign, CheckCircle2 } from "lucide-react";
import { api } from "../produccion/util";

const PERIODOS = [
  { dias: 7, texto: "7 días" },
  { dias: 30, texto: "30 días" },
  { dias: 90, texto: "90 días" },
];

const pesos = (n) => `$${Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
const miles = (n) => Number(n || 0).toLocaleString("es-AR");

function Kpi({ icono: Icono, etiqueta, valor, detalle }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#0a0a0b] p-4 sm:p-5">
      <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium">
        <Icono size={15} className="text-[#FF5A00]" />
        {etiqueta}
      </div>
      <div className="mt-2 text-2xl sm:text-3xl font-semibold text-white tracking-tight">{valor}</div>
      {detalle && <div className="mt-1 text-xs text-zinc-500">{detalle}</div>}
    </div>
  );
}

export default function Tablero({ aviso }) {
  const [dias, setDias] = useState(30);
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(() => {
    setCargando(true);
    api(`/api/whatsapp/tablero?dias=${dias}`)
      .then(setData)
      .catch(() => aviso?.("No pude cargar el tablero.", "error"))
      .finally(() => setCargando(false));
  }, [dias, aviso]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const maxSerie = data?.serie?.length ? Math.max(...data.serie.map((s) => s.mensajes), 1) : 1;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-zinc-400">Cómo viene trabajando Aldana con los clientes.</p>
          <div className="inline-flex rounded-full border border-zinc-800 p-0.5">
            {PERIODOS.map((p) => (
              <button
                key={p.dias}
                onClick={() => setDias(p.dias)}
                className={`px-3 py-1 text-xs font-medium rounded-full cursor-pointer transition-colors ${dias === p.dias ? "bg-[#FF5A00] text-white" : "text-zinc-400 hover:text-zinc-200"}`}
              >
                {p.texto}
              </button>
            ))}
          </div>
        </div>

        {cargando && !data ? (
          <div className="p-10 grid place-items-center text-zinc-500"><Loader2 className="animate-spin" /></div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <Kpi icono={MessageSquare} etiqueta="Consultas" valor={miles(data.consultas.conversaciones)} detalle={`${miles(data.consultas.mensajes)} mensajes de clientes`} />
              <Kpi icono={FileText} etiqueta="Cotizaciones" valor={miles(data.cotizaciones.cantidad)} detalle={data.cotizaciones.conPdf ? `${miles(data.cotizaciones.conPdf)} con PDF` : "—"} />
              <Kpi icono={DollarSign} etiqueta="Monto cotizado" valor={pesos(data.cotizaciones.monto)} detalle="Precios de lista" />
              <Kpi icono={CheckCircle2} etiqueta="Resueltas por Aldana" valor={`${data.resolucion.pctResueltas}%`} detalle={`${miles(data.resolucion.derivadas)} derivadas a una persona`} />
            </div>

            {data.serie.length > 0 && (
              <div className="rounded-2xl border border-zinc-800 bg-[#0a0a0b] p-4 sm:p-5">
                <div className="text-xs font-medium text-zinc-500 mb-3">Consultas por día</div>
                <div className="flex items-end gap-1 h-28">
                  {data.serie.map((s) => (
                    <div key={s.dia} className="flex-1 flex flex-col items-center justify-end group" title={`${s.dia}: ${s.mensajes} mensajes · ${s.clientes} clientes`}>
                      <div className="w-full rounded-t bg-[#FF5A00]/70 group-hover:bg-[#FF5A00] transition-colors" style={{ height: `${Math.max((s.mensajes / maxSerie) * 100, 4)}%` }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-zinc-800 bg-[#0a0a0b] p-4 sm:p-5">
              <div className="text-xs font-medium text-zinc-500 mb-3">Productos más cotizados</div>
              {data.productosTop.length === 0 ? (
                <div className="text-sm text-zinc-600 py-4 text-center">Todavía no hay cotizaciones en este período.</div>
              ) : (
                <ul className="divide-y divide-zinc-800/70">
                  {data.productosTop.map((p, i) => (
                    <li key={(p.codigo || p.nombre) + i} className="flex items-center gap-3 py-2.5">
                      <span className="w-5 text-center text-xs font-semibold text-zinc-600">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-100 truncate">{p.nombre}</div>
                        {p.codigo && <div className="text-[11px] text-zinc-600 truncate">{p.codigo}</div>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm text-zinc-200">{miles(p.veces)}× cotizado</div>
                        <div className="text-[11px] text-zinc-500">{pesos(p.monto)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
