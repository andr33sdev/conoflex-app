"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");
const M = require("../semiMovimientos");
const P = require("../agentes/pasarSemis");

const admin = { id: 1, nombre: "Andrés", rol: "ADMIN" };
const otro = { id: 2, nombre: "Otro", rol: "USER" };
const SALIDA_VACIA = "CÓDIGO,DESCRIPCIÓN,FECHA,CANTIDAD,Nº PEDIDO,\n";

test("Nati: lee la planilla, propone lo que vino del 26 y lo pasa recién al confirmar", async () => {
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  const limpiar = async () => { for (const t of ["semi_transferencias", "semi_hoja_movs", "agentes_actividad", "semi_ajustes", "semi_alineacion", "prod_semi_stock_movs", "semielaborados"]) await pool.query(`DROP TABLE IF EXISTS ${t}`); };
  try {
    await limpiar();
    await pool.query("CREATE TABLE semielaborados (id INT AUTO_INCREMENT PRIMARY KEY, codigo VARCHAR(50), nombre VARCHAR(100), stock_33 DOUBLE DEFAULT 0, stock_26 DOUBLE DEFAULT 0, stock_ayolas DOUBLE DEFAULT 0, stock_37 DOUBLE DEFAULT 0)");
    await M.asegurarMovimientos(pool);
    await pool.query("INSERT INTO semielaborados (codigo, nombre, stock_33, stock_26) VALUES ('AB1','Base',10,100),('CD2','Tope',0,5),('EF3','Punta',0,50)");
    const st = async (id, c) => Number((await pool.query(`SELECT ${c} v FROM semielaborados WHERE id=?`, [id]))[0][0].v);
    const hoy = new Date();
    const f = `${String(hoy.getDate()).padStart(2, "0")}/${String(hoy.getMonth() + 1).padStart(2, "0")}/${hoy.getFullYear()}`;
    const ENC = "Código,Descripción,Fecha,Cantidad,Procedencia";
    const hoja = (filas) => async (u) => (u.includes("1040146436") ? SALIDA_VACIA : `${ENC}\n${filas.join("\n")}`);
    // Primera lectura: lo anterior queda como historia.
    await M.sincronizarHojas(pool, { traer: hoja([`AB1,Base,01/01/2026,9,Dep 26`]) });
    const nuevas = [`AB1,Base,01/01/2026,9,Dep 26`, `AB1,Base,${f},5,Dep 26`, `AB1,Base,${f},40,Dep 26`, `CD2,Tope,${f},20,Dep 26`, `EF3,Punta,${f},7,Ayolas`, `ZZ9,Raro,${f},3,Dep 26`, `EF3,Punta,${f},4,Dep 37`];

    // Solo un administrador puede proponer.
    assert.match((await P.armarPropuestaPasar26({ db: pool, usuario: otro, traer: hoja(nuevas) })).error, /administrador/);

    const r = await P.armarPropuestaPasar26({ db: pool, usuario: admin, traer: hoja(nuevas) });
    assert.equal(r.planilla_leida_ahora, true);
    assert.equal(r.propuesta.items.length, 1); // solo AB1: CD2 no alcanza, ZZ9 no existe, Ayolas y 37 no son del 26
    const it = r.propuesta.items[0];
    assert.deepEqual([it.codigo, it.cantidad, it.stock26, it.stock26Nuevo, it.stock33, it.stock33Nuevo], ["AB1", 45, 100, 55, 10, 55]);
    assert.deepEqual(r.no_alcanzan.map((x) => [x.codigo, x.cantidad, x.stock26]), [["CD2", 20, 5]]);
    assert.deepEqual(r.sin_codigo.map((x) => x.codigo), ["ZZ9"]);
    // Proponer no cambia nada.
    assert.equal(await st(1, "stock_26"), 100);

    // Filtros: por fecha y por producto; lo que queda afuera sigue pendiente.
    const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    const fh = await P.armarPropuestaPasar26({ db: pool, usuario: admin, leerPlanilla: false, filtro: { desde: iso, hasta: iso, codigo: "ab1" } });
    assert.equal(fh.propuesta.items[0].cantidad, 45);
    const manana = new Date(hoy.getTime() + 86400000);
    const isoM = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, "0")}-${String(manana.getDate()).padStart(2, "0")}`;
    const fm = await P.armarPropuestaPasar26({ db: pool, usuario: admin, leerPlanilla: false, filtro: { desde: isoM } });
    assert.equal(fm.vacio, true);
    assert.ok(fm.entradas_fuera_del_filtro >= 3);
    const fp = await P.armarPropuestaPasar26({ db: pool, usuario: admin, leerPlanilla: false, filtro: { codigo: "tope" } });
    assert.equal(fp.vacio, true); // CD2 no alcanza
    assert.equal(fp.no_alcanzan[0].codigo, "CD2");

    // Aviso diario: nada antes de las 8, uno solo por día y solo si hay pendientes.
    await pool.query("CREATE TABLE IF NOT EXISTS agentes_actividad (id INT AUTO_INCREMENT PRIMARY KEY, agente VARCHAR(30), tipo VARCHAR(20), titulo VARCHAR(255), detalle TEXT NULL, usuario VARCHAR(120) NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
    await pool.query("DELETE FROM agentes_actividad");
    assert.equal(await P.avisoDiario26(pool, { hoy: iso, hora: 7 }), null);
    const av = await P.avisoDiario26(pool, { hoy: iso, hora: 9 });
    assert.match(av.titulo, /3 semielaborados|2 semielaborados/);
    await pool.query("INSERT INTO agentes_actividad (agente, tipo, titulo, detalle) VALUES ('stock','DIARIO_26','x',?)", [iso]);
    assert.equal(await P.avisoDiario26(pool, { hoy: iso, hora: 10 }), null);
    assert.ok(await P.avisoDiario26(pool, { hoy: isoM, hora: 10 }));

    // Otra persona no puede confirmar la propuesta; cancelar la deja sin efecto.
    assert.equal((await P.confirmarPasar26({ db: pool, usuario: otro, token: r.propuesta.token })).status, 404);
    const r2 = await P.armarPropuestaPasar26({ db: pool, usuario: admin, traer: hoja(nuevas) });
    P.cancelarPasar26({ usuario: admin, token: r2.propuesta.token });
    assert.equal((await P.confirmarPasar26({ db: pool, usuario: admin, token: r2.propuesta.token })).status, 404);
    assert.equal(await st(1, "stock_26"), 100);

    // Confirmar pasa del 26 al 33 y marca las entradas como atendidas; no se puede repetir.
    const r3 = await P.armarPropuestaPasar26({ db: pool, usuario: admin, traer: hoja(nuevas) });
    const c = await P.confirmarPasar26({ db: pool, usuario: admin, token: r3.propuesta.token });
    assert.equal(c.ok, true);
    assert.deepEqual(c.hechas.map((h) => [h.codigo, h.cantidad]), [["AB1", 45]]);
    assert.equal(await st(1, "stock_26"), 55);
    assert.equal(await st(1, "stock_33"), 55);
    assert.equal((await P.confirmarPasar26({ db: pool, usuario: admin, token: r3.propuesta.token })).status, 404);
    const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM semi_hoja_movs WHERE codigo = 'AB1' AND atendida = 0");
    assert.equal(Number(n), 0);
    const [tr] = await pool.query("SELECT desde, hasta, cantidad, usuario FROM semi_transferencias");
    assert.deepEqual([tr[0].desde, tr[0].hasta, Number(tr[0].cantidad), tr[0].usuario], ["26", "33", 45, "Andrés"]);

    // Ya no queda nada para proponer (salvo lo que no alcanza).
    const r4 = await P.armarPropuestaPasar26({ db: pool, usuario: admin, traer: hoja(nuevas) });
    assert.equal(r4.vacio, true);
    assert.equal(r4.no_alcanzan.length, 1);

    // Si entre la propuesta y el botón alguien ya lo pasó a mano, no se pasa dos veces.
    await pool.query("UPDATE semielaborados SET stock_26 = 100 WHERE id = 3");
    const nuevas2 = [...nuevas, `EF3,Punta,${f},12,Dep 26`];
    const r5 = await P.armarPropuestaPasar26({ db: pool, usuario: admin, traer: hoja(nuevas2) });
    assert.equal(r5.propuesta.items[0].codigo, "EF3");
    await M.transferir(pool, { semielaborado_id: 3, desde: "26", hasta: "33", cantidad: 12, usuario: "Alguien" });
    const c5 = await P.confirmarPasar26({ db: pool, usuario: admin, token: r5.propuesta.token });
    assert.deepEqual(c5.omitidas.map((o) => o.codigo), ["EF3"]);
    assert.equal(await st(3, "stock_33"), 12);

    // Si la planilla no se puede leer, se avisa y se usa lo último que se leyó.
    const r6 = await P.armarPropuestaPasar26({ db: pool, usuario: admin, traer: async () => { throw new Error("HTTP 500"); } });
    assert.equal(r6.planilla_leida_ahora, false);
    assert.match(r6.error_planilla, /500/);
  } finally {
    await limpiar();
    await pool.end();
  }
});
