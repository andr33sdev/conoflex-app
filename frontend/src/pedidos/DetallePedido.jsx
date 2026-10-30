import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, CheckCircle2, ChevronDown, FileText, History, ListChecks, Loader2, Plus, Save } from "lucide-react";
import { Drawer } from "../produccion/ui";
import { api } from "../produccion/util";
import { avancePedido, formatFechaArg, formatHoraArg, getNowLocal, nroOP } from "./util";
import { BarraAvance, ChipEstado, inputCls } from "./Piezas";

function Seccion({ icono: Icono, titulo, derecha, children }) {
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.09em] text-zinc-400 inline-flex items-center gap-2"><Icono size={15} className="text-[#FF5A00]" />{titulo}</h3>
        {derecha}
      </div>
      {children}
    </section>
  );
}

function Tarea({ item, esChecklist, valor, onValor, onCargar, onListo, ocupado }) {
  const objetivo = Number(item.cantidad_objetivo) || 0;
  const hecho = Number(item.cantidad_completada) || 0;
  const falta = Math.max(0, objetivo - hecho);
  const pct = objetivo > 0 ? Math.min(100, Math.round((hecho / objetivo) * 100)) : 0;
  const listo = Boolean(item.completado);
  return (
    <li className={`rounded-2xl border p-4 ${listo ? "border-emerald-500/25 bg-emerald-500/[0.04]" : "border-white/[0.08] bg-white/[0.025]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[15px] font-extrabold leading-snug break-words ${listo ? "text-zinc-500 line-through" : "text-white"}`}>{item.descripcion}</p>
          {!esChecklist && <p className="mt-1 text-sm text-zinc-500 tabular-nums"><b className="text-emerald-300">{hecho}</b> de {objetivo} u. · {pct}%</p>}
        </div>
        {listo && <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/12 px-2.5 py-1 text-[11px] font-bold text-emerald-300"><CheckCircle2 size={13} /> Listo</span>}
      </div>

      {!esChecklist && <div className="mt-3"><BarraAvance pct={pct} completo={listo} /></div>}

      {!listo && esChecklist && (
        <button type="button" onClick={() => onListo(item.id)} disabled={ocupado} className="mt-3 w-full min-h-[52px] rounded-2xl bg-[#FF5A00] hover:bg-[#ff7a30] text-black text-base font-extrabold inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50">
          <CheckCircle2 size={19} /> Marcar listo
        </button>
      )}

      {!listo && !esChecklist && (
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1 min-w-0">
            <input type="number" inputMode="numeric" min="1" max={falta} value={valor} onChange={(e) => onValor(e.target.value)} placeholder={`Faltan ${falta}`} aria-label={`Cantidad hecha de ${item.descripcion}`} className={`${inputCls} pr-20 font-extrabold tabular-nums`} />
            <button type="button" onClick={() => onValor(String(falta))} className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] px-3 rounded-xl bg-white/[0.08] text-xs font-extrabold uppercase tracking-wider text-zinc-200 hover:text-[#FFD60A] cursor-pointer">Todo</button>
          </div>
          <button type="button" onClick={() => onCargar(item.id, falta)} disabled={ocupado} className="min-h-[52px] px-5 rounded-2xl bg-[#FFD60A] hover:bg-white text-black text-base font-extrabold inline-flex items-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50">
            {ocupado ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} Cargar
          </button>
        </div>
      )}
    </li>
  );
}

export default function DetallePedido({ pedido, esAdmin, usuario, onCerrar, onCambio, onArchivar, toast }) {
  const [data, setData] = useState({ pedido: null, items: [], historial: [] });
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [avances, setAvances] = useState({});
  const [notas, setNotas] = useState(pedido.observaciones || "");
  const [guardandoNota, setGuardandoNota] = useState(false);
  const [tarea, setTarea] = useState({ desc: "", cant: "" });
  const [verTodo, setVerTodo] = useState(false);

  const traer = useCallback(async () => {
    try {
      const d = await api(`/api/pedidos/${pedido.id}/detalles`);
      setData({ pedido: d.pedido, items: d.items || [], historial: d.historial || [] });
      return d;
    } catch (e) {
      toast(e.message, "error");
      return null;
    } finally {
      setCargando(false);
    }
  }, [pedido.id, toast]);

  useEffect(() => {
    let vivo = true;
    Promise.resolve().then(() => vivo && traer());
    return () => {
      vivo = false;
    };
  }, [traer]);

  const actual = data.pedido || pedido;
  const a = avancePedido(actual);
  const arch = Boolean(pedido.archivado);
  const nombre = usuario?.nombre || "Producción";

  const correr = async (fn, ok) => {
    setOcupado(true);
    try {
      await fn();
      await Promise.all([traer(), onCambio()]);
      if (ok) toast(ok);
      return true;
    } catch (e) {
      toast(e.message, "error");
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const marcarListo = (itemId) => correr(() => api(`/api/pedidos/${pedido.id}/items/${itemId}/tildar`, { method: "PUT", body: { usuario: nombre, fechaHora: getNowLocal() } }), "Tarea marcada como lista.");

  const cargar = async (itemId, falta) => {
    const qty = Number(avances[itemId]);
    if (!qty || qty <= 0) return toast("Poné una cantidad mayor a cero.", "error");
    if (qty > falta) return toast(`Solo faltan ${falta} unidades.`, "error");
    const ok = await correr(() => api(`/api/pedidos/${pedido.id}/items/${itemId}/avance`, { method: "PUT", body: { cantidadAvanzada: qty, usuario: nombre, fechaHora: getNowLocal() } }), `Se cargaron ${qty} u.`);
    if (ok) setAvances((p) => ({ ...p, [itemId]: "" }));
  };

  const agregarTarea = async (e) => {
    e.preventDefault();
    if (!tarea.desc.trim()) return;
    const ok = await correr(() => api(`/api/pedidos/${pedido.id}/items`, { method: "POST", body: { descripcion: tarea.desc, cantidadObjetivo: tarea.cant ? Number(tarea.cant) : 0 } }), "Tarea agregada.");
    if (ok) setTarea({ desc: "", cant: "" });
  };

  const guardarNota = async () => {
    setGuardandoNota(true);
    try {
      await api(`/api/pedidos/${pedido.id}/observaciones`, { method: "PUT", body: { observaciones: notas } });
      await Promise.all([traer(), onCambio()]);
      toast("Nota guardada.");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setGuardandoNota(false);
    }
  };

  const hist = verTodo ? data.historial : data.historial.slice(0, 5);

  return (
    <Drawer
      abierto
      onCerrar={onCerrar}
      titulo={String(actual.cliente || "").toUpperCase()}
      subtitulo={<span className="inline-flex items-center gap-2 flex-wrap"><span className="font-mono font-bold text-[#ff8a4d]">{nroOP(actual.op)}</span><span>· {formatFechaArg(actual.fecha)}</span><ChipEstado estado={actual.estado} />{arch && <span className="text-xs font-bold text-zinc-400">Archivado</span>}</span>}
      ancho="sm:w-[600px] lg:w-[680px]"
      pie={esAdmin && (
        <button type="button" onClick={() => onArchivar(pedido)} className="w-full min-h-[48px] rounded-2xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.09] text-zinc-200 text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors">
          {arch ? <><ArchiveRestore size={17} className="text-emerald-300" /> Restaurar a activos</> : <><Archive size={17} /> Archivar pedido</>}
        </button>
      )}
    >
      <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-zinc-500">Artículo a producir</p>
        <p className="mt-1 text-lg font-extrabold text-white leading-snug break-words">{actual.articulo || "Sin especificar"}</p>
        {a.total > 0 && (
          <div className="mt-4">
            <div className="flex items-end justify-between mb-2">
              <span className="text-4xl font-extrabold tabular-nums text-white leading-none">{a.hecho}<span className="text-xl font-bold text-zinc-600"> / {a.total}</span><span className="ml-1 text-sm font-semibold text-zinc-500">u.</span></span>
              <span className="text-xl font-extrabold text-[#FFD60A] tabular-nums">{a.pct}%</span>
            </div>
            <BarraAvance pct={a.pct} completo={a.hecho >= a.total} />
            {a.falta > 0 && <p className="mt-2 text-sm text-zinc-500">Faltan <b className="text-zinc-300 tabular-nums">{a.falta}</b> unidades.</p>}
          </div>
        )}
      </div>

      <Seccion icono={ListChecks} titulo="Tareas del pedido" derecha={<span className="text-xs font-bold text-zinc-500">{data.items.length}</span>}>
        {cargando ? (
          <div className="flex justify-center py-8 text-zinc-500"><Loader2 className="animate-spin" size={22} /></div>
        ) : data.items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/[0.1] p-5 text-center text-sm text-zinc-500">Este pedido no tiene tareas todavía.</p>
        ) : (
          <ul className="space-y-3">
            {data.items.map((i) => (
              <Tarea key={i.id} item={i} esChecklist={!Number(i.cantidad_objetivo)} valor={avances[i.id] ?? ""} onValor={(v) => setAvances((p) => ({ ...p, [i.id]: v }))} onCargar={cargar} onListo={marcarListo} ocupado={ocupado} />
            ))}
          </ul>
        )}

        {esAdmin && (
          <form onSubmit={agregarTarea} className="mt-3 rounded-2xl border border-dashed border-white/[0.12] p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-zinc-500 mb-2.5">Agregar tarea</p>
            <input required value={tarea.desc} onChange={(e) => setTarea((t) => ({ ...t, desc: e.target.value }))} placeholder="Ej: Pegar reflectivas, Embalar…" aria-label="Nombre de la tarea" className={inputCls} />
            <div className="mt-2.5 flex gap-2">
              <input type="number" inputMode="numeric" min="1" value={tarea.cant} onChange={(e) => setTarea((t) => ({ ...t, cant: e.target.value }))} placeholder="Cantidad (opcional)" aria-label="Cantidad objetivo" className={`${inputCls} flex-1 min-w-0`} />
              <button type="submit" disabled={ocupado} className="min-h-[52px] px-5 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-base font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"><Plus size={18} /> Agregar</button>
            </div>
          </form>
        )}
      </Seccion>

      <Seccion icono={FileText} titulo="Notas del pedido">
        {esAdmin ? (
          <>
            <textarea rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Instrucciones especiales (Ej: entregar por portón 2 con remito en duplicado)" aria-label="Notas del pedido" className={`${inputCls} py-3 resize-none`} />
            <button type="button" onClick={guardarNota} disabled={guardandoNota || notas === (actual.observaciones || "")} className="mt-2.5 w-full min-h-[48px] rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] text-white text-sm font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 transition-colors">
              {guardandoNota ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar nota
            </button>
          </>
        ) : (
          <p className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-[15px] text-zinc-300 leading-relaxed">{actual.observaciones || <span className="text-zinc-500 italic">Sin notas para este pedido.</span>}</p>
        )}
      </Seccion>

      <Seccion icono={History} titulo="Historial">
        {data.historial.length === 0 ? (
          <p className="text-sm text-zinc-500">Todavía no hay movimientos.</p>
        ) : (
          <>
            <ol className="relative ml-2 border-l border-white/[0.1] space-y-4 pl-5">
              {hist.map((l) => (
                <li key={l.id} className="relative">
                  <span className={`absolute -left-[25px] top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-[#0d0d10] ${l.cantidad_avanzada > 0 ? "bg-emerald-400" : "bg-[#FFD60A]"}`} />
                  <p className="text-[15px] font-bold text-white leading-snug">
                    {l.cantidad_avanzada > 0 ? <span className="text-emerald-300">+{l.cantidad_avanzada} u.</span> : <span className="text-[#FFD60A]">Tarea lista</span>} <span className="text-zinc-300 font-semibold">en {l.item_nombre}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">{l.usuario} · {formatFechaArg(l.fecha_hora)} {formatHoraArg(l.fecha_hora)} hs</p>
                </li>
              ))}
            </ol>
            {data.historial.length > 5 && (
              <button type="button" onClick={() => setVerTodo((v) => !v)} className="mt-4 w-full min-h-[44px] rounded-2xl text-sm font-bold text-zinc-300 bg-white/[0.04] hover:bg-white/[0.08] inline-flex items-center justify-center gap-1.5 cursor-pointer">
                {verTodo ? "Ver menos" : `Ver los ${data.historial.length} movimientos`} <ChevronDown size={16} className={verTodo ? "rotate-180" : ""} />
              </button>
            )}
          </>
        )}
      </Seccion>
    </Drawer>
  );
}
