import { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Edit2,
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
  Cpu,
  Package,
} from "lucide-react";

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [recipesList, setRecipesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [search, setSearch] = useState("");

  // AUDITORÍA GOOGLE SHEETS
  const [previewData, setPreviewData] = useState(null);
  const [includeNuevos, setIncludeNuevos] = useState(true);
  const [includeModificados, setIncludeModificados] = useState(true);
  const [selectedNuevos, setSelectedNuevos] = useState([]);
  const [selectedModificados, setSelectedModificados] = useState([]);

  // ORDENAMIENTO
  const [sortColumn, setSortColumn] = useState("codigo");
  const [sortDirection, setSortDirection] = useState("asc");

  // PAGINACIÓN Y CÁLCULO DINÁMICO DE FILAS
  const tableContainerRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // MODALES Y SUB-MODAL DE BÚSQUEDA DE PRODUCTOS
  const [editingItem, setEditingItem] = useState(null);
  const [newStockValue, setNewStockValue] = useState("");
  const [detailItem, setDetailItem] = useState(null);
  const [usageModalOpen, setUsageModalOpen] = useState(false);
  const [usageSearch, setUsageSearch] = useState("");

  // CÁLCULO AUTOMÁTICO DE FILAS VISIBLES EN TABLA
  useEffect(() => {
    const updatePageSize = () => {
      if (!tableContainerRef.current) return;
      const containerHeight = tableContainerRef.current.clientHeight;
      const headerHeight = 40;
      const rowHeight = 40;
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

  // CARGAR CATÁLOGO LOCAL Y RECETAS (OPTIMIZADO EN 2 SOLICITUDES UNIFICADAS)
  const fetchItems = async () => {
    setLoading(true);
    try {
      const [resMP, resRecipes] = await Promise.all([
        fetch("http://localhost:3001/api/materias-primas"),
        fetch("http://localhost:3001/api/ingenierias/recetas-activas-bulk"),
      ]);

      if (resMP.ok) setItems(await resMP.json());
      if (resRecipes.ok) setRecipesList(await resRecipes.json());
    } catch (err) {
      console.error("Error al cargar datos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  // SINCRONIZACIÓN GOOGLE SHEETS
  const handleStartSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch(
        "http://localhost:3001/api/materias-primas/previsualizar-sheets",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
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
      alert("Error al conectar con el backend.");
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
        "http://localhost:3001/api/materias-primas/aplicar-sincronizacion",
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

  const toggleNuevoItem = (codigo) => {
    if (selectedNuevos.includes(codigo)) {
      setSelectedNuevos(selectedNuevos.filter((c) => c !== codigo));
    } else {
      setSelectedNuevos([...selectedNuevos, codigo]);
    }
  };

  const toggleModificadoItem = (id) => {
    if (selectedModificados.includes(id)) {
      setSelectedModificados(selectedModificados.filter((i) => i !== id));
    } else {
      setSelectedModificados([...selectedModificados, id]);
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

  const processedItems = useMemo(() => {
    let result = items.filter(
      (item) =>
        item.codigo.toLowerCase().includes(search.toLowerCase()) ||
        item.nombre.toLowerCase().includes(search.toLowerCase()),
    );

    if (sortColumn) {
      result.sort((a, b) => {
        let aVal = a[sortColumn];
        let bVal = b[sortColumn];

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
  }, [items, search, sortColumn, sortDirection]);

  const totalPages = Math.ceil(processedItems.length / itemsPerPage) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return processedItems.slice(start, start + itemsPerPage);
  }, [processedItems, currentPage, itemsPerPage]);

  const emptySlotsCount = Math.max(0, itemsPerPage - paginatedItems.length);

  // RECETAS VINCULADAS AL INSUMO SELECCIONADO
  const detailItemUsage = useMemo(() => {
    if (!detailItem) return [];
    return recipesList.filter((r) =>
      r.ingredientes.some(
        (ing) =>
          ing.item_codigo === detailItem.codigo ||
          ing.item_nombre === detailItem.nombre,
      ),
    );
  }, [detailItem, recipesList]);

  // LISTADO FILTRADO EN TIEMPO REAL DENTRO DEL SUB-MODAL
  const filteredUsageList = useMemo(() => {
    return detailItemUsage.filter(
      (u) =>
        u.productCode.toLowerCase().includes(usageSearch.toLowerCase()) ||
        u.productName.toLowerCase().includes(usageSearch.toLowerCase()),
    );
  }, [detailItemUsage, usageSearch]);

  const handleSaveStock = async () => {
    if (!editingItem) return;
    const val = parseFloat(newStockValue);
    if (isNaN(val)) return alert("Ingresá un número válido");

    try {
      const res = await fetch(
        `http://localhost:3001/api/materias-primas/${editingItem.id}/stock`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stock: val }),
        },
      );

      if (res.ok) {
        setEditingItem(null);
        fetchItems();
      }
    } catch (err) {
      alert("Error al actualizar stock.");
    }
  };

  return (
    <div className="h-full flex flex-col font-mono text-[#e1d7f5] select-none space-y-2 sm:space-y-3 min-h-0 bg-[#1a0f2e] p-1 overflow-hidden">
      {/* 1. HEADER */}
      <div className="flex flex-row items-center justify-between pb-2 sm:pb-3 border-b-2 border-[#432874] gap-2 shrink-0">
        <div>
          <h2 className="font-pixel text-sm sm:text-lg text-[#ffbe00] font-bold flex items-center gap-1.5 sm:gap-2 tracking-wide drop-shadow-[1px_1px_0px_#000]">
            <Shield size={16} className="text-[#24cc8f] shrink-0" /> INVENTARIO
            DE MATERIAS PRIMAS
          </h2>
          <p className="text-[10px] sm:text-xs text-[#a594c9] mt-0.5 font-mono hidden sm:block">
            Gremio de Insumos y Materiales de Producción.
          </p>
        </div>

        <button
          onClick={handleStartSync}
          disabled={isSyncing}
          className="px-2.5 sm:px-3.5 py-1.5 bg-[#2c1a4d] border-2 border-[#432874] text-[#a594c9] hover:text-[#ffbe00] hover:border-[#ffbe00]/60 shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all rounded-xs flex items-center gap-1.5 font-pixel text-[11px] sm:text-xs shrink-0"
          title="Sincronizar con Google Sheets"
        >
          <RefreshCw
            size={13}
            className={`transition-transform duration-500 ${isSyncing ? "animate-spin text-[#ffbe00]" : ""}`}
          />
          <span>SINCRONIZAR</span>
        </button>
      </div>

      {/* 2. PANEL PRINCIPAL */}
      <div className="flex-1 bg-[#24173e] border-2 border-[#432874] p-2 sm:p-3 flex flex-col min-h-0 shadow-[4px_4px_0px_#000] relative rounded-xs overflow-hidden">
        {/* BUSCADOR */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 mb-2 sm:mb-3 shrink-0">
          <div className="relative w-full sm:max-w-sm">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a594c9]"
            />
            <input
              type="text"
              placeholder="Buscar por código o insumo..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-[#160c2b] border-2 border-[#432874] text-xs text-white pl-8 pr-3 py-1.5 focus:outline-none focus:border-[#ffbe00] transition-colors placeholder:text-[#6e588a] rounded-xs"
            />
          </div>

          <div className="bg-[#160c2b] border border-[#432874] px-2.5 py-1 text-[10px] sm:text-[11px] font-pixel text-[#a594c9] shrink-0 rounded-xs flex items-center justify-between sm:justify-start gap-1.5">
            <span className="flex items-center gap-1">
              {isSyncing && (
                <Sparkles size={11} className="text-[#ffbe00] animate-pulse" />
              )}
              INSUMOS TOTALES:
            </span>
            <strong className="text-[#24cc8f]">
              {processedItems.length} / {items.length}
            </strong>
          </div>
        </div>

        {/* 3. VISTA ESCRITORIO CON RANURAS PERFECTAS */}
        <div
          ref={tableContainerRef}
          className="hidden md:flex flex-1 border-2 border-[#432874] bg-[#160c2b] min-h-0 flex-col overflow-hidden rounded-xs"
        >
          <table className="w-full text-left text-xs border-collapse table-fixed">
            <thead>
              <tr className="text-[#a594c9] border-b-2 border-[#432874] font-pixel text-[11px] bg-[#2c1a4d] sticky top-0 z-10 h-[40px]">
                <th
                  onClick={() => handleSort("codigo")}
                  className="w-2/12 px-3 font-normal cursor-pointer hover:bg-[#39215e] hover:text-[#ffbe00] transition-colors select-none"
                >
                  <div className="flex items-center justify-between pr-2">
                    <span>CÓDIGO</span>
                    <span className="w-4 flex justify-center shrink-0">
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
                  className="w-5/12 px-3 font-normal cursor-pointer hover:bg-[#39215e] hover:text-[#ffbe00] transition-colors select-none"
                >
                  <div className="flex items-center justify-between pr-2">
                    <span>MATERIA PRIMA</span>
                    <span className="w-4 flex justify-center shrink-0">
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
                  onClick={() => handleSort("unidad_medida")}
                  className="w-2/12 px-3 font-normal text-center cursor-pointer hover:bg-[#39215e] hover:text-[#ffbe00] transition-colors select-none"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>UNIDAD</span>
                    <span className="w-4 flex justify-center shrink-0">
                      {sortColumn === "unidad_medida" ? (
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
                  onClick={() => handleSort("stock_actual")}
                  className="w-2/12 px-3 font-normal text-right cursor-pointer hover:bg-[#39215e] hover:text-[#ffbe00] transition-colors select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>STOCK</span>
                    <span className="w-4 flex justify-center shrink-0">
                      {sortColumn === "stock_actual" ? (
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

                <th className="w-1/12 px-3 font-normal text-center">EDITAR</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#432874]/30 bg-[#160c2b]">
              {loading ? (
                <tr>
                  <td
                    colSpan="5"
                    className="py-16 text-center font-pixel text-xs text-[#ffbe00] animate-pulse"
                  >
                    Consultando inventario de insumos...
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td
                    colSpan="5"
                    className="py-16 text-center font-pixel text-xs text-[#6e588a]"
                  >
                    No hay insumos registrados.
                  </td>
                </tr>
              ) : (
                <>
                  {paginatedItems.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setDetailItem(item)}
                      className="h-[40px] hover:bg-[#281747] transition-colors group align-middle cursor-pointer"
                    >
                      <td className="px-3 font-pixel text-[#ffbe00] font-bold tracking-wider truncate align-middle group-hover:underline">
                        {item.codigo}
                      </td>

                      <td className="px-3 text-white font-bold truncate align-middle">
                        {item.nombre}
                      </td>

                      <td className="px-3 text-center text-[#a594c9] text-[11px] font-pixel uppercase truncate align-middle">
                        {item.unidad_medida || "Kg"}
                      </td>

                      <td className="px-3 text-right font-pixel truncate align-middle">
                        <span
                          className={`font-bold ${item.stock_actual <= 0 ? "text-[#f87171] bg-[#450a0a]/50 px-2 py-0.5 border border-[#7f1d1d]" : "text-[#24cc8f]"}`}
                        >
                          {item.stock_actual.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </td>

                      <td className="px-3 text-center align-middle">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingItem(item);
                            setNewStockValue(item.stock_actual);
                          }}
                          className="p-1 bg-[#2c1a4d] border border-[#432874] text-[#a594c9] hover:text-[#ffbe00] hover:border-[#ffbe00] transition-all shadow-[1px_1px_0px_#000] inline-flex items-center justify-center active:translate-x-[1px] active:translate-y-[1px] rounded-xs"
                          title="Editar Stock"
                        >
                          <Edit2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {Array.from({ length: emptySlotsCount }).map((_, idx) => (
                    <tr
                      key={`empty-${idx}`}
                      className="h-[40px] opacity-15 pointer-events-none"
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
                      <td className="px-3 text-right text-[#432874] text-[10px]">
                        --
                      </td>
                      <td className="px-3 text-center text-[#432874] text-[10px]">
                        --
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* 4. VISTA MOBILE CORREGIDA */}
        <div className="flex md:hidden flex-1 flex-col overflow-y-auto min-h-0 space-y-2 pr-0.5">
          {loading ? (
            <div className="py-12 text-center font-pixel text-xs text-[#ffbe00] animate-pulse">
              Consultando insumos...
            </div>
          ) : paginatedItems.length === 0 ? (
            <div className="py-12 text-center font-pixel text-xs text-[#6e588a]">
              Sin materias primas.
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
                  <span className="text-[10px] font-pixel text-[#a594c9] uppercase bg-[#24173e] px-2 py-0.5 border border-[#432874]">
                    {item.unidad_medida || "Kg"}
                  </span>
                </div>

                <div className="text-white font-bold text-xs break-words">
                  {item.nombre}
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#432874]/40">
                  <span className="text-[11px] font-pixel text-[#a594c9]">
                    Stock:{" "}
                    <strong
                      className={
                        item.stock_actual <= 0
                          ? "text-[#f87171]"
                          : "text-[#24cc8f]"
                      }
                    >
                      {item.stock_actual.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </strong>
                  </span>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingItem(item);
                      setNewStockValue(item.stock_actual);
                    }}
                    className="px-2.5 py-1 bg-[#2c1a4d] border border-[#432874] text-[#ffbe00] font-pixel text-[10px] font-bold flex items-center gap-1 active:translate-y-0.5 rounded-xs"
                  >
                    <Edit2 size={11} /> EDITAR
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* PAGINACIÓN */}
        <div className="flex flex-col sm:flex-row items-center justify-between pt-2.5 mt-2 border-t-2 border-[#432874] shrink-0 text-xs font-pixel gap-2">
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

      {/* =========================================================
          MODAL 1: FICHA PRINCIPAL DE MATERIA PRIMA (COMPACTA)
      ========================================================= */}
      {detailItem && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-[100] flex items-center justify-center p-3 animate-in fade-in duration-200 font-mono">
          <div className="bg-[#24173e] border-2 border-[#ffbe00] w-full max-w-md p-5 shadow-[0_0_35px_rgba(255,190,0,0.3)] space-y-4 relative rounded-xs">
            <button
              onClick={() => setDetailItem(null)}
              className="absolute top-4 right-4 text-[#a594c9] hover:text-white"
            >
              <X size={16} />
            </button>

            {/* HEADER DE LA FICHA */}
            <div className="border-b-2 border-[#432874] pb-3">
              <span className="text-[10px] font-pixel text-[#ffbe00] bg-[#ffbe00]/10 px-2 py-0.5 border border-[#ffbe00]/30 rounded-xs font-bold">
                FICHA DE MATERIA PRIMA
              </span>
              <h3 className="font-pixel text-base text-white font-bold mt-2 flex items-center gap-2">
                <Package size={18} className="text-[#24cc8f]" /> [
                {detailItem.codigo}]
              </h3>
              <p className="text-xs text-[#a594c9] font-bold mt-0.5">
                {detailItem.nombre}
              </p>
            </div>

            {/* ESTADÍSTICAS DEL INSUMO */}
            <div className="grid grid-cols-2 gap-2 font-pixel text-xs">
              <div className="bg-[#160c2b] p-2.5 border border-[#432874] rounded-xs shadow-[1px_1px_0px_#000]">
                <span className="text-[10px] text-[#a594c9] block mb-1">
                  STOCK ACTUAL:
                </span>
                <strong
                  className={`text-sm ${detailItem.stock_actual <= 0 ? "text-[#f87171]" : "text-[#24cc8f]"}`}
                >
                  {detailItem.stock_actual.toLocaleString()}{" "}
                  {detailItem.unidad_medida || "Kg"}
                </strong>
              </div>

              <div className="bg-[#160c2b] p-2.5 border border-[#432874] rounded-xs shadow-[1px_1px_0px_#000]">
                <span className="text-[10px] text-[#a594c9] block mb-1">
                  PRESENTE EN:
                </span>
                <strong className="text-[#38bdf8] text-sm font-bold flex items-center gap-1">
                  <Cpu size={14} /> {detailItemUsage.length} Recetas
                </strong>
              </div>
            </div>

            {/* BOTÓN ACCIONABLE DE CONSULTA DE PRODUCTOS */}
            <div className="bg-[#160c2b] border border-[#432874] p-3 rounded-xs shadow-[1px_1px_0px_#000] space-y-2">
              <div className="flex justify-between items-center font-pixel">
                <span className="text-[11px] text-[#a594c9] flex items-center gap-1.5">
                  <Layers size={14} className="text-[#38bdf8]" /> USO EN PLANTA:
                </span>
                <span className="text-xs text-[#ffbe00] font-bold">
                  {detailItemUsage.length} Productos
                </span>
              </div>

              <button
                onClick={() => {
                  setUsageSearch("");
                  setUsageModalOpen(true);
                }}
                disabled={detailItemUsage.length === 0}
                className="w-full py-2 bg-[#2c1a4d] border-2 border-[#432874] text-[#38bdf8] hover:text-[#ffbe00] hover:border-[#ffbe00] font-pixel text-xs font-bold transition-all shadow-[2px_2px_0px_#000] active:translate-y-0.5 rounded-xs flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
              >
                <Search size={13} />
                <span>VER LISTADO Y FILTRAR PRODUCTOS</span>
              </button>
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

      {/* =========================================================
          MODAL 2: SUB-MODAL DEDICADO DE BÚSQUEDA (ALTURA RÍGIDA INAMOVIBLE h-[80vh])
      ========================================================= */}
      {usageModalOpen && detailItem && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xs z-[110] flex items-center justify-center p-3 animate-in fade-in duration-200 font-mono">
          <div className="bg-[#24173e] border-2 border-[#38bdf8] w-full max-w-lg h-[80vh] min-h-[480px] p-5 shadow-[0_0_40px_rgba(56,189,248,0.25)] space-y-3 relative rounded-xs flex flex-col">
            <button
              onClick={() => setUsageModalOpen(false)}
              className="absolute top-4 right-4 text-[#a594c9] hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b-2 border-[#432874] pb-2 shrink-0">
              <span className="text-[10px] font-pixel text-[#38bdf8] bg-[#38bdf8]/10 px-2 py-0.5 border border-[#38bdf8]/30 rounded-xs font-bold">
                PRODUCTOS Y SEMIELABORADOS VINCULADOS
              </span>
              <h3 className="font-pixel text-sm text-white font-bold mt-1.5 flex items-center gap-2">
                <Package size={16} className="text-[#24cc8f]" /> [
                {detailItem.codigo}]
              </h3>
            </div>

            {/* BUSCADOR EN TIEMPO REAL */}
            <div className="relative shrink-0 font-pixel">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a594c9]"
              />
              <input
                type="text"
                placeholder="Filtrar por código o nombre de producto..."
                value={usageSearch}
                onChange={(e) => setUsageSearch(e.target.value)}
                className="w-full bg-[#160c2b] border-2 border-[#432874] text-xs text-white pl-8 pr-3 py-1.5 focus:outline-none focus:border-[#38bdf8] transition-colors rounded-xs"
                autoFocus
              />
            </div>

            {/* LISTA CON SCROLL INTERNO Y ALTURA COMPLETA QUE NUNCA SE ACHICA */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-0 font-pixel text-xs">
              {filteredUsageList.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-[#6e588a] font-pixel text-xs">
                  No se encontraron productos coincidentes.
                </div>
              ) : (
                filteredUsageList.map((u, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-[#160c2b] border border-[#432874] flex justify-between items-center rounded-2xs hover:border-[#38bdf8]/60 transition-colors shadow-[1px_1px_0px_#000]"
                  >
                    <div className="truncate pr-2">
                      <span className="text-[#ffbe00] font-bold block truncate text-[11px]">
                        [{u.productCode}]
                      </span>
                      <span className="text-white font-bold truncate block text-xs">
                        {u.productName}
                      </span>
                    </div>
                    <span className="text-[9px] text-[#24cc8f] bg-[#24cc8f]/10 border border-[#24cc8f]/30 px-2 py-0.5 shrink-0 font-bold">
                      {u.version}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* FOOTER DEL SUB-MODAL */}
            <div className="pt-2 border-t border-[#432874] flex justify-between items-center shrink-0 font-pixel text-xs">
              <span className="text-[#a594c9] text-[10px]">
                Mostrando{" "}
                <strong className="text-white">
                  {filteredUsageList.length}
                </strong>{" "}
                de{" "}
                <strong className="text-white">{detailItemUsage.length}</strong>
              </span>
              <button
                onClick={() => setUsageModalOpen(false)}
                className="px-4 py-1.5 bg-[#38bdf8] text-[#2c1a4d] font-bold text-xs hover:bg-[#7dd3fc] shadow-[2px_2px_0px_#000] rounded-xs"
              >
                VOLVER
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDICIÓN MANUAL DE STOCK */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-[100] flex items-center justify-center p-3 animate-in fade-in duration-150 font-mono">
          <div className="bg-[#24173e] border-2 border-[#ffbe00] w-full max-w-sm p-5 shadow-[0_0_25px_rgba(255,190,0,0.2)] space-y-4 relative rounded-xs">
            <button
              onClick={() => setEditingItem(null)}
              className="absolute top-3 right-3 text-[#a594c9] hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b border-[#432874] pb-2">
              <span className="text-[10px] font-pixel text-[#ffbe00] bg-[#ffbe00]/10 px-2 py-0.5 border border-[#ffbe00]/30 rounded-xs">
                AJUSTE DE CANTIDAD
              </span>
              <h3 className="font-pixel text-sm text-white font-bold mt-2">
                [{editingItem.codigo}]
              </h3>
              <p className="text-xs text-[#a594c9] font-bold truncate">
                {editingItem.nombre}
              </p>
            </div>

            <div className="space-y-2 text-xs font-pixel">
              <label className="text-[#a594c9] block">
                VALOR EN STOCK ({editingItem.unidad_medida || "Kg"}):
              </label>
              <input
                type="number"
                step="0.01"
                value={newStockValue}
                onChange={(e) => setNewStockValue(e.target.value)}
                className="w-full bg-[#160c2b] border-2 border-[#432874] p-2 text-white font-bold text-right focus:outline-none focus:border-[#ffbe00] text-sm rounded-xs"
                autoFocus
              />
            </div>

            <div className="pt-2 border-t border-[#432874] flex justify-end gap-2 font-pixel">
              <button
                onClick={() => setEditingItem(null)}
                className="px-3 py-1.5 border border-[#432874] text-[#a594c9] hover:text-white text-xs rounded-xs"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveStock}
                className="px-4 py-1.5 bg-[#ffbe00] text-[#2c1a4d] font-bold text-xs hover:bg-[#ffe066] shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] rounded-xs"
              >
                CONFIRMAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AUDITORÍA SHEETS */}
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
                AUDITORÍA Y SINCRONIZACIÓN
              </span>
              <h3 className="font-pixel text-xs sm:text-sm text-white font-bold mt-1.5 flex items-center gap-1.5 sm:gap-2">
                <Sparkles size={15} className="text-[#ffbe00] shrink-0" />{" "}
                INSPECCIÓN DE CAMBIOS GOOGLE SHEETS
              </h3>
            </div>

            {previewData.nuevos.length === 0 &&
            previewData.modificados.length === 0 ? (
              <div className="py-8 text-center space-y-2 font-pixel my-auto">
                <CheckCircle2 size={32} className="mx-auto text-[#24cc8f]" />
                <p className="text-white text-xs font-bold">
                  ¡NO SE ENCONTRARON DIFERENCIAS!
                </p>
                <p className="text-[11px] text-[#a594c9]">
                  Tu base de datos coincide perfectamente con el archivo de
                  Google Sheets.
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
                        className="w-4 h-4 rounded-2xs border border-[#432874] bg-[#24173e] accent-[#ffbe00] cursor-pointer"
                      />
                      <span className="text-[#ffbe00] font-bold text-xs flex items-center gap-1.5">
                        <Plus size={14} /> 1. AGREGAR MATERIAS PRIMAS NUEVAS (
                        {previewData.nuevos.length})
                      </span>
                    </label>
                  </div>

                  {!includeNuevos ? (
                    <p className="text-[10px] sm:text-[11px] text-[#6e588a] italic p-1">
                      Omite la creación de nuevos insumos.
                    </p>
                  ) : previewData.nuevos.length === 0 ? (
                    <p className="text-[10px] sm:text-[11px] text-[#a594c9] p-1">
                      No hay insumos nuevos para agregar.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {previewData.nuevos.map((n) => {
                        const isChecked = selectedNuevos.includes(n.codigo);
                        return (
                          <div
                            key={n.codigo}
                            onClick={() => toggleNuevoItem(n.codigo)}
                            className={`p-2 border flex items-center justify-between text-xs cursor-pointer transition-colors ${isChecked ? "border-[#ffbe00]/50 bg-[#2c1a4d] text-white" : "border-[#432874]/50 bg-[#160c2b] text-[#6e588a]"}`}
                          >
                            <div className="flex items-center gap-2 truncate pr-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="w-3.5 h-3.5 accent-[#ffbe00]"
                              />
                              <strong className="text-[#ffbe00] font-bold">
                                [{n.codigo}]
                              </strong>
                              <span className="truncate">{n.nombre}</span>
                            </div>
                            <span className="text-[10px] bg-[#24173e] px-1.5 py-0.5 border border-[#432874] text-[#24cc8f] shrink-0 font-bold">
                              Stock: {n.stock_nuevo} {n.unidad}
                            </span>
                          </div>
                        );
                      })}
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
                        className="w-4 h-4 rounded-2xs border border-[#432874] bg-[#24173e] accent-[#ffbe00] cursor-pointer"
                      />
                      <span className="text-[#38bdf8] font-bold text-xs flex items-center gap-1.5">
                        <Layers size={14} /> 2. ACTUALIZAR STOCKS EXISTENTES (
                        {previewData.modificados.length})
                      </span>
                    </label>
                  </div>

                  {!includeModificados ? (
                    <p className="text-[10px] sm:text-[11px] text-[#6e588a] italic p-1">
                      Mantiene los stocks actuales en la base de datos sin
                      alterar.
                    </p>
                  ) : previewData.modificados.length === 0 ? (
                    <p className="text-[10px] sm:text-[11px] text-[#a594c9] p-1">
                      No hay diferencias de stock encontradas.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {previewData.modificados.map((m) => {
                        const isChecked = selectedModificados.includes(m.id);
                        return (
                          <div
                            key={m.id}
                            onClick={() => toggleModificadoItem(m.id)}
                            className={`p-2 border flex items-center justify-between text-xs cursor-pointer transition-colors ${isChecked ? "border-[#38bdf8]/50 bg-[#2c1a4d] text-white" : "border-[#432874]/50 bg-[#160c2b] text-[#6e588a]"}`}
                          >
                            <div className="flex items-center gap-2 truncate pr-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="w-3.5 h-3.5 accent-[#38bdf8]"
                              />
                              <strong className="text-[#ffbe00] font-bold">
                                [{m.codigo}]
                              </strong>
                              <span className="truncate">{m.nombre}</span>
                            </div>

                            <div className="text-right shrink-0 flex items-center gap-1.5">
                              <span className="text-[10px] text-[#a594c9] hidden sm:inline">
                                {m.stock_actual} →{" "}
                                <strong className="text-white">
                                  {m.stock_nuevo}
                                </strong>
                              </span>
                              {m.diferencia > 0 ? (
                                <span className="text-[#24cc8f] text-[10px] font-bold bg-[#24cc8f]/10 px-1.5 py-0.5 border border-[#24cc8f]/30 flex items-center gap-0.5">
                                  <TrendingUp size={10} /> +
                                  {m.diferencia.toFixed(1)}
                                </span>
                              ) : (
                                <span className="text-[#f87171] text-[10px] font-bold bg-[#450a0a]/50 px-1.5 py-0.5 border border-[#7f1d1d] flex items-center gap-0.5">
                                  <TrendingDown size={10} />{" "}
                                  {m.diferencia.toFixed(1)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
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
