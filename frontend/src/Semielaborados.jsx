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
  Shield,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
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
      const res = await fetch(
        "/api/semielaborados/previsualizar-sheets",
        { method: "POST", headers: { "Content-Type": "application/json" } },
      );

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
      const res = await fetch(
        "/api/semielaborados/aplicar-sincronizacion",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nuevos: finalNuevos,
            modificados: finalModificados,
          }),
        },
      );

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
    <div className="h-full flex flex-col font-mono text-[#e1d7f5] select-none space-y-2 sm:space-y-2.5 min-h-0 bg-[#1a0f2e] p-1 overflow-hidden">
      {/* 1. HEADER */}
      <div className="flex flex-row items-center justify-between pb-2 border-b-2 border-[#432874] gap-2 shrink-0">
        <div>
          <h2 className="font-pixel text-sm sm:text-base text-[#ffbe00] font-bold flex items-center gap-2 tracking-wide drop-shadow-[1px_1px_0px_#000]">
            <Layers size={16} className="text-[#38bdf8] shrink-0" /> INVENTARIO
            DE SEMIELABORADOS
          </h2>
          <p className="text-[10px] text-[#a594c9] font-mono hidden sm:block">
            Control de productos en proceso y stock por depósitos.
          </p>
        </div>

        <button
          onClick={handleStartSync}
          disabled={isSyncing}
          className="px-3 py-1.5 bg-[#2c1a4d] border-2 border-[#432874] text-[#a594c9] hover:text-[#ffbe00] hover:border-[#ffbe00]/60 shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all rounded-xs flex items-center gap-1.5 font-pixel text-xs shrink-0"
          title="Sincronizar depósitos con Google Sheets"
        >
          <RefreshCw
            size={13}
            className={`transition-transform duration-500 ${
              isSyncing ? "animate-spin text-[#ffbe00]" : ""
            }`}
          />
          <span>SINCRONIZAR</span>
        </button>
      </div>

      {/* 2. BARRA DE HERRAMIENTAS */}
      <div className="bg-[#24173e] border-2 border-[#432874] p-2 sm:p-2.5 space-y-2 shrink-0 rounded-xs shadow-[3px_3px_0px_#000]">
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-0.5">
          <div className="flex items-center gap-1.5 font-pixel text-xs">
            {["GENERAL", "33", "26", "AYOLAS", "37"].map((dep) => {
              const isSelected = activeTab === dep;
              return (
                <button
                  key={dep}
                  onClick={() => {
                    setActiveTab(dep);
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1 border-2 transition-all shrink-0 rounded-xs shadow-[1px_1px_0px_#000] ${
                    isSelected
                      ? "bg-[#ffbe00] border-[#b38600] text-[#2c1a4d] font-bold"
                      : "bg-[#160c2b] border-[#432874] text-[#a594c9] hover:text-white hover:border-[#ffbe00]/50"
                  }`}
                >
                  {dep === "GENERAL" ? "STOCK GENERAL" : `STOCK ${dep}`}
                </button>
              );
            })}
          </div>

          <div className="bg-[#160c2b] border border-[#432874] px-2.5 py-1 text-[10px] font-pixel text-[#a594c9] shrink-0 rounded-xs flex items-center gap-1">
            <span>ITEMS:</span>
            <strong className="text-[#24cc8f]">
              {processedItems.length} / {items.length}
            </strong>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          <div className="relative flex-1 max-w-md">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a594c9]"
            />
            <input
              type="text"
              placeholder="Buscar por código o artículo..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-[#160c2b] border-2 border-[#432874] text-xs text-white pl-8 pr-3 py-1 focus:outline-none focus:border-[#ffbe00] transition-colors placeholder:text-[#6e588a] rounded-xs font-mono"
            />
          </div>

          {activeTab === "GENERAL" && (
            <div className="flex items-center gap-2 text-[10px] font-pixel text-[#a594c9] bg-[#160c2b] border border-[#432874] px-2 py-1 rounded-xs shrink-0">
              <span className="text-[#ffbe00] font-bold">SUMAR:</span>
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
                    className="accent-[#ffbe00] w-3 h-3 cursor-pointer"
                  />
                  <span>{d.l}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. PANEL TABLA ESCRITORIO */}
      <div className="flex-1 bg-[#24173e] border-2 border-[#432874] p-2 sm:p-2.5 flex flex-col min-h-0 shadow-[4px_4px_0px_#000] relative rounded-xs overflow-hidden">
        <div
          ref={tableContainerRef}
          className="hidden md:flex flex-1 border-2 border-[#432874] bg-[#160c2b] min-h-0 flex-col overflow-hidden rounded-xs"
        >
          <table className="w-full text-left text-xs border-collapse table-fixed">
            <thead>
              <tr className="text-[#a594c9] border-b-2 border-[#432874] font-pixel text-[11px] bg-[#2c1a4d] sticky top-0 z-10 h-[36px]">
                <th
                  onClick={() => handleSort("codigo")}
                  className="w-[18%] px-3 font-normal cursor-pointer hover:bg-[#39215e] hover:text-[#ffbe00] transition-colors select-none"
                >
                  <div className="flex items-center justify-between pr-1">
                    <span>CÓDIGO</span>
                    <span className="w-3 flex justify-center shrink-0">
                      {sortColumn === "codigo" ? (
                        sortDirection === "asc" ? (
                          <ArrowUp size={12} className="text-[#ffbe00]" />
                        ) : (
                          <ArrowDown size={12} className="text-[#ffbe00]" />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="text-[#6e588a]" />
                      )}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => handleSort("nombre")}
                  className="w-[42%] px-3 font-normal cursor-pointer hover:bg-[#39215e] hover:text-[#ffbe00] transition-colors select-none"
                >
                  <div className="flex items-center justify-between pr-1">
                    <span>SEMIELABORADO / ARTÍCULO</span>
                    <span className="w-3 flex justify-center shrink-0">
                      {sortColumn === "nombre" ? (
                        sortDirection === "asc" ? (
                          <ArrowUp size={12} className="text-[#ffbe00]" />
                        ) : (
                          <ArrowDown size={12} className="text-[#ffbe00]" />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="text-[#6e588a]" />
                      )}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => handleSort("demanda_mensual")}
                  className="w-[14%] px-3 font-normal text-center cursor-pointer hover:bg-[#39215e] hover:text-[#ffbe00] transition-colors select-none"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>DEMANDA</span>
                    <span className="w-3 flex justify-center shrink-0">
                      {sortColumn === "demanda_mensual" ? (
                        sortDirection === "asc" ? (
                          <ArrowUp size={12} className="text-[#ffbe00]" />
                        ) : (
                          <ArrowDown size={12} className="text-[#ffbe00]" />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="text-[#6e588a]" />
                      )}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => handleSort("dias_stock")}
                  className="w-[14%] px-3 font-normal text-center cursor-pointer hover:bg-[#39215e] hover:text-[#ffbe00] transition-colors select-none"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>DÍAS STOCK</span>
                    <span className="w-3 flex justify-center shrink-0">
                      {sortColumn === "dias_stock" ? (
                        sortDirection === "asc" ? (
                          <ArrowUp size={12} className="text-[#ffbe00]" />
                        ) : (
                          <ArrowDown size={12} className="text-[#ffbe00]" />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="text-[#6e588a]" />
                      )}
                    </span>
                  </div>
                </th>

                <th
                  onClick={() => handleSort("stockMostrado")}
                  className="w-[12%] px-3 font-normal text-right cursor-pointer hover:bg-[#39215e] hover:text-[#ffbe00] transition-colors select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>STOCK</span>
                    <span className="w-3 flex justify-center shrink-0">
                      {sortColumn === "stockMostrado" ? (
                        sortDirection === "asc" ? (
                          <ArrowUp size={12} className="text-[#ffbe00]" />
                        ) : (
                          <ArrowDown size={12} className="text-[#ffbe00]" />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="text-[#6e588a]" />
                      )}
                    </span>
                  </div>
                </th>
              </tr>
            </thead>

            <tbody
              key={currentPage}
              className="divide-y divide-[#432874]/30 bg-[#160c2b] animate-in fade-in duration-200"
            >
              {loading ? (
                <tr>
                  <td
                    colSpan="5"
                    className="py-16 text-center font-pixel text-xs text-[#ffbe00] animate-pulse"
                  >
                    Consultando semielaborados...
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td
                    colSpan="5"
                    className="py-16 text-center font-pixel text-xs text-[#6e588a]"
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
                      className="h-[38px] hover:bg-[#281747] hover:shadow-[inset_0_0_15px_rgba(255,190,0,0.12)] transition-all duration-150 group align-middle cursor-pointer"
                    >
                      <td className="px-3 font-pixel text-[#ffbe00] font-bold tracking-wider truncate align-middle group-hover:underline">
                        {item.codigo}
                      </td>

                      <td className="px-3 text-white font-bold truncate align-middle">
                        {item.nombre}
                      </td>

                      <td className="px-3 text-center text-[#a594c9] text-[11px] font-pixel truncate align-middle">
                        {item.demanda_mensual
                          ? `${item.demanda_mensual.toLocaleString()} u.`
                          : "--"}
                      </td>

                      <td className="px-3 text-center font-pixel text-[11px] align-middle whitespace-nowrap">
                        {item.dias_stock !== null ? (
                          <span
                            className={`inline-block font-bold px-2 py-0.5 border whitespace-nowrap shadow-[1px_1px_0px_#000] rounded-2xs ${
                              item.dias_stock <= 5
                                ? "text-[#f87171] bg-[#450a0a]/70 border-[#7f1d1d]"
                                : item.dias_stock <= 15
                                  ? "text-[#facc15] bg-[#422006]/70 border-[#713f12]"
                                  : "text-[#24cc8f] bg-[#064e3b]/70 border-[#065f46]"
                            }`}
                          >
                            {item.dias_stock} días
                          </span>
                        ) : (
                          <span className="text-[#6e588a]">--</span>
                        )}
                      </td>

                      <td className="px-3 text-right font-pixel truncate align-middle">
                        <span
                          className={`font-bold ${item.stockMostrado <= 0 ? "text-[#f87171]" : "text-[#24cc8f]"}`}
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
                      className="h-[38px] opacity-15 pointer-events-none"
                    >
                      <td className="px-3 text-[#432874] font-pixel text-[10px]">
                        --
                      </td>
                      <td className="px-3 text-[#432874] font-pixel text-[10px]">
                        -- RANURA VACÍA --
                      </td>
                      <td className="px-3 text-center text-[#432874] text-[10px]">
                        --
                      </td>
                      <td className="px-3 text-center text-[#432874] text-[10px]">
                        --
                      </td>
                      <td className="px-3 text-right text-[#432874] text-[10px]">
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
            <div className="py-12 text-center font-pixel text-xs text-[#ffbe00] animate-pulse">
              Consultando semielaborados...
            </div>
          ) : paginatedItems.length === 0 ? (
            <div className="py-12 text-center font-pixel text-xs text-[#6e588a]">
              Sin semielaborados.
            </div>
          ) : (
            paginatedItems.map((item) => (
              <div
                key={item.id}
                onClick={() => setDetailItem(item)}
                className="bg-[#160c2b] border border-[#432874] p-3 rounded-xs space-y-2 shadow-[2px_2px_0px_#000] shrink-0 cursor-pointer active:scale-[0.99] transition-transform"
              >
                <div className="flex justify-between items-center">
                  <span className="font-pixel text-[#ffbe00] font-bold text-xs">
                    [{item.codigo}]
                  </span>
                  {item.dias_stock !== null && (
                    <span className="text-[10px] font-pixel text-amber-400">
                      {item.dias_stock} días
                    </span>
                  )}
                </div>

                <div className="text-white font-bold text-xs break-words">
                  {item.nombre}
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#432874]/40 font-pixel text-[11px]">
                  <span className="text-[#a594c9]">
                    Stock ({activeTab}):{" "}
                    <strong
                      className={
                        item.stockMostrado <= 0
                          ? "text-[#f87171]"
                          : "text-[#24cc8f]"
                      }
                    >
                      {item.stockMostrado.toLocaleString()}
                    </strong>
                  </span>

                  <span className="text-[10px] text-[#38bdf8]">
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
        <div className="flex flex-col sm:flex-row items-center justify-between pt-2 mt-2 border-t-2 border-[#432874] shrink-0 text-xs font-pixel gap-2">
          <span className="text-[#a594c9] text-[10px] sm:text-[11px]">
            Página <strong className="text-white">{currentPage}</strong> de{" "}
            <strong className="text-white">{totalPages}</strong>
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1 sm:p-1.5 bg-[#2c1a4d] border border-[#432874] text-[#a594c9] hover:text-[#ffbe00] disabled:opacity-30 shadow-[1px_1px_0px_#000] rounded-xs"
            >
              <ChevronsLeft size={13} />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2 py-1 bg-[#2c1a4d] border border-[#432874] text-[#a594c9] hover:text-[#ffbe00] disabled:opacity-30 shadow-[1px_1px_0px_#000] flex items-center gap-0.5 text-[10px] sm:text-xs rounded-xs"
            >
              <ChevronLeft size={13} /> ANT
            </button>

            <span className="px-2.5 py-0.5 bg-[#160c2b] border border-[#432874] text-[#ffbe00] font-bold text-[11px] rounded-xs">
              {currentPage} / {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2 py-1 bg-[#2c1a4d] border border-[#432874] text-[#a594c9] hover:text-[#ffbe00] disabled:opacity-30 shadow-[1px_1px_0px_#000] flex items-center gap-0.5 text-[10px] sm:text-xs rounded-xs"
            >
              SIG <ChevronRight size={13} />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1 sm:p-1.5 bg-[#2c1a4d] border border-[#432874] text-[#a594c9] hover:text-[#ffbe00] disabled:opacity-30 shadow-[1px_1px_0px_#000] rounded-xs"
            >
              <ChevronsRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL FICHA DE SEMIELABORADO (LÓGICA CONDICIONAL DE APLICACIÓN) */}
      {detailItem && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-[100] flex items-center justify-center p-3 animate-in fade-in duration-200 font-mono">
          <div className="bg-[#24173e] border-2 border-[#ffbe00] w-full max-w-lg p-5 shadow-[0_0_35px_rgba(255,190,0,0.3)] space-y-4 relative rounded-xs">
            <button
              onClick={() => setDetailItem(null)}
              className="absolute top-4 right-4 text-[#a594c9] hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b-2 border-[#432874] pb-3">
              <span className="text-[10px] font-pixel text-[#ffbe00] bg-[#ffbe00]/10 px-2 py-0.5 border border-[#ffbe00]/30 rounded-xs font-bold">
                FICHA DE SEMIELABORADO
              </span>
              <h3 className="font-pixel text-base text-white font-bold mt-2 flex items-center gap-2">
                <Box size={18} className="text-[#38bdf8]" /> [
                {detailItem.codigo}]
              </h3>
              <p className="text-xs text-[#a594c9] font-bold mt-0.5">
                {detailItem.nombre}
              </p>
            </div>

            {/* DESGLOSE POR DEPÓSITO */}
            <div className="space-y-1.5 font-pixel text-xs">
              <span className="text-[#a594c9] text-[10px] block">
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
                    className="bg-[#160c2b] p-2 border border-[#432874] text-center rounded-xs shadow-[1px_1px_0px_#000]"
                  >
                    <span className="text-[9px] text-[#a594c9] block">
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
            <div className="bg-[#160c2b] border border-[#432874] p-3 space-y-2 rounded-xs shadow-[1px_1px_0px_#000]">
              <div className="flex items-center justify-between border-b border-[#432874] pb-1.5 font-pixel">
                <h4 className="text-[11px] text-[#ffbe00] font-bold flex items-center gap-1.5">
                  <Sparkle size={13} className="text-[#38bdf8]" />{" "}
                  ESPECIFICACIÓN DE PEGADO & REFLECTIVA
                </h4>
                <span className="text-[10px] text-[#38bdf8] font-bold">
                  {detailItem.pegado_nombre || "SIN PEGADO"}
                </span>
              </div>

              {detailItem.pegado_nombre ? (
                <div className="grid grid-cols-3 gap-2 pt-1 font-pixel text-xs">
                  <div className="bg-[#24173e] p-2 border border-[#432874] rounded-2xs">
                    <span className="text-[9px] text-[#a594c9] block mb-0.5">
                      REFLECTIVA:
                    </span>
                    <strong className="text-white text-[11px] block truncate">
                      {detailItem.reflectiva || "NINGUNA"}
                    </strong>
                  </div>

                  <div className="bg-[#24173e] p-2 border border-[#432874] rounded-2xs">
                    <span className="text-[9px] text-[#a594c9] block mb-0.5">
                      PROTECTOR ORAJET:
                    </span>
                    <strong
                      className={
                        detailItem.protector_orajet
                          ? "text-[#24cc8f] text-[11px] block"
                          : "text-[#f87171] text-[11px] block"
                      }
                    >
                      {detailItem.protector_orajet ? "SÍ" : "NO"}
                    </strong>
                  </div>

                  {/* LÓGICA DE APLICACIÓN EXIGIDA: "NO APLICA" SI NO LLEVA ORAJET */}
                  <div className="bg-[#24173e] p-2 border border-[#432874] rounded-2xs">
                    <span className="text-[9px] text-[#a594c9] block mb-0.5">
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
                <p className="text-[11px] text-[#6e588a] font-pixel py-1.5 text-center">
                  Este semielaborado no tiene una configuración de pegado
                  asignada.
                </p>
              )}
            </div>

            <div className="pt-2 border-t border-[#432874] flex justify-end font-pixel">
              <button
                onClick={() => setDetailItem(null)}
                className="px-4 py-1.5 bg-[#ffbe00] text-[#2c1a4d] font-bold text-xs hover:bg-[#ffe066] shadow-[2px_2px_0px_#000] rounded-xs"
              >
                CERRAR FICHA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AUDITORÍA GOOGLE SHEETS */}
      {previewData && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-[100] flex items-center justify-center p-2 sm:p-3 animate-in fade-in duration-200 font-mono">
          <div className="bg-[#24173e] border-2 border-[#ffbe00] w-full max-w-2xl p-4 sm:p-5 shadow-[0_0_35px_rgba(255,190,0,0.25)] space-y-3 sm:space-y-4 relative rounded-xs max-h-[90vh] flex flex-col">
            <button
              onClick={() => setPreviewData(null)}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 text-[#a594c9] hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b border-[#432874] pb-2 shrink-0">
              <span className="text-[9px] sm:text-[10px] font-pixel text-[#24cc8f] bg-[#24cc8f]/10 px-2 py-0.5 border border-[#24cc8f]/30 rounded-xs font-bold">
                AUDITORÍA DE DEPÓSITOS
              </span>
              <h3 className="font-pixel text-xs sm:text-sm text-white font-bold mt-1.5 flex items-center gap-1.5">
                <Sparkles size={15} className="text-[#ffbe00]" /> INSPECCIÓN DE
                SEMIELABORADOS (SHEETS)
              </h3>
            </div>

            {previewData.nuevos.length === 0 &&
            previewData.modificados.length === 0 ? (
              <div className="py-8 text-center space-y-2 font-pixel my-auto">
                <CheckCircle2 size={32} className="mx-auto text-[#24cc8f]" />
                <p className="text-white text-xs font-bold">
                  ¡DEPÓSITOS TOTALMENTE AL DÍA!
                </p>
                <p className="text-[11px] text-[#a594c9]">
                  No se detectaron discrepancias en los 4 depósitos.
                </p>
              </div>
            ) : (
              <div className="space-y-3 font-pixel flex-1 overflow-y-auto pr-1">
                <div className="bg-[#160c2b] border border-[#432874] p-2.5 sm:p-3 space-y-2 rounded-xs shadow-[2px_2px_0px_#000]">
                  <div className="flex items-center justify-between border-b border-[#432874] pb-2">
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
                        className="w-4 h-4 accent-[#ffbe00]"
                      />
                      <span className="text-[#ffbe00] font-bold text-xs flex items-center gap-1.5">
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
                          className="p-2 border border-[#ffbe00]/50 bg-[#2c1a4d] flex justify-between items-center text-xs"
                        >
                          <strong className="text-[#ffbe00]">
                            [{n.codigo}] {n.nombre}
                          </strong>
                          <span className="text-[10px] text-[#24cc8f]">
                            33:{n.stock_33} | 26:{n.stock_26} | AYO:
                            {n.stock_ayolas} | 37:{n.stock_37}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-[#160c2b] border border-[#432874] p-2.5 sm:p-3 space-y-2 rounded-xs shadow-[2px_2px_0px_#000]">
                  <div className="flex items-center justify-between border-b border-[#432874] pb-2">
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
                        className="w-4 h-4 accent-[#38bdf8]"
                      />
                      <span className="text-[#38bdf8] font-bold text-xs flex items-center gap-1.5">
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
                          className="p-2 border border-[#38bdf8]/50 bg-[#2c1a4d] flex justify-between items-center text-xs"
                        >
                          <strong className="text-[#ffbe00]">
                            [{m.codigo}] {m.nombre}
                          </strong>
                          <span className="text-[10px] text-white">
                            33: {m.actual.stock_33} →{" "}
                            <strong className="text-[#38bdf8]">
                              {m.nuevo.stock_33}
                            </strong>{" "}
                            | 26: {m.actual.stock_26} →{" "}
                            <strong className="text-[#38bdf8]">
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

            <div className="pt-2.5 border-t border-[#432874] flex justify-between items-center shrink-0 font-pixel">
              <button
                onClick={() => setPreviewData(null)}
                className="px-3.5 py-1.5 border border-[#432874] text-[#a594c9] hover:text-white text-xs rounded-xs"
              >
                CANCELAR
              </button>

              {(previewData.nuevos.length > 0 ||
                previewData.modificados.length > 0) && (
                <button
                  onClick={handleApplySync}
                  className="px-4 py-1.5 bg-[#ffbe00] text-[#2c1a4d] font-bold text-xs hover:bg-[#ffe066] shadow-[2px_2px_0px_#000] rounded-xs flex items-center gap-1.5"
                >
                  <CheckCircle2 size={14} /> APLICAR CAMBIOS
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
