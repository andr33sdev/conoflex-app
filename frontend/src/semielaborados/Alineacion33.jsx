import { useState } from "react";
import { X, Loader2, CheckCircle2 } from "lucide-react";
import { api } from "../produccion/util";

const n0 = (v) => Number(v || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });

export default function Alineacion33({ estado, onClose, onCambio }) {
  const [ocupado, setOcupado] = useState(null);
  const [error, setError] = useState("");
  const difs = estado?.diferencias || [];

  const igualar = async (d) => {
    setOcupado(d.id);
    setError("");
    try {
      await api(`/api/semielaborados/${d.id}/ajustar`, { method: "POST", body: { deposito: "33", cantidad: d.hoja, nota: "Igualado a la planilla" } });
      onCambio();
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-[#0b0b0d] border border-zinc-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h3 className="text-base font-bold text-white">Depósito 33: planilla vs app</h3>
          <button onClick={onClose} aria-label="Cerrar" className="text-zinc-400 hover:text-white cursor-pointer"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          {!estado ? <Loader2 className="animate-spin text-zinc-500" size={20} /> : estado.error ? <p className="text-zinc-400 text-sm">No pude leer la planilla ahora. Probá de nuevo en un rato.</p> : difs.length === 0 ? (
            <p className="flex items-center gap-2 text-emerald-300 text-[15px]"><CheckCircle2 size={18} /> El 33 coincide con la planilla.</p>
          ) : (
            <>
              <p className="text-[13.5px] text-zinc-400 mb-3">{difs.length} {difs.length === 1 ? "producto difiere" : "productos difieren"}. Si el correcto es el de la planilla, igualalo acá; si es el de la app, corregí la planilla.</p>
              <ul className="divide-y divide-white/[0.06]">
                {difs.map((d) => (
                  <li key={d.id} className="py-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-white truncate">{d.nombre}</p>
                      <p className="text-[12.5px] text-zinc-500 tabular-nums">Planilla <b className="text-zinc-300">{n0(d.hoja)}</b> · App <b className="text-zinc-300">{n0(d.app)}</b> · {d.diferencia > 0 ? `+${n0(d.diferencia)}` : `−${n0(-d.diferencia)}`} en la app</p>
                    </div>
                    <button onClick={() => igualar(d)} disabled={ocupado === d.id} className="shrink-0 min-h-[38px] px-3 text-[13px] font-semibold border border-zinc-700 text-zinc-200 hover:border-[#FF5A00] disabled:opacity-50 cursor-pointer">Usar la de la planilla</button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {error && <p className="mt-3 text-rose-300 text-[13px]">{error}</p>}
        </div>
      </div>
    </div>
  );
}
