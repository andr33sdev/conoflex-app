import { useState, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  X,
  CheckCircle2,
  Search,
  RefreshCw,
  Zap,
} from "lucide-react";

export default function PlanificacionProduccion() {
  const [currentMonthDate, setCurrentMonthDate] = useState(
    new Date(2026, 9, 1),
  ); // Octubre 2026 por defecto
  const [selectedDateStr, setSelectedDateStr] = useState("2026-10-07"); // YYYY-MM-DD

  const [planificaciones, setPlanificaciones] = useState({});
  const [semielaborados, setSemielaborados] = useState([]);
  const [loading, setLoading] = useState(true);

  // MODAL ASIGNAR SEMIELABORADO
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [selectedSemielaborado, setSelectedSemielaborado] = useState(null);
  const [formCantidad, setFormCantidad] = useState(500);

  // CARGA DE DATOS (LOCALSTORAGE + BACKEND)
  const fetchBaseData = async () => {
    setLoading(true);

    let storedPlan = {};
    const localSaved = localStorage.getItem("conoflex_planificacion_ot");
    if (localSaved) {
      try {
        storedPlan = JSON.parse(localSaved);
      } catch (e) {
        console.error("Error parseando almacenamiento local", e);
      }
    }

    try {
      const [resSE, resPlan] = await Promise.all([
        fetch("/api/semielaborados"),
        fetch("/api/planificacion-produccion"),
      ]);

      if (resSE.ok) {
        const dataSE = await resSE.json();
        setSemielaborados(dataSE || []);
      }

      if (resPlan.ok) {
        const dataPlan = await resPlan.json();
        if (dataPlan && Object.keys(dataPlan).length > 0) {
          storedPlan = { ...storedPlan, ...dataPlan };
        }
      }
    } catch (err) {
      console.warn("Usando datos locales de planificación.");
    } finally {
      setPlanificaciones(storedPlan);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBaseData();
  }, []);

  // GUARDAR CAMBIOS Y PERSISTIR
  const savePlanificacionesState = async (newPlan) => {
    setPlanificaciones(newPlan);
    localStorage.setItem("conoflex_planificacion_ot", JSON.stringify(newPlan));

    try {
      await fetch("/api/planificacion-produccion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPlan),
      });
    } catch (err) {
      console.warn("Cambios guardados localmente.");
    }
  };

  // NAVEGACIÓN MESES
  const handlePrevMonth = () => {
    setCurrentMonthDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
    );
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
    );
  };

  // CÁLCULO DE DÍAS DEL MES
  const calendarGrid = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    let dayOfWeek = firstDayOfMonth.getDay() - 1;
    if (dayOfWeek === -1) dayOfWeek = 6; // Lunes = 0, Domingo = 6

    const daysInMonth = lastDayOfMonth.getDate();
    const grid = [];

    for (let i = 0; i < dayOfWeek; i++) {
      grid.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const mStr = String(month + 1).padStart(2, "0");
      const dStr = String(day).padStart(2, "0");
      const dateKey = `${year}-${mStr}-${dStr}`;
      grid.push({ day, dateKey });
    }

    return grid;
  }, [currentMonthDate]);

  const monthName = useMemo(() => {
    const months = [
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
    return `${months[currentMonthDate.getMonth()]} ${currentMonthDate.getFullYear()}`;
  }, [currentMonthDate]);

  const currentDayItems = useMemo(() => {
    return planificaciones[selectedDateStr] || [];
  }, [planificaciones, selectedDateStr]);

  const handleOpenAssignModal = () => {
    setSelectedSemielaborado(null);
    setFormCantidad(500);
    setAssignSearch("");
    setIsAssignModalOpen(true);
  };

  const handleSaveAssignment = (e) => {
    e.preventDefault();
    if (!selectedSemielaborado) return alert("Seleccioná un semielaborado.");
    if (formCantidad <= 0) return alert("Ingresá una cantidad válida.");

    const newItem = {
      id: Date.now(),
      semielaborado_id: selectedSemielaborado.id,
      codigo: selectedSemielaborado.codigo,
      nombre: selectedSemielaborado.nombre,
      cantidad_prevista: Number(formCantidad),
      estado: "PROGRAMADO",
    };

    const updatedDayList = [...currentDayItems, newItem];
    const newPlan = { ...planificaciones, [selectedDateStr]: updatedDayList };

    savePlanificacionesState(newPlan);
    setIsAssignModalOpen(false);
  };

  const handleRemoveAssignment = (itemId) => {
    const updatedDayList = currentDayItems.filter((i) => i.id !== itemId);
    const newPlan = { ...planificaciones, [selectedDateStr]: updatedDayList };
    savePlanificacionesState(newPlan);
  };

  const filteredSemielaborados = useMemo(() => {
    const q = assignSearch.toLowerCase();
    return semielaborados.filter(
      (s) =>
        s.codigo.toLowerCase().includes(q) ||
        s.nombre.toLowerCase().includes(q),
    );
  }, [semielaborados, assignSearch]);

  const formattedSelectedDate = useMemo(() => {
    if (!selectedDateStr) return "";
    const [y, m, d] = selectedDateStr.split("-");
    const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
    const days = [
      "DOMINGO",
      "LUNES",
      "MARTES",
      "MIÉRCOLES",
      "JUEVES",
      "VIERNES",
      "SÁBADO",
    ];
    return `${days[dateObj.getDay()]} ${d}/${m}/${y}`;
  }, [selectedDateStr]);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-black font-sans text-zinc-200 overflow-hidden relative select-none">
      {/* 1. HEADER HERO */}
      <div className="border-b border-zinc-800/50 px-6 py-4 md:px-10 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 bg-[#050505]">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold italic tracking-tighter text-white uppercase leading-none">
            Planificación <span className="text-[#FF5A00]">OT</span>
          </h1>
          <p className="text-zinc-500 text-xs mt-1 uppercase tracking-widest font-bold">
            CRONOGRAMA Y ASIGNACIÓN DIARIA DE SEMIELABORADOS
          </p>
        </div>

        <button
          onClick={handleOpenAssignModal}
          className="flex items-center justify-between gap-3 px-5 py-2.5 font-bold text-xs uppercase tracking-widest transition-all bg-[#FFD700] hover:bg-white text-black active:scale-95 cursor-pointer shrink-0"
        >
          <Plus size={16} strokeWidth={3} />
          ASIGNAR SEMIELABORADO
        </button>
      </div>

      {/* 2. ÁREA DE TRABAJO (2 COLUMNAS SIN SCROLLS GENERALES) */}
      <div className="flex-1 min-h-0 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 bg-black overflow-hidden">
        {/* PANEL IZQUIERDO: DETALLE DEL DÍA SELECCIONADO */}
        <div className="lg:col-span-4 bg-[#050505] border border-zinc-800 p-5 flex flex-col justify-between h-full min-h-0 shadow-2xl">
          <div className="flex flex-col min-h-0 h-full justify-between space-y-4">
            <div className="border-b border-zinc-800/80 pb-3 shrink-0">
              <span className="text-[10px] font-mono font-bold text-[#FF5A00] bg-[#FF5A00]/10 px-2 py-0.5 border border-[#FF5A00]/20 tracking-widest uppercase">
                DETALLE DEL DÍA
              </span>
              <h2 className="text-xl font-extrabold italic text-white uppercase tracking-tighter mt-2 truncate">
                {formattedSelectedDate}
              </h2>
            </div>

            {/* LISTA DE ÍTEMS CON SCROLL INTERNO SILENCIOSO */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              <div className="flex justify-between items-center font-mono text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
                <span>SEMIELABORADOS PREVISTOS</span>
                <span className="text-white">
                  {currentDayItems.length} ASIGNADOS
                </span>
              </div>

              {currentDayItems.length === 0 ? (
                <div className="h-44 border border-dashed border-zinc-800/80 p-6 flex items-center justify-center text-center text-zinc-600 font-mono text-xs uppercase tracking-widest font-bold">
                  Sin producción asignada para este día.
                </div>
              ) : (
                currentDayItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-black border border-zinc-800 p-3.5 flex items-center justify-between gap-3 group hover:border-zinc-700 transition-colors"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <span className="text-[10px] font-mono font-bold text-[#FF5A00] bg-[#FF5A00]/10 border border-[#FF5A00]/20 px-1.5 py-0.5 inline-block">
                        {item.codigo}
                      </span>
                      <h4 className="text-xs font-bold text-white uppercase truncate">
                        {item.nombre}
                      </h4>
                      <div className="flex items-center gap-2 font-mono text-[10px]">
                        <span className="text-zinc-500">PREVISTO:</span>
                        <strong className="text-[#FFD700]">
                          {item.cantidad_prevista.toLocaleString()} u.
                        </strong>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemoveAssignment(item.id)}
                      className="text-zinc-600 hover:text-[#FF0055] p-2 transition-colors cursor-pointer shrink-0"
                      title="Quitar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={handleOpenAssignModal}
              className="w-full bg-black hover:bg-zinc-900 border border-zinc-800 text-[#FF5A00] hover:text-white py-3 text-xs font-bold uppercase tracking-widest transition cursor-pointer flex items-center justify-center gap-2 font-mono shrink-0"
            >
              <Plus size={14} /> SUMAR A ESTE DÍA
            </button>
          </div>
        </div>

        {/* PANEL DERECHO: CALENDARIO ULTRA CLEAN SIN TEXTOS EN LOS CUADRADOS */}
        <div className="lg:col-span-8 bg-[#050505] border border-zinc-800 p-5 flex flex-col h-full min-h-0 shadow-2xl justify-between">
          {/* NAVEGACIÓN MES */}
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 shrink-0">
            <h2 className="text-xl font-extrabold italic text-white uppercase tracking-tighter">
              {monthName}
            </h2>

            <div className="flex items-center gap-1.5 font-mono">
              <button
                onClick={handlePrevMonth}
                className="w-8 h-8 flex items-center justify-center bg-black border border-zinc-800 hover:border-[#FF5A00] text-white transition-colors cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={handleNextMonth}
                className="w-8 h-8 flex items-center justify-center bg-black border border-zinc-800 hover:border-[#FF5A00] text-white transition-colors cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* CABECERA DÍAS DE LA SEMANA */}
          <div className="grid grid-cols-7 text-center font-mono text-[10px] font-bold text-zinc-500 uppercase tracking-widest py-2 border-b border-zinc-800/50 shrink-0">
            <div>LU</div>
            <div>MA</div>
            <div>MI</div>
            <div>JU</div>
            <div>VI</div>
            <div>SÁ</div>
            <div>DO</div>
          </div>

          {/* GRILLA CALENDARIO PERFECTA (5 FILAS RIGIDAS, CASILLEROS TOTALMENTE CLEAN) */}
          <div className="flex-1 grid grid-cols-7 grid-rows-5 gap-2 pt-2 min-h-0">
            {calendarGrid.map((cell, idx) => {
              if (!cell) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="bg-black/30 border border-zinc-900/30 opacity-10 pointer-events-none"
                  />
                );
              }

              const isSelected = cell.dateKey === selectedDateStr;
              const dayPlans = planificaciones[cell.dateKey] || [];
              const hasPlans = dayPlans.length > 0;

              return (
                <div
                  key={cell.dateKey}
                  onClick={() => setSelectedDateStr(cell.dateKey)}
                  className={`p-3 border transition-all cursor-pointer flex flex-col justify-between relative group ${
                    isSelected
                      ? "border-[#FF5A00] bg-[#FF5A00]/10 shadow-[0_0_15px_rgba(255,90,0,0.15)]"
                      : hasPlans
                        ? "border-zinc-800 bg-[#080808] hover:border-[#FF5A00]/60"
                        : "border-zinc-800/80 bg-black hover:border-zinc-700"
                  }`}
                >
                  {/* CABECERA CON NÚMERO DE DÍA E INDICADOR NEÓN ULTRA DISCRETO */}
                  <div className="flex justify-between items-start font-mono">
                    <span
                      className={`text-sm font-extrabold ${
                        isSelected ? "text-[#FF5A00]" : "text-white"
                      }`}
                    >
                      {cell.day}
                    </span>

                    {/* PUNTO INDICADOR SI TIENE PRODUCCIÓN (SIN TEXTOS NI CARTELES) */}
                    {hasPlans && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A00] shadow-[0_0_6px_#FF5A00]" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* MODAL DE ASIGNACIÓN */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#050505] border border-zinc-800 w-full max-w-md p-6 shadow-2xl space-y-4 font-mono text-xs relative">
            <button
              onClick={() => setIsAssignModalOpen(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="border-b border-zinc-800/80 pb-3">
              <span className="text-[10px] font-bold text-[#FF5A00] bg-[#FF5A00]/10 px-2 py-0.5 border border-[#FF5A00]/20 tracking-widest uppercase">
                ASIGNACIÓN PARA {formattedSelectedDate}
              </span>
              <h3 className="font-extrabold italic text-lg text-white mt-2 uppercase tracking-tighter font-sans">
                PROGRAMAR PRODUCCIÓN
              </h3>
            </div>

            <form onSubmit={handleSaveAssignment} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-zinc-500 block text-[10px] font-bold uppercase tracking-widest">
                  BUSCAR SEMIELABORADO *:
                </label>
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"
                  />
                  <input
                    type="text"
                    value={assignSearch}
                    onChange={(e) => setAssignSearch(e.target.value)}
                    placeholder="Código o nombre..."
                    className="w-full bg-black border border-zinc-800 p-2.5 pl-9 text-white font-bold focus:outline-none focus:border-[#FF5A00] text-xs uppercase"
                    autoFocus
                  />
                </div>
              </div>

              <div className="max-h-36 overflow-y-auto border border-zinc-800 p-1.5 space-y-1 bg-black custom-scrollbar">
                {filteredSemielaborados.length === 0 ? (
                  <p className="text-zinc-600 py-4 text-center text-[10px] uppercase font-bold">
                    Sin resultados.
                  </p>
                ) : (
                  filteredSemielaborados.map((item) => {
                    const isSelected = selectedSemielaborado?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedSemielaborado(item)}
                        className={`p-2 border cursor-pointer transition-colors flex justify-between items-center ${
                          isSelected
                            ? "bg-[#FF5A00]/10 border-[#FF5A00] text-white"
                            : "border-zinc-800/80 bg-[#050505] text-zinc-400 hover:text-white"
                        }`}
                      >
                        <div className="truncate pr-2">
                          <span className="text-[#FF5A00] font-bold text-[10px] block">
                            {item.codigo}
                          </span>
                          <span className="font-sans font-bold text-xs truncate block text-white">
                            {item.nombre}
                          </span>
                        </div>

                        {isSelected && (
                          <CheckCircle2
                            size={16}
                            className="text-[#FF5A00] shrink-0"
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-zinc-500 block text-[10px] font-bold uppercase tracking-widest">
                  CANTIDAD PREVISTA (UNIDADES) *:
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={formCantidad}
                  onChange={(e) => setFormCantidad(e.target.value)}
                  className="w-full bg-black border border-zinc-800 p-3 text-[#FFD700] font-bold text-sm focus:outline-none focus:border-[#FF5A00]"
                />
              </div>

              <div className="pt-3 border-t border-zinc-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-4 py-2 text-zinc-500 hover:text-white text-[10px] font-bold uppercase tracking-widest transition cursor-pointer"
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#FF5A00] hover:bg-white text-black font-bold uppercase tracking-widest text-[10px] transition cursor-pointer"
                >
                  GUARDAR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
