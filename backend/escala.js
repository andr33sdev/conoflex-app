"use strict";
// Escala salarial: categorías que cobran por HORA y categorías MENSUALES.
//
// En la escala, una categoría mensual trae el sueldo del mes completo en el campo
// "valor hora". La hora normal ordinaria se obtiene dividiendo ese sueldo por 180
// (horas mensuales aproximadas, 45 hs semanales), y recién sobre esa hora se aplican
// los recargos (nocturna, 50%, 100%).
//
// Cómo se sabe si una categoría es mensual:
//  1. Si tiene marca manual (fichero_uoyep_categorias.pago_mensual = 1 mensual, 0 por hora), manda esa.
//  2. Si no, se deduce por el importe: un "valor hora" de 100.000 o más es un sueldo mensual.

const HORAS_MENSUALES = 180;
const UMBRAL_MENSUAL = 100000;

/** marca: 1/true = mensual, 0/false = por hora, null/undefined = automático. */
function esMensual(marca, valorEscala) {
  if (marca === 1 || marca === true || marca === "1") return true;
  if (marca === 0 || marca === false || marca === "0") return false;
  return Number(valorEscala) >= UMBRAL_MENSUAL;
}

/** Valor de la hora normal ordinaria (diurna) a partir del valor de la escala. */
function valorHoraOrdinaria(valorEscala, mensual) {
  const v = Number(valorEscala) || 0;
  return mensual ? v / HORAS_MENSUALES : v;
}

/** Agrega la columna de marca manual si falta (idempotente; no falla si la tabla no existe). */
let columnaLista = false;
async function asegurarColumnaPagoMensual(db) {
  if (columnaLista) return true;
  try {
    const [r] = await db.query(
      "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fichero_uoyep_categorias' AND COLUMN_NAME = 'pago_mensual'",
    );
    if (!Number(r[0].n)) {
      await db.query("ALTER TABLE fichero_uoyep_categorias ADD COLUMN pago_mensual TINYINT NULL DEFAULT NULL");
    }
    columnaLista = true;
    return true;
  } catch (e) {
    console.error("[escala] no se pudo asegurar la columna pago_mensual:", e.message);
    return false;
  }
}

module.exports = { HORAS_MENSUALES, UMBRAL_MENSUAL, esMensual, valorHoraOrdinaria, asegurarColumnaPagoMensual };
