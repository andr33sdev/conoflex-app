import { useState, useEffect, useRef } from "react";
import {
  Search, Plus, Pencil, Trash2, Save, X, Star, AlertTriangle,
  FlaskConical, ChevronLeft, ChevronRight, ArrowRightToLine,
  ChevronDown, Check, Clock, ChevronsLeft, ChevronsRight, RotateCw
} from "lucide-react";

const ITEMS_PER_PAGE = 5;

const formatDate = (dateString) => {
  if (!dateString) return "Desconocido";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
};

export default function Ingenieria() {
  const [mainTab, setMainTab] = useState("SE");
  
  const [semielaborados, setSemielaborados] = useState([]);
  const [productosTerminados, setProductosTerminados] = useState([]);
  const [materiasPrimas, setMateriasPrimas] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState(null);

  const [ingenierias, setIngenierias] = useState([]);
  const [activeIngenieria, setActiveIngenieria] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [recipeForm, setRecipeForm] = useState({ id: null, nombre_version: "", es_activa: true, ingredientes: [] });
  const [deletingRecipe, setDeletingRecipe] = useState(null);

  const [mpFilterTerm, setMpFilterTerm] = useState("");
  const [mpCurrentPage, setMpCurrentPage] = useState(1);
  const MP_ITEMS_PER_PAGE = 5;

  const [isSyncingVentas, setIsSyncingVentas] = useState(false);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resSemi, resPT, resMP] = await Promise.all([
        fetch("http://localhost:3001/api/semielaborados"),
        fetch("http://localhost:3001/api/productos-terminados"),
        fetch("http://localhost:3001/api/materias-primas"),
      ]);
      setSemielaborados(await resSemi.json());
      setProductosTerminados(await resPT.json());
      setMateriasPrimas(await resMP.json());
    } catch (err) {
      console.error("Error cargando datos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleBackToList = () => {
    setSelectedItem(null);
    fetchData();
  };

  useEffect(() => {
    if (!selectedItem) {
      setIngenierias([]); setActiveIngenieria(null); return;
    }
    const fetchIngenierias = async () => {
      try {
        const endpoint = mainTab === 'SE' ? 'semielaborado' : 'producto-terminado';
        const res = await fetch(`http://localhost:3001/api/ingenierias/${endpoint}/${selectedItem.id}`);
        const data = await res.json();
        setIngenierias(data);
        setActiveIngenieria(data.find((i) => i.es_activa === 1) || data[0] || null);
        setIsDropdownOpen(false);
      } catch (err) { console.error("Error cargando recetas:", err); }
    };
    fetchIngenierias();
  }, [selectedItem, mainTab]);

  const activeDataset = mainTab === 'SE' ? semielaborados : productosTerminados;
  const filteredDataset = activeDataset.filter((s) => {
    const term = searchTerm.toLowerCase();
    return s.nombre.toLowerCase().includes(term) || s.codigo.toLowerCase().includes(term);
  });

  const totalPages = Math.ceil(filteredDataset.length / ITEMS_PER_PAGE) || 1;
  const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
  const currentPaginatedItems = filteredDataset.slice(indexOfFirstItem, indexOfLastItem);

  const handleSetActiva = async (ingId) => {
    if (!selectedItem) return;
    try {
      const res = await fetch(`http://localhost:3001/api/ingenierias/${ingId}/activar`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent_id: selectedItem.id, parent_type: mainTab }),
      });
      if (res.ok) {
        const updated = ingenierias.map((i) => ({ ...i, es_activa: i.id === ingId ? 1 : 0 }));
        setIngenierias(updated);
        setActiveIngenieria(updated.find((i) => i.id === ingId));
      }
    } catch (err) { console.error("Error activando receta:", err); }
  };

  const handleOpenCreateModal = () => {
    if (!selectedItem) return alert("Selecciona un artículo primero.");
    setRecipeForm({ id: null, nombre_version: `Receta v${ingenierias.length + 1}`, es_activa: ingenierias.length === 0, ingredientes: [] });
    setMpFilterTerm(""); setMpCurrentPage(1); setIsRecipeModalOpen(true);
  };

  const handleOpenEditModal = (recipe) => {
    setRecipeForm({
      id: recipe.id, nombre_version: recipe.nombre_version, es_activa: recipe.es_activa === 1,
      ingredientes: recipe.ingredientes.map(ing => ({
        materia_prima_id: ing.materia_prima_id,
        semielaborado_id: ing.semielaborado_id,
        item_codigo: ing.item_codigo,
        item_nombre: ing.item_nombre,
        item_type: ing.item_type,
        cantidad: ing.cantidad,
        unidad_medida: ing.unidad_medida,
      })),
    });
    setMpFilterTerm(""); setMpCurrentPage(1); setIsRecipeModalOpen(true);
  };

  const handleMpFilterChange = (e) => { setMpFilterTerm(e.target.value); setMpCurrentPage(1); };

  const handleAddIngredientRow = (item) => {
    const exists = recipeForm.ingredientes.some(i => (item.type === 'MP' && i.materia_prima_id === item.id) || (item.type === 'SE' && i.semielaborado_id === item.id));
    if (exists) return alert("Este componente ya está en la receta.");
    setRecipeForm((prev) => ({
      ...prev,
      ingredientes: [...prev.ingredientes, {
        id_temp: Date.now() + Math.random(),
        materia_prima_id: item.type === 'MP' ? item.id : null,
        semielaborado_id: item.type === 'SE' ? item.id : null,
        item_codigo: item.codigo,
        item_nombre: item.nombre,
        item_type: item.type,
        cantidad: 1.0,
        unidad_medida: item.unidad_medida || "Unidades",
      }],
    }));
  };

  const handleUpdateIngredientQty = (tempId, qty) => {
    setRecipeForm((prev) => ({
      ...prev, ingredientes: prev.ingredientes.map((i) => i.id_temp === tempId || (i.item_codigo && i.item_codigo === tempId) ? { ...i, cantidad: parseFloat(qty) || 0 } : i)
    }));
  };

  const handleRemoveIngredientRow = (tempId) => {
    setRecipeForm((prev) => ({
      ...prev, ingredientes: prev.ingredientes.filter((i) => i.id_temp !== tempId && i.item_codigo !== tempId),
    }));
  };

  const handleSaveRecipe = async () => {
    if (!selectedItem) return;
    if (!recipeForm.nombre_version.trim()) return alert("Por favor, nombra tu receta.");
    if (recipeForm.ingredientes.length === 0) return alert("Añade al menos un material a la receta.");

    const payload = {
      parent_id: selectedItem.id, parent_type: mainTab,
      nombre_version: recipeForm.nombre_version.trim(), es_activa: recipeForm.es_activa,
      ingredientes: recipeForm.ingredientes,
    };

    try {
      const url = recipeForm.id ? `http://localhost:3001/api/ingenierias/${recipeForm.id}` : "http://localhost:3001/api/ingenierias";
      const res = await fetch(url, { method: recipeForm.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) {
        setIsRecipeModalOpen(false);
        const endpoint = mainTab === 'SE' ? 'semielaborado' : 'producto-terminado';
        const resIng = await fetch(`http://localhost:3001/api/ingenierias/${endpoint}/${selectedItem.id}`);
        const dataIng = await resIng.json();
        setIngenierias(dataIng);
        setActiveIngenieria(dataIng.find((i) => i.es_activa === 1) || dataIng[0] || null);
      }
    } catch (err) { console.error("Error guardando receta:", err); }
  };

  const handleDeleteRecipe = async () => {
    if (!deletingRecipe) return;
    try {
      const res = await fetch(`http://localhost:3001/api/ingenierias/${deletingRecipe.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeletingRecipe(null);
        const endpoint = mainTab === 'SE' ? 'semielaborado' : 'producto-terminado';
        const resIng = await fetch(`http://localhost:3001/api/ingenierias/${endpoint}/${selectedItem.id}`);
        const dataIng = await resIng.json();
        setIngenierias(dataIng);
        setActiveIngenieria(dataIng.find((i) => i.es_activa === 1) || dataIng[0] || null);
      }
    } catch (err) { console.error("Error eliminando receta:", err); }
  };

  // REFRESCADO DIRECTO SIN MODAL
  const handleSyncVentas = async () => {
    setIsSyncingVentas(true);
    try {
      const res = await fetch("http://localhost:3001/api/productos-terminados/sincronizar-ventas", {
        method: "POST", headers: { "Content-Type": "application/json" }
      });
      if (res.ok) {
        await fetchData();
      } else {
        const data = await res.json();
        alert(data.error || "Error sincronizando ventas.");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión al sincronizar ventas.");
    } finally {
      setIsSyncingVentas(false);
    }
  };

  const combinedInventory = [
    ...materiasPrimas.map(m => ({ ...m, type: 'MP' })),
    ...semielaborados.map(s => ({ ...s, type: 'SE' }))
  ];
  
  const filteredModalMP = mpFilterTerm.trim() === "" ? [] : combinedInventory.filter((item) =>
    item.nombre.toLowerCase().includes(mpFilterTerm.toLowerCase()) || item.codigo.toLowerCase().includes(mpFilterTerm.toLowerCase())
  );
  const mpTotalPages = Math.ceil(filteredModalMP.length / MP_ITEMS_PER_PAGE) || 1;
  const currentPaginatedModalMP = filteredModalMP.slice((mpCurrentPage - 1) * MP_ITEMS_PER_PAGE, mpCurrentPage * MP_ITEMS_PER_PAGE);

  return (
    <div className="h-full flex flex-col font-mono text-white min-h-0 select-none">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-[#1E2842] pb-3 shrink-0">
        <div>
          <h2 className="font-pixel text-2xl text-white">LABORATORIO DE INGENIERÍAS</h2>
          <p className="text-xs text-slate-400 mt-0.5">Configura las recetas y prevé la demanda de stock.</p>
        </div>

        {!selectedItem && (
          <div className="flex items-center gap-3">
            <div className="relative flex-1 md:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Filtrar por código o nombre..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="w-full bg-[#111625] border border-[#1E2842] text-xs text-white pl-8 pr-3 py-1.5 focus:border-[#FF5500] focus:outline-none" />
            </div>
            <div className="text-xs font-pixel bg-[#111625] border border-[#1E2842] px-3 py-1.5 text-[#00E5FF] whitespace-nowrap">
              ITEMS: {filteredDataset.length} / {activeDataset.length}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden pt-4 min-h-0 flex flex-col">
        {!selectedItem ? (
          <div className="bg-[#0E1322] border-2 border-[#1E2842] shadow-2xl h-full flex flex-col">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#1E2842] p-2 bg-[#0B0F19]">
              <div className="flex items-center gap-2">
                <button onClick={() => { setMainTab('SE'); setCurrentPage(1); setSearchTerm(""); }} className={`px-4 py-2 font-pixel text-xs transition-colors border ${mainTab === 'SE' ? "bg-[#FF5500]/20 border-[#FF5500] text-[#FF5500]" : "bg-[#161C2E] border-[#1E2842] text-slate-400 hover:text-white"}`}>
                  SEMIELABORADOS
                </button>
                <button onClick={() => { setMainTab('PT'); setCurrentPage(1); setSearchTerm(""); }} className={`px-4 py-2 font-pixel text-xs transition-colors border ${mainTab === 'PT' ? "bg-[#FF5500]/20 border-[#FF5500] text-[#FF5500]" : "bg-[#161C2E] border-[#1E2842] text-slate-400 hover:text-white"}`}>
                  PRODUCTOS TERMINADOS
                </button>
              </div>

              {mainTab === 'PT' && (
                <button 
                  onClick={handleSyncVentas} 
                  disabled={isSyncingVentas}
                  className="flex items-center gap-2 bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/50 px-3 py-1.5 font-pixel text-[10px] hover:bg-[#00E5FF] hover:text-black transition-colors disabled:opacity-50"
                  title="Recargar promedio de ventas desde la planilla oficial"
                >
                  <RotateCw size={12} className={isSyncingVentas ? "animate-spin" : ""} />
                  <span>{isSyncingVentas ? "RECARGANDO..." : "RECARGAR VENTAS"}</span>
                </button>
              )}
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-400 font-pixel">Cargando catálogo...</div>
            ) : filteredDataset.length === 0 ? (
              <div className="p-12 text-center text-slate-400 font-pixel">No hay artículos disponibles.</div>
            ) : (
              <>
                <div className="flex-1 overflow-y-hidden min-h-0">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-10 bg-[#161C2E] border-b-2 border-[#1E2842] shadow-sm">
                      <tr className="text-[#00E5FF] font-pixel text-sm">
                        <th className="p-2.5 border-r border-[#1E2842] w-36">Código</th>
                        <th className="p-2.5 border-r border-[#1E2842]">{mainTab === 'SE' ? 'Semielaborado' : 'Producto Terminado'}</th>
                        {mainTab === 'PT' && <th className="p-2.5 border-r border-[#1E2842] text-center w-36">Ventas / Mes</th>}
                        <th className="p-2.5 border-r border-[#1E2842] text-center w-28">Recetas</th>
                        <th className="p-2.5 text-center w-36">Ingeniería</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E2842]/60">
                      {currentPaginatedItems.map((item) => (
                        <tr key={item.id} className="hover:bg-[#161C2E]/50 text-slate-200 transition-colors">
                          <td className="p-2.5 border-r border-[#1E2842]/40 font-pixel text-[#FF5500] font-bold">{item.codigo}</td>
                          <td className="p-2.5 border-r border-[#1E2842]/40 font-bold text-white">{item.nombre}</td>
                          {mainTab === 'PT' && (
                            <td className="p-2.5 border-r border-[#1E2842]/40 text-center font-pixel text-sm font-bold text-[#00E5FF]">
                              {Math.round(item.promedio_ventas_mensual)}
                            </td>
                          )}
                          <td className="p-2.5 border-r border-[#1E2842]/40 text-center font-pixel">
                            <span className={`px-2 py-0.5 border text-xs font-bold inline-block ${item.recetas_count > 0 ? "bg-[#00E5FF]/10 border-[#00E5FF]/40 text-[#00E5FF]" : "bg-[#111625] border-[#1E2842] text-slate-500"}`}>
                              {item.recetas_count || 0}
                            </span>
                          </td>
                          <td className="p-2.5 text-center">
                            <button onClick={() => setSelectedItem(item)} className="px-4 py-1.5 bg-[#111625] border border-[#1E2842] text-white hover:border-[#FF5500] hover:text-[#FF5500] font-pixel text-[10px] transition-all">
                              VER PLANOS
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between p-3 bg-[#111625] border-t-2 border-[#1E2842] font-pixel text-xs shrink-0">
                  <span className="text-slate-400">Mostrando <span className="text-white">{indexOfFirstItem + 1}</span> - <span className="text-white">{Math.min(indexOfLastItem, filteredDataset.length)}</span> de <span className="text-[#FF5500]">{filteredDataset.length}</span> ítems</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="flex items-center gap-1 px-2.5 py-1 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20 transition-all">
                      <ChevronLeft size={14} /> ANT
                    </button>
                    <div className="px-3 py-1 bg-black border border-[#1E2842] text-[#FF5500] font-bold text-sm">{currentPage} / {totalPages}</div>
                    <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="flex items-center gap-1 px-2.5 py-1 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20 transition-all">
                      SIG <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col h-full space-y-3 min-h-0">
            <div className="flex items-center gap-3 shrink-0">
              <button onClick={handleBackToList} className="p-2 bg-[#111625] border border-[#1E2842] text-slate-400 hover:text-white hover:border-white transition-colors">
                <ChevronLeft size={18} />
              </button>
              <h3 className="font-pixel text-lg text-white uppercase truncate flex-1">
                <span className="text-[#FF5500] mr-2">[{selectedItem.codigo}]</span> {selectedItem.nombre}
              </h3>
            </div>

            <div className="bg-[#0E1322] border-2 border-[#1E2842] shadow-2xl flex flex-col flex-1 min-h-0">
              <div className="p-3 border-b border-[#1E2842] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0B0F19] shrink-0">
                <div className="relative w-full sm:w-80" ref={dropdownRef}>
                  <button onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="w-full flex items-center justify-between bg-black border border-[#1E2842] p-2 text-left hover:border-[#FF5500] transition-colors">
                    {activeIngenieria ? (
                      <div className="flex items-center gap-2 truncate">
                        {activeIngenieria.es_activa === 1 ? <Star size={14} className="text-[#FF5500] fill-[#FF5500] shrink-0" /> : <div className="w-3.5 shrink-0" />}
                        <span className="font-pixel text-xs text-white truncate">{activeIngenieria.nombre_version}</span>
                      </div>
                    ) : ( <span className="font-pixel text-xs text-slate-500">CREA UN PLANO NUEVO...</span> )}
                    <ChevronDown size={14} className="text-slate-400 shrink-0" />
                  </button>

                  {isDropdownOpen && ingenierias.length > 0 && (
                    <div className="absolute top-full left-0 w-full mt-1 bg-black border border-[#1E2842] shadow-2xl z-50">
                      {ingenierias.map(ing => (
                        <button key={ing.id} onClick={() => { setActiveIngenieria(ing); setIsDropdownOpen(false); }} className="w-full flex items-center justify-between p-2 text-left transition-colors border-b border-[#1E2842]/50 hover:bg-[#111625]">
                          <div className="flex items-center gap-2 truncate">
                            {ing.es_activa === 1 ? <Star size={12} className="text-[#FF5500] fill-[#FF5500] shrink-0" /> : <div className="w-3 shrink-0" />}
                            <span className="font-pixel text-[10px] uppercase truncate text-slate-400">{ing.nombre_version}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button onClick={handleOpenCreateModal} className="flex items-center justify-center gap-2 bg-[#FF5500] text-black font-pixel font-bold px-4 py-2 border border-white hover:bg-[#FF6600] transition-colors text-xs shrink-0">
                  <Plus size={14} /> CREAR PLANO
                </button>
              </div>

              {ingenierias.length > 0 && activeIngenieria ? (
                <div className="flex-1 flex flex-col min-h-0 relative">
                  <div className="p-3 border-b border-[#1E2842] flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#070A12] shrink-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      {activeIngenieria.es_activa === 0 ? (
                        <button onClick={() => handleSetActiva(activeIngenieria.id)} className="flex items-center gap-1 text-[10px] text-black font-bold font-pixel bg-[#00E5FF] px-2.5 py-1 hover:bg-white transition-colors">
                          <Check size={12} /> ESTABLECER ACTIVA
                        </button>
                      ) : (
                        <span className="text-[10px] font-pixel text-[#00E5FF] uppercase flex items-center gap-1"><Check size={12} /> RECETA PREDETERMINADA</span>
                      )}
                      {activeIngenieria.updated_at && <span className="text-[10px] text-slate-400 font-pixel flex items-center gap-1"><Clock size={10} /> ACTUALIZADO: {formatDate(activeIngenieria.updated_at)}</span>}
                    </div>

                    <div className="flex items-center gap-2">
                      <button onClick={() => handleOpenEditModal(activeIngenieria)} className="p-1.5 border border-[#1E2842] text-slate-300 hover:text-[#FF5500] hover:border-[#FF5500]"><Pencil size={13} /></button>
                      <button onClick={() => setDeletingRecipe(activeIngenieria)} className="p-1.5 border border-[#1E2842] text-slate-300 hover:text-red-400 hover:border-red-500"><Trash2 size={13} /></button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto min-h-0">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-[#161C2E] z-10 border-b border-[#1E2842]">
                        <tr className="text-[#00E5FF] font-pixel"><th className="p-3 border-r border-[#1E2842] font-normal w-24 text-center">Tipo</th><th className="p-3 border-r border-[#1E2842] font-normal">Componente</th><th className="p-3 font-normal text-right">Cantidad</th></tr>
                      </thead>
                      <tbody className="divide-y divide-[#1E2842]/60 border-b-2 border-[#1E2842]">
                        {activeIngenieria.ingredientes.map((ing) => (
                          <tr key={ing.id} className="hover:bg-[#161C2E]/40 text-slate-200 transition-colors">
                            <td className="p-3 border-r border-[#1E2842]/40 text-center font-pixel font-bold">
                              <span className={ing.item_type === 'SE' ? 'text-amber-400' : 'text-[#00E5FF]'}>[{ing.item_type}]</span>
                            </td>
                            <td className="p-3 border-r border-[#1E2842]/40 text-white"><span className="font-pixel text-[#FF5500] mr-2">[{ing.item_codigo}]</span> {ing.item_nombre}</td>
                            <td className="p-3 text-right"><span className="font-pixel text-sm text-white font-bold">{ing.cantidad}</span><span className="text-[10px] text-slate-400 ml-1.5 uppercase font-pixel">{ing.unidad_medida}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-50">
                  <FlaskConical size={32} className="mb-3 text-[#FF5500]" />
                  <span className="font-pixel text-sm text-white mb-1">MESA DE CRAFTEO VACÍA</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL CREAR/EDITAR RECETA */}
      {isRecipeModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[100] flex items-center justify-center p-3">
          <div className="bg-[#0E1322] border-2 border-[#FF5500] w-full max-w-5xl shadow-2xl flex flex-col h-[85vh] font-mono">
            <div className="p-4 flex items-center justify-between border-b border-[#1E2842] bg-[#0B0F19] shrink-0">
              <div>
                <h3 className="font-pixel text-lg text-[#FF5500]">{recipeForm.id ? "MODIFICAR PLANO" : "NUEVO PLANO DE CRAFTEO"}</h3>
                <p className="text-xs text-white font-bold mt-0.5">[{selectedItem?.codigo}] {selectedItem?.nombre}</p>
              </div>
              <button onClick={() => setIsRecipeModalOpen(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>

            <div className="p-4 border-b border-[#1E2842] flex flex-col sm:flex-row items-center gap-4 bg-[#070A12] shrink-0">
              <div className="flex-1 w-full">
                <input type="text" placeholder="Ej: Receta V1" value={recipeForm.nombre_version} onChange={(e) => setRecipeForm({ ...recipeForm, nombre_version: e.target.value })} className="w-full bg-[#0E1322] border border-[#1E2842] text-sm text-white p-2 focus:border-[#FF5500] focus:outline-none" />
              </div>
              <div className="sm:w-60 w-full">
                <label className={`flex items-center justify-center gap-2 cursor-pointer text-[10px] font-pixel border p-2 transition-colors w-full select-none ${recipeForm.es_activa ? "bg-[#FF5500]/20 border-[#FF5500] text-white font-bold" : "bg-[#0E1322] border-[#1E2842] text-slate-400 hover:text-white"}`}>
                  <input type="checkbox" checked={recipeForm.es_activa} onChange={(e) => setRecipeForm({ ...recipeForm, es_activa: e.target.checked })} className="hidden" />
                  {recipeForm.es_activa && <Check size={14} className="text-[#FF5500]" />}
                  <span>{recipeForm.es_activa ? "ACTIVA (PREDETERMINADA)" : "HACER PREDETERMINADA"}</span>
                </label>
              </div>
            </div>

            <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2 min-h-0">
              <div className="border-r border-[#1E2842] flex flex-col min-h-0 bg-[#070A12]">
                <div className="p-3 border-b border-[#1E2842] shrink-0">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="Buscar componente..." value={mpFilterTerm} onChange={handleMpFilterChange} className="w-full bg-[#0E1322] border border-[#1E2842] text-xs text-white pl-8 pr-3 py-1.5 focus:border-[#FF5500] focus:outline-none" />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
                  {mpFilterTerm.trim() === "" ? (
                    <div className="h-full flex items-center justify-center text-slate-500 font-pixel text-xs text-center">Escribe para buscar<br/>MP o Semielaborados.</div>
                  ) : filteredModalMP.length === 0 ? (
                    <div className="p-4 text-center text-slate-500 text-xs font-pixel">Sin resultados.</div>
                  ) : (
                    currentPaginatedModalMP.map((comp) => (
                      <div key={`${comp.type}_${comp.id}`} className="flex items-center justify-between p-2 border border-transparent hover:border-[#1E2842] hover:bg-[#111625] transition-colors text-xs">
                        <div className="truncate pr-2 flex items-center gap-2">
                          <span className={`font-pixel font-bold text-[10px] ${comp.type === 'SE' ? 'text-amber-400' : 'text-[#00E5FF]'}`}>[{comp.type}]</span>
                          <span className="text-[#FF5500] font-pixel">[{comp.codigo}]</span>
                          <span className="text-white truncate">{comp.nombre}</span>
                        </div>
                        <button onClick={() => handleAddIngredientRow(comp)} className="text-[10px] px-2 py-1 bg-[#111625] border border-[#1E2842] text-white hover:border-[#FF5500] hover:text-[#FF5500] font-pixel transition-colors flex items-center gap-1 shrink-0">
                          AÑADIR <ArrowRightToLine size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {mpFilterTerm.trim() !== "" && filteredModalMP.length > 0 && (
                  <div className="border-t border-[#1E2842] p-2 flex items-center justify-between font-pixel text-xs bg-[#070A12] shrink-0">
                    <span className="text-slate-400 ml-2">{mpCurrentPage} / {mpTotalPages}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setMpCurrentPage(p => Math.max(p - 1, 1))} disabled={mpCurrentPage === 1} className="p-1 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20"><ChevronLeft size={14} /></button>
                      <button onClick={() => setMpCurrentPage(p => Math.min(p + 1, mpTotalPages))} disabled={mpCurrentPage === mpTotalPages} className="p-1 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20"><ChevronRight size={14} /></button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col min-h-0 bg-[#0E1322]">
                <div className="p-3 border-b border-[#1E2842] bg-[#070A12] shrink-0">
                  <span className="text-[10px] font-pixel text-[#00E5FF] uppercase">COMPONENTES ({recipeForm.ingredientes.length})</span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                  {recipeForm.ingredientes.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-500 font-pixel text-xs">MESA VACÍA</div>
                  ) : (
                    recipeForm.ingredientes.map((ing) => (
                      <div key={ing.id_temp || ing.item_codigo} className="bg-[#070A12] border border-[#1E2842] p-2 flex items-center justify-between gap-2 hover:border-[#FF5500]/50 transition-colors">
                        <div className="flex-1 truncate flex items-center gap-2">
                          <span className={`font-pixel font-bold text-[10px] ${ing.item_type === 'SE' ? 'text-amber-400' : 'text-[#00E5FF]'}`}>[{ing.item_type}]</span>
                          <span className="text-white text-xs truncate font-bold"><span className="font-pixel text-[#FF5500] font-normal mr-1">[{ing.item_codigo}]</span> {ing.item_nombre}</span>
                        </div>
                        <div className="flex items-center gap-2 border-l border-[#1E2842] pl-2">
                          <input type="number" step="0.001" min="0" value={ing.cantidad} onChange={(e) => handleUpdateIngredientQty(ing.id_temp || ing.item_codigo, e.target.value)} className="w-16 bg-[#0E1322] border border-[#1E2842] text-[#FF5500] font-pixel text-sm p-1 text-right focus:outline-none focus:border-[#FF5500]" />
                          <span className="text-[9px] text-slate-400 font-pixel w-8 uppercase">{ing.unidad_medida}</span>
                          <button onClick={() => handleRemoveIngredientRow(ing.id_temp || ing.item_codigo)} className="p-1 text-slate-400 hover:text-red-400"><X size={14} /></button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="p-3 border-t border-[#1E2842] flex justify-end gap-3 bg-[#070A12] font-pixel text-xs shrink-0">
              <button onClick={() => setIsRecipeModalOpen(false)} className="px-4 py-2 border border-[#1E2842] text-slate-400 hover:text-white">CANCELAR</button>
              <button onClick={handleSaveRecipe} className="flex items-center gap-2 px-5 py-2 bg-[#FF5500] text-black font-bold border border-white hover:bg-[#FF6600]"><Save size={14} /> GUARDAR</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ELIMINAR */}
      {deletingRecipe && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#0E1322] border-2 border-red-500 w-full max-w-sm p-5 shadow-2xl font-mono">
            <div className="flex items-center gap-3 text-red-500 border-b border-[#1E2842] pb-3 mb-3">
              <AlertTriangle size={24} />
              <h3 className="font-pixel text-lg">¿ELIMINAR RECETA?</h3>
            </div>
            <div className="flex justify-end gap-3 font-pixel text-xs mt-6">
              <button onClick={() => setDeletingRecipe(null)} className="px-4 py-1.5 border border-[#1E2842] text-slate-400 hover:text-white">CANCELAR</button>
              <button onClick={handleDeleteRecipe} className="px-4 py-1.5 bg-red-600 text-white font-bold hover:bg-red-500">SÍ, ELIMINAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}