"use strict";
// Las solicitudes de compra suman stock cuando se ingresa mercadería: cada ingreso queda en el historial
// de la materia prima con la solicitud, el proveedor y la orden de compra.
const { moverStock } = require("./stockMovimientos");

async function asegurarComprasStock(db) {
  try {
    const [c] = await db.query("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'solicitudes_compra_items' AND column_name = 'materia_prima_id'");
    if (!Number(c[0].n)) await db.query("ALTER TABLE solicitudes_compra_items ADD COLUMN materia_prima_id INT NULL");
  } catch (e) {
    console.error("[compras] no se pudo preparar la vinculación con materias primas:", e.message);
  }
}

const norm = (t) => String(t || "").trim().replace(/\s+/g, " ").toLowerCase();

/** Materia prima de un renglón: la elegida explícitamente o, si no, la que se llama (o tiene el código) exactamente igual. */
async function buscarMateriaPrima(conn, { materia_prima_id, articulo }) {
  if (materia_prima_id) {
    const [r] = await conn.query("SELECT id, codigo, nombre FROM materias_primas WHERE id = ?", [materia_prima_id]);
    return r[0] || null;
  }
  const t = norm(articulo);
  if (!t) return null;
  const [r] = await conn.query("SELECT id, codigo, nombre FROM materias_primas WHERE LOWER(TRIM(nombre)) = ? OR LOWER(TRIM(codigo)) = ?", [t, t]);
  return r.length === 1 ? r[0] : null; // si hay dudas (0 o varias), no se toca el stock
}

/**
 * Suma (o corrige con delta negativo) lo recibido de un renglón de compra al stock de su materia prima.
 * Devuelve { vinculada, materia_prima?, stock_resultante? }.
 */
async function aplicarRecepcion(conn, { item, delta, usuario, solicitud_id }) {
  if (!delta) return { vinculada: false };
  const mp = await buscarMateriaPrima(conn, { materia_prima_id: item.materia_prima_id, articulo: item.articulo });
  if (!mp) return { vinculada: false };
  const r = await moverStock(conn, {
    mp_id: mp.id,
    delta,
    tipo: delta > 0 ? "INGRESO_COMPRA" : "AJUSTE_COMPRA",
    usuario,
    referencia_tipo: "SOLICITUD_COMPRA",
    referencia_id: solicitud_id,
    referencia_texto: `Solicitud #${solicitud_id}${item.numero_oc ? ` · OC ${item.numero_oc}` : ""}`,
    detalle: { solicitud_id, item_id: item.id || null, proveedor: item.proveedor || null, numero_oc: item.numero_oc || null, articulo: item.articulo, solicitada: Number(item.cantidad_solicitada) || null },
  });
  return { vinculada: true, materia_prima: mp, stock_resultante: r?.stock_resultante };
}

module.exports = { asegurarComprasStock, buscarMateriaPrima, aplicarRecepcion, norm };
