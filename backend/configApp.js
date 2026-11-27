"use strict";
// Configuración general de la app (clave/valor). Hoy guarda los interruptores de alertas.
// Con un cache corto para no pegarle a la base en cada notificación.

// Valores por defecto cuando la clave todavía no está guardada.
const DEFAULTS = {
  alertas_ia: "0", // los agentes (Lía, Nati, Vera…) no mandan alertas salvo que se active a mano
  alertas_stock_min_semi: "1", // alerta de stock mínimo de semielaborados (solo depósito 33) activa
};

// Cache corto por conexión (WeakMap: cada db tiene el suyo; no se mezclan en tests).
const cachePorDb = new WeakMap();
const TTL_MS = 15000;

async function asegurarConfigApp(db) {
  await db.query("CREATE TABLE IF NOT EXISTS app_config (clave VARCHAR(40) PRIMARY KEY, valor VARCHAR(255) NOT NULL)");
}

/** Lee todas las claves (con cache corto) y las mezcla con los defaults. */
async function leerTodo(db) {
  const ahora = Date.now();
  const c = cachePorDb.get(db);
  if (c && ahora < c.hasta) return c.datos;
  const datos = { ...DEFAULTS };
  try {
    const [rows] = await db.query("SELECT clave, valor FROM app_config");
    for (const r of rows) datos[r.clave] = r.valor;
  } catch {
    /* si falla, quedan los defaults */
  }
  cachePorDb.set(db, { datos, hasta: ahora + TTL_MS });
  return datos;
}

async function leerConfig(db, clave) {
  const datos = await leerTodo(db);
  return datos[clave];
}

/** Devuelve true/false para una clave booleana ("1"/"0"). */
async function leerBool(db, clave) {
  const v = await leerConfig(db, clave);
  return v === "1" || v === 1 || v === true;
}

async function guardarConfig(db, clave, valor) {
  const v = valor === true ? "1" : valor === false ? "0" : String(valor).slice(0, 255);
  await db.query("INSERT INTO app_config (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [clave, v]);
  cachePorDb.delete(db); // invalida el cache de esta conexión
  return v;
}

/** ¿El tipo de notificación lo genera un agente de IA? (para poder silenciarlas todas juntas) */
const esAlertaIA = (tipo) => /^(AGENTE_|MAIL_)/.test(String(tipo || ""));

module.exports = { asegurarConfigApp, leerConfig, leerBool, guardarConfig, esAlertaIA, DEFAULTS };
