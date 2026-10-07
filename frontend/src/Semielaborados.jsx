import { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  CheckCircle2,
  Plus,
  Layers,
  Box,
  Sparkle,
} from "lucide-react";

export default function Semielaborados() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [search, setSearch] = useState("");

  // PESTAÑAS DE DEPOSITOS
  const [activeTab, setActiveTab] = useState("GENERAL");

  // CONFIGURACIÓN DE MESES DE HISTORIAL (Con persistencia en localStorage)
  const [mesesHistorial, setMesesHistorial] = useState(() => {
    const saved = localStorage.getItem("conoflex_meses_historial");
    return saved ? parseInt(saved, 10) : 3; // 3 meses por defecto
  });

  // PREVISUALIZACIÓN Y AUDITORÍA SHEETS
  const [previewData, setPreviewData] = useState(null);
  const [includeNuevos, setIncludeNuevos] = useState(true);
  const [includeModificados, setIncludeModificados] = useState(true);
  const [selectedNuevos, setSelectedNuevos] = useState([]);
  const [selectedModificados, setSelectedModificados] = useState([]);

  // ORDENAMIENTO
  const [sortColumn, setSortColumn] = useState("codigo");
  const [sortDirection, setSortDirection] = useState("asc");

  // CÁLCULO DINÁMICO DE FILAS EXACTAS
  const tableContainerRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // MODAL DE FICHA
  const [detailItem, setDetailItem] = useState(null);

  // AJUSTE DE FILAS EN TIEMPO REAL (48px exactos)
  useEffect(() => {
    const updatePageSize = () => {
      if (!tableContainerRef.current) return;
      const containerHeight = tableContainerRef.current.clientHeight;
      const headerHeight = 48;
      const rowHeight = 48;
      const availableHeight = containerHeight - headerHeight;
      const calculatedCount = Math.floor(availableHeight / rowHeight);

      if (calculatedCount > 0 && calculatedCount !== itemsPerPage) {
        setItemsPerPage(calculatedCount);
      }
    };

    updatePageSize();
    const observer = new ResizeObserver(() => updatePageSize());
    if (tableContainerRef.current) observer.observe(tableContainerRef.current);
    return () => observer.disconnect();
  }, [itemsPerPage]);

  // FETCH ITEMS CON PARÁMETRO DE MESES
  const fetchItems = async (meses) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/semielaborados?meses=${meses}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (err) {
      console.error("Error al cargar semielaborados:", err);
    } finally {
      setLoading(false);
    }
  };

  // EFECTO PARA GUARDAR EN LOCALSTORAGE Y RE-CARGAR DATOS AL CAMBIAR LOS MESES
  useEffect(() => {
    localStorage.setItem("conoflex_meses_historial", mesesHistorial.toString());
    fetchItems(mesesHistorial);
  }, [mesesHistorial]);

  const handleStartSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/semielaborados/previsualizar-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        const data = await res.json();
        setPreviewData(data);
        setIncludeNuevos(true);
        setIncludeModificados(true);
        setSelectedNuevos(data.nuevos.map((n) => n.codigo));
        setSelectedModificados(data.modificados.map((m) => m.id));
      }
    } catch (err) {
      alert("Error al conectar con el servidor.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleApplySync = async () => {
    if (!previewData) return;

    const finalNuevos = includeNuevos
      ? previewData.nuevos.filter((n) => selectedNuevos.includes(n.codigo))
      : [];

    const finalModificados = includeModificados
      ? previewData.modificados.filter((m) =>
          selectedModificados.includes(m.id),
        )
      : [];

    setIsSyncing(true);
    try {
      const res = await fetch("/api/semielaborados/aplicar-sincronizacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nuevos: finalNuevos,
          modificados: finalModificados,
        }),
      });

      if (res.ok) {
        setPreviewData(null);
        fetchItems(mesesHistorial);
      }
    } catch (err) {
      alert("Error al aplicar la sincronización.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSort = (columnKey) => {
    if (sortColumn === columnKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(columnKey);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  // SUMA DE STOCK DINÁMICA SEGÚN PESTAÑA
  const itemsCalculados = useMemo(() => {
    return items.map((item) => {
      let stockMostrado = 0;

      if (activeTab === "GENERAL") {
        stockMostrado =
          (item.stock_33 || 0) +
          (item.stock_26 || 0) +
          (item.stock_ayolas || 0) +
          (item.stock_37 || 0);
      } else if (activeTab === "33") stockMostrado = item.stock_33 || 0;
      else if (activeTab === "26") stockMostrado = item.stock_26 || 0;
      else if (activeTab === "AYOLAS") stockMostrado = item.stock_ayolas || 0;
      else if (activeTab === "37") stockMostrado = item.stock_37 || 0;

      return { ...item, stockMostrado };
    });
  }, [items, activeTab]);

  const processedItems = useMemo(() => {
    let result = itemsCalculados.filter(
      (item) =>
        item.codigo.toLowerCase().includes(search.toLowerCase()) ||
        item.nombre.toLowerCase().includes(search.toLowerCase()),
    );

    if (sortColumn) {
      result.sort((a, b) => {
        let aVal = a[sortColumn];
        let bVal = b[sortColumn];

        if (sortColumn === "stockMostrado") {
          aVal = a.stockMostrado;
          bVal = b.stockMostrado;
        }

        if (aVal == null) aVal = "";
        if (bVal == null) bVal = "";

        if (typeof aVal === "string") aVal = aVal.toLowerCase();
        if (typeof bVal === "string") bVal = bVal.toLowerCase();

        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [itemsCalculados, search, sortColumn, sortDirection]);

  const totalPages = Math.ceil(processedItems.length / itemsPerPage) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return processedItems.slice(start, start + itemsPerPage);
  }, [processedItems, currentPage, itemsPerPage]);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-black font-sans text-zinc-200 overflow-hidden relative selection:bg-[#FF5A00]/30">
      {/* 1. HEADER HERO */}
      <div className="border-b border-zinc-800/50 p-6 md:p-10 flex flex-col md:flex-row md:items-end justify-between gap-6 shrink-0 bg-[#050505] relative overflow-hidden">
        <div className="z-10">
          <h1 className="text-4xl md:text-5xl font-extrabold italic tracking-tighter text-white uppercase leading-none">
            Semielaborados
          </h1>
          <p className="text-zinc-500 text-sm mt-2 max-w-md uppercase tracking-widest font-bold flex items-center gap-2">
            INVENTARIO DE PROCESOS{" "}
            <span className="bg-[#FF5A00]/10 text-[#FF5A00] border border-[#FF5A00]/20 px-2 py-0.5 rounded-none text-[10px]">
              4 DEPÓSITOS
            </span>
          </p>
        </div>

        <button
          onClick={handleStartSync}
          disabled={isSyncing}
          className="flex items-center justify-between gap-4 px-6 py-3 font-bold text-xs uppercase tracking-widest transition-all z-10 w-full md:w-auto bg-[#FFD700] hover:bg-white text-black active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw
            size={16}
            className={`${isSyncing ? "animate-spin" : ""}`}
            strokeWidth={3}
          />
          SINCRONIZAR SHEETS
        </button>
      </div>

      {/* 2. PANEL DE FILTROS & BÚSQUEDA */}
      <div className="px-4 py-4 md:px-8 border-b border-zinc-800/50 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0 bg-black relative z-20">
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto flex-1">
          {/* BUSCADOR */}
          <div className="relative w-full sm:w-80">
            <Search
              size={14}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600"
            />
            <input
              type="text"
              placeholder="Buscar por código o artículo..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-transparent border border-zinc-800 focus:border-[#FF5A00] text-white pl-10 pr-4 py-2.5 text-xs transition-colors outline-none"
            />
          </div>

          {/* TABS DE DEPÓSITOS */}
          <div className="flex items-center gap-0 w-full sm:w-auto overflow-x-auto border border-zinc-800 bg-[#050505]">
            {["GENERAL", "33", "26", "AYOLAS", "37"].map((dep) => {
              const isSelected = activeTab === dep;
              return (
                <button
                  key={dep}
                  onClick={() => {
                    setActiveTab(dep);
                    setCurrentPage(1);
                  }}
                  className={`px-4 py-2.5 text-xs font-bold transition-all cursor-pointer whitespace-nowrap uppercase tracking-widest border-r border-zinc-800 last:border-r-0 ${
                    isSelected
                      ? "bg-[#FF5A00] text-black"
                      : "text-zinc-500 hover:text-white hover:bg-zinc-900"
                  }`}
                >
                  {dep === "GENERAL" ? "GENERAL" : `DEP. ${dep}`}
                </button>
              );
            })}
          </div>

          {/* SELECTOR DE MESES HISTORIAL PARA DEMANDA */}
          <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 bg-[#050505] border border-zinc-800 px-4 py-1.5 shrink-0 uppercase w-full sm:w-auto overflow-x-auto">
            <span className="text-zinc-500 font-bold tracking-widest mr-1">
              HISTORIAL DEMANDA:
            </span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5, 6].map((m) => (
                <button
                  key={m}
                  onClick={() => setMesesHistorial(m)}
                  className={`w-6 h-6 flex items-center justify-center font-bold transition-colors cursor-pointer ${
                    mesesHistorial === m
                      ? "bg-[#FF5A00] text-black"
                      : "bg-black border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <span className="text-zinc-600 ml-1 font-bold">MESES</span>
          </div>
        </div>

        {/* CONTADOR TOTAL */}
        <div className="border border-zinc-800 px-4 py-2.5 text-[10px] md:text-xs text-zinc-500 font-mono tracking-widest flex items-center gap-2 bg-[#050505] uppercase font-bold w-full md:w-auto justify-between shrink-0">
          <span className="flex items-center gap-1.5">TOTAL ITEMS:</span>
          <strong className="text-white">
            {processedItems.length} / {items.length}
          </strong>
        </div>
      </div>

      {/* 3. VISTA ESCRITORIO (GRILLA 48px, fondo negro) */}
      <div className="hidden md:flex flex-1 flex-col p-4 md:p-8 bg-black min-h-0 justify-between overflow-hidden">
        <div
          ref={tableContainerRef}
          className="flex-1 min-h-0 w-full flex flex-col justify-start"
        >
          <div className="w-full border border-zinc-800/90 bg-[#030303] flex flex-col overflow-hidden shadow-2xl h-fit">
            {/* CABECERA INDUSTRIAL (h-12) */}
            <div className="grid grid-cols-[180px_1fr_130px_130px_130px] h-12 bg-[#080808] border-b border-zinc-800/90 items-center text-zinc-400 font-mono text-[10px] font-extrabold uppercase tracking-widest shrink-0 select-none">
              <div
                onClick={() => handleSort("codigo")}
                className="px-4 flex items-center justify-between cursor-pointer hover:text-[#FF5A00] transition-colors"
              >
                <span>CÓDIGO</span>
                {sortColumn === "codigo" ? (
                  sortDirection === "asc" ? (
                    <ArrowUp size={12} className="text-[#FF5A00]" />
                  ) : (
                    <ArrowDown size={12} className="text-[#FF5A00]" />
                  )
                ) : (
                  <ArrowUpDown size={10} className="text-zinc-700" />
                )}
              </div>
              <div
                onClick={() => handleSort("nombre")}
                className="px-4 flex items-center justify-between cursor-pointer hover:text-[#FF5A00] transition-colors"
              >
                <span>SEMIELABORADO / ARTÍCULO</span>
                {sortColumn === "nombre" ? (
                  sortDirection === "asc" ? (
                    <ArrowUp size={12} className="text-[#FF5A00]" />
                  ) : (
                    <ArrowDown size={12} className="text-[#FF5A00]" />
                  )
                ) : (
                  <ArrowUpDown size={10} className="text-zinc-700" />
                )}
              </div>
              <div
                onClick={() => handleSort("demanda_mensual")}
                className="px-3 flex items-center justify-center gap-1 cursor-pointer hover:text-[#FF5A00] transition-colors"
              >
                <span>DEMANDA</span>
                {sortColumn === "demanda_mensual" ? (
                  sortDirection === "asc" ? (
                    <ArrowUp size={12} className="text-[#FF5A00]" />
                  ) : (
                    <ArrowDown size={12} className="text-[#FF5A00]" />
                  )
                ) : (
                  <ArrowUpDown size={10} className="text-zinc-700" />
                )}
              </div>
              <div
                onClick={() => handleSort("dias_stock")}
                className="px-3 flex items-center justify-center gap-1 cursor-pointer hover:text-[#FF5A00] transition-colors"
              >
                <span>DÍAS STOCK</span>
                {sortColumn === "dias_stock" ? (
                  sortDirection === "asc" ? (
                    <ArrowUp size={12} className="text-[#FF5A00]" />
                  ) : (
                    <ArrowDown size={12} className="text-[#FF5A00]" />
                  )
                ) : (
                  <ArrowUpDown size={10} className="text-zinc-700" />
                )}
              </div>
              <div
                onClick={() => handleSort("stockMostrado")}
                className="px-4 flex items-center justify-end gap-1 cursor-pointer hover:text-[#FF5A00] transition-colors"
              >
                <span>STOCK</span>
                {sortColumn === "stockMostrado" ? (
                  sortDirection === "asc" ? (
                    <ArrowUp size={12} className="text-[#FF5A00]" />
                  ) : (
                    <ArrowDown size={12} className="text-[#FF5A00]" />
                  )
                ) : (
                  <ArrowUpDown size={10} className="text-zinc-700" />
                )}
              </div>
            </div>

            {/* FILAS DE LA TABLA (Sin divide-y, usando border-b) */}
            <div className="flex flex-col bg-black">
              {loading ? (
                <div className="py-12 flex justify-center text-[#FF5A00]">
                  <RefreshCw className="animate-spin" size={28} />
                </div>
              ) : paginatedItems.length === 0 ? (
                <div className="py-12 text-center text-zinc-600 font-bold uppercase tracking-widest text-xs">
                  No hay semielaborados registrados.
                </div>
              ) : (
                paginatedItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setDetailItem(item)}
                    className="grid grid-cols-[180px_1fr_130px_130px_130px] h-12 items-center border-b border-zinc-900/80 last:border-b-0 hover:bg-[#0a0a0a] transition-colors duration-150 group cursor-pointer text-xs shrink-0"
                  >
                    <div className="px-4 font-mono font-bold truncate">
                      <span className="text-[#FF5A00] bg-[#FF5A00]/10 border border-[#FF5A00]/25 px-2 py-0.5 text-xs group-hover:bg-[#FF5A00] group-hover:text-black transition-colors inline-block max-w-full truncate">
                        {item.codigo}
                      </span>
                    </div>

                    <div className="px-4 text-white font-bold text-xs truncate pr-2">
                      {item.nombre}
                    </div>

                    <div className="px-3 flex justify-center text-zinc-500 text-[11px] font-mono truncate">
                      {item.demanda_mensual
                        ? `${item.demanda_mensual.toLocaleString()} u.`
                        : "--"}
                    </div>

                    <div className="px-3 flex justify-center font-mono text-[11px] whitespace-nowrap">
                      {item.dias_stock !== null ? (
                        <span
                          className={`inline-block font-bold px-2.5 py-0.5 border text-[10px] ${
                            item.dias_stock <= 5
                              ? "text-[#FF0055] bg-[#FF0055]/10 border-[#FF0055]/30"
                              : item.dias_stock <= 15
                                ? "text-[#FFD700] bg-[#FFD700]/10 border-[#FFD700]/30"
                                : "text-zinc-400 bg-zinc-900 border-zinc-700"
                          }`}
                        >
                          {item.dias_stock} días
                        </span>
                      ) : (
                        <span className="text-zinc-600">--</span>
                      )}
                    </div>

                    <div className="px-4 flex justify-end font-mono">
                      <span
                        className={`font-bold text-xs px-2.5 py-0.5 border ${
                          item.stockMostrado <= 0
                            ? "text-[#FF0055] bg-[#FF0055]/10 border-[#FF0055]/30"
                            : "text-emerald-400 border-zinc-800 bg-transparent"
                        }`}
                      >
                        {item.stockMostrado.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* PAGINACIÓN DESKTOP */}
        {processedItems.length > 0 && (
          <div className="mt-4 flex items-center justify-between font-mono text-xs text-zinc-500 shrink-0">
            <span className="uppercase text-[10px] font-bold tracking-widest text-zinc-400">
              Página <strong className="text-white">{currentPage}</strong> de{" "}
              <strong className="text-white">{totalPages}</strong> (
              {processedItems.length} registros)
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 bg-[#050505] text-zinc-300 hover:border-[#FF5A00] hover:text-[#FF5A00] disabled:opacity-20 transition-all cursor-pointer"
              >
                <ChevronsLeft size={16} />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 bg-[#050505] text-zinc-300 hover:border-[#FF5A00] hover:text-[#FF5A00] disabled:opacity-20 transition-all cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>

              <span className="px-3 h-8 flex items-center bg-[#FF5A00]/10 border border-[#FF5A00]/30 text-[#FF5A00] font-bold text-xs">
                {currentPage} / {totalPages}
              </span>

              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 bg-[#050505] text-zinc-300 hover:border-[#FF5A00] hover:text-[#FF5A00] disabled:opacity-20 transition-all cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 bg-[#050505] text-zinc-300 hover:border-[#FF5A00] hover:text-[#FF5A00] disabled:opacity-20 transition-all cursor-pointer"
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. VISTA MOBILE */}
      <div className="flex md:hidden flex-1 flex-col overflow-y-auto min-h-0 p-4 space-y-3 bg-black">
        {loading ? (
          <div className="py-12 flex justify-center text-[#FF5A00]">
            <RefreshCw className="animate-spin" size={28} />
          </div>
        ) : paginatedItems.length === 0 ? (
          <div className="py-12 text-center font-bold tracking-widest text-xs uppercase text-zinc-600">
            Sin semielaborados.
          </div>
        ) : (
          paginatedItems.map((item) => (
            <div
              key={item.id}
              onClick={() => setDetailItem(item)}
              className="bg-[#050505] border border-zinc-800/80 p-4 space-y-3 shrink-0 cursor-pointer active:scale-[0.99] transition-transform shadow-md"
            >
              <div className="flex justify-between items-start">
                <span className="bg-[#FF5A00]/10 border border-[#FF5A00]/20 text-[#FF5A00] px-1.5 py-0.5 text-[10px] font-mono font-bold tracking-widest">
                  {item.codigo}
                </span>
                {item.dias_stock !== null && (
                  <span className="text-[9px] font-mono text-[#FFD700] font-bold tracking-widest uppercase border border-zinc-800 px-1.5 py-0.5">
                    {item.dias_stock} días
                  </span>
                )}
              </div>

              <div className="text-white font-bold text-sm leading-snug">
                {item.nombre}
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-zinc-800/80 font-mono text-[10px] font-bold tracking-widest uppercase">
                <span className="text-zinc-500">
                  Stock ({activeTab}):{" "}
                  <strong
                    className={
                      item.stockMostrado <= 0
                        ? "text-[#FF0055]"
                        : "text-emerald-400"
                    }
                  >
                    {item.stockMostrado.toLocaleString()}
                  </strong>
                </span>

                <span className="text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 border border-cyan-400/20">
                  {item.pegado_nombre || "SIN PEGADO"}
                </span>
              </div>
            </div>
          ))
        )}

        {/* PAGINACIÓN MOBILE */}
        {processedItems.length > 0 && (
          <div className="flex flex-col items-center justify-center pt-4 mt-2 border-t border-zinc-800/50 gap-3">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 bg-[#050505] text-zinc-300 hover:border-[#FF5A00] hover:text-[#FF5A00] disabled:opacity-20 transition-all cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>

              <span className="px-3 h-8 flex items-center bg-[#FF5A00]/10 border border-[#FF5A00]/30 text-[#FF5A00] font-bold text-xs font-mono">
                {currentPage} / {totalPages}
              </span>

              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center border border-zinc-800 bg-[#050505] text-zinc-300 hover:border-[#FF5A00] hover:text-[#FF5A00] disabled:opacity-20 transition-all cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================
          MODALES
      ========================================================= */}

      {/* MODAL FICHA DE SEMIELABORADO */}
      {detailItem && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-lg p-8 shadow-2xl relative flex flex-col gap-6">
            <button
              onClick={() => setDetailItem(null)}
              className="absolute top-6 right-6 text-zinc-500 hover:text-white cursor-pointer z-10"
            >
              <X size={20} />
            </button>

            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between pr-8">
                <span className="text-[10px] font-mono font-bold text-[#FF5A00] bg-[#FF5A00]/10 border border-[#FF5A00]/20 px-2 py-0.5 tracking-widest uppercase">
                  FICHA DE SEMIELABORADO
                </span>
              </div>

              <div>
                <h3 className="text-3xl text-white font-extrabold italic uppercase tracking-tighter flex items-center gap-2.5">
                  <Box size={28} className="text-[#FF5A00]" />
                  {detailItem.codigo}
                </h3>
                <p className="text-sm text-zinc-300 font-medium mt-1.5">
                  {detailItem.nombre}
                </p>
              </div>
            </div>

            <div className="w-full h-px bg-zinc-800/80"></div>

            {/* DESGLOSE POR DEPÓSITO */}
            <div className="space-y-2 font-mono text-xs">
              <span className="text-zinc-500 text-[10px] font-bold tracking-widest uppercase block">
                STOCK POR DEPÓSITO:
              </span>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "DEP 33", val: detailItem.stock_33 },
                  { label: "DEP 26", val: detailItem.stock_26 },
                  { label: "AYOLAS", val: detailItem.stock_ayolas },
                  { label: "DEP 37", val: detailItem.stock_37 },
                ].map((d, idx) => (
                  <div
                    key={idx}
                    className="bg-black p-3 border border-zinc-800 flex flex-col items-center justify-center gap-1"
                  >
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">
                      {d.label}
                    </span>
                    <strong className="text-white text-sm">{d.val || 0}</strong>
                  </div>
                ))}
              </div>
            </div>

            {/* ESPECIFICACIÓN TÉCNICA DEL PEGADO */}
            <div className="bg-black border border-zinc-800 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2 font-mono">
                <h4 className="text-[10px] text-[#FFD700] font-bold flex items-center gap-1.5 uppercase tracking-widest">
                  <Sparkle size={14} className="text-cyan-400" /> ESPECIFICACIÓN
                  DE PEGADO
                </h4>
                <span className="text-[10px] text-cyan-400 font-bold border border-cyan-400/20 bg-cyan-400/5 px-2 py-0.5">
                  {detailItem.pegado_nombre || "SIN PEGADO"}
                </span>
              </div>

              {detailItem.pegado_nombre ? (
                <div className="grid grid-cols-3 gap-3 font-mono text-xs">
                  <div className="bg-[#050505] p-2.5 border border-zinc-800/80 flex flex-col gap-1">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">
                      REFLECTIVA:
                    </span>
                    <strong className="text-white text-[10px] truncate">
                      {detailItem.reflectiva || "NINGUNA"}
                    </strong>
                  </div>

                  <div className="bg-[#050505] p-2.5 border border-zinc-800/80 flex flex-col gap-1">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">
                      ORAJET:
                    </span>
                    <strong
                      className={
                        detailItem.protector_orajet
                          ? "text-emerald-400 text-[10px]"
                          : "text-[#FF0055] text-[10px]"
                      }
                    >
                      {detailItem.protector_orajet ? "SÍ" : "NO"}
                    </strong>
                  </div>

                  <div className="bg-[#050505] p-2.5 border border-zinc-800/80 flex flex-col gap-1">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">
                      APLICACIÓN:
                    </span>
                    <strong className="text-white text-[10px] truncate">
                      {detailItem.protector_orajet
                        ? detailItem.aplicacion_protector || "COMPLETA"
                        : "NO APLICA"}
                    </strong>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-zinc-500 font-mono py-2 text-center uppercase tracking-widest font-bold">
                  NO REQUIERE PEGADO
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL AUDITORÍA SHEETS */}
      {previewData && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4 font-sans">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-2xl p-8 shadow-2xl relative max-h-[90vh] flex flex-col gap-5 text-xs">
            <button
              onClick={() => setPreviewData(null)}
              className="absolute top-6 right-6 text-zinc-500 hover:text-white cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="border-b border-zinc-800/80 pb-3 shrink-0">
              <span className="text-[10px] font-mono font-bold text-[#FFD700] bg-[#FFD700]/10 border border-[#FFD700]/20 px-2 py-0.5 tracking-widest uppercase">
                AUDITORÍA DE DEPÓSITOS
              </span>
              <h3 className="font-extrabold italic text-xl text-white mt-3 uppercase tracking-tighter flex items-center gap-2">
                <RefreshCw size={20} className="text-[#FF5A00]" />
                INSPECCIÓN DE SHEETS
              </h3>
            </div>

            {previewData.nuevos.length === 0 &&
            previewData.modificados.length === 0 ? (
              <div className="py-12 text-center space-y-3 font-mono my-auto">
                <CheckCircle2 size={40} className="mx-auto text-zinc-500" />
                <p className="text-white text-xs font-bold uppercase tracking-widest">
                  ¡DEPÓSITOS AL DÍA!
                </p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                  No se detectaron discrepancias.
                </p>
              </div>
            ) : (
              <div className="space-y-5 font-mono flex-1 overflow-y-auto pr-1 custom-scrollbar">
                {/* 1. SECCIÓN NUEVOS */}
                <div className="bg-black border border-zinc-800 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800/50 pb-3">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeNuevos}
                        onChange={(e) => {
                          setIncludeNuevos(e.target.checked);
                          if (e.target.checked)
                            setSelectedNuevos(
                              previewData.nuevos.map((n) => n.codigo),
                            );
                          else setSelectedNuevos([]);
                        }}
                        className="w-4 h-4 rounded-none border-zinc-800 bg-black accent-[#FF5A00] cursor-pointer"
                      />
                      <span className="text-[#FF5A00] font-bold text-[10px] uppercase tracking-widest flex items-center gap-1.5">
                        <Plus size={14} /> 1. NUEVOS SEMIELABORADOS (
                        {previewData.nuevos.length})
                      </span>
                    </label>
                  </div>

                  {includeNuevos && previewData.nuevos.length > 0 && (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
                      {previewData.nuevos.map((n) => (
                        <div
                          key={n.codigo}
                          className="p-3 border border-zinc-800 bg-black flex justify-between items-center text-xs"
                        >
                          <strong className="text-[#FF5A00]">
                            [{n.codigo}] {n.nombre}
                          </strong>
                          <span className="text-[9px] text-emerald-400 font-bold">
                            33:{n.stock_33} | 26:{n.stock_26} | AYO:
                            {n.stock_ayolas} | 37:{n.stock_37}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. SECCIÓN MODIFICADOS */}
                <div className="bg-black border border-zinc-800 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800/50 pb-3">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeModificados}
                        onChange={(e) => {
                          setIncludeModificados(e.target.checked);
                          if (e.target.checked)
                            setSelectedModificados(
                              previewData.modificados.map((m) => m.id),
                            );
                          else setSelectedModificados([]);
                        }}
                        className="w-4 h-4 rounded-none border-zinc-800 bg-black accent-[#FFD700] cursor-pointer"
                      />
                      <span className="text-[#FFD700] font-bold text-[10px] uppercase tracking-widest flex items-center gap-1.5">
                        <Layers size={14} /> 2. ACTUALIZAR DEPÓSITOS (
                        {previewData.modificados.length})
                      </span>
                    </label>
                  </div>

                  {includeModificados && previewData.modificados.length > 0 && (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
                      {previewData.modificados.map((m) => (
                        <div
                          key={m.id}
                          className="p-3 border border-zinc-800 bg-black flex justify-between items-center text-xs"
                        >
                          <strong className="text-[#FFD700]">
                            [{m.codigo}] {m.nombre}
                          </strong>
                          <span className="text-[9px] text-zinc-300">
                            33: {m.actual.stock_33} →{" "}
                            <strong className="text-[#FFD700]">
                              {m.nuevo.stock_33}
                            </strong>{" "}
                            | 26: {m.actual.stock_26} →{" "}
                            <strong className="text-[#FFD700]">
                              {m.nuevo.stock_26}
                            </strong>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="pt-5 border-t border-zinc-800 flex justify-between items-center shrink-0 font-mono">
              <button
                onClick={() => setPreviewData(null)}
                className="px-5 py-2.5 text-zinc-500 hover:text-white text-[10px] font-bold uppercase tracking-widest transition cursor-pointer border border-zinc-800"
              >
                CANCELAR
              </button>

              {(previewData.nuevos.length > 0 ||
                previewData.modificados.length > 0) && (
                <button
                  onClick={handleApplySync}
                  className="px-6 py-2.5 bg-[#FF5A00] hover:bg-white text-black font-bold text-[10px] uppercase tracking-widest transition cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 size={16} /> APLICAR CAMBIOS
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
