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
  Package,
  History,
  CheckSquare,
  Square,
  Clock,
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

  // FORMULARIO CREACIÓN (BUSCADOR DE OP Y CHECKBOXES)
  const [opInput, setOpInput] = useState("");
  const [loadingOP, setLoadingOP] = useState(false);
  const [opDataFound, setOpDataFound] = useState(null);
  const [articulosSeleccionados, setArticulosSeleccionados] = useState([]);

  // FORMULARIO AGREGAR ÍTEM ADICIONAL EN DETALLES (ADMIN)
  const [itemDesc, setItemDesc] = useState("");
  const [itemCant, setItemCant] = useState("");

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

  // BUSCAR OP Y OBTENER MODELOS EN 'estado_pedidos'
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
        // Marcar todos los artículos encontrados por defecto
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
      if (existe) {
        return prev.filter((a) => a.id !== art.id);
      } else {
        return [...prev, art];
      }
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
        setDetalleData(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetalles(false);
    }
  };

  const handleOpenDetalles = (pedido) => {
    setModalDetalleOpen(pedido);
    fetchDetallesPedido(pedido.id);
  };

  const handleAgregarItemAdmin = async (e) => {
    e.preventDefault();
    if (!isAdmin || !modalDetalleOpen || !itemDesc.trim() || !itemCant) return;

    try {
      const res = await fetch(
        getApiUrl(`/api/pedidos/${modalDetalleOpen.id}/items`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            descripcion: itemDesc,
            cantidadObjetivo: itemCant,
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

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-black font-sans text-zinc-200 overflow-hidden relative selection:bg-[#FF5A00]/30">
      {/* HEADER HERO (TÍTULO EN BLANCO SOLO "PEDIDOS") */}
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
            className="flex items-center justify-between gap-3 px-5 py-3 bg-[#FFD700] hover:bg-white text-black font-bold text-xs uppercase tracking-widest transition-all cursor-pointer shadow-lg shadow-[#FFD700]/10 w-full sm:w-auto shrink-0"
          >
            <span>NUEVO PEDIDO</span>
            <Plus size={18} strokeWidth={3} />
          </button>
        )}
      </div>

      {/* BARRA DE BÚSQUEDA */}
      <div className="px-3 sm:px-6 md:px-8 py-3 border-b border-zinc-800/50 flex items-center justify-between gap-3 shrink-0 bg-black relative z-20">
        <div className="relative w-full md:w-80">
          <Search
            size={14}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600"
          />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por OP, cliente o artículo..."
            className="w-full bg-transparent border border-zinc-800 focus:border-[#FF5A00] text-white pl-9 pr-4 py-2 text-xs transition-colors outline-none font-mono"
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
              No hay pedidos registrados.
            </p>
          </div>
        ) : (
          <div
            ref={tableContainerRef}
            className="flex-1 min-h-0 w-full flex flex-col justify-start overflow-x-auto custom-scrollbar"
          >
            <div className="w-full border border-zinc-800/90 bg-[#030303] flex flex-col shadow-2xl h-fit min-w-[900px]">
              {/* CABECERA TABLA */}
              <div className="grid grid-cols-[100px_110px_200px_1fr_120px_110px_130px] h-12 bg-[#080808] border-b border-zinc-800/90 items-center text-zinc-500 font-mono text-[9px] font-extrabold uppercase tracking-widest shrink-0 px-4 select-none">
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
                      className="grid grid-cols-[100px_110px_200px_1fr_120px_110px_130px] h-12 items-center px-4 border-b border-zinc-900/80 last:border-b-0 text-xs hover:bg-[#0a0a0a] transition-colors shrink-0"
                    >
                      <div className="text-zinc-400 font-bold text-[10px]">
                        {formatFechaArg(p.fecha)}
                      </div>

                      <div>
                        <span className="text-[#FF5A00] bg-[#FF5A00]/10 border border-[#FF5A00]/20 px-2 py-0.5 text-[10px] font-bold">
                          OP-{String(p.op).replace(/^OP-/i, "")}
                        </span>
                      </div>

                      <div className="font-sans font-bold text-white truncate pr-2 uppercase">
                        {p.cliente}
                      </div>

                      <div className="font-sans font-bold text-zinc-300 truncate pr-2">
                        {p.articulo || "SIN ESPECIFICAR"}
                      </div>

                      <div className="text-right font-bold text-zinc-300">
                        <span className="text-emerald-400">
                          {p.cantidad_completada}
                        </span>{" "}
                        / {p.cantidad_total}
                      </div>

                      <div className="flex justify-center">
                        <span
                          className={`text-[8px] px-2 py-0.5 border font-bold uppercase tracking-widest ${getEstadoBadge(p.estado)}`}
                        >
                          {p.estado}
                        </span>
                      </div>

                      <div className="flex justify-end">
                        <button
                          onClick={() => handleOpenDetalles(p)}
                          className="px-3 py-1.5 border border-zinc-800 bg-[#050505] text-zinc-300 hover:border-[#FF5A00] hover:text-[#FF5A00] text-[9px] font-bold uppercase tracking-widest transition cursor-pointer flex items-center gap-1.5"
                        >
                          <ListChecks size={12} />
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
          MODAL NUEVO PEDIDO (ADMIN - BÚSQUEDA Y CHECKBOXES ARTÍCULOS)
      ========================================= */}
      {modalNuevoOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4 font-sans animate-in fade-in duration-150">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-xl max-h-[92vh] overflow-hidden flex flex-col relative shadow-2xl">
            <div className="p-4 sm:p-6 border-b border-zinc-800 flex justify-between items-center bg-[#020202]">
              <h3 className="text-lg sm:text-xl font-extrabold italic uppercase tracking-tighter text-white">
                Agregar <span className="text-[#FF5A00]">Pedido de OP</span>
              </h3>
              <button
                onClick={() => setModalNuevoOpen(false)}
                className="text-zinc-500 hover:text-white transition cursor-pointer p-1"
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-6 overflow-y-auto custom-scrollbar font-mono">
              <form onSubmit={handleBuscarOP} className="flex gap-2">
                <input
                  type="text"
                  required
                  value={opInput}
                  onChange={(e) => setOpInput(e.target.value)}
                  placeholder="Ingrese N° de OP (Ej: 41163)..."
                  className="flex-1 bg-black border border-zinc-800 text-white p-3 text-xs sm:text-sm font-bold focus:border-[#FF5A00] outline-none uppercase"
                />
                <button
                  type="submit"
                  disabled={loadingOP}
                  className="bg-[#FF5A00] hover:bg-white text-black font-extrabold text-xs uppercase px-4 py-3 transition cursor-pointer flex items-center gap-2"
                >
                  {loadingOP ? (
                    <RefreshCw className="animate-spin" size={16} />
                  ) : (
                    "BUSCAR OP"
                  )}
                </button>
              </form>

              {opDataFound && (
                <div className="p-4 bg-zinc-900/40 border border-zinc-800 space-y-4 font-mono text-xs animate-in fade-in duration-200">
                  <div className="flex justify-between border-b border-zinc-800 pb-2.5">
                    <span className="text-zinc-500 font-bold">OP:</span>
                    <span className="text-[#FF5A00] font-black">
                      {opDataFound.op}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">
                      CLIENTE:
                    </span>
                    <span className="text-white font-bold font-sans uppercase text-sm">
                      {opDataFound.cliente}
                    </span>
                  </div>

                  {/* SELECCIÓN DE ARTÍCULOS DE LA OP */}
                  <div className="space-y-2 pt-2 border-t border-zinc-800">
                    <span className="text-[10px] text-zinc-400 font-bold block uppercase tracking-wider">
                      SELECCIONAR ARTÍCULOS A INCLUIR EN EL PEDIDO:
                    </span>
                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                      {opDataFound.articulos.map((art) => {
                        const isSelected = articulosSeleccionados.some(
                          (a) => a.id === art.id,
                        );
                        return (
                          <div
                            key={art.id}
                            onClick={() => toggleSeleccionArticulo(art)}
                            className={`p-3 border flex items-center justify-between cursor-pointer transition-colors ${
                              isSelected
                                ? "border-[#FF5A00] bg-[#FF5A00]/10 text-white"
                                : "border-zinc-800 bg-black text-zinc-500 hover:border-zinc-700"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 pr-2">
                              {isSelected ? (
                                <CheckSquare
                                  size={16}
                                  className="text-[#FF5A00] shrink-0"
                                />
                              ) : (
                                <Square
                                  size={16}
                                  className="text-zinc-600 shrink-0"
                                />
                              )}
                              <span className="font-sans font-bold text-xs truncate uppercase">
                                {art.modelo}
                              </span>
                            </div>
                            <span className="text-[#FFD700] font-bold shrink-0">
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
                    className="w-full mt-4 bg-[#FFD700] hover:bg-white text-black font-extrabold italic uppercase text-sm p-3.5 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Confirmar e Ingresar Pedido ({articulosSeleccionados.length}
                    ) <ChevronRight size={18} strokeWidth={3} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================
          MODAL DETALLES DEL PEDIDO (AMPLIADO, ULTRA ESTÉTICO Y SIN PULSE)
      ========================================= */}
      {modalDetalleOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4 font-sans animate-in fade-in duration-150">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col relative shadow-2xl">
            {/* CABECERA DETALLES */}
            <div className="p-4 sm:p-6 border-b border-zinc-800 flex justify-between items-center bg-[#020202] shrink-0 font-mono">
              <div className="flex items-center gap-3">
                <span className="text-[#FF5A00] bg-[#FF5A00]/10 border border-[#FF5A00]/30 px-2.5 py-1 text-xs font-black tracking-wider">
                  OP-{String(modalDetalleOpen.op).replace(/^OP-/i, "")}
                </span>
                <h3 className="text-base sm:text-lg font-extrabold text-white font-sans uppercase truncate max-w-md">
                  {modalDetalleOpen.cliente}
                </h3>
              </div>
              <button
                onClick={() => setModalDetalleOpen(null)}
                className="text-zinc-500 hover:text-white transition cursor-pointer p-1"
              >
                <X size={22} />
              </button>
            </div>

            {/* CONTENIDO PRINCIPAL */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-6 custom-scrollbar font-mono">
              {/* TARJETA EJECUTIVA DE PROGRESO GLOBAL */}
              <div className="bg-black p-5 border border-zinc-800/90 shadow-xl space-y-3 relative overflow-hidden">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest block mb-1">
                      ARTÍCULO / RESUMEN
                    </span>
                    <h4 className="text-sm sm:text-base font-bold text-white font-sans">
                      {modalDetalleOpen.articulo || "SIN ESPECIFICAR"}
                    </h4>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest block mb-1">
                      PROGRESO TOTAL
                    </span>
                    <p className="text-2xl sm:text-3xl font-extrabold text-[#FFD700] leading-none">
                      {detalleData.pedido?.cantidad_completada ||
                        modalDetalleOpen.cantidad_completada}{" "}
                      / {modalDetalleOpen.cantidad_total}{" "}
                      <span className="text-xs text-zinc-500 font-normal">
                        U.
                      </span>
                    </p>
                  </div>
                </div>

                {/* BARRA DE PROGRESO GENERAL DE LA OP */}
                <div className="h-2 w-full bg-zinc-900 overflow-hidden border border-zinc-800/60 mt-3">
                  <div
                    className="h-full bg-gradient-to-r from-[#FF5A00] via-[#FFD700] to-emerald-400 transition-all duration-500 ease-out"
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
              </div>

              {/* NUEVO PUNTO DE TRABAJO (SÓLO ADMIN) */}
              {isAdmin && (
                <form
                  onSubmit={handleAgregarItemAdmin}
                  className="bg-[#030303] p-4 border border-zinc-800 space-y-3"
                >
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-widest">
                    + AGREGAR PUNTO O CHECKPOINT DE TRABAJO ADICIONAL
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      required
                      value={itemDesc}
                      onChange={(e) => setItemDesc(e.target.value)}
                      placeholder="Escribir nombre del ítem (Ej: Pegado de Reflectivas)..."
                      className="sm:col-span-2 bg-black border border-zinc-800 text-white p-2.5 text-xs font-bold focus:border-[#FF5A00] outline-none uppercase"
                    />
                    <input
                      type="number"
                      required
                      min="1"
                      value={itemCant}
                      onChange={(e) => setItemCant(e.target.value)}
                      placeholder="Cant. Objetivo"
                      className="bg-black border border-zinc-800 text-white p-2.5 text-xs font-bold focus:border-[#FF5A00] outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-zinc-800 hover:bg-white hover:text-black text-white text-[10px] font-extrabold uppercase p-2.5 transition cursor-pointer tracking-wider"
                  >
                    Guardar Punto de Trabajo
                  </button>
                </form>
              )}

              {/* CONTROLES E ÍTEMS DE TRABAJO */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-widest">
                    ÍTEMS Y ETAPAS DEL PEDIDO
                  </span>
                  <span className="text-[10px] text-zinc-600 font-bold">
                    {detalleData.items.length} REGISTROS
                  </span>
                </div>

                {loadingDetalles ? (
                  <div className="flex justify-center p-6 text-[#FF5A00]">
                    <RefreshCw className="animate-spin" size={24} />
                  </div>
                ) : detalleData.items.length === 0 ? (
                  <p className="text-xs text-zinc-600 italic bg-zinc-950 p-4 text-center border border-zinc-900">
                    No hay ítems configurados para este pedido.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {detalleData.items.map((item) => {
                      const cantFaltante =
                        item.cantidad_objetivo - item.cantidad_completada;
                      const pctItem = Math.round(
                        (item.cantidad_completada / item.cantidad_objetivo) *
                          100,
                      );

                      return (
                        <div
                          key={item.id}
                          className="bg-black border border-zinc-800/90 p-4 space-y-3 transition-colors hover:border-zinc-700"
                        >
                          <div className="flex justify-between items-start gap-4">
                            <div className="min-w-0 flex-1">
                              <h5
                                className={`text-xs sm:text-sm font-bold font-sans ${item.completado ? "line-through text-zinc-500" : "text-white"}`}
                              >
                                {item.descripcion}
                              </h5>
                              <p className="text-[10px] text-zinc-400 mt-1">
                                Avance:{" "}
                                <strong className="text-emerald-400">
                                  {item.cantidad_completada}
                                </strong>{" "}
                                / {item.cantidad_objetivo} u. ({pctItem}%)
                              </p>
                            </div>
                            {item.completado ? (
                              <span className="text-[9px] bg-emerald-950/60 text-emerald-400 border border-emerald-800/80 px-2.5 py-1 font-bold uppercase shrink-0">
                                COMPLETADO
                              </span>
                            ) : (
                              <span className="text-[9px] bg-zinc-900 text-zinc-400 border border-zinc-800 px-2.5 py-1 font-bold uppercase shrink-0">
                                EN PROCESO
                              </span>
                            )}
                          </div>

                          {/* BARRA DE PROGRESO POR ÍTEM */}
                          <div className="h-1.5 w-full bg-zinc-900 overflow-hidden border border-zinc-800/50">
                            <div
                              className="h-full bg-[#FF5A00] transition-all duration-300 ease-out"
                              style={{ width: `${pctItem}%` }}
                            />
                          </div>

                          {/* CONTROLES DE AVANCE PARCIAL (PRODUCCIÓN/ADMIN) */}
                          {!item.completado && (
                            <div className="pt-2.5 border-t border-zinc-900 flex flex-col sm:flex-row items-center gap-2">
                              <div className="relative flex-1 w-full">
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
                                  placeholder={`Ingresar cant. a avanzar (Máx ${cantFaltante})...`}
                                  className="w-full bg-[#050505] border border-zinc-800 text-white p-2.5 text-xs font-bold outline-none focus:border-[#FFD700]"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setAvancesInputs({
                                      ...avancesInputs,
                                      [item.id]: cantFaltante,
                                    })
                                  }
                                  className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-zinc-800 text-[#FFD700] hover:bg-[#FFD700] hover:text-black px-2 py-1 text-[9px] font-bold uppercase tracking-widest transition cursor-pointer"
                                >
                                  MAX
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  handleRegistrarAvanceParcial(
                                    item.id,
                                    cantFaltante,
                                  )
                                }
                                className="w-full sm:w-auto bg-[#FF5A00] hover:bg-white text-black font-extrabold px-5 py-2.5 text-xs uppercase transition cursor-pointer shrink-0"
                              >
                                + REGISTRAR AVANCE
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* TIMELINE DE AUDITORÍA */}
              <div className="pt-4 border-t border-zinc-800 space-y-3">
                <span className="text-[10px] uppercase font-bold text-zinc-500 block tracking-widest">
                  AUDITORÍA Y HISTORIAL DE REGISTROS
                </span>

                {detalleData.historial.length === 0 ? (
                  <p className="text-xs text-zinc-600 italic bg-zinc-950 p-3 text-center border border-zinc-900">
                    No hay movimientos registrados.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {detalleData.historial.map((log) => (
                      <div
                        key={log.id}
                        className="bg-black p-3 border border-zinc-800/80 flex justify-between items-center text-xs"
                      >
                        <div>
                          <p className="text-white font-bold">
                            +{log.cantidad_avanzada} u. en {log.item_nombre}
                          </p>
                          <p className="text-zinc-500 text-[9px] uppercase mt-0.5">
                            {log.usuario}
                          </p>
                        </div>
                        <p className="text-zinc-500 text-[10px] font-bold">
                          {formatFechaArg(log.fecha_hora)}{" "}
                          {formatHoraArg(log.fecha_hora)} HS
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
