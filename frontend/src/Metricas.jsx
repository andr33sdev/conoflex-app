import React, { useState, useEffect, useMemo, useRef } from "react";
import AIAvatar from "./AIAvatar";
import {
  Calendar,
  Filter,
  RotateCw,
  Printer,
  Link as LinkIcon,
  RefreshCw,
  Save,
  X,
  TrendingUp,
  GripVertical,
  Maximize2,
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
  Bot,
  Send,
  Boxes,
  Cpu,
  Inbox,
  Sliders,
  FileText,
  User,
  Plus,
  MessageSquare,
} from "lucide-react";

// COLORES MÁQUINAS - ESTILO CYBER INDUSTRIAL
const CATEGORY_COLORS = {
  EXTRUSIÓN: {
    stroke: "#f59e0b", // Ámbar
    fill: "rgba(245, 158, 11, 0.15)",
    id: "grad-ext",
  },
  INYECCIÓN: {
    stroke: "#38bdf8", // Cian
    fill: "rgba(56, 189, 248, 0.15)",
    id: "grad-iny",
  },
  ROTOMOLDEO: {
    stroke: "#10b981", // Esmeralda
    fill: "rgba(16, 185, 129, 0.15)",
    id: "grad-rot",
  },
  UNIFICADO: {
    stroke: "#a855f7", // Púrpura mate
    fill: "rgba(168, 85, 247, 0.15)",
    id: "grad-uni",
  },
};

const ROW_HEIGHT = 40; // Altura fija para paginación adaptariva

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
  const [activeTab, setActiveTab] = useState("kpis"); // 'kpis' | 'chat'
  const [produccion, setProduccion] = useState([]);
  const [semielaborados, setSemielaborados] = useState([]);
  const [materiasPrimas, setMateriasPrimas] = useState([]);
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

  // MODALES
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);
  const [isMatrizModalOpen, setIsMatrizModalOpen] = useState(false);
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");

  // ESTADOS COMPARADOR BÉZIER
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

  // MATRIZ PLANIFICACIÓN
  const [searchTermSE, setSearchTermSE] = useState("");
  const [filtroEstadoStock, setFiltroEstadoStock] = useState("TODOS");
  const [currentPageSE, setCurrentPageSE] = useState(1);
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

  // ESTADO CHAT IA CON LA BD
  // En Metricas.jsx:
