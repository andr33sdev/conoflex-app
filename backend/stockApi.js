"use strict";
// API pública de SOLO LECTURA para la tienda oficial. Dice si un semielaborado de un único
// depósito está "disponible" (entrega inmediata) o si hay que "consultar". NUNCA expone la
// cantidad: solo el estado. Nada de costos, recetas ni otros depósitos.
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

const MARGEN_DEFAULT = 10;
const TEXTO = { disponible: "Entrega inmediata", consultar: "Consultar" };

// Estado de disponibilidad SIN exponer cantidades:
// "disponible" (entrega inmediata) si lo disponible supera lo pedido más el margen de
// resguardo del producto (%). Si no, "consultar".
function estadoDisponibilidad(disponible, cantidadPedida, margenPct) {
  const disp = Number(disponible) || 0;
  const pedido = Math.max(1, Number(cantidadPedida) || 1);
  const margen = Number.isFinite(Number(margenPct)) && Number(margenPct) >= 0 ? Number(margenPct) : MARGEN_DEFAULT;
  const requerido = pedido * (1 + margen / 100);
  // Tolerancia mínima para evitar que un redondeo de punto flotante (p. ej. 100*1.1 = 110.0000001)
  // tire a "consultar" un caso que justo da igual.
  return disp + 1e-9 >= requerido ? "disponible" : "consultar";
}

function conTexto(codigo, nombre, estado) {
  return { codigo, nombre, estado, texto: TEXTO[estado] };
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

// Estado de todos los semielaborados para una cantidad pedida (por defecto 1).
// Devuelve solo { codigo, nombre, estado, texto }. Nunca cantidades.
async function listarEstados(db, cantidad = 1, compMap = null) {
  const { clave, columna } = depositoConfigurado();
  const [filas] = await db.query(
    `SELECT id, codigo, nombre, ${columna} AS stock, margen_web FROM semielaborados ORDER BY codigo`,
  );
  const comp = await resolverComprometido(db, clave, compMap);
  return filas.map((f) => {
    const disponible = Number(f.stock || 0) - (comp.get(Number(f.id)) || 0);
    const estado = estadoDisponibilidad(disponible, cantidad, f.margen_web);
    return conTexto(f.codigo, f.nombre, estado);
  });
}

// Estado de un semielaborado para una cantidad pedida. Devuelve solo estado, nunca cantidad.
async function estadoDe(db, codigo, cantidad = 1, compMap = null) {
  const { clave, columna } = depositoConfigurado();
  const [filas] = await db.query(
    `SELECT id, codigo, nombre, ${columna} AS stock, margen_web FROM semielaborados WHERE codigo = ? LIMIT 1`,
    [String(codigo || "").trim()],
  );
  if (!filas.length) return null;
  const f = filas[0];
  const comp = await resolverComprometido(db, clave, compMap);
  const disponible = Number(f.stock || 0) - (comp.get(Number(f.id)) || 0);
  const estado = estadoDisponibilidad(disponible, cantidad, f.margen_web);
  return conTexto(f.codigo, f.nombre, estado);
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

module.exports = { COLUMNAS_DEPOSITO, MARGEN_DEFAULT, depositoConfigurado, estadoClaveApi, estadoDisponibilidad, listarEstados, estadoDe, limiteSuperado };
