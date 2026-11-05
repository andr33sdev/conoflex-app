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
  const fs = fake.listen(0);
  process.env.NOMINATIM_URL = `http://127.0.0.1:${fs.address().port}`;
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
      assert.ok(consultasQ.some((q) => /Avenida Presidente/.test(q))); // abreviaturas expandidas
      [st, d] = await llamar("GET", "/api/hoja-ruta/buscar-direccion?q=" + encodeURIComponent("Av. Pres. Perón 3798, Morón"));
      assert.equal(st, 200);
      assert.equal(d.coincidencias.length, 2);
      assert.match(d.coincidencias[0].texto, /Avenida Presidente Perón, Morón/);
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
    fs.close(); delete process.env.NOMINATIM_URL;
    for (const t of ["hoja_ruta", "hoja_ruta_geo", "hoja_ruta_config"]) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await pool.end();
  }
});
