"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");
const F = require("../fichadasManuales");
const { REC_MANUAL_DESDE, ultimoRecDelReloj } = require("../fichero");

test("fichadas manuales: rec_no ordenado, cambio de tipo, quitar y auditoría", async () => {
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  const limpiar = async () => { for (const t of ["fichadas_auditoria", "fichadas_duplicadas", "fichadas"]) await pool.query(`DROP TABLE IF EXISTS ${t}`); };
  try {
    await limpiar();
    await pool.query("CREATE TABLE fichadas (id INT AUTO_INCREMENT PRIMARY KEY, rec_no INT UNSIGNED NOT NULL UNIQUE, empleado_id VARCHAR(50), nombre VARCHAR(150), fecha_hora DATETIME, tipo VARCHAR(20), metodo VARCHAR(20), creado_en DATETIME DEFAULT CURRENT_TIMESTAMP)");
    await pool.query("CREATE TABLE fichadas_duplicadas LIKE fichadas");
    await pool.query("INSERT INTO fichadas (rec_no, empleado_id, nombre, fecha_hora, tipo, metodo) VALUES (100,'7','Juan','2026-11-03 07:00:00','ENTRADA','Facial'),(101,'7','Juan','2026-11-03 16:00:00','ENTRADA','Facial')");
    const ahora = new Date(2026, 10, 4, 12, 0, 0);
    const u = "Andrés";

    // Alta: rec_no manual desde 4.000.000.000, creciente, sin tocar el "último del reloj".
    const a = await F.crearFichadaManual(pool, { nombre: "Juan", fecha_hora: "2026-11-03T15:00", tipo: "salida", motivo: "Olvidó fichar", usuario: u, ahora });
    assert.equal(a.rec_no, REC_MANUAL_DESDE);
    assert.equal(a.tipo, "SALIDA");
    const b = await F.crearFichadaManual(pool, { nombre: "Juan", fecha_hora: "2026-11-04 08:00:00", tipo: "ENTRADA", usuario: u, ahora });
    assert.equal(b.rec_no, REC_MANUAL_DESDE + 1);
    assert.equal(await ultimoRecDelReloj(pool, ""), 101);
    const [[fila]] = await pool.query("SELECT empleado_id, metodo FROM fichadas WHERE id = ?", [a.id]);
    assert.deepEqual([fila.empleado_id, fila.metodo], ["7", "Manual"]);

    // Validaciones.
    await assert.rejects(F.crearFichadaManual(pool, { nombre: "Juan", fecha_hora: "2026-11-03 15:01", tipo: "SALIDA", usuario: u, ahora }), /a menos de/); // muy cerca de otra
    await assert.rejects(F.crearFichadaManual(pool, { nombre: "Juan", fecha_hora: "2026-12-30 10:00", tipo: "SALIDA", usuario: u, ahora }), /futuro/);
    await assert.rejects(F.crearFichadaManual(pool, { nombre: "Juan", fecha_hora: "2026-02-31 10:00", tipo: "SALIDA", usuario: u, ahora }), /válidas/);
    await assert.rejects(F.crearFichadaManual(pool, { nombre: "Juan", fecha_hora: "ayer", tipo: "SALIDA", usuario: u, ahora }), /formato/);
    await assert.rejects(F.crearFichadaManual(pool, { nombre: "Juan", fecha_hora: "2026-11-03 10:00", tipo: "OTRO", usuario: u, ahora }), /ENTRADA o SALIDA/);
    await assert.rejects(F.crearFichadaManual(pool, { nombre: "Nadie", fecha_hora: "2026-11-03 10:00", tipo: "ENTRADA", usuario: u, ahora }), /No encuentro/);

    // Corregir: entrada del reloj que en realidad era salida. El rec_no no cambia.
    const [[reloj]] = await pool.query("SELECT id FROM fichadas WHERE rec_no = 101");
    await F.cambiarTipoFichada(pool, { id: reloj.id, tipo: "SALIDA", motivo: "Era la salida", usuario: u });
    const [[c]] = await pool.query("SELECT tipo, rec_no FROM fichadas WHERE id = ?", [reloj.id]);
    assert.deepEqual([c.tipo, Number(c.rec_no)], ["SALIDA", 101]);
    assert.equal((await F.cambiarTipoFichada(pool, { id: reloj.id, tipo: "SALIDA", usuario: u })).sin_cambios, true);
    await assert.rejects(F.cambiarTipoFichada(pool, { id: 99999, tipo: "SALIDA", usuario: u }), /no existe/);

    // Quitar: la manual se borra; la del reloj pasa a duplicadas (y sigue contando como "ya leída").
    assert.equal((await F.quitarFichada(pool, { id: a.id, usuario: u })).manual, true);
    assert.equal((await F.quitarFichada(pool, { id: reloj.id, usuario: u })).manual, false);
    assert.equal(Number((await pool.query("SELECT COUNT(*) n FROM fichadas WHERE id IN (?, ?)", [a.id, reloj.id]))[0][0].n), 0);
    const [dup] = await pool.query("SELECT rec_no FROM fichadas_duplicadas");
    assert.deepEqual(dup.map((d) => Number(d.rec_no)), [101]);
    assert.equal(await ultimoRecDelReloj(pool, ""), 101);

    // El siguiente manual sigue creciendo aunque se haya borrado el anterior del medio.
    const d = await F.crearFichadaManual(pool, { nombre: "Juan", fecha_hora: "2026-11-04 17:00", tipo: "SALIDA", usuario: u, ahora });
    assert.equal(d.rec_no, REC_MANUAL_DESDE + 2);

    // Todo quedó auditado.
    const [aud] = await pool.query("SELECT accion, usuario, motivo FROM fichadas_auditoria ORDER BY id");
    assert.deepEqual(aud.map((x) => x.accion), ["ALTA", "ALTA", "TIPO", "QUITAR", "QUITAR", "ALTA"]);
    assert.equal(aud[0].motivo, "Olvidó fichar");
    assert.equal(aud[0].usuario, u);
  } finally {
    await limpiar();
    await pool.end();
  }
});
