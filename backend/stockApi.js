"use strict";
// API pública de SOLO LECTURA del stock de semielaborados de un único depósito.
// Expone únicamente: codigo, nombre y stock. Nada de costos, recetas ni otros depósitos.
// Se protege con una API key propia (STOCK_API_KEY), distinta del login de la app.
const crypto = require("crypto");

const COLUMNAS_DEPOSITO = {
  "33": { columna: "stock_33", etiqueta: "Depósito 33" },
  "26": { columna: "stock_26", etiqueta: "Depósito 26" },
  ayolas: { columna: "stock_ayolas", etiqueta: "Ayolas" },
  "37": { columna: "stock_37", etiqueta: "Depósito 37" },
};

// Depósito a exponer (por defecto 33). Configurable con STOCK_API_DEPOSITO.
function depositoConfigurado() {
  const clave = String(process.env.STOCK_API_DEPOSITO || "33").trim();
  const dep = COLUMNAS_DEPOSITO[clave];
  if (!dep) return { clave: "33", ...COLUMNAS_DEPOSITO["33"] };
  return { clave, ...dep };
}

// Comparación de API key en tiempo constante. Devuelve "ok" | "sin_configurar" | "invalida".
function estadoClaveApi(req) {
  const esperado = process.env.STOCK_API_KEY;
  if (!esperado || esperado.length < 16) return "sin_configurar";
  const auth = req.headers["authorization"] || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const recibido = req.headers["x-api-key"] || bearer || (req.query && req.query.key) || "";
  if (typeof recibido !== "string" || recibido.length === 0) return "invalida";
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return "invalida";
  return crypto.timingSafeEqual(a, b) ? "ok" : "invalida";
}

// Stock mostrado al público: nunca negativo, redondeado a 1 decimal.
function formatearStock(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.round(v * 10) / 10);
}

async function listarStock(db) {
  const { columna } = depositoConfigurado();
  const [filas] = await db.query(
    `SELECT codigo, nombre, ${columna} AS stock FROM semielaborados ORDER BY codigo`,
  );
  return filas.map((f) => ({ codigo: f.codigo, nombre: f.nombre, stock: formatearStock(f.stock) }));
}

async function stockDe(db, codigo) {
  const { columna } = depositoConfigurado();
  const [filas] = await db.query(
    `SELECT codigo, nombre, ${columna} AS stock FROM semielaborados WHERE codigo = ? LIMIT 1`,
    [String(codigo || "").trim()],
  );
  if (!filas.length) return null;
  const f = filas[0];
  return { codigo: f.codigo, nombre: f.nombre, stock: formatearStock(f.stock) };
}

// Límite simple por IP: 120 pedidos por minuto, en memoria.
const VENTANA_MS = 60 * 1000;
const MAX_POR_VENTANA = 120;
const golpes = new Map();
function limiteSuperado(ip) {
  const ahora = Date.now();
  const reg = golpes.get(ip);
  if (!reg || ahora >= reg.resetAt) {
    golpes.set(ip, { n: 1, resetAt: ahora + VENTANA_MS });
    return false;
  }
  reg.n += 1;
  return reg.n > MAX_POR_VENTANA;
}
// Limpieza periódica para que el Map no crezca sin control.
setInterval(() => {
  const ahora = Date.now();
  for (const [ip, reg] of golpes) if (ahora >= reg.resetAt) golpes.delete(ip);
}, 5 * VENTANA_MS).unref?.();

module.exports = { COLUMNAS_DEPOSITO, depositoConfigurado, estadoClaveApi, formatearStock, listarStock, stockDe, limiteSuperado };
