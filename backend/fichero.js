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

module.exports = { VENTANA_SEG, separarDuplicadas, asegurarTablaDuplicadas };
