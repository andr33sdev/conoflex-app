"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");
const M = require("../semiMovimientos");
const { analizarStock } = require("../agentes/vigilanteStock");

const SALIDA = `CÓDIGO,DESCRIPCIÓN,FECHA,CANTIDAD,Nº PEDIDO,
B2300LE,BASE SOLO PARA VENCEDOR,30/10/26,4,ML,
2301CSNA,OBRADOR CLASSIC NARANJA,30/10/26,100,41294,
2301CSNA,OBRADOR CLASSIC NARANJA,30/10/26,100,41294,
,NO EXISTE,,,,
1170L,VIAL LIGHT,30/10/26,"1.200",41294,`;

test("lee SALIDA 33 por título de columna, repite filas iguales sin perderlas y ignora los NO EXISTE", () => {
  const r = M.parsearHoja(SALIDA, "SALIDA");
  assert.equal(r.movimientos.length, 4);
  assert.equal(r.invalidas, 1);
  assert.equal(r.movimientos[0].op, "ML");
  assert.equal(r.movimientos[3].cantidad, 1200);
  assert.equal(r.movimientos[0].fecha, "2026-10-30");
  assert.notEqual(r.movimientos[1].clave, r.movimientos[2].clave);
});

test("reconoce la procedencia y arma el aviso de Nati", () => {
  assert.equal(M.depositoDe("Depósito 26"), "26");
  assert.equal(M.depositoDe("AYOLAS"), "ayolas");
  assert.equal(M.depositoDe("37"), "37");
  assert.equal(M.depositoDe(""), null);
  const r = M.parsearHoja("Código,Descripción,Fecha,Cantidad,Procedencia\nAB1,Base,01/11/2026,50,Dep 26", "ENTRADA");
  assert.equal(r.movimientos[0].procedencia, "Dep 26");
  const h = analizarStock({ entradas: [{ id: 7, nombre: "Base", cantidad: 50, deposito: "26", fecha: "2026-11-01" }] });
  assert.equal(h[0].tipo, "ENTRADA_OTRO_DEPOSITO");
  assert.equal(h[0].clave, "entrada33:7");
});

test("transferir, deshacer, entradas avisadas y que la planilla no pise lo hecho en la app", async () => {
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  const limpiar = async () => { for (const t of ["semi_transferencias", "semi_hoja_movs", "prod_semi_stock_movs", "semielaborados"]) await pool.query(`DROP TABLE IF EXISTS ${t}`); };
  try {
    await limpiar();
    await pool.query("CREATE TABLE semielaborados (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(50), nombre VARCHAR(100), stock_33 DOUBLE DEFAULT 0, stock_26 DOUBLE DEFAULT 0, stock_ayolas DOUBLE DEFAULT 0, stock_37 DOUBLE DEFAULT 0)");
    await pool.query("CREATE TABLE prod_semi_stock_movs (id INT AUTO_INCREMENT PRIMARY KEY, carga_id INT, semielaborado_id INT, deposito VARCHAR(20), cantidad DOUBLE)");
    await M.asegurarMovimientos(pool);
    await pool.query("INSERT INTO semielaborados (codigo, nombre, stock_33, stock_26) VALUES ('AB1','Base', 10, 100)");
    const st = async (c) => Number((await pool.query(`SELECT ${c} v FROM semielaborados WHERE id=1`))[0][0].v);

    // primera lectura: queda como historia, sin avisos
    const hoy = new Date();
    const f = `${String(hoy.getDate()).padStart(2, "0")}/${String(hoy.getMonth() + 1).padStart(2, "0")}/${hoy.getFullYear()}`;
    const entrada1 = `Código,Descripción,Fecha,Cantidad,Procedencia\nAB1,Base,${f},5,Dep 26`;
    await M.sincronizarHojas(pool, { traer: async (u) => (u.includes("1040146436") ? SALIDA : entrada1) });
    assert.equal((await M.entradasPendientes(pool)).length, 0);
    // las salidas ya no descuentan nada al leerlas: el stock del 33 lo copia la pestaña STOCK 33
    const salida2 = `${SALIDA}\nAB1,Base,${f},3,OP9`;
    const salida3 = `${salida2}\nAB1,Base,${f},2,OP10`;
    await M.sincronizarHojas(pool, { traer: async (u) => (u.includes("1040146436") ? salida2 : entrada1) });
    assert.equal(await st("stock_33"), 10);
    await M.sincronizarHojas(pool, { traer: async (u) => (u.includes("1040146436") ? salida3 : entrada1) });
    assert.equal(await st("stock_33"), 10);
    await pool.query("UPDATE semielaborados SET stock_33 = 10 WHERE id = 1");
    // segunda lectura con una entrada nueva: avisa; leer de nuevo no duplica
    const entrada2 = `${entrada1}\nAB1,Base,${f},40,Dep 26`;
    const traer = async (u) => (u.includes("1040146436") ? salida3 : entrada2);
    await M.sincronizarHojas(pool, { traer });
    await M.sincronizarHojas(pool, { traer });
    let pend = await M.entradasPendientes(pool);
    assert.equal(pend.length, 1);
    assert.equal(pend[0].deposito, "26");

    await assert.rejects(M.transferir(pool, { semielaborado_id: 1, desde: "26", hasta: "33", cantidad: 500 }), /hay 100/);
    await assert.rejects(M.transferir(pool, { semielaborado_id: 1, desde: "26", hasta: "26", cantidad: 5 }), /mismo/);
    const t = await M.transferir(pool, { semielaborado_id: 1, desde: "26", hasta: "33", cantidad: 40, usuario: "Andrés" });
    assert.equal(await st("stock_33"), 50);
    assert.equal(await st("stock_26"), 60);
    assert.equal(t.entradas_atendidas, 1);
    assert.equal((await M.entradasPendientes(pool)).length, 0, "la entrada se cierra con la transferencia");

    // la planilla trae 10/100 (lo viejo): la app vuelve a sumar la transferencia
    // la entrada de 40 ya está en STOCK 33 de la planilla: la transferencia no la suma otra vez
    const hoja = { AB1: { stock_33: 50, stock_26: 100, stock_ayolas: 0, stock_37: 0 } };
    await M.conAjustesDeLaApp(pool, hoja);
    assert.equal(hoja.AB1.stock_33, 50);
    assert.equal(hoja.AB1.stock_26, 60);

    await M.anularTransferencia(pool, t.id);
    assert.equal(await st("stock_33"), 10);
    assert.equal(await st("stock_26"), 100);
    await assert.rejects(M.anularTransferencia(pool, t.id), /ya estaba deshecha/);
    const h = { AB1: { stock_33: 10, stock_26: 100, stock_ayolas: 0, stock_37: 0 } };
    await M.conAjustesDeLaApp(pool, h);
    assert.equal(h.AB1.stock_33, 10, "deshecha: no suma nada");
    assert.equal((await M.historial(pool, 1)).length, 5);
  } finally {
    await limpiar();
    await pool.end();
  }
});

