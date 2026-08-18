import { useState, useEffect, useRef } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Link as LinkIcon,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  SlidersHorizontal,
  Check,
} from "lucide-react";

const ROW_HEIGHT = 44;

// COMPONENTE DE BÚSQUEDA INTERACTIVA DE PLANOS EN LA BARRA SUPERIOR
function ConfigSearchCombobox({
  configs,
  valueId,
  onChange,
  placeholder = "Buscar plano de pegado...",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);

  const selectedConfig = configs.find((c) => String(c.id) === String(valueId));

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredConfigs = configs.filter((c) =>
    c.nombre.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-[#111625] border border-[#1E2842] p-1.5 text-left text-xs font-pixel text-white flex items-center justify-between hover:border-[#00E5FF] transition-colors"
      >
        <span className="truncate">
          {selectedConfig ? (
            <strong className="text-[#00E5FF]">{selectedConfig.nombre}</strong>
          ) : (
            <span className="text-slate-500 italic">{placeholder}</span>
          )}
        </span>
        <Search size={12} className="text-slate-400 shrink-0 ml-1" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 w-full mt-1 bg-[#0B0F19] border-2 border-[#00E5FF] shadow-2xl z-50 p-2 space-y-2">
          <div className="relative">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Escribe para filtrar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#070A12] border border-[#1E2842] text-xs text-white pl-7 pr-2 py-1 focus:border-[#FF5500] focus:outline-none"
              autoFocus
            />
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1">
            <button
              type="button"
              onClick={() => {
                onChange("NULL");
                setIsOpen(false);
                setSearchTerm("");
              }}
              className="w-full text-left p-1.5 text-[11px] font-pixel text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-colors border-b border-[#1E2842]/50"
            >
              [ DESVINCULAR / SIN PEGADO ]
            </button>

            {filteredConfigs.length === 0 ? (
              <div className="p-2 text-[10px] text-slate-500 font-pixel text-center">
                Sin coincidencias para "{searchTerm}"
              </div>
            ) : (
              filteredConfigs.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange(c.id);
                    setIsOpen(false);
                    setSearchTerm("");
                  }}
                  className={`w-full text-left p-1.5 text-xs font-pixel flex items-center justify-between hover:bg-[#111625] transition-colors ${
                    String(c.id) === String(valueId)
                      ? "text-[#00E5FF] font-bold bg-[#111625]"
                      : "text-slate-300"
                  }`}
                >
                  <span className="truncate">{c.nombre}</span>
                  {String(c.id) === String(valueId) && (
                    <Check size={12} className="text-[#00E5FF] shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Reflectivas() {
  const [activeTab, setActiveTab] = useState("configs");

  const [configs, setConfigs] = useState([]);
  const [semielaborados, setSemielaborados] = useState([]);
  const [loading, setLoading] = useState(true);

  // Buscadores independientes por pestaña
  const [configSearchTerm, setConfigSearchTerm] = useState("");
  const [semiSearchTerm, setSemiSearchTerm] = useState("");

  const [currentPage, setCurrentPage] = useState(1);

  const tableContainerRef = useRef(null);
  const tableHeaderRef = useRef(null);
  const [itemsPerPage, setItemsPerPage] = useState(5);

  // Modal Crear / Editar
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configForm, setConfigForm] = useState({
    id: null,
    nombre: "",
    reflectiva: "PROGRAF",
    protector_orajet: false,
    aplicacion_protector: "COMPLETA",
  });
  const [deletingConfig, setDeletingConfig] = useState(null);

  // Selección masiva para enlazado
  const [selectedSemis, setSelectedSemis] = useState([]);
  const [bulkConfigId, setBulkConfigId] = useState("");

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [resConfigs, resSemis] = await Promise.all([
        fetch("http://localhost:3001/api/configuraciones-pegado"),
        fetch("http://localhost:3001/api/semielaborados"),
      ]);
      setConfigs(await resConfigs.json());
      setSemielaborados(await resSemis.json());
    } catch (err) {
      console.error("Error cargando reflectivas:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Medición dinámica de pantalla
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

  // Filtrado dinámico de Configuraciones (Pestaña 1)
  const filteredConfigs = configs.filter((c) => {
    const term = configSearchTerm.toLowerCase();
    return (
      c.nombre.toLowerCase().includes(term) ||
      c.reflectiva.toLowerCase().includes(term)
    );
  });

  const totalConfigPages =
    Math.ceil(filteredConfigs.length / itemsPerPage) || 1;
  const currentPaginatedConfigs = filteredConfigs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  // Filtrado dinámico de Semielaborados (Pestaña 2)
  const filteredSemis = semielaborados.filter((s) => {
    const term = semiSearchTerm.toLowerCase();
    return (
      (s.nombre && s.nombre.toLowerCase().includes(term)) ||
      (s.codigo && s.codigo.toLowerCase().includes(term)) ||
      (s.pegado_nombre && s.pegado_nombre.toLowerCase().includes(term))
    );
  });

  const totalSemiPages = Math.ceil(filteredSemis.length / itemsPerPage) || 1;
  const currentPaginatedSemis = filteredSemis.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const handleSaveConfig = async () => {
    if (!configForm.nombre.trim())
      return alert("Ingresa un nombre para el plano de pegado.");

    try {
      const url = configForm.id
        ? `http://localhost:3001/api/configuraciones-pegado/${configForm.id}`
        : "http://localhost:3001/api/configuraciones-pegado";
      const method = configForm.id ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configForm),
      });

      if (res.ok) {
        setIsConfigModalOpen(false);
        await fetchAllData();
      }
    } catch (err) {
      console.error("Error guardando configuración:", err);
    }
  };

  const handleDeleteConfig = async () => {
    if (!deletingConfig) return;
    try {
      const res = await fetch(
        `http://localhost:3001/api/configuraciones-pegado/${deletingConfig.id}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setDeletingConfig(null);
        await fetchAllData();
      }
    } catch (err) {
      console.error("Error eliminando configuración:", err);
    }
  };

  const handleUnlinkSingle = async (semiId) => {
    try {
      const res = await fetch(
        `http://localhost:3001/api/semielaborados/${semiId}/enlazar-pegado`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ configuracion_pegado_id: null }),
        },
      );
      if (res.ok) await fetchAllData();
    } catch (err) {
      console.error("Error desvinculando semielaborado:", err);
    }
  };

  const handleBulkLink = async () => {
    if (selectedSemis.length === 0)
      return alert("Selecciona al menos un semielaborado.");

    const targetConfigId = bulkConfigId === "NULL" ? null : bulkConfigId;

    try {
      const res = await fetch(
        "http://localhost:3001/api/semielaborados/bulk-enlazar-pegado",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: selectedSemis,
            configuracion_pegado_id: targetConfigId,
          }),
        },
      );
      if (res.ok) {
        setSelectedSemis([]);
        setBulkConfigId("");
        await fetchAllData();
      }
    } catch (err) {
      console.error("Error enlazando selección:", err);
    }
  };

  const toggleSelectSemi = (id) => {
    setSelectedSemis((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleSelectAllPage = () => {
    const pageIds = currentPaginatedSemis.map((s) => s.id);
    const allSelected = pageIds.every((id) => selectedSemis.includes(id));
    if (allSelected) {
      setSelectedSemis((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedSemis((prev) => [...new Set([...prev, ...pageIds])]);
    }
  };

  const renderBadge = (reflectiva, protector, aplicacion) => {
    const hasReflectiva = reflectiva && reflectiva !== "NINGUNA";
    const hasOrajet = protector === 1;

    if (!hasReflectiva && !hasOrajet) {
      return (
        <span className="px-2.5 py-0.5 border border-[#1E2842] bg-[#111625] text-slate-500 font-pixel text-[10px]">
          [ SIN PEGADO ]
        </span>
      );
    }

    let reflectivaLabel = reflectiva === "CHINA_3M" ? "CHINA 3M" : reflectiva;
    let reflectivaStyle =
      reflectiva === "PROGRAF"
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
            ORAJET {aplicacion === "UNION_PUNTAS" ? "(PUNTAS)" : "(COMP)"}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col font-mono text-white min-h-0 select-none space-y-3">
      {/* HEADER DE MÓDULO CON BUSCADOR PRINCIPAL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-[#1E2842] pb-3 shrink-0">
        <div>
          <h2 className="font-pixel text-2xl text-white">
            PLANOS DE REFLECTIVAS Y PEGADO
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Crea especificaciones maestras y enlázalas seleccionando
            semielaborados.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-64">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder={
                activeTab === "configs"
                  ? "Buscar plano por nombre..."
                  : "Filtrar semielaborados..."
              }
              value={
                activeTab === "configs" ? configSearchTerm : semiSearchTerm
              }
              onChange={(e) => {
                if (activeTab === "configs")
                  setConfigSearchTerm(e.target.value);
                else setSemiSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-[#111625] border border-[#1E2842] text-xs text-white pl-8 pr-3 py-1.5 focus:border-[#FF5500] focus:outline-none"
            />
          </div>

          <div className="text-xs font-pixel bg-[#111625] border border-[#1E2842] px-3 py-1.5 text-[#00E5FF] whitespace-nowrap">
            ITEMS:{" "}
            {activeTab === "configs"
              ? filteredConfigs.length
              : filteredSemis.length}
          </div>
        </div>
      </div>

      {/* CONTENEDOR PRINCIPAL */}
      <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
        <div className="bg-[#0E1322] border-2 border-[#1E2842] shadow-2xl h-full flex flex-col justify-between overflow-hidden">
          {/* PESTAÑAS */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#1E2842] p-2 bg-[#0B0F19] shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setActiveTab("configs");
                  setCurrentPage(1);
                }}
                className={`px-4 py-2 font-pixel text-xs transition-colors border ${
                  activeTab === "configs"
                    ? "bg-[#FF5500]/20 border-[#FF5500] text-[#FF5500] font-bold"
                    : "bg-[#161C2E] border-[#1E2842] text-slate-400 hover:text-white"
                }`}
              >
                CONFIGURACIONES DE PEGADO ({configs.length})
              </button>
              <button
                onClick={() => {
                  setActiveTab("enlazar");
                  setCurrentPage(1);
                }}
                className={`px-4 py-2 font-pixel text-xs transition-colors border ${
                  activeTab === "enlazar"
                    ? "bg-[#00E5FF]/20 border-[#00E5FF] text-[#00E5FF] font-bold"
                    : "bg-[#161C2E] border-[#1E2842] text-slate-400 hover:text-white"
                }`}
              >
                ENLAZAR SEMIELABORADOS
              </button>
            </div>

            {activeTab === "configs" && (
              <button
                onClick={() => {
                  setConfigForm({
                    id: null,
                    nombre: "",
                    reflectiva: "PROGRAF",
                    protector_orajet: false,
                    aplicacion_protector: "COMPLETA",
                  });
                  setIsConfigModalOpen(true);
                }}
                className="flex items-center gap-2 bg-[#FF5500] text-black font-pixel font-bold px-4 py-2 border border-white hover:bg-[#FF6600] transition-colors text-xs shrink-0"
              >
                <Plus size={14} /> NUEVA CONFIGURACIÓN
              </button>
            )}
          </div>

          {/* TABLA PESTAÑA 1: CONFIGURACIONES */}
          {activeTab === "configs" && (
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
                      <th className="p-3 border-r border-[#1E2842]">
                        Nombre del Plano
                      </th>
                      <th className="p-3 border-r border-[#1E2842] text-center w-56">
                        Especificación
                      </th>
                      <th className="p-3 border-r border-[#1E2842] text-center w-36">
                        Enlazados
                      </th>
                      <th className="p-3 text-center w-28">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2842]/60">
                    {loading ? (
                      <tr>
                        <td
                          colSpan="4"
                          className="p-12 text-center text-slate-400 font-pixel"
                        >
                          Cargando...
                        </td>
                      </tr>
                    ) : filteredConfigs.length === 0 ? (
                      <tr>
                        <td
                          colSpan="4"
                          className="p-12 text-center text-slate-500 font-pixel"
                        >
                          {configSearchTerm
                            ? `Sin coincidencias para "${configSearchTerm}"`
                            : 'Presiona "+ NUEVA CONFIGURACIÓN" para registrar una.'}
                        </td>
                      </tr>
                    ) : (
                      currentPaginatedConfigs.map((cfg) => (
                        <tr
                          key={cfg.id}
                          className="h-[44px] max-h-[44px] hover:bg-[#161C2E]/50 text-slate-200 transition-colors overflow-hidden"
                        >
                          <td className="px-3 py-2 border-r border-[#1E2842]/40 font-pixel text-white font-bold whitespace-nowrap truncate">
                            {cfg.nombre}
                          </td>
                          <td className="px-3 py-2 border-r border-[#1E2842]/40 text-center whitespace-nowrap">
                            {renderBadge(
                              cfg.reflectiva,
                              cfg.protector_orajet,
                              cfg.aplicacion_protector,
                            )}
                          </td>
                          <td className="px-3 py-2 border-r border-[#1E2842]/40 text-center font-pixel text-xs text-[#00E5FF] font-bold whitespace-nowrap">
                            {cfg.semielaborados_count || 0} ítems
                          </td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => {
                                  setConfigForm({
                                    id: cfg.id,
                                    nombre: cfg.nombre,
                                    reflectiva: cfg.reflectiva,
                                    protector_orajet:
                                      cfg.protector_orajet === 1,
                                    aplicacion_protector:
                                      cfg.aplicacion_protector,
                                  });
                                  setIsConfigModalOpen(true);
                                }}
                                className="p-1.5 bg-[#111625] border border-[#1E2842] text-slate-300 hover:text-[#FF5500] hover:border-[#FF5500]"
                                title="Editar"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => setDeletingConfig(cfg)}
                                className="p-1.5 bg-[#111625] border border-[#1E2842] text-slate-300 hover:text-red-400 hover:border-red-500"
                                title="Eliminar"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* PAGINACIÓN PESTAÑA 1 */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-[#111625] border-t-2 border-[#1E2842] font-pixel text-xs shrink-0">
                <div className="text-slate-400">
                  Mostrando{" "}
                  <span className="text-white font-bold">
                    {filteredConfigs.length === 0
                      ? 0
                      : (currentPage - 1) * itemsPerPage + 1}
                  </span>{" "}
                  -{" "}
                  <span className="text-white font-bold">
                    {Math.min(
                      currentPage * itemsPerPage,
                      filteredConfigs.length,
                    )}
                  </span>{" "}
                  de{" "}
                  <span className="text-[#FF5500] font-bold">
                    {filteredConfigs.length}
                  </span>{" "}
                  ítems
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="p-1.5 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20"
                  >
                    <ChevronsLeft size={14} />
                  </button>
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(prev - 1, 1))
                    }
                    disabled={currentPage === 1}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20"
                  >
                    <ChevronLeft size={14} /> ANT
                  </button>
                  <div className="px-3 py-1 bg-black border border-[#1E2842] text-[#FF5500] font-bold text-sm">
                    {currentPage} / {totalConfigPages}
                  </div>
                  <button
                    onClick={() =>
                      setCurrentPage((prev) =>
                        Math.min(prev + 1, totalConfigPages),
                      )
                    }
                    disabled={currentPage === totalConfigPages}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20"
                  >
                    SIG <ChevronRight size={14} />
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalConfigPages)}
                    disabled={currentPage === totalConfigPages}
                    className="p-1.5 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20"
                  >
                    <ChevronsRight size={14} />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* TABLA PESTAÑA 2: ENLAZAR CON ACCIONES Y ELIMINACIÓN DE PLANO */}
          {activeTab === "enlazar" && (
            <>
              {/* ASIGNACIÓN DESDE LA BARRA SUPERIOR */}
              <div className="bg-[#070A12] border-b border-[#1E2842] p-2 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 font-pixel text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="text-white font-bold">SELECCIONADOS:</span>
                  <span className="text-[#00E5FF] font-bold">
                    {selectedSemis.length}
                  </span>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-80">
                  <div className="flex-1">
                    <ConfigSearchCombobox
                      configs={configs}
                      valueId={bulkConfigId}
                      onChange={(id) => setBulkConfigId(id)}
                      placeholder="Seleccionar plano a aplicar..."
                    />
                  </div>

                  <button
                    onClick={handleBulkLink}
                    className="px-3 py-1.5 bg-[#00E5FF] text-black font-bold border border-white hover:bg-white text-xs shrink-0 flex items-center gap-1"
                  >
                    <LinkIcon size={12} /> APLICAR
                  </button>
                </div>
              </div>

              {/* TABLA DE SEMIELABORADOS CON COLUMNA DE QUITAR PLANO */}
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
                      <th className="p-3 w-10 text-center border-r border-[#1E2842]">
                        <input
                          type="checkbox"
                          onChange={toggleSelectAllPage}
                          checked={
                            currentPaginatedSemis.length > 0 &&
                            currentPaginatedSemis.every((s) =>
                              selectedSemis.includes(s.id),
                            )
                          }
                          className="accent-[#00E5FF]"
                        />
                      </th>
                      <th className="p-3 border-r border-[#1E2842] w-36">
                        Código
                      </th>
                      <th className="p-3 border-r border-[#1E2842]">
                        Semielaborado
                      </th>
                      <th className="p-3 border-r border-[#1E2842] text-center w-56">
                        Pegado Actual
                      </th>
                      <th className="p-3 text-center w-28">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2842]/60">
                    {currentPaginatedSemis.map((item) => (
                      <tr
                        key={item.id}
                        className="h-[44px] max-h-[44px] hover:bg-[#161C2E]/50 text-slate-200 transition-colors overflow-hidden"
                      >
                        <td className="px-3 py-2 text-center border-r border-[#1E2842]/40">
                          <input
                            type="checkbox"
                            checked={selectedSemis.includes(item.id)}
                            onChange={() => toggleSelectSemi(item.id)}
                            className="accent-[#00E5FF]"
                          />
                        </td>
                        <td className="px-3 py-2 border-r border-[#1E2842]/40 font-pixel text-[#FF5500] font-bold whitespace-nowrap truncate">
                          {item.codigo}
                        </td>
                        <td
                          className="px-3 py-2 border-r border-[#1E2842]/40 font-bold text-white whitespace-nowrap truncate"
                          title={item.nombre}
                        >
                          {item.nombre}
                        </td>
                        <td className="px-3 py-2 border-r border-[#1E2842]/40 text-center whitespace-nowrap">
                          {renderBadge(
                            item.reflectiva,
                            item.protector_orajet,
                            item.aplicacion_protector,
                          )}
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          {item.configuracion_pegado_id ? (
                            <button
                              onClick={() => handleUnlinkSingle(item.id)}
                              className="p-1.5 bg-[#111625] border border-[#1E2842] text-slate-400 hover:text-red-400 hover:border-red-500 transition-colors"
                              title="Quitar plano (Dejar sin pegado)"
                            >
                              <Trash2 size={13} />
                            </button>
                          ) : (
                            <span className="text-slate-600 font-pixel text-xs">
                              -
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* PAGINACIÓN PESTAÑA 2 */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-[#111625] border-t-2 border-[#1E2842] font-pixel text-xs shrink-0">
                <div className="text-slate-400">
                  Mostrando{" "}
                  <span className="text-white font-bold">
                    {filteredSemis.length === 0
                      ? 0
                      : (currentPage - 1) * itemsPerPage + 1}
                  </span>{" "}
                  -{" "}
                  <span className="text-white font-bold">
                    {Math.min(currentPage * itemsPerPage, filteredSemis.length)}
                  </span>{" "}
                  de{" "}
                  <span className="text-[#FF5500] font-bold">
                    {filteredSemis.length}
                  </span>{" "}
                  ítems
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="p-1.5 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20"
                  >
                    <ChevronsLeft size={14} />
                  </button>
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(prev - 1, 1))
                    }
                    disabled={currentPage === 1}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20"
                  >
                    <ChevronLeft size={14} /> ANT
                  </button>
                  <div className="px-3 py-1 bg-black border border-[#1E2842] text-[#FF5500] font-bold text-sm">
                    {currentPage} / {totalSemiPages}
                  </div>
                  <button
                    onClick={() =>
                      setCurrentPage((prev) =>
                        Math.min(prev + 1, totalSemiPages),
                      )
                    }
                    disabled={currentPage === totalSemiPages}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20"
                  >
                    SIG <ChevronRight size={14} />
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalSemiPages)}
                    disabled={currentPage === totalSemiPages}
                    className="p-1.5 bg-[#0E1322] border border-[#1E2842] text-slate-400 hover:text-white disabled:opacity-20"
                  >
                    <ChevronsRight size={14} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* MODAL CREAR / EDITAR PLANO DE PEGADO */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-mono">
          <div className="bg-[#0E1322] border-2 border-[#FF5500] w-full max-w-md p-5 shadow-2xl space-y-4 relative">
            <button
              onClick={() => setIsConfigModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>

            <div className="border-b border-[#1E2842] pb-2">
              <h3 className="font-pixel text-base text-[#FF5500] flex items-center gap-2">
                <SlidersHorizontal size={18} />{" "}
                {configForm.id
                  ? "MODIFICAR PLANO DE PEGADO"
                  : "NUEVO PLANO DE PEGADO"}
              </h3>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-pixel text-slate-400 block">
                NOMBRE DEL PLANO (EJ: "2051 CIUDAD"):
              </label>
              <input
                type="text"
                placeholder="Ej: 2051 CIUDAD"
                value={configForm.nombre}
                onChange={(e) =>
                  setConfigForm({ ...configForm, nombre: e.target.value })
                }
                className="w-full bg-[#070A12] border border-[#1E2842] text-white p-2 text-xs focus:border-[#FF5500] focus:outline-none"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-pixel text-slate-400 block">
                TIPO DE REFLECTIVA:
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs font-pixel">
                {[
                  { id: "NINGUNA", label: "NINGUNA" },
                  { id: "PROGRAF", label: "PROGRAF" },
                  { id: "CHINA_3M", label: "CHINA 3M" },
                ].map((ref) => (
                  <button
                    key={ref.id}
                    type="button"
                    onClick={() =>
                      setConfigForm({ ...configForm, reflectiva: ref.id })
                    }
                    className={`p-2 border transition-all ${
                      configForm.reflectiva === ref.id
                        ? "bg-[#00E5FF]/20 border-[#00E5FF] text-white font-bold"
                        : "bg-[#070A12] border-[#1E2842] text-slate-400 hover:text-white"
                    }`}
                  >
                    {ref.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-[#1E2842]">
              <label className="flex items-center justify-between cursor-pointer text-xs font-pixel p-2 bg-[#070A12] border border-[#1E2842]">
                <span>PROTECTOR ORAJET:</span>
                <input
                  type="checkbox"
                  checked={configForm.protector_orajet}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      protector_orajet: e.target.checked,
                    })
                  }
                  className="accent-[#FF5500] w-4 h-4"
                />
              </label>

              {configForm.protector_orajet && (
                <div className="space-y-1.5 pl-2 border-l-2 border-[#FF5500]">
                  <label className="text-[10px] font-pixel text-slate-400 block">
                    APLICACIÓN DEL PROTECTOR:
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs font-pixel">
                    {[
                      { id: "COMPLETA", label: "COMPLETA" },
                      { id: "UNION_PUNTAS", label: "UNIÓN / PUNTAS" },
                    ].map((app) => (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() =>
                          setConfigForm({
                            ...configForm,
                            aplicacion_protector: app.id,
                          })
                        }
                        className={`p-2 border text-[10px] transition-all ${
                          configForm.aplicacion_protector === app.id
                            ? "bg-[#FF5500]/20 border-[#FF5500] text-white font-bold"
                            : "bg-[#070A12] border-[#1E2842] text-slate-400 hover:text-white"
                        }`}
                      >
                        {app.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#1E2842] flex justify-end gap-3 font-pixel text-xs">
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                className="px-4 py-2 border border-[#1E2842] text-slate-400 hover:text-white"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                className="flex items-center gap-2 px-5 py-2 bg-[#FF5500] text-black font-bold border border-white hover:bg-[#FF6600]"
              >
                <Save size={14} />
                <span>GUARDAR PLANO</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ELIMINAR PLANO */}
      {deletingConfig && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-mono">
          <div className="bg-[#0E1322] border-2 border-red-500 w-full max-w-sm p-5 shadow-2xl">
            <div className="flex items-center gap-3 text-red-500 border-b border-[#1E2842] pb-3 mb-3">
              <AlertTriangle size={24} />
              <h3 className="font-pixel text-lg">¿ELIMINAR PLANO?</h3>
            </div>
            <p className="text-xs text-slate-300 mb-4">
              Se desvincularán todos los semielaborados que usen{" "}
              <strong className="text-red-400 block mt-1">
                {deletingConfig.nombre}
              </strong>
            </p>
            <div className="flex justify-end gap-3 font-pixel text-xs">
              <button
                type="button"
                onClick={() => setDeletingConfig(null)}
                className="px-4 py-1.5 border border-[#1E2842] text-slate-400 hover:text-white"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={handleDeleteConfig}
                className="px-4 py-1.5 bg-red-600 text-white font-bold hover:bg-red-500"
              >
                SÍ, ELIMINAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
