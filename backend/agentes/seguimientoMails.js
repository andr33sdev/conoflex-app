"use strict";
// Sofi, la agente de seguimiento: controla los mails que el equipo ENVIÓ (Cami y la persona de ventas, todos salen de la misma cuenta de Gmail)
// y que nunca tuvieron respuesta. No necesita etiquetas: mira la carpeta de enviados.
//
// Cómo lo hace barato:
//   1. UNA consulta a Gmail lista los hilos con mails enviados en la ventana (por defecto 45 días). Cada hilo trae su historyId.
//   2. Solo se vuelve a leer (y solo los encabezados, nunca el cuerpo) un hilo cuyo historyId cambió desde la última vez.
//      Los hilos sin novedades no cuestan nada: los días de espera se calculan desde la base, sin tocar Gmail.
//   3. La IA (opcional) solo entra para los hilos que ya llevan días esperando y solo para saber QUÉ mandamos (presupuesto, consulta, cortesía).
// REGLA DE ORO: nunca envía. Lo único que puede hacer es dejar un BORRADOR de seguimiento en el hilo.

const DIA = 86400000;
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const CONFIG = {
  ventanaDias: num(process.env.SEGUIMIENTO_VENTANA_DIAS, 45),
  diasAviso: num(process.env.SEGUIMIENTO_DIAS_AVISO, 3),
  diasUrgente: num(process.env.SEGUIMIENTO_DIAS_URGENTE, 7),
  diasFrio: num(process.env.SEGUIMIENTO_DIAS_FRIO, 30),
  maxHilos: num(process.env.SEGUIMIENTO_MAX_HILOS, 300),
  maxLecturasPorRevision: num(process.env.SEGUIMIENTO_MAX_LECTURAS, 120),
};
const DOMINIOS_PUBLICOS = new Set(["gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.ar", "live.com", "icloud.com"]);

const recorte = (t, n) => String(t || "").replace(/\s+/g, " ").trim().slice(0, n);
const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const json = (v) => {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};
/** DATETIME naive (guardado siempre en UTC por esta agente) → ms. mysql2 entrega Date armado con la hora local: se leen sus componentes tal cual. */
const aMs = (v) => {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds());
  const t = new Date(String(v).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(v)) ? "" : "Z")).getTime();
  return Number.isNaN(t) ? null : t;
};
const cuando = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

