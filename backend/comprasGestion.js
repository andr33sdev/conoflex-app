"use strict";
// Gestión de solicitudes de compra: eliminar una solicitud entera y corregir lo que REALMENTE se pidió
// (el proveedor y la cantidad que se sugirieron al armar la solicitud pueden terminar siendo otros).
// Se conserva lo que se había sugerido, para no perder la historia, pero Vera y los informes usan siempre lo corregido.

async function asegurarColumnasGestion(db) {
  const [c] = await db.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'solicitudes_compra_items'");
  const hay = new Set(c.map((x) => x.COLUMN_NAME));
  if (!hay.has("proveedor_sugerido")) await db.query("ALTER TABLE solicitudes_compra_items ADD COLUMN proveedor_sugerido VARCHAR(255) NULL");
  if (!hay.has("cantidad_sugerida")) await db.query("ALTER TABLE solicitudes_compra_items ADD COLUMN cantidad_sugerida DECIMAL(14,3) NULL");
  if (!hay.has("pedido_corregido_en")) await db.query("ALTER TABLE solicitudes_compra_items ADD COLUMN pedido_corregido_en DATETIME NULL");
  await db.query(`CREATE TABLE IF NOT EXISTS solicitudes_compra_eliminadas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    solicitud_id INT NOT NULL,
    datos MEDIUMTEXT NOT NULL,
    tenia_recibidos TINYINT(1) NOT NULL DEFAULT 0,
    eliminado_por VARCHAR(120) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

/** Corrige lo que realmente se pidió en un renglón: proveedor y/o cantidad. Guarda lo sugerido la primera vez que cambia. */
async function corregirPedido(db, { itemId, proveedor, cantidad }) {
  const nuevaCant = cantidad === undefined || cantidad === null || cantidad === "" ? null : Number(cantidad);
  if (nuevaCant !== null && (!Number.isFinite(nuevaCant) || nuevaCant <= 0)) return { error: "La cantidad tiene que ser un número mayor a cero.", status: 400 };
  const prov = proveedor === undefined || proveedor === null ? null : String(proveedor).trim().slice(0, 255);
  if (nuevaCant === null && prov === null) return { error: "No hay nada para corregir.", status: 400 };
  if (prov !== null && !prov) return { error: "El proveedor no puede quedar vacío.", status: 400 };
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[it]] = await conn.query("SELECT * FROM solicitudes_compra_items WHERE id = ? FOR UPDATE", [itemId]);
    if (!it) {
      await conn.rollback();
      return { error: "No encontré ese renglón.", status: 404 };
    }
    const recibida = Number(it.cantidad_recibida || 0);
    if (nuevaCant !== null && nuevaCant < recibida) {
      await conn.rollback();
      return { error: `Ya se recibieron ${recibida}: la cantidad pedida no puede ser menor a lo recibido.`, status: 409 };
    }
    const sets = [];
    const params = [];
    const cambia = (prov !== null && prov !== (it.proveedor || "")) || (nuevaCant !== null && nuevaCant !== Number(it.cantidad_solicitada));
    if (!cambia) {
      await conn.rollback();
      return { ok: true, sinCambios: true };
    }
    if (prov !== null && prov !== (it.proveedor || "")) {
      if (it.proveedor_sugerido == null) { sets.push("proveedor_sugerido = ?"); params.push(it.proveedor || ""); }
      sets.push("proveedor = ?");
      params.push(prov);
    }
    if (nuevaCant !== null && nuevaCant !== Number(it.cantidad_solicitada)) {
      if (it.cantidad_sugerida == null) { sets.push("cantidad_sugerida = ?"); params.push(it.cantidad_solicitada); }
      sets.push("cantidad_solicitada = ?");
      params.push(nuevaCant);
    }
    sets.push("pedido_corregido_en = NOW()");
    await conn.query(`UPDATE solicitudes_compra_items SET ${sets.join(", ")} WHERE id = ?`, [...params, itemId]);
    // El estado de la solicitud sigue a lo recibido contra lo pedido (si baja la cantidad puede quedar completa; si sube, vuelve a abierta).
    const [todos] = await conn.query("SELECT cantidad_solicitada, cantidad_recibida FROM solicitudes_compra_items WHERE solicitud_id = ?", [it.solicitud_id]);
    const completa = todos.every((i) => Number(i.cantidad_recibida || 0) >= Number(i.cantidad_solicitada));
    await conn.query("UPDATE solicitudes_compra SET estado = ? WHERE id = ? AND estado IN ('ABIERTA','COMPLETADA')", [completa ? "COMPLETADA" : "ABIERTA", it.solicitud_id]);
    await conn.commit();
    return { ok: true, solicitud_id: it.solicitud_id };
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * Elimina una solicitud entera (renglones y vínculo con la lista de Vera). Guarda una copia para poder recuperarla.
 * Si ya se recibió mercadería, pide confirmación explícita (`forzar`): el stock que ya entró NO se descuenta, queda en el historial de movimientos.
 */
async function eliminarSolicitud(db, { id, forzar = false, usuario = null }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[s]] = await conn.query("SELECT * FROM solicitudes_compra WHERE id = ? FOR UPDATE", [id]);
    if (!s) {
      await conn.rollback();
      return { error: "No encontré esa solicitud.", status: 404 };
    }
    const [items] = await conn.query("SELECT * FROM solicitudes_compra_items WHERE solicitud_id = ?", [id]);
    const recibidos = items.filter((i) => Number(i.cantidad_recibida || 0) > 0);
    if (recibidos.length && !forzar) {
      await conn.rollback();
      return { requiereConfirmacion: true, recibidos: recibidos.map((i) => ({ articulo: i.articulo, recibida: Number(i.cantidad_recibida) })), status: 409, error: "Esta solicitud ya tiene mercadería recibida." };
    }
    const [listas] = await conn.query("SELECT * FROM agentes_compras_listas WHERE solicitud_id = ?", [id]).catch(() => [[]]);
    await conn.query("INSERT INTO solicitudes_compra_eliminadas (solicitud_id, datos, tenia_recibidos, eliminado_por) VALUES (?,?,?,?)", [id, JSON.stringify({ solicitud: s, items, listas }), recibidos.length ? 1 : 0, usuario]);
    await conn.query("DELETE FROM solicitudes_compra_items WHERE solicitud_id = ?", [id]);
    await conn.query("DELETE FROM agentes_compras_listas WHERE solicitud_id = ?", [id]).catch(() => {});
    await conn.query("DELETE FROM solicitudes_compra WHERE id = ?", [id]);
    await conn.commit();
    return { ok: true, renglones: items.length, conRecibidos: recibidos.length };
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

function registrarRutasGestion(app, { db, nombreDeUsuario }) {
  app.delete("/api/compras/solicitudes/:id", async (req, res) => {
    try {
      const r = await eliminarSolicitud(db, { id: Number(req.params.id), forzar: req.query.forzar === "1", usuario: await nombreDeUsuario(req) });
      if (r.error) return res.status(r.status || 400).json({ error: r.error, requiereConfirmacion: !!r.requiereConfirmacion, recibidos: r.recibidos });
      res.json({ success: true, ...r });
    } catch (e) {
      console.error("[compras] eliminar solicitud:", e.message);
      res.status(500).json({ error: "No pude eliminar la solicitud. No se cambió nada." });
    }
  });
  app.patch("/api/compras/items/:itemId/pedido", async (req, res) => {
    try {
      const r = await corregirPedido(db, { itemId: Number(req.params.itemId), proveedor: req.body?.proveedor, cantidad: req.body?.cantidad });
      if (r.error) return res.status(r.status || 400).json({ error: r.error });
      res.json({ success: true, ...r });
    } catch (e) {
      console.error("[compras] corregir pedido:", e.message);
      res.status(500).json({ error: "No pude guardar la corrección." });
    }
  });
}

module.exports = { asegurarColumnasGestion, corregirPedido, eliminarSolicitud, registrarRutasGestion };
