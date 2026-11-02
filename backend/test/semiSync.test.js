const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../semiSync");
const { numeroPlanilla } = require("../semiMovimientos");

test("numeroPlanilla: punto de miles, coma decimal y celdas que no son número", () => {
  assert.equal(numeroPlanilla("1.280"), 1280);
  assert.equal(numeroPlanilla("1.280,5"), 1280.5);
  assert.equal(numeroPlanilla("12,5"), 12.5);
  assert.equal(numeroPlanilla("128"), 128);
  assert.equal(numeroPlanilla("-4"), -4);
  assert.equal(numeroPlanilla("#N/A"), null);
  assert.equal(numeroPlanilla(""), null);
});

const urls = { stock_33: "u33", stock_26: "u26", stock_ayolas: "uay", stock_37: "u37" };
const hoja = (filas) => "CODIGO,ARTICULO,x,x,STOCK\n" + filas.join("\n");
const traerOk = async (u) => ({
  u33: hoja(["AB1,Base,x,x,\"1.280\"", "CD2,Tapa,x,x,10", "NEW,Nuevo,x,x,7", "STOCK,fila,x,x,99", "XX,sin numero,x,x,#N/A"]),
  u26: hoja(["AB1,Base,x,x,40"]),
  uay: hoja(["CD2,Tapa,x,x,3"]),
  u37: hoja(["ZZ,otro,x,x,1"]),
})[u];

test("leerPlanilla: cada depósito sale de su pestaña; el que no figura en una pestaña queda en 0; ignora encabezados y celdas sin número", async () => {
  const f = await S.leerPlanilla(urls, { traer: traerOk, excluidos: ["CODIGO", "STOCK"] });
  assert.deepEqual([f.AB1.stock_33, f.AB1.stock_26, f.AB1.stock_ayolas, f.AB1.stock_37], [1280, 40, 0, 0]);
  assert.deepEqual([f.CD2.stock_33, f.CD2.stock_26, f.CD2.stock_ayolas], [10, 0, 3]);
  assert.equal(f.XX, undefined);
  assert.equal(f.STOCK, undefined);
  assert.equal(f.ZZ.stock_37, 1);
});

test("leerPlanilla: si una pestaña falla o viene vacía no se cambia nada (antes ese depósito quedaba en 0)", async () => {
  await assert.rejects(S.leerPlanilla(urls, { traer: async (u) => { if (u === "u26") throw new Error("HTTP 500"); return traerOk(u); } }), /STOCK 26.*HTTP 500.*No se cambió nada/);
  await assert.rejects(S.leerPlanilla(urls, { traer: async (u) => (u === "uay" ? "<html>error</html>" : traerOk(u)) }), /STOCK AYOLAS.*vino vacía/);
});

test("compararPlanilla: nuevos, modificados y lo que la app tiene y la planilla no", () => {
  const filas = { AB1: { codigo: "AB1", nombre: "Base", stock_33: 1280, stock_26: 40, stock_ayolas: 0, stock_37: 0 }, NEW: { codigo: "NEW", nombre: "Nuevo", stock_33: 7, stock_26: 0, stock_ayolas: 0, stock_37: 0 }, CD2: { codigo: "CD2", nombre: "Tapa", stock_33: 10, stock_26: 0, stock_ayolas: 3, stock_37: 0 } };
  const semis = [{ id: 1, codigo: "ab1", nombre: "Base", stock_33: 1000, stock_26: 40, stock_ayolas: 0, stock_37: 0 }, { id: 2, codigo: "CD2", nombre: "Tapa", stock_33: 10, stock_26: 0, stock_ayolas: 3, stock_37: 0 }, { id: 3, codigo: "OLD", nombre: "Solo app", stock_33: 5, stock_26: 0, stock_ayolas: 0, stock_37: 0 }];
  const c = S.compararPlanilla(filas, semis);
  assert.deepEqual(c.nuevos.map((n) => n.codigo), ["NEW"]);
  assert.deepEqual(c.modificados.map((m) => [m.id, m.actual.stock_33, m.nuevo.stock_33]), [[1, 1000, 1280]]);
  assert.deepEqual(c.sin_planilla.map((s) => s.codigo), ["OLD"]);
});

test("aplicarPlanilla: deja la app igual a la planilla, crea lo nuevo y no duplica un código que ya existe", async () => {
  let mysql;
  try { mysql = require("mysql2/promise"); } catch { return; }
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  try {
    await pool.query("DROP TABLE IF EXISTS semielaborados");
    await pool.query("CREATE TABLE semielaborados (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(50), nombre VARCHAR(100), stock_33 DOUBLE DEFAULT 0, stock_26 DOUBLE DEFAULT 0, stock_ayolas DOUBLE DEFAULT 0, stock_37 DOUBLE DEFAULT 0)");
    await pool.query("INSERT INTO semielaborados (codigo, nombre, stock_33, stock_26) VALUES ('AB1','Base', 1000, 99), ('OLD','Solo app', 5, 5)");
    const f = await S.leerPlanilla(urls, { traer: traerOk, excluidos: ["CODIGO", "STOCK"] });
    const [semis] = await pool.query("SELECT * FROM semielaborados");
    const c = S.compararPlanilla(f, semis);
    const r = await S.aplicarPlanilla(pool, c);
    assert.equal(r.creados, c.nuevos.length);
    const [filas] = await pool.query("SELECT codigo, stock_33, stock_26, stock_ayolas, stock_37 FROM semielaborados ORDER BY codigo");
    const por = Object.fromEntries(filas.map((x) => [x.codigo, x]));
    assert.deepEqual([por.AB1.stock_33, por.AB1.stock_26], [1280, 40]);
    assert.equal(por.NEW.stock_33, 7);
    assert.deepEqual([por.OLD.stock_33, por.OLD.stock_26], [5, 5], "lo que la planilla no trae no se toca");
    // aplicar otra vez no cambia nada ni duplica
    const [semis2] = await pool.query("SELECT * FROM semielaborados");
    const c2 = S.compararPlanilla(f, semis2);
    assert.equal(c2.modificados.length, 0);
    assert.equal(c2.nuevos.length, 0);
    await S.aplicarPlanilla(pool, { nuevos: [{ codigo: "new", nombre: "Nuevo", stock_33: 9 }] });
    const [[n]] = await pool.query("SELECT COUNT(*) AS n FROM semielaborados WHERE codigo = 'NEW'");
    assert.equal(Number(n.n), 1);
  } finally {
    await pool.query("DROP TABLE IF EXISTS semielaborados").catch(() => {});
    await pool.end();
  }
});
