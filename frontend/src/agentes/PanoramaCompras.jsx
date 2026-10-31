import { ClipboardList, FileSignature, Loader2, PackageOpen, Plus, Send, Truck } from "lucide-react";

const fmt = (n, d = 0) => (n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toLocaleString("es-AR", { maximumFractionDigits: d }));
const PRIO = { 5: ["Urgente", "#f43f5e"], 4: ["Alta", "#FF5A00"], 3: ["Normal", "#60a5fa"], 2: ["Baja", "#8b93a1"], 1: ["Baja", "#8b93a1"] };

function Mini({ icono: Icono, titulo, valor, detalle, color }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#111116] p-3.5">
      <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-zinc-500"><Icono size={13} style={{ color }} /> {titulo}</p>
      <p className="mt-1 text-[26px] leading-none font-black tabular-nums" style={{ color }}>{valor}</p>
      <p className="mt-1 text-[11.5px] text-zinc-500 leading-tight">{detalle}</p>
    </div>
  );
}

/** Panel de Vera: la lista de compra que está armando (en vivo), lo que espera firma, lo que no llegó y cómo cumple cada proveedor. */
export default function PanoramaCompras({ datos, error, onPreguntar }) {
  if (error) return <div className="p-6 text-center text-sm text-rose-300">{error}</div>;
  if (!datos) return <div className="h-full grid place-items-center text-zinc-500 py-16"><Loader2 className="animate-spin" size={22} /></div>;
  const { lista, resumen: r } = datos;
  return (
    <div className="p-3 sm:p-4 space-y-3.5">
      <section className="rounded-2xl border border-[#3b82f6]/40 bg-gradient-to-br from-[#3b82f6]/[0.09] to-transparent overflow-hidden">
        <header className="flex flex-wrap items-center gap-2 px-4 pt-3.5 pb-2">
          <ClipboardList size={18} className="text-[#60a5fa]" />
          <h3 className="text-[15px] font-extrabold text-white">{lista.abierta ? `Solicitud de compra #${lista.solicitud_id} en armado` : "Todavía no hay una lista en armado"}</h3>
          {lista.abierta && <span className="text-[11px] font-bold text-sky-200 bg-sky-400/15 rounded-full px-2.5 py-0.5">{lista.total_renglones} {lista.total_renglones === 1 ? "renglón" : "renglones"}</span>}
        </header>
        {lista.abierta ? (
          <>
            <ul className="px-2 pb-1">
              {lista.items.map((i) => {
                const [txt, col] = PRIO[i.prioridad] || PRIO[3];
                return (
                  <li key={i.id} className="flex items-center gap-3 px-2 py-2.5 border-t border-white/[0.06]">
                    <span className="w-1.5 self-stretch rounded-full" style={{ background: col }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-bold text-white leading-snug break-words">{i.articulo}</span>
                      <span className="block text-[12px] text-zinc-400">{i.proveedor || "A definir"} · <span style={{ color: col }}>{txt}</span></span>
                    </span>
                    <span className="text-[15px] font-black text-white tabular-nums shrink-0">{fmt(i.cantidad, 1)}</span>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-2 px-4 pb-3.5 pt-2">
              <button onClick={() => onPreguntar("Agregá a la lista lo que hace falta comprar")} className="min-h-[40px] px-3.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-[13px] font-bold text-white inline-flex items-center gap-1.5"><Plus size={15} /> Sumar lo que falta</button>
              <button onClick={() => onPreguntar("Dejá la lista lista para firmar")} className="min-h-[40px] px-3.5 rounded-xl bg-[#FFD60A] hover:bg-white text-black text-[13px] font-extrabold inline-flex items-center gap-1.5"><Send size={15} /> Cerrar para firma</button>
            </div>
          </>
        ) : (
          <div className="px-4 pb-4">
            <p className="text-sm text-zinc-400">Pedime materiales con cantidades, o decile a Nati que me pase lo que falta: todo se suma a una misma solicitud.</p>
            <button onClick={() => onPreguntar("Armame la lista con lo que hace falta comprar")} className="mt-3 min-h-[40px] px-3.5 rounded-xl bg-[#FFD60A] hover:bg-white text-black text-[13px] font-extrabold inline-flex items-center gap-1.5"><Plus size={15} /> Armar con lo que falta</button>
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <Mini icono={FileSignature} titulo="Por firmar" valor={r.por_firmar} detalle="solicitudes abiertas" color={r.por_firmar ? "#FFD60A" : "#34d399"} />
        <Mini icono={PackageOpen} titulo="Sin recibir" valor={r.sin_recibir} detalle="renglones pedidos" color={r.sin_recibir ? "#60a5fa" : "#34d399"} />
        <Mini icono={Truck} titulo="Proveedores" valor={r.proveedores} detalle="con compras registradas" color="#c4b5fd" />
      </div>

      {datos.por_firmar.length > 0 && (
        <section className="rounded-2xl border border-white/[0.07] bg-[#111116] p-3.5">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 mb-2">Esperan firma</h4>
          <ul className="space-y-1.5">
            {datos.por_firmar.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-[13.5px]">
                <b className="text-white">#{s.id}</b>
                <span className="text-zinc-400">hace {s.dias} {s.dias === 1 ? "día" : "días"}</span>
                <span className="ml-auto flex gap-1.5 text-[11px] font-bold">
                  <span className={`rounded-full px-2 py-0.5 ${s.firmo_jefe ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.07] text-zinc-400"}`}>Jefe {s.firmo_jefe ? "✓" : "—"}</span>
                  <span className={`rounded-full px-2 py-0.5 ${s.firmo_gerente ? "bg-emerald-400/15 text-emerald-300" : "bg-white/[0.07] text-zinc-400"}`}>Gerente {s.firmo_gerente ? "✓" : "—"}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {datos.proveedores.length > 0 && (
        <section className="rounded-2xl border border-white/[0.07] bg-[#111116] p-3.5">
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 mb-2">Cumplimiento de proveedores</h4>
          <ul className="space-y-2.5">
            {datos.proveedores.map((p) => {
              const col = p.cumplido_pct >= 80 ? "#34d399" : p.cumplido_pct >= 50 ? "#FFD60A" : "#f43f5e";
              return (
                <li key={p.proveedor}>
                  <div className="flex items-baseline gap-2 text-[13.5px]">
                    <span className="font-bold text-white truncate">{p.proveedor}</span>
                    <span className="text-zinc-500 text-[12px]">{p.renglones} renglones</span>
                    <span className="ml-auto font-black tabular-nums" style={{ color: col }}>{p.cumplido_pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-white/[0.07] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(2, p.cumplido_pct)}%`, background: col }} /></div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
