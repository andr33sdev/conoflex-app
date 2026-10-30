"use strict";
// Movimientos de materia prima: cada vez que el stock sube o baja por un motivo claro (producción aprobada,
// ingreso de una compra) queda un renglón con cuánto, por qué, de qué lote/orden y quién lo hizo.
// El historial de una materia prima junta estos movimientos con los ajustes manuales anteriores (movimientos_stock).

const TIPOS = {
  CONSUMO_PRODUCCION: "Consumo en producción",
  INGRESO_COMPRA: "Ingreso por compra",
  AJUSTE_COMPRA: "Corrección de una compra",
  AJUSTE_MANUAL: "Edición directa de stock",
};

async function asegurarTablaMovimientos(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS mp_movimientos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      materia_prima_id INT NOT NULL,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      tipo VARCHAR(30) NOT NULL,
      cantidad DOUBLE NOT NULL,
      stock_resultante DOUBLE NOT NULL,
      usuario VARCHAR(255),
      referencia_tipo VARCHAR(30) NULL,
      referencia_id INT NULL,
      referencia_texto VARCHAR(255) NULL,
      detalle TEXT NULL,
      KEY idx_mp_fecha (materia_prima_id, fecha),
      KEY idx_ref (referencia_tipo, referencia_id)
    )`);
}

/**
 * Suma o resta stock (delta con signo) y deja el movimiento. Se usa dentro de la transacción de quien llama (conn).
 * Devuelve { stock_anterior, stock_resultante } o null si la materia prima no existe.
 */
async function moverStock(conn, { mp_id, delta, tipo, usuario, referencia_tipo = null, referencia_id = null, referencia_texto = null, detalle = null }) {
  const [r] = await conn.query("SELECT stock_actual FROM materias_primas WHERE id = ? FOR UPDATE", [mp_id]);
  if (!r.length) return null;
  const anterior = Number(r[0].stock_actual) || 0;
  const d = Math.round(Number(delta) * 1e6) / 1e6;
  const nuevo = Math.round((anterior + d) * 1e6) / 1e6;
  await conn.query("UPDATE materias_primas SET stock_actual = ? WHERE id = ?", [nuevo, mp_id]);
  await conn.query(
    `INSERT INTO mp_movimientos (materia_prima_id, tipo, cantidad, stock_resultante, usuario, referencia_tipo, referencia_id, referencia_texto, detalle)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [mp_id, tipo, d, nuevo, usuario || null, referencia_tipo, referencia_id, referencia_texto ? String(referencia_texto).slice(0, 255) : null, detalle ? JSON.stringify(detalle) : null],
  );
  return { stock_anterior: anterior, stock_resultante: nuevo };
}

/** Historial completo de una materia prima, más nuevo primero. */
async function historialMateriaPrima(db, id, { desde, hasta, tipo, limite = 300 } = {}) {
  const filtros = ["materia_prima_id = ?"];
  const params = [id];
  if (desde) { filtros.push("DATE(fecha) >= ?"); params.push(desde); }
  if (hasta) { filtros.push("DATE(fecha) <= ?"); params.push(hasta); }
  const [nuevos] = await db.query(
    `SELECT id, fecha, tipo, cantidad, stock_resultante, usuario, referencia_tipo, referencia_id, referencia_texto, detalle FROM mp_movimientos WHERE ${filtros.join(" AND ")} ORDER BY fecha DESC, id DESC LIMIT ?`,
    [...params, limite],
  );
  let viejos = [];
  try {
    const [v] = await db.query(
      `SELECT id, fecha, usuario, tipo_movimiento, cantidad, stock_resultante FROM movimientos_stock WHERE ${filtros.join(" AND ")} ORDER BY fecha DESC, id DESC LIMIT ?`,
      [...params, limite],
    );
    viejos = v.map((m) => ({
      id: `m${m.id}`,
      fecha: m.fecha,
      tipo: "AJUSTE_MANUAL",
      cantidad: Number(m.cantidad),
      stock_resultante: Number(m.stock_resultante),
      usuario: m.usuario,
      referencia_tipo: null,
      referencia_id: null,
      referencia_texto: m.tipo_movimiento === "INGRESO" ? "Ajuste de stock (suba)" : "Ajuste de stock (baja)",
      detalle: null,
    }));
  } catch {
    /* instalaciones sin la tabla de ajustes manuales */
  }
  const todos = [...nuevos.map((m) => ({ ...m, cantidad: Number(m.cantidad), stock_resultante: Number(m.stock_resultante), detalle: parseDetalle(m.detalle) })), ...viejos]
    .filter((m) => !tipo || m.tipo === tipo)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, limite);
  return todos.map((m) => ({ ...m, tipo_texto: TIPOS[m.tipo] || m.tipo }));
}

function parseDetalle(t) {
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

module.exports = { TIPOS, asegurarTablaMovimientos, moverStock, historialMateriaPrima };
