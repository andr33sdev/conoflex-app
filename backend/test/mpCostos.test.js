const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../mpCostos");

test("unidades del Excel → unidades de la app", () => {
  assert.equal(C.unidadDesdeExcel("UN"), "UNIDADES");
  assert.equal(C.unidadDesdeExcel("unid"), "UNIDADES");
  assert.equal(C.unidadDesdeExcel("KG"), "KILOS");
  assert.equal(C.unidadDesdeExcel("METRO"), "METROS");
  assert.equal(C.unidadDesdeExcel("M2"), "M2");
  assert.equal(C.unidadDesdeExcel("LITRO"), "LITROS");
  assert.equal(C.unidadDesdeExcel("ROLLO"), "ROLLOS");
  assert.equal(C.unidadDesdeExcel("raro"), "UNIDADES");
});

test("comparar con el Excel: esquiva las que existen, da de alta las nuevas, propone borrar las que sobran", () => {
  const filas = [
    { codigo: " mt_ cabezal_flash ", nombre: "Cabezal", unidad: "UN" },
    { codigo: "PEAD", nombre: "Polietileno", unidad: "KG" },
    { codigo: "PEAD", nombre: "repetida", unidad: "KG" },
    { codigo: "", nombre: "vacía" },
  ];
  const actuales = [
    { id: 1, codigo: "PEAD", nombre: "Polietileno AD", unidad_medida: "KILOS", stock_actual: 100 },
    { id: 2, codigo: "VIEJA", nombre: "Ya no se usa", unidad_medida: "KILOS", stock_actual: 5 },
    { id: 3, codigo: "EN RECETA", nombre: "Pigmento", unidad_medida: "KILOS", stock_actual: 0 },
  ];
  const r = C.compararConExcel(filas, actuales, new Map([[3, ["CONO 75 · V1 (activa)"]]]));
  assert.equal(r.total_excel, 2);
  assert.equal(r.iguales, 1);
  assert.deepEqual(r.nuevas, [{ codigo: "MT_ CABEZAL_FLASH", nombre: "Cabezal", unidad_medida: "UNIDADES" }]);
  assert.deepEqual(r.eliminar.map((m) => m.id), [3, 2]); // primero las que se usan en recetas
  assert.deepEqual(r.eliminar[0].recetas, ["CONO 75 · V1 (activa)"]);
});

test("costo de semielaborados y terminados por receta activa, con faltantes", () => {
  const nombres = {
    mp: new Map([
      [1, { codigo: "PEAD", nombre: "Polietileno", unidad: "KILOS" }],
      [2, { codigo: "PIG", nombre: "Pigmento", unidad: "KILOS" }],
      [3, { codigo: "TORN", nombre: "Tornillo", unidad: "UNIDADES" }],
    ]),
    se: new Map([
      [10, { codigo: "BASE", nombre: "Base" }],
      [11, { codigo: "CUERPO", nombre: "Cuerpo" }],
      [12, { codigo: "SINRECETA", nombre: "Sin receta" }],
    ]),
  };
  const costosMP = new Map([[1, 2], [2, 10], [3, null]]);
  const recetas = [
    { id: 100, semielaborado_id: 10, producto_terminado_id: null },
    { id: 101, semielaborado_id: 11, producto_terminado_id: null },
    { id: 200, semielaborado_id: null, producto_terminado_id: 50 },
    { id: 201, semielaborado_id: null, producto_terminado_id: 51 },
  ];
  const detalles = [
    { ingenieria_id: 100, materia_prima_id: 1, semielaborado_id: null, cantidad: 1.5 }, // 3
    { ingenieria_id: 100, materia_prima_id: 2, semielaborado_id: null, cantidad: 0.02 }, // 0.2
    { ingenieria_id: 101, materia_prima_id: null, semielaborado_id: 10, cantidad: 2 }, // 6.4 (semi dentro de semi)
    { ingenieria_id: 200, materia_prima_id: null, semielaborado_id: 11, cantidad: 1 }, // 6.4
    { ingenieria_id: 200, materia_prima_id: null, semielaborado_id: 10, cantidad: 1 }, // 3.2
    { ingenieria_id: 200, materia_prima_id: 1, semielaborado_id: null, cantidad: 0.5 }, // 1
    { ingenieria_id: 201, materia_prima_id: 3, semielaborado_id: null, cantidad: 4 }, // sin costo
    { ingenieria_id: 201, materia_prima_id: null, semielaborado_id: 12, cantidad: 1 }, // sin receta
    { ingenieria_id: 201, materia_prima_id: 2, semielaborado_id: null, cantidad: 1 }, // 10
  ];
  const r = C.calcularCostos({ costosMP, recetas, detalles, nombres });
  assert.equal(r.se.get(10).costo, 3.2);
  assert.equal(r.se.get(10).completo, true);
  assert.equal(r.se.get(11).costo, 6.4);
  assert.equal(r.se.get(12).sin_receta, true);
  assert.equal(r.pt.get(50).costo, 10.6);
  assert.equal(r.pt.get(50).completo, true);
  assert.equal(r.pt.get(50).lineas.length, 3);
  assert.equal(r.pt.get(51).costo, 10); // suma lo que tiene costo
  assert.equal(r.pt.get(51).completo, false);
  assert.deepEqual(r.pt.get(51).faltan.sort(), ["MP TORN", "SE SINRECETA (sin receta)"]);
});

