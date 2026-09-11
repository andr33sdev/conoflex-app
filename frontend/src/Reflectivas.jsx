import { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Sparkles,
  Link,
  CheckCircle2,
  X,
  Layers,
  Shield,
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Sparkle,
} from "lucide-react";

export default function Reflectivas() {
  const [configs, setConfigs] = useState([]);
  const [semielaborados, setSemielaborados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // PESTAÑAS: CONFIGS (Planos) | ENLAZAR (Enlace Masivo)
  const [activeTab, setActiveTab] = useState("CONFIGS");

  // SELECCIÓN MASIVA EN PESTAÑA ENLAZAR
  const [selectedSEIds, setSelectedSEIds] = useState([]);
  const [bulkConfigId, setBulkConfigId] = useState("");

  // MODAL CREAR / EDITAR CONFIGURACIÓN
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [formData, setFormState] = useState({
    nombre: "",
    reflectiva: "NINGUNA",
    protector_orajet: false,
    aplicacion_protector: "NO APLICA",
  });

  // MODAL DE INSPECCIÓN DE SEMIELABORADOS ENLAZADOS
  const [linkedModalConfig, setLinkedModalConfig] = useState(null);
  const [linkedSearch, setLinkedSearch] = useState("");

  // ORDENAMIENTO
  const [sortColumn, setSortColumn] = useState("nombre");
  const [sortDirection, setSortDirection] = useState("asc");

  // PAGINACIÓN Y CÁLCULO DINÁMICO
  const tableContainerRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // AJUSTE AUTOMÁTICO DE FILAS
  useEffect(() => {
    const updatePageSize = () => {
      if (!tableContainerRef.current) return;
      const containerHeight = tableContainerRef.current.clientHeight;
      const headerHeight = 36;
      const rowHeight = 42;
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

  // CARGAR DATOS
  const fetchData = async () => {
    setLoading(true);
    try {
      const [resConfig, resSE] = await Promise.all([
        fetch("http://localhost:3001/api/configuraciones-pegado"),
        fetch("http://localhost:3001/api/semielaborados"),
      ]);

      if (resConfig.ok) setConfigs(await resConfig.json());
      if (resSE.ok) setSemielaborados(await resSE.json());
    } catch (err) {
      console.error("Error al cargar datos de reflectivas:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // FILTRADO Y ORDENAMIENTO DE PLANOS
  const processedConfigs = useMemo(() => {
    let result = configs.filter((c) =>
      c.nombre.toLowerCase().includes(search.toLowerCase()),
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
  }, [configs, search, sortColumn, sortDirection]);

  // FILTRADO DE SEMIELABORADOS PARA PESTAÑA ENLAZAR
  const processedSE = useMemo(() => {
    return semielaborados.filter(
      (s) =>
        s.codigo.toLowerCase().includes(search.toLowerCase()) ||
        s.nombre.toLowerCase().includes(search.toLowerCase()),
    );
  }, [semielaborados, search]);

  const totalPages =
    activeTab === "CONFIGS"
      ? Math.ceil(processedConfigs.length / itemsPerPage) || 1
      : Math.ceil(processedSE.length / itemsPerPage) || 1;

  const paginatedConfigs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return processedConfigs.slice(start, start + itemsPerPage);
  }, [processedConfigs, currentPage, itemsPerPage]);

  const paginatedSE = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return processedSE.slice(start, start + itemsPerPage);
  }, [processedSE, currentPage, itemsPerPage]);

  const emptySlotsCount =
    activeTab === "CONFIGS"
      ? Math.max(0, itemsPerPage - paginatedConfigs.length)
      : Math.max(0, itemsPerPage - paginatedSE.length);

  // MANEJO DE FORMULARIO CREAR / EDITAR
  const handleOpenForm = (config = null) => {
    if (config) {
      setEditingConfig(config);
      setFormState({
        nombre: config.nombre,
        reflectiva: config.reflectiva || "NINGUNA",
        protector_orajet: Boolean(config.protector_orajet),
        aplicacion_protector: config.protector_orajet
          ? config.aplicacion_protector || "COMPLETA"
          : "NO APLICA",
      });
    } else {
      setEditingConfig(null);
      setFormState({
        nombre: "",
        reflectiva: "NINGUNA",
        protector_orajet: false,
        aplicacion_protector: "NO APLICA",
      });
    }
    setIsFormModalOpen(true);
  };

  const handleSaveConfig = async () => {
    if (!formData.nombre.trim())
      return alert("Ingresá un nombre para el plano.");

    const payload = {
      ...formData,
      aplicacion_protector: formData.protector_orajet
        ? formData.aplicacion_protector
        : "NO APLICA",
    };

    try {
      const url = editingConfig
        ? `http://localhost:3001/api/configuraciones-pegado/${editingConfig.id}`
        : "http://localhost:3001/api/configuraciones-pegado";

      const method = editingConfig ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsFormModalOpen(false);
        fetchData();
      } else {
        alert("Error al guardar la configuración.");
      }
    } catch (err) {
      alert("Error al conectar con el servidor.");
    }
  };

  const handleDeleteConfig = async (id) => {
    if (
      !confirm(
        "¿Eliminar esta configuración de pegado? Los semielaborados enlazados quedarán sin pegado.",
      )
    )
      return;

    try {
      const res = await fetch(
        `http://localhost:3001/api/configuraciones-pegado/${id}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) fetchData();
    } catch (err) {
      alert("Error al eliminar.");
    }
  };

  // VINCULACIÓN RÁPIDA DESDE MODAL DE INSPECCIÓN
  const handleToggleSELink = async (seId, currentConfigId) => {
    const targetConfigId =
      currentConfigId === linkedModalConfig.id ? null : linkedModalConfig.id;

    try {
      const res = await fetch(
        `http://localhost:3001/api/semielaborados/${seId}/enlazar-pegado`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ configuracion_pegado_id: targetConfigId }),
        },
      );

      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error("Error al actualizar enlace:", err);
    }
  };

  // VINCULACIÓN MASIVA
  const handleBulkLink = async () => {
    if (selectedSEIds.length === 0)
      return alert("Seleccioná al menos un semielaborado de la lista.");

    try {
      const res = await fetch(
        "http://localhost:3001/api/semielaborados/bulk-enlazar-pegado",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: selectedSEIds,
            configuracion_pegado_id: bulkConfigId ? Number(bulkConfigId) : null,
          }),
        },
      );

      if (res.ok) {
        setSelectedSEIds([]);
        fetchData();
        alert("¡Semielaborados enlazados con éxito!");
      }
    } catch (err) {
      alert("Error al aplicar enlace masivo.");
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

  return (
    <div className="h-full flex flex-col font-mono text-[#e1d7f5] select-none space-y-2 sm:space-y-2.5 min-h-0 bg-[#1a0f2e] p-1 overflow-hidden">
      {/* 1. HEADER */}
      <div className="flex flex-row items-center justify-between pb-2 border-b-2 border-[#432874] gap-2 shrink-0">
        <div>
          <h2 className="font-pixel text-sm sm:text-base text-[#ffbe00] font-bold flex items-center gap-2 tracking-wide drop-shadow-[1px_1px_0px_#000]">
            <Sparkles size={16} className="text-[#ffbe00] shrink-0" /> PLANOS DE
            REFLECTIVAS Y PEGADO
          </h2>
          <p className="text-[10px] text-[#a594c9] font-mono hidden sm:block">
            Especificaciones maestras de vinilos, protector y enlace a
            semielaborados.
          </p>
        </div>

        <button
          onClick={() => handleOpenForm()}
          className="px-3 py-1.5 bg-[#ffbe00] border-2 border-[#b38600] text-[#2c1a4d] font-pixel text-xs font-bold hover:bg-[#ffe066] shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all rounded-xs flex items-center gap-1.5 shrink-0"
        >
          <Plus size={14} /> NUEVA CONFIGURACIÓN
        </button>
      </div>

      {/* 2. BARRA DE HERRAMIENTAS */}
      <div className="bg-[#24173e] border-2 border-[#432874] p-2 sm:p-2.5 space-y-2 shrink-0 rounded-xs shadow-[3px_3px_0px_#000]">
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-0.5">
          <div className="flex items-center gap-1.5 font-pixel text-xs">
            <button
              onClick={() => {
                setActiveTab("CONFIGS");
                setCurrentPage(1);
              }}
              className={`px-3 py-1 border-2 transition-all shrink-0 rounded-xs shadow-[1px_1px_0px_#000] ${
                activeTab === "CONFIGS"
                  ? "bg-[#ffbe00] border-[#b38600] text-[#2c1a4d] font-bold"
                  : "bg-[#160c2b] border-[#432874] text-[#a594c9] hover:text-white"
              }`}
            >
              PLANOS DE PEGADO ({configs.length})
            </button>

            <button
              onClick={() => {
                setActiveTab("ENLAZAR");
                setCurrentPage(1);
              }}
              className={`px-3 py-1 border-2 transition-all shrink-0 rounded-xs shadow-[1px_1px_0px_#000] ${
                activeTab === "ENLAZAR"
                  ? "bg-[#38bdf8] border-[#0284c7] text-[#2c1a4d] font-bold"
                  : "bg-[#160c2b] border-[#432874] text-[#a594c9] hover:text-white"
              }`}
            >
              ENLAZAR SEMIELABORADOS
            </button>
          </div>

          <div className="bg-[#160c2b] border border-[#432874] px-2.5 py-1 text-[10px] font-pixel text-[#a594c9] shrink-0 rounded-xs flex items-center gap-1">
            <span>REGISTROS:</span>
            <strong className="text-[#24cc8f]">
              {activeTab === "CONFIGS"
                ? processedConfigs.length
                : processedSE.length}
            </strong>
          </div>
        </div>

        {/* FILA BÚSQUEDA / ACCIÓN MASIVA */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          <div className="relative flex-1 max-w-md">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a594c9]"
            />
            <input
              type="text"
              placeholder={
                activeTab === "CONFIGS"
                  ? "Buscar plano por nombre..."
                  : "Buscar semielaborado por código o nombre..."
              }
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-[#160c2b] border-2 border-[#432874] text-xs text-white pl-8 pr-3 py-1 focus:outline-none focus:border-[#ffbe00] transition-colors placeholder:text-[#6e588a] rounded-xs font-mono"
            />
          </div>

          {activeTab === "ENLAZAR" && (
            <div className="flex items-center gap-2 font-pixel text-xs bg-[#160c2b] p-1 border border-[#432874] rounded-xs">
              <span className="text-[#a594c9] text-[10px] pl-1">
                ASIGNAR A ({selectedSEIds.length}):
              </span>
              <select
                value={bulkConfigId}
                onChange={(e) => setBulkConfigId(e.target.value)}
                className="bg-[#24173e] border border-[#432874] text-white text-xs px-2 py-0.5 focus:outline-none focus:border-[#38bdf8]"
              >
                <option value="">-- SIN PEGADO --</option>
                {configs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <button
                onClick={handleBulkLink}
                className="px-3 py-1 bg-[#38bdf8] text-[#2c1a4d] font-bold text-xs hover:bg-[#7dd3fc] shadow-[1px_1px_0px_#000] active:translate-y-0.5 rounded-2xs"
              >
                APLICAR
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3. PANEL TABLA PRINCIPAL */}
      <div className="flex-1 bg-[#24173e] border-2 border-[#432874] p-2 sm:p-2.5 flex flex-col min-h-0 shadow-[4px_4px_0px_#000] relative rounded-xs overflow-hidden">
        <div
          ref={tableContainerRef}
          className="hidden md:flex flex-1 border-2 border-[#432874] bg-[#160c2b] min-h-0 flex-col overflow-hidden rounded-xs"
        >
          {/* VISTA 1: TABLA DE PLANOS DE PEGADO */}
          {activeTab === "CONFIGS" ? (
            <table className="w-full text-left text-xs border-collapse table-fixed">
              <thead>
                <tr className="text-[#a594c9] border-b-2 border-[#432874] font-pixel text-[11px] bg-[#2c1a4d] sticky top-0 z-10 h-[36px]">
                  <th
                    onClick={() => handleSort("nombre")}
                    className="w-[30%] px-3 font-normal cursor-pointer hover:bg-[#39215e] hover:text-[#ffbe00] transition-colors select-none"
                  >
                    <div className="flex items-center justify-between pr-1">
                      <span>NOMBRE DEL PLANO</span>
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

                  <th className="w-[38%] px-3 font-normal">
                    ESPECIFICACIÓN TÉCNICA
                  </th>

                  <th
                    onClick={() => handleSort("semielaborados_count")}
                    className="w-[18%] px-3 font-normal text-center cursor-pointer hover:bg-[#39215e] hover:text-[#ffbe00] transition-colors select-none"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>ENLAZADOS</span>
                      <span className="w-3 flex justify-center shrink-0">
                        {sortColumn === "semielaborados_count" ? (
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

                  <th className="w-[14%] px-3 font-normal text-center">
                    ACCIONES
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
                      Consultando planos de pegado...
                    </td>
                  </tr>
                ) : paginatedConfigs.length === 0 ? (
                  <tr>
                    <td
                      colSpan="4"
                      className="py-16 text-center font-pixel text-xs text-[#6e588a]"
                    >
                      No hay planos registrados.
                    </td>
                  </tr>
                ) : (
                  <>
                    {paginatedConfigs.map((c) => (
                      <tr
                        key={c.id}
                        className="h-[42px] hover:bg-[#281747] hover:shadow-[inset_0_0_15px_rgba(255,190,0,0.12)] transition-all duration-150 align-middle"
                      >
                        <td className="px-3 font-pixel text-[#ffbe00] font-bold tracking-wider truncate align-middle">
                          {c.nombre}
                        </td>

                        <td className="px-3 align-middle whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-pixel px-2 py-0.5 border border-[#38bdf8]/40 bg-[#38bdf8]/10 text-[#38bdf8] font-bold shadow-[1px_1px_0px_#000]">
                              {c.reflectiva || "NINGUNA"}
                            </span>

                            {Boolean(c.protector_orajet) ? (
                              <span className="text-[10px] font-pixel px-2 py-0.5 border border-[#24cc8f]/40 bg-[#24cc8f]/10 text-[#24cc8f] font-bold shadow-[1px_1px_0px_#000] flex items-center gap-1">
                                <Sparkle size={10} /> ORAJET (
                                {c.aplicacion_protector || "COMPLETA"})
                              </span>
                            ) : (
                              <span className="text-[10px] font-pixel px-2 py-0.5 border border-[#432874] bg-[#24173e] text-[#6e588a]">
                                SIN ORAJET
                              </span>
                            )}
                          </div>
                        </td>

                        {/* BOTÓN INTERACTIVO DE ENLAZADOS */}
                        <td className="px-3 text-center align-middle whitespace-nowrap">
                          <button
                            onClick={() => setLinkedModalConfig(c)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#2c1a4d] border border-[#38bdf8]/50 text-[#38bdf8] font-pixel text-[11px] font-bold hover:bg-[#38bdf8] hover:text-[#2c1a4d] shadow-[1px_1px_0px_#000] active:translate-y-0.5 transition-all rounded-2xs"
                          >
                            <Link size={11} /> {c.semielaborados_count || 0}{" "}
                            ítems
                          </button>
                        </td>

                        <td className="px-3 text-center align-middle">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenForm(c)}
                              className="p-1 bg-[#2c1a4d] border border-[#432874] text-[#a594c9] hover:text-[#ffbe00] hover:border-[#ffbe00] transition-all shadow-[1px_1px_0px_#000] rounded-2xs"
                              title="Editar Plano"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={() => handleDeleteConfig(c.id)}
                              className="p-1 bg-[#2c1a4d] border border-[#432874] text-[#a594c9] hover:text-[#f87171] hover:border-[#f87171] transition-all shadow-[1px_1px_0px_#000] rounded-2xs"
                              title="Eliminar Plano"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {/* RANURAS VACÍAS */}
                    {Array.from({ length: emptySlotsCount }).map((_, idx) => (
                      <tr
                        key={`empty-${idx}`}
                        className="h-[42px] opacity-15 pointer-events-none"
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
          ) : (
            /* VISTA 2: ENLACE MASIVO DE SEMIELABORADOS */
            <table className="w-full text-left text-xs border-collapse table-fixed">
              <thead>
                <tr className="text-[#a594c9] border-b-2 border-[#432874] font-pixel text-[11px] bg-[#2c1a4d] sticky top-0 z-10 h-[36px]">
                  <th className="w-[8%] px-3 font-normal text-center">
                    <input
                      type="checkbox"
                      checked={
                        paginatedSE.length > 0 &&
                        paginatedSE.every((s) => selectedSEIds.includes(s.id))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          const pageIds = paginatedSE.map((s) => s.id);
                          setSelectedSEIds(
                            Array.from(new Set([...selectedSEIds, ...pageIds])),
                          );
                        } else {
                          const pageIds = paginatedSE.map((s) => s.id);
                          setSelectedSEIds(
                            selectedSEIds.filter((id) => !pageIds.includes(id)),
                          );
                        }
                      }}
                      className="accent-[#38bdf8] w-3.5 h-3.5 cursor-pointer"
                    />
                  </th>
                  <th className="w-[22%] px-3 font-normal">CÓDIGO</th>
                  <th className="w-[45%] px-3 font-normal">
                    SEMIELABORADO / ARTÍCULO
                  </th>
                  <th className="w-[25%] px-3 font-normal text-center">
                    PLANO ASIGNADO
                  </th>
                </tr>
              </thead>

              <tbody
                key={currentPage}
                className="divide-y divide-[#432874]/30 bg-[#160c2b] animate-in fade-in duration-200"
              >
                {paginatedSE.map((s) => {
                  const isChecked = selectedSEIds.includes(s.id);
                  return (
                    <tr
                      key={s.id}
                      onClick={() => {
                        if (isChecked)
                          setSelectedSEIds(
                            selectedSEIds.filter((id) => id !== s.id),
                          );
                        else setSelectedSEIds([...selectedSEIds, s.id]);
                      }}
                      className={`h-[42px] cursor-pointer transition-colors ${
                        isChecked ? "bg-[#281747]" : "hover:bg-[#281747]/50"
                      }`}
                    >
                      <td className="px-3 text-center align-middle">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="accent-[#38bdf8] w-3.5 h-3.5"
                        />
                      </td>
                      <td className="px-3 font-pixel text-[#ffbe00] font-bold tracking-wider truncate align-middle">
                        {s.codigo}
                      </td>
                      <td className="px-3 text-white font-bold truncate align-middle">
                        {s.nombre}
                      </td>
                      <td className="px-3 text-center align-middle whitespace-nowrap">
                        <span
                          className={`text-[10px] font-pixel px-2 py-0.5 border ${
                            s.pegado_nombre
                              ? "text-[#38bdf8] border-[#38bdf8]/40 bg-[#38bdf8]/10 font-bold"
                              : "text-[#6e588a] border-[#432874]"
                          }`}
                        >
                          {s.pegado_nombre || "SIN PEGADO"}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {Array.from({ length: emptySlotsCount }).map((_, idx) => (
                  <tr
                    key={`empty-${idx}`}
                    className="h-[42px] opacity-15 pointer-events-none"
                  >
                    <td className="px-3 text-center text-[#432874] text-[10px]">
                      --
                    </td>
                    <td className="px-3 text-[#432874] font-pixel text-[10px]">
                      --
                    </td>
                    <td className="px-3 text-[#432874] font-pixel text-[10px]">
                      -- RANURA VACÍA --
                    </td>
                    <td className="px-3 text-center text-[#432874] text-[10px]">
                      --
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
          MODAL CREAR / EDITAR CONFIGURACIÓN DE PEGADO
      ========================================================= */}
      {isFormModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-[100] flex items-center justify-center p-3 animate-in fade-in duration-200 font-mono">
          <div className="bg-[#24173e] border-2 border-[#ffbe00] w-full max-w-md p-5 shadow-[0_0_35px_rgba(255,190,0,0.3)] space-y-4 relative rounded-xs">
            <button
              onClick={() => setIsFormModalOpen(false)}
              className="absolute top-4 right-4 text-[#a594c9] hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b-2 border-[#432874] pb-2">
              <span className="text-[10px] font-pixel text-[#ffbe00] bg-[#ffbe00]/10 px-2 py-0.5 border border-[#ffbe00]/30 rounded-xs font-bold">
                {editingConfig ? "EDITAR PLANO" : "NUEVO PLANO DE PEGADO"}
              </span>
              <h3 className="font-pixel text-sm text-white font-bold mt-1.5 flex items-center gap-2">
                <Sparkles size={16} className="text-[#ffbe00]" /> ESPECIFICACIÓN
                TÉCNICA
              </h3>
            </div>

            <div className="space-y-3 font-pixel text-xs">
              <div>
                <label className="text-[#a594c9] block mb-1">
                  NOMBRE DEL PLANO:
                </label>
                <input
                  type="text"
                  placeholder="Ej: KING CONE LIGHT"
                  value={formData.nombre}
                  onChange={(e) =>
                    setFormState({ ...formData, nombre: e.target.value })
                  }
                  className="w-full bg-[#160c2b] border-2 border-[#432874] p-2 text-white font-bold focus:outline-none focus:border-[#ffbe00] text-xs rounded-xs uppercase"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[#a594c9] block mb-1">
                  TIPO DE REFLECTIVA:
                </label>
                <select
                  value={formData.reflectiva}
                  onChange={(e) =>
                    setFormState({ ...formData, reflectiva: e.target.value })
                  }
                  className="w-full bg-[#160c2b] border-2 border-[#432874] p-2 text-white font-bold focus:outline-none focus:border-[#ffbe00] text-xs rounded-xs"
                >
                  <option value="NINGUNA">NINGUNA</option>
                  <option value="CHINA 3M">CHINA 3M</option>
                  <option value="AVERY">AVERY</option>
                  <option value="3M">3M</option>
                  <option value="EG 3M">EG 3M</option>
                  <option value="HIP 3M">HIP 3M</option>
                  <option value="DG3 3M">DG3 3M</option>
                </select>
              </div>

              {/* LÓGICA INTELIGENTE ORAJET */}
              <div className="bg-[#160c2b] p-3 border border-[#432874] space-y-2 rounded-xs">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-[#38bdf8] font-bold">
                    LLEVA PROTECTOR ORAJET:
                  </span>
                  <input
                    type="checkbox"
                    checked={formData.protector_orajet}
                    onChange={(e) => {
                      const isOrajet = e.target.checked;
                      setFormState({
                        ...formData,
                        protector_orajet: isOrajet,
                        aplicacion_protector: isOrajet
                          ? "COMPLETA"
                          : "NO APLICA",
                      });
                    }}
                    className="w-4 h-4 accent-[#38bdf8] cursor-pointer"
                  />
                </label>

                {formData.protector_orajet ? (
                  <div>
                    <label className="text-[#a594c9] text-[10px] block mb-1">
                      APLICACIÓN DE PROTECTOR:
                    </label>
                    <select
                      value={formData.aplicacion_protector}
                      onChange={(e) =>
                        setFormState({
                          ...formData,
                          aplicacion_protector: e.target.value,
                        })
                      }
                      className="w-full bg-[#24173e] border border-[#432874] p-1.5 text-white font-bold focus:outline-none focus:border-[#38bdf8] text-xs rounded-xs"
                    >
                      <option value="COMPLETA">COMPLETA</option>
                      <option value="PARCIAL">PARCIAL</option>
                      <option value="SUPERIOR">SUPERIOR</option>
                      <option value="INFERIOR">INFERIOR</option>
                    </select>
                  </div>
                ) : (
                  <p className="text-[10px] text-[#6e588a] italic">
                    Aplicación establecida automáticamente a NO APLICA.
                  </p>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-[#432874] flex justify-end gap-2 font-pixel">
              <button
                onClick={() => setIsFormModalOpen(false)}
                className="px-3.5 py-1.5 border border-[#432874] text-[#a594c9] hover:text-white text-xs rounded-xs"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveConfig}
                className="px-4 py-1.5 bg-[#ffbe00] text-[#2c1a4d] font-bold text-xs hover:bg-[#ffe066] shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] rounded-xs"
              >
                GUARDAR PLANO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL DE INSPECCIÓN Y GESTIÓN DE ENLAZADOS
      ========================================================= */}
      {linkedModalConfig && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-[100] flex items-center justify-center p-3 animate-in fade-in duration-200 font-mono">
          <div className="bg-[#24173e] border-2 border-[#38bdf8] w-full max-w-xl p-5 shadow-[0_0_35px_rgba(56,189,248,0.25)] space-y-4 relative rounded-xs max-h-[85vh] flex flex-col">
            <button
              onClick={() => setLinkedModalConfig(null)}
              className="absolute top-4 right-4 text-[#a594c9] hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b-2 border-[#432874] pb-2 shrink-0">
              <span className="text-[10px] font-pixel text-[#38bdf8] bg-[#38bdf8]/10 px-2 py-0.5 border border-[#38bdf8]/30 rounded-xs font-bold">
                AUDITORÍA DE VINCULACIÓN
              </span>
              <h3 className="font-pixel text-sm text-white font-bold mt-1.5 flex items-center gap-2">
                <Link size={16} className="text-[#38bdf8]" /> PLANO:{" "}
                {linkedModalConfig.nombre}
              </h3>
            </div>

            <div className="relative shrink-0">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a594c9]"
              />
              <input
                type="text"
                placeholder="Filtrar semielaborados..."
                value={linkedSearch}
                onChange={(e) => setLinkedSearch(e.target.value)}
                className="w-full bg-[#160c2b] border border-[#432874] text-xs text-white pl-8 pr-3 py-1.5 focus:outline-none focus:border-[#38bdf8] rounded-xs font-mono"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 font-pixel text-xs">
              {semielaborados
                .filter(
                  (s) =>
                    s.codigo
                      .toLowerCase()
                      .includes(linkedSearch.toLowerCase()) ||
                    s.nombre.toLowerCase().includes(linkedSearch.toLowerCase()),
                )
                .map((s) => {
                  const isLinkedToThis =
                    s.configuracion_pegado_id === linkedModalConfig.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() =>
                        handleToggleSELink(s.id, s.configuracion_pegado_id)
                      }
                      className={`p-2.5 border flex justify-between items-center cursor-pointer transition-colors ${
                        isLinkedToThis
                          ? "border-[#38bdf8] bg-[#2c1a4d] text-white"
                          : "border-[#432874]/60 bg-[#160c2b] text-[#6e588a]"
                      }`}
                    >
                      <div className="truncate pr-2">
                        <strong
                          className={
                            isLinkedToThis ? "text-[#ffbe00]" : "text-slate-400"
                          }
                        >
                          [{s.codigo}]
                        </strong>{" "}
                        <span className="truncate">{s.nombre}</span>
                      </div>

                      <button
                        className={`px-2 py-0.5 text-[10px] font-bold border rounded-2xs shrink-0 ${
                          isLinkedToThis
                            ? "bg-[#38bdf8] text-[#2c1a4d] border-[#38bdf8]"
                            : "bg-[#24173e] text-[#a594c9] border-[#432874]"
                        }`}
                      >
                        {isLinkedToThis ? "ENLAZADO" : "VINCULAR"}
                      </button>
                    </div>
                  );
                })}
            </div>

            <div className="pt-2 border-t border-[#432874] flex justify-end font-pixel shrink-0">
              <button
                onClick={() => setLinkedModalConfig(null)}
                className="px-4 py-1.5 bg-[#38bdf8] text-[#2c1a4d] font-bold text-xs hover:bg-[#7dd3fc] shadow-[2px_2px_0px_#000] rounded-xs"
              >
                FINALIZAR INSPECCIÓN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
