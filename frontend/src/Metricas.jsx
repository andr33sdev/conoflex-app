import React, { useState, useEffect, useMemo, useRef } from "react";
import AIAvatar from "./AIAvatar";
import {
  Calendar,
  RefreshCw,
  X,
  TrendingUp,
  GripVertical,
  Maximize2,
  CheckCircle2,
  GitMerge,
  Search,
  Zap,
  Calculator,
  AlertTriangle,
  Clock,
  ChevronDown,
  Settings,
  BarChart3,
  Activity,
  Shield,
  Bot,
  Send,
  Boxes,
  DownloadCloud,
  Volume2,
  VolumeX,
  Scale,
  AlertOctagon,
} from "lucide-react";

// COLORES MÁQUINAS - ESTILO CYBER INDUSTRIAL
const CATEGORY_COLORS = {
  EXTRUSIÓN: {
    stroke: "#FF5A00",
    fill: "rgba(255, 90, 0, 0.15)",
    id: "grad-ext",
  },
  INYECCIÓN: {
    stroke: "#FFD700",
    fill: "rgba(255, 215, 0, 0.15)",
    id: "grad-iny",
  },
  ROTOMOLDEO: {
    stroke: "#38bdf8",
    fill: "rgba(56, 189, 248, 0.15)",
    id: "grad-rot",
  },
  UNIFICADO: {
    stroke: "#a855f7",
    fill: "rgba(168, 85, 247, 0.15)",
    id: "grad-uni",
  },
};

