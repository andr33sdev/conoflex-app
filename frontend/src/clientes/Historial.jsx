import { Bot, Download, History, User } from "lucide-react";
import { Vacio } from "../produccion/ui";
import { cuando } from "./util";

/** Búsquedas anteriores: se puede abrir cualquiera o bajarla. */
export default function Historial({ lista, abierta, onAbrir, onExportar }) {
  if (!lista.length) return <Vacio icono={History} titulo="Todavía no hay búsquedas" texto="Cada búsqueda que hagas queda guardada acá." />;
  return (
    <ul className="flex flex-col gap-2.5">
      {lista.map((b) => {
        const sel = abierta === b.id;
        return (
          <li key={b.id} className={`rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 ${sel ? "border-[#FFD60A]/40 bg-[#FFD60A]/[0.05]" : "border-white/[0.08] bg-white/[0.03]"}`}>
            <div className="mr-auto min-w-0">
              <b className="text-zinc-100">{cuando(b.created_at)}</b>
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-zinc-500">{b.origen === "AUTO" ? <Bot size={12} /> : <User size={12} />} {b.origen === "AUTO" ? "Automática" : b.creado_por || "Manual"}</span>
              <span className="block text-sm text-zinc-500">
                {b.estado === "LISTO" ? `${b.n_total ?? 0} resultados${b.tipo === "OPORTUNIDADES" ? ` · ${b.n_ya ?? 0} para ir ya · ${b.n_nuevas ?? 0} nuevas` : ""}` : b.estado === "ERROR" ? "Falló" : "Buscando…"}
              </span>
            </div>
            {b.estado === "LISTO" && (
              <div className="flex items-center gap-2">
                <button onClick={() => onAbrir(b.id)} className="min-h-[44px] px-4 rounded-xl border border-white/[0.12] bg-white/[0.04] text-sm font-bold text-zinc-100 hover:bg-white/[0.09] cursor-pointer">{sel ? "Viendo" : "Abrir"}</button>
                <button onClick={() => onExportar(b.id, "pdf")} aria-label="Bajar PDF" className="min-h-[44px] min-w-[44px] grid place-items-center rounded-xl border border-white/[0.12] bg-white/[0.04] text-zinc-300 hover:text-white cursor-pointer"><Download size={16} /></button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