const [mensajes, setMensajes] = useState([
  {
    rol: "assistant",
    texto:
      "¡Hola! Soy Connie. Tengo la info de toda la planta en tiempo real. ¿Qué querés revisar?",
  },
]);
  const [inputChat, setInputChat] = useState("");
  const [enviandoChat, setEnviandoChat] = useState(false);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  const fetchGrupos = async () => {
    try {
      const res = await fetch("/api/grupos-alerta");
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
      const [resProd, resSE, resGrupos, resMP] = await Promise.all([
        fetch("/api/metricas/produccion"),
        fetch("/api/semielaborados"),
        fetch("/api/grupos-alerta"),
        fetch("/api/materias-primas"),
      ]);
      if (resProd.ok) setProduccion(await resProd.json());
      if (resSE.ok) setSemielaborados(await resSE.json());
      if (resMP.ok) setMateriasPrimas(await resMP.json());

      if (resGrupos.ok) {
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
      }
    } catch (err) {
      console.error("Error cargando datos:", err);
    } finally {
      setLoading(false);
    }
  };

  const enviarMensajeChat = async (promptDirecto) => {
    const textoAEnviar = promptDirecto || inputChat;
    if (!textoAEnviar.trim() || enviandoChat) return;

    const nuevosMensajes = [...mensajes, { rol: "user", texto: textoAEnviar }];
    setMensajes(nuevosMensajes);
    setInputChat("");
    setEnviandoChat(true);

    try {
      const res = await fetch("/api/chat-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensaje: textoAEnviar,
          historial: nuevosMensajes,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setMensajes([
          ...nuevosMensajes,
          { rol: "assistant", texto: data.respuesta },
        ]);
      } else {
        setMensajes([
          ...nuevosMensajes,
          {
            rol: "assistant",
            texto:
              "❌ Error: " +
              (data.error || "No se pudo procesar la solicitud."),
          },
        ]);
      }
    } catch (err) {
      setMensajes([
        ...nuevosMensajes,
        {
          rol: "assistant",
          texto: "❌ Error de conexión con el servidor de la IA.",
        },
      ]);
    } finally {
      setEnviandoChat(false);
    }
  };

  // OBSERVER PARA MATRIZ ADAPTATIVA
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
      const res = await fetch("/api/metricas/recargar", {
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

    let buenas = 0,
      fallas = 0,
      kgTotal = 0;
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

  // HANDLERS DRAG & DROP
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
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#070a12] border border-slate-800/80 rounded-2xl font-sans text-slate-200 shadow-2xl overflow-hidden backdrop-blur-2xl">
      {/* HEADER DE MÓDULO CON CONTROL PANEL */}
      <div className="bg-[#0f172a]/70 border-b border-slate-800/80 p-4 flex flex-wrap items-center justify-between gap-4 shrink-0 backdrop-blur-xl">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.15)]">
            <BarChart3 size={20} className="text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xs font-bold text-white tracking-widest uppercase font-mono">
                MÉTRICAS & INTELLIGENCE
              </h2>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-mono flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />{" "}
                LIVE DATA
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Panel de control operativo e interacción conversacional
            </p>
          </div>
        </div>

        {/* CONTROLES NAVEGACIÓN PESTAÑAS */}
        <div className="flex items-center gap-2">
          {/* FILTRO DE FECHAS COMPACTO */}
          <div className="hidden sm:flex items-center gap-1.5 bg-[#090d16] border border-slate-800 px-2.5 py-1 rounded-xl text-xs font-mono text-slate-300">
            <Calendar size={13} className="text-emerald-400" />
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="bg-transparent text-white outline-none"
            />
            <span className="text-slate-600">-</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="bg-transparent text-white outline-none"
            />
          </div>

          <div className="flex items-center gap-1 bg-[#090d16]/80 p-1 border border-slate-800/80 rounded-xl shadow-inner">
            <button
              onClick={() => setActiveTab("kpis")}
              className={`px-3.5 py-1.5 text-xs font-medium transition-all duration-200 rounded-lg flex items-center gap-2 cursor-pointer ${
                activeTab === "kpis"
                  ? "bg-[#131c2d] text-emerald-300 font-semibold border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Activity size={14} /> Tablero General
            </button>

            <button
              onClick={() => setActiveTab("chat")}
              className={`px-3.5 py-1.5 text-xs font-medium transition-all duration-200 rounded-lg flex items-center gap-2 cursor-pointer ${
                activeTab === "chat"
                  ? "bg-[#131c2d] text-emerald-300 font-semibold border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Bot size={14} /> Asistente IA BD
            </button>
          </div>
        </div>
      </div>

      {/* ÁREA DE CONTENIDO */}
      <div className="flex-1 min-h-0 overflow-hidden bg-[#070a12] p-5">
        {/* VISTA 1: TABLERO GENERAL DE KPIS */}
        {activeTab === "kpis" && (
          <div className="h-full overflow-y-auto space-y-5 pr-1 transition-all duration-300 ease-out">
            {/* KPIS RESTRUCTURADOS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#0e1422] border border-slate-800/80 p-4 rounded-2xl space-y-2 shadow-sm relative overflow-hidden group hover:border-emerald-500/40 transition-colors">
                <div className="flex justify-between items-center text-slate-400 text-xs font-mono">
                  <span>PIEZAS PRODUCIDAS</span>
                  <TrendingUp size={15} className="text-emerald-400" />
                </div>
                <div className="text-2xl font-bold font-mono text-white">
                  {loading ? "..." : globalStats.buenas.toLocaleString()}{" "}
                  <span className="text-xs text-slate-500 font-normal">u.</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Total acumulado en el rango
                </p>
              </div>

              <div className="bg-[#0e1422] border border-slate-800/80 p-4 rounded-2xl space-y-2 shadow-sm relative overflow-hidden group hover:border-amber-500/40 transition-colors">
                <div className="flex justify-between items-center text-slate-400 text-xs font-mono">
                  <span>TASA DE DEFECTOS</span>
                  <AlertTriangle
                    size={15}
                    className={
                      globalStats.porcDefectuosas > 5
                        ? "text-amber-400"
                        : "text-emerald-400"
                    }
                  />
                </div>
                <div className="text-2xl font-bold font-mono text-amber-400">
                  {loading ? "..." : `${globalStats.porcDefectuosas}%`}
                </div>
                <p className="text-[11px] text-slate-400">
                  {globalStats.fallas.toLocaleString()} piezas descartadas
                </p>
              </div>

              <div className="bg-[#0e1422] border border-slate-800/80 p-4 rounded-2xl space-y-2 shadow-sm relative overflow-hidden group hover:border-amber-500/40 transition-colors">
                <div className="flex justify-between items-center text-slate-400 text-xs font-mono">
                  <span>RIESGO STOCK (&lt;{diasCriticoActivo}D)</span>
                  <Shield size={15} className="text-amber-400" />
                </div>
                <div className="text-2xl font-bold font-mono text-white">
                  {loading ? "..." : globalStats.semielaboradosEnRiesgo}{" "}
                  <span className="text-xs text-slate-500 font-normal">
                    items
                  </span>
                </div>
                <button
                  onClick={() => setIsMatrizModalOpen(true)}
                  className="text-[11px] text-amber-400 hover:underline cursor-pointer block font-mono"
                >
                  Ver matriz de riesgo →
                </button>
              </div>

              <div className="bg-[#0e1422] border border-slate-800/80 p-4 rounded-2xl space-y-2 shadow-sm relative overflow-hidden group hover:border-emerald-500/40 transition-colors">
                <div className="flex justify-between items-center text-slate-400 text-xs font-mono">
                  <span>EFICIENCIA GLOBAL</span>
                  <CheckCircle2 size={15} className="text-emerald-400" />
                </div>
                <div className="text-2xl font-bold font-mono text-emerald-400">
                  {loading ? "..." : `${globalStats.tasaCalidad}%`}
                </div>
                <p className="text-[11px] text-slate-400">
                  Tasa de primera calidad
                </p>
              </div>
            </div>

            {/* COMANDOS DE ACCIÓN / ANÁLISIS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#0e1422] border border-slate-800/80 p-5 rounded-2xl flex flex-col justify-between space-y-4 hover:border-emerald-500/30 transition-colors">
                <div className="space-y-2">
                  <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl w-fit">
                    <BarChart3 size={20} className="text-emerald-400" />
                  </div>
                  <h3 className="text-sm font-bold text-white font-mono">
                    COMPARADOR EVOLUTIVO DRAG & DROP
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Visualizá curvas Bézier suaves de tasa de fallas por
                    tecnología (Extrusión, Inyección y Rotomoldeo). Podés
                    arrastrar cartuchos y fusionar promedios.
                  </p>
                </div>
                <button
                  onClick={() => setIsChartModalOpen(true)}
                  className="w-full bg-[#131c2d] hover:bg-[#1a263c] text-emerald-400 border border-emerald-500/30 py-2.5 text-xs font-bold rounded-xl transition shadow-md flex items-center justify-center gap-2 cursor-pointer font-mono"
                >
                  <Maximize2 size={14} />
                  <span>ABRIR COMPARADOR BÉZIER</span>
                </button>
              </div>

              <div className="bg-[#0e1422] border border-slate-800/80 p-5 rounded-2xl flex flex-col justify-between space-y-4 hover:border-amber-500/30 transition-colors">
                <div className="space-y-2">
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl w-fit">
                    <Calculator size={20} className="text-amber-400" />
                  </div>
                  <h3 className="text-sm font-bold text-white font-mono">
                    MATRIZ Y PLANIFICACIÓN DE COBERTURA
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Cruza stock de semielaborados con promedio mensual de ventas
                    para calcular días de cobertura y simular ingresos de lotes
                    proyectados a futuro.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setCurrentPageSE(1);
                    setIsMatrizModalOpen(true);
                  }}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 py-2.5 text-xs font-bold rounded-xl transition shadow-md flex items-center justify-center gap-2 cursor-pointer font-mono"
                >
                  <Maximize2 size={14} />
                  <span>ABRIR MATRIZ & SIMULADOR</span>
                </button>
              </div>
            </div>

            {/* TABLA RESUMEN RECIENTE */}
            <div className="bg-[#0e1422] border border-slate-800/80 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-center border-b border-slate-800/80 pb-3">
                <h3 className="text-xs font-bold text-emerald-400 font-mono flex items-center gap-2">
                  <Activity size={14} /> HISTORIAL RECIENTE DE REGISTROS DE
                  PLANTA
                </h3>
                <button
                  onClick={fetchAllData}
                  className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded-lg transition cursor-pointer"
                >
                  <RefreshCw
                    size={13}
                    className={loading ? "animate-spin text-emerald-400" : ""}
                  />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#070a12] text-slate-400 font-mono text-[10px] uppercase">
                    <tr>
                      <th className="p-2.5 border-b border-slate-800">Fecha</th>
                      <th className="p-2.5 border-b border-slate-800">
                        Categoría
                      </th>
                      <th className="p-2.5 border-b border-slate-800">
                        Código
                      </th>
                      <th className="p-2.5 border-b border-slate-800">
                        Artículo
                      </th>
                      <th className="p-2.5 border-b border-slate-800 text-right">
                        Buenos
                      </th>
                      <th className="p-2.5 border-b border-slate-800 text-right">
                        Fallas
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 bg-[#070a12]/30 font-sans">
                    {produccion.slice(0, 10).map((p, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-[#121824]/60 transition-colors"
                      >
                        <td className="p-2.5 font-mono text-slate-400">
                          {p.fecha || "-"}
                        </td>
                        <td className="p-2.5 text-slate-300 font-mono">
                          {p.categoria_maq || "GENERAL"}
                        </td>
                        <td className="p-2.5 font-mono font-bold text-amber-400">
                          {p.codigo || "-"}
                        </td>
                        <td className="p-2.5 text-slate-200">
                          {p.articulo || "-"}
                        </td>
                        <td className="p-2.5 text-right font-mono text-emerald-400 font-semibold">
                          {Number(p.cant_buenos || 0).toLocaleString()}
                        </td>
                        <td className="p-2.5 text-right font-mono text-amber-400 font-semibold">
                          {Number(p.cant_fallas || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VISTA CHAT INTERACTIVO CON AVATAR EN LA PARTE SUPERIOR */}
        {activeTab === "chat" && (
          <div className="h-full flex flex-col min-h-0 bg-[#0e1422] border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl">
            {/* AVATAR INTERACTIVO EN LA CABECERA DEL CHAT */}
            <AIAvatar
              estado={
                enviandoChat
                  ? "thinking"
                  : mensajes[mensajes.length - 1]?.rol === "assistant"
                    ? "speaking"
                    : "idle"
              }
              nombre="Connie — Asistente de Planta"
            />

            {/* ÁREA DE MENSAJES DE CHAT */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {mensajes.map((m, i) => (
                <div
                  key={i}
                  className={`flex gap-3 max-w-3xl ${
                    m.rol === "user"
                      ? "ml-auto justify-end"
                      : "mr-auto justify-start"
                  }`}
                >
                  {m.rol === "assistant" && (
                    <div className="w-8 h-8 rounded-xl bg-[#070a12] border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5 shadow-[0_0_10px_rgba(16,185,129,0.15)]">
                      <Bot size={15} />
                    </div>
                  )}

                  <div
                    className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                      m.rol === "user"
                        ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 font-medium rounded-br-none"
                        : "bg-[#070a12] border border-slate-800 text-slate-200 rounded-bl-none whitespace-pre-wrap font-sans"
                    }`}
                  >
                    {m.texto}
                  </div>

                  {m.rol === "user" && (
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 font-mono text-xs font-bold shrink-0 mt-0.5">
                      U
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>

            {/* SUGERENCIAS RÁPIDAS DE PROMPT */}
            <div className="px-4 py-2 bg-[#070a12]/60 border-t border-slate-800/60 flex items-center gap-2 overflow-x-auto text-[11px]">
              <span className="text-slate-500 font-mono shrink-0">
                Sugerencias:
              </span>
              <button
                onClick={() =>
                  enviarMensajeChat(
                    "¿Cuáles son las 3 materias primas con stock más crítico?",
                  )
                }
                className="bg-[#121824] hover:bg-[#1a2336] border border-slate-800 text-slate-300 px-2.5 py-1 rounded-lg shrink-0 transition cursor-pointer font-sans"
              >
                Insumos Críticos
              </button>
              <button
                onClick={() =>
                  enviarMensajeChat(
                    "¿Qué semielaborados están en riesgo en el depósito 33?",
                  )
                }
                className="bg-[#121824] hover:bg-[#1a2336] border border-slate-800 text-slate-300 px-2.5 py-1 rounded-lg shrink-0 transition cursor-pointer font-sans"
              >
                Riesgo Depósito 33
              </button>
              <button
                onClick={() =>
                  enviarMensajeChat(
                    "Haceme un diagnóstico general de la eficiencia de planta.",
                  )
                }
                className="bg-[#121824] hover:bg-[#1a2336] border border-slate-800 text-slate-300 px-2.5 py-1 rounded-lg shrink-0 transition cursor-pointer font-sans"
              >
                Diagnóstico de Eficiencia
              </button>
            </div>

            {/* BARRA DE ENTRADA CHAT */}
            <div className="p-3 bg-[#070a12] border-t border-slate-800/80 flex items-center gap-2">
              <input
                type="text"
                value={inputChat}
                onChange={(e) => setInputChat(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && enviarMensajeChat()}
                placeholder="Preguntale a Elena sobre materias primas, semielaborados, ventas u OT..."
                className="flex-1 bg-[#0e1422] border border-slate-800 px-3.5 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500/50 rounded-xl"
              />
              <button
                onClick={() => enviarMensajeChat()}
                disabled={enviandoChat}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 p-2 rounded-xl transition cursor-pointer disabled:opacity-50 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================
          MODAL 1: COMPARADOR EVOLUTIVO (DRAG & DROP SVG BÉZIER)
      ========================================================= */}
      {isChartModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[100] flex items-center justify-center p-3 font-sans">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-5xl h-[88vh] p-4 sm:p-5 shadow-2xl flex flex-col relative rounded-2xl overflow-hidden">
            <button
              onClick={() => setIsChartModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b border-slate-800 pb-3 shrink-0 pr-6">
              <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 border border-emerald-500/20 rounded-full">
                ANÁLISIS EVOLUTIVO
              </span>
              <h3 className="text-sm font-bold text-white mt-1.5 flex items-center gap-2">
                <BarChart3 size={16} className="text-amber-400" /> HISTORIAL DE
                PIEZAS DEFECTUOSAS POR MÁQUINA
              </h3>
            </div>

            {/* DRAG & DROP TOOLBAR */}
            <div className="bg-[#070a12] border-b border-slate-800/80 p-3 flex flex-wrap items-center justify-between gap-2 shrink-0 my-2 rounded-xl">
              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                <GripVertical
                  size={14}
                  className="text-amber-400 animate-bounce"
                />
                <span>
                  ARRASTRÁ EL CARTUCHO AL LIENZO PARA TRAZAR LA CURVA:
                </span>
              </div>

              <div className="flex items-center gap-2 font-mono text-[11px]">
                {["EXTRUSIÓN", "INYECCIÓN", "ROTOMOLDEO"].map((cat) => {
                  const isAlreadyActive = activeCategories.includes(cat);
                  const color = CATEGORY_COLORS[cat].stroke;

                  return (
                    <div
                      key={cat}
                      draggable={!isMerged}
                      onDragStart={(e) => handleDragStart(e, cat)}
                      onClick={handlePillClick}
                      className={`px-3 py-1 border rounded-lg transition-all font-semibold ${
                        isMerged
                          ? "opacity-30 cursor-not-allowed bg-slate-900 border-slate-800 text-slate-500"
                          : isAlreadyActive
                            ? "bg-slate-900 text-slate-400 border-slate-800 opacity-40 cursor-not-allowed"
                            : "bg-slate-800 text-white cursor-grab hover:scale-105"
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
                  className={`flex items-center gap-1.5 px-3 py-1 border text-xs font-bold rounded-lg transition cursor-pointer ${
                    isMerged
                      ? "bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-[0_0_12px_rgba(168,85,247,0.3)]"
                      : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"
                  }`}
                >
                  <GitMerge size={13} />
                  <span>
                    {isMerged ? "SEPARAR LÍNEAS" : "FUSIONAR PROMEDIO"}
                  </span>
                </button>
              </div>
            </div>

            {/* CANVAS SVG */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex-1 relative flex flex-col justify-between overflow-hidden rounded-xl border ${
                isDraggingOverChart
                  ? "bg-emerald-500/10 border-dashed border-emerald-400"
                  : "bg-[#070a12] border-slate-800"
              }`}
            >
              {isDraggingOverChart && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs font-mono text-xs text-emerald-400 font-bold animate-pulse">
                  ¡SOLTÁ AQUÍ PARA TRAZAR LA CURVA BÉZIER!
                </div>
              )}

              <div className="w-full h-full relative z-10 p-6">
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
                        <stop
                          offset="0%"
                          stopColor={colors.stroke}
                          stopOpacity="0.3"
                        />
                        <stop
                          offset="100%"
                          stopColor={colors.stroke}
                          stopOpacity="0.0"
                        />
                      </linearGradient>
                    ))}
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
                            />
                          );
                        })()
                      : activeCategories.map((cat) => {
                          const puntos = evolutionaryData.series[cat] || [];
                          if (puntos.length === 0) return null;
                          const { areaD } = generateBezierPaths(puntos, 0.25);
                          return (
                            <path
                              key={cat}
                              d={areaD}
                              fill={`url(#${CATEGORY_COLORS[cat].id})`}
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
                              strokeWidth="3.5"
                              strokeLinecap="round"
                            />
                          );
                        })()
                      : activeCategories.map((cat) => {
                          const puntos = evolutionaryData.series[cat] || [];
                          if (puntos.length === 0) return null;
                          const { lineD } = generateBezierPaths(puntos, 0.25);
                          return (
                            <path
                              key={cat}
                              d={lineD}
                              fill="none"
                              stroke={CATEGORY_COLORS[cat].stroke}
                              strokeWidth="3"
                              strokeLinecap="round"
                            />
                          );
                        })}
                  </g>

                  <g id="layer-points">
                    {isMerged
                      ? evolutionaryData.serieUnificada.map((pt, idx) => (
                          <circle
                            key={idx}
                            cx={pt.x}
                            cy={pt.y}
                            r="5"
                            fill="#070a12"
                            stroke={CATEGORY_COLORS.UNIFICADO.stroke}
                            strokeWidth="3"
                          />
                        ))
                      : activeCategories.map((cat) => {
                          const puntos = evolutionaryData.series[cat] || [];
                          return puntos.map((pt, idx) => (
                            <circle
                              key={`${cat}-${idx}`}
                              cx={pt.x}
                              cy={pt.y}
                              r="4"
                              fill="#070a12"
                              stroke={CATEGORY_COLORS[cat].stroke}
                              strokeWidth="2.5"
                            />
                          ));
                        })}
                  </g>
                </svg>

                <div className="flex justify-between items-center pt-2 text-[10px] font-mono text-slate-500 border-t border-slate-800/80">
                  {evolutionaryData.mesesLista.map((mes) => (
                    <span key={mes}>{mes}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 flex justify-end">
              <button
                onClick={() => setIsChartModalOpen(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs px-4 py-2 rounded-xl transition cursor-pointer"
              >
                Cerrar Comparador
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 2: MATRIZ DE PLANIFICACIÓN (RIESGO STOCK)
      ========================================================= */}
      {isMatrizModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[100] flex items-center justify-center p-3 font-sans">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-6xl h-[85vh] p-4 sm:p-5 shadow-2xl flex flex-col relative rounded-2xl overflow-hidden">
            <button
              onClick={() => setIsMatrizModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white z-50"
            >
              <X size={16} />
            </button>

            <div className="border-b border-slate-800 pb-3 shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pr-8">
              <div>
                <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 border border-amber-500/20 rounded-full">
                  PLANIFICACIÓN DE DEPOSITOS
                </span>
                <h3 className="text-sm font-bold text-white mt-1.5 flex items-center gap-2">
                  <Calculator size={16} className="text-amber-400" /> MATRIZ DE
                  COBERTURA DE SEMIELABORADOS
                </h3>
              </div>

              {/* GRUPO ACTIVO */}
              <div className="flex items-center gap-2 font-mono text-xs bg-[#070a12] border border-slate-800 px-3 py-1.5 rounded-xl">
                <span className="text-slate-400">Grupo:</span>
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
                  className="bg-transparent text-emerald-400 font-bold outline-none"
                >
                  {gruposAlerta.map((g) => (
                    <option
                      key={g.id}
                      value={g.id}
                      className="bg-slate-900 text-white"
                    >
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
                  className="text-slate-400 hover:text-amber-400"
                >
                  <Settings size={13} />
                </button>
              </div>
            </div>

            {/* CONTROLES */}
            <div className="py-2.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
              <div className="relative flex-1 w-full max-w-sm">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="text"
                  placeholder="Buscar por código o nombre..."
                  value={searchTermSE}
                  onChange={(e) => {
                    setSearchTermSE(e.target.value);
                    setCurrentPageSE(1);
                  }}
                  className="w-full bg-[#070a12] border border-slate-800 text-xs text-white pl-9 pr-3 py-1.5 focus:border-amber-500/50 outline-none rounded-lg"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
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
                    className={`px-3 py-1 border rounded-lg transition-colors cursor-pointer ${
                      filtroEstadoStock === f.id
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/40 font-bold"
                        : "bg-[#070a12] border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* TABLA ADAPTATIVA */}
            <div
              ref={tableContainerRef}
              className="flex-1 bg-[#070a12] border border-slate-800 rounded-xl min-h-0 overflow-hidden flex flex-col text-xs"
            >
              <table className="w-full text-left border-collapse table-fixed h-full">
                <thead
                  ref={tableHeaderRef}
                  className="bg-[#0e1422] border-b border-slate-800 text-slate-400 font-mono text-[10px] uppercase sticky top-0 z-10 h-[36px]"
                >
                  <tr>
                    <th className="w-[15%] px-3">CÓDIGO</th>
                    <th className="w-[35%] px-3">SEMIELABORADO</th>
                    <th className="w-[12%] px-3 text-right">STOCK</th>
                    <th className="w-[12%] px-3 text-right">DEMANDA/M</th>
                    <th className="w-[14%] px-3 text-center">DÍAS COB.</th>
                    <th className="w-[12%] px-3 text-center">SIMULADOR</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800/50 bg-[#070a12]">
                  {currentPaginatedSE.map((item) => {
                    let badgeStyle =
                      "bg-slate-900 text-slate-400 border-slate-800";
                    if (item.estadoMatriz === "CRITICO")
                      badgeStyle =
                        "bg-rose-500/10 text-rose-400 border-rose-500/30 font-bold";
                    else if (item.estadoMatriz === "ALERTA")
                      badgeStyle =
                        "bg-amber-500/10 text-amber-400 border-amber-500/30 font-bold";
                    else if (
                      item.estadoMatriz === "OK" ||
                      item.estadoMatriz === "PRUDENTE"
                    )
                      badgeStyle =
                        "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-bold";

                    return (
                      <tr
                        key={item.id}
                        className="h-[40px] hover:bg-[#121824] transition-colors align-middle font-sans"
                      >
                        <td className="px-3 font-mono font-bold text-amber-400 truncate">
                          {item.codigo}
                        </td>
                        <td className="px-3 text-slate-200 font-medium truncate">
                          {item.nombre}
                        </td>
                        <td className="px-3 text-right font-mono font-bold text-emerald-400">
                          {item.stock_total.toLocaleString()}
                        </td>
                        <td className="px-3 text-right font-mono text-cyan-400">
                          {item.demanda_mensual > 0
                            ? item.demanda_mensual.toLocaleString()
                            : "--"}
                        </td>
                        <td className="px-3 text-center font-mono">
                          {item.dias_stock !== null ? (
                            <span
                              className={`inline-block px-2.5 py-0.5 border rounded-full text-[11px] ${badgeStyle}`}
                            >
                              {item.dias_stock} días
                            </span>
                          ) : (
                            <span className="text-slate-600">--</span>
                          )}
                        </td>
                        <td className="px-3 text-center">
                          <button
                            onClick={() => {
                              setSimulatedItem(item);
                              setSimulatedBatchQty(500);
                            }}
                            className="p-1.5 bg-slate-900 border border-slate-700 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-400 transition-colors rounded-lg cursor-pointer inline-flex items-center"
                            title="Simular lote proyectado"
                          >
                            <Zap size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* PAGINACIÓN */}
            <div className="flex justify-between items-center pt-3 border-t border-slate-800 text-xs font-mono text-slate-400 shrink-0">
              <span>
                Página <strong className="text-white">{currentPageSE}</strong>{" "}
                de <strong className="text-white">{totalPagesSE}</strong>
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setCurrentPageSE((p) => Math.max(p - 1, 1))}
                  disabled={currentPageSE === 1}
                  className="px-3 py-1 bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 rounded-lg cursor-pointer"
                >
                  Anterior
                </button>
                <button
                  onClick={() =>
                    setCurrentPageSE((p) => Math.min(p + 1, totalPagesSE))
                  }
                  disabled={currentPageSE === totalPagesSE}
                  className="px-3 py-1 bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 rounded-lg cursor-pointer"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: SIMULADOR DE LOTE FUTURO */}
      {simulatedItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[110] flex items-center justify-center p-4 font-sans">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-md p-5 rounded-2xl shadow-2xl space-y-4 relative text-xs">
            <button
              onClick={() => setSimulatedItem(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b border-slate-800 pb-2">
              <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 border border-amber-500/20 rounded-full">
                SIMULADOR OPERATIVO
              </span>
              <h3 className="text-sm font-bold text-white mt-1 flex items-center gap-2">
                <Zap size={15} className="text-amber-400" /> PROYECTAR LOTE DE
                PRODUCCIÓN
              </h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                [{simulatedItem.codigo}] {simulatedItem.nombre}
              </p>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 font-mono">
                <div className="bg-[#070a12] p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">
                    STOCK ACTUAL:
                  </span>
                  <strong className="text-white text-sm">
                    {simulatedItem.stock_total.toLocaleString()} u.
                  </strong>
                </div>
                <div className="bg-[#070a12] p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">
                    DEMANDA MENSUAL:
                  </span>
                  <strong className="text-cyan-400 text-sm">
                    {simulatedItem.demanda_mensual.toLocaleString()} u.
                  </strong>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="text-[11px] text-slate-400 font-mono">
                    Fecha de Arribo Proyectada:
                  </label>
                  <input
                    type="date"
                    value={simulatedDate}
                    onChange={(e) => setSimulatedBatchDate(e.target.value)}
                    className="w-full bg-[#070a12] border border-slate-800 text-white p-2 rounded-xl outline-none focus:border-amber-500/50 mt-1 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 font-mono">
                    Cantidad del Lote (+):
                  </label>
                  <input
                    type="number"
                    value={simulatedBatchQty}
                    onChange={(e) =>
                      setSimulatedBatchQty(
                        Math.max(0, parseInt(e.target.value) || 0),
                      )
                    }
                    className="w-full bg-[#070a12] border border-slate-800 text-emerald-400 font-mono font-bold p-2 rounded-xl outline-none focus:border-amber-500/50 mt-1"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setSimulatedItem(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs px-4 py-2 rounded-xl transition cursor-pointer"
              >
                Cerrar Simulador
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CONFIGURAR UMBRALES GRUPO */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[110] flex items-center justify-center p-4 font-sans">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-md p-5 rounded-2xl shadow-2xl space-y-4 relative text-xs">
            <button
              onClick={() => setIsGroupModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Settings size={16} className="text-amber-400" /> CONFIGURAR
                UMBRALES DE RIESGO
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-400 font-mono">
                  Nombre del Grupo / Región:
                </label>
                <input
                  type="text"
                  placeholder="Ej: Exportación LATAM"
                  value={groupForm.nombre}
                  onChange={(e) =>
                    setGroupForm({ ...groupForm, nombre: e.target.value })
                  }
                  className="w-full bg-[#070a12] border border-slate-800 text-white p-2 rounded-xl outline-none focus:border-amber-500/50 mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono">
                <div>
                  <label className="text-[11px] text-rose-400">
                    Días Críticos (&lt;):
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
                    className="w-full bg-[#070a12] border border-slate-800 text-rose-400 font-bold p-2 rounded-xl outline-none focus:border-rose-500/50 mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-amber-400">
                    Días Alerta (&lt;):
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
                    className="w-full bg-[#070a12] border border-slate-800 text-amber-400 font-bold p-2 rounded-xl outline-none focus:border-amber-500/50 mt-1"
                  />
                </div>
              </div>

              <button
                onClick={async () => {
                  if (!groupForm.nombre.trim())
                    return alert("Ingresá un nombre para el grupo");
                  try {
                    const res = await fetch("/api/grupos-alerta", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(groupForm),
                    });
                    if (res.ok) {
                      await fetchGrupos();
                      setIsGroupModalOpen(false);
                    }
                  } catch (err) {
                    alert("Error al guardar grupo.");
                  }
                }}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 text-xs rounded-xl shadow transition cursor-pointer font-mono"
              >
                Guardar Umbrales
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