test("corregir el stock a mano, comparar el 33 con la planilla y recordar una sola vez el mismo aviso", async () => {
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  const limpiar = async () => { for (const t of ["semi_ajustes", "semi_alineacion", "semi_transferencias", "semi_hoja_movs", "prod_semi_stock_movs", "semielaborados"]) await pool.query(`DROP TABLE IF EXISTS ${t}`); };
  try {
    await limpiar();
    await pool.query("CREATE TABLE semielaborados (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(50), nombre VARCHAR(100), stock_33 DOUBLE DEFAULT 0, stock_26 DOUBLE DEFAULT 0, stock_ayolas DOUBLE DEFAULT 0, stock_37 DOUBLE DEFAULT 0)");
    await M.asegurarMovimientos(pool);
    await pool.query("INSERT INTO semielaborados (codigo, nombre, stock_33) VALUES ('AB1','Base', 128), ('CD2','Tapa', 10)");
    const st = async () => Number((await pool.query("SELECT stock_33 v FROM semielaborados WHERE id=1"))[0][0].v);

    // Figura 128 y hay 95: se corrige a mano y queda el rastro
    const r = await M.ajustarStock(pool, { semielaborado_id: 1, deposito: "33", cantidad: 95, nota: "conteo", usuario: "Andrés" });
    assert.deepEqual([r.antes, r.despues, r.cambio], [128, 95, -33]);
    assert.equal(await st(), 95);
    await assert.rejects(M.ajustarStock(pool, { semielaborado_id: 1, deposito: "33", cantidad: -1 }), /0 o más/);
    // el 33 es copia exacta de la planilla: al sincronizar no se le suma ninguna corrección
    const hoja = { AB1: { stock_33: 128, stock_26: 0, stock_ayolas: 0, stock_37: 0 } };
    await M.conAjustesDeLaApp(pool, hoja);
    assert.equal(hoja.AB1.stock_33, 128);
    assert.ok((await M.historial(pool, 1)).some((m) => m.clase === "ajuste"));

    // Comparación con la planilla: AB1 difiere (128 vs 95), CD2 coincide; recién "persistente" pasado el tiempo
    const csv = "AB1,Base,x,x,128\nCD2,Tapa,x,x,10\nZZ9,Otro,x,x,5";
    let c = await M.compararStock33(pool, { traer: async () => csv });
    assert.equal(c.diferencias.length, 1);
    assert.deepEqual([c.diferencias[0].hoja, c.diferencias[0].app, c.diferencias[0].diferencia, c.diferencias[0].persistente], [128, 95, -33, false]);
    c = await M.compararStock33(pool, { traer: async () => csv, minutos: 0 });
    assert.equal(c.diferencias[0].persistente, true);
    await M.ajustarStock(pool, { semielaborado_id: 1, deposito: "33", cantidad: 128 });
    c = await M.compararStock33(pool, { traer: async () => csv });
    assert.equal(c.diferencias.length, 0, "alineados");

    // Recordatorio: no antes de la media hora, una sola vez, y el texto aclara que es el mismo movimiento
    await pool.query("INSERT INTO semi_hoja_movs (clave, tipo, fecha, codigo, cantidad, procedencia, semielaborado_id) VALUES ('k1','ENTRADA', CURDATE(), 'AB1', 20, '37', 1)");
    await M.marcarAvisadas(pool, [1]);
    assert.deepEqual(await M.entradasParaRecordar(pool), []);
    await pool.query("UPDATE semi_hoja_movs SET avisada_en = DATE_SUB(NOW(), INTERVAL 31 MINUTE)");
    assert.deepEqual(await M.entradasParaRecordar(pool), [1]);
    await M.marcarRecordadas(pool, [1]);
    assert.deepEqual(await M.entradasParaRecordar(pool), []);
    const [e] = await M.entradasPendientes(pool);
    assert.ok(e.avisada_hora && e.recordada_hora);
    const h = analizarStock({ entradas: [e] });
    assert.match(h[0].texto, /Te lo recordé a las .* mismo movimiento/);
    assert.equal(h[0].clave, "entrada33:1", "misma clave: es el mismo aviso");
  } finally {
    await limpiar();
    await pool.end();
  }
});

