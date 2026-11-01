"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { sugeridoParaguay, CAPACIDAD_CAMION } = require("../semisGestion");
const { analizarStock, armarPanorama, seFabricaYSeSigue } = require("../agentes/vigilanteStock");
const { priorizar } = require("../agentes/produccionDecision");
const { construirInstrucciones } = require("../agentes/maruChat");

const semi = (o) => ({ codigo: "S1", nombre: "Tapa 50", stock_total: 10, demanda_mensual: 300, dias_de_stock: 1, nivel: "critico", origen: "FABRICA", seguir_demanda: 1, usado_en: [{ producto: "CONO 50" }], ...o });

test("el camión sugiere tres meses de demanda menos el stock, sin negativos", () => {
  assert.equal(sugeridoParaguay({ demanda_mensual: 1000, stock_total: 500 }), 2500);
  assert.equal(sugeridoParaguay({ demanda_mensual: 100, stock_total: 900 }), 0);
  assert.equal(CAPACIDAD_CAMION, 16000);
});

test("lo comprado, lo de Paraguay y lo que no se sigue no genera alertas de producción", () => {
  const hallazgos = analizarStock({ semis: [semi(), semi({ codigo: "S2", origen: "PARAGUAY" }), semi({ codigo: "S3", origen: "PROVEEDOR" }), semi({ codigo: "S4", seguir_demanda: 0 })] });
  assert.deepEqual(hallazgos.map((h) => h.clave), ["semi-crit:S1"]);
  assert.ok(seFabricaYSeSigue({ codigo: "x" })); // sin clasificar = se fabrica y se sigue
});

test("Romi no manda a fabricar lo de Paraguay, lo comprado ni lo que no se sigue", () => {
  const semis = [semi(), semi({ codigo: "S2", nombre: "De Paraguay", origen: "PARAGUAY" }), semi({ codigo: "S3", nombre: "Comprado", origen: "PROVEEDOR" }), semi({ codigo: "S4", nombre: "Sin seguir", seguir_demanda: 0 })];
  const r = priorizar({ semis, pedidos: [{ op: "OP1", cliente: "X", articulo: "cono 50", total: 500, completada: 0 }] });
  assert.deepEqual(r.prioridades.map((p) => p.codigo), ["S1"]);
});

test("el panorama expone el origen, y lo no seguido no cuenta como crítico", () => {
  const pano = armarPanorama({ semis: [semi(), semi({ codigo: "S2", origen: "PARAGUAY" }), semi({ codigo: "S4", seguir_demanda: 0 })] });
  assert.equal(pano.resumen.semis_criticos, 1);
  assert.equal(pano.semielaborados.find((s) => s.codigo === "S4").nivel, "sin_demanda");
  assert.equal(pano.semielaborados.find((s) => s.codigo === "S2").origen, "PARAGUAY");
});

test("las instrucciones de Romi no traen ejemplos de productos inventados", () => {
  const t = construirInstrucciones();
  assert.doesNotMatch(t, /base chica/i);
  assert.match(t, /PARAGUAY/);
  assert.match(t, /NUNCA nombres un producto/);
});
