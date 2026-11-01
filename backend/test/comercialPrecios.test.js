"use strict";
const test = require("node:test");
const assert = require("node:assert");
const P = require("../comercial/precios");

const prod = (id, codigo, precio_lista, nombre = "X") => ({ id, codigo, nombre, precio_lista });

test("textoPrecio: un precio, variantes y unidad", () => {
  assert.strictEqual(P.textoPrecio([{ etiqueta: "", valor: 5275.18 }]), "$5.275,18");
  assert.strictEqual(P.textoPrecio([{ etiqueta: "sin fijación", valor: 34303.34 }, { etiqueta: "Hormigón", valor: 55430.57 }]), "SIN FIJACIÓN $34.303,34 | HORMIGÓN $55.430,57");
  assert.strictEqual(P.textoPrecio([{ etiqueta: "", valor: 1200 }], "x metro"), "$1.200,00 x metro");
  assert.strictEqual(P.textoPrecio([]), "");
});

test("parsearJsonProductos: acepta ```, objeto con productos y rescata JSON cortado", () => {
  assert.strictEqual(P.parsearJsonProductos('```json\n[{"codigo":"1"}]\n```').length, 1);
  assert.strictEqual(P.parsearJsonProductos('{"productos":[{"codigo":"1"},{"codigo":"2"}]}').length, 2);
  const cortado = '{"productos":[{"codigo":"1","nombre":"A } B"},{"codigo":"2","nombre":"B"},{"codigo":"3","nom';
  const r = P.parsearJsonProductos(cortado);
  assert.deepStrictEqual(r.map((x) => x.codigo), ["1", "2"]);
  assert.deepStrictEqual(P.parsearJsonProductos("nada"), []);
});

test("normalizarExtraidos: números argentinos, descarta sin código o sin precio", () => {
  const { productos, descartados } = P.normalizarExtraidos([
    { codigo: "1025", nombre: "MULTIUSO", precios: [{ etiqueta: "", valor: "$5.275,18" }] },
    { codigo: "1570L-2R NA", precio: 35210.07, nota: "x metro" },
    { codigo: "2000", nombre: "Sin precio" },
    { nombre: "Sin código", precio: 10 },
    { codigo: "-", nombre: "Guion", precio: 10 },
  ]);
  assert.strictEqual(productos.length, 2);
  assert.strictEqual(productos[0].precios[0].valor, 5275.18);
  assert.strictEqual(productos[1].texto, "$35.210,07 x metro");
  assert.strictEqual(descartados.length, 3);
});

test("parsearTextoCatalogo: lee el texto que arma el Excel", () => {
  const r = P.parsearTextoCatalogo("Cód: 10\nNombre: Cono\nMedidas: 50cm\nPrecio Lista: $1.000,00\n------------------------------\nCód: 11\nNombre: Baliza\nPrecio Lista: SIN FIJACIÓN $2.000,00 | HORMIGÓN $3.000,00\n----------------------------------------");
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].precios[0].valor, 1000);
  assert.strictEqual(r[1].precios.length, 2);
});

test("comparar: cambios exactos, sin cambios, nuevos y ausentes", () => {
  const { productos } = P.normalizarExtraidos([
    { codigo: "1025", precio: 6000 },
    { codigo: "1026", precio: 1000 },
    { codigo: "9999", nombre: "Nuevo", precio: 50 },
  ]);
  const r = P.compararLista({ extraidos: productos, productos: [prod(1, "1025", "$5.000,00"), prod(2, "1026", "$1.000,00"), prod(3, "7777", "$10,00")] });
  assert.strictEqual(r.cambios.length, 1);
  assert.strictEqual(r.cambios[0].variacion, 20);
  assert.strictEqual(r.cambios[0].nuevo, "$6.000,00");
  assert.strictEqual(r.sinCambios, 1);
  assert.deepStrictEqual(r.nuevos.map((n) => n.codigo), ["9999"]);
  assert.deepStrictEqual(r.ausentes.map((a) => a.id), [3]);
  assert.ok(P.tildadoPorDefecto(r.cambios[0]));
});

