const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../costosAvisos");
const C = require("../mpCostos");

const AHORA = new Date("2026-11-10T12:00:00Z");
const hace = (d) => new Date(AHORA.getTime() - d * 86400000);

test("avisa costos de más de 60 días o sin costo, y no repite en la semana", () => {
  const r = A.paraAvisar(
    [
      { id: 1, codigo: "FRESCO", costo: 2, ultimo: hace(10) },
      { id: 2, codigo: "VIEJO", costo: 2, ultimo: hace(75) },
      { id: 3, codigo: "JUSTO60", costo: 2, ultimo: hace(60) },
      { id: 4, codigo: "SINCOSTO", costo: null, ultimo: null },
      { id: 5, codigo: "YAAVISADO", costo: 2, ultimo: hace(90), avisado_at: hace(3) },
      { id: 6, codigo: "AVISADOHACETIEMPO", costo: 2, ultimo: hace(90), avisado_at: hace(8) },
    ],
    AHORA,
  );
  assert.deepEqual(r.map((m) => [m.codigo, m.dias]), [["SINCOSTO", null], ["AVISADOHACETIEMPO", 90], ["VIEJO", 75]]);
  const m = A.mensaje(r, 12);
  assert.match(m.titulo, /3 materias primas de la solicitud de compra #12/);
  assert.match(m.texto, /SINCOSTO \(sin costo\), AVISADOHACETIEMPO \(hace 90 días\), VIEJO \(hace 75 días\)/);
});

test("con base: historial de cambios y aviso al armar una solicitud", async () => {
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
  try {
    for (const t of ["ingenieria_detalles", "ingenierias", "mp_costos", "mp_costos_historial", "mp_costos_avisos", "mp_eliminadas", "solicitudes_compra_items", "materias_primas"]) await db.query(`DROP TABLE IF EXISTS ${t}`);
    await db.query("CREATE TABLE materias_primas (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(255), nombre VARCHAR(255), unidad_medida VARCHAR(50))");
    await db.query("CREATE TABLE solicitudes_compra_items (id INT AUTO_INCREMENT PRIMARY KEY, solicitud_id INT, articulo VARCHAR(255), materia_prima_id INT NULL)");
    await C.asegurarTablasCostos(db);
    await db.query("INSERT INTO materias_primas (id, codigo, nombre) VALUES (1,'PEAD','Polietileno'),(2,'PIG','Pigmento'),(3,'TORN','Tornillo')");

    // Historial: solo se registra si cambia.
    assert.equal((await C.guardarCosto(db, { id: 1, costo: 2, usuario: "Andrés" })).cambio, true);
    assert.equal((await C.guardarCosto(db, { id: 1, costo: 2, usuario: "Andrés" })).cambio, false);
    assert.equal((await C.guardarCosto(db, { id: 1, costo: 2.5, usuario: "Laura", origen: "PLANILLA", detalle: "celda E5" })).antes, 2);
    assert.equal((await C.guardarCosto(db, { id: 99, costo: 1 })).existe, false);
    const [h] = await db.query("SELECT antes, despues, origen, detalle, usuario FROM mp_costos_historial WHERE materia_prima_id = 1 ORDER BY id");
    assert.deepEqual(h, [
      { antes: null, despues: 2, origen: "MANUAL", detalle: null, usuario: "Andrés" },
      { antes: 2, despues: 2.5, origen: "PLANILLA", detalle: "celda E5", usuario: "Laura" },
    ]);

    // PIG: último cambio hace 80 días. TORN: sin costo. PEAD: recién cambiado.
    await C.guardarCosto(db, { id: 2, costo: 10, usuario: "Andrés" });
    await db.query("UPDATE mp_costos_historial SET created_at = NOW() - INTERVAL 80 DAY WHERE materia_prima_id = 2");
    await db.query("UPDATE mp_costos SET updated_at = NOW() - INTERVAL 80 DAY WHERE materia_prima_id = 2");
    await db.query("INSERT INTO solicitudes_compra_items (solicitud_id, articulo, materia_prima_id) VALUES (7,'Polietileno',1),(7,'Pigmento',2),(7,'Tornillo',3),(7,'Algo suelto',NULL)");

    const avisos = [];
    const crearNotificacion = async (_db, n) => avisos.push(n);
    const r = await A.avisarCostosViejos(db, 7, { crearNotificacion });
    assert.deepEqual(r.map((m) => m.codigo), ["TORN", "PIG"]);
    assert.equal(avisos.length, 1);
    assert.deepEqual(avisos[0].roles, ["ADMIN"]);
    assert.equal(avisos[0].ruta, "costos");
    // Otra solicitud con lo mismo, en la misma semana: no se repite.
    assert.deepEqual(await A.avisarCostosViejos(db, 7, { crearNotificacion }), []);
    assert.equal(avisos.length, 1);
    const c = await C.costosCompletos(db).catch(() => null); // sin tablas de recetas puede fallar; solo interesa materias
    void c;
  } finally {
    await db.end();
  }
});