const ROW_HEIGHT = 48;

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
  const [activeTab, setActiveTab] = useState("kpis");
  const [produccion, setProduccion] = useState([]);
  const [semielaborados, setSemielaborados] = useState([]);
  const [materiasPrimas, setMateriasPrimas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingPedidos, setIsSyncingPedidos] = useState(false);

  // MENÚ DESPLEGABLE SINCRONIZAR
  const [isSyncMenuOpen, setIsSyncMenuOpen] = useState(false);
  const syncMenuRef = useRef(null);

  const [vozHabilitada, setVozHabilitada] = useState(true);

  const [gruposAlerta, setGruposAlerta] = useState([]);
  const [grupoActivo, setGrupoActivo] = useState(null);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupForm, setGroupForm] = useState({
    id: null,
    nombre: "",
    dias_critico: 5,
    dias_alerta: 15,
  });

  const [fechaDesde, setFechaDesde] = useState("2024-01-01");
  const [fechaHasta, setFechaHasta] = useState("2026-12-31");

  const [isChartModalOpen, setIsChartModalOpen] = useState(false);
  const [isMatrizModalOpen, setIsMatrizModalOpen] = useState(false);

  const [activeCategories, setActiveCategories] = useState([
    "EXTRUSIÓN",
    "INYECCIÓN",
    "ROTOMOLDEO",
  ]);
  const [isMerged, setIsMerged] = useState(false);
  const [isDraggingOverChart, setIsDraggingOverChart] = useState(false);

  const [searchTermSE, setSearchTermSE] = useState("");
  const [filtroEstadoStock, setFiltroEstadoStock] = useState("TODOS");
  const [currentPageSE, setCurrentPageSE] = useState(1);
  const tableContainerRef = useRef(null);
  const tableHeaderRef = useRef(null);
  const [itemsPerPageSE, setItemsPerPageSE] = useState(10);

  const [simulatedItem, setSimulatedItem] = useState(null);
  const [simulatedBatchQty, setSimulatedBatchQty] = useState(500);
  const [simulatedDate, setSimulatedBatchDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().split("T")[0];
  });

  const [mensajes, setMensajes] = useState([
    {
      rol: "assistant",
      texto:
        "¡Hola! Soy Connie. Tengo la info de toda la planta en tiempo real. ¿Qué querés revisar?",
    },
  ]);
  const [inputChat, setInputChat] = useState("");
  const [enviandoChat, setEnviandoChat] = useState(false);
  const [estadoVoz, setEstadoVoz] = useState("idle");
  const chatBottomRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (syncMenuRef.current && !syncMenuRef.current.contains(event.target)) {
        setIsSyncMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  const hablarConnie = (texto) => {
    if (!vozHabilitada || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const textoLimpio = texto
      .replace(/\*+/g, "")
      .replace(/#/g, "")
      .replace(/[`_~]/g, "")
      .replace(
        /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
        "",
      );

    const utterance = new SpeechSynthesisUtterance(textoLimpio);
    const voces = window.speechSynthesis.getVoices();

    const vocesEspanol = voces.filter((v) => v.lang.startsWith("es"));
    const palabrasFemeninas = [
      "elena",
      "sabina",
      "laura",
      "monica",
      "paulina",
      "luciana",
      "francisca",
      "victoria",
      "paloma",
      "mia",
      "dalia",
      "alva",
      "female",
      "mujer",
    ];

    let vozFemenina = vocesEspanol.find((v) =>
      palabrasFemeninas.some((nombre) => v.name.toLowerCase().includes(nombre)),
    );

    if (!vozFemenina) {
      vozFemenina =
        vocesEspanol.find(
          (v) =>
            !v.name.toLowerCase().includes("male") &&
            !v.name.toLowerCase().includes("pablo") &&
            !v.name.toLowerCase().includes("raul") &&
            !v.name.toLowerCase().includes("jorge"),
        ) || vocesEspanol[0];
    }

    if (vozFemenina) {
      utterance.voice = vozFemenina;
      utterance.lang = vozFemenina.lang;
    } else {
      utterance.lang = "es-AR";
    }

    utterance.rate = 1.0;
    utterance.pitch = 1.15;

    utterance.onstart = () => setEstadoVoz("speaking");
    utterance.onend = () => setEstadoVoz("idle");
    utterance.onerror = () => setEstadoVoz("idle");

    window.speechSynthesis.speak(utterance);
  };

  const toggleSilenciarVoz = () => {
    if (vozHabilitada) {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      setEstadoVoz("idle");
      setVozHabilitada(false);
    } else {
      setVozHabilitada(true);
    }
  };

  const handleSyncEstadoPedidos = async () => {
    setIsSyncingPedidos(true);
    try {
      const res = await fetch("/api/estado-pedidos/sincronizar", {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok && data.success) {
        alert(`¡Éxito! ${data.mensaje}`);
        fetchAllData();
      } else {
        alert("Error: " + (data.error || "No se pudo sincronizar pedidos."));
      }
    } catch (err) {
      alert("Error de conexión al sincronizar el estado de pedidos.");
    } finally {
      setIsSyncingPedidos(false);
    }
  };

  const handleSyncSheets = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/metricas/recargar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        await fetchAllData();
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
        hablarConnie(data.respuesta);
      } else {
        setMensajes([
          ...nuevosMensajes,
          {
            rol: "assistant",
            texto:
              "Error: " + (data.error || "No se pudo procesar la solicitud."),
          },
        ]);
      }
    } catch (err) {
      setMensajes([
        ...nuevosMensajes,
        {
          rol: "assistant",
          texto: "Error de conexión con el servidor de la IA.",
        },
      ]);
    } finally {
      setEnviandoChat(false);
    }
  };

  useEffect(() => {
    if (!isMatrizModalOpen || !tableContainerRef.current) return;

    const calculatePageSize = () => {
      if (!tableContainerRef.current) return;
      const containerHeight = tableContainerRef.current.clientHeight;
      const headerHeight = tableHeaderRef.current
        ? tableHeaderRef.current.offsetHeight
        : 48;
      const availableHeight = containerHeight - headerHeight;
      const calculatedItems = Math.floor(availableHeight / ROW_HEIGHT);
      setItemsPerPageSE(Math.max(1, calculatedItems));
    };

    const observer = new ResizeObserver(calculatePageSize);
    observer.observe(tableContainerRef.current);
    calculatePageSize();

    return () => observer.disconnect();
  }, [isMatrizModalOpen, semielaborados, searchTermSE, filtroEstadoStock]);

  const diasCriticoActivo = grupoActivo ? grupoActivo.dias_critico : 5;
  const diasAlertaActivo = grupoActivo ? grupoActivo.dias_alerta : 15;

  // CÁLCULOS EXACTOS BASADOS EN TU BASE DE DATOS (cant_buenos, segunda_calidad, cant_fallas, kg_total, kg_fallas)
  const globalStats = useMemo(() => {
    const filtrados = produccion.filter((r) => {
      if (!r.fecha || r.fecha === "1970-01-01") return false;
      return r.fecha >= fechaDesde && r.fecha <= fechaHasta;
    });

    let buenas = 0;
    let segunda = 0;
    let fallas = 0;
    let kgTotal = 0;
    let kgFallas = 0;

    filtrados.forEach((r) => {
      buenas += Number(r.cant_buenos || 0);
      segunda += Number(r.segunda_calidad || 0);
      fallas += Number(r.cant_fallas || 0);
      kgTotal += Number(r.kg_total || 0);
      kgFallas += Number(r.kg_fallas || 0);
    });

    // Fila 1: Piezas
    const totalPiezasProcesadas = buenas + segunda + fallas;
    const totalPiezasBuenas = buenas + segunda;
    const totalPiezasMalas = fallas;
    const porcDefectuosasPiezas =
      totalPiezasProcesadas > 0
        ? ((totalPiezasMalas / totalPiezasProcesadas) * 100).toFixed(2)
        : "0.00";

    // Fila 2: Kilogramos
    const cantidadKgTotal = kgTotal;
    const cantidadKgFallas = kgFallas;
    const cantidadKgBuenas = Math.max(0, kgTotal - kgFallas);
    const porcDefectuosasKg =
      cantidadKgTotal > 0
        ? ((cantidadKgFallas / cantidadKgTotal) * 100).toFixed(2)
        : "0.00";

    const semielaboradosEnRiesgo = semielaborados.filter(
      (s) =>
        s.demanda_mensual > 0 &&
        (s.dias_stock === null || s.dias_stock < diasCriticoActivo),
    ).length;

    return {
      totalPiezasProcesadas,
      totalPiezasBuenas,
      totalPiezasMalas,
      porcDefectuosasPiezas,
      cantidadKgTotal,
      cantidadKgBuenas,
      cantidadKgFallas,
      porcDefectuosasKg,
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
      mapa[mes][cat].buenas += (r.cant_buenos || 0) + (r.segunda_calidad || 0);
      mapa[mes][cat].fallas += r.cant_fallas || 0;

      if (!mapaUnificado[mes]) mapaUnificado[mes] = { buenas: 0, fallas: 0 };
      mapaUnificado[mes].buenas +=
        (r.cant_buenos || 0) + (r.segunda_calidad || 0);
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
        let mensaje = `ÓPTIMO (> ${diasAlertaActivo}D)`;

        if (s.demanda_mensual > 0) {
          if (dias === null || dias < diasCriticoActivo) {
            estado = "CRITICO";
            mensaje = `CRÍTICO (< ${diasCriticoActivo}D)`;
          } else if (dias <= diasAlertaActivo) {
            estado = "ALERTA";
            mensaje = `ALERTA (< ${diasAlertaActivo}D)`;
          }
        } else {
          mensaje = "SIN DEMANDA";
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
  const removeCategory = (cat) =>
    setActiveCategories(activeCategories.filter((c) => c !== cat));

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-black font-sans text-zinc-200 overflow-hidden relative selection:bg-[#FF5A00]/30">
      {/* 1. HEADER HERO */}
      <div className="border-b border-zinc-800/50 p-6 md:p-10 flex flex-col md:flex-row md:items-end justify-between gap-6 shrink-0 bg-[#050505] relative overflow-hidden">
        <div className="z-10">
          <h1 className="text-4xl md:text-5xl font-extrabold italic tracking-tighter text-white uppercase leading-none">
            Métricas <span className="text-[#FF5A00]">& KPI</span>
          </h1>
          <p className="text-zinc-500 text-sm mt-2 max-w-md uppercase tracking-widest font-bold flex items-center gap-2">
            PANEL DE CONTROL OPERATIVO E INTERACCIÓN
          </p>
        </div>
      </div>

      {/* 2. BARRA DE FILTROS & NAVEGACIÓN */}
      <div className="px-4 py-4 md:px-8 border-b border-zinc-800/50 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0 bg-black relative z-20">
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto flex-1 min-w-0">
          {/* BOTÓN DESPLEGABLE "SINCRONIZAR" */}
          <div className="relative shrink-0 w-full sm:w-auto" ref={syncMenuRef}>
            <button
              onClick={() => setIsSyncMenuOpen(!isSyncMenuOpen)}
              className="w-full sm:w-auto flex items-center justify-between gap-3 px-6 py-2.5 font-bold text-xs uppercase tracking-widest transition-all bg-[#FFD700] hover:bg-white text-black active:scale-95 cursor-pointer"
            >
              <RefreshCw
                size={16}
                className={isSyncing || isSyncingPedidos ? "animate-spin" : ""}
                strokeWidth={3}
              />
              <span>SINCRONIZAR</span>
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${isSyncMenuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isSyncMenuOpen && (
              <div className="absolute top-full left-0 mt-2 w-full sm:w-64 bg-[#050505] border border-zinc-800 shadow-2xl z-50 p-2 flex flex-col gap-2">
                <button
                  onClick={() => {
                    setIsSyncMenuOpen(false);
                    handleSyncEstadoPedidos();
                  }}
                  disabled={isSyncingPedidos}
                  className="w-full text-left p-3.5 bg-black hover:bg-zinc-900 border border-zinc-800 hover:border-[#FF5A00] text-white font-mono text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-between cursor-pointer disabled:opacity-50"
                >
                  <span>SINCRONIZAR PEDIDOS</span>
                  <DownloadCloud size={16} className="text-[#FF5A00]" />
                </button>

                <button
                  onClick={() => {
                    setIsSyncMenuOpen(false);
                    handleSyncSheets();
                  }}
                  disabled={isSyncing}
                  className="w-full text-left p-3.5 bg-black hover:bg-zinc-900 border border-zinc-800 hover:border-[#FFD700] text-white font-mono text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-between cursor-pointer disabled:opacity-50"
                >
                  <span>SINCRONIZAR PRODUCCIÓN</span>
                  <RefreshCw size={16} className="text-[#FFD700]" />
                </button>
              </div>
            )}
          </div>

          {/* RANGO DE FECHAS */}
          <div className="flex items-center gap-2 bg-[#050505] border border-zinc-800 px-3 py-2 shrink-0 font-mono w-full sm:w-auto">
            <Calendar size={13} className="text-[#FF5A00]" />
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="bg-transparent text-white outline-none text-[11px] uppercase"
              style={{ colorScheme: "dark" }}
            />
            <span className="text-zinc-600">-</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="bg-transparent text-white outline-none text-[11px] uppercase"
              style={{ colorScheme: "dark" }}
            />
          </div>
        </div>

        {/* TABS DE MÓDULO */}
        <div className="flex items-center gap-0 w-full sm:w-auto border border-zinc-800 bg-[#050505] shrink-0">
          <button
            onClick={() => setActiveTab("kpis")}
            className={`px-6 py-2.5 text-xs font-bold transition-all cursor-pointer whitespace-nowrap uppercase tracking-widest border-r border-zinc-800 flex items-center gap-2 ${
              activeTab === "kpis"
                ? "bg-[#FF5A00] text-black"
                : "text-zinc-500 hover:text-white hover:bg-zinc-900"
            }`}
          >
            <Activity size={14} /> TABLERO
          </button>

          <button
            onClick={() => setActiveTab("chat")}
            className={`px-6 py-2.5 text-xs font-bold transition-all cursor-pointer whitespace-nowrap uppercase tracking-widest flex items-center gap-2 ${
              activeTab === "chat"
                ? "bg-[#FF5A00] text-black"
                : "text-zinc-500 hover:text-white hover:bg-zinc-900"
            }`}
          >
            <Bot size={14} /> ASISTENTE
          </button>
        </div>
      </div>

      {/* ÁREA DE CONTENIDO */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-black p-4 md:p-8 custom-scrollbar flex flex-col">
        {/* VISTA 1: TABLERO GENERAL DE KPIS */}
        {activeTab === "kpis" && (
          <div className="flex-1 flex flex-col gap-6 w-full max-w-[1400px] mx-auto transition-all duration-300 ease-out">
            {/* FILA 1 DE 4 TARJETAS KPI: PIEZAS (UNIDADES) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* CARD 1: TOTAL PIEZAS PROCESADAS */}
              <div className="bg-[#050505] border border-zinc-800 p-5 flex flex-col justify-between gap-3 shadow-sm group hover:border-[#FF5A00]/50 transition-colors">
                <div className="flex justify-between items-center text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
                  <span>TOTAL PIEZAS PROCESADAS</span>
                  <TrendingUp size={14} className="text-[#FF5A00]" />
                </div>
                <div className="text-3xl font-extrabold italic tracking-tighter text-white uppercase font-sans">
                  {loading
                    ? "..."
                    : globalStats.totalPiezasProcesadas.toLocaleString()}{" "}
                  <span className="text-sm text-zinc-600 font-medium font-mono not-italic tracking-normal">
                    u.
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                  Buenas + Malas acumuladas
                </p>
              </div>

              {/* CARD 2: TOTAL PIEZAS BUENAS */}
              <div className="bg-[#050505] border border-zinc-800 p-5 flex flex-col justify-between gap-3 shadow-sm group hover:border-emerald-500/50 transition-colors">
                <div className="flex justify-between items-center text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
                  <span>TOTAL PIEZAS BUENAS</span>
                  <CheckCircle2 size={14} className="text-emerald-400" />
                </div>
                <div className="text-3xl font-extrabold italic tracking-tighter text-emerald-400 uppercase font-sans">
                  {loading
                    ? "..."
                    : globalStats.totalPiezasBuenas.toLocaleString()}{" "}
                  <span className="text-sm text-zinc-600 font-medium font-mono not-italic tracking-normal">
                    u.
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                  Primera y Segunda Calidad
                </p>
              </div>

              {/* CARD 3: TOTAL PIEZAS NO CONFORME (MALAS) */}
              <div className="bg-[#050505] border border-zinc-800 p-5 flex flex-col justify-between gap-3 shadow-sm group hover:border-[#FF0055]/50 transition-colors">
                <div className="flex justify-between items-center text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
                  <span>TOTAL PIEZAS NO CONFORME</span>
                  <Shield size={14} className="text-[#FF0055]" />
                </div>
                <div className="text-3xl font-extrabold italic tracking-tighter text-[#FF0055] uppercase font-sans">
                  {loading
                    ? "..."
                    : globalStats.totalPiezasMalas.toLocaleString()}{" "}
                  <span className="text-sm text-zinc-600 font-medium font-mono not-italic tracking-normal">
                    u.
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                  Piezas descartadas del período
                </p>
              </div>

              {/* CARD 4: PORCENTAJE DE FALLAS (UNIDADES) */}
              <div className="bg-[#050505] border border-zinc-800 p-5 flex flex-col justify-between gap-3 shadow-sm group hover:border-[#FFD700]/50 transition-colors">
                <div className="flex justify-between items-center text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
                  <span>PORCENTAJE DE FALLAS (U)</span>
                  <AlertTriangle
                    size={14}
                    className={
                      Number(globalStats.porcDefectuosasPiezas) > 5
                        ? "text-[#FF0055]"
                        : "text-[#FFD700]"
                    }
                  />
                </div>
                <div className="text-3xl font-extrabold italic tracking-tighter text-[#FFD700] uppercase font-sans">
                  {loading ? "..." : `${globalStats.porcDefectuosasPiezas}%`}
                </div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                  Proporción sobre el total
                </p>
              </div>
            </div>

            {/* FILA 2 DE 4 TARJETAS KPI: KILOGRAMOS (KG) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* CARD 1: CANTIDAD KG TOTAL */}
              <div className="bg-[#050505] border border-zinc-800 p-5 flex flex-col justify-between gap-3 shadow-sm group hover:border-[#FF5A00]/50 transition-colors">
                <div className="flex justify-between items-center text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
                  <span>CANTIDAD KG TOTAL</span>
                  <Scale size={14} className="text-[#FF5A00]" />
                </div>
                <div className="text-3xl font-extrabold italic tracking-tighter text-white uppercase font-sans">
                  {loading
                    ? "..."
                    : globalStats.cantidadKgTotal.toLocaleString()}{" "}
                  <span className="text-sm text-zinc-600 font-medium font-mono not-italic tracking-normal">
                    Kg
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                  Materia prima procesada
                </p>
              </div>

              {/* CARD 2: CANTIDAD KG BUENAS */}
              <div className="bg-[#050505] border border-zinc-800 p-5 flex flex-col justify-between gap-3 shadow-sm group hover:border-emerald-500/50 transition-colors">
                <div className="flex justify-between items-center text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
                  <span>CANTIDAD KG BUENAS</span>
                  <CheckCircle2 size={14} className="text-emerald-400" />
                </div>
                <div className="text-3xl font-extrabold italic tracking-tighter text-emerald-400 uppercase font-sans">
                  {loading
                    ? "..."
                    : globalStats.cantidadKgBuenas.toLocaleString()}{" "}
                  <span className="text-sm text-zinc-600 font-medium font-mono not-italic tracking-normal">
                    Kg
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                  Plástico efectivo aprovechado
                </p>
              </div>

              {/* CARD 3: CANTIDAD KG FALLAS */}
              <div className="bg-[#050505] border border-zinc-800 p-5 flex flex-col justify-between gap-3 shadow-sm group hover:border-[#FF0055]/50 transition-colors">
                <div className="flex justify-between items-center text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
                  <span>CANTIDAD KG FALLAS</span>
                  <AlertOctagon size={14} className="text-[#FF0055]" />
                </div>
                <div className="text-3xl font-extrabold italic tracking-tighter text-[#FF0055] uppercase font-sans">
                  {loading
                    ? "..."
                    : globalStats.cantidadKgFallas.toLocaleString()}{" "}
                  <span className="text-sm text-zinc-600 font-medium font-mono not-italic tracking-normal">
                    Kg
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                  Scrap o desecho generado
                </p>
              </div>

              {/* CARD 4: PORCENTAJE DE FALLAS (KG) */}
              <div className="bg-[#050505] border border-zinc-800 p-5 flex flex-col justify-between gap-3 shadow-sm group hover:border-[#FFD700]/50 transition-colors">
                <div className="flex justify-between items-center text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
                  <span>PORCENTAJE DE FALLAS (KG)</span>
                  <AlertTriangle
                    size={14}
                    className={
                      Number(globalStats.porcDefectuosasKg) > 5
                        ? "text-[#FF0055]"
                        : "text-[#FFD700]"
                    }
                  />
                </div>
                <div className="text-3xl font-extrabold italic tracking-tighter text-[#FFD700] uppercase font-sans">
                  {loading ? "..." : `${globalStats.porcDefectuosasKg}%`}
                </div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                  Merma en peso de material
                </p>
              </div>
            </div>

            {/* 2 TARJETAS DE ACCIÓN CÓMODAS Y ANCHAS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#050505] border border-zinc-800 p-6 sm:p-8 flex flex-col justify-between gap-6 transition-colors">
                <div className="space-y-3">
                  <div className="p-2 border border-zinc-800 bg-black w-fit">
                    <BarChart3 size={20} className="text-[#FF5A00]" />
                  </div>
                  <h3 className="text-sm font-extrabold italic text-white uppercase tracking-tighter">
                    COMPARADOR EVOLUTIVO DRAG & DROP
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed font-medium">
                    Visualizá curvas Bézier suaves de tasa de fallas por
                    tecnología (Extrusión, Inyección y Rotomoldeo). Podés
                    arrastrar cartuchos y fusionar promedios.
                  </p>
                </div>
                <button
                  onClick={() => setIsChartModalOpen(true)}
                  className="w-full bg-black hover:bg-zinc-900 border border-zinc-800 text-[#FF5A00] hover:text-white py-3.5 text-xs font-bold uppercase tracking-widest transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Maximize2 size={14} />
                  <span>ABRIR COMPARADOR BÉZIER</span>
                </button>
              </div>

              <div className="bg-[#050505] border border-zinc-800 p-6 sm:p-8 flex flex-col justify-between gap-6 transition-colors">
                <div className="space-y-3">
                  <div className="p-2 border border-zinc-800 bg-black w-fit">
                    <Calculator size={20} className="text-[#FFD700]" />
                  </div>
                  <h3 className="text-sm font-extrabold italic text-white uppercase tracking-tighter">
                    MATRIZ Y PLANIFICACIÓN DE COBERTURA
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed font-medium">
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
                  className="w-full bg-[#FFD700] hover:bg-white text-black py-3.5 text-xs font-bold uppercase tracking-widest transition cursor-pointer flex items-center justify-center gap-2 font-bold"
                >
                  <Maximize2 size={14} />
                  <span>ABRIR MATRIZ & SIMULADOR</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VISTA CHAT INTERACTIVO */}
        {activeTab === "chat" && (
          <div className="h-full flex flex-col min-h-0 bg-[#030303] border border-zinc-800 max-w-4xl mx-auto w-full shadow-2xl">
            {/* CABECERA CHAT */}
            <div className="relative border-b border-zinc-800 bg-[#050505] p-6 flex justify-center">
              <div className="relative inline-block">
                <AIAvatar
                  estado={
                    enviandoChat
                      ? "thinking"
                      : estadoVoz === "speaking"
                        ? "speaking"
                        : "idle"
                  }
                  nombre="Connie — Asistente de Planta"
                />

                <button
                  onClick={toggleSilenciarVoz}
                  className={`absolute top-0 right-0 translate-x-1/4 -translate-y-1/4 w-8 h-8 rounded-none border flex items-center justify-center transition-all cursor-pointer shadow-lg z-20 ${
                    vozHabilitada
                      ? "bg-black border-emerald-500/60 text-emerald-400 hover:scale-105"
                      : "bg-black border-[#FF0055]/60 text-[#FF0055] hover:scale-105"
                  }`}
                  title={
                    vozHabilitada
                      ? "Silenciar voz de Connie"
                      : "Activar voz de Connie"
                  }
                >
                  {vozHabilitada ? (
                    <Volume2
                      size={14}
                      className="animate-pulse text-emerald-400"
                    />
                  ) : (
                    <VolumeX size={14} className="text-[#FF0055]" />
                  )}
                </button>
              </div>
            </div>

            {/* ÁREA DE MENSAJES */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 min-h-0 bg-black custom-scrollbar">
              {mensajes.map((m, i) => (
                <div
                  key={i}
                  className={`flex gap-3 max-w-[85%] ${
                    m.rol === "user"
                      ? "ml-auto justify-end"
                      : "mr-auto justify-start"
                  }`}
                >
                  {m.rol === "assistant" && (
                    <div className="w-10 h-10 border border-zinc-800 bg-[#050505] flex items-center justify-center text-[#FF5A00] shrink-0 mt-1">
                      <Bot size={20} />
                    </div>
                  )}

                  <div
                    className={`p-4 text-sm leading-relaxed font-medium ${
                      m.rol === "user"
                        ? "bg-[#FF5A00] text-black rounded-l-2xl rounded-tr-2xl"
                        : "bg-[#050505] border border-zinc-800 text-zinc-300 whitespace-pre-wrap rounded-r-2xl rounded-tl-2xl font-sans"
                    }`}
                  >
                    {m.texto}
                  </div>

                  {m.rol === "user" && (
                    <div className="w-10 h-10 border border-[#FF5A00] bg-[#FF5A00]/10 flex items-center justify-center text-[#FF5A00] font-mono text-sm font-bold shrink-0 mt-1">
                      U
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>

            {/* BARRA DE ENTRADA CHAT */}
            <div className="p-4 bg-[#050505] border-t border-zinc-800 flex items-center gap-3">
              <input
                type="text"
                value={inputChat}
                onChange={(e) => setInputChat(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && enviarMensajeChat()}
                placeholder="Preguntale a Connie sobre insumos, semielaborados, ventas o pedidos..."
                className="flex-1 bg-black border border-zinc-800 px-4 py-3 text-sm text-white font-medium outline-none focus:border-[#FF5A00]"
              />
              <button
                onClick={() => enviarMensajeChat()}
                disabled={enviandoChat}
                className="bg-[#FF5A00] hover:bg-white text-black p-3.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================
          MODAL 1: COMPARADOR BÉZIER
      ========================================================= */}
      {isChartModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4 font-sans">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-5xl h-[92vh] sm:h-[88vh] p-6 shadow-2xl flex flex-col relative">
            <button
              onClick={() => setIsChartModalOpen(false)}
              className="absolute top-6 right-6 text-zinc-500 hover:text-white cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="border-b border-zinc-800/80 pb-3 shrink-0 pr-8">
              <span className="text-[10px] font-mono font-bold text-[#FF5A00] bg-[#FF5A00]/10 border border-[#FF5A00]/20 px-2 py-0.5 tracking-widest uppercase">
                ANÁLISIS EVOLUTIVO
              </span>
              <h3 className="text-xl font-extrabold italic text-white uppercase tracking-tighter mt-2 flex items-center gap-2">
                <BarChart3 size={20} className="text-[#FF5A00]" />
                HISTORIAL DE DEFECTOS
              </h3>
            </div>

            <div className="bg-black border border-zinc-800 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0 my-4">
              <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 font-bold tracking-widest uppercase">
                <GripVertical size={14} className="text-[#FF5A00]" />
                <span>SELECCIONÁ CATEGORÍA PARA TRAZAR:</span>
              </div>

              <div className="flex items-center gap-2 font-mono text-[10px] flex-wrap uppercase font-bold tracking-widest">
                {["EXTRUSIÓN", "INYECCIÓN", "ROTOMOLDEO"].map((cat) => {
                  const isAlreadyActive = activeCategories.includes(cat);
                  const color = CATEGORY_COLORS[cat].stroke;

                  return (
                    <div
                      key={cat}
                      onClick={() => {
                        if (isMerged) return;
                        if (isAlreadyActive) {
                          removeCategory(cat);
                        } else {
                          setActiveCategories((prev) => [...prev, cat]);
                        }
                      }}
                      className={`px-3 py-1.5 border transition-all cursor-pointer flex items-center gap-1.5 ${
                        isMerged
                          ? "opacity-30 cursor-not-allowed bg-black border-zinc-800 text-zinc-600"
                          : isAlreadyActive
                            ? "bg-zinc-900 text-white border-zinc-700"
                            : "bg-black text-zinc-500 border-zinc-800 hover:text-white"
                      }`}
                      style={{
                        borderColor:
                          isAlreadyActive && !isMerged ? color : undefined,
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-none inline-block"
                        style={{ backgroundColor: color }}
                      />
                      {cat}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => setIsMerged(!isMerged)}
                className={`flex items-center gap-1.5 px-4 py-1.5 border text-[10px] font-bold tracking-widest uppercase transition cursor-pointer ${
                  isMerged
                    ? "bg-[#FFD700]/10 text-[#FFD700] border-[#FFD700]/50"
                    : "bg-black border-zinc-800 text-zinc-400 hover:text-white"
                }`}
              >
                <GitMerge size={14} />
                <span>{isMerged ? "SEPARAR" : "FUSIONAR PROMEDIO"}</span>
              </button>
            </div>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className="flex-1 relative flex flex-col justify-between overflow-hidden bg-black border border-zinc-800"
            >
              <div className="w-full h-full relative z-10 p-4">
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
                            fill="#050505"
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
                              fill="#050505"
                              stroke={CATEGORY_COLORS[cat].stroke}
                              strokeWidth="2.5"
                            />
                          ));
                        })}
                  </g>
                </svg>

                <div className="flex justify-between items-center pt-3 text-[10px] font-mono text-zinc-500 border-t border-zinc-800/80 overflow-x-auto mt-2 tracking-widest font-bold">
                  {evolutionaryData.mesesLista.map((mes) => (
                    <span key={mes} className="shrink-0 px-1">
                      {mes}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end shrink-0">
              <button
                onClick={() => setIsChartModalOpen(false)}
                className="border border-zinc-800 text-zinc-400 hover:text-white font-mono text-[10px] font-bold uppercase tracking-widest px-6 py-2.5 transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: MATRIZ DE RIESGO Y SIMULADOR (GRILLA 48px) */}
      {isMatrizModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4 font-sans">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-6xl h-[92vh] sm:h-[88vh] p-8 shadow-2xl flex flex-col relative">
            <button
              onClick={() => setIsMatrizModalOpen(false)}
              className="absolute top-6 right-6 text-zinc-500 hover:text-white z-50 cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="border-b border-zinc-800/80 pb-4 shrink-0 flex flex-col md:flex-row justify-between items-start md:items-end pr-8 gap-4">
              <div>
                <span className="text-[10px] font-mono font-bold text-[#FFD700] bg-[#FFD700]/10 border border-[#FFD700]/20 px-2 py-0.5 tracking-widest uppercase">
                  PLANIFICACIÓN DE DEPOSITOS
                </span>
                <h3 className="text-2xl font-extrabold italic text-white uppercase tracking-tighter mt-2 flex items-center gap-2">
                  <Calculator size={24} className="text-[#FFD700]" />
                  MATRIZ DE COBERTURA
                </h3>
              </div>

              <div className="flex items-center gap-2 font-mono text-xs bg-black border border-zinc-800 px-3 py-2 shrink-0">
                <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
                  Grupo:
                </span>
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
                  className="bg-transparent text-[#FF5A00] font-bold outline-none text-[11px] uppercase cursor-pointer"
                >
                  {gruposAlerta.map((g) => (
                    <option
                      key={g.id}
                      value={g.id}
                      className="bg-zinc-900 text-white"
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
                  className="text-zinc-500 hover:text-[#FFD700] ml-2 cursor-pointer"
                  title="Configurar Umbrales"
                >
                  <Settings size={14} />
                </button>
              </div>
            </div>

            <div className="py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shrink-0">
              <div className="relative flex-1 w-full max-w-sm">
                <Search
                  size={14}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600"
                />
                <input
                  type="text"
                  placeholder="Buscar código o nombre..."
                  value={searchTermSE}
                  onChange={(e) => {
                    setSearchTermSE(e.target.value);
                    setCurrentPageSE(1);
                  }}
                  className="w-full bg-black border border-zinc-800 text-xs text-white pl-9 pr-3 py-2 focus:outline-none focus:border-[#FF5A00] transition-colors"
                />
              </div>

              <div className="flex items-center gap-1 overflow-x-auto text-[10px] font-mono border border-zinc-800 bg-black shrink-0">
                {[
                  { id: "TODOS", label: "TODOS" },
                  { id: "CRITICO", label: `CRÍTICO` },
                  { id: "ALERTA", label: `ALERTA` },
                  { id: "OK", label: `ÓPTIMO` },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      setFiltroEstadoStock(f.id);
                      setCurrentPageSE(1);
                    }}
                    className={`px-4 py-2 transition-colors cursor-pointer whitespace-nowrap font-bold uppercase tracking-widest border-r border-zinc-800 last:border-r-0 ${
                      filtroEstadoStock === f.id
                        ? "bg-[#FFD700] text-black"
                        : "text-zinc-500 hover:text-white hover:bg-zinc-900"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              ref={tableContainerRef}
              className="flex-1 bg-[#030303] border border-zinc-800/90 shadow-2xl min-h-0 flex flex-col text-xs overflow-hidden"
            >
              <div
                ref={tableHeaderRef}
                className="grid grid-cols-[180px_1fr_120px_120px_100px_100px] h-12 bg-[#080808] border-b border-zinc-800/90 items-center text-zinc-500 font-mono text-[9px] font-bold uppercase tracking-widest shrink-0 px-4"
              >
                <div>CÓDIGO</div>
                <div>SEMIELABORADO</div>
                <div className="text-right">STOCK TOTAL</div>
                <div className="text-right">DEMANDA/M</div>
                <div className="text-center">DÍAS COB.</div>
                <div className="text-center">SIMULAR</div>
              </div>

              <div className="flex flex-col bg-black flex-1 overflow-y-auto custom-scrollbar">
                {currentPaginatedSE.map((item) => {
                  let badgeStyle = "text-zinc-500 border-zinc-800 bg-black";
                  if (item.estadoMatriz === "CRITICO")
                    badgeStyle =
                      "text-[#FF0055] bg-[#FF0055]/10 border-[#FF0055]/30";
                  else if (item.estadoMatriz === "ALERTA")
                    badgeStyle =
                      "text-[#FFD700] bg-[#FFD700]/10 border-[#FFD700]/30";
                  else if (
                    item.estadoMatriz === "OK" ||
                    item.estadoMatriz === "PRUDENTE"
                  )
                    badgeStyle =
                      "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";

                  return (
                    <div
                      key={item.id}
                      className="grid grid-cols-[180px_1fr_120px_120px_100px_100px] h-12 items-center px-4 border-b border-zinc-900/80 last:border-b-0 hover:bg-[#0a0a0a] transition-colors text-xs shrink-0"
                    >
                      <div className="font-mono font-bold text-[#FFD700] truncate pr-2">
                        {item.codigo}
                      </div>
                      <div className="text-white font-bold truncate pr-4">
                        {item.nombre}
                      </div>
                      <div className="text-right font-mono font-bold text-emerald-400">
                        {item.stock_total.toLocaleString()}
                      </div>
                      <div className="text-right font-mono text-zinc-300">
                        {item.demanda_mensual > 0
                          ? item.demanda_mensual.toLocaleString()
                          : "--"}
                      </div>
                      <div className="flex justify-center font-mono">
                        {item.dias_stock !== null ? (
                          <span
                            className={`inline-block px-2 py-0.5 border font-bold text-[10px] tracking-widest ${badgeStyle}`}
                          >
                            {item.dias_stock}d
                          </span>
                        ) : (
                          <span className="text-zinc-600">--</span>
                        )}
                      </div>
                      <div className="flex justify-center">
                        <button
                          onClick={() => {
                            setSimulatedItem(item);
                            setSimulatedBatchQty(500);
                          }}
                          className="p-1.5 text-zinc-500 hover:text-[#FFD700] transition-colors cursor-pointer"
                          title="Simular lote proyectado"
                        >
                          <Zap size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {currentPaginatedSE.length === 0 && (
                  <div className="py-12 text-center text-zinc-600 font-bold uppercase tracking-widest text-xs my-auto">
                    No hay resultados para mostrar.
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-zinc-800 text-xs font-mono text-zinc-500 shrink-0 uppercase font-bold tracking-widest">
              <span>
                Pág. <strong className="text-white">{currentPageSE}</strong> de{" "}
                <strong className="text-white">{totalPagesSE}</strong>
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPageSE((p) => Math.max(p - 1, 1))}
                  disabled={currentPageSE === 1}
                  className="px-3 py-1 border border-zinc-800 hover:text-white disabled:opacity-30 transition cursor-pointer"
                >
                  ANT
                </button>
                <button
                  onClick={() =>
                    setCurrentPageSE((p) => Math.min(p + 1, totalPagesSE))
                  }
                  disabled={currentPageSE === totalPagesSE}
                  className="px-3 py-1 border border-zinc-800 hover:text-white disabled:opacity-30 transition cursor-pointer"
                >
                  SIG
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: SIMULADOR DE LOTE FUTURO */}
      {simulatedItem && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[120] flex items-center justify-center p-4 font-sans">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-md p-6 shadow-2xl relative text-xs flex flex-col gap-4">
            <button
              onClick={() => setSimulatedItem(null)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="border-b border-zinc-800/80 pb-3 pr-6">
              <span className="text-[10px] font-mono font-bold text-[#FFD700] bg-[#FFD700]/10 px-2 py-0.5 border border-[#FFD700]/20 tracking-widest uppercase">
                SIMULADOR OPERATIVO
              </span>
              <h3 className="text-lg font-extrabold italic text-white uppercase tracking-tighter mt-2 flex items-center gap-2">
                <Zap size={18} className="text-[#FFD700]" /> PROYECTAR LOTE
              </h3>
              <p className="text-[10px] text-zinc-400 font-mono mt-1 font-bold uppercase tracking-widest truncate">
                [{simulatedItem.codigo}] {simulatedItem.nombre}
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 font-mono">
                <div className="bg-black p-3 border border-zinc-800">
                  <span className="text-[9px] text-zinc-500 block uppercase font-bold tracking-widest mb-1">
                    STOCK ACTUAL:
                  </span>
                  <strong className="text-white text-sm">
                    {simulatedItem.stock_total.toLocaleString()}{" "}
                    <span className="text-[10px] text-zinc-600">u.</span>
                  </strong>
                </div>
                <div className="bg-black p-3 border border-zinc-800">
                  <span className="text-[9px] text-zinc-500 block uppercase font-bold tracking-widest mb-1">
                    DEMANDA MENSUAL:
                  </span>
                  <strong className="text-[#FF5A00] text-sm">
                    {simulatedItem.demanda_mensual.toLocaleString()}{" "}
                    <span className="text-[10px] text-zinc-600">u.</span>
                  </strong>
                </div>
              </div>

              <div className="space-y-3 font-mono">
                <div>
                  <label className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold block mb-1.5">
                    FECHA DE ARRIBO PROYECTADA:
                  </label>
                  <input
                    type="date"
                    value={simulatedDate}
                    onChange={(e) => setSimulatedBatchDate(e.target.value)}
                    className="w-full bg-black border border-zinc-800 text-white px-3 py-2.5 outline-none focus:border-[#FFD700] text-[11px] uppercase"
                    style={{ colorScheme: "dark" }}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold block mb-1.5">
                    CANTIDAD DEL LOTE (+):
                  </label>
                  <input
                    type="number"
                    value={simulatedBatchQty}
                    onChange={(e) =>
                      setSimulatedBatchQty(
                        Math.max(0, parseInt(e.target.value) || 0),
                      )
                    }
                    className="w-full bg-black border border-zinc-800 text-[#FFD700] font-bold px-3 py-2.5 outline-none focus:border-[#FFD700] text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-zinc-800">
              <button
                onClick={() => setSimulatedItem(null)}
                className="border border-zinc-800 text-zinc-400 hover:text-white font-mono text-[10px] font-bold uppercase tracking-widest px-5 py-2 transition cursor-pointer"
              >
                CERRAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CONFIGURAR UMBRALES GRUPO */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[120] flex items-center justify-center p-4 font-sans">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-md p-6 shadow-2xl relative text-xs flex flex-col gap-5">
            <button
              onClick={() => setIsGroupModalOpen(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="border-b border-zinc-800/80 pb-3 pr-6">
              <h3 className="text-sm font-extrabold italic text-white uppercase tracking-tighter flex items-center gap-2">
                <Settings size={18} className="text-[#FF5A00]" /> UMBRALES DE
                RIESGO
              </h3>
            </div>

            <div className="space-y-4 font-mono">
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold block mb-1.5">
                  NOMBRE DEL GRUPO / REGIÓN:
                </label>
                <input
                  type="text"
                  placeholder="Ej: Exportación LATAM"
                  value={groupForm.nombre}
                  onChange={(e) =>
                    setGroupForm({ ...groupForm, nombre: e.target.value })
                  }
                  className="w-full bg-black border border-zinc-800 text-white px-3 py-2.5 outline-none focus:border-[#FF5A00] text-xs uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-[#FF0055] uppercase tracking-widest font-bold block mb-1.5">
                    DÍAS CRÍTICOS (&lt;):
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
                    className="w-full bg-black border border-zinc-800 text-[#FF0055] font-bold px-3 py-2.5 outline-none focus:border-[#FF0055]/50 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#FFD700] uppercase tracking-widest font-bold block mb-1.5">
                    DÍAS ALERTA (&lt;):
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
                    className="w-full bg-black border border-zinc-800 text-[#FFD700] font-bold px-3 py-2.5 outline-none focus:border-[#FFD700]/50 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
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
                className="w-full bg-[#FF5A00] hover:bg-white text-black font-bold uppercase tracking-widest font-mono py-3 text-xs shadow-md transition cursor-pointer"
              >
                GUARDAR UMBRALES
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
