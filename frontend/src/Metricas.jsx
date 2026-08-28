import { useState, useEffect, useMemo, useRef } from "react";
import {
  Calendar,
  Filter,
  RotateCw,
  Printer,
  Link,
  Save,
  X,
  TrendingUp,
  GripVertical,
  Maximize2,
  CheckCircle,
  Scale,
  AlertOctagon,
  GitMerge,
  Sparkles,
  Search,
  Zap,
  Calculator,
  AlertTriangle,
  Clock,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

// COLORES MÁQUINAS Y MODO UNIFICADO
const CATEGORY_COLORS = {
  EXTRUSIÓN: { stroke: "#FF5500", fill: "rgba(255, 85, 0, 0.18)", id: "grad-ext" },
  INYECCIÓN: { stroke: "#00E5FF", fill: "rgba(0, 229, 255, 0.18)", id: "grad-iny" },
  ROTOMOLDEO: { stroke: "#00E676", fill: "rgba(0, 230, 118, 0.18)", id: "grad-rot" },
  UNIFICADO: { stroke: "#A855F7", fill: "rgba(168, 85, 247, 0.22)", id: "grad-uni" },
};

const ROW_HEIGHT = 44; // Altura fija por fila para paginación pixel-perfect

// GENERADOR DE CURVAS BÉZIER SUAVES
function generateBezierPaths(points, tension = 0.25) {
  if (!points || points.length === 0) return { lineD: "", areaD: "" };

  if (points.length === 1) {
    const p = points[0];
    return {
      lineD: `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
      areaD: `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${p.x.toFixed(1)} 500 Z`,
    };
  }

  let lineD = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    let cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    let cp2y = p2.y - (p3.y - p1.y) * tension;

    cp1y = Math.max(0, Math.min(500, cp1y));
    cp2y = Math.max(0, Math.min(500, cp2y));

    lineD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  const firstX = points[0].x.toFixed(1);
  const lastX = points[points.length - 1].x.toFixed(1);
  const areaD = `${lineD} L ${lastX} 500 L ${firstX} 500 Z`;

  return { lineD, areaD };
}

// AUTO-INFERENCIA EN EL FRONTEND
function inferCategoryFrontend(codigo, articulo) {
  const cod = String(codigo || "").trim().toUpperCase();
  const art = String(articulo || "").trim().toUpperCase();

  if (
    cod.startsWith("B1200") ||
    cod.startsWith("B2853") ||
    cod.startsWith("1200L") ||
    cod.startsWith("1570L") ||
    cod.startsWith("B2071") ||
    cod.startsWith("5023") ||
    cod.startsWith("LP2016") ||
    cod.startsWith("1200 S/B") ||
    cod.startsWith("NPC2020") ||
    cod.startsWith("MP2022") ||
    cod.startsWith("1570LSF") ||
    cod.startsWith("B1570") ||
    cod.startsWith("4000") ||
    cod.startsWith("4001") ||
    cod.startsWith("ORUGA") ||
    cod.startsWith("MP3041") ||
    cod.startsWith("MP3040") ||
    cod.startsWith("MP2009 NE")
  ) {
    return "EXTRUSIÓN";
  }
  if (
    art.includes("BASE") ||
    art.includes("CALZA") ||
    art.includes("TOPE") ||
    art.includes("ORUGA") ||
    art.includes("SUBIDA") ||
    art.includes("SCRAP")
  ) {
    return "EXTRUSIÓN";
  }

  if (
    cod.startsWith("1311") ||
    cod.startsWith("1301") ||
    cod.startsWith("2703") ||
    cod.startsWith("2401") ||
    cod.startsWith("2853") ||
    cod.startsWith("2901") ||
    cod.startsWith("2953") ||
    cod.startsWith("3701") ||
    cod.startsWith("3702") ||
    cod.startsWith("3805") ||
    cod.startsWith("2050") ||
    cod.startsWith("2051") ||
    cod.startsWith("DRD750") ||
    cod.startsWith("2702") ||
    cod.startsWith("2950") ||
    cod.startsWith("CPC27")
  ) {
    return "ROTOMOLDEO";
  }
  if (
    art.includes("BARRERA") ||
    art.includes("SUBURBANO") ||
    art.includes("CABALLETE") ||
    art.includes("ANTICHOQUE") ||
    art.includes("AUTOPISTA") ||
    art.includes("VALLA") ||
    art.includes("COLUMNA") ||
    art.includes("PALETA") ||
    art.includes("CARTEL")
  ) {
    return "ROTOMOLDEO";
  }

  if (
    cod.startsWith("2300") ||
    cod.startsWith("2012") ||
    cod.startsWith("2016") ||
    cod.startsWith("MP2009 LIGHT") ||
    cod.startsWith("MP2012")
  ) {
    return "INYECCIÓN";
  }
  if (
    art.includes("VENCEDOR") ||
    art.includes("LIGHT") ||
    art.includes("INYECCION") ||
    art.includes("INYECCIÓN")
  ) {
    return "INYECCIÓN";
  }

  return "ROTOMOLDEO";
}

export default function Metricas() {
  const [produccion, setProduccion] = useState([]);
  const [semielaborados, setSemielaborados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Rango global de fechas
  const [fechaDesde, setFechaDesde] = useState("2024-01-01");
  const [fechaHasta, setFechaHasta] = useState("2026-12-31");

  // Modales
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);
  const [isMatrizModalOpen, setIsMatrizModalOpen] = useState(false);
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");

  // ESTADOS DEL COMPARADOR EVOLUTIVO
  const [activeCategories, setActiveCategories] = useState([
    "EXTRUSIÓN",
    "INYECCIÓN",
    "ROTOMOLDEO",
  ]);
  const [isMerged, setIsMerged] = useState(false);
  const [highlightedCategory, setHighlightedCategory] = useState(null);
  const [isDraggingOverChart, setIsDraggingOverChart] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [clickToast, setClickToast] = useState(false);

  // ESTADOS DEL MODAL MATRIZ DE PLANIFICACIÓN
  const [searchTermSE, setSearchTermSE] = useState("");
  const [filtroEstadoStock, setFiltroEstadoStock] = useState("TODOS");
  const [currentPageSE, setCurrentPageSE] = useState(1);

  // Medición adaptativa de la tabla en el modal
  const tableContainerRef = useRef(null);
  const tableHeaderRef = useRef(null);
  const [itemsPerPageSE, setItemsPerPageSE] = useState(6);

  // SIMULADOR TEMPORAL DE LOTE
  const [simulatedItem, setSimulatedItem] = useState(null);
  const [simulatedBatchQty, setSimulatedBatchQty] = useState(500);
  const [simulatedDate, setSimulatedBatchDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15); // Default: 15 días en el futuro
    return d.toISOString().split("T")[0];
  });

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [resProd, resSE] = await Promise.all([
        fetch("http://localhost:3001/api/metricas/produccion"),
        fetch("http://localhost:3001/api/semielaborados"),
      ]);
      setProduccion(await resProd.json());
      setSemielaborados(await resSE.json());
    } catch (err) {
      console.error("Error cargando datos:", err);
    }
    finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Cálculo dinámico de filas por página según el contenedor visible del modal
  useEffect(() => {
    if (!isMatrizModalOpen || !tableContainerRef.current) return;

    const calculatePageSize = () => {
      if (!tableContainerRef.current) return;
      const containerHeight = tableContainerRef.current.clientHeight;
      const headerHeight = tableHeaderRef.current
        ? tableHeaderRef.current.offsetHeight
        : 40;
      const availableHeight = containerHeight - headerHeight;

      const calculatedItems = Math.floor(availableHeight / ROW_HEIGHT);
      setItemsPerPageSE(Math.max(1, calculatedItems));
    };

    const observer = new ResizeObserver(calculatePageSize);
    observer.observe(tableContainerRef.current);
    calculatePageSize();

    return () => observer.disconnect();
  }, [isMatrizModalOpen, semielaborados, searchTermSE, filtroEstadoStock]);

  const handleSyncSheets = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("http://localhost:3001/api/metricas/recargar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvUrl: sheetUrl || undefined }),
      });
      if (res.ok) {
        await fetchAllData();
        setIsUrlModalOpen(false);
      } else {
        const err = await res.json();
        alert(err.error || "Error al sincronizar planilla.");
      }
    } catch (err) {
      alert("Error conectando con el servidor local.");
    } finally {
      setIsSyncing(false);
    }
  };

  // CÁLCULOS GLOBALES
  const globalStats = useMemo(() => {
    const filtrados = produccion.filter((r) => {
      if (!r.fecha || r.fecha === "1970-01-01") return false;
      return r.fecha >= fechaDesde && r.fecha <= fechaHasta;
    });

    let buenas = 0;
    let fallas = 0;
    let kgTotal = 0;

    filtrados.forEach((r) => {
      buenas += r.cant_buenos || 0;
      fallas += r.cant_fallas || 0;
      kgTotal += r.kg_total || 0;
    });

    const totalPiezas = buenas + fallas;
    const porcDefectuosas =
      totalPiezas > 0 ? ((fallas / totalPiezas) * 100).toFixed(2) : "0.00";

    const semielaboradosEnRiesgo = semielaborados.filter(
      (s) => s.demanda_mensual > 0 && (s.dias_stock === null || s.dias_stock < 5)
    ).length;

    return {
      buenas,
      fallas,
      totalPiezas,
      kgTotal,
      porcDefectuosas,
      count: filtrados.length,
      semielaboradosEnRiesgo,
    };
  }, [produccion, semielaborados, fechaDesde, fechaHasta]);

  // CÁLCULO DE SERIE TEMPORAL CON COORDENADAS SVG (1000x500)
  const evolutionaryData = useMemo(() => {
    const filtrados = produccion.filter((r) => {
      if (!r.fecha || r.fecha === "1970-01-01") return false;
      return r.fecha >= fechaDesde && r.fecha <= fechaHasta;
    });

    const mesesSet = new Set();
    const mapa = {};
    const mapaUnificado = {};

    filtrados.forEach((r) => {
      const mes = r.fecha.substring(0, 7);
      mesesSet.add(mes);

      let cat = r.categoria_maq ? r.categoria_maq.toUpperCase().trim() : "";
      if (!cat || cat === "NAN" || cat === "GENERAL") {
        cat = inferCategoryFrontend(r.codigo, r.articulo);
      }

      if (!mapa[mes]) mapa[mes] = {};
      if (!mapa[mes][cat]) mapa[mes][cat] = { buenas: 0, fallas: 0 };
      mapa[mes][cat].buenas += r.cant_buenos || 0;
      mapa[mes][cat].fallas += r.cant_fallas || 0;

      if (!mapaUnificado[mes]) mapaUnificado[mes] = { buenas: 0, fallas: 0 };
      mapaUnificado[mes].buenas += r.cant_buenos || 0;
      mapaUnificado[mes].fallas += r.cant_fallas || 0;
    });

    const mesesLista = Array.from(mesesSet).sort();

    const SVG_WIDTH = 1000;
    const SVG_HEIGHT = 500;
    const categoriasExistentes = ["EXTRUSIÓN", "INYECCIÓN", "ROTOMOLDEO"];

    let maxY = 5;

    categoriasExistentes.forEach((cat) => {
      mesesLista.forEach((mes) => {
        const d = mapa[mes]?.[cat] || { buenas: 0, fallas: 0 };
        const total = d.buenas + d.fallas;
        const porc = total > 0 ? (d.fallas / total) * 100 : 0;
        if (porc > maxY) maxY = porc;
      });
    });

    const series = {};
    categoriasExistentes.forEach((cat) => {
      const totalMeses = mesesLista.length;
      series[cat] = mesesLista.map((mes, idx) => {
        const d = mapa[mes]?.[cat] || { buenas: 0, fallas: 0 };
        const total = d.buenas + d.fallas;
        const porcDefectuosas =
          total > 0 ? parseFloat(((d.fallas / total) * 100).toFixed(2)) : 0;

        const x = totalMeses > 1 ? (idx / (totalMeses - 1)) * SVG_WIDTH : SVG_WIDTH / 2;
        const y = SVG_HEIGHT - (porcDefectuosas / maxY) * SVG_HEIGHT;

        return {
          mes,
          porcDefectuosas,
          buenas: d.buenas,
          fallas: d.fallas,
          total,
          x,
          y,
          cat,
        };
      });
    });

    const totalMeses = mesesLista.length;
    const serieUnificada = mesesLista.map((mes, idx) => {
      const d = mapaUnificado[mes] || { buenas: 0, fallas: 0 };
      const total = d.buenas + d.fallas;
      const porcDefectuosas =
        total > 0 ? parseFloat(((d.fallas / total) * 100).toFixed(2)) : 0;

      const x = totalMeses > 1 ? (idx / (totalMeses - 1)) * SVG_WIDTH : SVG_WIDTH / 2;
      const y = SVG_HEIGHT - (porcDefectuosas / maxY) * SVG_HEIGHT;

      return {
        mes,
        porcDefectuosas,
        buenas: d.buenas,
        fallas: d.fallas,
        total,
        x,
        y,
        cat: "PROMEDIO TOTAL PLANTA",
      };
    });

    maxY = Math.ceil(maxY * 1.15);

    return { mesesLista, series, serieUnificada, maxY, SVG_WIDTH, SVG_HEIGHT };
  }, [produccion, fechaDesde, fechaHasta]);

  // CÁLCULO CRUZADO DE SEMIELABORADOS Y CRITERIO DE MATRIZ DE 5 DÍAS
  const semielaboradosCruzados = useMemo(() => {
    return semielaborados
      .map((s) => {
        const dias = s.dias_stock;
        let estado = "OK";
        let mensaje = "✅ STOCK PRUDENTE / OK";

        if (s.demanda_mensual > 0) {
          if (dias === null || dias < 5) {
            estado = "CRITICO";
            mensaje = "🚨 MATRIZ URGENTE (< 5 DÍAS DE STOCK)";
          } else if (dias <= 15) {
            estado = "ALERTA";
            mensaje = "⚠️ PROGRAMAR MATRIZ PRONTO";
          }
        } else {
          mensaje = "ℹ️ SIN DEMANDA ACTIVA";
        }

        // Limpiar fecha de última producción si es nula o predeterminada
        let fechaUltimaLimpia = s.ultima_produccion_fecha;
        if (!fechaUltimaLimpia || fechaUltimaLimpia === "1970-01-01") {
          fechaUltimaLimpia = null;
        }

        return {
          ...s,
          ultima_produccion_fecha: fechaUltimaLimpia,
          estadoMatriz: estado,
          mensajeMatriz: mensaje,
        };
      })
      .filter((s) => {
        const term = searchTermSE.toLowerCase();
        const coincideBusqueda =
          s.codigo.toLowerCase().includes(term) ||
          s.nombre.toLowerCase().includes(term);

        if (!coincideBusqueda) return false;

        if (filtroEstadoStock === "CRITICO") return s.estadoMatriz === "CRITICO";
        if (filtroEstadoStock === "ALERTA") return s.estadoMatriz === "ALERTA";
        if (filtroEstadoStock === "OK") return s.estadoMatriz === "OK";

        return true;
      });
  }, [semielaborados, searchTermSE, filtroEstadoStock]);

  // PAGINACIÓN DE SEMIELABORADOS
  const totalPagesSE =
    Math.ceil(semielaboradosCruzados.length / itemsPerPageSE) || 1;
  const indexOfLastSE = currentPageSE * itemsPerPageSE;
  const indexOfFirstSE = indexOfLastSE - itemsPerPageSE;
  const currentPaginatedSE = semielaboradosCruzados.slice(
    indexOfFirstSE,
    indexOfLastSE
  );

  // DRAG & DROP
  const handleDragStart = (e, category) => {
    e.dataTransfer.setData("text/plain", category);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDraggingOverChart(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOverChart(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDraggingOverChart(false);
    const category = e.dataTransfer.getData("text/plain");

    if (category && !activeCategories.includes(category)) {
      setActiveCategories((prev) => [...prev, category]);
    }
  };

  const handlePillClick = () => {
    setClickToast(true);
    setTimeout(() => setClickToast(false), 2500);
  };

  const removeCategory = (cat) => {
    setActiveCategories(activeCategories.filter((c) => c !== cat));
  };

  return (
    <div className="h-full flex flex-col font-mono text-white min-h-0 select-none space-y-4">
      {/* BARRA SUPERIOR DE CONTROL */}
      <div className="bg-[#0B0F19] border-2 border-[#1E2842] shadow-[4px_4px_0px_#000] p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="font-pixel text-xl text-[#00E5FF] tracking-wider flex items-center gap-2">
            <TrendingUp size={20} /> CONTROL DE PRODUCCIÓN & DEFECTOS
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Métricas integradas con ingenierías y planificación de matrices.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-[#070A12] border border-[#1E2842] px-2.5 py-1.5 text-xs font-pixel">
            <Calendar size={13} className="text-[#00E5FF]" />
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="bg-transparent text-white focus:outline-none w-28 text-xs"
            />
            <span className="text-slate-500">-</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="bg-transparent text-white focus:outline-none w-28 text-xs"
            />
          </div>

          <button
            onClick={handleSyncSheets}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00E5FF] text-black font-pixel font-bold text-xs border border-white shadow-[2px_2px_0px_#000] hover:bg-white transition-all disabled:opacity-50"
          >
            <RotateCw size={13} className={isSyncing ? "animate-spin" : ""} />
            <span>{isSyncing ? "SINC..." : "SINC"}</span>
          </button>

          <button
            onClick={() => setIsUrlModalOpen(true)}
            className="p-1.5 bg-[#161C2E] border border-[#1E2842] text-slate-300 hover:text-[#00E5FF] transition-colors"
            title="Configurar URL Sheets"
          >
            <Link size={16} />
          </button>
        </div>
      </div>

      {/* TARJETAS PRINCIPALES */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 shrink-0">
        <div className="bg-[#0E1322] border-2 border-[#1E2842] p-4 shadow-[4px_4px_0px_#000]">
          <div className="flex items-center justify-between border-b border-[#1E2842] pb-1.5 mb-2">
            <span className="font-pixel text-[11px] text-slate-400">PIEZAS BUENAS</span>
            <CheckCircle size={16} className="text-[#00E676]" />
          </div>
          <div className="font-pixel text-2xl font-bold text-white">
            {globalStats.buenas.toLocaleString()}{" "}
            <span className="text-xs text-slate-500 font-normal">u.</span>
          </div>
        </div>

        <div className="bg-[#0E1322] border-2 border-[#1E2842] p-4 shadow-[4px_4px_0px_#000]">
          <div className="flex items-center justify-between border-b border-[#1E2842] pb-1.5 mb-2">
            <span className="font-pixel text-[11px] text-slate-400">MATERIAL TRANSFORMADO</span>
            <Scale size={16} className="text-[#00E5FF]" />
          </div>
          <div className="font-pixel text-2xl font-bold text-[#00E5FF]">
            {Math.round(globalStats.kgTotal).toLocaleString()}{" "}
            <span className="text-xs text-slate-500 font-normal">Kg</span>
          </div>
        </div>

        <div className="bg-[#0E1322] border-2 border-[#1E2842] p-4 shadow-[4px_4px_0px_#000]">
          <div className="flex items-center justify-between border-b border-[#1E2842] pb-1.5 mb-2">
            <span className="font-pixel text-[11px] text-slate-400">TASA DEFECTUOSAS GLOBAL</span>
            <AlertOctagon size={16} className="text-[#FF5500]" />
          </div>
          <div className="font-pixel text-2xl font-bold text-[#FF5500]">
            {globalStats.porcDefectuosas}%
          </div>
        </div>

        <div className="bg-[#0E1322] border-2 border-[#1E2842] p-4 shadow-[4px_4px_0px_#000] border-l-4 border-l-[#FF1744]">
          <div className="flex items-center justify-between border-b border-[#1E2842] pb-1.5 mb-2">
            <span className="font-pixel text-[11px] text-[#FF1744] font-bold">MATRICES EN RIESGO (&lt; 5 DÍAS)</span>
            <AlertTriangle size={16} className="text-[#FF1744] animate-pulse" />
          </div>
          <div className="font-pixel text-2xl font-bold text-[#FF1744]">
            {globalStats.semielaboradosEnRiesgo}{" "}
            <span className="text-xs text-slate-400 font-normal">artículos</span>
          </div>
        </div>
      </div>

      {/* 2 GRANDES ACCIONES DE CONTROL */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0">
        
        {/* TARJETA 1: COMPARADOR EVOLUTIVO */}
        <div className="bg-[#0E1322] border-2 border-[#1E2842] shadow-[4px_4px_0px_#000] p-6 flex flex-col justify-between hover:border-[#00E5FF] transition-all group">
          <div className="space-y-3">
            <div className="w-14 h-14 bg-[#00E5FF]/10 border-2 border-[#00E5FF] text-[#00E5FF] flex items-center justify-center shadow-[4px_4px_0px_#000] group-hover:scale-110 transition-transform">
              <TrendingUp size={28} />
            </div>

            <div>
              <h3 className="font-pixel text-lg text-white group-hover:text-[#00E5FF] transition-colors">
                COMPARADOR EVOLUTIVO DRAG & DROP
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Arrastra tecnologías sobre el lienzo SVG y grafica las curvas Bézier onduladas de fallas.
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsChartModalOpen(true)}
            className="flex items-center justify-center gap-2 w-full py-3 bg-[#111625] text-[#00E5FF] font-pixel font-bold text-xs border-2 border-[#00E5FF] shadow-[4px_4px_0px_#000] hover:bg-[#00E5FF] hover:text-black transition-all active:translate-y-0.5 mt-4"
          >
            <Maximize2 size={16} /> ABRIR GRÁFICO EVOLUTIVO
          </button>
        </div>

        {/* TARJETA 2: MATRIZ DE PLANIFICACIÓN */}
        <div className="bg-[#0E1322] border-2 border-[#1E2842] shadow-[4px_4px_0px_#000] p-6 flex flex-col justify-between hover:border-[#FF5500] transition-all group">
          <div className="space-y-3">
            <div className="w-14 h-14 bg-[#FF5500]/10 border-2 border-[#FF5500] text-[#FF5500] flex items-center justify-center shadow-[4px_4px_0px_#000] group-hover:scale-110 transition-transform">
              <Calculator size={28} />
            </div>

            <div>
              <h3 className="font-pixel text-lg text-white group-hover:text-[#FF5500] transition-colors">
                MATRIZ Y PLANIFICACIÓN DE STOCK CRÍTICO
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Cruza la última producción de semielaborados con la demanda de ventas e identifica cuáles tienen menos de 5 días de stock.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setCurrentPageSE(1);
              setIsMatrizModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 w-full py-3 bg-[#FF5500] text-black font-pixel font-bold text-xs border-2 border-white shadow-[4px_4px_0px_#000] hover:bg-white transition-all active:translate-y-0.5 mt-4"
          >
            <Maximize2 size={16} /> ABRIR MATRIZ Y PLANIFICACIÓN DE STOCK
          </button>
        </div>

      </div>

      {/* =========================================================
          MODAL 1: MATRIZ DE PLANIFICACIÓN PAGINADA Y ADAPTATIVA
      ========================================================= */}
      {isMatrizModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-3 font-mono animate-in fade-in duration-200">
          <div className="bg-[#0B0F19] border-2 border-[#FF5500] w-full max-w-7xl h-[92vh] shadow-[8px_8px_0px_#000] flex flex-col relative overflow-hidden">
            
            {/* CABECERA */}
            <div className="p-3 border-b-2 border-[#1E2842] bg-[#0E1322] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Calculator size={18} className="text-[#FF5500]" />
                <h3 className="font-pixel text-sm text-[#FF5500] font-bold">
                  MATRIZ DE PLANIFICACIÓN: CRUCE DE PRODUCCIÓN VS DEMANDA DE VENTAS
                </h3>
              </div>

              <button
                onClick={() => setIsMatrizModalOpen(false)}
                className="p-1 border border-[#1E2842] text-slate-400 hover:text-white hover:bg-red-500/20 hover:border-red-500 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* CONTROLES Y FILTROS */}
            <div className="p-3 bg-[#070A12] border-b border-[#1E2842] flex flex-col md:flex-row items-center justify-between gap-3 shrink-0">
              <div className="relative flex-1 w-full md:w-80">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por código o semielaborado..."
                  value={searchTermSE}
                  onChange={(e) => {
                    setSearchTermSE(e.target.value);
                    setCurrentPageSE(1);
                  }}
                  className="w-full bg-[#111625] border border-[#1E2842] text-xs text-white pl-8 pr-3 py-1.5 focus:border-[#FF5500] focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 font-pixel text-xs">
                {[
                  { id: "TODOS", label: "TODOS" },
                  { id: "CRITICO", label: "🚨 CRÍTICO (< 5 DÍAS)" },
                  { id: "ALERTA", label: "⚠️ ALERTA (< 15 DÍAS)" },
                  { id: "OK", label: "✅ STOCK PRUDENTE" },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      setFiltroEstadoStock(f.id);
                      setCurrentPageSE(1);
                    }}
                    className={`px-3 py-1 border transition-colors ${
                      filtroEstadoStock === f.id
                        ? "bg-[#FF5500] text-black font-bold border-white"
                        : "bg-[#111625] border-[#1E2842] text-slate-400 hover:text-white"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* CONTENEDOR PAGINADO ADAPTATIVO */}
            <div className="flex-1 overflow-hidden flex flex-col" ref={tableContainerRef}>
              <table className="w-full text-left text-xs border-collapse table-fixed">
                <thead className="bg-[#161C2E] border-b-2 border-[#1E2842]" ref={tableHeaderRef}>
                  <tr className="text-[#00E5FF] font-pixel text-sm">
                    <th className="p-3 border-r border-[#1E2842] w-36">Código</th>
                    <th className="p-3 border-r border-[#1E2842]">Semielaborado</th>
                    <th className="p-3 text-right border-r border-[#1E2842] w-32">Stock Total</th>
                    <th className="p-3 text-right border-r border-[#1E2842] w-36">Demanda / Mes</th>
                    <th className="p-3 text-center border-r border-[#1E2842] w-32">Días Stock</th>
                    <th className="p-3 text-center border-r border-[#1E2842] w-44">Última Producción</th>
                    <th className="p-3 text-center border-r border-[#1E2842] w-64">Recomendación Matriz</th>
                    <th className="p-3 text-center w-24">Simular</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2842]/60 bg-[#070A12]">
                  {currentPaginatedSE.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="p-12 text-center text-slate-500 font-pixel">
                        Sin coincidencias para la búsqueda o filtro seleccionado.
                      </td>
                    </tr>
                  ) : (
                    currentPaginatedSE.map((item) => {
                      let badgeStyle = "bg-[#111625] text-slate-400 border-[#1E2842]";
                      if (item.estadoMatriz === "CRITICO") {
                        badgeStyle = "bg-red-500/20 text-red-400 border-red-500/50 font-bold animate-pulse";
                      } else if (item.estadoMatriz === "ALERTA") {
                        badgeStyle = "bg-amber-500/20 text-amber-400 border-amber-500/50 font-bold";
                      } else if (item.estadoMatriz === "OK") {
                        badgeStyle = "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 font-bold";
                      }

                      return (
                        <tr
                          key={item.id}
                          className="h-[44px] max-h-[44px] hover:bg-[#111625] text-slate-200 transition-colors overflow-hidden"
                        >
                          <td className="px-3 py-2 border-r border-[#1E2842]/40 font-pixel text-[#FF5500] font-bold whitespace-nowrap truncate">
                            {item.codigo}
                          </td>
                          <td className="px-3 py-2 border-r border-[#1E2842]/40 font-bold text-white whitespace-nowrap truncate" title={item.nombre}>
                            {item.nombre}
                          </td>
                          <td className="px-3 py-2 text-right border-r border-[#1E2842]/40 font-pixel text-white font-bold whitespace-nowrap">
                            {item.stock_total.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right border-r border-[#1E2842]/40 font-pixel text-[#00E5FF] whitespace-nowrap">
                            {item.demanda_mensual > 0 ? item.demanda_mensual.toLocaleString() : "-"}
                          </td>
                          <td className="px-3 py-2 text-center border-r border-[#1E2842]/40 font-pixel whitespace-nowrap">
                            {item.dias_stock !== null ? (
                              <span className={`px-2 py-0.5 border ${badgeStyle}`}>
                                {item.dias_stock} días
                              </span>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center border-r border-[#1E2842]/40 font-pixel text-slate-300 whitespace-nowrap">
                            {item.ultima_produccion_fecha ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <Clock size={12} className="text-[#00E5FF]" />
                                <span>{item.ultima_produccion_fecha}</span>
                              </div>
                            ) : (
                              <span className="text-slate-600">Sin registro</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center border-r border-[#1E2842]/40 font-pixel text-xs whitespace-nowrap">
                            <span className={`px-2 py-0.5 border inline-block ${badgeStyle}`}>
                              {item.mensajeMatriz}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center font-pixel whitespace-nowrap">
                            <button
                              onClick={() => {
                                setSimulatedItem(item);
                                setSimulatedBatchQty(500);
                              }}
                              className="p-1.5 bg-[#161C2E] border border-[#1E2842] text-slate-300 hover:text-[#00E5FF] hover:border-[#00E5FF] transition-colors"
                              title="Simular corrida con fecha futura"
                            >
                              <Calculator size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* BARRA DE PAGINACIÓN ADAPTATIVA */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-[#111625] border-t-2 border-[#1E2842] font-pixel text-xs shrink-0">
              <div className="text-slate-400">
                Mostrando <span className="text-white font-bold">{semielaboradosCruzados.length === 0 ? 0 : indexOfFirstSE + 1}</span> - <span className="text-white font-bold">{Math.min(indexOfLastSE, semielaboradosCruzados.length)}</span> de <span className="text-[#FF5500] font-bold">{semielaboradosCruzados.length}</span> ítems
              </div>

              <div className="flex items-center gap-1">
                <button onClick={() => setCurrentPageSE(1)} disabled={currentPageSE === 1} className="p-1.5 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20"><ChevronsLeft size={14} /></button>
                <button onClick={() => setCurrentPageSE((prev) => Math.max(prev - 1, 1))} disabled={currentPageSE === 1} className="flex items-center gap-1 px-2.5 py-1 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20"><ChevronLeft size={14} /> ANT</button>
                <div className="px-3 py-1 bg-black border border-[#1E2842] text-[#FF5500] font-bold text-sm">{currentPageSE} / {totalPagesSE}</div>
                <button onClick={() => setCurrentPageSE((prev) => Math.min(prev + 1, totalPagesSE))} disabled={currentPageSE === totalPagesSE} className="flex items-center gap-1 px-2.5 py-1 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20">SIG <ChevronRight size={14} /></button>
                <button onClick={() => setCurrentPageSE(totalPagesSE)} disabled={currentPageSE === totalPagesSE} className="p-1.5 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20"><ChevronsRight size={14} /></button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* =========================================================
          SIMULADOR AVANZADO DE ARRIBO CON FECHA FUTURA
      ========================================================= */}
      {simulatedItem && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[110] flex items-center justify-center p-4 font-mono animate-in zoom-in-95 duration-150">
          <div className="bg-[#0E1322] border-2 border-[#00E5FF] w-full max-w-lg p-5 shadow-[8px_8px_0px_#000] space-y-4 relative">
            <button
              onClick={() => setSimulatedItem(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>

            <div className="border-b border-[#1E2842] pb-2">
              <h3 className="font-pixel text-base text-[#00E5FF] flex items-center gap-2">
                <Calculator size={18} /> SIMULADOR PROYECTADO DE LOTE
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                [{simulatedItem.codigo}] - {simulatedItem.nombre}
              </p>
            </div>

            {/* CONTROLES DE LA SIMULACIÓN */}
            <div className="space-y-3 text-xs font-pixel">
              
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-[#070A12] border border-[#1E2842]">
                  <span className="text-slate-400 block text-[10px]">STOCK HOY:</span>
                  <span className="text-white font-bold text-sm">{simulatedItem.stock_total.toLocaleString()} u.</span>
                </div>

                <div className="p-2 bg-[#070A12] border border-[#1E2842]">
                  <span className="text-slate-400 block text-[10px]">DEMANDA ESTIMADA:</span>
                  <span className="text-[#00E5FF] font-bold text-sm">{simulatedItem.demanda_mensual.toLocaleString()} u. / mes</span>
                </div>
              </div>

              {/* INPUTS DE FECHA FUTURA Y CANTIDAD */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-[#1E2842]">
                <div>
                  <label className="text-slate-400 block font-bold mb-1">FECHA FUTURA DE ARRIBO:</label>
                  <input
                    type="date"
                    value={simulatedDate}
                    onChange={(e) => setSimulatedBatchDate(e.target.value)}
                    className="w-full bg-[#070A12] border border-[#00E5FF] text-white p-2 text-xs focus:outline-none font-pixel"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block font-bold mb-1">UNIDADES A INGRESAR (+):</label>
                  <input
                    type="number"
                    value={simulatedBatchQty}
                    onChange={(e) => setSimulatedBatchQty(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-[#070A12] border border-[#00E5FF] text-white p-2 text-xs focus:outline-none font-pixel font-bold text-right"
                  />
                </div>
              </div>

              {/* MATEMÁTICA PROYECTADA EN TIEMPO REAL */}
              {(() => {
                const hoy = new Date();
                hoy.setHours(0, 0, 0, 0);

                const objetivo = new Date(simulatedDate + "T00:00:00");
                const diffTime = objetivo.getTime() - hoy.getTime();
                const diasEspera = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

                const consumoDiario = simulatedItem.demanda_mensual / 30;
                const consumoEnEspera = Math.round(diasEspera * consumoDiario);

                const stockRemanenteAFecha = Math.max(0, simulatedItem.stock_total - consumoEnEspera);
                const quiebreAntes = simulatedItem.demanda_mensual > 0 && (simulatedItem.stock_total - consumoEnEspera) < 0;

                const diasHastaAgotar =
                  simulatedItem.demanda_mensual > 0
                    ? Math.floor((simulatedItem.stock_total / simulatedItem.demanda_mensual) * 30)
                    : 999;

                const nuevoStockPostLote = stockRemanenteAFecha + simulatedBatchQty;
                const nuevosDiasCobertura =
                  simulatedItem.demanda_mensual > 0
                    ? Math.round((nuevoStockPostLote / simulatedItem.demanda_mensual) * 30)
                    : 999;

                return (
                  <div className="space-y-2 pt-2 border-t border-[#1E2842]">
                    <div className="p-2.5 bg-[#070A12] border border-[#1E2842] space-y-1">
                      <div className="flex justify-between text-slate-400">
                        <span>DÍAS HASTA EL ARRIBO ({simulatedDate}):</span>
                        <strong className="text-white">{diasEspera} días</strong>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>CONSUMO ESTIMADO EN ESPERA:</span>
                        <strong className="text-amber-400">-{consumoEnEspera.toLocaleString()} u.</strong>
                      </div>
                      <div className="flex justify-between text-slate-300 font-bold border-t border-[#1E2842] pt-1">
                        <span>STOCK AL MOMENTO DEL ARRIBO:</span>
                        <span className={quiebreAntes ? "text-red-400" : "text-emerald-400"}>
                          {stockRemanenteAFecha.toLocaleString()} u.
                        </span>
                      </div>
                    </div>

                    {/* ALERTA DE QUIEBRE ANTES DE FECHA */}
                    {quiebreAntes && (
                      <div className="p-2 bg-red-500/20 border-2 border-red-500 text-red-400 font-bold space-y-0.5 animate-pulse">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle size={15} />
                          <span>¡ALERTA DE QUIEBRE PREVIO!</span>
                        </div>
                        <p className="text-[10px] font-normal">
                          El stock actual se agotará a los <strong>{diasHastaAgotar} días</strong>. ¡Quedarán {diasEspera - diasHastaAgotar} días sin stock antes de que llegue la producción el {simulatedDate}!
                        </p>
                      </div>
                    )}

                    {/* ESTADO FINAL CON EL LOTE INGRESADO */}
                    <div className={`p-3 border-2 ${nuevosDiasCobertura >= 5 ? "bg-emerald-500/10 border-emerald-500 text-emerald-400" : "bg-red-500/10 border-red-500 text-red-400"} space-y-1`}>
                      <div className="flex items-center justify-between font-bold">
                        <span>NUEVO STOCK POST-ARRIBO:</span>
                        <span className="text-sm">{nuevoStockPostLote.toLocaleString()} u.</span>
                      </div>
                      <div className="flex items-center justify-between font-bold">
                        <span>COBERTURA A PARTIR DE {simulatedDate}:</span>
                        <span className="text-sm">{nuevosDiasCobertura} DÍAS</span>
                      </div>
                      <p className="text-[10px] mt-1 pt-1 border-t border-current/30">
                        {nuevosDiasCobertura >= 5
                          ? "✅ Cobertura segura: Otorga stock prudente igual o mayor a 5 días."
                          : "⚠️ Cobertura insuficiente: Seguirá por debajo de los 5 días prudentes."}
                      </p>
                    </div>
                  </div>
                );
              })()}

            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSimulatedItem(null)}
                className="px-4 py-1.5 bg-[#161C2E] border border-[#1E2842] text-white font-pixel text-xs hover:border-[#00E5FF]"
              >
                CERRAR SIMULADOR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: COMPARADOR EVOLUTIVO DRAG & DROP */}
      {isChartModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-3 font-mono animate-in fade-in duration-200">
          <div className="bg-[#0B0F19] border-2 border-[#00E5FF] w-full max-w-6xl h-[90vh] shadow-[8px_8px_0px_#000] flex flex-col relative overflow-hidden">
            
            <div className="p-3 border-b-2 border-[#1E2842] bg-[#0E1322] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <TrendingUp size={18} className="text-[#00E5FF]" />
                <h3 className="font-pixel text-sm text-[#00E5FF] font-bold">
                  EVOLUCIÓN HISTÓRICA DE PIEZAS DEFECTUOSAS POR MÁQUINA
                </h3>
              </div>

              <button
                onClick={() => setIsChartModalOpen(false)}
                className="p-1 border border-[#1E2842] text-slate-400 hover:text-white hover:bg-red-500/20 hover:border-red-500 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3 bg-[#070A12] border-b border-[#1E2842] flex flex-wrap items-center justify-between gap-2 shrink-0 relative">
              <div className="flex items-center gap-2 text-xs font-pixel text-slate-400">
                <GripVertical size={14} className="text-[#FF5500]" />
                <span>ARRASTRA EL CARTUCHO Y SUÉLTALO EN EL GRÁFICO:</span>
              </div>

              <div className="flex items-center gap-2">
                {["EXTRUSIÓN", "INYECCIÓN", "ROTOMOLDEO"].map((cat) => {
                  const isAlreadyActive = activeCategories.includes(cat);
                  const color = CATEGORY_COLORS[cat].stroke;

                  return (
                    <div
                      key={cat}
                      draggable={!isMerged}
                      onDragStart={(e) => handleDragStart(e, cat)}
                      onClick={handlePillClick}
                      className={`
                        px-3 py-1.5 border-2 font-pixel text-xs font-bold transition-all shadow-[2px_2px_0px_#000]
                        ${
                          isMerged
                            ? "opacity-30 cursor-not-allowed bg-[#0E1322] border-[#1E2842] text-slate-500"
                            : isAlreadyActive
                            ? "bg-[#111625] text-white border-white opacity-40 cursor-not-allowed"
                            : "bg-[#0E1322] text-white cursor-grab active:cursor-grabbing hover:scale-105"
                        }
                      `}
                      style={{ borderColor: !isMerged ? color : undefined }}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block mr-1.5"
                        style={{ backgroundColor: color }}
                      />
                      <span>{cat}</span>
                    </div>
                  );
                })}

                <button
                  onClick={() => setIsMerged(!isMerged)}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 border-2 font-pixel text-xs font-bold transition-all shadow-[3px_3px_0px_#000] active:translate-y-0.5 ml-2
                    ${
                      isMerged
                        ? "bg-[#A855F7] text-white border-white shadow-[0_0_15px_rgba(168,85,247,0.6)]"
                        : "bg-[#161C2E] border-[#A855F7] text-[#A855F7] hover:bg-[#A855F7] hover:text-white"
                    }
                  `}
                >
                  <GitMerge size={14} />
                  <span>{isMerged ? "[ SEPARAR LÍNEAS ]" : "[ 🔀 FUSIONAR PROMEDIO ]"}</span>
                </button>
              </div>

              {clickToast && !isMerged && (
                <div className="absolute top-full right-4 mt-2 bg-[#FF5500] text-black font-pixel text-xs p-2 shadow-[4px_4px_0px_#000] z-50 border border-white animate-bounce">
                  ✋ ¡Debes ARRASTRAR Y SOLTAR el cartucho dentro del área del gráfico!
                </div>
              )}
            </div>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                flex-1 p-4 relative flex flex-col justify-between overflow-hidden transition-colors
                ${isDraggingOverChart ? "bg-[#00E5FF]/15 border-2 border-dashed border-[#00E5FF]" : "bg-[#070A12]"}
              `}
            >
              {isDraggingOverChart && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-xs font-pixel text-sm text-[#00E5FF] animate-pulse">
                  ¡SUELTA AQUÍ PARA TRAZAR LA CURVA ONDULADA!
                </div>
              )}

              <div className="absolute right-4 top-2 z-20 flex items-center gap-2">
                {isMerged ? (
                  <span className="px-3 py-1 bg-[#A855F7]/20 border-2 border-[#A855F7] text-[#A855F7] font-pixel text-xs font-bold flex items-center gap-1.5 shadow-[0_0_12px_rgba(168,85,247,0.5)]">
                    <Sparkles size={13} />
                    <span>SUMATORIA & PROMEDIO GLOBAL FUSIONADO</span>
                  </span>
                ) : (
                  activeCategories.map((cat) => {
                    const color = CATEGORY_COLORS[cat].stroke;
                    const isHoveredPill = highlightedCategory === cat;

                    return (
                      <span
                        key={cat}
                        onMouseEnter={() => setHighlightedCategory(cat)}
                        onMouseLeave={() => setHighlightedCategory(null)}
                        className={`
                          px-2.5 py-1 bg-[#0E1322] border font-pixel text-xs text-white font-bold flex items-center gap-1.5 shadow-[2px_2px_0px_#000] cursor-pointer transition-all duration-200
                          ${isHoveredPill ? "scale-105 border-white shadow-[0_0_12px_rgba(255,255,255,0.4)]" : "opacity-90"}
                        `}
                        style={{ borderColor: color }}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span>{cat}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCategory(cat);
                          }}
                          className="hover:text-red-400 font-bold ml-1"
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })
                )}
              </div>

              <div className="absolute left-2 top-2 text-[10px] font-pixel text-slate-500">
                % DEFECTUOSAS
              </div>

              {evolutionaryData.mesesLista.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-slate-500 font-pixel text-xs">
                  No hay datos para el rango ({fechaDesde} a {fechaHasta}).
                </div>
              ) : !isMerged && activeCategories.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-slate-400 font-pixel text-xs text-center space-y-2">
                  <div>
                    <p className="text-[#FF5500] font-bold">NINGUNA MÁQUINA SELECCIONADA</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Arrastra y suelta cualquiera de los cartuchos superiores dentro del lienzo.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col justify-between pt-6 pb-6 px-12 relative">
                  
                  <div className="absolute inset-x-12 top-6 bottom-8 flex flex-col justify-between pointer-events-none">
                    {[1, 0.75, 0.5, 0.25, 0].map((step) => {
                      const val = (evolutionaryData.maxY * step).toFixed(1);
                      return (
                        <div key={step} className="border-b border-[#1E2842]/40 w-full flex items-center justify-between text-[9px] font-pixel text-slate-600">
                          <span>{val}%</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="w-full h-full relative z-10">
                    <svg
                      viewBox="0 0 1000 500"
                      preserveAspectRatio="none"
                      className="w-full h-full overflow-visible"
                    >
                      <defs>
                        {Object.entries(CATEGORY_COLORS).map(([cat, colors]) => (
                          <linearGradient
                            key={cat}
                            id={colors.id}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop offset="0%" stopColor={colors.stroke} stopOpacity="0.35" />
                            <stop offset="100%" stopColor={colors.stroke} stopOpacity="0.0" />
                          </linearGradient>
                        ))}
                      </defs>

                      <g id="layer-areas">
                        {isMerged ? (
                          (() => {
                            const { areaD } = generateBezierPaths(evolutionaryData.serieUnificada, 0.25);
                            return (
                              <path
                                d={areaD}
                                fill={`url(#${CATEGORY_COLORS.UNIFICADO.id})`}
                                className="transition-all duration-500"
                              />
                            );
                          })()
                        ) : (
                          activeCategories.map((cat) => {
                            const puntos = evolutionaryData.series[cat] || [];
                            if (puntos.length === 0) return null;
                            const colors = CATEGORY_COLORS[cat];
                            const { areaD } = generateBezierPaths(puntos, 0.25);
                            const isBlurred = highlightedCategory !== null && highlightedCategory !== cat;

                            return (
                              <path
                                key={cat}
                                d={areaD}
                                fill={`url(#${colors.id})`}
                                className={`transition-all duration-300 ${isBlurred ? "opacity-10" : "opacity-100"}`}
                              />
                            );
                          })
                        )}
                      </g>

                      <g id="layer-lines">
                        {isMerged ? (
                          (() => {
                            const { lineD } = generateBezierPaths(evolutionaryData.serieUnificada, 0.25);
                            return (
                              <path
                                d={lineD}
                                fill="none"
                                stroke={CATEGORY_COLORS.UNIFICADO.stroke}
                                strokeWidth="5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="transition-all duration-500 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]"
                              />
                            );
                          })()
                        ) : (
                          activeCategories.map((cat) => {
                            const puntos = evolutionaryData.series[cat] || [];
                            if (puntos.length === 0) return null;
                            const colors = CATEGORY_COLORS[cat];
                            const { lineD } = generateBezierPaths(puntos, 0.25);
                            const isBlurred = highlightedCategory !== null && highlightedCategory !== cat;

                            return (
                              <path
                                key={cat}
                                d={lineD}
                                fill="none"
                                stroke={colors.stroke}
                                strokeWidth={highlightedCategory === cat ? "5" : "3.5"}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={`transition-all duration-300 ${isBlurred ? "opacity-15 filter blur-[1px]" : "opacity-100"}`}
                              />
                            );
                          })
                        )}
                      </g>

                      <g id="layer-points">
                        {isMerged ? (
                          evolutionaryData.serieUnificada.map((pt, idx) => (
                            <g key={idx}>
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r="12"
                                fill="transparent"
                                className="cursor-pointer"
                                onMouseEnter={() => setHoveredPoint(pt)}
                                onMouseLeave={() => setHoveredPoint(null)}
                              />
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r="7"
                                fill="#070A12"
                                stroke={CATEGORY_COLORS.UNIFICADO.stroke}
                                strokeWidth="3.5"
                                className="pointer-events-none transition-all"
                              />
                            </g>
                          ))
                        ) : (
                          activeCategories.map((cat) => {
                            const puntos = evolutionaryData.series[cat] || [];
                            const colors = CATEGORY_COLORS[cat];
                            const isBlurred = highlightedCategory !== null && highlightedCategory !== cat;

                            return puntos.map((pt, idx) => (
                              <g
                                key={`${cat}-${idx}`}
                                className={`transition-all duration-300 ${isBlurred ? "opacity-20" : "opacity-100"}`}
                              >
                                <circle
                                  cx={pt.x}
                                  cy={pt.y}
                                  r="14"
                                  fill="transparent"
                                  className="cursor-pointer"
                                  onMouseEnter={() => setHoveredPoint(pt)}
                                  onMouseLeave={() => setHoveredPoint(null)}
                                />
                                <circle
                                  cx={pt.x}
                                  cy={pt.y}
                                  r={highlightedCategory === cat ? "7.5" : "5.5"}
                                  fill="#070A12"
                                  stroke={colors.stroke}
                                  strokeWidth="3"
                                  className="pointer-events-none transition-all"
                                />
                              </g>
                            ));
                          })
                        )}
                      </g>
                    </svg>

                    {hoveredPoint && (
                      <div
                        className="absolute z-40 bg-[#0E1322] border-2 p-2.5 font-pixel text-xs shadow-[4px_4px_0px_#000] pointer-events-none -translate-x-1/2 -translate-y-full mb-2"
                        style={{
                          left: `${(hoveredPoint.x / 1000) * 100}%`,
                          top: `${(hoveredPoint.y / 500) * 100}%`,
                          borderColor:
                            isMerged
                              ? CATEGORY_COLORS.UNIFICADO.stroke
                              : CATEGORY_COLORS[hoveredPoint.cat]?.stroke || "#00E5FF",
                        }}
                      >
                        <div
                          className="font-bold border-b border-[#1E2842] pb-1 mb-1"
                          style={{
                            color: isMerged
                              ? CATEGORY_COLORS.UNIFICADO.stroke
                              : CATEGORY_COLORS[hoveredPoint.cat]?.stroke,
                          }}
                        >
                          {hoveredPoint.cat} ({hoveredPoint.mes})
                        </div>
                        <div className="text-white text-[11px]">
                          DEFECTUOSAS: <strong className="text-[#FF5500]">{hoveredPoint.porcDefectuosas}%</strong>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          FALLAS: {hoveredPoint.fallas.toLocaleString()} u. / TOTAL: {hoveredPoint.total.toLocaleString()} u.
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-2 text-[10px] font-pixel text-slate-400 border-t border-[#1E2842] z-10">
                    {evolutionaryData.mesesLista.map((mes) => (
                      <span key={mes}>/{mes}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 bg-[#0E1322] border-t-2 border-[#1E2842] flex items-center justify-between text-xs font-pixel text-slate-400 shrink-0">
              <span>
                {isMerged ? (
                  <strong className="text-[#A855F7]">MODO FUSIÓN DE PROMEDIOS ACTIVADO</strong>
                ) : (
                  <>
                    CURVAS GRAFICADAS:{" "}
                    <strong className="text-[#00E5FF]">{activeCategories.length}</strong> / 3
                  </>
                )}
              </span>
              <button
                onClick={() => setIsChartModalOpen(false)}
                className="px-4 py-1.5 bg-[#161C2E] border border-[#1E2842] text-white hover:border-[#FF5500]"
              >
                CERRAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIGURAR URL SHEETS */}
      {isUrlModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[100] flex items-center justify-center p-4 font-mono">
          <div className="bg-[#0E1322] border-2 border-[#00E5FF] w-full max-w-lg p-5 shadow-[6px_6px_0px_#000] space-y-4 relative">
            <button
              onClick={() => setIsUrlModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>
            <div className="border-b border-[#1E2842] pb-2">
              <h3 className="font-pixel text-base text-[#00E5FF] flex items-center gap-2">
                <Link size={18} /> PLANILLA DE PRODUCCIÓN (CSV)
              </h3>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-pixel text-slate-400 block">
                URL DEL CSV PUBLICADO:
              </label>
              <input
                type="text"
                placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                className="w-full bg-[#070A12] border border-[#1E2842] text-xs text-white p-2 focus:border-[#00E5FF] focus:outline-none"
              />
            </div>
            <div className="pt-3 border-t border-[#1E2842] flex justify-end gap-3 font-pixel text-xs">
              <button
                onClick={() => setIsUrlModalOpen(false)}
                className="px-4 py-2 border border-[#1E2842] text-slate-400 hover:text-white"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSyncSheets}
                disabled={isSyncing}
                className="flex items-center gap-2 px-5 py-2 bg-[#00E5FF] text-black font-bold border border-white hover:bg-white"
              >
                <Save size={14} />
                <span>{isSyncing ? "GUARDANDO..." : "GUARDAR Y RECARGAR"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}