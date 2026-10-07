import { useState, useEffect, useMemo } from "react";
import {
  History,
  Truck,
  X,
  Search,
  Ban,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  ChevronDown,
  Filter,
} from "lucide-react";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "";

const getApiUrl = (path) => {
  const cleanPath = path.startsWith("/") ? path : "/" + path;
  return `${API_BASE_URL}${cleanPath}`;
};

const getNowLocal = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export default function SolicitudesInternas({ usuarioActual }) {
  const rolUpper = (usuarioActual?.rol || "ADMIN").toUpperCase();
  const isAdmin = rolUpper === "ADMIN";
  const isDeposito = rolUpper === "DEPOSITO" || isAdmin;
  const isProduccion = rolUpper === "PRODUCCION" || isAdmin;

  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [busqueda, setBusqueda] = useState("");

  // ESTADO PARA EL MENÚ DESPLEGABLE EN MOBILE
  const [isFiltroMenuOpen, setIsFiltroMenuOpen] = useState(false);

  // PAGINACIÓN (12 TARJETAS POR PÁGINA)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

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

  const [cantidadRetiroManual, setCantidadRetiroManual] = useState("");

  const fetchSolicitudes = async () => {
    try {
      const res = await fetch(getApiUrl("/api/solicitudes-internas"));
      if (res.ok) setSolicitudes((await res.json()) || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSemielaborados = async () => {
    try {
      const res = await fetch(getApiUrl("/api/semielaborados"));
      if (res.ok) {
        const data = await res.json();
        setSemielaboradosDB(
          data.semielaborados || data.productos || data || [],
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchSolicitudes();
    fetchSemielaborados();
  }, []);

  // REINICIAR PAGINACIÓN CUANDO CAMBIA EL FILTRO O BÚSQUEDA
  useEffect(() => {
    setCurrentPage(1);
  }, [filtroEstado, busqueda]);

  const solicitudesDemoradas8hs = useMemo(() => {
    const ahora = new Date().getTime();
    return solicitudes.filter((s) => {
      if (s.estado === "DISPONIBLE" && s.disponibleAt) {
        const dTime = new Date(s.disponibleAt.replace(" ", "T")).getTime();
        if (isNaN(dTime)) return false;
        return (ahora - dTime) / (1000 * 60 * 60) >= 8;
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

  const handleCrearSolicitud = async (e) => {
    e.preventDefault();
    if (
      !isDeposito ||
      bloqueadoPor8hs ||
      limiteAlcanzado ||
      !semiSeleccionado ||
      !cantidadPedir
    )
      return;

    if (
      solicitudesActivas.find(
        (s) => s.semielaboradoCodigo === semiSeleccionado.codigo,
      )
    ) {
      setErrorDuplicado(true);
      return;
    }

    const nueva = {
      id: `SOL-${Math.floor(1000 + Math.random() * 9000)}`,
      semielaboradoCodigo: semiSeleccionado.codigo || "S/C",
      semielaboradoNombre: semiSeleccionado.nombre,
      cantidadSolicitada: Number(cantidadPedir),
      urgencia: urgenciaPedir,
      estado: "SOLICITADO",
      solicitadoAt: getNowLocal(),
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
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCambiarEstado = async (id, nuevoEstado) => {
    if (nuevoEstado === "CANCELADO" && !isAdmin) return;
    if (
      (nuevoEstado === "ATENDIDO" || nuevoEstado === "DISPONIBLE") &&
      !isProduccion
    )
      return;

    const now = getNowLocal();
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
      if (res.ok) await fetchSolicitudes();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRegistrarRetiro = async (solicitudId, cantidad) => {
    if (!isDeposito) return;
    const qty = Number(cantidad);
    const sol = solicitudes.find((s) => s.id === solicitudId);
    if (!qty || !sol) return;

    const now = getNowLocal();
    const nuevaRetirada = Math.min(
      sol.cantidadRetirada + qty,
      sol.cantidadSolicitada,
    );
    const completo = nuevaRetirada >= sol.cantidadSolicitada;

    const log = {
      fecha: now,
      cantidad: qty,
      usuario: usuarioActual?.nombre || "Depósito",
    };
    const historial = [log, ...(sol.retirosHistorial || [])];

    try {
      const res = await fetch(
        getApiUrl(`/api/solicitudes-internas/${solicitudId}/retiro`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cantidadRetirada: nuevaRetirada,
            estado: completo ? "ENTREGADO" : "DISPONIBLE",
            entregadoAt: completo ? now : sol.entregadoAt,
            retirosHistorial: historial,
          }),
        },
      );
      if (res.ok) {
        await fetchSolicitudes();
        setModalRetiroOpen(null);
        setCantidadRetiroManual("");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const solicitudesFiltradas = solicitudes.filter((s) => {
    const match =
      s.id.toLowerCase().includes(busqueda.toLowerCase()) ||
      s.semielaboradoNombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      s.semielaboradoCodigo.toLowerCase().includes(busqueda.toLowerCase());
    if (!match) return false;
    if (filtroEstado === "TODOS")
      return s.estado !== "ENTREGADO" && s.estado !== "CANCELADO";
    if (filtroEstado === "AUDITORIA")
      return s.estado === "ENTREGADO" || s.estado === "CANCELADO";
    return s.estado === filtroEstado;
  });

  const totalPages = Math.ceil(solicitudesFiltradas.length / itemsPerPage) || 1;
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return solicitudesFiltradas.slice(start, start + itemsPerPage);
  }, [solicitudesFiltradas, currentPage]);

  const isArchived = (estado) =>
    estado === "ENTREGADO" || estado === "CANCELADO";

  const getUrgenciaStyle = (urgencia, isArchivedState) => {
    if (isArchivedState) return "text-zinc-600 border-zinc-800";
    if (urgencia === "ALTA")
      return "text-[#FF0055] border-[#FF0055]/30 bg-[#FF0055]/10 animate-pulse";
    if (urgencia === "MEDIA") return "text-[#FFD700] border-[#FFD700]/30";
    return "text-zinc-400 border-zinc-700";
  };

  const getEstadoStyle = (estado, isArchivedState) => {
    if (isArchivedState) {
      if (estado === "CANCELADO") return "text-rose-900 border-rose-900/50";
      return "text-zinc-600 border-zinc-800";
    }
    if (estado === "SOLICITADO") return "text-zinc-300 border-zinc-700";
    if (estado === "ATENDIDO")
      return "text-[#FF5A00] border-[#FF5A00]/30 bg-[#FF5A00]/10";
    if (estado === "DISPONIBLE")
      return "text-[#FFD700] border-[#FFD700]/30 bg-[#FFD700]/10";
    return "text-zinc-500 border-zinc-800";
  };

  // ==========================================
  // LÓGICA DE MENÚ Y ETIQUETAS DINÁMICAS
  // ==========================================
  const ESTADOS_OPCIONES = [
    "TODOS",
    "SOLICITADO",
    "ATENDIDO",
    "DISPONIBLE",
    "AUDITORIA",
  ];
  const estadoLabel = (est) => {
    if (est === "TODOS") return `ACTIVAS ${solicitudesActivas.length}/10`;
    if (est === "AUDITORIA") return "ARCHIVADAS";
    return est;
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-black font-sans text-zinc-200 overflow-hidden relative selection:bg-[#FF5A00]/30">
      {/* BANNER BLOQUEO */}
      {bloqueadoPor8hs && (
        <div className="bg-[#FF0055]/10 border-b border-[#FF0055]/30 p-2.5 px-4 md:px-6 flex items-center gap-3 text-[#FF0055] text-xs z-20 shrink-0">
          <AlertTriangle size={16} className="animate-pulse shrink-0" />
          <span className="font-medium tracking-wide">
            ATENCIÓN: TENÉS SOLICITUDES PENDIENTES HACE MÁS DE 8HS.
          </span>
        </div>
      )}

      {/* HEADER TÍTULO EN ESCRITORIO */}
      <div className="hidden md:flex border-b border-zinc-800/50 p-6 md:p-10 flex-col md:flex-row md:items-end justify-between gap-6 shrink-0 bg-[#050505] relative overflow-hidden">
        <div className="z-10">
          <h1 className="text-4xl md:text-5xl font-extrabold italic tracking-tighter text-white uppercase leading-none">
            Solicitudes <span className="text-[#FF5A00]">Internas</span>
          </h1>
          <p className="text-zinc-500 text-sm mt-2 max-w-md uppercase tracking-widest font-bold">
            Rol de visualización: <span className="text-white">{rolUpper}</span>
          </p>
        </div>

        {isDeposito && (
          <button
            onClick={() => setModalNuevoOpen(true)}
            disabled={limiteAlcanzado || bloqueadoPor8hs}
            className={`flex items-center justify-between gap-4 px-6 py-3 font-bold text-sm uppercase tracking-widest transition-all z-10 w-full md:w-auto ${
              limiteAlcanzado || bloqueadoPor8hs
                ? "bg-zinc-900 text-zinc-600 cursor-not-allowed"
                : "bg-[#FFD700] hover:bg-white text-black active:scale-95"
            }`}
          >
            NUEVA SOLICITUD
            <ChevronRight size={18} strokeWidth={3} />
          </button>
        )}
      </div>

      {/* FILTROS & BÚSQUEDA (Z-20 PARA QUE EL DROPDOWN FLOTE) */}
      <div className="px-4 py-3 md:px-8 border-b border-zinc-800/50 flex flex-col md:flex-row items-center justify-between gap-3 shrink-0 bg-black relative z-20">
        {/* BUSCADOR */}
        <div className="relative w-full md:w-80">
          <Search
            size={14}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600"
          />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar pedido..."
            className="w-full bg-transparent border border-zinc-800 focus:border-[#FF5A00] text-white pl-10 pr-4 py-2.5 text-xs transition-colors outline-none"
          />
        </div>

        {/* VERSIÓN ESCRITORIO: BOTONES HORIZONTALES */}
        <div className="hidden md:flex gap-2 w-auto">
          {ESTADOS_OPCIONES.map((est) => (
            <button
              key={est}
              onClick={() => setFiltroEstado(est)}
              className={`px-4 py-2 text-[11px] font-bold tracking-widest uppercase transition-all whitespace-nowrap border-b-2 ${
                filtroEstado === est
                  ? "border-[#FF5A00] text-[#FF5A00]"
                  : "border-transparent text-zinc-500 hover:text-white"
              }`}
            >
              {estadoLabel(est)}
            </button>
          ))}
        </div>

        {/* VERSIÓN MOBILE: MENÚ DESPLEGABLE */}
        <div className="md:hidden w-full relative">
          <button
            onClick={() => setIsFiltroMenuOpen(!isFiltroMenuOpen)}
            className="w-full flex items-center justify-between bg-[#050505] border border-zinc-800 hover:border-zinc-700 px-4 py-3 text-xs font-bold tracking-widest uppercase text-white transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <Filter size={14} className="text-[#FF5A00]" />
              <span className="text-zinc-500">ESTADO:</span>
              <span className="text-[#FF5A00]">
                {estadoLabel(filtroEstado)}
              </span>
            </div>
            <ChevronDown
              size={16}
              className={`text-zinc-500 transition-transform duration-300 ${isFiltroMenuOpen ? "rotate-180" : ""}`}
            />
          </button>

          {/* Menú Flotante */}
          {isFiltroMenuOpen && (
            <div className="absolute top-full left-0 w-full mt-1.5 bg-[#050505] border border-zinc-800 shadow-[0_15px_40px_rgba(0,0,0,0.9)] z-50 flex flex-col animate-in slide-in-from-top-2">
              {ESTADOS_OPCIONES.map((est) => (
                <button
                  key={est}
                  onClick={() => {
                    setFiltroEstado(est);
                    setIsFiltroMenuOpen(false);
                  }}
                  className={`text-left px-4 py-3.5 text-xs font-bold tracking-widest uppercase transition-colors border-l-2 ${
                    filtroEstado === est
                      ? "border-[#FF5A00] text-[#FF5A00] bg-[#FF5A00]/5"
                      : "border-transparent text-zinc-500 hover:text-white hover:bg-zinc-900/50"
                  }`}
                >
                  {estadoLabel(est)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* BOTÓN NUEVA SOLICITUD MOBILE */}
        {isDeposito && (
          <button
            onClick={() => setModalNuevoOpen(true)}
            disabled={limiteAlcanzado || bloqueadoPor8hs}
            className={`md:hidden w-full flex items-center justify-center gap-2 px-4 py-3 mt-1 font-bold text-xs uppercase tracking-widest transition-all ${
              limiteAlcanzado || bloqueadoPor8hs
                ? "bg-zinc-900 text-zinc-600 cursor-not-allowed"
                : "bg-[#FFD700] hover:bg-white text-black active:scale-95"
            }`}
          >
            NUEVA SOLICITUD
          </button>
        )}
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 flex flex-col justify-between overflow-hidden p-3 md:p-6 bg-black min-h-0 relative z-10">
        {loading ? (
          <div className="flex justify-center items-center flex-1 text-[#FF5A00]">
            <RefreshCw className="animate-spin" size={28} />
          </div>
        ) : currentItems.length === 0 ? (
          <div className="flex justify-center items-center flex-1 text-zinc-600">
            <p className="uppercase tracking-widest text-xs font-bold">
              No hay solicitudes registradas en esta vista.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start content-start flex-1 overflow-y-auto pr-1 custom-scrollbar">
            {currentItems.map((s) => {
              const archived = isArchived(s.estado);
              const styleEst = getEstadoStyle(s.estado, archived);
              const pct = Math.round(
                (s.cantidadRetirada / s.cantidadSolicitada) * 100,
              );

              return (
                <div
                  key={s.id}
                  className={`border transition-colors duration-200 p-5 flex flex-col justify-between gap-3.5 group ${
                    archived
                      ? "border-zinc-900 bg-[#030303] hover:border-zinc-800 opacity-80"
                      : "border-zinc-800/80 bg-[#050505] hover:border-[#FF5A00]/50"
                  }`}
                >
                  <div className="flex justify-between items-start border-b border-zinc-800/50 pb-2.5">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`font-extrabold tracking-wider text-sm md:text-base shrink-0 ${
                            archived ? "text-zinc-500" : "text-white"
                          }`}
                        >
                          {s.id}
                        </span>
                        <span
                          className={`text-[8px] px-1.5 py-0.2 border uppercase font-bold tracking-wider shrink-0 ${getUrgenciaStyle(
                            s.urgencia,
                            archived,
                          )}`}
                        >
                          {s.urgencia}
                        </span>
                      </div>

                      <div className="text-zinc-600 font-mono text-[9px] leading-tight">
                        <span>
                          {s.solicitadoAt ? s.solicitadoAt.slice(0, 10) : ""}
                        </span>
                        <span className="ml-1">
                          {s.solicitadoAt
                            ? s.solicitadoAt.slice(11, 16) + " HS"
                            : ""}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[8px] px-2 py-0.5 uppercase font-bold tracking-widest border shrink-0 ${styleEst}`}
                    >
                      {s.estado}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 pt-1">
                    <span
                      className={`px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-widest shrink-0 ${
                        archived
                          ? "text-zinc-600 bg-zinc-900/50 border border-zinc-800"
                          : "text-[#FF5A00] bg-[#FF5A00]/10 border border-[#FF5A00]/20"
                      }`}
                    >
                      {s.semielaboradoCodigo}
                    </span>
                    <h3
                      className={`text-sm font-bold leading-none truncate flex-1 ${
                        archived ? "text-zinc-500" : "text-zinc-200"
                      }`}
                    >
                      {s.semielaboradoNombre}
                    </h3>
                  </div>

                  <div className="mt-1">
                    <div className="flex justify-between text-[9px] text-zinc-500 mb-1.5 uppercase tracking-wider font-bold">
                      <span>
                        Retirado:{" "}
                        <strong
                          className={
                            archived ? "text-zinc-500" : "text-zinc-300"
                          }
                        >
                          {s.cantidadRetirada}
                        </strong>
                      </span>
                      <span>
                        Total:{" "}
                        <strong
                          className={archived ? "text-zinc-500" : "text-white"}
                        >
                          {s.cantidadSolicitada}
                        </strong>
                      </span>
                    </div>
                    <div className="h-1 w-full bg-zinc-900 overflow-hidden">
                      <div
                        className={`h-full ${
                          archived
                            ? "bg-zinc-700"
                            : "bg-gradient-to-r from-[#FF5A00] to-[#FFD700]"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-3 mt-1 border-t border-zinc-800/50 flex justify-between items-center">
                    <button
                      onClick={() => setModalHistorialOpen(s)}
                      className="text-zinc-600 hover:text-zinc-300 text-[9px] uppercase tracking-widest font-bold flex items-center gap-1 transition-colors"
                    >
                      <History size={11} /> Auditoría
                    </button>

                    <div className="flex gap-1.5">
                      {s.estado === "SOLICITADO" && isProduccion && (
                        <button
                          onClick={() => handleCambiarEstado(s.id, "ATENDIDO")}
                          className="text-[9px] uppercase tracking-widest font-bold text-[#FF5A00] border border-[#FF5A00]/30 hover:bg-[#FF5A00]/10 px-2.5 py-1 transition-colors"
                        >
                          Atender
                        </button>
                      )}
                      {s.estado === "ATENDIDO" && isProduccion && (
                        <button
                          onClick={() =>
                            handleCambiarEstado(s.id, "DISPONIBLE")
                          }
                          className="text-[9px] uppercase tracking-widest font-bold text-[#FFD700] border border-[#FFD700]/30 hover:bg-[#FFD700]/10 px-2.5 py-1 transition-colors"
                        >
                          Disponible
                        </button>
                      )}
                      {s.estado === "DISPONIBLE" && isDeposito && (
                        <button
                          onClick={() => {
                            setModalRetiroOpen(s);
                            setCantidadRetiroManual("");
                          }}
                          className="text-[9px] uppercase tracking-widest font-bold text-black bg-[#FFD700] hover:bg-white px-2.5 py-1 transition-colors"
                        >
                          Extraer
                        </button>
                      )}
                      {s.estado !== "ENTREGADO" &&
                        s.estado !== "CANCELADO" &&
                        isAdmin && (
                          <button
                            onClick={() =>
                              handleCambiarEstado(s.id, "CANCELADO")
                            }
                            className="text-zinc-700 hover:text-[#FF0055] p-1 transition-colors"
                          >
                            <Ban size={13} />
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* PIE DE PAGINACIÓN */}
        {solicitudesFiltradas.length > 0 && (
          <div className="mt-4 pt-4 border-t border-zinc-800/60 flex items-center justify-between font-mono text-xs text-zinc-500 shrink-0">
            <span className="uppercase text-[10px] font-bold tracking-widest text-zinc-400">
              Página <strong className="text-white">{currentPage}</strong> de{" "}
              <strong className="text-white">{totalPages}</strong> (
              {solicitudesFiltradas.length} registros)
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 bg-[#050505] text-zinc-300 hover:border-[#FF5A00] hover:text-[#FF5A00] disabled:opacity-20 disabled:hover:border-zinc-800 disabled:hover:text-zinc-300 transition-all cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>

              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 bg-[#050505] text-zinc-300 hover:border-[#FF5A00] hover:text-[#FF5A00] disabled:opacity-20 disabled:hover:border-zinc-800 disabled:hover:text-zinc-300 transition-all cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =========================================
          MODALES
      ========================================= */}

      {/* MODAL NUEVA SOLICITUD */}
      {modalNuevoOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col relative shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-[#020202]">
              <h3 className="text-xl md:text-2xl font-extrabold italic uppercase tracking-tighter text-white">
                Nueva <span className="text-[#FF5A00]">Solicitud</span>
              </h3>
              <button
                onClick={() => setModalNuevoOpen(false)}
                className="text-zinc-500 hover:text-[#FF5A00] transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form
              onSubmit={handleCrearSolicitud}
              className="p-6 overflow-y-auto flex flex-col gap-6"
            >
              <div>
                <label className="block text-xs uppercase tracking-widest text-zinc-500 mb-2 font-bold">
                  1. Material a procesar
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchSemiText}
                    onChange={(e) => {
                      setSearchSemiText(e.target.value);
                      setSemiSeleccionado(null);
                    }}
                    className="w-full bg-black border border-zinc-800 text-white p-4 text-sm focus:border-[#FF5A00] outline-none transition-colors"
                    placeholder="Buscar código o nombre..."
                  />
                  {searchSemiText && !semiSeleccionado && (
                    <div className="absolute top-full left-0 w-full bg-[#0a0a0a] border border-zinc-800 mt-1 max-h-48 overflow-y-auto z-50 shadow-xl">
                      {semielaboradosFiltrados.map((item, i) => (
                        <div
                          key={i}
                          onClick={() => {
                            setSemiSeleccionado(item);
                            setSearchSemiText(item.nombre);
                          }}
                          className="p-4 border-b border-zinc-800 hover:bg-zinc-900 cursor-pointer flex items-center gap-3 transition-colors"
                        >
                          <span className="bg-[#FF5A00]/10 border border-[#FF5A00]/30 text-[#FF5A00] px-2 py-0.5 text-[10px] font-mono font-bold shrink-0">
                            {item.codigo}
                          </span>
                          <span className="text-white text-sm truncate">
                            {item.nombre}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs uppercase tracking-widest text-zinc-500 mb-2 font-bold">
                    2. Unidades
                  </label>
                  <input
                    type="number"
                    value={cantidadPedir}
                    onChange={(e) => setCantidadPedir(e.target.value)}
                    className="w-full bg-black border border-zinc-800 text-white p-4 focus:border-[#FF5A00] outline-none font-mono transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-zinc-500 mb-2 font-bold">
                    3. Prioridad
                  </label>
                  <select
                    value={urgenciaPedir}
                    onChange={(e) => setUrgenciaPedir(e.target.value)}
                    className="w-full bg-black border border-zinc-800 text-white p-4 focus:border-[#FF5A00] outline-none appearance-none font-bold tracking-wider transition-colors cursor-pointer"
                  >
                    <option value="BAJA">BAJA</option>
                    <option value="MEDIA">MEDIA</option>
                    <option value="ALTA">ALTA</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={!semiSeleccionado || !cantidadPedir}
                className="mt-4 w-full bg-[#FFD700] hover:bg-white text-black font-extrabold italic uppercase tracking-tighter text-xl p-4 transition-all disabled:opacity-30 disabled:hover:bg-[#FFD700] flex justify-center items-center gap-2"
              >
                Confirmar <ChevronRight size={20} strokeWidth={3} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL RETIRO PARCIAL */}
      {modalRetiroOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-md flex flex-col relative shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-[#020202]">
              <h3 className="text-xl font-extrabold italic uppercase tracking-tighter text-[#FFD700]">
                Extraer Material
              </h3>
              <button
                onClick={() => setModalRetiroOpen(null)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <span className="bg-[#FF5A00]/10 border border-[#FF5A00]/20 text-[#FF5A00] px-1.5 py-0.5 text-[10px] font-mono font-bold tracking-widest mb-2 inline-block">
                  {modalRetiroOpen.semielaboradoCodigo}
                </span>
                <p className="text-zinc-300 text-sm mb-2">
                  {modalRetiroOpen.semielaboradoNombre}
                </p>
                <p className="text-3xl font-mono font-bold text-white">
                  {modalRetiroOpen.cantidadSolicitada -
                    modalRetiroOpen.cantidadRetirada}{" "}
                  <span className="text-sm font-sans font-normal text-zinc-600">
                    u. disp.
                  </span>
                </p>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-widest text-zinc-500 mb-2 font-bold">
                  Retiro Parcial
                </label>
                <div className="flex">
                  <input
                    type="number"
                    value={cantidadRetiroManual}
                    onChange={(e) => setCantidadRetiroManual(e.target.value)}
                    className="w-full bg-black border border-zinc-800 border-r-0 text-white p-4 focus:border-[#FFD700] outline-none font-mono transition-colors"
                    placeholder="Ingresar cant..."
                  />
                  <button
                    onClick={() =>
                      handleRegistrarRetiro(
                        modalRetiroOpen.id,
                        cantidadRetiroManual,
                      )
                    }
                    className="bg-zinc-800 text-white px-6 font-bold uppercase text-xs tracking-wider hover:bg-[#FFD700] hover:text-black transition-colors"
                  >
                    OK
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
                className="w-full bg-transparent border border-[#FFD700] text-[#FFD700] hover:bg-[#FFD700] hover:text-black font-bold uppercase tracking-widest text-sm p-4 transition-colors mt-2"
              >
                Extraer Todo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL HISTORIAL */}
      {modalHistorialOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex flex-col items-center justify-center p-4">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-md max-h-[85vh] flex flex-col relative shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-[#020202] shrink-0">
              <h3 className="text-xl font-extrabold italic uppercase tracking-tighter text-white">
                Auditoría
              </h3>
              <button
                onClick={() => setModalHistorialOpen(null)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="space-y-5 border-l border-zinc-800 pl-5 ml-2">
                <div className="relative">
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-600 absolute -left-[26px] top-1" />
                  <p className="text-[10px] font-bold uppercase text-white tracking-wider">
                    Solicitado
                  </p>
                  <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                    {modalHistorialOpen.solicitadoAt}
                  </p>
                </div>
                {modalHistorialOpen.atendidoAt && (
                  <div className="relative">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FF5A00] absolute -left-[26px] top-1" />
                    <p className="text-[10px] font-bold uppercase text-[#FF5A00] tracking-wider">
                      En Proceso
                    </p>
                    <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                      {modalHistorialOpen.atendidoAt}
                    </p>
                  </div>
                )}
                {modalHistorialOpen.disponibleAt && (
                  <div className="relative">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FFD700] absolute -left-[26px] top-1" />
                    <p className="text-[10px] font-bold uppercase text-[#FFD700] tracking-wider">
                      Disponible
                    </p>
                    <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                      {modalHistorialOpen.disponibleAt}
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-6 border-t border-zinc-800/50">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-4 font-bold">
                  Movimientos de Extracción
                </p>
                {modalHistorialOpen.retirosHistorial?.length > 0 ? (
                  <div className="space-y-2">
                    {modalHistorialOpen.retirosHistorial.map((r, i) => (
                      <div
                        key={i}
                        className="flex justify-between items-center bg-black p-3 border border-zinc-800 hover:border-zinc-700 transition-colors"
                      >
                        <div>
                          <p className="text-white text-sm font-bold font-mono">
                            +{r.cantidad}
                          </p>
                          <p className="text-zinc-500 text-[10px] uppercase tracking-wider mt-0.5">
                            {r.usuario}
                          </p>
                        </div>
                        <p className="text-zinc-500 text-xs font-mono">
                          {r.fecha.slice(11, 16)}hs
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-600 italic">
                    No hay registros de retiro.
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