test("comparar: código con sufijo es 'probable' y no viene tildado", () => {
  const { productos } = P.normalizarExtraidos([{ codigo: "1570L", precio: 200 }]);
  const r = P.compararLista({ extraidos: productos, productos: [prod(1, "1570L NA", "$100,00")] });
  assert.strictEqual(r.cambios[0].match, "probable");
  assert.ok(!P.tildadoPorDefecto(r.cambios[0]));
  assert.ok(r.cambios[0].revisar);
});

test("comparar: suba enorme pide revisión; ambiguo no se aplica solo; duplicado en la lista se ignora", () => {
  const { productos } = P.normalizarExtraidos([{ codigo: "A1", precio: 1000 }, { codigo: "A1", precio: 5 }, { codigo: "B", precio: 10 }]);
  const r = P.compararLista({ extraidos: productos, productos: [prod(1, "A1", "$100,00"), prod(2, "B 1", "$1,00"), prod(3, "B 2", "$1,00")] });
  assert.ok(r.cambios[0].revisar);
  assert.strictEqual(r.duplicados.length, 1);
  assert.ok(r.nuevos[0].aviso);
});

test("comparar: avisa si la lista casi no coincide con el sistema", () => {
  const ext = P.normalizarExtraidos([{ codigo: "Z1", precio: 1 }]).productos;
  const prods = Array.from({ length: 12 }, (_, i) => prod(i + 1, `C${i}`, "$1,00"));
  const r = P.compararLista({ extraidos: ext, productos: prods });
  assert.ok(r.avisos.length >= 1);
});

// Base falsa mínima para comprobar que aplicar solo escribe precios.
function dbFalsa(detalle, estado = "ANALIZADA", creada = Date.now()) {
  const sqls = [];
  const q = async (sql, params = []) => {
    sqls.push({ sql, params });
    if (/FROM precios_cargas WHERE id/.test(sql)) return [[{ id: 1, estado, detalle: JSON.stringify(detalle), creada }]];
    if (/FROM productos WHERE id = \? FOR UPDATE/.test(sql)) return [[{ id: params[0], precio_lista: "$1,00" }]];
    if (/FROM productos WHERE codigo/.test(sql)) return [[]];
    if (/INSERT INTO productos/.test(sql)) return [{ insertId: 99 }];
    return [[]];
  };
  return { sqls, query: q, getConnection: async () => ({ query: q, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {} }) };
}

test("aplicar: solo escribe precio_lista; respeta lo elegido", async () => {
  const detalle = { cambios: [{ id: 1, codigo: "A", nuevo: "$2,00" }, { id: 2, codigo: "B", nuevo: "$3,00" }], nuevos: [{ codigo: "N1", nombre: "Nuevo", precio: "$5,00" }, { codigo: "N2", precio: "$6,00" }] };
  const db = dbFalsa(detalle);
  const r = await P.aplicarCarga(db, { cargaId: 1, ids: [1], nuevos: ["N1"] });
  assert.strictEqual(r.actualizados, 1);
  assert.strictEqual(r.nuevos, 1);
  const updates = db.sqls.filter((s) => /^UPDATE productos/.test(s.sql));
  assert.strictEqual(updates.length, 1);
  assert.ok(!/nombre|medidas|descripcion|usos|advertencias|foto|ficha|especificacion|aplicacion|categoria/i.test(updates[0].sql.replace("precio_actualizado", "")));
  assert.ok(!db.sqls.some((s) => /N2/.test(JSON.stringify(s.params))));
});

test("aplicar: no repite una carga aplicada ni usa análisis viejos", async () => {
  const d = { cambios: [], nuevos: [] };
  assert.strictEqual((await P.aplicarCarga(dbFalsa(d, "APLICADA"), { cargaId: 1 })).status, 409);
  assert.strictEqual((await P.aplicarCarga(dbFalsa(d, "ANALIZADA", Date.now() - 7 * 3600 * 1000), { cargaId: 1 })).status, 409);
});
