"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");
const { cierreQuincena, rangoQuincena } = require("../cierreQuincena");

test("rangoQuincena", () => {
  assert.deepEqual(rangoQuincena("2026-11", 1), { desde: "2026-11-01", hasta: "2026-11-15" });
  assert.deepEqual(rangoQuincena("2026-02", 2), { desde: "2026-02-16", hasta: "2026-02-28" });
});

test("cierre de quincena: lista lo que falta resolver por operario", async () => {
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  const tablas = ["agentes_hallazgos", "fichadas", "fichero_feriados", "fichero_ajustes_dias", "fichero_operarios_categorias", "fichero_uoyep_categorias", "fichero_uoyep_periodos", "fichero_uoyep_valores"];
  const limpiar = async () => { for (const t of tablas) await pool.query(`DROP TABLE IF EXISTS ${t}`); };
  try {
    await limpiar();
    await pool.query("CREATE TABLE fichadas (id INT AUTO_INCREMENT PRIMARY KEY, rec_no INT UNSIGNED UNIQUE, empleado_id VARCHAR(50), nombre VARCHAR(150), fecha_hora DATETIME, tipo VARCHAR(20), metodo VARCHAR(20))");
    await pool.query("CREATE TABLE fichero_feriados (fecha DATE, descripcion VARCHAR(100))");
    await pool.query("CREATE TABLE fichero_ajustes_dias (nombre_operario VARCHAR(150), fecha DATE, hora_inicio_pactada TIME NULL, horas_normales DOUBLE NULL, todas_extra TINYINT NULL)");
    await pool.query("CREATE TABLE fichero_operarios_categorias (nombre_operario VARCHAR(150), categoria_codigo VARCHAR(50))");
    await pool.query("CREATE TABLE fichero_uoyep_categorias (codigo VARCHAR(50), nombre VARCHAR(100), pago_mensual TINYINT NULL)");
    await pool.query("CREATE TABLE fichero_uoyep_periodos (periodo VARCHAR(20), label VARCHAR(50))");
    await pool.query("CREATE TABLE fichero_uoyep_valores (categoria_codigo VARCHAR(50), periodo VARCHAR(20), valor_hora DOUBLE, suma_no_remunerativa DOUBLE)");
    await pool.query("CREATE TABLE agentes_hallazgos (id INT AUTO_INCREMENT PRIMARY KEY, agente VARCHAR(30), clave VARCHAR(150), estado VARCHAR(20))");
    await pool.query("INSERT INTO fichero_operarios_categorias VALUES ('Juan','C1')");
    await pool.query("INSERT INTO fichero_uoyep_categorias VALUES ('C1','Operario',NULL)");
    await pool.query("INSERT INTO fichero_uoyep_periodos VALUES ('2026-11','Nov')");
    await pool.query("INSERT INTO fichero_uoyep_valores VALUES ('C1','2026-11',1000,0)");
    const F = (n, i, t, hora) => pool.query("INSERT INTO fichadas (rec_no, empleado_id, nombre, fecha_hora, tipo) VALUES (?,?,?,?,?)", [n, i, i === "7" ? "Juan" : "Pedro", hora, t]);
    await F(1, "7", "ENTRADA", "2026-11-02 07:00:00");
    await F(2, "7", "SALIDA", "2026-11-02 16:00:00");
    await F(3, "7", "ENTRADA", "2026-11-03 07:00:00"); // sin salida
    await F(4, "7", "ENTRADA", "2026-11-04 07:00:00");
    await F(5, "7", "SALIDA", "2026-11-04 16:00:00");
    await F(6, "8", "ENTRADA", "2026-11-02 07:00:00"); // Pedro, sin categoría
    await F(7, "8", "SALIDA", "2026-11-02 16:00:00");
    const hoy = "2026-11-16";
    const ahoraMs = new Date(2026, 10, 16, 10, 0, 0).getTime();

    const r = await cierreQuincena(pool, { mes: "2026-11", quincena: 1, hoy, ahoraMs });
    assert.equal(r.periodo.hasta, "2026-11-15");
    const juan = r.operarios.find((o) => o.nombre === "Juan");
    const pedro = r.operarios.find((o) => o.nombre === "Pedro");
    assert.ok(juan.pendientes.some((p) => p.tipo === "SIN_SALIDA" && p.fecha === "2026-11-03"));
    assert.ok(pedro.pendientes.some((p) => p.tipo === "SIN_CATEGORIA"));
    assert.ok(juan.horas_normales > 0);
    assert.equal(r.operarios[0].pendientes.length >= r.operarios[1].pendientes.length, true); // primero los que tienen pendientes
    assert.equal(r.resumen.con_pendientes, 2);

    // Si el aviso de la falta ya se descartó en Lía, no aparece como pendiente.
    await pool.query("INSERT INTO agentes_hallazgos (agente, clave, estado) VALUES ('rrhh','sinsalida:Juan:2026-11-03','DESCARTADA')");
    const r2 = await cierreQuincena(pool, { mes: "2026-11", quincena: 1, hoy, ahoraMs });
    assert.equal(r2.operarios.find((o) => o.nombre === "Juan").pendientes.length, 0);

    // Validaciones.
    assert.equal((await cierreQuincena(pool, { mes: "noviembre", quincena: 1, hoy, ahoraMs })).status, 400);
    assert.equal((await cierreQuincena(pool, { mes: "2026-11", quincena: 3, hoy, ahoraMs })).status, 400);
    // Quincena sin fichadas: vacío, sin error.
    const v = await cierreQuincena(pool, { mes: "2026-11", quincena: 2, hoy, ahoraMs });
    assert.equal(v.operarios.length, 0);
  } finally {
    await limpiar();
    await pool.end();
  }
});
