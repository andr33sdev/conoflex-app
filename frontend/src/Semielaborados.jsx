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
  Sparkles,
  CheckCircle2,
  Plus,
  Layers,
  Box,
  Sparkle,
  Cpu,
} from "lucide-react";

export default function Semielaborados() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [search, setSearch] = useState("");

  // PESTAÑAS Y DEPOSITOS
  const [activeTab, setActiveTab] = useState("GENERAL");
  const [sumDepositos, setSumDepositos] = useState({
    stock_33: true,
    stock_26: true,
    stock_ayolas: true,
    stock_37: true,
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

  // AJUSTE DE FILAS EN TIEMPO REAL
  useEffect(() => {
    const updatePageSize = () => {
      if (!tableContainerRef.current) return;
      const containerHeight = tableContainerRef.current.clientHeight;
      const headerHeight = 36;
      const rowHeight = 38;
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

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/semielaborados");
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

  useEffect(() => {
    fetchItems();
  }, []);

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
        fetchItems();
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

  const itemsCalculados = useMemo(() => {
    return items.map((item) => {
      let stockMostrado = 0;

      if (activeTab === "GENERAL") {
        if (sumDepositos.stock_33) stockMostrado += item.stock_33 || 0;
        if (sumDepositos.stock_26) stockMostrado += item.stock_26 || 0;
        if (sumDepositos.stock_ayolas) stockMostrado += item.stock_ayolas || 0;
        if (sumDepositos.stock_37) stockMostrado += item.stock_37 || 0;
      } else if (activeTab === "33") stockMostrado = item.stock_33 || 0;
      else if (activeTab === "26") stockMostrado = item.stock_26 || 0;
      else if (activeTab === "AYOLAS") stockMostrado = item.stock_ayolas || 0;
      else if (activeTab === "37") stockMostrado = item.stock_37 || 0;

      return { ...item, stockMostrado };
    });
  }, [items, activeTab, sumDepositos]);

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

        if (typeof aVal === "string") {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }

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

  const emptySlotsCount = Math.max(0, itemsPerPage - paginatedItems.length);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#070a12] border border-slate-800/80 rounded-2xl font-sans text-slate-200 shadow-2xl overflow-hidden backdrop-blur-2xl p-5 space-y-4">
      {/* 1. HEADER DE MÓDULO */}
      <div className="bg-[#0f172a]/70 border-b border-slate-800/80 p-4 flex flex-wrap items-center justify-between gap-4 shrink-0 backdrop-blur-xl rounded-2xl">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl shadow-[0_0_15px_rgba(56,189,248,0.15)]">
            <Layers size={20} className="text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xs font-bold text-white tracking-widest uppercase font-mono">
                INVENTARIO DE SEMIELABORADOS
              </h2>
              <span className="text-[10px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 px-2.5 py-0.5 rounded-full font-mono flex items-center gap-1.5 shadow-[0_0_10px_rgba(56,189,248,0.1)]">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#38bdf8]" />{" "}
                4 DEPÓSITOS
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Control de productos en proceso y stock por depósitos.
            </p>
          </div>
        </div>

        <button
          onClick={handleStartSync}
          disabled={isSyncing}
          className="px-3.5 py-2 bg-slate-900 border border-slate-700 hover:border-amber-400 text-slate-300 hover:text-amber-400 rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer font-mono text-xs font-bold shrink-0 disabled:opacity-50"
          title="Sincronizar depósitos con Google Sheets"
        >
          <RefreshCw
            size={14}
            className={`transition-transform duration-500 ${
              isSyncing ? "animate-spin text-amber-400" : ""
            }`}
          />
          <span>SINCRONIZAR SHEETS</span>
        </button>
      </div>

      {/* 2. BARRA DE HERRAMIENTAS Y PESTAÑAS DE DEPÓSITO */}
      <div className="bg-[#0e1422] border border-slate-800/80 p-3.5 rounded-2xl space-y-3 shrink-0 shadow-xl">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 font-mono text-xs overflow-x-auto pb-0.5">
            {["GENERAL", "33", "26", "AYOLAS", "37"].map((dep) => {
              const isSelected = activeTab === dep;
              return (
                <button
                  key={dep}
                  onClick={() => {
                    setActiveTab(dep);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl border transition-all cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/40 font-bold shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                      : "bg-[#070a12] border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {dep === "GENERAL" ? "STOCK GENERAL" : `STOCK ${dep}`}
                </button>
              );
            })}
          </div>

          <div className="bg-[#070a12] border border-slate-800 px-3 py-1.5 text-xs font-mono text-slate-400 shrink-0 rounded-xl flex items-center gap-2">
            <span>ITEMS:</span>
            <strong className="text-emerald-400 font-bold">
              {processedItems.length} / {items.length}
            </strong>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              type="text"
              placeholder="Buscar por código o artículo..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-[#070a12] border border-slate-800 text-xs text-slate-100 pl-10 pr-4 py-2 focus:border-cyan-500/50 outline-none rounded-xl font-sans"
            />
          </div>

          {activeTab === "GENERAL" && (
            <div className="flex items-center gap-2.5 text-[11px] font-mono text-slate-400 bg-[#070a12] border border-slate-800 px-3 py-1.5 rounded-xl shrink-0">
              <span className="text-amber-400 font-bold">SUMAR:</span>
              {[
                { k: "stock_33", l: "33" },
                { k: "stock_26", l: "26" },
                { k: "stock_ayolas", l: "AYO" },
                { k: "stock_37", l: "37" },
              ].map((d) => (
                <label
                  key={d.k}
                  className="flex items-center gap-1 cursor-pointer hover:text-white select-none"
                >
                  <input
                    type="checkbox"
                    checked={sumDepositos[d.k]}
                    onChange={(e) =>
                      setSumDepositos({
                        ...sumDepositos,
                        [d.k]: e.target.checked,
                      })
                    }
                    className="accent-amber-500 w-3.5 h-3.5 cursor-pointer rounded"
                  />
                  <span>{d.l}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. PANEL TABLA ESCRITORIO CYBER-INDUSTRIAL */}
      <div className="flex-1 min-h-0 bg-[#0e1422] border border-slate-800/80 rounded-2xl p-4 flex flex-col shadow-xl space-y-3">
        <div
          ref={tableContainerRef}
          className="hidden md:flex flex-1 border border-slate-800 bg-[#070a12] min-h-0 flex-col overflow-hidden rounded-xl"
        >
          <table className="w-full text-left text-xs border-collapse table-fixed">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800 font-mono text-[10px] uppercase tracking-wider bg-[#0e1422] sticky top-0 z-10 h-[36px]">
                <th
                  onClick={() => handleSort("codigo")}
                  className="w-[18%] px-3 font-semibold cursor-pointer hover:bg-slate-800/80 hover:text-amber-400 transition-colors select-none"
                >
                  <div className="flex items-center justify-between pr-1">
                    <span>CÓDIGO</span>
                    <span className="w-3 flex justify-center shrink-0">
                      {sortColumn === "codigo" ? (
                        sortDirection === "asc" ? (
                          <ArrowUp size={12} className="text-amber-400" />
                        ) : (
                          <ArrowDown size={12} className="text-amber-400" />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="text-slate-600" />
                      )}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => handleSort("nombre")}
                  className="w-[42%] px-3 font-semibold cursor-pointer hover:bg-slate-800/80 hover:text-amber-400 transition-colors select-none"
                >
                  <div className="flex items-center justify-between pr-1">
                    <span>SEMIELABORADO / ARTÍCULO</span>
                    <span className="w-3 flex justify-center shrink-0">
                      {sortColumn === "nombre" ? (
                        sortDirection === "asc" ? (
                          <ArrowUp size={12} className="text-amber-400" />
                        ) : (
                          <ArrowDown size={12} className="text-amber-400" />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="text-slate-600" />
                      )}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => handleSort("demanda_mensual")}
                  className="w-[14%] px-3 font-semibold text-center cursor-pointer hover:bg-slate-800/80 hover:text-amber-400 transition-colors select-none"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>DEMANDA</span>
                    <span className="w-3 flex justify-center shrink-0">
                      {sortColumn === "demanda_mensual" ? (
                        sortDirection === "asc" ? (
                          <ArrowUp size={12} className="text-amber-400" />
                        ) : (
                          <ArrowDown size={12} className="text-amber-400" />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="text-slate-600" />
                      )}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => handleSort("dias_stock")}
                  className="w-[14%] px-3 font-semibold text-center cursor-pointer hover:bg-slate-800/80 hover:text-amber-400 transition-colors select-none"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>DÍAS STOCK</span>
                    <span className="w-3 flex justify-center shrink-0">
                      {sortColumn === "dias_stock" ? (
                        sortDirection === "asc" ? (
                          <ArrowUp size={12} className="text-amber-400" />
                        ) : (
                          <ArrowDown size={12} className="text-amber-400" />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="text-slate-600" />
                      )}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => handleSort("stockMostrado")}
                  className="w-[12%] px-3 font-semibold text-right cursor-pointer hover:bg-slate-800/80 hover:text-amber-400 transition-colors select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>STOCK</span>
                    <span className="w-3 flex justify-center shrink-0">
                      {sortColumn === "stockMostrado" ? (
                        sortDirection === "asc" ? (
                          <ArrowUp size={12} className="text-amber-400" />
                        ) : (
                          <ArrowDown size={12} className="text-amber-400" />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="text-slate-600" />
                      )}
                    </span>
                  </div>
                </th>
              </tr>
            </thead>

            <tbody
              key={currentPage}
              className="divide-y divide-slate-800/50 bg-[#070a12] animate-in fade-in duration-200"
            >
              {loading ? (
                <tr>
                  <td
                    colSpan="5"
                    className="py-16 text-center font-mono text-xs text-amber-400 animate-pulse"
                  >
                    Consultando semielaborados...
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td
                    colSpan="5"
                    className="py-16 text-center font-mono text-xs text-slate-500"
                  >
                    No hay semielaborados registrados.
                  </td>
                </tr>
              ) : (
                <>
                  {paginatedItems.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setDetailItem(item)}
                      className="h-[38px] hover:bg-[#121824]/80 transition-colors group align-middle cursor-pointer"
                    >
                      <td className="px-3 font-mono font-bold text-amber-400 truncate align-middle group-hover:underline">
                        {item.codigo}
                      </td>

                      <td className="px-3 text-slate-100 font-bold truncate align-middle">
                        {item.nombre}
                      </td>

                      <td className="px-3 text-center text-slate-400 text-[11px] font-mono truncate align-middle">
                        {item.demanda_mensual
                          ? `${item.demanda_mensual.toLocaleString()} u.`
                          : "--"}
                      </td>

                      <td className="px-3 text-center font-mono text-[11px] align-middle whitespace-nowrap">
                        {item.dias_stock !== null ? (
                          <span
                            className={`inline-block font-bold px-2.5 py-0.5 border rounded-full text-[10px] whitespace-nowrap ${
                              item.dias_stock <= 5
                                ? "text-rose-400 bg-rose-500/10 border-rose-500/30"
                                : item.dias_stock <= 15
                                  ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
                                  : "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                            }`}
                          >
                            {item.dias_stock} días
                          </span>
                        ) : (
                          <span className="text-slate-600">--</span>
                        )}
                      </td>

                      <td className="px-3 text-right font-mono truncate align-middle">
                        <span
                          className={`font-bold ${
                            item.stockMostrado <= 0
                              ? "text-rose-400"
                              : "text-emerald-400"
                          }`}
                        >
                          {item.stockMostrado.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {/* RANURAS VACÍAS */}
                  {Array.from({ length: emptySlotsCount }).map((_, idx) => (
                    <tr
                      key={`empty-${idx}`}
                      className="h-[38px] opacity-20 pointer-events-none"
                    >
                      <td className="px-3 text-slate-700 font-mono text-[10px]">
                        --
                      </td>
                      <td className="px-3 text-slate-700 font-mono text-[10px]">
                        -- RANURA VACÍA --
                      </td>
                      <td className="px-3 text-center text-slate-700 text-[10px]">
                        --
                      </td>
                      <td className="px-3 text-center text-slate-700 text-[10px]">
                        --
                      </td>
                      <td className="px-3 text-right text-slate-700 text-[10px]">
                        --
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* 4. VISTA MOBILE */}
        <div className="flex md:hidden flex-1 flex-col overflow-y-auto min-h-0 space-y-2 pr-0.5">
          {loading ? (
            <div className="py-12 text-center font-mono text-xs text-amber-400 animate-pulse">
              Consultando semielaborados...
            </div>
          ) : paginatedItems.length === 0 ? (
            <div className="py-12 text-center font-mono text-xs text-slate-500">
              Sin semielaborados.
            </div>
          ) : (
            paginatedItems.map((item) => (
              <div
                key={item.id}
                onClick={() => setDetailItem(item)}
                className="bg-[#070a12] border border-slate-800 p-3.5 rounded-xl space-y-2 shrink-0 cursor-pointer active:scale-[0.99] transition-transform shadow-md"
              >
                <div className="flex justify-between items-center">
                  <span className="font-mono text-amber-400 font-bold text-xs">
                    [{item.codigo}]
                  </span>
                  {item.dias_stock !== null && (
                    <span className="text-[10px] font-mono text-amber-400">
                      {item.dias_stock} días
                    </span>
                  )}
                </div>

                <div className="text-white font-bold text-xs break-words">
                  {item.nombre}
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-slate-800/80 font-mono text-[11px]">
                  <span className="text-slate-400">
                    Stock ({activeTab}):{" "}
                    <strong
                      className={
                        item.stockMostrado <= 0
                          ? "text-rose-400"
                          : "text-emerald-400"
                      }
                    >
                      {item.stockMostrado.toLocaleString()}
                    </strong>
                  </span>

                  <span className="text-[10px] text-cyan-400">
                    {item.pegado_nombre
                      ? `Pegado: ${item.pegado_nombre}`
                      : "Sin pegado"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* PAGINACIÓN */}
        <div className="flex flex-col sm:flex-row items-center justify-between pt-2 border-t border-slate-800 shrink-0 text-xs font-mono text-slate-400 gap-2">
          <span>
            Página <strong className="text-white">{currentPage}</strong> de{" "}
            <strong className="text-white">{totalPages}</strong>
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg cursor-pointer transition"
            >
              <ChevronsLeft size={14} />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 flex items-center gap-1 text-xs rounded-lg cursor-pointer transition"
            >
              <ChevronLeft size={14} /> ANT
            </button>

            <span className="px-3 py-1 bg-[#070a12] border border-slate-800 text-amber-400 font-bold text-xs rounded-lg">
              {currentPage} / {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 flex items-center gap-1 text-xs rounded-lg cursor-pointer transition"
            >
              SIG <ChevronRight size={14} />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg cursor-pointer transition"
            >
              <ChevronsRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL FICHA DE SEMIELABORADO */}
      {detailItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200 font-sans">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-lg p-6 rounded-2xl shadow-2xl space-y-4 relative text-xs">
            <button
              onClick={() => setDetailItem(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="border-b border-slate-800 pb-3">
              <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 border border-amber-500/20 rounded-full">
                FICHA DE SEMIELABORADO
              </span>
              <h3 className="font-mono text-base text-white font-bold mt-2 flex items-center gap-2">
                <Box size={18} className="text-cyan-400" /> [{detailItem.codigo}
                ]
              </h3>
              <p className="text-xs text-slate-300 font-bold mt-0.5">
                {detailItem.nombre}
              </p>
            </div>

            {/* DESGLOSE POR DEPÓSITO */}
            <div className="space-y-1.5 font-mono text-xs">
              <span className="text-slate-400 text-[10px] block">
                DESGLOSE DE STOCK POR DEPÓSITO:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "DEP. 33", val: detailItem.stock_33 },
                  { label: "DEP. 26", val: detailItem.stock_26 },
                  { label: "AYOLAS", val: detailItem.stock_ayolas },
                  { label: "DEP. 37", val: detailItem.stock_37 },
                ].map((d, idx) => (
                  <div
                    key={idx}
                    className="bg-[#070a12] p-2.5 border border-slate-800 text-center rounded-xl shadow-sm"
                  >
                    <span className="text-[9px] text-slate-400 block">
                      {d.label}
                    </span>
                    <strong className="text-white text-xs">
                      {d.val || 0} u.
                    </strong>
                  </div>
                ))}
              </div>
            </div>

            {/* ESPECIFICACIÓN TÉCNICA DEL PEGADO */}
            <div className="bg-[#070a12] border border-slate-800 p-3.5 space-y-2 rounded-xl shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 font-mono">
                <h4 className="text-[11px] text-amber-400 font-bold flex items-center gap-1.5">
                  <Sparkle size={13} className="text-cyan-400" /> ESPECIFICACIÓN
                  DE PEGADO & REFLECTIVA
                </h4>
                <span className="text-[10px] text-cyan-400 font-bold">
                  {detailItem.pegado_nombre || "SIN PEGADO"}
                </span>
              </div>

              {detailItem.pegado_nombre ? (
                <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-xs">
                  <div className="bg-[#0e1422] p-2 border border-slate-800 rounded-lg">
                    <span className="text-[9px] text-slate-400 block mb-0.5">
                      REFLECTIVA:
                    </span>
                    <strong className="text-white text-[11px] block truncate">
                      {detailItem.reflectiva || "NINGUNA"}
                    </strong>
                  </div>

                  <div className="bg-[#0e1422] p-2 border border-slate-800 rounded-lg">
                    <span className="text-[9px] text-slate-400 block mb-0.5">
                      PROTECTOR ORAJET:
                    </span>
                    <strong
                      className={
                        detailItem.protector_orajet
                          ? "text-emerald-400 text-[11px] block"
                          : "text-rose-400 text-[11px] block"
                      }
                    >
                      {detailItem.protector_orajet ? "SÍ" : "NO"}
                    </strong>
                  </div>

                  <div className="bg-[#0e1422] p-2 border border-slate-800 rounded-lg">
                    <span className="text-[9px] text-slate-400 block mb-0.5">
                      APLICACIÓN:
                    </span>
                    <strong className="text-white text-[11px] block truncate">
                      {detailItem.protector_orajet
                        ? detailItem.aplicacion_protector || "COMPLETA"
                        : "NO APLICA"}
                    </strong>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 font-mono py-1.5 text-center">
                  Este semielaborado no tiene una configuración de pegado
                  asignada.
                </p>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end font-mono">
              <button
                onClick={() => setDetailItem(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                CERRAR FICHA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AUDITORÍA GOOGLE SHEETS */}
      {previewData && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200 font-sans">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-2xl p-6 rounded-2xl shadow-2xl space-y-4 relative max-h-[90vh] flex flex-col text-xs">
            <button
              onClick={() => setPreviewData(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="border-b border-slate-800 pb-3 shrink-0">
              <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 border border-emerald-500/20 rounded-full">
                AUDITORÍA DE DEPÓSITOS
              </span>
              <h3 className="font-mono text-sm text-white font-bold mt-2 flex items-center gap-2">
                <Sparkles size={16} className="text-amber-400" /> INSPECCIÓN DE
                SEMIELABORADOS (SHEETS)
              </h3>
            </div>

            {previewData.nuevos.length === 0 &&
            previewData.modificados.length === 0 ? (
              <div className="py-12 text-center space-y-2 font-mono my-auto">
                <CheckCircle2 size={36} className="mx-auto text-emerald-400" />
                <p className="text-white text-xs font-bold">
                  ¡DEPÓSITOS TOTALMENTE AL DÍA!
                </p>
                <p className="text-[11px] text-slate-400">
                  No se detectaron discrepancias en los 4 depósitos.
                </p>
              </div>
            ) : (
              <div className="space-y-4 font-mono flex-1 overflow-y-auto pr-1">
                <div className="bg-[#070a12] border border-slate-800 p-3.5 space-y-3 rounded-xl shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
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
                        className="w-4 h-4 rounded border-slate-800 bg-slate-900 accent-amber-500 cursor-pointer"
                      />
                      <span className="text-amber-400 font-bold text-xs flex items-center gap-1.5">
                        <Plus size={14} /> 1. CREAR NUEVOS SEMIELABORADOS (
                        {previewData.nuevos.length})
                      </span>
                    </label>
                  </div>

                  {includeNuevos && previewData.nuevos.length > 0 && (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {previewData.nuevos.map((n) => (
                        <div
                          key={n.codigo}
                          className="p-2.5 border border-amber-500/50 bg-[#0e1422] flex justify-between items-center text-xs rounded-lg"
                        >
                          <strong className="text-amber-400">
                            [{n.codigo}] {n.nombre}
                          </strong>
                          <span className="text-[10px] text-emerald-400 font-bold">
                            33:{n.stock_33} | 26:{n.stock_26} | AYO:
                            {n.stock_ayolas} | 37:{n.stock_37}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-[#070a12] border border-slate-800 p-3.5 space-y-3 rounded-xl shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
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
                        className="w-4 h-4 rounded border-slate-800 bg-slate-900 accent-cyan-500 cursor-pointer"
                      />
                      <span className="text-cyan-400 font-bold text-xs flex items-center gap-1.5">
                        <Layers size={14} /> 2. ACTUALIZAR DEPÓSITOS EXISTENTES
                        ({previewData.modificados.length})
                      </span>
                    </label>
                  </div>

                  {includeModificados && previewData.modificados.length > 0 && (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {previewData.modificados.map((m) => (
                        <div
                          key={m.id}
                          className="p-2.5 border border-cyan-500/50 bg-[#0e1422] flex justify-between items-center text-xs rounded-lg"
                        >
                          <strong className="text-amber-400">
                            [{m.codigo}] {m.nombre}
                          </strong>
                          <span className="text-[10px] text-white">
                            33: {m.actual.stock_33} →{" "}
                            <strong className="text-cyan-400">
                              {m.nuevo.stock_33}
                            </strong>{" "}
                            | 26: {m.actual.stock_26} →{" "}
                            <strong className="text-cyan-400">
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

            <div className="pt-3 border-t border-slate-800 flex justify-between items-center shrink-0 font-mono">
              <button
                onClick={() => setPreviewData(null)}
                className="px-4 py-2 border border-slate-800 text-slate-400 hover:text-white text-xs rounded-xl transition cursor-pointer"
              >
                CANCELAR
              </button>

              {(previewData.nuevos.length > 0 ||
                previewData.modificados.length > 0) && (
                <button
                  onClick={handleApplySync}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 size={15} /> APLICAR CAMBIOS
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
