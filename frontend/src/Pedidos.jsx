import { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  Plus,
  ChevronRight,
  ChevronLeft,
  X,
  RefreshCw,
  CheckCircle2,
  ListChecks,
  CheckSquare,
  Square,
  ArrowRight,
  History,
  FileText,
  Save,
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

const formatFechaArg = (fechaRaw) => {
  if (!fechaRaw || fechaRaw === "--") return "--";
  try {
    const d = new Date(fechaRaw);
    if (isNaN(d.getTime())) {
      const parts = String(fechaRaw).split(" ")[0].split("T")[0].split("-");
      return parts.length === 3
        ? `${parts[2]}/${parts[1]}/${parts[0]}`
        : fechaRaw;
    }
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(d);
  } catch {
    return String(fechaRaw);
  }
};

const formatHoraArg = (fechaRaw) => {
  if (!fechaRaw || fechaRaw === "--") return "";
  try {
    const d = new Date(fechaRaw);
    if (isNaN(d.getTime())) return String(fechaRaw).slice(11, 16);
    return new Intl.DateTimeFormat("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(d);
  } catch {
    return "";
  }
};

export default function Pedidos({ usuarioActual }) {
  const rolUpper = (usuarioActual?.rol || "ADMIN").toUpperCase();
  const isAdmin = rolUpper === "ADMIN";

  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");

  // PAGINACIÓN
  const tableContainerRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // MODALES
  const [modalNuevoOpen, setModalNuevoOpen] = useState(false);
  const [modalDetalleOpen, setModalDetalleOpen] = useState(null);
  const [detalleData, setDetalleData] = useState({
    pedido: null,
    items: [],
    historial: [],
  });
  const [loadingDetalles, setLoadingDetalles] = useState(false);

  // FORMULARIO CREACIÓN
  const [opInput, setOpInput] = useState("");
  const [loadingOP, setLoadingOP] = useState(false);
  const [opDataFound, setOpDataFound] = useState(null);
  const [articulosSeleccionados, setArticulosSeleccionados] = useState([]);

  // FORMULARIO AGREGAR ÍTEM ADICIONAL EN DETALLES
  const [itemDesc, setItemDesc] = useState("");
  const [itemCant, setItemCant] = useState("");

  // OBSERVACIONES / NOTAS
  const [observacionesInput, setObservacionesInput] = useState("");
  const [savingObservaciones, setSavingObservaciones] = useState(false);

  // AVANCES PARCIALES (PRODUCCIÓN)
  const [avancesInputs, setAvancesInputs] = useState({});

  useEffect(() => {
    fetchPedidos();
  }, []);

  const fetchPedidos = async () => {
    try {
      const res = await fetch(getApiUrl("/api/pedidos"));
      if (res.ok) setPedidos((await res.json()) || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleBuscarOP = async (e) => {
    e.preventDefault();
    if (!opInput.trim()) return;
    setLoadingOP(true);
    setOpDataFound(null);
    setArticulosSeleccionados([]);

    try {
      const res = await fetch(
        getApiUrl(`/api/estado-pedidos/op/${opInput.trim()}`),
      );
      if (res.ok) {
        const data = await res.json();
        setOpDataFound(data);
        setArticulosSeleccionados(data.articulos || []);
      } else {
        alert("No se encontró la OP especificada en 'estado_pedidos'.");
      }
    } catch (err) {
      console.error(err);
      alert("Error al consultar la OP.");
    } finally {
      setLoadingOP(false);
    }
  };

  const toggleSeleccionArticulo = (art) => {
    setArticulosSeleccionados((prev) => {
      const existe = prev.some((a) => a.id === art.id);
      return existe ? prev.filter((a) => a.id !== art.id) : [...prev, art];
    });
  };

  const handleCrearPedido = async (e) => {
    e.preventDefault();
    if (!opDataFound || !articulosSeleccionados.length || !isAdmin) return;

    try {
      const res = await fetch(getApiUrl("/api/pedidos"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: opDataFound.op,
          cliente: opDataFound.cliente,
          fecha: opDataFound.fecha,
          articulosSeleccionados: articulosSeleccionados,
        }),
      });

      if (res.ok) {
        await fetchPedidos();
        setModalNuevoOpen(false);
        setOpInput("");
        setOpDataFound(null);
        setArticulosSeleccionados([]);
      } else {
        alert("Error al crear el pedido.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDetallesPedido = async (pedidoId) => {
    setLoadingDetalles(true);
    try {
      const res = await fetch(getApiUrl(`/api/pedidos/${pedidoId}/detalles`));
      if (res.ok) {
        const data = await res.json();
        setDetalleData(data);
        setObservacionesInput(data.pedido?.observaciones || "");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetalles(false);
    }
  };

  const handleOpenDetalles = (pedido) => {
    setModalDetalleOpen(pedido);
    setObservacionesInput(pedido.observaciones || "");
    fetchDetallesPedido(pedido.id);
  };

  // AGREGAR ÍTEM / CHECKPOINT (CON O SIN CANTIDAD)
  const handleAgregarItemAdmin = async (e) => {
    e.preventDefault();
    if (!isAdmin || !modalDetalleOpen || !itemDesc.trim()) return;

    try {
      const res = await fetch(
        getApiUrl(`/api/pedidos/${modalDetalleOpen.id}/items`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            descripcion: itemDesc,
            cantidadObjetivo: itemCant ? Number(itemCant) : 0, // 0 = Checklist común
          }),
        },
      );

      if (res.ok) {
        setItemDesc("");
        setItemCant("");
        await fetchDetallesPedido(modalDetalleOpen.id);
        await fetchPedidos();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // TILDAR UN CHECKLIST COMÚN (SIN CANTIDAD)
  const handleTildarChecklistComun = async (itemId) => {
    if (!modalDetalleOpen) return;

    try {
      const res = await fetch(
        getApiUrl(`/api/pedidos/${modalDetalleOpen.id}/items/${itemId}/tildar`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            usuario: usuarioActual?.nombre || "Producción",
            fechaHora: getNowLocal(),
          }),
        },
      );

      if (res.ok) {
        await fetchDetallesPedido(modalDetalleOpen.id);
        await fetchPedidos();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // AVANCE PARCIAL EN ÍTEMS CON CANTIDAD
  const handleRegistrarAvanceParcial = async (itemId, cantDisponible) => {
    const cantInput = avancesInputs[itemId];
    const qty = Number(cantInput);
    if (!qty || qty <= 0 || qty > cantDisponible || !modalDetalleOpen) return;

    try {
      const res = await fetch(
        getApiUrl(`/api/pedidos/${modalDetalleOpen.id}/items/${itemId}/avance`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cantidadAvanzada: qty,
            usuario: usuarioActual?.nombre || "Producción",
            fechaHora: getNowLocal(),
          }),
        },
      );

      if (res.ok) {
        setAvancesInputs((prev) => ({ ...prev, [itemId]: "" }));
        await fetchDetallesPedido(modalDetalleOpen.id);
        await fetchPedidos();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // GUARDAR OBSERVACIONES
  const handleGuardarObservaciones = async () => {
    if (!modalDetalleOpen) return;
    setSavingObservaciones(true);

    try {
      const res = await fetch(
        getApiUrl(`/api/pedidos/${modalDetalleOpen.id}/observaciones`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ observaciones: observacionesInput }),
        },
      );

      if (res.ok) {
        await fetchDetallesPedido(modalDetalleOpen.id);
        await fetchPedidos();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingObservaciones(false);
    }
  };

  const pedidosFiltrados = useMemo(() => {
    return pedidos.filter((p) => {
      const query = busqueda.toLowerCase();
      return (
        String(p.op).toLowerCase().includes(query) ||
        String(p.cliente).toLowerCase().includes(query) ||
        String(p.articulo).toLowerCase().includes(query)
      );
    });
  }, [pedidos, busqueda]);

  const totalPages = Math.ceil(pedidosFiltrados.length / itemsPerPage) || 1;
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return pedidosFiltrados.slice(start, start + itemsPerPage);
  }, [pedidosFiltrados, currentPage, itemsPerPage]);

  const getEstadoBadge = (estado) => {
    if (estado === "COMPLETADO")
      return "text-emerald-400 border-emerald-900 bg-emerald-950/40";
    if (estado === "EN_PROCESO")
      return "text-[#FF5A00] border-[#FF5A00]/30 bg-[#FF5A00]/10";
    return "text-zinc-400 border-zinc-800 bg-zinc-900";
  };

  useEffect(() => {
    const updatePageSize = () => {
      if (!tableContainerRef.current) return;
      const containerHeight = tableContainerRef.current.clientHeight;
      const headerHeight = 48;
      const rowHeight = 56;
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
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-black font-sans text-zinc-200 overflow-hidden relative selection:bg-[#FF5A00]/30">
      {/* HEADER HERO */}
      <div className="border-b border-zinc-800/50 p-4 sm:p-6 md:p-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4 shrink-0 bg-[#050505] relative overflow-hidden">
        <div className="z-10">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold italic tracking-tighter text-white uppercase leading-none">
            PEDIDOS
          </h1>
          <p className="text-zinc-500 text-xs sm:text-sm mt-1.5 max-w-md uppercase tracking-widest font-bold">
            ROL DE VISUALIZACIÓN: <span className="text-white">{rolUpper}</span>
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => setModalNuevoOpen(true)}
            className="flex items-center justify-between gap-3 px-6 py-3 bg-[#FFD700] hover:bg-white text-black font-bold text-xs uppercase tracking-widest transition-all cursor-pointer shadow-lg shadow-[#FFD700]/10 w-full sm:w-auto shrink-0 rounded-sm"
          >
            <span>NUEVO PEDIDO</span>
            <Plus size={18} strokeWidth={3} />
          </button>
        )}
      </div>

      {/* BARRA DE BÚSQUEDA */}
      <div className="px-3 sm:px-6 md:px-8 py-3 border-b border-zinc-800/50 flex items-center justify-between gap-3 shrink-0 bg-black relative z-20">
        <div className="relative w-full md:w-[400px]">
          <Search
            size={14}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por N° OP, cliente o artículo..."
            className="w-full bg-[#080808] border border-zinc-800 focus:border-[#FF5A00] text-white pl-9 pr-4 py-2.5 text-xs transition-colors outline-none font-mono rounded-sm"
          />
        </div>
      </div>

      {/* ÁREA DE CONTENIDO / TABLA */}
      <div className="flex-1 flex flex-col justify-between overflow-hidden p-3 sm:p-6 md:p-8 bg-black min-h-0 relative z-10">
        {loading ? (
          <div className="flex justify-center items-center flex-1 text-[#FF5A00]">
            <RefreshCw className="animate-spin" size={28} />
          </div>
        ) : currentItems.length === 0 ? (
          <div className="flex justify-center items-center flex-1 text-zinc-600 text-center">
            <p className="uppercase tracking-widest text-xs font-bold">
              No hay pedidos registrados en la base de datos.
            </p>
          </div>
        ) : (
          <div
            ref={tableContainerRef}
            className="flex-1 min-h-0 w-full flex flex-col justify-start overflow-x-auto custom-scrollbar"
          >
            <div className="w-full border border-zinc-800/90 bg-[#030303] flex flex-col shadow-2xl h-fit min-w-[900px] rounded-sm">
              {/* CABECERA TABLA */}
              <div className="grid grid-cols-[100px_110px_1fr_250px_120px_110px_130px] h-12 bg-[#080808] border-b border-zinc-800/90 items-center text-zinc-500 font-mono text-[9px] font-extrabold uppercase tracking-widest shrink-0 px-4 select-none">
                <div>FECHA</div>
                <div>N° OP</div>
                <div>CLIENTE</div>
                <div>ARTÍCULO</div>
                <div className="text-right">AVANCE</div>
                <div className="text-center">ESTADO</div>
                <div className="text-right">ACCIONES</div>
              </div>

              {/* FILAS DE LA TABLA */}
              <div className="flex flex-col bg-black flex-1 font-mono">
                {currentItems.map((p) => {
                  return (
                    <div
                      key={p.id}
                      className="grid grid-cols-[100px_110px_1fr_250px_120px_110px_130px] h-14 items-center px-4 border-b border-zinc-900/80 last:border-b-0 text-xs hover:bg-[#0a0a0a] transition-colors shrink-0"
                    >
                      <div className="text-zinc-400 font-bold text-[10px]">
                        {formatFechaArg(p.fecha)}
                      </div>

                      <div>
                        <span className="text-[#FF5A00] bg-[#FF5A00]/10 border border-[#FF5A00]/20 px-2 py-1 text-[10px] font-bold rounded-sm">
                          OP-{String(p.op).replace(/^OP-/i, "")}
                        </span>
                      </div>

                      <div className="font-sans font-bold text-white truncate pr-4 uppercase">
                        {p.cliente}
                      </div>

                      <div className="font-sans font-bold text-zinc-300 truncate pr-4 text-[11px] leading-tight">
                        {p.articulo || "SIN ESPECIFICAR"}
                      </div>

                      <div className="text-right font-bold text-zinc-300">
                        <span className="text-emerald-400">
                          {p.cantidad_completada}
                        </span>{" "}
                        <span className="text-zinc-600">/</span>{" "}
                        {p.cantidad_total}
                      </div>

                      <div className="flex justify-center">
                        <span
                          className={`text-[8px] px-2 py-0.5 border font-bold uppercase tracking-widest rounded-sm ${getEstadoBadge(p.estado)}`}
                        >
                          {p.estado}
                        </span>
                      </div>

                      <div className="flex justify-end">
                        <button
                          onClick={() => handleOpenDetalles(p)}
                          className="px-4 py-2 border border-zinc-800 bg-transparent text-zinc-300 hover:border-white hover:text-white hover:bg-zinc-900 text-[9px] font-bold uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2 rounded-sm"
                        >
                          <ListChecks size={13} />
                          DETALLES
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* PAGINACIÓN */}
        {pedidosFiltrados.length > 0 && (
          <div className="mt-3 pt-3 border-t border-zinc-800/60 flex flex-col sm:flex-row items-center justify-between gap-2 font-mono text-xs text-zinc-500 shrink-0">
            <span className="uppercase text-[10px] font-bold tracking-widest text-zinc-400">
              Página <strong className="text-white">{currentPage}</strong> de{" "}
              <strong className="text-white">{totalPages}</strong> (
              {pedidosFiltrados.length} registros)
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 bg-[#050505] text-zinc-300 hover:border-[#FF5A00] hover:text-[#FF5A00] disabled:opacity-20 transition-all cursor-pointer rounded-sm"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 bg-[#050505] text-zinc-300 hover:border-[#FF5A00] hover:text-[#FF5A00] disabled:opacity-20 transition-all cursor-pointer rounded-sm"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =========================================
          MODAL NUEVO PEDIDO (ADMIN)
      ========================================= */}
      {modalNuevoOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4 font-sans animate-in fade-in duration-200">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-xl max-h-[92vh] overflow-hidden flex flex-col relative shadow-2xl rounded-sm">
            <div className="p-5 sm:p-6 border-b border-zinc-800 flex justify-between items-center bg-[#020202]">
              <h3 className="text-xl sm:text-2xl font-extrabold italic uppercase tracking-tighter text-white">
                Agregar <span className="text-[#FF5A00]">Pedido</span>
              </h3>
              <button
                onClick={() => setModalNuevoOpen(false)}
                className="text-zinc-500 hover:text-white transition cursor-pointer p-1"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-6 overflow-y-auto custom-scrollbar font-mono">
              <form onSubmit={handleBuscarOP} className="flex gap-2">
                <input
                  type="text"
                  required
                  value={opInput}
                  onChange={(e) => setOpInput(e.target.value)}
                  placeholder="N° de OP (Ej: 41163)..."
                  className="flex-1 bg-black border border-zinc-800 text-white p-3 text-sm font-bold focus:border-[#FF5A00] outline-none uppercase rounded-sm"
                />
                <button
                  type="submit"
                  disabled={loadingOP}
                  className="bg-[#FF5A00] hover:bg-white text-black font-extrabold text-xs uppercase px-5 transition cursor-pointer flex items-center gap-2 rounded-sm"
                >
                  {loadingOP ? (
                    <RefreshCw className="animate-spin" size={16} />
                  ) : (
                    "BUSCAR"
                  )}
                </button>
              </form>

              {opDataFound && (
                <div className="p-5 bg-zinc-900/30 border border-zinc-800 space-y-5 font-mono animate-in fade-in duration-300 rounded-sm">
                  <div className="flex justify-between border-b border-zinc-800/80 pb-3">
                    <span className="text-zinc-500 font-bold text-xs uppercase tracking-widest">
                      OP ENCONTRADA
                    </span>
                    <span className="text-[#FF5A00] font-black text-sm">
                      {opDataFound.op}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px] uppercase tracking-widest mb-1">
                      CLIENTE
                    </span>
                    <span className="text-white font-bold font-sans uppercase text-base">
                      {opDataFound.cliente}
                    </span>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-zinc-800/80">
                    <span className="text-[10px] text-zinc-400 font-bold block uppercase tracking-widest">
                      SELECCIONAR ARTÍCULOS PARA INGRESAR (1 PEDIDO C/U):
                    </span>
                    <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                      {opDataFound.articulos.map((art) => {
                        const isSelected = articulosSeleccionados.some(
                          (a) => a.id === art.id,
                        );
                        return (
                          <div
                            key={art.id}
                            onClick={() => toggleSeleccionArticulo(art)}
                            className={`p-3.5 border flex items-center justify-between cursor-pointer transition-colors rounded-sm ${
                              isSelected
                                ? "border-[#FF5A00] bg-[#FF5A00]/10 text-white"
                                : "border-zinc-800 bg-black text-zinc-500 hover:border-zinc-700"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 pr-3">
                              {isSelected ? (
                                <CheckSquare
                                  size={18}
                                  className="text-[#FF5A00] shrink-0"
                                />
                              ) : (
                                <Square
                                  size={18}
                                  className="text-zinc-600 shrink-0"
                                />
                              )}
                              <span className="font-sans font-bold text-xs truncate uppercase">
                                {art.modelo}
                              </span>
                            </div>
                            <span className="text-[#FFD700] font-bold text-sm shrink-0">
                              {art.cantidad} U.
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    onClick={handleCrearPedido}
                    disabled={!articulosSeleccionados.length}
                    className="w-full mt-2 bg-[#FFD700] hover:bg-white text-black font-extrabold italic uppercase text-sm p-4 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed rounded-sm"
                  >
                    Ingresar {articulosSeleccionados.length} Pedidos a Planta{" "}
                    <ChevronRight size={18} strokeWidth={3} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================
          MODAL DETALLES DEL PEDIDO (AMPLIO, SIN SCROLLS RAROS Y CON OBSERVACIONES)
      ========================================= */}
      {modalDetalleOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-2 sm:p-6 font-sans animate-in fade-in duration-200">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col relative shadow-[0_0_80px_rgba(0,0,0,0.95)] rounded-md">
            {/* CABECERA DETALLES ELEGANTE */}
            <div className="px-6 py-5 border-b border-zinc-800 flex justify-between items-center bg-[#020202] shrink-0 font-mono">
              <div className="flex items-center gap-4 min-w-0">
                <span className="text-[#FF5A00] bg-[#FF5A00]/10 border border-[#FF5A00]/30 px-3 py-1 text-xs font-black tracking-wider uppercase rounded-sm shrink-0">
                  OP-{String(modalDetalleOpen.op).replace(/^OP-/i, "")}
                </span>
                <h3 className="text-base sm:text-xl font-extrabold text-white font-sans uppercase truncate">
                  {modalDetalleOpen.cliente}
                </h3>
              </div>
              <button
                onClick={() => setModalDetalleOpen(null)}
                className="text-zinc-500 hover:text-white transition-colors cursor-pointer p-1 shrink-0"
              >
                <X size={26} />
              </button>
            </div>

            {/* CONTENIDO PRINCIPAL EN 2 COLUMNAS */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* COLUMNA IZQUIERDA: RESUMEN, ÍTEMS Y NOTAS */}
                <div className="lg:col-span-7 space-y-6">
                  {/* TARJETA ARTÍCULO Y AVANCE */}
                  <div className="bg-[#0a0a0a] p-5 border border-zinc-800/80 rounded-md space-y-3 font-mono">
                    <div className="flex justify-between items-start gap-4">
                      <div className="min-w-0">
                        <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest block mb-1">
                          ARTÍCULO A PRODUCIR
                        </span>
                        <h4 className="text-base sm:text-lg font-bold text-white font-sans leading-snug">
                          {modalDetalleOpen.articulo || "SIN ESPECIFICAR"}
                        </h4>
                      </div>
                      {modalDetalleOpen.cantidad_total > 0 && (
                        <div className="text-right shrink-0">
                          <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest block mb-1">
                            PROGRESO
                          </span>
                          <p className="text-2xl font-extrabold text-[#FFD700] leading-none">
                            {detalleData.pedido?.cantidad_completada ||
                              modalDetalleOpen.cantidad_completada}{" "}
                            <span className="text-xs text-zinc-600 font-normal">
                              / {modalDetalleOpen.cantidad_total} U.
                            </span>
                          </p>
                        </div>
                      )}
                    </div>

                    {modalDetalleOpen.cantidad_total > 0 && (
                      <div className="h-1.5 w-full bg-zinc-900 overflow-hidden rounded-full border border-zinc-800/60 mt-2">
                        <div
                          className="h-full bg-gradient-to-r from-[#FF5A00] to-[#FFD700] transition-all duration-500 ease-out rounded-full"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(
                                ((detalleData.pedido?.cantidad_completada ||
                                  modalDetalleOpen.cantidad_completada) /
                                  modalDetalleOpen.cantidad_total) *
                                  100,
                              ),
                            )}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* FORMULARIO AGREGAR ÍTEMS / CHECKPOINTS (ADMIN) */}
                  {isAdmin && (
                    <form
                      onSubmit={handleAgregarItemAdmin}
                      className="bg-[#030303] p-4 border border-zinc-800/80 rounded-md space-y-3 font-mono"
                    >
                      <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-widest">
                        + AGREGAR TAREA O CHECKPOINT DE TRABAJO
                      </span>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          required
                          value={itemDesc}
                          onChange={(e) => setItemDesc(e.target.value)}
                          placeholder="Nombre de tarea (Ej: Pegar reflectivas, Embalar)..."
                          className="flex-1 bg-black border border-zinc-800 text-white p-2.5 text-xs font-bold focus:border-[#FF5A00] outline-none font-sans"
                        />
                        <input
                          type="number"
                          min="1"
                          value={itemCant}
                          onChange={(e) => setItemCant(e.target.value)}
                          placeholder="Cant. (Opcional)"
                          className="w-full sm:w-32 bg-black border border-zinc-800 text-white p-2.5 text-xs font-bold focus:border-[#FF5A00] outline-none text-center font-mono placeholder:text-zinc-600 placeholder:font-normal"
                        />
                        <button
                          type="submit"
                          className="w-full sm:w-auto bg-[#FFD700] hover:bg-white text-black font-extrabold uppercase px-4 py-2.5 transition cursor-pointer text-xs rounded-sm shrink-0"
                        >
                          GUARDAR
                        </button>
                      </div>
                    </form>
                  )}

                  {/* LISTADO DE TAREAS Y CHECKPOINTS */}
                  <div className="space-y-3 font-mono">
                    <div className="flex justify-between items-center border-b border-zinc-800/60 pb-2">
                      <span className="text-xs uppercase font-bold text-white tracking-widest flex items-center gap-2">
                        <CheckSquare size={15} className="text-[#FF5A00]" />
                        TAREAS Y PASOS DEL PEDIDO
                      </span>
                      <span className="text-[10px] bg-zinc-900 text-zinc-400 px-2 py-0.5 rounded font-bold">
                        {detalleData.items.length} REGISTROS
                      </span>
                    </div>

                    {loadingDetalles ? (
                      <div className="flex justify-center py-8 text-[#FF5A00]">
                        <RefreshCw className="animate-spin" size={24} />
                      </div>
                    ) : detalleData.items.length === 0 ? (
                      <div className="bg-[#050505] border border-zinc-800/50 p-6 rounded-md text-center">
                        <p className="text-xs text-zinc-500 italic">
                          No hay tareas creadas para este pedido.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {detalleData.items.map((item) => {
                          const esChecklistComun =
                            !item.cantidad_objetivo ||
                            item.cantidad_objetivo === 0;
                          const cantFaltante =
                            item.cantidad_objetivo - item.cantidad_completada;
                          const pctItem =
                            item.cantidad_objetivo > 0
                              ? Math.round(
                                  (item.cantidad_completada /
                                    item.cantidad_objetivo) *
                                    100,
                                )
                              : 0;

                          return (
                            <div
                              key={item.id}
                              className="bg-[#080808] border border-zinc-800 p-4 rounded-md flex flex-col gap-3 relative overflow-hidden transition-colors hover:border-zinc-700"
                            >
                              <div className="flex justify-between items-center gap-4">
                                <div className="min-w-0 flex-1">
                                  <h5
                                    className={`text-sm font-bold font-sans ${item.completado ? "line-through text-zinc-500" : "text-white"}`}
                                  >
                                    {item.descripcion}
                                  </h5>

                                  {/* SI ES CON CANTIDAD MUESTRA EL PROGRESO */}
                                  {!esChecklistComun && (
                                    <p className="text-[10px] text-zinc-400 mt-1 font-mono">
                                      Avance:{" "}
                                      <strong className="text-emerald-400">
                                        {item.cantidad_completada}
                                      </strong>{" "}
                                      / {item.cantidad_objetivo} u. ({pctItem}%)
                                    </p>
                                  )}
                                </div>

                                {item.completado ? (
                                  <span className="text-[9px] bg-emerald-950/60 text-emerald-400 border border-emerald-800 px-2.5 py-1 font-bold uppercase shrink-0 rounded-sm tracking-wider flex items-center gap-1.5">
                                    <CheckCircle2 size={12} /> LISTO
                                  </span>
                                ) : (
                                  /* BARRAS Y BOTONES SEGÚN EL TIPO DE ÍTEM */
                                  esChecklistComun && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleTildarChecklistComun(item.id)
                                      }
                                      className="bg-[#FF5A00] hover:bg-white text-black font-extrabold px-4 py-2 text-xs uppercase transition cursor-pointer shrink-0 rounded-sm tracking-wider"
                                    >
                                      MARCAR LISTO
                                    </button>
                                  )
                                )}
                              </div>

                              {/* BARRA Y CARGA PARCIAL SOLO PARA ÍTEMS CON CANTIDAD */}
                              {!esChecklistComun && (
                                <>
                                  <div className="h-1 w-full bg-black overflow-hidden rounded-full border border-zinc-900">
                                    <div
                                      className={`h-full transition-all duration-300 ease-out ${item.completado ? "bg-emerald-500" : "bg-[#FF5A00]"}`}
                                      style={{ width: `${pctItem}%` }}
                                    />
                                  </div>

                                  {!item.completado && (
                                    <div className="bg-[#030303] p-1.5 border border-zinc-800 rounded flex items-center gap-2">
                                      <input
                                        type="number"
                                        min="1"
                                        max={cantFaltante}
                                        value={avancesInputs[item.id] || ""}
                                        onChange={(e) =>
                                          setAvancesInputs({
                                            ...avancesInputs,
                                            [item.id]: e.target.value,
                                          })
                                        }
                                        placeholder={`Cant. a registrar (Máx ${cantFaltante})...`}
                                        className="flex-1 bg-transparent text-white p-2 text-xs font-bold outline-none text-center font-mono placeholder:text-zinc-600 placeholder:font-normal"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setAvancesInputs({
                                            ...avancesInputs,
                                            [item.id]: cantFaltante,
                                          })
                                        }
                                        className="bg-zinc-900 text-zinc-400 hover:text-[#FFD700] hover:bg-zinc-800 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-widest transition cursor-pointer rounded-sm border border-zinc-800"
                                      >
                                        MAX
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRegistrarAvanceParcial(
                                            item.id,
                                            cantFaltante,
                                          )
                                        }
                                        className="bg-[#FF5A00] hover:bg-white text-black font-extrabold px-4 py-1.5 text-xs uppercase transition cursor-pointer rounded-sm shrink-0"
                                      >
                                        + CARGAR
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* SECCIÓN OBSERVACIONES / DETALLES DE LECTURA Y NOTAS */}
                  <div className="bg-[#080808] border border-zinc-800 p-4 rounded-md space-y-3 font-mono">
                    <div className="flex justify-between items-center border-b border-zinc-800/80 pb-2">
                      <span className="text-xs uppercase font-bold text-white tracking-widest flex items-center gap-2">
                        <FileText size={15} className="text-[#FFD700]" />
                        OBSERVACIONES / NOTAS DEL PEDIDO
                      </span>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={handleGuardarObservaciones}
                          disabled={savingObservaciones}
                          className="bg-zinc-800 hover:bg-[#FFD700] hover:text-black text-white text-[10px] font-bold uppercase px-3 py-1 transition cursor-pointer rounded-sm flex items-center gap-1.5"
                        >
                          <Save size={12} />
                          {savingObservaciones
                            ? "GUARDANDO..."
                            : "GUARDAR NOTA"}
                        </button>
                      )}
                    </div>

                    {isAdmin ? (
                      <textarea
                        rows={3}
                        value={observacionesInput}
                        onChange={(e) => setObservacionesInput(e.target.value)}
                        placeholder="Escribir observaciones o instrucciones especiales (Ej: Entregar por portón 2 con remito en duplicado)..."
                        className="w-full bg-black border border-zinc-800 text-zinc-300 p-3 text-xs font-sans focus:border-[#FFD700] outline-none rounded-sm resize-none"
                      />
                    ) : (
                      <div className="p-3 bg-black border border-zinc-900 text-zinc-300 text-xs font-sans min-h-[60px] rounded-sm italic">
                        {observacionesInput ||
                          "Sin observaciones registradas para este pedido."}
                      </div>
                    )}
                  </div>
                </div>

                {/* COLUMNA DERECHA: HISTORIAL Y AUDITORÍA */}
                <div className="lg:col-span-5 flex flex-col h-full bg-[#050505] border border-zinc-800/80 rounded-md overflow-hidden font-mono">
                  <div className="bg-[#080808] border-b border-zinc-800/80 p-4 shrink-0 flex items-center gap-2">
                    <History size={16} className="text-zinc-400" />
                    <span className="text-[11px] uppercase font-bold text-zinc-300 tracking-widest">
                      HISTORIAL DE MOVIMIENTOS
                    </span>
                  </div>

                  <div className="p-4 flex-1 overflow-y-auto custom-scrollbar max-h-[600px]">
                    {detalleData.historial.length === 0 ? (
                      <div className="py-12 text-center text-zinc-600 opacity-60">
                        <p className="text-xs italic">
                          El pedido aún no registra movimientos.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {detalleData.historial.map((log) => (
                          <div
                            key={log.id}
                            className="bg-[#080808] p-3 border border-zinc-800/80 rounded text-xs"
                          >
                            <div className="flex justify-between items-start gap-2 mb-1.5">
                              <p className="text-white font-bold font-sans">
                                {log.cantidad_avanzada > 0 ? (
                                  <span className="text-emerald-400">
                                    +{log.cantidad_avanzada} u.
                                  </span>
                                ) : (
                                  <span className="text-[#FFD700]">
                                    TILDADO
                                  </span>
                                )}{" "}
                                en {log.item_nombre}
                              </p>
                            </div>
                            <div className="flex justify-between items-center border-t border-zinc-900 pt-1.5">
                              <p className="text-zinc-500 text-[9px] uppercase font-bold">
                                {log.usuario}
                              </p>
                              <p className="text-zinc-500 text-[10px]">
                                {formatFechaArg(log.fecha_hora)}{" "}
                                {formatHoraArg(log.fecha_hora)} HS
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
