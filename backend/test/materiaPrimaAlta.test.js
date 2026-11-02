const test = require("node:test");
const assert = require("node:assert/strict");
const { validarAltaMP, crearMateriaPrima } = require("../materiaPrimaAlta");

test("alta: normaliza código, unidad y planta, y exige código y nombre", () => {
  const v = validarAltaMP({ codigo: "  pe-nat ", nombre: " Polietileno natural ", unidad_medida: "kilos", proveedor_id: "3", stock_minimo: "1,5" });
  assert.deepEqual(v.valores, { codigo: "PE-NAT", nombre: "Polietileno natural", unidad_medida: "KILOS", planta: "Argentina", stock_minimo: 1.5, stock_inicial: 0, proveedor_id: 3 });
  assert.match(validarAltaMP({ nombre: "x" }).error, /código/);
  assert.match(validarAltaMP({ codigo: "A" }).error, /nombre/);
  assert.match(validarAltaMP({ codigo: "A", nombre: "x", unidad_medida: "TONELADAS" }).error, /unidad/);
  assert.match(validarAltaMP({ codigo: "A", nombre: "x", stock_minimo: -1 }).error, /punto de pedido/);
  assert.match(validarAltaMP({ codigo: "A", nombre: "x", planta: "Chile" }).error, /planta/);
});

// Base falsa mínima: guarda lo que se inserta.
function baseFalsa({ codigos = [], proveedores = [1] } = {}) {
  const log = { insert: null, mov: null };
  const q = async (sql, p) => {
    if (/information_schema/.test(sql)) return [[{ c: "proveedor_id" }, { c: "planta" }, { c: "stock_minimo" }]];
    if (/FROM proveedores/.test(sql)) return [proveedores.includes(p[0]) ? [{ id: p[0] }] : []];
    if (/UPPER\(codigo\)/.test(sql)) return [codigos.includes(p[0]) ? [{ id: 9, nombre: "Ya existe" }] : []];
    if (/INSERT INTO materias_primas/.test(sql)) { log.insert = p; return [{ insertId: 7 }]; }
    if (/SELECT \* FROM materias_primas/.test(sql)) return [[{ id: 7 }]];
    return [[]];
  };
  const conn = { query: q, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {} };
  return { db: { query: q, getConnection: async () => conn }, log };
}

test("alta: crea la materia prima con su proveedor; código repetido y proveedor inexistente se rechazan", async () => {
  const { db, log } = baseFalsa({ codigos: ["REPE"] });
  const ok = await crearMateriaPrima(db, { codigo: "pig-01", nombre: "Pigmento", unidad_medida: "KILOS", proveedor_id: 1 }, { rol: "USER" }, async () => {});
  assert.equal(ok.status, 201);
  assert.deepEqual(log.insert, ["PIG-01", "Pigmento", "KILOS", 0, "Argentina", 1, 0]);
  assert.equal((await crearMateriaPrima(db, { codigo: "repe", nombre: "x" }, {}, async () => {})).status, 409);
  assert.equal((await crearMateriaPrima(db, { codigo: "n1", nombre: "x", proveedor_id: 99 }, {}, async () => {})).status, 400);
});

test("alta: el stock inicial solo lo carga un admin y deja movimiento", async () => {
  const { db } = baseFalsa();
  assert.equal((await crearMateriaPrima(db, { codigo: "a", nombre: "x", stock_inicial: 50 }, { rol: "USER" }, async () => {})).status, 403);
  let mov = null;
  const r = await crearMateriaPrima(db, { codigo: "a", nombre: "x", stock_inicial: 50 }, { rol: "ADMIN", nombre: "Ana" }, async (_c, m) => { mov = m; });
  assert.equal(r.status, 201);
  assert.equal(mov.delta, 50);
  assert.equal(mov.tipo, "AJUSTE_MANUAL");
});
