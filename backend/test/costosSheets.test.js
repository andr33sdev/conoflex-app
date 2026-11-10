const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../costosSheets");

test("links de Google Sheets → descarga CSV", () => {
  assert.equal(S.urlCsv("https://docs.google.com/spreadsheets/d/AbC_12-x/edit#gid=345"), "https://docs.google.com/spreadsheets/d/AbC_12-x/export?format=csv&gid=345");
  assert.equal(S.urlCsv("https://docs.google.com/spreadsheets/d/AbC/edit?usp=sharing"), "https://docs.google.com/spreadsheets/d/AbC/export?format=csv&gid=0");
  assert.equal(S.urlCsv("https://docs.google.com/spreadsheets/d/e/2PACX-1v/pubhtml?gid=7&single=true"), "https://docs.google.com/spreadsheets/d/e/2PACX-1v/pub?output=csv&gid=7&single=true");
  assert.equal(S.urlCsv("https://evil.com/spreadsheets/d/AbC"), null);
  assert.equal(S.urlCsv("cualquier cosa"), null);
});

test("números como los escribe la planilla", () => {
  assert.equal(S.numero("$0,50"), 0.5);
  assert.equal(S.numero("$1.575,00"), 1575);
  assert.equal(S.numero(" $28,00 "), 28);
  assert.equal(S.numero("2.6"), 2.6);
  assert.equal(S.numero("1.575"), 1575);
  assert.equal(S.numero("USD 4,20"), 4.2);
  assert.equal(S.numero(""), null);
  assert.equal(S.numero("REAL"), null);
  assert.equal(S.numero("-1"), null);
});

test("CSV con comillas, comas y saltos de línea", () => {
  assert.deepEqual(S.leerCsv('a,"b,c","d ""x"""\r\n1,"2\n3",\n'), [["a", "b,c", 'd "x"'], ["1", "2\n3", ""]]);
});

// Arma una hoja parecida a la real: dos bloques (A→E y H→L), una fila vacía, una repetida.
const hoja = [
  ["", "$6,30", "NACIÓN", "infodolar", "infobae"],
  [],
  ["", "MATERIA PRIMA DESTACADA", "", "", "", "", "", "", "FIJACIONES"],
  ["MT_PVC_RECICLADO_00", "SCRAP MOLIDO", "KILOS", "USD", "$0,50", "9/2/2024", "", "MT_GRAMPA_3", "GRAMPA", "UNIDAD", "USD", "$5,00"],
  ["MT_REFLE_PRISM ", "REFLECTIVA", "MT2", "USD", "$4,20", "23/6/2026", "3,55", "MT_CLAVOS_25CM", "CLAVO", "UNIDAD", "USD", "$1,10"],
  ["MT_PINT_POLIU_AMA", "PINTURA", "LITRO", "USD", "$29,00", "", "38,08", "", "", "", "", ""],
  ["", "", "", "", "", "", "", "MT_SIN_PRECIO", "x", "UNIDAD", "USD", ""],
  ["", "", "", "", "", "", "", "MT_GRAMPA_3", "repetida", "UNIDAD", "USD", "$6,00"],
];

test("toma el valor 4 columnas a la derecha de cada código, esté donde esté", () => {
  const codigos = new Set(["MT_PVC_RECICLADO_00", "MT_GRAMPA_3", "MT_REFLE_PRISM", "MT_CLAVOS_25CM", "MT_PINT_POLIU_AMA", "MT_SIN_PRECIO", "NO_ESTA"]);
  const r = S.costosDeHoja(hoja, codigos);
  assert.equal(r.costos.get("MT_PVC_RECICLADO_00").costo, 0.5);
  assert.equal(r.costos.get("MT_REFLE_PRISM").costo, 4.2); // no se confunde con 3,55 de la columna G
  assert.equal(r.costos.get("MT_CLAVOS_25CM").costo, 1.1);
  assert.equal(r.costos.get("MT_PINT_POLIU_AMA").costo, 29);
  assert.deepEqual(r.costos.get("MT_GRAMPA_3"), { costo: 5, celda: "L4" });
  assert.deepEqual(r.sin_valor, [{ codigo: "MT_SIN_PRECIO", celda: "L7" }]);
  assert.equal(r.conflictos.length, 1);
  assert.equal(r.conflictos[0].codigo, "MT_GRAMPA_3");
  assert.ok(!r.costos.has("NO_ESTA"));
});

