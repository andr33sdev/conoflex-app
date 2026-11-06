"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");
const H = require("../hojaRuta");
const M = require("../hojaRutaMapa");

test("claveDireccion: mismas direcciones escritas distinto dan la misma clave", () => {
  assert.equal(M.claveDireccion("  Av. Mitre 1234,  Avellaneda "), M.claveDireccion("av mitre 1234 avellaneda"));
  assert.equal(M.claveDireccion("Perú 100"), M.claveDireccion("PERU 100"));
});

test("expandirAbreviaturas: Av. Pres. Perón → Avenida Presidente Perón", () => {
  assert.equal(M.expandirAbreviaturas("Av. Pres. Perón 3798, Morón"), "Avenida Presidente Perón 3798, Morón");
  assert.equal(M.expandirAbreviaturas("Gral. Paz 100"), "General Paz 100");
  assert.equal(M.expandirAbreviaturas("Mitre 100, Avellaneda"), "Mitre 100, Avellaneda");
});

test("calcularRuta: ordena según OSRM, devuelve km/min/tramos y cae a 'con vuelta' si no acepta sin vuelta", async () => {
  const llamadas = [];
  const fetchFn = async (url) => {
    llamadas.push(url);
    if (url.includes("roundtrip=false")) return { ok: false, json: async () => ({ code: "NotImplemented" }) };
    return { ok: true, json: async () => ({ code: "Ok",
      waypoints: [{ waypoint_index: 0 }, { waypoint_index: 2 }, { waypoint_index: 1 }],
      trips: [{ distance: 45300, duration: 5400, legs: [{ distance: 20000, duration: 1800 }, { distance: 15300, duration: 1800 }, { distance: 10000, duration: 1800 }], geometry: { coordinates: [[-58.4, -34.6], [-58.5, -34.7]] } }] }) };
  };
  const r = await M.calcularRuta([{ lat: -34.6, lng: -58.4 }, { lat: -34.7, lng: -58.5 }, { lat: -34.8, lng: -58.6 }], { vuelta: false, fetchFn });
  assert.deepEqual(r.orden, [0, 2, 1]);
  assert.equal(r.distancia_km, 45.3);
  assert.equal(r.duracion_min, 90);
  assert.equal(r.vuelta, true);
  assert.deepEqual(r.trazado[0], [-34.6, -58.4]);
  assert.ok(llamadas[0].includes("-58.4,-34.6;-58.5,-34.7")); // OSRM usa lng,lat
  await assert.rejects(M.calcularRuta([{ lat: 1, lng: 1 }], { fetchFn }), /al menos/);
  await assert.rejects(M.calcularRuta([{ lat: 1, lng: 1 }, { lat: "x", lng: 2 }], { fetchFn }), /inválidas/);
  await assert.rejects(M.calcularRuta([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], { fetchFn: async () => { throw new Error("red"); } }), /no responde/);
});

