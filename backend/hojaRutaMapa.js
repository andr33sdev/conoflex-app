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
  const [cols] = await db.query("SHOW COLUMNS FROM hoja_ruta_geo LIKE 'aprox'");
  if (!cols.length) await db.query("ALTER TABLE hoja_ruta_geo ADD COLUMN aprox TINYINT NOT NULL DEFAULT 0");
  await db.query("DELETE FROM hoja_ruta_geo WHERE lat IS NOT NULL AND NOT (lat BETWEEN -56 AND -21 AND lng BETWEEN -74 AND -53)"); // ubicaciones fuera de Argentina (ej. 0,0) guardadas por error
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

// Zona de trabajo (Gran Buenos Aires): se prefiere por sobre el resto del país, sin excluirlo.
const ZONA = "-59.3,-34.2,-57.9,-35.1";

async function nominatim(texto, { fetchFn = fetch, limite = 1, detalle = false } = {}) {
  const url = `${NOMINATIM_URL()}/search?format=jsonv2&limit=${limite}&countrycodes=ar&viewbox=${ZONA}&bounded=0${detalle ? "&addressdetails=1" : ""}&q=${encodeURIComponent(texto)}`;
  const res = await fetchFn(url, { headers: { "User-Agent": "Conoflex-App/1.0 (hoja de ruta)", "Accept-Language": "es" }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`El servicio de mapas respondió ${res.status}.`);
  const datos = await res.json();
  return (Array.isArray(datos) ? datos : []).map((p) => ({ lat: Number(p.lat), lng: Number(p.lon), p })).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng));
}
const conPais = (t) => (/argentina/i.test(t) ? t : `${t}, Argentina`);
/** Saca la altura ("Perón 3798, Morón" → "Perón, Morón") para buscar al menos la calle. */
const sinAltura = (t) => t.replace(/\s+\d{1,5}(?=\s*(,|$))/, "").replace(/\s+\d{1,5}\b/, "");

/** Consulta a Nominatim. Devuelve {lat,lng,aprox} o null si no la encuentra; lanza si el servicio no responde. */
async function consultarNominatim(direccion, { fetchFn = fetch } = {}) {
  const completa = expandirAbreviaturas(direccion);
  let r = (await nominatim(conPais(completa), { fetchFn }))[0];
  if (r) return { lat: r.lat, lng: r.lng, aprox: false };
  const calle = sinAltura(completa);
  if (calle !== completa) {
    r = (await nominatim(conPais(calle), { fetchFn }))[0];
    if (r) return { lat: r.lat, lng: r.lng, aprox: true }; // solo la calle: ubicación aproximada
  }
  return null;
}

// ───────────────────────── Búsqueda de direcciones (autocompletar) ─────────────────────────
// Varias fuentes, de la más precisa a la más general:
//  · Google Places (solo si hay GOOGLE_MAPS_API_KEY): la mejor calidad, como Google Maps.
//  · Georef (API oficial del Estado argentino): calcula la ubicación por altura, aunque OpenStreetMap no tenga el número.
//  · Photon (OpenStreetMap): sirve para autocompletar mientras se escribe.
//  · Nominatim: último recurso.
// Y siempre se puede pegar coordenadas / un link de Google Maps, o marcar el punto en el mapa.
const GEOREF_URL = () => (process.env.GEOREF_URL || "https://apis.datos.gob.ar/georef/api/v2.0").replace(/\/+$/, "");
const PHOTON_URL = () => (process.env.PHOTON_URL || "https://photon.komoot.io").replace(/\/+$/, "");
const GOOGLE_KEY = () => process.env.GOOGLE_MAPS_API_KEY || "";
const CENTRO = { lat: -34.6, lng: -58.5 }; // Gran Buenos Aires: se prefiere por sobre el resto del país
const PROVINCIAS = ["Buenos Aires", "Ciudad Autonoma de Buenos Aires", "Catamarca", "Chaco", "Chubut", "Cordoba", "Corrientes", "Entre Rios", "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquen", "Rio Negro", "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucuman"];

