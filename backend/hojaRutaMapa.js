"use strict";
// Hoja de ruta, parte 2: clientes habituales (datos de la última carga), ubicación de direcciones en el mapa y ruta óptima del día.
// Direcciones → coordenadas con Nominatim (OpenStreetMap) y ruta óptima con OSRM (/trip). Ambos servicios son públicos y se pueden
// reemplazar con NOMINATIM_URL / OSRM_URL. Las direcciones ya ubicadas se guardan, así un cliente habitual no se vuelve a consultar.
const NOMINATIM_URL = () => (process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org").replace(/\/+$/, "");
const OSRM_URL = () => (process.env.OSRM_URL || "https://router.project-osrm.org").replace(/\/+$/, "");
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const err = (status, mensaje) => Object.assign(new Error(mensaje), { status });
const limpiar = (v, max) => String(v ?? "").trim().slice(0, max);

async function asegurarTablasMapa(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS hoja_ruta_geo (
    clave VARCHAR(300) NOT NULL PRIMARY KEY,
    direccion VARCHAR(300) NOT NULL,
    lat DECIMAL(10,7) NULL,
    lng DECIMAL(10,7) NULL,
    consultado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS hoja_ruta_config (
    clave VARCHAR(60) NOT NULL PRIMARY KEY,
    valor VARCHAR(300) NULL
  )`);
}

/** Misma dirección escrita distinto (mayúsculas, tildes, espacios) = misma clave. */
const claveDireccion = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 300);

// Nominatim pide como máximo 1 consulta por segundo: todas las consultas nuevas pasan por esta cola.
let colaGeo = Promise.resolve();
let ultimaConsulta = 0;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function enCola(fn, espera = 1100) {
  const t = colaGeo.then(async () => {
    const falta = ultimaConsulta + espera - Date.now();
    if (falta > 0) await dormir(falta);
    try { return await fn(); } finally { ultimaConsulta = Date.now(); }
  });
  colaGeo = t.catch(() => {});
  return t;
}

/** "Av. Pres. Perón 3798" → "Avenida Presidente Perón 3798": Nominatim entiende mejor los nombres completos. */
const ABREVIATURAS = { av: "Avenida", avda: "Avenida", pres: "Presidente", gral: "General", cnel: "Coronel", dr: "Doctor", dra: "Doctora", int: "Intendente", ing: "Ingeniero", tte: "Teniente", sgto: "Sargento", brig: "Brigadier", alte: "Almirante", pte: "Presidente", bv: "Boulevard", bvd: "Boulevard", pje: "Pasaje", diag: "Diagonal", prof: "Profesor", cap: "Capitán", cte: "Comandante", fco: "Francisco", pdo: "Partido" };
function expandirAbreviaturas(texto) {
  return String(texto).replace(/\b([A-Za-zÁÉÍÓÚáéíóúñÑ]{2,5})\.(?=\s|$)/g, (m, w) => ABREVIATURAS[w.toLowerCase()] || m);
}

/** Consulta a Nominatim. Devuelve {lat,lng} o null si no la encuentra; lanza si el servicio no responde. */
async function consultarNominatim(direccion, { fetchFn = fetch } = {}) {
  const q = /argentina/i.test(direccion) ? direccion : `${expandirAbreviaturas(direccion)}, Argentina`;
  const url = `${NOMINATIM_URL()}/search?format=jsonv2&limit=1&countrycodes=ar&q=${encodeURIComponent(q)}`;
  const res = await fetchFn(url, { headers: { "User-Agent": "Conoflex-App/1.0 (hoja de ruta)", "Accept-Language": "es" }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`El servicio de mapas respondió ${res.status}.`);
  const datos = await res.json();
  const p = Array.isArray(datos) ? datos[0] : null;
  if (!p) return null;
  const lat = Number(p.lat), lng = Number(p.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/**
 * Ubica una dirección: primero en lo ya guardado; si no, consulta (con cola de 1 por segundo) y guarda. `soloCache` no consulta.
 * Una dirección que no se encontró se recuerda 1 hora para no repetir la consulta en cada pantalla.
 */
async function ubicar(db, direccion, { fetchFn, soloCache = false, consultar = consultarNominatim } = {}) {
  const dir = limpiar(direccion, 300);
  const clave = claveDireccion(dir);
  if (!clave) return { estado: "sin_direccion" };
  const [rows] = await db.query("SELECT lat, lng, (consultado_en < NOW() - INTERVAL 1 HOUR) AS vieja FROM hoja_ruta_geo WHERE clave = ?", [clave]);
  const g = rows[0];
  if (g && g.lat != null) return { estado: "ok", lat: Number(g.lat), lng: Number(g.lng) };
  if (g && !g.vieja) return { estado: "no_encontrada" };
  if (soloCache) return { estado: "pendiente" };
  let r;
  try { r = await enCola(() => consultar(dir, { fetchFn })); } catch { return { estado: "sin_servicio" }; }
  await db.query(
    "INSERT INTO hoja_ruta_geo (clave, direccion, lat, lng, consultado_en) VALUES (?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE lat=VALUES(lat), lng=VALUES(lng), consultado_en=NOW()",
    [clave, dir, r?.lat ?? null, r?.lng ?? null],
  );
  return r ? { estado: "ok", lat: r.lat, lng: r.lng } : { estado: "no_encontrada" };
}

/** Punto de partida (la planta). */
async function leerOrigen(db) {
  const [rows] = await db.query("SELECT clave, valor FROM hoja_ruta_config WHERE clave IN ('origen_direccion','origen_lat','origen_lng')");
  const c = Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
  if (!c.origen_direccion) return null;
  return { direccion: c.origen_direccion, lat: Number(c.origen_lat), lng: Number(c.origen_lng) };
}
async function guardarOrigen(db, direccion, deps = {}) {
  const dir = limpiar(direccion, 300);
  if (!dir) throw err(400, "Poné la dirección de la planta.");
  const u = await ubicar(db, dir, deps);
  if (u.estado === "sin_servicio") throw err(503, "El servicio de mapas no responde ahora. Probá de nuevo en un momento.");
  if (u.estado !== "ok") throw err(422, "No pude ubicar esa dirección. Probá con calle, número y localidad.");
  for (const [k, v] of [["origen_direccion", dir], ["origen_lat", String(u.lat)], ["origen_lng", String(u.lng)]]) {
    await db.query("INSERT INTO hoja_ruta_config (clave, valor) VALUES (?,?) ON DUPLICATE KEY UPDATE valor=VALUES(valor)", [k, v]);
  }
  return { direccion: dir, lat: u.lat, lng: u.lng };
}

/** Clientes que ya se cargaron alguna vez, con los datos de su última carga. */
async function clientesHabituales(db, { q = "", exacto = false } = {}) {
  const texto = limpiar(q, 120).toLowerCase();
  if (!texto) return [];
  const [rows] = await db.query(
    `SELECT h.cliente, h.tipo_entrega, h.direccion, h.transporte_nombre, h.contacto_nombre, h.contacto_telefono, h.observaciones, h.op AS ultimo_op,
            DATE_FORMAT(h.fecha_despacho, '%Y-%m-%d') AS ultima_fecha
       FROM hoja_ruta h
       JOIN (SELECT MAX(id) AS mid FROM hoja_ruta WHERE estado <> 'CANCELADO' GROUP BY LOWER(TRIM(cliente))) m ON h.id = m.mid
      WHERE ${exacto ? "LOWER(TRIM(h.cliente)) = ?" : "LOWER(h.cliente) LIKE ?"}
      ORDER BY h.cliente LIMIT 8`,
    [exacto ? texto : `%${texto.replace(/[%_]/g, "")}%`],
  );
  return rows;
}

/** Paradas de un día para el mapa. Ubica hasta `maxNuevas` direcciones por vez; las que faltan vuelven como `pendiente`. */
async function mapaDelDia(db, fecha, { maxNuevas = 5, ...deps } = {}) {
  if (!FECHA.test(String(fecha || ""))) throw err(400, "Elegí el día.");
  const [rows] = await db.query(
    `SELECT id, op, cliente, tipo_entrega, direccion, transporte_nombre, prioridad, estado, contacto_nombre, contacto_telefono
       FROM hoja_ruta WHERE fecha_despacho = ? AND estado <> 'CANCELADO' ORDER BY prioridad DESC, id`, [fecha]);
  let nuevas = 0;
  const paradas = [];
  const retiran = [];
  for (const r of rows) {
    if (r.tipo_entrega === "RETIRA") { retiran.push(r); continue; }
    let u = await ubicar(db, r.direccion, { ...deps, soloCache: true });
    if (u.estado === "pendiente" && nuevas < maxNuevas) { nuevas++; u = await ubicar(db, r.direccion, deps); }
    paradas.push({ ...r, estado_ubicacion: u.estado, lat: u.lat ?? null, lng: u.lng ?? null });
  }
  return { fecha, origen: await leerOrigen(db), paradas, retiran, pendientes: paradas.filter((p) => p.estado_ubicacion === "pendiente").length };
}

/** Deja la dirección ubicada en segundo plano (para que el mapa del día ya la tenga). */
function ubicarEnSegundoPlano(db, direccion, deps) {
  ubicar(db, direccion, deps).catch(() => {});
}

/**
 * Ruta óptima que pasa por todos los puntos (el primero es la salida). Usa OSRM /trip.
 * `vuelta`: vuelve a la planta al final. Devuelve el orden de visita (índices de `puntos`), km, minutos y el trazado.
 */
async function calcularRuta(puntos, { vuelta = true, fetchFn = fetch } = {}) {
  if (!Array.isArray(puntos) || puntos.length < 2) throw err(400, "Hacen falta al menos la planta y una parada.");
  if (puntos.length > 60) throw err(400, "Son demasiadas paradas para un solo día (máximo 59).");
  const pts = puntos.map((p) => ({ lat: Number(p?.lat), lng: Number(p?.lng) }));
  if (pts.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)) throw err(400, "Hay coordenadas inválidas.");
  const coords = pts.map((p) => `${p.lng},${p.lat}`).join(";");
  const pedir = async (roundtrip) => {
    const extra = roundtrip ? "" : "&source=first&destination=any";
    const res = await fetchFn(`${OSRM_URL()}/trip/v1/driving/${coords}?roundtrip=${roundtrip}${extra}&geometries=geojson&overview=full&steps=false`, { signal: AbortSignal.timeout(20000) });
    const d = await res.json().catch(() => ({}));
    return { ok: res.ok && d.code === "Ok" && d.trips?.[0], d };
  };
  let r;
  let conVuelta = !!vuelta;
  try {
    r = await pedir(conVuelta);
    if (!r.ok && !conVuelta) { conVuelta = true; r = await pedir(true); } // algunos servidores no aceptan "sin vuelta": se calcula con vuelta
  } catch { throw err(503, "El servicio de rutas no responde ahora. Probá de nuevo en un momento."); }
  if (!r.ok) throw err(422, r.d?.code === "NoRoute" ? "No hay camino entre algunas de las direcciones." : "No se pudo calcular la ruta.");
  const trip = r.d.trips[0];
  const orden = r.d.waypoints.map((w, i) => ({ i, pos: w.waypoint_index })).sort((a, b) => a.pos - b.pos).map((w) => w.i);
  return {
    orden,
    vuelta: conVuelta,
    distancia_km: Math.round((trip.distance / 1000) * 10) / 10,
    duracion_min: Math.round(trip.duration / 60),
    tramos: (trip.legs || []).map((l) => ({ km: Math.round((l.distance / 1000) * 10) / 10, min: Math.round(l.duration / 60) })),
    trazado: (trip.geometry?.coordinates || []).map(([lng, lat]) => [lat, lng]),
  };
}

function registrarRutasMapa(app, db, requirePermiso, requireAdmin) {
  const acceso = requirePermiso("hoja-de-ruta");
  const salir = (res, e) => {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error("Error en el mapa de la hoja de ruta:", e);
    return res.status(500).json({ error: "No se pudo completar la operación.", detalle: String(e?.code || e?.message || e).slice(0, 200) });
  };
  app.get("/api/hoja-ruta/clientes", acceso, async (req, res) => {
    try { res.json({ clientes: await clientesHabituales(db, { q: req.query.q, exacto: req.query.exacto === "1" }) }); } catch (e) { salir(res, e); }
  });
  app.get("/api/hoja-ruta/mapa", acceso, async (req, res) => {
    try { res.json(await mapaDelDia(db, req.query.fecha)); } catch (e) { salir(res, e); }
  });
  app.post("/api/hoja-ruta/ruta", acceso, async (req, res) => {
    try { res.json(await calcularRuta(req.body?.puntos, { vuelta: req.body?.vuelta !== false })); } catch (e) { salir(res, e); }
  });
  app.get("/api/hoja-ruta/origen", acceso, async (_req, res) => {
    try { res.json({ origen: await leerOrigen(db) }); } catch (e) { salir(res, e); }
  });
  app.put("/api/hoja-ruta/origen", acceso, requireAdmin, async (req, res) => {
    try { res.json({ origen: await guardarOrigen(db, req.body?.direccion) }); } catch (e) { salir(res, e); }
  });
}

module.exports = { expandirAbreviaturas, asegurarTablasMapa, claveDireccion, ubicar, ubicarEnSegundoPlano, leerOrigen, guardarOrigen, clientesHabituales, mapaDelDia, calcularRuta, registrarRutasMapa };
