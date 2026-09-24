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

  // ESTADOS DE HOVER E INSPECCIÓN FIJA (INMEDIATO + TIMER 2s)
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

  // CREAR PLAN VACÍO
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

  // INCORPORAR PRODUCTO AL PLAN
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

  // EDITAR RITMO U/H
  const handleSaveRitmo = async () => {
    if (!editingRitmoItem) return;
    const ritmoNum = parseInt(newRitmoVal, 10);
    if (isNaN(ritmoNum) || ritmoNum <= 0)
      return alert("Ingresá un ritmo válido.");

    try {
      const res = await fetch(
        `/api/ordenes-trabajo/${editingRitmoItem.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...editingRitmoItem,
            velocidad_u_hora: ritmoNum,
          }),
        },
      );

      if (res.ok) {
        setEditingRitmoItem(null);
        fetchData();
      }
    } catch (err) {
      alert("Error al actualizar velocidad.");
    }
  };

  // MANEJO DE DROP EN CALENDARIO
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

  // VALIDACIÓN Y CONFIRMACIÓN DE CANTIDAD
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
        const res = await fetch(
          `/api/ordenes-trabajo/${dropModalData.ot.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...dropModalData.ot,
              fecha_inicio: dropModalData.targetDate,
              cant_objetivo: cantIngresada,
            }),
          },
        );

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

  // DESASIGNAR / ELIMINAR FECHA DESDE EL CALENDARIO
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
        const res = await fetch(
          `/api/ordenes-trabajo/${otItem.id}`,
          {
            method: "DELETE",
          },
        );
        if (res.ok) fetchData();
      } else {
        const res = await fetch(
          `/api/ordenes-trabajo/${otItem.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...otItem, fecha_inicio: "" }),
          },
        );
        if (res.ok) fetchData();
      }
    } catch (err) {
      console.error("Error al desasignar fecha:", err);
    }
  };

  // ESTADO PLAN (CERRAR / REABRIR)
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

  // ELIMINAR TODO EL GRUPO DE UN SEMIELABORADO DEL PLAN
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

  // PAGINACIÓN DE ÍTEMS AGRUPADOS
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
    <div className="h-full flex flex-col font-mono text-[#e1d7f5] select-none space-y-2 sm:space-y-2.5 min-h-0 bg-[#1a0f2e] p-1 overflow-hidden relative">
      {/* 1. HEADER */}
      <div className="flex flex-row items-center justify-between pb-2 border-b-2 border-[#432874] gap-2 shrink-0">
        <div>
          <h2 className="font-pixel text-sm sm:text-base text-[#ffbe00] font-bold flex items-center gap-2 tracking-wide drop-shadow-[1px_1px_0px_#000]">
            <ClipboardEdit size={16} className="text-[#38bdf8] shrink-0" />{" "}
            PLANIFICACIÓN DE PLANTA
          </h2>
          <p className="text-[10px] text-[#a594c9] font-mono hidden sm:block">
            Control simplificado de planes de producción y asignación de ritmo
            de fabricación.
          </p>
        </div>

        <div className="flex items-center gap-1.5 font-pixel text-xs">
          <button
            onClick={() => setIsHistorialMode(!isHistorialMode)}
            className={`px-3 py-1.5 border-2 font-bold transition-all shadow-[2px_2px_0px_#000] rounded-xs flex items-center gap-1.5 ${
              isHistorialMode
                ? "bg-[#8a72a8] border-[#432874] text-white"
                : "bg-[#2c1a4d] border-[#432874] text-[#a594c9] hover:text-white"
            }`}
          >
            <History size={14} />
            <span>
              {isHistorialMode ? "VER ABIERTOS" : "HISTORIAL CERRADOS"}
            </span>
          </button>

          {/* BOTÓN MRP INSUMOS: FUERZA CAMBIO A TABLA Y MUESTRA LA EXPLOSIÓN */}
          <button
            onClick={() => {
              setActiveTab("TABLA");
              setTableMode(tableMode === "ITEMS" ? "MRP" : "ITEMS");
            }}
            className={`px-3 py-1.5 border-2 font-bold transition-all shadow-[2px_2px_0px_#000] rounded-xs flex items-center gap-1.5 ${
              tableMode === "MRP" && activeMainTab === "TABLA"
                ? "bg-[#38bdf8] border-[#0284c7] text-[#2c1a4d]"
                : "bg-[#2c1a4d] border-[#38bdf8] text-[#38bdf8] hover:bg-[#38bdf8] hover:text-[#2c1a4d]"
            }`}
          >
            <Scale size={14} />
            <span>
              {tableMode === "MRP" && activeMainTab === "TABLA"
                ? "VOLVER A PRODUCTOS"
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
            className="px-3 py-1.5 bg-[#ffbe00] border-2 border-[#b38600] text-[#2c1a4d] font-bold hover:bg-[#ffe066] shadow-[2px_2px_0px_#000] active:translate-y-0.5 transition-all rounded-xs flex items-center gap-1.5"
          >
            <Plus size={14} /> NUEVO PLAN OT
          </button>
        </div>
      </div>

      {/* 2. BARRA DE NAVEGACIÓN DE PLAN Y VISTAS */}
      <div className="bg-[#24173e] border-2 border-[#432874] p-2.5 space-y-2 shrink-0 rounded-xs shadow-[3px_3px_0px_#000]">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-pixel text-xs flex-1">
            <span className="text-[#a594c9] font-bold shrink-0 flex items-center gap-1">
              {isHistorialMode ? (
                <Lock size={13} className="text-[#f87171]" />
              ) : (
                <Unlock size={13} className="text-[#24cc8f]" />
              )}
              {isHistorialMode ? "PLAN CERRADO:" : "ELEGIR PLAN:"}
            </span>

            {/* SELECCIÓN DE PLAN (MUESTRA CANTIDAD DE PRODUCTOS PADRE) */}
            <select
              value={selectedPlanCode}
              onChange={(e) => setSelectedPlanCode(e.target.value)}
              className="bg-[#160c2b] border-2 border-[#432874] text-white font-bold px-3 py-1 focus:outline-none focus:border-[#ffbe00] text-xs rounded-xs flex-1 max-w-xs font-mono"
            >
              {availablePlansList.length === 0 ? (
                <option value="">-- NO HAY PLANES EN ESTA SECCIÓN --</option>
              ) : (
                availablePlansList.map((p) => {
                  const uniqueProducts = new Set(
                    p.items.map((i) => i.semielaborado_codigo),
                  ).size;
                  return (
                    <option key={p.codigo_ot} value={p.codigo_ot}>
                      [{p.codigo_ot}] ({uniqueProducts} productos)
                    </option>
                  );
                })
              )}
            </select>
          </div>

          <div className="flex items-center gap-1 bg-[#160c2b] border border-[#432874] p-1 rounded-xs shrink-0 font-pixel text-xs">
            <button
              onClick={() => {
                setActiveTab("TABLA");
                setIsDrawerOpen(false);
              }}
              className={`px-3 py-1 flex items-center gap-1 rounded-2xs font-bold ${
                activeMainTab === "TABLA"
                  ? "bg-[#ffbe00] text-[#2c1a4d]"
                  : "text-[#a594c9] hover:text-white"
              }`}
            >
              <List size={13} /> TABLA
            </button>
            <button
              onClick={() => setActiveTab("CALENDARIO")}
              className={`px-3 py-1 flex items-center gap-1 rounded-2xs font-bold ${
                activeMainTab === "CALENDARIO"
                  ? "bg-[#ffbe00] text-[#2c1a4d]"
                  : "text-[#a594c9] hover:text-white"
              }`}
            >
              <CalendarIcon size={13} /> CALENDARIO
            </button>
          </div>

          {currentPlan && (
            <div className="flex items-center gap-1.5 font-pixel text-xs shrink-0">
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
                  className="px-3 py-1 bg-[#38bdf8] text-[#2c1a4d] font-bold hover:bg-[#7dd3fc] shadow-[1px_1px_0px_#000] rounded-2xs flex items-center gap-1"
                >
                  <Plus size={13} /> AGREGAR PRODUCTO
                </button>
              )}

              <button
                onClick={handleTogglePlanEstado}
                className={`px-3 py-1 border font-bold shadow-[1px_1px_0px_#000] rounded-2xs flex items-center gap-1 ${
                  currentPlan.estado === "CERRADO"
                    ? "bg-[#24cc8f] text-[#2c1a4d] border-[#1b9a67]"
                    : "bg-[#f87171] text-[#2c1a4d] border-[#b91c1c]"
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
      </div>

      {/* 3. CONTENIDO PRINCIPAL */}
      <div className="flex-1 bg-[#24173e] border-2 border-[#432874] p-2.5 flex flex-col min-h-0 shadow-[4px_4px_0px_#000] relative rounded-xs">
        {currentPlan ? (
          <div className="bg-[#160c2b] border border-[#432874] p-2 mb-2 flex flex-wrap items-center justify-between text-xs font-pixel shrink-0 rounded-2xs">
            <div className="flex items-center gap-2">
              <span className="text-[#ffbe00] font-bold text-sm">
                [{currentPlan.codigo_ot}]
              </span>
              <span className="text-[#a594c9]">
                DESTINO:{" "}
                <strong className="text-white">{currentPlan.destino}</strong>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[#a594c9]">
                AVANCE PLAN:{" "}
                <strong className="text-[#24cc8f]">
                  {currentPlanStats.totalProd} / {currentPlanStats.totalObj} u.
                  ({currentPlanStats.avance}%)
                </strong>
              </span>
              <span
                className={`px-2 py-0.5 border text-[10px] font-bold rounded-2xs ${
                  currentPlan.estado === "CERRADO"
                    ? "bg-[#f87171]/20 border-[#f87171] text-[#f87171]"
                    : "bg-[#24cc8f]/20 border-[#24cc8f] text-[#24cc8f]"
                }`}
              >
                {currentPlan.estado === "CERRADO"
                  ? "🔒 CERRADO / HISTORIAL"
                  : "⚡ PLAN ABIERTO"}
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-[#160c2b] border border-[#432874] p-3 text-center text-xs font-pixel text-[#a594c9] mb-2 shrink-0">
            Seleccioná un plan para gestionar sus productos.
          </div>
        )}

        {/* VISTA 1: TABLA (ITEMS UNIFICADOS POR SEMIELABORADO vs MRP) */}
        {activeMainTab === "TABLA" ? (
          <div
            ref={tableContainerRef}
            className="hidden md:flex flex-1 border-2 border-[#432874] bg-[#160c2b] min-h-0 flex-col overflow-hidden rounded-xs"
          >
            {tableMode === "ITEMS" ? (
              <table className="w-full text-left text-xs border-collapse table-fixed">
                <thead>
                  <tr className="text-[#a594c9] border-b-2 border-[#432874] font-pixel text-[11px] bg-[#2c1a4d] sticky top-0 z-10 h-[36px]">
                    <th className="w-[16%] px-2.5 font-normal">CÓDIGO SE</th>
                    <th className="w-[32%] px-2.5 font-normal">
                      SEMIELABORADO / ARTÍCULO
                    </th>
                    <th className="w-[16%] px-2.5 font-normal text-center">
                      FECHA PROGRAMADA
                    </th>
                    <th className="w-[16%] px-2.5 font-normal text-right">
                      PRODUCCIÓN
                    </th>
                    <th className="w-[10%] px-2.5 font-normal text-right">
                      RITMO (U/H)
                    </th>
                    <th className="w-[10%] px-2.5 font-normal text-center">
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
                        colSpan="6"
                        className="py-16 text-center font-pixel text-xs text-[#ffbe00] animate-pulse"
                      >
                        Cargando productos del plan...
                      </td>
                    </tr>
                  ) : !currentPlan || filteredPlanGroupedItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan="6"
                        className="py-16 text-center font-pixel text-xs text-[#6e588a]"
                      >
                        {currentPlan
                          ? "Este plan está vacío. Hacé clic en 'AGREGAR PRODUCTO' para comenzar."
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
                            className="h-[38px] hover:bg-[#281747] transition-colors align-middle group"
                          >
                            <td className="px-2.5 font-pixel text-[#ffbe00] font-bold tracking-wider truncate align-middle">
                              [{groupItem.semielaborado_codigo}]
                            </td>

                            <td className="px-2.5 text-white font-bold truncate align-middle">
                              {groupItem.articulo}
                            </td>

                            <td className="px-2.5 text-center font-pixel align-middle">
                              <span
                                className={`px-2 py-0.5 rounded-2xs text-[10px] font-bold border ${
                                  groupItem.diasCount > 0
                                    ? "text-[#38bdf8] bg-[#38bdf8]/10 border-[#38bdf8]/30"
                                    : "text-[#a594c9] bg-[#24173e] border-[#432874]"
                                }`}
                              >
                                {groupItem.fechaTexto}
                              </span>
                            </td>

                            <td className="px-2.5 text-right font-pixel truncate align-middle">
                              <span className="font-bold text-[#24cc8f]">
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
                              className="px-2.5 text-right font-pixel text-[#38bdf8] font-bold align-middle cursor-pointer hover:underline"
                              title="Hacé clic para cambiar ritmo u/h"
                            >
                              <span className="inline-flex items-center gap-1">
                                <Zap size={11} />{" "}
                                {groupItem.velocidad_u_hora || 50} u/h{" "}
                                <Edit2
                                  size={10}
                                  className="opacity-0 group-hover:opacity-100"
                                />
                              </span>
                            </td>

                            <td className="px-2.5 text-center align-middle">
                              {currentPlan.estado === "ABIERTO" ? (
                                <button
                                  onClick={() =>
                                    handleDeleteGroupFromPlan(groupItem)
                                  }
                                  className="p-1 bg-[#2c1a4d] border border-[#432874] text-[#a594c9] hover:text-[#f87171] hover:border-[#f87171] transition-all shadow-[1px_1px_0px_#000] rounded-2xs"
                                  title="Eliminar este semielaborado del plan"
                                >
                                  <Trash2 size={12} />
                                </button>
                              ) : (
                                <span className="text-[#6e588a] text-[10px] font-pixel">
                                  🔒 CERRADO
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {Array.from({ length: emptySlotsCount }).map((_, idx) => (
                        <tr
                          key={`empty-${idx}`}
                          className="h-[38px] opacity-15 pointer-events-none"
                        >
                          <td className="px-2.5 text-[#432874] font-pixel text-[10px]">
                            --
                          </td>
                          <td className="px-2.5 text-[#432874] font-pixel text-[10px]">
                            -- RANURA VACÍA --
                          </td>
                          <td className="px-2.5 text-center text-[#432874] text-[10px]">
                            --
                          </td>
                          <td className="px-2.5 text-right text-[#432874] text-[10px]">
                            --
                          </td>
                          <td className="px-2.5 text-right text-[#432874] text-[10px]">
                            --
                          </td>
                          <td className="px-2.5 text-center text-[#432874] text-[10px]">
                            --
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left text-xs border-collapse table-fixed">
                <thead>
                  <tr className="text-[#a594c9] border-b-2 border-[#432874] font-pixel text-[11px] bg-[#2c1a4d] sticky top-0 z-10 h-[36px]">
                    <th className="w-[35%] px-2.5 font-normal">
                      MATERIA PRIMA / INSUMO
                    </th>
                    <th className="w-[20%] px-2.5 font-normal text-right">
                      REQUERIDO
                    </th>
                    <th className="w-[20%] px-2.5 font-normal text-right">
                      STOCK DISPONIBLE
                    </th>
                    <th className="w-[25%] px-2.5 font-normal text-center">
                      FALTANTE / SOBRANTE
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#432874]/30 bg-[#160c2b] animate-in fade-in duration-200 font-pixel">
                  {mrpCalculatedData.length === 0 ? (
                    <tr>
                      <td
                        colSpan="4"
                        className="py-16 text-center font-pixel text-xs text-[#6e588a]"
                      >
                        No se encontraron materias primas en las recetas de los
                        productos de este plan.
                      </td>
                    </tr>
                  ) : (
                    mrpCalculatedData.map((item, idx) => (
                      <tr
                        key={idx}
                        className="h-[38px] hover:bg-[#281747] transition-colors align-middle"
                      >
                        <td className="px-2.5 font-bold text-white truncate">
                          [{item.codigo}] {item.nombre}
                        </td>
                        <td className="px-2.5 text-right font-bold text-[#ffbe00]">
                          {item.requeridoKg.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}{" "}
                          {item.unidad}
                        </td>
                        <td className="px-2.5 text-right font-bold text-[#24cc8f]">
                          {item.stockActual.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}{" "}
                          {item.unidad}
                        </td>
                        <td className="px-2.5 text-center whitespace-nowrap">
                          {item.esDeficit ? (
                            <span className="inline-block px-2 py-0.5 border border-[#7f1d1d] bg-[#450a0a]/70 text-[#f87171] font-bold rounded-2xs text-[10px] shadow-[1px_1px_0px_#000]">
                              FALTANTE (
                              {Math.abs(item.diferencia).toLocaleString(
                                undefined,
                                { maximumFractionDigits: 2 },
                              )}{" "}
                              {item.unidad})
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 border border-[#065f46] bg-[#064e3b]/70 text-[#24cc8f] font-bold rounded-2xs text-[10px] shadow-[1px_1px_0px_#000]">
                              SOBRANTE (+
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
            )}
          </div>
        ) : (
          /* VISTA 2: CALENDARIO DE PROYECCIÓN E INSPECCIÓN CON TIMER HOVER Y ELIMINACIÓN FIJA */
          <div className="flex-1 bg-[#160c2b] border-2 border-[#432874] p-2.5 rounded-xs flex flex-col min-h-0 shadow-[inset_0_0_15px_rgba(0,0,0,0.5)] font-pixel text-xs">
            <div className="flex justify-between items-center bg-[#24173e] border border-[#432874] p-1.5 rounded-2xs mb-2 shrink-0">
              <button
                onClick={() => {
                  if (calMonth === 0) {
                    setCalMonth(11);
                    setCalYear(calYear - 1);
                  } else setCalMonth(calMonth - 1);
                }}
                className="p-1 bg-[#160c2b] border border-[#432874] text-[#38bdf8] hover:text-white rounded-2xs"
              >
                <ChevronLeft size={14} />
              </button>

              <span className="text-white font-bold tracking-widest text-xs">
                {nombreMes} {calYear}
              </span>

              <button
                onClick={() => {
                  if (calMonth === 11) {
                    setCalMonth(0);
                    setCalYear(calYear + 1);
                  } else setCalMonth(calMonth + 1);
                }}
                className="p-1 bg-[#160c2b] border border-[#432874] text-[#38bdf8] hover:text-white rounded-2xs"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center font-pixel text-[10px] text-[#a594c9] mb-1 shrink-0">
              {["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"].map((d) => (
                <div key={d} className="font-bold">
                  {d}
                </div>
              ))}
            </div>

            <div
              className="flex-1 grid grid-cols-7 gap-1 min-h-0"
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
                    className={`p-1 border flex flex-col justify-between relative rounded-2xs transition-all duration-300 ease-out cursor-pointer ${
                      cell.isToday
                        ? "border-[#ffbe00] bg-[#ffbe00]/10 hover:bg-[#ffbe00]/25 hover:border-[#ffe066] hover:shadow-[0_0_12px_rgba(255,190,0,0.4)]"
                        : hasProjected
                          ? "border-[#38bdf8] bg-[#38bdf8]/10 hover:bg-[#38bdf8]/25 hover:border-[#7dd3fc] hover:shadow-[0_0_12px_rgba(56,189,248,0.4)]"
                          : "border-[#432874]/60 bg-[#24173e]/50 hover:bg-[#39215e] hover:border-[#ffbe00]/60 hover:shadow-[0_0_10px_rgba(255,190,0,0.2)]"
                    }`}
                  >
                    <div className="flex justify-between items-center text-[9px] border-b border-[#432874]/40 pb-0.5">
                      <span
                        className={
                          cell.isToday
                            ? "text-[#ffbe00] font-bold"
                            : "text-[#a594c9]"
                        }
                      >
                        {cell.dayNumber}
                      </span>
                      {cell.isToday && (
                        <span className="text-[8px] bg-[#ffbe00] text-[#2c1a4d] px-1 font-bold rounded-2xs">
                          HOY
                        </span>
                      )}
                    </div>

                    <div className="space-y-0.5 overflow-hidden flex-1 mt-1">
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
                            className="text-[8px] bg-[#38bdf8]/20 border border-[#38bdf8]/40 text-[#38bdf8] px-1 py-0.5 truncate font-bold rounded-2xs cursor-grab active:cursor-grabbing flex justify-between items-center group/badge hover:bg-[#38bdf8]/30 transition-colors"
                          >
                            <span className="truncate">
                              [{otItem.semielaborado_codigo}]
                            </span>
                            <span className="text-[#ffbe00] font-bold shrink-0 ml-1">
                              {otItem.cant_objetivo}u
                            </span>
                          </div>
                        ))}

                      {hasRealLogs && (
                        <div className="text-[8px] bg-[#24cc8f]/20 border border-[#24cc8f]/40 text-[#24cc8f] px-1 truncate font-bold rounded-2xs">
                          {cell.realLogs.length} Cargas Reales
                        </div>
                      )}
                    </div>

                    {/* VENTANA DE INSPECCIÓN (MUESTRA SIEMPRE PROGRAMADOS Y REALIZADOS SI EXISTEN) */}
                    {showInspectionBox && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute top-0 left-0 z-50 w-64 bg-[#24173e] border-2 border-[#ffbe00] p-2.5 shadow-[0_0_25px_rgba(255,190,0,0.5)] space-y-2 font-pixel text-[10px] rounded-xs transition-opacity duration-200 ${
                          isPinned
                            ? "pointer-events-auto"
                            : "pointer-events-none"
                        }`}
                      >
                        <div className="flex justify-between items-center border-b border-[#432874] pb-1 font-bold text-[#ffbe00]">
                          <span className="flex items-center gap-1">
                            INSPECCIÓN {cell.dateKey}
                            {isPinned && (
                              <span className="text-[8px] bg-[#ffbe00] text-[#2c1a4d] px-1 rounded-2xs font-bold">
                                📌 FIJO
                              </span>
                            )}
                          </span>
                          {isPinned && (
                            <button
                              onClick={() => {
                                setPinnedDateKey(null);
                                setHoveredDateKey(null);
                              }}
                              className="text-[#a594c9] hover:text-white p-0.5"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>

                        {/* SECCIÓN 1: PROGRAMADO / PROYECTADO */}
                        {cell.projectedOTs.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[#38bdf8] font-bold block">
                              PROGRAMADO EN PLAN:
                            </span>
                            {cell.projectedOTs.map((ot) => (
                              <div
                                key={ot.id}
                                className="bg-[#160c2b] p-1.5 border border-[#432874] text-white flex justify-between items-center rounded-2xs"
                              >
                                <div className="truncate pr-1">
                                  <span className="text-[#ffbe00] font-bold">
                                    [{ot.semielaborado_codigo}]
                                  </span>{" "}
                                  <span className="truncate">
                                    {ot.articulo}
                                  </span>
                                  <div className="text-[9px] text-[#a594c9]">
                                    Objetivo: {ot.cant_objetivo} u.
                                  </div>
                                </div>
                                {isPinned &&
                                  currentPlan?.estado === "ABIERTO" && (
                                    <button
                                      onClick={(e) =>
                                        handleUnassignDateFromOT(ot, e)
                                      }
                                      className="p-1 bg-[#2c1a4d] border border-[#f87171]/50 text-[#f87171] hover:bg-[#f87171] hover:text-white transition-colors rounded-2xs shrink-0 cursor-pointer"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* SECCIÓN 2: PRODUCCIÓN REALIZADA Y APROBADA */}
                        {cell.realLogs.length > 0 ? (
                          <div className="space-y-1 pt-1 border-t border-[#432874]">
                            <span className="text-[#24cc8f] font-bold block">
                              PRODUCCIÓN APROBADA:
                            </span>
                            {cell.realLogs.map((log, idx) => (
                              <div
                                key={idx}
                                className="bg-[#160c2b] p-1.5 border border-[#432874] text-white rounded-2xs"
                              >
                                <span className="text-[#ffbe00] font-bold">
                                  [{log.codigo}]
                                </span>{" "}
                                {log.articulo}
                                <div className="text-[9px] text-[#24cc8f]">
                                  Buenas: +{log.cant_buenos} u.{" "}
                                  {log.cant_fallas > 0 && (
                                    <span className="text-[#f87171]">
                                      (Fallas: {log.cant_fallas}u)
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          cell.projectedOTs.length === 0 && (
                            <div className="text-[#6e588a] text-[10px] text-center py-2">
                              Sin actividad ni registros este día.
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PAGINACIÓN */}
        {activeMainTab === "TABLA" && tableMode === "ITEMS" && (
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
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
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
        )}
      </div>

      {/* =========================================================
          DRAWER FIXED POR ENCIMA DEL LAYOUT (PADRES UNIFICADOS)
      ========================================================= */}
      {activeMainTab === "CALENDARIO" && currentPlan && (
        <div
          className={`fixed top-0 right-0 h-screen w-72 bg-[#24173e] border-l-2 border-[#ffbe00] shadow-[-10px_0_30px_rgba(0,0,0,0.8)] z-[9999] p-3 flex flex-col space-y-2.5 font-pixel text-xs transition-transform duration-300 ease-in-out ${
            isDrawerOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <button
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className="absolute top-1/2 -translate-y-1/2 -left-7 bg-[#ffbe00] text-[#2c1a4d] font-pixel text-xs font-bold py-3 px-1 border-l-2 border-y-2 border-[#b38600] shadow-[-3px_0px_0px_#000] rounded-l-xs flex flex-col items-center gap-2 hover:bg-[#ffe066] transition-all cursor-pointer pointer-events-auto"
            title={
              isDrawerOpen
                ? "Cerrar productos"
                : "Desplegar productos de la plantilla padre"
            }
          >
            {isDrawerOpen ? (
              <ChevronRight size={16} />
            ) : (
              <ChevronLeft size={16} />
            )}
            <Package size={14} />
          </button>

          <div className="flex justify-between items-center border-b border-[#432874] pb-2 shrink-0">
            <span className="text-[#ffbe00] font-bold flex items-center gap-1.5 text-[11px]">
              <Package size={14} className="text-[#38bdf8]" /> PRODUCTOS PADRE
            </span>
            <button
              onClick={() => setIsDrawerOpen(false)}
              className="text-[#a594c9] hover:text-white p-0.5"
            >
              <X size={14} />
            </button>
          </div>

          <div className="relative shrink-0 font-pixel">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#a594c9]"
            />
            <input
              type="text"
              placeholder="Filtrar productos..."
              value={drawerSearchText}
              onChange={(e) => setDrawerSearchText(e.target.value)}
              className="w-full bg-[#160c2b] border border-[#432874] text-xs text-white pl-7 pr-2 py-1 focus:outline-none focus:border-[#ffbe00] rounded-xs font-mono"
            />
          </div>

          <p className="text-[9px] text-[#a594c9] leading-tight font-mono">
            💡 Podés arrastrar cualquiera de estos semielaborados a días
            distintos en el calendario para dosificar la producción.
          </p>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-0">
            {drawerParentItems.length === 0 ? (
              <div className="py-12 text-center text-[#6e588a] text-[10px]">
                {currentPlan.items.length === 0
                  ? "Este plan está vacío. Agregá productos primero."
                  : "Sin coincidencias de búsqueda."}
              </div>
            ) : (
              drawerParentItems.map((parentItem, idx) => (
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
                  className={`p-2 bg-[#160c2b] border transition-all rounded-2xs shadow-[1px_1px_0px_#000] flex flex-col space-y-1 group ${
                    parentItem.cant_disponible > 0
                      ? "border-[#432874] hover:border-[#ffbe00] cursor-grab active:cursor-grabbing"
                      : "border-[#432874]/40 opacity-50 cursor-not-allowed"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1">
                      <GripVertical
                        size={12}
                        className="text-[#6e588a] group-hover:text-[#ffbe00]"
                      />
                      <strong className="text-[#ffbe00]">
                        [{parentItem.semielaborado_codigo}]
                      </strong>
                    </div>
                    <span className="text-[9px] text-[#38bdf8] font-bold">
                      ⚡ {parentItem.velocidad_u_hora || 50} u/h
                    </span>
                  </div>

                  <span className="text-white font-bold block truncate text-[10px]">
                    {parentItem.articulo}
                  </span>

                  <div className="flex justify-between items-center text-[9px] pt-1 border-t border-[#432874]/50">
                    <span className="text-[#a594c9]">DISPONIBLE:</span>
                    <strong
                      className={
                        parentItem.cant_disponible > 0
                          ? "text-[#24cc8f]"
                          : "text-[#f87171]"
                      }
                    >
                      {parentItem.cant_disponible} /{" "}
                      {parentItem.cant_objetivo_plan} u.
                    </strong>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 1: CREAR PLAN VACÍO
      ========================================================= */}
      {isNewPlanModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-[100] flex items-center justify-center p-3 animate-in fade-in duration-200 font-mono">
          <div className="bg-[#24173e] border-2 border-[#ffbe00] w-full max-w-md p-5 shadow-[0_0_35px_rgba(255,190,0,0.3)] space-y-4 relative rounded-xs">
            <button
              onClick={() => setIsNewPlanModalOpen(false)}
              className="absolute top-4 right-4 text-[#a594c9] hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b-2 border-[#432874] pb-3">
              <span className="text-[10px] font-pixel text-[#ffbe00] bg-[#ffbe00]/10 px-2 py-0.5 border border-[#ffbe00]/30 rounded-xs font-bold">
                GENERAR PLAN DE PRODUCCIÓN
              </span>
              <h3 className="font-pixel text-base text-white font-bold mt-2 flex items-center gap-2">
                <Anvil size={18} className="text-[#38bdf8]" /> CREAR PLAN VACÍO
              </h3>
            </div>

            <div className="space-y-3 font-pixel text-xs">
              <div>
                <label className="text-[#a594c9] block mb-1">
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
                  className="w-full bg-[#160c2b] border-2 border-[#432874] p-2 text-white font-bold focus:outline-none focus:border-[#ffbe00] text-sm rounded-xs uppercase font-mono"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[#a594c9] block mb-1">
                  DESTINO / CLIENTE (OPCIONAL):
                </label>
                <input
                  type="text"
                  placeholder="Ej: Stock General"
                  value={newPlanForm.destino}
                  onChange={(e) =>
                    setNewPlanForm({ ...newPlanForm, destino: e.target.value })
                  }
                  className="w-full bg-[#160c2b] border border-[#432874] p-2 text-white font-bold focus:outline-none focus:border-[#ffbe00] rounded-xs"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-[#432874] flex justify-end gap-2 font-pixel">
              <button
                onClick={() => setIsNewPlanModalOpen(false)}
                className="px-4 py-1.5 border border-[#432874] text-[#a594c9] hover:text-white text-xs rounded-xs"
              >
                CANCELAR
              </button>
              <button
                onClick={handleCreateEmptyPlan}
                className="px-4 py-1.5 bg-[#ffbe00] text-[#2c1a4d] font-bold text-xs hover:bg-[#ffe066] shadow-[2px_2px_0px_#000] rounded-xs flex items-center gap-1.5"
              >
                <CheckCircle2 size={14} /> GENERAR PLAN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 2: AGREGAR PRODUCTO AL PLAN
      ========================================================= */}
      {isAddItemModalOpen && currentPlan && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-[100] flex items-center justify-center p-3 animate-in fade-in duration-200 font-mono">
          <div className="bg-[#24173e] border-2 border-[#38bdf8] w-full max-w-lg p-5 shadow-[0_0_35px_rgba(56,189,248,0.3)] space-y-4 relative rounded-xs">
            <button
              onClick={() => setIsAddItemModalOpen(false)}
              className="absolute top-4 right-4 text-[#a594c9] hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b-2 border-[#432874] pb-3">
              <span className="text-[10px] font-pixel text-[#38bdf8] bg-[#38bdf8]/10 px-2 py-0.5 border border-[#38bdf8]/30 rounded-xs font-bold">
                AGREGAR A PLAN: [{currentPlan.codigo_ot}]
              </span>
              <h3 className="font-pixel text-base text-white font-bold mt-2 flex items-center gap-2">
                <Plus size={18} className="text-[#38bdf8]" /> INCORPORAR
                PRODUCTO
              </h3>
            </div>

            <div className="space-y-3 font-pixel text-xs">
              <div>
                <label className="text-[#a594c9] block mb-1">
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
                  className="w-full bg-[#160c2b] border border-[#432874] p-2 text-white font-bold focus:outline-none focus:border-[#38bdf8] rounded-xs"
                >
                  <option value="">-- SELECCIONAR SEMIELABORADO --</option>
                  {semielaboradosDB.map((s) => (
                    <option key={s.id} value={s.codigo}>
                      [{s.codigo}] {s.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-[#160c2b] p-2.5 border border-[#432874] rounded-xs">
                <div>
                  <label className="text-[#a594c9] text-[10px] block mb-1">
                    CANTIDAD OBJETIVO TOTAL:
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
                    className="w-full bg-[#24173e] border border-[#432874] p-1.5 text-[#24cc8f] font-bold text-right focus:outline-none focus:border-[#24cc8f] rounded-xs text-sm"
                  />
                </div>

                <div>
                  <label className="text-[#a594c9] text-[10px] block mb-1">
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
                    className="w-full bg-[#24173e] border border-[#432874] p-1.5 text-[#38bdf8] font-bold text-right focus:outline-none focus:border-[#38bdf8] rounded-xs text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[#432874] flex justify-end gap-2 font-pixel">
              <button
                onClick={() => setIsAddItemModalOpen(false)}
                className="px-4 py-1.5 border border-[#432874] text-[#a594c9] hover:text-white text-xs rounded-xs"
              >
                CANCELAR
              </button>
              <button
                onClick={handleAddItemToCurrentPlan}
                className="px-4 py-1.5 bg-[#38bdf8] text-[#2c1a4d] font-bold text-xs hover:bg-[#7dd3fc] shadow-[2px_2px_0px_#000] rounded-xs flex items-center gap-1.5"
              >
                <CheckCircle2 size={14} /> AGREGAR A TABLA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 3: EDITAR RITMO U/H DIRECTAMENTE
      ========================================================= */}
      {editingRitmoItem && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-[100] flex items-center justify-center p-3 animate-in fade-in duration-200 font-mono">
          <div className="bg-[#24173e] border-2 border-[#38bdf8] w-full max-w-xs p-4 shadow-[0_0_35px_rgba(56,189,248,0.3)] space-y-3 relative rounded-xs">
            <button
              onClick={() => setEditingRitmoItem(null)}
              className="absolute top-3 right-3 text-[#a594c9] hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b border-[#432874] pb-2 font-pixel">
              <span className="text-[10px] text-[#38bdf8] font-bold">
                RECALIBRACIÓN DE VELOCIDAD
              </span>
              <h3 className="text-white font-bold text-xs mt-1">
                [{editingRitmoItem.semielaborado_codigo}]
              </h3>
            </div>

            <div className="space-y-1 font-pixel text-xs">
              <label className="text-[#a594c9] text-[10px] block">
                NUEVO RITMO (UNIDADES / HORA):
              </label>
              <input
                type="number"
                value={newRitmoVal}
                onChange={(e) => setNewRitmoVal(e.target.value)}
                className="w-full bg-[#160c2b] border-2 border-[#38bdf8] p-2 text-[#38bdf8] font-bold text-right focus:outline-none text-base rounded-xs"
                autoFocus
              />
            </div>

            <div className="pt-2 border-t border-[#432874] flex justify-end gap-2 font-pixel">
              <button
                onClick={() => setEditingRitmoItem(null)}
                className="px-3 py-1 border border-[#432874] text-[#a594c9] text-xs"
              >
                CANCELAR
              </button>
              <button
                onClick={handleSaveRitmo}
                className="px-3 py-1 bg-[#38bdf8] text-[#2c1a4d] font-bold text-xs hover:bg-[#7dd3fc] shadow-[1px_1px_0px_#000]"
              >
                GUARDAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 4: CONFIRMACIÓN DE DOSIFICACIÓN AL SOLTAR EN CALENDARIO
      ========================================================= */}
      {dropModalData && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-[120] flex items-center justify-center p-3 animate-in fade-in duration-200 font-mono">
          <div className="bg-[#24173e] border-2 border-[#ffbe00] w-full max-w-sm p-4 shadow-[0_0_35px_rgba(255,190,0,0.3)] space-y-3 relative rounded-xs">
            <button
              onClick={() => setDropModalData(null)}
              className="absolute top-3 right-3 text-[#a594c9] hover:text-white"
            >
              <X size={16} />
            </button>

            <div className="border-b border-[#432874] pb-2 font-pixel">
              <span className="text-[10px] text-[#ffbe00] font-bold">
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

            <div className="space-y-2 font-pixel text-xs">
              <label className="text-[#a594c9] text-[10px] block">
                CANTIDAD OBJETIVO PARA ESTA FECHA:
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
                className="w-full bg-[#160c2b] border-2 border-[#ffbe00] p-2 text-[#24cc8f] font-bold text-right focus:outline-none text-base rounded-xs font-mono"
                autoFocus
              />
            </div>

            <div className="pt-2 border-t border-[#432874] flex justify-end gap-2 font-pixel">
              <button
                onClick={() => setDropModalData(null)}
                className="px-3 py-1 border border-[#432874] text-[#a594c9] text-xs"
              >
                CANCELAR
              </button>
              <button
                onClick={handleConfirmDropQty}
                className="px-3 py-1 bg-[#ffbe00] text-[#2c1a4d] font-bold text-xs hover:bg-[#ffe066] shadow-[1px_1px_0px_#000]"
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