const normTxt = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e"]);
const titulo = (t) => String(t || "").toLowerCase().split(/(\s+)/).map((w, i) => (i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join("");
const unir = (...partes) => partes.map((x) => String(x || "").trim()).filter((x, i, a) => x && a.findIndex((y) => normTxt(y) === normTxt(x)) === i).join(", ");
const enAR = (lat, lng) => lat <= -21 && lat >= -56 && lng <= -53 && lng >= -74;

async function pedirJson(url, { fetchFn = fetch, opciones = {}, espera = 8000 } = {}) {
  const res = await fetchFn(url, { ...opciones, signal: AbortSignal.timeout(espera) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Calle y altura ("Casela 1407") y el resto del texto ("en Villa Rosa, Pilar"), para consultar a Georef. */
function partirConsulta(q) {
  const parte0 = q.split(",")[0];
  const ms = [...parte0.matchAll(/\d{1,5}/g)];
  if (!ms.length) return null;
  const u = ms[ms.length - 1];
  const direccion = parte0.slice(0, u.index + u[0].length).trim();
  if (normTxt(direccion).split(" ").filter((w) => !/^\d+$/.test(w)).length < 1) return null; // solo números
  return { direccion, resto: q.slice(direccion.length) };
}

/** Errores de ortografía típicos ("Casela" por "Casella", "Beldrano" por "Belgrano"…): otras formas de escribir la calle. */
function variantesOrtograficas(direccion) {
  const m = String(direccion).match(/^(.*?)(\s*\d{1,5})$/);
  const calle = m ? m[1] : direccion, altura = m ? m[2] : "";
  const cambios = [
    [/ll/gi, "l"], [/l/gi, "ll"], [/ss/gi, "s"], [/s/gi, "ss"], [/rr/gi, "r"], [/nn/gi, "n"], [/mm/gi, "m"], [/tt/gi, "t"], [/cc/gi, "c"],
    [/v/gi, "b"], [/b/gi, "v"], [/y/gi, "ll"], [/ll/gi, "y"], [/h/gi, ""], [/z/gi, "s"], [/s/gi, "z"], [/c(?=[ei])/gi, "s"], [/k/gi, "qu"], [/ü/gi, "u"],
  ];
  const sal = new Set();
  for (const [re, por] of cambios) { const v = calle.replace(re, por); if (v !== calle) sal.add(`${v}${altura}`.trim()); }
  return [...sal].slice(0, 12);
}

/** Georef: dirección con altura → ubicación calculada. Las coincidencias con la localidad/partido escritos van primero. */
async function buscarGeoref(q, { fetchFn } = {}) {
  const parte = partirConsulta(q);
  if (!parte) return [];
  const resto = normTxt(parte.resto);
  const provEscrita = PROVINCIAS.filter((p) => resto.includes(normTxt(p)));
  const provincias = provEscrita.length ? provEscrita.map((p) => (p === "Ciudad Autonoma de Buenos Aires" ? "Ciudad Autónoma de Buenos Aires" : p)) : ["Buenos Aires", "Ciudad Autónoma de Buenos Aires"];
  const consultar = async (prov, direccion = parte.direccion) => {
    const url = `${GEOREF_URL()}/direcciones?direccion=${encodeURIComponent(direccion)}${prov ? `&provincia=${encodeURIComponent(prov)}` : ""}&max=25`;
    const d = await pedirJson(url, { fetchFn });
    return Array.isArray(d.direcciones) ? d.direcciones : [];
  };
  const intentos = await Promise.allSettled(provincias.map((p) => consultar(p)));
  let crudas = intentos.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (!crudas.length) {
    if (intentos.every((r) => r.status === "rejected")) throw intentos[0].reason; // servicio caído ≠ sin coincidencias
    crudas = await consultar(null).catch(() => []);
  }
  if (!crudas.length) { // por si está mal escrita la calle: se prueban variantes de ortografía (todas juntas, con un tope)
    const alt = await Promise.allSettled(variantesOrtograficas(parte.direccion).slice(0, 6).flatMap((v) => provincias.slice(0, 2).map((pv) => consultar(pv, v))));
    crudas = alt.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  }
  const salida = crudas.filter((x) => x.ubicacion?.lat != null && x.ubicacion?.lon != null && enAR(Number(x.ubicacion.lat), Number(x.ubicacion.lon))).map((x) => {
    const loc = x.localidad_censal?.nombre, dep = x.departamento?.nombre, prov = x.provincia?.nombre;
    const calle = `${titulo(x.calle?.nombre)}${x.altura?.valor ? ` ${x.altura.valor}` : ""}`;
    const puntos = [loc, dep].filter(Boolean).reduce((a, n) => a + (resto.includes(normTxt(n)) ? 1 : 0), 0);
    return { texto: unir(calle, loc, dep, prov), lat: Number(x.ubicacion.lat), lng: Number(x.ubicacion.lon), aprox: !x.altura?.valor, fuente: "georef", puntos };
  });
  const coinciden = salida.filter((x) => x.puntos > 0);
  return (coinciden.length ? coinciden.sort((a, b) => b.puntos - a.puntos) : salida).slice(0, 6);
}

/** Photon (OpenStreetMap): rápido y tolerante, ideal para ir mostrando coincidencias mientras se escribe. */
async function buscarPhoton(q, { fetchFn } = {}) {
  const pedir = (t) => pedirJson(`${PHOTON_URL()}/api/?q=${encodeURIComponent(t)}&limit=8&lat=${CENTRO.lat}&lon=${CENTRO.lng}&location_bias_scale=0.3`, { fetchFn });
  let d = await pedir(q);
  const sinNumero = q.replace(/\b\d{1,5}\b/g, " ").replace(/\s+/g, " ").replace(/\s,/g, ",").trim(); // OSM suele no tener la altura: la calle sola sí
  if (!(d.features || []).length && sinNumero && sinNumero !== q) d = await pedir(sinNumero);
  return (d.features || []).filter((f) => f.geometry?.coordinates && (!f.properties?.countrycode || f.properties.countrycode === "AR")).map((f) => {
    const p = f.properties || {};
    const [lng, lat] = f.geometry.coordinates;
    const zona = [p.district || p.locality, p.city || p.county, p.state];
    const calle = p.street || (p.osm_key === "highway" ? p.name : null);
    const texto = calle ? unir(`${calle}${p.housenumber ? ` ${p.housenumber}` : ""}`, ...zona) : unir(p.name, ...zona.slice(1));
    return { texto, lat: Number(lat), lng: Number(lng), aprox: !p.housenumber, fuente: "photon" };
  }).filter((x) => x.texto && Number.isFinite(x.lat) && Number.isFinite(x.lng) && enAR(x.lat, x.lng));
}

/** Google Places (opcional, con clave): devuelve sugerencias; las coordenadas se piden recién al elegir una. */
async function buscarGoogle(q, { fetchFn } = {}) {
  const key = GOOGLE_KEY();
  if (!key) return [];
  const d = await pedirJson("https://places.googleapis.com/v1/places:autocomplete", {
    fetchFn,
    opciones: { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key }, body: JSON.stringify({ input: q, languageCode: "es", regionCode: "AR", includedRegionCodes: ["ar"], locationBias: { circle: { center: { latitude: CENTRO.lat, longitude: CENTRO.lng }, radius: 50000 } } }) },
  });
  return (d.suggestions || []).map((x) => x.placePrediction).filter((x) => x?.placeId).map((x) => ({ texto: x.text?.text || "", placeId: x.placeId, fuente: "google" })).filter((x) => x.texto).slice(0, 8);
}
async function detalleGoogle(placeId, { fetchFn } = {}) {
  const key = GOOGLE_KEY();
  if (!key) throw err(400, "Google Maps no está configurado.");
  const d = await pedirJson(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=es`, { fetchFn, opciones: { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "location,formattedAddress" } } });
  if (!Number.isFinite(d.location?.latitude)) throw err(422, "No pude obtener la ubicación de ese lugar.");
  return { texto: String(d.formattedAddress || "").replace(/, Argentina$/, ""), lat: d.location.latitude, lng: d.location.longitude };
}

/** Coordenadas pegadas ("-34.45, -58.91") o un link de Google Maps (largo o corto) → ubicación. */
function coordenadasEnTexto(t) {
  const m = String(t).match(/@?(-?\d{1,2}\.\d{3,})\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})/) || String(t).match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) && enAR(lat, lng) ? { lat, lng } : null;
}
async function ubicacionPegada(q, { fetchFn = fetch } = {}) {
  const t = q.trim();
  let c = null;
  if (/^https?:\/\//i.test(t)) {
    let u;
    try { u = new URL(t); } catch { return null; }
    if (!/(^|\.)(google\.[a-z.]+|goo\.gl|g\.co)$/i.test(u.hostname)) return null; // solo Google: no se visita cualquier sitio
    c = coordenadasEnTexto(decodeURIComponent(t));
    if (!c) {
      try {
        const res = await fetchFn(t, { redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0" } });
        c = coordenadasEnTexto(decodeURIComponent(res.url || "")) || coordenadasEnTexto((await res.text()).slice(0, 400000));
      } catch { return null; }
    }
  } else c = coordenadasEnTexto(t);
  if (!c) return null;
  let texto = `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`;
  try { // dirección legible de ese punto
    const d = await pedirJson(`${PHOTON_URL()}/reverse?lat=${c.lat}&lon=${c.lng}`, { fetchFn, espera: 5000 });
    const p = d.features?.[0]?.properties;
    if (p) texto = unir(`${p.street || p.name || ""}${p.housenumber ? ` ${p.housenumber}` : ""}`, p.district || p.locality, p.city || p.county, p.state) || texto;
  } catch { /* se queda con las coordenadas */ }
  return { texto, lat: c.lat, lng: c.lng, aprox: false, fuente: "pegada" };
}

const memoria = new Map(); // búsquedas recientes (mientras se escribe se repiten mucho)
const RECUERDA_MS = 10 * 60 * 1000;

/** Direcciones que ya se usaron en despachos anteriores y que coinciden con lo escrito (la fuente más confiable para clientes habituales). */
const distancia = (a, b) => { // Levenshtein
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
/** ¿La palabra escrita coincide con alguna de la dirección guardada? (prefijo o con hasta 1–2 letras de diferencia) */
const palabraCoincide = (w, palabrasDir) => palabrasDir.some((x) => x.startsWith(w) || (w.length >= 4 && distancia(w, x.slice(0, w.length + 1)) <= (w.length >= 7 ? 2 : 1)) || (/^\d+$/.test(w) && x === w));

async function buscarGuardadas(db, q) {
  const palabras = normTxt(q).split(" ").filter((w) => w.length >= 2).slice(0, 6);
  if (!palabras.length) return [];
  let rows;
  try { [rows] = await db.query("SELECT direccion, MAX(id) AS mid FROM hoja_ruta WHERE direccion IS NOT NULL AND direccion <> '' GROUP BY direccion ORDER BY mid DESC LIMIT 600"); } catch { return []; }
  const candidatas = rows.filter((r) => { const pd = normTxt(r.direccion).split(" "); return palabras.every((w) => palabraCoincide(w, pd)); }).slice(0, 5);
  const salida = [];
  for (const r of candidatas) {
    const u = await ubicar(db, r.direccion, { soloCache: true }).catch(() => null);
    if (u?.estado === "ok") salida.push({ texto: r.direccion, lat: u.lat, lng: u.lng, aprox: !!u.aprox, fuente: "guardada" });
  }
  return salida;
}

/** Cuánto se parece una coincidencia a lo escrito (palabras y altura). */
function puntaje(texto, q) {
  const t = ` ${normTxt(texto)} `;
  const palabras = normTxt(q).split(" ").filter(Boolean);
  if (!palabras.length) return 0;
  return palabras.reduce((a, w) => a + (t.includes(` ${w} `) ? 1 : t.includes(` ${w}`) ? 0.6 : 0), 0) / palabras.length;
}

/**
 * Coincidencias para lo que se escribió, para que la persona elija. Devuelve { lista, caido }:
 * `caido` = ninguna fuente respondió (distinto de "no hay coincidencias").
 */
async function buscarDirecciones(db, texto, { fetchFn, consultarUltimoRecurso = consultarNominatim } = {}) {
  const q = limpiar(texto, 200);
  if (q.length < 3) return { lista: [], caido: false };
  const clave = claveDireccion(q);
  const guardada = memoria.get(clave);
  if (guardada && Date.now() - guardada.t < RECUERDA_MS) return guardada.r;

  const pegada = await ubicacionPegada(q, { fetchFn });
  let lista = pegada ? [pegada] : [];
  let respondio = !!pegada;
  if (!pegada) {
    const completa = expandirAbreviaturas(q);
    const fuentes = GOOGLE_KEY() ? [buscarGoogle(completa, { fetchFn }), buscarGeoref(completa, { fetchFn }), buscarPhoton(completa, { fetchFn })] : [buscarGeoref(completa, { fetchFn }), buscarPhoton(completa, { fetchFn })];
    const [guardadas, res] = await Promise.all([buscarGuardadas(db, q), Promise.allSettled(fuentes)]);
    respondio = res.some((r) => r.status === "fulfilled") || guardadas.length > 0;
    const externas = res.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    // Primero lo ya usado; después, lo que más se parece a lo escrito (las exactas, no aproximadas, antes).
    lista = [...guardadas, ...externas.map((x, i) => ({ x, i, pt: puntaje(x.texto, q) - (x.aprox ? 0.01 : 0) })).sort((a, b) => b.pt - a.pt || a.i - b.i).map((o) => o.x)];
    if (!lista.length) { // último recurso: Nominatim (con la cola de 1 por segundo)
      try {
        const r = await enCola(() => consultarUltimoRecurso(completa, { fetchFn }));
        respondio = true;
        if (r) lista = [{ texto: q, lat: r.lat, lng: r.lng, aprox: !!r.aprox, fuente: "nominatim" }];
      } catch { /* sin respuesta */ }
    }
  }
  const vistos = new Set();
  const salida = [];
  for (const x of lista) {
    const k = x.placeId ? `g:${x.placeId}` : claveDireccion(x.texto);
    if (!x.texto || vistos.has(k)) continue;
    vistos.add(k);
    salida.push({ texto: x.texto, lat: x.lat ?? null, lng: x.lng ?? null, aprox: !!x.aprox, fuente: x.fuente, placeId: x.placeId });
    if (x.lat != null) await db.query(
      "INSERT INTO hoja_ruta_geo (clave, direccion, lat, lng, aprox, consultado_en) VALUES (?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE lat=VALUES(lat), lng=VALUES(lng), aprox=VALUES(aprox), consultado_en=NOW()",
      [claveDireccion(x.texto).slice(0, 300), x.texto.slice(0, 300), x.lat, x.lng, x.aprox ? 1 : 0],
    );
  }
  const r = { lista: salida.slice(0, 8), caido: !respondio };
  if (respondio) { if (memoria.size > 500) memoria.clear(); memoria.set(clave, { t: Date.now(), r }); }
  return r;
}

/** La persona eligió dónde queda una dirección: se guarda como ubicación exacta. */
async function fijarUbicacion(db, direccion, lat, lng) {
  const dir = limpiar(direccion, 300);
  const vacio = (v) => v === null || v === undefined || String(v).trim() === ""; // Number(null) daba 0 y dejaba el pin en (0,0)
  const la = vacio(lat) ? NaN : Number(lat), lo = vacio(lng) ? NaN : Number(lng);
  if (!claveDireccion(dir)) throw err(400, "Falta la dirección.");
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180 || (la === 0 && lo === 0)) throw err(400, "La ubicación no es válida.");
  await db.query(
    "INSERT INTO hoja_ruta_geo (clave, direccion, lat, lng, aprox, consultado_en) VALUES (?,?,?,?,0,NOW()) ON DUPLICATE KEY UPDATE lat=VALUES(lat), lng=VALUES(lng), aprox=0, consultado_en=NOW()",
    [claveDireccion(dir), dir, la, lo],
  );
  return { direccion: dir, lat: la, lng: lo };
}

/**
 * Ubica una dirección: primero en lo ya guardado; si no, consulta (con cola de 1 por segundo) y guarda. `soloCache` no consulta.
 * Una dirección que no se encontró se recuerda 1 hora para no repetir la consulta en cada pantalla.
 */
async function ubicar(db, direccion, { fetchFn, soloCache = false, consultar = consultarNominatim } = {}) {
  const dir = limpiar(direccion, 300);
  const clave = claveDireccion(dir);
  if (!clave) return { estado: "sin_direccion" };
  const [rows] = await db.query("SELECT lat, lng, aprox, (consultado_en < NOW() - INTERVAL 1 HOUR) AS vieja FROM hoja_ruta_geo WHERE clave = ?", [clave]);
  const g = rows[0];
  if (g && g.lat != null && enAR(Number(g.lat), Number(g.lng))) return { estado: "ok", lat: Number(g.lat), lng: Number(g.lng), aprox: !!g.aprox };
  if (g && !g.vieja) return { estado: "no_encontrada" };
  if (soloCache) return { estado: "pendiente" };
  let r;
  try { r = await enCola(() => consultar(dir, { fetchFn })); } catch { return { estado: "sin_servicio" }; }
  await db.query(
    "INSERT INTO hoja_ruta_geo (clave, direccion, lat, lng, aprox, consultado_en) VALUES (?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE lat=VALUES(lat), lng=VALUES(lng), aprox=VALUES(aprox), consultado_en=NOW()",
    [clave, dir, r?.lat ?? null, r?.lng ?? null, r?.aprox ? 1 : 0],
  );
  return r ? { estado: "ok", lat: r.lat, lng: r.lng, aprox: !!r.aprox } : { estado: "no_encontrada" };
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
    `SELECT id, op, cliente, tipo_entrega, direccion, transporte_nombre, prioridad, estado, contacto_nombre, contacto_telefono, observaciones
       FROM hoja_ruta WHERE fecha_despacho = ? AND estado <> 'CANCELADO' ORDER BY prioridad DESC, id`, [fecha]);
  let nuevas = 0;
  const paradas = [];
  const retiran = [];
  for (const r of rows) {
    if (r.tipo_entrega === "RETIRA") { retiran.push(r); continue; }
    let u = await ubicar(db, r.direccion, { ...deps, soloCache: true });
    if (u.estado === "pendiente" && nuevas < maxNuevas) { nuevas++; u = await ubicar(db, r.direccion, deps); }
    paradas.push({ ...r, estado_ubicacion: u.estado, lat: u.lat ?? null, lng: u.lng ?? null, aproximada: !!u.aprox });
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
  app.get("/api/hoja-ruta/buscar-direccion", acceso, async (req, res) => {
    try { const r = await buscarDirecciones(db, req.query.q); res.json({ coincidencias: r.lista, caido: r.caido }); } catch (e) { salir(res, e); }
  });
  app.get("/api/hoja-ruta/direccion-detalle", acceso, async (req, res) => {
    try { res.json(await detalleGoogle(String(req.query.id || ""))); } catch (e) { salir(res, e.status ? e : err(503, "El servicio de mapas no responde ahora.")); }
  });
  app.post("/api/hoja-ruta/ubicacion", acceso, async (req, res) => {
    try { res.json(await fijarUbicacion(db, req.body?.direccion, req.body?.lat, req.body?.lng)); } catch (e) { salir(res, e); }
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

module.exports = { variantesOrtograficas, buscarGuardadas, puntaje, detalleGoogle, ubicacionPegada, partirConsulta, buscarDirecciones, fijarUbicacion, expandirAbreviaturas, asegurarTablasMapa, claveDireccion, ubicar, ubicarEnSegundoPlano, leerOrigen, guardarOrigen, clientesHabituales, mapaDelDia, calcularRuta, registrarRutasMapa };
