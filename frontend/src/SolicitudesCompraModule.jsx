import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Search,
  Plus,
  ShoppingCart,
  Printer,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Edit2,
  Trash2,
  CheckCircle2,
  PackagePlus,
  Tag,
  AlertTriangle,
  X,
  FileText,
  RefreshCw,
} from "lucide-react";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "";
const getApiUrl = (path) =>
  `${API_BASE_URL}${path.startsWith("/") ? path : "/" + path}`;

export default function SolicitudesCompraModule() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [proveedores, setProveedores] = useState([]); // Podés cargar de tu tabla
  const [loading, setLoading] = useState(true);

  // Paginación
  const tableContainerRef = useRef(null);
  const [itemsPorPagina, setItemsPorPagina] = useState(10);
  const [paginaActual, setPaginaActual] = useState(1);
  const [busqueda, setBusqueda] = useState("");
  const [columnaOrden, setColumnaOrden] = useState("id");
  const [direccionOrden, setDireccionOrden] = useState("desc");

  // Modales
  const [modalFormularioAbierto, setModalFormularioAbierto] = useState(false);
  const [modalGestionAbierto, setModalGestionAbierto] = useState(false);

  // Estado de edición/creación
  const [solicitudEditando, setSolicitudEditando] = useState(null);
  const [formFecha, setFormFecha] = useState("");
  const [formItems, setFormItems] = useState([]);

  // Impresión
  const [solicitudImprimiendo, setSolicitudImprimiendo] = useState(null);

  // ----------------------------------------------------
  // CARGA DE DATOS
  // ----------------------------------------------------
  const cargarSolicitudes = async () => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl("/api/compras/solicitudes"));
      if (res.ok) setSolicitudes(await res.json());

      // Si tenés una ruta de proveedores:
      const resProv = await fetch(getApiUrl("/api/proveedores"));
      if (resProv.ok) setProveedores(await resProv.json());
    } catch (error) {
      console.error("Error cargando solicitudes", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarSolicitudes();
  }, []);

  // ----------------------------------------------------
  // CÁLCULO DE PAGINACIÓN DINÁMICA (PERFECT BOTTOM)
  // ----------------------------------------------------
  useEffect(() => {
    if (!tableContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const height = entry.contentRect.height;
        const filas = Math.max(1, Math.floor((height - 40) / 49));
        setItemsPorPagina(filas);
      }
    });
    observer.observe(tableContainerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPaginaActual(1);
  }, [busqueda, itemsPorPagina]);

  // ----------------------------------------------------
  // MANEJO DEL FORMULARIO DE CREACIÓN/EDICIÓN
  // ----------------------------------------------------
  const abrirFormulario = (solicitud = null) => {
    if (solicitud) {
      setSolicitudEditando(solicitud);
      setFormFecha(solicitud.fecha.split("T")[0]);
      setFormItems(solicitud.items);
    } else {
      setSolicitudEditando(null);
      setFormFecha(new Date().toISOString().split("T")[0]);
      setFormItems([
        { articulo: "", proveedor: "", cantidad_solicitada: 1, prioridad: 3 },
      ]);
    }
    setModalFormularioAbierto(true);
  };

  const agregarItemFormulario = () => {
    setFormItems([
      ...formItems,
      { articulo: "", proveedor: "", cantidad_solicitada: 1, prioridad: 3 },
    ]);
  };

  const actualizarItemFormulario = (index, campo, valor) => {
    const nuevos = [...formItems];
    nuevos[index][campo] = valor;
    setFormItems(nuevos);
  };

  const eliminarItemFormulario = (index) => {
    setFormItems(formItems.filter((_, i) => i !== index));
  };

  const guardarSolicitud = async (e) => {
    e.preventDefault();
    if (formItems.length === 0) return alert("Agregá al menos un artículo");

    try {
      const url = solicitudEditando
        ? `/api/compras/solicitudes/${solicitudEditando.id}`
        : `/api/compras/solicitudes`;

      const res = await fetch(getApiUrl(url), {
        method: solicitudEditando ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: formFecha, items: formItems }),
      });

      if (res.ok) {
        setModalFormularioAbierto(false);
        cargarSolicitudes();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ----------------------------------------------------
  // GESTIÓN DE INGRESOS Y O.C.
  // ----------------------------------------------------
  const ingresarMercaderia = async (itemId, cantidadAgregada) => {
    if (!cantidadAgregada || isNaN(cantidadAgregada) || cantidadAgregada <= 0)
      return;
    try {
      await fetch(getApiUrl(`/api/compras/items/${itemId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cantidad_recibida: cantidadAgregada }),
      });
      cargarSolicitudes();
      // Actualizamos el modal local para evitar que se cierre
      setSolicitudEditando((prev) => {
        const itemIndex = prev.items.findIndex((i) => i.id === itemId);
        const newItems = [...prev.items];
        newItems[itemIndex].cantidad_recibida =
          parseFloat(newItems[itemIndex].cantidad_recibida || 0) +
          parseFloat(cantidadAgregada);
        return { ...prev, items: newItems };
      });
    } catch (err) {
      console.error(err);
    }
  };

  const actualizarOC = async (itemId, numero_oc) => {
    try {
      await fetch(getApiUrl(`/api/compras/items/${itemId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero_oc }),
      });
      cargarSolicitudes();
    } catch (err) {
      console.error(err);
    }
  };

  // ----------------------------------------------------
  // IMPRESIÓN
  // ----------------------------------------------------
  const imprimirSolicitud = (sc) => {
    setSolicitudImprimiendo(sc);
    setTimeout(() => {
      window.print();
      setSolicitudImprimiendo(null);
    }, 400);
  };

  // ----------------------------------------------------
  // FILTROS Y ORDENAMIENTO
  // ----------------------------------------------------
  const solicitudesFiltradas = useMemo(() => {
    return solicitudes.filter((sc) => {
      const matchID = String(sc.id).includes(busqueda);
      const matchArticulos = sc.items.some((i) =>
        i.articulo.toLowerCase().includes(busqueda.toLowerCase()),
      );
      return matchID || matchArticulos;
    });
  }, [solicitudes, busqueda]);

  const solicitudesOrdenadas = useMemo(() => {
    return [...solicitudesFiltradas].sort((a, b) => {
      let valA = a[columnaOrden];
      let valB = b[columnaOrden];
      if (columnaOrden === "fecha") {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      }
      if (valA < valB) return direccionOrden === "asc" ? -1 : 1;
      if (valA > valB) return direccionOrden === "asc" ? 1 : -1;
      return 0;
    });
  }, [solicitudesFiltradas, columnaOrden, direccionOrden]);

  const alternarOrden = (campo) => {
    if (columnaOrden === campo)
      setDireccionOrden((prev) => (prev === "asc" ? "desc" : "asc"));
    else {
      setColumnaOrden(campo);
      setDireccionOrden("asc");
    }
  };

  const paginadas = solicitudesOrdenadas.slice(
    (paginaActual - 1) * itemsPorPagina,
    paginaActual * itemsPorPagina,
  );
  const totalPaginas =
    Math.ceil(solicitudesOrdenadas.length / itemsPorPagina) || 1;

  // Formateador de fechas
  const formatFecha = (isoString) => {
    if (!isoString) return "-";
    const d = new Date(isoString);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };

  return (
    <div className="flex flex-col h-full bg-[#050505] text-zinc-100 p-4 md:p-6 select-none font-sans overflow-hidden print:bg-white print:p-0">
      {/* CSS PARA EL PDF DE IMPRESIÓN (ADMINISTRATIVO PROLIJO) */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          body, html, #root { background: white !important; color: black !important; }
          .print-hidden { display: none !important; }
          .print-visible { display: block !important; }
          .pdf-table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
          .pdf-table th, .pdf-table td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          .pdf-table th { background-color: #f4f4f5 !important; color: #000 !important; font-weight: bold; }
          .pdf-header { border-bottom: 2px solid #FF5A00; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
        }
        @media screen {
          .print-visible { display: none !important; }
        }
      `}</style>

      {/* HEADER DE LA SECCIÓN (Solo pantalla) */}
      <div className="print-hidden flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4 shrink-0">
        <div>
          <h1 className="text-xl md:text-3xl font-black italic tracking-tighter uppercase text-white leading-none">
            SOLICITUDES DE COMPRA
          </h1>
          <p className="text-[#FF5A00] font-bold text-[10px] md:text-[11px] tracking-widest uppercase mt-1">
            MÓDULO DE ABASTECIMIENTO
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => abrirFormulario()}
            className="bg-[#FF5A00] hover:bg-[#ff6e1f] text-white font-bold uppercase tracking-widest text-[10px] px-4 py-2.5 rounded flex items-center gap-2 transition-colors cursor-pointer shadow-md"
          >
            <Plus size={14} /> NUEVA SOLICITUD
          </button>
          <button
            onClick={cargarSolicitudes}
            className="bg-[#18181b] hover:bg-[#27272a] border border-zinc-700 text-white font-bold uppercase tracking-widest text-[10px] px-3.5 py-2.5 rounded flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* BUSCADOR Y FILTROS (Solo pantalla) */}
      <div className="print-hidden flex flex-col lg:flex-row items-center justify-between gap-3 mb-4 shrink-0">
        <div className="relative w-full sm:w-72 shrink-0">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <input
            type="text"
            placeholder="Buscar por Nro o Artículo..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full bg-[#0A0A0A] border border-zinc-800 text-zinc-200 text-xs pl-9 pr-3 py-2.5 rounded focus:outline-none focus:border-zinc-600"
          />
        </div>
      </div>

      {/* TABLA PRINCIPAL */}
      <div
        ref={tableContainerRef}
        className="print-hidden flex-1 min-h-0 border border-zinc-800/80 rounded bg-[#0A0A0A] flex flex-col overflow-hidden relative"
      >
        <div className="w-full h-full overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#050505] border-b border-zinc-800 sticky top-0 z-10">
              <tr>
                <th
                  onClick={() => alternarOrden("id")}
                  className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest cursor-pointer hover:text-white h-[40px] w-24"
                >
                  <div className="flex items-center gap-2">
                    Nro SC{" "}
                    {columnaOrden === "id" &&
                      (direccionOrden === "asc" ? (
                        <ArrowUp size={12} className="text-[#FF5A00]" />
                      ) : (
                        <ArrowDown size={12} className="text-[#FF5A00]" />
                      ))}
                  </div>
                </th>
                <th
                  onClick={() => alternarOrden("fecha")}
                  className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest cursor-pointer hover:text-white h-[40px] w-32"
                >
                  <div className="flex items-center gap-2">
                    Fecha{" "}
                    {columnaOrden === "fecha" &&
                      (direccionOrden === "asc" ? (
                        <ArrowUp size={12} className="text-[#FF5A00]" />
                      ) : (
                        <ArrowDown size={12} className="text-[#FF5A00]" />
                      ))}
                  </div>
                </th>
                <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest h-[40px]">
                  Ítems / Materiales
                </th>
                <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest h-[40px] w-48 text-center">
                  Progreso General
                </th>
                <th
                  onClick={() => alternarOrden("estado")}
                  className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest cursor-pointer hover:text-white h-[40px] w-32 text-center"
                >
                  Estado
                </th>
                <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest h-[40px] text-right w-32">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                <tr>
                  <td
                    colSpan="6"
                    className="py-12 text-center text-xs font-bold text-zinc-500 uppercase tracking-wider"
                  >
                    Cargando...
                  </td>
                </tr>
              ) : paginadas.length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    className="py-12 text-center text-xs font-bold text-zinc-500 uppercase tracking-wider"
                  >
                    No se encontraron solicitudes
                  </td>
                </tr>
              ) : (
                paginadas.map((sc) => {
                  // Calcular progreso de la SC
                  const totalSolicitado = sc.items.reduce(
                    (acc, i) => acc + parseFloat(i.cantidad_solicitada),
                    0,
                  );
                  const totalRecibido = sc.items.reduce(
                    (acc, i) => acc + parseFloat(i.cantidad_recibida || 0),
                    0,
                  );
                  const porcentaje =
                    totalSolicitado > 0
                      ? Math.min(
                          100,
                          Math.round((totalRecibido / totalSolicitado) * 100),
                        )
                      : 0;

                  // Identificar urgencia máxima
                  const maxPrioridad = Math.max(
                    ...sc.items.map((i) => i.prioridad),
                    1,
                  );

                  return (
                    <tr
                      key={sc.id}
                      className="hover:bg-zinc-900/50 transition-colors h-[49px]"
                    >
                      <td className="py-0 px-4 text-xs font-bold text-white  ">
                        SC-{String(sc.id).padStart(5, "0")}
                      </td>
                      <td className="py-0 px-4 text-xs text-zinc-400   tracking-wide">
                        {formatFecha(sc.fecha)}
                      </td>
                      <td
                        className="py-0 px-4 text-xs text-zinc-300 truncate max-w-[200px]"
                        title={sc.items.map((i) => i.articulo).join(", ")}
                      >
                        {sc.items.length} artículos{" "}
                        {maxPrioridad >= 4 && (
                          <AlertTriangle
                            size={12}
                            className="inline text-rose-500 ml-1"
                            title="Contiene artículos urgentes"
                          />
                        )}
                      </td>
                      <td className="py-0 px-4">
                        <div className="flex items-center gap-2 justify-center">
                          <span className="text-[10px]   font-bold text-zinc-400 w-8 text-right">
                            {porcentaje}%
                          </span>
                          <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${porcentaje === 100 ? "bg-emerald-500" : "bg-[#FF5A00]"}`}
                              style={{ width: `${porcentaje}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="py-0 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${
                            sc.estado === "COMPLETADA"
                              ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                              : sc.estado === "CANCELADA"
                                ? "border-rose-500/50 text-rose-400 bg-rose-500/10"
                                : "border-amber-500/50 text-amber-400 bg-amber-500/10"
                          }`}
                        >
                          {sc.estado}
                        </span>
                      </td>
                      <td className="py-0 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setSolicitudEditando(sc);
                              setModalGestionAbierto(true);
                            }}
                            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition cursor-pointer"
                            title="Gestionar Ingresos y O.C."
                          >
                            <PackagePlus size={14} />
                          </button>
                          <button
                            onClick={() => abrirFormulario(sc)}
                            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition cursor-pointer"
                            title="Editar Solicitud"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => imprimirSolicitud(sc)}
                            className="p-1.5 bg-blue-900/40 border border-blue-700/50 hover:bg-blue-800/60 text-blue-300 rounded transition cursor-pointer"
                            title="Exportar a PDF"
                          >
                            <Printer size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* FOOTER PAGINACIÓN */}
      <div className="print-hidden flex items-center justify-between mt-3 shrink-0">
        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
          PÁGINA {paginaActual} DE {totalPaginas} ({solicitudesOrdenadas.length}{" "}
          solicitudes)
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
            disabled={paginaActual === 1}
            className="p-1 border border-zinc-800 rounded hover:bg-zinc-800 text-zinc-400 disabled:opacity-30 cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() =>
              setPaginaActual((p) => Math.min(totalPaginas, p + 1))
            }
            disabled={paginaActual === totalPaginas}
            className="p-1 border border-zinc-800 rounded hover:bg-zinc-800 text-zinc-400 disabled:opacity-30 cursor-pointer"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODAL: FORMULARIO CREACIÓN / EDICIÓN                        */}
      {/* ========================================================= */}
      {modalFormularioAbierto && (
        <div className="print-hidden fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#0D0D0D] border border-zinc-800 rounded-xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden text-zinc-200 h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-[#121212] shrink-0">
              <div className="flex items-center gap-2.5">
                <ShoppingCart size={18} className="text-[#FF5A00]" />
                <h3 className="text-xs font-black tracking-widest uppercase text-white">
                  {solicitudEditando
                    ? `Editar Solicitud SC-${String(solicitudEditando.id).padStart(5, "0")}`
                    : "Nueva Solicitud de Compra"}
                </h3>
              </div>
              <button
                onClick={() => setModalFormularioAbierto(false)}
                className="text-zinc-500 hover:text-white p-1 rounded hover:bg-zinc-800 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
              <div className="mb-6 w-48">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
                  Fecha Emisión
                </label>
                <input
                  type="date"
                  value={formFecha}
                  onChange={(e) => setFormFecha(e.target.value)}
                  className="w-full bg-[#18181b] border border-zinc-700 text-white   text-xs p-2 rounded focus:border-[#FF5A00] outline-none [color-scheme:dark]"
                  required
                />
              </div>

              <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
                <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">
                  Artículos a Solicitar
                </h4>
                <button
                  type="button"
                  onClick={agregarItemFormulario}
                  className="text-[10px] font-bold uppercase text-[#FF5A00] hover:text-[#ff6e1f] flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={14} /> Añadir Fila
                </button>
              </div>

              <div className="space-y-2">
                {formItems.map((item, index) => (
                  <div
                    key={index}
                    className="flex flex-wrap md:flex-nowrap items-center gap-2 bg-[#121212] p-2 rounded border border-zinc-800/80"
                  >
                    <div className="flex-1 min-w-[200px]">
                      <input
                        type="text"
                        placeholder="Descripción del material..."
                        value={item.articulo}
                        onChange={(e) =>
                          actualizarItemFormulario(
                            index,
                            "articulo",
                            e.target.value,
                          )
                        }
                        className="w-full bg-transparent border-none text-xs text-white outline-none px-2"
                        required
                      />
                    </div>
                    <div className="w-full md:w-48 border-l border-zinc-800 pl-2">
                      <input
                        type="text"
                        placeholder="Proveedor / Marca..."
                        list="proveedores-list"
                        value={item.proveedor}
                        onChange={(e) =>
                          actualizarItemFormulario(
                            index,
                            "proveedor",
                            e.target.value,
                          )
                        }
                        className="w-full bg-transparent border-none text-xs text-zinc-300 outline-none"
                        required
                      />
                    </div>
                    <div className="w-24 border-l border-zinc-800 pl-2 flex items-center">
                      <span className="text-[9px] text-zinc-500 mr-1">
                        Cant:
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.cantidad_solicitada}
                        onChange={(e) =>
                          actualizarItemFormulario(
                            index,
                            "cantidad_solicitada",
                            e.target.value,
                          )
                        }
                        className="w-full bg-transparent border-none text-xs   font-bold text-white outline-none text-right"
                        required
                      />
                    </div>
                    <div className="w-32 border-l border-zinc-800 pl-2 flex items-center gap-1">
                      <span className="text-[9px] text-zinc-500 mr-1">
                        Urgen:
                      </span>
                      <select
                        value={item.prioridad}
                        onChange={(e) =>
                          actualizarItemFormulario(
                            index,
                            "prioridad",
                            parseInt(e.target.value),
                          )
                        }
                        className="w-full bg-transparent border-none text-xs font-bold text-white outline-none cursor-pointer [color-scheme:dark]"
                      >
                        <option value={1}>1 - Baja</option>
                        <option value={2}>2 - Normal</option>
                        <option value={3}>3 - Media</option>
                        <option value={4}>4 - Alta</option>
                        <option value={5}>5 - Urgente</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => eliminarItemFormulario(index)}
                      className="p-1.5 text-rose-500 hover:bg-rose-950/30 rounded cursor-pointer transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <datalist id="proveedores-list">
                {proveedores.map((p, idx) => (
                  <option key={idx} value={p.nombre || p} />
                ))}
              </datalist>
            </div>

            <div className="p-4 border-t border-zinc-800 bg-[#121212] flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setModalFormularioAbierto(false)}
                className="px-4 py-2 text-[10px] font-bold text-zinc-400 hover:text-white uppercase tracking-wider cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarSolicitud}
                className="bg-[#FF5A00] hover:bg-[#ff6e1f] text-white font-bold uppercase tracking-widest text-[10px] px-6 py-2 rounded shadow-md cursor-pointer flex items-center gap-2"
              >
                <CheckCircle2 size={14} /> Guardar Solicitud
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: GESTIÓN DE INGRESOS Y O.C.                           */}
      {/* ========================================================= */}
      {modalGestionAbierto && solicitudEditando && (
        <div className="print-hidden fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#0D0D0D] border border-zinc-800 rounded-xl w-full max-w-5xl shadow-2xl flex flex-col overflow-hidden text-zinc-200 h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-[#121212] shrink-0">
              <div className="flex items-center gap-3">
                <PackagePlus size={18} className="text-[#FF5A00]" />
                <h3 className="text-xs font-black tracking-widest uppercase text-white">
                  Ingresos y Seguimiento | SC-
                  {String(solicitudEditando.id).padStart(5, "0")}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${
                    solicitudEditando.estado === "COMPLETADA"
                      ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                      : "border-amber-500/50 text-amber-400 bg-amber-500/10"
                  }`}
                >
                  {solicitudEditando.estado}
                </span>
              </div>
              <button
                onClick={() => {
                  setModalGestionAbierto(false);
                  cargarSolicitudes();
                }}
                className="text-zinc-500 hover:text-white p-1 rounded hover:bg-zinc-800 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-[#09090B]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {solicitudEditando.items.map((item) => {
                  const completado =
                    parseFloat(item.cantidad_recibida) >=
                    parseFloat(item.cantidad_solicitada);
                  const valOC = item.numero_oc || "";
                  const urgColor =
                    item.prioridad === 5
                      ? "bg-rose-500 text-white"
                      : item.prioridad === 4
                        ? "bg-orange-500 text-white"
                        : "bg-zinc-700 text-zinc-200";

                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-lg border flex flex-col justify-between transition-colors ${completado ? "border-emerald-900/50 bg-emerald-950/10" : "border-zinc-800 bg-[#121212]"}`}
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h4
                            className={`text-sm font-bold uppercase tracking-wide ${completado ? "text-emerald-400" : "text-white"}`}
                          >
                            {item.articulo}
                          </h4>
                          <span
                            className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${urgColor}`}
                          >
                            Prioridad {item.prioridad}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-400   mb-3">
                          <Tag size={10} className="inline mr-1" />
                          {item.proveedor}
                        </p>

                        <div className="flex items-center gap-4 text-xs   mb-4">
                          <div>
                            <span className="text-zinc-500">Solicitado:</span>{" "}
                            <span className="font-bold text-white">
                              {item.cantidad_solicitada}
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-500">Recibido:</span>{" "}
                            <span
                              className={`font-bold ${completado ? "text-emerald-400" : "text-amber-400"}`}
                            >
                              {item.cantidad_recibida}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 border-t border-zinc-800/80 pt-3">
                        <div className="flex-1 relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-zinc-500">
                            OC:
                          </span>
                          <input
                            type="text"
                            defaultValue={valOC}
                            onBlur={(e) => {
                              if (e.target.value !== valOC)
                                actualizarOC(item.id, e.target.value);
                            }}
                            placeholder="Nro O.C."
                            className="w-full bg-[#0a0a0a] border border-zinc-700 text-white   text-[10px] pl-7 pr-2 py-1.5 rounded focus:border-[#FF5A00] outline-none"
                          />
                        </div>

                        {!completado && (
                          <div className="flex items-center gap-1 w-32">
                            <input
                              type="number"
                              id={`ingreso-${item.id}`}
                              placeholder="Cant"
                              step="0.01"
                              className="w-16 bg-[#0a0a0a] border border-zinc-700 text-white   text-[10px] p-1.5 rounded focus:border-[#FF5A00] outline-none text-center"
                            />
                            <button
                              onClick={() => {
                                const val = document.getElementById(
                                  `ingreso-${item.id}`,
                                ).value;
                                if (val) {
                                  ingresarMercaderia(item.id, val);
                                  document.getElementById(
                                    `ingreso-${item.id}`,
                                  ).value = "";
                                }
                              }}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider cursor-pointer transition"
                            >
                              Ingresar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* VISTA PARA IMPRESIÓN (SOLO VISIBLE CON WINDOW.PRINT)      */}
      {/* ========================================================= */}
      {solicitudImprimiendo && (
        <div className="print-visible w-full h-full bg-white text-black p-8 font-sans">
          <div className="pdf-header">
            <div>
              <h1 className="text-2xl font-black uppercase m-0">
                SOLICITUD DE COMPRA
              </h1>
              <p className="text-sm text-gray-600 font-bold mt-1">
                EMPRESA CONOFLEX
              </p>
            </div>
            <div className="text-right">
              <h2 className="text-lg   font-bold m-0 text-red-600">
                Nº SC-{String(solicitudImprimiendo.id).padStart(5, "0")}
              </h2>
              <p className="text-sm   mt-1 text-black font-bold">
                Fecha: {formatFecha(solicitudImprimiendo.fecha)}
              </p>
            </div>
          </div>

          <table className="pdf-table">
            <thead>
              <tr>
                <th style={{ width: "5%" }}>#</th>
                <th style={{ width: "35%" }}>
                  Artículos / Materiales Solicitados
                </th>
                <th style={{ width: "25%" }}>Proveedor Sugerido</th>
                <th style={{ width: "10%" }}>Cantidad</th>
                <th style={{ width: "10%" }}>Prioridad</th>
                <th style={{ width: "15%" }}>Nº O.C.</th>
              </tr>
            </thead>
            <tbody>
              {solicitudImprimiendo.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="text-center">{idx + 1}</td>
                  <td className="font-bold uppercase">{item.articulo}</td>
                  <td className="text-gray-700">{item.proveedor}</td>
                  <td className="text-right   font-bold">
                    {item.cantidad_solicitada}
                  </td>
                  <td className="text-center">{item.prioridad}</td>
                  <td className="text-center  ">
                    {item.numero_oc || " "}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div
            style={{
              marginTop: "50px",
              display: "flex",
              justifyContent: "space-around",
              paddingTop: "40px",
            }}
          >
            <div
              style={{
                borderTop: "1px solid black",
                width: "250px",
                textAlign: "center",
                paddingTop: "5px",
                fontSize: "12px",
              }}
            >
              Firma Solicitante
            </div>
            <div
              style={{
                borderTop: "1px solid black",
                width: "250px",
                textAlign: "center",
                paddingTop: "5px",
                fontSize: "12px",
              }}
            >
              Aprobación Compras
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
