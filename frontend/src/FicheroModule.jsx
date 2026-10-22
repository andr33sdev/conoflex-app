import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Calendar as CalendarIcon,
  Table as TableIcon,
  Sun,
  Moon,
  Users,
  Download,
  X,
  Tag,
  Globe,
} from "lucide-react";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "";
const getApiUrl = (path) =>
  `${API_BASE_URL}${path.startsWith("/") ? path : "/" + path}`;

export default function FicheroModule() {
  const [fichadas, setFichadas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [sincronizandoWeb, setSincronizandoWeb] = useState(false);

  // Vistas: 'tabla' | 'calendario'
  const [vista, setVista] = useState("tabla");

  // Filtros de tabla
  const [busqueda, setBusqueda] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("TODOS");

  // Ordenamiento de tabla
  const [columnaOrden, setColumnaOrden] = useState("fecha_hora");
  const [direccionOrden, setDireccionOrden] = useState("desc");

  // Paginación dinámica
  const [paginaActual, setPaginaActual] = useState(1);
  const [itemsPorPagina, setItemsPorPagina] = useState(10);
  const tableContainerRef = useRef(null);

  // Escala UOYEP dinámica
  const [periodosUOYEP, setPeriodosUOYEP] = useState([]);
  const [categoriasUOYEP, setCategoriasUOYEP] = useState([]);
  const [valoresUOYEP, setValoresUOYEP] = useState([]);
  const [asignaciones, setAsignaciones] = useState({});
  const [periodoEscalaActivo, setPeriodoEscalaActivo] = useState("");
  const [modalCategoriasAbierto, setModalCategoriasAbierto] = useState(false);

  // Calendario
  const [operarioSeleccionado, setOperarioSeleccionado] = useState(null);
  const [mesCalendario, setMesCalendario] = useState(() => {
    const hoy = new Date();
    return { anio: hoy.getFullYear(), mes: hoy.getMonth() };
  });

  // Exportación
  const [menuExportarAbierto, setMenuExportarAbierto] = useState(false);
  const [modalVariosAbierto, setModalVariosAbierto] = useState(false);
  const [operariosSeleccionadosModal, setOperariosSeleccionadosModal] =
    useState([]);
  const [mesExportMulti, setMesExportMulti] = useState(() => {
    const hoy = new Date();
    return { anio: hoy.getFullYear(), mes: hoy.getMonth() };
  });
  const [imprimiendoLote, setImprimiendoLote] = useState(false);
  const [mostrarOperariosMobile, setMostrarOperariosMobile] = useState(false);

  const NOMBRES_MESES = useMemo(
    () => [
      "ENERO",
      "FEBRERO",
      "MARZO",
      "ABRIL",
      "MAYO",
      "JUNIO",
      "JULIO",
      "AGOSTO",
      "SEPTIEMBRE",
      "OCTUBRE",
      "NOVIEMBRE",
      "DICIEMBRE",
    ],
    [],
  );

  const cambiarMes = (incremento) => {
    setMesCalendario((prev) => {
      let nuevoMes = prev.mes + incremento;
      let nuevoAnio = prev.anio;
      if (nuevoMes > 11) {
        nuevoMes = 0;
        nuevoAnio += 1;
      } else if (nuevoMes < 0) {
        nuevoMes = 11;
        nuevoAnio -= 1;
      }
      return { anio: nuevoAnio, mes: nuevoMes };
    });
  };

  // 1. CARGA DE ESCALA DESDE BD
  const cargarEscalaUOYEP = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl("/api/fichero/escala-uoyep"));
      if (res.ok) {
        const data = await res.json();
        setPeriodosUOYEP(data.periodos || []);
        setCategoriasUOYEP(data.categorias || []);
        setValoresUOYEP(data.valores || []);

        const mapaAsig = {};
        (data.asignaciones || []).forEach((a) => {
          mapaAsig[a.nombre_operario] = a.categoria_codigo;
        });
        setAsignaciones(mapaAsig);

        // Si no hay período activo seleccionado, fijar el primero disponible
        if (data.periodos && data.periodos.length > 0) {
          setPeriodoEscalaActivo((prev) => prev || data.periodos[0].periodo);
        }
      }
    } catch (err) {
      console.error("Error cargando escala UOYEP:", err);
    }
  }, []);

  // 2. SINCRONIZACIÓN WEB MANUAL
  const sincronizarConWebUOYEP = async () => {
    setSincronizandoWeb(true);
    try {
      const res = await fetch(getApiUrl("/api/fichero/sincronizar-uoyep"), {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        await cargarEscalaUOYEP();
      } else {
        alert(data.error || "No se pudo sincronizar con la web de UOYEP");
      }
    } catch (err) {
      alert("Error de conexión al intentar sincronizar con UOYEP");
    } finally {
      setSincronizandoWeb(false);
    }
  };

  const cargarFichadas = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setIsSyncing(true);

    try {
      const res = await fetch(getApiUrl("/api/fichero/historial"));
      if (res.ok) {
        const registros = await res.json();
        setFichadas(registros);
      }
    } catch (err) {
      console.error("Error obteniendo fichadas:", err);
    } finally {
      setLoading(false);
      setTimeout(() => setIsSyncing(false), 400);
    }
  }, []);

  useEffect(() => {
    cargarFichadas(false);
    cargarEscalaUOYEP();
  }, [cargarFichadas, cargarEscalaUOYEP]);

  const formatearFechaHora = (fechaString) => {
    const d = new Date(fechaString);
    const anio = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    const fechaISO = `${anio}-${mes}-${dia}`;
    const fechaVisual = `${dia}/${mes}/${anio}`;

    const horaNum = d.getHours();
    const hora = String(horaNum).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    const seg = String(d.getSeconds()).padStart(2, "0");
    const horaVisual = `${hora}:${min}:${seg}`;

    return {
      fechaISO,
      fechaVisual,
      horaVisual,
      horaNum,
      timestamp: d.getTime(),
    };
  };

  useEffect(() => {
    if (vista !== "tabla" || !tableContainerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const alturaDisponible = entry.contentRect.height;
        const alturaCabecera = 40;
        const alturaFila = 49;
        const espacioParaFilas = alturaDisponible - alturaCabecera;
        const filasCalculadas = Math.max(
          1,
          Math.floor(espacioParaFilas / alturaFila),
        );
        setItemsPorPagina(filasCalculadas);
      }
    });

    observer.observe(tableContainerRef.current);
    return () => observer.disconnect();
  }, [vista]);

  useEffect(() => {
    setPaginaActual(1);
  }, [busqueda, filtroTipo, fechaDesde, fechaHasta, itemsPorPagina]);

  const fichadasSinRebotes = useMemo(() => {
    const ordenadas = [...fichadas].sort(
      (a, b) =>
        new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime(),
    );

    const filtradas = [];
    const ultimaMarca = new Map();

    for (const f of ordenadas) {
      const tActual = new Date(f.fecha_hora).getTime();
      const clave = `${f.empleado_id || f.nombre}`;
      const tPrevio = ultimaMarca.get(clave);

      if (tPrevio && tActual - tPrevio < 60000) continue;

      ultimaMarca.set(clave, tActual);
      filtradas.push(f);
    }
    return filtradas;
  }, [fichadas]);

  const mesesDisponibles = useMemo(() => {
    const mapa = new Map();
    fichadasSinRebotes.forEach((f) => {
      if (!f.fecha_hora) return;
      const d = new Date(f.fecha_hora);
      if (!isNaN(d.getTime())) {
        const anio = d.getFullYear();
        const mes = d.getMonth();
        const clave = `${anio}-${mes}`;
        if (!mapa.has(clave)) {
          mapa.set(clave, {
            anio,
            mes,
            label: `${NOMBRES_MESES[mes]} ${anio}`,
          });
        }
      }
    });

    if (mapa.size === 0) {
      const hoy = new Date();
      return [
        {
          anio: hoy.getFullYear(),
          mes: hoy.getMonth(),
          label: `${NOMBRES_MESES[hoy.getMonth()]} ${hoy.getFullYear()}`,
        },
      ];
    }

    return Array.from(mapa.values()).sort((a, b) => {
      if (a.anio !== b.anio) return b.anio - a.anio;
      return b.mes - a.mes;
    });
  }, [fichadasSinRebotes, NOMBRES_MESES]);

  const listaOperarios = useMemo(() => {
    const mapa = new Map();
    fichadasSinRebotes.forEach((f) => {
      if (f.nombre && !mapa.has(f.nombre)) {
        mapa.set(f.nombre, { nombre: f.nombre });
      }
    });
    return Array.from(mapa.values());
  }, [fichadasSinRebotes]);

  useEffect(() => {
    if (listaOperarios.length > 0 && !operarioSeleccionado) {
      setOperarioSeleccionado(listaOperarios[0].nombre);
    }
  }, [listaOperarios, operarioSeleccionado]);

  // Valores hora correspondientes al período seleccionado en el selector
  const mapaValoresPeriodoActivo = useMemo(() => {
    const mapa = {};
    valoresUOYEP
      .filter((v) => v.periodo === periodoEscalaActivo)
      .forEach((v) => {
        mapa[v.categoria_codigo] = parseFloat(v.valor_hora) || 0;
      });
    return mapa;
  }, [valoresUOYEP, periodoEscalaActivo]);

  // Cálculo de horarios y horas extras (9hs normales, extras +50%, diurnas x1, nocturnas x1.5)
  const calcularDatosCalendario = useCallback((nombreOp, fichadasList) => {
    if (!nombreOp) return {};

    const fichadasDelOperario = fichadasList
      .filter((f) => f.nombre === nombreOp)
      .sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));

    const mapaDias = {};
    let entradaPendiente = null;

    fichadasDelOperario.forEach((f) => {
      const { fechaISO, horaVisual, horaNum, timestamp } = formatearFechaHora(
        f.fecha_hora,
      );
      const horaCorta = horaVisual.slice(0, 5);

      if (!mapaDias[fechaISO]) {
        mapaDias[fechaISO] = {
          ingreso: null,
          egreso: null,
          esNoche: false,
          esSiguienteDia: false,
          horasNormales: 0,
          horasExtrasDiurnas: 0,
          horasExtrasNocturnas: 0,
          horasTotalesTurno: 0,
        };
      }

      if (f.tipo === "ENTRADA") {
        if (
          entradaPendiente &&
          timestamp - entradaPendiente.timestamp > 1 * 60 * 60 * 1000 &&
          timestamp - entradaPendiente.timestamp <= 18 * 60 * 60 * 1000
        ) {
          const fechaEntrada = entradaPendiente.fechaISO;
          mapaDias[fechaEntrada].egreso = horaCorta;
          if (fechaEntrada !== fechaISO) {
            mapaDias[fechaEntrada].esSiguienteDia = true;
          }

          const msTrabajados = timestamp - entradaPendiente.timestamp;
          const totalHoras = msTrabajados / (1000 * 60 * 60);
          mapaDias[fechaEntrada].horasTotalesTurno = totalHoras;

          const normales = Math.min(totalHoras, 9);
          const extras = Math.max(0, totalHoras - 9);
          mapaDias[fechaEntrada].horasNormales = normales;

          if (mapaDias[fechaEntrada].esNoche) {
            mapaDias[fechaEntrada].horasExtrasNocturnas = extras * 1.5;
          } else {
            mapaDias[fechaEntrada].horasExtrasDiurnas = extras;
          }

          entradaPendiente = null;
        } else {
          if (!mapaDias[fechaISO].ingreso) {
            mapaDias[fechaISO].ingreso = horaCorta;
            if (horaNum >= 18 || horaNum < 6) mapaDias[fechaISO].esNoche = true;
            entradaPendiente = { fechaISO, timestamp };
          }
        }
      } else if (f.tipo === "SALIDA") {
        if (
          entradaPendiente &&
          timestamp - entradaPendiente.timestamp <= 18 * 60 * 60 * 1000
        ) {
          const fechaEntrada = entradaPendiente.fechaISO;
          mapaDias[fechaEntrada].egreso = horaCorta;
          if (fechaEntrada !== fechaISO) {
            mapaDias[fechaEntrada].esSiguienteDia = true;
          }

          const msTrabajados = timestamp - entradaPendiente.timestamp;
          const totalHoras = msTrabajados / (1000 * 60 * 60);
          mapaDias[fechaEntrada].horasTotalesTurno = totalHoras;

          const normales = Math.min(totalHoras, 9);
          const extras = Math.max(0, totalHoras - 9);
          mapaDias[fechaEntrada].horasNormales = normales;

          if (mapaDias[fechaEntrada].esNoche) {
            mapaDias[fechaEntrada].horasExtrasNocturnas = extras * 1.5;
          } else {
            mapaDias[fechaEntrada].horasExtrasDiurnas = extras;
          }

          entradaPendiente = null;
        } else {
          if (!mapaDias[fechaISO].egreso) {
            mapaDias[fechaISO].egreso = horaCorta;
          }
        }
      }
    });

    return mapaDias;
  }, []);

  const datosCalendarioOperario = useMemo(() => {
    return calcularDatosCalendario(operarioSeleccionado, fichadasSinRebotes);
  }, [operarioSeleccionado, fichadasSinRebotes, calcularDatosCalendario]);

  const generarCeldasMes = useCallback((anio, mes, mapaDatos) => {
    const primerDiaMes = new Date(anio, mes, 1);
    const totalDias = new Date(anio, mes + 1, 0).getDate();

    let diaSemanaInicio = primerDiaMes.getDay() - 1;
    if (diaSemanaInicio === -1) diaSemanaInicio = 6;

    const celdas = [];
    for (let i = 0; i < diaSemanaInicio; i++) celdas.push(null);

    for (let d = 1; d <= totalDias; d++) {
      const diaNum = String(d).padStart(2, "0");
      const mesNum = String(mes + 1).padStart(2, "0");
      const fechaISO = `${anio}-${mesNum}-${diaNum}`;

      celdas.push({
        numero: d,
        fechaISO,
        data: (mapaDatos && mapaDatos[fechaISO]) || null,
      });
    }

    while (celdas.length % 7 !== 0) celdas.push(null);

    return { celdasMes: celdas, cantidadFilas: celdas.length / 7 };
  }, []);

  const { celdasMes, cantidadFilas } = useMemo(() => {
    return generarCeldasMes(
      mesCalendario.anio,
      mesCalendario.mes,
      datosCalendarioOperario,
    );
  }, [mesCalendario, datosCalendarioOperario, generarCeldasMes]);

  const totalesMesOperario = useMemo(() => {
    let normales = 0;
    let extrasDiurnas = 0;
    let extrasNocturnas = 0;

    celdasMes.forEach((celda) => {
      if (celda?.data) {
        normales += celda.data.horasNormales || 0;
        extrasDiurnas += celda.data.horasExtrasDiurnas || 0;
        extrasNocturnas += celda.data.horasExtrasNocturnas || 0;
      }
    });

    const codigoCat = asignaciones[operarioSeleccionado];
    const catObj = categoriasUOYEP.find((c) => c.codigo === codigoCat);
    const vNormal = mapaValoresPeriodoActivo[codigoCat] || 0;
    const vExtra = vNormal * 1.5;

    const totalPesosNormales = normales * vNormal;
    const totalPesosDiurnas = extrasDiurnas * vExtra;
    const totalPesosNocturnas = extrasNocturnas * vExtra;
    const totalPesosMes =
      totalPesosNormales + totalPesosDiurnas + totalPesosNocturnas;

    return {
      normales,
      extrasDiurnas,
      extrasNocturnas,
      totalExtras: extrasDiurnas + extrasNocturnas,
      categoriaNombre: catObj ? catObj.nombre : "SIN CATEGORÍA",
      vNormal,
      vExtra,
      totalPesosMes,
    };
  }, [
    celdasMes,
    operarioSeleccionado,
    asignaciones,
    categoriasUOYEP,
    mapaValoresPeriodoActivo,
  ]);

  const cambiarAsignacion = async (nombreOperario, categoriaCodigo) => {
    try {
      const res = await fetch(getApiUrl("/api/fichero/asignar-categoria"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre_operario: nombreOperario,
          categoria_codigo: categoriaCodigo || null,
        }),
      });
      if (res.ok) {
        setAsignaciones((prev) => ({
          ...prev,
          [nombreOperario]: categoriaCodigo || null,
        }));
      }
    } catch (err) {
      console.error("Error asignando operario:", err);
    }
  };

  const ejecutarExportacionLote = () => {
    if (operariosSeleccionadosModal.length === 0) return;
    setModalVariosAbierto(false);
    setImprimiendoLote(true);

    setTimeout(() => {
      window.print();
      setImprimiendoLote(false);
    }, 400);
  };

  const fichadasFiltradas = useMemo(() => {
    return fichadasSinRebotes.filter((f) => {
      const { fechaISO } = formatearFechaHora(f.fecha_hora);
      const matchBusqueda =
        f.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        String(f.rec_no).includes(busqueda);
      const matchTipo = filtroTipo === "TODOS" || f.tipo === filtroTipo;
      const matchDesde = fechaDesde ? fechaISO >= fechaDesde : true;
      const matchHasta = fechaHasta ? fechaISO <= fechaHasta : true;

      return matchBusqueda && matchTipo && matchDesde && matchHasta;
    });
  }, [fichadasSinRebotes, busqueda, filtroTipo, fechaDesde, fechaHasta]);

  const fichadasOrdenadas = useMemo(() => {
    return [...fichadasFiltradas].sort((a, b) => {
      let valA, valB;
      if (columnaOrden === "fecha_hora" || columnaOrden === "hora") {
        valA = new Date(a.fecha_hora).getTime();
        valB = new Date(b.fecha_hora).getTime();
      } else if (columnaOrden === "nombre" || columnaOrden === "tipo") {
        valA = a[columnaOrden].toLowerCase();
        valB = b[columnaOrden].toLowerCase();
      } else {
        valA = a.rec_no;
        valB = b.rec_no;
      }
      if (valA < valB) return direccionOrden === "asc" ? -1 : 1;
      if (valA > valB) return direccionOrden === "asc" ? 1 : -1;
      return 0;
    });
  }, [fichadasFiltradas, columnaOrden, direccionOrden]);

  const alternarOrden = (campo) => {
    if (columnaOrden === campo) {
      setDireccionOrden((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setColumnaOrden(campo);
      setDireccionOrden("asc");
    }
  };

  const renderIconoOrden = (campo) => {
    if (columnaOrden !== campo) return null;
    return direccionOrden === "asc" ? (
      <ArrowUp size={12} className="text-[#FF5A00]" />
    ) : (
      <ArrowDown size={12} className="text-[#FF5A00]" />
    );
  };

  const totalPaginas =
    Math.ceil(fichadasOrdenadas.length / itemsPorPagina) || 1;
  const fichadasPaginadas = fichadasOrdenadas.slice(
    (paginaActual - 1) * itemsPorPagina,
    paginaActual * itemsPorPagina,
  );

  return (
    <div className="flex flex-col h-full bg-[#050505] text-zinc-100 p-3 sm:p-4 md:p-6 select-none font-sans overflow-hidden print:block print:h-auto print:overflow-visible print:p-0 print:bg-white">
      <style>{`
        @media print {
          @page { size: landscape; margin: 8mm; }
          *, *::before, *::after { overflow: visible !important; }
          html, body, #root, #root > div, #root > div > div, main, main > div {
            display: block !important; height: auto !important; min-height: 0 !important; max-height: none !important;
            position: static !important; transform: none !important; margin: 0 !important; padding: 0 !important;
            border: none !important; box-shadow: none !important; background: white !important;
          }
          .bg-dots-orange, .animate-dots-drift { display: none !important; }
          .hoja-operario-impresion {
            display: block !important; page-break-after: always !important; break-after: page !important;
            page-break-inside: avoid !important; break-inside: avoid !important; clear: both !important;
            width: 100% !important; box-sizing: border-box !important; margin: 0 !important; padding: 0 !important;
          }
          .hoja-operario-impresion:last-child { page-break-after: auto !important; break-after: auto !important; }
        }
      `}</style>

      {/* HEADER SUPERIOR */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4 shrink-0 print:hidden">
        <div>
          <h1 className="text-xl md:text-3xl font-black italic tracking-tighter uppercase text-white leading-none">
            CONTROL DE ASISTENCIA Y TARIFAS
          </h1>
          <p className="text-[#FF5A00] font-bold text-[10px] md:text-[11px] tracking-widest uppercase mt-1">
            CONVENIO UOYEP - INDUSTRIA DEL PLÁSTICO
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* DESPLEGABLE DINÁMICO DE PERÍODOS DE ESCALA */}
          <div className="flex items-center gap-2 bg-[#121212] border border-zinc-800 px-3 py-1.5 rounded">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest hidden sm:inline">
              Escala Salarial:
            </span>
            <select
              value={periodoEscalaActivo}
              onChange={(e) => setPeriodoEscalaActivo(e.target.value)}
              className="bg-transparent text-white text-xs font-bold uppercase tracking-wider outline-none cursor-pointer [color-scheme:dark]"
            >
              {periodosUOYEP.map((p) => (
                <option
                  key={p.periodo}
                  value={p.periodo}
                  className="bg-[#18181b]"
                >
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* BOTÓN SINCRONIZAR DIRECTAMENTE CON LA WEB */}
          <button
            onClick={sincronizarConWebUOYEP}
            disabled={sincronizandoWeb}
            title="Extrae la tabla actualizada desde uoyepweb.org.ar"
            className="bg-[#18181b] hover:bg-[#27272a] border border-zinc-700 text-white font-bold uppercase tracking-widest text-[10px] px-3.5 py-2.5 rounded flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
          >
            <Globe
              size={14}
              className={
                sincronizandoWeb
                  ? "animate-spin text-[#FF5A00]"
                  : "text-[#FF5A00]"
              }
            />
            <span>
              {sincronizandoWeb ? "SINCRONIZANDO..." : "SINCRONIZAR CON WEB"}
            </span>
          </button>

          {/* BOTÓN ASIGNAR CATEGORÍAS */}
          <button
            onClick={() => setModalCategoriasAbierto(true)}
            className="bg-[#18181b] hover:bg-[#27272a] border border-zinc-700 text-white font-bold uppercase tracking-widest text-[10px] px-3.5 py-2.5 rounded flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
          >
            <Tag size={14} className="text-[#FF5A00]" />
            <span>ASIGNAR CATEGORÍAS</span>
          </button>

          <button
            onClick={() => {
              cargarFichadas(false);
              cargarEscalaUOYEP();
            }}
            disabled={isSyncing}
            className="bg-[#FFD700] hover:bg-white text-black font-bold uppercase tracking-widest text-[10px] px-4 py-2.5 rounded flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
          >
            <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
            {isSyncing ? "ACTUALIZANDO..." : "ACTUALIZAR"}
          </button>
        </div>
      </div>

      {vista === "calendario" ? (
        <div
          className={`flex-1 flex flex-col md:flex-row gap-4 min-h-0 ${
            imprimiendoLote
              ? "print:hidden"
              : "print:block print:overflow-visible print:h-auto"
          }`}
        >
          <div className="print:hidden flex md:hidden gap-2 shrink-0">
            <button
              onClick={() => setVista("tabla")}
              className="flex-1 bg-[#121212] border border-zinc-800 text-zinc-300 py-2.5 rounded text-[10px] font-bold tracking-widest flex items-center justify-center gap-2 cursor-pointer uppercase"
            >
              <TableIcon size={14} /> TABLA
            </button>
            <button
              onClick={() => setMostrarOperariosMobile(!mostrarOperariosMobile)}
              className="flex-1 bg-[#FF5A00]/10 border border-[#FF5A00] text-[#FF5A00] py-2.5 rounded text-[10px] font-bold tracking-widest flex items-center justify-center gap-2 cursor-pointer uppercase"
            >
              <Users size={14} />
              {mostrarOperariosMobile ? "OCULTAR OP." : "VER OP."}
            </button>
          </div>

          <div
            className={`print:hidden ${mostrarOperariosMobile ? "flex" : "hidden"} md:flex w-full md:w-64 flex-col gap-3 min-h-0 shrink-0`}
          >
            <button
              onClick={() => setVista("tabla")}
              className="hidden md:flex w-full bg-[#121212] hover:bg-[#1a1a1a] border border-zinc-800 text-zinc-300 py-2.5 rounded text-[10px] font-bold tracking-widest items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 uppercase"
            >
              <TableIcon size={14} /> VOLVER A TABLA
            </button>

            <div className="flex-1 bg-[#0A0A0A] rounded-lg p-3 flex flex-col min-h-[150px] md:min-h-0 overflow-hidden border border-zinc-850">
              <span className="text-zinc-500 font-bold text-[10px] tracking-wider uppercase mb-2 block shrink-0">
                Operarios
              </span>
              <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {listaOperarios.map((op) => {
                  const activo = operarioSeleccionado === op.nombre;
                  const codigoCat = asignaciones[op.nombre];
                  const catObj = categoriasUOYEP.find(
                    (c) => c.codigo === codigoCat,
                  );

                  return (
                    <button
                      key={op.nombre}
                      onClick={() => {
                        setOperarioSeleccionado(op.nombre);
                        if (window.innerWidth < 768)
                          setMostrarOperariosMobile(false);
                      }}
                      className={`w-full text-left py-2 px-2.5 rounded flex items-center justify-between transition-colors cursor-pointer ${
                        activo
                          ? "text-white bg-[#161616] border-l-2 border-[#FF5A00]"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      <div className="truncate pr-2">
                        <span className="text-[11px] font-bold tracking-wider uppercase truncate block">
                          {op.nombre}
                        </span>
                        <span className="text-[9px] text-[#FF5A00] font-mono tracking-tight block">
                          {catObj ? catObj.nombre : "Sin categoría"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex-1 bg-[#0A0A0A] print:bg-white print:border-none rounded-lg border border-zinc-850 p-3 md:p-4 print:p-0 print:pt-4 flex flex-col print:block min-h-0 overflow-hidden print:overflow-visible print:break-inside-avoid">
            <div className="flex flex-col gap-3 pb-3 mb-2 border-b border-zinc-900 print:border-gray-300 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="text-xs md:text-sm font-black tracking-widest text-white print:text-black uppercase flex flex-col md:flex-row print:flex-row md:items-center print:items-center gap-1 md:gap-2">
                  <span>
                    {NOMBRES_MESES[mesCalendario.mes]} {mesCalendario.anio}
                  </span>
                  <span className="text-[#FF5A00]">
                    ({operarioSeleccionado})
                  </span>
                  <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-mono">
                    {totalesMesOperario.categoriaNombre}
                  </span>
                </h2>

                <div className="flex items-center justify-between sm:justify-end gap-3 print:hidden">
                  <div className="relative">
                    <button
                      onClick={() =>
                        setMenuExportarAbierto(!menuExportarAbierto)
                      }
                      className="bg-zinc-200 hover:bg-white text-black font-bold uppercase tracking-widest text-[9px] md:text-[10px] px-3 py-1.5 md:py-2 rounded flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                    >
                      <Download size={13} />
                      <span>EXPORTAR PDF</span>
                      <ChevronDown
                        size={13}
                        className={`transition-transform duration-200 ${
                          menuExportarAbierto ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {menuExportarAbierto && (
                      <div
                        className="fixed inset-0 z-20"
                        onClick={() => setMenuExportarAbierto(false)}
                      />
                    )}

                    <div
                      className={`absolute right-0 mt-2 w-56 bg-[#0E0E0E] border border-zinc-800 rounded-lg shadow-2xl py-1.5 z-30 transition-all duration-200 transform origin-top-right ${
                        menuExportarAbierto
                          ? "opacity-100 scale-100 pointer-events-auto"
                          : "opacity-0 scale-95 pointer-events-none"
                      }`}
                    >
                      <button
                        onClick={() => {
                          setMenuExportarAbierto(false);
                          setImprimiendoLote(false);
                          window.print();
                        }}
                        className="w-full text-left px-3.5 py-2.5 text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-800/80 flex items-center gap-2.5 transition-colors cursor-pointer uppercase tracking-wider"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A00]" />
                        Exportar este operario
                      </button>
                      <button
                        onClick={() => {
                          setMenuExportarAbierto(false);
                          setOperariosSeleccionadosModal(
                            listaOperarios.map((o) => o.nombre),
                          );
                          const mesActualExiste = mesesDisponibles.some(
                            (m) =>
                              m.anio === mesCalendario.anio &&
                              m.mes === mesCalendario.mes,
                          );
                          if (mesActualExiste) {
                            setMesExportMulti(mesCalendario);
                          } else if (mesesDisponibles.length > 0) {
                            setMesExportMulti({
                              anio: mesesDisponibles[0].anio,
                              mes: mesesDisponibles[0].mes,
                            });
                          }
                          setModalVariosAbierto(true);
                        }}
                        className="w-full text-left px-3.5 py-2.5 text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-800/80 flex items-center gap-2.5 transition-colors cursor-pointer uppercase tracking-wider border-t border-zinc-900"
                      >
                        <Users size={14} className="text-[#FFD700]" />
                        Exportar varios operarios
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => cambiarMes(-1)}
                      className="w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded border border-zinc-800 bg-[#121212] hover:bg-zinc-800 text-zinc-400 transition-colors cursor-pointer"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      onClick={() => cambiarMes(1)}
                      className="w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded border border-zinc-800 bg-[#121212] hover:bg-zinc-800 text-zinc-400 transition-colors cursor-pointer"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* CARD DE RESUMEN FINANCIERO DINÁMICO */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#121212] print:bg-gray-100 p-2.5 rounded-lg border border-zinc-800 print:border-gray-300 text-[10px]">
                <div className="flex flex-col">
                  <span className="text-zinc-500 uppercase tracking-widest font-bold">
                    Hs Normales (&le;9h)
                  </span>
                  <span className="text-white print:text-black font-black text-xs font-mono">
                    {totalesMesOperario.normales.toFixed(1)} hs
                  </span>
                  <span className="text-zinc-500 font-mono text-[9px]">
                    $
                    {totalesMesOperario.vNormal.toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                    })}
                    /h
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-amber-400 uppercase tracking-widest font-bold flex items-center gap-1">
                    <Sun size={11} /> Extras Diurnas (x1)
                  </span>
                  <span className="text-amber-300 print:text-amber-700 font-black text-xs font-mono">
                    {totalesMesOperario.extrasDiurnas.toFixed(1)} hs
                  </span>
                  <span className="text-zinc-500 font-mono text-[9px]">
                    $
                    {totalesMesOperario.vExtra.toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                    })}
                    /h (+50%)
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-cyan-400 uppercase tracking-widest font-bold flex items-center gap-1">
                    <Moon size={11} /> Extras Noct. (x1.5)
                  </span>
                  <span className="text-cyan-300 print:text-cyan-700 font-black text-xs font-mono">
                    {totalesMesOperario.extrasNocturnas.toFixed(1)} hs
                  </span>
                  <span className="text-zinc-500 font-mono text-[9px]">
                    1.5x por hora extra
                  </span>
                </div>

                <div className="flex flex-col border-l border-zinc-800 print:border-gray-300 pl-3">
                  <span className="text-[#FF5A00] uppercase tracking-widest font-bold">
                    Total Estimado
                  </span>
                  <span className="text-emerald-400 print:text-emerald-700 font-black text-sm font-mono leading-tight">
                    $
                    {totalesMesOperario.totalPesosMes.toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                  <span className="text-zinc-500 text-[9px]">
                    Escala{" "}
                    {periodosUOYEP.find(
                      (p) => p.periodo === periodoEscalaActivo,
                    )?.label || ""}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 md:gap-2 pb-2 shrink-0">
              {["LU", "MA", "MI", "JU", "VI", "SÁ", "DO"].map((dia) => (
                <div
                  key={dia}
                  className="text-center text-[9px] md:text-[10px] font-bold text-zinc-500 print:text-zinc-800 uppercase tracking-widest"
                >
                  {dia}
                </div>
              ))}
            </div>

            <div
              className="flex-1 min-h-0 grid grid-cols-7 gap-1 md:gap-2 print:gap-2 overflow-y-auto custom-scrollbar md:overflow-hidden print:overflow-visible print:h-auto"
              style={{
                gridTemplateRows:
                  window.innerWidth < 768
                    ? "auto"
                    : `repeat(${cantidadFilas}, minmax(0, 1fr))`,
              }}
            >
              {celdasMes.map((celda, idx) => {
                if (!celda) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="rounded border border-transparent min-h-[60px] md:min-h-0 print:min-h-[88px]"
                    />
                  );
                }

                const hayIngreso = !!celda.data?.ingreso;
                const hayEgreso = !!celda.data?.egreso;
                const tieneDatos = hayIngreso || hayEgreso;
                const esNoche = celda.data?.esNoche;
                const hsExtras =
                  (celda.data?.horasExtrasDiurnas || 0) +
                  (celda.data?.horasExtrasNocturnas || 0);

                if (!tieneDatos) {
                  return (
                    <div
                      key={celda.fechaISO}
                      className="rounded border border-zinc-900/40 print:border-gray-200 bg-[#070707] print:bg-gray-50/60 flex items-center justify-center min-h-[60px] md:min-h-0 print:min-h-[88px]"
                    >
                      <span className="text-[10px] md:text-xs font-bold text-zinc-700 print:text-gray-400 print:text-sm">
                        {celda.numero}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={celda.fechaISO}
                    className="rounded border border-zinc-750 print:border-gray-300 bg-[#111111] print:bg-white hover:border-[#FF5A00] transition-colors p-1 md:p-2 print:p-2.5 flex flex-col justify-between min-h-[60px] md:min-h-0 print:min-h-[88px] overflow-hidden shadow-sm"
                  >
                    <div className="flex items-center justify-between shrink-0 mb-1 md:mb-0 print:mb-2">
                      <span className="text-[10px] md:text-xs font-black text-white print:text-black">
                        {celda.numero}
                      </span>
                      <div className="flex items-center gap-1">
                        {hsExtras > 0 && (
                          <span
                            className={`text-[7px] md:text-[8px] font-mono px-1 py-0.2 rounded font-black ${
                              esNoche
                                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                                : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            }`}
                          >
                            +{hsExtras.toFixed(1)}h ext
                          </span>
                        )}
                        {esNoche ? (
                          <Moon
                            size={10}
                            className="text-cyan-400 print:text-cyan-600 print:w-3.5 print:h-3.5"
                          />
                        ) : (
                          <Sun
                            size={10}
                            className="text-amber-400 print:text-amber-500 print:w-3.5 print:h-3.5"
                          />
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-0.5 md:gap-1 print:gap-1.5 min-h-0 justify-center">
                      <div className="flex items-center justify-between bg-emerald-500/10 print:bg-emerald-50 border border-emerald-500/20 print:border-emerald-300 px-1 py-0.5 print:px-2 print:py-1 rounded text-[8px] md:text-[10px]">
                        <span className="font-bold text-emerald-400 print:text-emerald-700 tracking-wider">
                          ENT
                        </span>
                        <span className="text-white print:text-black font-semibold font-mono">
                          {hayIngreso ? celda.data.ingreso : "-:-"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between bg-rose-500/10 print:bg-rose-50 border border-rose-500/20 print:border-rose-300 px-1 py-0.5 print:px-2 print:py-1 rounded text-[8px] md:text-[10px]">
                        <span className="font-bold text-rose-400 print:text-rose-700 tracking-wider">
                          SAL
                        </span>
                        <div className="flex items-center gap-1 font-mono">
                          <span className="text-white print:text-black font-semibold">
                            {hayEgreso ? celda.data.egreso : "-:-"}
                          </span>
                          {hayEgreso && celda.data?.esSiguienteDia && (
                            <span className="text-[7px] md:text-[8px] bg-cyan-600 print:bg-cyan-100 text-white print:text-cyan-800 px-1 py-0.5 rounded font-sans font-bold leading-none">
                              +1 D
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-3 mb-4 shrink-0">
            <div className="flex flex-col sm:flex-row flex-wrap items-center gap-2 w-full lg:w-auto">
              <div className="relative w-full sm:w-64 shrink-0">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  type="text"
                  placeholder="Buscar por operario..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="w-full bg-[#0A0A0A] border border-zinc-800 text-zinc-200 text-xs pl-9 pr-3 py-2.5 rounded focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div className="flex items-center justify-between w-full sm:w-auto gap-2 bg-[#0A0A0A] border border-zinc-800 rounded px-3 py-2 shrink-0">
                <span className="text-[9px] md:text-[10px] text-zinc-500 font-bold uppercase tracking-widest hidden sm:block">
                  Desde:
                </span>
                <input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  className="bg-transparent border-none text-zinc-200 text-xs focus:outline-none [color-scheme:dark] w-full sm:w-auto"
                />
                <span className="text-[9px] md:text-[10px] text-zinc-500 font-bold uppercase tracking-widest border-l border-zinc-800 pl-2 ml-1 hidden sm:block">
                  Hasta:
                </span>
                <input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  className="bg-transparent border-none text-zinc-200 text-xs focus:outline-none [color-scheme:dark] w-full sm:w-auto"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end shrink-0">
              <div className="flex flex-1 sm:flex-none bg-[#0A0A0A] border border-zinc-800 rounded p-1">
                {["TODOS", "ENTRADA", "SALIDA"].map((tipo) => (
                  <button
                    key={tipo}
                    onClick={() => setFiltroTipo(tipo)}
                    className={`flex-1 sm:flex-none px-2 sm:px-4 py-1.5 text-[9px] md:text-[10px] font-bold uppercase tracking-widest rounded transition-colors cursor-pointer ${
                      filtroTipo === tipo
                        ? "bg-[#FF5A00] text-white"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {tipo}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setVista("calendario")}
                className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-[#FF5A00]/10 border border-[#FF5A00] hover:bg-[#FF5A00] text-white text-[9px] md:text-[10px] font-bold uppercase tracking-widest rounded transition-all cursor-pointer shadow-md shadow-[#FF5A00]/20 shrink-0"
              >
                <CalendarIcon size={14} />
                <span className="hidden sm:inline">CALENDARIO</span>
                <span className="sm:hidden">CALEND.</span>
              </button>
            </div>
          </div>

          <div
            ref={tableContainerRef}
            className="flex-1 min-h-0 border border-zinc-800/80 rounded bg-[#0A0A0A] flex flex-col overflow-hidden relative"
          >
            <div className="w-full h-full overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#050505] border-b border-zinc-800 sticky top-0 z-10 select-none">
                  <tr>
                    <th
                      onClick={() => alternarOrden("fecha_hora")}
                      className="py-3 px-3 sm:px-5 text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-widest cursor-pointer hover:text-white transition-colors h-[40px]"
                    >
                      <div className="flex items-center gap-2">
                        <span>Fecha</span>
                        {renderIconoOrden("fecha_hora")}
                      </div>
                    </th>
                    <th
                      onClick={() => alternarOrden("hora")}
                      className="py-3 px-3 sm:px-5 text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-widest cursor-pointer hover:text-white transition-colors h-[40px]"
                    >
                      <div className="flex items-center gap-2">
                        <span>Hora</span>
                        {renderIconoOrden("hora")}
                      </div>
                    </th>
                    <th
                      onClick={() => alternarOrden("nombre")}
                      className="py-3 px-3 sm:px-5 text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-widest cursor-pointer hover:text-white transition-colors h-[40px]"
                    >
                      <div className="flex items-center gap-2">
                        <span>Operario</span>
                        {renderIconoOrden("nombre")}
                      </div>
                    </th>
                    <th className="py-3 px-3 sm:px-5 text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-widest h-[40px]">
                      Categoría Asignada
                    </th>
                    <th
                      onClick={() => alternarOrden("tipo")}
                      className="py-3 px-3 sm:px-5 text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-widest cursor-pointer hover:text-white transition-colors text-center h-[40px]"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span>Evento</span>
                        {renderIconoOrden("tipo")}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {loading && fichadas.length === 0 ? (
                    <tr>
                      <td
                        colSpan="5"
                        className="py-12 text-center text-xs font-bold text-zinc-500 tracking-wider"
                      >
                        CARGANDO...
                      </td>
                    </tr>
                  ) : fichadasPaginadas.length === 0 ? (
                    <tr>
                      <td
                        colSpan="5"
                        className="py-12 text-center text-xs font-bold text-zinc-500 tracking-wider uppercase"
                      >
                        No se encontraron fichadas
                      </td>
                    </tr>
                  ) : (
                    fichadasPaginadas.map((f) => {
                      const { fechaVisual, horaVisual } = formatearFechaHora(
                        f.fecha_hora,
                      );
                      const esEntrada = f.tipo === "ENTRADA";
                      const codigoCat = asignaciones[f.nombre];
                      const catObj = categoriasUOYEP.find(
                        (c) => c.codigo === codigoCat,
                      );

                      return (
                        <tr
                          key={f.rec_no}
                          className="hover:bg-zinc-900/50 transition-colors h-[49px]"
                        >
                          <td className="py-0 px-3 sm:px-5 text-[11px] sm:text-xs text-zinc-400 tracking-wide">
                            {fechaVisual}
                          </td>
                          <td className="py-0 px-3 sm:px-5 text-[11px] sm:text-xs text-white font-bold tracking-wider font-mono">
                            {horaVisual}
                          </td>
                          <td className="py-0 px-3 sm:px-5 text-[11px] sm:text-xs text-zinc-200 font-bold uppercase tracking-tight truncate max-w-[100px] sm:max-w-none">
                            {f.nombre}
                          </td>
                          <td className="py-0 px-3 sm:px-5 text-[10px] text-[#FF5A00] font-mono uppercase font-bold">
                            {catObj ? catObj.nombre : "-"}
                          </td>
                          <td className="py-0 px-3 sm:px-5 text-center">
                            <span
                              className={`inline-block px-2 sm:px-3 py-1 rounded text-[8px] sm:text-[9px] font-black uppercase tracking-widest border ${
                                esEntrada
                                  ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                                  : "border-rose-500/50 text-rose-400 bg-rose-500/10"
                              }`}
                            >
                              {f.tipo}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3 shrink-0">
            <span className="text-[9px] sm:text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
              PÁGINA {paginaActual} DE {totalPaginas}{" "}
              <span className="lowercase hidden sm:inline">
                ({fichadasOrdenadas.length} registros)
              </span>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                disabled={paginaActual === 1}
                className="p-1 sm:p-1.5 border border-zinc-800 rounded hover:bg-zinc-800 text-zinc-400 disabled:opacity-30 transition-colors cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() =>
                  setPaginaActual((p) => Math.min(totalPaginas, p + 1))
                }
                disabled={paginaActual === totalPaginas}
                className="p-1 sm:p-1.5 border border-zinc-800 rounded hover:bg-zinc-800 text-zinc-400 disabled:opacity-30 transition-colors cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ASIGNACIÓN DE CATEGORÍAS */}
      {modalCategoriasAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#0D0D0D] border border-zinc-800 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden text-zinc-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-[#121212]">
              <div className="flex items-center gap-2.5">
                <Tag size={18} className="text-[#FF5A00]" />
                <h3 className="text-xs font-black tracking-widest uppercase text-white">
                  Asignar Categorías a Operarios (UOYEP)
                </h3>
              </div>
              <button
                onClick={() => setModalCategoriasAbierto(false)}
                className="text-zinc-500 hover:text-white transition-colors p-1 rounded hover:bg-zinc-800 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto custom-scrollbar max-h-[60vh] space-y-4">
              <div className="bg-[#121212] p-3 rounded-lg border border-zinc-800 text-[11px] text-zinc-400">
                Asigná a cada operario su categoría según el CCT UOYEP. Los
                valores por hora se actualizan de forma automática según el
                período seleccionado en la cabecera.
              </div>

              <div className="divide-y divide-zinc-800/80 border border-zinc-800 rounded-lg overflow-hidden bg-[#101010]">
                {listaOperarios.map((op) => {
                  const categoriaAsignada = asignaciones[op.nombre] || "";

                  return (
                    <div
                      key={op.nombre}
                      className="p-3 flex items-center justify-between gap-4 hover:bg-zinc-800/30 transition-colors"
                    >
                      <span className="text-xs font-bold text-white uppercase tracking-wider truncate flex-1">
                        {op.nombre}
                      </span>

                      <div className="w-64 shrink-0">
                        <select
                          value={categoriaAsignada}
                          onChange={(e) =>
                            cambiarAsignacion(op.nombre, e.target.value)
                          }
                          className="w-full bg-[#18181b] border border-zinc-700 text-xs font-bold text-white rounded p-2 focus:border-[#FF5A00] outline-none cursor-pointer uppercase"
                        >
                          <option value="">-- Sin categoría --</option>
                          {categoriasUOYEP.map((c) => {
                            const val = mapaValoresPeriodoActivo[c.codigo] || 0;
                            return (
                              <option key={c.codigo} value={c.codigo}>
                                {c.nombre} (${val.toLocaleString("es-AR")})
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-zinc-800 bg-[#121212] flex justify-end">
              <button
                onClick={() => setModalCategoriasAbierto(false)}
                className="bg-white hover:bg-zinc-200 text-black font-bold uppercase tracking-widest text-xs px-5 py-2.5 rounded transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENDERIZADO IMPRESIÓN POR LOTE */}
      {imprimiendoLote && (
        <div className="hidden print:block w-full">
          {operariosSeleccionadosModal.map((nombreOp, idx) => {
            const mapaOp = calcularDatosCalendario(
              nombreOp,
              fichadasSinRebotes,
            );
            const { celdasMes: celdasOp } = generarCeldasMes(
              mesExportMulti.anio,
              mesExportMulti.mes,
              mapaOp,
            );

            return (
              <div
                key={nombreOp}
                className={`hoja-operario-impresion w-full bg-white print:p-2 mb-8 print:mb-0 ${
                  idx === 0 ? "print:pt-8" : "print:pt-1"
                }`}
              >
                <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-300">
                  <h2 className="text-sm font-black tracking-widest text-black uppercase flex items-center gap-2">
                    <span>
                      {NOMBRES_MESES[mesExportMulti.mes]} {mesExportMulti.anio}
                    </span>
                    <span className="text-[#FF5A00]">({nombreOp})</span>
                  </h2>
                </div>

                <div className="grid grid-cols-7 gap-2 pb-2">
                  {["LU", "MA", "MI", "JU", "VI", "SÁ", "DO"].map((dia) => (
                    <div
                      key={dia}
                      className="text-center text-[10px] font-bold text-zinc-800 uppercase tracking-widest"
                    >
                      {dia}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {celdasOp.map((celda, cIdx) => {
                    if (!celda) {
                      return (
                        <div
                          key={`empty-lote-${nombreOp}-${cIdx}`}
                          className="rounded border border-transparent min-h-[88px]"
                        />
                      );
                    }

                    const hayIngreso = !!celda.data?.ingreso;
                    const hayEgreso = !!celda.data?.egreso;
                    const tieneDatos = hayIngreso || hayEgreso;
                    const esNoche = celda.data?.esNoche;

                    if (!tieneDatos) {
                      return (
                        <div
                          key={celda.fechaISO}
                          className="rounded border border-gray-200 bg-gray-50/60 flex items-center justify-center min-h-[88px]"
                        >
                          <span className="text-sm font-bold text-gray-400">
                            {celda.numero}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={celda.fechaISO}
                        className="rounded border border-gray-300 bg-white p-2.5 flex flex-col justify-between min-h-[88px]"
                      >
                        <div className="flex items-center justify-between shrink-0 mb-2">
                          <span className="text-xs font-black text-black">
                            {celda.numero}
                          </span>
                          {esNoche ? (
                            <Moon size={14} className="text-cyan-600" />
                          ) : (
                            <Sun size={14} className="text-amber-500" />
                          )}
                        </div>

                        <div className="flex flex-col gap-1.5 min-h-0 justify-center font-mono">
                          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-300 px-2 py-1 rounded text-[10px]">
                            <span className="font-bold text-emerald-700 tracking-wider">
                              ENT
                            </span>
                            <span className="text-black font-semibold">
                              {hayIngreso ? celda.data.ingreso : "-:-"}
                            </span>
                          </div>

                          <div className="flex items-center justify-between bg-rose-50 border border-rose-300 px-2 py-1 rounded text-[10px]">
                            <span className="font-bold text-rose-700 tracking-wider">
                              SAL
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="text-black font-semibold">
                                {hayEgreso ? celda.data.egreso : "-:-"}
                              </span>
                              {hayEgreso && celda.data?.esSiguienteDia && (
                                <span className="text-[8px] bg-cyan-100 text-cyan-800 px-1 py-0.5 rounded font-sans font-bold leading-none">
                                  +1 D
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: EXPORTAR VARIOS OPERARIOS */}
      {modalVariosAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#0D0D0D] border border-zinc-800 rounded-xl w-full max-w-lg shadow-[0_0_50px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden text-zinc-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-[#121212]">
              <div className="flex items-center gap-2.5">
                <Users size={18} className="text-[#FF5A00]" />
                <h3 className="text-xs font-black tracking-widest uppercase text-white">
                  Exportar Varios Operarios
                </h3>
              </div>
              <button
                onClick={() => setModalVariosAbierto(false)}
                className="text-zinc-500 hover:text-white transition-colors p-1 rounded hover:bg-zinc-800 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1.5">
                  Mes a Exportar
                </label>
                <select
                  value={`${mesExportMulti.anio}-${mesExportMulti.mes}`}
                  onChange={(e) => {
                    const [anio, mes] = e.target.value.split("-").map(Number);
                    setMesExportMulti({ anio, mes });
                  }}
                  className="w-full bg-[#141414] border border-zinc-800 text-xs font-bold text-white rounded px-3 py-2.5 focus:border-[#FF5A00] outline-none cursor-pointer uppercase tracking-wider"
                >
                  {mesesDisponibles.map((item) => (
                    <option
                      key={`${item.anio}-${item.mes}`}
                      value={`${item.anio}-${item.mes}`}
                    >
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    Operarios Seleccionados (
                    {operariosSeleccionadosModal.length}/{listaOperarios.length}
                    )
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setOperariosSeleccionadosModal(
                          listaOperarios.map((o) => o.nombre),
                        )
                      }
                      className="text-[9px] font-bold text-[#FF5A00] hover:underline uppercase tracking-wider cursor-pointer"
                    >
                      Todos
                    </button>
                    <span className="text-zinc-700">|</span>
                    <button
                      type="button"
                      onClick={() => setOperariosSeleccionadosModal([])}
                      className="text-[9px] font-bold text-zinc-500 hover:text-zinc-300 uppercase tracking-wider cursor-pointer"
                    >
                      Ninguno
                    </button>
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto custom-scrollbar border border-zinc-800 rounded bg-[#101010] p-2 divide-y divide-zinc-900">
                  {listaOperarios.map((op) => {
                    const checked = operariosSeleccionadosModal.includes(
                      op.nombre,
                    );
                    return (
                      <label
                        key={op.nombre}
                        className="flex items-center gap-3 py-2 px-2 hover:bg-zinc-800/40 rounded cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setOperariosSeleccionadosModal((prev) => [
                                ...prev,
                                op.nombre,
                              ]);
                            } else {
                              setOperariosSeleccionadosModal((prev) =>
                                prev.filter((n) => n !== op.nombre),
                              );
                            }
                          }}
                          className="accent-[#FF5A00] w-4 h-4 rounded cursor-pointer"
                        />
                        <span className="text-xs font-bold text-zinc-300 uppercase tracking-wide">
                          {op.nombre}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-zinc-800 bg-[#121212]">
              <button
                onClick={() => setModalVariosAbierto(false)}
                className="px-4 py-2 text-[10px] font-bold text-zinc-400 hover:text-white uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                disabled={operariosSeleccionadosModal.length === 0}
                onClick={ejecutarExportacionLote}
                className="bg-[#FFD700] hover:bg-white text-black font-bold uppercase tracking-widest text-[10px] px-4 py-2 rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                <Download size={13} />
                <span>
                  Exportar ({operariosSeleccionadosModal.length}) Páginas
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
