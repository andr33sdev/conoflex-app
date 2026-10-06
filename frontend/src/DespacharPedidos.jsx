import { useState, useEffect, useMemo, useRef } from "react";
import {
  Truck,
  RefreshCw,
  Search,
  PackageCheck,
  CheckCircle2,
  AlertCircle,
  Filter,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  Clock,
} from "lucide-react";

export default function DespacharPedidos({ usuarioActual }) {
  const [vendedoresDisponibles, setVendedoresDisponibles] = useState([]);

  // AUTOTILDAR AL CARGAR: Si el usuario tiene vendedores asignados en su perfil, se marcan automáticamente
  const [vendedoresSeleccionados, setVendedoresSeleccionados] = useState(() => {
    return Array.isArray(usuarioActual?.vendedores) &&
      usuarioActual.vendedores.length > 0
      ? usuarioActual.vendedores
      : [];
  });

  const [ultimaSinc, setUltimaSinc] = useState(null);

  const [pedidos, setPedidos] = useState([]);
  const [buscado, setBuscado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [toast, setToast] = useState(null);

  const tableContainerRef = useRef(null);
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [currentPage, setCurrentPage] = useState(1);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3800);
  };

  const fetchVendedores = async () => {
    try {
      const res = await fetch("/api/estado-pedidos/vendedores");
      if (res.ok) {
        const data = await res.json();
        if (data.vendedores) {
          setVendedoresDisponibles(data.vendedores);
          setUltimaSinc(data.ultimaSincronizacion);
        } else if (Array.isArray(data)) {
          setVendedoresDisponibles(data);
        }
      }
    } catch (err) {
      console.error("Error cargando vendedores:", err);
    }
  };

  useEffect(() => {
    fetchVendedores();
  }, []);

  // Actualizar vendedores autotildados cuando cambie el usuario de la sesión
  useEffect(() => {
    if (
      Array.isArray(usuarioActual?.vendedores) &&
      usuarioActual.vendedores.length > 0
    ) {
      setVendedoresSeleccionados(usuarioActual.vendedores);
    }
  }, [usuarioActual]);

  useEffect(() => {
    const calculateItems = () => {
      if (!tableContainerRef.current) return;
      const height = tableContainerRef.current.clientHeight;
      const headerAndFooterHeight = 90;
      const availableHeight = height - headerAndFooterHeight;
      const rowHeight = 44;
      const calculated = Math.max(1, Math.floor(availableHeight / rowHeight));
      setItemsPerPage(calculated);
    };

    calculateItems();
    const observer = new ResizeObserver(calculateItems);
    if (tableContainerRef.current) observer.observe(tableContainerRef.current);
    return () => observer.disconnect();
  }, [buscado]);

  const toggleVendedor = (v) => {
    if (vendedoresSeleccionados.includes(v)) {
      setVendedoresSeleccionados(
        vendedoresSeleccionados.filter((x) => x !== v),
      );
    } else {
      setVendedoresSeleccionados([...vendedoresSeleccionados, v]);
    }
  };

  const handleBuscar = async () => {
    if (vendedoresSeleccionados.length === 0) {
      showToast("Seleccione al menos un vendedor", "error");
      return;
    }

    setLoading(true);
    setBuscado(true);
    setCurrentPage(1);

    try {
      const paramVendedores = vendedoresSeleccionados.join(",");
      const res = await fetch(
        `/api/estado-pedidos/pendientes-despacho?vendedores=${encodeURIComponent(paramVendedores)}`,
      );
      const data = await res.json();

      if (res.ok) {
        setPedidos(Array.isArray(data) ? data : []);
      } else {
        showToast("Error al obtener pedidos", "error");
      }
    } catch (err) {
      console.error("Error buscando pedidos:", err);
      showToast("Error de conexión al buscar", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSincronizar = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/estado-pedidos/sincronizar", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("Sincronización exitosa");
        if (data.ultimaSincronizacion) {
          setUltimaSinc(data.ultimaSincronizacion);
        }
        await fetchVendedores();
        if (buscado) await handleBuscar();
      } else {
        showToast(data.error || "Error al sincronizar", "error");
      }
    } catch (err) {
      showToast("Error de conexión al sincronizar", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const pedidosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return pedidos;
    const q = busqueda.toLowerCase();
    return pedidos.filter(
      (p) =>
        (p.op && p.op.toLowerCase().includes(q)) ||
        (p.cliente && p.cliente.toLowerCase().includes(q)) ||
        (p.modelo && p.modelo.toLowerCase().includes(q)),
    );
  }, [pedidos, busqueda]);

  const totalPages = Math.ceil(pedidosFiltrados.length / itemsPerPage) || 1;
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return pedidosFiltrados.slice(start, start + itemsPerPage);
  }, [pedidosFiltrados, currentPage, itemsPerPage]);

  const formatearFecha = (fechaStr) => {
    if (!fechaStr) return "-";
    if (fechaStr.includes("T")) {
      const [year, month, day] = fechaStr.split("T")[0].split("-");
      return `${day}/${month}/${year.slice(2)}`;
    }
    return fechaStr;
  };

  const formatearFechaHora = (fechaStr) => {
    if (!fechaStr) return null;
    try {
      const d = new Date(fechaStr);
      if (isNaN(d.getTime())) return null;
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = String(d.getFullYear()).slice(2);
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      return `${day}/${month}/${year} ${hours}:${minutes} hs`;
    } catch (e) {
      return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#070a12] border border-slate-800/80 rounded-2xl font-sans text-slate-200 shadow-2xl overflow-hidden relative">
      {/* TOAST */}
      {toast && (
        <div
          className={`absolute top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-3 backdrop-blur-xl transition-all ${
            toast.type === "error"
              ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
          }`}
        >
          {toast.type === "error" ? (
            <AlertCircle size={18} />
          ) : (
            <CheckCircle2 size={18} />
          )}
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}

      {/* CABECERA */}
      <div className="p-4 border-b border-slate-800/80 bg-slate-900/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
            <Truck size={22} />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
              Despachar Pedidos
              {buscado && (
                <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono">
                  {pedidosFiltrados.length} Encontrados
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-400">
              Pedidos preparados listos para despacho en fábrica
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {buscado && (
            <div className="relative flex-1 md:w-56">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Filtrar por OP, cliente..."
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 transition-all"
              />
            </div>
          )}

          {/* ÚLTIMA SINCRONIZACIÓN */}
          {ultimaSinc && (
            <div className="hidden sm:flex flex-col items-end text-right px-2">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-1">
                <Clock size={10} className="text-amber-400" /> Última Sinc.
              </span>
              <span className="text-xs font-mono font-bold text-amber-300">
                {formatearFechaHora(ultimaSinc)}
              </span>
            </div>
          )}

          {/* BOTÓN SINCRONIZAR */}
          <button
            onClick={handleSincronizar}
            disabled={isSyncing}
            className="bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-semibold px-4 py-2 text-xs rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer shrink-0"
          >
            <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
            {isSyncing ? "Sincronizando..." : "Sincronizar"}
          </button>
        </div>
      </div>

      {/* VENDEDORES & BUSCAR */}
      <div className="p-3 border-b border-slate-800/80 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 mr-1">
            <Filter size={13} className="text-amber-400" /> Vendedores:
          </span>

          {vendedoresDisponibles.map((v) => {
            const isChecked = vendedoresSeleccionados.includes(v);
            return (
              <button
                key={v}
                onClick={() => toggleVendedor(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                  isChecked
                    ? "bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold"
                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                {isChecked ? (
                  <CheckSquare size={14} className="text-amber-400" />
                ) : (
                  <Square size={14} />
                )}
                {v}
              </button>
            );
          })}
        </div>

        <button
          onClick={handleBuscar}
          disabled={loading}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2 text-xs rounded-xl shadow-[0_0_15px_rgba(245,158,11,0.25)] transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
        >
          <Search size={14} />
          {loading ? "Buscando..." : "BUSCAR"}
        </button>
      </div>

      {/* TABLA Y PAGINADOR */}
      <div
        className="flex-1 min-h-0 flex flex-col p-4 overflow-hidden"
        ref={tableContainerRef}
      >
        {!buscado ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3 border border-dashed border-slate-800/80 rounded-2xl p-8">
            <Filter size={36} className="text-slate-600" />
            <p className="text-sm font-medium text-slate-400">
              Seleccione al menos un vendedor y presione "BUSCAR"
            </p>
          </div>
        ) : loading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3">
            <RefreshCw size={28} className="animate-spin text-amber-400" />
            <span className="text-xs">Consultando pedidos preparados...</span>
          </div>
        ) : currentItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3 border border-dashed border-slate-800/80 rounded-2xl p-8">
            <PackageCheck size={36} className="text-slate-600" />
            <p className="text-sm font-medium text-slate-400">
              No hay pedidos pendientes de despacho para la selección
            </p>
          </div>
        ) : (
          <div className="h-full flex flex-col justify-between overflow-hidden">
            <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-950/40 shadow-inner">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-900/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Fecha Pedido</th>
                    <th className="py-2.5 px-4">OP</th>
                    <th className="py-2.5 px-4">Cliente</th>
                    <th className="py-2.5 px-4">Modelo</th>
                    <th className="py-2.5 px-4 text-center">Cantidad</th>
                    <th className="py-2.5 px-4 text-center">Preparado</th>
                    <th className="py-2.5 px-4 text-center">Vendedor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-xs">
                  {currentItems.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-900/40 transition-colors h-[42px]"
                    >
                      <td className="py-1.5 px-4 text-slate-400 font-mono">
                        {formatearFecha(item.fecha)}
                      </td>
                      <td className="py-1.5 px-4 font-mono font-bold text-amber-400">
                        {item.op || "-"}
                      </td>
                      <td className="py-1.5 px-4 font-semibold text-slate-200 truncate max-w-[220px]">
                        {item.cliente || "-"}
                      </td>
                      <td className="py-1.5 px-4 text-slate-300 font-medium truncate max-w-[220px]">
                        {item.modelo || "-"}
                      </td>
                      <td className="py-1.5 px-4 text-center">
                        <span className="inline-block bg-slate-800/80 border border-slate-700/50 text-slate-200 font-mono px-2 py-0.5 rounded-md font-bold">
                          {item.cantidad}
                        </span>
                      </td>
                      <td className="py-1.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2.5 py-0.5 rounded-lg font-mono font-medium text-[11px]">
                          <CheckCircle2 size={12} />
                          {formatearFecha(item.preparado)}
                        </span>
                      </td>
                      <td className="py-1.5 px-4 text-center">
                        <span className="inline-block bg-slate-900 border border-slate-800 text-amber-300 font-bold px-2 py-0.5 rounded-md font-mono text-[11px]">
                          {item.vendedor || "-"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-slate-800/80 text-xs text-slate-400 shrink-0">
              <span className="font-mono text-slate-500">
                Página <strong className="text-slate-200">{currentPage}</strong>{" "}
                de <strong className="text-slate-200">{totalPages}</strong> (
                {pedidosFiltrados.length} registros)
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
