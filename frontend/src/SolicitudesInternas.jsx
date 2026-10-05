import { useState, useEffect } from "react";
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
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

// ==============================================================================
// CONFIGURACIÓN DE URL DEL BACKEND (FEROZO / LOCALHOST)
// ==============================================================================
const API_BASE_URL = import.meta.env?.VITE_API_URL || "";

const getApiUrl = (path) => {
  const cleanPath = path.startsWith("/") ? path : "/" + path;
  return `${API_BASE_URL}${cleanPath}`;
};

// DATA INICIAL DE MUESTRA (Con Historial y Timestamps)
const SOLICITUDES_INICIALES = [
  {
    id: "SOL-1001",
    semielaboradoCodigo: "2400-2R",
    semielaboradoNombre: "Cuerpo Cono Autopista 120cm Amarillo",
    cantidadSolicitada: 500,
    cantidadRetirada: 300,
    urgencia: "ALTA",
    estado: "DISPONIBLE",
    solicitadoAt: "2026-10-01 08:30:12",
    atendidoAt: "2026-10-01 09:15:00",
    disponibleAt: "2026-10-01 16:00:00",
    entregadoAt: null,
    retirosHistorial: [
      { fecha: "2026-10-01 17:10:00", cantidad: 150, usuario: "Depósito" },
      { fecha: "2026-10-02 09:00:00", cantidad: 150, usuario: "Depósito" },
    ],
  },
  {
    id: "SOL-1002",
    semielaboradoCodigo: "CAD-105",
    semielaboradoNombre: "Cadena Plástica 8mm Amarilla/Negra",
    cantidadSolicitada: 1000,
    cantidadRetirada: 0,
    urgencia: "MEDIA",
    estado: "ATENDIDO",
    solicitadoAt: "2026-10-02 07:45:30",
    atendidoAt: "2026-10-02 08:10:00",
    disponibleAt: null,
    entregadoAt: null,
    retirosHistorial: [],
  },
];