test("plan: qué cambia, qué queda igual y cuántas siguen sin costo", () => {
  const hojaR = S.costosDeHoja(hoja, new Set(["MT_PVC_RECICLADO_00", "MT_GRAMPA_3", "MT_REFLE_PRISM"]));
  const p = S.plan(
    [
      { id: 1, codigo: "MT_PVC_RECICLADO_00", nombre: "Scrap", unidad_medida: "KILOS", costo: 0.5 },
      { id: 2, codigo: "mt_grampa_3", nombre: "Grampa", unidad_medida: "UNIDADES", costo: 4 },
      { id: 3, codigo: "MT_REFLE_PRISM", nombre: "Reflectiva", unidad_medida: "M2", costo: null },
      { id: 4, codigo: "OTRA", nombre: "Otra", unidad_medida: "KILOS", costo: null },
    ],
    hojaR,
  );
  assert.equal(p.iguales, 1);
  assert.deepEqual(p.cambios.map((c) => [c.id, c.antes, c.despues]), [[2, 4, 5], [3, null, 4.2]]);
  assert.equal(p.sin_costo_y_no_estan, 1);
});

test("rutas: previsualiza con la planilla, guarda el link y aplica (con base real si hay)", async () => {
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
  const express = require("express");
  try {
    for (const t of ["mp_costos", "reglas", "materias_primas"]) await db.query(`DROP TABLE IF EXISTS ${t}`);
    await db.query("CREATE TABLE materias_primas (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(255), nombre VARCHAR(255), unidad_medida VARCHAR(50))");
    await db.query("CREATE TABLE reglas (clave VARCHAR(255) PRIMARY KEY, valor TEXT)");
    await db.query("CREATE TABLE mp_costos (materia_prima_id INT PRIMARY KEY, costo DOUBLE NULL, actualizado_por VARCHAR(120) NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)");
    await db.query("INSERT INTO materias_primas (id, codigo, nombre, unidad_medida) VALUES (1,'MT_GRAMPA_3','Grampa','UNIDADES'),(2,'MT_PVC_RECICLADO_00','Scrap','KILOS')");
    const csv = hoja.map((f) => f.map((c) => `"${c}"`).join(",")).join("\n");
    let pedido = null;
    const fetcher = async (u) => {
      pedido = u;
      return { ok: true, headers: { get: () => "text/csv" }, text: async () => csv };
    };
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => ((req.user = { nombre: "Andrés" }), next()));
    S.registrarRutasCostosSheets(app, { db, requireAdmin: (req, res, next) => next(), fetcher });
    const srv = app.listen(0);
    const u = `http://127.0.0.1:${srv.address().port}`;
    const post = async (p, b) => {
      const r = await fetch(u + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
      return [r.status, await r.json()];
    };
    try {
      assert.equal((await post("/api/costos/sheets/previsualizar", {}))[0], 400); // sin link todavía
      const [st, prev] = await post("/api/costos/sheets/previsualizar", { url: "https://docs.google.com/spreadsheets/d/XYZ/edit#gid=9" });
      assert.equal(st, 200);
      assert.equal(pedido, "https://docs.google.com/spreadsheets/d/XYZ/export?format=csv&gid=9");
      assert.equal(prev.cambios.length, 2);
      const [st2, ap] = await post("/api/costos/sheets/aplicar", {}); // usa el link guardado
      assert.equal(st2, 200);
      assert.deepEqual(ap, { actualizados: 2, iguales: 0 });
      const [c] = await db.query("SELECT materia_prima_id AS id, costo, actualizado_por FROM mp_costos ORDER BY id");
      assert.deepEqual(c, [{ id: 1, costo: 5, actualizado_por: "Andrés (planilla)" }, { id: 2, costo: 0.5, actualizado_por: "Andrés (planilla)" }]);
      assert.equal((await post("/api/costos/sheets/previsualizar", {}))[1].iguales, 2);
    } finally {
      srv.close();
    }
  } finally {
    await db.end();
  }
});