test("hoja de ruta con base real: clientes habituales, ubicación guardada, mapa del día y planta", async () => {
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  try {
    for (const t of ["hoja_ruta", "hoja_ruta_geo", "hoja_ruta_config", "estado_pedidos"]) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await H.asegurarTablaHojaRuta(pool);
    await M.asegurarTablasMapa(pool);
    await M.asegurarTablasMapa(pool); // se puede correr dos veces
    await pool.query("CREATE TABLE estado_pedidos (id INT AUTO_INCREMENT PRIMARY KEY, op VARCHAR(40), cliente VARCHAR(255), modelo VARCHAR(255), detalles TEXT, cantidad INT, fecha DATE)");
    await pool.query("INSERT INTO estado_pedidos (op, cliente, modelo, cantidad, fecha) VALUES ('OP-55','Vial SA','Cono 700',40,'2026-11-01'),('OP-55','Vial SA','Baliza',10,'2026-11-01')");

    const vero = { id: 2, nombre: "Vero", rol: "COMERCIAL" };
    const op = await H.buscarOp(pool, "OP-55");
    assert.equal(op.cliente, "Vial SA");
    assert.equal(op.articulos.length, 2);

    const a = await H.crearDespacho(pool, { usuario: vero, datos: { op: "55", cliente: "Vial SA", fecha_despacho: "2026-11-10", tipo_entrega: "ENTREGA", direccion: "Mitre 100, Avellaneda", prioridad: 4, contacto_nombre: "Ana", contacto_telefono: "11 1" } });
    assert.equal(a.creado_por, "Vero");
    // la segunda carga del mismo cliente (otra OP, distinto uso de mayúsculas) pisa a la primera como "última"
    const b = await H.crearDespacho(pool, { usuario: vero, datos: { op: "60", cliente: "vial sa ", fecha_despacho: "2026-11-12", tipo_entrega: "TRANSPORTE", direccion: "Ruta 3 km 10", transporte_nombre: "Oro Negro", prioridad: 2, observaciones: "Llamar antes" } });
    await H.crearDespacho(pool, { usuario: vero, datos: { op: "61", cliente: "Otro SRL", fecha_despacho: "2026-11-12", tipo_entrega: "RETIRA", prioridad: 1 } });
    let cl = await M.clientesHabituales(pool, { q: "vial" });
    assert.equal(cl.length, 1);
    assert.equal(cl[0].transporte_nombre, "Oro Negro");
    assert.equal(cl[0].direccion, "Ruta 3 km 10");
    assert.equal(cl[0].observaciones, "Llamar antes");
    assert.equal((await M.clientesHabituales(pool, { q: "VIAL SA", exacto: true })).length, 1);
    assert.equal((await M.clientesHabituales(pool, { q: "vial s", exacto: true })).length, 0);
    // si la última se cancela, vuelve a valer la anterior
    await H.cambiarEstado(pool, { id: b.id, estado: "CANCELADO", motivo: "pospuesto", usuario: vero });
    cl = await M.clientesHabituales(pool, { q: "vial" });
    assert.equal(cl[0].direccion, "Mitre 100, Avellaneda");
    // el mismo cliente escrito distinto (S.R.L / S R L / SRL, tildes, espacios) se reconoce igual
    await H.crearDespacho(pool, { usuario: vero, datos: { op: "62", cliente: "Distribuidora Ejad S.R.L", fecha_despacho: "2026-11-12", tipo_entrega: "ENTREGA", direccion: "Edgardo Casella 1407, Villa Rosa", contacto_nombre: "Juan", prioridad: 3 } });
    for (const nombre of ["DISTRIBUIDORA  EJAD S R L", "distribuidora ejad srl", "Distribuídora Ejad S.R.L."]) {
      assert.equal((await M.clientesHabituales(pool, { q: nombre, exacto: true }))[0]?.direccion, "Edgardo Casella 1407, Villa Rosa", nombre);
    }
    // si todas sus cargas están canceladas, igual se recuerdan los datos
    await pool.query("UPDATE hoja_ruta SET estado='CANCELADO' WHERE cliente LIKE 'Distribuidora Ejad%'");
    assert.equal((await M.clientesHabituales(pool, { q: "distribuidora ejad srl", exacto: true }))[0]?.contacto_nombre, "Juan");

    // ubicación: consulta una vez y después sale de lo guardado
    let consultas = 0;
    const consultar = async (dir) => { consultas++; return dir.includes("Mitre") ? { lat: -34.66, lng: -58.36 } : null; };
    const u1 = await M.ubicar(pool, "Mitre 100, Avellaneda", { consultar });
    const u2 = await M.ubicar(pool, "mitre 100 avellaneda", { consultar });
    assert.equal(u1.estado, "ok"); assert.equal(u2.lat, -34.66); assert.equal(consultas, 1);
    assert.equal((await M.ubicar(pool, "Calle Inventada 9", { consultar })).estado, "no_encontrada");
    assert.equal((await M.ubicar(pool, "Calle Inventada 9", { consultar })).estado, "no_encontrada");
    assert.equal(consultas, 2); // la que no se encontró no se repite en cada pantalla

    // planta
    assert.equal(await M.leerOrigen(pool), null);
    await assert.rejects(M.guardarOrigen(pool, "Calle Inventada 9", { consultar }), /No pude ubicar/);
    const o = await M.guardarOrigen(pool, "Mitre 100, Avellaneda", { consultar });
    assert.equal(o.lat, -34.66);
    assert.equal((await M.leerOrigen(pool)).direccion, "Mitre 100, Avellaneda");

    // mapa del día: los que retiran no son paradas; los cancelados no aparecen
    await H.cambiarEstado(pool, { id: b.id, estado: "PROGRAMADO", usuario: vero });
    const m = await M.mapaDelDia(pool, "2026-11-12", { consultar: async () => ({ lat: -34.7, lng: -58.5 }) });
    assert.equal(m.paradas.length, 1);
    assert.equal(m.paradas[0].estado_ubicacion, "ok");
    assert.equal(m.retiran.length, 1);
    assert.equal(m.origen.direccion, "Mitre 100, Avellaneda");
    const m2 = await M.mapaDelDia(pool, "2026-11-10", { consultar });
    assert.equal(m2.paradas[0].lat, -34.66);
    // límite de consultas nuevas por vez
    for (let i = 0; i < 4; i++) await H.crearDespacho(pool, { usuario: vero, datos: { op: `7${i}`, cliente: `C${i}`, fecha_despacho: "2026-11-20", tipo_entrega: "ENTREGA", direccion: `Calle ${i} 1`, prioridad: 3 } });
    await new Promise((r) => setTimeout(r, 50));
    const m3 = await M.mapaDelDia(pool, "2026-11-20", { maxNuevas: 2, consultar: async () => ({ lat: -34.5, lng: -58.4 }) });
    assert.equal(m3.paradas.filter((p) => p.estado_ubicacion === "ok").length >= 2, true);
    assert.equal(m3.paradas.length, 4);
  } finally {
    for (const t of ["hoja_ruta", "hoja_ruta_geo", "hoja_ruta_config", "estado_pedidos"]) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await pool.end();
  }
});

