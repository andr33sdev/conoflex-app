import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapaRuta from "./MapaRuta";
import Cruces from "./Cruces";
import BuscadorDireccion from "./BuscadorDireccion";
import BotonPdf from "./BotonPdf";
import { CalendarDays, Check, ChevronLeft, ChevronRight, ListChecks, Loader2, Pencil, Phone, Plus, RotateCcw, Truck, User, X, MapPin, Ban, Map as MapaIcon } from "lucide-react";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "";
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const aFecha = (s) => new Date(`${s}T12:00:00`);
const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const diaSemana = (d) => (d.getDay() + 6) % 7;
const tituloDia = (s) => { const d = aFecha(s); return `${DIAS[diaSemana(d)]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
const TIPOS = { ENTREGA: "Entrega a domicilio", TRANSPORTE: "Por transporte", RETIRA: "Retira el cliente" };

async function pedir(path, opciones) {
  const res = await fetch(`${API_BASE_URL}${path}`, opciones && { ...opciones, headers: { "Content-Type": "application/json" }, body: JSON.stringify(opciones.body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "No se pudo completar.");
  return d;
}

const ESTADO_TXT = { PROGRAMADO: "Programado", DESPACHADO: "Despachado", CANCELADO: "Cancelado" };
const ESTADO_CLS = { PROGRAMADO: "bg-sky-950/50 text-sky-300 border-sky-800/60", DESPACHADO: "bg-emerald-950/50 text-emerald-300 border-emerald-800/60", CANCELADO: "bg-zinc-800 text-zinc-400 border-zinc-700" };

function Etiqueta({ estado }) {
  return <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${ESTADO_CLS[estado]}`}>{ESTADO_TXT[estado]}</span>;
}

