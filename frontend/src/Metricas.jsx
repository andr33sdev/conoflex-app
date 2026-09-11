import { useState, useEffect, useMemo, useRef } from "react";
import {
  Calendar,
  Filter,
  RotateCw,
  Printer,
  Link,
  RefreshCw,
  Save,
  X,
  TrendingUp,
  GripVertical,
  Maximize2,
  CheckCircle,
  CheckCircle2,
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
  Settings,
  BarChart3,
  Activity,
  Shield,
  Layers,
} from "lucide-react";

// COLORES MÁQUINAS Y MODO UNIFICADO ESTILO RPG
const CATEGORY_COLORS = {
  EXTRUSIÓN: {
    stroke: "#ffbe00",
    fill: "rgba(255, 190, 0, 0.25)",
    id: "grad-ext",
  },
  INYECCIÓN: {
    stroke: "#38bdf8",
    fill: "rgba(56, 189, 248, 0.25)",
    id: "grad-iny",
  },
  ROTOMOLDEO: {
    stroke: "#24cc8f",
    fill: "rgba(36, 204, 143, 0.25)",
    id: "grad-rot",
  },
  UNIFICADO: {
    stroke: "#a594c9",
    fill: "rgba(165, 148, 201, 0.25)",
    id: "grad-uni",
  },
};

const ROW_HEIGHT = 42; // Altura fija RPG para paginación pixel-perfect

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

