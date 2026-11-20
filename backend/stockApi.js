"use strict";
// API pública de SOLO LECTURA del stock de semielaborados de un único depósito.
// Expone únicamente: codigo, nombre y stock. Nada de costos, recetas ni otros depósitos.
// Se protege con una API key propia (STOCK_API_KEY), distinta del login de la app.
const crypto = require("crypto");
const { comprometidos } = require("./deposito");

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

// Lo comprometido (semielaborados reservados en pedidos armados y aún no despachados)
// es específico del depósito 33. Se cachea 30s para no recalcularlo en cada request.
let cacheComprometido = { at: 0, mapa: new Map() };
const TTL_COMPROMETIDO_MS = 30 * 1000;
async function comprometidoPorId(db) {
  const ahora = Date.now();
  if (ahora - cacheComprometido.at < TTL_COMPROMETIDO_MS) return cacheComprometido.mapa;
  const mapa = new Map();
  const res = await comprometidos(db); // Map semiId -> { cantidad, pedidos }
  for (const [id, c] of res) mapa.set(Number(id), Number(c.cantidad) || 0);
  cacheComprometido = { at: ahora, mapa };
  return mapa;
}

// Mapa de lo comprometido a usar: el inyectado (tests), o el real cacheado solo si es depósito 33.
async function resolverComprometido(db, clave, compMap) {
  if (compMap) return compMap;
  return clave === "33" ? await comprometidoPorId(db) : new Map();
}

// Devuelve el stock DISPONIBLE: en el 33, total menos lo comprometido (nunca negativo).
async function listarStock(db, compMap = null) {
  const { clave, columna } = depositoConfigurado();
  const [filas] = await db.query(
    `SELECT id, codigo, nombre, ${columna} AS stock FROM semielaborados ORDER BY codigo`,
  );
  const comp = await resolverComprometido(db, clave, compMap);
  return filas.map((f) => {
    const disponible = Number(f.stock || 0) - (comp.get(Number(f.id)) || 0);
    return { codigo: f.codigo, nombre: f.nombre, stock: formatearStock(disponible) };
  });
}

async function stockDe(db, codigo, compMap = null) {
  const { clave, columna } = depositoConfigurado();
  const [filas] = await db.query(
    `SELECT id, codigo, nombre, ${columna} AS stock FROM semielaborados WHERE codigo = ? LIMIT 1`,
    [String(codigo || "").trim()],
  );
  if (!filas.length) return null;
  const f = filas[0];
  const comp = await resolverComprometido(db, clave, compMap);
  const disponible = Number(f.stock || 0) - (comp.get(Number(f.id)) || 0);
  return { codigo: f.codigo, nombre: f.nombre, stock: formatearStock(disponible) };
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
