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
    // segunda lectura con una entrada nueva: avisa; leer de nuevo no duplica
    const entrada2 = `${entrada1}\nAB1,Base,${f},40,Dep 26`;
    const traer = async (u) => (u.includes("1040146436") ? SALIDA : entrada2);
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
    const hoja = { AB1: { stock_33: 10, stock_26: 100, stock_ayolas: 0, stock_37: 0 } };
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
    assert.equal((await M.historial(pool, 1)).length, 3);
  } finally {
    await limpiar();
    await pool.end();
  }
});
