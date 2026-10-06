import { useState, useEffect, useMemo } from "react";
import {
  Truck,
  RefreshCw,
  Search,
  PackageCheck,
  Calendar,
  User,
  Hash,
  Box,
  Layers,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export default function DespacharPedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3800);
  };

  const fetchPendientes = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/estado-pedidos/pendientes-despacho");
      const data = await res.json();
      if (res.ok) {
        setPedidos(Array.isArray(data) ? data : []);
      } else {
        showToast("Error al cargar los pedidos", "error");
      }
    } catch (err) {
      console.error("Error cargando pendientes de despacho:", err);
      showToast("Error de conexión con el servidor", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendientes();
  }, []);

  const handleSincronizar = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/estado-pedidos/sincronizar", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("Sincronización exitosa");
        await fetchPendientes();
      } else {
        showToast(data.error || "No se pudo sincronizar", "error");
      }
    } catch (err) {
      showToast("Error de conexión al sincronizar", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  // Filtrado de pedidos según la búsqueda
  const pedidosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return pedidos;
    const query = busqueda.toLowerCase();
    return pedidos.filter(
      (p) =>
        (p.op && p.op.toLowerCase().includes(query)) ||
        (p.cliente && p.cliente.toLowerCase().includes(query)) ||
        (p.modelo && p.modelo.toLowerCase().includes(query)),
    );
  }, [pedidos, busqueda]);

  const formatearFecha = (fechaStr) => {
    if (!fechaStr) return "-";
    if (fechaStr.includes("T")) {
      const [year, month, day] = fechaStr.split("T")[0].split("-");
      return `${day}/${month}/${year.slice(2)}`;
    }
    return fechaStr;
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#070a12] border border-slate-800/80 rounded-2xl font-sans text-slate-200 shadow-2xl overflow-hidden relative">
      {/* NOTIFICACIÓN TOAST */}
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

      {/* CABECERA Y ACCIONES */}
      <div className="p-4 md:p-6 border-b border-slate-800/80 bg-slate-900/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
            <Truck size={22} />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
              Despachar Pedidos
              <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono">
                {pedidosFiltrados.length} Pendientes
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Pedidos con fecha de preparación confirmada listos para despacho
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* BUSCADOR */}
          <div className="relative flex-1 sm:w-64">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por OP, cliente o modelo..."
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 transition-all"
            />
          </div>

          {/* BOTÓN SINCRONIZAR */}
          <button
            onClick={handleSincronizar}
            disabled={isSyncing}
            className="bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-semibold px-4 py-2 text-xs rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
            {isSyncing ? "Sincronizando..." : "Sincronizar"}
          </button>
        </div>
      </div>

      {/* TABLA DE PEDIDOS */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3">
            <RefreshCw size={28} className="animate-spin text-amber-400" />
            <span className="text-xs">Cargando pedidos para despacho...</span>
          </div>
        ) : pedidosFiltrados.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3 border border-dashed border-slate-800 rounded-2xl p-8">
            <PackageCheck size={36} className="text-slate-600" />
            <p className="text-sm font-medium text-slate-400">
              No hay pedidos preparados pendientes de despacho
            </p>
            <p className="text-xs text-slate-600">
              Todos los pedidos preparados ya fueron despachados o no hay
              registros pendientes.
            </p>
          </div>
        ) : (
          <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-950/40 shadow-inner">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 bg-slate-900/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Fecha Pedido</th>
                  <th className="py-3 px-4">OP</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Modelo</th>
                  <th className="py-3 px-4 text-center">Cantidad</th>
                  <th className="py-3 px-4 text-center">Preparado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-xs">
                {pedidosFiltrados.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-900/40 transition-colors"
                  >
                    <td className="py-3 px-4 text-slate-400 font-mono">
                      {formatearFecha(item.fecha)}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-amber-400">
                      {item.op || "-"}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-200">
                      {item.cliente || "-"}
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-medium">
                      {item.modelo || "-"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-block bg-slate-800/80 border border-slate-700/50 text-slate-200 font-mono px-2.5 py-0.5 rounded-md font-bold">
                        {item.cantidad}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1 rounded-lg font-mono font-medium">
                        <CheckCircle2 size={12} />
                        {formatearFecha(item.preparado)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
