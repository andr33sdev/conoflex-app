// Calendario de la producción realizada: mes a mes, cada día muestra lo producido (aprobado) y
// lo que está por aprobar. Al tocar un día se ve el detalle en tabla.
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, Loader2, X } from "lucide-react";
import { api, num, sinSemi, turnoLabel } from "../produccion/util";
import { getApiUrl } from "../apiConfig";

async function abrirPartePdf(fecha) {
  try {
    const res = await fetch(getApiUrl(`/api/prod/parte-pdf?fecha=${fecha}`));
    if (!res.ok) return;
    const url = URL.createObjectURL(await res.blob());
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (_) { /* ignorar */ }
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const hoyISO = () => new Date().toISOString().slice(0, 10);
const mesActual = () => new Date().toISOString().slice(0, 7);

function sumarMes(mes, delta) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Detalle de un día en tabla.
function DetalleDia({ fecha, onCerrar }) {
  const [dato, setDato] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let vivo = true;
    setDato(null);
    api(`/api/prod/producido/dia?fecha=${fecha}`).then((d) => vivo && setDato(d)).catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [fecha]);

  const [a, m, d] = fecha.split("-").map(Number);
  const titulo = `${d} de ${MESES[m - 1]}`;
  const th = "px-3 py-2 text-[10px] font-bold uppercase tracking-[0.07em] text-zinc-500";
  const td = "px-3 py-2.5 text-sm align-middle";

  return (
    <div className="mt-4 rounded-2xl border border-white/[0.09] bg-[#0f0f12] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.07]">
        <p className="text-sm font-bold text-white">Producido el {titulo}</p>
        <div className="flex items-center gap-1.5">
          <button onClick={() => abrirPartePdf(fecha)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-bold text-zinc-300 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] cursor-pointer"><FileDown size={15} /> Parte PDF</button>
          <button onClick={onCerrar} aria-label="Cerrar detalle" className="w-8 h-8 grid place-items-center rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.08] cursor-pointer"><X size={16} /></button>
        </div>
      </div>
      {error ? (
        <p className="p-4 text-sm text-rose-200">{error}</p>
      ) : !dato ? (
        <div className="flex items-center justify-center gap-2 py-10 text-zinc-500"><Loader2 className="animate-spin" size={18} /> Cargando…</div>
      ) : dato.cargas.length === 0 ? (
        <p className="p-4 text-sm text-zinc-500">No hay producción cargada ese día.</p>
      ) : (
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full min-w-[640px] text-left border-collapse">
            <thead>
              <tr className="bg-white/[0.03]">
                <th className={th}>Producto</th>
                <th className={th}>Turno</th>
                <th className={th}>Máquina</th>
                <th className={th}>Operario</th>
                <th className={`${th} text-right`}>Buenas</th>
                <th className={`${th} text-right`}>Fallas</th>
                <th className={th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {dato.cargas.map((c) => (
                <tr key={c.id} className="border-t border-white/[0.05]">
                  <td className={td}><span className="font-semibold text-white">{sinSemi(c.modelo_nombre)}</span><span className="block text-xs text-zinc-600">{c.lote || c.modelo_codigo}</span></td>
                  <td className={`${td} text-zinc-400`}>{turnoLabel(c.turno)}</td>
                  <td className={`${td} text-zinc-300`}>{c.maquina || "—"}</td>
                  <td className={`${td} text-zinc-300`}>{c.operario}</td>
                  <td className={`${td} text-right tabular-nums font-bold text-emerald-300`}>{num(c.buenas)}</td>
                  <td className={`${td} text-right tabular-nums ${c.fallas > 0 ? "text-rose-300" : "text-zinc-500"}`}>{num(c.fallas)}</td>
                  <td className={td}>
                    {c.estado === "APROBADA"
                      ? <span className="text-xs font-semibold text-emerald-300">Aprobada</span>
                      : <span className="text-xs font-semibold text-[#FFD60A]">Por aprobar</span>}
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

export default function CalendarioProducido() {
  const [mes, setMes] = useState(mesActual());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [diaSel, setDiaSel] = useState(null);

  useEffect(() => {
    let vivo = true;
    setData(null);
    setDiaSel(null);
    api(`/api/prod/producido?mes=${mes}`).then((d) => vivo && (setData(d), setError(""))).catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [mes]);

  const [anio, m] = mes.split("-").map(Number);
  const porFecha = {};
  (data?.dias || []).forEach((d) => (porFecha[d.fecha] = d));
  const diasEnMes = new Date(anio, m, 0).getDate();
  const offset = (new Date(anio, m - 1, 1).getDay() + 6) % 7; // lunes = 0
  const celdas = [...Array(offset).fill(null), ...Array.from({ length: diasEnMes }, (_, i) => i + 1)];
  const hoy = hoyISO();

  return (
    <section aria-label="Producción realizada por día">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center rounded-xl border border-white/[0.08] bg-[#111114] p-0.5">
          <button onClick={() => setMes(sumarMes(mes, -1))} aria-label="Mes anterior" className="w-10 h-10 grid place-items-center rounded-lg text-zinc-300 hover:bg-white/[0.07] cursor-pointer"><ChevronLeft size={18} /></button>
          <span className="px-3 text-center min-w-[150px] text-[14px] font-extrabold text-white capitalize">{MESES[m - 1]} {anio}</span>
          <button onClick={() => setMes(sumarMes(mes, 1))} aria-label="Mes siguiente" className="w-10 h-10 grid place-items-center rounded-lg text-zinc-300 hover:bg-white/[0.07] cursor-pointer"><ChevronRight size={18} /></button>
        </div>
        {mes !== mesActual() && <button onClick={() => setMes(mesActual())} className="text-sm font-bold text-zinc-300 hover:text-white rounded-lg border border-white/[0.08] px-3 h-10 cursor-pointer">Este mes</button>}
        {data && (
          <div className="ml-auto flex items-baseline gap-5">
            <div className="text-right"><span className="block text-[11px] text-zinc-500">Producido en el mes</span><span className="text-xl font-extrabold text-emerald-300 tabular-nums">{num(data.total_buenas)} u</span></div>
            {data.total_por_aprobar > 0 && <div className="text-right"><span className="block text-[11px] text-zinc-500">Por aprobar</span><span className="text-xl font-extrabold text-[#FFD60A] tabular-nums">{num(data.total_por_aprobar)} u</span></div>}
          </div>
        )}
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-100">{error}</div>
      ) : !data ? (
        <div className="flex items-center justify-center gap-3 py-24 text-zinc-500"><Loader2 className="animate-spin" size={20} /> Cargando…</div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 px-1 py-1">{d}</div>
            ))}
            {celdas.map((dnum, i) => {
              if (dnum === null) return <div key={`b${i}`} className="min-h-[76px] sm:min-h-[84px]" />;
              const fecha = `${mes}-${String(dnum).padStart(2, "0")}`;
              const info = porFecha[fecha];
              const esHoy = fecha === hoy;
              const sel = fecha === diaSel;
              const conProd = info && info.buenas > 0;
              return (
                <button
                  key={fecha}
                  onClick={() => (conProd || info?.por_aprobar ? setDiaSel(sel ? null : fecha) : null)}
                  className={`min-h-[76px] sm:min-h-[84px] text-left rounded-xl border p-2 transition-colors ${
                    conProd || info?.por_aprobar ? "cursor-pointer" : "cursor-default"
                  } ${
                    sel ? "border-[#FF5A00] bg-[#FF5A00]/[0.08]" : esHoy ? "border-[#FF5A00]/50 bg-[#1a1109]" : conProd || info?.por_aprobar ? "border-white/[0.08] bg-[#131317] hover:border-[#FF5A00]/50" : "border-white/[0.05] bg-[#0e0e11]"
                  }`}
                >
                  <span className={`block text-[12px] ${esHoy ? "text-[#FF5A00] font-bold" : "text-zinc-500"}`}>{dnum}{esHoy ? " · hoy" : ""}</span>
                  {conProd ? (
                    <>
                      <span className="block text-[15px] sm:text-[16px] font-extrabold text-white tabular-nums leading-tight mt-0.5">{num(info.buenas)}</span>
                      <span className="block text-[11px] text-zinc-500">{info.productos} prod · {info.maquinas} máq</span>
                    </>
                  ) : null}
                  {info?.por_aprobar > 0 && <span className="block text-[11px] text-[#FFD60A] mt-0.5">+{num(info.por_aprobar)} por aprobar</span>}
                </button>
              );
            })}
          </div>

          {diaSel && <DetalleDia fecha={diaSel} onCerrar={() => setDiaSel(null)} />}
        </>
      )}
    </section>
  );
}