test("espejo del 33: copia exacta de la pestaña STOCK 33, sin tocar otros depósitos ni lo que la planilla no trae", async () => {
  let mysql;
  try { mysql = require("mysql2/promise"); } catch { return; }
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  const limpiar = async () => { for (const t of ["semi_alineacion", "semielaborados"]) await pool.query(`DROP TABLE IF EXISTS ${t}`); };
  try {
    await limpiar();
    await pool.query("CREATE TABLE semielaborados (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(50), nombre VARCHAR(100), stock_33 DOUBLE DEFAULT 0, stock_26 DOUBLE DEFAULT 0, stock_ayolas DOUBLE DEFAULT 0, stock_37 DOUBLE DEFAULT 0)");
    await M.asegurarMovimientos(pool);
    await pool.query("INSERT INTO semielaborados (codigo, nombre, stock_33, stock_26) VALUES ('AB1','Base', 95, 40), ('CD2','Tapa', 10, 7), ('EF3','Sin planilla', 3, 1)");
    const fila = async (c) => (await pool.query("SELECT stock_33, stock_26 FROM semielaborados WHERE codigo = ?", [c]))[0][0];
    const csv2 = "CODIGO,DESCRIPCION,x,x,STOCK\nab1,Base,x,x,128,5\nCD2,Tapa,x,x,10\nZZ9,Otro,x,x,5";
    const r = await M.copiarStock33(pool, { traer: async () => csv2 });
    assert.equal(r.comparados, 2);
    assert.equal(r.actualizados, 1);
    assert.deepEqual(r.cambios, [{ codigo: "AB1", antes: 95, despues: 128 }]);
    assert.equal((await fila("AB1")).stock_33, 128);
    assert.equal((await fila("AB1")).stock_26, 40, "no toca otros depósitos");
    assert.equal((await fila("EF3")).stock_33, 3, "lo que la planilla no trae queda igual");
    // una vez copiado, la comparación no encuentra diferencias y repetir no cambia nada
    assert.equal((await M.compararStock33(pool, { traer: async () => csv2 })).diferencias.length, 0);
    assert.equal((await M.copiarStock33(pool, { traer: async () => csv2 })).actualizados, 0);
    // la planilla baja el stock: la app baja igual (incluso a negativo, es copia exacta)
    const csv3 = "AB1,Base,x,x,-4\nCD2,Tapa,x,x,0";
    await M.copiarStock33(pool, { traer: async () => csv3 });
    assert.equal((await fila("AB1")).stock_33, -4);
    assert.equal((await fila("CD2")).stock_33, 0);
    // planilla ilegible o sin códigos conocidos: no cambia nada y avisa
    await assert.rejects(M.copiarStock33(pool, { traer: async () => "<html>error</html>" }), /ningún código conocido/);
    await assert.rejects(M.copiarStock33(pool, { traer: async () => { throw new Error("HTTP 500"); } }), /HTTP 500/);
    assert.equal((await fila("AB1")).stock_33, -4);
    // correrEspejo33 no lanza y deja el resultado
    assert.equal(await M.correrEspejo33(pool, { traer: async () => { throw new Error("sin red"); } }), null);
  } finally {
    await limpiar();
    await pool.end();
  }
});
