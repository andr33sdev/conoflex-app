"use strict";
// Reunión de las 08:00 (lunes a viernes): cada agente cuenta lo más importante de su área. No usa IA: se arma con los
// mismos datos que ya ven los agentes (avisos abiertos, panorama de stock, decisión de producción), así que no inventa nada.
const { armarPanorama, cargarStock } = require("./vigilanteStock");
const { decisionProduccion } = require("./produccionDecision");

const HORA_REUNION = 8;
const ZONA = "America/Argentina/Buenos_Aires";

/** Día, fecha y minutos desde medianoche en Argentina. dow: 1 = lunes … 7 = domingo. */
function ahoraAR(fecha = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false })
      .formatToParts(fecha).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]),
  );
  const dow = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday];
  return { hoy: `${p.year}-${p.month}-${p.day}`, dow, minutos: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

/** ¿Le toca la reunión a este momento? Lunes a viernes, desde las 08:00 y hasta el mediodía (por si el servidor estaba caído). */
function tocaReunion(fecha = new Date()) {
  const a = ahoraAR(fecha);
  return a.dow >= 1 && a.dow <= 5 && a.minutos >= HORA_REUNION * 60 && a.minutos < 12 * 60;
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

async function hallazgos(db, agente) {
  const [rows] = await db.query(
    "SELECT titulo, severidad FROM agentes_hallazgos WHERE agente = ? AND estado = 'ABIERTO' ORDER BY FIELD(severidad,'ALTA','MEDIA','BAJA'), id DESC LIMIT 60",
    [agente],
  );
  return { total: rows.length, altas: rows.filter((r) => r.severidad === "ALTA").length, top: rows.slice(0, 3).map((r) => r.titulo) };
}

function seccionAvisos(a, h, vacio) {
  if (!h.total) return { resumen: vacio, urgente: false, lineas: [] };
  return {
    resumen: `${plural(h.total, "aviso abierto", "avisos abiertos")}${h.altas ? `, ${plural(h.altas, "urgente", "urgentes")}` : ""}`,
    urgente: h.altas > 0,
    lineas: h.top,
  };
}

/** Arma el contenido de la reunión. `agentes`: [{id, nombre, puesto}] (solo los que existen). */
async function armarReunion({ pool, db, agentes }) {
  const por = Object.fromEntries(agentes.map((a) => [a.id, a]));
  const secciones = [];
  const poner = (id, s) => por[id] && secciones.push({ agente: id, nombre: por[id].nombre, puesto: por[id].puesto, ...s });

  poner("rrhh", seccionAvisos(por.rrhh, await hallazgos(db, "rrhh"), "Sin novedades de personal."));

  try {
    const pano = armarPanorama(await cargarStock(pool));
    const r = pano.resumen;
    const urgentes = pano.materias.filter((m) => ["negativo", "critico"].includes(m.nivel));
    const lineas = urgentes.slice(0, 3).map((m) => `${m.nombre}: ${m.dias != null ? `alcanza para ${Math.round(m.dias)} días` : "stock negativo"}`);
    if (r.internas_pendientes) lineas.push(`${plural(r.internas_pendientes, "pedido interno sin atender", "pedidos internos sin atender")}`);
    poner("stock", {
      resumen: r.criticas || r.semis_criticos ? `${plural(r.criticas, "materia prima crítica", "materias primas críticas")} y ${plural(r.semis_criticos, "semielaborado crítico", "semielaborados críticos")}` : "Stock en orden, sin críticos.",
      urgente: r.criticas > 0,
      lineas,
    });
  } catch (e) {
    poner("stock", { resumen: "No pude leer el stock esta mañana.", urgente: false, lineas: [] });
    console.error("[reunión] stock:", e.message);
  }

  poner("compras", seccionAvisos(por.compras, await hallazgos(db, "compras"), "Compras en orden, sin demoras ni firmas pendientes."));

  try {
    const d = await decisionProduccion(pool, { limite: 3 });
    const lineas = d.prioridades.slice(0, 3).map((p) => `${p.semielaborado}: fabricar ${Math.round(p.a_fabricar).toLocaleString("es-AR")} (${p.motivos[0] || "prioridad"})`);
    poner("produccion", {
      resumen: d.prioridades.length ? `${plural(d.pedidos_abiertos, "pedido abierto", "pedidos abiertos")}; conviene empezar por ${d.prioridades[0].semielaborado}` : `${plural(d.pedidos_abiertos, "pedido abierto", "pedidos abiertos")}, nada urgente para fabricar`,
      urgente: d.prioridades.some((p) => ["critico", "negativo"].includes(p.nivel)),
      lineas,
    });
  } catch (e) {
    poner("produccion", { resumen: "No pude armar las prioridades esta mañana.", urgente: false, lineas: [] });
    console.error("[reunión] producción:", e.message);
  }
  if (por.ventas) poner("ventas", seccionAvisos(por.ventas, await hallazgos(db, "ventas"), "Sin consultas de clientes esperando respuesta."));
  if (por.seguimiento) poner("seguimiento", seccionAvisos(por.seguimiento, await hallazgos(db, "seguimiento"), "Ningún mail enviado quedó sin respuesta."));
  return { secciones, urgentes: secciones.filter((s) => s.urgente).length };
}

async function asegurarTablaReuniones(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS agentes_reuniones (
      fecha DATE PRIMARY KEY,
      contenido MEDIUMTEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
}

/**
 * Hace la reunión de hoy si todavía no se hizo. `reclamar` evita que dos instancias (o dos minutos seguidos) la hagan dos veces.
 * `forzar` (solo administración) rehace la de hoy sin avisar a nadie.
 */
async function hacerReunion(deps, { fecha = new Date(), forzar = false } = {}) {
  const { db, agentes, revisar = [], notificar } = deps;
  const { hoy } = ahoraAR(fecha);
  if (forzar) await db.query("DELETE FROM agentes_reuniones WHERE fecha = ?", [hoy]);
  const [r] = await db.query("INSERT IGNORE INTO agentes_reuniones (fecha, contenido) VALUES (?, NULL)", [hoy]);
  if (!r.affectedRows) return null;
  try {
    // Antes de hablar cada uno repasa su área, para llegar con datos de esta mañana.
    for (const f of revisar) await f().catch((e) => console.error("[reunión] revisión:", e.message));
    const c = await armarReunion({ ...deps, agentes });
    // De la reunión salen ideas para mejorar (reglas + algunas de Gemini, si está disponible).
    try {
      const { sugerenciasDe, ideasConIA } = require("./temario");
      c.sugerencias = await sugerenciasDe({ db, secciones: c.secciones });
      c.sugerencias.push(...(await ideasConIA({ ai: deps.ai, secciones: c.secciones, ya: c.sugerencias })));
    } catch (e) {
      console.error("[reunión] sugerencias:", e.message);
      c.sugerencias = [];
    }
    const contenido = { fecha: hoy, generada: new Date().toISOString(), ...c };
    await db.query("UPDATE agentes_reuniones SET contenido = ? WHERE fecha = ?", [JSON.stringify(contenido), hoy]);
    if (!forzar && notificar) await notificar(contenido);
    return contenido;
  } catch (e) {
    await db.query("DELETE FROM agentes_reuniones WHERE fecha = ? AND contenido IS NULL", [hoy]).catch(() => {});
    throw e;
  }
}

async function ultimaReunion(db) {
  const [rows] = await db.query("SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, contenido FROM agentes_reuniones WHERE contenido IS NOT NULL ORDER BY fecha DESC LIMIT 1");
  if (!rows[0]) return null;
  try {
    return JSON.parse(rows[0].contenido);
  } catch {
    return null;
  }
}

/** Revisa cada minuto si ya toca la reunión. */
function iniciarReunion(deps) {
  if (String(process.env.AGENTES_REUNION || "").toLowerCase() === "off") return () => {};
  const tic = () => {
    if (!tocaReunion()) return;
    hacerReunion(deps).catch((e) => console.error("[reunión]", e.message));
  };
  const t = setInterval(tic, 60 * 1000);
  const t0 = setTimeout(tic, 25000);
  t.unref?.();
  t0.unref?.();
  return () => {
    clearInterval(t);
    clearTimeout(t0);
  };
}

module.exports = { HORA_REUNION, ahoraAR, tocaReunion, armarReunion, asegurarTablaReuniones, hacerReunion, ultimaReunion, iniciarReunion };