test("rutas: la planta no cae en /:id, se buscan coincidencias y se elige ubicación (servidor real + Nominatim simulado)", async () => {
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  const express = require("express");
  const consultasQ = [];
  const fake = express();
  fake.get("/search", (req, res) => {
    const q = String(req.query.q);
    consultasQ.push(q);
    if (/3798/.test(q)) return res.json([]); // la altura exacta no está en el mapa
    if (/Per[oó]n/.test(q)) return res.json([{ lat: "-34.6500", lon: "-58.6200", display_name: "x", address: { road: "Avenida Presidente Perón", city: "Morón", state: "Buenos Aires" } }, { lat: "-34.6600", lon: "-58.6300", display_name: "y", address: { road: "Avenida Presidente Perón", suburb: "Haedo", city: "Morón", state: "Buenos Aires" } }]);
    res.json([]);
  });
  fake.get("/direcciones", (req, res) => res.json({ cantidad: 0, direcciones: [] }));
  fake.get("/api/", (req, res) => {
    consultasQ.push("photon:" + req.query.q);
    res.json({ features: [
      { geometry: { coordinates: [-58.62, -34.65] }, properties: { countrycode: "AR", street: "Avenida Presidente Perón", city: "Morón", state: "Buenos Aires", osm_key: "highway" } },
      { geometry: { coordinates: [-58.63, -34.66] }, properties: { countrycode: "AR", street: "Avenida Presidente Perón", district: "Haedo", city: "Morón", state: "Buenos Aires" } },
    ] });
  });
  const fs = fake.listen(0);
  process.env.NOMINATIM_URL = `http://127.0.0.1:${fs.address().port}`;
  process.env.GEOREF_URL = process.env.PHOTON_URL = process.env.NOMINATIM_URL;
  try {
    for (const t of ["hoja_ruta", "hoja_ruta_geo", "hoja_ruta_config"]) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await H.asegurarTablaHojaRuta(pool);
    await pool.query("CREATE TABLE IF NOT EXISTS usuarios (id INT PRIMARY KEY, nombre VARCHAR(100), rol VARCHAR(30))");
    await pool.query("CREATE TABLE hoja_ruta_geo (clave VARCHAR(300) NOT NULL PRIMARY KEY, direccion VARCHAR(300) NOT NULL, lat DECIMAL(10,7) NULL, lng DECIMAL(10,7) NULL, consultado_en DATETIME DEFAULT CURRENT_TIMESTAMP)"); // tabla de la versión anterior (sin 'aprox')
    await M.asegurarTablasMapa(pool); // la actualiza sin perder nada
    const app = express(); app.use(express.json());
    const pasa = (q, r, n) => n();
    M.registrarRutasMapa(app, pool, () => pasa, pasa);
    H.registrarRutasHojaRuta(app, pool, () => pasa);
    app.use((req, res) => res.status(404).json({ error: "no" }));
    const s = app.listen(0);
    const base = `http://127.0.0.1:${s.address().port}`;
    const llamar = async (m, ruta, body) => { const r = await fetch(base + ruta, { method: m, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return [r.status, await r.json()]; };
    try {
      let [st, d] = await llamar("PUT", "/api/hoja-ruta/origen", { direccion: "Av. Pres. Perón 3798, Morón" });
      assert.equal(st, 200); // antes caía en /:id y daba 500
      assert.equal(d.origen.lat, -34.65);
      assert.ok(consultasQ.some((q) => /Avenida Presidente/.test(q))); // abreviaturas expandidas (Nominatim)
      [st, d] = await llamar("GET", "/api/hoja-ruta/buscar-direccion?q=" + encodeURIComponent("Av. Pres. Perón 3798, Morón"));
      assert.equal(st, 200);
      assert.equal(d.coincidencias.length, 2);
      assert.equal(d.caido, false);
      assert.match(d.coincidencias[0].texto, /Avenida Presidente Perón, Morón, Buenos Aires/);
      assert.equal(d.coincidencias[0].aprox, true); // sin altura
      const elegida = d.coincidencias[1];
      // lo elegido ya queda ubicado sin volver a consultar
      const antes = consultasQ.length;
      const u = await M.ubicar(pool, elegida.texto, { consultar: async () => { throw new Error("no debería consultar"); } });
      assert.equal(u.estado, "ok"); assert.equal(consultasQ.length, antes);
      // elegir ubicación para una dirección que no se encontraba
      [st, d] = await llamar("POST", "/api/hoja-ruta/ubicacion", { direccion: "Calle rara 5", lat: -34.7, lng: -58.5 });
      assert.equal(st, 200);
      assert.equal((await M.ubicar(pool, "calle rara 5", { soloCache: true })).lat, -34.7);
      [st] = await llamar("POST", "/api/hoja-ruta/ubicacion", { direccion: "x", lat: "abc", lng: 1 });
      assert.equal(st, 400);
      // las rutas con número siguen funcionando
      [st, d] = await llamar("PUT", "/api/hoja-ruta/99999", { op: "1" });
      assert.equal(st, 404);
    } finally { s.close(); }
  } finally {
    fs.close(); delete process.env.NOMINATIM_URL; delete process.env.GEOREF_URL; delete process.env.PHOTON_URL;
    for (const t of ["hoja_ruta", "hoja_ruta_geo", "hoja_ruta_config"]) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await pool.end();
  }
});

test("pedidos pendientes: se busca por cliente y solo salen las OP sin fecha de despacho", async () => {
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  try {
    for (const t of ["hoja_ruta", "estado_pedidos"]) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await H.asegurarTablaHojaRuta(pool);
    await pool.query("CREATE TABLE estado_pedidos (id INT AUTO_INCREMENT PRIMARY KEY, op VARCHAR(40), cliente VARCHAR(255), modelo VARCHAR(255), detalles TEXT, cantidad INT, fecha DATE, estado VARCHAR(60), despacho VARCHAR(60))");
    const hace = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
    const ins = (op, cli, mod, cant, fecha, estado, despacho) => pool.query("INSERT INTO estado_pedidos (op, cliente, modelo, cantidad, fecha, estado, despacho) VALUES (?,?,?,?,?,?,?)", [op, cli, mod, cant, fecha, estado, despacho]);
    await ins("OP-100", "Vial SA", "Cono 700", 40, hace(16), "EN PRODUCCION", null);
    await ins("OP-100", "Vial SA", "Baliza", 10, hace(16), "EN PRODUCCION", "");
    await ins("OP-101", "Vial SA", "Cono 500", 5, hace(11), "PREPARADO", "05/11/2026"); // ya despachada
    await ins("OP-102", "Vial SA", "Cono 300", 8, hace(8), "EN PRODUCCION", "-");
    await ins("OP-103", "Vial SA", "Cono 300", 8, hace(7), "CANCELADO", null); // cancelada
    await ins("OP-104", "Vial SA", "Pieza", 1, hace(6), "PREPARADO", "SIN DESPACHAR");
    await ins("OP-200", "Otro SRL", "Cono 700", 2, hace(15), "EN PRODUCCION", null);
    await ins("OP-102", "Vial SA", "Cono viejo", 99, hace(300), "EN PRODUCCION", null); // misma OP de un año anterior: no es la vigente
    await ins("OP-300", "Vial SA", "Mixta A", 3, hace(4), "PREPARADO", "05/11/2026");
    await ins("OP-300", "Vial SA", "Mixta B", 4, hace(4), "PREPARADO", null); // despachada a medias: solo sale lo que falta
    await ins("OP-400", "Vial SA", "Muy vieja", 1, hace(200), "EN PRODUCCION", null); // más de 6 meses: no aparece
    await ins("OP-401", "Solo Viejo SA", "Muy vieja", 1, hace(200), "EN PRODUCCION", null);
    await ins("OP-402", "Vial SA", "De hace 5 meses", 1, hace(150), "EN PRODUCCION", null); // dentro de los 6 meses
    const vero = { id: 2, nombre: "Vero" };
    await H.crearDespacho(pool, { usuario: vero, datos: { op: "100", cliente: "Vial SA", fecha_despacho: "2026-11-12", tipo_entrega: "RETIRA", prioridad: 2 } });
    // un despacho que junta varias OP: las ya cargadas se detectan por cada una
    await H.crearDespacho(pool, { usuario: vero, datos: { op: "OP 102, 300", cliente: "Vial SA", fecha_despacho: "2026-11-13", tipo_entrega: "RETIRA", prioridad: 2, articulos: [{ modelo: "Cono 300", cantidad: 8, op: "102" }, { modelo: "Mixta B", cantidad: 4, op: "300" }] } });
    const junto = (await pool.query("SELECT op, articulos FROM hoja_ruta WHERE op LIKE '102%'"))[0][0];
    assert.equal(junto.op, "102, 300");
    assert.equal(JSON.parse(junto.articulos)[1].op, "300");
    const r = await H.pedidosPendientes(pool, { q: "vial" });
    assert.equal(r[0].ops.find((o) => o.op === "300").ya.length, 1);
    assert.equal(r[0].ops.find((o) => o.op === "102").ya.length, 1);
    assert.equal(r[0].ops.find((o) => o.op === "104").ya.length, 0);
    assert.equal(r.length, 1);
    assert.deepEqual(r[0].ops.map((o) => o.op).sort(), ["100", "102", "104", "300", "402"]);
    const op100 = r[0].ops.find((o) => o.op === "100");
    assert.equal(op100.articulos.length, 2);
    assert.equal(op100.ya.length, 1); // ya tiene un despacho programado
    assert.deepEqual(r[0].ops.find((o) => o.op === "102").articulos.map((a) => a.modelo), ["Cono 300"]);
    assert.deepEqual(r[0].ops.find((o) => o.op === "300").articulos.map((a) => a.modelo), ["Mixta B"]);
    assert.equal((await H.pedidosPendientes(pool, { q: "VIAL SA", exacto: true }))[0].ops.length, 5);
    assert.equal((await H.pedidosPendientes(pool, { q: "vial s", exacto: true })).length, 0);
    assert.equal((await H.pedidosPendientes(pool, { q: "v" })).length, 0);
    assert.equal((await H.pedidosPendientes(pool, { q: "solo viejo" })).length, 0); // cliente con OP solo viejas: no aparece
    assert.equal((await H.pedidosPendientes(pool, { q: "otro" }))[0].ops.length, 1);
    await pool.query("DROP TABLE estado_pedidos");
    assert.deepEqual(await H.pedidosPendientes(pool, { q: "vial" }), []); // sin planilla: no falla
  } finally {
    for (const t of ["hoja_ruta", "estado_pedidos"]) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await pool.end();
  }
});

test("buscarDirecciones: Georef por altura, Photon, pegar coordenadas o link, Google y servicios caídos", async () => {
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  const urls = [];
  const jr = (o) => ({ ok: true, url: "", json: async () => o, text: async () => JSON.stringify(o) });
  const casela = (loc, dep, lat) => ({ altura: { unidad: "nro", valor: 1407 }, calle: { nombre: "CASELA", categoria: "CALLE" }, localidad_censal: { nombre: loc }, departamento: { nombre: dep }, provincia: { nombre: "Buenos Aires" }, ubicacion: { lat, lon: -58.9 } });
  const fetchFn = async (url, op) => {
    urls.push(String(url));
    const u = String(url);
    if (u.includes("/direcciones")) {
      if (u.includes("provincia=Buenos%20Aires")) return jr({ direcciones: [casela("Lanús", "Lanús", -34.7), casela("Villa Rosa", "Pilar", -34.45), casela("Banfield", "Lomas de Zamora", -34.75)] });
      return jr({ direcciones: [] });
    }
    if (u.includes("/api/?q=")) return jr({ features: [{ geometry: { coordinates: [-58.9, -34.45] }, properties: { countrycode: "AR", street: "Casela", district: "Villa Rosa", county: "Pilar", state: "Buenos Aires" } }, { geometry: { coordinates: [0, 0] }, properties: { countrycode: "ES", street: "Casela", city: "X" } }] });
    if (u.includes("/reverse")) return jr({ features: [{ properties: { street: "Casela", housenumber: "1407", district: "Villa Rosa", city: "Pilar", state: "Buenos Aires" } }] });
    if (u.startsWith("https://maps.app.goo.gl/")) return { ok: true, url: "https://www.google.com/maps/place/Casela/@-34.4512345,-58.9012345,17z/data=!3m1", text: async () => "" };
    if (u.includes("places:autocomplete")) { assert.equal(op.headers["X-Goog-Api-Key"], "clave"); return jr({ suggestions: [{ placePrediction: { placeId: "ABC", text: { text: "Casela 1407, Villa Rosa, Pilar, Provincia de Buenos Aires, Argentina" } } }] }); }
    if (u.includes("/places/ABC")) return jr({ formattedAddress: "Casela 1407, B1631 Villa Rosa, Provincia de Buenos Aires, Argentina", location: { latitude: -34.4512, longitude: -58.9011 } });
    throw new Error("sin red");
  };
  try {
    await pool.query("DROP TABLE IF EXISTS hoja_ruta_geo"); await M.asegurarTablasMapa(pool);
    // 1) "Casela 1407 en Villa Rosa, Pilar": Georef ubica por altura y la de Villa Rosa/Pilar va primera
    let r = await M.buscarDirecciones(pool, "Casela 1407 en Villa Rosa, Pilar", { fetchFn });
    assert.equal(r.caido, false);
    assert.equal(r.lista[0].texto, "Casela 1407, Villa Rosa, Pilar, Buenos Aires");
    assert.equal(r.lista[0].lat, -34.45); assert.equal(r.lista[0].aprox, false);
    assert.equal(r.lista.length, 2); // solo la coincidencia de Georef (filtrada por localidad) + la de Photon; la de España queda afuera
    assert.ok(urls.some((u) => u.includes("direccion=Casela%201407&provincia=Buenos%20Aires")));
    assert.ok(r.lista.every((x) => !/España|ES/.test(x.texto)));
    // lo elegido queda guardado
    assert.equal((await M.ubicar(pool, r.lista[0].texto, { soloCache: true })).lat, -34.45);
    // 2) pegar coordenadas, link largo y link corto de Google Maps
    r = await M.buscarDirecciones(pool, "-34.4512345, -58.9012345", { fetchFn });
    assert.equal(r.lista[0].fuente, "pegada"); assert.match(r.lista[0].texto, /Casela 1407, Villa Rosa, Pilar/);
    r = await M.buscarDirecciones(pool, "https://www.google.com/maps/place/Casela/@-34.4512345,-58.9012345,17z", { fetchFn });
    assert.equal(r.lista[0].lat, -34.4512345);
    r = await M.buscarDirecciones(pool, "https://maps.app.goo.gl/abc123", { fetchFn });
    assert.equal(r.lista[0].lat, -34.4512345);
    assert.equal(await M.ubicacionPegada("https://sitio-raro.com/x", { fetchFn }), null); // solo se visita Google
    assert.equal(await M.ubicacionPegada("-10.5, -20.5", { fetchFn }), null); // fuera de Argentina
    // 3) Google Places con clave
    process.env.GOOGLE_MAPS_API_KEY = "clave";
    r = await M.buscarDirecciones(pool, "Casela 14", { fetchFn });
    assert.equal(r.lista[0].fuente, "google"); assert.equal(r.lista[0].placeId, "ABC"); assert.equal(r.lista[0].lat, null);
    const det = await M.detalleGoogle("ABC", { fetchFn });
    assert.equal(det.lat, -34.4512); assert.equal(det.texto, "Casela 1407, B1631 Villa Rosa, Provincia de Buenos Aires");
    delete process.env.GOOGLE_MAPS_API_KEY;
    // 4) servicios caídos: se avisa (no es lo mismo que "sin coincidencias")
    const caido = async () => { throw new Error("sin red"); };
    r = await M.buscarDirecciones(pool, "Calle Que No Existe 99", { fetchFn: caido, consultarUltimoRecurso: caido });
    assert.deepEqual(r, { lista: [], caido: true });
    // 5) partirConsulta
    assert.deepEqual(M.partirConsulta("25 de Mayo 123, Pilar"), { direccion: "25 de Mayo 123", resto: ", Pilar" });
    assert.equal(M.partirConsulta("Casela"), null);
    assert.equal(M.partirConsulta("1407"), null);
  } finally {
    delete process.env.GOOGLE_MAPS_API_KEY;
    await pool.query("DROP TABLE IF EXISTS hoja_ruta_geo");
    await pool.end();
  }
});

test("fijarUbicacion: rechaza coordenadas vacías o (0,0) en vez de guardar el pin en el golfo de Guinea", async () => {
  const llamadas = [];
  const db = { query: async (...a) => { llamadas.push(a); return [[]]; } };
  for (const [la, lo] of [[null, null], [undefined, -58], ["", ""], [0, 0], [-34, null]]) {
    await assert.rejects(() => M.fijarUbicacion(db, "Casella 1407, Pilar", la, lo), /no es válida/);
  }
  assert.equal(llamadas.length, 0);
  const ok = await M.fijarUbicacion(db, "Casella 1407, Pilar", -34.45, -58.9);
  assert.equal(ok.lat, -34.45);
});

test("Georef con lat/lon nulos no genera una coincidencia en (0,0)", async () => {
  const jr = (o) => ({ ok: true, json: async () => o });
  const fetchFn = async (u) => String(u).includes("/direcciones")
    ? jr({ direcciones: [{ altura: { valor: 1407 }, calle: { nombre: "CASELLA" }, localidad_censal: { nombre: "Pilar" }, provincia: { nombre: "Buenos Aires" }, ubicacion: { lat: null, lon: null } }, { altura: { valor: 1407 }, calle: { nombre: "CASELLA" }, localidad_censal: { nombre: "Pilar" }, provincia: { nombre: "Buenos Aires" }, ubicacion: { lat: 0, lon: 0 } }] })
    : jr({ features: [{ geometry: { coordinates: [0, 0] }, properties: { countrycode: "AR", street: "Casella", city: "Pilar" } }] });
  process.env.GEOREF_URL = process.env.PHOTON_URL = "http://x";
  try { assert.deepEqual(await M.buscarDirecciones({ query: async () => [[]] }, "Casella 1407, Pilar", { fetchFn, consultarUltimoRecurso: async () => null }), { lista: [], caido: false }); }
  finally { delete process.env.GEOREF_URL; delete process.env.PHOTON_URL; }
});

test("búsqueda de direcciones: ortografía (Casela→Casella), Photon sin número, ranking y direcciones ya usadas", async () => {
  assert.ok(M.variantesOrtograficas("Casela 1407").includes("Casella 1407"));
  assert.ok(M.variantesOrtograficas("Beldrano 500").includes("Beldrano 500".replace("Beldrano", "Belgrano")) === false); // no inventa letras distintas
  assert.ok(M.puntaje("Casella 1407, Villa Rosa, Pilar", "casella 1407 pilar") > M.puntaje("Casella 1407, Lanús", "casella 1407 pilar"));
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  const jr = (o) => ({ ok: true, json: async () => o });
  const urls = [];
  const fetchFn = async (url) => {
    const u = String(url); urls.push(u);
    if (u.includes("/direcciones")) return jr({ direcciones: /direccion=Casella%201407/.test(u) && u.includes("provincia=Buenos%20Aires") ? [{ altura: { valor: 1407 }, calle: { nombre: "EDGARDO CASELLA" }, localidad_censal: { nombre: "Villa Rosa" }, departamento: { nombre: "Pilar" }, provincia: { nombre: "Buenos Aires" }, ubicacion: { lat: -34.45, lon: -58.9 } }] : [] });
    if (u.includes("/api/?q=")) return jr({ features: /1407/.test(decodeURIComponent(u)) ? [] : [{ geometry: { coordinates: [-58.9, -34.45] }, properties: { countrycode: "AR", street: "Edgardo Casella", district: "Villa Rosa", state: "Buenos Aires" } }] });
    throw new Error("x");
  };
  try {
    await pool.query("DROP TABLE IF EXISTS hoja_ruta_geo"); await M.asegurarTablasMapa(pool);
    await pool.query("DROP TABLE IF EXISTS hoja_ruta"); await H.asegurarTablaHojaRuta(pool);
    process.env.GEOREF_URL = process.env.PHOTON_URL = "http://x";
    // "Casela" mal escrita: Georef la encuentra con la variante y Photon sin el número
    let r = await M.buscarDirecciones(pool, "Casela 1407, Pilar", { fetchFn, consultarUltimoRecurso: async () => null });
    assert.match(r.lista[0].texto, /Edgardo Casella 1407, Villa Rosa, Pilar/);
    assert.ok(r.lista.some((x) => x.fuente === "photon"));
    // una dirección ya usada en un despacho aparece primero
    await M.fijarUbicacion(pool, "Edgardo Casella 1407, Villa Rosa, Buenos Aires", -34.4512, -58.9011);
    await H.crearDespacho(pool, { usuario: { id: 1, nombre: "V" }, datos: { op: "1", cliente: "EJAD", fecha_despacho: "2026-11-12", tipo_entrega: "ENTREGA", direccion: "Edgardo Casella 1407, Villa Rosa, Buenos Aires", prioridad: 3 } });
    r = await M.buscarDirecciones(pool, "casela villa rosa", { fetchFn, consultarUltimoRecurso: async () => null });
    assert.equal(r.lista[0].fuente, "guardada");
    r = await M.buscarDirecciones(pool, "edgardo casella", { fetchFn, consultarUltimoRecurso: async () => null });
    assert.equal(r.lista[0].fuente, "guardada");
  } finally {
    delete process.env.GEOREF_URL; delete process.env.PHOTON_URL;
    await pool.query("DROP TABLE IF EXISTS hoja_ruta_geo"); await pool.query("DROP TABLE IF EXISTS hoja_ruta");
    await pool.end();
  }
});

test("calcularRuta con orden fijo: usa /route con el orden dado, agrega la vuelta y no reordena", async () => {
  const urls = [];
  const fetchFn = async (url) => { urls.push(String(url)); return { ok: true, json: async () => ({ code: "Ok", routes: [{ distance: 42500, duration: 3000, legs: [{ distance: 10000, duration: 600 }, { distance: 20000, duration: 1500 }, { distance: 12500, duration: 900 }], geometry: { coordinates: [[-58.4, -34.6], [-58.5, -34.7]] } }] }) }; };
  const pts = [{ lat: -34.6, lng: -58.4 }, { lat: -34.7, lng: -58.5 }, { lat: -34.8, lng: -58.6 }];
  const r = await M.calcularRuta(pts, { vuelta: true, fijo: true, fetchFn });
  assert.match(urls[0], /\/route\/v1\/driving\/-58\.4,-34\.6;-58\.5,-34\.7;-58\.6,-34\.8;-58\.4,-34\.6\?/); // vuelve a la planta
  assert.deepEqual(r.orden, [0, 1, 2]);
  assert.equal(r.distancia_km, 42.5); assert.equal(r.fijo, true); assert.equal(r.tramos.length, 3);
  await M.calcularRuta(pts, { vuelta: false, fijo: true, fetchFn });
  assert.doesNotMatch(urls[1], /-58\.6,-34\.8;-58\.4/);
  await assert.rejects(M.calcularRuta(pts, { fijo: true, fetchFn: async () => { throw new Error("x"); } }), /no responde/);
});
