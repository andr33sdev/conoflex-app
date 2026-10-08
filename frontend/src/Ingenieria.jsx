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
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Boxes,
  FileCode2,
  Sparkle,
  Anvil,
  Package,
  DownloadCloud,
} from "lucide-react";

export default function Ingenieria() {
  const [activeTab, setActiveTab] = useState("SE");
  const [itemsSE, setItemsSE] = useState([]);
  const [itemsPT, setItemsPT] = useState([]);
  const [materiasPrimas, setMateriasPrimas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncingPT, setIsSyncingPT] = useState(false);
  const [search, setSearch] = useState("");

  const [sortColumn, setSortColumn] = useState("codigo");
  const [sortDirection, setSortDirection] = useState("asc");

  const tableContainerRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [selectedParent, setSelectedParent] = useState(null);
  const [parentRecipes, setParentRecipes] = useState([]);
  const [loadingRecipes, setLoadingRecipes] = useState(false);

  const [isBuilderOpen, setIsFormBuilderOpen] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState(null);
  const [recipeForm, setRecipeForm] = useState({
    nombre_version: "",
    es_activa: true,
    ingredientes: [],
  });

  const [builderCatalogType, setBuilderCatalogType] = useState("MP");
  const [builderCatalogSearch, setBuilderCatalogSearch] = useState("");

  // CÁLCULO DE FILAS EXACTAS (48px DE ALTURA)
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

  const fetchBaseData = async () => {
    setLoading(true);
    try {
      const [resSE, resPT, resMP] = await Promise.all([
        fetch("/api/semielaborados"),
        fetch("/api/productos-terminados"),
        fetch("/api/materias-primas"),
      ]);

      if (resSE.ok) setItemsSE(await resSE.json());
      if (resPT.ok) setItemsPT(await resPT.json());
      if (resMP.ok) setMateriasPrimas(await resMP.json());
    } catch (err) {
      console.error("Error al cargar listados de ingeniería:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBaseData();
  }, []);

  const handleSyncPT = async () => {
    setIsSyncingPT(true);
    try {
      const res = await fetch("/api/productos-terminados/sincronizar-ventas", {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok && data.success) {
        alert(
          `¡Sincronización exitosa! Se procesaron ${data.count} modelos de productos terminados.`,
        );
        fetchBaseData();
      } else {
        alert("Error: " + (data.error || "No se pudo sincronizar las ventas."));
      }
    } catch (error) {
      alert("Error de conexión al sincronizar Ventas.");
    } finally {
      setIsSyncingPT(false);
    }
  };

  const fetchRecipesForParent = async (parent) => {
    setLoadingRecipes(true);
    const endpoint =
      parent.type === "SE"
        ? `/api/ingenierias/semielaborado/${parent.id}`
        : `/api/ingenierias/producto-terminado/${parent.id}`;

    try {
      const res = await fetch(endpoint);
      if (res.ok) {
        setParentRecipes(await res.json());
      }
    } catch (err) {
      console.error("Error al cargar recetas del producto:", err);
    } finally {
      setLoadingRecipes(false);
    }
  };

  const handleOpenParentModal = (item, type) => {
    const parentObj = { ...item, type };
    setSelectedParent(parentObj);
    fetchRecipesForParent(parentObj);
  };

  const handleSetActiveRecipe = async (recipeId) => {
    if (!selectedParent) return;

    try {
      const res = await fetch(`/api/ingenierias/${recipeId}/activar`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parent_id: selectedParent.id,
          parent_type: selectedParent.type,
        }),
      });

      if (res.ok) {
        fetchRecipesForParent(selectedParent);
        fetchBaseData();
      }
    } catch (err) {
      alert("Error al activar receta.");
    }
  };

  const handleDeleteRecipe = async (recipeId) => {
    if (!confirm("¿Eliminar esta versión de ingeniería?")) return;

    try {
      const res = await fetch(`/api/ingenierias/${recipeId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchRecipesForParent(selectedParent);
        fetchBaseData();
      }
    } catch (err) {
      alert("Error al eliminar la versión.");
    }
  };

  const handleOpenBuilder = (recipeToEdit = null) => {
    if (recipeToEdit) {
      setEditingRecipeId(recipeToEdit.id);
      setRecipeForm({
        nombre_version: recipeToEdit.nombre_version,
        es_activa: Boolean(recipeToEdit.es_activa),
        ingredientes: recipeToEdit.ingredientes.map((i) => ({ ...i })),
      });
    } else {
      setEditingRecipeId(null);
      setRecipeForm({
        nombre_version: `Receta v${parentRecipes.length + 1}`,
        es_activa: parentRecipes.length === 0,
        ingredientes: [],
      });
    }
    setBuilderCatalogType("MP");
    setBuilderCatalogSearch("");
    setIsFormBuilderOpen(true);
  };

  const handleQuickAddMaterial = (item, type) => {
    const exists = recipeForm.ingredientes.some(
      (ing) =>
        (type === "MP" && ing.materia_prima_id === item.id) ||
        (type === "SE" && ing.semielaborado_id === item.id),
    );

    if (exists) return;

    const newEntry = {
      item_type: type,
      materia_prima_id: type === "MP" ? item.id : null,
      semielaborado_id: type === "SE" ? item.id : null,
      item_codigo: item.codigo,
      item_nombre: item.nombre,
      cantidad: 1,
      unidad_medida:
        item.unidad_medida || (type === "MP" ? "KILOS" : "UNIDADES"),
    };

    setRecipeForm({
      ...recipeForm,
      ingredientes: [...recipeForm.ingredientes, newEntry],
    });
  };

  const handleUpdateIngredientQty = (index, newQty) => {
    const val = parseFloat(newQty);
    const updated = [...recipeForm.ingredientes];
    updated[index].cantidad = isNaN(val) ? 0 : val;
    setRecipeForm({ ...recipeForm, ingredientes: updated });
  };

  const handleRemoveIngredient = (index) => {
    const updated = [...recipeForm.ingredientes];
    updated.splice(index, 1);
    setRecipeForm({ ...recipeForm, ingredientes: updated });
  };

  const handleSaveRecipe = async () => {
    if (!recipeForm.nombre_version.trim())
      return alert("Ingresá un nombre de versión.");
    if (recipeForm.ingredientes.length === 0)
      return alert("Agregá al menos un material a la mesa de crafteo.");

    const payload = {
      parent_id: selectedParent.id,
      parent_type: selectedParent.type,
      nombre_version: recipeForm.nombre_version.trim(),
      es_activa: recipeForm.es_activa,
      ingredientes: recipeForm.ingredientes,
    };

    try {
      const url = editingRecipeId
        ? `/api/ingenierias/${editingRecipeId}`
        : "/api/ingenierias";
      const method = editingRecipeId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsFormBuilderOpen(false);
        fetchRecipesForParent(selectedParent);
        fetchBaseData();
      } else {
        alert("Error al guardar la versión de ingeniería.");
      }
    } catch (err) {
      alert("Error al conectar con el servidor.");
    }
  };

  const currentList = activeTab === "SE" ? itemsSE : itemsPT;

  const processedItems = useMemo(() => {
    let result = currentList.filter(
      (item) =>
        item.codigo.toLowerCase().includes(search.toLowerCase()) ||
        item.nombre.toLowerCase().includes(search.toLowerCase()),
    );

    if (sortColumn) {
      result.sort((a, b) => {
        let aVal = a[sortColumn];
        let bVal = b[sortColumn];

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
  }, [currentList, search, sortColumn, sortDirection]);

  const availableCatalogItems = useMemo(() => {
    const source = builderCatalogType === "MP" ? materiasPrimas : itemsSE;
    return source.filter(
      (item) =>
        item.codigo
          .toLowerCase()
          .includes(builderCatalogSearch.toLowerCase()) ||
        item.nombre.toLowerCase().includes(builderCatalogSearch.toLowerCase()),
    );
  }, [builderCatalogType, builderCatalogSearch, materiasPrimas, itemsSE]);

  const handleSort = (columnKey) => {
    if (sortColumn === columnKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(columnKey);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

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
            Ingeniería <span className="text-[#FF5A00]">& BOM</span>
          </h1>
          <p className="text-zinc-500 text-sm mt-2 max-w-md uppercase tracking-widest font-bold flex items-center gap-2">
            LABORATORIO DE FÓRMULAS TÉCNICAS Y RECETAS
          </p>
        </div>

        <div className="flex items-center gap-3 z-10 w-full md:w-auto">
          {activeTab === "PT" && (
            <button
              onClick={handleSyncPT}
              disabled={isSyncingPT}
              className="flex items-center justify-between gap-3 px-6 py-3 font-bold text-xs uppercase tracking-widest transition-all bg-[#FFD700] hover:bg-white text-black active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <DownloadCloud
                size={16}
                className={isSyncingPT ? "animate-bounce" : ""}
                strokeWidth={3}
              />
              SINCRONIZAR VENTAS
            </button>
          )}

          <button
            onClick={fetchBaseData}
            className="p-3 bg-black border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer"
            title="Recargar catálogo"
          >
            <RefreshCw
              size={16}
              className={loading ? "animate-spin text-[#FF5A00]" : ""}
            />
          </button>
        </div>
      </div>

      {/* 2. PANEL DE FILTROS & BÚSQUEDA */}
      <div className="px-4 py-4 md:px-8 border-b border-zinc-800/50 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 bg-black relative z-20">
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto flex-1">
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

          {/* TABS DE MÓDULO */}
          <div className="flex items-center gap-0 w-full sm:w-auto border border-zinc-800 bg-[#050505]">
            <button
              onClick={() => {
                setActiveTab("SE");
                setCurrentPage(1);
              }}
              className={`px-5 py-2.5 text-xs font-bold transition-all cursor-pointer whitespace-nowrap uppercase tracking-widest border-r border-zinc-800 ${
                activeTab === "SE"
                  ? "bg-[#FF5A00] text-black"
                  : "text-zinc-500 hover:text-white hover:bg-zinc-900"
              }`}
            >
              SEMIELABORADOS ({itemsSE.length})
            </button>

            <button
              onClick={() => {
                setActiveTab("PT");
                setCurrentPage(1);
              }}
              className={`px-5 py-2.5 text-xs font-bold transition-all cursor-pointer whitespace-nowrap uppercase tracking-widest ${
                activeTab === "PT"
                  ? "bg-[#FF5A00] text-black"
                  : "text-zinc-500 hover:text-white hover:bg-zinc-900"
              }`}
            >
              PRODUCTOS TERMINADOS ({itemsPT.length})
            </button>
          </div>
        </div>

        {/* CONTADOR TOTAL */}
        <div className="border border-zinc-800 px-4 py-2.5 text-[10px] md:text-xs text-zinc-500   tracking-widest flex items-center gap-2 bg-[#050505] uppercase font-bold w-full sm:w-auto justify-between shrink-0">
          <span className="flex items-center gap-1.5">TOTAL REGISTROS:</span>
          <strong className="text-white">
            {processedItems.length} / {currentList.length}
          </strong>
        </div>
      </div>

      {/* 3. VISTA ESCRITORIO (GRILLA 48px) */}
      <div className="hidden md:flex flex-1 flex-col p-4 md:p-8 bg-black min-h-0 justify-between overflow-hidden">
        <div
          ref={tableContainerRef}
          className="flex-1 min-h-0 w-full flex flex-col justify-start"
        >
          <div className="w-full border border-zinc-800/90 bg-[#030303] flex flex-col overflow-hidden shadow-2xl h-fit">
            {/* CABECERA INDUSTRIAL (h-12) */}
            <div className="grid grid-cols-[220px_1fr_180px_180px] h-12 bg-[#080808] border-b border-zinc-800/90 items-center text-zinc-400   text-[10px] font-extrabold uppercase tracking-widest shrink-0 select-none">
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
                <span>ARTÍCULO / PRODUCTO</span>
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
                onClick={() => handleSort("recetas_count")}
                className="px-3 flex items-center justify-center gap-1 cursor-pointer hover:text-[#FF5A00] transition-colors"
              >
                <span>FÓRMULAS</span>
                {sortColumn === "recetas_count" ? (
                  sortDirection === "asc" ? (
                    <ArrowUp size={12} className="text-[#FF5A00]" />
                  ) : (
                    <ArrowDown size={12} className="text-[#FF5A00]" />
                  )
                ) : (
                  <ArrowUpDown size={10} className="text-zinc-700" />
                )}
              </div>

              <div className="px-4 flex justify-center text-center">
                INGENIERÍA
              </div>
            </div>

            {/* FILAS DE LA TABLA */}
            <div className="flex flex-col bg-black">
              {loading ? (
                <div className="py-12 flex justify-center text-[#FF5A00]">
                  <RefreshCw className="animate-spin" size={28} />
                </div>
              ) : paginatedItems.length === 0 ? (
                <div className="py-12 text-center text-zinc-600 font-bold uppercase tracking-widest text-xs">
                  No se encontraron registros.
                </div>
              ) : (
                paginatedItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleOpenParentModal(item, activeTab)}
                    className="grid grid-cols-[220px_1fr_180px_180px] h-12 items-center border-b border-zinc-900/80 last:border-b-0 hover:bg-[#0a0a0a] transition-colors duration-150 group cursor-pointer text-xs shrink-0"
                  >
                    <div className="px-4   font-bold truncate">
                      <span className="text-[#FF5A00] bg-[#FF5A00]/10 border border-[#FF5A00]/25 px-2 py-0.5 text-xs group-hover:bg-[#FF5A00] group-hover:text-black transition-colors inline-block max-w-full truncate">
                        {item.codigo}
                      </span>
                    </div>

                    <div className="px-4 text-white font-bold text-xs truncate pr-2">
                      {item.nombre}
                    </div>

                    <div className="px-3 flex justify-center   text-[10px] uppercase font-bold tracking-widest">
                      <span
                        className={`px-2.5 py-0.5 border ${
                          item.recetas_count > 0
                            ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                            : "text-zinc-500 border-zinc-800 bg-black"
                        }`}
                      >
                        {item.recetas_count || 0} Versiones
                      </span>
                    </div>

                    <div className="px-4 flex justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenParentModal(item, activeTab);
                        }}
                        className="px-3 py-1 bg-black border border-zinc-800 hover:border-[#FF5A00] text-zinc-300 hover:text-[#FF5A00]   text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <FileCode2 size={13} /> ABRIR FÓRMULAS
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* PAGINACIÓN DESKTOP */}
        {processedItems.length > 0 && (
          <div className="mt-4 flex items-center justify-between   text-xs text-zinc-500 shrink-0">
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
            Sin registros.
          </div>
        ) : (
          paginatedItems.map((item) => (
            <div
              key={item.id}
              onClick={() => handleOpenParentModal(item, activeTab)}
              className="bg-[#050505] border border-zinc-800/80 p-4 space-y-3 shrink-0 cursor-pointer active:scale-[0.99] transition-transform shadow-md"
            >
              <div className="flex justify-between items-start">
                <span className="bg-[#FF5A00]/10 border border-[#FF5A00]/20 text-[#FF5A00] px-1.5 py-0.5 text-[10px]   font-bold tracking-widest">
                  {item.codigo}
                </span>

                <span
                  className={`text-[9px]   border px-2 py-0.5 font-bold uppercase tracking-widest ${
                    item.recetas_count > 0
                      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                      : "text-zinc-600 border-zinc-800 bg-black"
                  }`}
                >
                  {item.recetas_count || 0} Versiones
                </span>
              </div>

              <div className="text-white font-bold text-sm leading-snug">
                {item.nombre}
              </div>

              <div className="flex justify-end pt-2 border-t border-zinc-800/50">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenParentModal(item, activeTab);
                  }}
                  className="px-3 py-1.5 border border-zinc-800 text-zinc-300 hover:text-[#FF5A00]   text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5"
                >
                  <FileCode2 size={12} /> ABRIR FÓRMULAS
                </button>
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

              <span className="px-3 h-8 flex items-center bg-[#FF5A00]/10 border border-[#FF5A00]/30 text-[#FF5A00] font-bold text-xs  ">
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
          MODAL 1: LISTADO DE RECETAS POR PRODUCTO
      ========================================================= */}
      {selectedParent && !isBuilderOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-2xl p-8 shadow-2xl relative max-h-[90vh] flex flex-col gap-5 text-xs">
            <button
              onClick={() => setSelectedParent(null)}
              className="absolute top-6 right-6 text-zinc-500 hover:text-white cursor-pointer z-10"
            >
              <X size={20} />
            </button>

            <div className="border-b border-zinc-800/80 pb-4 shrink-0 flex justify-between items-start pr-8">
              <div className="space-y-1">
                <span className="text-[10px]   font-bold text-[#FF5A00] bg-[#FF5A00]/10 px-2 py-0.5 border border-[#FF5A00]/20 tracking-widest uppercase">
                  LIBRO DE RECETAS TÉCNICAS
                </span>
                <h3 className="text-2xl text-white font-extrabold italic uppercase tracking-tighter flex items-center gap-2">
                  <Boxes size={24} className="text-[#FF5A00]" />
                  {selectedParent.codigo}
                </h3>
                <p className="text-xs text-zinc-400 font-medium">
                  {selectedParent.nombre}
                </p>
              </div>

              <button
                onClick={() => handleOpenBuilder(null)}
                className="px-5 py-2.5 bg-[#FFD700] hover:bg-white text-black   text-xs font-bold uppercase tracking-widest transition cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <Plus size={16} strokeWidth={3} /> CRAFTEAR RECETA
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1   text-xs min-h-0 custom-scrollbar">
              {loadingRecipes ? (
                <div className="py-12 flex justify-center text-[#FF5A00] my-auto">
                  <RefreshCw className="animate-spin" size={28} />
                </div>
              ) : parentRecipes.length === 0 ? (
                <div className="py-12 text-center text-zinc-600 font-bold uppercase tracking-widest text-xs my-auto">
                  Este producto no tiene ninguna versión registrada.
                </div>
              ) : (
                parentRecipes.map((recipe) => (
                  <div
                    key={recipe.id}
                    className={`bg-black border p-5 space-y-4 transition-all shadow-md ${
                      recipe.es_activa
                        ? "border-emerald-500/50 bg-emerald-500/5"
                        : "border-zinc-800"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b border-zinc-800/80 pb-3">
                      <div className="flex items-center gap-3">
                        <strong className="text-white text-sm italic font-extrabold uppercase tracking-tight">
                          {recipe.nombre_version}
                        </strong>
                        {recipe.es_activa ? (
                          <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2.5 py-0.5 font-bold tracking-widest uppercase flex items-center gap-1">
                            <CheckCircle2 size={12} /> ACTIVA EN PLANTA
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSetActiveRecipe(recipe.id)}
                            className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-[#FF5A00] hover:border-[#FF5A00]/50 px-2.5 py-0.5 uppercase tracking-widest font-bold transition-colors cursor-pointer"
                          >
                            ACTIVAR FÓRMULA
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenBuilder(recipe)}
                          className="p-1.5 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                          title="Editar Ficha"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteRecipe(recipe.id)}
                          className="p-1.5 text-zinc-500 hover:text-[#FF0055] transition-colors cursor-pointer"
                          title="Eliminar Ficha"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest block">
                        COMPOSICIÓN POR UNIDAD PRODUCIDA:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {recipe.ingredientes?.map((ing, iIdx) => (
                          <div
                            key={iIdx}
                            className="bg-[#050505] border border-zinc-800/80 p-3 flex justify-between items-center text-xs"
                          >
                            <span className="text-[#FF5A00] font-bold truncate pr-2">
                              [{ing.item_codigo}] {ing.item_nombre}
                            </span>
                            <span className="text-zinc-200 font-bold bg-black px-2 py-0.5 border border-zinc-800 shrink-0 text-[11px]">
                              {ing.cantidad} {ing.unidad_medida || "Kg"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 border-t border-zinc-800 flex justify-end   shrink-0">
              <button
                onClick={() => setSelectedParent(null)}
                className="px-5 py-2.5 border border-zinc-800 text-zinc-500 hover:text-white text-[10px] font-bold uppercase tracking-widest transition cursor-pointer"
              >
                CERRAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 2: MESA DE CRAFTEO / EDITOR DE FORMULACIÓN
      ========================================================= */}
      {isBuilderOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[110] flex items-center justify-center p-2 sm:p-4">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-5xl h-[88vh] p-6 shadow-2xl relative flex flex-col gap-4 text-xs">
            <button
              onClick={() => setIsFormBuilderOpen(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="border-b border-zinc-800/80 pb-3 shrink-0 pr-8">
              <span className="text-[10px]   font-bold text-[#FF5A00] bg-[#FF5A00]/10 px-2 py-0.5 border border-[#FF5A00]/20 tracking-widest uppercase">
                MESA DE CRAFTEO & ALQUIMIA TÉCNICA
              </span>
              <h3 className="font-extrabold italic text-xl text-white mt-2 uppercase tracking-tighter flex items-center gap-2">
                <Anvil size={20} className="text-[#FF5A00]" /> [
                {selectedParent.codigo}] {selectedParent.nombre}
              </h3>
            </div>

            {/* CONTENEDOR MESA DE CRAFTEO */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0 overflow-hidden text-xs">
              {/* COLUMNA IZQUIERDA: INVENTARIO */}
              <div className="lg:col-span-5 bg-black border border-zinc-800 p-4 flex flex-col space-y-3 h-full min-h-0">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5 shrink-0  ">
                  <span className="text-white font-bold text-[10px] uppercase tracking-widest flex items-center gap-1.5">
                    <Package size={14} className="text-[#FF5A00]" /> INVENTARIO
                    DE INSUMOS
                  </span>

                  <div className="flex items-center gap-0 border border-zinc-800 bg-[#050505]">
                    <button
                      type="button"
                      onClick={() => setBuilderCatalogType("MP")}
                      className={`px-3 py-1 text-[10px]   font-bold cursor-pointer uppercase tracking-widest ${
                        builderCatalogType === "MP"
                          ? "bg-[#FF5A00] text-black"
                          : "text-zinc-500 hover:text-white"
                      }`}
                    >
                      MP
                    </button>
                    <button
                      type="button"
                      onClick={() => setBuilderCatalogType("SE")}
                      className={`px-3 py-1 text-[10px]   font-bold cursor-pointer uppercase tracking-widest ${
                        builderCatalogType === "SE"
                          ? "bg-[#FF5A00] text-black"
                          : "text-zinc-500 hover:text-white"
                      }`}
                    >
                      SE
                    </button>
                  </div>
                </div>

                <div className="relative shrink-0  ">
                  <Search
                    size={13}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"
                  />
                  <input
                    type="text"
                    placeholder="Filtrar materiales..."
                    value={builderCatalogSearch}
                    onChange={(e) => setBuilderCatalogSearch(e.target.value)}
                    className="w-full bg-[#050505] border border-zinc-800 text-xs text-white pl-8 pr-3 py-2 focus:outline-none focus:border-[#FF5A00] uppercase font-bold"
                  />
                </div>

                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 h-full min-h-0 custom-scrollbar  ">
                  {availableCatalogItems.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-zinc-600 text-[10px] uppercase tracking-widest font-bold">
                      Sin insumos encontrados.
                    </div>
                  ) : (
                    availableCatalogItems.map((item) => {
                      const isAlreadyInRecipe = recipeForm.ingredientes.some(
                        (ing) =>
                          (builderCatalogType === "MP" &&
                            ing.materia_prima_id === item.id) ||
                          (builderCatalogType === "SE" &&
                            ing.semielaborado_id === item.id),
                      );

                      return (
                        <div
                          key={item.id}
                          onClick={() =>
                            handleQuickAddMaterial(item, builderCatalogType)
                          }
                          className={`p-2.5 border flex items-center justify-between transition-colors cursor-pointer ${
                            isAlreadyInRecipe
                              ? "bg-[#050505] border-zinc-800/40 text-zinc-600 opacity-40 cursor-not-allowed"
                              : "bg-[#050505] border-zinc-800 hover:border-zinc-700 text-white"
                          }`}
                        >
                          <div className="truncate pr-2">
                            <span className="text-[#FF5A00] font-bold block truncate text-[10px] tracking-widest">
                              {item.codigo}
                            </span>
                            <span className="text-xs text-zinc-300 block truncate font-sans font-bold">
                              {item.nombre}
                            </span>
                          </div>

                          <button
                            type="button"
                            disabled={isAlreadyInRecipe}
                            className={`px-2.5 py-1 text-[9px]   font-bold uppercase tracking-widest border shrink-0 flex items-center gap-1 cursor-pointer ${
                              isAlreadyInRecipe
                                ? "bg-black border-zinc-800 text-zinc-600"
                                : "bg-[#FFD700] hover:bg-white text-black border-[#FFD700]"
                            }`}
                          >
                            <Plus size={11} strokeWidth={3} />
                            {isAlreadyInRecipe ? "EN MESA" : "SUMAR"}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* COLUMNA DERECHA: FÓRMULA MAESTRA */}
              <div className="lg:col-span-7 bg-black border border-zinc-800 p-4 flex flex-col space-y-3 h-full min-h-0">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-[#050505] p-3 border border-zinc-800 shrink-0  ">
                  <div className="sm:col-span-8 space-y-1">
                    <label className="text-zinc-500 text-[9px] font-bold uppercase tracking-widest block">
                      VERSIÓN DE FÓRMULA:
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Receta v1.0"
                      value={recipeForm.nombre_version}
                      onChange={(e) =>
                        setRecipeForm({
                          ...recipeForm,
                          nombre_version: e.target.value,
                        })
                      }
                      className="w-full bg-black border border-zinc-800 text-xs text-white px-3 py-2 font-bold focus:outline-none focus:border-[#FF5A00] uppercase"
                    />
                  </div>

                  <div className="sm:col-span-4 flex items-center pt-3 justify-end">
                    <label className="flex items-center gap-2 cursor-pointer text-emerald-400 font-bold text-[10px] uppercase tracking-widest">
                      <input
                        type="checkbox"
                        checked={recipeForm.es_activa}
                        onChange={(e) =>
                          setRecipeForm({
                            ...recipeForm,
                            es_activa: e.target.checked,
                          })
                        }
                        className="w-4 h-4 accent-emerald-500 cursor-pointer rounded-none bg-black border-zinc-800"
                      />
                      <span>ACTIVAR FÓRMULA</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-between items-center border-b border-zinc-800/80 pb-2 shrink-0  ">
                  <span className="text-[#FF5A00] font-bold text-[10px] uppercase tracking-widest flex items-center gap-1.5">
                    <Sparkle size={13} className="text-[#FFD700]" /> MATERIALES
                    EN MESA ({recipeForm.ingredientes.length})
                  </span>
                  <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">
                    Ajustá cantidades por unidad
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 h-full min-h-0   custom-scrollbar">
                  {recipeForm.ingredientes.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-1 my-auto uppercase font-bold tracking-widest text-[10px]">
                      <p>Mesa de crafteo vacía.</p>
                      <p className="text-[9px] text-zinc-700">
                        Hacé clic en los insumos del panel izquierdo.
                      </p>
                    </div>
                  ) : (
                    recipeForm.ingredientes.map((ing, idx) => (
                      <div
                        key={idx}
                        className="bg-[#050505] border border-zinc-800/80 p-3 flex items-center justify-between text-xs"
                      >
                        <div className="truncate pr-2 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold px-1.5 py-0.5 border bg-black text-[#FF5A00] border-[#FF5A00]/20 tracking-widest uppercase">
                              {ing.item_type}
                            </span>
                            <strong className="text-white text-xs truncate">
                              [{ing.item_codigo}] {ing.item_nombre}
                            </strong>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">
                            Cant:
                          </span>
                          <input
                            type="number"
                            step="0.001"
                            value={ing.cantidad}
                            onChange={(e) =>
                              handleUpdateIngredientQty(idx, e.target.value)
                            }
                            className="w-20 bg-black border border-zinc-800 text-xs text-white font-bold px-2 py-1 text-right focus:outline-none focus:border-[#FF5A00]"
                          />
                          <span className="text-[10px] text-zinc-500 w-10 uppercase font-bold tracking-widest">
                            {ing.unidad_medida || "Kg"}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleRemoveIngredient(idx)}
                            className="text-zinc-600 hover:text-[#FF0055] p-1.5 cursor-pointer transition-colors"
                            title="Quitar Insumo"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-800 flex justify-end gap-3   shrink-0">
              <button
                type="button"
                onClick={() => setIsFormBuilderOpen(false)}
                className="px-5 py-2.5 border border-zinc-800 text-zinc-500 hover:text-white text-[10px] font-bold uppercase tracking-widest transition cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={handleSaveRecipe}
                className="px-6 py-2.5 bg-[#FF5A00] hover:bg-white text-black font-bold text-[10px] uppercase tracking-widest transition cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 size={16} /> GUARDAR FÓRMULA MAESTRA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
