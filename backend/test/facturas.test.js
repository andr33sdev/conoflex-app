const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../facturas");

const fac = (over = {}) => ({
  empresa: "CONOPLAS",
  codigo_tipo: "001",
  tipo: "FACTURA",
  letra: "A",
  punto_venta: "0002",
  numero: "00015233",
  fecha: "2026-11-06",
  cliente_cuit: "30708706392",
  cliente_nombre: "Cliente SA",
  total: 100,
  items: [
    { codigo: "2051-1R NA", descripcion: "Cono ciudad 50", unidad: "UN", cantidad: 100, precio_unitario: 10, subtotal: 1000 },
    { codigo: "4000-2R", descripcion: "Calza 2R", unidad: "PAR", cantidad: 80, precio_unitario: 5, subtotal: 400 },
  ],
  ...over,
});

test("valida comprobantes del lector", () => {
  assert.equal(F.validarComprobante(fac()).c.signo, 1);
  assert.equal(F.validarComprobante(fac({ tipo: "NOTA_CREDITO" })).c.signo, -1);
  assert.equal(F.validarComprobante(fac({ tipo: "NOTA_DEBITO" })).c.signo, 0);
  assert.match(F.validarComprobante(fac({ tipo: "OTRA" })).error, /tipo/);
  assert.match(F.validarComprobante(fac({ fecha: "6/11/2026" })).error, /fecha/);
  assert.match(F.validarComprobante(fac({ items: [{ codigo: "", cantidad: 1 }] })).error, /ítem/);
  assert.equal(F.validarComprobante(fac({ empresa: "", carpeta: "Facturas_Serenplas" })).c.empresa, "SERENPLAS");
});

test("informe: suma por código, resta notas de crédito y multiplica por el costo actual", () => {
  const lineas = [
    { codigo: "2051-1R NA", descripcion: "Cono ciudad 50", cantidad: 100, signo: 1 },
    { codigo: "2051-1RNA", descripcion: "Cono ciudad 50", cantidad: 20, signo: 1 }, // mismo código escrito sin espacio
    { codigo: "4000-2R", descripcion: "Calza 2R", cantidad: 80, signo: 1 },
    { codigo: "4000-2R", descripcion: "Calza 2R", cantidad: 80, signo: -1 }, // anulada del todo: no aparece
    { codigo: "4001 NE", descripcion: "Calza individual", cantidad: 50, signo: 1 },
    { codigo: "4001 NE", descripcion: "Calza individual", cantidad: 24, signo: -1 },
    { codigo: "9999", descripcion: "Algo raro", cantidad: 3, signo: 1 },
    { codigo: "XX", descripcion: "nota de débito", cantidad: 5, signo: 0 },
  ];
  const productos = [
    { codigo: "2051-1RNA", costo: 2.5, completo: true, sin_receta: false },
    { codigo: "4001NE", costo: 1, completo: false, sin_receta: false, faltan: ["MP PIG"] },
    { codigo: "4000-2R", costo: 3, completo: true, sin_receta: false },
  ];
  const r = F.armarInforme(lineas, productos);
  assert.deepEqual(
    r.filas.map((f) => [f.codigo, f.unidades, f.costo_unitario, f.costo_total]),
    [["2051-1R NA", 120, 2.5, 300], ["4001 NE", 26, 1, 26], ["9999", 3, null, null]],
  );
  assert.match(r.filas[1].observacion, /incompleto.*MP PIG/);
  assert.equal(r.filas[2].observacion, "No está en productos terminados");
  assert.deepEqual(
    { productos: r.totales.productos, unidades: r.totales.unidades, costo_total: r.totales.costo_total, sin_costo: r.totales.sin_costo, incompletos: r.totales.incompletos },
    { productos: 3, unidades: 149, costo_total: 326, sin_costo: 1, incompletos: 1 },
  );
  assert.equal(r.totales.rentabilidad, null);
});

test("informe: importes neto y total, y rentabilidad en US$ con el tipo de cambio", () => {
  const lineas = F.repartirTotales([
    { factura_id: 1, total_factura: 1210, codigo: "A", cantidad: 10, signo: 1, subtotal: 600 },
    { factura_id: 1, total_factura: 1210, codigo: "B", cantidad: 5, signo: 1, subtotal: 400 },
    { factura_id: 2, total_factura: 121, codigo: "A", cantidad: 1, signo: -1, subtotal: 100 }, // nota de crédito
    { factura_id: 3, total_factura: 500, codigo: "C", cantidad: 2, signo: 1, subtotal: null }, // sin importe en el PDF
  ]);
  assert.deepEqual(lineas.map((l) => l.total_item), [726, 484, 121, null]);
  const productos = [
    { codigo: "A", costo: 0.4, completo: true },
    { codigo: "B", costo: 0.5, completo: false, faltan: ["Falta el costo de la materia prima X"] },
    { codigo: "C", costo: 1, completo: true },
  ];
  const r = F.armarInforme(lineas, productos, { tipoCambio: 100 });
  const a = r.filas.find((f) => f.codigo === "A");
  assert.deepEqual([a.unidades, a.importe_neto, a.importe_total, a.costo_total, a.rentabilidad], [9, 500, 605, 3.6, 1.4]); // 500 $ / 100 = US$ 5 − 3,6
  assert.equal(r.filas.find((f) => f.codigo === "B").rentabilidad, null); // costo incompleto: no se calcula
  assert.equal(r.filas.find((f) => f.codigo === "C").importe_incompleto, true);
  assert.equal(r.totales.importe_neto, 900);
  assert.equal(r.totales.importe_total, 1089);
  assert.equal(r.filas.find((f) => f.codigo === "C").rentabilidad, null); // sin importe: no se calcula
  assert.equal(r.totales.rentabilidad, 1.4);
  assert.equal(r.totales.sin_rentabilidad, 2);
  assert.equal(r.tipo_cambio, 100);
});