function Tarjeta({ d, puedeEditar, ocupado, onEditar, onEstado }) {
  const donde = d.tipo_entrega === "RETIRA" ? "Retira el cliente" : d.tipo_entrega === "TRANSPORTE" ? `${d.transporte_nombre} · ${d.direccion}` : d.direccion;
  return (
    <div className={`rounded-lg border bg-[#121212] p-3.5 ${d.estado === "PROGRAMADO" ? "border-zinc-800" : "border-zinc-800/60 opacity-75"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-orange-400 tabular-nums">OP {d.op}</span>
            <Etiqueta estado={d.estado} />
          </div>
          <p className="text-white font-bold text-base leading-tight mt-1 truncate">{d.cliente}</p>
        </div>
        <Cruces valor={d.prioridad} />
      </div>
      <div className="mt-2.5 flex flex-col gap-1 text-[13px] text-zinc-300">
        <p className="flex items-start gap-2"><MapPin size={14} className="text-zinc-500 mt-0.5 shrink-0" /><span><span className="text-zinc-500">{TIPOS[d.tipo_entrega]}</span>{d.tipo_entrega !== "RETIRA" && <><br />{donde}</>}</span></p>
        {(d.contacto_nombre || d.contacto_telefono) && (
          <p className="flex items-center gap-2"><Phone size={14} className="text-zinc-500 shrink-0" />{[d.contacto_nombre, d.contacto_telefono].filter(Boolean).join(" · ")}</p>
        )}
        {d.articulos?.length > 0 && <p className="text-xs text-zinc-500">{d.articulos.map((a) => `${a.cantidad ? `${a.cantidad} × ` : ""}${a.modelo}`).join(" · ")}</p>}
        {d.observaciones && <p className="text-xs text-zinc-400 bg-zinc-900 rounded px-2 py-1.5 mt-1">{d.observaciones}</p>}
        {d.estado === "CANCELADO" && d.cancelado_motivo && <p className="text-xs text-zinc-500">Motivo: {d.cancelado_motivo}</p>}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-zinc-500 flex items-center gap-1"><User size={12} />Cargó <span className="text-zinc-300 font-semibold">{d.creado_por || "—"}</span> · {d.creado_en}{d.estado === "DESPACHADO" && d.despachado_por ? ` · Despachó ${d.despachado_por}` : ""}</p>
        <div className="flex items-center gap-1.5">
          {d.estado === "PROGRAMADO" && (
            <button disabled={ocupado} onClick={() => onEstado(d, "DESPACHADO")} className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"><Check size={13} />Despachado</button>
          )}
          {d.estado !== "PROGRAMADO" && (puedeEditar || d.estado === "DESPACHADO") && (
            <button disabled={ocupado} onClick={() => onEstado(d, "PROGRAMADO")} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"><RotateCcw size={12} />Reabrir</button>
          )}
          {d.estado === "PROGRAMADO" && puedeEditar && (
            <>
              <button onClick={() => onEditar(d)} className="p-1.5 rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800" title="Modificar"><Pencil size={13} /></button>
              <button disabled={ocupado} onClick={() => onEstado(d, "CANCELADO")} className="p-1.5 rounded-md border border-zinc-700 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 disabled:opacity-50" title="Cancelar"><Ban size={13} /></button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const VACIO = { op: "", cliente: "", fecha_despacho: "", tipo_entrega: "ENTREGA", direccion: "", transporte_nombre: "", prioridad: 3, contacto_nombre: "", contacto_telefono: "", observaciones: "", articulos: [] };
const campo = "w-full bg-[#0d0d0d] border border-zinc-700 rounded-md px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500";

function Formulario({ inicial, onCerrar, onGuardado }) {
  const editando = !!inicial?.id;
  const [f, setF] = useState({ ...VACIO, fecha_despacho: iso(new Date()), ...inicial });
  const [info, setInfo] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [sugerencias, setSugerencias] = useState([]);
  const [precargado, setPrecargado] = useState(null);
  const [ubicada, setUbicada] = useState(false);
  const [pendientes, setPendientes] = useState(null); // OP sin despachar del cliente elegido
  const [selOps, setSelOps] = useState([]);
  const [manual, setManual] = useState(false);
  const timer = useRef(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  // Cliente habitual: completa cómo se entregó la última vez.
  const aplicarHabitual = (c) => {
    setSugerencias([]);
    setPrecargado(c);
    setF((x) => ({ ...x, cliente: c.cliente, tipo_entrega: c.tipo_entrega || "ENTREGA", direccion: c.direccion || "", transporte_nombre: c.transporte_nombre || "", contacto_nombre: c.contacto_nombre || "", contacto_telefono: c.contacto_telefono || "", observaciones: c.observaciones || "" }));
  };
  const escribirCliente = (v) => {
    set("cliente", v); setPrecargado(null); setPendientes(null); setSelOps([]);
    clearTimeout(timer.current);
    if (editando || v.trim().length < 2) { setSugerencias([]); return; }
    timer.current = setTimeout(async () => {
      try { setSugerencias((await pedir(`/api/hoja-ruta/pendientes?q=${encodeURIComponent(v.trim())}`)).clientes); } catch { setSugerencias([]); }
    }, 300);
  };
  // Elegir un cliente de la lista: se ven sus pedidos sin despachar y se precarga cómo se le entregó la última vez.
  const elegirCliente = async (c) => {
    setSugerencias([]); setPendientes(c.ops); setSelOps(c.ops.length === 1 ? [c.ops[0].op] : []);
    set("cliente", c.cliente);
    try {
      const h = (await pedir(`/api/hoja-ruta/clientes?q=${encodeURIComponent(c.cliente)}&exacto=1`)).clientes[0];
      if (h) aplicarHabitual(h);
    } catch { /* sin datos previos: se completa a mano */ }
  };

  const buscar = async () => {
    if (!f.op.trim()) return;
    setBuscando(true); setInfo(null);
    try {
      const r = await pedir(`/api/hoja-ruta/op/${encodeURIComponent(f.op.trim())}`);
      setInfo(r);
      setF((x) => ({ ...x, op: r.op, cliente: r.cliente || x.cliente, articulos: r.articulos?.length ? r.articulos : x.articulos }));
      if (r.cliente && !editando) {
        const h = (await pedir(`/api/hoja-ruta/clientes?q=${encodeURIComponent(r.cliente)}&exacto=1`)).clientes[0];
        if (h) aplicarHabitual(h);
      }
    } catch (e) { setError(e.message); } finally { setBuscando(false); }
  };

  const guardar = async (e) => {
    e.preventDefault(); setError(""); setGuardando(true);
    try {
      if (editando) { onGuardado(await pedir(`/api/hoja-ruta/${inicial.id}`, { method: "PUT", body: f })); return; }
      const elegidos = (pendientes || []).filter((o) => selOps.includes(o.op)).map((o) => ({ op: o.op, articulos: o.articulos }));
      const aMano = f.op.trim() && !elegidos.some((o) => o.op === f.op.trim()) ? [{ op: f.op.trim(), articulos: f.articulos }] : [];
      const ops = [...elegidos, ...aMano];
      if (!ops.length) throw new Error("Elegí al menos un pedido o cargá el N.º de OP a mano.");
      let ultimo;
      for (const o of ops) {
        try { ultimo = await pedir("/api/hoja-ruta", { method: "POST", body: { ...f, op: o.op, articulos: o.articulos } }); }
        catch (e3) { setSelOps((x) => x.filter((y) => !ops.slice(0, ops.indexOf(o)).some((z) => z.op === y))); throw new Error(`${ops.indexOf(o) ? `Se cargaron ${ops.indexOf(o)} y ` : ""}falló la OP ${o.op}: ${e3.message}`, { cause: e3 }); }
      }
      onGuardado(ultimo);
    } catch (e2) { setError(e2.message); } finally { setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onCerrar}>
      <form onSubmit={guardar} onClick={(e) => e.stopPropagation()} className="bg-[#161616] border border-zinc-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-[#161616] z-10">
          <h3 className="text-white font-bold">{editando ? "Modificar despacho" : "Nuevo despacho"}</h3>
          <button type="button" onClick={onCerrar} className="text-zinc-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {editando ? (
            <>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">N.º de OP</label>
            <div className="flex gap-2 mt-1">
              <input className={campo} placeholder="Ej: 1234" value={f.op} onChange={(e) => set("op", e.target.value)} onBlur={() => !editando && !info && buscar()} inputMode="numeric" />
              <button type="button" onClick={buscar} disabled={buscando || !f.op.trim()} className="px-3 rounded-md border border-zinc-700 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 shrink-0">{buscando ? <Loader2 size={14} className="animate-spin" /> : "Buscar"}</button>
            </div>
            {info && (info.encontrada
              ? <p className="text-xs text-emerald-400 mt-1.5">Encontrada: {info.cliente}{info.articulos?.length ? ` · ${info.articulos.length} artículo${info.articulos.length > 1 ? "s" : ""}` : ""}</p>
              : <p className="text-xs text-amber-400 mt-1.5">No encontré esa OP en la planilla de ventas. Escribí el cliente a mano.</p>)}
            {info?.ya_cargados?.length > 0 && <p className="text-xs text-amber-400 mt-1">Ya tiene despachos cargados: {info.ya_cargados.map((y) => `${y.fecha_despacho.slice(8)}/${y.fecha_despacho.slice(5, 7)} (${y.creado_por || "—"})`).join(", ")}.</p>}
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Cliente</label>
            <div className="relative">
              <input className={`${campo} mt-1`} value={f.cliente} onChange={(e) => escribirCliente(e.target.value)} placeholder={editando ? "Razón social o nombre" : "Buscá el cliente por nombre"} autoComplete="off" />
              {sugerencias.length > 0 && (
                <ul className="absolute left-0 right-0 top-full mt-1 z-20 bg-[#1c1c1c] border border-zinc-700 rounded-md shadow-xl overflow-hidden">
                  {sugerencias.map((c) => (
                    <li key={c.cliente}><button type="button" onClick={() => elegirCliente(c)} className="w-full text-left px-3 py-2 hover:bg-zinc-800"><span className="block text-sm text-white font-semibold">{c.cliente}</span><span className="block text-xs text-zinc-500">{c.ops.length} pedido{c.ops.length > 1 ? "s" : ""} sin despachar</span></button></li>
                  ))}
                </ul>
              )}
            </div>
            {precargado && <p className="text-xs text-emerald-400 mt-1.5">Cliente habitual: cargué los datos de su última entrega ({precargado.ultima_fecha.slice(8)}/{precargado.ultima_fecha.slice(5, 7)}). Revisalos y cambiá lo que haga falta.</p>}
          </div>
            </>
          ) : (
            <>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Cliente</label>
            <div className="relative">
              <input className={`${campo} mt-1`} value={f.cliente} onChange={(e) => escribirCliente(e.target.value)} placeholder={editando ? "Razón social o nombre" : "Buscá el cliente por nombre"} autoComplete="off" />
              {sugerencias.length > 0 && (
                <ul className="absolute left-0 right-0 top-full mt-1 z-20 bg-[#1c1c1c] border border-zinc-700 rounded-md shadow-xl overflow-hidden">
                  {sugerencias.map((c) => (
                    <li key={c.cliente}><button type="button" onClick={() => elegirCliente(c)} className="w-full text-left px-3 py-2 hover:bg-zinc-800"><span className="block text-sm text-white font-semibold">{c.cliente}</span><span className="block text-xs text-zinc-500">{c.ops.length} pedido{c.ops.length > 1 ? "s" : ""} sin despachar</span></button></li>
                  ))}
                </ul>
              )}
            </div>
            {precargado && <p className="text-xs text-emerald-400 mt-1.5">Cliente habitual: cargué los datos de su última entrega ({precargado.ultima_fecha.slice(8)}/{precargado.ultima_fecha.slice(5, 7)}). Revisalos y cambiá lo que haga falta.</p>}
          </div>
          {!editando && pendientes && (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Pedidos sin despachar</label>
              {pendientes.length === 0 ? (
                <p className="text-xs text-amber-400 mt-1.5">Este cliente no tiene pedidos sin despachar en la planilla de ventas.</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1.5">
                  {pendientes.map((o) => {
                    const on = selOps.includes(o.op);
                    return (
                      <li key={o.op}>
                        <label className={`flex items-start gap-2.5 rounded-md border px-3 py-2 cursor-pointer ${on ? "border-orange-500 bg-orange-500/10" : "border-zinc-700 hover:bg-zinc-800/60"}`}>
                          <input type="checkbox" checked={on} onChange={() => setSelOps((x) => (on ? x.filter((y) => y !== o.op) : [...x, o.op]))} className="mt-1 accent-orange-500" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2"><span className="text-sm font-bold text-white">OP {o.op}</span>{o.fecha && <span className="text-[11px] text-zinc-500">Pedido {o.fecha.slice(8)}/{o.fecha.slice(5, 7)}</span>}</span>
                            <span className="block text-xs text-zinc-400">{o.articulos.map((a) => `${a.cantidad ? `${a.cantidad} × ` : ""}${a.modelo}`).join(" · ")}</span>
                            {o.ya?.length > 0 && <span className="block text-[11px] text-amber-400 mt-0.5">Ya cargada para el {o.ya.map((y) => `${y.fecha_despacho.slice(8)}/${y.fecha_despacho.slice(5, 7)}${y.estado === "DESPACHADO" ? " (despachada)" : ""}`).join(", ")}</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              {selOps.length > 1 && <p className="text-[11px] text-zinc-500 mt-1.5">Se carga un despacho por cada OP, con los mismos datos de entrega.</p>}
            </div>
          )}
          {!editando && !manual && !(pendientes && pendientes.length === 0) && (
            <button type="button" onClick={() => setManual(true)} className="self-start text-xs text-zinc-400 hover:text-white underline underline-offset-2">¿No aparece? Cargar por N.º de OP</button>
          )}
              {(manual || (pendientes && pendientes.length === 0)) && (
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">N.º de OP</label>
            <div className="flex gap-2 mt-1">
              <input className={campo} placeholder="Ej: 1234" value={f.op} onChange={(e) => set("op", e.target.value)} onBlur={() => !editando && !info && buscar()} inputMode="numeric" />
              <button type="button" onClick={buscar} disabled={buscando || !f.op.trim()} className="px-3 rounded-md border border-zinc-700 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 shrink-0">{buscando ? <Loader2 size={14} className="animate-spin" /> : "Buscar"}</button>
            </div>
            {info && (info.encontrada
              ? <p className="text-xs text-emerald-400 mt-1.5">Encontrada: {info.cliente}{info.articulos?.length ? ` · ${info.articulos.length} artículo${info.articulos.length > 1 ? "s" : ""}` : ""}</p>
              : <p className="text-xs text-amber-400 mt-1.5">No encontré esa OP en la planilla de ventas. Escribí el cliente a mano.</p>)}
            {info?.ya_cargados?.length > 0 && <p className="text-xs text-amber-400 mt-1">Ya tiene despachos cargados: {info.ya_cargados.map((y) => `${y.fecha_despacho.slice(8)}/${y.fecha_despacho.slice(5, 7)} (${y.creado_por || "—"})`).join(", ")}.</p>}
          </div>
              )}
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Día de despacho</label>
              <input type="date" className={`${campo} mt-1`} value={f.fecha_despacho} onChange={(e) => set("fecha_despacho", e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Prioridad</label>
              <div className="mt-1 h-[38px] flex items-center"><Cruces valor={f.prioridad} onElegir={(n) => set("prioridad", n)} tam="text-xl" /></div>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Cómo se entrega</label>
            <div className="grid grid-cols-3 gap-1.5 mt-1">
              {Object.entries(TIPOS).map(([k, t]) => (
                <button key={k} type="button" onClick={() => set("tipo_entrega", k)} className={`text-xs font-semibold rounded-md border px-2 py-2 ${f.tipo_entrega === k ? "border-orange-500 bg-orange-500/10 text-orange-300" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"}`}>{t}</button>
              ))}
            </div>
          </div>
          {f.tipo_entrega === "TRANSPORTE" && (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Nombre del transporte</label>
              <input className={`${campo} mt-1`} value={f.transporte_nombre} onChange={(e) => set("transporte_nombre", e.target.value)} placeholder="Ej: Expreso Oro Negro" />
            </div>
          )}
          {f.tipo_entrega !== "RETIRA" && (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{f.tipo_entrega === "TRANSPORTE" ? "Dirección del transporte" : "Dirección de entrega"}</label>
              <div className="mt-1"><BuscadorDireccion valor={f.direccion} onCambiar={(v) => { set("direccion", v); setUbicada(false); }} onElegir={(t) => { set("direccion", t); setUbicada(true); }} ubicada={ubicada} /></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Contacto <span className="normal-case font-normal">(opcional)</span></label>
              <input className={`${campo} mt-1`} value={f.contacto_nombre} onChange={(e) => set("contacto_nombre", e.target.value)} placeholder="Nombre" />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Teléfono <span className="normal-case font-normal">(opcional)</span></label>
              <input className={`${campo} mt-1`} value={f.contacto_telefono} onChange={(e) => set("contacto_telefono", e.target.value)} placeholder="Número" inputMode="tel" />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Observaciones <span className="normal-case font-normal">(opcional)</span></label>
            <textarea rows={3} className={`${campo} mt-1 resize-none`} value={f.observaciones} onChange={(e) => set("observaciones", e.target.value)} placeholder="Horarios, cómo descargar, qué llevar…" />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-zinc-800 flex justify-end gap-2 sticky bottom-0 bg-[#161616]">
          <button type="button" onClick={onCerrar} className="px-4 py-2 text-sm text-zinc-300 hover:text-white">Cancelar</button>
          <button disabled={guardando} className="px-5 py-2 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-2">{guardando && <Loader2 size={14} className="animate-spin" />}{editando ? "Guardar cambios" : selOps.length > 1 ? `Cargar ${selOps.length} despachos` : "Cargar despacho"}</button>
        </div>
      </form>
    </div>
  );
}

function Calendario({ mes, despachos, diaSel, onDia, onMes }) {
  const [anio, m] = mes;
  const primero = new Date(anio, m, 1);
  const celdas = [];
  const vacias = diaSemana(primero);
  for (let i = 0; i < vacias; i++) celdas.push(null);
  for (let d = 1; d <= new Date(anio, m + 1, 0).getDate(); d++) celdas.push(iso(new Date(anio, m, d)));
  const porDia = useMemo(() => {
    const o = {};
    despachos.forEach((d) => { (o[d.fecha_despacho] ||= []).push(d); });
    return o;
  }, [despachos]);
  const hoy = iso(new Date());
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => onMes(-1)} className="p-2 rounded-md border border-zinc-800 hover:bg-zinc-800 text-zinc-300" aria-label="Mes anterior"><ChevronLeft size={16} /></button>
        <h3 className="text-white font-bold first-letter:uppercase">{MESES[m]} {anio}</h3>
        <button onClick={() => onMes(1)} className="p-2 rounded-md border border-zinc-800 hover:bg-zinc-800 text-zinc-300" aria-label="Mes siguiente"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
        {DIAS_CORTOS.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celdas.map((f, i) => {
          if (!f) return <div key={`v${i}`} />;
          const lista = porDia[f] || [];
          const sel = f === diaSel;
          return (
            <button key={f} onClick={() => onDia(f)} className={`min-h-[64px] sm:min-h-[88px] rounded-md border p-1.5 text-left flex flex-col gap-1 transition-colors ${sel ? "border-orange-500 bg-orange-500/10" : "border-zinc-800 bg-[#121212] hover:bg-zinc-900"}`}>
              <span className={`text-xs font-bold ${f === hoy ? "text-orange-400" : "text-zinc-400"}`}>{Number(f.slice(8))}</span>
              {lista.length > 0 && (
                <>
                  <span className="sm:hidden text-[11px] font-black text-white">{lista.length}</span>
                  <div className="hidden sm:flex flex-col gap-0.5">
                    {lista.slice(0, 3).map((d) => (
                      <span key={d.id} className={`truncate text-[10px] rounded px-1 py-0.5 ${d.estado === "DESPACHADO" ? "bg-emerald-950/60 text-emerald-300" : "bg-zinc-800 text-zinc-200"}`}>{d.cliente}</span>
                    ))}
                    {lista.length > 3 && <span className="text-[10px] text-zinc-500">+{lista.length - 3} más</span>}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function HojaRuta({ usuarioActual }) {
  const hoy = new Date();
  const [vista, setVista] = useState("lista");
  const [estado, setEstado] = useState("PROGRAMADO");
  const [cargo, setCargo] = useState("");
  const [rango, setRango] = useState("proximos");
  const [mes, setMes] = useState([hoy.getFullYear(), hoy.getMonth()]);
  const [diaSel, setDiaSel] = useState(iso(hoy));
  const [despachos, setDespachos] = useState([]);
  const [cargadores, setCargadores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const [desde, hasta] = useMemo(() => {
    if (vista === "calendario") return [iso(new Date(mes[0], mes[1], 1)), iso(new Date(mes[0], mes[1] + 1, 0))];
    const h = new Date();
    if (rango === "proximos") return [iso(h), iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() + 30))];
    if (rango === "atrasados") return [iso(new Date(h.getFullYear(), h.getMonth() - 2, 1)), iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() - 1))];
    return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), iso(new Date(h.getFullYear(), h.getMonth() + 1, 0))];
  }, [vista, rango, mes]);

  const cargar = useCallback(async () => {
    if (vista === "mapa") { setCargando(false); return; }
    try {
      const est = vista === "calendario" ? "TODOS" : estado;
      const q = new URLSearchParams({ desde, hasta, estado: est });
      if (cargo) q.set("cargo", cargo);
      const r = await pedir(`/api/hoja-ruta?${q}`);
      setDespachos(r.despachos); setCargadores(r.cargadores); setError("");
    } catch (e) { setError(e.message); } finally { setCargando(false); }
  }, [desde, hasta, estado, cargo, vista]);
  // Carga los despachos al cambiar de rango o filtro.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar(); }, [cargar]);

  const esAdmin = String(usuarioActual?.rol || "").toUpperCase() === "ADMIN";
  const puedeEditar = (d) => esAdmin || (d.creado_por_id != null && Number(d.creado_por_id) === Number(usuarioActual?.id));

  const cambiarEstado = async (d, nuevo) => {
    let motivo;
    if (nuevo === "CANCELADO") { motivo = window.prompt("¿Por qué se cancela este despacho?"); if (!motivo?.trim()) return; }
    setOcupado(true);
    try { await pedir(`/api/hoja-ruta/${d.id}/estado`, { method: "POST", body: { estado: nuevo, motivo } }); await cargar(); }
    catch (e) { setError(e.message); } finally { setOcupado(false); }
  };

  const grupos = useMemo(() => {
    const o = {};
    despachos.forEach((d) => { (o[d.fecha_despacho] ||= []).push(d); });
    return Object.entries(o).sort(([a], [b]) => (rango === "atrasados" ? b.localeCompare(a) : a.localeCompare(b)));
  }, [despachos, rango]);

  const delDia = despachos.filter((d) => d.fecha_despacho === diaSel).sort((a, b) => b.prioridad - a.prioridad);
  const cambiarMes = (n) => { const d = new Date(mes[0], mes[1] + n, 1); setMes([d.getFullYear(), d.getMonth()]); };
  const tarjeta = (d) => <Tarjeta key={d.id} d={d} puedeEditar={puedeEditar(d)} ocupado={ocupado} onEditar={setForm} onEstado={cambiarEstado} />;
  const pill = (act) => `px-3 py-1.5 rounded-md text-xs font-semibold border ${act ? "border-orange-500 bg-orange-500/10 text-orange-300" : "border-zinc-800 text-zinc-400 hover:bg-zinc-800"}`;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto text-zinc-200">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2"><Truck size={20} className="text-orange-500" />Hoja de ruta</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Qué hay que despachar, cuándo y con qué prioridad.</p>
        </div>
        <button onClick={() => setForm({})} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold"><Plus size={16} />Nuevo despacho</button>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="flex rounded-md border border-zinc-800 overflow-hidden">
          <button onClick={() => setVista("lista")} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${vista === "lista" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900"}`}><ListChecks size={14} />Lista</button>
          <button onClick={() => setVista("calendario")} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${vista === "calendario" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900"}`}><CalendarDays size={14} />Calendario</button>
          <button onClick={() => setVista("mapa")} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${vista === "mapa" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900"}`}><MapaIcon size={14} />Mapa</button>
        </div>
        {vista === "lista" && (
          <>
            {[["proximos", "Próximos 30 días"], ["mes", "Este mes"], ["atrasados", "Atrasados"]].map(([id, t]) => <button key={id} onClick={() => setRango(id)} className={pill(rango === id)}>{t}</button>)}
            <select value={estado} onChange={(e) => setEstado(e.target.value)} className="bg-[#121212] border border-zinc-800 rounded-md text-xs text-zinc-300 px-2 py-1.5" aria-label="Estado">
              <option value="PROGRAMADO">Pendientes</option><option value="DESPACHADO">Despachados</option><option value="CANCELADO">Cancelados</option><option value="TODOS">Todos</option>
            </select>
          </>
        )}
        {cargadores.length > 1 && (
          <select value={cargo} onChange={(e) => setCargo(e.target.value)} className="bg-[#121212] border border-zinc-800 rounded-md text-xs text-zinc-300 px-2 py-1.5" aria-label="Quién lo cargó">
            <option value="">Cargado por: todos</option>
            {cargadores.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      {vista === "mapa" ? (
        <MapaRuta fechaInicial={diaSel} esAdmin={esAdmin} usuario={usuarioActual?.nombre} />
      ) : cargando && !despachos.length ? (
        <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-zinc-600" /></div>
      ) : vista === "lista" ? (
        grupos.length === 0 ? (
          <p className="text-center text-sm text-zinc-500 py-16">No hay despachos para mostrar. Cargá el primero con “Nuevo despacho”.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {grupos.map(([f, lista]) => (
              <section key={f}>
                <h3 className="text-sm font-bold text-white first-letter:uppercase mb-2 flex items-center gap-2">{tituloDia(f)}<span className="text-xs font-semibold text-zinc-500 normal-case">{lista.length} despacho{lista.length > 1 ? "s" : ""}</span><BotonPdf fecha={f} usuario={usuarioActual?.nombre} className="ml-auto" /></h3>
                <div className="flex flex-col gap-2.5">{[...lista].sort((a, b) => b.prioridad - a.prioridad).map(tarjeta)}</div>
              </section>
            ))}
          </div>
        )
      ) : (
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5 items-start">
          <Calendario mes={mes} despachos={despachos} diaSel={diaSel} onDia={setDiaSel} onMes={cambiarMes} />
          <div>
            <h3 className="text-sm font-bold text-white first-letter:uppercase mb-2 flex items-center gap-2">{tituloDia(diaSel)}{delDia.length > 0 && <BotonPdf fecha={diaSel} usuario={usuarioActual?.nombre} className="ml-auto" />}</h3>
            {delDia.length === 0 ? <p className="text-sm text-zinc-500">Nada programado este día.</p> : <div className="flex flex-col gap-2.5">{delDia.map(tarjeta)}</div>}
          </div>
        </div>
      )}

      {form && <Formulario inicial={form} onCerrar={() => setForm(null)} onGuardado={(g) => { setForm(null); if (vista === "calendario") { const d = aFecha(g.fecha_despacho); setMes([d.getFullYear(), d.getMonth()]); setDiaSel(g.fecha_despacho); } cargar(); }} />}
    </div>
  );
}