export default function SolicitudesInternas() {
  const [solicitudes, setSolicitudes] = useState(SOLICITUDES_INICIALES);
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [busqueda, setBusqueda] = useState("");

  // BASE DE DATOS DE SEMIELABORADOS
  const [semielaboradosDB, setSemielaboradosDB] = useState([]);

  // MODALES
  const [modalNuevoOpen, setModalNuevoOpen] = useState(false);
  const [modalRetiroOpen, setModalRetiroOpen] = useState(null);
  const [modalHistorialOpen, setModalHistorialOpen] = useState(null);

  // CAMPOS DE NUEVA SOLICITUD
  const [semiSeleccionado, setSemiSeleccionado] = useState(null);
  const [cantidadPedir, setCantidadPedir] = useState("");
  const [urgenciaPedir, setUrgenciaPedir] = useState("MEDIA");
  const [errorDuplicado, setErrorDuplicado] = useState(null);
  const [searchSemiText, setSearchSemiText] = useState("");

  // ESTADO PARA RETIRO MANUAL
  const [cantidadRetiroManual, setCantidadRetiroManual] = useState("");

  // ==========================================
  // FETCH DE SEMIELABORADOS DESDE BD
  // ==========================================
  useEffect(() => {
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
    fetchSemielaborados();
  }, []);

  // FILTRADO AUTOCOMPLETADO
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

  // ==========================================
  // LÓGICA DE RESTRICCIÓN DE 10 SOLICITUDES
  // ==========================================
  const solicitudesActivas = solicitudes.filter(
    (s) => s.estado !== "ENTREGADO" && s.estado !== "CANCELADO",
  );
  const limiteAlcanzado = solicitudesActivas.length >= 10;

  // CREAR NUEVA SOLICITUD
  const handleCrearSolicitud = (e) => {
    e.preventDefault();
    if (!semiSeleccionado || !cantidadPedir || Number(cantidadPedir) <= 0)
      return;

    // Validación de Duplicado Activo
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
      cantidadRetirada: 0,
      urgencia: urgenciaPedir,
      estado: "SOLICITADO",
      solicitadoAt: now,
      atendidoAt: null,
      disponibleAt: null,
      entregadoAt: null,
      retirosHistorial: [],
    };

    setSolicitudes([nueva, ...solicitudes]);
    setModalNuevoOpen(false);
    setSemiSeleccionado(null);
    setCantidadPedir("");
    setSearchSemiText("");
    setErrorDuplicado(null);
  };

  // CAMBIO DE ESTADOS
  const handleCambiarEstado = (id, nuevoEstado) => {
    const now = new Date().toISOString().replace("T", " ").substring(0, 19);
    setSolicitudes((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const updated = { ...s, estado: nuevoEstado };
        if (nuevoEstado === "ATENDIDO" && !s.atendidoAt)
          updated.atendidoAt = now;
        if (nuevoEstado === "DISPONIBLE" && !s.disponibleAt)
          updated.disponibleAt = now;
        if (nuevoEstado === "CANCELADO") updated.estado = "CANCELADO";
        return updated;
      }),
    );
  };

  // REGISTRAR RETIRO PARCIAL
  const handleRegistrarRetiro = (solicitudId, cantidad) => {
    const qty = Number(cantidad);
    if (!qty || qty <= 0) return;

    const now = new Date().toISOString().replace("T", " ").substring(0, 19);
    setSolicitudes((prev) =>
      prev.map((s) => {
        if (s.id !== solicitudId) return s;

        const nuevaCantidadRetirada = Math.min(
          s.cantidadRetirada + qty,
          s.cantidadSolicitada,
        );
        const estaCompleto = nuevaCantidadRetirada >= s.cantidadSolicitada;

        const nuevoRetiroLog = {
          fecha: now,
          cantidad: qty,
          usuario: "Depósito",
        };

        return {
          ...s,
          cantidadRetirada: nuevaCantidadRetirada,
          estado: estaCompleto ? "ENTREGADO" : "DISPONIBLE",
          entregadoAt: estaCompleto ? now : s.entregadoAt,
          retirosHistorial: [nuevoRetiroLog, ...s.retirosHistorial],
        };
      }),
    );
    setModalRetiroOpen(null);
    setCantidadRetiroManual("");
  };

  // FILTRADO
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

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#070a12] border border-slate-800/80 rounded-2xl font-sans text-slate-200 shadow-2xl overflow-hidden relative">
      {/* CABECERA TÁCTICA */}
      <div className="bg-[#0f172a]/90 border-b border-slate-800/80 p-4 flex flex-wrap items-center justify-between gap-4 shrink-0 backdrop-blur-xl z-10">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.15)]">
            <ClipboardList
              size={22}
              className="text-emerald-400 animate-pulse"
            />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xs font-bold text-white tracking-widest uppercase font-mono">
                SOLICITUDES INTERNAS DE DEPÓSITO
              </h2>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-mono font-bold">
                PANEL DE CONTROL
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
              Gestión centralizada de pedidos inter-planta
              {limiteAlcanzado && (
                <span className="bg-rose-500/20 text-rose-400 border border-rose-500/50 px-2 rounded font-bold animate-pulse">
                  LÍMITE DE 10 SOLICITUDES ACTIVAS ALCANZADO
                </span>
              )}
            </p>
          </div>
        </div>

        {/* BOTÓN NUEVA SOLICITUD */}
        <button
          onClick={() => {
            if (limiteAlcanzado) return;
            setModalNuevoOpen(true);
            setErrorDuplicado(null);
          }}
          disabled={limiteAlcanzado}
          className={`font-bold font-mono text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.2)] ${
            limiteAlcanzado
              ? "bg-slate-800 text-slate-500 cursor-not-allowed opacity-50"
              : "bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer"
          }`}
        >
          <Plus size={16} /> NUEVA SOLICITUD
        </button>
      </div>

      {/* BARRA DE FILTROS Y BÚSQUEDA */}
      <div className="p-4 bg-[#090d16] border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por código o descripción..."
            className="w-full bg-[#070a12] border border-slate-800 text-slate-200 pl-9 pr-3 py-1.5 rounded-xl outline-none focus:border-emerald-500/50"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {["TODOS", "SOLICITADO", "ATENDIDO", "DISPONIBLE", "AUDITORIA"].map(
            (est) => (
              <button
                key={est}
                onClick={() => setFiltroEstado(est)}
                className={`px-3 py-1.5 rounded-xl border transition cursor-pointer font-bold ${
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

      {/* TABLA PRINCIPAL DE SOLICITUDES */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="bg-[#0e1422] border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#090d16] text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
              <tr>
                <th className="p-3 w-28">N° Solicitud</th>
                <th className="p-3 w-28">Urgencia</th>
                <th className="p-3">Semielaborado Requerido</th>
                <th className="p-3 w-44">Avance / Retiro Parcial</th>
                <th className="p-3 w-32">Estado Actual</th>
                <th className="p-3 w-36">Último Cambio</th>
                <th className="p-3 w-48 text-center">Acciones Tácticas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-[#070a12]/30 font-mono">
              {solicitudesFiltradas.length > 0 ? (
                solicitudesFiltradas.map((s) => {
                  const estBadge = getEstadoBadge(s.estado);
                  const saldoPendiente =
                    s.cantidadSolicitada - s.cantidadRetirada;
                  const porcentajeProgreso = Math.round(
                    (s.cantidadRetirada / s.cantidadSolicitada) * 100,
                  );

                  return (
                    <tr
                      key={s.id}
                      className="hover:bg-[#121824] transition-colors align-middle"
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
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getUrgenciaBadge(s.urgencia)}`}
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
                          {s.estado === "SOLICITADO" && (
                            <button
                              onClick={() =>
                                handleCambiarEstado(s.id, "ATENDIDO")
                              }
                              className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold px-2.5 py-1 rounded-lg transition text-[10px] flex items-center gap-1 cursor-pointer"
                            >
                              <Check size={12} /> Marcar Atendido
                            </button>
                          )}

                          {s.estado === "ATENDIDO" && (
                            <button
                              onClick={() =>
                                handleCambiarEstado(s.id, "DISPONIBLE")
                              }
                              className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold px-2.5 py-1 rounded-lg transition text-[10px] flex items-center gap-1 cursor-pointer"
                            >
                              <PackageCheck size={12} /> Marcar Listo
                            </button>
                          )}

                          {s.estado === "DISPONIBLE" && (
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
                            s.estado !== "CANCELADO" && (
                              <button
                                onClick={() =>
                                  handleCambiarEstado(s.id, "CANCELADO")
                                }
                                className="text-slate-600 hover:text-rose-400 p-1.5 transition cursor-pointer"
                                title="Cancelar solicitud"
                              >
                                <Ban size={14} />
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan="7"
                    className="p-8 text-center text-slate-500 italic font-mono"
                  >
                    No se encontraron solicitudes con los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================== */}
      {/* MODAL 1: NUEVA SOLICITUD CON BASE DE DATOS */}
      {/* ========================================== */}
      {modalNuevoOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[300] flex items-center justify-center p-4 font-sans animate-in fade-in">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col relative text-xs">
            <div className="bg-[#090d16] border-b border-slate-800 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <ClipboardList size={18} className="text-emerald-400" />
                </div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
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

            <form onSubmit={handleCrearSolicitud} className="p-6 space-y-5">
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
                    className="w-full bg-[#070a12] border border-slate-700 text-white font-sans text-xs pl-9 pr-3 py-2 rounded-xl outline-none focus:border-emerald-500"
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
                            <span className="text-slate-200 font-sans truncate max-w-[240px]">
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-400 uppercase block">
                    2. CANTIDAD TOTAL
                  </label>
                  <input
                    type="number"
                    value={cantidadPedir}
                    onChange={(e) => setCantidadPedir(e.target.value)}
                    placeholder="Ej: 500"
                    className="w-full bg-[#070a12] border border-slate-700 text-white font-mono text-xs px-3 py-2 rounded-xl outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-slate-400 uppercase block">
                    3. NIVEL DE URGENCIA
                  </label>
                  <select
                    value={urgenciaPedir}
                    onChange={(e) => setUrgenciaPedir(e.target.value)}
                    className="w-full bg-[#070a12] border border-slate-700 text-amber-400 font-mono font-bold text-xs px-3 py-2 rounded-xl outline-none cursor-pointer"
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
                    . Esperá su entrega o cancelala.
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
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed font-bold font-mono px-5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-lg"
                >
                  <Send size={14} /> Enviar Solicitud
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MODAL 2: REGISTRO DE RETIRO MANUAL */}
      {/* ========================================== */}
      {modalRetiroOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[300] flex items-center justify-center p-4 font-sans animate-in fade-in">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col relative text-xs">
            <div className="bg-[#090d16] border-b border-slate-800 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                  <Truck size={18} className="text-cyan-400" />
                </div>
                <div>
                  <span className="font-mono text-xs font-bold text-amber-400">
                    [{modalRetiroOpen.id}]
                  </span>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
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

            <div className="p-6 space-y-5">
              <div className="bg-[#070a12] border border-slate-800 p-3.5 rounded-xl space-y-1">
                <span className="text-[10px] font-mono text-amber-400 font-bold">
                  [{modalRetiroOpen.semielaboradoCodigo}]
                </span>
                <h4 className="text-xs font-bold text-white">
                  {modalRetiroOpen.semielaboradoNombre}
                </h4>
                <div className="flex justify-between text-[11px] font-mono text-slate-400 pt-2 border-t border-slate-800/80">
                  <span>
                    Retirado acumulado:{" "}
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

              {/* INPUT MANUAL PARA RETIRO PARCIAL */}
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
                    placeholder={`Máximo a retirar: ${modalRetiroOpen.cantidadSolicitada - modalRetiroOpen.cantidadRetirada}`}
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
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    Confirmar
                  </button>
                </div>
              </div>

              {/* BOTÓN DE CIERRE RÁPIDO */}
              <button
                onClick={() =>
                  handleRegistrarRetiro(
                    modalRetiroOpen.id,
                    modalRetiroOpen.cantidadSolicitada -
                      modalRetiroOpen.cantidadRetirada,
                  )
                }
                className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 p-2.5 rounded-xl font-bold transition text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 size={14} /> Retirar Saldo Restante y Finalizar (
                {modalRetiroOpen.cantidadSolicitada -
                  modalRetiroOpen.cantidadRetirada}{" "}
                u.)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: AUDITORÍA (Mantenido intacto) */}
      {modalHistorialOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[300] flex items-center justify-center p-4 font-sans animate-in fade-in">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col relative text-xs">
            <div className="bg-[#090d16] border-b border-slate-800 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <History size={18} className="text-amber-400" />
                </div>
                <div>
                  <span className="font-mono text-xs font-bold text-amber-400">
                    [{modalHistorialOpen.id}]
                  </span>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                    LÍNEA DE TIEMPO DE AUDITORÍA
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

            <div className="p-6 space-y-4 font-mono">
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
                {modalHistorialOpen.retirosHistorial.length > 0 ? (
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
