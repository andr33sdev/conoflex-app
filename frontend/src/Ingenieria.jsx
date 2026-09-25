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
  FlaskConical,
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

  // SINCRONIZACIÓN DE VENTAS PARA PRODUCTOS TERMINADOS
  const handleSyncPT = async () => {
    setIsSyncingPT(true);
    try {
      const res = await fetch("/api/productos-terminados/sincronizar-ventas", {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok && data.success) {
        alert(
          `🎉 ¡Sincronización exitosa! Se procesaron ${data.count} modelos de productos terminados.`,
        );
        fetchBaseData();
      } else {
        alert(
          "❌ Error: " + (data.error || "No se pudo sincronizar las ventas."),
        );
      }
    } catch (error) {
      alert("❌ Error de conexión al sincronizar Ventas.");
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
      unidad_medida: item.unidad_medida || (type === "MP" ? "Kg" : "Unidades"),
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

  const emptySlotsCount = Math.max(0, itemsPerPage - paginatedItems.length);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#070a12] border border-slate-800/80 rounded-2xl font-sans text-slate-200 shadow-2xl overflow-hidden backdrop-blur-2xl p-5 space-y-4">
      {/* 1. HEADER DE MÓDULO */}
      <div className="bg-[#0f172a]/70 border-b border-slate-800/80 p-4 flex flex-wrap items-center justify-between gap-4 shrink-0 backdrop-blur-xl rounded-2xl">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl shadow-[0_0_15px_rgba(56,189,248,0.15)]">
            <FlaskConical size={20} className="text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xs font-bold text-white tracking-widest uppercase font-mono">
                LABORATORIO DE INGENIERÍAS
              </h2>
              <span className="text-[10px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 px-2.5 py-0.5 rounded-full font-mono flex items-center gap-1.5 shadow-[0_0_10px_rgba(56,189,248,0.1)]">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#38bdf8]" />{" "}
                FORMULACIÓN TÉCNICA
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Listas de materiales (BOM), componentes y control de recetas
              activas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* BOTÓN SINCRONIZAR VENTAS (Solo en Productos Terminados) */}
          {activeTab === "PT" && (
            <button
              onClick={handleSyncPT}
              disabled={isSyncingPT}
              className="p-2 px-3 bg-emerald-500/10 border border-emerald-500/40 hover:bg-emerald-500/20 text-emerald-400 rounded-xl transition-all shadow-md cursor-pointer shrink-0 font-mono text-xs font-bold flex items-center gap-2 disabled:opacity-50"
              title="Extraer productos desde Sheets de Ventas"
            >
              <DownloadCloud
                size={14}
                className={isSyncingPT ? "animate-bounce text-emerald-300" : ""}
              />
              <span>SINCRONIZAR VENTAS</span>
            </button>
          )}

          <button
            onClick={fetchBaseData}
            className="p-2 bg-slate-900 border border-slate-700 hover:border-amber-400 text-slate-300 hover:text-amber-400 rounded-xl transition-all shadow-md cursor-pointer shrink-0"
            title="Recargar catálogo"
          >
            <RefreshCw
              size={15}
              className={loading ? "animate-spin text-amber-400" : ""}
            />
          </button>
        </div>
      </div>

      {/* 2. BARRA DE HERRAMIENTAS Y PESTAÑAS */}
      <div className="bg-[#0e1422] border border-slate-800/80 p-3.5 rounded-2xl space-y-3 shrink-0 shadow-xl">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 font-mono text-xs overflow-x-auto pb-0.5">
            <button
              onClick={() => {
                setActiveTab("SE");
                setCurrentPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-xl border transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "SE"
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/40 font-bold shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                  : "bg-[#070a12] border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              SEMIELABORADOS ({itemsSE.length})
            </button>

            <button
              onClick={() => {
                setActiveTab("PT");
                setCurrentPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-xl border transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "PT"
                  ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/40 font-bold shadow-[0_0_10px_rgba(56,189,248,0.15)]"
                  : "bg-[#070a12] border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              PRODUCTOS TERMINADOS ({itemsPT.length})
            </button>
          </div>

          <div className="bg-[#070a12] border border-slate-800 px-3 py-1.5 text-xs font-mono text-slate-400 shrink-0 rounded-xl flex items-center gap-2">
            <span>ITEMS:</span>
            <strong className="text-emerald-400 font-bold">
              {processedItems.length} / {currentList.length}
            </strong>
          </div>
        </div>

        <div className="relative w-full max-w-md">
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
            className="w-full bg-[#070a12] border border-slate-800 text-xs text-slate-100 pl-10 pr-4 py-2 focus:border-amber-500/50 outline-none rounded-xl font-sans"
          />
        </div>
      </div>

      {/* 3. TABLA PRINCIPAL CYBER-INDUSTRIAL */}
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
                  className="w-[20%] px-3 font-semibold cursor-pointer hover:bg-slate-800/80 hover:text-amber-400 transition-colors select-none"
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
                  className="w-[50%] px-3 font-semibold cursor-pointer hover:bg-slate-800/80 hover:text-amber-400 transition-colors select-none"
                >
                  <div className="flex items-center justify-between pr-1">
                    <span>ARTÍCULO / PRODUCTO</span>
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
                  onClick={() => handleSort("recetas_count")}
                  className="w-[15%] px-3 font-semibold text-center cursor-pointer hover:bg-slate-800/80 hover:text-amber-400 transition-colors select-none"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>FÓRMULAS</span>
                    <span className="w-3 flex justify-center shrink-0">
                      {sortColumn === "recetas_count" ? (
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

                <th className="w-[15%] px-3 font-semibold text-center">
                  INGENIERÍA
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
                    colSpan="4"
                    className="py-16 text-center font-mono text-xs text-amber-400 animate-pulse"
                  >
                    Consultando libro de ingenierías...
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td
                    colSpan="4"
                    className="py-16 text-center font-mono text-xs text-slate-500"
                  >
                    No se encontraron registros.
                  </td>
                </tr>
              ) : (
                <>
                  {paginatedItems.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => handleOpenParentModal(item, activeTab)}
                      className="h-[38px] hover:bg-[#121824]/80 transition-colors group align-middle cursor-pointer"
                    >
                      <td className="px-3 font-mono font-bold text-amber-400 truncate align-middle group-hover:underline">
                        {item.codigo}
                      </td>

                      <td className="px-3 text-slate-100 font-bold truncate align-middle">
                        {item.nombre}
                      </td>

                      <td className="px-3 text-center align-middle whitespace-nowrap font-mono">
                        <span
                          className={`inline-block px-2.5 py-0.5 border rounded-full text-[10px] font-bold ${
                            item.recetas_count > 0
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                              : "bg-slate-900 border-slate-800 text-slate-500"
                          }`}
                        >
                          {item.recetas_count || 0} Versiones
                        </span>
                      </td>

                      <td className="px-3 text-center align-middle">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenParentModal(item, activeTab);
                          }}
                          className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-cyan-400 font-mono text-[11px] font-bold hover:border-cyan-400 hover:bg-slate-800 transition-all rounded-lg cursor-pointer inline-flex items-center gap-1 shadow-sm"
                        >
                          <FileCode2 size={12} /> ABRIR FÓRMULAS
                        </button>
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
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
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

      {/* =========================================================
          MODAL 1: LISTADO DE RECETAS POR PRODUCTO
      ========================================================= */}
      {selectedParent && !isBuilderOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200 font-sans">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-2xl p-6 rounded-2xl shadow-2xl space-y-4 relative max-h-[90vh] flex flex-col text-xs">
            <button
              onClick={() => setSelectedParent(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="border-b border-slate-800 pb-3 shrink-0 flex justify-between items-start pr-6">
              <div>
                <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 border border-amber-500/20 rounded-full">
                  LIBRO DE RECETAS TÉCNICAS
                </span>
                <h3 className="font-mono text-base text-white font-bold mt-1.5 flex items-center gap-2">
                  <Boxes size={18} className="text-cyan-400" /> [
                  {selectedParent.codigo}]
                </h3>
                <p className="text-xs text-slate-300 font-bold mt-0.5">
                  {selectedParent.nombre}
                </p>
              </div>

              <button
                onClick={() => handleOpenBuilder(null)}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono text-xs font-bold rounded-xl transition cursor-pointer shadow-md flex items-center gap-1.5 shrink-0"
              >
                <Plus size={15} /> CRAFTEAR RECETA
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 font-sans text-xs min-h-0">
              {loadingRecipes ? (
                <div className="py-12 text-center text-amber-400 font-mono animate-pulse">
                  Consultando fórmulas técnicas...
                </div>
              ) : parentRecipes.length === 0 ? (
                <div className="py-12 text-center text-slate-500 font-mono space-y-2">
                  <p>Este producto no tiene ninguna versión registrada.</p>
                </div>
              ) : (
                parentRecipes.map((recipe) => (
                  <div
                    key={recipe.id}
                    className={`bg-[#070a12] border p-4 rounded-xl space-y-3 transition-all shadow-md ${
                      recipe.es_activa
                        ? "border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                        : "border-slate-800"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-2.5">
                        <strong className="text-white text-sm font-mono">
                          {recipe.nombre_version}
                        </strong>
                        {recipe.es_activa ? (
                          <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2.5 py-0.5 rounded-full font-mono font-bold flex items-center gap-1">
                            <CheckCircle2 size={11} /> ACTIVA EN PLANTA
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSetActiveRecipe(recipe.id)}
                            className="text-[10px] bg-slate-900 border border-slate-700 text-slate-300 hover:text-amber-400 hover:border-amber-400/60 px-2.5 py-0.5 rounded-lg font-mono transition-colors cursor-pointer"
                          >
                            ACTIVAR FÓRMULA
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenBuilder(recipe)}
                          className="p-1.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/40 rounded-lg transition cursor-pointer"
                          title="Editar Ficha"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteRecipe(recipe.id)}
                          className="p-1.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 rounded-lg transition cursor-pointer"
                          title="Eliminar Ficha"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] text-slate-400 block font-mono">
                        COMPOSICIÓN POR UNIDAD PRODUCIDA:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono">
                        {recipe.ingredientes?.map((ing, iIdx) => (
                          <div
                            key={iIdx}
                            className="bg-[#0e1422] border border-slate-800 p-2.5 flex justify-between items-center rounded-lg text-[11px]"
                          >
                            <span className="text-cyan-400 font-bold truncate">
                              [{ing.item_codigo}] {ing.item_nombre}
                            </span>
                            <span className="text-amber-400 font-bold bg-[#070a12] px-2 py-0.5 border border-slate-800 rounded-md shrink-0 ml-2">
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

            <div className="pt-3 border-t border-slate-800 flex justify-end font-mono shrink-0">
              <button
                onClick={() => setSelectedParent(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition cursor-pointer"
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
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-xs z-[110] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200 font-sans">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-5xl h-[85vh] p-6 shadow-2xl space-y-4 relative rounded-2xl flex flex-col text-xs">
            <button
              onClick={() => setIsFormBuilderOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="border-b border-slate-800 pb-3 shrink-0 flex justify-between items-center pr-6">
              <div>
                <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 border border-cyan-500/20 rounded-full">
                  MESA DE CRAFTEO & ALQUIMIA TÉCNICA
                </span>
                <h3 className="font-mono text-sm text-white font-bold mt-1.5 flex items-center gap-2">
                  <Anvil size={16} className="text-amber-400" /> [
                  {selectedParent.codigo}] {selectedParent.nombre}
                </h3>
              </div>
            </div>

            {/* CONTENEDOR MESA DE CRAFTEO */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0 overflow-hidden font-sans text-xs">
              {/* COLUMNA IZQUIERDA: INVENTARIO */}
              <div className="lg:col-span-5 bg-[#070a12] border border-slate-800 p-3.5 flex flex-col space-y-2.5 rounded-xl h-full min-h-0">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 shrink-0 font-mono">
                  <span className="text-amber-400 font-bold text-[11px] flex items-center gap-1.5">
                    <Package size={14} className="text-cyan-400" /> INVENTARIO
                    DE INSUMOS
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setBuilderCatalogType("MP")}
                      className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg border cursor-pointer ${
                        builderCatalogType === "MP"
                          ? "bg-amber-500/10 border-amber-500/40 text-amber-400"
                          : "bg-[#0e1422] border-slate-800 text-slate-400"
                      }`}
                    >
                      MP
                    </button>
                    <button
                      onClick={() => setBuilderCatalogType("SE")}
                      className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg border cursor-pointer ${
                        builderCatalogType === "SE"
                          ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-400"
                          : "bg-[#0e1422] border-slate-800 text-slate-400"
                      }`}
                    >
                      SE
                    </button>
                  </div>
                </div>

                <div className="relative shrink-0">
                  <Search
                    size={13}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    type="text"
                    placeholder="Filtrar materiales..."
                    value={builderCatalogSearch}
                    onChange={(e) => setBuilderCatalogSearch(e.target.value)}
                    className="w-full bg-[#0e1422] border border-slate-800 text-xs text-white pl-8 pr-3 py-1.5 focus:outline-none focus:border-cyan-500/50 rounded-xl font-mono"
                  />
                </div>

                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 h-full min-h-0">
                  {availableCatalogItems.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-500 text-[11px] font-mono">
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
                          className={`p-2.5 border flex items-center justify-between transition-all rounded-xl cursor-pointer shadow-sm ${
                            isAlreadyInRecipe
                              ? "bg-[#0e1422]/40 border-slate-800/50 text-slate-600 opacity-50 cursor-not-allowed"
                              : "bg-[#0e1422] border-slate-800 hover:border-amber-500/50 text-white"
                          }`}
                        >
                          <div className="truncate pr-2 font-mono">
                            <span className="text-amber-400 font-bold block truncate text-[11px]">
                              [{item.codigo}]
                            </span>
                            <span className="text-[11px] text-slate-300 block truncate font-sans">
                              {item.nombre}
                            </span>
                          </div>

                          <button
                            disabled={isAlreadyInRecipe}
                            className={`px-2.5 py-1 text-[10px] font-mono font-bold border shrink-0 rounded-lg flex items-center gap-1 cursor-pointer ${
                              isAlreadyInRecipe
                                ? "bg-slate-900 border-slate-800 text-slate-600"
                                : "bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-500 shadow"
                            }`}
                          >
                            <Plus size={11} />{" "}
                            {isAlreadyInRecipe ? "EN MESA" : "CRAFTEAR"}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* COLUMNA DERECHA: FÓRMULA MAESTRA */}
              <div className="lg:col-span-7 bg-[#070a12] border border-slate-800 p-3.5 flex flex-col space-y-2.5 rounded-xl h-full min-h-0">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-[#0e1422] p-3 border border-slate-800 rounded-xl shrink-0 font-mono">
                  <div className="sm:col-span-8 space-y-1">
                    <label className="text-slate-400 text-[10px] block">
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
                      className="w-full bg-[#070a12] border border-slate-800 text-xs text-white px-3 py-1.5 font-bold focus:outline-none focus:border-cyan-500/50 rounded-xl"
                    />
                  </div>

                  <div className="sm:col-span-4 flex items-center pt-3 justify-end">
                    <label className="flex items-center gap-2 cursor-pointer text-emerald-400 font-bold text-[11px]">
                      <input
                        type="checkbox"
                        checked={recipeForm.es_activa}
                        onChange={(e) =>
                          setRecipeForm({
                            ...recipeForm,
                            es_activa: e.target.checked,
                          })
                        }
                        className="w-4 h-4 accent-emerald-500 cursor-pointer rounded"
                      />
                      <span>ACTIVAR FÓRMULA</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-between items-center border-b border-slate-800 pb-1.5 shrink-0 font-mono">
                  <span className="text-cyan-400 font-bold text-[11px] flex items-center gap-1.5">
                    <Sparkle size={13} className="text-amber-400" /> MATERIALES
                    EN MESA ({recipeForm.ingredientes.length})
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Ajustá cantidades por unidad producida
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 h-full min-h-0 font-mono">
                  {recipeForm.ingredientes.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-1 my-auto">
                      <p className="text-xs font-bold">
                        Mesa de crafteo vacía.
                      </p>
                      <p className="text-[10px] text-slate-600">
                        Hacé clic en los insumos del panel izquierdo para
                        sumarlos.
                      </p>
                    </div>
                  ) : (
                    recipeForm.ingredientes.map((ing, idx) => (
                      <div
                        key={idx}
                        className="bg-[#0e1422] border border-slate-800 p-2.5 flex items-center justify-between rounded-xl shadow-sm"
                      >
                        <div className="truncate pr-2 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold px-2 py-0.5 border rounded-md bg-[#070a12] text-amber-400 border-slate-800">
                              {ing.item_type}
                            </span>
                            <strong className="text-white text-xs truncate">
                              [{ing.item_codigo}] {ing.item_nombre}
                            </strong>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-slate-400">
                            Cant:
                          </span>
                          <input
                            type="number"
                            step="0.001"
                            value={ing.cantidad}
                            onChange={(e) =>
                              handleUpdateIngredientQty(idx, e.target.value)
                            }
                            className="w-20 bg-[#070a12] border border-slate-800 text-xs text-emerald-400 font-bold px-2 py-1 text-right focus:outline-none focus:border-amber-500/50 rounded-lg font-mono"
                          />
                          <span className="text-[10px] text-slate-400 w-8">
                            {ing.unidad_medida || "Kg"}
                          </span>

                          <button
                            onClick={() => handleRemoveIngredient(idx)}
                            className="text-rose-400 hover:text-rose-300 p-1.5 cursor-pointer rounded-lg hover:bg-slate-900 transition"
                            title="Quitar"
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

            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2 font-mono shrink-0">
              <button
                onClick={() => setIsFormBuilderOpen(false)}
                className="px-4 py-2 border border-slate-800 text-slate-400 hover:text-white text-xs rounded-xl cursor-pointer transition"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveRecipe}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 size={15} /> GUARDAR FÓRMULA MAESTRA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
