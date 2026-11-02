"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { cargarSemanaDetallada, sugerirReparto, detalleDia, estadoAsignacion } = require("../agentes/produccionDiaria");
const { HERRAMIENTAS } = require("../agentes/maruChat");

// Pool falso: responde según la tabla que consulta la query.
function poolFalso() {
  return {
    async query(sql) {
      if (/FROM prod_plan_items/.test(sql)) return [[{ id: 1, lote: "L1", nombre: "Delineador 90", planificado: 2000 }, { id: 2, lote: "L2", nombre: "Tapa", planificado: 600 }]];
      if (/FROM prod_asignaciones/.test(sql)) return [[
        { id: 10, item_id: 1, fecha: "2026-10-26", turno: "DIA", cantidad: 500, operario: "Juan", maquina: "Inyectora 1" },
        { id: 11, item_id: 1, fecha: "2026-10-28", turno: "DIA", cantidad: 500, operario: null, maquina: "Inyectora 1" },
      ]];
      if (/FROM prod_turnos/.test(sql)) return [[{ fecha: "2026-10-27", turno: "DIA", sin_produccion: 1, motivo: "Feriado", lanzado: 0, comentario: null }]];
      if (/FROM prod_cargas/.test(sql)) return [[{ id: 1, asignacion_id: 10, item_id: 1, fecha: "2026-10-26", turno: "DIA", operario: "Juan", maquina: "Inyectora 1", modelo_nombre: "Delineador 90", total_producido: 480, fallas: 20, estado: "APROBADA" }]];
      if (/FROM prod_maquinas/.test(sql)) return [[{ nombre: "Inyectora 1" }, { nombre: "Inyectora 2" }]];
      return [[]];
    },
  };
}

test("estadoAsignacion distingue aprobada, pendiente, rechazada y sin cargar", () => {
  assert.equal(estadoAsignacion([]).estado, "sin_cargar");
  assert.equal(estadoAsignacion([{ estado: "APROBADA", total_producido: 100, fallas: 10, operario: "A" }]).producido, 90);
  assert.equal(estadoAsignacion([{ estado: "PENDIENTE", total_producido: 50, fallas: 0 }]).estado, "pendiente_de_aprobar");
  assert.equal(estadoAsignacion([{ estado: "RECHAZADA", total_producido: 50, fallas: 0 }]).estado, "rechazada");
});

test("una producción cargada en partes por dos operarios suma las partes", () => {
  const e = estadoAsignacion([
    { estado: "PENDIENTE", total_producido: 300, fallas: 10, operario: "Pedro" },
    { estado: "APROBADA", total_producido: 200, fallas: 20, operario: "Juan" },
    { estado: "RECHAZADA", total_producido: 999, fallas: 0, operario: "Ana" },
  ]);
  assert.equal(e.producido, 470);
  assert.equal(e.fallas, 30);
  assert.equal(e.estado, "pendiente_de_aprobar");
  assert.equal(e.cargo, "Pedro, Juan");
  assert.equal(estadoAsignacion([{ estado: "APROBADA", total_producido: 10, fallas: 0, operario: "A" }, { estado: "APROBADA", total_producido: 5, fallas: 1, operario: "B" }]).estado, "aprobada");
});

test("partesDe resume las partes vigentes de la más vieja a la más nueva", () => {
  const { partesDe } = require("../produccionRutas");
  const r = partesDe([
    { id: 3, estado: "PENDIENTE", total_producido: 300, fallas: 10, operario: "Pedro" },
    { id: 2, estado: "RECHAZADA", total_producido: 50, fallas: 0, operario: "Ana" },
    { id: 1, estado: "APROBADA", total_producido: 200, fallas: 20, operario: "Juan" },
  ]);
  assert.deepEqual(r.cargas.map((c) => c.operario), ["Juan", "Pedro"]);
  assert.equal(r.buenas_total, 470);
  assert.equal(r.fallas_total, 30);
  assert.equal(r.carga_estado, "PENDIENTE");
  assert.equal(partesDe([]).carga_estado, null);
});

test("la semana trae día por día máquina, operario, cantidad y lo producido", async () => {
  const s = await cargarSemanaDetallada(poolFalso(), new Date("2026-10-28T15:00:00Z")); // miércoles
  assert.equal(s.lunes, "2026-10-26");
  assert.equal(s.dia_hoy, "miércoles");
  const lunes = s.dias[0].turnos[0].asignaciones[0];
  assert.deepEqual([lunes.maquina, lunes.operario, lunes.planificado, lunes.producido, lunes.estado], ["Inyectora 1", "Juan", 500, 460, "aprobada"]);
  assert.equal(s.dias[1].turnos[0].sin_produccion, true);
  const mier = s.dias[2].turnos[0].asignaciones[0];
  assert.equal(mier.operario, "sin operario");
  assert.equal(mier.estado, "sin_cargar");
  const l1 = s.lotes[0];
  assert.deepEqual([l1.producido_aprobado, l1.falta, l1.ya_asignado_de_hoy_en_adelante, l1.sin_asignar], [460, 1540, 500, 1040]);
  assert.equal(detalleDia(s, "2026-12-01").error != null, true);
});

test("el reparto usa turnos libres de hoy en adelante, evita choques y respeta el rendimiento", async () => {
  const s = await cargarSemanaDetallada(poolFalso(), new Date("2026-10-28T15:00:00Z"));
  const r = sugerirReparto(s, [{ nombre: "Delineador 90", maquina: "Inyectora 2", cargas: 5, por_turno: 600 }]);
  assert.ok(r.propuesta.length > 0);
  for (const p of r.propuesta) {
    assert.ok(p.fecha >= "2026-10-28" && p.fecha <= "2026-10-30");
    assert.notEqual(p.fecha, "2026-10-27");
  }
  const choques = new Set(r.propuesta.map((p) => `${p.fecha}|${p.turno}|${p.maquina}`));
  assert.equal(choques.size, r.propuesta.length);
  const delin = r.propuesta.filter((p) => p.lote === "L1");
  assert.equal(delin.reduce((a, p) => a + p.cantidad, 0) + (r.sin_lugar_en_la_semana.find((x) => x.lote === "L1")?.sin_lugar || 0), 1040);
  assert.ok(delin.every((p) => p.maquina === "Inyectora 2"));
});

test("Romi tiene las herramientas del detalle diario", () => {
  const nombres = HERRAMIENTAS[0].functionDeclarations.map((f) => f.name);
  for (const n of ["produccion_del_dia", "produccion_semana_por_dia", "faltante_semana", "proponer_reparto"]) assert.ok(nombres.includes(n), n);
});