test("receta circular no cuelga el cálculo", () => {
  const r = C.calcularCostos({
    costosMP: new Map(),
    recetas: [{ id: 1, semielaborado_id: 10 }, { id: 2, semielaborado_id: 11 }],
    detalles: [{ ingenieria_id: 1, semielaborado_id: 11, cantidad: 1 }, { ingenieria_id: 2, semielaborado_id: 10, cantidad: 1 }],
    nombres: { mp: new Map(), se: new Map([[10, { codigo: "A" }], [11, { codigo: "B" }]]) },
  });
  assert.equal(r.se.get(10).completo, false);
  assert.ok(r.se.get(10).faltan.some((f) => /circular/.test(f)));
});

test("validar costo: vacío, coma decimal, miles y negativos", () => {
  assert.deepEqual(C.validarCosto(""), { costo: null });
  assert.deepEqual(C.validarCosto("2,6"), { costo: 2.6 });
  assert.deepEqual(C.validarCosto("1.234,5"), { costo: 1234.5 });
  assert.deepEqual(C.validarCosto("2.6"), { costo: 2.6 });
  assert.deepEqual(C.validarCosto(0), { costo: 0 });
  assert.match(C.validarCosto("-1").error, /mayor o igual/);
  assert.match(C.validarCosto("abc").error, /número/);
});

// ---------------------------------------------------------------- con base de datos real (se saltea si no hay MySQL)
async function conBase(fn) {
  let mysql;
  try {
    mysql = require("mysql2/promise");
  } catch {
    return;
  }
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch {
    if (pool) await pool.end().catch(() => {});
    return;
  }
  try {
    for (const t of ["ingenieria_detalles", "ingenierias", "mp_costos", "mp_costos_historial", "mp_costos_avisos", "mp_eliminadas", "sugerencias_compra", "estado_pedidos", "productos_terminados", "semielaborados", "materias_primas"]) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await pool.query("CREATE TABLE materias_primas (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(255) UNIQUE NOT NULL, nombre VARCHAR(255) NOT NULL, unidad_medida VARCHAR(50) DEFAULT 'Unidades', stock_actual DOUBLE DEFAULT 0, orden INT DEFAULT 0)");
    await pool.query("CREATE TABLE semielaborados (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(255) UNIQUE NOT NULL, nombre VARCHAR(255) NOT NULL)");
    await pool.query("CREATE TABLE productos_terminados (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(255) UNIQUE NOT NULL, nombre VARCHAR(255) NOT NULL, promedio_ventas_mensual DOUBLE DEFAULT 0, orden INT DEFAULT 0)");
    await pool.query("CREATE TABLE ingenierias (id INT AUTO_INCREMENT PRIMARY KEY, semielaborado_id INT, producto_terminado_id INT, nombre_version VARCHAR(255) NOT NULL, es_activa INT DEFAULT 1, FOREIGN KEY (semielaborado_id) REFERENCES semielaborados (id) ON DELETE CASCADE, FOREIGN KEY (producto_terminado_id) REFERENCES productos_terminados (id) ON DELETE CASCADE)");
    await pool.query("CREATE TABLE ingenieria_detalles (id INT AUTO_INCREMENT PRIMARY KEY, ingenieria_id INT NOT NULL, materia_prima_id INT, semielaborado_id INT, cantidad DOUBLE NOT NULL, unidad_medida VARCHAR(50), FOREIGN KEY (ingenieria_id) REFERENCES ingenierias (id) ON DELETE CASCADE, FOREIGN KEY (materia_prima_id) REFERENCES materias_primas (id) ON DELETE CASCADE, FOREIGN KEY (semielaborado_id) REFERENCES semielaborados (id) ON DELETE CASCADE)");
    await pool.query("CREATE TABLE estado_pedidos (id INT AUTO_INCREMENT PRIMARY KEY, modelo VARCHAR(255))");
    await pool.query("CREATE TABLE sugerencias_compra (id INT AUTO_INCREMENT PRIMARY KEY, materia_prima_id INT NOT NULL, estado VARCHAR(20) DEFAULT 'PENDIENTE')");
    await C.asegurarTablasCostos(pool);
    await fn(pool);
  } finally {
    await pool.end();
  }
}

