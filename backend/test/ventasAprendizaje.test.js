"use strict";
const test = require("node:test");
const assert = require("node:assert");
const V = require("../agentes/ventasMails");
const Apr = require("../agentes/ventasAprendizaje");
const { normalizarObservaciones } = require("../comercial/cotizador");

test("descuento: sin elegir no hay borrador; 0 y 'sin' son 'sin descuento'; fuera de rango no vale", () => {
  assert.equal(V.validarDescuento(undefined), null);
  assert.equal(V.validarDescuento(""), null);
  assert.equal(V.validarDescuento(null), null);
  assert.deepEqual(V.validarDescuento({ sin: true }), { pct: 0 });
  assert.deepEqual(V.validarDescuento(0), { pct: 0 });
  assert.deepEqual(V.validarDescuento("sin"), { pct: 0 });
  assert.deepEqual(V.validarDescuento({ pct: 35 }), { pct: 35 });
  assert.deepEqual(V.validarDescuento("12,5%"), { pct: 12.5 });
  assert.equal(V.validarDescuento(61), null);
  assert.equal(V.validarDescuento(-5), null);
  assert.equal(V.validarDescuento("mucho"), null);
});

test("prepararBorrador: sin descuento definido ni siquiera llama al cotizador", async () => {
  let llamado = 0;
  const db = { query: async () => { throw new Error("no debería tocar la base"); } };
  const r = await V.prepararBorrador({ db, mail: { id: "m1", asunto: "Cotización" }, borrador: async () => { llamado++; return {}; }, descuento: null });
  assert.equal(r.ok, false);
  assert.equal(r.faltaDescuento, true);
  assert.equal(llamado, 0);
});

