// Solicitudes internas: depósito pide semielaborados a producción; producción los atiende y los deja
// disponibles; depósito los retira. En celular se usa con tarjetas grandes y hojas que suben desde abajo.
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { AlertTriangle, Archive, CheckCircle2, Inbox, LayoutGrid, Loader2, Plus, Rows3, Search, X } from "lucide-react";
import { useToast } from "./produccion/useToast";
import { archivada, getApiUrl, getNowLocal, horasDesde, motivoDe, solId } from "./solicitudes/util";
import { inputCls } from "./solicitudes/Piezas";
import TarjetaSolicitud from "./solicitudes/TarjetaSolicitud";
import TablaSolicitudes from "./solicitudes/TablaSolicitudes";
import { AuditoriaSolicitud, EditarSolicitud, NuevaSolicitud, OpcionesSolicitud, RetirarSolicitud } from "./solicitudes/Hojas";

const LIMITE_ACTIVAS = 10;
const POR_PAGINA = 24;
const JSON_HEADERS = { "Content-Type": "application/json" };

const FILTROS = [
  { id: "TODOS", texto: "Activas" },
  { id: "SOLICITADO", texto: "Solicitadas" },
  { id: "ATENDIDO", texto: "Atendidas" },
  { id: "DISPONIBLE", texto: "Disponibles" },
  { id: "AUDITORIA", texto: "Archivadas", icono: Archive },
];
const VACIO = {
  TODOS: ["No hay solicitudes activas", "Cuando se pida algo nuevo, aparece acá."],
  SOLICITADO: ["Nada esperando a producción", "Todo lo pedido ya fue atendido."],
  ATENDIDO: ["Nada en preparación", "Producción no tiene pedidos atendidos sin terminar."],
  DISPONIBLE: ["Nada para retirar", "No hay productos disponibles en depósito."],
  AUDITORIA: ["Sin solicitudes archivadas", "Las entregadas y canceladas quedan acá."],
};

