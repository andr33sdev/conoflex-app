// Pedidos: órdenes de producción que entran a planta, con su avance y sus tareas.
// Hecho primero para celular: tarjetas grandes, detalle a pantalla completa y formularios con botones cómodos.
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Inbox, Loader2, Plus, Search, X } from "lucide-react";
import { api } from "./produccion/util";
import { useToast } from "./produccion/useToast";
import TarjetaPedido from "./pedidos/TarjetaPedido";
import TablaPedidos from "./pedidos/TablaPedidos";
import DetallePedido from "./pedidos/DetallePedido";
import NuevoPedido from "./pedidos/NuevoPedido";
import { inputCls } from "./pedidos/Piezas";

const POR_PAGINA = 24;
const FILTROS = [
  { id: "ACTIVOS", texto: "Activos" },
  { id: "EN_PROCESO", texto: "En proceso" },
  { id: "PENDIENTE", texto: "Pendientes" },
  { id: "COMPLETADO", texto: "Completados" },
  { id: "ARCHIVADOS", texto: "Archivados", soloAdmin: true },
];

const porFecha = (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime() || a.id - b.id;

export default function Pedidos({ usuarioActual }) {
  const esAdmin = (usuarioActual?.rol || "ADMIN").toUpperCase() === "ADMIN";
  const { mostrar: toast, nodo: toastNodo } = useToast();

  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("ACTIVOS");
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [detalleId, setDetalleId] = useState(null);

  const pedir = useCallback(async () => {
    try {
      const r = await api("/api/pedidos");
      return { ok: true, datos: Array.isArray(r) ? r : [] };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, []);

  const aplicar = useCallback((r) => {
    if (r.ok) {
      setPedidos(r.datos);
      setError("");
    } else {
      setError(r.error);
    }
    setCargando(false);
  }, []);

  const cargar = useCallback(async () => aplicar(await pedir()), [pedir, aplicar]);

  useEffect(() => {
    let vivo = true;
    const traer = () => pedir().then((r) => vivo && aplicar(r));
    traer();
    const t = setInterval(traer, 60000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [pedir, aplicar]);

  const archivar = useCallback(
    async (p) => {
      if (!esAdmin) return;
      const nuevo = !p.archivado;
      try {
        await api(`/api/pedidos/${p.id}/archivar`, { method: "PUT", body: { archivado: nuevo } });
        await cargar();
        toast(nuevo ? `${p.cliente}: pedido archivado.` : `${p.cliente}: pedido restaurado a activos.`);
      } catch (e) {
        toast(e.message, "error");
      }
    },
    [esAdmin, cargar, toast],
  );

  const conteo = useMemo(() => {
    const act = pedidos.filter((p) => !p.archivado);
    return {
      ACTIVOS: act.length,
      EN_PROCESO: act.filter((p) => p.estado === "EN_PROCESO").length,
      PENDIENTE: act.filter((p) => p.estado === "PENDIENTE").length,
      COMPLETADO: act.filter((p) => p.estado === "COMPLETADO").length,
      ARCHIVADOS: pedidos.length - act.length,
    };
  }, [pedidos]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return pedidos
      .filter((p) => {
        const arch = Boolean(p.archivado);
        if (!esAdmin && arch) return false;
        if (filtro === "ARCHIVADOS" ? !arch : arch) return false;
        if (filtro !== "ACTIVOS" && filtro !== "ARCHIVADOS" && p.estado !== filtro) return false;
        return !q || `${p.op} ${p.cliente} ${p.articulo}`.toLowerCase().includes(q);
      })
      .sort(porFecha);
  }, [pedidos, busqueda, filtro, esAdmin]);

  const mostrados = filtrados.slice(0, visibles);
  const abierto = pedidos.find((p) => p.id === detalleId) || null;
  const cambiarFiltro = (f) => {
    setFiltro(f);
    setVisibles(POR_PAGINA);
  };

  const botonNuevo = (
    <button type="button" onClick={() => setNuevoAbierto(true)} className="inline-flex items-center justify-center gap-2 min-h-[52px] px-6 rounded-2xl bg-[#FFD60A] text-black font-extrabold text-base shadow-[0_10px_30px_rgba(255,214,10,0.2)] hover:bg-white active:scale-[0.98] transition-all cursor-pointer">
      <Plus size={22} strokeWidth={3} /> <span className="hidden min-[400px]:inline">Nuevo pedido</span><span className="min-[400px]:hidden">Nuevo</span>
    </button>
  );

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-36 lg:pb-10">
        <header className="flex items-end justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h1 className="text-[26px] sm:text-3xl font-extrabold tracking-tight text-white leading-none">Pedidos</h1>
            <p className="mt-2 text-sm text-zinc-500">
              {conteo.ACTIVOS ? `${conteo.ACTIVOS} ${conteo.ACTIVOS === 1 ? "pedido activo" : "pedidos activos"} en planta${conteo.EN_PROCESO ? ` · ${conteo.EN_PROCESO} en proceso` : ""}.` : "Seguí el avance de cada orden de producción."}
            </p>
          </div>
          {esAdmin && <div className="hidden lg:block shrink-0">{botonNuevo}</div>}
        </header>

        <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-2 pb-3 bg-[#08080a]/92 backdrop-blur-md">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative lg:w-[340px] shrink-0">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input type="search" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setVisibles(POR_PAGINA); }} placeholder="Buscar por OP, cliente o artículo…" aria-label="Buscar pedidos" className={`${inputCls} pl-11 pr-11`} />
              {busqueda && <button type="button" onClick={() => setBusqueda("")} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl grid place-items-center text-zinc-500 hover:text-white cursor-pointer"><X size={17} /></button>}
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5 min-w-0 flex-1" role="tablist" aria-label="Estado">
              {FILTROS.filter((f) => !f.soloAdmin || esAdmin).map((f) => {
                const sel = filtro === f.id;
                return (
                  <button key={f.id} role="tab" aria-selected={sel} onClick={() => cambiarFiltro(f.id)} className={`shrink-0 min-h-[46px] pl-4 pr-3 lg:min-h-[42px] lg:pl-3.5 lg:pr-2.5 rounded-full border text-[14.5px] font-bold inline-flex items-center gap-2 cursor-pointer transition-colors ${sel ? "bg-[#FF5A00] border-[#FF5A00] text-black" : "bg-white/[0.04] border-white/[0.09] text-zinc-300 hover:text-white hover:bg-white/[0.08]"}`}>
                    {f.texto}
                    <span className={`min-w-[24px] h-6 px-1.5 rounded-full grid place-items-center text-xs font-extrabold tabular-nums ${sel ? "bg-black/80 text-[#FFD60A]" : "bg-white/[0.09] text-zinc-300"}`}>{conteo[f.id]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-3">
          {cargando ? (
            <div className="flex items-center justify-center gap-3 py-28 text-zinc-500" aria-busy="true"><Loader2 className="animate-spin" size={22} /> Cargando pedidos…</div>
          ) : error && !pedidos.length ? (
            <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
              <AlertTriangle className="mx-auto text-rose-300 mb-2" size={24} />
              <p className="text-rose-100 font-semibold">{error}</p>
              <button type="button" onClick={() => { setCargando(true); cargar(); }} className="mt-4 min-h-[48px] px-6 rounded-2xl bg-white/[0.08] text-white font-bold cursor-pointer">Reintentar</button>
            </div>
          ) : filtrados.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/[0.12] bg-white/[0.02] py-16 px-6 text-center">
              <span className="w-16 h-16 mx-auto rounded-3xl grid place-items-center bg-white/[0.05] text-zinc-500 mb-4">{busqueda ? <Search size={28} /> : <Inbox size={28} />}</span>
              <p className="text-lg font-extrabold text-zinc-200">{busqueda ? "Nada coincide con tu búsqueda" : filtro === "ARCHIVADOS" ? "No hay pedidos archivados" : "No hay pedidos para mostrar"}</p>
              <p className="mt-1 text-sm text-zinc-500 max-w-sm mx-auto">{busqueda ? "Probá con otro número de OP, cliente o artículo." : esAdmin && filtro !== "ARCHIVADOS" ? "Con “Nuevo pedido” podés ingresar una OP a planta." : "Cuando haya pedidos van a aparecer acá."}</p>
            </div>
          ) : (
            <>
              <div className="hidden lg:block">
                <TablaPedidos pedidos={mostrados} esAdmin={esAdmin} onAbrir={(p) => setDetalleId(p.id)} onArchivar={archivar} />
              </div>
              <ul className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3 lg:hidden">
                {mostrados.map((p, i) => <TarjetaPedido key={p.id} p={p} indice={i} esAdmin={esAdmin} onAbrir={(x) => setDetalleId(x.id)} onArchivar={archivar} />)}
              </ul>
              {filtrados.length > visibles && (
                <div className="mt-5 text-center">
                  <button type="button" onClick={() => setVisibles((v) => v + POR_PAGINA)} className="min-h-[52px] px-8 rounded-2xl border border-white/[0.1] bg-white/[0.05] text-base font-bold text-zinc-200 hover:bg-white/[0.1] cursor-pointer">Ver más ({filtrados.length - visibles})</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {esAdmin && <div className="lg:hidden fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30">{botonNuevo}</div>}

      {nuevoAbierto && (
        <NuevoPedido
          onCerrar={() => setNuevoAbierto(false)}
          toast={toast}
          onCreado={async (n) => {
            setNuevoAbierto(false);
            await cargar();
            toast(n === 1 ? "Pedido ingresado a planta." : `${n} pedidos ingresados a planta.`);
          }}
        />
      )}

      {abierto && <DetallePedido key={abierto.id} pedido={abierto} esAdmin={esAdmin} usuario={usuarioActual} onCerrar={() => setDetalleId(null)} onCambio={cargar} onArchivar={archivar} toast={toast} />}
      {toastNodo}
    </div>
  );
}
