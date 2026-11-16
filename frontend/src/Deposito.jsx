// Depósito: buscar una OP y marcarla como armada o despachada. Despachar descuenta del 33 los semielaborados del pedido.
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, PackageCheck, PackageSearch, RefreshCw, Search, Truck, X } from "lucide-react";
import { api } from "./produccion/util";
import { useToast } from "./produccion/useToast";
import { Modal, Boton, Vacio } from "./produccion/ui";
import DetallePedido, { ConfirmarDespacho } from "./deposito/DetallePedido";
import { ETAPAS, cant, fechaCorta, fechaHora, primerNombre, rutaPedido } from "./deposito/formato";

const POR_PAGINA = 20;
const VIEJA_MIN = 15; // si los pedidos se trajeron hace más que esto, se actualizan solos al entrar

function Estado({ p, tipo }) {
  const en = tipo === "armado" ? p.armado_at : p.despachado_at;
  const por = tipo === "armado" ? p.armado_por : p.despachado_por;
  const planilla = tipo === "armado" ? p.armado_txt : p.despachado_txt;
  const hecho = tipo === "armado" ? p.armado : p.despachado;
  if (en) return <span className="block leading-tight"><span className="block text-[13px] font-bold text-white tabular-nums">{fechaHora(en)}</span><span className="text-[11px] text-zinc-500">{primerNombre(por)}</span></span>;
  if (planilla) return <span className="block leading-tight"><span className="block text-[13px] font-semibold text-zinc-300 tabular-nums">{planilla}</span><span className="text-[11px] text-zinc-600">planilla</span></span>;
  if (hecho) return <span className="text-[13px] text-zinc-400">Sí</span>;
  return <span className="text-zinc-700">—</span>;
}

function Acciones({ p, onArmar, onDespachar, ocupado }) {
  const armando = ocupado === `${p.op}|${p.fecha}|armar`;
  return (
    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => onArmar(p)}
        disabled={p.armado || !!ocupado}
        className={`min-h-[40px] px-3.5 rounded-xl text-[13px] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-default ${p.armado ? "text-zinc-600 bg-transparent" : "bg-sky-400/10 text-sky-200 border border-sky-400/30 hover:bg-sky-400/20"}`}
      >
        {armando ? <Loader2 size={15} className="animate-spin" /> : <PackageCheck size={15} />} {p.armado ? "Armado" : "Armar"}
      </button>
      <button
        onClick={() => onDespachar(p)}
        disabled={p.despachado || !!ocupado}
        className={`min-h-[40px] px-3.5 rounded-xl text-[13px] font-extrabold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-default ${p.despachado ? "text-zinc-600 bg-transparent" : "bg-[#FF5A00] text-black hover:bg-[#ff7a30]"}`}
      >
        <Truck size={15} /> {p.despachado ? "Despachado" : "Despachar"}
      </button>
    </div>
  );
}

