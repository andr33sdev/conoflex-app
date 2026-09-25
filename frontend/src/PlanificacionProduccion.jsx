import { useState, useEffect, useMemo, useRef } from "react";
import {
  ClipboardEdit,
  Plus,
  X,
  Search,
  Scale,
  Trash2,
  CheckCircle2,
  Clock,
  Anvil,
  Package,
  History,
  Lock,
  Unlock,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Calendar as CalendarIcon,
  List,
  Edit2,
  GripVertical,
  Zap,
  ArrowRight,
  GitBranch,
  AlertTriangle,
  Layers,
} from "lucide-react";

export default function PlanificacionProduccion() {
  const [ordenes, setOrdenes] = useState([]);
  const [semielaboradosDB, setSemielaboradosDB] = useState([]);
  const [materiasPrimasDB, setMateriasPrimasDB] = useState([]);
  const [recipesMap, setRecipesMap] = useState({});
  const [produccionLogs, setProduccionLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // VISTA TABLA vs CALENDARIO
  const [activeMainTab, setActiveTab] = useState("TABLA");

  // VISTA TABLA PRINCIPAL: ITEMS vs MRP INSUMOS
  const [tableMode, setTableMode] = useState("ITEMS");

  // MODO HISTORIAL (PLANES CERRADOS)
  const [isHistorialMode, setIsHistorialMode] = useState(false);

  // PLAN SELECCIONADO ACTUALMENTE
  const [selectedPlanCode, setSelectedPlanCode] = useState("");
  const [emptyPlans, setEmptyPlans] = useState([]);

  // FILTROS BÚSQUEDA DENTRO DEL PLAN
  const [searchItemText, setSearchItemText] = useState("");

  // DRAWER LATERAL DESPLEGABLE
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerSearchText, setDrawerSearchText] = useState("");

  // CALENDARIO, DRAG & DROP Y HOVER TIMER 2 SEGUNDOS
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());

  // ESTADOS DE HOVER E INSPECCIÓN FIJA
  const [hoveredDateKey, setHoveredDateKey] = useState(null);
  const [pinnedDateKey, setPinnedDateKey] = useState(null);
  const hoverTimerRef = useRef(null);

  // DRAG ITEM PADRE DESDE DRAWER O REPROGRAMABLE
  const [draggedParentSE, setDraggedParentSE] = useState(null);
  const [draggedOTItem, setDraggedOTItem] = useState(null);

  // MODAL CONFIRMACIÓN DE DOSIFICACIÓN
  const [dropModalData, setDropModalData] = useState(null);

  // PAGINACIÓN ADAPTATIVA
  const tableContainerRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // MODALES
  const [isNewPlanModalOpen, setIsNewPlanModalOpen] = useState(false);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [editingRitmoItem, setEditingRitmoItem] = useState(null);
  const [newRitmoVal, setNewRitmoVal] = useState("");

  // FORMULARIO CREAR PLAN VACÍO
  const [newPlanForm, setNewPlanForm] = useState({
    codigo_ot: "",
    destino: "Stock General",
  });

  // FORMULARIO AGREGAR ITEM AL PLAN
  const [addItemForm, setAddItemForm] = useState({
    semielaborado_codigo: "",
    articulo: "",
    cant_objetivo: 500,
    velocidad_u_hora: 50,
  });

  // CÁLCULO DE FILAS VISIBLES
  useEffect(() => {
    const updatePageSize = () => {
      if (!tableContainerRef.current) return;
      const containerHeight = tableContainerRef.current.clientHeight;
      const headerHeight = 36;
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
  }, [itemsPerPage, activeMainTab, tableMode]);

  // CARGAR DATOS BASE
  const fetchData = async () => {
    setLoading(true);
    try {
      const [resOT, resSE, resMP, resLogs] = await Promise.all([
        fetch("/api/ordenes-trabajo"),
        fetch("/api/semielaborados"),
        fetch("/api/materias-primas"),
        fetch("/api/metricas/produccion"),
      ]);

      if (resOT.ok) setOrdenes(await resOT.json());
      if (resMP.ok) setMateriasPrimasDB(await resMP.json());
      if (resLogs.ok) setProduccionLogs(await resLogs.json());

      if (resSE.ok) {
        const semielaborados = await resSE.json();
        setSemielaboradosDB(semielaborados);

        const recipeMapObj = {};
        await Promise.all(
          semielaborados.map(async (se) => {
            try {
              const resRecipe = await fetch(
                `/api/ingenierias/semielaborado/${se.id}`,
              );
              if (resRecipe.ok) {
                const recipes = await resRecipe.json();
                const active =
                  recipes.find((r) => r.es_activa === 1) || recipes[0];
                if (active && active.ingredientes) {
                  recipeMapObj[se.codigo] = active.ingredientes;
                }
              }
            } catch (e) {
              console.error(`Error cargando receta para ${se.codigo}`, e);
            }
          }),
        );
        setRecipesMap(recipeMapObj);
      }
    } catch (err) {
      console.error("Error cargando planificación:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // CONTROL DEL TIMER DE HOVER DE 2 SEGUNDOS EN EL CALENDARIO
  const handleCellMouseEnter = (dateKey) => {
    setHoveredDateKey(dateKey);
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);

    hoverTimerRef.current = setTimeout(() => {
      setPinnedDateKey(dateKey);
    }, 2000);
  };

  const handleCellMouseLeave = (dateKey) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (pinnedDateKey !== dateKey) {
      setHoveredDateKey(null);
    }
  };

  // OBTENER INGREDIENTES DE MATERIA PRIMA DESDE LA RECETA
  const getMPIngredientsForSE = (seCode, depth = 0) => {
    if (depth > 5) return [];
    const ingredients = recipesMap[seCode] || [];
    let result = [];

    ingredients.forEach((ing) => {
      if (ing.item_type === "MP" || ing.materia_prima_id) {
        result.push({
          materia_prima_id: ing.materia_prima_id,
          item_codigo: ing.item_codigo,
          item_nombre: ing.item_nombre,
          cantidad: Number(ing.cantidad) || 0,
          unidad_medida: ing.unidad_medida || "Kg",
        });
      } else if (ing.item_type === "SE" || ing.semielaborado_id) {
        const subMPIngs = getMPIngredientsForSE(ing.item_codigo, depth + 1);
        subMPIngs.forEach((subIng) => {
          result.push({
            ...subIng,
            cantidad: subIng.cantidad * (Number(ing.cantidad) || 1),
          });
        });
      }
    });

    return result;
  };

  // AGRUPAMIENTO DE PLANES Y ESTADO
  const groupedPlans = useMemo(() => {
    const map = {};

    emptyPlans.forEach((p) => {
      map[p.codigo_ot] = {
        codigo_ot: p.codigo_ot,
        destino: p.destino,
        estado: "ABIERTO",
        items: [],
      };
    });

    ordenes.forEach((o) => {
      if (!map[o.codigo_ot]) {
        map[o.codigo_ot] = {
          codigo_ot: o.codigo_ot,
          destino: o.destino || "Stock General",
          estado: "ABIERTO",
          items: [],
        };
      }
      map[o.codigo_ot].items.push(o);
    });

    Object.values(map).forEach((plan) => {
      if (
        plan.items.length > 0 &&
        plan.items.every((i) => i.estado === "FINALIZADO")
      ) {
        plan.estado = "CERRADO";
      }
    });

    return Object.values(map);
  }, [ordenes, emptyPlans]);

  const availablePlansList = useMemo(() => {
    return groupedPlans.filter((p) =>
      isHistorialMode ? p.estado === "CERRADO" : p.estado === "ABIERTO",
    );
  }, [groupedPlans, isHistorialMode]);

  useEffect(() => {
    if (availablePlansList.length > 0) {
      const exists = availablePlansList.some(
        (p) => p.codigo_ot === selectedPlanCode,
      );
      if (!exists) {
        setSelectedPlanCode(availablePlansList[0].codigo_ot);
      }
    } else {
      setSelectedPlanCode("");
    }
    setCurrentPage(1);
  }, [availablePlansList, isHistorialMode]);

  const currentPlan = useMemo(() => {
    return groupedPlans.find((p) => p.codigo_ot === selectedPlanCode) || null;
  }, [groupedPlans, selectedPlanCode]);

  // AGRUPAMIENTO DE ÍTEMS EN LA TABLA
  const currentPlanGroupedItems = useMemo(() => {
    if (!currentPlan) return [];
    const map = {};

    currentPlan.items.forEach((item) => {
      const code = item.semielaborado_codigo;
      if (!map[code]) {
        map[code] = {
          semielaborado_codigo: code,
          articulo: item.articulo,
          velocidad_u_hora: item.velocidad_u_hora || 50,
          cant_objetivo_plan:
            Number(item.cant_objetivo_plan || item.cant_objetivo) || 0,
          cant_producida_total: 0,
          cant_dosificada_total: 0,
          uniqueDates: new Set(),
          rawItems: [],
        };
      }

      map[code].rawItems.push(item);
      map[code].cant_producida_total += Number(item.cant_producida) || 0;

      if (
        item.fecha_inicio &&
        item.fecha_inicio !== "" &&
        item.fecha_inicio !== "1970-01-01"
      ) {
        map[code].uniqueDates.add(item.fecha_inicio);
        map[code].cant_dosificada_total += Number(item.cant_objetivo) || 0;
      }

      const targetVal =
        Number(item.cant_objetivo_plan || item.cant_objetivo) || 0;
      if (targetVal > map[code].cant_objetivo_plan) {
        map[code].cant_objetivo_plan = targetVal;
      }
    });

    return Object.values(map).map((group) => {
      const diasCount = group.uniqueDates.size;
      let fechaTexto = "Sin Asignar";
      if (diasCount === 1) fechaTexto = "1 día";
      else if (diasCount > 1) fechaTexto = `${diasCount} días`;

      const disponible = Math.max(
        0,
        group.cant_objetivo_plan - group.cant_dosificada_total,
      );

      return {
        ...group,
        diasCount,
        fechaTexto,
        cant_disponible: disponible,
      };
    });
  }, [currentPlan]);

  const filteredPlanGroupedItems = useMemo(() => {
    return currentPlanGroupedItems.filter((item) => {
      const term = searchItemText.toLowerCase().trim();
      return (
        item.semielaborado_codigo.toLowerCase().includes(term) ||
        (item.articulo && item.articulo.toLowerCase().includes(term))
      );
    });
  }, [currentPlanGroupedItems, searchItemText]);

  // UNICIDAD DE SEMIELABORADOS "PADRE" PARA EL DRAWER
  const drawerParentItems = useMemo(() => {
    const term = drawerSearchText.toLowerCase().trim();
    return currentPlanGroupedItems.filter(
      (item) =>
        item.semielaborado_codigo.toLowerCase().includes(term) ||
        (item.articulo && item.articulo.toLowerCase().includes(term)),
    );
  }, [currentPlanGroupedItems, drawerSearchText]);

  // ESTADÍSTICAS DEL PLAN
  const currentPlanStats = useMemo(() => {
    if (!currentPlan || currentPlan.items.length === 0) {
      return { totalObj: 0, totalProd: 0, avance: 0 };
    }

    let totalObj = 0;
    let totalProd = 0;

    currentPlanGroupedItems.forEach((i) => {
      totalObj += i.cant_objetivo_plan || 0;
      totalProd += i.cant_producida_total || 0;
    });

    const avance = totalObj > 0 ? Math.round((totalProd / totalObj) * 100) : 0;
    return { totalObj, totalProd, avance };
  }, [currentPlan, currentPlanGroupedItems]);

  // MRP EXPLOSIÓN EXCLUSIVA A MATERIAS PRIMAS
  const mrpCalculatedData = useMemo(() => {
    if (!currentPlan || currentPlan.items.length === 0) return [];

    const map = {};

    currentPlanGroupedItems.forEach((group) => {
      const cantOt = Number(group.cant_objetivo_plan) || 0;
      const mpIngs = getMPIngredientsForSE(group.semielaborado_codigo);

      mpIngs.forEach((ing) => {
        const totalKgRequeridos = cantOt * ing.cantidad;
        const key = ing.item_codigo || ing.item_nombre;

        if (!map[key]) {
          const mpDb = materiasPrimasDB.find(
            (m) =>
              m.codigo === ing.item_codigo || m.id === ing.materia_prima_id,
          );

          const stockReal = mpDb ? Number(mpDb.stock_actual) || 0 : 0;

          map[key] = {
            codigo: ing.item_codigo,
            nombre: ing.item_nombre || mpDb?.nombre || ing.item_codigo,
            unidad: ing.unidad_medida || mpDb?.unidad_medida || "Kg",
            requeridoKg: 0,
            stockActual: stockReal,
          };
        }
        map[key].requeridoKg += totalKgRequeridos;
      });
    });

    return Object.values(map).map((m) => {
      const dif = m.stockActual - m.requeridoKg;
      return {
        ...m,
        diferencia: dif,
        esDeficit: dif < 0,
      };
    });
  }, [currentPlan, currentPlanGroupedItems, recipesMap, materiasPrimasDB]);

  // HANDLERS
  const handleCreateEmptyPlan = () => {
    if (!newPlanForm.codigo_ot.trim()) {
      return alert("Ingresá un nombre para el plan.");
    }

    const codeUpper = newPlanForm.codigo_ot.trim().toUpperCase();
    if (groupedPlans.some((p) => p.codigo_ot === codeUpper)) {
      return alert("Ya existe un plan con ese código.");
    }

    setEmptyPlans([
      ...emptyPlans,
      {
        codigo_ot: codeUpper,
        destino: newPlanForm.destino.trim() || "Stock General",
        estado: "ABIERTO",
      },
    ]);
    setIsHistorialMode(false);
    setSelectedPlanCode(codeUpper);
    setIsNewPlanModalOpen(false);
  };

  const handleAddItemToCurrentPlan = async () => {
    if (!currentPlan || currentPlan.estado === "CERRADO") return;
    if (!addItemForm.semielaborado_codigo)
      return alert("Seleccioná un producto.");

    try {
      const res = await fetch("/api/ordenes-trabajo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo_ot: currentPlan.codigo_ot,
          semielaborado_codigo: addItemForm.semielaborado_codigo,
          articulo: addItemForm.articulo,
          maquina: "EXTRUSIÓN",
          destino: currentPlan.destino || "Stock General",
          cant_objetivo: Number(addItemForm.cant_objetivo),
          velocidad_u_hora: Number(addItemForm.velocidad_u_hora),
          fecha_inicio: "",
          estado: "PROGRAMADO",
        }),
      });

      if (res.ok) {
        setIsAddItemModalOpen(false);
        fetchData();
      }
    } catch (err) {
      alert("Error al agregar producto.");
    }
  };

  const handleSaveRitmo = async () => {
    if (!editingRitmoItem) return;
    const ritmoNum = parseInt(newRitmoVal, 10);
    if (isNaN(ritmoNum) || ritmoNum <= 0)
      return alert("Ingresá un ritmo válido.");

    try {
      const res = await fetch(`/api/ordenes-trabajo/${editingRitmoItem.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editingRitmoItem,
          velocidad_u_hora: ritmoNum,
        }),
      });

      if (res.ok) {
        setEditingRitmoItem(null);
        fetchData();
      }
    } catch (err) {
      alert("Error al actualizar velocidad.");
    }
  };

  const handleDropOnDay = (targetDateKey) => {
    if (!currentPlan || currentPlan.estado === "CERRADO") return;

    if (draggedParentSE) {
      const isAlreadyOnDay = currentPlan.items.some(
        (i) =>
          i.semielaborado_codigo === draggedParentSE.semielaborado_codigo &&
          i.fecha_inicio === targetDateKey,
      );

      if (isAlreadyOnDay) {
        alert(
          `El semielaborado [${draggedParentSE.semielaborado_codigo}] ya está asignado al día ${targetDateKey}.`,
        );
        setDraggedParentSE(null);
        return;
      }

      setDropModalData({
        type: "DESDE_PADRE",
        parentSE: draggedParentSE,
        targetDate: targetDateKey,
        cantidad: Math.min(500, draggedParentSE.cant_disponible || 500),
      });
    } else if (draggedOTItem) {
      setDropModalData({
        type: "REPROGRAMAR",
        ot: draggedOTItem,
        targetDate: targetDateKey,
        cantidad: draggedOTItem.cant_objetivo || 500,
      });
    }
  };

  const handleConfirmDropQty = async () => {
    if (!dropModalData || !currentPlan) return;
    const cantIngresada = Number(dropModalData.cantidad);
    if (isNaN(cantIngresada) || cantIngresada <= 0)
      return alert("Ingresá una cantidad válida.");

    const seCode =
      dropModalData.parentSE?.semielaborado_codigo ||
      dropModalData.ot?.semielaborado_codigo;

    const groupInfo = currentPlanGroupedItems.find(
      (g) => g.semielaborado_codigo === seCode,
    );

    if (groupInfo) {
      const yaDosificadoOtros =
        groupInfo.cant_dosificada_total -
        (dropModalData.ot ? Number(dropModalData.ot.cant_objetivo) || 0 : 0);

      const disponibleActual = groupInfo.cant_objetivo_plan - yaDosificadoOtros;

      if (cantIngresada > disponibleActual) {
        alert(
          `⚠️ EXCESO DE CANTIDAD EN EL PLAN\n\n` +
            `No podés asignar ${cantIngresada} u. a esta fecha porque supera el límite establecido para este producto en el plan.\n\n` +
            `• Cantidad Total del Plan: ${groupInfo.cant_objetivo_plan} u.\n` +
            `• Ya Dosificado en otras fechas: ${yaDosificadoOtros} u.\n` +
            `• Máximo Disponible: ${disponibleActual} u.\n\n` +
            `Por favor, editá la cantidad del plan o ajustá la dosificación ingresada.`,
        );
        return;
      }
    }

    try {
      if (dropModalData.type === "DESDE_PADRE") {
        const res = await fetch("/api/ordenes-trabajo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            codigo_ot: currentPlan.codigo_ot,
            semielaborado_codigo: dropModalData.parentSE.semielaborado_codigo,
            articulo: dropModalData.parentSE.articulo,
            maquina: "EXTRUSIÓN",
            destino: currentPlan.destino || "Stock General",
            cant_objetivo: cantIngresada,
            velocidad_u_hora: dropModalData.parentSE.velocidad_u_hora || 50,
            fecha_inicio: dropModalData.targetDate,
            estado: "PROGRAMADO",
          }),
        });

        if (res.ok) {
          setDropModalData(null);
          setDraggedParentSE(null);
          fetchData();
        }
      } else if (dropModalData.type === "REPROGRAMAR") {
        const res = await fetch(`/api/ordenes-trabajo/${dropModalData.ot.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...dropModalData.ot,
            fecha_inicio: dropModalData.targetDate,
            cant_objetivo: cantIngresada,
          }),
        });

        if (res.ok) {
          setDropModalData(null);
          setDraggedOTItem(null);
          fetchData();
        }
      }
    } catch (err) {
      alert("Error al procesar la operación.");
    }
  };

  const handleUnassignDateFromOT = async (otItem, e) => {
    if (e) e.stopPropagation();
    if (currentPlan?.estado === "CERRADO") return;
    if (!confirm(`¿Quitar [${otItem.semielaborado_codigo}] de esta fecha?`))
      return;

    try {
      const instancias = currentPlan.items.filter(
        (i) => i.semielaborado_codigo === otItem.semielaborado_codigo,
      );

      if (instancias.length > 1) {
        const res = await fetch(`/api/ordenes-trabajo/${otItem.id}`, {
          method: "DELETE",
        });
        if (res.ok) fetchData();
      } else {
        const res = await fetch(`/api/ordenes-trabajo/${otItem.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...otItem, fecha_inicio: "" }),
        });
        if (res.ok) fetchData();
      }
    } catch (err) {
      console.error("Error al desasignar fecha:", err);
    }
  };

  const handleTogglePlanEstado = async () => {
    if (!currentPlan) return;
    const nuevoEstado =
      currentPlan.estado === "CERRADO" ? "PROGRAMADO" : "FINALIZADO";
    if (
      !confirm(
        `¿Confirmás ${currentPlan.estado === "CERRADO" ? "reabrir" : "cerrar"} el plan [${currentPlan.codigo_ot}]?`,
      )
    )
      return;

    try {
      const res = await fetch(
        `/api/ordenes-trabajo/ot/${encodeURIComponent(currentPlan.codigo_ot)}/estado-lote`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado: nuevoEstado }),
        },
      );

      if (res.ok) fetchData();
    } catch (err) {
      alert("Error al cambiar estado.");
    }
  };

  const handleDeleteGroupFromPlan = async (group) => {
    if (
      !confirm(
        `¿Eliminar completamente [${group.semielaborado_codigo}] del plan de trabajo?`,
      )
    )
      return;
    try {
      for (const item of group.rawItems) {
        await fetch(`/api/ordenes-trabajo/${item.id}`, {
          method: "DELETE",
        });
      }
      fetchData();
    } catch (err) {
      alert("Error al eliminar.");
    }
  };

  // GRID CALENDARIO
  const calendarGrid = useMemo(() => {
    const firstDayOfMonth = new Date(calYear, calMonth, 1);
    const lastDayOfMonth = new Date(calYear, calMonth + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();

    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const todayStr = new Date().toISOString().split("T")[0];

    const cells = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      cells.push({ type: "EMPTY", key: `empty-${i}` });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const monthStr = String(calMonth + 1).padStart(2, "0");
      const dayStr = String(day).padStart(2, "0");
      const dateKey = `${calYear}-${monthStr}-${dayStr}`;

      const realLogs = produccionLogs.filter(
        (l) =>
          l.fecha === dateKey &&
          (!currentPlan || l.codigo_ot === currentPlan.codigo_ot),
      );

      const projectedOTs = currentPlan
        ? currentPlan.items.filter((i) => i.fecha_inicio === dateKey)
        : [];

      cells.push({
        type: "DAY",
        key: dateKey,
        dayNumber: dayStr,
        dateKey,
        isToday: dateKey === todayStr,
        isFuture: dateKey >= todayStr,
        realLogs,
        projectedOTs,
      });
    }

    const rowCount = Math.ceil(cells.length / 7);
    return { cells, rowCount };
  }, [calMonth, calYear, produccionLogs, currentPlan]);

  const nombreMes = useMemo(() => {
    const nombres = [
      "ENERO",
      "FEBRERO",
      "MARZO",
      "ABRIL",
      "MAYO",
      "JUNIO",
      "JULIO",
      "AGOSTO",
      "SEPTIEMBRE",
      "OCTUBRE",
      "NOVIEMBRE",
      "DICIEMBRE",
    ];
    return nombres[calMonth];
  }, [calMonth]);

  // PAGINACIÓN
  const totalPages =
    Math.ceil(filteredPlanGroupedItems.length / itemsPerPage) || 1;
  const paginatedPlanGroupedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredPlanGroupedItems.slice(start, start + itemsPerPage);
  }, [filteredPlanGroupedItems, currentPage, itemsPerPage]);

  const emptySlotsCount = Math.max(
    0,
    itemsPerPage - paginatedPlanGroupedItems.length,
  );

  return (
    <div className="h-full flex flex-col font-sans text-slate-200 select-none space-y-3 min-h-0 bg-[#070a12] p-2.5 sm:p-4 overflow-hidden relative rounded-2xl border border-slate-800/80 shadow-2xl backdrop-blur-2xl">
      {/* 1. BARRA SUPERIOR UNIFICADA DE ACCIONES Y FECHAS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pb-3 border-b border-slate-800/80 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)] shrink-0">
            <ClipboardEdit size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-xs sm:text-sm text-white tracking-widest uppercase font-mono">
                PLANIFICACIÓN DE PLANTA
              </h2>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />{" "}
                PROGRAMACIÓN
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 hidden sm:block">
              Gestión simplificada de lotes, ritmo de producción y asignación en
              calendario.
            </p>
          </div>
        </div>

        {/* ACCIONES GLOBALES */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 shrink-0">
          <button
            onClick={() => setIsHistorialMode(!isHistorialMode)}
            className={`px-3 py-1.5 border text-xs font-bold font-mono transition-all rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              isHistorialMode
                ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
                : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:border-slate-600"
            }`}
          >
            <History size={14} />
            <span>
              {isHistorialMode ? "VER PLANES ABIERTOS" : "HISTORIAL CERRADOS"}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab("TABLA");
              setTableMode(tableMode === "ITEMS" ? "MRP" : "ITEMS");
            }}
            className={`px-3 py-1.5 border text-xs font-bold font-mono transition-all rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              tableMode === "MRP" && activeMainTab === "TABLA"
                ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                : "bg-slate-900 border-slate-700 text-cyan-400 hover:border-cyan-500/50"
            }`}
          >
            <Scale size={14} />
            <span>
              {tableMode === "MRP" && activeMainTab === "TABLA"
                ? "VER PRODUCTOS"
                : "MRP INSUMOS"}
            </span>
          </button>

          <button
            onClick={() => {
              setNewPlanForm({
                codigo_ot: `PLAN-${Math.floor(100 + Math.random() * 900)}`,
                destino: "Stock General",
              });
              setIsNewPlanModalOpen(true);
            }}
            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer shrink-0 font-mono"
          >
            <Plus size={15} /> NUEVO PLAN
          </button>
        </div>
      </div>

      {/* 2. PANEL COMPACTO DE CONTROL DE PLAN ACTIVO */}
      <div className="bg-[#0e1422] border border-slate-800/80 p-2.5 rounded-2xl space-y-2 shrink-0 shadow-inner">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* SELECTOR DE PLAN */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xs font-bold text-slate-400 shrink-0 flex items-center gap-1 font-mono">
              {isHistorialMode ? (
                <Lock size={14} className="text-rose-400" />
              ) : (
                <Unlock size={14} className="text-emerald-400" />
              )}
              PLAN:
            </span>

            <select
              value={selectedPlanCode}
              onChange={(e) => setSelectedPlanCode(e.target.value)}
              className="bg-[#070a12] border border-slate-800 text-white font-bold px-3 py-1.5 focus:outline-none focus:border-amber-500/50 text-xs rounded-xl flex-1 font-mono truncate cursor-pointer"
            >
              {availablePlansList.length === 0 ? (
                <option value="">-- NO HAY PLANES DISPONIBLES --</option>
              ) : (
                availablePlansList.map((p) => {
                  const uniqueProducts = new Set(
                    p.items.map((i) => i.semielaborado_codigo),
                  ).size;
                  return (
                    <option
                      key={p.codigo_ot}
                      value={p.codigo_ot}
                      className="bg-slate-900 text-white"
                    >
                      [{p.codigo_ot}] ({uniqueProducts} productos) - {p.destino}
                    </option>
                  );
                })
              )}
            </select>
          </div>

          {/* TOGGLE TABLA / CALENDARIO */}
          <div className="flex items-center gap-1 bg-[#070a12] p-1 border border-slate-800 rounded-xl shrink-0 font-mono">
            <button
              onClick={() => {
                setActiveTab("TABLA");
                setIsDrawerOpen(false);
              }}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeMainTab === "TABLA"
                  ? "bg-[#131c2d] text-emerald-300 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <List size={13} /> TABLA
            </button>
            <button
              onClick={() => setActiveTab("CALENDARIO")}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeMainTab === "CALENDARIO"
                  ? "bg-[#131c2d] text-emerald-300 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <CalendarIcon size={13} /> CALENDARIO
            </button>
          </div>

          {/* ACCIONES DEL PLAN SELECCIONADO */}
          {currentPlan && (
            <div className="flex items-center gap-2 shrink-0 font-mono">
              {currentPlan.estado === "ABIERTO" && (
                <button
                  onClick={() => {
                    setAddItemForm({
                      semielaborado_codigo: "",
                      articulo: "",
                      cant_objetivo: 500,
                      velocidad_u_hora: 50,
                    });
                    setIsAddItemModalOpen(true);
                  }}
                  className="px-3 py-1.5 bg-[#131c2d] hover:bg-[#1a263c] border border-cyan-500/30 text-cyan-400 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={14} /> AGREGAR PRODUCTO
                </button>
              )}

              <button
                onClick={handleTogglePlanEstado}
                className={`px-3 py-1.5 border text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                  currentPlan.estado === "CERRADO"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                }`}
              >
                {currentPlan.estado === "CERRADO" ? (
                  <Unlock size={13} />
                ) : (
                  <Lock size={13} />
                )}
                <span>
                  {currentPlan.estado === "CERRADO" ? "REABRIR" : "CERRAR PLAN"}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* MÉTRICAS DEL PLAN SELECCIONADO */}
        {currentPlan && (
          <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between text-xs gap-2 font-mono">
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-slate-400">
                DESTINO:{" "}
                <strong className="text-white font-bold">
                  {currentPlan.destino}
                </strong>
              </span>
              <span className="text-slate-400">
                AVANCE:{" "}
                <strong className="text-emerald-400 font-bold">
                  {currentPlanStats.totalProd} / {currentPlanStats.totalObj} u.
                  ({currentPlanStats.avance}%)
                </strong>
              </span>
            </div>

            <div className="w-full sm:w-48 bg-[#070a12] h-2 rounded-full overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full transition-all duration-300"
                style={{ width: `${Math.min(100, currentPlanStats.avance)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. VISTA PRINCIPAL (TABLA / CALENDARIO) */}
      <div className="flex-1 bg-[#0e1422] border border-slate-800/80 p-2.5 flex flex-col min-h-0 shadow-lg relative rounded-2xl">
        {activeMainTab === "TABLA" ? (
          <div
            ref={tableContainerRef}
            className="flex-1 bg-[#070a12] border border-slate-800 min-h-0 flex flex-col overflow-hidden rounded-xl"
          >
            {tableMode === "ITEMS" ? (
              <div className="overflow-x-auto h-full">
                <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-800 text-[10px] uppercase font-mono bg-[#0f172a] sticky top-0 z-10 h-[36px]">
                      <th className="p-2.5 font-bold">CÓDIGO</th>
                      <th className="p-2.5 font-bold">
                        SEMIELABORADO / ARTÍCULO
                      </th>
                      <th className="p-2.5 font-bold text-center">
                        PROGRAMACIÓN
                      </th>
                      <th className="p-2.5 font-bold text-right">PRODUCCIÓN</th>
                      <th className="p-2.5 font-bold text-right">
                        RITMO (U/H)
                      </th>
                      <th className="p-2.5 font-bold text-center">ACCIONES</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-800/50 bg-[#070a12] font-sans">
                    {loading ? (
                      <tr>
                        <td
                          colSpan="6"
                          className="py-12 text-center text-xs font-mono text-amber-400 animate-pulse"
                        >
                          Cargando datos de producción...
                        </td>
                      </tr>
                    ) : !currentPlan ||
                      filteredPlanGroupedItems.length === 0 ? (
                      <tr>
                        <td
                          colSpan="6"
                          className="py-12 text-center text-xs font-mono text-slate-500"
                        >
                          {currentPlan
                            ? "No hay productos en este plan. Hacé clic en 'AGREGAR PRODUCTO'."
                            : "Seleccioná un plan para ver sus productos."}
                        </td>
                      </tr>
                    ) : (
                      <>
                        {paginatedPlanGroupedItems.map((groupItem) => {
                          const avance =
                            groupItem.cant_objetivo_plan > 0
                              ? Math.round(
                                  (groupItem.cant_producida_total /
                                    groupItem.cant_objetivo_plan) *
                                    100,
                                )
                              : 0;

                          return (
                            <tr
                              key={groupItem.semielaborado_codigo}
                              className="h-[40px] hover:bg-[#121824] transition-colors align-middle"
                            >
                              <td className="p-2.5 font-mono font-bold text-amber-400 whitespace-nowrap">
                                [{groupItem.semielaborado_codigo}]
                              </td>

                              <td className="p-2.5 text-white font-medium truncate">
                                {groupItem.articulo}
                              </td>

                              <td className="p-2.5 text-center whitespace-nowrap font-mono">
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                    groupItem.diasCount > 0
                                      ? "text-cyan-400 bg-cyan-500/10 border-cyan-500/30"
                                      : "text-slate-400 bg-slate-900 border-slate-800"
                                  }`}
                                >
                                  {groupItem.fechaTexto}
                                </span>
                              </td>

                              <td className="p-2.5 text-right whitespace-nowrap font-mono">
                                <span className="font-bold text-emerald-400">
                                  {groupItem.cant_producida_total} /{" "}
                                  {groupItem.cant_objetivo_plan} u. ({avance}%)
                                </span>
                              </td>

                              <td
                                onClick={() => {
                                  if (
                                    currentPlan.estado === "ABIERTO" &&
                                    groupItem.rawItems[0]
                                  ) {
                                    setEditingRitmoItem(groupItem.rawItems[0]);
                                    setNewRitmoVal(
                                      groupItem.velocidad_u_hora || 50,
                                    );
                                  }
                                }}
                                className="p-2.5 text-right font-bold text-cyan-400 whitespace-nowrap cursor-pointer hover:underline font-mono"
                                title="Cambiar ritmo u/h"
                              >
                                <span className="inline-flex items-center gap-1">
                                  <Zap size={11} />{" "}
                                  {groupItem.velocidad_u_hora || 50} u/h
                                </span>
                              </td>

                              <td className="p-2.5 text-center whitespace-nowrap">
                                {currentPlan.estado === "ABIERTO" ? (
                                  <button
                                    onClick={() =>
                                      handleDeleteGroupFromPlan(groupItem)
                                    }
                                    className="p-1.5 bg-[#090d16] border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition-colors rounded-lg cursor-pointer"
                                    title="Eliminar producto del plan"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                ) : (
                                  <span className="text-slate-500 text-[10px] font-mono">
                                    🔒 CERRADO
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              /* TABLA VISTA MRP INSUMOS */
              <div className="overflow-x-auto h-full">
                <table className="w-full text-left text-xs border-collapse min-w-[650px]">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-800 text-[10px] uppercase font-mono bg-[#0f172a] sticky top-0 z-10 h-[36px]">
                      <th className="p-2.5 font-bold">
                        MATERIA PRIMA / INSUMO
                      </th>
                      <th className="p-2.5 font-bold text-right">REQUERIDO</th>
                      <th className="p-2.5 font-bold text-right">
                        STOCK DISPONIBLE
                      </th>
                      <th className="p-2.5 font-bold text-center">
                        ESTADO / BALANCE
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-800/50 bg-[#070a12] font-mono">
                    {mrpCalculatedData.length === 0 ? (
                      <tr>
                        <td
                          colSpan="4"
                          className="py-12 text-center text-xs text-slate-500"
                        >
                          No hay fórmulas ni recetas asociadas a los productos
                          de este plan.
                        </td>
                      </tr>
                    ) : (
                      mrpCalculatedData.map((item, idx) => (
                        <tr
                          key={idx}
                          className="h-[40px] hover:bg-[#121824] transition-colors align-middle"
                        >
                          <td className="p-2.5 font-bold text-white truncate">
                            [{item.codigo}] {item.nombre}
                          </td>
                          <td className="p-2.5 text-right font-bold text-amber-400 whitespace-nowrap">
                            {item.requeridoKg.toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}{" "}
                            {item.unidad}
                          </td>
                          <td className="p-2.5 text-right font-bold text-emerald-400 whitespace-nowrap">
                            {item.stockActual.toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}{" "}
                            {item.unidad}
                          </td>
                          <td className="p-2.5 text-center whitespace-nowrap font-mono">
                            {item.esDeficit ? (
                              <span className="inline-block px-2.5 py-0.5 border border-rose-500/40 bg-rose-500/10 text-rose-400 font-bold rounded-full text-[10px]">
                                FALTANTE (
                                {Math.abs(item.diferencia).toLocaleString(
                                  undefined,
                                  { maximumFractionDigits: 2 },
                                )}{" "}
                                {item.unidad})
                              </span>
                            ) : (
                              <span className="inline-block px-2.5 py-0.5 border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-bold rounded-full text-[10px]">
                                OK (+
                                {item.diferencia.toLocaleString(undefined, {
                                  maximumFractionDigits: 2,
                                })}{" "}
                                {item.unidad})
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* VISTA CALENDARIO CON PANEL LATERAL FLOTANTE DE PRODUCTOS PADRE */
          <div className="flex-1 bg-[#070a12] border border-slate-800 p-2.5 rounded-xl flex flex-col min-h-0 relative">
            <div className="flex justify-between items-center bg-[#0f172a] border border-slate-800 p-1.5 rounded-xl mb-2 shrink-0">
              <button
                onClick={() => {
                  if (calMonth === 0) {
                    setCalMonth(11);
                    setCalYear(calYear - 1);
                  } else setCalMonth(calMonth - 1);
                }}
                className="p-1 bg-[#070a12] border border-slate-800 text-cyan-400 hover:text-white rounded-lg cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>

              <span className="text-white font-bold tracking-wider text-xs font-mono">
                {nombreMes} {calYear}
              </span>

              <button
                onClick={() => {
                  if (calMonth === 11) {
                    setCalMonth(0);
                    setCalYear(calYear + 1);
                  } else setCalMonth(calMonth + 1);
                }}
                className="p-1 bg-[#070a12] border border-slate-800 text-cyan-400 hover:text-white rounded-lg cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] text-slate-400 mb-1 shrink-0 font-bold">
              {["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>

            <div
              className="flex-1 grid grid-cols-7 gap-1 min-h-0 overflow-y-auto"
              style={{
                gridTemplateRows: `repeat(${calendarGrid.rowCount}, minmax(0, 1fr))`,
              }}
            >
              {calendarGrid.cells.map((cell) => {
                if (cell.type === "EMPTY")
                  return <div key={cell.key} className="bg-transparent" />;

                const hasRealLogs = cell.realLogs && cell.realLogs.length > 0;
                const hasProjected =
                  cell.projectedOTs && cell.projectedOTs.length > 0;

                const isHovered = hoveredDateKey === cell.dateKey;
                const isPinned = pinnedDateKey === cell.dateKey;
                const showInspectionBox =
                  (isHovered || isPinned) && (hasRealLogs || hasProjected);

                return (
                  <div
                    key={cell.key}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDropOnDay(cell.dateKey)}
                    onMouseEnter={() => handleCellMouseEnter(cell.dateKey)}
                    onMouseLeave={() => handleCellMouseLeave(cell.dateKey)}
                    className={`p-1 border flex flex-col justify-between relative rounded-xl transition-all cursor-pointer ${
                      cell.isToday
                        ? "border-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                        : hasProjected
                          ? "border-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20"
                          : "border-slate-800/80 bg-[#0e1422]/50 hover:bg-[#121824]"
                    }`}
                  >
                    <div className="flex justify-between items-center text-[9px] border-b border-slate-800/40 pb-0.5 font-mono">
                      <span
                        className={
                          cell.isToday
                            ? "text-amber-400 font-bold"
                            : "text-slate-400"
                        }
                      >
                        {cell.dayNumber}
                      </span>
                      {cell.isToday && (
                        <span className="text-[8px] bg-amber-400 text-slate-950 px-1 font-bold rounded">
                          HOY
                        </span>
                      )}
                    </div>

                    <div className="space-y-0.5 overflow-hidden flex-1 mt-1 font-mono">
                      {hasProjected &&
                        cell.projectedOTs.map((otItem) => (
                          <div
                            key={otItem.id}
                            draggable={currentPlan?.estado === "ABIERTO"}
                            onDragStart={(e) => {
                              e.stopPropagation();
                              setDraggedOTItem(otItem);
                              setDraggedParentSE(null);
                            }}
                            className="text-[9px] bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 px-1 py-0.5 truncate font-bold rounded cursor-grab active:cursor-grabbing flex justify-between items-center"
                          >
                            <span className="truncate">
                              [{otItem.semielaborado_codigo}]
                            </span>
                            <span className="text-amber-400 shrink-0 ml-1">
                              {otItem.cant_objetivo}u
                            </span>
                          </div>
                        ))}

                      {hasRealLogs && (
                        <div className="text-[9px] bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 px-1 truncate font-bold rounded">
                          {cell.realLogs.length} Reales
                        </div>
                      )}
                    </div>

                    {/* INSPECCIÓN AL PASAR O HACER HOVER/PIN */}
                    {showInspectionBox && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-0 left-0 z-50 w-60 bg-[#0e1422] border-2 border-amber-400 p-2.5 shadow-2xl space-y-2 font-mono text-[10px] rounded-xl"
                      >
                        <div className="flex justify-between items-center border-b border-slate-800 pb-1 font-bold text-amber-400">
                          <span>INSPECCIÓN {cell.dateKey}</span>
                          {isPinned && (
                            <button
                              onClick={() => {
                                setPinnedDateKey(null);
                                setHoveredDateKey(null);
                              }}
                              className="text-slate-400 hover:text-white p-0.5"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>

                        {cell.projectedOTs.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-cyan-400 font-bold block">
                              PROGRAMADO:
                            </span>
                            {cell.projectedOTs.map((ot) => (
                              <div
                                key={ot.id}
                                className="bg-[#070a12] p-1.5 border border-slate-800 text-white flex justify-between items-center rounded-lg"
                              >
                                <div className="truncate pr-1">
                                  <span className="text-amber-400 font-bold">
                                    [{ot.semielaborado_codigo}]
                                  </span>{" "}
                                  <span className="truncate">
                                    {ot.articulo}
                                  </span>
                                  <div className="text-[9px] text-slate-400">
                                    Obj: {ot.cant_objetivo} u.
                                  </div>
                                </div>
                                {isPinned &&
                                  currentPlan?.estado === "ABIERTO" && (
                                    <button
                                      onClick={(e) =>
                                        handleUnassignDateFromOT(ot, e)
                                      }
                                      className="p-1 bg-[#0e1422] text-rose-400 hover:bg-rose-500 hover:text-white transition-colors rounded shrink-0"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PAGINACIÓN DE TABLA */}
        {activeMainTab === "TABLA" && tableMode === "ITEMS" && (
          <div className="flex flex-col sm:flex-row items-center justify-between pt-2 mt-2 border-t border-slate-800 shrink-0 text-xs font-mono text-slate-400 gap-2">
            <span>
              Página <strong className="text-white">{currentPage}</strong> de{" "}
              <strong className="text-white">{totalPages}</strong>
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="p-1 bg-[#090d16] border border-slate-800 text-white disabled:opacity-30 rounded-lg cursor-pointer"
              >
                <ChevronsLeft size={13} />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 bg-[#090d16] border border-slate-800 text-white disabled:opacity-30 rounded-lg cursor-pointer text-xs"
              >
                ANT
              </button>
              <span className="px-2.5 py-0.5 bg-[#070a12] border border-slate-800 text-amber-400 font-bold text-xs rounded-lg">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 bg-[#090d16] border border-slate-800 text-white disabled:opacity-30 rounded-lg cursor-pointer text-xs"
              >
                SIG
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1 bg-[#090d16] border border-slate-800 text-white disabled:opacity-30 rounded-lg cursor-pointer"
              >
                <ChevronsRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* DRAWER FLOTANTE DE PRODUCTOS PADRE (EN MODO CALENDARIO) */}
      {activeMainTab === "CALENDARIO" && currentPlan && (
        <div
          className={`fixed top-0 right-0 h-screen w-80 bg-[#0e1422] border-l-2 border-amber-400 shadow-2xl z-[9999] p-4 flex flex-col space-y-3 font-mono text-xs transition-transform duration-300 ease-in-out ${
            isDrawerOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <button
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className="absolute top-1/2 -translate-y-1/2 -left-8 bg-amber-400 text-slate-950 font-bold py-3 px-1 border-l-2 border-y-2 border-amber-400 rounded-l-lg flex flex-col items-center gap-2 cursor-pointer shadow-lg"
            title="Desplegar catálogo de productos"
          >
            {isDrawerOpen ? (
              <ChevronRight size={16} />
            ) : (
              <ChevronLeft size={16} />
            )}
            <Package size={14} />
          </button>

          <div className="flex justify-between items-center border-b border-slate-800 pb-2.5 shrink-0">
            <span className="text-amber-400 font-bold flex items-center gap-1.5 text-xs">
              <Package size={15} className="text-cyan-400" /> PRODUCTOS DEL PLAN
            </span>
            <button
              onClick={() => setIsDrawerOpen(false)}
              className="text-slate-400 hover:text-white p-1 cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>

          <div className="relative shrink-0">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Filtrar por código..."
              value={drawerSearchText}
              onChange={(e) => setDrawerSearchText(e.target.value)}
              className="w-full bg-[#070a12] border border-slate-800 text-xs text-white pl-8 pr-3 py-1.5 focus:outline-none focus:border-amber-500/50 rounded-lg"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
            {drawerParentItems.map((parentItem, idx) => (
              <div
                key={idx}
                draggable={
                  currentPlan.estado === "ABIERTO" &&
                  parentItem.cant_disponible > 0
                }
                onDragStart={() => {
                  setDraggedParentSE(parentItem);
                  setDraggedOTItem(null);
                }}
                className={`p-2.5 bg-[#070a12] border rounded-xl transition-all flex flex-col space-y-1 ${
                  parentItem.cant_disponible > 0
                    ? "border-slate-800 hover:border-amber-400 cursor-grab active:cursor-grabbing"
                    : "border-slate-800/40 opacity-50 cursor-not-allowed"
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-amber-400 font-bold">
                    [{parentItem.semielaborado_codigo}]
                  </span>
                  <span className="text-[10px] text-cyan-400 font-bold">
                    ⚡ {parentItem.velocidad_u_hora || 50} u/h
                  </span>
                </div>
                <span className="text-white font-medium text-xs truncate">
                  {parentItem.articulo}
                </span>
                <div className="flex justify-between items-center text-[10px] pt-1 border-t border-slate-800/50">
                  <span className="text-slate-400">DISPONIBLE:</span>
                  <strong
                    className={
                      parentItem.cant_disponible > 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }
                  >
                    {parentItem.cant_disponible} /{" "}
                    {parentItem.cant_objetivo_plan} u.
                  </strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: CREAR PLAN VACÍO */}
      {isNewPlanModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[100] flex items-center justify-center p-3 font-mono">
          <div className="bg-[#0e1422] border-2 border-amber-400 w-full max-w-md p-5 rounded-2xl shadow-2xl space-y-4 relative">
            <button
              onClick={() => setIsNewPlanModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b border-slate-800 pb-3">
              <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 border border-amber-500/30 rounded-full">
                PROGRAMACIÓN
              </span>
              <h3 className="text-base text-white font-bold mt-1.5 flex items-center gap-2">
                <Anvil size={18} className="text-cyan-400" /> CREAR PLAN DE
                TRABAJO
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">
                  CÓDIGO / NOMBRE DEL PLAN (OT):
                </label>
                <input
                  type="text"
                  placeholder="Ej: PLAN-701"
                  value={newPlanForm.codigo_ot}
                  onChange={(e) =>
                    setNewPlanForm({
                      ...newPlanForm,
                      codigo_ot: e.target.value,
                    })
                  }
                  className="w-full bg-[#070a12] border border-slate-800 p-2 text-white font-bold focus:outline-none focus:border-amber-500/50 rounded-xl uppercase"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">
                  DESTINO / CLIENTE:
                </label>
                <input
                  type="text"
                  placeholder="Ej: Stock General"
                  value={newPlanForm.destino}
                  onChange={(e) =>
                    setNewPlanForm({ ...newPlanForm, destino: e.target.value })
                  }
                  className="w-full bg-[#070a12] border border-slate-800 p-2 text-white font-bold focus:outline-none focus:border-amber-500/50 rounded-xl"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setIsNewPlanModalOpen(false)}
                className="px-4 py-1.5 border border-slate-800 text-slate-400 hover:text-white text-xs rounded-xl cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                onClick={handleCreateEmptyPlan}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 size={14} /> GENERAR PLAN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: AGREGAR PRODUCTO AL PLAN */}
      {isAddItemModalOpen && currentPlan && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[100] flex items-center justify-center p-3 font-mono">
          <div className="bg-[#0e1422] border-2 border-cyan-400 w-full max-w-lg p-5 rounded-2xl shadow-2xl space-y-4 relative">
            <button
              onClick={() => setIsAddItemModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b border-slate-800 pb-3">
              <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 border border-cyan-500/30 rounded-full">
                PLAN: [{currentPlan.codigo_ot}]
              </span>
              <h3 className="text-base text-white font-bold mt-1.5 flex items-center gap-2">
                <Plus size={18} className="text-cyan-400" /> INCORPORAR PRODUCTO
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">
                  SELECCIONAR PRODUCTO:
                </label>
                <select
                  value={addItemForm.semielaborado_codigo}
                  onChange={(e) => {
                    const se = semielaboradosDB.find(
                      (s) => s.codigo === e.target.value,
                    );
                    if (se) {
                      setAddItemForm({
                        ...addItemForm,
                        semielaborado_codigo: se.codigo,
                        articulo: se.nombre,
                        velocidad_u_hora: se.velocidad_u_hora || 50,
                      });
                    }
                  }}
                  className="w-full bg-[#070a12] border border-slate-800 p-2 text-white font-bold focus:outline-none focus:border-cyan-500/50 rounded-xl cursor-pointer"
                >
                  <option value="" className="bg-slate-900 text-white">
                    -- SELECCIONAR SEMIELABORADO --
                  </option>
                  {semielaboradosDB.map((s) => (
                    <option
                      key={s.id}
                      value={s.codigo}
                      className="bg-slate-900 text-white"
                    >
                      [{s.codigo}] {s.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-[#070a12] p-3 border border-slate-800 rounded-xl">
                <div>
                  <label className="text-slate-400 text-[10px] block mb-1">
                    CANTIDAD OBJETIVO:
                  </label>
                  <input
                    type="number"
                    value={addItemForm.cant_objetivo}
                    onChange={(e) =>
                      setAddItemForm({
                        ...addItemForm,
                        cant_objetivo: Math.max(
                          1,
                          parseInt(e.target.value) || 0,
                        ),
                      })
                    }
                    className="w-full bg-[#0e1422] border border-slate-800 p-2 text-emerald-400 font-bold text-right focus:outline-none rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label className="text-slate-400 text-[10px] block mb-1">
                    RITMO (U/HORA):
                  </label>
                  <input
                    type="number"
                    value={addItemForm.velocidad_u_hora}
                    onChange={(e) =>
                      setAddItemForm({
                        ...addItemForm,
                        velocidad_u_hora: Math.max(
                          1,
                          parseInt(e.target.value) || 0,
                        ),
                      })
                    }
                    className="w-full bg-[#0e1422] border border-slate-800 p-2 text-cyan-400 font-bold text-right focus:outline-none rounded-xl text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setIsAddItemModalOpen(false)}
                className="px-4 py-1.5 border border-slate-800 text-slate-400 hover:text-white text-xs rounded-xl cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                onClick={handleAddItemToCurrentPlan}
                className="px-4 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 size={14} /> AGREGAR A PLAN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: EDITAR RITMO U/H */}
      {editingRitmoItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[100] flex items-center justify-center p-3 font-mono">
          <div className="bg-[#0e1422] border-2 border-cyan-400 w-full max-w-xs p-4 rounded-2xl shadow-2xl space-y-3 relative">
            <button
              onClick={() => setEditingRitmoItem(null)}
              className="absolute top-3 right-3 text-slate-400 hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b border-slate-800 pb-2">
              <span className="text-[10px] text-cyan-400 font-bold">
                AJUSTAR VELOCIDAD
              </span>
              <h3 className="text-white font-bold text-xs mt-0.5">
                [{editingRitmoItem.semielaborado_codigo}]
              </h3>
            </div>

            <div className="space-y-1 text-xs">
              <label className="text-slate-400 text-[10px] block">
                RITMO (UNIDADES / HORA):
              </label>
              <input
                type="number"
                value={newRitmoVal}
                onChange={(e) => setNewRitmoVal(e.target.value)}
                className="w-full bg-[#070a12] border border-cyan-400 p-2 text-cyan-400 font-bold text-right focus:outline-none text-base rounded-xl"
                autoFocus
              />
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setEditingRitmoItem(null)}
                className="px-3 py-1 border border-slate-800 text-slate-400 text-xs rounded-xl cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveRitmo}
                className="px-3 py-1 bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 rounded-xl cursor-pointer"
              >
                GUARDAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CONFIRMACIÓN DE DOSIFICACIÓN EN CALENDARIO */}
      {dropModalData && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[120] flex items-center justify-center p-3 font-mono">
          <div className="bg-[#0e1422] border-2 border-amber-400 w-full max-w-sm p-4 rounded-2xl shadow-2xl space-y-3 relative">
            <button
              onClick={() => setDropModalData(null)}
              className="absolute top-3 right-3 text-slate-400 hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b border-slate-800 pb-2">
              <span className="text-[10px] text-amber-400 font-bold">
                ASIGNACIÓN A FECHA: {dropModalData.targetDate}
              </span>
              <h3 className="text-white font-bold text-xs mt-1">
                [
                {dropModalData.parentSE?.semielaborado_codigo ||
                  dropModalData.ot?.semielaborado_codigo}
                ]{" "}
                {dropModalData.parentSE?.articulo || dropModalData.ot?.articulo}
              </h3>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="text-slate-400 text-[10px] block">
                CANTIDAD PARA ESTA FECHA:
              </label>
              <input
                type="number"
                value={dropModalData.cantidad}
                onChange={(e) =>
                  setDropModalData({
                    ...dropModalData,
                    cantidad: e.target.value,
                  })
                }
                className="w-full bg-[#070a12] border-2 border-amber-400 p-2 text-emerald-400 font-bold text-right focus:outline-none text-base rounded-xl"
                autoFocus
              />
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setDropModalData(null)}
                className="px-3 py-1 border border-slate-800 text-slate-400 text-xs rounded-xl cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                onClick={handleConfirmDropQty}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl cursor-pointer"
              >
                GUARDAR Y ASIGNAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
