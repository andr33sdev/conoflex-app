import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, X } from "lucide-react";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "";
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const fmt = (n) => Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 1 });
const corta = (f) => (f ? `${f.slice(8)}/${f.slice(5, 7)}` : "");

/** Quincena más reciente ya terminada (la que se está por liquidar). */
function quincenaPorDefecto() {
  const h = new Date();
  if (h.getDate() >= 16) return { mes: `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}`, quincena: 1 };
  const p = new Date(h.getFullYear(), h.getMonth() - 1, 1);
  return { mes: `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}`, quincena: 2 };
}

/** Antes de liquidar: qué falta resolver de cada operario en la quincena. Cada pendiente lleva directo al día. */
export default function CierreQuincena({ onCerrar, onAbrirDia, onAbrirCategorias }) {
  const [{ mes, quincena }, setPeriodo] = useState(quincenaPorDefecto);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDatos(null);
    setError("");
    fetch(`${API_BASE_URL}/api/fichero/cierre?mes=${mes}&quincena=${quincena}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "No se pudo armar el cierre.");
        return d;
      })
      .then((d) => vivo && setDatos(d))
      .catch((e) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [mes, quincena, version]);

  const cambiarMes = (delta) => {
    const [a, m] = mes.split("-").map(Number);
    const d = new Date(a, m - 1 + delta, 1);
    setPeriodo({ mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, quincena });
  };
  const nombreMes = `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
  const r = datos?.resumen;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0D0D0D] border border-zinc-800 rounded-xl w-full max-w-2xl max-h-[88vh] shadow-2xl flex flex-col overflow-hidden text-zinc-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-[#121212]">
          <h3 className="text-xs font-black tracking-widest uppercase text-white">Cierre de quincena</h3>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white p-1 rounded hover:bg-zinc-800 cursor-pointer" aria-label="Cerrar"><X size={16} /></button>
        </div>

        <div className="px-5 py-3 border-b border-zinc-800 flex flex-wrap items-center gap-2">
          <button onClick={() => cambiarMes(-1)} className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-xs cursor-pointer" aria-label="Mes anterior">‹</button>
          <span className="text-xs font-bold text-white min-w-[120px] text-center">{nombreMes}</span>
          <button onClick={() => cambiarMes(1)} className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-xs cursor-pointer" aria-label="Mes siguiente">›</button>
          <div className="flex gap-1 ml-2">
            {[1, 2].map((q) => (
              <button key={q} onClick={() => setPeriodo({ mes, quincena: q })} className={`px-3 py-1 rounded text-[11px] font-bold cursor-pointer ${q === quincena ? "bg-[#FF5A00] text-white" : "bg-zinc-900 text-zinc-400 hover:text-white"}`}>
                {q === 1 ? "Del 1 al 15" : "Del 16 al fin"}
              </button>
            ))}
          </div>
          <button onClick={() => setVersion((v) => v + 1)} className="ml-auto text-[11px] font-bold text-zinc-400 hover:text-white cursor-pointer">Actualizar</button>
        </div>

        <div className="overflow-y-auto p-5 flex flex-col gap-3">
          {!datos && !error && <div className="grid place-items-center py-10 text-zinc-500"><Loader2 className="animate-spin" size={20} /></div>}
          {error && <p className="text-sm text-rose-300">{error}</p>}
          {datos && datos.operarios.length === 0 && <p className="text-sm text-zinc-500 text-center py-8">No hay fichadas en esta quincena.</p>}
          {datos && datos.operarios.length > 0 && (
            <>
              <p className={`text-sm font-semibold ${r.con_pendientes ? "text-amber-300" : "text-emerald-400"}`}>
                {r.con_pendientes
                  ? `${r.con_pendientes} ${r.con_pendientes === 1 ? "operario tiene" : "operarios tienen"} cosas por resolver antes de liquidar (${r.pendientes} en total).`
                  : "Todo en orden: se puede liquidar la quincena."}
              </p>
              <ul className="flex flex-col gap-2">
                {datos.operarios.map((o) => (
                  <li key={o.nombre} className="rounded-lg border border-zinc-800 bg-[#121212] px-3.5 py-3">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm">{o.nombre}</span>
                      <span className="text-[11px] text-zinc-500">{fmt(o.horas_normales)} hs normales · {fmt(o.horas_extra)} hs extra · {o.dias} días{o.llegadas_tarde ? ` · ${o.llegadas_tarde} tarde` : ""}</span>
                      {o.pendientes.length === 0 && <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400"><CheckCircle2 size={13} /> Listo</span>}
                    </div>
                    {o.pendientes.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {o.pendientes.map((p, i) => (
                          <button
                            key={`${p.tipo}-${p.fecha}-${i}`}
                            onClick={() => (p.fecha ? onAbrirDia(o.nombre, p.fecha) : onAbrirCategorias())}
                            className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-amber-950/40 border border-amber-800/50 text-amber-200 hover:bg-amber-900/50 cursor-pointer"
                            title={p.fecha ? "Abrir ese día para corregirlo" : "Asignar categoría"}
                          >
                            {p.texto}{p.fecha ? ` · ${corta(p.fecha)}` : ""}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
