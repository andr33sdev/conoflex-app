"use strict";
// Alta y corrección de fichadas desde la web (solo administración).
// - Las fichadas cargadas a mano usan rec_no >= REC_MANUAL_DESDE, siempre creciente (máximo + 1): nunca pisan los números que
//   asigna el reloj ni cuentan para saber "hasta dónde se leyó" (ver ultimoRecDelReloj).
// - Cambiar el tipo (ENTRADA <-> SALIDA) no toca el rec_no, así que la sincronización con el reloj sigue siendo idempotente.
// - "Quitar" una fichada del reloj la pasa a fichadas_duplicadas (queda como ya procesada y no cuenta); una manual se borra.
// - Todo queda registrado en fichadas_auditoria con quién y por qué.
const { REC_MANUAL_DESDE, VENTANA_SEG, asegurarTablaDuplicadas } = require("./fichero");

const REC_MAXIMO = 4294967295; // límite del INT UNSIGNED de la columna rec_no
const TIPOS = ["ENTRADA", "SALIDA"];

const err = (status, mensaje) => Object.assign(new Error(mensaje), { status });
const pad = (n) => String(n).padStart(2, "0");

async function asegurarAuditoria(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS fichadas_auditoria (
    id INT AUTO_INCREMENT PRIMARY KEY,
    accion VARCHAR(20) NOT NULL,
    fichada_id INT NULL,
    rec_no BIGINT NULL,
    empleado_id VARCHAR(50) NULL,
    nombre VARCHAR(150) NULL,
    antes TEXT NULL,
    despues TEXT NULL,
    motivo VARCHAR(255) NULL,
    usuario VARCHAR(120) NULL,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_nombre (nombre, creado_en)
  )`);
}

async function auditar(db, { accion, fila, antes = null, despues = null, motivo = null, usuario = null }) {
  await db.query(
    "INSERT INTO fichadas_auditoria (accion, fichada_id, rec_no, empleado_id, nombre, antes, despues, motivo, usuario) VALUES (?,?,?,?,?,?,?,?,?)",
    [accion, fila.id ?? null, fila.rec_no ?? null, fila.empleado_id ?? null, fila.nombre ?? null, antes ? JSON.stringify(antes) : null, despues ? JSON.stringify(despues) : null, motivo ? String(motivo).slice(0, 255) : null, usuario ? String(usuario).slice(0, 120) : null],
  );
}

/** Normaliza "YYYY-MM-DD HH:MM[:SS]" (o con "T") y valida que sea una fecha real. Devuelve "YYYY-MM-DD HH:MM:SS". */
function normalizarFechaHora(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(v || "").trim());
  if (!m) throw err(400, "La fecha y hora no tienen un formato válido.");
  const [anio, mes, dia, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] || "00"].map(Number);
  const d = new Date(anio, mes - 1, dia, h, mi, s);
  if (d.getFullYear() !== anio || d.getMonth() !== mes - 1 || d.getDate() !== dia || h > 23 || mi > 59 || s > 59) throw err(400, "La fecha y hora no son válidas.");
  return { texto: `${anio}-${pad(mes)}-${pad(dia)} ${pad(h)}:${pad(mi)}:${pad(s)}`, date: d };
}

/** Próximo rec_no manual: el máximo de los manuales + 1 (o el primero del rango). */
async function siguienteRecManual(db) {
  const [r] = await db.query("SELECT MAX(rec_no) AS m FROM fichadas WHERE rec_no >= ?", [REC_MANUAL_DESDE]);
  const siguiente = Math.max(Number(r[0]?.m) || 0, REC_MANUAL_DESDE - 1) + 1;
  if (siguiente > REC_MAXIMO) throw err(500, "Se agotó el rango de números de registro manuales.");
  return siguiente;
}

async function filaPorId(db, id) {
  const [rows] = await db.query("SELECT id, rec_no, empleado_id, nombre, DATE_FORMAT(fecha_hora, '%Y-%m-%d %H:%i:%s') AS fecha_hora, tipo, metodo FROM fichadas WHERE id = ?", [id]);
  if (!rows.length) throw err(404, "Esa fichada no existe (puede que ya la hayan cambiado).");
  return rows[0];
}

/** Agrega una fichada manual de un operario. */
async function crearFichadaManual(db, { nombre, fecha_hora, tipo, motivo, usuario, ahora = new Date() }) {
  nombre = String(nombre || "").trim();
  if (!nombre) throw err(400, "Falta el operario.");
  tipo = String(tipo || "").toUpperCase();
  if (!TIPOS.includes(tipo)) throw err(400, "El tipo tiene que ser ENTRADA o SALIDA.");
  const { texto, date } = normalizarFechaHora(fecha_hora);
  if (date.getTime() > ahora.getTime() + 24 * 3600 * 1000) throw err(400, "No se puede cargar una fichada en el futuro.");
  await asegurarAuditoria(db);

  const [emp] = await db.query("SELECT empleado_id FROM fichadas WHERE nombre = ? AND empleado_id IS NOT NULL ORDER BY id DESC LIMIT 1", [nombre]);
  if (!emp.length) throw err(404, "No encuentro a ese operario en las fichadas.");
  const empleado_id = emp[0].empleado_id;

  const [cerca] = await db.query(
    "SELECT tipo, DATE_FORMAT(fecha_hora, '%H:%i:%s') AS hora FROM fichadas WHERE empleado_id = ? AND fecha_hora BETWEEN DATE_SUB(?, INTERVAL ? SECOND) AND DATE_ADD(?, INTERVAL ? SECOND) LIMIT 1",
    [empleado_id, texto, VENTANA_SEG, texto, VENTANA_SEG],
  );
  if (cerca.length) throw err(409, `Ya hay una fichada (${cerca[0].tipo} ${cerca[0].hora}) a menos de ${Math.round(VENTANA_SEG / 60)} minutos. Si es el tipo equivocado, cambiale el tipo.`);

  for (let intento = 0; intento < 5; intento++) {
    const rec_no = await siguienteRecManual(db);
    try {
      const [r] = await db.query("INSERT INTO fichadas (rec_no, empleado_id, nombre, fecha_hora, tipo, metodo) VALUES (?,?,?,?,?,'Manual')", [rec_no, empleado_id, nombre, texto, tipo]);
      const fila = { id: r.insertId, rec_no, empleado_id, nombre };
      await auditar(db, { accion: "ALTA", fila, despues: { fecha_hora: texto, tipo }, motivo, usuario });
      return { ok: true, id: r.insertId, rec_no, fecha_hora: texto, tipo };
    } catch (e) {
      if (e.code !== "ER_DUP_ENTRY") throw e; // otro alta tomó el mismo número: se reintenta con el siguiente
    }
  }
  throw err(500, "No se pudo asignar un número de registro. Probá de nuevo.");
}

/** Cambia ENTRADA por SALIDA (o al revés). No toca el rec_no. */
async function cambiarTipoFichada(db, { id, tipo, motivo, usuario }) {
  tipo = String(tipo || "").toUpperCase();
  if (!TIPOS.includes(tipo)) throw err(400, "El tipo tiene que ser ENTRADA o SALIDA.");
  await asegurarAuditoria(db);
  const f = await filaPorId(db, id);
  if (f.tipo === tipo) return { ok: true, sin_cambios: true, id: f.id, tipo };
  await db.query("UPDATE fichadas SET tipo = ? WHERE id = ?", [tipo, f.id]);
  await auditar(db, { accion: "TIPO", fila: f, antes: { tipo: f.tipo, fecha_hora: f.fecha_hora }, despues: { tipo }, motivo, usuario });
  return { ok: true, id: f.id, tipo };
}

/** Quita una fichada: las manuales se borran; las del reloj pasan a "duplicadas" para que la sincronización no las vuelva a traer. */
async function quitarFichada(db, { id, motivo, usuario }) {
  await asegurarAuditoria(db);
  const f = await filaPorId(db, id);
  const manual = Number(f.rec_no) >= REC_MANUAL_DESDE;
  if (!manual) {
    await asegurarTablaDuplicadas(db);
    await db.query("INSERT IGNORE INTO fichadas_duplicadas (rec_no, empleado_id, nombre, fecha_hora, tipo, metodo) VALUES (?,?,?,?,?,?)", [f.rec_no, f.empleado_id, f.nombre, f.fecha_hora, f.tipo, f.metodo]);
  }
  await db.query("DELETE FROM fichadas WHERE id = ?", [f.id]);
  await auditar(db, { accion: "QUITAR", fila: f, antes: { tipo: f.tipo, fecha_hora: f.fecha_hora, metodo: f.metodo }, motivo, usuario });
  return { ok: true, id: f.id, manual };
}

module.exports = { crearFichadaManual, cambiarTipoFichada, quitarFichada, siguienteRecManual, normalizarFechaHora, asegurarAuditoria };
