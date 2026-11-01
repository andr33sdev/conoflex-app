"use strict";
// Stock del semielaborado según las producciones aprobadas: al aprobar una carga se suman sus piezas buenas
// y al eliminarla se restan exactamente las mismas (queda registrado cuánto y en qué depósito).
const DEPOSITOS = ["stock_33", "stock_26", "stock_ayolas", "stock_37"];
// Si la máquina no se reconoce, va a este depósito.
const DEPOSITO_PRODUCCION = DEPOSITOS.includes(process.env.DEPOSITO_PRODUCCION) ? process.env.DEPOSITO_PRODUCCION : "stock_26";

/** Dónde queda lo producido según la máquina: Inyectoras y Hornos → 26; Extrusoras → 37. */
function depositoDeMaquina(nombre) {
  const m = String(nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (/^(inyectora|horno)/.test(m)) return "stock_26";
  if (/^extrusora/.test(m)) return "stock_37";
  return DEPOSITO_PRODUCCION;
}

async function asegurarSemiStockCarga(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS prod_semi_stock_movs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      carga_id INT NOT NULL,
      semielaborado_id INT NOT NULL,
      deposito VARCHAR(20) NOT NULL,
      cantidad DOUBLE NOT NULL,
      creado DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_carga (carga_id)
    )`);
}

async function semiDeCarga(conn, c) {
  if (c.item_id) {
    const [r] = await conn.query("SELECT semielaborado_id AS id FROM prod_plan_items WHERE id = ?", [c.item_id]);
    if (r[0]?.id) return r[0].id;
  }
  if (c.modelo_codigo) {
    const [r] = await conn.query("SELECT id FROM semielaborados WHERE UPPER(TRIM(codigo)) = UPPER(TRIM(?)) LIMIT 1", [c.modelo_codigo]);
    if (r[0]?.id) return r[0].id;
  }
  return null;
}

/** Suma las piezas buenas al stock del semielaborado. Devuelve la cantidad sumada (0 si no corresponde). */
async function sumarPorCarga(conn, c, buenas) {
  const cantidad = Math.round(Number(buenas) || 0);
  if (!(cantidad > 0)) return 0;
  const [ya] = await conn.query("SELECT id FROM prod_semi_stock_movs WHERE carga_id = ? LIMIT 1", [c.id]);
  if (ya.length) return 0;
  const semiId = await semiDeCarga(conn, c);
  if (!semiId) return 0;
  const dep = depositoDeMaquina(c.maquina);
  await conn.query(`UPDATE semielaborados SET ${dep} = COALESCE(${dep}, 0) + ? WHERE id = ?`, [cantidad, semiId]);
  await conn.query("INSERT INTO prod_semi_stock_movs (carga_id, semielaborado_id, deposito, cantidad) VALUES (?,?,?,?)", [c.id, semiId, dep, cantidad]);
  return cantidad;
}

/** Resta lo que se había sumado al aprobar esa carga. Devuelve la cantidad restada. */
async function devolverPorCarga(conn, cargaId) {
  const [movs] = await conn.query("SELECT id, semielaborado_id, deposito, cantidad FROM prod_semi_stock_movs WHERE carga_id = ?", [cargaId]);
  let total = 0;
  for (const m of movs) {
    if (!DEPOSITOS.includes(m.deposito)) continue;
    await conn.query(`UPDATE semielaborados SET ${m.deposito} = GREATEST(0, COALESCE(${m.deposito}, 0) - ?) WHERE id = ?`, [m.cantidad, m.semielaborado_id]);
    total += Number(m.cantidad);
  }
  if (movs.length) await conn.query("DELETE FROM prod_semi_stock_movs WHERE carga_id = ?", [cargaId]);
  return total;
}

module.exports = { asegurarSemiStockCarga, sumarPorCarga, devolverPorCarga, depositoDeMaquina, DEPOSITO_PRODUCCION };
