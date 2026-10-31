"use strict";
// Ajustes de stock pedidos a Nati. Nati NUNCA modifica nada por su cuenta: arma una propuesta (qué material, cuánto, de qué
// stock a cuál) y la persona la confirma con un botón en el chat. Recién ahí se aplica, con las mismas reglas que la edición
// directa del sistema (solo administradores) y dejando el movimiento en el historial de la materia prima.
const crypto = require("crypto");
const { moverStock } = require("../stockMovimientos");

const VIGENCIA_MS = 10 * 60 * 1000;
const propuestas = new Map();
const esAdmin = (u) => String(u?.rol || "").toUpperCase() === "ADMIN";
const redondear = (n) => Math.round(Number(n) * 1e6) / 1e6;

function limpiarVencidas(ahora = Date.now()) {
  for (const [k, p] of propuestas) if (p.vence < ahora) propuestas.delete(k);
}

/** Calcula la propuesta. `materia`: { id, nombre, unidad }, `stockActual`: número leído de la base ahora mismo. */
function armarPropuesta({ usuario, materia, stockActual, operacion, cantidad, motivo = "", ahora = Date.now() }) {
  if (!esAdmin(usuario)) return { error: "Solo un administrador puede modificar el stock. Si hace falta, pedile a un administrador que lo cargue." };
  const op = String(operacion || "").toLowerCase();
  if (!["sumar", "restar", "fijar"].includes(op)) return { error: "La operación tiene que ser sumar, restar o fijar." };
  const c = Number(cantidad);
  if (!Number.isFinite(c) || (op !== "fijar" && c <= 0) || (op === "fijar" && c < 0)) return { error: "La cantidad tiene que ser un número válido (mayor que cero)." };
  const actual = redondear(stockActual);
  const nuevo = op === "sumar" ? redondear(actual + c) : op === "restar" ? redondear(actual - c) : redondear(c);
  if (nuevo < 0) return { error: `Con esa cantidad el stock quedaría en negativo (${nuevo} ${materia.unidad || ""}). Revisá la cantidad.` };
  if (Math.abs(nuevo - actual) < 1e-9) return { error: "Con eso el stock no cambia." };
  limpiarVencidas(ahora);
  const token = crypto.randomBytes(12).toString("hex");
  const p = { token, usuarioId: usuario.id, mpId: materia.id, nombre: materia.nombre, unidad: materia.unidad || "", operacion: op, cantidad: c, stockBase: actual, stockNuevo: nuevo, delta: redondear(nuevo - actual), motivo: String(motivo || "").trim().slice(0, 300), vence: ahora + VIGENCIA_MS };
  propuestas.set(token, p);
  const { usuarioId, vence, ...publica } = p;
  return { propuesta: publica };
}

/** Aplica una propuesta confirmada. Devuelve { ok, ... } o { error, status }. */
async function confirmarPropuesta({ db, usuario, token, ahora = Date.now() }) {
  limpiarVencidas(ahora);
  const p = propuestas.get(String(token || ""));
  if (!p || p.usuarioId !== usuario?.id) return { error: "Esa confirmación venció o ya se usó. Pedímelo de nuevo.", status: 404 };
  if (!esAdmin(usuario)) return { error: "Solo un administrador puede modificar el stock.", status: 403 };
  propuestas.delete(p.token); // un solo uso
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [actual] = await conn.query("SELECT stock_actual FROM materias_primas WHERE id = ? FOR UPDATE", [p.mpId]);
    if (!actual.length) {
      await conn.rollback();
      return { error: "Esa materia prima ya no existe.", status: 404 };
    }
    if (Math.abs(redondear(actual[0].stock_actual) - p.stockBase) > 1e-6) {
      await conn.rollback();
      return { error: `El stock de ${p.nombre} cambió mientras tanto (ahora es ${redondear(actual[0].stock_actual)} ${p.unidad}). Pedímelo de nuevo para que lo confirmes con el número actual.`, status: 409 };
    }
    const r = await moverStock(conn, {
      mp_id: p.mpId, delta: p.delta, tipo: "AJUSTE_MANUAL", usuario: usuario.nombre || "Admin",
      referencia_texto: "Ajuste pedido a Nati (confirmado con botón)",
      detalle: { stock_anterior: p.stockBase, stock_nuevo: p.stockNuevo, motivo: p.motivo || null, via: "Nati" },
    });
    await conn.commit();
    return { ok: true, materia: p.nombre, unidad: p.unidad, stock_anterior: r.stock_anterior, stock_actual: r.stock_resultante, delta: p.delta };
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

function cancelarPropuesta({ usuario, token }) {
  const p = propuestas.get(String(token || ""));
  if (p && p.usuarioId === usuario?.id) propuestas.delete(p.token);
  return { ok: true };
}

module.exports = { armarPropuesta, confirmarPropuesta, cancelarPropuesta, esAdmin };
