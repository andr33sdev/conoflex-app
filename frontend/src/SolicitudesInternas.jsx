import { useState, useEffect, useMemo } from "react";
import {
  ClipboardList,
  History,
  Truck,
  PackageCheck,
  X,
  Search,
  Plus,
  Ban,
  Check,
  AlertCircle,
  Send,
  Lock,
  Clock,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

// CONFIGURACIÓN DE URL DEL BACKEND (FEROZO / LOCALHOST)
const API_BASE_URL = import.meta.env?.VITE_API_URL || "";

const getApiUrl = (path) => {
  const cleanPath = path.startsWith("/") ? path : "/" + path;
  return `${API_BASE_URL}${cleanPath}`;
};

export default function SolicitudesInternas({ usuarioActual }) {
  // MATRIZ DE PERMISOS POR ROL
  const rolUpper = (usuarioActual?.rol || "ADMIN").toUpperCase();
  const isAdmin = rolUpper === "ADMIN";
  const isDeposito = rolUpper === "DEPOSITO" || isAdmin;
  const isProduccion = rolUpper === "PRODUCCION" || isAdmin;

  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [busqueda, setBusqueda] = useState("");

  const [semielaboradosDB, setSemielaboradosDB] = useState([]);

  // MODALES
  const [modalNuevoOpen, setModalNuevoOpen] = useState(false);
  const [modalRetiroOpen, setModalRetiroOpen] = useState(null);
  const [modalHistorialOpen, setModalHistorialOpen] = useState(null);

  // FORMULARIO SOLICITUD
  const [semiSeleccionado, setSemiSeleccionado] = useState(null);
  const [cantidadPedir, setCantidadPedir] = useState("");
  const [urgenciaPedir, setUrgenciaPedir] = useState("MEDIA");
  const [errorDuplicado, setErrorDuplicado] = useState(null);
  const [searchSemiText, setSearchSemiText] = useState("");

  // RETIRO MANUAL
  const [cantidadRetiroManual, setCantidadRetiroManual] = useState("");

  // CARGAR SOLICITUDES DESDE BASE DE DATOS
  const fetchSolicitudes = async () => {
    try {
      const url = getApiUrl("/api/solicitudes-internas");
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setSolicitudes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error al cargar solicitudes internas:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSemielaborados = async () => {
    try {
      const url = getApiUrl("/api/semielaborados");
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const list = data.semielaborados || data.productos || data || [];
      setSemielaboradosDB(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("Error al cargar semielaborados:", err);
    }
  };

  useEffect(() => {
    fetchSolicitudes();
    fetchSemielaborados();
  }, []);

  // REGLA DE NEGOCIO: CÁLCULO DE BLOQUEO DE 8 HORAS
  const solicitudesDemoradas8hs = useMemo(() => {
    const ahora = new Date().getTime();
    return solicitudes.filter((s) => {
      if (s.estado === "DISPONIBLE" && s.disponibleAt) {
        const disponibleTime = new Date(
          s.disponibleAt.replace(" ", "T"),
        ).getTime();
        if (isNaN(disponibleTime)) return false;
        const diffHoras = (ahora - disponibleTime) / (1000 * 60 * 60);
        return diffHoras >= 8;
      }
      return false;
    });
  }, [solicitudes]);

  const bloqueadoPor8hs = solicitudesDemoradas8hs.length > 0;

  const semielaboradosFiltrados =
    searchSemiText.length >= 2
      ? semielaboradosDB
          .filter(
            (s) =>
              (s.nombre &&
                s.nombre
                  .toLowerCase()
                  .includes(searchSemiText.toLowerCase())) ||
              (s.codigo &&
                s.codigo.toLowerCase().includes(searchSemiText.toLowerCase())),
          )
          .slice(0, 10)
      : [];

  const solicitudesActivas = solicitudes.filter(
    (s) => s.estado !== "ENTREGADO" && s.estado !== "CANCELADO",
  );
  const limiteAlcanzado = solicitudesActivas.length >= 10;

  // CREAR SOLICITUD EN BASE DE DATOS
  const handleCrearSolicitud = async (e) => {
    e.preventDefault();
    if (!isDeposito || bloqueadoPor8hs || limiteAlcanzado) return;
    if (!semiSeleccionado || !cantidadPedir || Number(cantidadPedir) <= 0)
      return;

    const existente = solicitudesActivas.find(
      (s) => s.semielaboradoCodigo === semiSeleccionado.codigo,
    );

    if (existente) {
      setErrorDuplicado(existente);
      return;
    }

    const now = new Date().toISOString().replace("T", " ").substring(0, 19);
    const nueva = {
      id: `SOL-${Math.floor(1000 + Math.random() * 9000)}`,
      semielaboradoCodigo: semiSeleccionado.codigo || "S/C",
      semielaboradoNombre: semiSeleccionado.nombre,
      cantidadSolicitada: Number(cantidadPedir),
      urgencia: urgenciaPedir,
      estado: "SOLICITADO",
      solicitadoAt: now,
    };

    try {
      const res = await fetch(getApiUrl("/api/solicitudes-internas"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nueva),
      });

      if (res.ok) {
        await fetchSolicitudes();
        setModalNuevoOpen(false);
        setSemiSeleccionado(null);
        setCantidadPedir("");
        setSearchSemiText("");
        setErrorDuplicado(null);
      }
    } catch (err) {
      console.error("Error guardando nueva solicitud:", err);
    }
  };

  // CAMBIO DE ESTADO PERSISTIDO EN BD
  const handleCambiarEstado = async (id, nuevoEstado) => {
    if (nuevoEstado === "CANCELADO" && !isAdmin) return;
    if (
      (nuevoEstado === "ATENDIDO" || nuevoEstado === "DISPONIBLE") &&
      !isProduccion
    )
      return;

    const now = new Date().toISOString().replace("T", " ").substring(0, 19);
    const payload = { estado: nuevoEstado };
    if (nuevoEstado === "ATENDIDO") payload.atendidoAt = now;
    if (nuevoEstado === "DISPONIBLE") payload.disponibleAt = now;

    try {
      const res = await fetch(
        getApiUrl(`/api/solicitudes-internas/${id}/estado`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        await fetchSolicitudes();
      }
    } catch (err) {
      console.error("Error al cambiar estado:", err);
    }
  };

  // REGISTRAR RETIRO PARCIAL PERSISTIDO EN BD
  const handleRegistrarRetiro = async (solicitudId, cantidad) => {
    if (!isDeposito) return;
    const qty = Number(cantidad);
    if (!qty || qty <= 0) return;

    const solicitudActual = solicitudes.find((s) => s.id === solicitudId);
    if (!solicitudActual) return;

    const now = new Date().toISOString().replace("T", " ").substring(0, 19);
    const nuevaCantidadRetirada = Math.min(
      solicitudActual.cantidadRetirada + qty,
      solicitudActual.cantidadSolicitada,
    );
    const estaCompleto =
      nuevaCantidadRetirada >= solicitudActual.cantidadSolicitada;

    const nuevoRetiroLog = {
      fecha: now,
      cantidad: qty,
      usuario: usuarioActual?.nombre || "Depósito",
    };

    const historialActualizado = [
      nuevoRetiroLog,
      ...(solicitudActual.retirosHistorial || []),
    ];

    try {
      const res = await fetch(
        getApiUrl(`/api/solicitudes-internas/${solicitudId}/retiro`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cantidadRetirada: nuevaCantidadRetirada,
            estado: estaCompleto ? "ENTREGADO" : "DISPONIBLE",
            entregadoAt: estaCompleto ? now : solicitudActual.entregadoAt,
            retirosHistorial: historialActualizado,
          }),
        },
      );

      if (res.ok) {
        await fetchSolicitudes();
        setModalRetiroOpen(null);
        setCantidadRetiroManual("");
      }
    } catch (err) {
      console.error("Error al registrar retiro:", err);
    }
  };

  const solicitudesFiltradas = solicitudes.filter((s) => {
    const coincideBusqueda =
      s.id.toLowerCase().includes(busqueda.toLowerCase()) ||
      s.semielaboradoNombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      s.semielaboradoCodigo.toLowerCase().includes(busqueda.toLowerCase());

    if (!coincideBusqueda) return false;

    if (filtroEstado === "TODOS")
      return s.estado !== "ENTREGADO" && s.estado !== "CANCELADO";
    if (filtroEstado === "AUDITORIA")
      return s.estado === "ENTREGADO" || s.estado === "CANCELADO";
    return s.estado === filtroEstado;
  });

  const getUrgenciaBadge = (urgencia) => {
    switch (urgencia) {
      case "ALTA":
        return "bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse";
      case "MEDIA":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "BAJA":
      default:
        return "bg-slate-500/10 text-slate-400 border-slate-500/30";
    }
  };

  const getEstadoBadge = (estado) => {
    switch (estado) {
      case "SOLICITADO":
        return {
          bg: "bg-blue-500/10 text-blue-400 border-blue-500/30",
          label: "SOLICITADO",
        };
      case "ATENDIDO":
        return {
          bg: "bg-amber-500/10 text-amber-400 border-amber-500/30",
          label: "EN PROCESO",
        };
      case "DISPONIBLE":
        return {
          bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
          label: "DISPONIBLE",
        };
      case "ENTREGADO":
        return {
          bg: "bg-slate-500/10 text-slate-400 border-slate-500/30",
          label: "ENTREGADO",
        };
      case "CANCELADO":
      default:
        return {
          bg: "bg-rose-500/10 text-rose-400 border-rose-500/30",
          label: "CANCELADO",
        };
    }
  };

  const getTiempoDisponibleTexto = (disponibleAt) => {
    if (!disponibleAt) return null;
    const disponibleTime = new Date(disponibleAt.replace(" ", "T")).getTime();
    if (isNaN(disponibleTime)) return null;
    const diffMs = new Date().getTime() - disponibleTime;
    const diffHoras = Math.floor(diffMs / (1000 * 60 * 60));
    return `${diffHoras}h en espera`;
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#070a12] border border-slate-800/80 rounded-2xl font-sans text-slate-200 shadow-2xl overflow-hidden relative">
      {/* BANNER DE BLOQUEO POR 8 HORAS */}
      {bloqueadoPor8hs && (
        <div className="bg-rose-500/15 border-b border-rose-500/40 p-3 px-4 flex items-center justify-between gap-3 text-rose-300 font-mono text-xs z-20 animate-in fade-in shrink-0">
          <div className="flex items-center gap-2.5">
            <AlertTriangle
              size={18}
              className="text-rose-400 shrink-0 animate-bounce"
            />
            <span>
              <strong className="text-white font-bold uppercase">
                CREACIÓN BLOQUEADA:
              </strong>{" "}
              Tienes{" "}
              <strong>{solicitudesDemoradas8hs.length} solicitud(es)</strong>{" "}
              listas en Planta hace más de 8 horas sin retirar. Confirmá la
              recepción antes de hacer nuevos pedidos.
            </span>
          </div>
        </div>
      )}

      {/* CABECERA */}
      <div className="bg-[#0f172a]/90 border-b border-slate-800/80 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 backdrop-blur-xl z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 sm:p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.15)] shrink-0">
            <ClipboardList
              size={20}
              className="text-emerald-400 animate-pulse"
            />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xs sm:text-sm font-bold text-white tracking-widest uppercase font-mono">
                SOLICITUDES INTERNAS DE DEPÓSITO
              </h2>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono font-bold">
                {rolUpper}
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
              Gestión centralizada de pedidos inter-planta
              {limiteAlcanzado && (
                <span className="bg-rose-500/20 text-rose-400 border border-rose-500/50 px-1.5 rounded font-bold animate-pulse">
                  LÍMITE 10 ACTIVAS
                </span>
              )}
            </p>
          </div>
        </div>

        {/* BOTÓN NUEVA SOLICITUD */}
        {isDeposito ? (
          <button
            onClick={() => {
              if (limiteAlcanzado || bloqueadoPor8hs) return;
              setModalNuevoOpen(true);
              setErrorDuplicado(null);
            }}
            disabled={limiteAlcanzado || bloqueadoPor8hs}
            className={`w-full sm:w-auto justify-center font-bold font-mono text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.2)] ${
              limiteAlcanzado || bloqueadoPor8hs
                ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60"
                : "bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer active:scale-95"
            }`}
          >
            <Plus size={16} /> NUEVA SOLICITUD
          </button>
        ) : (
          <span className="text-[10px] font-mono text-slate-500 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-1.5 self-start sm:self-auto">
            <Lock size={12} /> Creación reservada a Depósito
          </span>
        )}
      </div>

      {/* FILTROS & BÚSQUEDA ADAPTADOS PARA MOBILE (Scroll suave horizontal) */}
      <div className="p-3 bg-[#090d16] border-b border-slate-800/80 flex flex-col gap-2.5 shrink-0">
        <div className="relative w-full">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por código o nombre..."
            className="w-full bg-[#070a12] border border-slate-800 text-slate-200 pl-9 pr-3 py-2 rounded-xl outline-none focus:border-emerald-500/50 text-xs font-mono"
          />
        </div>

        {/* CINTA DE PESTAÑAS ELEGANTE EN MOBILE (Sin desbordes ni cortes) */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto w-full py-0.5 px-0.5"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {["TODOS", "SOLICITADO", "ATENDIDO", "DISPONIBLE", "AUDITORIA"].map(
            (est) => (
              <button
                key={est}
                onClick={() => setFiltroEstado(est)}
                className={`px-3 py-1.5 rounded-xl border transition cursor-pointer font-bold whitespace-nowrap text-[11px] font-mono shrink-0 ${
                  filtroEstado === est
                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                    : "bg-[#070a12] border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {est === "TODOS"
                  ? `Activas (${solicitudesActivas.length}/10)`
                  : est === "AUDITORIA"
                    ? "Archivadas"
                    : est}
              </button>
            ),
          )}
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL PERSISTENTE */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2 font-mono text-xs">
            <RefreshCw size={24} className="animate-spin text-emerald-400" />
            <span>Cargando solicitudes internas...</span>
          </div>
        ) : solicitudesFiltradas.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2 border border-dashed border-slate-800/80 rounded-2xl p-8 font-mono text-xs text-center">
            <ClipboardList size={32} className="text-slate-600 mb-1" />
            <p>
              No se encontraron solicitudes registradas en la base de datos.
            </p>
          </div>
        ) : (
          <>
            {/* VISTA MOBILE (< 1024px) - TARJETAS INDUSTRIALES */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:hidden">
              {solicitudesFiltradas.map((s) => {
                const estBadge = getEstadoBadge(s.estado);
                const saldoPendiente =
                  s.cantidadSolicitada - s.cantidadRetirada;
                const porcentajeProgreso = Math.round(
                  (s.cantidadRetirada / s.cantidadSolicitada) * 100,
                );
                const esDemorado8hs =
                  s.estado === "DISPONIBLE" &&
                  s.disponibleAt &&
                  (new Date().getTime() -
                    new Date(s.disponibleAt.replace(" ", "T")).getTime()) /
                    (1000 * 60 * 60) >=
                    8;

                return (
                  <div
                    key={s.id}
                    className={`bg-[#0e1422] border rounded-2xl p-3.5 flex flex-col justify-between gap-3 shadow-lg transition-all ${
                      esDemorado8hs
                        ? "border-rose-500/50 bg-rose-950/10 shadow-[0_0_15px_rgba(244,63,94,0.1)]"
                        : "border-slate-800/80 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-emerald-400 text-xs">
                            {s.id}
                          </span>
                          <span
                            className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${getUrgenciaBadge(
                              s.urgencia,
                            )}`}
                          >
                            {s.urgencia}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                          {s.solicitadoAt}
                        </span>
                      </div>

                      <span
                        className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg border ${estBadge.bg}`}
                      >
                        {estBadge.label}
                      </span>
                    </div>

                    <div>
                      <span className="font-mono font-bold text-amber-400 text-xs block mb-0.5">
                        [{s.semielaboradoCodigo}]
                      </span>
                      <h3 className="text-xs font-bold text-slate-100 leading-snug">
                        {s.semielaboradoNombre}
                      </h3>
                    </div>

                    <div className="bg-[#070a12] p-2.5 rounded-xl border border-slate-800/80 space-y-1.5 font-mono text-[11px]">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-300 font-bold">
                          Retirado: {s.cantidadRetirada} /{" "}
                          {s.cantidadSolicitada} u.
                        </span>
                        <span className="text-cyan-400 font-bold">
                          Saldo: {saldoPendiente} u.
                        </span>
                      </div>
                      <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500"
                          style={{ width: `${porcentajeProgreso}%` }}
                        />
                      </div>
                    </div>

                    {esDemorado8hs && (
                      <div className="bg-rose-500/10 border border-rose-500/30 p-2 rounded-xl flex items-center justify-between text-[11px] font-mono text-rose-300">
                        <span className="flex items-center gap-1 font-bold">
                          <Clock
                            size={12}
                            className="text-rose-400 animate-spin"
                          />
                          {getTiempoDisponibleTexto(s.disponibleAt)}
                        </span>
                        <span className="text-[10px] bg-rose-500/20 px-1.5 py-0.5 rounded font-bold">
                          +8hs pendiente
                        </span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <button
                        onClick={() => setModalHistorialOpen(s)}
                        className="text-[11px] font-mono text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer underline"
                      >
                        <History size={12} /> Historial
                      </button>

                      <div className="flex items-center gap-1.5">
                        {s.estado === "SOLICITADO" && isProduccion && (
                          <button
                            onClick={() =>
                              handleCambiarEstado(s.id, "ATENDIDO")
                            }
                            className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold px-3 py-1.5 rounded-xl transition text-xs flex items-center gap-1 cursor-pointer active:scale-95"
                          >
                            <Check size={14} /> Atender
                          </button>
                        )}

                        {s.estado === "ATENDIDO" && isProduccion && (
                          <button
                            onClick={() =>
                              handleCambiarEstado(s.id, "DISPONIBLE")
                            }
                            className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold px-3 py-1.5 rounded-xl transition text-xs flex items-center gap-1 cursor-pointer active:scale-95"
                          >
                            <PackageCheck size={14} /> Marcar Listo
                          </button>
                        )}

                        {s.estado === "DISPONIBLE" && isDeposito && (
                          <button
                            onClick={() => {
                              setModalRetiroOpen(s);
                              setCantidadRetiroManual("");
                            }}
                            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-3.5 py-1.5 rounded-xl transition text-xs flex items-center gap-1 cursor-pointer shadow-[0_0_12px_rgba(6,182,212,0.2)] active:scale-95"
                          >
                            <Truck size={14} /> + Extraer
                          </button>
                        )}

                        {s.estado !== "ENTREGADO" &&
                          s.estado !== "CANCELADO" &&
                          isAdmin && (
                            <button
                              onClick={() =>
                                handleCambiarEstado(s.id, "CANCELADO")
                              }
                              className="text-slate-600 hover:text-rose-400 p-1.5 transition cursor-pointer"
                              title="Cancelar solicitud"
                            >
                              <Ban size={15} />
                            </button>
                          )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* VISTA DESKTOP (>= 1024px) - TABLA TRADICIONAL */}
            <div className="hidden lg:block bg-[#0e1422] border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#090d16] text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                  <tr>
                    <th className="p-3 w-28">N° Solicitud</th>
                    <th className="p-3 w-28">Urgencia</th>
                    <th className="p-3">Semielaborado Requerido</th>
                    <th className="p-3 w-44">Avance / Retiro Parcial</th>
                    <th className="p-3 w-32">Estado Actual</th>
                    <th className="p-3 w-36">Último Cambio</th>
                    <th className="p-3 w-48 text-center">
                      Acciones Restringidas
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-[#070a12]/30 font-mono">
                  {solicitudesFiltradas.map((s) => {
                    const estBadge = getEstadoBadge(s.estado);
                    const saldoPendiente =
                      s.cantidadSolicitada - s.cantidadRetirada;
                    const porcentajeProgreso = Math.round(
                      (s.cantidadRetirada / s.cantidadSolicitada) * 100,
                    );
                    const esDemorado8hs =
                      s.estado === "DISPONIBLE" &&
                      s.disponibleAt &&
                      (new Date().getTime() -
                        new Date(s.disponibleAt.replace(" ", "T")).getTime()) /
                        (1000 * 60 * 60) >=
                        8;

                    return (
                      <tr
                        key={s.id}
                        className={`hover:bg-[#121824] transition-colors align-middle ${
                          esDemorado8hs ? "bg-rose-950/10" : ""
                        }`}
                      >
                        <td className="p-3">
                          <span className="font-bold text-emerald-400 text-xs block">
                            {s.id}
                          </span>
                          <button
                            onClick={() => setModalHistorialOpen(s)}
                            className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1 mt-0.5 cursor-pointer underline"
                          >
                            <History size={11} /> Auditoría
                          </button>
                        </td>

                        <td className="p-3">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getUrgenciaBadge(
                              s.urgencia,
                            )}`}
                          >
                            {s.urgencia}
                          </span>
                        </td>

                        <td className="p-3">
                          <span className="font-bold text-amber-400 text-[11px] block">
                            [{s.semielaboradoCodigo}]
                          </span>
                          <span className="text-slate-200 text-xs font-sans font-bold leading-tight block truncate">
                            {s.semielaboradoNombre}
                          </span>
                        </td>

                        <td className="p-3">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-slate-300 font-bold">
                                {s.cantidadRetirada} / {s.cantidadSolicitada} u.
                              </span>
                              <span className="text-cyan-400 font-bold">
                                Saldo: {saldoPendiente} u.
                              </span>
                            </div>
                            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
                              <div
                                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500"
                                style={{ width: `${porcentajeProgreso}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="p-3">
                          <span
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border inline-block ${estBadge.bg}`}
                          >
                            {estBadge.label}
                          </span>
                          {esDemorado8hs && (
                            <span className="block text-[9px] text-rose-400 font-bold mt-1">
                              ⚠️ +8hs sin retirar
                            </span>
                          )}
                        </td>

                        <td className="p-3 text-[10px] text-slate-400">
                          <span className="block text-slate-300">
                            {s.disponibleAt || s.atendidoAt || s.solicitadoAt}
                          </span>
                          <span className="text-[9px] text-slate-500">
                            {s.disponibleAt
                              ? "Listo en Planta"
                              : s.atendidoAt
                                ? "Atendido por Planta"
                                : "Solicitado"}
                          </span>
                        </td>

                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {s.estado === "SOLICITADO" && isProduccion && (
                              <button
                                onClick={() =>
                                  handleCambiarEstado(s.id, "ATENDIDO")
                                }
                                className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold px-2.5 py-1 rounded-lg transition text-[10px] flex items-center gap-1 cursor-pointer"
                              >
                                <Check size={12} /> Marcar Atendido
                              </button>
                            )}

                            {s.estado === "ATENDIDO" && isProduccion && (
                              <button
                                onClick={() =>
                                  handleCambiarEstado(s.id, "DISPONIBLE")
                                }
                                className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold px-2.5 py-1 rounded-lg transition text-[10px] flex items-center gap-1 cursor-pointer"
                              >
                                <PackageCheck size={12} /> Marcar Listo
                              </button>
                            )}

                            {s.estado === "DISPONIBLE" && isDeposito && (
                              <button
                                onClick={() => {
                                  setModalRetiroOpen(s);
                                  setCantidadRetiroManual("");
                                }}
                                className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold px-2.5 py-1.5 rounded-lg transition text-[10px] flex items-center gap-1 cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.15)]"
                              >
                                <Truck size={13} /> + Extraer
                              </button>
                            )}

                            {s.estado !== "ENTREGADO" &&
                              s.estado !== "CANCELADO" &&
                              isAdmin && (
                                <button
                                  onClick={() =>
                                    handleCambiarEstado(s.id, "CANCELADO")
                                  }
                                  className="text-slate-600 hover:text-rose-400 p-1.5 transition cursor-pointer"
                                  title="Cancelar solicitud (Solo Admin)"
                                >
                                  <Ban size={14} />
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* MODAL CREAR SOLICITUD */}
      {modalNuevoOpen && isDeposito && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[300] flex items-center justify-center p-3 sm:p-4 font-sans animate-in fade-in">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col relative text-xs max-h-[90vh]">
            <div className="bg-[#090d16] border-b border-slate-800 p-4 sm:p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <ClipboardList size={18} className="text-emerald-400" />
                </div>
                <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider font-mono">
                  NUEVA SOLICITUD DE DEPÓSITO
                </h3>
              </div>
              <button
                onClick={() => setModalNuevoOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-xl cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={handleCrearSolicitud}
              className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto"
            >
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-slate-400 uppercase block">
                  1. SELECCIONAR SEMIELABORADO DE LA BD
                </label>
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    type="text"
                    value={searchSemiText}
                    onChange={(e) => {
                      setSearchSemiText(e.target.value);
                      setErrorDuplicado(null);
                      setSemiSeleccionado(null);
                    }}
                    placeholder="Escribí código o nombre..."
                    className="w-full bg-[#070a12] border border-slate-700 text-white font-sans text-xs pl-9 pr-3 py-2.5 rounded-xl outline-none focus:border-emerald-500"
                  />

                  {searchSemiText && !semiSeleccionado && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#0e1422] border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden max-h-40 overflow-y-auto">
                      {semielaboradosFiltrados.length > 0 ? (
                        semielaboradosFiltrados.map((item, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              setSemiSeleccionado(item);
                              setSearchSemiText(
                                `[${item.codigo || "S/C"}] ${item.nombre}`,
                              );
                              setErrorDuplicado(null);
                            }}
                            className="p-2.5 hover:bg-[#1e293b] flex items-center justify-between cursor-pointer border-b border-slate-800/50 last:border-0"
                          >
                            <span className="font-mono text-amber-400 font-bold text-[10px]">
                              [{item.codigo || "S/C"}]
                            </span>
                            <span className="text-slate-200 font-sans truncate max-w-[200px] sm:max-w-[240px]">
                              {item.nombre}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 text-slate-500 italic text-center text-[10px]">
                          No hay resultados en la BD.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-400 uppercase block">
                    2. CANTIDAD TOTAL
                  </label>
                  <input
                    type="number"
                    value={cantidadPedir}
                    onChange={(e) => setCantidadPedir(e.target.value)}
                    placeholder="Ej: 500"
                    className="w-full bg-[#070a12] border border-slate-700 text-white font-mono text-xs px-3 py-2.5 rounded-xl outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-400 uppercase block">
                    3. NIVEL DE URGENCIA
                  </label>
                  <select
                    value={urgenciaPedir}
                    onChange={(e) => setUrgenciaPedir(e.target.value)}
                    className="w-full bg-[#070a12] border border-slate-700 text-amber-400 font-mono font-bold text-xs px-3 py-2.5 rounded-xl outline-none cursor-pointer"
                  >
                    <option value="BAJA">🟢 BAJA (Stock)</option>
                    <option value="MEDIA">🟡 MEDIA (Regular)</option>
                    <option value="ALTA">🔴 ALTA (Urgente)</option>
                  </select>
                </div>
              </div>

              {errorDuplicado && (
                <div className="bg-rose-500/10 border border-rose-500/40 p-3 rounded-xl flex items-start gap-2.5 text-rose-300 font-mono text-[11px] animate-in fade-in">
                  <AlertCircle
                    size={18}
                    className="shrink-0 mt-0.5 text-rose-400"
                  />
                  <div>
                    <strong className="block text-white font-bold">
                      SOLICITUD REPETIDA BLOQUEADA
                    </strong>
                    Ya existe la solicitud{" "}
                    <strong className="text-amber-400">
                      {errorDuplicado.id}
                    </strong>{" "}
                    para este producto en estado{" "}
                    <strong className="text-emerald-400">
                      [{errorDuplicado.estado}]
                    </strong>
                    .
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalNuevoOpen(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white font-mono font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!!errorDuplicado || !semiSeleccionado}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed font-bold font-mono px-5 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-95"
                >
                  <Send size={14} /> Enviar Solicitud
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL RETIRO PARCIAL */}
      {modalRetiroOpen && isDeposito && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[300] flex items-center justify-center p-3 sm:p-4 font-sans animate-in fade-in">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col relative text-xs">
            <div className="bg-[#090d16] border-b border-slate-800 p-4 sm:p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                  <Truck size={18} className="text-cyan-400" />
                </div>
                <div>
                  <span className="font-mono text-xs font-bold text-amber-400">
                    [{modalRetiroOpen.id}]
                  </span>
                  <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider font-mono">
                    REGISTRAR EXTRACCIÓN
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setModalRetiroOpen(null)}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-xl cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
              <div className="bg-[#070a12] border border-slate-800 p-3.5 rounded-xl space-y-1">
                <span className="text-[10px] font-mono text-amber-400 font-bold">
                  [{modalRetiroOpen.semielaboradoCodigo}]
                </span>
                <h4 className="text-xs font-bold text-white leading-snug">
                  {modalRetiroOpen.semielaboradoNombre}
                </h4>
                <div className="flex justify-between text-[11px] font-mono text-slate-400 pt-2 border-t border-slate-800/80">
                  <span>
                    Retirado:{" "}
                    <strong className="text-white">
                      {modalRetiroOpen.cantidadRetirada} u.
                    </strong>
                  </span>
                  <span>
                    Saldo disponible:{" "}
                    <strong className="text-cyan-400">
                      {modalRetiroOpen.cantidadSolicitada -
                        modalRetiroOpen.cantidadRetirada}{" "}
                      u.
                    </strong>
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono text-slate-400 uppercase block">
                  INGRESAR CANTIDAD MANUAL A RETIRAR AHORA:
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    max={
                      modalRetiroOpen.cantidadSolicitada -
                      modalRetiroOpen.cantidadRetirada
                    }
                    value={cantidadRetiroManual}
                    onChange={(e) => setCantidadRetiroManual(e.target.value)}
                    placeholder={`Máx: ${modalRetiroOpen.cantidadSolicitada - modalRetiroOpen.cantidadRetirada}`}
                    className="flex-1 bg-[#070a12] border border-slate-700 text-white font-mono px-3 py-2.5 rounded-xl outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={() =>
                      handleRegistrarRetiro(
                        modalRetiroOpen.id,
                        cantidadRetiroManual,
                      )
                    }
                    disabled={
                      !cantidadRetiroManual ||
                      Number(cantidadRetiroManual) <= 0 ||
                      Number(cantidadRetiroManual) >
                        modalRetiroOpen.cantidadSolicitada -
                          modalRetiroOpen.cantidadRetirada
                    }
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors active:scale-95"
                  >
                    Confirmar
                  </button>
                </div>
              </div>

              <button
                onClick={() =>
                  handleRegistrarRetiro(
                    modalRetiroOpen.id,
                    modalRetiroOpen.cantidadSolicitada -
                      modalRetiroOpen.cantidadRetirada,
                  )
                }
                className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 p-3 rounded-xl font-bold transition text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
              >
                Retirar Saldo Restante (
                {modalRetiroOpen.cantidadSolicitada -
                  modalRetiroOpen.cantidadRetirada}{" "}
                u.)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AUDITORÍA */}
      {modalHistorialOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[300] flex items-center justify-center p-3 sm:p-4 font-sans animate-in fade-in">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col relative text-xs">
            <div className="bg-[#090d16] border-b border-slate-800 p-4 sm:p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <History size={18} className="text-amber-400" />
                </div>
                <div>
                  <span className="font-mono text-xs font-bold text-amber-400">
                    [{modalHistorialOpen.id}]
                  </span>
                  <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider font-mono">
                    AUDITORÍA Y TIEMPOS
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setModalHistorialOpen(null)}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-xl cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 font-mono">
              <div className="space-y-3 border-l-2 border-slate-800 pl-4 ml-2">
                <div className="relative">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-400 absolute -left-[21px] top-1" />
                  <strong className="text-white block text-xs">
                    SOLICITADO POR DEPÓSITO
                  </strong>
                  <span className="text-[10px] text-slate-400">
                    {modalHistorialOpen.solicitadoAt}
                  </span>
                </div>
                {modalHistorialOpen.atendidoAt && (
                  <div className="relative">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 absolute -left-[21px] top-1" />
                    <strong className="text-white block text-xs">
                      ATENDIDO / EN PROCESO
                    </strong>
                    <span className="text-[10px] text-slate-400">
                      {modalHistorialOpen.atendidoAt}
                    </span>
                  </div>
                )}
                {modalHistorialOpen.disponibleAt && (
                  <div className="relative">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 absolute -left-[21px] top-1" />
                    <strong className="text-white block text-xs">
                      DISPONIBLE PARA RETIRO
                    </strong>
                    <span className="text-[10px] text-slate-400">
                      {modalHistorialOpen.disponibleAt}
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-800 space-y-2">
                <span className="text-[10px] text-slate-400 uppercase block font-bold">
                  HISTORIAL DE EXTRACCIONES:
                </span>
                {modalHistorialOpen.retirosHistorial &&
                modalHistorialOpen.retirosHistorial.length > 0 ? (
                  modalHistorialOpen.retirosHistorial.map((r, i) => (
                    <div
                      key={i}
                      className="bg-[#070a12] p-2.5 rounded-xl border border-slate-800 flex justify-between items-center text-[11px]"
                    >
                      <div>
                        <span className="text-cyan-300 font-bold block">
                          +{r.cantidad} unidades
                        </span>
                        <span className="text-[9px] text-slate-500">
                          {r.usuario}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {r.fecha}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-slate-500 italic">
                    Sin retiros registrados todavía.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