async function asegurarTablasSeguimiento(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS seguimiento_hilos (
      thread_id VARCHAR(64) PRIMARY KEY,
      history_id VARCHAR(40) NULL,
      asunto VARCHAR(300) NULL,
      contacto_email VARCHAR(200) NULL,
      contacto_nombre VARCHAR(200) NULL,
      ultimo_msg_id VARCHAR(64) NULL,
      ultimo_de VARCHAR(10) NULL,
      ultimo_nuestro_en DATETIME NULL,
      envios_sin_respuesta INT NOT NULL DEFAULT 0,
      mensajes INT NOT NULL DEFAULT 0,
      snippet VARCHAR(500) NULL,
      clase VARCHAR(12) NULL,
      clase_msg_id VARCHAR(64) NULL,
      que_enviamos VARCHAR(300) NULL,
      estado VARCHAR(12) NOT NULL DEFAULT 'ESPERANDO',
      motivo VARCHAR(60) NULL,
      pospuesto_hasta DATETIME NULL,
      descartado_msg_id VARCHAR(64) NULL,
      nota VARCHAR(300) NULL,
      decidido_por VARCHAR(120) NULL,
      decidido_en DATETIME NULL,
      borrador_id VARCHAR(64) NULL,
      borrador_en DATETIME NULL,
      respondido_en DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_estado (estado, ultimo_nuestro_en)
    )`);
}

// ---------- análisis de un hilo (puro) ----------
const NO_REPLY = /(^|[^a-z])(no-?reply|noreply|do-?not-?reply|notificaciones?|notifications?|mailer-daemon|postmaster|bounce|newsletter)([^a-z]|$)/i;
const REBOTE = /mailer-daemon|postmaster|delivery status notification|undeliverable|no se pudo entregar|mail delivery (failed|subsystem)|returned mail/i;
const AUTOMATICO = /respuesta autom[aá]tica|autorespuesta|auto-?reply|automatic reply|out of office|fuera de (la )?oficina|vacaciones|ausente/i;

const direccion = (txt) => {
  const m = String(txt || "").match(/[\w.+'-]+@[\w-]+(\.[\w-]+)+/);
  return m ? m[0].toLowerCase() : "";
};
const direcciones = (txt) => [...new Set(String(txt || "").match(/[\w.+'-]+@[\w-]+(\.[\w-]+)+/g) || [])].map((x) => x.toLowerCase());
const nombreDe = (txt) => {
  const n = String(txt || "").replace(/<[^>]*>/g, "").replace(/["']/g, "").trim();
  return n && !n.includes("@") ? n.slice(0, 120) : "";
};

/** Dominios que cuentan como "de la casa": el de la cuenta (si no es un correo público) y los que se agreguen por variable de entorno. */
function dominiosInternos(miEmail, extra = process.env.SEGUIMIENTO_DOMINIOS_INTERNOS || "") {
  const out = new Set(String(extra).split(",").map((d) => d.trim().toLowerCase()).filter(Boolean));
  const d = String(miEmail || "").split("@")[1]?.toLowerCase();
  if (d && !DOMINIOS_PUBLICOS.has(d)) out.add(d);
  return out;
}

/**
 * @param hilo { threadId, historyId, mensajes: [{ id, fecha(ms), de, para, cc, asunto, enviado, borrador, automatico, snippet }] } — solo encabezados.
 * @returns null si el hilo no corresponde (nunca enviamos algo a alguien de afuera) o un resumen del estado:
 *  { estado: 'ESPERANDO'|'RESPONDIDO'|'REBOTE', ... }
 */
function analizarHilo(hilo, { miEmail = "", internos = dominiosInternos(miEmail) } = {}) {
  const yo = String(miEmail || "").toLowerCase();
  const msgs = (hilo?.mensajes || []).filter((m) => !m.borrador).sort((a, b) => a.fecha - b.fecha);
  const tieneBorrador = (hilo?.mensajes || []).some((m) => m.borrador);
  if (!msgs.length) return null;
  const esNuestro = (m) => m.enviado === true;
  const nuestros = msgs.filter(esNuestro);
  if (!nuestros.length) return null;

  const externo = (a) => a && a !== yo && !internos.has(a.split("@")[1]) && !NO_REPLY.test(a);
  const ultimoNuestro = nuestros[nuestros.length - 1];
  const destinatarios = [...direcciones(ultimoNuestro.para), ...direcciones(ultimoNuestro.cc)];
  const afuera = destinatarios.filter(externo);
  if (!afuera.length) return null; // interno, a una dirección automática o sin destinatarios

  const principal = direcciones(ultimoNuestro.para).find(externo) || afuera[0];
  const nombrePrincipal = (String(ultimoNuestro.para || "").split(",").find((p) => direccion(p) === principal) || "");
  const base = {
    threadId: hilo.threadId, historyId: hilo.historyId || null, asunto: recorte(ultimoNuestro.asunto || msgs[0].asunto || "(sin asunto)", 300),
    contacto_email: principal, contacto_nombre: nombreDe(nombrePrincipal) || principal,
    mensajes: hilo.mensajes.length, ultimo_nuestro_ms: ultimoNuestro.fecha, ultimo_nuestro_id: ultimoNuestro.id, snippet: recorte(ultimoNuestro.snippet, 500), tiene_borrador: tieneBorrador,
  };

  // Lo último que NO es una respuesta automática ni un mail nuestro mal clasificado.
  const reales = msgs.filter((m) => esNuestro(m) || !(m.automatico || AUTOMATICO.test(m.asunto || "")));
  const ultimo = reales[reales.length - 1];
  const rebote = msgs.filter((m) => !esNuestro(m) && m.fecha > ultimoNuestro.fecha).find((m) => REBOTE.test(`${m.de} ${m.asunto}`));
  if (rebote) return { ...base, estado: "REBOTE", ultimo_de: "CLIENTE", ultimo_msg_id: rebote.id, motivo: "El mail no llegó a destino" };
  if (!esNuestro(ultimo)) return { ...base, estado: "RESPONDIDO", ultimo_de: "CLIENTE", ultimo_msg_id: ultimo.id, respondido_ms: ultimo.fecha };

  // Cuántos mails nuestros seguidos quedaron sin respuesta (si ya insistimos, no es lo mismo que el primer envío).
  let seguidos = 0;
  for (let i = reales.length - 1; i >= 0 && esNuestro(reales[i]); i--) seguidos++;
  return { ...base, estado: "ESPERANDO", ultimo_de: "NOSOTROS", ultimo_msg_id: ultimoNuestro.id, envios_sin_respuesta: seguidos };
}

// ---------- qué mandamos (heurística; la IA solo afina) ----------
const CLASES = ["PRESUPUESTO", "CONSULTA", "CORTESIA", "OTRO"];
function clasificarHeuristico(texto, asunto = "") {
  const t = sinAcentos(`${asunto}\n${texto}`);
  const cuerpo = sinAcentos(texto);
  const cuerpoCorto = cuerpo.replace(/\s+/g, " ").trim();
  if (/presupuesto|cotizaci|lista de precios|precio|\$\s?\d|valores|propuesta comercial|\biva\b|adjunt[oa]s? (la )?(lista|cotiz|presup)/.test(t)) return "PRESUPUESTO";
  if (cuerpoCorto.length > 0 && cuerpoCorto.length < 220 && /gracias|quedamos|saludos|cualquier cosa|buen dia|feliz|que (tenga|tengas)|hasta (luego|pronto)|un abrazo/.test(cuerpoCorto) && !/\?/.test(cuerpoCorto)) return "CORTESIA";
  if (/\?|podrias|podria|me (confirm|pas|envi|indic)|necesito|quedo a la espera|aguardo|aguardamos|favor de|le agradecer/.test(cuerpo)) return "CONSULTA";
  return "OTRO";
}

const dias = (desdeMs, ahoraMs) => Math.max(0, Math.floor((ahoraMs - desdeMs) / DIA));

/** Con qué urgencia hay que reclamar según lo que mandamos y cuánto lleva sin respuesta. null = todavía no corresponde avisar. */
function severidadDe({ clase, dias: d, estado }) {
  if (estado === "REBOTE") return "ALTA";
  const c = clase || "OTRO";
  if (c === "CORTESIA") return null;
  if (d < CONFIG.diasAviso) return null;
  if (d >= CONFIG.diasFrio) return "BAJA"; // ya se enfrió: más que reclamar conviene decidir si se da por perdido
  if (c === "PRESUPUESTO") return d >= CONFIG.diasUrgente ? "ALTA" : "MEDIA";
  if (c === "CONSULTA") return d >= CONFIG.diasUrgente ? "MEDIA" : "BAJA";
  return d >= CONFIG.diasUrgente ? "BAJA" : null;
}

const etiquetaClase = { PRESUPUESTO: "el presupuesto", CONSULTA: "la consulta", OTRO: "el mail", CORTESIA: "el mail" };
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

/** Un hallazgo por hilo que espera respuesta (la clave incluye el último mail nuestro: si insistimos y vuelve a quedar sin respuesta, es un aviso nuevo). */
function armarHallazgos(filas, { ahoraMs = Date.now() } = {}) {
  const out = [];
  for (const f of filas) {
    if (f.estado === "DESCARTADO" || f.estado === "RESPONDIDO" || f.estado === "VENCIDO" || f.estado === "IGNORADO") continue;
    if (f.estado === "POSPUESTO" && f.pospuesto_hasta && aMs(f.pospuesto_hasta) > ahoraMs) continue;
    const enMs = aMs(f.ultimo_nuestro_en);
    const d = enMs ? dias(enMs, ahoraMs) : 0;
    const sev = severidadDe({ clase: f.clase, dias: d, estado: f.estado === "REBOTE" ? "REBOTE" : "ESPERANDO" });
    if (!sev) continue;
    const quien = f.contacto_nombre || f.contacto_email || "un contacto";
    const clave = `seg:${f.thread_id}:${f.ultimo_nuestro_msg || f.ultimo_msg_id}`;
    if (f.estado === "REBOTE") {
      out.push({ clave, tipo: "REBOTE", severidad: "ALTA", titulo: `Rebotó el mail a ${quien}`, texto: `${f.asunto || "Mail"}. Gmail no pudo entregarlo a ${f.contacto_email}: conviene confirmar la dirección y reenviarlo.`, operario: quien, fecha: null });
      continue;
    }
    const frio = d >= CONFIG.diasFrio;
    const que = f.que_enviamos ? `Mandamos: ${f.que_enviamos}. ` : "";
    const insistio = f.envios_sin_respuesta > 1 ? ` Ya le escribimos ${f.envios_sin_respuesta} veces sin respuesta.` : "";
    out.push({
      clave,
      tipo: frio ? "FRIO" : f.clase === "PRESUPUESTO" ? "PRESUPUESTO_SIN_RESPUESTA" : "SIN_RESPUESTA",
      severidad: sev,
      titulo: frio ? `Hace ${plural(d, "día", "días")} que ${quien} no responde ${etiquetaClase[f.clase || "OTRO"]}` : `${quien} no respondió ${etiquetaClase[f.clase || "OTRO"]} (${plural(d, "día", "días")})`,
      texto: `${f.asunto || "Mail"}. ${que}${frio ? "Ya se enfrió: ¿lo damos por perdido o hacemos un último intento?" : "Conviene un seguimiento."}${insistio}${f.borrador_id ? " Ya hay un borrador de seguimiento armado en Gmail." : ""}`,
      operario: quien,
      fecha: null,
    });
  }
  return out;
}

// ---------- base de datos ----------
const fila = (r, ahoraMs = Date.now()) => ({ ...r, dias: aMs(r.ultimo_nuestro_en) ? dias(aMs(r.ultimo_nuestro_en), ahoraMs) : null });

async function guardarAnalisis(db, a, previo) {
  const nuevoCiclo = !previo || previo.ultimo_msg_id !== a.ultimo_msg_id;
  let estado = a.estado;
  // Lo que la persona decidió se respeta mientras no haya novedades en el hilo.
  if (previo && !nuevoCiclo && (previo.estado === "DESCARTADO" || previo.estado === "POSPUESTO") && a.estado === "ESPERANDO") estado = previo.estado;
  if (previo && nuevoCiclo && previo.estado === "DESCARTADO" && a.estado === "ESPERANDO" && previo.descartado_msg_id === a.ultimo_msg_id) estado = "DESCARTADO";
  const valores = [
    a.historyId, a.asunto, a.contacto_email, a.contacto_nombre, a.ultimo_msg_id, a.ultimo_de, cuando(a.ultimo_nuestro_ms), a.envios_sin_respuesta || 0, a.mensajes, a.snippet, estado, a.motivo || null,
    a.respondido_ms ? cuando(a.respondido_ms) : null,
  ];
  if (!previo) {
    await db.query(
      "INSERT INTO seguimiento_hilos (thread_id, history_id, asunto, contacto_email, contacto_nombre, ultimo_msg_id, ultimo_de, ultimo_nuestro_en, envios_sin_respuesta, mensajes, snippet, estado, motivo, respondido_en) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [a.threadId, ...valores],
    );
  } else {
    // Si hay novedades en el hilo, lo clasificado antes ya no vale (se vuelve a mirar qué mandamos).
    await db.query(
      `UPDATE seguimiento_hilos SET history_id = ?, asunto = ?, contacto_email = ?, contacto_nombre = ?, ultimo_msg_id = ?, ultimo_de = ?, ultimo_nuestro_en = ?, envios_sin_respuesta = ?, mensajes = ?, snippet = ?, estado = ?, motivo = ?, respondido_en = ?${nuevoCiclo ? ", pospuesto_hasta = IF(? = 'POSPUESTO', pospuesto_hasta, NULL), borrador_id = NULL, borrador_en = NULL" : ""} WHERE thread_id = ?`,
      [...valores, ...(nuevoCiclo ? [estado] : []), a.threadId],
    );
  }
  return { nuevoCiclo, estado };
}

/**
 * Sincroniza con Gmail de forma incremental.
 * deps: { miEmail(), listarEnviados({ dias, max }) → [{ threadId, historyId }], leerHilo(threadId) → hilo (solo encabezados) }
 */
async function sincronizar({ db, deps, ahoraMs = Date.now(), ventanaDias = CONFIG.ventanaDias }) {
  const miEmail = await deps.miEmail();
  const internos = dominiosInternos(miEmail);
  const lista = await deps.listarEnviados({ dias: ventanaDias, max: CONFIG.maxHilos });
  const [conocidos] = await db.query("SELECT thread_id, history_id, ultimo_msg_id, estado, descartado_msg_id FROM seguimiento_hilos");
  const porId = new Map(conocidos.map((r) => [r.thread_id, r]));
  const vistos = new Set(lista.map((l) => l.threadId));
  const aLeer = lista.filter((l) => {
    const p = porId.get(l.threadId);
    return !p || String(p.history_id) !== String(l.historyId);
  });
  const r = { en_ventana: lista.length, sin_cambios: lista.length - aLeer.length, leidos: 0, pendientes_de_leer: 0, nuevos: 0, respondidos: 0, ignorados: 0 };
  const lote = aLeer.slice(0, CONFIG.maxLecturasPorRevision);
  r.pendientes_de_leer = aLeer.length - lote.length;
  const POR_VEZ = 5;
  for (let i = 0; i < lote.length; i += POR_VEZ) {
    const grupo = await Promise.all(lote.slice(i, i + POR_VEZ).map((l) => deps.leerHilo(l.threadId).then((h) => ({ l, h })).catch((e) => ({ l, error: e }))));
    for (const { l, h, error } of grupo) {
      if (error) {
        if (error.status === 401) throw error;
        continue; // un hilo que falló se reintenta en la próxima revisión (su historyId sigue sin guardarse)
      }
      r.leidos++;
      const a = analizarHilo({ ...h, historyId: l.historyId || h.historyId }, { miEmail, internos });
      const previo = porId.get(l.threadId);
      if (!a) {
        r.ignorados++;
        if (previo) await db.query("UPDATE seguimiento_hilos SET history_id = ?, estado = 'IGNORADO' WHERE thread_id = ?", [l.historyId || h.historyId || null, l.threadId]);
        else await db.query("INSERT INTO seguimiento_hilos (thread_id, history_id, estado, motivo, ultimo_nuestro_en) VALUES (?,?,'IGNORADO','Interno o automático', NOW())", [l.threadId, l.historyId || h.historyId || null]);
        continue;
      }
      const g = await guardarAnalisis(db, a, previo);
      if (!previo && a.estado === "ESPERANDO") r.nuevos++;
      if (a.estado === "RESPONDIDO" && (!previo || previo.estado === "ESPERANDO" || previo.estado === "POSPUESTO")) r.respondidos++;
      void g;
    }
  }
  // Salieron de la ventana sin respuesta: dejan de reclamarse.
  const [vencidos] = await db.query("SELECT thread_id FROM seguimiento_hilos WHERE estado IN ('ESPERANDO','POSPUESTO','REBOTE') AND ultimo_nuestro_en < ?", [cuando(ahoraMs - ventanaDias * DIA)]);
  for (const v of vencidos) if (!vistos.has(v.thread_id)) await db.query("UPDATE seguimiento_hilos SET estado = 'VENCIDO' WHERE thread_id = ?", [v.thread_id]);
  r.vencidos = vencidos.filter((v) => !vistos.has(v.thread_id)).length;
  return r;
}

async function listar(db, { estados = ["ESPERANDO", "POSPUESTO", "REBOTE"], limite = 60, ahoraMs = Date.now() } = {}) {
  const [rows] = await db.query(`SELECT * FROM seguimiento_hilos WHERE estado IN (${estados.map(() => "?").join(",")}) ORDER BY ultimo_nuestro_en ASC LIMIT ?`, [...estados, Math.max(limite, 1)]);
  return rows.map((r) => {
    const f = fila(r, ahoraMs);
    f.ultimo_nuestro_msg = r.ultimo_msg_id;
    f.severidad = severidadDe({ clase: r.clase, dias: f.dias ?? 0, estado: r.estado === "REBOTE" ? "REBOTE" : "ESPERANDO" });
    f.pospuesto = r.estado === "POSPUESTO" && !!r.pospuesto_hasta && aMs(r.pospuesto_hasta) > ahoraMs;
    return f;
  });
}
async function obtener(db, buscar) {
  const q = String(buscar || "").trim();
  if (!q) return null;
  const [[porId]] = await db.query("SELECT * FROM seguimiento_hilos WHERE thread_id = ?", [q]);
  if (porId) return fila(porId);
  const t = sinAcentos(q);
  const [rows] = await db.query("SELECT * FROM seguimiento_hilos WHERE estado IN ('ESPERANDO','POSPUESTO','REBOTE','DESCARTADO') ORDER BY ultimo_nuestro_en DESC LIMIT 200");
  const hit = rows.find((r) => sinAcentos(`${r.contacto_nombre} ${r.contacto_email} ${r.asunto}`).includes(t));
  return hit ? fila(hit) : null;
}
async function conteos(db, { ahoraMs = Date.now() } = {}) {
  const filas = await listar(db, { estados: ["ESPERANDO", "POSPUESTO", "REBOTE"], limite: 1000, ahoraMs });
  const c = { total_esperando: 0, presupuestos: 0, urgentes: 0, rebotes: 0, frios: 0, pospuestos: 0, para_avisar: 0 };
  for (const f of filas) {
    if (f.estado === "REBOTE") { c.rebotes++; continue; }
    if (f.pospuesto) { c.pospuestos++; continue; }
    c.total_esperando++;
    if (f.severidad) c.para_avisar++;
    if (f.severidad === "ALTA") c.urgentes++;
    if (f.clase === "PRESUPUESTO" && f.severidad) c.presupuestos++;
    if ((f.dias ?? 0) >= CONFIG.diasFrio) c.frios++;
  }
  const [[r]] = await db.query("SELECT COUNT(*) AS n FROM seguimiento_hilos WHERE estado = 'RESPONDIDO' AND respondido_en >= ?", [cuando(ahoraMs - 30 * DIA)]);
  c.respondidos_30d = Number(r.n);
  return c;
}

async function descartar(db, { threadId, usuario, nota = "" }) {
  const h = await obtener(db, threadId);
  if (!h) return { error: "No encontré ese hilo.", status: 404 };
  await db.query("UPDATE seguimiento_hilos SET estado = 'DESCARTADO', descartado_msg_id = ultimo_msg_id, nota = ?, decidido_por = ?, decidido_en = NOW() WHERE thread_id = ?", [recorte(nota, 300) || null, usuario ? recorte(usuario, 120) : null, h.thread_id]);
  return { ok: true, hilo: h };
}
async function posponer(db, { threadId, dias: n = 3, usuario, nota = "" }) {
  const h = await obtener(db, threadId);
  if (!h) return { error: "No encontré ese hilo.", status: 404 };
  const d = Math.min(60, Math.max(1, Math.round(Number(n) || 3)));
  await db.query("UPDATE seguimiento_hilos SET estado = 'POSPUESTO', pospuesto_hasta = ?, nota = ?, decidido_por = ?, decidido_en = NOW() WHERE thread_id = ?", [cuando(Date.now() + d * DIA), recorte(nota, 300) || null, usuario ? recorte(usuario, 120) : null, h.thread_id]);
  return { ok: true, hilo: h, dias: d };
}
async function reabrir(db, { threadId, usuario }) {
  const h = await obtener(db, threadId);
  if (!h) return { error: "No encontré ese hilo.", status: 404 };
  await db.query("UPDATE seguimiento_hilos SET estado = 'ESPERANDO', pospuesto_hasta = NULL, descartado_msg_id = NULL, decidido_por = ?, decidido_en = NOW() WHERE thread_id = ?", [usuario ? recorte(usuario, 120) : null, h.thread_id]);
  return { ok: true, hilo: h };
}

// ---------- qué mandamos: clasificación (IA opcional) ----------
function leerClasificaciones(texto, cantidad) {
  const limpio = String(texto || "").replace(/```json|```/g, "").trim();
  const ini = limpio.indexOf("[");
  const fin = limpio.lastIndexOf("]");
  if (ini < 0 || fin <= ini) return null;
  const arr = json(limpio.slice(ini, fin + 1));
  if (!Array.isArray(arr)) return null;
  const out = new Map();
  for (const x of arr) {
    const n = Number(x?.n);
    const clase = String(x?.clase || "").toUpperCase();
    if (!Number.isInteger(n) || n < 0 || n >= cantidad || !CLASES.includes(clase)) continue;
    out.set(n, { clase, resumen: recorte(x?.resumen, 200) });
  }
  return out;
}

/**
 * Para los hilos que ya llevan días esperando, mira QUÉ mandamos. Primero por reglas; si hay IA, ella afina (una sola llamada para el lote).
 * deps: { textoMensaje(threadId, msgId) → string }
 */
async function clasificarPendientes({ db, deps, ai = null, modelo = "gemini-2.5-flash", ahoraMs = Date.now(), maximo = 20 }) {
  const [rows] = await db.query(
    "SELECT thread_id, asunto, ultimo_msg_id, snippet, ultimo_nuestro_en FROM seguimiento_hilos WHERE estado IN ('ESPERANDO','POSPUESTO') AND (clase_msg_id IS NULL OR clase_msg_id <> ultimo_msg_id) AND ultimo_nuestro_en < ? ORDER BY ultimo_nuestro_en DESC LIMIT ?",
    [cuando(ahoraMs - Math.max(0, CONFIG.diasAviso - 1) * DIA), maximo],
  );
  if (!rows.length) return { clasificados: 0 };
  const items = [];
  for (const r of rows) {
    let texto = "";
    try {
      texto = await deps.textoMensaje(r.thread_id, r.ultimo_msg_id);
    } catch (e) {
      if (e.status === 401) throw e;
    }
    items.push({ r, texto: recorte(texto || r.snippet, 900) });
  }
  let ia = null;
  if (ai?.models) {
    try {
      const prompt = `Sos el equipo comercial de Conoflex Argentina (fábrica de productos plásticos de seguridad vial). Para cada mail que NOSOTROS enviamos y que el cliente todavía no respondió, decidí qué le mandamos:
- PRESUPUESTO: presupuesto, cotización, lista de precios o propuesta con importes.
- CONSULTA: le preguntamos o le pedimos algo (datos, confirmación, aprobación).
- CORTESIA: agradecimiento, saludo o cierre que no necesita respuesta.
- OTRO: informativo (envío de documentación, aviso, seguimiento) que podría merecer respuesta.
Además escribí "resumen": en una frase corta qué le mandamos (ej: "Presupuesto de 200 conos y 50 postes con 10% de descuento"). No inventes datos que no estén en el texto.

${items.map((it, n) => `#${n} Asunto: ${recorte(it.r.asunto, 120)}\nTexto: ${it.texto}`).join("\n\n")}

Devolvé SOLO un JSON: [{"n":0,"clase":"PRESUPUESTO","resumen":"..."}]`;
      const resp = await ai.models.generateContent({ model: modelo, contents: [{ role: "user", parts: [{ text: prompt }] }], config: { temperature: 0.1, responseMimeType: "application/json" } });
      ia = leerClasificaciones(resp.text, items.length);
    } catch (e) {
      console.error("[seguimiento] clasificación con IA:", e.message);
    }
  }
  let n = 0;
  for (let i = 0; i < items.length; i++) {
    const { r, texto } = items[i];
    const dato = ia?.get(i);
    const clase = dato?.clase || clasificarHeuristico(texto, r.asunto);
    await db.query("UPDATE seguimiento_hilos SET clase = ?, clase_msg_id = ?, que_enviamos = ? WHERE thread_id = ?", [clase, r.ultimo_msg_id, dato?.resumen || null, r.thread_id]);
    n++;
  }
  return { clasificados: n, con_ia: !!ia };
}

// ---------- borrador de seguimiento ----------
const TONO = {
  PRESUPUESTO: "Es un seguimiento de un PRESUPUESTO: preguntá con amabilidad si pudieron revisarlo, ofrecé resolver dudas o ajustar cantidades/condiciones, y dejá claro que seguimos a disposición. NO ofrezcas descuentos ni cambies precios, plazos ni condiciones: eso lo define la persona.",
  CONSULTA: "Es un seguimiento de una CONSULTA que les hicimos: recordá con amabilidad qué necesitamos de ellos para avanzar.",
  OTRO: "Es un seguimiento general: retomá el tema con amabilidad y preguntá si necesitan algo más de nuestra parte.",
};

/** Pide a la IA un mensaje corto de seguimiento. Devuelve texto plano (sin firma con corchetes). */
async function redactarSeguimiento({ ai, modelo = "gemini-2.5-flash", hilo, historial = [], reglas = "", ejemplos = "", insistencia = 1 }) {
  const clase = TONO[hilo.clase] ? hilo.clase : "OTRO";
  const conversacion = historial.map((m) => `${m.enviado ? "NOSOTROS" : "CLIENTE"} (${m.fecha}): ${recorte(m.texto, 1100)}`).join("\n---\n");
  const prompt = `Sos del equipo de ventas de Conoflex Argentina. Escribí un mail breve de SEGUIMIENTO para ${hilo.contacto_nombre || "el cliente"}, que no respondió nuestro último mail hace ${hilo.dias ?? "varios"} días.
${TONO[clase]}
${insistencia > 1 ? `Ya le escribimos ${insistencia} veces sin respuesta: sé un poco más directo y proponé una forma simple de avanzar (por ejemplo, avisar si ya no les interesa para cerrar el tema), sin presionar.` : "Es el primer seguimiento: tono cordial, sin presión."}
${reglas ? `\nREGLAS DEL EQUIPO:\n${reglas}\n` : ""}${ejemplos ? `\n${ejemplos}\n` : ""}
HILO (del más viejo al más nuevo):
${conversacion}

Reglas de redacción:
- Español rioplatense profesional, cálido y directo. Máximo 90 palabras. Sin asunto, solo el cuerpo.
- Arrancá con un saludo natural y terminá con una frase de cierre. NO uses corchetes, "[Tu Nombre]" ni firmas inventadas: cerrá en nombre del equipo de ventas de Conoflex.
- Mencioná solo lo que figura en el hilo. No inventes precios, productos, fechas, plazos ni descuentos.
- Devolvé SOLO el texto del mail.`;
  const resp = await ai.models.generateContent({ model: modelo, contents: [{ role: "user", parts: [{ text: prompt }] }], config: { temperature: 0.4 } });
  const texto = String(resp.text || "").replace(/```[a-z]*/gi, "").replace(/\[[^\]]{2,40}\]/g, "").trim();
  return texto.length >= 20 ? texto : null;
}

