"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { armarFicha } = require("../agentes/fichaOperario");
const { priorizar, usaSemi, lunesDe } = require("../agentes/produccionDecision");
const { HERRAMIENTAS, construirInstrucciones } = require("../agentes/maruChat");
const { AGENTES } = require("../agentes");

test("Romi existe, tiene su permiso y una voz propia", () => {
  const m = AGENTES.find((a) => a.id === "produccion");
  assert.equal(m.nombre, "Romi");
  assert.equal(m.permiso, "agente:produccion");
  assert.equal(new Set(AGENTES.map((a) => a.voz)).size, AGENTES.length);
});

test("Romi solo tiene herramientas de producción", () => {
  const nombres = HERRAMIENTAS[0].functionDeclarations.map((f) => f.name).sort();
  assert.deepEqual(nombres, ["calculadora", "pedidos_abiertos", "personal_en_planta", "panorama_produccion", "plan_semana", "que_fabricar_primero"].sort());
  assert.match(construirInstrucciones(), /única y exclusiva/);
});

test("lunesDe devuelve el lunes de la semana", () => {
  assert.equal(lunesDe(new Date(2026, 9, 31)), "2026-10-26"); // sábado
  assert.equal(lunesDe(new Date(2026, 9, 26)), "2026-10-26");
  assert.equal(lunesDe(new Date(2026, 9, 25)), "2026-10-19"); // domingo
});

const semi = (o) => ({ codigo: "S1", nombre: "Base chica", stock_total: 100, demanda_mensual: 400, dias: 7, nivel: "critico", usado_en: [{ producto: "CONO 50", aporte_mensual: 400 }], ...o });

test("un pedido abierto que usa el semielaborado lo sube en la lista", () => {
  const pedidos = [{ op: "OP-1", cliente: "Vial SA", articulo: "cono 50", total: 1000, completada: 200 }];
  assert.ok(usaSemi(semi(), pedidos[0]));
  const r = priorizar({ semis: [semi(), semi({ codigo: "S2", nombre: "Tapa", usado_en: [{ producto: "LOMO" }], nivel: "critico", dias: 6 })], pedidos });
  assert.equal(r.prioridades[0].codigo, "S1");
  assert.equal(r.prioridades[0].a_fabricar, 700); // 800 por entregar vs 400 de demanda → 800 - 100
  assert.ok(r.prioridades[0].motivos.some((m) => /pedido abierto/.test(m)));
  assert.equal(r.pedidos_abiertos, 1);
});

test("lo que ya está en el plan baja de prioridad y lo que está en orden no aparece", () => {
  const plan = [{ codigo: "S1", planificado: 500, producido: 100 }];
  const r = priorizar({ semis: [semi(), semi({ codigo: "S3", nombre: "Ok", nivel: "ok", dias: 60, stock_total: 5000 })], pedidos: [], plan });
  assert.equal(r.prioridades.length, 1);
  assert.ok(r.prioridades[0].motivos.some((m) => /plan de la semana/.test(m)));
  assert.equal(r.prioridades.find((p) => p.codigo === "S3"), undefined);
});

test("materias primas críticas generan un ojo", () => {
  assert.match(priorizar({ semis: [semi()], mpsCriticas: 2 }).ojo_materia_prima, /2 materias primas críticas/);
});

const mesCon = (n, extra, tarde) => ({
  horas_normales: n, horas_extra: extra, dias: new Array(Math.round(n / 9)).fill({}),
  presentismo: tarde ? { meses: [{ mes: tarde.mes, llegadas_tarde: tarde.l, pierde_presentismo_del_mes: tarde.l.length > 2 }] } : { llegadas_tarde_en_el_periodo: 0 },
});

test("la ficha suma meses, llegadas tarde y marca los meses sin presentismo", () => {
  const lt = (d) => ({ fecha: `2026-03-${d}`, dia: "lun", ingreso: "07:20", minutos_tarde: 20, turno: "diurno" });
  const porMes = new Array(12).fill(null);
  porMes[0] = mesCon(180, 10);
  porMes[1] = { error: "No hay fichadas" };
  porMes[2] = mesCon(171, 4, { mes: "2026-03", l: [lt("02"), lt("09"), lt("16")] });
  const f = armarFicha("PEREZ JUAN", 2026, porMes, { hastaMes: 3 });
  assert.equal(f.meses.length, 3);
  assert.equal(f.resumen.meses_con_datos, 2);
  assert.equal(f.resumen.horas_normales, 351);
  assert.equal(f.resumen.horas_extra, 14);
  assert.equal(f.resumen.llegadas_tarde, 3);
  assert.deepEqual(f.resumen.meses_sin_presentismo, ["Marzo"]);
  assert.equal(f.resumen.promedio_extra_por_mes, 7);
  assert.equal(f.llegadas_tarde[0].fecha, "2026-03-16"); // la más reciente primero
  assert.equal(f.meses[1].con_datos, false);
});
