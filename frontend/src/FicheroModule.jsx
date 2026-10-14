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
  ArrowUp,
  ArrowDown,
  Calendar as CalendarIcon,
  Table as TableIcon,
  Sun,
  Moon,
  Users,
} from "lucide-react";

const BACKEND_URL = "http://66.97.34.163:3001";

export default function FicheroModule() {
  const [fichadas, setFichadas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

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

  // Estado del calendario
  const [operarioSeleccionado, setOperarioSeleccionado] = useState(null);
  const [mesCalendario] = useState({ anio: 2026, mes: 9 }); // Octubre
  const [mostrarOperariosMobile, setMostrarOperariosMobile] = useState(false); // Toggle en celular

  

  // 1. CARGA DE DATOS DESDE BASE DE DATOS FEROZO
  const cargarFichadas = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setIsSyncing(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/fichero/historial`);
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
  }, [cargarFichadas]);

  // Formateo estricto de fecha y hora local (24hs)
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

  // 2. CÁLCULO DINÁMICO DE FILAS (SIN SCROLL INTERNO EN TABLA)
  useEffect(() => {
    if (vista !== "tabla" || !tableContainerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const alturaDisponible = entry.contentRect.height;
        const alturaCabecera = 40; // px aproximados del <thead>
        const alturaFila = 49; // px aproximados de cada <tr> con padding

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

  // Si cambia la cantidad de items, asegurarnos de no quedar en una página vacía
  useEffect(() => {
    setPaginaActual(1);
  }, [busqueda, filtroTipo, fechaDesde, fechaHasta, itemsPorPagina]);

  // 3. FILTRO ANTI-REBOTE (60s)
  const fichadasSinRebotes = useMemo(() => {
    const ordenadas = [...fichadas].sort(
      (a, b) =>
        new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime(),
    );

    const filtradas = [];
    const ultimaMarca = new Map();

    for (const f of ordenadas) {
      const tActual = new Date(f.fecha_hora).getTime();
      const clave = `${f.empleado_id || f.nombre}_${f.tipo}`;
      const tPrevio = ultimaMarca.get(clave);

      if (tPrevio && tActual - tPrevio < 60000) continue;

      ultimaMarca.set(clave, tActual);
      filtradas.push(f);
    }
    return filtradas;
  }, [fichadas]);

  // Lista de operarios
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

  // 4. ESTRUCTURACIÓN DE HORARIOS PARA EL CALENDARIO
  const datosCalendarioOperario = useMemo(() => {
    if (!operarioSeleccionado) return {};

    const fichadasDelOperario = fichadasSinRebotes
      .filter((f) => f.nombre === operarioSeleccionado)
      .sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));

    const mapaDias = {};

    fichadasDelOperario.forEach((f) => {
      const { fechaISO, horaVisual, horaNum } = formatearFechaHora(
        f.fecha_hora,
      );

      if (!mapaDias[fechaISO]) {
        mapaDias[fechaISO] = { ingreso: null, egreso: null, esNoche: false };
      }

      if (f.tipo === "ENTRADA" && !mapaDias[fechaISO].ingreso) {
        mapaDias[fechaISO].ingreso = horaVisual.slice(0, 5);
        if (horaNum >= 19 || horaNum < 6) mapaDias[fechaISO].esNoche = true;
      } else if (f.tipo === "SALIDA") {
        mapaDias[fechaISO].egreso = horaVisual.slice(0, 5);
      }
    });

    return mapaDias;
  }, [operarioSeleccionado, fichadasSinRebotes]);

  // 5. GRILLA MENSUAL SIN SCROLL EXTERNO
  const { celdasMes, cantidadFilas } = useMemo(() => {
    const { anio, mes } = mesCalendario;
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
        data: datosCalendarioOperario[fechaISO] || null,
      });
    }

    while (celdas.length % 7 !== 0) celdas.push(null);

    return { celdasMes: celdas, cantidadFilas: celdas.length / 7 };
  }, [mesCalendario, datosCalendarioOperario]);

  // 6. FILTRADO Y ORDENAMIENTO EN TABLA
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
    <div className="flex flex-col h-full bg-[#050505] text-zinc-100 p-3 sm:p-4 md:p-6 select-none font-sans overflow-hidden">
      {/* HEADER SUPERIOR */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4 shrink-0">
        <div>
          <h1 className="text-xl md:text-3xl font-black italic tracking-tighter uppercase text-white leading-none">
            CONTROL DE ASISTENCIA
          </h1>
          <p className="text-[#FF5A00] font-bold text-[10px] md:text-[11px] tracking-widest uppercase mt-1">
            ROL DE VISUALIZACIÓN: ADMIN
          </p>
        </div>
        <button
          onClick={() => cargarFichadas(false)}
          disabled={isSyncing}
          className="bg-[#FFD700] hover:bg-white text-black font-bold uppercase tracking-widest text-[10px] w-full sm:w-auto px-4 py-2.5 rounded flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
          {isSyncing ? "ACTUALIZANDO..." : "ACTUALIZAR REGISTROS"}
        </button>
      </div>

      {vista === "calendario" ? (
        /* ======================================================== */
        /* VISTA CALENDARIO */
        /* ======================================================== */
        <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0 overflow-hidden">
          {/* CONTROL MOBILE: Toggle Operarios y Botón Volver */}
          <div className="flex md:hidden gap-2 shrink-0">
            <button
              onClick={() => setVista("tabla")}
              className="flex-1 bg-[#121212] border border-zinc-800 text-zinc-300 py-2.5 rounded text-[10px] font-bold tracking-widest flex items-center justify-center gap-2 cursor-pointer uppercase"
            >
              <TableIcon size={14} />
              TABLA
            </button>
            <button
              onClick={() => setMostrarOperariosMobile(!mostrarOperariosMobile)}
              className="flex-1 bg-[#FF5A00]/10 border border-[#FF5A00] text-[#FF5A00] py-2.5 rounded text-[10px] font-bold tracking-widest flex items-center justify-center gap-2 cursor-pointer uppercase"
            >
              <Users size={14} />
              {mostrarOperariosMobile ? "OCULTAR OP." : "VER OP."}
            </button>
          </div>

          {/* BARRA LATERAL OPERARIOS (Oculta en mobile salvo toggle) */}
          <div
            className={`${mostrarOperariosMobile ? "flex" : "hidden"} md:flex w-full md:w-60 flex-col gap-3 min-h-0 shrink-0`}
          >
            <button
              onClick={() => setVista("tabla")}
              className="hidden md:flex w-full bg-[#121212] hover:bg-[#1a1a1a] border border-zinc-800 text-zinc-300 py-2.5 rounded text-[10px] font-bold tracking-widest items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 uppercase"
            >
              <TableIcon size={14} />
              VOLVER A TABLA
            </button>

            <div className="flex-1 bg-[#0A0A0A] rounded-lg p-3 flex flex-col min-h-[150px] md:min-h-0 overflow-hidden border border-zinc-850">
              <span className="text-zinc-500 font-bold text-[10px] tracking-wider uppercase mb-2 block shrink-0">
                Operarios
              </span>
              <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {listaOperarios.map((op) => {
                  const activo = operarioSeleccionado === op.nombre;
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
                      <span className="text-[11px] font-bold tracking-wider uppercase truncate">
                        {op.nombre}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* CUADRÍCULA DE CALENDARIO COMPLETO */}
          <div className="flex-1 bg-[#0A0A0A] rounded-lg border border-zinc-850 p-3 md:p-4 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-zinc-900 shrink-0">
              <h2 className="text-xs md:text-sm font-black tracking-widest text-white uppercase">
                OCTUBRE 2026{" "}
                <span className="text-[#FF5A00] ml-2 hidden md:inline">
                  ({operarioSeleccionado})
                </span>
              </h2>
              <div className="flex items-center gap-1.5">
                <button className="w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded border border-zinc-800 bg-[#121212] hover:bg-zinc-800 text-zinc-400 transition-colors cursor-pointer">
                  <ChevronLeft size={14} />
                </button>
                <button className="w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded border border-zinc-800 bg-[#121212] hover:bg-zinc-800 text-zinc-400 transition-colors cursor-pointer">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 md:gap-2 pb-2 shrink-0">
              {["LU", "MA", "MI", "JU", "VI", "SÁ", "DO"].map((dia) => (
                <div
                  key={dia}
                  className="text-center text-[9px] md:text-[10px] font-bold text-zinc-500 uppercase tracking-widest"
                >
                  {dia}
                </div>
              ))}
            </div>

            {/* Grilla flexible. En desktop respeta la proporción 100%, en mobile hace scroll interno si es muy chica */}
            <div
              className="flex-1 min-h-0 grid grid-cols-7 gap-1 md:gap-2 overflow-y-auto custom-scrollbar md:overflow-hidden"
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
                      className="rounded border border-transparent min-h-[60px] md:min-h-0"
                    />
                  );
                }

                const tieneDatos = !!celda.data;
                const hayIngreso = !!celda.data?.ingreso;
                const hayEgreso = !!celda.data?.egreso;
                const esNoche = celda.data?.esNoche;

                if (!tieneDatos) {
                  return (
                    <div
                      key={celda.fechaISO}
                      className="rounded border border-zinc-900/40 bg-[#070707] flex items-center justify-center min-h-[60px] md:min-h-0"
                    >
                      <span className="text-[10px] md:text-xs font-bold text-zinc-700">
                        {celda.numero}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={celda.fechaISO}
                    className="rounded border border-zinc-750 bg-[#111111] hover:border-[#FF5A00] transition-colors p-1 md:p-2 flex flex-col justify-between min-h-[60px] md:min-h-0 overflow-hidden shadow-sm"
                  >
                    <div className="flex items-center justify-between shrink-0 mb-1 md:mb-0">
                      <span className="text-[10px] md:text-xs font-black text-white">
                        {celda.numero}
                      </span>
                      {esNoche ? (
                        <Moon
                          size={10}
                          className="text-cyan-400 hidden sm:block"
                        />
                      ) : (
                        <Sun
                          size={10}
                          className="text-amber-400 hidden sm:block"
                        />
                      )}
                    </div>

                    <div className="flex flex-col gap-0.5 md:gap-1 min-h-0 justify-center">
                      <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 px-1 py-0.5 rounded text-[8px] md:text-[10px]">
                        <span className="font-bold text-emerald-400 tracking-wider hidden sm:block">
                          ENT
                        </span>
                        <span className="font-bold text-emerald-400 tracking-wider sm:hidden">
                          I:
                        </span>
                        <span className="  text-white font-semibold">
                          {hayIngreso ? celda.data.ingreso : "-:-"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between bg-rose-500/10 border border-rose-500/20 px-1 py-0.5 rounded text-[8px] md:text-[10px]">
                        <span className="font-bold text-rose-400 tracking-wider hidden sm:block">
                          SAL
                        </span>
                        <span className="font-bold text-rose-400 tracking-wider sm:hidden">
                          S:
                        </span>
                        <span className="  text-white font-semibold">
                          {hayEgreso ? celda.data.egreso : "-:-"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* ======================================================== */
        /* VISTA TABLA PLANA INDUSTRIAL CON AUTO-RESIZE */
        /* ======================================================== */
        <div className="flex-1 flex flex-col min-h-0">
          {/* BARRA DE FILTROS RESPONSIVA */}
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

          {/* CONTENEDOR DE LA TABLA CON AUTO-RESIZE */}
          <div
            ref={tableContainerRef}
            className="flex-1 min-h-0 border border-zinc-800/80 rounded bg-[#0A0A0A] flex flex-col overflow-hidden relative"
          >
            {/* Ocultamos la barra de scroll y dejamos que ResizeObserver fije los items */}
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
                        colSpan="4"
                        className="py-12 text-center text-xs font-bold text-zinc-500 tracking-wider"
                      >
                        CARGANDO...
                      </td>
                    </tr>
                  ) : fichadasPaginadas.length === 0 ? (
                    <tr>
                      <td
                        colSpan="4"
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

                      return (
                        <tr
                          key={f.rec_no}
                          className="hover:bg-zinc-900/50 transition-colors h-[49px]"
                        >
                          <td className="py-0 px-3 sm:px-5 text-[11px] sm:text-xs text-zinc-400   tracking-wide">
                            {fechaVisual}
                          </td>
                          <td className="py-0 px-3 sm:px-5 text-[11px] sm:text-xs text-white   font-bold tracking-wider">
                            {horaVisual}
                          </td>
                          <td className="py-0 px-3 sm:px-5 text-[11px] sm:text-xs text-zinc-200 font-bold uppercase tracking-tight truncate max-w-[100px] sm:max-w-none">
                            {f.nombre}
                          </td>
                          <td className="py-0 px-3 sm:px-5 text-center">
                            <span
                              className={`inline-block px-2 sm:px-3 py-1 rounded text-[8px] sm:text-[9px] font-black uppercase tracking-widest border ${esEntrada ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10" : "border-rose-500/50 text-rose-400 bg-rose-500/10"}`}
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

          {/* FOOTER PAGINACIÓN FIJO */}
          <div className="flex items-center justify-between mt-3 shrink-0">
            <span className="text-[9px] sm:text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
              PÁGINA {paginaActual} DE {totalPaginas}{" "}
              <span className="lowercase hidden sm:inline">
                ({fichadasOrdenadas.length} registros sin duplicados)
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
    </div>
  );
}