export default function SolicitudesInternas({ usuarioActual }) {
  const rol = (usuarioActual?.rol || "ADMIN").toUpperCase();
  const isAdmin = rol === "ADMIN";
  const isDeposito = rol === "DEPOSITO" || isAdmin;
  const isProduccion = rol === "PRODUCCION" || isAdmin;
  const permisos = useMemo(() => ({ isAdmin, isDeposito, isProduccion }), [isAdmin, isDeposito, isProduccion]);
  const { mostrar: toast, nodo: toastNodo } = useToast();

  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [semielaborados, setSemielaborados] = useState([]);
  const [filtro, setFiltro] = useState("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState(() => {
    try { return localStorage.getItem("solicitudes_vista") === "TARJETAS" ? "TARJETAS" : "TABLA"; } catch { return "TABLA"; }
  });
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const [ocupado, setOcupado] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [menu, setMenu] = useState(null);
  const [editar, setEditar] = useState(null);
  const [retirar, setRetirar] = useState(null);
  const [auditoria, setAuditoria] = useState(null);

  const cambiarVista = (v) => {
    setVista(v);
    try { localStorage.setItem("solicitudes_vista", v); } catch { /* sin almacenamiento */ }
  };

  // Pide la lista y devuelve { datos } o { error } sin tocar el estado (así se puede usar desde un efecto).
  const pedir = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl("/api/solicitudes-internas"));
      if (!res.ok) throw new Error("No se pudieron cargar las solicitudes.");
      return { datos: (await res.json()) || [] };
    } catch (e) {
      return { error: e.message || "No se pudieron cargar las solicitudes." };
    }
  }, []);
  const aplicar = useCallback((r) => {
    if (r.datos) {
      setSolicitudes(r.datos);
      setErrorCarga("");
    } else {
      setErrorCarga(r.error);
    }
    setCargando(false);
    setAhora(Date.now());
  }, []);
  const cargar = useCallback(async () => aplicar(await pedir()), [pedir, aplicar]);

  useEffect(() => {
    let vivo = true;
    pedir().then((r) => vivo && aplicar(r));
    fetch(getApiUrl("/api/semielaborados"))
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => vivo && setSemielaborados(d.semielaborados || d.productos || (Array.isArray(d) ? d : [])))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [pedir, aplicar]);

  // Se refresca solo cada minuto (cambian las horas transcurridas y llegan pedidos nuevos).
  useEffect(() => {
    const t = setInterval(() => !document.hidden && cargar(), 60000);
    return () => clearInterval(t);
  }, [cargar]);

  const activas = useMemo(() => solicitudes.filter((s) => !archivada(s)), [solicitudes]);
  const limiteAlcanzado = activas.length >= LIMITE_ACTIVAS;
  const demoradas = useMemo(() => solicitudes.filter((s) => s.estado === "DISPONIBLE" && (horasDesde(s.disponibleAt, ahora) ?? 0) >= 8), [solicitudes, ahora]);
  const bloqueado = demoradas.length > 0;

  const conteo = useMemo(() => ({
    TODOS: activas.length,
    SOLICITADO: solicitudes.filter((s) => s.estado === "SOLICITADO").length,
    ATENDIDO: solicitudes.filter((s) => s.estado === "ATENDIDO").length,
    DISPONIBLE: solicitudes.filter((s) => s.estado === "DISPONIBLE").length,
    AUDITORIA: solicitudes.filter(archivada).length,
  }), [solicitudes, activas]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return solicitudes.filter((s) => {
      if (q && !`${solId(s)} ${s.semielaboradoNombre} ${s.semielaboradoCodigo} ${motivoDe(s)}`.toLowerCase().includes(q)) return false;
      if (filtro === "TODOS") return !archivada(s);
      if (filtro === "AUDITORIA") return archivada(s);
      return s.estado === filtro;
    });
  }, [solicitudes, busqueda, filtro]);

  // Al cambiar de filtro o búsqueda se vuelve a la primera tanda.
  const [claveFiltro, setClaveFiltro] = useState("");
  const claveActual = `${filtro}|${busqueda}`;
  if (claveActual !== claveFiltro) {
    setClaveFiltro(claveActual);
    setVisibles(POR_PAGINA);
  }
  const mostradas = filtradas.slice(0, visibles);

  /* ------------------------------------------------------------ acciones */
  const llamar = async (url, opciones, okTexto) => {
    setOcupado(true);
    try {
      const res = await fetch(getApiUrl(url), opciones);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast(d.error || "No se pudo completar la acción. Probá de nuevo.", "error");
        return false;
      }
      if (okTexto) toast(okTexto);
      await cargar();
      return true;
    } catch {
      toast("No hay conexión con el servidor. Probá de nuevo.", "error");
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const crear = async ({ semi, cantidad, urgencia, motivo }) => {
    if (!isDeposito || bloqueado || limiteAlcanzado) return false;
    const ahoraTxt = getNowLocal();
    const ok = await llamar("/api/solicitudes-internas", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        semielaboradoCodigo: semi.codigo || "S/C", semielaborado_codigo: semi.codigo || "S/C",
        semielaboradoNombre: semi.nombre, semielaborado_nombre: semi.nombre,
        cantidadSolicitada: cantidad, cantidad_solicitada: cantidad,
        urgencia, motivoUso: motivo, motivo_uso: motivo,
        estado: "SOLICITADO", solicitadoAt: ahoraTxt, solicitado_at: ahoraTxt,
      }),
    }, "Solicitud enviada a producción");
    if (ok) setNuevaAbierta(false);
    return ok;
  };

  const guardarEdicion = async ({ cantidad, urgencia, motivo }) => {
    const ok = await llamar(`/api/solicitudes-internas/${editar.id}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ cantidadSolicitada: cantidad, cantidad_solicitada: cantidad, urgencia, motivoUso: motivo, motivo_uso: motivo }),
    }, "Cambios guardados");
    if (ok) setEditar(null);
  };

  const cambiarEstado = async (s, estado) => {
    if (estado === "CANCELADO" && !isAdmin) return;
    if ((estado === "ATENDIDO" || estado === "DISPONIBLE") && !isProduccion) return;
    const t = getNowLocal();
    const payload = { estado };
    if (estado === "ATENDIDO") payload.atendidoAt = t;
    if (estado === "DISPONIBLE") payload.disponibleAt = t;
    await llamar(`/api/solicitudes-internas/${encodeURIComponent(s.id)}/estado`, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(payload) },
      estado === "ATENDIDO" ? `${solId(s)} atendida` : estado === "DISPONIBLE" ? `${solId(s)} disponible: avisale a depósito` : `${solId(s)} cancelada`);
  };

  const registrarRetiro = async (s, cantidad) => {
    if (!isDeposito) return;
    const t = getNowLocal();
    const total = Number(s.cantidadSolicitada) || 0;
    const nueva = Math.min((Number(s.cantidadRetirada) || 0) + cantidad, total);
    const completo = nueva >= total;
    const ok = await llamar(`/api/solicitudes-internas/${s.id}/retiro`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        cantidadRetirada: nueva,
        estado: completo ? "ENTREGADO" : "DISPONIBLE",
        entregadoAt: completo ? t : s.entregadoAt,
        retirosHistorial: [{ fecha: t, cantidad, usuario: usuarioActual?.nombre || "Depósito" }, ...(s.retirosHistorial || [])],
      }),
    }, completo ? `${solId(s)} entregada completa` : `Retiro registrado: ${nueva} de ${total}`);
    if (ok) setRetirar(null);
  };

  const accion = (id, s) => {
    if (id === "ATENDER") cambiarEstado(s, "ATENDIDO");
    else if (id === "DISPONIBLE") cambiarEstado(s, "DISPONIBLE");
    else if (id === "RETIRAR") setRetirar(s);
  };

  /* ------------------------------------------------------------- pantalla */
  const [tituloVacio, textoVacio] = busqueda.trim() ? ["Sin resultados", `No encontré solicitudes con “${busqueda.trim()}”.`] : VACIO[filtro];
  const puedeEditarMenu = menu && isDeposito && !archivada(menu);
  const puedeCancelarMenu = menu && isAdmin && !archivada(menu);
  const botonNueva = isDeposito && (
    <button
      type="button"
      onClick={() => setNuevaAbierta(true)}
      disabled={limiteAlcanzado || bloqueado}
      className="inline-flex items-center justify-center gap-2 min-h-[52px] px-6 rounded-2xl bg-[#FFD60A] text-black font-extrabold text-base shadow-[0_10px_30px_rgba(255,214,10,0.2)] hover:bg-white active:scale-[0.98] transition-all cursor-pointer disabled:bg-white/[0.06] disabled:text-zinc-600 disabled:shadow-none disabled:cursor-not-allowed"
    >
      <Plus size={22} strokeWidth={3} /> <span className="hidden min-[400px]:inline">Nueva solicitud</span><span className="min-[400px]:hidden">Nueva</span>
    </button>
  );

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-36 lg:pb-10">
        <header className="flex items-end justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h1 className="text-[26px] sm:text-3xl font-extrabold tracking-tight text-white leading-none">Solicitudes internas</h1>
            <p className="mt-2 text-sm text-zinc-500">
              {isDeposito && !isProduccion ? "Pedile a producción lo que necesitás y retiralo cuando esté listo." : isProduccion && !isDeposito ? "Atendé los pedidos de depósito y avisá cuando estén listos." : "Pedidos de depósito a producción, de punta a punta."}
            </p>
          </div>
          <div className="hidden lg:block shrink-0">{botonNueva}</div>
        </header>

        {bloqueado && (
          <div role="alert" className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-500/35 bg-rose-500/[0.09] px-4 py-3.5">
            <AlertTriangle size={20} className="text-rose-300 shrink-0 mt-0.5" />
            <p className="text-[15px] font-semibold text-rose-100 leading-snug">
              {demoradas.length === 1 ? "Hay 1 solicitud disponible" : `Hay ${demoradas.length} solicitudes disponibles`} hace más de 8 h sin retirar. Hasta que se retire no se pueden pedir cosas nuevas.
            </p>
          </div>
        )}
        {limiteAlcanzado && !bloqueado && isDeposito && (
          <p className="mb-4 flex items-center gap-2.5 rounded-2xl border border-[#FFD60A]/25 bg-[#FFD60A]/[0.06] px-4 py-3 text-sm font-semibold text-[#FFD60A]">
            <AlertTriangle size={17} className="shrink-0" /> Llegaste al máximo de {LIMITE_ACTIVAS} solicitudes activas. Se libera lugar cuando se entregue alguna.
          </p>
        )}

        {/* Búsqueda + filtros */}
        <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-2 pb-3 bg-[#08080a]/92 backdrop-blur-md">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative lg:w-[340px] shrink-0">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por ID, nombre o destino…" aria-label="Buscar solicitudes" className={`${inputCls} pl-11 pr-11`} />
              {busqueda && <button type="button" onClick={() => setBusqueda("")} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl grid place-items-center text-zinc-500 hover:text-white cursor-pointer"><X size={17} /></button>}
            </div>
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5 flex-1" role="tablist" aria-label="Estado">
                {FILTROS.map((f) => {
                  const sel = filtro === f.id;
                  const n = conteo[f.id];
                  return (
                    <button key={f.id} role="tab" aria-selected={sel} onClick={() => setFiltro(f.id)} className={`shrink-0 min-h-[46px] pl-4 pr-3 lg:min-h-[42px] lg:pl-3.5 lg:pr-2.5 rounded-full border text-[14.5px] font-bold inline-flex items-center gap-2 cursor-pointer transition-colors ${sel ? "bg-[#FF5A00] border-[#FF5A00] text-black" : "bg-white/[0.04] border-white/[0.09] text-zinc-300 hover:text-white hover:bg-white/[0.08]"}`}>
                      {f.texto}
                      <span className={`min-w-[24px] h-6 px-1.5 rounded-full grid place-items-center text-xs font-extrabold tabular-nums ${sel ? "bg-black/80 text-[#FFD60A]" : "bg-white/[0.09] text-zinc-300"}`}>
                        {f.id === "TODOS" ? `${n}/${LIMITE_ACTIVAS}` : n}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="hidden lg:flex shrink-0 p-1 rounded-2xl bg-white/[0.04] border border-white/[0.08]" role="group" aria-label="Tipo de vista">
                {[["TABLA", Rows3, "Tabla"], ["TARJETAS", LayoutGrid, "Tarjetas"]].map(([id, Icono, t]) => (
                  <button key={id} type="button" aria-pressed={vista === id} onClick={() => cambiarVista(id)} aria-label={`Vista de ${t.toLowerCase()}`} title={t} className={`w-11 h-10 rounded-xl grid place-items-center cursor-pointer transition-colors ${vista === id ? "bg-white/[0.12] text-white" : "text-zinc-500 hover:text-white"}`}><Icono size={18} /></button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Lista */}
        <div className="mt-3">
          {cargando ? (
            <div className="flex items-center justify-center gap-3 py-28 text-zinc-500"><Loader2 className="animate-spin" size={22} /> Cargando solicitudes…</div>
          ) : errorCarga && !solicitudes.length ? (
            <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
              <p className="text-rose-100 font-semibold">{errorCarga}</p>
              <button type="button" onClick={() => { setCargando(true); cargar(); }} className="mt-4 min-h-[48px] px-6 rounded-2xl bg-white/[0.08] text-white font-bold cursor-pointer">Reintentar</button>
            </div>
          ) : filtradas.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/[0.12] bg-white/[0.02] py-16 px-6 text-center">
              <span className="w-16 h-16 mx-auto rounded-3xl grid place-items-center bg-white/[0.05] text-zinc-500 mb-4">{filtro === "AUDITORIA" ? <Archive size={28} /> : busqueda ? <Search size={28} /> : filtro === "DISPONIBLE" ? <CheckCircle2 size={28} /> : <Inbox size={28} />}</span>
              <p className="text-lg font-extrabold text-zinc-200">{tituloVacio}</p>
              <p className="mt-1 text-sm text-zinc-500 max-w-sm mx-auto">{textoVacio}</p>
            </div>
          ) : (
            <>
              {vista === "TABLA" && (
                <div className="hidden lg:block">
                  <TablaSolicitudes items={mostradas} permisos={permisos} onAccion={accion} onMenu={setMenu} ahora={ahora} />
                </div>
              )}
              <ul className={`grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 ${vista === "TABLA" ? "lg:hidden" : ""}`}>
                <AnimatePresence initial={false}>
                  {mostradas.map((s, i) => (
                    <TarjetaSolicitud key={s.id} s={s} indice={i} permisos={permisos} onAccion={accion} onMenu={setMenu} ahora={ahora} />
                  ))}
                </AnimatePresence>
              </ul>
              {filtradas.length > visibles && (
                <div className="mt-5 text-center">
                  <button type="button" onClick={() => setVisibles((v) => v + POR_PAGINA)} className="min-h-[52px] px-8 rounded-2xl border border-white/[0.1] bg-white/[0.05] text-base font-bold text-zinc-200 hover:bg-white/[0.1] cursor-pointer">
                    Ver más ({filtradas.length - visibles})
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Botón flotante en celular y tablet (arriba del menú inferior) */}
      {isDeposito && (
        <div className="lg:hidden fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30">{botonNueva}</div>
      )}

      <NuevaSolicitud abierto={nuevaAbierta} onCerrar={() => setNuevaAbierta(false)} semielaborados={semielaborados} activas={activas} onCrear={crear} ocupado={ocupado} />
      <OpcionesSolicitud solicitud={menu} puedeEditar={!!puedeEditarMenu} puedeCancelar={!!puedeCancelarMenu} onCerrar={() => setMenu(null)} onAuditoria={setAuditoria} onEditar={setEditar} onCancelar={(s) => cambiarEstado(s, "CANCELADO")} />
      <EditarSolicitud solicitud={editar} onCerrar={() => setEditar(null)} onGuardar={guardarEdicion} ocupado={ocupado} />
      <RetirarSolicitud solicitud={retirar} onCerrar={() => setRetirar(null)} onRetirar={registrarRetiro} ocupado={ocupado} />
      <AuditoriaSolicitud solicitud={auditoria} onCerrar={() => setAuditoria(null)} />
      {toastNodo}
    </div>
  );
}
