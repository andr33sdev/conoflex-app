import { useState } from "react";
import { Building2, Hash, PackagePlus, PenLine, Pencil, Printer, Trash2 } from "lucide-react";
import { Drawer } from "../produccion/ui";
import { ChipPrioridad } from "./PrioridadPills";
import { BarraAvance, ChipEstado, ChipFirma, ChipUrgente } from "./Piezas";
import { cerradaSC, formatFecha, nf, nroSC, num, resumenSC } from "./formato";

function Item({ item, proveedores, onCorregir }) {
  const [editando, setEditando] = useState(false);
  const [prov, setProv] = useState(item.proveedor || "");
  const [cant, setCant] = useState(String(item.cantidad_solicitada ?? ""));
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    setGuardando(true);
    const ok = await onCorregir(item, { proveedor: prov.trim(), cantidad: Number(cant) });
    setGuardando(false);
    if (ok) setEditando(false);
  };
  const corregido = item.pedido_corregido_en && (item.proveedor_sugerido != null || item.cantidad_sugerida != null);
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
        <span className="inline-flex items-center gap-1.5 min-w-0"><Building2 size={13} className="shrink-0" /><span className="truncate">{item.proveedor || "Sin proveedor"}</span></span>
        {item.numero_oc && <span className="inline-flex items-center gap-1"><Hash size={13} />O.C. {item.numero_oc}</span>}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3 mb-2">
        <span className="text-sm text-zinc-400 tabular-nums"><b className="text-lg text-white">{nf(recibida, 3)}</b> de {nf(pedida, 3)}</span>
        <span className={`text-sm font-extrabold tabular-nums ${completo ? "text-emerald-300" : "text-zinc-300"}`}>{completo ? "Completo" : `${pct}%`}</span>
      </div>
      <BarraAvance pct={pct} />
      {corregido && (
        <p className="mt-2.5 text-[12px] text-amber-300/90 leading-snug">
          Corregido al pedido real. Se había sugerido{item.proveedor_sugerido != null && item.proveedor_sugerido !== item.proveedor ? <> proveedor <b>{item.proveedor_sugerido || "(ninguno)"}</b></> : null}{item.cantidad_sugerida != null && Number(item.cantidad_sugerida) !== pedida ? <> · cantidad <b>{nf(Number(item.cantidad_sugerida), 3)}</b></> : null}.
        </p>
      )}
      {editando ? (
        <div className="mt-3 rounded-xl border border-white/[0.1] bg-black/20 p-3 space-y-2.5">
          <p className="text-[12px] text-zinc-400">Poné lo que realmente se pidió. Vera y los informes usan estos datos.</p>
          <label className="block text-[12px] text-zinc-400">Proveedor al que se pidió
            <input list={`prov-${item.id}`} value={prov} onChange={(e) => setProv(e.target.value)} className="mt-1 w-full h-11 rounded-lg bg-[#15151a] border border-white/[0.12] px-3 text-[14px] text-white outline-none focus:border-[#FFD60A]" />
            <datalist id={`prov-${item.id}`}>{proveedores.map((p) => <option key={p.id ?? p.nombre} value={p.nombre} />)}</datalist>
          </label>
          <label className="block text-[12px] text-zinc-400">Cantidad pedida
            <input type="number" inputMode="decimal" step="0.01" min="0" value={cant} onChange={(e) => setCant(e.target.value)} className="mt-1 w-full h-11 rounded-lg bg-[#15151a] border border-white/[0.12] px-3 text-[14px] text-white outline-none focus:border-[#FFD60A]" />
          </label>
          {recibida > 0 && <p className="text-[12px] text-zinc-500">Ya se recibieron {nf(recibida, 3)}: la cantidad no puede ser menor.</p>}
          <div className="flex gap-2">
            <button type="button" onClick={guardar} disabled={guardando || !prov.trim() || !(Number(cant) > 0)} className="flex-1 min-h-[44px] rounded-xl bg-[#FFD60A] hover:bg-white text-black text-sm font-extrabold disabled:opacity-50 cursor-pointer">{guardando ? "Guardando…" : "Guardar pedido real"}</button>
            <button type="button" onClick={() => { setEditando(false); setProv(item.proveedor || ""); setCant(String(item.cantidad_solicitada ?? "")); }} className="min-h-[44px] px-4 rounded-xl border border-white/[0.1] text-zinc-300 text-sm font-bold cursor-pointer">Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setEditando(true)} className="mt-3 text-[12.5px] font-bold text-[#FFD60A] hover:underline cursor-pointer inline-flex items-center gap-1.5"><Pencil size={12} /> Corregir proveedor o cantidad pedida</button>
      )}
    </li>
  );
}

export default function DetalleSC({ sc, proveedores = [], onCerrar, onRecibir, onEditar, onFirmas, onPDF, onCorregir, onEliminar }) {
  const r = resumenSC(sc);
  const [eliminando, setEliminando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const recibidos = sc.items.filter((i) => num(i.cantidad_recibida) > 0);
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
        {r.porUrgencia.map((i) => <Item key={i.id} item={i} proveedores={proveedores} onCorregir={onCorregir} />)}
      </ul>

      <div className="mt-8 rounded-2xl border border-rose-500/25 bg-rose-500/[0.04] p-4">
        {!eliminando ? (
          <button type="button" onClick={() => setEliminando(true)} className="text-sm font-bold text-rose-300 hover:text-rose-200 inline-flex items-center gap-2 cursor-pointer"><Trash2 size={15} /> Eliminar esta solicitud</button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-rose-100 leading-snug">¿Eliminar <b>{nroSC(sc.id)}</b> con sus {sc.items.length} {sc.items.length === 1 ? "artículo" : "artículos"}? Deja de contar para Vera y los informes. Se guarda una copia por seguridad.</p>
            {recibidos.length > 0 && <p className="text-sm text-amber-200 leading-snug"><b>Ojo:</b> ya se recibió mercadería de {recibidos.map((i) => i.articulo).join(", ")}. Ese stock ya entró y <b>no se descuenta</b> al eliminar (queda en el historial de movimientos).</p>}
            <div className="flex gap-2">
              <button type="button" disabled={borrando} onClick={async () => { setBorrando(true); const ok = await onEliminar(sc, recibidos.length > 0); if (!ok) setBorrando(false); }} className="flex-1 min-h-[46px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-extrabold disabled:opacity-50 cursor-pointer">{borrando ? "Eliminando…" : "Sí, eliminar solicitud"}</button>
              <button type="button" disabled={borrando} onClick={() => setEliminando(false)} className="min-h-[46px] px-4 rounded-xl border border-white/[0.1] text-zinc-300 text-sm font-bold cursor-pointer">Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
