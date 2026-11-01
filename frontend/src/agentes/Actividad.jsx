import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../produccion/util";
import { cuando } from "./formato";

const TEXTO = { LIQUIDACION: "Liquidación", CHAT: "Consulta", REVISION: "Revisión", GESTION: "Gestión", DERIVACION: "Derivación", AJUSTE_STOCK: "Ajuste de stock", BORRADOR: "Borrador", ENVIADO: "Enviado" };

export default function Actividad({ agenteId, nombre, version }) {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let vivo = true;
    api(`/api/agentes/${agenteId}/actividad?limite=60`)
      .then((r) => vivo && (setLista(r), setError(null)))
      .catch((e) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [agenteId, version]);

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-5 py-4">
      {error && <p className="text-sm text-zinc-300 border border-white/10 rounded-xl p-3">{error}</p>}
      {!lista && !error && <div className="py-10 grid place-items-center text-zinc-500"><Loader2 className="animate-spin" size={20} /></div>}
      {lista && lista.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-[15px] font-semibold text-white">Todavía no hay actividad</p>
          <p className="mt-1 text-sm text-zinc-500">Acá vas a ver cada revisión, consulta y reporte de {nombre}.</p>
        </div>
      )}
      {lista && lista.length > 0 && (
        <ul className="divide-y divide-white/[0.06]">
          {lista.map((a) => (
            <li key={a.id} className="py-3.5">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-zinc-500">{TEXTO[a.tipo] || "Consulta"} · {cuando(a.created_at)}</p>
              <p className="mt-0.5 text-[14.5px] text-zinc-100 leading-snug break-words">{a.titulo}</p>
              {a.detalle && <p className="mt-0.5 text-[13px] text-zinc-500 leading-relaxed break-words">{a.detalle}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