function inferCategoryFrontend(codigo, articulo) {
  const cod = String(codigo || "")
    .trim()
    .toUpperCase();
  const art = String(articulo || "")
    .trim()
    .toUpperCase();

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

  // GRUPOS DE ALERTA DE STOCK
  const [gruposAlerta, setGruposAlerta] = useState([]);
  const [grupoActivo, setGrupoActivo] = useState(null);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupForm, setGroupForm] = useState({
    id: null,
    nombre: "",
    dias_critico: 5,
    dias_alerta: 15,
  });

  // RANGO FECHAS
  const [fechaDesde, setFechaDesde] = useState("2024-01-01");
  const [fechaHasta, setFechaHasta] = useState("2026-12-31");

  // MODALES RPG
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

  // ESTADOS MATRIZ PLANIFICACIÓN
  const [searchTermSE, setSearchTermSE] = useState("");
  const [filtroEstadoStock, setFiltroEstadoStock] = useState("TODOS");
  const [currentPageSE, setCurrentPageSE] = useState(1);

  // REFS PAGINACIÓN ADAPTATIVA
  const tableContainerRef = useRef(null);
  const tableHeaderRef = useRef(null);
  const [itemsPerPageSE, setItemsPerPageSE] = useState(10);

  // SIMULADOR TEMPORAL
  const [simulatedItem, setSimulatedItem] = useState(null);
  const [simulatedBatchQty, setSimulatedBatchQty] = useState(500);
  const [simulatedDate, setSimulatedBatchDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().split("T")[0];
  });

  const fetchGrupos = async () => {
    try {
      const res = await fetch("http://localhost:3001/api/grupos-alerta");
      const data = await res.json();
      setGruposAlerta(data);
      if (data.length > 0) {
        setGrupoActivo(
          (prev) => prev || data.find((g) => g.es_predeterminado) || data[0],
        );
      }
    } catch (err) {
      console.error("Error cargando grupos de alerta:", err);
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [resProd, resSE, resGrupos] = await Promise.all([
        fetch("http://localhost:3001/api/metricas/produccion"),
        fetch("http://localhost:3001/api/semielaborados"),
        fetch("http://localhost:3001/api/grupos-alerta"),
      ]);
      setProduccion(await resProd.json());
      setSemielaborados(await resSE.json());
      const dataGrupos = await resGrupos.json();
      setGruposAlerta(dataGrupos);
      if (dataGrupos.length > 0) {
        setGrupoActivo(
          (prev) =>
            prev ||
            dataGrupos.find((g) => g.es_predeterminado) ||
            dataGrupos[0],
        );
      }
    } catch (err) {
      console.error("Error cargando datos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // OBSERVER MATRIZ MODAL RPG
  useEffect(() => {
    if (!isMatrizModalOpen || !tableContainerRef.current) return;

    const calculatePageSize = () => {
      if (!tableContainerRef.current) return;
      const containerHeight = tableContainerRef.current.clientHeight;
      const headerHeight = tableHeaderRef.current
        ? tableHeaderRef.current.offsetHeight
        : 36;
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

  const diasCriticoActivo = grupoActivo ? grupoActivo.dias_critico : 5;
  const diasAlertaActivo = grupoActivo ? grupoActivo.dias_alerta : 15;

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
    const tasaCalidad =
      totalPiezas > 0 ? ((buenas / totalPiezas) * 100).toFixed(1) : "100.0";

    const semielaboradosEnRiesgo = semielaborados.filter(
      (s) =>
        s.demanda_mensual > 0 &&
        (s.dias_stock === null || s.dias_stock < diasCriticoActivo),
    ).length;

    return {
      buenas,
      fallas,
      totalPiezas,
      kgTotal,
      porcDefectuosas,
      tasaCalidad,
      count: filtrados.length,
      semielaboradosEnRiesgo,
    };
  }, [produccion, semielaborados, fechaDesde, fechaHasta, diasCriticoActivo]);

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
        const x =
          totalMeses > 1 ? (idx / (totalMeses - 1)) * SVG_WIDTH : SVG_WIDTH / 2;
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
      const x =
        totalMeses > 1 ? (idx / (totalMeses - 1)) * SVG_WIDTH : SVG_WIDTH / 2;
      const y = SVG_HEIGHT - (porcDefectuosas / maxY) * SVG_HEIGHT;

      return {
        mes,
        porcDefectuosas,
        buenas: d.buenas,
        fallas: d.fallas,
        total,
        x,
        y,
        cat: "PROMEDIO GLOBAL",
      };
    });

    maxY = Math.ceil(maxY * 1.15);

    return { mesesLista, series, serieUnificada, maxY, SVG_WIDTH, SVG_HEIGHT };
  }, [produccion, fechaDesde, fechaHasta]);

  const semielaboradosCruzados = useMemo(() => {
    return semielaborados
      .map((s) => {
        const dias = s.dias_stock;
        let estado = "OK";
        let mensaje = `✅ ÓPTIMO (> ${diasAlertaActivo}D)`;

        if (s.demanda_mensual > 0) {
          if (dias === null || dias < diasCriticoActivo) {
            estado = "CRITICO";
            mensaje = `🚨 CRÍTICO (< ${diasCriticoActivo}D)`;
          } else if (dias <= diasAlertaActivo) {
            estado = "ALERTA";
            mensaje = `⚠️ ALERTA (< ${diasAlertaActivo}D)`;
          }
        } else {
          mensaje = "ℹ️ SIN DEMANDA";
        }

        let fechaUltimaLimpia = s.ultima_produccion_fecha;
        if (!fechaUltimaLimpia || fechaUltimaLimpia === "1970-01-01")
          fechaUltimaLimpia = null;

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

        if (filtroEstadoStock === "CRITICO")
          return s.estadoMatriz === "CRITICO";
        if (filtroEstadoStock === "ALERTA") return s.estadoMatriz === "ALERTA";
        if (filtroEstadoStock === "OK")
          return s.estadoMatriz === "OK" || s.estadoMatriz === "PRUDENTE";

        return true;
      });
  }, [
    semielaborados,
    searchTermSE,
    filtroEstadoStock,
    diasCriticoActivo,
    diasAlertaActivo,
  ]);

  const totalPagesSE =
    Math.ceil(semielaboradosCruzados.length / itemsPerPageSE) || 1;
  const indexOfLastSE = currentPageSE * itemsPerPageSE;
  const indexOfFirstSE = indexOfLastSE - itemsPerPageSE;
  const currentPaginatedSE = semielaboradosCruzados.slice(
    indexOfFirstSE,
    indexOfLastSE,
  );

  const emptySlotsSE = Math.max(0, itemsPerPageSE - currentPaginatedSE.length);

  // DRAG & DROP EVENT HANDLERS
  const handleDragStart = (e, category) =>
    e.dataTransfer.setData("text/plain", category);
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDraggingOverChart(true);
  };
  const handleDragLeave = () => setIsDraggingOverChart(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDraggingOverChart(false);
    const category = e.dataTransfer.getData("text/plain");
    if (category && !activeCategories.includes(category))
      setActiveCategories((prev) => [...prev, category]);
  };
  const handlePillClick = () => {
    setClickToast(true);
    setTimeout(() => setClickToast(false), 2500);
  };
  const removeCategory = (cat) =>
    setActiveCategories(activeCategories.filter((c) => c !== cat));

  return (
    <div className="h-full flex flex-col font-mono text-[#e1d7f5] select-none space-y-2 sm:space-y-3 min-h-0 bg-[#1a0f2e] p-1 overflow-hidden">
      {/* 1. HEADER CONTROL DE PRODUCCIÓN Y SINC */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between pb-2 sm:pb-3 border-b-2 border-[#432874] gap-2 shrink-0">
        <div>
          <h2 className="font-pixel text-sm sm:text-lg text-[#ffbe00] font-bold flex items-center gap-1.5 sm:gap-2 tracking-wide drop-shadow-[1px_1px_0px_#000]">
            <TrendingUp size={16} className="text-[#38bdf8] shrink-0" /> CONTROL
            DE PRODUCCIÓN & DEFECTOS
          </h2>
          <p className="text-[10px] sm:text-xs text-[#a594c9] mt-0.5 font-mono hidden sm:block">
            Métricas integradas con ingenierías y planificación de matrices.
          </p>
        </div>

        <div className="flex items-center gap-1.5 font-pixel text-xs bg-[#24173e] p-1.5 border-2 border-[#432874] rounded-xs shadow-[2px_2px_0px_#000] shrink-0">
          <Calendar size={13} className="text-[#a594c9] hidden sm:block" />
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="bg-[#160c2b] border border-[#432874] text-white text-[10px] sm:text-[11px] px-1.5 py-0.5 rounded-2xs focus:outline-none focus:border-[#ffbe00]"
          />
          <span className="text-[#a594c9] text-[10px]">-</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="bg-[#160c2b] border border-[#432874] text-white text-[10px] sm:text-[11px] px-1.5 py-0.5 rounded-2xs focus:outline-none focus:border-[#ffbe00]"
          />

          <button
            onClick={handleSyncSheets}
            disabled={isSyncing}
            className="px-2.5 py-1 bg-[#38bdf8] border border-[#0284c7] text-[#2c1a4d] font-bold text-[10px] hover:bg-[#7dd3fc] active:translate-y-0.5 shadow-[1px_1px_0px_#000] rounded-2xs flex items-center gap-1 ml-1"
          >
            <RefreshCw size={11} className={isSyncing ? "animate-spin" : ""} />
            <span>SINC</span>
          </button>
        </div>
      </div>

      {/* 2. TARJETAS KPI RPG BARS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 shrink-0 font-pixel">
        <div className="bg-[#24173e] border-2 border-[#24cc8f]/50 p-2.5 rounded-xs shadow-[3px_3px_0px_#000] relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-[#a594c9] font-bold block">
              PIEZAS BUENAS
            </span>
            <CheckCircle2 size={16} className="text-[#24cc8f]" />
          </div>
          <strong className="text-sm sm:text-lg text-white font-bold block mt-1">
            {loading ? "..." : globalStats.buenas.toLocaleString()}{" "}
            <span className="text-[10px] text-[#24cc8f]">u.</span>
          </strong>
          <div className="mt-2 bg-[#160c2b] h-1.5 w-full rounded-2xs overflow-hidden border border-[#432874]">
            <div
              className="bg-[#24cc8f] h-full transition-all duration-500"
              style={{ width: `${globalStats.tasaCalidad}%` }}
            />
          </div>
        </div>

        <div className="bg-[#24173e] border-2 border-[#f87171]/50 p-2.5 rounded-xs shadow-[3px_3px_0px_#000] relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-[#a594c9] font-bold block">
              PIEZAS FALLADAS
            </span>
            <AlertTriangle size={16} className="text-[#f87171]" />
          </div>
          <strong className="text-sm sm:text-lg text-[#f87171] font-bold block mt-1">
            {loading ? "..." : globalStats.fallas.toLocaleString()}{" "}
            <span className="text-[10px] text-[#f87171]">u.</span>
          </strong>
          <div className="mt-2 bg-[#160c2b] h-1.5 w-full rounded-2xs overflow-hidden border border-[#432874]">
            <div
              className="bg-[#f87171] h-full transition-all duration-500"
              style={{
                width: `${Math.min(100, parseFloat(globalStats.porcDefectuosas) * 10)}%`,
              }}
            />
          </div>
        </div>

        <div className="bg-[#24173e] border-2 border-[#fb923c]/50 p-2.5 rounded-xs shadow-[3px_3px_0px_#000] relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-[#a594c9] font-bold block">
              TASA DEFECTUOSA
            </span>
            <Activity size={16} className="text-[#fb923c]" />
          </div>
          <strong className="text-sm sm:text-lg text-[#fb923c] font-bold block mt-1">
            {loading ? "..." : `${globalStats.porcDefectuosas}%`}
          </strong>
          <span className="text-[9px] text-[#a594c9] block mt-1 truncate">
            {globalStats.tasaCalidad}% Eficiencia de Planta
          </span>
        </div>

        <div className="bg-[#24173e] border-2 border-[#ffbe00] p-2.5 rounded-xs shadow-[3px_3px_0px_#000] relative overflow-hidden group border-l-4 border-l-[#f87171]">
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-[#ffbe00] font-bold block">
              RIESGO (&lt;{diasCriticoActivo}D)
            </span>
            <Shield size={16} className="text-[#f87171] animate-pulse" />
          </div>
          <strong className="text-sm sm:text-lg text-white font-bold block mt-1">
            {loading ? "..." : `${globalStats.semielaboradosEnRiesgo} matrices`}
          </strong>
          <span
            className="text-[9px] text-[#ffbe00] block mt-1 underline cursor-pointer hover:text-white"
            onClick={() => setIsMatrizModalOpen(true)}
          >
            Ver matriz de stock →
          </span>
        </div>
      </div>

      {/* 3. DOS PANELES DE CONTROL PRINCIPAL */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0 font-pixel">
        <div className="bg-[#24173e] border-2 border-[#432874] p-4 flex flex-col justify-between rounded-xs shadow-[4px_4px_0px_#000] relative overflow-hidden group hover:border-[#38bdf8]/60 transition-colors">
          <div className="space-y-3">
            <div className="w-12 h-12 bg-[#160c2b] border-2 border-[#38bdf8] flex items-center justify-center p-2 rounded-xs shadow-[2px_2px_0px_#000] group-hover:scale-110 transition-transform">
              <BarChart3 size={24} className="text-[#38bdf8]" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base text-white font-bold group-hover:text-[#38bdf8] transition-colors">
                COMPARADOR EVOLUTIVO DRAG & DROP
              </h3>
              <p className="text-xs text-[#a594c9] font-mono mt-1.5 leading-relaxed">
                Analizá la evolución mensual de producción buena versus piezas
                falladas arrastrando tecnologías sobre el lienzo.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsChartModalOpen(true)}
            className="w-full py-2.5 bg-[#160c2b] border-2 border-[#38bdf8] text-[#38bdf8] hover:bg-[#38bdf8] hover:text-[#2c1a4d] font-pixel text-xs font-bold transition-all shadow-[2px_2px_0px_#000] active:translate-y-0.5 rounded-xs flex items-center justify-center gap-2 mt-4"
          >
            <Maximize2 size={14} />
            <span>ABRIR GRÁFICO EVOLUTIVO</span>
          </button>
        </div>

        <div className="bg-[#24173e] border-2 border-[#432874] p-4 flex flex-col justify-between rounded-xs shadow-[4px_4px_0px_#000] relative overflow-hidden group hover:border-[#ffbe00]/60 transition-colors">
          <div className="space-y-3">
            <div className="w-12 h-12 bg-[#160c2b] border-2 border-[#ffbe00] flex items-center justify-center p-2 rounded-xs shadow-[2px_2px_0px_#000] group-hover:scale-110 transition-transform">
              <Calculator size={24} className="text-[#ffbe00]" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base text-white font-bold group-hover:text-[#ffbe00] transition-colors">
                MATRIZ Y PLANIFICACIÓN DE STOCK CRÍTICO
              </h3>
              <p className="text-xs text-[#a594c9] font-mono mt-1.5 leading-relaxed">
                Cruza la última producción de semielaborados con la demanda de
                ventas e identifica la cobertura según grupos de alerta.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setCurrentPageSE(1);
              setIsMatrizModalOpen(true);
            }}
            className="w-full py-2.5 bg-[#ffbe00] border-2 border-[#b38600] text-[#2c1a4d] font-pixel text-xs font-bold hover:bg-[#ffe066] transition-all shadow-[2px_2px_0px_#000] active:translate-y-0.5 rounded-xs flex items-center justify-center gap-2 mt-4"
          >
            <Maximize2 size={14} />
            <span>ABRIR MATRIZ Y PLANIFICACIÓN</span>
          </button>
        </div>
      </div>

      {/* =========================================================
          MODAL 1: COMPARADOR EVOLUTIVO (DRAG & DROP CANVAS SVG)
      ========================================================= */}
      {isChartModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xs z-[100] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200 font-mono">
          <div className="bg-[#24173e] border-2 border-[#38bdf8] w-full max-w-6xl h-[90vh] p-4 sm:p-5 shadow-[0_0_40px_rgba(56,189,248,0.25)] flex flex-col relative rounded-xs overflow-hidden">
            <button
              onClick={() => setIsChartModalOpen(false)}
              className="absolute top-4 right-4 text-[#a594c9] hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b-2 border-[#432874] pb-2 shrink-0 pr-6">
              <span className="text-[10px] font-pixel text-[#38bdf8] bg-[#38bdf8]/10 px-2 py-0.5 border border-[#38bdf8]/30 rounded-xs font-bold">
                CANVAS DE ANÁLISIS TÉCNICO
              </span>
              <h3 className="font-pixel text-sm sm:text-base text-white font-bold mt-1.5 flex items-center gap-2">
                <BarChart3 size={16} className="text-[#ffbe00]" /> EVOLUCIÓN
                HISTÓRICA DE PIEZAS DEFECTUOSAS
              </h3>
            </div>

            {/* DRAG & DROP TOOLBAR */}
            <div className="bg-[#160c2b] border-b border-[#432874] p-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 text-[10px] font-pixel text-[#a594c9]">
                <GripVertical
                  size={14}
                  className="text-[#ffbe00] animate-bounce"
                />
                <span>ARRASTRÁ EL CARTUCHO Y SOLTALO EN EL GRÁFICO:</span>
              </div>

              <div className="flex items-center gap-2 font-pixel text-[10px]">
                {["EXTRUSIÓN", "INYECCIÓN", "ROTOMOLDEO"].map((cat) => {
                  const isAlreadyActive = activeCategories.includes(cat);
                  const color = CATEGORY_COLORS[cat].stroke;

                  return (
                    <div
                      key={cat}
                      draggable={!isMerged}
                      onDragStart={(e) => handleDragStart(e, cat)}
                      onClick={handlePillClick}
                      className={`px-2.5 py-1.5 border-2 font-bold transition-all shadow-[2px_2px_0px_#000] rounded-2xs ${
                        isMerged
                          ? "opacity-30 cursor-not-allowed bg-[#24173e] border-[#432874] text-[#a594c9]"
                          : isAlreadyActive
                            ? "bg-[#160c2b] text-white border-white opacity-40 cursor-not-allowed"
                            : "bg-[#2c1a4d] text-white cursor-grab active:cursor-grabbing hover:scale-105"
                      }`}
                      style={{ borderColor: !isMerged ? color : undefined }}
                    >
                      <span
                        className="w-2 h-2 rounded-full inline-block mr-1.5"
                        style={{ backgroundColor: color }}
                      />
                      <span>{cat}</span>
                    </div>
                  );
                })}

                <button
                  onClick={() => setIsMerged(!isMerged)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border-2 font-bold transition-all shadow-[2px_2px_0px_#000] active:translate-y-0.5 ml-2 rounded-2xs ${
                    isMerged
                      ? "bg-[#a594c9] text-[#2c1a4d] border-[#a594c9] shadow-[0_0_15px_rgba(165,148,201,0.6)]"
                      : "bg-[#2c1a4d] border-[#a594c9] text-[#a594c9] hover:bg-[#a594c9] hover:text-[#2c1a4d]"
                  }`}
                >
                  <GitMerge size={13} />
                  <span>
                    {isMerged ? "SEPARAR LÍNEAS" : "FUSIONAR PROMEDIOS"}
                  </span>
                </button>
              </div>

              {clickToast && !isMerged && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-[#ffbe00] text-[#2c1a4d] font-pixel text-[10px] p-2 shadow-[2px_2px_0px_#000] z-50 border border-white animate-bounce rounded-2xs font-bold">
                  ✋ ¡Mantené apretado y ARRASTRÁ el cartucho hacia abajo!
                </div>
              )}
            </div>

            {/* CANVAS SVG CON DRAG OVER */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex-1 relative flex flex-col justify-between overflow-hidden transition-colors border-b-2 border-[#432874] ${
                isDraggingOverChart
                  ? "bg-[#38bdf8]/10 border-2 border-dashed border-[#38bdf8]"
                  : "bg-[#160c2b]"
              }`}
            >
              {isDraggingOverChart && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-xs font-pixel text-xs text-[#38bdf8] font-bold animate-pulse">
                  ¡SOLTÁ AQUÍ PARA TRAZAR LA CURVA BÉZIER!
                </div>
              )}

              <div className="absolute right-4 top-3 z-20 flex items-center gap-2">
                {isMerged ? (
                  <span className="px-3 py-1 bg-[#a594c9]/20 border-2 border-[#a594c9] text-[#a594c9] font-pixel text-[10px] font-bold flex items-center gap-1.5 shadow-[0_0_12px_rgba(165,148,201,0.5)] rounded-2xs">
                    <Sparkles size={12} /> PROMEDIO GLOBAL FUSIONADO
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
                        className={`px-2.5 py-1 bg-[#2c1a4d] border-2 font-pixel text-[10px] text-white font-bold flex items-center gap-1.5 shadow-[1px_1px_0px_#000] cursor-pointer transition-all rounded-2xs ${
                          isHoveredPill
                            ? "scale-105 border-white shadow-[0_0_10px_rgba(255,255,255,0.4)]"
                            : "opacity-90"
                        }`}
                        style={{ borderColor: color }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span>{cat}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCategory(cat);
                          }}
                          className="hover:text-[#f87171] ml-1"
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })
                )}
              </div>

              <div className="absolute left-2 top-3 text-[9px] font-pixel text-[#a594c9]">
                % DEFECTUOSAS
              </div>

              {evolutionaryData.mesesLista.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-[#6e588a] font-pixel text-xs">
                  No hay datos para el rango ({fechaDesde} a {fechaHasta}).
                </div>
              ) : !isMerged && activeCategories.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-[#6e588a] font-pixel text-[11px] text-center">
                  <div>
                    <p className="text-[#ffbe00] font-bold mb-1">
                      NINGUNA MÁQUINA SELECCIONADA
                    </p>
                    <p>
                      Arrastrá y soltá cualquiera de los cartuchos superiores
                      dentro del lienzo.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col justify-between pt-8 pb-6 px-12 relative">
                  <div className="absolute inset-x-12 top-8 bottom-8 flex flex-col justify-between pointer-events-none">
                    {[1, 0.75, 0.5, 0.25, 0].map((step) => (
                      <div
                        key={step}
                        className="border-b border-[#432874]/30 w-full flex items-center text-[9px] font-pixel text-[#6e588a]"
                      >
                        <span className="-ml-8">
                          {(evolutionaryData.maxY * step).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="w-full h-full relative z-10">
                    <svg
                      viewBox="0 0 1000 500"
                      preserveAspectRatio="none"
                      className="w-full h-full overflow-visible"
                    >
                      <defs>
                        {Object.entries(CATEGORY_COLORS).map(
                          ([cat, colors]) => (
                            <linearGradient
                              key={cat}
                              id={colors.id}
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor={colors.stroke}
                                stopOpacity="0.4"
                              />
                              <stop
                                offset="100%"
                                stopColor={colors.stroke}
                                stopOpacity="0.0"
                              />
                            </linearGradient>
                          ),
                        )}
                      </defs>

                      <g id="layer-areas">
                        {isMerged
                          ? (() => {
                              const { areaD } = generateBezierPaths(
                                evolutionaryData.serieUnificada,
                                0.25,
                              );
                              return (
                                <path
                                  d={areaD}
                                  fill={`url(#${CATEGORY_COLORS.UNIFICADO.id})`}
                                  className="transition-all duration-500"
                                />
                              );
                            })()
                          : activeCategories.map((cat) => {
                              const puntos = evolutionaryData.series[cat] || [];
                              if (puntos.length === 0) return null;
                              const { areaD } = generateBezierPaths(
                                puntos,
                                0.25,
                              );
                              const isBlurred =
                                highlightedCategory !== null &&
                                highlightedCategory !== cat;
                              return (
                                <path
                                  key={cat}
                                  d={areaD}
                                  fill={`url(#${CATEGORY_COLORS[cat].id})`}
                                  className={`transition-all duration-300 ${isBlurred ? "opacity-10" : "opacity-100"}`}
                                />
                              );
                            })}
                      </g>

                      <g id="layer-lines">
                        {isMerged
                          ? (() => {
                              const { lineD } = generateBezierPaths(
                                evolutionaryData.serieUnificada,
                                0.25,
                              );
                              return (
                                <path
                                  d={lineD}
                                  fill="none"
                                  stroke={CATEGORY_COLORS.UNIFICADO.stroke}
                                  strokeWidth="4"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="transition-all duration-500 drop-shadow-[0_0_8px_rgba(165,148,201,0.8)]"
                                />
                              );
                            })()
                          : activeCategories.map((cat) => {
                              const puntos = evolutionaryData.series[cat] || [];
                              if (puntos.length === 0) return null;
                              const { lineD } = generateBezierPaths(
                                puntos,
                                0.25,
                              );
                              const isBlurred =
                                highlightedCategory !== null &&
                                highlightedCategory !== cat;
                              return (
                                <path
                                  key={cat}
                                  d={lineD}
                                  fill="none"
                                  stroke={CATEGORY_COLORS[cat].stroke}
                                  strokeWidth={
                                    highlightedCategory === cat ? "5" : "3.5"
                                  }
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className={`transition-all duration-300 ${isBlurred ? "opacity-15 blur-[1px]" : "opacity-100"}`}
                                />
                              );
                            })}
                      </g>

                      <g id="layer-points">
                        {isMerged
                          ? evolutionaryData.serieUnificada.map((pt, idx) => (
                              <g key={idx}>
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
                                  r="6"
                                  fill="#160c2b"
                                  stroke={CATEGORY_COLORS.UNIFICADO.stroke}
                                  strokeWidth="3"
                                  className="pointer-events-none transition-all"
                                />
                              </g>
                            ))
                          : activeCategories.map((cat) => {
                              const puntos = evolutionaryData.series[cat] || [];
                              const isBlurred =
                                highlightedCategory !== null &&
                                highlightedCategory !== cat;
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
                                    r={highlightedCategory === cat ? "7" : "5"}
                                    fill="#160c2b"
                                    stroke={CATEGORY_COLORS[cat].stroke}
                                    strokeWidth="3"
                                    className="pointer-events-none transition-all"
                                  />
                                </g>
                              ));
                            })}
                      </g>
                    </svg>

                    {hoveredPoint && (
                      <div
                        className="absolute z-40 bg-[#24173e] border-2 p-2.5 font-pixel text-[10px] shadow-[3px_3px_0px_#000] pointer-events-none -translate-x-1/2 -translate-y-full mb-3 rounded-xs"
                        style={{
                          left: `${(hoveredPoint.x / 1000) * 100}%`,
                          top: `${(hoveredPoint.y / 500) * 100}%`,
                          borderColor: isMerged
                            ? CATEGORY_COLORS.UNIFICADO.stroke
                            : CATEGORY_COLORS[hoveredPoint.cat]?.stroke ||
                              "#38bdf8",
                        }}
                      >
                        <div
                          className="font-bold border-b border-[#432874] pb-1.5 mb-1.5"
                          style={{
                            color: isMerged
                              ? CATEGORY_COLORS.UNIFICADO.stroke
                              : CATEGORY_COLORS[hoveredPoint.cat]?.stroke,
                          }}
                        >
                          {hoveredPoint.cat} ({hoveredPoint.mes})
                        </div>
                        <div className="text-white">
                          DEFECTUOSAS:{" "}
                          <strong className="text-[#f87171] text-[11px]">
                            {hoveredPoint.porcDefectuosas}%
                          </strong>
                        </div>
                        <div className="text-[#a594c9] mt-1">
                          Fallas: {hoveredPoint.fallas.toLocaleString()} u.{" "}
                          <br />
                          Total: {hoveredPoint.total.toLocaleString()} u.
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-2 text-[9px] font-pixel text-[#a594c9] border-t border-[#432874] z-10">
                    {evolutionaryData.mesesLista.map((mes) => (
                      <span key={mes}>/{mes}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end font-pixel">
              <button
                onClick={() => setIsChartModalOpen(false)}
                className="px-4 py-1.5 bg-[#38bdf8] text-[#2c1a4d] font-bold text-xs hover:bg-[#7dd3fc] shadow-[2px_2px_0px_#000] rounded-xs"
              >
                CERRAR GRÁFICO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 2: MATRIZ DE PLANIFICACIÓN (PAGINACIÓN EXACTA h-[85vh])
      ========================================================= */}
      {isMatrizModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xs z-[100] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200 font-mono">
          <div className="bg-[#24173e] border-2 border-[#ffbe00] w-full max-w-7xl h-[85vh] p-3 sm:p-4 shadow-[0_0_40px_rgba(255,190,0,0.3)] flex flex-col relative rounded-xs overflow-hidden">
            <button
              onClick={() => setIsMatrizModalOpen(false)}
              className="absolute top-4 right-4 text-[#a594c9] hover:text-white z-50"
            >
              <X size={16} />
            </button>

            <div className="border-b-2 border-[#432874] pb-2 shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pr-8">
              <div>
                <span className="text-[10px] font-pixel text-[#ffbe00] bg-[#ffbe00]/10 px-2 py-0.5 border border-[#ffbe00]/30 rounded-xs font-bold">
                  TABLA DE COBERTURA & PLANIFICACIÓN
                </span>
                <h3 className="font-pixel text-sm sm:text-base text-white font-bold mt-1.5 flex items-center gap-2">
                  <Calculator size={16} className="text-[#ffbe00]" /> MATRIZ DE
                  RIESGO DE SEMIELABORADOS
                </h3>
              </div>

              {/* SELECTOR DE GRUPOS DE ALERTA */}
              <div className="flex items-center gap-2 font-pixel text-[10px] bg-[#160c2b] border border-[#432874] px-2 py-1.5 rounded-xs">
                <span className="text-[#a594c9] font-bold">GRUPO:</span>
                <select
                  value={grupoActivo?.id || ""}
                  onChange={(e) => {
                    const selected = gruposAlerta.find(
                      (g) => g.id === Number(e.target.value),
                    );
                    if (selected) {
                      setGrupoActivo(selected);
                      setCurrentPageSE(1);
                    }
                  }}
                  className="bg-[#24173e] text-[#38bdf8] focus:outline-none focus:border-[#38bdf8] font-bold px-1"
                >
                  {gruposAlerta.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nombre} (&lt;{g.dias_critico}d)
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    setGroupForm({
                      id: null,
                      nombre: "",
                      dias_critico: 5,
                      dias_alerta: 15,
                    });
                    setIsGroupModalOpen(true);
                  }}
                  className="text-[#a594c9] hover:text-[#ffbe00]"
                >
                  <Settings size={13} />
                </button>
              </div>
            </div>

            {/* CONTROLES: BÚSQUEDA Y RIESGO */}
            <div className="py-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
              <div className="relative flex-1 w-full max-w-sm font-pixel">
                <Search
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a594c9]"
                />
                <input
                  type="text"
                  placeholder="Buscar por código o semielaborado..."
                  value={searchTermSE}
                  onChange={(e) => {
                    setSearchTermSE(e.target.value);
                    setCurrentPageSE(1);
                  }}
                  className="w-full bg-[#160c2b] border-2 border-[#432874] text-xs text-white pl-8 pr-3 py-1.5 focus:border-[#ffbe00] focus:outline-none rounded-xs"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 font-pixel text-[10px]">
                {[
                  { id: "TODOS", label: "TODOS" },
                  {
                    id: "CRITICO",
                    label: `🚨 CRÍTICO (<${diasCriticoActivo}d)`,
                  },
                  { id: "ALERTA", label: `⚠️ ALERTA (<${diasAlertaActivo}d)` },
                  { id: "OK", label: `✅ ÓPTIMO (>${diasAlertaActivo}d)` },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      setFiltroEstadoStock(f.id);
                      setCurrentPageSE(1);
                    }}
                    className={`px-2.5 py-1 border transition-colors rounded-2xs ${
                      filtroEstadoStock === f.id
                        ? "bg-[#ffbe00] text-[#2c1a4d] border-[#b38600] font-bold"
                        : "bg-[#2c1a4d] border-[#432874] text-[#a594c9] hover:text-white"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* TABLA ADAPTATIVA (RESIZE OBSERVER h-full) */}
            <div
              ref={tableContainerRef}
              className="flex-1 bg-[#160c2b] border-2 border-[#432874] rounded-xs min-h-0 overflow-hidden flex flex-col font-pixel text-[11px]"
            >
              <table className="w-full text-left border-collapse table-fixed h-full">
                <thead
                  ref={tableHeaderRef}
                  className="bg-[#2c1a4d] border-b-2 border-[#432874] text-[#a594c9] sticky top-0 z-10 h-[36px] shrink-0"
                >
                  <tr>
                    <th className="w-[12%] px-3 font-normal">CÓDIGO</th>
                    <th className="w-[30%] px-3 font-normal">SEMIELABORADO</th>
                    <th className="w-[11%] px-3 font-normal text-right">
                      STOCK
                    </th>
                    <th className="w-[12%] px-3 font-normal text-right">
                      DEMANDA/M
                    </th>
                    <th className="w-[12%] px-3 font-normal text-center">
                      DÍAS COB.
                    </th>
                    <th className="w-[15%] px-3 font-normal text-center">
                      ÚLTIMO LOTE
                    </th>
                    <th className="w-[8%] px-3 font-normal text-center">
                      SIM.
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#432874]/30">
                  {currentPaginatedSE.length === 0 ? (
                    <tr>
                      <td
                        colSpan="7"
                        className="py-16 text-center text-[#6e588a]"
                      >
                        Sin resultados para los filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {currentPaginatedSE.map((item) => {
                        let badgeStyle =
                          "bg-[#24173e] text-[#a594c9] border-[#432874]";
                        if (item.estadoMatriz === "CRITICO")
                          badgeStyle =
                            "bg-[#f87171]/20 text-[#f87171] border-[#f87171]/50 font-bold animate-pulse shadow-[1px_1px_0px_#000]";
                        else if (item.estadoMatriz === "ALERTA")
                          badgeStyle =
                            "bg-[#facc15]/20 text-[#facc15] border-[#facc15]/50 font-bold shadow-[1px_1px_0px_#000]";
                        else if (
                          item.estadoMatriz === "OK" ||
                          item.estadoMatriz === "PRUDENTE"
                        )
                          badgeStyle =
                            "bg-[#24cc8f]/20 text-[#24cc8f] border-[#24cc8f]/50 font-bold shadow-[1px_1px_0px_#000]";

                        return (
                          <tr
                            key={item.id}
                            className="h-[42px] hover:bg-[#281747] transition-colors align-middle group cursor-pointer"
                            onClick={() => {
                              setSimulatedItem(item);
                              setSimulatedBatchQty(500);
                            }}
                          >
                            <td className="px-3 text-[#ffbe00] font-bold tracking-wider truncate group-hover:underline">
                              {item.codigo}
                            </td>
                            <td className="px-3 text-white font-bold truncate">
                              {item.nombre}
                            </td>
                            <td className="px-3 text-right font-bold text-[#24cc8f]">
                              {item.stock_total.toLocaleString()}
                            </td>
                            <td className="px-3 text-right text-[#38bdf8]">
                              {item.demanda_mensual > 0
                                ? item.demanda_mensual.toLocaleString()
                                : "--"}
                            </td>
                            <td className="px-3 text-center whitespace-nowrap">
                              {item.dias_stock !== null ? (
                                <span
                                  className={`inline-block px-2 py-0.5 border rounded-2xs ${badgeStyle}`}
                                >
                                  {item.dias_stock} días
                                </span>
                              ) : (
                                <span className="text-[#6e588a]">--</span>
                              )}
                            </td>
                            <td className="px-3 text-center text-[#a594c9] whitespace-nowrap">
                              {item.ultima_produccion_fecha ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <Clock size={11} className="text-[#ffbe00]" />
                                  <span>{item.ultima_produccion_fecha}</span>
                                </div>
                              ) : (
                                <span className="text-[#6e588a]">
                                  Sin registro
                                </span>
                              )}
                            </td>
                            <td className="px-3 text-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSimulatedItem(item);
                                  setSimulatedBatchQty(500);
                                }}
                                className="p-1.5 bg-[#2c1a4d] border border-[#432874] text-[#38bdf8] hover:bg-[#38bdf8] hover:text-[#2c1a4d] hover:border-[#38bdf8] transition-colors shadow-[1px_1px_0px_#000] rounded-2xs inline-flex items-center"
                                title="Simular lote a futuro"
                              >
                                <Zap size={13} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {/* RANURAS VACÍAS EXACTAS */}
                      {Array.from({ length: emptySlotsSE }).map((_, idx) => (
                        <tr
                          key={`empty-${idx}`}
                          className="h-[42px] opacity-15 pointer-events-none"
                        >
                          <td className="px-3 text-[#432874]">--</td>
                          <td className="px-3 text-[#432874]">
                            -- RANURA VACÍA --
                          </td>
                          <td className="px-3 text-center text-[#432874]">
                            --
                          </td>
                          <td className="px-3 text-center text-[#432874]">
                            --
                          </td>
                          <td className="px-3 text-center text-[#432874]">
                            --
                          </td>
                          <td className="px-3 text-center text-[#432874]">
                            --
                          </td>
                          <td className="px-3 text-center text-[#432874]">
                            --
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {/* FOOTER Y PAGINACIÓN */}
            <div className="flex flex-col sm:flex-row items-center justify-between pt-2 mt-2 border-t-2 border-[#432874] shrink-0 text-[10px] font-pixel gap-2">
              <span className="text-[#a594c9]">
                Mostrando página{" "}
                <strong className="text-white">{currentPageSE}</strong> de{" "}
                <strong className="text-white">{totalPagesSE}</strong> (
                {semielaboradosCruzados.length} ítems)
              </span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPageSE(1)}
                  disabled={currentPageSE === 1}
                  className="p-1 sm:p-1.5 bg-[#2c1a4d] border border-[#432874] text-[#a594c9] hover:text-[#ffbe00] disabled:opacity-30 shadow-[1px_1px_0px_#000] rounded-xs"
                >
                  <ChevronsLeft size={13} />
                </button>
                <button
                  onClick={() => setCurrentPageSE((p) => Math.max(p - 1, 1))}
                  disabled={currentPageSE === 1}
                  className="px-2 py-1 bg-[#2c1a4d] border border-[#432874] text-[#a594c9] hover:text-[#ffbe00] disabled:opacity-30 shadow-[1px_1px_0px_#000] flex items-center gap-0.5 rounded-xs"
                >
                  <ChevronLeft size={13} /> ANT
                </button>

                <span className="px-2.5 py-0.5 bg-[#160c2b] border border-[#432874] text-[#ffbe00] font-bold rounded-xs">
                  {currentPageSE} / {totalPagesSE}
                </span>

                <button
                  onClick={() =>
                    setCurrentPageSE((p) => Math.min(p + 1, totalPagesSE))
                  }
                  disabled={currentPageSE === totalPagesSE}
                  className="px-2 py-1 bg-[#2c1a4d] border border-[#432874] text-[#a594c9] hover:text-[#ffbe00] disabled:opacity-30 shadow-[1px_1px_0px_#000] flex items-center gap-0.5 rounded-xs"
                >
                  SIG <ChevronRight size={13} />
                </button>
                <button
                  onClick={() => setCurrentPageSE(totalPagesSE)}
                  disabled={currentPageSE === totalPagesSE}
                  className="p-1 sm:p-1.5 bg-[#2c1a4d] border border-[#432874] text-[#a594c9] hover:text-[#ffbe00] disabled:opacity-30 shadow-[1px_1px_0px_#000] rounded-xs"
                >
                  <ChevronsRight size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 3: SIMULADOR DE LOTE PROYECTADO
      ========================================================= */}
      {simulatedItem && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[110] flex items-center justify-center p-3 font-mono animate-in zoom-in-95 duration-150">
          <div className="bg-[#24173e] border-2 border-[#38bdf8] w-full max-w-lg p-5 shadow-[0_0_35px_rgba(56,189,248,0.3)] space-y-4 relative rounded-xs">
            <button
              onClick={() => setSimulatedItem(null)}
              className="absolute top-4 right-4 text-[#a594c9] hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b-2 border-[#432874] pb-2">
              <span className="text-[10px] font-pixel text-[#38bdf8] bg-[#38bdf8]/10 px-2 py-0.5 border border-[#38bdf8]/30 rounded-xs font-bold">
                PROYECCIÓN Y SIMULADOR
              </span>
              <h3 className="font-pixel text-sm sm:text-base text-white font-bold mt-1.5 flex items-center gap-2">
                <Zap size={16} className="text-[#ffbe00]" /> SIMULAR ARRIBO DE
                LOTE FUTURO
              </h3>
              <p className="text-xs text-[#a594c9] font-bold mt-0.5 truncate">
                [{simulatedItem.codigo}] {simulatedItem.nombre}
              </p>
            </div>

            <div className="space-y-3 text-xs font-pixel">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-[#160c2b] border border-[#432874] rounded-xs shadow-[1px_1px_0px_#000]">
                  <span className="text-[#a594c9] block text-[9px] mb-1">
                    STOCK HOY:
                  </span>
                  <strong className="text-white text-sm">
                    {simulatedItem.stock_total.toLocaleString()}{" "}
                    <span className="text-[10px]">u.</span>
                  </strong>
                </div>

                <div className="p-2.5 bg-[#160c2b] border border-[#432874] rounded-xs shadow-[1px_1px_0px_#000]">
                  <span className="text-[#a594c9] block text-[9px] mb-1">
                    DEMANDA ESTIMADA:
                  </span>
                  <strong className="text-[#38bdf8] text-sm">
                    {simulatedItem.demanda_mensual.toLocaleString()}{" "}
                    <span className="text-[10px]">u./mes</span>
                  </strong>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-[#432874]">
                <div>
                  <label className="text-[#a594c9] block font-bold mb-1">
                    FECHA FUTURA DE ARRIBO:
                  </label>
                  <input
                    type="date"
                    value={simulatedDate}
                    onChange={(e) => setSimulatedBatchDate(e.target.value)}
                    className="w-full bg-[#160c2b] border border-[#432874] text-white p-2 text-xs focus:outline-none focus:border-[#38bdf8] rounded-xs font-mono"
                  />
                </div>

                <div>
                  <label className="text-[#a594c9] block font-bold mb-1">
                    UNIDADES A INGRESAR (+):
                  </label>
                  <input
                    type="number"
                    value={simulatedBatchQty}
                    onChange={(e) =>
                      setSimulatedBatchQty(
                        Math.max(0, parseInt(e.target.value) || 0),
                      )
                    }
                    className="w-full bg-[#160c2b] border-2 border-[#38bdf8] text-white font-bold p-2 text-xs focus:outline-none focus:border-[#ffbe00] text-right rounded-xs font-mono"
                  />
                </div>
              </div>

              {/* LÓGICA DE PROYECCIÓN MATEMÁTICA */}
              {(() => {
                const hoy = new Date();
                hoy.setHours(0, 0, 0, 0);

                const objetivo = new Date(simulatedDate + "T00:00:00");
                const diffTime = objetivo.getTime() - hoy.getTime();
                const diasEspera = Math.max(
                  0,
                  Math.ceil(diffTime / (1000 * 60 * 60 * 24)),
                );

                const consumoDiario = simulatedItem.demanda_mensual / 30;
                const consumoEnEspera = Math.round(diasEspera * consumoDiario);

                const stockRemanenteAFecha = Math.max(
                  0,
                  simulatedItem.stock_total - consumoEnEspera,
                );
                const quiebreAntes =
                  simulatedItem.demanda_mensual > 0 &&
                  simulatedItem.stock_total - consumoEnEspera < 0;

                const diasHastaAgotar =
                  simulatedItem.demanda_mensual > 0
                    ? Math.floor(
                        (simulatedItem.stock_total /
                          simulatedItem.demanda_mensual) *
                          30,
                      )
                    : 999;
                const nuevoStockPostLote =
                  stockRemanenteAFecha + simulatedBatchQty;
                const nuevosDiasCobertura =
                  simulatedItem.demanda_mensual > 0
                    ? Math.round(
                        (nuevoStockPostLote / simulatedItem.demanda_mensual) *
                          30,
                      )
                    : 999;

                return (
                  <div className="space-y-2 pt-2 border-t border-[#432874]">
                    <div className="p-3 bg-[#160c2b] border border-[#432874] space-y-1.5 rounded-xs shadow-[1px_1px_0px_#000]">
                      <div className="flex justify-between text-[#a594c9] text-[10px]">
                        <span>DÍAS HASTA EL ARRIBO ({simulatedDate}):</span>
                        <strong className="text-white">
                          {diasEspera} días
                        </strong>
                      </div>
                      <div className="flex justify-between text-[#a594c9] text-[10px]">
                        <span>CONSUMO ESTIMADO EN ESPERA:</span>
                        <strong className="text-[#facc15]">
                          -{consumoEnEspera.toLocaleString()} u.
                        </strong>
                      </div>
                      <div className="flex justify-between text-white font-bold border-t border-[#432874] pt-1.5 mt-1.5 text-xs">
                        <span>STOCK AL MOMENTO DEL ARRIBO:</span>
                        <span
                          className={
                            quiebreAntes ? "text-[#f87171]" : "text-[#24cc8f]"
                          }
                        >
                          {stockRemanenteAFecha.toLocaleString()} u.
                        </span>
                      </div>
                    </div>

                    {quiebreAntes && (
                      <div className="p-2.5 bg-[#f87171]/10 border-2 border-[#f87171] text-[#f87171] font-bold space-y-1 animate-pulse rounded-xs shadow-[1px_1px_0px_#000]">
                        <div className="flex items-center gap-1.5 text-xs">
                          <AlertTriangle size={15} />{" "}
                          <span>¡ALERTA DE QUIEBRE PREVIO!</span>
                        </div>
                        <p className="text-[10px] font-normal font-mono text-white">
                          El stock actual se agotará a los{" "}
                          <strong>{diasHastaAgotar} días</strong>. ¡Quedarán{" "}
                          {diasEspera - diasHastaAgotar} días sin stock antes de
                          que llegue la producción el {simulatedDate}!
                        </p>
                      </div>
                    )}

                    <div
                      className={`p-3 border-2 rounded-xs shadow-[2px_2px_0px_#000] ${
                        nuevosDiasCobertura >= diasCriticoActivo
                          ? "bg-[#24cc8f]/10 border-[#24cc8f] text-[#24cc8f]"
                          : "bg-[#f87171]/10 border-[#f87171] text-[#f87171]"
                      } space-y-1.5`}
                    >
                      <div className="flex items-center justify-between font-bold text-[11px]">
                        <span>NUEVO STOCK POST-ARRIBO:</span>
                        <span className="text-white text-sm">
                          {nuevoStockPostLote.toLocaleString()} u.
                        </span>
                      </div>
                      <div className="flex items-center justify-between font-bold text-[11px]">
                        <span>COBERTURA A PARTIR DE {simulatedDate}:</span>
                        <span className="text-white text-sm">
                          {nuevosDiasCobertura} DÍAS
                        </span>
                      </div>
                      <p className="text-[9px] font-mono mt-1.5 pt-1.5 border-t border-current/30 text-white opacity-80">
                        {nuevosDiasCobertura >= diasCriticoActivo
                          ? `✅ Cobertura segura: Otorga stock prudente igual o mayor a ${diasCriticoActivo} días.`
                          : `⚠️ Cobertura insuficiente: Seguirá por debajo de los ${diasCriticoActivo} días críticos.`}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="pt-2 flex justify-end font-pixel">
              <button
                onClick={() => setSimulatedItem(null)}
                className="px-4 py-1.5 bg-[#38bdf8] text-[#2c1a4d] font-bold text-xs hover:bg-[#7dd3fc] shadow-[2px_2px_0px_#000] rounded-xs"
              >
                CERRAR SIMULADOR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL CONFIGURACIÓN GRUPOS DE ALERTA
      ========================================================= */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-[110] flex items-center justify-center p-4 font-mono animate-in zoom-in-95 duration-200">
          <div className="bg-[#24173e] border-2 border-[#ffbe00] w-full max-w-lg p-5 shadow-[0_0_35px_rgba(255,190,0,0.3)] space-y-4 relative rounded-xs">
            <button
              onClick={() => setIsGroupModalOpen(false)}
              className="absolute top-4 right-4 text-[#a594c9] hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b-2 border-[#432874] pb-2">
              <span className="text-[10px] font-pixel text-[#ffbe00] bg-[#ffbe00]/10 px-2 py-0.5 border border-[#ffbe00]/30 rounded-xs font-bold">
                AJUSTES DEL SISTEMA
              </span>
              <h3 className="font-pixel text-base text-white font-bold mt-1.5 flex items-center gap-2">
                <Settings size={18} className="text-[#38bdf8]" /> CONFIGURAR
                GRUPOS DE RIESGO
              </h3>
              <p className="text-[11px] text-[#a594c9] font-mono mt-1">
                Define umbrales de días críticos y de alerta personalizados para
                los cálculos de la matriz de planificación.
              </p>
            </div>

            <div className="space-y-3 bg-[#160c2b] p-3 border border-[#432874] text-xs font-pixel rounded-xs shadow-[inset_0_0_15px_rgba(0,0,0,0.5)]">
              <div>
                <label className="text-[#a594c9] block font-bold mb-1">
                  NOMBRE DEL GRUPO / REGIÓN:
                </label>
                <input
                  type="text"
                  placeholder="Ej: Exportación LATAM"
                  value={groupForm.nombre}
                  onChange={(e) =>
                    setGroupForm({ ...groupForm, nombre: e.target.value })
                  }
                  className="w-full bg-[#24173e] border border-[#432874] text-white p-2 text-xs focus:outline-none focus:border-[#ffbe00] rounded-2xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#f87171] block font-bold mb-1 flex items-center gap-1">
                    <Shield size={12} /> CRÍTICO (&lt; DÍAS):
                  </label>
                  <input
                    type="number"
                    value={groupForm.dias_critico}
                    onChange={(e) =>
                      setGroupForm({
                        ...groupForm,
                        dias_critico: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-[#24173e] border-2 border-[#f87171]/50 text-white p-2 text-xs focus:outline-none focus:border-[#f87171] font-bold rounded-2xs"
                  />
                </div>

                <div>
                  <label className="text-[#facc15] block font-bold mb-1 flex items-center gap-1">
                    <AlertTriangle size={12} /> ALERTA (&lt; DÍAS):
                  </label>
                  <input
                    type="number"
                    value={groupForm.dias_alerta}
                    onChange={(e) =>
                      setGroupForm({
                        ...groupForm,
                        dias_alerta: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-[#24173e] border-2 border-[#facc15]/50 text-white p-2 text-xs focus:outline-none focus:border-[#facc15] font-bold rounded-2xs"
                  />
                </div>
              </div>

              <p className="text-[9px] text-[#24cc8f] font-mono mt-2 pt-2 border-t border-[#432874]">
                ✅ Todo stock por encima de los{" "}
                <strong>{groupForm.dias_alerta} días</strong> será considerado
                PRUDENTE / ÓPTIMO.
              </p>

              <button
                onClick={async () => {
                  if (!groupForm.nombre.trim())
                    return alert("Ingresa un nombre para el grupo");
                  try {
                    const res = await fetch(
                      "http://localhost:3001/api/grupos-alerta",
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(groupForm),
                      },
                    );
                    if (res.ok) {
                      await fetchGrupos();
                      setGroupForm({
                        id: null,
                        nombre: "",
                        dias_critico: 5,
                        dias_alerta: 15,
                      });
                    }
                  } catch (err) {
                    alert("Error al guardar grupo.");
                  }
                }}
                className="w-full py-2 bg-[#ffbe00] text-[#2c1a4d] font-bold text-[11px] hover:bg-[#ffe066] transition-colors shadow-[2px_2px_0px_#000] active:translate-y-0.5 rounded-2xs mt-2"
              >
                <Plus size={14} className="inline mr-1" />{" "}
                {groupForm.id ? "ACTUALIZAR" : "CREAR NUEVO GRUPO"}
              </button>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              <span className="text-[10px] font-pixel text-[#a594c9] block">
                GRUPOS CONFIGURADOS EN BASE DE DATOS:
              </span>
              {gruposAlerta.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between p-2.5 bg-[#160c2b] border border-[#432874] text-xs font-pixel rounded-2xs"
                >
                  <div>
                    <span className="text-white font-bold block">
                      {g.nombre}
                    </span>
                    <span className="text-[#a594c9] text-[9px] font-mono block mt-0.5">
                      Riesgo &lt;{g.dias_critico}d | Advertencia &lt;
                      {g.dias_alerta}d
                    </span>
                    {g.es_predeterminado === 1 && (
                      <span className="text-[9px] bg-[#38bdf8]/20 border border-[#38bdf8]/50 text-[#38bdf8] px-1.5 py-0.5 rounded-2xs inline-block mt-1">
                        SISTEMA (DEFAULT)
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => setGroupForm(g)}
                      className="text-[#ffbe00] hover:underline text-[10px] text-right"
                    >
                      Editar
                    </button>
                    {g.es_predeterminado !== 1 && (
                      <button
                        onClick={async () => {
                          if (confirm(`¿Eliminar grupo "${g.nombre}"?`)) {
                            await fetch(
                              `http://localhost:3001/api/grupos-alerta/${g.id}`,
                              { method: "DELETE" },
                            );
                            await fetchGrupos();
                          }
                        }}
                        className="text-[#f87171] hover:underline text-[10px] text-right"
                      >
                        Borrar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-[#432874] flex justify-end font-pixel">
              <button
                onClick={() => setIsGroupModalOpen(false)}
                className="px-4 py-1.5 border border-[#432874] text-[#a594c9] hover:text-white text-xs rounded-xs"
              >
                CERRAR AJUSTES
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIGURAR URL SHEETS */}
      {isUrlModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-[100] flex items-center justify-center p-4 font-mono animate-in zoom-in-95 duration-200">
          <div className="bg-[#24173e] border-2 border-[#38bdf8] w-full max-w-lg p-5 shadow-[0_0_35px_rgba(56,189,248,0.3)] space-y-4 relative rounded-xs">
            <button
              onClick={() => setIsUrlModalOpen(false)}
              className="absolute top-4 right-4 text-[#a594c9] hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b-2 border-[#432874] pb-2">
              <span className="text-[10px] font-pixel text-[#38bdf8] bg-[#38bdf8]/10 px-2 py-0.5 border border-[#38bdf8]/30 rounded-xs font-bold">
                ENLACE EXTERNO DE DATOS
              </span>
              <h3 className="font-pixel text-base text-white font-bold mt-1.5 flex items-center gap-2">
                <Link size={18} className="text-[#38bdf8]" /> PLANILLA DE
                PRODUCCIÓN (CSV)
              </h3>
            </div>

            <div className="space-y-1 font-pixel text-xs">
              <label className="text-[#a594c9] block mb-1">
                URL DEL CSV PUBLICADO EN GOOGLE SHEETS:
              </label>
              <input
                type="text"
                placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                className="w-full bg-[#160c2b] border-2 border-[#432874] text-white p-2 text-xs focus:border-[#38bdf8] focus:outline-none rounded-xs font-mono"
              />
              <p className="text-[9px] text-[#6e588a] font-mono mt-1">
                La planilla debe contener obligatoriamente las columnas: FECHA,
                CÓDIGO/ARTÍCULO, CANTIDAD DE BUENAS, FALLADAS.
              </p>
            </div>

            <div className="pt-3 border-t border-[#432874] flex justify-end gap-2 font-pixel text-xs">
              <button
                onClick={() => setIsUrlModalOpen(false)}
                className="px-4 py-1.5 border border-[#432874] text-[#a594c9] hover:text-white rounded-xs"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSyncSheets}
                disabled={isSyncing}
                className="flex items-center gap-2 px-4 py-1.5 bg-[#38bdf8] text-[#2c1a4d] font-bold hover:bg-[#7dd3fc] shadow-[2px_2px_0px_#000] active:translate-y-0.5 rounded-xs disabled:opacity-50"
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