function LlaveSincro({ aviso }) {
  const [s, setS] = useState(null);
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    api("/api/deposito/sincronizacion-33").then(setS).catch(() => {});
  }, []);
  if (!s) return null;
  const cambiar = async () => {
    setGuardando(true);
    try {
      const r = await api("/api/deposito/sincronizacion-33", { method: "PUT", body: { activo: !s.activo } });
      setS((x) => ({ ...x, activo: r.activo }));
      aviso(r.activo ? "Sincronización activada: el 33 se copia de la planilla cada 10 minutos." : "Sincronización apagada: el stock del 33 lo lleva la app.");
      setConfirmar(false);
    } catch (e) {
      aviso(e.message, "error");
    } finally {
      setGuardando(false);
    }
  };
  return (
    <>
      <button
        onClick={() => s.puede_cambiar && setConfirmar(true)}
        title={s.puede_cambiar ? "Activar o apagar la copia automática del stock 33 desde la planilla" : "Solo un administrador puede cambiarla"}
        className={`min-h-[46px] px-3.5 rounded-xl border text-[13px] font-bold inline-flex items-center gap-2.5 transition-colors ${s.puede_cambiar ? "cursor-pointer hover:bg-white/[0.07]" : "cursor-default"} ${s.activo ? "border-amber-400/30 bg-amber-400/[0.06] text-amber-100" : "border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-100"}`}
      >
        <span className={`relative inline-flex w-9 h-5 rounded-full transition-colors ${s.activo ? "bg-amber-400" : "bg-zinc-700"}`}>
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${s.activo ? "left-[18px]" : "left-0.5"}`} />
        </span>
        <span className="text-left leading-tight">
          <span className="block">Stock 33 desde la planilla</span>
          <span className="block text-[11px] font-semibold opacity-70">{s.activo ? "Activa · cada 10 min" : "Apagada · lo lleva la app"}</span>
        </span>
      </button>
      <Modal
        abierto={confirmar}
        onCerrar={() => setConfirmar(false)}
        titulo={s.activo ? "¿Apagar la sincronización del 33?" : "¿Activar la sincronización del 33?"}
        ancho="max-w-md"
        pie={
          <div className="flex gap-2.5 justify-end">
            <Boton onClick={() => setConfirmar(false)} variante="fantasma">Cancelar</Boton>
            <Boton onClick={cambiar} variante={s.activo ? "naranja" : "suave"} disabled={guardando} icono={guardando ? Loader2 : undefined}>{s.activo ? "Apagar" : "Activar"}</Boton>
          </div>
        }
      >
        <p className="text-sm text-zinc-300 leading-relaxed">
          {s.activo
            ? "Desde ahora la planilla deja de pisar el stock del 33: lo que se despache acá queda descontado y el stock lo lleva la app."
            : "La app va a volver a copiar el stock del 33 de la planilla cada 10 minutos. Lo que se haya despachado acá y no esté en la planilla se pierde en la próxima copia."}
        </p>
      </Modal>
    </>
  );
}

export default function Deposito() {
  const { mostrar: aviso, nodo: toastNodo } = useToast();
  const [q, setQ] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [etapa, setEtapa] = useState("PENDIENTE");
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [ocupado, setOcupado] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const [aDespachar, setADespachar] = useState(null);
  const autoActualizado = useRef(false);

  // La búsqueda espera a que termines de tipear.
  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(q.trim());
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const cargar = useCallback(async () => {
    try {
      const params = new URLSearchParams({ q: busqueda, etapa, pagina: String(pagina), por_pagina: String(POR_PAGINA) });
      const d = await api(`/api/deposito/pedidos?${params}`);
      setDatos(d);
      setError("");
      return d;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setCargando(false);
    }
  }, [busqueda, etapa, pagina]);

  const actualizar = useCallback(async (silencioso = false) => {
    setActualizando(true);
    try {
      const r = await api("/api/deposito/actualizar", { method: "POST" });
      if (!silencioso) aviso(r.mensaje || "Pedidos actualizados.");
      await cargar();
    } catch (e) {
      if (!silencioso) aviso(e.message, "error");
    } finally {
      setActualizando(false);
    }
  }, [cargar, aviso]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar().then((d) => {
      if (autoActualizado.current || !d) return;
      autoActualizado.current = true;
      const vieja = !d.ultima_sincronizacion || Date.now() - new Date(d.ultima_sincronizacion).getTime() > VIEJA_MIN * 60000;
      if (vieja) actualizar(true);
    });
  }, [cargar, actualizar]);

  const armar = async (p) => {
    setOcupado(`${p.op}|${p.fecha}|armar`);
    try {
      await api(`${rutaPedido(p)}/armar`, { method: "POST" });
      aviso(`OP ${p.op} armada. Sus semielaborados quedan comprometidos.`);
      await cargar();
      setAbierto((x) => (x ? { ...x } : x));
    } catch (e) {
      aviso(e.message, "error");
    } finally {
      setOcupado(null);
    }
  };
  const despachar = async () => {
    const p = aDespachar;
    try {
      const r = await api(`${rutaPedido(p)}/despachar`, { method: "POST" });
      aviso(`OP ${p.op} despachada${r.descontados?.length ? `: se descontaron ${r.descontados.length} semielaborados del 33` : ""}.`);
      setADespachar(null);
      await cargar();
      setAbierto((x) => (x ? { ...x } : x));
    } catch (e) {
      aviso(e.message, "error");
    }
  };

  const cambiarEtapa = (v) => {
    setEtapa(v);
    setPagina(1);
  };
  const pedidos = datos?.pedidos || [];
  const th = "px-3 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500";

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-black text-zinc-200 relative">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(60%_100%_at_15%_0%,rgba(56,189,248,0.10),transparent_70%),radial-gradient(40%_80%_at_95%_0%,rgba(255,90,0,0.10),transparent_70%)]" />
      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-9 pb-32">
        <header className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="mr-auto min-w-0">
            <h1 className="text-[34px] sm:text-5xl font-extrabold tracking-tight text-white leading-none">Depó<span className="text-[#FF5A00]">sito</span></h1>
            <p className="mt-2.5 text-[15px] text-zinc-500">Pedidos de los últimos 6 meses{datos?.ultima_sincronizacion && <> · actualizados {fechaHora(datos.ultima_sincronizacion).toLowerCase()}</>}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <LlaveSincro aviso={aviso} />
            <button onClick={() => actualizar()} disabled={actualizando} className="min-h-[46px] px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.09] text-sm font-bold text-zinc-100 inline-flex items-center gap-2 cursor-pointer disabled:opacity-60">
              <RefreshCw size={16} className={actualizando ? "animate-spin" : ""} /> <span className="hidden sm:inline">Traer pedidos nuevos</span><span className="sm:hidden">Actualizar</span>
            </button>
          </div>
        </header>

        <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} inputMode="search" placeholder="Buscar número de OP o cliente…" aria-label="Buscar OP o cliente" className="w-full min-h-[52px] rounded-2xl bg-white/[0.05] border border-white/[0.08] focus:border-[#FF5A00]/60 focus:bg-white/[0.07] pl-11 pr-12 text-base text-white placeholder:text-zinc-600 outline-none transition-colors" />
            {q && <button onClick={() => setQ("")} aria-label="Borrar búsqueda" className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] cursor-pointer"><X size={16} /></button>}
          </div>
          <div role="tablist" aria-label="Estado" className="flex gap-1 p-1 rounded-2xl bg-white/[0.05] border border-white/[0.07] overflow-x-auto no-scrollbar">
            {ETAPAS.map((e) => {
              const sel = etapa === e.v;
              const n = datos?.cuentas?.[e.v];
              return (
                <button key={e.v} role="tab" aria-selected={sel} onClick={() => cambiarEtapa(e.v)} className={`shrink-0 min-h-[42px] px-3.5 rounded-xl text-[13px] font-bold cursor-pointer transition-colors inline-flex items-center gap-2 ${sel ? "bg-white/[0.12] text-white" : "text-zinc-500 hover:text-zinc-200"}`}>
                  {e.t} {n != null && <span className={`tabular-nums text-xs ${sel ? "text-zinc-300" : "text-zinc-600"}`}>{n}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5">
          {error && !datos ? (
            <Vacio icono={PackageSearch} titulo="No se pudieron cargar los pedidos" texto={error}>
              <Boton onClick={() => cargar()}>Reintentar</Boton>
            </Vacio>
          ) : cargando ? (
            <div className="flex flex-col gap-2" aria-busy="true">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-[58px] rounded-2xl bg-white/[0.04] animate-pulse" />)}</div>
          ) : pedidos.length === 0 ? (
            <Vacio icono={PackageSearch} titulo={busqueda ? `No hay pedidos que coincidan con "${busqueda}"` : "No hay pedidos en esta pestaña"} texto={busqueda ? "Probá en otra pestaña o traé los pedidos nuevos de la planilla." : "Cuando haya, aparecen acá."}>
              {etapa !== "TODOS" && <Boton onClick={() => cambiarEtapa("TODOS")}>Ver todos</Boton>}
            </Vacio>
          ) : (
            <>
              {/* Escritorio: tabla */}
              <div className="hidden md:block rounded-3xl border border-white/[0.08] bg-[#0d0d10]/80 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/[0.03] border-b border-white/[0.06]">
                      <th className={`${th} w-[110px]`}>OP</th>
                      <th className={`${th} w-[90px]`}>Fecha</th>
                      <th className={th}>Cliente</th>
                      <th className={`${th} text-right w-[90px]`}>Unid.</th>
                      <th className={`${th} w-[120px]`}>Armado</th>
                      <th className={`${th} w-[120px]`}>Despachado</th>
                      <th className={`${th} w-[250px]`}><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidos.map((p) => (
                      <tr key={`${p.op}|${p.fecha}`} onClick={() => setAbierto(p)} className="border-t border-white/[0.05] cursor-pointer transition-colors hover:bg-white/[0.035]">
                        <td className="px-3 py-2"><span className="font-mono text-[15px] font-extrabold text-[#FFD60A]">{p.op}</span></td>
                        <td className="px-3 py-2 text-sm text-zinc-400 tabular-nums">{fechaCorta(p.fecha)}</td>
                        <td className="px-3 py-2 min-w-0">
                          <span className="block text-sm font-bold text-zinc-100 truncate max-w-[340px]">{p.cliente || "—"}</span>
                          <span className="block text-xs text-zinc-500 truncate max-w-[340px]">{p.resumen}</span>
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-zinc-300">{cant(p.unidades)}</td>
                        <td className="px-3 py-2"><Estado p={p} tipo="armado" /></td>
                        <td className="px-3 py-2"><Estado p={p} tipo="despachado" /></td>
                        <td className="px-3 py-2"><Acciones p={p} onArmar={armar} onDespachar={setADespachar} ocupado={ocupado} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Celular: tarjetas */}
              <div className="md:hidden flex flex-col gap-3">
                {pedidos.map((p) => (
                  <div key={`${p.op}|${p.fecha}`} onClick={() => setAbierto(p)} className="rounded-2xl border border-white/[0.08] bg-[#0d0d10] p-4 active:scale-[0.99] transition-transform">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2"><span className="font-mono text-lg font-extrabold text-[#FFD60A]">{p.op}</span><span className="text-xs text-zinc-500">{fechaCorta(p.fecha)}</span></div>
                        <p className="mt-0.5 text-[15px] font-bold text-white leading-snug truncate">{p.cliente || "—"}</p>
                        <p className="text-xs text-zinc-500 truncate">{cant(p.unidades)} u. · {p.resumen}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div><span className="block text-zinc-600 font-bold uppercase tracking-wide text-[10px] mb-0.5">Armado</span><Estado p={p} tipo="armado" /></div>
                      <div><span className="block text-zinc-600 font-bold uppercase tracking-wide text-[10px] mb-0.5">Despachado</span><Estado p={p} tipo="despachado" /></div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-white/[0.06]"><Acciones p={p} onArmar={armar} onDespachar={setADespachar} ocupado={ocupado} /></div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-500 tabular-nums">{(datos.pagina - 1) * datos.por_pagina + 1}–{Math.min(datos.total, datos.pagina * datos.por_pagina)} de {datos.total}</p>
                {datos.paginas > 1 && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPagina(datos.pagina - 1)} disabled={datos.pagina <= 1} aria-label="Página anterior" className="w-11 h-11 grid place-items-center rounded-xl border border-white/[0.09] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.1] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"><ChevronLeft size={18} /></button>
                    <span className="text-sm font-bold text-zinc-300 tabular-nums px-1">{datos.pagina} / {datos.paginas}</span>
                    <button onClick={() => setPagina(datos.pagina + 1)} disabled={datos.pagina >= datos.paginas} aria-label="Página siguiente" className="w-11 h-11 grid place-items-center rounded-xl border border-white/[0.09] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.1] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"><ChevronRight size={18} /></button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {toastNodo}
      <DetallePedido key={abierto ? `${abierto.op}|${abierto.fecha}|${datos?.pedidos?.find((x) => x.op === abierto.op && x.fecha === abierto.fecha)?.etapa || ""}` : "nada"} pedido={abierto} onCerrar={() => setAbierto(null)} onArmar={armar} onDespachar={setADespachar} onCambio={cargar} aviso={aviso} />
      <ConfirmarDespacho key={aDespachar ? `${aDespachar.op}|${aDespachar.fecha}` : "nada"} pedido={aDespachar} onCerrar={() => setADespachar(null)} onConfirmar={despachar} />
    </div>
  );
}
