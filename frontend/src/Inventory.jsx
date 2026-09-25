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

  // CARGAR CATÁLOGO LOCAL Y RECETAS
  const fetchItems = async () => {
    setLoading(true);
    try {
      const [resMP, resRecipes] = await Promise.all([
        fetch("/api/materias-primas"),
        fetch("/api/ingenierias/recetas-activas-bulk"),
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
      const res = await fetch("/api/materias-primas/previsualizar-sheets", {
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
      const res = await fetch("/api/materias-primas/aplicar-sincronizacion", {
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
      const res = await fetch(`/api/materias-primas/${editingItem.id}/stock`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock: val }),
      });

      if (res.ok) {
        setEditingItem(null);
        fetchItems();
      }
    } catch (err) {
      alert("Error al actualizar stock.");
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#070a12] border border-slate-800/80 rounded-2xl font-sans text-slate-200 shadow-2xl overflow-hidden backdrop-blur-2xl p-5 space-y-4">
      {/* 1. HEADER DE MÓDULO */}
      <div className="bg-[#0f172a]/70 border-b border-slate-800/80 p-4 flex flex-wrap items-center justify-between gap-4 shrink-0 backdrop-blur-xl rounded-2xl">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.15)]">
            <Shield size={20} className="text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xs font-bold text-white tracking-widest uppercase font-mono">
                INVENTARIO DE MATERIAS PRIMAS
              </h2>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-mono flex items-center gap-1.5 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />{" "}
                LIVE DATA
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Gremio de Insumos y Materiales de Producción
            </p>
          </div>
        </div>

        <button
          onClick={handleStartSync}
          disabled={isSyncing}
          className="px-3.5 py-2 bg-slate-900 border border-slate-700 hover:border-amber-400 text-slate-300 hover:text-amber-400 rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer font-mono text-xs font-bold shrink-0 disabled:opacity-50"
          title="Sincronizar con Google Sheets"
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

      {/* 2. PANEL PRINCIPAL */}
      <div className="flex-1 min-h-0 bg-[#0e1422] border border-slate-800/80 rounded-2xl p-4 flex flex-col space-y-3 shadow-xl">
        {/* BUSCADOR Y CONTADOR */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 w-full max-w-md">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              type="text"
              placeholder="Buscar por código o insumo..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-[#070a12] border border-slate-800 text-xs text-slate-100 pl-10 pr-4 py-2 focus:border-amber-500/50 outline-none rounded-xl font-sans"
            />
          </div>

          <div className="bg-[#070a12] border border-slate-800 px-3.5 py-1.5 text-xs font-mono text-slate-400 shrink-0 rounded-xl flex items-center justify-between sm:justify-start gap-2">
            <span className="flex items-center gap-1.5">
              {isSyncing && (
                <Sparkles size={12} className="text-amber-400 animate-pulse" />
              )}
              INSUMOS TOTALES:
            </span>
            <strong className="text-emerald-400 font-bold">
              {processedItems.length} / {items.length}
            </strong>
          </div>
        </div>

        {/* 3. VISTA ESCRITORIO CON TABLA CYBER-INDUSTRIAL */}
        <div
          ref={tableContainerRef}
          className="hidden md:flex flex-1 border border-slate-800 bg-[#070a12] min-h-0 flex-col overflow-hidden rounded-xl"
        >
          <table className="w-full text-left text-xs border-collapse table-fixed">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800 font-mono text-[10px] uppercase tracking-wider bg-[#0e1422] sticky top-0 z-10 h-[40px]">
                <th
                  onClick={() => handleSort("codigo")}
                  className="w-2/12 px-3 font-semibold cursor-pointer hover:bg-slate-800/80 hover:text-amber-400 transition-colors select-none"
                >
                  <div className="flex items-center justify-between pr-2">
                    <span>CÓDIGO</span>
                    <span className="w-4 flex justify-center shrink-0">
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
                  className="w-5/12 px-3 font-semibold cursor-pointer hover:bg-slate-800/80 hover:text-amber-400 transition-colors select-none"
                >
                  <div className="flex items-center justify-between pr-2">
                    <span>MATERIA PRIMA</span>
                    <span className="w-4 flex justify-center shrink-0">
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
                  onClick={() => handleSort("unidad_medida")}
                  className="w-2/12 px-3 font-semibold text-center cursor-pointer hover:bg-slate-800/80 hover:text-amber-400 transition-colors select-none"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>UNIDAD</span>
                    <span className="w-4 flex justify-center shrink-0">
                      {sortColumn === "unidad_medida" ? (
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
                  onClick={() => handleSort("stock_actual")}
                  className="w-2/12 px-3 font-semibold text-right cursor-pointer hover:bg-slate-800/80 hover:text-amber-400 transition-colors select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>STOCK</span>
                    <span className="w-4 flex justify-center shrink-0">
                      {sortColumn === "stock_actual" ? (
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

                <th className="w-1/12 px-3 font-semibold text-center">
                  EDITAR
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/50 bg-[#070a12]">
              {loading ? (
                <tr>
                  <td
                    colSpan="5"
                    className="py-16 text-center font-mono text-xs text-amber-400 animate-pulse"
                  >
                    Consultando inventario de insumos...
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td
                    colSpan="5"
                    className="py-16 text-center font-mono text-xs text-slate-500"
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
                      className="h-[40px] hover:bg-[#121824]/80 transition-colors group align-middle cursor-pointer"
                    >
                      <td className="px-3 font-mono font-bold text-amber-400 truncate align-middle group-hover:underline">
                        {item.codigo}
                      </td>

                      <td className="px-3 text-slate-100 font-bold truncate align-middle">
                        {item.nombre}
                      </td>

                      <td className="px-3 text-center text-slate-400 text-[11px] font-mono uppercase truncate align-middle">
                        {item.unidad_medida || "Kg"}
                      </td>

                      <td className="px-3 text-right font-mono truncate align-middle">
                        <span
                          className={`font-bold ${
                            item.stock_actual <= 0
                              ? "text-rose-400 bg-rose-500/10 px-2 py-0.5 border border-rose-500/30 rounded-md"
                              : "text-emerald-400"
                          }`}
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
                          className="p-1.5 bg-slate-900 border border-slate-700 text-slate-300 hover:text-amber-400 hover:border-amber-400/60 transition-all rounded-lg cursor-pointer inline-flex items-center justify-center"
                          title="Editar Stock"
                        >
                          <Edit2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {Array.from({ length: emptySlotsCount }).map((_, idx) => (
                    <tr
                      key={`empty-${idx}`}
                      className="h-[40px] opacity-20 pointer-events-none"
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
                      <td className="px-3 text-right text-slate-700 text-[10px]">
                        --
                      </td>
                      <td className="px-3 text-center text-slate-700 text-[10px]">
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
              Consultando insumos...
            </div>
          ) : paginatedItems.length === 0 ? (
            <div className="py-12 text-center font-mono text-xs text-slate-500">
              Sin materias primas.
            </div>
          ) : (
            paginatedItems.map((item) => (
              <div
                key={item.id}
                onClick={() => setDetailItem(item)}
                className="bg-[#070a12] border border-slate-800 p-3.5 rounded-xl space-y-2.5 shrink-0 cursor-pointer active:scale-[0.99] transition-transform shadow-md"
              >
                <div className="flex justify-between items-center">
                  <span className="font-mono text-amber-400 font-bold text-xs">
                    [{item.codigo}]
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 uppercase bg-[#0e1422] px-2 py-0.5 border border-slate-800 rounded-md">
                    {item.unidad_medida || "Kg"}
                  </span>
                </div>

                <div className="text-white font-bold text-xs break-words">
                  {item.nombre}
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-slate-800/80">
                  <span className="text-[11px] font-mono text-slate-400">
                    Stock:{" "}
                    <strong
                      className={
                        item.stock_actual <= 0
                          ? "text-rose-400"
                          : "text-emerald-400"
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
                    className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-amber-400 font-mono text-[10px] font-bold flex items-center gap-1 rounded-lg"
                  >
                    <Edit2 size={11} /> EDITAR
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 5. PAGINACIÓN */}
        <div className="flex flex-col sm:flex-row items-center justify-between pt-2.5 border-t border-slate-800 shrink-0 text-xs font-mono text-slate-400 gap-2">
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

      {/* =========================================================
          MODAL 1: FICHA PRINCIPAL DE MATERIA PRIMA
      ========================================================= */}
      {detailItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200 font-sans">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-5 relative text-xs">
            <button
              onClick={() => setDetailItem(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X size={18} />
            </button>

            {/* HEADER DE LA FICHA */}
            <div className="border-b border-slate-800 pb-3">
              <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 border border-amber-500/20 rounded-full">
                FICHA DE MATERIA PRIMA
              </span>
              <h3 className="text-base text-white font-bold mt-2 flex items-center gap-2 font-mono">
                <Package size={18} className="text-emerald-400" /> [
                {detailItem.codigo}]
              </h3>
              <p className="text-xs text-slate-300 font-bold mt-0.5">
                {detailItem.nombre}
              </p>
            </div>

            {/* ESTADÍSTICAS DEL INSUMO */}
            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div className="bg-[#070a12] p-3 border border-slate-800 rounded-xl space-y-1">
                <span className="text-[10px] text-slate-400 block">
                  STOCK ACTUAL:
                </span>
                <strong
                  className={`text-sm block ${
                    detailItem.stock_actual <= 0
                      ? "text-rose-400"
                      : "text-emerald-400"
                  }`}
                >
                  {detailItem.stock_actual.toLocaleString()}{" "}
                  {detailItem.unidad_medida || "Kg"}
                </strong>
              </div>

              <div className="bg-[#070a12] p-3 border border-slate-800 rounded-xl space-y-1">
                <span className="text-[10px] text-slate-400 block">
                  PRESENTE EN:
                </span>
                <strong className="text-cyan-400 text-sm font-bold flex items-center gap-1.5">
                  <Cpu size={14} /> {detailItemUsage.length} Recetas
                </strong>
              </div>
            </div>

            {/* BOTÓN ACCIONABLE DE CONSULTA DE PRODUCTOS */}
            <div className="bg-[#070a12] border border-slate-800 p-3.5 rounded-xl space-y-2.5">
              <div className="flex justify-between items-center font-mono">
                <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Layers size={14} className="text-cyan-400" /> USO EN PLANTA:
                </span>
                <span className="text-xs text-amber-400 font-bold">
                  {detailItemUsage.length} Productos
                </span>
              </div>

              <button
                onClick={() => {
                  setUsageSearch("");
                  setUsageModalOpen(true);
                }}
                disabled={detailItemUsage.length === 0}
                className="w-full py-2.5 bg-[#0e1422] hover:bg-slate-900 border border-slate-700 text-cyan-400 hover:border-cyan-400 font-mono text-xs font-bold transition-all rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:pointer-events-none shadow"
              >
                <Search size={14} />
                <span>VER LISTADO Y FILTRAR PRODUCTOS</span>
              </button>
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

      {/* =========================================================
          MODAL 2: SUB-MODAL DEDICADO DE BÚSQUEDA
      ========================================================= */}
      {usageModalOpen && detailItem && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-xs z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200 font-sans">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-lg h-[80vh] min-h-[480px] p-6 shadow-2xl space-y-4 relative rounded-2xl flex flex-col">
            <button
              onClick={() => setUsageModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="border-b border-slate-800 pb-3 shrink-0">
              <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 border border-cyan-500/20 rounded-full">
                PRODUCTOS Y SEMIELABORADOS VINCULADOS
              </span>
              <h3 className="font-mono text-sm text-white font-bold mt-2 flex items-center gap-2">
                <Package size={16} className="text-emerald-400" /> [
                {detailItem.codigo}]
              </h3>
            </div>

            {/* BUSCADOR EN TIEMPO REAL */}
            <div className="relative shrink-0 font-sans">
              <Search
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="text"
                placeholder="Filtrar por código o nombre de producto..."
                value={usageSearch}
                onChange={(e) => setUsageSearch(e.target.value)}
                className="w-full bg-[#070a12] border border-slate-800 text-xs text-white pl-10 pr-4 py-2 focus:border-cyan-500/50 outline-none rounded-xl"
                autoFocus
              />
            </div>

            {/* LISTA CON SCROLL INTERNO */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0 text-xs font-sans">
              {filteredUsageList.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 font-mono text-xs">
                  No se encontraron productos coincidentes.
                </div>
              ) : (
                filteredUsageList.map((u, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-[#070a12] border border-slate-800 flex justify-between items-center rounded-xl hover:border-cyan-500/50 transition-colors shadow-sm"
                  >
                    <div className="truncate pr-2 space-y-0.5">
                      <span className="text-amber-400 font-mono font-bold block truncate text-[11px]">
                        [{u.productCode}]
                      </span>
                      <span className="text-slate-100 font-bold truncate block text-xs">
                        {u.productName}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md shrink-0 font-bold">
                      {u.version}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* FOOTER DEL SUB-MODAL */}
            <div className="pt-3 border-t border-slate-800 flex justify-between items-center shrink-0 font-mono text-xs">
              <span className="text-slate-400 text-[11px]">
                Mostrando{" "}
                <strong className="text-white">
                  {filteredUsageList.length}
                </strong>{" "}
                de{" "}
                <strong className="text-white">{detailItemUsage.length}</strong>
              </span>
              <button
                onClick={() => setUsageModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                VOLVER
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDICIÓN MANUAL DE STOCK */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150 font-sans">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-sm p-6 rounded-2xl shadow-2xl space-y-4 relative text-xs">
            <button
              onClick={() => setEditingItem(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="border-b border-slate-800 pb-3">
              <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 border border-amber-500/20 rounded-full">
                AJUSTE DE CANTIDAD
              </span>
              <h3 className="font-mono text-sm text-white font-bold mt-2">
                [{editingItem.codigo}]
              </h3>
              <p className="text-xs text-slate-300 font-bold truncate">
                {editingItem.nombre}
              </p>
            </div>

            <div className="space-y-2 font-mono">
              <label className="text-slate-400 block text-[11px]">
                VALOR EN STOCK ({editingItem.unidad_medida || "Kg"}):
              </label>
              <input
                type="number"
                step="0.01"
                value={newStockValue}
                onChange={(e) => setNewStockValue(e.target.value)}
                className="w-full bg-[#070a12] border border-slate-800 p-2.5 text-emerald-400 font-bold text-right focus:outline-none focus:border-amber-500/50 text-sm rounded-xl font-mono"
                autoFocus
              />
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2 font-mono">
              <button
                onClick={() => setEditingItem(null)}
                className="px-3.5 py-2 border border-slate-800 text-slate-400 hover:text-white text-xs rounded-xl transition cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveStock}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition cursor-pointer"
              >
                CONFIRMAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AUDITORÍA SHEETS */}
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
                AUDITORÍA Y SINCRONIZACIÓN
              </span>
              <h3 className="font-mono text-sm text-white font-bold mt-2 flex items-center gap-2">
                <Sparkles size={16} className="text-amber-400 shrink-0" />{" "}
                INSPECCIÓN DE CAMBIOS GOOGLE SHEETS
              </h3>
            </div>

            {previewData.nuevos.length === 0 &&
            previewData.modificados.length === 0 ? (
              <div className="py-12 text-center space-y-2 font-mono my-auto">
                <CheckCircle2 size={36} className="mx-auto text-emerald-400" />
                <p className="text-white text-xs font-bold">
                  ¡NO SE ENCONTRARON DIFERENCIAS!
                </p>
                <p className="text-[11px] text-slate-400">
                  Tu base de datos coincide perfectamente con el archivo de
                  Google Sheets.
                </p>
              </div>
            ) : (
              <div className="space-y-4 font-mono flex-1 overflow-y-auto pr-1">
                {/* 1. SECCIÓN NUEVOS INSUMOS */}
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
                        <Plus size={14} /> 1. AGREGAR MATERIAS PRIMAS NUEVAS (
                        {previewData.nuevos.length})
                      </span>
                    </label>
                  </div>

                  {!includeNuevos ? (
                    <p className="text-[11px] text-slate-500 italic p-1">
                      Omite la creación de nuevos insumos.
                    </p>
                  ) : previewData.nuevos.length === 0 ? (
                    <p className="text-[11px] text-slate-400 p-1">
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
                            className={`p-2.5 border rounded-lg flex items-center justify-between text-xs cursor-pointer transition-colors ${
                              isChecked
                                ? "border-amber-500/50 bg-[#0e1422] text-white"
                                : "border-slate-800/80 bg-[#070a12] text-slate-500"
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate pr-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="w-3.5 h-3.5 accent-amber-500"
                              />
                              <strong className="text-amber-400 font-bold">
                                [{n.codigo}]
                              </strong>
                              <span className="truncate">{n.nombre}</span>
                            </div>
                            <span className="text-[10px] bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/20 text-emerald-400 shrink-0 font-bold rounded-md">
                              Stock: {n.stock_nuevo} {n.unidad}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 2. SECCIÓN STOCKS MODIFICADOS */}
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
                        <Layers size={14} /> 2. ACTUALIZAR STOCKS EXISTENTES (
                        {previewData.modificados.length})
                      </span>
                    </label>
                  </div>

                  {!includeModificados ? (
                    <p className="text-[11px] text-slate-500 italic p-1">
                      Mantiene los stocks actuales en la base de datos sin
                      alterar.
                    </p>
                  ) : previewData.modificados.length === 0 ? (
                    <p className="text-[11px] text-slate-400 p-1">
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
                            className={`p-2.5 border rounded-lg flex items-center justify-between text-xs cursor-pointer transition-colors ${
                              isChecked
                                ? "border-cyan-500/50 bg-[#0e1422] text-white"
                                : "border-slate-800/80 bg-[#070a12] text-slate-500"
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate pr-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="w-3.5 h-3.5 accent-cyan-500"
                              />
                              <strong className="text-amber-400 font-bold">
                                [{m.codigo}]
                              </strong>
                              <span className="truncate">{m.nombre}</span>
                            </div>

                            <div className="text-right shrink-0 flex items-center gap-2">
                              <span className="text-[10px] text-slate-400 hidden sm:inline">
                                {m.stock_actual} →{" "}
                                <strong className="text-white">
                                  {m.stock_nuevo}
                                </strong>
                              </span>
                              {m.diferencia > 0 ? (
                                <span className="text-emerald-400 text-[10px] font-bold bg-emerald-500/10 px-1.5 py-0.5 border border-emerald-500/20 rounded-md flex items-center gap-0.5">
                                  <TrendingUp size={10} /> +
                                  {m.diferencia.toFixed(1)}
                                </span>
                              ) : (
                                <span className="text-rose-400 text-[10px] font-bold bg-rose-500/10 px-1.5 py-0.5 border border-rose-500/20 rounded-md flex items-center gap-0.5">
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
