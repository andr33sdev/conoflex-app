import { useState, useEffect, useRef } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Layers,
  CheckSquare,
  Square,
} from "lucide-react";

const TABS = [
  { id: "general", label: "STOCK GENERAL" },
  { id: "stock_33", label: "STOCK 33" },
  { id: "stock_26", label: "STOCK 26" },
  { id: "stock_ayolas", label: "STOCK AYOLAS" },
  { id: "stock_37", label: "STOCK 37" },
];

const ROW_HEIGHT = 44;

export default function Semielaborados() {
  const [dbItems, setDbItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState("general");

  const tableContainerRef = useRef(null);
  const tableHeaderRef = useRef(null);
  const [itemsPerPage, setItemsPerPage] = useState(5);

  const [selectedWarehouses, setSelectedWarehouses] = useState({
    stock_33: false,
    stock_26: false,
    stock_ayolas: false,
    stock_37: false,
  });

  useEffect(() => {
    if (!tableContainerRef.current) return;

    const calculatePageSize = () => {
      if (!tableContainerRef.current) return;
      const containerHeight = tableContainerRef.current.clientHeight;
      const headerHeight = tableHeaderRef.current
        ? tableHeaderRef.current.offsetHeight
        : 40;
      const availableHeight = containerHeight - headerHeight;

      const calculatedItems = Math.floor(availableHeight / ROW_HEIGHT);
      setItemsPerPage(Math.max(1, calculatedItems));
    };

    const observer = new ResizeObserver(calculatePageSize);
    observer.observe(tableContainerRef.current);
    calculatePageSize();

    return () => observer.disconnect();
  }, [loading, activeTab]);

  const fetchSemielaborados = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:3001/api/semielaborados");
      const data = await res.json();
      setDbItems(data);
    } catch (err) {
      console.error("Error cargando semielaborados:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSemielaborados();
  }, []);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setCurrentPage(1);
  };

  const toggleWarehouse = (whKey) => {
    setSelectedWarehouses((prev) => ({ ...prev, [whKey]: !prev[whKey] }));
  };

  const getDisplayedStock = (item) => {
    if (activeTab === "general") {
      let sum = 0;
      if (selectedWarehouses.stock_33) sum += item.stock_33 || 0;
      if (selectedWarehouses.stock_26) sum += item.stock_26 || 0;
      if (selectedWarehouses.stock_ayolas) sum += item.stock_ayolas || 0;
      if (selectedWarehouses.stock_37) sum += item.stock_37 || 0;
      return sum;
    } else {
      return item[activeTab] || 0;
    }
  };

  const filteredItems = dbItems.filter((item) => {
    const term = searchTerm.toLowerCase();
    return (
      (item.nombre && item.nombre.toLowerCase().includes(term)) ||
      (item.codigo && item.codigo.toLowerCase().includes(term))
    );
  });

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage) || 1;
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentPaginatedItems = filteredItems.slice(
    indexOfFirstItem,
    indexOfLastItem,
  );

  const renderPegadoBadge = (item) => {
    const hasReflectiva = item.reflectiva && item.reflectiva !== "NINGUNA";
    const hasOrajet = item.protector_orajet === 1;

    if (!hasReflectiva && !hasOrajet) {
      return (
        <span className="px-2.5 py-0.5 border border-[#1E2842] bg-[#111625] text-slate-500 font-pixel text-[10px]">
          [ SIN PEGADO ]
        </span>
      );
    }

    let reflectivaLabel =
      item.reflectiva === "CHINA_3M" ? "CHINA 3M" : item.reflectiva;
    let reflectivaStyle =
      item.reflectiva === "PROGRAF"
        ? "bg-[#00E5FF]/10 text-[#00E5FF] border-[#00E5FF]/40"
        : "bg-blue-500/10 text-blue-400 border-blue-500/40";

    return (
      <div className="flex items-center justify-center gap-1.5 font-pixel text-[10px] inline-flex">
        {hasReflectiva && (
          <span className={`px-2 py-0.5 border font-bold ${reflectivaStyle}`}>
            {reflectivaLabel}
          </span>
        )}

        {hasOrajet && (
          <span className="px-2 py-0.5 border bg-[#FF5500]/10 text-[#FF5500] border-[#FF5500]/40 font-bold">
            ORAJET{" "}
            {item.aplicacion_protector === "UNION_PUNTAS"
              ? "(PUNTAS)"
              : "(COMP)"}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col font-mono text-white min-h-0 select-none space-y-3">
      {/* PESTAÑAS DE DEPÓSITO */}
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-[#1E2842] pb-1 shrink-0">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`
                px-4 py-1.5 font-pixel text-xs tracking-wider border-2 transition-all
                ${
                  isActive
                    ? "bg-[#FF5500] text-black font-bold border-white shadow-[2px_2px_0px_#000] -translate-y-0.5"
                    : "bg-[#0E1322] border-[#1E2842] text-slate-400 hover:text-white hover:border-[#FF5500]"
                }
              `}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* CONTROLES Y CHECKBOXES */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#0E1322] p-2.5 border border-[#1E2842] shrink-0">
        {activeTab === "general" ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-pixel text-[#FF5500] font-bold uppercase mr-1">
              SUMAR STOCKS:
            </span>

            {[
              { key: "stock_33", label: "STOCK 33" },
              { key: "stock_26", label: "STOCK 26" },
              { key: "stock_ayolas", label: "STOCK AYOLAS" },
              { key: "stock_37", label: "STOCK 37" },
            ].map((wh) => (
              <button
                key={wh.key}
                onClick={() => toggleWarehouse(wh.key)}
                className={`
                  flex items-center gap-1.5 px-2 py-1 border font-pixel text-xs transition-colors
                  ${
                    selectedWarehouses[wh.key]
                      ? "bg-[#FF5500]/20 border-[#FF5500] text-white"
                      : "bg-[#111625] border-[#1E2842] text-slate-400 hover:text-white"
                  }
                `}
              >
                {selectedWarehouses[wh.key] ? (
                  <CheckSquare size={14} className="text-[#FF5500]" />
                ) : (
                  <Square size={14} />
                )}
                <span>{wh.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-400 flex items-center gap-2 font-pixel">
            <Layers size={16} className="text-[#FF5500]" />
            <span>
              SUCURSAL:{" "}
              <strong className="text-white uppercase">
                {activeTab.replace("stock_", "")}
              </strong>
            </span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-60">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Filtrar por código o nombre..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full bg-[#111625] border border-[#1E2842] text-xs text-white pl-8 pr-3 py-1.5 focus:border-[#FF5500] focus:outline-none"
            />
          </div>

          <div className="text-xs font-pixel bg-[#111625] border border-[#1E2842] px-3 py-1.5 text-[#00E5FF] whitespace-nowrap">
            ITEMS: {filteredItems.length} / {dbItems.length}
          </div>
        </div>
      </div>

      {/* CONTENEDOR PRINCIPAL RESPONSIVO */}
      <div className="flex-1 overflow-hidden min-h-0">
        <div className="bg-[#0E1322] border-2 border-[#1E2842] shadow-2xl h-full flex flex-col justify-between overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-400 font-pixel">
              Cargando semielaborados...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-pixel">
              {searchTerm
                ? `Sin coincidencias para "${searchTerm}"`
                : "No hay semielaborados disponibles."}
            </div>
          ) : (
            <>
              <div
                className="flex-1 overflow-hidden flex flex-col"
                ref={tableContainerRef}
              >
                <table className="w-full text-left text-xs border-collapse table-fixed">
                  <thead
                    className="bg-[#161C2E] border-b-2 border-[#1E2842]"
                    ref={tableHeaderRef}
                  >
                    <tr className="text-[#00E5FF] font-pixel text-sm">
                      <th className="p-3 border-r border-[#1E2842] w-36">
                        Código
                      </th>
                      <th className="p-3 border-r border-[#1E2842]">
                        Semielaborado / Artículo
                      </th>
                      {activeTab === "general" && (
                        <th className="p-3 border-r border-[#1E2842] text-center w-32">
                          Demanda / Mes
                        </th>
                      )}
                      {activeTab === "general" && (
                        <th className="p-3 border-r border-[#1E2842] text-center w-28">
                          Días Stock
                        </th>
                      )}
                      <th className="p-3 border-r border-[#1E2842] text-right w-36">
                        {activeTab === "general"
                          ? "Stock Sumado"
                          : "Stock Sucursal"}
                      </th>
                      <th className="p-3 text-center w-52">Pegado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2842]/60">
                    {currentPaginatedItems.map((item) => {
                      const stockVal = getDisplayedStock(item);
                      let diasColor = "text-slate-500";
                      if (item.dias_stock !== null) {
                        if (item.dias_stock <= 15)
                          diasColor =
                            "bg-red-500/20 text-red-500 border border-red-500/50";
                        else if (item.dias_stock <= 30)
                          diasColor =
                            "bg-amber-500/20 text-amber-500 border border-amber-500/50";
                        else
                          diasColor =
                            "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50";
                      }
                      return (
                        <tr
                          key={item.id}
                          className="h-[44px] max-h-[44px] hover:bg-[#161C2E]/50 text-slate-200 transition-colors overflow-hidden"
                        >
                          <td className="px-3 py-2 border-r border-[#1E2842]/40 font-pixel text-[#FF5500] font-bold whitespace-nowrap truncate">
                            {item.codigo}
                          </td>
                          <td
                            className="px-3 py-2 border-r border-[#1E2842]/40 font-bold text-white whitespace-nowrap truncate"
                            title={item.nombre}
                          >
                            {item.nombre}
                          </td>
                          {activeTab === "general" && (
                            <td className="px-3 py-2 border-r border-[#1E2842]/40 text-center font-pixel font-bold whitespace-nowrap">
                              {item.demanda_mensual > 0 ? (
                                item.demanda_mensual
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>
                          )}
                          {activeTab === "general" && (
                            <td className="px-3 py-2 border-r border-[#1E2842]/40 text-center font-pixel font-bold whitespace-nowrap">
                              {item.dias_stock !== null ? (
                                <span className={`px-2 py-0.5 ${diasColor}`}>
                                  {item.dias_stock}
                                </span>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>
                          )}
                          <td className="px-3 py-2 border-r border-[#1E2842]/40 text-right font-pixel text-sm text-white font-bold whitespace-nowrap">
                            {stockVal}
                          </td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            {renderPegadoBadge(item)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* PAGINACIÓN */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-[#111625] border-t-2 border-[#1E2842] font-pixel text-xs shrink-0">
                <div className="text-slate-400">
                  Mostrando{" "}
                  <span className="text-white font-bold">
                    {indexOfFirstItem + 1}
                  </span>{" "}
                  -{" "}
                  <span className="text-white font-bold">
                    {Math.min(indexOfLastItem, filteredItems.length)}
                  </span>{" "}
                  de{" "}
                  <span className="text-[#FF5500] font-bold">
                    {filteredItems.length}
                  </span>{" "}
                  ítems
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="p-1.5 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20 transition-all"
                  >
                    <ChevronsLeft size={14} />
                  </button>

                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(prev - 1, 1))
                    }
                    disabled={currentPage === 1}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20 transition-all"
                  >
                    <ChevronLeft size={14} />
                    <span>ANT</span>
                  </button>

                  <div className="px-3 py-1 bg-black border border-[#1E2842] text-[#FF5500] font-bold text-sm">
                    {currentPage} / {totalPages}
                  </div>

                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                    }
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20 transition-all"
                  >
                    <span>SIG</span>
                    <ChevronRight size={14} />
                  </button>

                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="p-1.5 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20 transition-all"
                  >
                    <ChevronsRight size={14} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
