// Calidad: dónde se generan las fallas. % de fallas por máquina y por producto en el mes,
// para detectar qué máquina o qué producto conviene mirar.
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { api, num, sinSemi } from "../produccion/util";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesActual = () => new Date().toISOString().slice(0, 7);
function sumarMes(mes, delta) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
// Color del % de fallas: hasta 2% ok, hasta 5% atención, más rojo.
const colorPct = (p) => (p <= 2 ? "#34d399" : p <= 5 ? "#FFD60A" : "#f87171");

function Tabla({ titulo, filas, esProducto }) {
  const th = "px-3 py-2 text-[10px] font-bold uppercase tracking-[0.07em] text-zinc-500";
  const td = "px-3 py-2.5 text-sm";
  const max = Math.max(1, ...filas.map((f) => f.pct));
  return (
    <div>
      <h3 className="text-[13px] font-bold text-white mb-2">{titulo}</h3>
      {filas.length === 0 ? (
        <p className="text-sm text-zinc-500 rounded-xl border border-dashed border-white/[0.1] p-4">Sin datos en el mes.</p>
      ) : (
        <div className="rounded-2xl border border-white/[0.08] bg-[#131317] overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/[0.03]">
                <th className={th}>{esProducto ? "Producto" : "Máquina"}</th>
                <th className={`${th} text-right`}>Producido</th>
                <th className={`${th} text-right`}>Fallas</th>
                <th className={`${th} text-right w-[140px]`}>% fallas</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={(f.codigo || f.maquina || i) + i} className="border-t border-white/[0.05]">
                  <td className={`${td} text-zinc-100`}>{esProducto ? sinSemi(f.nombre) : f.maquina}{esProducto && f.codigo ? <span className="block text-xs text-zinc-600">{f.codigo}</span> : null}</td>
                  <td className={`${td} text-right tabular-nums text-zinc-300`}>{num(f.producido)}</td>
                  <td className={`${td} text-right tabular-nums ${f.fallas > 0 ? "text-rose-300" : "text-zinc-500"}`}>{num(f.fallas)}</td>
                  <td className={td}>
                    <div className="flex items-center gap-2 justify-end">
                      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden" style={{ width: 60 }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min((f.pct / max) * 100, 100)}%`, background: colorPct(f.pct) }} />
                      </div>
                      <span className="tabular-nums font-bold w-12 text-right" style={{ color: colorPct(f.pct) }}>{num(f.pct, 1)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Calidad() {
  const [mes, setMes] = useState(mesActual());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    setData(null);
    api(`/api/prod/calidad?mes=${mes}`).then((d) => vivo && (setData(d), setError(""))).catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [mes]);

  const [anio, m] = mes.split("-").map(Number);

  return (
    <section aria-label="Calidad: fallas por máquina y producto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center rounded-xl border border-white/[0.08] bg-[#111114] p-0.5">
          <button onClick={() => setMes(sumarMes(mes, -1))} aria-label="Mes anterior" className="w-10 h-10 grid place-items-center rounded-lg text-zinc-300 hover:bg-white/[0.07] cursor-pointer"><ChevronLeft size={18} /></button>
          <span className="px-3 text-center min-w-[150px] text-[14px] font-extrabold text-white capitalize">{MESES[m - 1]} {anio}</span>
          <button onClick={() => setMes(sumarMes(mes, 1))} aria-label="Mes siguiente" className="w-10 h-10 grid place-items-center rounded-lg text-zinc-300 hover:bg-white/[0.07] cursor-pointer"><ChevronRight size={18} /></button>
        </div>
        {mes !== mesActual() && <button onClick={() => setMes(mesActual())} className="text-sm font-bold text-zinc-300 hover:text-white rounded-lg border border-white/[0.08] px-3 h-10 cursor-pointer">Este mes</button>}
        {data && (
          <div className="ml-auto text-right">
            <span className="block text-[11px] text-zinc-500">Fallas del mes</span>
            <span className="text-xl font-extrabold tabular-nums" style={{ color: colorPct(data.total.pct) }}>{num(data.total.pct, 1)}%</span>
            <span className="text-xs text-zinc-500 tabular-nums"> · {num(data.total.fallas)} de {num(data.total.producido)} u</span>
          </div>
        )}
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-100">{error}</div>
      ) : !data ? (
        <div className="flex items-center justify-center gap-3 py-24 text-zinc-500"><Loader2 className="animate-spin" size={20} /> Cargando…</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Tabla titulo="Por máquina" filas={data.maquinas} />
          <Tabla titulo="Por producto" filas={data.productos} esProducto />
        </div>
      )}
    </section>
  );
}
