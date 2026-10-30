"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../produccionPlan");

test("lunesDe devuelve el lunes de la semana (domingo cuenta para la semana anterior)", () => {
  assert.equal(P.lunesDe("2026-10-28"), "2026-10-26"); // miércoles
  assert.equal(P.lunesDe("2026-10-26"), "2026-10-26"); // lunes
  assert.equal(P.lunesDe("2026-11-01"), "2026-10-26"); // domingo
  assert.equal(P.lunesDe("2026-03-01"), "2026-02-23"); // cruza de mes
  assert.equal(P.lunesDe("2026-02-31"), null); // fecha imposible
  assert.equal(P.lunesDe("basura"), null);
});

test("sumarDias cruza fin de mes y de año", () => {
  assert.equal(P.sumarDias("2026-10-26", 6), "2026-11-01");
  assert.equal(P.sumarDias("2026-12-28", 7), "2027-01-04");
});

test("semanaISO: semana 44 de 2026 y bordes de año", () => {
  assert.deepEqual(P.semanaISO("2026-10-26"), { anio: 2026, semana: 44 });
  assert.deepEqual(P.semanaISO("2026-01-01"), { anio: 2026, semana: 1 }); // jueves: semana 1
  assert.deepEqual(P.semanaISO("2026-12-31"), { anio: 2026, semana: 53 });
  assert.deepEqual(P.semanaISO("2027-01-01"), { anio: 2026, semana: 53 }); // todavía semana 53 de 2026
  assert.deepEqual(P.semanaISO("2024-12-30"), { anio: 2025, semana: 1 }); // lunes de la semana 1 de 2025
});

test("generarLote y siguienteSecuencia", () => {
  assert.equal(P.generarLote("2026-10-26", 1), "L2644-001");
  assert.equal(P.generarLote("2026-10-26", 12), "L2644-012");
  assert.equal(P.siguienteSecuencia([]), 1);
  assert.equal(P.siguienteSecuencia(["L2644-001", "L2644-003"]), 4);
  assert.equal(P.siguienteSecuencia(["L2644-001", null, "raro"]), 2);
  assert.throws(() => P.generarLote("nada", 1));
});

const demanda = [
  { id: 1, codigo: "SE-A", nombre: "Base A", demanda_mensual: 3000, stock_total: 500 }, // diaria 100 -> 5 días de stock
  { id: 2, codigo: "SE-B", nombre: "Base B", demanda_mensual: 3000, stock_total: 10000 }, // cubierto
  { id: 3, codigo: "SE-C", nombre: "Base C", demanda_mensual: 900, stock_total: 0 }, // diaria 30, sin stock
  { id: 4, codigo: "SE-D", nombre: "Base D", demanda_mensual: 0, stock_total: 0 }, // sin demanda: no se sugiere
];

test("sugerirProduccion: cobertura, urgencia y orden", () => {
  const s = P.sugerirProduccion({ demanda, coberturaDias: 30 });
  assert.deepEqual(s.map((x) => x.codigo), ["SE-C", "SE-A"]); // C: 0 días de stock (crítica), A: 5 días (crítica) -> C primero
  const a = s.find((x) => x.codigo === "SE-A");
  assert.equal(a.cantidad_sugerida, 100 * 30 - 500); // 2500
  assert.equal(a.dias_de_stock, 5);
  assert.equal(a.urgencia, "CRITICA");
  assert.equal(a.material.estado, "SIN_RECETA");
  assert.ok(!s.find((x) => x.codigo === "SE-B"), "lo cubierto no se sugiere");
  assert.ok(!s.find((x) => x.codigo === "SE-D"), "sin demanda no se sugiere");
});

test("sugerirProduccion: descuenta lo ya planificado en la semana", () => {
  const s = P.sugerirProduccion({ demanda, planificado: { 1: 2500, 3: 100 }, coberturaDias: 30 });
  assert.ok(!s.find((x) => x.codigo === "SE-A"), "A ya está totalmente planificado");
  const c = s.find((x) => x.codigo === "SE-C");
  assert.equal(c.cantidad_sugerida, 900 - 100);
  assert.equal(c.ya_planificado, 100);
});