/** Pasa el texto plano a HTML sencillo para el borrador de Gmail. */
const aHtml = (t) => `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${String(t).split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`).join("")}</div>`;

/**
 * Deja un BORRADOR de seguimiento en el hilo (nunca envía).
 * deps: { historialHilo(threadId) → [{ enviado, fecha, texto }], crearBorradorEnHilo({ threadId, para, asunto, html }) → { draftId } }
 */
async function prepararSeguimiento({ db, deps, ai, threadId, reglas = "", ejemplos = "", textoPropio = null }) {
  const h = await obtener(db, threadId);
  if (!h) return { ok: false, error: "No encontré ese hilo.", status: 404 };
  if (h.estado === "RESPONDIDO") return { ok: false, error: "Ese hilo ya tiene respuesta del cliente: no hace falta seguimiento." };
  if (h.estado === "REBOTE") return { ok: false, error: "Ese mail rebotó: primero hay que confirmar la dirección del cliente." };
  if (h.borrador_id) return { ok: true, yaEstaba: true, hilo: h };
  const historial = await deps.historialHilo(h.thread_id);
  let texto = textoPropio ? String(textoPropio).trim().slice(0, 3000) : null;
  if (!texto) {
    if (!ai?.models) return { ok: false, error: "La IA no está disponible para redactar el seguimiento." };
    texto = await redactarSeguimiento({ ai, hilo: h, historial: historial.slice(-4), reglas, ejemplos, insistencia: (h.envios_sin_respuesta || 0) + 1 });
  }
  if (!texto) return { ok: false, error: "No pude redactar el seguimiento. Probá de nuevo en unos minutos." };
  const { draftId } = await deps.crearBorradorEnHilo({ threadId: h.thread_id, para: h.contacto_email, asunto: h.asunto, html: aHtml(texto) });
  await db.query("UPDATE seguimiento_hilos SET borrador_id = ?, borrador_en = NOW() WHERE thread_id = ?", [draftId, h.thread_id]);
  return { ok: true, borradorEnGmail: true, texto, hilo: h };
}

module.exports = {
  CONFIG, CLASES, asegurarTablasSeguimiento, dominiosInternos, analizarHilo, clasificarHeuristico, severidadDe, armarHallazgos, sincronizar, clasificarPendientes,
  aMs, listar, obtener, conteos, descartar, posponer, reabrir, leerClasificaciones, redactarSeguimiento, prepararSeguimiento, aHtml, dias,
};
