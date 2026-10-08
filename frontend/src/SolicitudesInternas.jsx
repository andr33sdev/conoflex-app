import { useState, useEffect, useMemo, useRef } from "react";
import {
  History,
  X,
  Search,
  Ban,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  ChevronDown,
  Filter,
  LayoutGrid,
  Table as TableIcon,
  Plus,
  CheckCircle2,
  Edit2,
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

  // MODO DE VISTA: "TARJETAS" | "TABLA"
  const [vistaMode, setVistaMode] = useState("TABLA");

  // ESTADOS DE MENÚS Y DROPDOWNS
  const [isFiltroMenuOpen, setIsFiltroMenuOpen] = useState(false);
  const [activeActionMenuId, setActiveActionMenuId] = useState(null);

  // AUTO-AJUSTE DINÁMICO DE FILAS PARA TABLA
  const tableContainerRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [semielaboradosDB, setSemielaboradosDB] = useState([]);

  // MODALES
  const [modalNuevoOpen, setModalNuevoOpen] = useState(false);
  const [modalEditarOpen, setModalEditarOpen] = useState(null);
  const [modalRetiroOpen, setModalRetiroOpen] = useState(null);
  const [modalHistorialOpen, setModalHistorialOpen] = useState(null);

  // FORMULARIO CREACIÓN
  const [semiSeleccionado, setSemiSeleccionado] = useState(null);
  const [cantidadPedir, setCantidadPedir] = useState("");
  const [urgenciaPedir, setUrgenciaPedir] = useState("MEDIA");
  const [motivoUso, setMotivoUso] = useState("");
  const [errorDuplicado, setErrorDuplicado] = useState(null);
  const [searchSemiText, setSearchSemiText] = useState("");

  // FORMULARIO EDICIÓN
  const [editCantidad, setEditCantidad] = useState("");
  const [editUrgencia, setEditUrgencia] = useState("MEDIA");
  const [editMotivo, setEditMotivo] = useState("");

  const [cantidadRetiroManual, setCantidadRetiroManual] = useState("");

  // CERRAR MENÚS AL CLIQUEAR AFUERA
  useEffect(() => {
    const handleClickOutside = () => setActiveActionMenuId(null);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // CÁLCULO DINÁMICO DE FILAS EN TABLA
  useEffect(() => {
    if (vistaMode !== "TABLA") {
      setItemsPerPage(12);
      return;
    }

    const updatePageSize = () => {
      if (!tableContainerRef.current) return;
      const containerHeight = tableContainerRef.current.clientHeight;
      const headerHeight = 48;
      const rowHeight = 48;
      const availableHeight = containerHeight - headerHeight;
      const calculatedCount = Math.floor(availableHeight / rowHeight);

      if (calculatedCount > 0) {
        setItemsPerPage(calculatedCount);
      }
    };

    updatePageSize();
    const observer = new ResizeObserver(updatePageSize);
    if (tableContainerRef.current) observer.observe(tableContainerRef.current);
    return () => observer.disconnect();
  }, [vistaMode]);

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

  useEffect(() => {
    setCurrentPage(1);
  }, [filtroEstado, busqueda, vistaMode]);

  // ID FORMATEADO "SOL-" + ID DE BASE DE DATOS
  const getSolId = (s) => {
    if (!s) return "";
    const rawId = String(s.id);
    return rawId.startsWith("SOL-") ? rawId : `SOL-${rawId}`;
  };

  // OBTENER MOTIVO DESDE CUALQUIER FORMATO DE ATRIBUTO DE LA BD
  const getMotivo = (s) => {
    return s?.motivoUso || s?.motivo_uso || s?.motivo || "--";
  };

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
      !cantidadPedir ||
      !motivoUso.trim()
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

    const motivoFormateado = motivoUso.trim().slice(0, 20).toUpperCase();

    const nueva = {
      semielaboradoCodigo: semiSeleccionado.codigo || "S/C",
      semielaborado_codigo: semiSeleccionado.codigo || "S/C",
      semielaboradoNombre: semiSeleccionado.nombre,
      semielaborado_nombre: semiSeleccionado.nombre,
      cantidadSolicitada: Number(cantidadPedir),
      cantidad_solicitada: Number(cantidadPedir),
      urgencia: urgenciaPedir,
      motivoUso: motivoFormateado,
      motivo_uso: motivoFormateado,
      estado: "SOLICITADO",
      solicitadoAt: getNowLocal(),
      solicitado_at: getNowLocal(),
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
        setMotivoUso("");
        setSearchSemiText("");
        setErrorDuplicado(null);
      } else {
        const errData = await res.json();
        alert(
          "Error al crear la solicitud: " + (errData.error || "Faltan datos."),
        );
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión al guardar la solicitud.");
    }
  };

  const handleOpenEditar = (s) => {
    setModalEditarOpen(s);
    setEditCantidad(s.cantidadSolicitada);
    setEditUrgencia(s.urgencia || "MEDIA");
    setEditMotivo(getMotivo(s));
  };

  const handleGuardarEdicion = async (e) => {
    e.preventDefault();
    if (!modalEditarOpen) return;

    const motivoEditado = editMotivo.trim().slice(0, 20).toUpperCase();

    try {
      const res = await fetch(
        getApiUrl(`/api/solicitudes-internas/${modalEditarOpen.id}`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cantidadSolicitada: Number(editCantidad),
            cantidad_solicitada: Number(editCantidad),
            urgencia: editUrgencia,
            motivoUso: motivoEditado,
            motivo_uso: motivoEditado,
          }),
        },
      );
      if (res.ok) {
        await fetchSolicitudes();
        setModalEditarOpen(null);
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
    const solId = getSolId(s);
    const motivoText = getMotivo(s);
    const match =
      solId.toLowerCase().includes(busqueda.toLowerCase()) ||
      s.semielaboradoNombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      s.semielaboradoCodigo.toLowerCase().includes(busqueda.toLowerCase()) ||
      motivoText.toLowerCase().includes(busqueda.toLowerCase());
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
  }, [solicitudesFiltradas, currentPage, itemsPerPage]);

  const isArchived = (estado) =>
    estado === "ENTREGADO" || estado === "CANCELADO";

  const getUrgenciaStyle = (urgencia, isArchivedState) => {
    if (isArchivedState) return "text-zinc-600 border-zinc-800 bg-black";
    if (urgencia === "ALTA")
      return "text-[#FF0055] border-[#FF0055]/30 bg-[#FF0055]/10";
    if (urgencia === "MEDIA")
      return "text-[#FFD700] border-[#FFD700]/30 bg-[#FFD700]/10";
    return "text-zinc-400 border-zinc-800 bg-black";
  };

  const getEstadoStyle = (estado, isArchivedState) => {
    if (isArchivedState) {
      if (estado === "CANCELADO")
        return "text-rose-600 border-rose-950 bg-rose-950/20";
      return "text-zinc-600 border-zinc-800 bg-black";
    }
    if (estado === "SOLICITADO")
      return "text-white border-zinc-700 bg-zinc-900";
    if (estado === "ATENDIDO")
      return "text-[#FF5A00] border-[#FF5A00]/30 bg-[#FF5A00]/10";
    if (estado === "DISPONIBLE")
      return "text-[#FFD700] border-[#FFD700]/30 bg-[#FFD700]/10";
    return "text-zinc-500 border-zinc-800 bg-black";
  };

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
      {/* BANNER BLOQUEO DE 8HS */}
      {bloqueadoPor8hs && (
        <div className="bg-[#FF0055]/10 border-b border-[#FF0055]/30 p-2.5 px-4 md:px-6 flex items-center gap-3 text-[#FF0055] text-xs z-20 shrink-0    ">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="font-bold tracking-wide uppercase">
            ATENCIÓN: TENÉS SOLICITUDES PENDIENTES HACE MÁS DE 8HS.
          </span>
        </div>
      )}

      {/* HEADER HERO */}
      <div className="border-b border-zinc-800/50 p-6 md:p-10 flex flex-col md:flex-row md:items-end justify-between gap-6 shrink-0 bg-[#050505] relative overflow-hidden">
        <div className="z-10">
          <h1 className="text-4xl md:text-5xl font-extrabold italic tracking-tighter text-white uppercase leading-none">
            Solicitudes <span className="text-[#FF5A00]">Internas</span>
          </h1>
          <p className="text-zinc-500 text-sm mt-2 max-w-md uppercase tracking-widest font-bold">
            ROL DE VISUALIZACIÓN: <span className="text-white">{rolUpper}</span>
          </p>
        </div>

        {isDeposito && (
          <button
            onClick={() => setModalNuevoOpen(true)}
            disabled={limiteAlcanzado || bloqueadoPor8hs}
            className={`flex items-center justify-between gap-4 px-6 py-3 font-bold text-xs uppercase tracking-widest transition-all z-10 w-full md:w-auto ${
              limiteAlcanzado || bloqueadoPor8hs
                ? "bg-zinc-900 text-zinc-600 cursor-not-allowed border border-zinc-800"
                : "bg-[#FFD700] hover:bg-white text-black active:scale-95 cursor-pointer"
            }`}
          >
            <span>NUEVA SOLICITUD</span>
            <ChevronRight size={18} strokeWidth={3} />
          </button>
        )}
      </div>

      {/* BARRA DE HERRAMIENTAS */}
      <div className="px-4 py-3 md:px-8 border-b border-zinc-800/50 flex flex-col md:flex-row items-center justify-between gap-3 shrink-0 bg-black relative z-20">
        <div className="relative w-full md:w-80">
          <Search
            size={14}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600"
          />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por ID, artículo o destino..."
            className="w-full bg-transparent border border-zinc-800 focus:border-[#FF5A00] text-white pl-10 pr-4 py-2.5 text-xs transition-colors outline-none    "
          />
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
          <div className="hidden md:flex gap-1 border border-zinc-800 bg-[#050505]">
            {ESTADOS_OPCIONES.map((est) => (
              <button
                key={est}
                onClick={() => setFiltroEstado(est)}
                className={`px-4 py-2 text-[10px]     font-bold tracking-widest uppercase transition-all whitespace-nowrap border-r border-zinc-800 last:border-r-0 cursor-pointer ${
                  filtroEstado === est
                    ? "bg-[#FF5A00] text-black"
                    : "text-zinc-500 hover:text-white hover:bg-zinc-900"
                }`}
              >
                {estadoLabel(est)}
              </button>
            ))}
          </div>

          <div className="md:hidden w-full relative">
            <button
              onClick={() => setIsFiltroMenuOpen(!isFiltroMenuOpen)}
              className="w-full flex items-center justify-between bg-[#050505] border border-zinc-800 px-4 py-2.5 text-xs font-bold tracking-widest uppercase text-white transition-colors"
            >
              <div className="flex items-center gap-2.5    ">
                <Filter size={14} className="text-[#FF5A00]" />
                <span className="text-zinc-500">ESTADO:</span>
                <span className="text-[#FF5A00]">
                  {estadoLabel(filtroEstado)}
                </span>
              </div>
              <ChevronDown
                size={16}
                className={`text-zinc-500 transition-transform ${isFiltroMenuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isFiltroMenuOpen && (
              <div className="absolute top-full left-0 w-full mt-1 bg-[#050505] border border-zinc-800 shadow-2xl z-50 flex flex-col    ">
                {ESTADOS_OPCIONES.map((est) => (
                  <button
                    key={est}
                    onClick={() => {
                      setFiltroEstado(est);
                      setIsFiltroMenuOpen(false);
                    }}
                    className={`text-left px-4 py-3 text-xs font-bold tracking-widest uppercase border-l-2 ${
                      filtroEstado === est
                        ? "border-[#FF5A00] text-[#FF5A00] bg-[#FF5A00]/10"
                        : "border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900"
                    }`}
                  >
                    {estadoLabel(est)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center border border-zinc-800 bg-[#050505] shrink-0    ">
            <button
              onClick={() => setVistaMode("TARJETAS")}
              title="Vista en Tarjetas"
              className={`p-2.5 transition-colors cursor-pointer flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${
                vistaMode === "TARJETAS"
                  ? "bg-[#FFD700] text-black"
                  : "text-zinc-500 hover:text-white"
              }`}
            >
              <LayoutGrid size={15} />
              <span className="hidden sm:inline">TARJETAS</span>
            </button>
            <button
              onClick={() => setVistaMode("TABLA")}
              title="Vista en Tabla Industrial"
              className={`p-2.5 transition-colors cursor-pointer flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest border-l border-zinc-800 ${
                vistaMode === "TABLA"
                  ? "bg-[#FFD700] text-black"
                  : "text-zinc-500 hover:text-white"
              }`}
            >
              <TableIcon size={15} />
              <span className="hidden sm:inline">TABLA</span>
            </button>
          </div>
        </div>
      </div>

      {/* ÁREA DE CONTENIDO */}
      <div className="flex-1 flex flex-col justify-between overflow-hidden p-4 md:p-8 bg-black min-h-0 relative z-10">
        {loading ? (
          <div className="flex justify-center items-center flex-1 text-[#FF5A00]">
            <RefreshCw className="animate-spin" size={28} />
          </div>
        ) : currentItems.length === 0 ? (
          <div className="flex justify-center items-center flex-1 text-zinc-600    ">
            <p className="uppercase tracking-widest text-xs font-bold">
              No hay solicitudes registradas en esta vista.
            </p>
          </div>
        ) : vistaMode === "TARJETAS" ? (
          /* =========================================================
             VISTA 1: MODO TARJETAS
             ========================================================= */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start content-start flex-1 overflow-y-auto pr-1 custom-scrollbar">
            {currentItems.map((s) => {
              const archived = isArchived(s.estado);
              const styleEst = getEstadoStyle(s.estado, archived);
              const pct = Math.round(
                (s.cantidadRetirada / s.cantidadSolicitada) * 100,
              );
              const solIdStr = getSolId(s);

              return (
                <div
                  key={s.id}
                  className={`border transition-colors duration-200 p-5 flex flex-col justify-between gap-3.5 relative ${
                    archived
                      ? "border-zinc-900 bg-[#030303] opacity-80"
                      : "border-zinc-800 bg-[#050505] hover:border-[#FF5A00]/50"
                  } ${activeActionMenuId === s.id ? "z-50" : "z-10"}`}
                >
                  <div className="flex justify-between items-start border-b border-zinc-800/80 pb-2.5    ">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`font-extrabold tracking-wider text-sm ${
                            archived ? "text-zinc-500" : "text-white"
                          }`}
                        >
                          {solIdStr}
                        </span>
                        <span
                          className={`text-[8px] px-1.5 py-0.5 border uppercase font-bold tracking-wider ${getUrgenciaStyle(
                            s.urgencia,
                            archived,
                          )}`}
                        >
                          {s.urgencia}
                        </span>
                      </div>

                      <div className="text-zinc-600 text-[9px] leading-tight">
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

                  {/* CÓDIGO Y NOMBRE */}
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`px-1.5 py-0.5 text-[9px]     font-bold tracking-widest shrink-0 ${
                        archived
                          ? "text-zinc-600 bg-zinc-900 border border-zinc-800"
                          : "text-[#FF5A00] bg-[#FF5A00]/10 border border-[#FF5A00]/20"
                      }`}
                    >
                      {s.semielaboradoCodigo}
                    </span>
                    <h3
                      className={`text-sm font-bold leading-none truncate flex-1 ${
                        archived ? "text-zinc-500" : "text-white"
                      }`}
                    >
                      {s.semielaboradoNombre}
                    </h3>
                  </div>

                  {/* BARRAS Y CANTIDADES */}
                  <div>
                    <div className="flex justify-between text-[9px] text-zinc-500     mb-1.5 uppercase tracking-wider font-bold">
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
                    <div className="h-1.5 w-full bg-zinc-900 overflow-hidden">
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

                  {/* BOTÓN DESPLEGABLE ACCIONES EN TARJETA */}
                  <div className="pt-3 border-t border-zinc-800/80 flex justify-end items-center     relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveActionMenuId(
                          activeActionMenuId === s.id ? null : s.id,
                        );
                      }}
                      className={`px-3 py-1.5 border     text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all cursor-pointer ${
                        activeActionMenuId === s.id
                          ? "bg-[#050505] border-[#FF5A00] text-[#FF5A00]"
                          : "bg-[#050505] border-zinc-800 text-zinc-400 hover:border-[#FF5A00] hover:text-white"
                      }`}
                    >
                      <span>OPCIONES</span>
                      <ChevronDown
                        size={12}
                        className={`transition-transform duration-200 ${
                          activeActionMenuId === s.id
                            ? "rotate-180 text-[#FF5A00]"
                            : ""
                        }`}
                      />
                    </button>

                    {/* POPUP DE OPCIONES SIEMPRE HACIA ABAJO Y POR ENCIMA */}
                    {activeActionMenuId === s.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-full right-0 mt-1.5 w-48 bg-[#050505] border border-zinc-700 shadow-[0_20px_50px_rgba(0,0,0,0.95)] z-[100] flex flex-col     text-[10px] animate-in fade-in slide-in-from-top-2 duration-150 origin-top-right"
                      >
                        <button
                          onClick={() => {
                            setActiveActionMenuId(null);
                            setModalHistorialOpen(s);
                          }}
                          className="px-4 py-3 text-left font-bold uppercase tracking-widest text-zinc-400 hover:text-white hover:bg-[#FF5A00]/10 transition-colors border-b border-zinc-900 cursor-pointer flex items-center gap-2"
                        >
                          <History size={13} className="text-[#FFD700]" />
                          AUDITORÍA
                        </button>

                        {isDeposito && !archived && (
                          <button
                            onClick={() => {
                              setActiveActionMenuId(null);
                              handleOpenEditar(s);
                            }}
                            className="px-4 py-3 text-left font-bold uppercase tracking-widest text-zinc-400 hover:text-white hover:bg-[#FF5A00]/10 transition-colors border-b border-zinc-900 cursor-pointer flex items-center gap-2"
                          >
                            <Edit2 size={13} className="text-[#FF5A00]" />
                            EDITAR SOLICITUD
                          </button>
                        )}

                        {s.estado === "SOLICITADO" && isProduccion && (
                          <button
                            onClick={() => {
                              setActiveActionMenuId(null);
                              handleCambiarEstado(s.id, "ATENDIDO");
                            }}
                            className="px-4 py-3 text-left font-bold uppercase tracking-widest text-[#FF5A00] hover:text-white hover:bg-[#FF5A00]/15 transition-colors border-b border-zinc-900 cursor-pointer flex items-center gap-2"
                          >
                            <CheckCircle2 size={13} />
                            ATENDER
                          </button>
                        )}

                        {s.estado === "ATENDIDO" && isProduccion && (
                          <button
                            onClick={() => {
                              setActiveActionMenuId(null);
                              handleCambiarEstado(s.id, "DISPONIBLE");
                            }}
                            className="px-4 py-3 text-left font-bold uppercase tracking-widest text-[#FFD700] hover:text-white hover:bg-[#FFD700]/15 transition-colors border-b border-zinc-900 cursor-pointer flex items-center gap-2"
                          >
                            <CheckCircle2 size={13} />
                            DISPONIBLE
                          </button>
                        )}

                        {s.estado === "DISPONIBLE" && isDeposito && (
                          <button
                            onClick={() => {
                              setActiveActionMenuId(null);
                              setModalRetiroOpen(s);
                              setCantidadRetiroManual("");
                            }}
                            className="px-4 py-3 text-left font-bold uppercase tracking-widest text-black bg-[#FFD700] hover:bg-white transition-colors border-b border-zinc-900 cursor-pointer flex items-center gap-2"
                          >
                            <Plus size={13} />
                            EXTRAER MATERIAL
                          </button>
                        )}

                        {!archived && isAdmin && (
                          <button
                            onClick={() => {
                              setActiveActionMenuId(null);
                              handleCambiarEstado(s.id, "CANCELADO");
                            }}
                            className="px-4 py-3 text-left font-bold uppercase tracking-widest text-rose-500 hover:text-white hover:bg-rose-950/40 transition-colors cursor-pointer flex items-center gap-2"
                          >
                            <Ban size={13} />
                            CANCELAR
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* =========================================================
             VISTA 2: MODO TABLA INDUSTRIAL CON VISIBILIDAD TOTAL
             ========================================================= */
          <div
            ref={tableContainerRef}
            className="flex-1 min-h-0 w-full flex flex-col justify-start overflow-visible"
          >
            <div className="w-full border border-zinc-800/90 bg-[#030303] flex flex-col overflow-visible shadow-2xl h-fit">
              {/* CABECERA TABLA (48px) */}
              <div className="grid grid-cols-[120px_140px_1fr_200px_130px_100px_110px_130px] h-12 bg-[#080808] border-b border-zinc-800/90 items-center text-zinc-500     text-[9px] font-extrabold uppercase tracking-widest shrink-0 px-4 select-none">
                <div>ID SOL.</div>
                <div>CÓDIGO</div>
                <div>SEMIELABORADO</div>
                <div>MOTIVO / DESTINO</div>
                <div className="text-right">RET / TOTAL</div>
                <div className="text-center">PRIORIDAD</div>
                <div className="text-center">ESTADO</div>
                <div className="text-right">ACCIONES</div>
              </div>

              {/* FILAS DE LA TABLA CON OVERFLOW VISIBLE Y SUBMENÚ QUE FLOTA SIEMPRE HACIA ABAJO */}
              <div className="flex flex-col bg-black flex-1 overflow-visible">
                {currentItems.map((s) => {
                  const archived = isArchived(s.estado);
                  const styleEst = getEstadoStyle(s.estado, archived);
                  const solIdStr = getSolId(s);
                  const motivoText = getMotivo(s);

                  return (
                    <div
                      key={s.id}
                      className={`grid grid-cols-[120px_140px_1fr_200px_130px_100px_110px_130px] h-12 items-center px-4 border-b border-zinc-900/80 last:border-b-0 text-xs hover:bg-[#0a0a0a] transition-colors     shrink-0 relative ${
                        archived ? "opacity-60" : ""
                      } ${activeActionMenuId === s.id ? "z-[100]" : "z-10"}`}
                    >
                      <div className="font-extrabold text-white truncate">
                        {solIdStr}
                      </div>

                      <div className="truncate">
                        <span className="text-[#FF5A00] bg-[#FF5A00]/10 border border-[#FF5A00]/20 px-2 py-0.5 text-[10px] font-bold">
                          {s.semielaboradoCodigo}
                        </span>
                      </div>

                      <div className="font-sans font-bold text-white truncate pr-2">
                        {s.semielaboradoNombre}
                      </div>

                      <div className="text-zinc-300 font-bold text-[10px] truncate pr-2 uppercase">
                        {motivoText}
                      </div>

                      <div className="text-right font-bold text-zinc-300">
                        <span className="text-emerald-400">
                          {s.cantidadRetirada}
                        </span>{" "}
                        / {s.cantidadSolicitada}
                      </div>

                      <div className="flex justify-center">
                        <span
                          className={`text-[8px] px-1.5 py-0.5 border font-bold uppercase tracking-widest ${getUrgenciaStyle(s.urgencia, archived)}`}
                        >
                          {s.urgencia}
                        </span>
                      </div>

                      <div className="flex justify-center">
                        <span
                          className={`text-[8px] px-2 py-0.5 border font-bold uppercase tracking-widest ${styleEst}`}
                        >
                          {s.estado}
                        </span>
                      </div>

                      {/* BOTÓN DESPLEGABLE DE ACCIONES SIEMPRE HACIA ABAJO Y POR SOBRE LA TABLA */}
                      <div className="flex justify-end relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveActionMenuId(
                              activeActionMenuId === s.id ? null : s.id,
                            );
                          }}
                          className={`px-3 py-1.5 border     text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 transition-all cursor-pointer ${
                            activeActionMenuId === s.id
                              ? "bg-[#050505] border-[#FF5A00] text-[#FF5A00]"
                              : "bg-[#050505] border-zinc-800 text-zinc-400 hover:border-[#FF5A00] hover:text-white"
                          }`}
                        >
                          <span>OPCIONES</span>
                          <ChevronDown
                            size={12}
                            className={`transition-transform duration-200 ${
                              activeActionMenuId === s.id
                                ? "rotate-180 text-[#FF5A00]"
                                : ""
                            }`}
                          />
                        </button>

                        {/* SUBMENÚ QUE ABRE SIEMPRE HACIA ABAJO (TOP-FULL MT-1.5) CON Z-100 */}
                        {activeActionMenuId === s.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute top-full right-0 mt-1.5 w-48 bg-[#050505] border border-zinc-700 shadow-[0_20px_50px_rgba(0,0,0,0.95)] z-[100] flex flex-col     text-[10px] animate-in fade-in slide-in-from-top-2 duration-150 origin-top-right"
                          >
                            <button
                              onClick={() => {
                                setActiveActionMenuId(null);
                                setModalHistorialOpen(s);
                              }}
                              className="px-4 py-3 text-left font-bold uppercase tracking-widest text-zinc-400 hover:text-white hover:bg-[#FF5A00]/10 transition-colors border-b border-zinc-900 cursor-pointer flex items-center gap-2"
                            >
                              <History size={13} className="text-[#FFD700]" />
                              AUDITORÍA
                            </button>

                            {isDeposito && !archived && (
                              <button
                                onClick={() => {
                                  setActiveActionMenuId(null);
                                  handleOpenEditar(s);
                                }}
                                className="px-4 py-3 text-left font-bold uppercase tracking-widest text-zinc-400 hover:text-white hover:bg-[#FF5A00]/10 transition-colors border-b border-zinc-900 cursor-pointer flex items-center gap-2"
                              >
                                <Edit2 size={13} className="text-[#FF5A00]" />
                                EDITAR SOLICITUD
                              </button>
                            )}

                            {s.estado === "SOLICITADO" && isProduccion && (
                              <button
                                onClick={() => {
                                  setActiveActionMenuId(null);
                                  handleCambiarEstado(s.id, "ATENDIDO");
                                }}
                                className="px-4 py-3 text-left font-bold uppercase tracking-widest text-[#FF5A00] hover:text-white hover:bg-[#FF5A00]/15 transition-colors border-b border-zinc-900 cursor-pointer flex items-center gap-2"
                              >
                                <CheckCircle2 size={13} />
                                ATENDER
                              </button>
                            )}

                            {s.estado === "ATENDIDO" && isProduccion && (
                              <button
                                onClick={() => {
                                  setActiveActionMenuId(null);
                                  handleCambiarEstado(s.id, "DISPONIBLE");
                                }}
                                className="px-4 py-3 text-left font-bold uppercase tracking-widest text-[#FFD700] hover:text-white hover:bg-[#FFD700]/15 transition-colors border-b border-zinc-900 cursor-pointer flex items-center gap-2"
                              >
                                <CheckCircle2 size={13} />
                                DISPONIBLE
                              </button>
                            )}

                            {s.estado === "DISPONIBLE" && isDeposito && (
                              <button
                                onClick={() => {
                                  setActiveActionMenuId(null);
                                  setModalRetiroOpen(s);
                                  setCantidadRetiroManual("");
                                }}
                                className="px-4 py-3 text-left font-bold uppercase tracking-widest text-black bg-[#FFD700] hover:bg-white transition-colors border-b border-zinc-900 cursor-pointer flex items-center gap-2"
                              >
                                <Plus size={13} />
                                EXTRAER MATERIAL
                              </button>
                            )}

                            {!archived && isAdmin && (
                              <button
                                onClick={() => {
                                  setActiveActionMenuId(null);
                                  handleCambiarEstado(s.id, "CANCELADO");
                                }}
                                className="px-4 py-3 text-left font-bold uppercase tracking-widest text-rose-500 hover:text-white hover:bg-rose-950/40 transition-colors cursor-pointer flex items-center gap-2"
                              >
                                <Ban size={13} />
                                CANCELAR
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* PIE DE PAGINACIÓN */}
        {solicitudesFiltradas.length > 0 && (
          <div className="mt-4 pt-4 border-t border-zinc-800/60 flex items-center justify-between     text-xs text-zinc-500 shrink-0">
            <span className="uppercase text-[10px] font-bold tracking-widest text-zinc-400">
              Página <strong className="text-white">{currentPage}</strong> de{" "}
              <strong className="text-white">{totalPages}</strong> (
              {solicitudesFiltradas.length} registros)
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 bg-[#050505] text-zinc-300 hover:border-[#FF5A00] hover:text-[#FF5A00] disabled:opacity-20 transition-all cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>

              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 bg-[#050505] text-zinc-300 hover:border-[#FF5A00] hover:text-[#FF5A00] disabled:opacity-20 transition-all cursor-pointer"
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
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4 font-sans">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col relative shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-[#020202]">
              <h3 className="text-xl md:text-2xl font-extrabold italic uppercase tracking-tighter text-white">
                Nueva <span className="text-[#FF5A00]">Solicitud</span>
              </h3>
              <button
                onClick={() => setModalNuevoOpen(false)}
                className="text-zinc-500 hover:text-[#FF5A00] transition-colors cursor-pointer"
              >
                <X size={24} />
              </button>
            </div>

            <form
              onSubmit={handleCrearSolicitud}
              className="p-6 overflow-y-auto flex flex-col gap-5 custom-scrollbar"
            >
              <div>
                <label className="block text-xs uppercase tracking-widest text-zinc-500 mb-2     font-bold">
                  1. Material / Semielaborado *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchSemiText}
                    onChange={(e) => {
                      setSearchSemiText(e.target.value);
                      setSemiSeleccionado(null);
                    }}
                    className="w-full bg-black border border-zinc-800 text-white p-4 text-sm focus:border-[#FF5A00] outline-none     font-bold uppercase transition-colors"
                    placeholder="Buscar por código o nombre..."
                  />
                  {searchSemiText && !semiSeleccionado && (
                    <div className="absolute top-full left-0 w-full bg-[#0a0a0a] border border-zinc-800 mt-1 max-h-48 overflow-y-auto z-50 shadow-2xl custom-scrollbar    ">
                      {semielaboradosFiltrados.map((item, i) => (
                        <div
                          key={i}
                          onClick={() => {
                            setSemiSeleccionado(item);
                            setSearchSemiText(item.nombre);
                          }}
                          className="p-4 border-b border-zinc-800 hover:bg-zinc-900 cursor-pointer flex items-center gap-3 transition-colors"
                        >
                          <span className="bg-[#FF5A00]/10 border border-[#FF5A00]/30 text-[#FF5A00] px-2 py-0.5 text-[10px] font-bold shrink-0">
                            {item.codigo}
                          </span>
                          <span className="text-white text-xs font-sans font-bold truncate">
                            {item.nombre}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4    ">
                <div>
                  <label className="block text-xs uppercase tracking-widest text-zinc-500 mb-2 font-bold">
                    2. Unidades *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={cantidadPedir}
                    onChange={(e) => setCantidadPedir(e.target.value)}
                    className="w-full bg-black border border-zinc-800 text-white p-4 focus:border-[#FF5A00] outline-none font-bold text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-zinc-500 mb-2 font-bold">
                    3. Prioridad *
                  </label>
                  <select
                    value={urgenciaPedir}
                    onChange={(e) => setUrgenciaPedir(e.target.value)}
                    className="w-full bg-black border border-zinc-800 text-white p-4 focus:border-[#FF5A00] outline-none font-bold tracking-wider cursor-pointer text-xs"
                  >
                    <option value="BAJA">BAJA</option>
                    <option value="MEDIA">MEDIA</option>
                    <option value="ALTA">ALTA</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2    ">
                <div className="flex justify-between items-center">
                  <label className="block text-xs uppercase tracking-widest text-zinc-500 font-bold">
                    4. Destino / Motivo de Solicitud *
                  </label>
                  <span className="text-[10px] text-zinc-600 font-bold tracking-widest">
                    {motivoUso.length}/20 MAX
                  </span>
                </div>

                <input
                  type="text"
                  required
                  maxLength={20}
                  value={motivoUso}
                  onChange={(e) => setMotivoUso(e.target.value.slice(0, 20))}
                  placeholder="EJ: OP-6043 / INY 02..."
                  className="w-full bg-black border border-zinc-800 text-white p-4 text-xs font-bold focus:border-[#FF5A00] outline-none uppercase tracking-wider"
                />
              </div>

              {errorDuplicado && (
                <div className="p-3 bg-[#FF0055]/10 border border-[#FF0055]/30 text-[#FF0055] text-xs     font-bold uppercase">
                  Ya existe una solicitud activa para este semielaborado.
                </div>
              )}

              <button
                type="submit"
                disabled={
                  !semiSeleccionado || !cantidadPedir || !motivoUso.trim()
                }
                className="mt-2 w-full bg-[#FFD700] hover:bg-white text-black font-extrabold italic uppercase tracking-tighter text-xl p-4 transition-all disabled:opacity-30 flex justify-center items-center gap-2 cursor-pointer"
              >
                Confirmar Solicitud <ChevronRight size={20} strokeWidth={3} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR SOLICITUD */}
      {modalEditarOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4 font-sans">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-lg flex flex-col relative shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-[#020202]">
              <h3 className="text-xl font-extrabold italic uppercase tracking-tighter text-[#FF5A00]">
                Editar{" "}
                <span className="text-white">{getSolId(modalEditarOpen)}</span>
              </h3>
              <button
                onClick={() => setModalEditarOpen(null)}
                className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleGuardarEdicion} className="p-6 space-y-5    ">
              <div>
                <span className="bg-[#FF5A00]/10 border border-[#FF5A00]/20 text-[#FF5A00] px-2 py-0.5 text-[10px] font-bold tracking-widest mb-1 inline-block">
                  {modalEditarOpen.semielaboradoCodigo}
                </span>
                <h4 className="text-white font-bold text-base font-sans">
                  {modalEditarOpen.semielaboradoNombre}
                </h4>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 font-bold">
                    Unidades Solicitadas:
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={editCantidad}
                    onChange={(e) => setEditCantidad(e.target.value)}
                    className="w-full bg-black border border-zinc-800 text-white p-3 text-sm font-bold focus:border-[#FF5A00] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 font-bold">
                    Prioridad:
                  </label>
                  <select
                    value={editUrgencia}
                    onChange={(e) => setEditUrgencia(e.target.value)}
                    className="w-full bg-black border border-zinc-800 text-white p-3 text-xs font-bold focus:border-[#FF5A00] outline-none cursor-pointer uppercase"
                  >
                    <option value="BAJA">BAJA</option>
                    <option value="MEDIA">MEDIA</option>
                    <option value="ALTA">ALTA</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                    Motivo / Destino:
                  </label>
                  <span className="text-[9px] text-zinc-600 font-bold">
                    {editMotivo.length}/20 MAX
                  </span>
                </div>
                <input
                  type="text"
                  required
                  maxLength={20}
                  value={editMotivo}
                  onChange={(e) => setEditMotivo(e.target.value.slice(0, 20))}
                  className="w-full bg-black border border-zinc-800 text-white p-3 text-xs font-bold focus:border-[#FF5A00] outline-none uppercase"
                />
              </div>

              <div className="pt-3 border-t border-zinc-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalEditarOpen(null)}
                  className="px-4 py-2.5 text-zinc-500 hover:text-white text-[10px] font-bold uppercase tracking-widest transition cursor-pointer"
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#FF5A00] hover:bg-white text-black font-extrabold text-[10px] uppercase tracking-widest transition cursor-pointer"
                >
                  GUARDAR CAMBIOS
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL RETIRO PARCIAL */}
      {modalRetiroOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4 font-sans">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-md flex flex-col relative shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-[#020202]">
              <h3 className="text-xl font-extrabold italic uppercase tracking-tighter text-[#FFD700]">
                Extraer Material
              </h3>
              <button
                onClick={() => setModalRetiroOpen(null)}
                className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-5    ">
              <div>
                <span className="bg-[#FF5A00]/10 border border-[#FF5A00]/20 text-[#FF5A00] px-1.5 py-0.5 text-[10px] font-bold tracking-widest mb-2 inline-block">
                  {modalRetiroOpen.semielaboradoCodigo}
                </span>
                <p className="text-zinc-300 text-sm mb-2 font-bold font-sans">
                  {modalRetiroOpen.semielaboradoNombre}
                </p>
                <p className="text-3xl font-extrabold text-white">
                  {modalRetiroOpen.cantidadSolicitada -
                    modalRetiroOpen.cantidadRetirada}{" "}
                  <span className="text-xs font-normal text-zinc-500">
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
                    className="w-full bg-black border border-zinc-800 border-r-0 text-white p-4 focus:border-[#FFD700] outline-none font-bold"
                    placeholder="Ingresar cant..."
                  />
                  <button
                    onClick={() =>
                      handleRegistrarRetiro(
                        modalRetiroOpen.id,
                        cantidadRetiroManual,
                      )
                    }
                    className="bg-zinc-800 text-white px-6 font-bold uppercase text-xs tracking-wider hover:bg-[#FFD700] hover:text-black transition-colors cursor-pointer"
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
                className="w-full bg-transparent border border-[#FFD700] text-[#FFD700] hover:bg-[#FFD700] hover:text-black font-bold uppercase tracking-widest text-xs p-4 transition-colors cursor-pointer mt-2"
              >
                Extraer Todo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL HISTORIAL / AUDITORÍA */}
      {modalHistorialOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex flex-col items-center justify-center p-4 font-sans">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-md max-h-[85vh] flex flex-col relative shadow-2xl">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-[#020202] shrink-0">
              <h3 className="text-xl font-extrabold italic uppercase tracking-tighter text-white">
                Auditoría{" "}
                <span className="text-[#FF5A00]">
                  {getSolId(modalHistorialOpen)}
                </span>
              </h3>
              <button
                onClick={() => setModalHistorialOpen(null)}
                className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6     custom-scrollbar">
              <div className="space-y-4 border-l border-zinc-800 pl-5 ml-2">
                <div className="relative">
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-600 absolute -left-[26px] top-1" />
                  <p className="text-[10px] font-bold uppercase text-white tracking-wider">
                    Solicitado
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    {modalHistorialOpen.solicitadoAt}
                  </p>
                  {getMotivo(modalHistorialOpen) !== "--" && (
                    <p className="text-[10px] text-[#FFD700] mt-1 font-bold uppercase">
                      Destino: {getMotivo(modalHistorialOpen)}
                    </p>
                  )}
                </div>

                {modalHistorialOpen.atendidoAt && (
                  <div className="relative">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FF5A00] absolute -left-[26px] top-1" />
                    <p className="text-[10px] font-bold uppercase text-[#FF5A00] tracking-wider">
                      En Proceso
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
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
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      {modalHistorialOpen.disponibleAt}
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-5 border-t border-zinc-800">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3 font-bold">
                  Movimientos de Extracción
                </p>
                {modalHistorialOpen.retirosHistorial?.length > 0 ? (
                  <div className="space-y-2">
                    {modalHistorialOpen.retirosHistorial.map((r, i) => (
                      <div
                        key={i}
                        className="flex justify-between items-center bg-black p-3 border border-zinc-800"
                      >
                        <div>
                          <p className="text-white text-xs font-bold">
                            +{r.cantidad} u.
                          </p>
                          <p className="text-zinc-500 text-[9px] uppercase tracking-wider mt-0.5">
                            {r.usuario}
                          </p>
                        </div>
                        <p className="text-zinc-500 text-[10px]">
                          {r.fecha.slice(11, 16)}hs
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-600 italic">
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
