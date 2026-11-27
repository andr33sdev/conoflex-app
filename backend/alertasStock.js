"use strict";
// Alerta de stock mínimo de semielaborados. SOLO mira el DEPÓSITO 33.
// Cuando el stock 33 llega o baja del mínimo configurado, avisa una vez; vuelve a armar el aviso
// cuando el stock se recupera por encima del mínimo. El interruptor global la activa o apaga.
const { leerBool } = require("./configApp");
const { crearNotificacion } = require("./notificaciones");

const ROLES = ["ADMIN", "PRODUCCION", "DEPOSITO"];
const n0 = (v) => Number(v || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });

/**
 * Revisa todos los semielaborados con stock mínimo configurado (> 0) y avisa los que están en o por debajo
 * del mínimo en el depósito 33. Dedupe por la marca stock_min_avisado. Respeta el interruptor global.
 * Devuelve { avisados, recuperados } (cantidades), para registro/tests.
 */
async function revisarStockMinimoSemis(db, { notificar = crearNotificacion } = {}) {
  if (!(await leerBool(db, "alertas_stock_min_semi"))) return { avisados: 0, recuperados: 0, apagado: true };

  const [semis] = await db.query(
    "SELECT id, codigo, nombre, stock_33, stock_minimo, stock_min_avisado FROM semielaborados WHERE stock_minimo > 0",
  );
  let avisados = 0;
  let recuperados = 0;
  for (const s of semis) {
    const stock = Number(s.stock_33) || 0;
    const minimo = Number(s.stock_minimo) || 0;
    const bajo = stock <= minimo;
    const yaAvisado = Number(s.stock_min_avisado) === 1;

    if (bajo && !yaAvisado) {
      await db.query("UPDATE semielaborados SET stock_min_avisado = 1 WHERE id = ?", [s.id]);
      await notificar(db, {
        tipo: "STOCK_MINIMO",
        titulo: `Stock mínimo: ${s.nombre || s.codigo}`,
        texto: `El depósito 33 tiene ${n0(stock)} y el mínimo es ${n0(minimo)}. Revisá reposición.`,
        ruta: "/semielaborados",
        roles: ROLES,
        push: true,
      });
      avisados++;
    } else if (!bajo && yaAvisado) {
      await db.query("UPDATE semielaborados SET stock_min_avisado = 0 WHERE id = ?", [s.id]);
      recuperados++;
    }
  }
  return { avisados, recuperados, apagado: false };
}

/** Corre la revisión cada `minutos` (independiente de los agentes de IA). Devuelve el timer. */
function iniciarAlertaStockMinimo(db, { minutos = 10, arranqueMs = 20000 } = {}) {
  if (!(minutos > 0)) return null;
  let corriendo = false;
  const vuelta = async () => {
    if (corriendo) return;
    corriendo = true;
    try {
      await revisarStockMinimoSemis(db);
    } catch (e) {
      console.error("[stock-min] no se pudo revisar:", e.message);
    } finally {
      corriendo = false;
    }
  };
  setTimeout(vuelta, arranqueMs);
  return setInterval(vuelta, minutos * 60 * 1000);
}

module.exports = { revisarStockMinimoSemis, iniciarAlertaStockMinimo };
