"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");
const L = require("../legajo");

test("numerarSanciones: 1.ª y 2.ª amonestación, 3.ª suspensión; las anuladas no cuentan", () => {
  const f = (id, fecha, anulada = false) => ({ id, fecha, anulada });
  const r = L.numerarSanciones([f(1, "2026-03-01"), f(2, "2026-05-01"), f(3, "2026-08-01"), f(4, "2026-09-01")]);
  assert.deepEqual(r.lista.map((s) => [s.id, s.numero, s.tipo]), [[1, 1, "AMONESTACION"], [2, 2, "AMONESTACION"], [3, 3, "SUSPENSION"], [4, 4, "SUSPENSION"]]);
  assert.equal(r.proxima.tipo, "SUSPENSION");
  const a = L.numerarSanciones([f(1, "2026-03-01"), f(2, "2026-05-01", true), f(3, "2026-08-01")]);
  assert.deepEqual(a.lista.map((s) => [s.numero, s.etiqueta]), [[1, "1.ª amonestación"], [null, "Anulada"], [2, "2.ª amonestación"]]);
  assert.equal(a.proxima.etiqueta, "Suspensión");
  assert.equal(L.numerarSanciones([]).proxima.etiqueta, "1.ª amonestación");
  // Una cargada con fecha anterior se renumera sola.
  const b = L.numerarSanciones([f(1, "2026-05-01"), f(2, "2026-03-01")]);
  assert.deepEqual(b.lista.map((s) => [s.id, s.numero]), [[1, 2], [2, 1]]);
});

