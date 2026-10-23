import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Search,
  Plus,
  ShoppingCart,
  Printer,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Edit2,
  Trash2,
  CheckCircle2,
  PackagePlus,
  Tag,
  AlertTriangle,
  X,
  RefreshCw,
  Boxes,
  Building2,
  Flame,
  Check,
  PackageCheck,
  Share2,
} from "lucide-react";

import logo from "./assets/logo.svg";
import FirmaSolicitudPublica from "./FirmaSolicitudPublica";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "";
const getApiUrl = (path) =>
  `${API_BASE_URL}${path.startsWith("/") ? path : "/" + path}`;

// Configuración visual de prioridades (1 a 5)
const NIVELES_PRIORIDAD = [
  {
    valor: 1,
    label: "1 - Baja",
    badgeBg: "bg-blue-500/15",
    border: "border-blue-500/30",
    text: "text-blue-400",
    dot: "bg-blue-400",
  },
  {
    valor: 2,
    label: "2 - Normal",
    badgeBg: "bg-emerald-500/15",
    border: "border-emerald-500/30",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  {
    valor: 3,
    label: "3 - Media",
    badgeBg: "bg-amber-500/15",
    border: "border-amber-500/30",
    text: "text-amber-400",
    dot: "bg-amber-400",
  },
  {
    valor: 4,
    label: "4 - Alta",
    badgeBg: "bg-orange-500/20",
    border: "border-orange-500/40",
    text: "text-orange-400",
    dot: "bg-orange-400",
  },
  {
    valor: 5,
    label: "5 - Urgente",
    badgeBg: "bg-rose-500/25",
    border: "border-rose-500/50",
    text: "text-rose-400",
    dot: "bg-rose-400 shadow-[0_0_8px_#f43f5e]",
  },
];

function PrioridadDropdown({ valor, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const dropdownRef = useRef(null);

  const seleccionada = useMemo(
    () =>
      NIVELES_PRIORIDAD.find((p) => p.valor === valor) || NIVELES_PRIORIDAD[2],
    [valor],
  );

  useEffect(() => {
    const handleClickAfuera = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", handleClickAfuera);
    return () => document.removeEventListener("mousedown", handleClickAfuera);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setAbierto((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded border text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${seleccionada.badgeBg} ${seleccionada.border} ${seleccionada.text} hover:brightness-125 shadow-sm`}
      >
        <div className="flex items-center gap-1.5 truncate">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${seleccionada.dot}`}
          />
          <span className="truncate">{seleccionada.label}</span>
        </div>
        <ChevronDown
          size={13}
          className={`shrink-0 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`}
        />
      </button>

      {abierto && (
        <div className="absolute right-0 mt-1.5 w-44 bg-[#0e0e11] border border-zinc-800 rounded-lg shadow-2xl p-1 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-2 py-1 text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest border-b border-zinc-800/80 mb-1 flex items-center gap-1">
            <Flame size={10} className="text-[#FF5A00]" />
            Nivel de Prioridad
          </div>
          {NIVELES_PRIORIDAD.map((p) => {
            const esActivo = p.valor === valor;
            return (
              <button
                key={p.valor}
                type="button"
                onClick={() => {
                  onChange(p.valor);
                  setAbierto(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer text-left ${
                  esActivo
                    ? `${p.badgeBg} ${p.text} border ${p.border}`
                    : "text-zinc-300 hover:text-white hover:bg-zinc-800/70 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${p.dot}`} />
                  <span>{p.label}</span>
                </div>
                {p.valor === 5 && (
                  <span className="text-[8px] bg-rose-500/20 text-rose-300 px-1 py-0.2 rounded font-black border border-rose-500/40">
                    CRÍTICO
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InputAutocompletado({
  valor,
  onChange,
  placeholder,
  sugerenciasDisponibles = [],
  icono: Icono,
  anchoDropdown = "min-w-[450px] md:min-w-[580px]",
}) {
  const [enfocado, setEnfocado] = useState(false);
  const contenedorRef = useRef(null);

  const coincidencias = useMemo(() => {
    const texto = (valor || "").trim().toLowerCase();
    if (texto.length === 0) return [];

    return sugerenciasDisponibles
      .filter((item) => {
        const nombre = (
          typeof item === "string" ? item : item.nombre || item.articulo || ""
        ).toLowerCase();
        return nombre.includes(texto);
      })
      .slice(0, 8);
  }, [valor, sugerenciasDisponibles]);

  useEffect(() => {
    const handleClickFuera = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
        setEnfocado(false);
      }
    };
    document.addEventListener("mousedown", handleClickFuera);
    return () => document.removeEventListener("mousedown", handleClickFuera);
  }, []);

  return (
    <div className="relative w-full" ref={contenedorRef}>
      <div className="flex items-center gap-1.5 w-full">
        {Icono && <Icono size={13} className="text-zinc-500 shrink-0 ml-1" />}
        <input
          type="text"
          value={valor}
          onFocus={() => setEnfocado(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setEnfocado(true);
          }}
          placeholder={placeholder}
          className="w-full bg-transparent border-none text-xs text-white placeholder-zinc-500 outline-none px-1 py-1"
          required
        />
      </div>

      {enfocado && coincidencias.length > 0 && (
        <div
          className={`absolute left-0 top-full mt-2 ${anchoDropdown} max-w-[85vw] bg-[#0c0c10] border border-zinc-700 rounded-xl shadow-[0_10px_35px_rgba(0,0,0,0.85)] p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 max-h-60 overflow-y-auto custom-scrollbar`}
        >
          <div className="px-2.5 py-1 text-[8px] font-black text-zinc-500 uppercase tracking-widest border-b border-zinc-800/80 mb-1 flex items-center justify-between">
            <span>Coincidencias encontradas ({coincidencias.length})</span>
            <span className="text-[8px] text-zinc-600 font-mono">
              ENTER / CLIC
            </span>
          </div>
          {coincidencias.map((item, idx) => {
            const textoItem =
              typeof item === "string" ? item : item.nombre || item.articulo;
            return (
              <button
                key={idx}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(textoItem);
                  setEnfocado(false);
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-zinc-200 hover:text-white hover:bg-[#FF5A00]/20 hover:border-[#FF5A00]/40 border border-transparent transition-all cursor-pointer flex items-center justify-between gap-3 group"
              >
                <span className="text-zinc-100 group-hover:text-white break-words pr-2 leading-snug">
                  {textoItem}
                </span>
                <span className="text-[9px] text-zinc-500 group-hover:text-[#FF5A00] uppercase font-bold shrink-0 bg-black/60 px-2 py-0.5 rounded border border-zinc-800 font-mono">
                  Seleccionar
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SolicitudesCompraModule() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [materiasPrimas, setMateriasPrimas] = useState([]);
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
  const [modalFirmaManual, setModalFirmaManual] = useState(null);

  // Edición
  const [solicitudEditando, setSolicitudEditando] = useState(null);
  const [formFecha, setFormFecha] = useState("");
  const [formItems, setFormItems] = useState([]);

  // Impresión
  const [solicitudImprimiendo, setSolicitudImprimiendo] = useState(null);

  const cargarSolicitudes = async () => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl("/api/compras/solicitudes"));
      if (res.ok) setSolicitudes(await res.json());

      const resProv = await fetch(getApiUrl("/api/proveedores"));
      if (resProv.ok) {
        const dataProv = await resProv.json();
        setProveedores(Array.isArray(dataProv) ? dataProv : []);
      }

      const resMP = await fetch(getApiUrl("/api/materias-primas"));
      if (resMP.ok) {
        const dataMP = await resMP.json();
        setMateriasPrimas(Array.isArray(dataMP) ? dataMP : []);
      }
    } catch (error) {
      console.error("Error cargando solicitudes", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarSolicitudes();
  }, []);

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

  const imprimirSolicitud = (sc) => {
    setSolicitudImprimiendo(sc);
    setTimeout(() => {
      window.print();
      setSolicitudImprimiendo(null);
    }, 300);
  };

  const compartirPorWhatsApp = (scId, rol) => {
    const enlaceFirma = `${window.location.origin}/?firmar_sc=${scId}&rol=${rol}`;
    const rolTexto =
      rol === "gerente"
        ? "Gerente de Producción (Autorización)"
        : "Jefe de Producción (Solicitud)";
    const mensaje = `Hola, te comparto la Solicitud de Compra Nº SC-${String(scId).padStart(5, "0")} para tu revisión y firma digital como ${rolTexto}:\n\n${enlaceFirma}`;
    window.open(
      `https://api.whatsapp.com/send?text=${encodeURIComponent(mensaje)}`,
      "_blank",
    );
  };

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

  const formatFecha = (isoString) => {
    if (!isoString) return "-";
    const d = new Date(isoString);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };

  return (
    <div className="flex flex-col h-full bg-[#050505] text-zinc-100 p-4 md:p-6 select-none font-sans overflow-hidden print:bg-white print:p-0 print:m-0 print:h-auto print:overflow-visible">
      {/* CSS DE IMPRESIÓN PROFESIONAL MULTIPÁGINA */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
          *, *::before, *::after {
            box-sizing: border-box;
          }
          html, body, #root, #root > div, #root > div > div, main, main > div {
            display: block !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            position: static !important;
            transform: none !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
          }
          .print-hidden, .bg-dots-orange, .animate-dots-drift {
            display: none !important;
          }
          .print-visible {
            display: block !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          table {
            page-break-inside: auto !important;
          }
          thead {
            display: table-header-group !important; /* Repite encabezados si pasa a otra hoja */
          }
          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .bloque-firmas-print {
            page-break-inside: avoid !important;
            break-inside: avoid !important; /* NUNCA SE CORTA POR LA MITAD */
            margin-top: 35px !important;
            padding-top: 15px !important;
          }
        }
        @media screen {
          .print-visible { display: none !important; }
        }
      `}</style>

      {/* HEADER DE LA SECCIÓN */}
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

      {/* BUSCADOR */}
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
                  className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest cursor-pointer hover:text-white h-[40px] w-36"
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
                <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest h-[40px] w-36 text-center">
                  Firmas
                </th>
                <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest h-[40px] w-48 text-center">
                  Progreso
                </th>
                <th
                  onClick={() => alternarOrden("estado")}
                  className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest cursor-pointer hover:text-white h-[40px] w-32 text-center"
                >
                  Estado
                </th>
                <th className="py-3 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest h-[40px] text-right w-44">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                <tr>
                  <td
                    colSpan="7"
                    className="py-12 text-center text-xs font-bold text-zinc-500 uppercase tracking-wider"
                  >
                    Cargando...
                  </td>
                </tr>
              ) : paginadas.length === 0 ? (
                <tr>
                  <td
                    colSpan="7"
                    className="py-12 text-center text-xs font-bold text-zinc-500 uppercase tracking-wider"
                  >
                    No se encontraron solicitudes
                  </td>
                </tr>
              ) : (
                paginadas.map((sc) => {
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
                  const maxPrioridad = Math.max(
                    ...sc.items.map((i) => i.prioridad),
                    1,
                  );

                  return (
                    <tr
                      key={sc.id}
                      className="hover:bg-zinc-900/50 transition-colors h-[49px]"
                    >
                      <td className="py-0 px-4 text-xs font-bold text-white font-mono">
                        SC-{String(sc.id).padStart(5, "0")}
                      </td>
                      <td className="py-0 px-4 text-xs text-zinc-400 font-mono tracking-wide">
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
                      <td className="py-0 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5 text-[8px] font-mono font-bold uppercase">
                          <span
                            className={`px-1.5 py-0.5 rounded border ${sc.firma_jefe ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" : "border-zinc-800 text-zinc-500"}`}
                          >
                            Jefe {sc.firma_jefe ? "✓" : "—"}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded border ${sc.firma_gerente ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" : "border-zinc-800 text-zinc-500"}`}
                          >
                            Ger. {sc.firma_gerente ? "✓" : "—"}
                          </span>
                        </div>
                      </td>
                      <td className="py-0 px-4">
                        <div className="flex items-center gap-2 justify-center">
                          <span className="text-[10px] font-mono font-bold text-zinc-400 w-8 text-right">
                            {porcentaje}%
                          </span>
                          <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${porcentaje === 100 ? "bg-emerald-500" : "bg-[#FF5A00]"}`}
                              style={{ width: `${porcentaje}%` }}
                            />
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
                          <div className="relative group">
                            <button
                              className="p-1.5 bg-emerald-950/40 border border-emerald-700/50 hover:bg-emerald-800/60 text-emerald-400 rounded transition cursor-pointer"
                              title="Compartir enlace para firmar (WhatsApp)"
                            >
                              <Share2 size={14} />
                            </button>
                            <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col bg-[#0c0c10] border border-zinc-700 rounded-lg p-1 w-48 shadow-xl z-30">
                              <button
                                onClick={() =>
                                  compartirPorWhatsApp(sc.id, "gerente")
                                }
                                className="text-left px-2.5 py-1.5 text-[10px] font-bold text-zinc-300 hover:text-white hover:bg-zinc-800 rounded uppercase"
                              >
                                📲 WhatsApp a Gerente
                              </button>
                              <button
                                onClick={() =>
                                  compartirPorWhatsApp(sc.id, "jefe")
                                }
                                className="text-left px-2.5 py-1.5 text-[10px] font-bold text-zinc-300 hover:text-white hover:bg-zinc-800 rounded uppercase"
                              >
                                📲 WhatsApp a Jefe
                              </button>
                              <button
                                onClick={() =>
                                  setModalFirmaManual({
                                    id: sc.id,
                                    rol: "jefe",
                                  })
                                }
                                className="text-left px-2.5 py-1.5 text-[10px] font-bold text-[#FF5A00] hover:bg-zinc-800 rounded uppercase border-t border-zinc-800"
                              >
                                ✍️ Firmar Jefe aquí
                              </button>
                              <button
                                onClick={() =>
                                  setModalFirmaManual({
                                    id: sc.id,
                                    rol: "gerente",
                                  })
                                }
                                className="text-left px-2.5 py-1.5 text-[10px] font-bold text-[#FF5A00] hover:bg-zinc-800 rounded uppercase"
                              >
                                ✍️ Firmar Gerente aquí
                              </button>
                            </div>
                          </div>

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

      {/* MODAL PARA FIRMAR DIRECTAMENTE EN LA APP */}
      {modalFirmaManual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div className="w-full max-w-xl">
            <FirmaSolicitudPublica
              id={modalFirmaManual.id}
              rol={modalFirmaManual.rol}
              onVolver={() => {
                setModalFirmaManual(null);
                cargarSolicitudes();
              }}
            />
          </div>
        </div>
      )}

      {/* MODAL: FORMULARIO CREACIÓN / EDICIÓN */}
      {modalFormularioAbierto && (
        <div className="print-hidden fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#0A0A0D] border border-zinc-800 rounded-xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden text-zinc-200 h-[88vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-[#111114] shrink-0">
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
                className="text-zinc-500 hover:text-white p-1 rounded hover:bg-zinc-800 cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar pb-32">
              <div className="mb-6 w-52">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">
                  Fecha Emisión
                </label>
                <input
                  type="date"
                  value={formFecha}
                  onChange={(e) => setFormFecha(e.target.value)}
                  className="w-full bg-[#141418] border border-zinc-750 text-white font-mono text-xs p-2 rounded focus:border-[#FF5A00] outline-none [color-scheme:dark]"
                  required
                />
              </div>

              <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
                <h4 className="text-[11px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Boxes size={14} className="text-[#FF5A00]" /> Artículos a
                  Solicitar
                </h4>
                <button
                  type="button"
                  onClick={agregarItemFormulario}
                  className="text-[10px] font-bold uppercase text-[#FF5A00] hover:text-[#ff782e] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus size={14} /> Añadir Fila
                </button>
              </div>

              <div className="space-y-3">
                {formItems.map((item, index) => (
                  <div
                    key={index}
                    className="flex flex-wrap md:flex-nowrap items-center gap-2 bg-[#121216] p-2.5 rounded-lg border border-zinc-800/90 shadow-sm transition-all focus-within:border-zinc-700"
                  >
                    <div className="flex-1 min-w-[210px]">
                      <InputAutocompletado
                        valor={item.articulo}
                        onChange={(val) =>
                          actualizarItemFormulario(index, "articulo", val)
                        }
                        placeholder="Buscar materia prima..."
                        sugerenciasDisponibles={materiasPrimas}
                        icono={Boxes}
                        anchoDropdown="min-w-[450px] md:min-w-[580px]"
                      />
                    </div>
                    <div className="w-full md:w-56 border-t md:border-t-0 md:border-l border-zinc-800/90 pt-2 md:pt-0 md:pl-2">
                      <InputAutocompletado
                        valor={item.proveedor}
                        onChange={(val) =>
                          actualizarItemFormulario(index, "proveedor", val)
                        }
                        placeholder="Buscar proveedor..."
                        sugerenciasDisponibles={proveedores}
                        icono={Building2}
                        anchoDropdown="min-w-[320px] md:min-w-[380px]"
                      />
                    </div>
                    <div className="w-24 border-t md:border-t-0 md:border-l border-zinc-800/90 pt-2 md:pt-0 md:pl-2 flex items-center">
                      <span className="text-[9px] text-zinc-500 mr-1 uppercase font-bold">
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
                        className="w-full bg-transparent border-none text-xs font-mono font-bold text-white outline-none text-right"
                        required
                      />
                    </div>
                    <div className="w-36 border-t md:border-t-0 md:border-l border-zinc-800/90 pt-2 md:pt-0 md:pl-2">
                      <PrioridadDropdown
                        valor={item.prioridad}
                        onChange={(nuevoValor) =>
                          actualizarItemFormulario(
                            index,
                            "prioridad",
                            nuevoValor,
                          )
                        }
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => eliminarItemFormulario(index)}
                      className="p-1.5 text-rose-500 hover:text-white hover:bg-rose-950/40 rounded cursor-pointer transition-colors"
                      title="Eliminar este artículo"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-zinc-800 bg-[#111114] flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setModalFormularioAbierto(false)}
                className="px-4 py-2 text-[10px] font-bold text-zinc-400 hover:text-white uppercase tracking-wider cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarSolicitud}
                className="bg-[#FF5A00] hover:bg-[#ff6e1f] text-white font-bold uppercase tracking-widest text-[10px] px-6 py-2 rounded shadow-md cursor-pointer flex items-center gap-2 transition-all active:scale-95"
              >
                <CheckCircle2 size={14} /> Guardar Solicitud
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GESTIÓN DE INGRESOS (ORDENADO DE 5 A 1 POR PRIORIDAD) */}
      {modalGestionAbierto &&
        solicitudEditando &&
        (() => {
          const itemsOrdenados = [...solicitudEditando.items].sort(
            (a, b) => b.prioridad - a.prioridad,
          );

          const totalSolicitado = itemsOrdenados.reduce(
            (acc, i) => acc + parseFloat(i.cantidad_solicitada),
            0,
          );
          const totalRecibido = itemsOrdenados.reduce(
            (acc, i) => acc + parseFloat(i.cantidad_recibida || 0),
            0,
          );
          const porcentajeGeneral =
            totalSolicitado > 0
              ? Math.min(
                  100,
                  Math.round((totalRecibido / totalSolicitado) * 100),
                )
              : 0;
          const totalItems = itemsOrdenados.length;
          const itemsCompletados = itemsOrdenados.filter(
            (i) =>
              parseFloat(i.cantidad_recibida || 0) >=
              parseFloat(i.cantidad_solicitada),
          ).length;

          return (
            <div className="print-hidden fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 md:p-6 animate-in fade-in duration-200">
              <div className="bg-[#0B0B0E] border border-zinc-800 rounded-xl w-full max-w-6xl shadow-2xl flex flex-col overflow-hidden text-zinc-200 h-[88vh]">
                <div className="px-5 py-3.5 border-b border-zinc-800 bg-[#101014] shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <PackageCheck size={20} className="text-[#FF5A00]" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-black tracking-widest uppercase text-white font-mono">
                          RECEPCIÓN DE MERCADERÍA • SC-
                          {String(solicitudEditando.id).padStart(5, "0")}
                        </h3>
                        <span
                          className={`px-2 py-0.2 rounded text-[8px] font-black uppercase tracking-widest border ${
                            solicitudEditando.estado === "COMPLETADA"
                              ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                              : "border-amber-500/50 text-amber-400 bg-amber-500/10"
                          }`}
                        >
                          {solicitudEditando.estado}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        Emisión: {formatFecha(solicitudEditando.fecha)} •{" "}
                        {itemsCompletados} de {totalItems} ítems completos
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-zinc-400">
                        {porcentajeGeneral}%
                      </span>
                      <div className="w-28 h-2 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
                        <div
                          className={`h-full transition-all duration-300 ${porcentajeGeneral === 100 ? "bg-emerald-500" : "bg-[#FF5A00]"}`}
                          style={{ width: `${porcentajeGeneral}%` }}
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setModalGestionAbierto(false);
                        cargarSolicitudes();
                      }}
                      className="text-zinc-500 hover:text-white p-1.5 rounded hover:bg-zinc-800 cursor-pointer transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-[#070709]">
                  <div className="border border-zinc-800/90 rounded-lg overflow-hidden bg-[#0D0D10]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-[#121216] border-b border-zinc-800 text-[9px] uppercase tracking-wider text-zinc-400 sticky top-0 z-10">
                        <tr>
                          <th className="py-2.5 px-3 w-10 text-center">#</th>
                          <th className="py-2.5 px-3">
                            Artículo / Materia Prima
                          </th>
                          <th className="py-2.5 px-3 w-44">
                            Proveedor Sugerido
                          </th>
                          <th className="py-2.5 px-3 w-28 text-center">
                            Prioridad (Urgencia)
                          </th>
                          <th className="py-2.5 px-3 w-20 text-right">
                            Pedida
                          </th>
                          <th className="py-2.5 px-3 w-20 text-right">
                            Recibida
                          </th>
                          <th className="py-2.5 px-3 w-20 text-right">Saldo</th>
                          <th className="py-2.5 px-3 w-36 text-center">
                            Nº O.C.
                          </th>
                          <th className="py-2.5 px-3 w-56 text-center">
                            Ingreso Parcial / Total
                          </th>
                          <th className="py-2.5 px-3 w-24 text-center">
                            Estado
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60 font-sans">
                        {itemsOrdenados.map((item, idx) => {
                          const cantPedida =
                            parseFloat(item.cantidad_solicitada) || 0;
                          const cantRecibida =
                            parseFloat(item.cantidad_recibida) || 0;
                          const saldo = Math.max(0, cantPedida - cantRecibida);
                          const completado = cantRecibida >= cantPedida;
                          const valOC = item.numero_oc || "";
                          const urgConfig =
                            NIVELES_PRIORIDAD.find(
                              (p) => p.valor === item.prioridad,
                            ) || NIVELES_PRIORIDAD[2];

                          return (
                            <tr
                              key={item.id}
                              className={`transition-colors ${completado ? "bg-emerald-950/10 hover:bg-emerald-950/20" : "hover:bg-zinc-850/40"}`}
                            >
                              <td className="py-2 px-3 text-center text-zinc-500 font-mono text-[10px]">
                                {idx + 1}
                              </td>
                              <td className="py-2 px-3 font-bold text-white uppercase text-xs">
                                {item.articulo}
                              </td>
                              <td className="py-2 px-3 text-zinc-400 text-[11px] truncate max-w-[150px]">
                                {item.proveedor || "-"}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span
                                  className={`inline-block text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${urgConfig.badgeBg} ${urgConfig.border} ${urgConfig.text}`}
                                >
                                  {urgConfig.label}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-zinc-200">
                                {cantPedida.toLocaleString("es-AR")}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-amber-400">
                                {cantRecibida.toLocaleString("es-AR")}
                              </td>
                              <td
                                className={`py-2 px-3 text-right font-mono font-bold ${saldo === 0 ? "text-zinc-600" : "text-rose-400"}`}
                              >
                                {saldo.toLocaleString("es-AR")}
                              </td>
                              <td className="py-1.5 px-3">
                                <input
                                  type="text"
                                  defaultValue={valOC}
                                  onBlur={(e) => {
                                    if (e.target.value !== valOC)
                                      actualizarOC(item.id, e.target.value);
                                  }}
                                  placeholder="Sin O.C."
                                  className="w-full bg-[#050507] border border-zinc-700/80 text-white font-mono text-[10px] px-2 py-1 rounded focus:border-[#FF5A00] outline-none text-center"
                                />
                              </td>
                              <td className="py-1.5 px-3">
                                {completado ? (
                                  <div className="flex items-center justify-center gap-1 text-emerald-400 font-bold text-[10px] uppercase">
                                    <Check size={13} />
                                    <span>Totalmente Recibido</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center gap-1.5">
                                    <input
                                      type="number"
                                      id={`input-ingreso-${item.id}`}
                                      placeholder="Cant"
                                      step="0.01"
                                      min="0.01"
                                      max={saldo}
                                      className="w-20 bg-[#050507] border border-zinc-700 text-white font-mono text-[11px] p-1 rounded focus:border-emerald-500 outline-none text-right font-bold"
                                    />
                                    <button
                                      onClick={() => {
                                        const el = document.getElementById(
                                          `input-ingreso-${item.id}`,
                                        );
                                        if (el && el.value) {
                                          ingresarMercaderia(item.id, el.value);
                                          el.value = "";
                                        }
                                      }}
                                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider cursor-pointer transition shadow-sm"
                                    >
                                      Ingresar
                                    </button>
                                    <button
                                      onClick={() =>
                                        ingresarMercaderia(item.id, saldo)
                                      }
                                      title={`Ingresar el saldo restante completo (${saldo})`}
                                      className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 px-1.5 py-1 rounded text-[9px] font-bold uppercase cursor-pointer transition"
                                    >
                                      Todo
                                    </button>
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {completado ? (
                                  <span className="inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-emerald-500/50 text-emerald-400 bg-emerald-500/10">
                                    Completo
                                  </span>
                                ) : cantRecibida > 0 ? (
                                  <span className="inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-amber-500/50 text-amber-400 bg-amber-500/10">
                                    Parcial
                                  </span>
                                ) : (
                                  <span className="inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-zinc-700 text-zinc-400 bg-zinc-850">
                                    Pendiente
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-zinc-800 bg-[#101014] flex justify-between items-center text-xs text-zinc-500">
                  <span className="font-mono text-[10px]">
                    Los cambios de número de O.C. se guardan automáticamente al
                    salir de la celda.
                  </span>
                  <button
                    onClick={() => {
                      setModalGestionAbierto(false);
                      cargarSolicitudes();
                    }}
                    className="bg-white hover:bg-zinc-200 text-black font-bold uppercase tracking-widest text-[10px] px-5 py-2 rounded transition cursor-pointer shadow-sm"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ========================================================= */}
      {/* VISTA PARA IMPRESIÓN OFICIAL (PDF MULTIPÁGINA INTELIGENTE)*/}
      {/* ========================================================= */}
      {solicitudImprimiendo &&
        (() => {
          const itemsOrdenadosPDF = [...solicitudImprimiendo.items].sort(
            (a, b) => b.prioridad - a.prioridad,
          );

          return (
            <div className="print-visible w-full bg-white text-zinc-900 font-sans leading-tight">
              {/* CABECERA MEMBRETADA */}
              <div className="flex items-center justify-between pb-5 border-b-2 border-zinc-900">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full overflow-hidden border border-zinc-200 shrink-0">
                    <img
                      src={logo}
                      alt="Conoflex Logo"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h1 className="text-xl font-black italic tracking-tighter uppercase text-zinc-950 leading-none">
                      CONOFLEX APP
                    </h1>
                    <p className="text-[10px] font-bold text-[#FF5A00] tracking-widest uppercase mt-1">
                      GESTIÓN DE PRODUCCIÓN
                    </p>
                  </div>
                </div>

                <div className="text-right border-l-2 border-zinc-200 pl-6">
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block">
                    Comprobante Oficial
                  </span>
                  <h2 className="text-lg font-black tracking-tight uppercase text-zinc-950 leading-none mt-1">
                    SOLICITUD DE COMPRA
                  </h2>
                  <div className="mt-2 flex items-center justify-end gap-3 text-xs font-mono font-bold">
                    <span className="bg-zinc-100 text-zinc-900 border border-zinc-300 px-2 py-0.5 rounded">
                      Nº SC-{String(solicitudImprimiendo.id).padStart(5, "0")}
                    </span>
                    <span className="text-zinc-600">
                      {formatFecha(solicitudImprimiendo.fecha)}
                    </span>
                  </div>
                </div>
              </div>

              {/* FICHA DE CONTROL DE SECTORES */}
              <div className="grid grid-cols-4 gap-3 my-5 p-3 rounded bg-zinc-50 border border-zinc-200 text-[10px]">
                <div>
                  <span className="text-zinc-400 font-bold uppercase tracking-wider block text-[8px]">
                    Sector Origen
                  </span>
                  <span className="font-bold text-zinc-800 uppercase mt-0.5 block">
                    Planta Producción
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 font-bold uppercase tracking-wider block text-[8px]">
                    Sector Destino
                  </span>
                  <span className="font-bold text-zinc-800 uppercase mt-0.5 block">
                    Dpto. de Compras
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 font-bold uppercase tracking-wider block text-[8px]">
                    Total de Ítems
                  </span>
                  <span className="font-bold text-zinc-800 uppercase mt-0.5 block font-mono">
                    {solicitudImprimiendo.items.length} artículos
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 font-bold uppercase tracking-wider block text-[8px]">
                    Estado de Gestión
                  </span>
                  <span className="font-bold text-zinc-900 uppercase mt-0.5 block">
                    {solicitudImprimiendo.estado}
                  </span>
                </div>
              </div>

              {/* TABLA DE ARTÍCULOS CON CONTROL DE SALTO DE PÁGINA */}
              <table className="w-full text-left border-collapse border border-zinc-300 text-[11px] mt-4">
                <thead>
                  <tr className="bg-zinc-100/90 text-zinc-800 border-b border-zinc-300 text-[9px] uppercase tracking-wider">
                    <th className="py-2.5 px-3 border-r border-zinc-300 text-center w-12">
                      #
                    </th>
                    <th className="py-2.5 px-3 border-r border-zinc-300 font-bold">
                      Descripción del Material / Materia Prima
                    </th>
                    <th className="py-2.5 px-3 border-r border-zinc-300 w-64">
                      Proveedor Sugerido / Marca
                    </th>
                    <th className="py-2.5 px-3 border-r border-zinc-300 text-right w-28">
                      Cant. Pedida
                    </th>
                    <th className="py-2.5 px-3 text-center w-28">Prioridad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {itemsOrdenadosPDF.map((item, idx) => {
                    const urgLabel =
                      NIVELES_PRIORIDAD.find((p) => p.valor === item.prioridad)
                        ?.label || `Nivel ${item.prioridad}`;

                    return (
                      <tr
                        key={idx}
                        className={idx % 2 === 1 ? "bg-zinc-50/50" : "bg-white"}
                      >
                        <td className="py-2 px-3 border-r border-zinc-200 text-center text-zinc-500 font-mono text-[10px]">
                          {String(idx + 1).padStart(2, "0")}
                        </td>
                        <td className="py-2 px-3 border-r border-zinc-200 font-bold text-zinc-950 uppercase text-[10px]">
                          {item.articulo}
                        </td>
                        <td className="py-2 px-3 border-r border-zinc-200 text-zinc-700 text-[10px]">
                          {item.proveedor || "-"}
                        </td>
                        <td className="py-2 px-3 border-r border-zinc-200 text-right font-mono font-bold text-zinc-950">
                          {parseFloat(item.cantidad_solicitada).toLocaleString(
                            "es-AR",
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span
                            className={`text-[9px] font-bold uppercase tracking-wider ${item.prioridad >= 4 ? "text-rose-600 font-black" : "text-zinc-800"}`}
                          >
                            {urgLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* ÁREA DE OBSERVACIONES */}
              <div className="mt-5 p-3 border border-dashed border-zinc-300 rounded bg-zinc-50/30">
                <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-400 block mb-1">
                  Observaciones / Justificación de Abastecimiento:
                </span>
                <div className="h-6 text-[10px] text-zinc-400 italic flex items-center">
                  Requerimiento de materias primas para abastecimiento y
                  cumplimiento del programa de producción de planta.
                </div>
              </div>

              {/* BLOQUE DE FIRMAS BLINDADO CONTRA CORTES ENTRE HOJAS */}
              <div className="bloque-firmas-print">
                <div className="grid grid-cols-2 gap-20 text-center px-10 pb-4">
                  {/* FIRMA JEFE DE PRODUCCIÓN */}
                  <div>
                    <div className="h-16 flex items-end justify-center mb-1">
                      {solicitudImprimiendo.firma_jefe ? (
                        <img
                          src={solicitudImprimiendo.firma_jefe}
                          alt="Firma Jefe"
                          className="max-h-16 max-w-[200px] object-contain"
                        />
                      ) : (
                        <span className="text-[10px] text-zinc-400 font-mono italic">
                          Firma Pendiente
                        </span>
                      )}
                    </div>
                    <div className="border-t border-zinc-900 pt-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-zinc-950 block">
                        Jefe de Producción
                      </span>
                      <span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-widest block mt-0.5">
                        Firma y Aclaración (Solicita)
                      </span>
                    </div>
                  </div>

                  {/* FIRMA GERENTE DE PRODUCCIÓN */}
                  <div>
                    <div className="h-16 flex items-end justify-center mb-1">
                      {solicitudImprimiendo.firma_gerente ? (
                        <img
                          src={solicitudImprimiendo.firma_gerente}
                          alt="Firma Gerente"
                          className="max-h-16 max-w-[200px] object-contain"
                        />
                      ) : (
                        <span className="text-[10px] text-zinc-400 font-mono italic">
                          Firma Pendiente
                        </span>
                      )}
                    </div>
                    <div className="border-t border-zinc-900 pt-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-zinc-950 block">
                        Gerente de Producción
                      </span>
                      <span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-widest block mt-0.5">
                        Firma y Aclaración (Autoriza)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-200 flex justify-between text-[8px] text-zinc-400 tracking-tight">
                  <span>Conoflex App • Gestión de Producción</span>
                  <span>Documento de Uso Interno</span>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
