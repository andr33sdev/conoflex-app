import { Building2, Hash, PackagePlus, PenLine, Pencil, Printer } from "lucide-react";
import { Drawer } from "../produccion/ui";
import { ChipPrioridad } from "./PrioridadPills";
import { BarraAvance, ChipEstado, ChipFirma, ChipUrgente } from "./Piezas";
import { cerradaSC, formatFecha, nf, nroSC, num, resumenSC } from "./formato";

function Item({ item }) {
  const pedida = num(item.cantidad_solicitada);
  const recibida = num(item.cantidad_recibida);
  const completo = recibida >= pedida && pedida > 0;
  const pct = pedida > 0 ? Math.min(100, Math.round((recibida / pedida) * 100)) : 0;
  return (
    <li className={`rounded-2xl border p-4 ${completo ? "border-emerald-500/25 bg-emerald-500/[0.04]" : "border-white/[0.08] bg-white/[0.025]"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[15px] font-extrabold text-white leading-snug break-words">{item.articulo}</p>
        <ChipPrioridad valor={item.prioridad} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5 min-w-0"><Building2 size={13} className="shrink-0" /><span className="truncate">{item.proveedor || "Sin proveedor sugerido"}</span></span>
        {item.numero_oc && <span className="inline-flex items-center gap-1"><Hash size={13} />O.C. {item.numero_oc}</span>}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3 mb-2">
        <span className="text-sm text-zinc-400 tabular-nums"><b className="text-lg text-white">{nf(recibida, 3)}</b> de {nf(pedida, 3)}</span>
        <span className={`text-sm font-extrabold tabular-nums ${completo ? "text-emerald-300" : "text-zinc-300"}`}>{completo ? "Completo" : `${pct}%`}</span>
      </div>
      <BarraAvance pct={pct} />
    </li>
  );
}

export default function DetalleSC({ sc, onCerrar, onRecibir, onEditar, onFirmas, onPDF }) {
  const r = resumenSC(sc);
  const cerrada = cerradaSC(sc);
  const boton = "min-h-[48px] rounded-2xl border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-zinc-100 text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors";
  return (
    <Drawer
      abierto
      onCerrar={onCerrar}
      titulo={nroSC(sc.id)}
      subtitulo={<span className="inline-flex items-center gap-2 flex-wrap"><span>{formatFecha(sc.fecha)}</span><ChipEstado estado={sc.estado} />{r.urgente && <ChipUrgente />}</span>}
      ancho="sm:w-[600px] lg:w-[680px]"
      pie={
        <div className="space-y-2.5">
          {!cerrada && <button type="button" onClick={() => onRecibir(sc)} className="w-full min-h-[54px] rounded-2xl bg-[#FFD60A] hover:bg-white text-black text-base font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] transition-all"><PackagePlus size={20} /> Registrar recepción</button>}
          <div className="grid grid-cols-3 gap-2.5">
            <button type="button" onClick={() => onEditar(sc)} className={boton}><Pencil size={16} /> Editar</button>
            <button type="button" onClick={() => onFirmas(sc)} className={boton}><PenLine size={16} /> Firmas</button>
            <button type="button" onClick={() => onPDF(sc)} className={boton}><Printer size={16} /> PDF</button>
          </div>
        </div>
      }
    >
      <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5">
        <div className="flex items-end justify-between gap-3 mb-2.5">
          <span className="text-sm text-zinc-400">Recibido <b className="text-white tabular-nums">{r.completos}</b> de <b className="text-white tabular-nums">{sc.items.length}</b> artículos</span>
          <span className={`text-3xl font-extrabold tabular-nums leading-none ${r.pct >= 100 ? "text-emerald-300" : "text-[#FFD60A]"}`}>{r.pct}%</span>
        </div>
        <BarraAvance pct={r.pct} />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-zinc-500 mr-1">Firmas</span>
          <ChipFirma rol="Jefe" firmada={!!sc.firma_jefe} />
          <ChipFirma rol="Gerente" firmada={!!sc.firma_gerente} />
        </div>
        {r.proveedores.length > 0 && (
          <p className="mt-3 text-[13px] text-zinc-500"><span className="font-bold uppercase tracking-[0.09em] text-[11px] mr-2">Proveedores</span><span className="text-zinc-300">{r.proveedores.join(" · ")}</span></p>
        )}
      </div>

      <h3 className="mt-6 mb-3 text-[13px] font-bold uppercase tracking-[0.09em] text-zinc-400">Artículos ({sc.items.length}) · por prioridad</h3>
      <ul className="space-y-3">
        {r.porUrgencia.map((i) => <Item key={i.id} item={i} />)}
      </ul>
    </Drawer>
  );
}