test("legajo: sanciones con archivos, anulación, resumen de asistencia y producción", async () => {
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  const tablas = ["legajo_sanciones_archivos", "legajo_sanciones", "prod_cargas", "fichadas", "fichero_feriados", "fichero_ajustes_dias", "fichero_operarios_categorias", "fichero_uoyep_categorias", "fichero_uoyep_periodos", "fichero_uoyep_valores"];
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
    await pool.query("CREATE TABLE prod_cargas (id INT AUTO_INCREMENT PRIMARY KEY, fecha DATE, turno VARCHAR(5), operario VARCHAR(255), maquina VARCHAR(100), modelo_codigo VARCHAR(255), modelo_nombre VARCHAR(255), ciclos INT DEFAULT 0, total_producido INT, fallas INT DEFAULT 0, estado VARCHAR(20) DEFAULT 'APROBADA')");
    await pool.query("INSERT INTO fichero_operarios_categorias VALUES ('Juan','C1')");
    await pool.query("INSERT INTO fichero_uoyep_categorias VALUES ('C1','Operario',NULL)");
    await pool.query("INSERT INTO fichero_uoyep_periodos VALUES ('2026-11','Nov')");
    await pool.query("INSERT INTO fichero_uoyep_valores VALUES ('C1','2026-11',1000,0)");
    const F = (n, t, hora) => pool.query("INSERT INTO fichadas (rec_no, empleado_id, nombre, fecha_hora, tipo) VALUES (?,?,?,?,?)", [n, "7", "Juan", hora, t]);
    await F(1, "ENTRADA", "2026-11-02 07:00:00"); await F(2, "SALIDA", "2026-11-02 18:00:00"); // 11 hs: 2 extra
    await F(3, "ENTRADA", "2026-11-03 07:20:00"); await F(4, "SALIDA", "2026-11-03 16:00:00"); // llegó tarde
    await F(5, "ENTRADA", "2026-11-10 07:00:00"); await F(6, "SALIDA", "2026-11-10 16:00:00"); // fuera del rango
    await pool.query("INSERT INTO prod_cargas (fecha, turno, operario, maquina, modelo_codigo, modelo_nombre, total_producido, fallas, estado) VALUES ('2026-11-02','DIA','Juan','M1','B1','Base',500,20,'APROBADA'),('2026-11-03','DIA','juan ','M1','B1','Base',300,10,'PENDIENTE'),('2026-11-03','NOCHE','Juan','M2','C2','Cono',100,0,'RECHAZADA'),('2026-11-02','DIA','Otro','M1','B1','Base',999,0,'APROBADA')");

    // Sanciones: la 3.ª es suspensión, con fechas; adjuntos validados.
    const pdf = { originalname: "acta.pdf", mimetype: "application/pdf", buffer: Buffer.from("%PDF-1.4 prueba"), size: 15 };
    const a1 = await L.crearSancion(pool, { operario: "Juan", fecha: "2026-03-01", motivo: "Llegadas tarde", archivos: [pdf], usuario: "Andrés" });
    assert.deepEqual([a1.numero, a1.tipo, a1.etiqueta, a1.proxima.etiqueta], [1, "AMONESTACION", "1.ª amonestación", "2.ª amonestación"]);
    const a2 = await L.crearSancion(pool, { operario: "Juan", fecha: "2026-06-01", motivo: "Falta sin aviso", usuario: "Andrés" });
    assert.equal(a2.numero, 2);
    assert.equal(a2.proxima.etiqueta, "Suspensión");
    // Las fechas de suspensión se ignoran si todavía no es suspensión.
    const [[x]] = await pool.query("SELECT suspension_desde FROM legajo_sanciones WHERE id = ?", [a2.id]);
    assert.equal(x.suspension_desde, null);
    const a3 = await L.crearSancion(pool, { operario: "Juan", fecha: "2026-09-01", motivo: "Reincidencia", suspension_desde: "2026-09-10", suspension_hasta: "2026-09-12", usuario: "Andrés" });
    assert.deepEqual([a3.numero, a3.tipo], [3, "SUSPENSION"]);
    await assert.rejects(L.crearSancion(pool, { operario: "Juan", fecha: "2026-09-02", motivo: "x", suspension_desde: "2026-09-12", suspension_hasta: "2026-09-10" }), /termina antes/);
    await assert.rejects(L.crearSancion(pool, { operario: "Juan", fecha: "", motivo: "x" }), /fecha/);
    await assert.rejects(L.crearSancion(pool, { operario: "Juan", fecha: "2026-09-02", motivo: "" }), /motivo/);
    await assert.rejects(L.crearSancion(pool, { operario: "Juan", fecha: "2026-09-02", motivo: "x", archivos: [{ originalname: "a.exe", mimetype: "application/x-msdownload", buffer: Buffer.from("x"), size: 1 }] }), /PDF, imágenes o Word/);
    await assert.rejects(L.crearSancion(pool, { operario: "Juan", fecha: "2026-09-02", motivo: "x", archivos: [{ originalname: "g.pdf", mimetype: "application/pdf", buffer: Buffer.alloc(L.MAX_ARCHIVO + 1), size: L.MAX_ARCHIVO + 1 }] }), /6 MB/);

    // Lectura: más nueva primero, con archivos; el archivo se recupera tal cual.
    const s = await L.leerSanciones(pool, "Juan");
    assert.deepEqual(s.sanciones.map((x) => x.numero), [3, 2, 1]);
    const conArchivo = s.sanciones.find((x) => x.id === a1.id);
    assert.equal(conArchivo.archivos.length, 1);
    const arch = await L.archivoPorId(pool, conArchivo.archivos[0].id);
    assert.equal(Buffer.from(arch.contenido).toString(), "%PDF-1.4 prueba");
    await L.adjuntarArchivos(pool, { sancion_id: a2.id, archivos: [pdf], usuario: "Andrés" });
    assert.equal((await L.leerSanciones(pool, "Juan")).sanciones.find((x) => x.id === a2.id).archivos.length, 1);

    // Anular renumera: la suspensión pasa a ser la 2.ª amonestación.
    await assert.rejects(L.anularSancion(pool, { id: a2.id, motivo: "" }), /por qué/);
    await L.anularSancion(pool, { id: a2.id, motivo: "Se justificó la falta", usuario: "Andrés" });
    const t = await L.leerSanciones(pool, "Juan");
    assert.deepEqual(t.sanciones.map((x) => [x.id, x.numero, x.tipo]), [[a3.id, 2, "AMONESTACION"], [a2.id, null, null], [a1.id, 1, "AMONESTACION"]]);
    assert.equal(t.proxima.etiqueta, "Suspensión");
    await assert.rejects(L.anularSancion(pool, { id: a2.id, motivo: "otra vez" }), /Ya estaba anulada/);

    // Una nueva con fecha anterior a otras se numera por fecha.
    const a4 = await L.crearSancion(pool, { operario: "Juan", fecha: "2026-01-15", motivo: "Anterior" });
    assert.equal(a4.numero, 1);

    // Resumen de asistencia y producción en el rango.
    const r = await L.resumenLegajo(pool, { operario: "Juan", desde: "2026-11-01", hasta: "2026-11-09" });
    assert.equal(r.asistencia.con_datos, true);
    assert.equal(r.asistencia.fichadas, 4);
    assert.equal(r.asistencia.dias_trabajados, 2);
    assert.equal(r.asistencia.horas_extra, 2);
    assert.ok(r.asistencia.horas_normales >= 17);
    assert.equal(r.asistencia.llegadas_tarde.length, 1);
    assert.equal(r.asistencia.llegadas_tarde[0].fecha, "2026-11-03");
    assert.equal(r.produccion.cargas, 2); // la rechazada y la de otro operario no cuentan; "juan " con espacio sí
    assert.equal(r.produccion.total_producido, 800);
    assert.equal(r.produccion.buenas, 770);
    assert.equal(r.produccion.por_modelo[0].nombre, "Base");
    assert.equal(r.produccion.turnos, 2);
    assert.equal(r.sanciones.vigentes, 3);
    // Sin datos en el rango.
    const v = await L.resumenLegajo(pool, { operario: "Juan", desde: "2026-12-01", hasta: "2026-12-05" });
    assert.equal(v.asistencia.con_datos, false);
    assert.equal(v.produccion.cargas, 0);
    await assert.rejects(L.resumenLegajo(pool, { operario: "Juan", desde: "2026-11-09", hasta: "2026-11-01" }), /al revés/);
    await assert.rejects(L.resumenLegajo(pool, { operario: "Juan", desde: "2025-01-01", hasta: "2026-11-01" }), /13 meses/);

    const lista = await L.listarLegajos(pool);
    assert.deepEqual(lista.map((x) => [x.nombre, x.sanciones]), [["Juan", 3]]);
  } finally {
    await limpiar();
    await pool.end();
  }
});
