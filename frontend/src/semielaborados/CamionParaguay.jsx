import { useEffect, useState, useCallback } from "react";
import { X, Truck } from "lucide-react";
import { api } from "../produccion/util";

const fmt = (n) => Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });

// Lista del próximo camión de Paraguay: por cada producto que viene de allá, lo que hay, lo que se vende y cuánto anotar.
export default function CamionParaguay({ onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [borrador, setBorrador] = useState({});

  const cargar = useCallback(() => api("/api/paraguay/proximo").then((d) => { setData(d); setError(""); }).catch((e) => setError(e.message)), []);
  useEffect(() => {
    let vivo = true;
    api("/api/paraguay/proximo").then((d) => vivo && setData(d)).catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, []);

  const guardar = async (item, valor) => {
    const cantidad = Math.max(0, Math.round(Number(valor) || 0));
    setBorrador((b) => ({ ...b, [item.id]: undefined }));
    if (cantidad === item.cantidad) return;
    try {
      await api(`/api/paraguay/proximo/${item.id}`, { method: "PUT", body: { cantidad, notas: item.notas } });
      await cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  const total = data?.total || 0;
  const cap = data?.capacidad_referencia || 16000;
  const pct = Math.min(100, Math.round((total / cap) * 100));

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-[#050505] border border-zinc-800 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl relative">
        <button onClick={onClose} aria-label="Cerrar" className="absolute top-5 right-5 text-zinc-500 hover:text-white cursor-pointer">
          <X size={20} />
        </button>
        <div className="p-6 pb-4 pr-14">
          <h3 className="text-2xl font-extrabold text-white flex items-center gap-2.5">
            <Truck size={24} className="text-[#FF5A00]" /> Próximo camión de Paraguay
          </h3>
          <p className="text-zinc-500 text-sm mt-1">Anotá cuánto pedir de cada producto. La sugerencia cubre {data?.meses_cobertura || 3} meses de ventas.</p>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
              <span>
                <strong className="text-white">{fmt(total)}</strong> u. anotadas
              </span>
              <span>referencia {fmt(cap)} u.</span>
            </div>
            <div className="h-1.5 bg-zinc-900">
              <div className={`h-full ${total > cap ? "bg-[#FF0055]" : "bg-[#FF5A00]"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {error && <p className="text-[#FF0055] text-sm mb-3">{error}</p>}
          {!data ? (
            <p className="text-zinc-500 text-sm py-8 text-center">Cargando…</p>
          ) : data.items.length === 0 ? (
            <p className="text-zinc-500 text-sm py-8 text-center">Todavía no marcaste ningún producto como "De Paraguay". Abrilo desde su ficha para sumarlo.</p>
          ) : (
            <ul className="divide-y divide-zinc-900">
              {data.items.map((i) => (
                <li key={i.id} className="py-3 flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-semibold truncate">{i.nombre}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">
                      Hay {fmt(i.stock_total)} · se vende {fmt(i.demanda_mensual)}/mes
                      {i.dias != null && ` · alcanza ${i.dias} días`}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={borrador[i.id] ?? (i.cantidad || "")}
                      placeholder="0"
                      onChange={(e) => setBorrador((b) => ({ ...b, [i.id]: e.target.value }))}
                      onBlur={(e) => guardar(i, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      className="w-28 bg-transparent border border-zinc-800 focus:border-[#FF5A00] text-white text-right px-3 py-1.5 text-sm outline-none"
                    />
                    {i.sugerido > 0 && i.cantidad !== i.sugerido && (
                      <button onClick={() => guardar(i, i.sugerido)} className="text-[11px] text-[#FF5A00] hover:underline cursor-pointer">
                        Sugerido: {fmt(i.sugerido)}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
