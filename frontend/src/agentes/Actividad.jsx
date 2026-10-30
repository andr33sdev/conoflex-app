import { useEffect, useState } from "react";
import { Calculator, Eye, Hand, Loader2, MessageCircle, ScanSearch } from "lucide-react";
import { api } from "../produccion/util";
import { cuando } from "./formato";

const TIPOS = {
  LIQUIDACION: { icono: Calculator, color: "text-[#FFD60A] bg-[#FFD60A]/10", texto: "Liquidación" },
  CHAT: { icono: MessageCircle, color: "text-sky-300 bg-sky-500/10", texto: "Consulta" },
  REVISION: { icono: ScanSearch, color: "text-emerald-300 bg-emerald-500/10", texto: "Revisión" },
  GESTION: { icono: Hand, color: "text-[#ff8a4d] bg-[#FF5A00]/10", texto: "Gestión" },
};

export default function Actividad({ agenteId, version }) {
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
    <div className="p-3 sm:p-4">
      {error && <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{error}</p>}
      {!lista && !error && <div className="py-10 grid place-items-center text-zinc-500"><Loader2 className="animate-spin" size={20} /></div>}
      {lista && lista.length === 0 && (
        <div className="py-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-white/[0.05] grid place-items-center text-zinc-400"><Eye size={22} /></div>
          <p className="mt-3 text-[15px] font-bold text-white">Todavía no hay actividad</p>
          <p className="mt-1 text-sm text-zinc-500">Acá vas a ver cada revisión, liquidación y consulta de Lía.</p>
        </div>
      )}
      {lista && lista.length > 0 && (
        <ol className="relative ml-4 border-l border-white/[0.08] space-y-4 pl-5">
          {lista.map((a) => {
            const t = TIPOS[a.tipo] || TIPOS.CHAT;
            const Icono = t.icono;
            return (
              <li key={a.id} className="relative">
                <span className={`absolute -left-[39px] top-0 w-8 h-8 rounded-xl grid place-items-center ${t.color}`}><Icono size={15} /></span>
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{t.texto} · {cuando(a.created_at)}</p>
                <p className="mt-0.5 text-[14.5px] font-semibold text-zinc-100 leading-snug break-words">{a.titulo}</p>
                {a.detalle && <p className="mt-0.5 text-[13px] text-zinc-500 leading-relaxed break-words">{a.detalle}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