test("informe: códigos con guiones o espacios distintos se encuentran igual", () => {
  const r = F.armarInforme([{ codigo: "2071LE-2R AZ", cantidad: 8, signo: 1 }], [{ codigo: "2071LE2RAZ", costo: 4, completo: true }]);
  assert.equal(r.filas[0].costo_total, 32);
});

test("con base: guarda lotes sin duplicar y arma el informe del rango", async () => {
  let mysql;
  try {
    mysql = require("mysql2/promise");
  } catch {
    return;
  }
  const db = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
  try {
    await db.query("SELECT 1");
  } catch {
    await db.end().catch(() => {});
    return;
  }
  const C = require("../mpCostos");
  try {
    for (const t of ["factura_items", "facturas", "ingenieria_detalles", "ingenierias", "mp_costos", "mp_costos_historial", "mp_costos_avisos", "mp_eliminadas", "estado_pedidos", "productos_terminados", "semielaborados", "materias_primas"]) await db.query(`DROP TABLE IF EXISTS ${t}`);
    await db.query("CREATE TABLE materias_primas (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(255) UNIQUE NOT NULL, nombre VARCHAR(255) NOT NULL, unidad_medida VARCHAR(50), stock_actual DOUBLE DEFAULT 0)");
    await db.query("CREATE TABLE semielaborados (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(255) UNIQUE NOT NULL, nombre VARCHAR(255) NOT NULL)");
    await db.query("CREATE TABLE productos_terminados (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(255) UNIQUE NOT NULL, nombre VARCHAR(255) NOT NULL)");
    await db.query("CREATE TABLE ingenierias (id INT AUTO_INCREMENT PRIMARY KEY, semielaborado_id INT, producto_terminado_id INT, nombre_version VARCHAR(255), es_activa INT DEFAULT 1)");
    await db.query("CREATE TABLE ingenieria_detalles (id INT AUTO_INCREMENT PRIMARY KEY, ingenieria_id INT NOT NULL, materia_prima_id INT, semielaborado_id INT, cantidad DOUBLE NOT NULL)");
    await db.query("CREATE TABLE estado_pedidos (id INT AUTO_INCREMENT PRIMARY KEY, modelo VARCHAR(255))");
    await C.asegurarTablasCostos(db);
    await F.asegurarTablasFacturas(db);
    // Producto terminado 2051-1RNA: 1,5 kg de PEAD a US$ 2 = US$ 3.
    await db.query("INSERT INTO materias_primas (id, codigo, nombre) VALUES (1, 'PEAD', 'Polietileno')");
    await db.query("INSERT INTO mp_costos (materia_prima_id, costo) VALUES (1, 2)");
    await db.query("INSERT INTO estado_pedidos (modelo) VALUES ('2051-1RNA')");
    await C.asegurarPTDesdePedidos(db);
    const [[pt]] = await db.query("SELECT id FROM productos_terminados WHERE codigo = '2051-1RNA'");
    await db.query("INSERT INTO ingenierias (id, producto_terminado_id, nombre_version) VALUES (5, ?, 'V1')", [pt.id]);
    await db.query("INSERT INTO ingenieria_detalles (ingenieria_id, materia_prima_id, cantidad) VALUES (5, 1, 1.5)");

    const nc = fac({ codigo_tipo: "003", tipo: "NOTA_CREDITO", numero: "00000704", fecha: "2026-11-07", items: [{ codigo: "2051-1R NA", cantidad: 30, unidad: "UN" }] });
    const r1 = await F.guardarLote(db, [fac(), nc, fac({ fecha: "bad" })]);
    assert.equal(r1.guardados, 2);
    assert.equal(r1.errores.length, 1);
    // El lector vuelve a mandar la misma factura (por ejemplo, después de reinstalarlo): no se duplica.
    await F.guardarLote(db, [fac({ items: [{ codigo: "2051-1R NA", cantidad: 100, unidad: "UN" }] })]);
    const [[n]] = await db.query("SELECT COUNT(*) AS f, (SELECT COUNT(*) FROM factura_items) AS i FROM facturas");
    assert.deepEqual([Number(n.f), Number(n.i)], [2, 2]);

    const inf = await F.informe(db, "2026-11-01", "2026-11-30");
    assert.deepEqual(inf.comprobantes, { facturas: 1, notas_credito: 1 });
    assert.deepEqual(inf.filas.map((f) => [f.codigo, f.unidades, f.costo_unitario, f.costo_total]), [["2051-1R NA", 70, 3, 210]]);
    assert.equal(inf.ultima_factura, "2026-11-07");
    // Rango que deja afuera la nota de crédito.
    assert.equal((await F.informe(db, "2026-11-06", "2026-11-06")).filas[0].unidades, 100);
  } finally {
    await db.end();
  }
});
