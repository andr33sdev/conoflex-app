import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "";
const dmy = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : "");

function descripcion(c) {
  const f = c.despues?.fecha_hora || c.antes?.fecha_hora || "";
  const dia = f ? ` del ${dmy(f)} ${f.slice(11, 16)}` : "";
  if (c.accion === "ALTA") return `Agregó una ${String(c.despues?.tipo || "").toLowerCase()}${dia}`;
  if (c.accion === "TIPO") return `Cambió ${String(c.antes?.tipo || "").toLowerCase()} por ${String(c.despues?.tipo || "").toLowerCase()}${c.antes?.fecha_hora ? ` (${dmy(c.antes.fecha_hora)} ${c.antes.fecha_hora.slice(11, 16)})` : ""}`;
  if (c.accion === "QUITAR") return `Quitó una ${String(c.antes?.tipo || "").toLowerCase()}${dia}`;
  return c.accion;
}

/** Quién cambió qué en las fichadas, con el motivo. */
export default function HistorialCambios({ operario, onCerrar }) {
  const [soloOperario, setSolo] = useState(!!operario);
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilas(null);
    setError("");
    fetch(`${API_BASE_URL}/api/fichero/auditoria?limite=200${soloOperario && operario ? `&operario=${encodeURIComponent(operario)}` : ""}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "No se pudo cargar el historial.");
        return d;
      })
      .then((d) => vivo && setFilas(d))
      .catch((e) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [soloOperario, operario]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0D0D0D] border border-zinc-800 rounded-xl w-full max-w-2xl max-h-[88vh] shadow-2xl flex flex-col overflow-hidden text-zinc-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-[#121212]">
          <h3 className="text-xs font-black tracking-widest uppercase text-white">Cambios en las fichadas</h3>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white p-1 rounded hover:bg-zinc-800 cursor-pointer" aria-label="Cerrar"><X size={16} /></button>
        </div>
        {operario && (
          <div className="px-5 py-3 border-b border-zinc-800 flex gap-1.5">
            {[[true, operario], [false, "Todos"]].map(([v, t]) => (
              <button key={String(v)} onClick={() => setSolo(v)} className={`px-3 py-1 rounded text-[11px] font-bold cursor-pointer ${soloOperario === v ? "bg-[#FF5A00] text-white" : "bg-zinc-900 text-zinc-400 hover:text-white"}`}>{t}</button>
            ))}
          </div>
        )}
        <div className="overflow-y-auto p-5">
          {!filas && !error && <div className="grid place-items-center py-10 text-zinc-500"><Loader2 className="animate-spin" size={20} /></div>}
          {error && <p className="text-sm text-rose-300">{error}</p>}
          {filas && filas.length === 0 && <p className="text-sm text-zinc-500 text-center py-8">Todavía no se corrigió ninguna fichada desde la web.</p>}
          {filas && filas.length > 0 && (
            <ul className="divide-y divide-zinc-800/70">
              {filas.map((c) => (
                <li key={c.id} className="py-3">
                  <p className="text-sm text-white"><span className="font-bold">{c.nombre}</span> · {descripcion(c)}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{c.cuando.slice(8, 10)}/{c.cuando.slice(5, 7)} {c.cuando.slice(11)} · {c.usuario || "—"}{c.motivo ? ` · “${c.motivo}”` : ""}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