test("prepararBorrador: con descuento se lo pasa al cotizador y guarda el porcentaje", async () => {
  const consultas = [];
  const db = { query: async (sql, p) => { consultas.push([sql, p]); return [{}]; } };
  let recibido = null;
  const r = await V.prepararBorrador({
    db, mail: { id: "m1", asunto: "Cotización", emailCliente: "a@b.com", remitente: "A" },
    borrador: async (x) => { recibido = x; return { draftId: "d1", html: "<p>ok</p>", revision: { observaciones: [{ tipo: "PREGUNTA", titulo: "Preguntó por el plazo de entrega" }] } }; },
    descuento: { pct: 20 }, alObservar: async (o) => { consultas.push(["obs", o]); },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(recibido.descuento, { pct: 20 });
  assert.ok(consultas.some(([sql, p]) => /descuento_pct/.test(sql) && p.includes(20)));
  assert.ok(consultas.some(([sql, o]) => sql === "obs" && o.observaciones.length === 1));
});

test("observaciones del cotizador: solo tipos válidos, máximo 4 y textos recortados", () => {
  const o = normalizarObservaciones([
    { tipo: "pregunta", titulo: "Preguntó si hay entrega en 48 horas" }, { tipo: "INVENTADO", titulo: "x".repeat(50) }, { tipo: "VACIO", titulo: "corto" },
    ...Array.from({ length: 6 }, (_, i) => ({ tipo: "MEJORA", titulo: `Mejora número ${i} para el catálogo` })),
  ]);
  assert.equal(o.length, 4);
  assert.equal(o[0].tipo, "PREGUNTA");
});

test("similitud: mismo tema redactado distinto se une; temas distintos no", () => {
  assert.ok(Apr.similitud("Piden conos con banda reflectiva", "Cliente pide cono con bandas reflectivas") >= 0.5);
  assert.ok(Apr.similitud("Piden conos con banda reflectiva", "Plazo de entrega para pedidos grandes") < 0.5);
});

let mysql = null;
try { mysql = require("mysql2/promise"); } catch { /* sin driver */ }
const conBase = async (t, fn) => {
  if (!mysql) return t.skip("sin driver mysql2");
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch {
    if (pool) await pool.end().catch(() => {});
    return t.skip("sin base de prueba (definí TEST_DB_HOST, TEST_DB_USER y TEST_DB_PASSWORD)");
  }
  try {
    for (const tabla of ["ventas_aprendizajes_mails", "ventas_aprendizajes", "ventas_notas", "ventas_mails"]) await pool.query(`DROP TABLE IF EXISTS ${tabla}`);
    await pool.query("CREATE TABLE IF NOT EXISTS productos (id INT PRIMARY KEY, codigo VARCHAR(30), nombre VARCHAR(100))");
    await pool.query("REPLACE INTO productos VALUES (1,'CON-75','Cono 75 cm'),(2,'CON-90','Cono 90 cm')");
    await V.asegurarTablasVentas(pool);
    await Apr.asegurarTablasAprendizaje(pool);
    await fn(pool);
  } finally {
    await pool.end();
  }
};

test("aprendizaje: lo repetido suma una vez más (sin duplicar) y lo decidido pasa a las reglas de cada borrador", async (t) => {
  await conBase(t, async (db) => {
    let r = await Apr.registrarObservaciones(db, { mailId: "m1", cliente: "Vialidad Sur", asunto: "Conos", observaciones: [{ tipo: "CARACTERISTICA", titulo: "Piden conos con banda reflectiva", evidencia: "con banda reflectiva" }] });
    assert.deepEqual(r, { nuevas: 1, repetidas: 0 });
    r = await Apr.registrarObservaciones(db, { mailId: "m2", cliente: "Obras SA", asunto: "Cotización", observaciones: [{ tipo: "CARACTERISTICA", titulo: "Un cliente pide cono con bandas reflectivas" }] });
    assert.deepEqual(r, { nuevas: 0, repetidas: 1 });
    // el mismo mail dos veces no cuenta dos veces
    r = await Apr.registrarObservaciones(db, { mailId: "m2", cliente: "Obras SA", asunto: "Cotización", observaciones: [{ tipo: "CARACTERISTICA", titulo: "Piden conos con banda reflectiva" }] });
    assert.equal(r.nuevas + r.repetidas, 0);
    const abiertas = await Apr.listar(db, { estados: ["ABIERTA"] });
    assert.equal(abiertas.length, 1);
    assert.equal(abiertas[0].veces, 2);
    assert.equal(abiertas[0].ejemplos.length, 2);

    // decidir qué productos la tienen: queda en la base y entra como nota de cada borrador
    const { productos } = await Apr.buscarProductos(db, ["CON-75"]);
    const res = await Apr.resolver(db, { id: abiertas[0].id, accion: "PRODUCTOS", productos, usuario: "Andrés" });
    assert.equal(res.ok, true);
    assert.equal((await Apr.listar(db, { estados: ["ABIERTA"] })).length, 0);
    const [resueltas] = [await Apr.listar(db, { estados: ["RESUELTA"] })];
    assert.equal(resueltas[0].productos[0].codigo, "CON-75");
    const notas = await V.notasActivas(db);
    assert.ok(notas.some((n) => /CON-75/.test(n.texto)));
    assert.match(await V.notasTexto(db), /CON-75/);

    // lo ya decidido no se reabre, pero sigue contando
    r = await Apr.registrarObservaciones(db, { mailId: "m3", cliente: "X", asunto: "Y", observaciones: [{ tipo: "CARACTERISTICA", titulo: "Piden conos con banda reflectiva" }] });
    assert.equal(r.repetidas, 1);
    assert.equal((await Apr.listar(db, { estados: ["ABIERTA"] })).length, 0);
    assert.equal((await Apr.obtener(db, resueltas[0].id)).veces, 3);
  });
});

test("aprendizaje: reglas, 'lo vamos a trabajar' (con cierre) y 'no aplica'", async (t) => {
  await conBase(t, async (db) => {
    await Apr.registrarObservaciones(db, { mailId: "a", observaciones: [{ tipo: "VACIO", titulo: "No hay política de plazo de entrega" }, { tipo: "PREGUNTA", titulo: "Preguntan si facturamos en dólares" }, { tipo: "MEJORA", titulo: "Agregar fotos de instalación al catálogo" }] });
    const [a, b, c] = await Apr.listar(db, { estados: ["ABIERTA"] });
    assert.equal((await Apr.resolver(db, { id: a.id, accion: "REGLA", decision: "corta" })).error, "Escribí la regla completa para dejarla anotada.");
    assert.equal((await Apr.resolver(db, { id: a.id, accion: "REGLA", decision: "Plazo estándar de entrega: 10 días hábiles", usuario: "Andrés" })).ok, true);
    assert.match(await V.notasTexto(db), /10 días hábiles/);
    assert.equal((await Apr.resolver(db, { id: b.id, accion: "EN_CURSO", usuario: "Andrés" })).estado, "EN_CURSO");
    assert.match(await V.notasTexto(db), /todavía no está definido/);
    assert.equal((await Apr.cerrarEnCurso(db, { id: b.id, usuario: "Andrés" })).ok, true);
    assert.equal((await Apr.cerrarEnCurso(db, { id: b.id, usuario: "Andrés" })).error, "Esa sugerencia no está en curso.");
    assert.equal((await Apr.resolver(db, { id: c.id, accion: "DESCARTAR" })).estado, "DESCARTADA");
    assert.deepEqual(await Apr.conteos(db), { ABIERTA: 0, EN_CURSO: 0, RESUELTA: 2, DESCARTADA: 1 });
    assert.equal((await Apr.resolver(db, { id: 9999, accion: "REGLA", decision: "x".repeat(20) })).status, 404);
  });
});

test("descuento sugerido: usa lo que se envió la última vez al cliente y el descuento general", async (t) => {
  await conBase(t, async (db) => {
    await db.query("CREATE TABLE IF NOT EXISTS reglas (clave VARCHAR(60) PRIMARY KEY, valor TEXT)");
    await db.query("REPLACE INTO reglas VALUES ('comercial_descuento_pct','10')");
    await db.query("INSERT INTO ventas_mails (mail_id, email_cliente, asunto, estado, descuento_pct) VALUES ('x1','cli@x.com','Cotización','BORRADOR',15)");
    const s = await V.sugerirDescuento(db, "CLI@x.com");
    assert.equal(s.cliente.pct, 15);
    assert.equal(s.config, 10);
    const otro = await V.sugerirDescuento(db, "nuevo@x.com");
    assert.equal(otro.cliente, null);
    assert.equal(otro.config, 10);
  });
});
