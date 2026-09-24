import { useState, useEffect, useMemo } from "react";
import {
  Flame,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Scale,
  UserCheck,
  User,
  ShieldCheck,
  Search,
  Package,
  Layers,
  Zap,
  Check,
  X,
  ArrowRight,
  Filter,
} from "lucide-react";

export default function CargaProduccion() {
  const [ordenes, setOrdenes] = useState([]);
  const [semielaboradosDB, setSemielaboradosDB] = useState([]);
  const [materiasPrimasDB, setMateriasPrimasDB] = useState([]);
  const [recipesMap, setRecipesMap] = useState({});
  const [cargasPendientes, setCargasPendientes] = useState([]);
  const [cargasAprobadas, setCargasAprobadas] = useState([]);
  const [loading, setLoading] = useState(true);

  // ROL SIMULADO (OPERARIO / SUPERVISOR)
  const [userRole, setUserRole] = useState("OPERARIO"); // OPERARIO | SUPERVISOR
  const [activeTab, setActiveTab] = useState("FORMULARIO"); // FORMULARIO | PENDIENTES | HISTORIAL

  // FORMULARIO DE CARGA
  const [form, setForm] = useState({
    codigo_ot: "",
    semielaborado_codigo: "",
    articulo: "",
    cant_buenos: 100,
    cant_fallas: 0,
    fecha: new Date().toISOString().split("T")[0],
    operario_nombre: "Juan Pérez",
    observaciones: "",
  });

  // CARGAR DATOS
  const fetchData = async () => {
    setLoading(true);
    try {
      const [resOT, resSE, resMP, resCargas] = await Promise.all([
        fetch("/api/ordenes-trabajo"),
        fetch("/api/semielaborados"),
        fetch("/api/materias-primas"),
        fetch("/api/metricas/produccion/cargas"),
      ]);

      if (resOT.ok) setOrdenes(await resOT.json());
      if (resMP.ok) setMateriasPrimasDB(await resMP.json());

      if (resCargas.ok) {
        const todasCargas = await resCargas.json();
        setCargasPendientes(
          todasCargas.filter((c) => c.estado_aprobacion === "PENDIENTE"),
        );
        setCargasAprobadas(
          todasCargas.filter((c) => c.estado_aprobacion === "APROBADO"),
        );
      }

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
              console.error("Error receta", e);
            }
          }),
        );
        setRecipesMap(recipeMapObj);
      }
    } catch (err) {
      console.error("Error cargando datos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // PLANES ABIERTOS ÚNICOS
  const openPlans = useMemo(() => {
    const map = {};
    ordenes
      .filter((o) => o.estado !== "FINALIZADO")
      .forEach((o) => {
        if (!map[o.codigo_ot]) {
          map[o.codigo_ot] = {
            codigo_ot: o.codigo_ot,
            destino: o.destino || "Stock General",
            items: [],
          };
        }
        map[o.codigo_ot].items.push(o);
      });
    return Object.values(map);
  }, [ordenes]);

  // SEMIELABORADOS PERTENECIENTES AL PLAN SELECCIONADO
  const currentPlanSEs = useMemo(() => {
    if (!form.codigo_ot) return [];
    const plan = openPlans.find((p) => p.codigo_ot === form.codigo_ot);
    if (!plan) return [];

    const uniqueMap = {};
    plan.items.forEach((item) => {
      if (!uniqueMap[item.semielaborado_codigo]) {
        uniqueMap[item.semielaborado_codigo] = {
          semielaborado_codigo: item.semielaborado_codigo,
          articulo: item.articulo,
        };
      }
    });
    return Object.values(uniqueMap);
  }, [openPlans, form.codigo_ot]);

  // CÁLCULO DE DESCUENTO DE MATERIA PRIMA EN TIEMPO REAL SEGÚN LA RECETA
  const projectedMPDeduction = useMemo(() => {
    if (!form.semielaborado_codigo || form.cant_buenos <= 0) return [];
    const ingredients = recipesMap[form.semielaborado_codigo] || [];

    return ingredients.map((ing) => {
      const cantConsumir = Number(form.cant_buenos) * Number(ing.cantidad || 0);
      const mpDb = materiasPrimasDB.find(
        (m) => m.codigo === ing.item_codigo || m.id === ing.materia_prima_id,
      );
      const stockActual = mpDb ? Number(mpDb.stock_actual) || 0 : 0;

      return {
        materia_prima_id: ing.materia_prima_id,
        item_codigo: ing.item_codigo,
        item_nombre: ing.item_nombre || mpDb?.nombre || ing.item_codigo,
        unidad: ing.unidad_medida || "Kg",
        cantConsumir,
        stockActual,
        stockSuficiente: stockActual >= cantConsumir,
      };
    });
  }, [
    form.semielaborado_codigo,
    form.cant_buenos,
    recipesMap,
    materiasPrimasDB,
  ]);

  // SUBMIT CARGA PENDIENTE
  const handleSubmitCarga = async (e) => {
    e.preventDefault();
    if (
      !form.codigo_ot ||
      !form.semielaborado_codigo ||
      form.cant_buenos <= 0
    ) {
      return alert("Completá la OT, el Producto y una cantidad mayor a 0.");
    }

    try {
      const res = await fetch(
        "/api/metricas/produccion/cargar-pendiente",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            cant_buenos: Number(form.cant_buenos),
            cant_fallas: Number(form.cant_fallas || 0),
            estado_aprobacion: "PENDIENTE",
          }),
        },
      );

      if (res.ok) {
        alert(
          "✅ Carga enviada correctamente. Queda en estado PENDIENTE DE APROBACIÓN.",
        );
        setForm({
          ...form,
          semielaborado_codigo: "",
          articulo: "",
          cant_buenos: 100,
          cant_fallas: 0,
          observaciones: "",
        });
        fetchData();
        if (userRole === "SUPERVISOR") setActiveTab("PENDIENTES");
      }
    } catch (err) {
      alert("Error enviando reporte de producción.");
    }
  };

  // APROBAR CARGA DE PRODUCCIÓN (APLICA DESCUENTO DE STOCK EN BD)
  const handleAprobarCarga = async (carga) => {
    if (
      !confirm(
        `¿Aprobar carga de ${carga.cant_buenos}u de [${carga.semielaborado_codigo}] y descontar Materias Primas del stock?`,
      )
    )
      return;

    try {
      const res = await fetch(
        `/api/metricas/produccion/aprobar/${carga.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supervisor_nombre: "Supervisor Planta",
          }),
        },
      );

      if (res.ok) {
        alert(
          "🎉 Carga aprobada. Se actualizaron las OTs y se descontaron las materias primas del stock.",
        );
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Error al aprobar carga.");
      }
    } catch (err) {
      alert("Error procesando la aprobación.");
    }
  };

  // RECHAZAR CARGA
  const handleRechazarCarga = async (id) => {
    if (!confirm("¿Rechazar esta carga de producción?")) return;
    try {
      const res = await fetch(
        `/api/metricas/produccion/rechazar/${id}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) fetchData();
    } catch (err) {
      alert("Error al rechazar.");
    }
  };

  return (
    <div className="h-full flex flex-col font-mono text-[#e1d7f5] select-none space-y-2 sm:space-y-3 min-h-0 bg-[#1a0f2e] p-1.5 sm:p-3 overflow-hidden">
      {/* 1. HEADER Y SELECTOR DE ROL */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between pb-2 border-b-2 border-[#432874] gap-2 shrink-0">
        <div>
          <h2 className="font-pixel text-sm sm:text-base text-[#ffbe00] font-bold flex items-center gap-2 tracking-wide drop-shadow-[1px_1px_0px_#000]">
            <Flame
              size={18}
              className="text-[#ffbe00] shrink-0 animate-pulse"
            />{" "}
            MÓDULO DE CARGA & APROBACIÓN DE PRODUCCIÓN
          </h2>
          <p className="text-[10px] sm:text-xs text-[#a594c9] font-mono">
            Reporte diario operario con validación de supervisor y descuento
            automático MRP.
          </p>
        </div>

        {/* SELECTOR SIMULADO DE ROL OPERARIO / SUPERVISOR */}
        <div className="flex items-center gap-1.5 font-pixel text-xs bg-[#24173e] p-1.5 border-2 border-[#432874] rounded-xs shadow-[2px_2px_0px_#000] shrink-0">
          <span className="text-[10px] text-[#a594c9]">ROL:</span>
          <button
            onClick={() => setUserRole("OPERARIO")}
            className={`px-2.5 py-1 text-[10px] font-bold border rounded-2xs flex items-center gap-1 transition-all ${
              userRole === "OPERARIO"
                ? "bg-[#38bdf8] border-[#0284c7] text-[#2c1a4d]"
                : "bg-[#160c2b] border-[#432874] text-[#a594c9]"
            }`}
          >
            <User size={12} /> OPERARIO
          </button>
          <button
            onClick={() => setUserRole("SUPERVISOR")}
            className={`px-2.5 py-1 text-[10px] font-bold border rounded-2xs flex items-center gap-1 transition-all ${
              userRole === "SUPERVISOR"
                ? "bg-[#ffbe00] border-[#b38600] text-[#2c1a4d]"
                : "bg-[#160c2b] border-[#432874] text-[#a594c9]"
            }`}
          >
            <ShieldCheck size={12} /> SUPERVISOR
          </button>
        </div>
      </div>

      {/* 2. BARRA DE PESTAÑAS (CARGA / PENDIENTES / HISTORIAL) */}
      <div className="flex items-center gap-2 bg-[#24173e] p-1.5 border-2 border-[#432874] rounded-xs font-pixel text-xs shrink-0 shadow-[2px_2px_0px_#000]">
        <button
          onClick={() => setActiveTab("FORMULARIO")}
          className={`flex-1 sm:flex-none px-4 py-1.5 font-bold rounded-2xs flex items-center justify-center gap-1.5 transition-all ${
            activeTab === "FORMULARIO"
              ? "bg-[#ffbe00] text-[#2c1a4d]"
              : "text-[#a594c9] hover:text-white"
          }`}
        >
          <Flame size={14} /> CARGAR PRODUCCIÓN
        </button>

        <button
          onClick={() => setActiveTab("PENDIENTES")}
          className={`flex-1 sm:flex-none px-4 py-1.5 font-bold rounded-2xs flex items-center justify-center gap-1.5 relative transition-all ${
            activeTab === "PENDIENTES"
              ? "bg-[#ffbe00] text-[#2c1a4d]"
              : "text-[#a594c9] hover:text-white"
          }`}
        >
          <Clock size={14} /> REVISAR PENDIENTES
          {cargasPendientes.length > 0 && (
            <span className="bg-[#f87171] text-white px-1.5 py-0.2 text-[9px] rounded-full font-bold animate-bounce ml-1">
              {cargasPendientes.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("HISTORIAL")}
          className={`flex-1 sm:flex-none px-4 py-1.5 font-bold rounded-2xs flex items-center justify-center gap-1.5 transition-all ${
            activeTab === "HISTORIAL"
              ? "bg-[#ffbe00] text-[#2c1a4d]"
              : "text-[#a594c9] hover:text-white"
          }`}
        >
          <CheckCircle2 size={14} /> REGISTROS APROBADOS
        </button>
      </div>

      {/* 3. CONTENIDO PRINCIPAL ADAPTATIVO */}
      <div className="flex-1 bg-[#24173e] border-2 border-[#432874] p-2.5 sm:p-4 flex flex-col min-h-0 shadow-[4px_4px_0px_#000] relative rounded-xs overflow-y-auto">
        {/* PESTAÑA 1: FORMULARIO DE CARGA OPERARIO */}
        {activeTab === "FORMULARIO" && (
          <div className="max-w-3xl mx-auto w-full space-y-4 font-pixel animate-in fade-in duration-200">
            <form onSubmit={handleSubmitCarga} className="space-y-4">
              {/* BLOQUE 1: SELECCIÓN DE PLAN Y PRODUCTO */}
              <div className="bg-[#160c2b] border-2 border-[#432874] p-3 sm:p-4 space-y-3 rounded-xs shadow-[2px_2px_0px_#000]">
                <span className="text-[10px] text-[#ffbe00] bg-[#ffbe00]/10 px-2 py-0.5 border border-[#ffbe00]/30 font-bold block w-max rounded-2xs">
                  PASO 1: SELECCIÓN DE PLAN Y SEMIELABORADO
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[#a594c9] text-xs block mb-1 font-bold">
                      ELEGIR PLAN ABIERTO:
                    </label>
                    <select
                      value={form.codigo_ot}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          codigo_ot: e.target.value,
                          semielaborado_codigo: "",
                          articulo: "",
                        })
                      }
                      className="w-full bg-[#24173e] border-2 border-[#432874] text-white p-2 text-xs font-mono font-bold focus:outline-none focus:border-[#ffbe00] rounded-xs"
                      required
                    >
                      <option value="">-- SELECCIONAR PLAN --</option>
                      {openPlans.map((p) => (
                        <option key={p.codigo_ot} value={p.codigo_ot}>
                          [{p.codigo_ot}] - {p.destino} ({p.items.length} ítems)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[#a594c9] text-xs block mb-1 font-bold">
                      PRODUCTO DEL PLAN:
                    </label>
                    <select
                      value={form.semielaborado_codigo}
                      onChange={(e) => {
                        const selectedSE = currentPlanSEs.find(
                          (s) => s.semielaborado_codigo === e.target.value,
                        );
                        setForm({
                          ...form,
                          semielaborado_codigo: e.target.value,
                          articulo: selectedSE ? selectedSE.articulo : "",
                        });
                      }}
                      disabled={!form.codigo_ot}
                      className="w-full bg-[#24173e] border-2 border-[#432874] text-white p-2 text-xs font-mono font-bold focus:outline-none focus:border-[#ffbe00] rounded-xs disabled:opacity-30"
                      required
                    >
                      <option value="">-- SELECCIONAR PRODUCTO --</option>
                      {currentPlanSEs.map((s) => (
                        <option
                          key={s.semielaborado_codigo}
                          value={s.semielaborado_codigo}
                        >
                          [{s.semielaborado_codigo}] {s.articulo}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* BLOQUE 2: CANTIDADES Y DATOS DE FABRICACIÓN */}
              <div className="bg-[#160c2b] border-2 border-[#432874] p-3 sm:p-4 space-y-3 rounded-xs shadow-[2px_2px_0px_#000]">
                <span className="text-[10px] text-[#38bdf8] bg-[#38bdf8]/10 px-2 py-0.5 border border-[#38bdf8]/30 font-bold block w-max rounded-2xs">
                  PASO 2: CANTIDADES PRODUCIDAS & FECHA
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[#24cc8f] text-xs block mb-1 font-bold">
                      PIEZAS BUENAS (+):
                    </label>
                    <input
                      type="number"
                      value={form.cant_buenos}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          cant_buenos: Math.max(
                            0,
                            parseInt(e.target.value) || 0,
                          ),
                        })
                      }
                      className="w-full bg-[#24173e] border-2 border-[#24cc8f] text-[#24cc8f] font-bold p-2 text-sm text-right focus:outline-none rounded-xs font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[#f87171] text-xs block mb-1 font-bold">
                      PIEZAS FALLADAS / SCRAP:
                    </label>
                    <input
                      type="number"
                      value={form.cant_fallas}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          cant_fallas: Math.max(
                            0,
                            parseInt(e.target.value) || 0,
                          ),
                        })
                      }
                      className="w-full bg-[#24173e] border-2 border-[#f87171] text-[#f87171] font-bold p-2 text-sm text-right focus:outline-none rounded-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[#a594c9] text-xs block mb-1 font-bold">
                      FECHA PRODUCCIÓN:
                    </label>
                    <input
                      type="date"
                      value={form.fecha}
                      onChange={(e) =>
                        setForm({ ...form, fecha: e.target.value })
                      }
                      className="w-full bg-[#24173e] border-2 border-[#432874] text-white p-2 text-xs focus:outline-none focus:border-[#ffbe00] rounded-xs font-mono"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-[#a594c9] text-xs block mb-1 font-bold">
                      OPERARIO EN TURNO:
                    </label>
                    <input
                      type="text"
                      value={form.operario_nombre}
                      onChange={(e) =>
                        setForm({ ...form, operario_nombre: e.target.value })
                      }
                      className="w-full bg-[#24173e] border border-[#432874] text-white p-2 text-xs focus:outline-none focus:border-[#ffbe00] rounded-xs font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[#a594c9] text-xs block mb-1 font-bold">
                      OBSERVACIONES / NOTAS:
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Cambio de pigmento a las 14:00"
                      value={form.observaciones}
                      onChange={(e) =>
                        setForm({ ...form, observaciones: e.target.value })
                      }
                      className="w-full bg-[#24173e] border border-[#432874] text-white p-2 text-xs focus:outline-none focus:border-[#ffbe00] rounded-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* BLOQUE 3: PREVISUALIZACIÓN DESCUENTO DE MATERIAS PRIMAS (MRP AUTOMÁTICO) */}
              {projectedMPDeduction.length > 0 && (
                <div className="bg-[#160c2b] border-2 border-[#38bdf8] p-3 rounded-xs space-y-2 shadow-[2px_2px_0px_#000]">
                  <span className="text-[10px] text-[#38bdf8] font-bold flex items-center gap-1 border-b border-[#432874] pb-1">
                    <Scale size={13} /> DESCUENTO ESTIMADO DE MATERIAS PRIMAS AL
                    APROBAR
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                    {projectedMPDeduction.map((ing, idx) => (
                      <div
                        key={idx}
                        className="bg-[#24173e] p-2 border border-[#432874] flex justify-between items-center rounded-2xs"
                      >
                        <span className="text-white font-bold truncate">
                          [{ing.item_codigo}] {ing.item_nombre}
                        </span>
                        <strong className="text-[#ffbe00] shrink-0 font-bold ml-2">
                          -{ing.cantConsumir.toFixed(2)} {ing.unidad}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* BOTÓN ENVIAR CARGA */}
              <button
                type="submit"
                className="w-full py-3 bg-[#ffbe00] text-[#2c1a4d] font-bold text-sm hover:bg-[#ffe066] transition-all shadow-[3px_3px_0px_#000] active:translate-y-0.5 rounded-xs flex items-center justify-center gap-2"
              >
                <Flame size={16} /> REGISTRAR PRODUCCIÓN (PENDIENTE DE
                APROBACIÓN)
              </button>
            </form>
          </div>
        )}

        {/* PESTAÑA 2: CARGAS PENDIENTES DE REVISIÓN Y APROBACIÓN (SUPERVISOR) */}
        {activeTab === "PENDIENTES" && (
          <div className="space-y-3 font-pixel animate-in fade-in duration-200">
            <div className="flex justify-between items-center border-b border-[#432874] pb-2">
              <span className="text-xs text-[#a594c9]">
                Registros enviados por operarios pendientes de validación (
                {cargasPendientes.length}):
              </span>
            </div>

            {cargasPendientes.length === 0 ? (
              <div className="py-16 text-center text-[#6e588a] text-xs">
                No hay cargas de producción pendientes de revisión.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cargasPendientes.map((carga) => (
                  <div
                    key={carga.id}
                    className="bg-[#160c2b] border-2 border-[#ffbe00] p-3.5 space-y-2.5 rounded-xs shadow-[3px_3px_0px_#000] relative"
                  >
                    <div className="flex justify-between items-start border-b border-[#432874] pb-1.5">
                      <div>
                        <strong className="text-[#ffbe00] text-sm font-bold">
                          [{carga.codigo_ot}]
                        </strong>
                        <span className="text-white font-bold block text-xs mt-0.5">
                          [{carga.semielaborado_codigo}] {carga.articulo}
                        </span>
                      </div>
                      <span className="bg-[#ffbe00]/20 border border-[#ffbe00]/50 text-[#ffbe00] text-[9px] px-2 py-0.5 font-bold rounded-2xs">
                        ⏳ PENDIENTE
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-[#24173e] p-2 border border-[#432874] rounded-2xs">
                      <div>
                        <span className="text-[#a594c9] text-[10px] block">
                          CANT. BUENAS:
                        </span>
                        <strong className="text-[#24cc8f] text-sm">
                          +{carga.cant_buenos} u.
                        </strong>
                      </div>
                      <div>
                        <span className="text-[#a594c9] text-[10px] block">
                          FALLAS / SCRAP:
                        </span>
                        <strong className="text-[#f87171] text-sm">
                          {carga.cant_fallas} u.
                        </strong>
                      </div>
                    </div>

                    <div className="text-[10px] text-[#a594c9] space-y-0.5 font-mono">
                      <div>
                        Operario:{" "}
                        <strong className="text-white">
                          {carga.operario_nombre || "Operario Planta"}
                        </strong>
                      </div>
                      <div>
                        Fecha Carga:{" "}
                        <strong className="text-white">{carga.fecha}</strong>
                      </div>
                      {carga.observaciones && (
                        <div>
                          Notas:{" "}
                          <span className="text-white italic">
                            "{carga.observaciones}"
                          </span>
                        </div>
                      )}
                    </div>

                    {/* BOTONES DE APROBACIÓN SUPERVISOR */}
                    <div className="flex items-center gap-2 pt-2 border-t border-[#432874]">
                      <button
                        onClick={() => handleRechazarCarga(carga.id)}
                        className="flex-1 py-1.5 bg-[#2c1a4d] border border-[#f87171]/50 text-[#f87171] font-bold text-xs hover:bg-[#f87171] hover:text-white transition-colors rounded-2xs"
                      >
                        RECHAZAR
                      </button>
                      <button
                        onClick={() => handleAprobarCarga(carga)}
                        className="flex-2 py-1.5 bg-[#24cc8f] text-[#2c1a4d] font-bold text-xs hover:bg-[#52e0a8] transition-colors shadow-[2px_2px_0px_#000] rounded-2xs flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 size={14} /> APROBAR Y DESCONTAR STOCK
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA 3: HISTORIAL DE REGISTROS APROBADOS */}
        {activeTab === "HISTORIAL" && (
          <div className="space-y-3 font-pixel animate-in fade-in duration-200">
            <div className="border-b border-[#432874] pb-2 text-xs text-[#a594c9]">
              Cargas confirmadas con impacto aplicado en stock de Materias
              Primas ({cargasAprobadas.length}):
            </div>

            {cargasAprobadas.length === 0 ? (
              <div className="py-16 text-center text-[#6e588a] text-xs">
                Aún no hay registros aprobados.
              </div>
            ) : (
              <div className="space-y-2 border-2 border-[#432874] bg-[#160c2b] rounded-xs p-2">
                {cargasAprobadas.map((carga) => (
                  <div
                    key={carga.id}
                    className="bg-[#24173e] p-2.5 border border-[#432874] flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 font-mono text-xs rounded-2xs"
                  >
                    <div>
                      <div className="flex items-center gap-2 font-pixel">
                        <strong className="text-[#ffbe00]">
                          [{carga.codigo_ot}]
                        </strong>
                        <span className="text-white font-bold">
                          [{carga.semielaborado_codigo}] {carga.articulo}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#a594c9] mt-0.5">
                        Fecha: {carga.fecha} | Operario: {carga.operario_nombre}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 font-pixel">
                      <span className="text-[#24cc8f] font-bold text-sm">
                        +{carga.cant_buenos} u.
                      </span>
                      <span className="bg-[#24cc8f]/20 border border-[#24cc8f]/50 text-[#24cc8f] text-[9px] px-2 py-0.5 rounded-2xs font-bold flex items-center gap-1">
                        <CheckCircle2 size={10} /> APROBADO
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
