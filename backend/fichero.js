"use strict";
// Antiduplicados de fichadas del reloj Dahua.
// Regla: para un mismo empleado, dos fichadas a menos de VENTANA_SEG segundos son
// la misma marca, sea cual sea su tipo (el reloj a veces registra un mismo toque
// como ENTRADA y como SALIDA): se conserva la primera.

const VENTANA_SEG = Math.max(
  0,
  Number(process.env.FICHERO_VENTANA_DUP_SEG) || 180,
);

const aMs = (v) => {
  if (v instanceof Date) return v.getTime();
  const s = String(v).replace(" ", "T");
  return new Date(s).getTime();
};
const claveDe = (r) => `${r.empleado_id || r.nombre}`;

/**
 * Separa `registros` en { nuevos, duplicados }.
 * `existentes`: fichadas ya guardadas { empleado_id, nombre, tipo, fecha_hora }
 * que cuentan como "ya conservadas" al comparar.
 * Los registros se evalúan en orden cronológico; cada marca se compara contra
 * las conservadas (no contra las descartadas), así una ráfaga larga de rebotes
 * no se encadena para siempre.
 */
function separarDuplicadas(registros, existentes = [], ventanaSeg = VENTANA_SEG) {
  const ventanaMs = ventanaSeg * 1000;
  const conservadas = new Map(); // clave -> [ms, ...]
  for (const e of existentes) {
    const k = claveDe(e);
    if (!conservadas.has(k)) conservadas.set(k, []);
    conservadas.get(k).push(aMs(e.fecha_hora));
  }
  const ordenados = [...registros].sort(
    (a, b) => aMs(a.fecha_hora) - aMs(b.fecha_hora) || a.rec_no - b.rec_no,
  );
  const nuevos = [];
  const duplicados = [];
  for (const r of ordenados) {
    const k = claveDe(r);
    const t = aMs(r.fecha_hora);
    const lista = conservadas.get(k) || [];
    if (ventanaMs > 0 && lista.some((x) => Math.abs(t - x) < ventanaMs)) {
      duplicados.push(r);
    } else {
      nuevos.push(r);
      lista.push(t);
      conservadas.set(k, lista);
    }
  }
  return { nuevos, duplicados };
}

/** Crea (si falta) la tabla donde se guardan las marcas descartadas. */
async function asegurarTablaDuplicadas(db) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS fichadas_duplicadas LIKE fichadas",
  );
}

// Las fichadas cargadas a mano usan números de registro (rec_no) a partir de acá, lejos de los que
// asigna el reloj. Así no pisan los del reloj ni cuentan para saber "hasta dónde se leyó".
const REC_MANUAL_DESDE = 4000000000;

/**
 * Último rec_no del RELOJ que ya está procesado (guardado o descartado como duplicado).
 * Ignora las filas cargadas a mano. `forzado` (variable FICHERO_ULTIMO_FORZADO) sirve para pedirle
 * al reloj de nuevo todo lo posterior a ese número: lo que ya está guardado se ignora solo.
 */
async function ultimoRecDelReloj(db, forzado = process.env.FICHERO_ULTIMO_FORZADO) {
  const f = Number(forzado);
  if (forzado !== undefined && forzado !== "" && Number.isFinite(f) && f >= 0) return Math.floor(f);
  const [rows] = await db.query("SELECT MAX(rec_no) AS ultimo_rec FROM fichadas WHERE rec_no < ?", [REC_MANUAL_DESDE]);
  let ultimo = Number(rows[0]?.ultimo_rec) || 0;
  try {
    const [dup] = await db.query("SELECT MAX(rec_no) AS ultimo_rec FROM fichadas_duplicadas WHERE rec_no < ?", [REC_MANUAL_DESDE]);
    ultimo = Math.max(ultimo, Number(dup[0]?.ultimo_rec) || 0);
  } catch {
    /* la tabla aún no existe: no hay duplicadas */
  }
  return ultimo;
}

module.exports = { VENTANA_SEG, REC_MANUAL_DESDE, separarDuplicadas, asegurarTablaDuplicadas, ultimoRecDelReloj };