test("con base: sincroniza con el Excel, respalda lo borrado y calcula costos", () =>
  conBase(async (db) => {
    await db.query("INSERT INTO materias_primas (id, codigo, nombre, unidad_medida, stock_actual) VALUES (1,'PEAD','Polietileno','KILOS',500),(2,'VIEJA','Vieja','KILOS',3),(3,'PIG VIEJO','Pigmento viejo','KILOS',0)");
    await db.query("INSERT INTO semielaborados (id, codigo, nombre) VALUES (10,'BASE','Base')");
    await db.query("INSERT INTO ingenierias (id, semielaborado_id, nombre_version) VALUES (100, 10, 'V1')");
    await db.query("INSERT INTO ingenieria_detalles (ingenieria_id, materia_prima_id, cantidad) VALUES (100,1,1.5),(100,3,0.1)");
    await db.query("INSERT INTO sugerencias_compra (materia_prima_id, estado) VALUES (2,'PENDIENTE'),(2,'APROBADA')");
    await db.query("INSERT INTO estado_pedidos (modelo) VALUES (' cono75 '),('CONO75'),(''),(NULL),('KIT1')");

    const filas = [{ codigo: "pead", nombre: "otro nombre", unidad: "KG" }, { codigo: "NUEVA1", nombre: "Nueva", unidad: "UN" }, { codigo: "NUEVA2", nombre: "Otra", unidad: "M2" }];
    const prev = await C.previsualizar(db, filas);
    assert.equal(prev.iguales, 1);
    assert.deepEqual(prev.nuevas.map((n) => n.codigo), ["NUEVA1", "NUEVA2"]);
    assert.deepEqual(prev.eliminar.map((m) => [m.codigo, m.recetas.length]), [["PIG VIEJO", 1], ["VIEJA", 0]]);

    // El admin borra solo la que no está en recetas; además manda un id que no corresponde (se ignora).
    const r = await C.aplicar(db, filas, [2, 1], "Andrés");
    assert.deepEqual(r, { altas: 2, bajas: 1, iguales: 1, lineas_receta_borradas: 0, quedaron_sin_borrar: 1 });
    const [mps] = await db.query("SELECT codigo, stock_actual, nombre FROM materias_primas ORDER BY codigo");
    assert.deepEqual(mps.map((m) => [m.codigo, m.stock_actual]), [["NUEVA1", 0], ["NUEVA2", 0], ["PEAD", 500], ["PIG VIEJO", 0]]);
    assert.equal(mps.find((m) => m.codigo === "PEAD").nombre, "Polietileno"); // la existente no se toca
    const [sug] = await db.query("SELECT estado FROM sugerencias_compra");
    assert.deepEqual(sug.map((s) => s.estado), ["APROBADA"]);
    const [resp] = await db.query("SELECT codigo, eliminada_por FROM mp_eliminadas");
    assert.deepEqual(resp, [{ codigo: "VIEJA", eliminada_por: "Andrés" }]);

    // Borrar la que está en receta: se va la línea de la receta y queda respaldada.
    const r2 = await C.aplicar(db, filas, [3]);
    assert.equal(r2.lineas_receta_borradas, 1);
    const [[lin]] = await db.query("SELECT lineas_receta FROM mp_eliminadas WHERE codigo = 'PIG VIEJO'");
    assert.equal(JSON.parse(lin.lineas_receta)[0].cantidad, 0.1);
    const [quedan] = await db.query("SELECT materia_prima_id FROM ingenieria_detalles");
    assert.deepEqual(quedan, [{ materia_prima_id: 1 }]);

    // Costos: PT desde estado_pedidos, receta de PT con semi + MP.
    await db.query("INSERT INTO mp_costos (materia_prima_id, costo) VALUES (1, 2)");
    const c0 = await C.costosCompletos(db);
    assert.deepEqual(c0.productos.map((p) => p.codigo), ["CONO75", "KIT1"]);
    const cono = c0.productos.find((p) => p.codigo === "CONO75");
    await db.query("INSERT INTO ingenierias (id, producto_terminado_id, nombre_version) VALUES (200, ?, 'V1')", [cono.id]);
    const [[nueva1]] = await db.query("SELECT id FROM materias_primas WHERE codigo = 'NUEVA1'");
    await db.query("INSERT INTO ingenieria_detalles (ingenieria_id, semielaborado_id, cantidad) VALUES (200, 10, 1)");
    await db.query("INSERT INTO ingenieria_detalles (ingenieria_id, materia_prima_id, cantidad) VALUES (200, ?, 2)", [nueva1.id]);
    const c1 = await C.costosCompletos(db);
    const p = c1.productos.find((x) => x.codigo === "CONO75");
    assert.equal(p.costo, 3); // base 1,5 kg × 2
    assert.equal(p.completo, false);
    assert.deepEqual(p.faltan, ["MP NUEVA1"]);
    await db.query("INSERT INTO mp_costos (materia_prima_id, costo) VALUES (?, 0.25)", [nueva1.id]);
    const p2 = (await C.costosCompletos(db)).productos.find((x) => x.codigo === "CONO75");
    assert.equal(p2.costo, 3.5);
    assert.equal(p2.completo, true);
    assert.equal(c1.materias.find((m) => m.codigo === "PEAD").costo, 2);
  }));
