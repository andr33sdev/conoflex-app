const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../ingenieriaFormula");

const base = [
  { mp_id: 1, codigo: "GBD", nombre: "Grumo baja densidad", kg_tachada: 20 },
  { mp_id: 2, codigo: "PE50", nombre: "Polietileno grado 50", kg_tachada: 4 },
  { mp_id: 3, codigo: "MB-NEG", nombre: "Masterbatch negro", kg_tachada: 0.2 },
];

test("porcentajes sobre el total de la tachada", () => {
  assert.equal(F.totalTachada(base), 24.2);
  const p = F.conPorcentajes(base);
  assert.ok(Math.abs(p[0].pct - 82.6446) < 0.001);
  assert.ok(Math.abs(p.reduce((a, l) => a + l.pct, 0) - 100) < 0.001);
});

test("kg por pieza: pieza de 1,48 kg", () => {
  const c = F.cantidadesPorPieza(base, 1.48);
  assert.ok(Math.abs(c[0].kg_pieza - 1.223140) < 0.0001);
  assert.ok(Math.abs(c[1].kg_pieza - 0.244628) < 0.0001);
  assert.ok(Math.abs(c[2].kg_pieza - 0.012231) < 0.0001);
  assert.ok(Math.abs(c.reduce((a, l) => a + l.kg_pieza, 0) - 1.48) < 0.00001);
});

test("validarLineas: vacío, sin material, repetido, cantidad cero, coma decimal", () => {
  assert.ok(F.validarLineas([]).error);
  assert.ok(F.validarLineas([{ kg_tachada: 1 }]).error);
  assert.ok(F.validarLineas([{ mp_id: 1, kg_tachada: 1 }, { mp_id: 1, kg_tachada: 2 }]).error);
  assert.ok(F.validarLineas([{ mp_id: 1, kg_tachada: 0 }]).error);
  assert.equal(F.validarLineas([{ mp_id: 1, kg_tachada: "0,2" }]).lineas[0].kg_tachada, 0.2);
});

test("misma proporción con otra tachada no es una diferencia", () => {
  const doble = base.map((l) => ({ ...l, kg_tachada: l.kg_tachada * 2 }));
  assert.equal(F.compararFormulas({ lineas: base, peso: 1.48 }, { lineas: doble, peso: 1.48 }).distinta, false);
});

test("detecta material nuevo, faltante y cambio de porcentaje", () => {
  const usada = [
    { mp_id: 1, codigo: "GBD", nombre: "Grumo", kg_tachada: 18 },
    { mp_id: 2, codigo: "PE50", nombre: "PE", kg_tachada: 6 },
    { mp_id: 9, codigo: "CAL", nombre: "Carbonato", kg_tachada: 0.2 },
  ];
  const r = F.compararFormulas({ lineas: base, peso: 1.48 }, { lineas: usada, peso: 1.48 });
  assert.equal(r.distinta, true);
  const tipos = r.diferencias.map((d) => `${d.tipo}:${d.mp_id}`).sort();
  assert.deepEqual(tipos, ["cambio:1", "cambio:2", "falta:3", "nuevo:9"]);
});

test("peso: dentro de la tolerancia no alerta, fuera sí", () => {
  assert.equal(F.compararFormulas({ lineas: base, peso: 1.48 }, { lineas: base, peso: 1.49 }).distinta, false);
  const r = F.compararFormulas({ lineas: base, peso: 1.48 }, { lineas: base, peso: 1.6 });
  assert.equal(r.distinta, true);
  assert.deepEqual(r.peso, { definido: 1.48, usado: 1.6 });
});

test("firma igual para la misma fórmula, distinta si cambia", () => {
  assert.equal(F.firma({ peso: 1.48, lineas: base }), F.firma({ peso: 1.48, lineas: [...base].reverse() }));
  assert.notEqual(F.firma({ peso: 1.48, lineas: base }), F.firma({ peso: 1.5, lineas: base }));
});
