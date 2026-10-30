import { useMemo, useState } from "react";
import { Check, Link2, Loader2, PackageCheck, Unlink } from "lucide-react";
import { Drawer, Etiqueta } from "../produccion/ui";
import { api } from "../produccion/util";
import Autocompletar from "./Autocompletar";
import { ChipPrioridad } from "./PrioridadPills";
import { avance, formatFecha, materiaDelItem, nf, nroSC, num, unidadCorta } from "./formato";

const unidad = unidadCorta;

function Barra({ pct }) {
  return (
    <div className="h-2 rounded-full bg-white/[0.07] overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? "bg-emerald-500" : "bg-[#FF5A00]"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Renglon({ item, materias, opcionesMP, onCambio, toast }) {
  const pedida = num(item.cantidad_solicitada);
  const recibida = num(item.cantidad_recibida);
  const saldo = Math.max(0, pedida - recibida);
  const completo = recibida >= pedida;
  const pct = pedida > 0 ? Math.min(100, Math.round((recibida / pedida) * 100)) : 0;
  const mp = materiaDelItem(item, materias);
  const [cant, setCant] = useState("");
  const [oc, setOc] = useState(item.numero_oc || "");
  const [ocGuardada, setOcGuardada] = useState(item.numero_oc || "");
  const [ocupado, setOcupado] = useState(false);
  const [vincular, setVincular] = useState(false);
  const [textoMP, setTextoMP] = useState("");

  const llamar = async (body, ok) => {
    setOcupado(true);
    try {
      const r = await api(`/api/compras/items/${item.id}`, { method: "PUT", body });
      await onCambio();
      if (ok) ok(r);
      return true;
    } catch (e) {
      toast(e.message, "error");
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const ingresar = async (valor) => {
    const n = num(valor);
    if (!(n > 0)) return toast("Poné una cantidad mayor a cero.", "error");
    const ok = await llamar({ cantidad_recibida: n }, (r) =>
      toast(r.stock?.vinculada ? `Ingresaron ${nf(n, 3)} de ${item.articulo}. Stock de ${r.stock.materia_prima.nombre}: ${nf(r.stock.stock_resultante, 3)}.` : `Ingresaron ${nf(n, 3)} de ${item.articulo}. No está vinculado a una materia prima, el stock no cambió.`),
    );
    if (ok) setCant("");
  };

  const guardarOC = async () => {
    if (oc === ocGuardada) return;
    if (await llamar({ numero_oc: oc })) setOcGuardada(oc);
  };

  return (
    <div className={`rounded-2xl border p-4 transition-colors ${completo ? "border-emerald-500/25 bg-emerald-500/[0.04]" : "border-white/[0.08] bg-white/[0.025]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-extrabold text-white leading-snug break-words">{item.articulo}</p>
          <p className="text-sm text-zinc-500 mt-0.5">{item.proveedor || "Sin proveedor sugerido"}</p>
        </div>
        <ChipPrioridad valor={item.prioridad} />
      </div>

      <div className="mt-3.5">
        <Barra pct={pct} />
        <div className="grid grid-cols-3 gap-2 mt-2.5 text-center">
          {[["Pedida", pedida, "text-zinc-100"], ["Recibida", recibida, "text-amber-300"], ["Saldo", saldo, saldo === 0 ? "text-zinc-600" : "text-rose-300"]].map(([t, v, c]) => (
            <div key={t} className="rounded-xl bg-black/25 py-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{t}</div>
              <div className={`text-lg font-extrabold tabular-nums ${c}`}>{nf(v, 3)}</div>
            </div>
          ))}
        </div>
      </div>

      {mp ? (
        <p className="flex items-start gap-1.5 text-xs font-semibold text-emerald-300/90 mt-3">
          <Link2 size={13} className="mt-0.5 shrink-0" />
          <span>Lo que ingrese suma al stock de <b className="text-emerald-200">{mp.nombre}</b> (hoy {nf(Number(mp.stock_actual), 3)} {unidad(mp)}).</span>
        </p>
      ) : (
        <div className="mt-3">
          <p className="flex items-start gap-1.5 text-xs font-semibold text-amber-300/90">
            <Unlink size={13} className="mt-0.5 shrink-0" />
            <span>No está vinculado a una materia prima: lo que ingrese no suma al stock.{" "}
              <button onClick={() => setVincular((v) => !v)} className="underline underline-offset-2 text-[#FFD60A] font-bold cursor-pointer">{vincular ? "Cancelar" : "Vincular ahora"}</button>
            </span>
          </p>
          {vincular && (
            <div className="mt-2.5">
              <Autocompletar valor={textoMP} onTexto={setTextoMP} placeholder="Buscar la materia prima…" opciones={opcionesMP} onElegir={async (o) => { setTextoMP(""); setVincular(false); await llamar({ materia_prima_id: o.valor.id }, () => toast(`Vinculado a ${o.valor.nombre}. Vale para los ingresos que vengan desde ahora.`)); }} />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3 mt-4">
        <div>
          <Etiqueta>Nº de O.C.</Etiqueta>
          <input value={oc} onChange={(e) => setOc(e.target.value)} onBlur={guardarOC} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} placeholder="Sin O.C." className="w-full min-h-[48px] rounded-xl bg-[#17171c] border border-white/[0.1] px-3 text-[15px] font-bold text-white placeholder:text-zinc-600 outline-none focus:border-[#FF5A00]/70" />
        </div>
        <div>
          <Etiqueta>Ingreso de mercadería</Etiqueta>
          {completo ? (
            <div className="min-h-[48px] rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-extrabold text-sm inline-flex w-full items-center justify-center gap-2"><Check size={17} /> Totalmente recibido</div>
          ) : (
            <div className="flex gap-2">
              <input type="number" inputMode="decimal" step="0.01" min="0" value={cant} onChange={(e) => setCant(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ingresar(cant)} placeholder="Cantidad" aria-label={`Cantidad que ingresa de ${item.articulo}`} className="min-w-0 flex-1 min-h-[48px] rounded-xl bg-[#17171c] border border-white/[0.1] px-3 text-[15px] font-extrabold text-white text-right tabular-nums placeholder:text-zinc-600 placeholder:font-semibold outline-none focus:border-emerald-400/70" />
              <button onClick={() => ingresar(cant)} disabled={ocupado} className="min-h-[48px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5">{ocupado ? <Loader2 size={16} className="animate-spin" /> : null}Ingresar</button>
              <button onClick={() => ingresar(saldo)} disabled={ocupado} title={`Ingresar todo el saldo (${nf(saldo, 3)})`} className="min-h-[48px] px-3.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.1] text-zinc-200 font-bold text-sm cursor-pointer disabled:opacity-50">Todo</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RecepcionSolicitud({ abierto, solicitud, materias, onCerrar, onCambio, toast }) {
  const opcionesMP = useMemo(
    () => materias.map((m) => ({ clave: `m${m.id}`, titulo: m.nombre, detalle: m.codigo, extra: `${nf(Number(m.stock_actual), 1)} ${unidad(m)}`, valor: m })),
    [materias],
  );
  const items = useMemo(() => (solicitud ? [...solicitud.items].sort((a, b) => b.prioridad - a.prioridad || a.id - b.id) : []), [solicitud]);
  const av = solicitud ? avance(solicitud) : null;

  return (
    <Drawer
      abierto={abierto && !!solicitud}
      onCerrar={onCerrar}
      titulo={solicitud ? `Recepción · ${nroSC(solicitud.id)}` : "Recepción"}
      subtitulo={solicitud ? `Emitida el ${formatFecha(solicitud.fecha)} · ${av.completos} de ${items.length} ítems completos` : ""}
      ancho="sm:w-[640px] lg:w-[720px]"
      derecha={solicitud && (
        <span className={`self-start mt-1 rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-wider ${solicitud.estado === "COMPLETADA" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>{solicitud.estado}</span>
      )}
    >
      {solicitud && (
        <>
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 mb-4">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-sm font-bold text-zinc-300 flex items-center gap-2"><PackageCheck size={16} className="text-[#FF5A00]" /> Avance general</span>
              <span className="text-lg font-extrabold text-white tabular-nums">{av.pct}%</span>
            </div>
            <Barra pct={av.pct} />
            <p className="text-xs text-zinc-500 mt-2.5 leading-relaxed">Cada ingreso suma al stock de su materia prima y queda en el historial de esa materia prima. El número de O.C. se guarda solo al salir del campo.</p>
          </div>
          <div className="space-y-3">
            {items.map((i) => <Renglon key={i.id} item={i} materias={materias} opcionesMP={opcionesMP} onCambio={onCambio} toast={toast} />)}
          </div>
        </>
      )}
    </Drawer>
  );
}
