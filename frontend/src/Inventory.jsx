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
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Plus,
  Layers,
  Package,
  Filter,
  ChevronDown,
  Building2,
  AlertTriangle,
  History,
  Calendar,
} from "lucide-react";

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [recipesList, setRecipesList] = useState([]);
  const [proveedoresDB, setProveedoresDB] = useState([]);

  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [search, setSearch] = useState("");

  // FILTROS (PLANTA Y FALTANTES)
  const [filtroPlanta, setFiltroPlanta] = useState("TODAS");
  const [isPlantaMenuOpen, setIsPlantaMenuOpen] = useState(false);
  const [verFaltantes, setVerFaltantes] = useState(false);

  // AUDITORÍA GOOGLE SHEETS
  const [previewData, setPreviewData] = useState(null);
  const [includeNuevos, setIncludeNuevos] = useState(true);
  const [includeModificados, setIncludeModificados] = useState(true);
  const [selectedNuevos, setSelectedNuevos] = useState([]);
  const [selectedModificados, setSelectedModificados] = useState([]);

  // ORDENAMIENTO
  const [sortColumn, setSortColumn] = useState("codigo");
  const [sortDirection, setSortDirection] = useState("asc");

  // PAGINACIÓN EXACTA
  const tableAreaRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // MODAL EDICIÓN Y PROVEEDORES
  const [editingItem, setEditingItem] = useState(null);
  const [newStockValue, setNewStockValue] = useState("");
  const [newStockMinimo, setNewStockMinimo] = useState("");
  const [newUnidadValue, setNewUnidadValue] = useState("KILOS");
  const [newPlantaValue, setNewPlantaValue] = useState("Argentina");

  const [newProveedorId, setNewProveedorId] = useState("");
  const [proveedorSearch, setProveedorSearch] = useState("");
  const [isProveedorDropdownOpen, setIsProveedorDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // MODAL DETALLE Y VINCULADOS
  const [detailItem, setDetailItem] = useState(null);
  const [usageModalOpen, setUsageModalOpen] = useState(false);
  const [usageSearch, setUsageSearch] = useState("");

  // MODAL AUDITORÍA (HISTORIAL)
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditData, setAuditData] = useState([]);
  const [auditDateFrom, setAuditDateFrom] = useState("");
  const [auditDateTo, setAuditDateTo] = useState("");
  const [loadingAudit, setLoadingAudit] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsProveedorDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const updatePageSize = () => {
      if (!tableAreaRef.current) return;
      const containerHeight = tableAreaRef.current.clientHeight;
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
    if (tableAreaRef.current) observer.observe(tableAreaRef.current);
    return () => observer.disconnect();
  }, [itemsPerPage]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const [resMP, resRecipes, resProv] = await Promise.all([
        fetch("/api/materias-primas"),
        fetch("/api/ingenierias/recetas-activas-bulk"),
        fetch("/api/proveedores").catch(() => ({ ok: false })),
      ]);

      if (resMP.ok) setItems(await resMP.json());
      if (resRecipes.ok) setRecipesList(await resRecipes.json());
      if (resProv.ok) setProveedoresDB(await resProv.json());
    } catch (err) {
      console.error("Error al cargar datos:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditoria = async (id, desde = "", hasta = "") => {
    setLoadingAudit(true);
    try {
      let url = `/api/materias-primas/${id}/auditoria`;
      if (desde && hasta) {
        url += `?desde=${desde}&hasta=${hasta}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        setAuditData(await res.json());
      } else {
        setAuditData([]);
      }
    } catch (err) {
      console.error(err);
      setAuditData([]);
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const filteredProveedores = useMemo(() => {
    if (!proveedorSearch) return proveedoresDB;
    return proveedoresDB.filter((p) =>
      p.nombre.toLowerCase().includes(proveedorSearch.toLowerCase()),
    );
  }, [proveedoresDB, proveedorSearch]);

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
    let result = items.filter((item) => {
      const matchSearch =
        item.codigo.toLowerCase().includes(search.toLowerCase()) ||
        item.nombre.toLowerCase().includes(search.toLowerCase());

      const itemPlanta = (item.planta || "Argentina").toUpperCase();
      const matchPlanta =
        filtroPlanta === "TODAS" ? true : itemPlanta === filtroPlanta;

      // FILTRO FALTANTES
      const isFaltante = item.stock_actual <= (item.stock_minimo || 0);
      const matchFaltante = verFaltantes ? isFaltante : true;

      return matchSearch && matchPlanta && matchFaltante;
    });

    if (sortColumn) {
      result.sort((a, b) => {
        let aVal = a[sortColumn];
        let bVal = b[sortColumn];

        if (aVal == null) aVal = "";
        if (bVal == null) bVal = "";

        // SOLO aplicamos toLowerCase si realmente es un string (esto soluciona el error)
        if (typeof aVal === "string") {
          aVal = aVal.toLowerCase();
        }
        if (typeof bVal === "string") {
          bVal = bVal.toLowerCase();
        }

        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [items, search, filtroPlanta, verFaltantes, sortColumn, sortDirection]);

  const totalPages = Math.ceil(processedItems.length / itemsPerPage) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return processedItems.slice(start, start + itemsPerPage);
  }, [processedItems, currentPage, itemsPerPage]);

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

  const filteredUsageList = useMemo(() => {
    return detailItemUsage.filter(
      (u) =>
        u.productCode.toLowerCase().includes(usageSearch.toLowerCase()) ||
        u.productName.toLowerCase().includes(usageSearch.toLowerCase()),
    );
  }, [detailItemUsage, usageSearch]);

  const handleSaveStock = async () => {
    if (!editingItem) return;
    const valStock = parseFloat(newStockValue);
    const valMinimo = parseFloat(newStockMinimo) || 0;

    if (isNaN(valStock)) return alert("Ingresá un número válido de stock");

    try {
      const res = await fetch(`/api/materias-primas/${editingItem.id}/stock`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stock: valStock,
          stock_minimo: valMinimo,
          unidad_medida: newUnidadValue,
          planta: newPlantaValue,
          proveedor_id: newProveedorId || null,
        }),
      });

      if (res.ok) {
        setEditingItem(null);
        fetchItems();
      } else {
        alert("Error al guardar los cambios.");
      }
    } catch (err) {
      alert("Error al conectar con el servidor.");
    }
  };

  const handleApplyAuditFilter = () => {
    if (detailItem) {
      fetchAuditoria(detailItem.id, auditDateFrom, auditDateTo);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-black font-sans text-zinc-200 overflow-hidden relative selection:bg-[#FF5A00]/30">
      {/* 1. HEADER HERO */}
      <div className="border-b border-zinc-800/50 p-6 md:p-10 flex flex-col md:flex-row md:items-end justify-between gap-6 shrink-0 bg-[#050505] relative overflow-hidden">
        <div className="z-10">
          <h1 className="text-4xl md:text-5xl font-extrabold italic tracking-tighter text-white uppercase leading-none">
            Materias <span className="text-[#FF5A00]">Primas</span>
          </h1>
          <p className="text-zinc-500 text-sm mt-2 max-w-md uppercase tracking-widest font-bold">
            INVENTARIO DE INSUMOS Y MATERIALES
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
      <div className="px-4 py-4 md:px-8 border-b border-zinc-800/50 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 bg-black relative z-20">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto flex-1">
          {/* BUSCADOR */}
          <div className="relative w-full sm:w-80">
            <Search
              size={14}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600"
            />
            <input
              type="text"
              placeholder="Buscar por código o insumo..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-transparent border border-zinc-800 focus:border-[#FF5A00] text-white pl-10 pr-4 py-2.5 text-xs transition-colors outline-none"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* BOTÓN EMBUDO FILTRO DE PLANTA */}
            <div className="relative w-full sm:w-auto">
              <button
                onClick={() => setIsPlantaMenuOpen(!isPlantaMenuOpen)}
                className="w-full sm:w-auto flex items-center justify-between gap-2.5 bg-[#050505] border border-zinc-800 hover:border-zinc-700 px-4 py-2.5 text-xs font-bold tracking-widest uppercase text-white transition-colors cursor-pointer"
              >
                <Filter size={14} className="text-[#FF5A00]" />
                <span className="text-zinc-500">PLANTA:</span>
                <span className="text-[#FF5A00]">{filtroPlanta}</span>
                <ChevronDown
                  size={14}
                  className={`text-zinc-500 transition-transform ${isPlantaMenuOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isPlantaMenuOpen && (
                <div className="absolute top-full left-0 w-full sm:w-48 mt-1 bg-[#050505] border border-zinc-800 shadow-2xl z-50 flex flex-col">
                  {["TODAS", "ARGENTINA", "PARAGUAY"].map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setFiltroPlanta(p);
                        setIsPlantaMenuOpen(false);
                        setCurrentPage(1);
                      }}
                      className={`text-left px-4 py-3 text-xs font-bold tracking-widest uppercase transition-colors border-l-2 ${
                        filtroPlanta === p
                          ? "border-[#FF5A00] text-[#FF5A00] bg-[#FF5A00]/5"
                          : "border-transparent text-zinc-500 hover:text-white hover:bg-zinc-900/50"
                      }`}
                    >
                      {p === "TODAS" ? "MOSTRAR AMBAS" : p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* BOTÓN FALTANTES */}
            <button
              onClick={() => {
                setVerFaltantes(!verFaltantes);
                setCurrentPage(1);
              }}
              className={`flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold tracking-widest uppercase transition-colors cursor-pointer border ${
                verFaltantes
                  ? "bg-[#FF0055]/10 border-[#FF0055] text-[#FF0055]"
                  : "bg-[#050505] border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-white"
              }`}
            >
              <AlertTriangle size={14} /> FALTANTES
            </button>
          </div>
        </div>

        {/* CONTADOR TOTAL */}
        <div className="border border-zinc-800 px-4 py-2 text-[10px] md:text-xs text-zinc-500 font-mono tracking-widest flex items-center gap-2 bg-[#050505] uppercase font-bold w-full sm:w-auto justify-between shrink-0">
          <span className="flex items-center gap-1.5">TOTAL INSUMOS:</span>
          <strong className="text-white">
            {processedItems.length} / {items.length}
          </strong>
        </div>
      </div>

      {/* 3. VISTA ESCRITORIO */}
      <div className="hidden md:flex flex-1 flex-col p-4 md:p-8 bg-black min-h-0 justify-between overflow-hidden">
        <div
          ref={tableAreaRef}
          className="flex-1 min-h-0 w-full flex flex-col justify-start"
        >
          <div className="w-full border border-zinc-800/90 bg-[#030303] flex flex-col overflow-hidden shadow-2xl h-fit">
            {/* CABECERA (48px) */}
            <div className="grid grid-cols-[250px_1fr_120px_100px_120px_70px] h-12 bg-[#080808] border-b border-zinc-800/90 items-center text-zinc-400 font-mono text-[10px] font-extrabold uppercase tracking-widest shrink-0 select-none">
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
                <span>MATERIA PRIMA</span>
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
                onClick={() => handleSort("planta")}
                className="px-3 flex items-center justify-center gap-1 cursor-pointer hover:text-[#FF5A00] transition-colors"
              >
                <span>PLANTA</span>
                {sortColumn === "planta" ? (
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
                onClick={() => handleSort("unidad_medida")}
                className="px-3 flex items-center justify-center gap-1 cursor-pointer hover:text-[#FF5A00] transition-colors"
              >
                <span>UNIDAD</span>
                {sortColumn === "unidad_medida" ? (
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
                onClick={() => handleSort("stock_actual")}
                className="px-4 flex items-center justify-end gap-1 cursor-pointer hover:text-[#FF5A00] transition-colors"
              >
                <span>STOCK</span>
                {sortColumn === "stock_actual" ? (
                  sortDirection === "asc" ? (
                    <ArrowUp size={12} className="text-[#FF5A00]" />
                  ) : (
                    <ArrowDown size={12} className="text-[#FF5A00]" />
                  )
                ) : (
                  <ArrowUpDown size={10} className="text-zinc-700" />
                )}
              </div>
              <div className="px-2 flex justify-center text-center">EDITAR</div>
            </div>

            {/* FILAS (48px) SIN DIVIDE-Y */}
            <div className="flex flex-col bg-black">
              {loading ? (
                <div className="py-12 flex justify-center text-[#FF5A00]">
                  <RefreshCw className="animate-spin" size={28} />
                </div>
              ) : paginatedItems.length === 0 ? (
                <div className="py-12 text-center text-zinc-600 font-bold uppercase tracking-widest text-xs">
                  No hay insumos registrados.
                </div>
              ) : (
                paginatedItems.map((item) => {
                  const enFalta = item.stock_actual <= (item.stock_minimo || 0);

                  return (
                    <div
                      key={item.id}
                      onClick={() => setDetailItem(item)}
                      className="grid grid-cols-[250px_1fr_120px_100px_120px_70px] h-12 items-center border-b border-zinc-800/80 last:border-b-0 hover:bg-[#0a0a0a] transition-colors duration-150 group cursor-pointer text-xs shrink-0"
                    >
                      <div className="px-4 font-mono font-bold truncate">
                        <span className="text-[#FF5A00] bg-[#FF5A00]/10 border border-[#FF5A00]/25 px-2 py-0.5 text-xs group-hover:bg-[#FF5A00] group-hover:text-black transition-colors inline-block max-w-full truncate">
                          {item.codigo}
                        </span>
                      </div>

                      <div className="px-4 text-white font-bold text-xs truncate pr-2">
                        {item.nombre}
                      </div>

                      <div className="px-3 flex justify-center font-mono font-bold tracking-widest uppercase text-[10px]">
                        <span className="text-zinc-400 bg-[#050505] border border-zinc-800/80 px-2 py-0.5">
                          {(item.planta || "ARGENTINA").toUpperCase()}
                        </span>
                      </div>

                      <div className="px-3 flex justify-center text-zinc-500 font-mono font-bold tracking-widest uppercase text-[10px]">
                        {item.unidad_medida || "KILOS"}
                      </div>

                      <div className="px-4 flex justify-end font-mono">
                        <span
                          className={`font-bold text-xs px-2.5 py-0.5 border ${
                            enFalta
                              ? "text-[#FF0055] bg-[#FF0055]/10 border-[#FF0055]/30"
                              : "text-zinc-200 border-zinc-800 bg-black"
                          }`}
                        >
                          {item.stock_actual.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>

                      <div className="px-2 flex justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingItem(item);
                            setNewStockValue(item.stock_actual);
                            setNewStockMinimo(item.stock_minimo || 0);
                            setNewUnidadValue(item.unidad_medida || "KILOS");
                            setNewPlantaValue(item.planta || "Argentina");
                            setNewProveedorId(item.proveedor_id || "");

                            const prov = proveedoresDB.find(
                              (p) => p.id === item.proveedor_id,
                            );
                            setProveedorSearch(prov ? prov.nombre : "");
                            setIsProveedorDropdownOpen(false);
                          }}
                          className="p-1.5 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                          title="Editar Insumo"
                        >
                          <Edit2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 5. PAGINACIÓN DESKTOP */}
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
            Sin materias primas.
          </div>
        ) : (
          paginatedItems.map((item) => {
            const enFalta = item.stock_actual <= (item.stock_minimo || 0);
            return (
              <div
                key={item.id}
                onClick={() => setDetailItem(item)}
                className="bg-[#050505] border border-zinc-800/80 p-4 space-y-3 shrink-0 cursor-pointer active:scale-[0.99] transition-transform shadow-md"
              >
                <div className="flex justify-between items-start">
                  <span className="bg-[#FF5A00]/10 border border-[#FF5A00]/20 text-[#FF5A00] px-1.5 py-0.5 text-[10px] font-mono font-bold tracking-widest">
                    {item.codigo}
                  </span>

                  <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold tracking-widest uppercase">
                    <span className="text-zinc-400 bg-[#050505] border border-zinc-800/80 px-2 py-0.5">
                      {(item.planta || "ARGENTINA").toUpperCase()}
                    </span>
                    <span className="text-zinc-600">|</span>
                    <span className="text-zinc-400">
                      {item.unidad_medida || "KILOS"}
                    </span>
                  </div>
                </div>

                <div className="text-white font-bold text-sm leading-snug">
                  {item.nombre}
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-zinc-800/50">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase font-bold tracking-widest">
                    Stock:{" "}
                    <strong
                      className={enFalta ? "text-[#FF0055]" : "text-zinc-200"}
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
                      setNewStockMinimo(item.stock_minimo || 0);
                      setNewUnidadValue(item.unidad_medida || "KILOS");
                      setNewPlantaValue(item.planta || "Argentina");
                      setNewProveedorId(item.proveedor_id || "");
                      const prov = proveedoresDB.find(
                        (p) => p.id === item.proveedor_id,
                      );
                      setProveedorSearch(prov ? prov.nombre : "");
                      setIsProveedorDropdownOpen(false);
                    }}
                    className="px-3 py-1.5 border border-zinc-800 text-zinc-400 hover:text-white font-mono text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5"
                  >
                    <Edit2 size={10} /> EDITAR
                  </button>
                </div>
              </div>
            );
          })
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

      {/* MODAL 1: FICHA PRINCIPAL REDISEÑADA (ESTÉTICA INDUSTRIAL) */}
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
                <span className="text-[10px] font-mono font-bold text-[#FF5A00] bg-[#FF5A00]/10 px-2 py-0.5 border border-[#FF5A00]/20 tracking-widest uppercase">
                  FICHA DE MATERIA PRIMA
                </span>
                <span
                  className={`text-[10px] font-mono tracking-widest uppercase font-bold border border-zinc-800 px-2 py-0.5 ${
                    (detailItem.planta || "Argentina").toLowerCase() ===
                    "paraguay"
                      ? "text-cyan-500 bg-cyan-500/10 border-cyan-500/20"
                      : "text-zinc-400 bg-black"
                  }`}
                >
                  {(detailItem.planta || "ARGENTINA").toUpperCase()}
                </span>
              </div>

              <div>
                <h3 className="text-3xl text-white font-extrabold italic uppercase tracking-tighter flex items-center gap-2.5">
                  <Package size={28} className="text-[#FF5A00]" />
                  {detailItem.codigo}
                </h3>
                <p className="text-sm text-zinc-300 font-medium mt-1.5">
                  {detailItem.nombre}
                </p>
              </div>

              {detailItem.proveedor_id ? (
                <div className="flex items-center gap-2 text-zinc-500 font-mono text-[10px] uppercase font-bold tracking-widest">
                  <Building2 size={14} /> PROVEEDOR:{" "}
                  <span className="text-white">
                    {proveedoresDB.find((p) => p.id === detailItem.proveedor_id)
                      ?.nombre || "Desconocido"}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-zinc-600 font-mono text-[10px] uppercase font-bold tracking-widest">
                  <Building2 size={14} /> PROVEEDOR: NO ASIGNADO
                </div>
              )}
            </div>

            <div className="w-full h-px bg-zinc-800/80"></div>

            <div className="grid grid-cols-2 gap-4 font-mono text-xs uppercase tracking-widest font-bold">
              <div className="bg-black p-5 border border-zinc-800 flex flex-col gap-2 relative overflow-hidden">
                <span className="text-[10px] text-zinc-500">STOCK ACTUAL:</span>
                <strong
                  className={`text-2xl leading-none z-10 flex items-baseline gap-1.5 ${
                    detailItem.stock_actual <= (detailItem.stock_minimo || 0)
                      ? "text-[#FF0055]"
                      : "text-white"
                  }`}
                >
                  {detailItem.stock_actual.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                  <span className="text-xs text-zinc-600 font-medium">
                    {detailItem.unidad_medida || "KILOS"}
                  </span>
                </strong>
                {detailItem.stock_actual <= (detailItem.stock_minimo || 0) && (
                  <div className="absolute inset-0 bg-[#FF0055]/5 pointer-events-none" />
                )}
              </div>

              <div className="bg-black p-5 border border-zinc-800 flex flex-col gap-2">
                <span className="text-[10px] text-zinc-500">PUNTO PEDIDO:</span>
                <strong className="text-zinc-400 text-2xl leading-none flex items-baseline gap-1.5">
                  {(detailItem.stock_minimo || 0).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                  <span className="text-xs text-zinc-600 font-medium">MIN</span>
                </strong>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-2">
              <button
                onClick={() => {
                  setUsageSearch("");
                  setUsageModalOpen(true);
                }}
                disabled={detailItemUsage.length === 0}
                className="w-full py-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 hover:text-white hover:bg-zinc-800 text-zinc-400 font-bold uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-30 disabled:hover:border-zinc-800 disabled:hover:text-zinc-400 disabled:hover:bg-zinc-900"
              >
                <Layers size={16} /> USO ({detailItemUsage.length})
              </button>

              <button
                onClick={() => {
                  setAuditDateFrom("");
                  setAuditDateTo("");
                  fetchAuditoria(detailItem.id);
                  setAuditModalOpen(true);
                }}
                className="w-full py-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 hover:text-white hover:bg-zinc-800 text-zinc-400 font-bold uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <History size={16} /> VER AUDITORÍA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AUDITORÍA (HISTORIAL DE MOVIMIENTOS) */}
      {auditModalOpen && detailItem && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-2xl h-[85vh] p-6 shadow-2xl space-y-4 relative flex flex-col">
            <button
              onClick={() => setAuditModalOpen(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="border-b border-zinc-800/80 pb-3 shrink-0">
              <span className="text-[10px] font-mono font-bold text-[#FF5A00] bg-[#FF5A00]/10 px-2 py-0.5 border border-[#FF5A00]/20 tracking-widest uppercase">
                HISTORIAL DE MOVIMIENTOS
              </span>
              <h3 className="font-extrabold italic text-xl text-white mt-2 uppercase tracking-tighter">
                {detailItem.codigo}
              </h3>
            </div>

            {/* BARRA DE FILTROS DE FECHA */}
            <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
              <div className="flex items-center gap-2 bg-black border border-zinc-800 px-3 py-2 flex-1">
                <Calendar size={14} className="text-zinc-500" />
                <input
                  type="date"
                  value={auditDateFrom}
                  onChange={(e) => setAuditDateFrom(e.target.value)}
                  className="bg-transparent text-zinc-300 outline-none w-full uppercase"
                  style={{ colorScheme: "dark" }}
                />
              </div>
              <span className="text-zinc-600 font-bold">AL</span>
              <div className="flex items-center gap-2 bg-black border border-zinc-800 px-3 py-2 flex-1">
                <Calendar size={14} className="text-zinc-500" />
                <input
                  type="date"
                  value={auditDateTo}
                  onChange={(e) => setAuditDateTo(e.target.value)}
                  className="bg-transparent text-zinc-300 outline-none w-full uppercase"
                  style={{ colorScheme: "dark" }}
                />
              </div>
              <button
                onClick={handleApplyAuditFilter}
                className="bg-[#FF5A00] text-black font-bold px-4 py-2 hover:bg-white transition-colors cursor-pointer"
              >
                FILTRAR
              </button>
            </div>

            {/* TABLA DE AUDITORÍA */}
            <div className="flex-1 overflow-hidden flex flex-col border border-zinc-800 bg-[#030303]">
              <div className="grid grid-cols-[140px_1fr_100px_100px_100px] h-10 bg-[#080808] border-b border-zinc-800 items-center text-zinc-500 font-mono text-[9px] font-bold uppercase tracking-widest shrink-0 px-4">
                <div>FECHA / HORA</div>
                <div>USUARIO</div>
                <div className="text-center">TIPO</div>
                <div className="text-right">CANTIDAD</div>
                <div className="text-right">STOCK FINAL</div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col bg-black">
                {loadingAudit ? (
                  <div className="py-12 flex justify-center text-[#FF5A00] my-auto">
                    <RefreshCw className="animate-spin" size={24} />
                  </div>
                ) : auditData.length === 0 ? (
                  <div className="py-12 text-center text-zinc-600 font-bold uppercase tracking-widest text-xs my-auto">
                    No hay movimientos registrados.
                  </div>
                ) : (
                  auditData.map((mov) => (
                    <div
                      key={mov.id}
                      className="grid grid-cols-[140px_1fr_100px_100px_100px] items-center p-4 border-b border-zinc-900/80 last:border-b-0 text-xs hover:bg-[#0a0a0a] transition-colors"
                    >
                      <div className="font-mono text-zinc-400">
                        {new Date(mov.fecha).toLocaleString("es-AR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </div>
                      <div className="font-bold text-white truncate pr-2">
                        {mov.usuario}
                      </div>
                      <div className="flex justify-center font-mono font-bold tracking-widest text-[9px]">
                        <span
                          className={`px-2 py-0.5 border ${
                            mov.tipo_movimiento === "INGRESO"
                              ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                              : mov.tipo_movimiento === "EGRESO"
                                ? "text-rose-400 border-rose-500/30 bg-rose-500/10"
                                : "text-zinc-400 border-zinc-700 bg-zinc-900"
                          }`}
                        >
                          {mov.tipo_movimiento}
                        </span>
                      </div>
                      <div
                        className={`font-mono font-bold text-right ${mov.cantidad > 0 ? "text-emerald-400" : "text-rose-400"}`}
                      >
                        {mov.cantidad > 0 ? "+" : ""}
                        {parseFloat(mov.cantidad).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                      </div>
                      <div className="font-mono font-bold text-zinc-200 text-right">
                        {parseFloat(mov.stock_resultante).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VINCULADOS A RECETAS */}
      {usageModalOpen && detailItem && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-lg h-[80vh] min-h-[480px] p-6 shadow-2xl space-y-5 relative flex flex-col">
            <button
              onClick={() => setUsageModalOpen(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="border-b border-zinc-800/80 pb-3 shrink-0">
              <span className="text-[10px] font-mono font-bold text-[#FFD700] bg-[#FFD700]/10 px-2 py-0.5 border border-[#FFD700]/20 tracking-widest uppercase">
                PRODUCTOS VINCULADOS
              </span>
              <h3 className="font-extrabold italic text-xl text-white mt-2 flex items-center gap-2 uppercase tracking-tighter">
                <Package size={20} className="text-[#FF5A00]" />
                {detailItem.codigo}
              </h3>
            </div>

            <div className="relative shrink-0 font-sans">
              <Search
                size={14}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600"
              />
              <input
                type="text"
                placeholder="Filtrar por código o nombre de producto..."
                value={usageSearch}
                onChange={(e) => setUsageSearch(e.target.value)}
                className="w-full bg-black border border-zinc-800 text-xs text-white pl-10 pr-4 py-3 focus:border-[#FF5A00] outline-none"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0 text-xs font-sans custom-scrollbar">
              {filteredUsageList.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-600 font-bold uppercase tracking-widest text-[10px]">
                  No se encontraron coincidencias.
                </div>
              ) : (
                filteredUsageList.map((u, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-black border border-zinc-800/80 flex justify-between items-center hover:border-zinc-600 transition-colors"
                  >
                    <div className="truncate pr-2 space-y-1">
                      <span className="text-[#FF5A00] font-mono font-bold block truncate text-[10px] uppercase tracking-widest">
                        {u.productCode}
                      </span>
                      <span className="text-white font-bold truncate block text-xs">
                        {u.productName}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-zinc-400 border border-zinc-800 px-2 py-1 shrink-0 font-bold tracking-widest uppercase">
                      VERSIÓN {u.version}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 border-t border-zinc-800/80 flex justify-between items-center shrink-0 font-mono text-xs">
              <span className="text-zinc-500 text-[10px] uppercase tracking-widest font-bold">
                Mostrando{" "}
                <strong className="text-white">
                  {filteredUsageList.length}
                </strong>{" "}
                de{" "}
                <strong className="text-white">{detailItemUsage.length}</strong>
              </span>
              <button
                onClick={() => setUsageModalOpen(false)}
                className="px-5 py-2.5 border border-zinc-800 text-zinc-400 hover:text-white text-[10px] font-bold uppercase tracking-widest transition cursor-pointer"
              >
                VOLVER
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDICIÓN COMPLETA */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-sm p-6 shadow-2xl space-y-5 relative text-xs">
            <button
              onClick={() => setEditingItem(null)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="border-b border-zinc-800/80 pb-3">
              <span className="text-[10px] font-mono font-bold text-white bg-zinc-800 px-2 py-0.5 tracking-widest uppercase">
                EDITAR MATERIA PRIMA
              </span>
              <h3 className="font-extrabold italic text-lg text-[#FF5A00] mt-3 uppercase tracking-tighter">
                {editingItem.codigo}
              </h3>
              <p className="text-xs text-zinc-400 font-medium truncate mt-0.5">
                {editingItem.nombre}
              </p>
            </div>

            <div className="space-y-4 font-mono">
              <div className="grid grid-cols-2 gap-3">
                {/* CAMPO STOCK */}
                <div className="space-y-1.5">
                  <label className="text-zinc-500 block text-[10px] font-bold uppercase tracking-widest">
                    STOCK ACTUAL:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newStockValue}
                    onChange={(e) => setNewStockValue(e.target.value)}
                    className="w-full bg-black border border-zinc-800 p-3 text-white font-bold text-right focus:outline-none focus:border-[#FF5A00] text-sm"
                    autoFocus
                  />
                </div>

                {/* CAMPO STOCK MINIMO */}
                <div className="space-y-1.5">
                  <label className="text-zinc-500 block text-[10px] font-bold uppercase tracking-widest">
                    PUNTO PEDIDO:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newStockMinimo}
                    onChange={(e) => setNewStockMinimo(e.target.value)}
                    className="w-full bg-[#050505] border border-zinc-800 p-3 text-zinc-400 font-bold text-right focus:outline-none focus:border-[#FF5A00] text-sm"
                  />
                </div>
              </div>

              {/* CAMPO UNIDAD DE MEDIDA */}
              <div className="space-y-1.5 relative">
                <label className="text-zinc-500 block text-[10px] font-bold uppercase tracking-widest">
                  UNIDAD DE MEDIDA:
                </label>
                <div className="relative">
                  <select
                    value={newUnidadValue}
                    onChange={(e) => setNewUnidadValue(e.target.value)}
                    className="w-full bg-black border border-zinc-800 p-3 text-white font-bold focus:outline-none focus:border-[#FF5A00] text-xs uppercase appearance-none cursor-pointer"
                  >
                    <option value="KILOS">KILOS</option>
                    <option value="UNIDADES">UNIDADES</option>
                    <option value="METROS">METROS</option>
                    <option value="LITROS">LITROS</option>
                    <option value="PAQUETES">PAQUETES</option>
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                  />
                </div>
              </div>

              {/* CAMPO PLANTA */}
              <div className="space-y-1.5 relative">
                <label className="text-zinc-500 block text-[10px] font-bold uppercase tracking-widest">
                  PLANTA / UBICACIÓN:
                </label>
                <div className="relative">
                  <select
                    value={newPlantaValue}
                    onChange={(e) => setNewPlantaValue(e.target.value)}
                    className="w-full bg-black border border-zinc-800 p-3 text-white font-bold focus:outline-none focus:border-[#FF5A00] text-xs appearance-none cursor-pointer uppercase"
                  >
                    <option value="Argentina">ARGENTINA</option>
                    <option value="Paraguay">PARAGUAY</option>
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                  />
                </div>
              </div>

              {/* BUSCADOR PROVEEDOR */}
              <div className="space-y-1.5 relative" ref={dropdownRef}>
                <label className="text-zinc-500 block text-[10px] font-bold uppercase tracking-widest">
                  PROVEEDOR:
                </label>
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"
                  />
                  <input
                    type="text"
                    value={proveedorSearch}
                    onChange={(e) => {
                      setProveedorSearch(e.target.value);
                      setIsProveedorDropdownOpen(true);
                      setNewProveedorId("");
                    }}
                    onFocus={() => setIsProveedorDropdownOpen(true)}
                    placeholder="Escribí para buscar..."
                    className="w-full bg-black border border-zinc-800 py-3 pl-9 pr-3 text-white font-bold focus:outline-none focus:border-[#FF5A00] text-xs uppercase"
                  />

                  {isProveedorDropdownOpen && (
                    <div className="absolute bottom-full mb-1 left-0 w-full bg-[#050505] border border-zinc-800 shadow-2xl z-50 max-h-40 overflow-y-auto custom-scrollbar">
                      {filteredProveedores.length > 0 ? (
                        filteredProveedores.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => {
                              setProveedorSearch(p.nombre);
                              setNewProveedorId(p.id);
                              setIsProveedorDropdownOpen(false);
                            }}
                            className="p-3 hover:bg-zinc-900 cursor-pointer text-xs text-zinc-300 hover:text-white uppercase font-bold transition-colors border-b border-zinc-800/50 last:border-b-0"
                          >
                            {p.nombre}
                          </div>
                        ))
                      ) : (
                        <div className="p-3 text-xs text-zinc-600 font-bold uppercase tracking-widest">
                          Sin coincidencias.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-5 border-t border-zinc-800 flex justify-end gap-3 font-mono">
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 text-zinc-500 hover:text-white text-[10px] font-bold uppercase tracking-widest transition cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveStock}
                className="px-5 py-2 bg-[#FFD700] hover:bg-white text-black font-bold uppercase tracking-widest text-[10px] transition cursor-pointer"
              >
                CONFIRMAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AUDITORÍA SHEETS */}
      {previewData && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-2xl p-6 shadow-2xl space-y-5 relative max-h-[90vh] flex flex-col text-xs">
            <button
              onClick={() => setPreviewData(null)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="border-b border-zinc-800/80 pb-3 shrink-0">
              <span className="text-[10px] font-mono font-bold text-[#FFD700] bg-[#FFD700]/10 px-2 py-0.5 border border-[#FFD700]/20 tracking-widest uppercase">
                AUDITORÍA Y SINCRONIZACIÓN
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
                  ¡NO SE ENCONTRARON DIFERENCIAS!
                </p>
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest">
                  Tu base de datos coincide perfectamente con Google Sheets.
                </p>
              </div>
            ) : (
              <div className="space-y-5 font-mono flex-1 overflow-y-auto pr-1 custom-scrollbar">
                {/* 1. SECCIÓN NUEVOS INSUMOS */}
                <div className="bg-black border border-zinc-800/80 p-4 space-y-3">
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
                        <Plus size={14} /> 1. AGREGAR NUEVAS MATERIAS PRIMAS (
                        {previewData.nuevos.length})
                      </span>
                    </label>
                  </div>

                  {!includeNuevos ? (
                    <p className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold p-1">
                      Omitir la creación de nuevos insumos.
                    </p>
                  ) : previewData.nuevos.length === 0 ? (
                    <p className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold p-1">
                      No hay insumos nuevos para agregar.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
                      {previewData.nuevos.map((n) => {
                        const isChecked = selectedNuevos.includes(n.codigo);
                        return (
                          <div
                            key={n.codigo}
                            onClick={() => toggleNuevoItem(n.codigo)}
                            className={`p-3 border flex items-center justify-between text-xs cursor-pointer transition-colors ${
                              isChecked
                                ? "border-[#FF5A00]/50 bg-[#FF5A00]/5 text-white"
                                : "border-zinc-800/80 bg-black text-zinc-500"
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate pr-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="w-3 h-3 accent-[#FF5A00]"
                              />
                              <strong className="text-[#FF5A00] font-bold text-[10px] tracking-widest">
                                {n.codigo}
                              </strong>
                              <span className="truncate text-xs font-sans font-bold">
                                {n.nombre}
                              </span>
                            </div>
                            <span className="text-[9px] uppercase tracking-widest text-zinc-400 shrink-0 font-bold">
                              Stock:{" "}
                              <span className="text-white">
                                {n.stock_nuevo}
                              </span>{" "}
                              {n.unidad}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 2. SECCIÓN STOCKS MODIFICADOS */}
                <div className="bg-black border border-zinc-800/80 p-4 space-y-3">
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
                        <Layers size={14} /> 2. ACTUALIZAR STOCKS EXISTENTES (
                        {previewData.modificados.length})
                      </span>
                    </label>
                  </div>

                  {!includeModificados ? (
                    <p className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold p-1">
                      Mantener los stocks actuales sin alterar.
                    </p>
                  ) : previewData.modificados.length === 0 ? (
                    <p className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold p-1">
                      No hay diferencias de stock encontradas.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
                      {previewData.modificados.map((m) => {
                        const isChecked = selectedModificados.includes(m.id);
                        return (
                          <div
                            key={m.id}
                            onClick={() => toggleModificadoItem(m.id)}
                            className={`p-3 border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs cursor-pointer transition-colors ${
                              isChecked
                                ? "border-[#FFD700]/50 bg-[#FFD700]/5 text-white"
                                : "border-zinc-800/80 bg-black text-zinc-500"
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate pr-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="w-3 h-3 accent-[#FFD700] shrink-0"
                              />
                              <strong className="text-[#FFD700] font-bold text-[10px] tracking-widest shrink-0">
                                {m.codigo}
                              </strong>
                              <span className="truncate text-xs font-sans font-bold">
                                {m.nombre}
                              </span>
                            </div>

                            <div className="text-right shrink-0 flex items-center gap-2 sm:ml-auto">
                              <span className="text-[9px] uppercase tracking-widest text-zinc-500">
                                {m.stock_actual} →{" "}
                                <strong className="text-white">
                                  {m.stock_nuevo}
                                </strong>
                              </span>
                              {m.diferencia > 0 ? (
                                <span className="text-zinc-300 text-[9px] font-bold border border-zinc-700 px-1.5 py-0.5 flex items-center gap-0.5 uppercase tracking-widest">
                                  <TrendingUp
                                    size={10}
                                    className="text-[#FFD700]"
                                  />{" "}
                                  +{m.diferencia.toFixed(1)}
                                </span>
                              ) : (
                                <span className="text-zinc-300 text-[9px] font-bold border border-zinc-700 px-1.5 py-0.5 flex items-center gap-0.5 uppercase tracking-widest">
                                  <TrendingDown
                                    size={10}
                                    className="text-[#FF0055]"
                                  />{" "}
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

            <div className="pt-4 border-t border-zinc-800 flex justify-between items-center shrink-0 font-mono">
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
                  APLICAR CAMBIOS
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
