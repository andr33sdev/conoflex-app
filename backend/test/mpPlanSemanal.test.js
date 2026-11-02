const test = require("node:test");
const assert = require("node:assert/strict");
const { armarMpSemana } = require("../mpPlanSemanal");

const stocks = new Map([[10, { id: 10, codigo: "PEAD", nombre: "PEAD", unidad: "KILOS", stock: 2000 }]]);
const recetas = { 5: [{ mp_id: 10, cantidad: 1 }] };
const item = (cantidad) => [{ id: 1, lote: "L1", semielaborado_id: 5, nombre: "Base", cantidad }];

test("1 kg por pieza, 1000 en el plan y 2000 kg de stock: quedan 1000 kg", () => {
  const r = armarMpSemana({ items: item(1000), aprobados: {}, recetas, stocks });
  assert.equal(r.length, 1);
  assert.equal(r[0].necesidad, 1000);
  assert.equal(r[0].stock_despues, 1000);
  assert.equal(r[0].falta, 0);
});

test("lo ya producido (aprobado) no vuelve a descontar: solo cuenta el restante", () => {
  const r = armarMpSemana({ items: item(1000), aprobados: { 1: 400 }, recetas, stocks });
  assert.equal(r[0].necesidad, 600);
  assert.equal(r[0].stock_despues, 1400);
});

test("si el restante supera el stock, informa cuánto falta", () => {
  const r = armarMpSemana({ items: item(3000), aprobados: {}, recetas, stocks });
  assert.equal(r[0].falta, 1000);
});

test("sin plan o con todo producido no hay materias primas para controlar", () => {
  assert.deepEqual(armarMpSemana({ items: [], aprobados: {}, recetas, stocks }), []);
  assert.equal(armarMpSemana({ items: item(100), aprobados: { 1: 150 }, recetas, stocks }).length, 0);
});