test("sugerirProduccion: material disponible según receta", () => {
  const recetas = {
    1: { ingenieria_id: 9, version: "v1", ingredientes: [{ mp_id: 1, codigo: "PE", nombre: "Polietileno", cantidad: 2, stock: 3000 }, { mp_id: 2, codigo: "COL", nombre: "Colorante", cantidad: 0.1, stock: 100 }] },
  };
  const s = P.sugerirProduccion({ demanda, recetas, coberturaDias: 30 });
  const a = s.find((x) => x.codigo === "SE-A");
  // PE alcanza para 1500, COL para 1000 -> limita el colorante, y 2500 pendientes no se alcanzan
  assert.equal(a.material.producible, 1000);
  assert.equal(a.material.estado, "INSUFICIENTE");
  assert.equal(a.material.limita.codigo, "COL");
  const r2 = P.sugerirProduccion({ demanda, recetas: { 1: { ingenieria_id: 9, ingredientes: [{ mp_id: 1, codigo: "PE", nombre: "PE", cantidad: 1, stock: 99999 }] } } });
  assert.equal(r2.find((x) => x.codigo === "SE-A").material.estado, "ALCANZA");
});

test("sugerirProduccion: ingredientes en cero o receta vacía cuentan como sin receta", () => {
  const s = P.sugerirProduccion({ demanda, recetas: { 1: { ingenieria_id: 9, ingredientes: [] }, 3: { ingenieria_id: 5, ingredientes: [{ mp_id: 1, codigo: "X", nombre: "X", cantidad: 0, stock: 5 }] } } });
  assert.equal(s.find((x) => x.codigo === "SE-A").material.estado, "SIN_RECETA");
  assert.equal(s.find((x) => x.codigo === "SE-C").material.estado, "SIN_RECETA");
});

test("validarLanzamiento: pide máquina, cantidad, operario y receta", () => {
  assert.equal(P.validarLanzamiento({ sin_produccion: 1 }, []).length, 1);
  assert.match(P.validarLanzamiento({ sin_produccion: 0 }, [])[0], /no tiene producción/);
  const ok = { lote: "L2644-001", semielaborado_nombre: "Base A", maquina_id: 3, cantidad: 500, operario: "Juan", receta_confirmada: 1 };
  assert.deepEqual(P.validarLanzamiento({ sin_produccion: 0 }, [ok]), []);
  const mal = P.validarLanzamiento({ sin_produccion: 0 }, [{ ...ok, maquina_id: null, operario: " ", receta_confirmada: 0, cantidad: 0 }]);
  assert.equal(mal.length, 4);
});

test("detectarChoques: misma máquina, mismo turno", () => {
  const as = [
    { id: 1, fecha: "2026-10-26", turno: "DIA", maquina_id: 1 },
    { id: 2, fecha: "2026-10-26", turno: "DIA", maquina_id: 1 },
    { id: 3, fecha: "2026-10-26", turno: "NOCHE", maquina_id: 1 },
    { id: 4, fecha: "2026-10-26", turno: "DIA", maquina_id: null },
  ];
  const c = P.detectarChoques(as);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].asignaciones, [1, 2]);
});

test("validarCarga: números enteros, fallas dentro del total", () => {
  assert.match(P.validarCarga({}).error, /total/);
  assert.match(P.validarCarga({ total_producido: 0 }).error, /total/);
  assert.match(P.validarCarga({ total_producido: 10.5 }).error, /entero/);
  assert.match(P.validarCarga({ total_producido: 10, fallas: 11 }).error, /más que el total/);
  assert.match(P.validarCarga({ total_producido: 10, fallas: -1 }).error, /fallas/);
  assert.match(P.validarCarga({ total_producido: 10, ciclos: 1.5 }).error, /ciclos/);
  assert.match(P.validarCarga({ total_producido: 10, kg_por_producto: -2 }).error, /kg/);
  const r = P.validarCarga({ total_producido: "120", fallas: "", ciclos: "40", kg_por_producto: "2.5", color: " Naranja ", codigo_material: "PE-01" });
  assert.deepEqual(r.valores, { total_producido: 120, fallas: 0, ciclos: 40, kg_por_producto: 2.5, color: "Naranja", codigo_material: "PE-01", observaciones: "" });
});

test("calcularEfectosCarga: buenas = total - fallas; la materia prima se consume por todas las piezas", () => {
  const r = P.calcularEfectosCarga(
    { total_producido: 100, fallas: 8, kg_por_producto: 2 },
    [{ mp_id: 1, codigo: "PE", nombre: "PE", cantidad: 1.8 }, { mp_id: 2, codigo: "COL", nombre: "COL", cantidad: 0.05, unidad: "Kg" }, { mp_id: 3, codigo: "NADA", nombre: "N", cantidad: 0 }],
  );
  assert.equal(r.buenas, 92);
  assert.equal(r.kg_total, 200);
  assert.equal(r.kg_fallas, 16);
  assert.deepEqual(r.consumos.map((c) => [c.codigo, c.cantidad]), [["PE", 180], ["COL", 5]]);
});
