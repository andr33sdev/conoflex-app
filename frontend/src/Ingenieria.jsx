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
} from "lucide-react";

export default function Ingenieria() {
  const [activeTab, setActiveTab] = useState("SE");
  const [itemsSE, setItemsSE] = useState([]);
  const [itemsPT, setItemsPT] = useState([]);
  const [materiasPrimas, setMateriasPrimas] = useState([]);
  const [loading, setLoading] = useState(true);
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
        fetch("http://localhost:3001/api/semielaborados"),
        fetch("http://localhost:3001/api/productos-terminados"),
        fetch("http://localhost:3001/api/materias-primas"),
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

  const fetchRecipesForParent = async (parent) => {
    setLoadingRecipes(true);
    const endpoint =
      parent.type === "SE"
        ? `http://localhost:3001/api/ingenierias/semielaborado/${parent.id}`
        : `http://localhost:3001/api/ingenierias/producto-terminado/${parent.id}`;

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
      const res = await fetch(
        `http://localhost:3001/api/ingenierias/${recipeId}/activar`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parent_id: selectedParent.id,
            parent_type: selectedParent.type,
          }),
        },
      );

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
      const res = await fetch(
        `http://localhost:3001/api/ingenierias/${recipeId}`,
        {
          method: "DELETE",
        },
      );
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
        ? `http://localhost:3001/api/ingenierias/${editingRecipeId}`
        : "http://localhost:3001/api/ingenierias";
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
    <div className="h-full flex flex-col font-mono text-[#e1d7f5] select-none space-y-2 sm:space-y-2.5 min-h-0 bg-[#1a0f2e] p-1 overflow-hidden">
      {/* 1. HEADER */}
      <div className="flex flex-row items-center justify-between pb-2 border-b-2 border-[#432874] gap-2 shrink-0">
        <div>
          <h2 className="font-pixel text-sm sm:text-base text-[#ffbe00] font-bold flex items-center gap-2 tracking-wide drop-shadow-[1px_1px_0px_#000]">
            <FlaskConical size={16} className="text-[#38bdf8] shrink-0" />{" "}
            LABORATORIO DE INGENIERÍAS
          </h2>
          <p className="text-[10px] text-[#a594c9] font-mono hidden sm:block">
            Formulación técnica, listas de materiales y control de recetas
            activas.
          </p>
        </div>

        <button
          onClick={fetchBaseData}
          className="p-1.5 bg-[#2c1a4d] border-2 border-[#432874] text-[#a594c9] hover:text-[#ffbe00] hover:border-[#ffbe00]/60 shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all rounded-xs shrink-0"
          title="Recargar catálogo"
        >
          <RefreshCw
            size={14}
            className={loading ? "animate-spin text-[#ffbe00]" : ""}
          />
        </button>
      </div>

      {/* 2. BARRA DE HERRAMIENTAS */}
      <div className="bg-[#24173e] border-2 border-[#432874] p-2 sm:p-2.5 space-y-2 shrink-0 rounded-xs shadow-[3px_3px_0px_#000]">
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-0.5">
          <div className="flex items-center gap-1.5 font-pixel text-xs">
            <button
              onClick={() => {
                setActiveTab("SE");
                setCurrentPage(1);
              }}
              className={`px-3 py-1 border-2 transition-all shrink-0 rounded-xs shadow-[1px_1px_0px_#000] ${
                activeTab === "SE"
                  ? "bg-[#ffbe00] border-[#b38600] text-[#2c1a4d] font-bold"
                  : "bg-[#160c2b] border-[#432874] text-[#a594c9] hover:text-white"
              }`}
            >
              SEMIELABORADOS ({itemsSE.length})
            </button>

            <button
              onClick={() => {
                setActiveTab("PT");
                setCurrentPage(1);
              }}
              className={`px-3 py-1 border-2 transition-all shrink-0 rounded-xs shadow-[1px_1px_0px_#000] ${
                activeTab === "PT"
                  ? "bg-[#38bdf8] border-[#0284c7] text-[#2c1a4d] font-bold"
                  : "bg-[#160c2b] border-[#432874] text-[#a594c9] hover:text-white"
              }`}
            >
              PRODUCTOS TERMINADOS ({itemsPT.length})
            </button>
          </div>

          <div className="bg-[#160c2b] border border-[#432874] px-2.5 py-1 text-[10px] font-pixel text-[#a594c9] shrink-0 rounded-xs flex items-center gap-1">
            <span>ITEMS:</span>
            <strong className="text-[#24cc8f]">
              {processedItems.length} / {currentList.length}
            </strong>
          </div>
        </div>

        <div className="relative w-full max-w-md">
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
      </div>

      {/* 3. TABLA PRINCIPAL */}
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
                  className="w-[20%] px-3 font-normal cursor-pointer hover:bg-[#39215e] hover:text-[#ffbe00] transition-colors select-none"
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
                  className="w-[50%] px-3 font-normal cursor-pointer hover:bg-[#39215e] hover:text-[#ffbe00] transition-colors select-none"
                >
                  <div className="flex items-center justify-between pr-1">
                    <span>ARTÍCULO / PRODUCTO</span>
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
                  onClick={() => handleSort("recetas_count")}
                  className="w-[15%] px-3 font-normal text-center cursor-pointer hover:bg-[#39215e] hover:text-[#ffbe00] transition-colors select-none"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>FÓRMULAS</span>
                    <span className="w-3 flex justify-center shrink-0">
                      {sortColumn === "recetas_count" ? (
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

                <th className="w-[15%] px-3 font-normal text-center">
                  INGENIERÍA
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
                    colSpan="4"
                    className="py-16 text-center font-pixel text-xs text-[#ffbe00] animate-pulse"
                  >
                    Consultando libro de ingenierías...
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td
                    colSpan="4"
                    className="py-16 text-center font-pixel text-xs text-[#6e588a]"
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
                      className="h-[38px] hover:bg-[#281747] hover:shadow-[inset_0_0_15px_rgba(255,190,0,0.12)] transition-all duration-150 group align-middle cursor-pointer"
                    >
                      <td className="px-3 font-pixel text-[#ffbe00] font-bold tracking-wider truncate align-middle group-hover:underline">
                        {item.codigo}
                      </td>

                      <td className="px-3 text-white font-bold truncate align-middle">
                        {item.nombre}
                      </td>

                      <td className="px-3 text-center align-middle whitespace-nowrap font-pixel">
                        <span
                          className={`inline-block px-2 py-0.5 border rounded-2xs text-[10px] font-bold shadow-[1px_1px_0px_#000] ${
                            item.recetas_count > 0
                              ? "bg-[#24cc8f]/10 border-[#24cc8f]/40 text-[#24cc8f]"
                              : "bg-[#24173e] border-[#432874] text-[#6e588a]"
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
                          className="px-2.5 py-1 bg-[#2c1a4d] border border-[#38bdf8]/50 text-[#38bdf8] font-pixel text-[10px] font-bold hover:bg-[#38bdf8] hover:text-[#2c1a4d] shadow-[1px_1px_0px_#000] active:translate-y-0.5 transition-all rounded-2xs inline-flex items-center gap-1"
                        >
                          <FileCode2 size={11} /> ABRIR FÓRMULAS
                        </button>
                      </td>
                    </tr>
                  ))}

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
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINACIÓN RESPONSIVE */}
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

      {/* =========================================================
          MODAL 1: LISTADO DE RECETAS
      ========================================================= */}
      {selectedParent && !isBuilderOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-[100] flex items-center justify-center p-3 animate-in fade-in duration-200 font-mono">
          <div className="bg-[#24173e] border-2 border-[#ffbe00] w-full max-w-2xl p-4 sm:p-5 shadow-[0_0_35px_rgba(255,190,0,0.3)] space-y-4 relative rounded-xs max-h-[90vh] flex flex-col">
            <button
              onClick={() => setSelectedParent(null)}
              className="absolute top-4 right-4 text-[#a594c9] hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b-2 border-[#432874] pb-3 shrink-0 flex justify-between items-start pr-6">
              <div>
                <span className="text-[10px] font-pixel text-[#ffbe00] bg-[#ffbe00]/10 px-2 py-0.5 border border-[#ffbe00]/30 rounded-xs font-bold">
                  LIBRO DE RECETAS
                </span>
                <h3 className="font-pixel text-base text-white font-bold mt-1.5 flex items-center gap-2">
                  <Boxes size={18} className="text-[#38bdf8]" /> [
                  {selectedParent.codigo}]
                </h3>
                <p className="text-xs text-[#a594c9] font-bold mt-0.5">
                  {selectedParent.nombre}
                </p>
              </div>

              <button
                onClick={() => handleOpenBuilder(null)}
                className="px-3 py-1.5 bg-[#ffbe00] border border-[#b38600] text-[#2c1a4d] font-pixel text-xs font-bold hover:bg-[#ffe066] shadow-[2px_2px_0px_#000] active:translate-y-0.5 rounded-2xs flex items-center gap-1.5 shrink-0"
              >
                <Plus size={14} /> CRAFTEAR RECETA
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 font-pixel text-xs min-h-0">
              {loadingRecipes ? (
                <div className="py-12 text-center text-[#ffbe00] animate-pulse">
                  Consultando fórmulas técnicas...
                </div>
              ) : parentRecipes.length === 0 ? (
                <div className="py-12 text-center text-[#6e588a] space-y-2">
                  <p>Este producto no tiene ninguna versión registrada.</p>
                </div>
              ) : (
                parentRecipes.map((recipe) => (
                  <div
                    key={recipe.id}
                    className={`bg-[#160c2b] border p-3 rounded-xs space-y-2 transition-all shadow-[2px_2px_0px_#000] ${
                      recipe.es_activa
                        ? "border-[#24cc8f] shadow-[0_0_15px_rgba(36,204,143,0.15)]"
                        : "border-[#432874]"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b border-[#432874] pb-2">
                      <div className="flex items-center gap-2">
                        <strong className="text-white text-sm">
                          {recipe.nombre_version}
                        </strong>
                        {recipe.es_activa ? (
                          <span className="text-[9px] bg-[#24cc8f]/20 border border-[#24cc8f] text-[#24cc8f] px-2 py-0.5 rounded-2xs font-bold flex items-center gap-1 shadow-[1px_1px_0px_#000]">
                            <CheckCircle2 size={10} /> ACTIVA EN PLANTA
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSetActiveRecipe(recipe.id)}
                            className="text-[9px] bg-[#24173e] border border-[#432874] text-[#a594c9] hover:text-[#ffbe00] hover:border-[#ffbe00] px-2 py-0.5 rounded-2xs transition-colors"
                          >
                            ACTIVAR FÓRMULA
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenBuilder(recipe)}
                          className="p-1 bg-[#2c1a4d] border border-[#432874] text-[#a594c9] hover:text-[#ffbe00] hover:border-[#ffbe00] rounded-2xs shadow-[1px_1px_0px_#000]"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteRecipe(recipe.id)}
                          className="p-1 bg-[#2c1a4d] border border-[#432874] text-[#a594c9] hover:text-[#f87171] hover:border-[#f87171] rounded-2xs shadow-[1px_1px_0px_#000]"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1 pt-1">
                      <span className="text-[10px] text-[#a594c9] block font-mono">
                        COMPOSICIÓN POR UNIDAD PRODUCIDA:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                        {recipe.ingredientes?.map((ing, iIdx) => (
                          <div
                            key={iIdx}
                            className="bg-[#24173e] border border-[#432874] p-2 flex justify-between items-center rounded-2xs text-[11px]"
                          >
                            <span className="text-[#38bdf8] font-bold truncate">
                              [{ing.item_codigo}] {ing.item_nombre}
                            </span>
                            <span className="text-[#ffbe00] font-bold bg-[#160c2b] px-1.5 py-0.5 border border-[#432874] shrink-0 ml-2">
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

            <div className="pt-2 border-t border-[#432874] flex justify-end font-pixel shrink-0">
              <button
                onClick={() => setSelectedParent(null)}
                className="px-4 py-1.5 bg-[#ffbe00] text-[#2c1a4d] font-bold text-xs hover:bg-[#ffe066] shadow-[2px_2px_0px_#000] rounded-xs"
              >
                CERRAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 2: MESA DE CRAFTEO (ALTURA RIGIDA h-[85vh] - CERO ENCOGIMIENTO)
      ========================================================= */}
      {isBuilderOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xs z-[110] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200 font-mono">
          <div className="bg-[#24173e] border-2 border-[#38bdf8] w-full max-w-5xl h-[85vh] p-4 sm:p-5 shadow-[0_0_40px_rgba(56,189,248,0.25)] space-y-3 relative rounded-xs flex flex-col">
            <button
              onClick={() => setIsFormBuilderOpen(false)}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 text-[#a594c9] hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b-2 border-[#432874] pb-2 shrink-0 flex justify-between items-center pr-6">
              <div>
                <span className="text-[10px] font-pixel text-[#38bdf8] bg-[#38bdf8]/10 px-2 py-0.5 border border-[#38bdf8]/30 rounded-xs font-bold">
                  MESA DE CRAFTEO & ALQUIMIA TÉCNICA
                </span>
                <h3 className="font-pixel text-sm text-white font-bold mt-1 flex items-center gap-2">
                  <Anvil size={16} className="text-[#ffbe00]" /> [
                  {selectedParent.codigo}] {selectedParent.nombre}
                </h3>
              </div>
            </div>

            {/* CONTENEDOR MESA DE CRAFTEO CON ALTURA TOTAL Y ESTABLE */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0 overflow-hidden font-pixel text-xs">
              {/* COLUMNA IZQUIERDA: INVENTARIO (ALTURA 100% FIJA) */}
              <div className="lg:col-span-5 bg-[#160c2b] border-2 border-[#432874] p-2.5 flex flex-col space-y-2 rounded-xs h-full min-h-0">
                <div className="flex items-center justify-between border-b border-[#432874] pb-1.5 shrink-0">
                  <span className="text-[#ffbe00] font-bold text-[11px] flex items-center gap-1">
                    <Package size={13} className="text-[#38bdf8]" /> INVENTARIO
                    DE INSUMOS
                  </span>

                  <div className="flex items-center gap-1 text-[9px]">
                    <button
                      onClick={() => setBuilderCatalogType("MP")}
                      className={`px-2 py-0.5 border rounded-2xs ${
                        builderCatalogType === "MP"
                          ? "bg-[#ffbe00] text-[#2c1a4d] border-[#b38600] font-bold"
                          : "bg-[#24173e] text-[#a594c9] border-[#432874]"
                      }`}
                    >
                      MP
                    </button>
                    <button
                      onClick={() => setBuilderCatalogType("SE")}
                      className={`px-2 py-0.5 border rounded-2xs ${
                        builderCatalogType === "SE"
                          ? "bg-[#38bdf8] text-[#2c1a4d] border-[#0284c7] font-bold"
                          : "bg-[#24173e] text-[#a594c9] border-[#432874]"
                      }`}
                    >
                      SE
                    </button>
                  </div>
                </div>

                <div className="relative shrink-0">
                  <Search
                    size={12}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#a594c9]"
                  />
                  <input
                    type="text"
                    placeholder="Filtrar materiales..."
                    value={builderCatalogSearch}
                    onChange={(e) => setBuilderCatalogSearch(e.target.value)}
                    className="w-full bg-[#24173e] border border-[#432874] text-xs text-white pl-7 pr-2 py-1 focus:outline-none focus:border-[#38bdf8] rounded-xs font-mono"
                  />
                </div>

                {/* CONTENEDOR CON ALTO COMPLETO INDEPENDIENTE DE LA CANTIDAD DE BÚSQUEDAS */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 h-full min-h-0">
                  {availableCatalogItems.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-[#6e588a] text-[11px] font-pixel">
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
                          className={`p-2 border flex items-center justify-between transition-all rounded-2xs shadow-[1px_1px_0px_#000] cursor-pointer ${
                            isAlreadyInRecipe
                              ? "bg-[#24173e]/50 border-[#432874] text-[#6e588a] opacity-50 cursor-not-allowed"
                              : "bg-[#24173e] border-[#432874] hover:border-[#ffbe00] hover:bg-[#281747] text-white"
                          }`}
                        >
                          <div className="truncate pr-2">
                            <span className="text-[#ffbe00] font-bold block truncate text-[11px]">
                              [{item.codigo}]
                            </span>
                            <span className="text-[10px] text-slate-300 block truncate">
                              {item.nombre}
                            </span>
                          </div>

                          <button
                            disabled={isAlreadyInRecipe}
                            className={`px-2 py-1 text-[10px] font-bold border shrink-0 rounded-2xs flex items-center gap-1 ${
                              isAlreadyInRecipe
                                ? "bg-[#160c2b] border-[#432874] text-[#6e588a]"
                                : "bg-[#ffbe00] text-[#2c1a4d] border-[#b38600] hover:bg-[#ffe066]"
                            }`}
                          >
                            <Plus size={10} />{" "}
                            {isAlreadyInRecipe ? "EN MESA" : "CRAFTEAR"}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* COLUMNA DERECHA: FÓRMULA MAESTRA */}
              <div className="lg:col-span-7 bg-[#160c2b] border-2 border-[#432874] p-2.5 flex flex-col space-y-2 rounded-xs h-full min-h-0">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 bg-[#24173e] p-2 border border-[#432874] rounded-2xs shrink-0">
                  <div className="sm:col-span-8">
                    <label className="text-[#a594c9] text-[10px] block mb-0.5">
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
                      className="w-full bg-[#160c2b] border border-[#432874] text-xs text-white px-2 py-1 font-bold focus:outline-none focus:border-[#38bdf8] rounded-xs"
                    />
                  </div>

                  <div className="sm:col-span-4 flex items-center pt-3 justify-end">
                    <label className="flex items-center gap-1.5 cursor-pointer text-[#24cc8f] font-bold text-[11px]">
                      <input
                        type="checkbox"
                        checked={recipeForm.es_activa}
                        onChange={(e) =>
                          setRecipeForm({
                            ...recipeForm,
                            es_activa: e.target.checked,
                          })
                        }
                        className="w-3.5 h-3.5 accent-[#24cc8f] cursor-pointer"
                      />
                      <span>ACTIVAR FÓRMULA</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-between items-center border-b border-[#432874] pb-1 shrink-0">
                  <span className="text-[#38bdf8] font-bold text-[11px] flex items-center gap-1">
                    <Sparkle size={13} className="text-[#ffbe00]" /> MATERIALES
                    EN MESA ({recipeForm.ingredientes.length})
                  </span>
                  <span className="text-[10px] text-[#a594c9]">
                    Ajustá cantidades por unidad producida
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 h-full min-h-0">
                  {recipeForm.ingredientes.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-[#6e588a] space-y-1 my-auto">
                      <p className="text-xs font-bold">
                        Mesa de crafteo vacía.
                      </p>
                      <p className="text-[10px] text-[#a594c9]">
                        Hacé clic en los insumos del panel izquierdo para
                        sumarlos.
                      </p>
                    </div>
                  ) : (
                    recipeForm.ingredientes.map((ing, idx) => (
                      <div
                        key={idx}
                        className="bg-[#24173e] border border-[#432874] p-2 flex items-center justify-between rounded-2xs shadow-[1px_1px_0px_#000]"
                      >
                        <div className="truncate pr-2 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-bold px-1.5 py-0.2 border rounded-2xs bg-[#160c2b] text-[#ffbe00] border-[#432874]">
                              {ing.item_type}
                            </span>
                            <strong className="text-white text-xs truncate">
                              [{ing.item_codigo}] {ing.item_nombre}
                            </strong>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-[#a594c9]">
                            Cant:
                          </span>
                          <input
                            type="number"
                            step="0.001"
                            value={ing.cantidad}
                            onChange={(e) =>
                              handleUpdateIngredientQty(idx, e.target.value)
                            }
                            className="w-20 bg-[#160c2b] border border-[#432874] text-xs text-white font-bold px-2 py-0.5 text-right focus:outline-none focus:border-[#ffbe00] rounded-xs"
                          />
                          <span className="text-[10px] text-[#a594c9] w-8">
                            {ing.unidad_medida || "Kg"}
                          </span>

                          <button
                            onClick={() => handleRemoveIngredient(idx)}
                            className="text-[#f87171] hover:text-white p-1 ml-1"
                            title="Quitar"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[#432874] flex justify-end gap-2 font-pixel shrink-0">
              <button
                onClick={() => setIsFormBuilderOpen(false)}
                className="px-3.5 py-1.5 border border-[#432874] text-[#a594c9] hover:text-white text-xs rounded-xs"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveRecipe}
                className="px-4 py-1.5 bg-[#ffbe00] text-[#2c1a4d] font-bold text-xs hover:bg-[#ffe066] shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] rounded-xs flex items-center gap-1.5"
              >
                <CheckCircle2 size={14} /> GUARDAR FÓRMULA MAESTRA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
