"use strict";
// Llamadas de voz con la asistente desde el navegador (app y link público), sin pasar por WhatsApp.
//
// El navegador manda su "oferta" WebRTC; este backend arma lo que sabe la asistente (catálogo,
// precios, reglas) y se la pasa al servicio de voz (voz/, 127.0.0.1), que devuelve la respuesta.
// El audio después va directo navegador ⇄ servicio de voz por UDP (puertos 40000-40100).
//
//   POST /api/voz/llamar                    desde la app (permiso "whatsapp")
//   GET  /api/voz/links | POST | DELETE     links para compartir (permiso "whatsapp")
//   GET  /api/voz/llamadas                  últimas llamadas con transcripción
//   GET  /api/public/voz-web/:token         ¿el link sirve?
//   POST /api/public/voz-web/:token/llamar  llamar desde el link, sin cuenta
//   POST /api/public/voz/web-fin            (solo el servicio de voz) transcripción al cortar
//   POST /api/public/voz/web-contacto       (solo el servicio de voz) datos que dejó el cliente
const crypto = require("crypto");
const { instruccionesVoz, preciosVoz, esLocalConSecreto, NOMBRE_VOZ } = require("./whatsappVoz");
const { catalogoTexto, corto } = require("./whatsapp");

const ROLES_CONTACTO = ["ADMIN", "COMERCIAL"];
const ORIGENES = ["APP", "LINK"];

async function asegurarTablasVozWeb(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS voz_links (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token CHAR(32) NOT NULL UNIQUE,
    nombre VARCHAR(120) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    vence_at DATETIME NULL,
    usos INT NOT NULL DEFAULT 0,
    ultimo_uso_at DATETIME NULL,
    creado_por_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS voz_llamadas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    origen VARCHAR(10) NOT NULL,
    usuario_id INT NULL,
    link_id INT NULL,
    quien VARCHAR(120) NULL,
    duracion INT NULL,
    transcripcion MEDIUMTEXT NULL,
    contacto TEXT NULL,
    terminada_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (created_at)
  )`);
}

const nuevoToken = () => crypto.randomBytes(16).toString("hex");
const tokenValido = (t) => /^[a-f0-9]{32}$/.test(String(t || ""));

/** El link sirve si existe, está activo y no venció. */
function linkUsable(link, ahora = new Date()) {
  if (!link || !link.activo) return false;
  if (link.vence_at && new Date(link.vence_at) <= ahora) return false;
  return true;
}

/** Oferta WebRTC razonable (solo audio, tamaño acotado). */
function ofertaValida(body) {
  const sdp = body?.sdp;
  return body?.type === "offer" && typeof sdp === "string" && sdp.startsWith("v=0") && sdp.length < 20000 && /m=audio /.test(sdp);
}

/** Lo que guarda la llamada al cortar, limpio. */
function limpiarTranscripcion(t) {
  return (Array.isArray(t) ? t : [])
    .map((x) => ({ rol: x?.rol === "bot" ? "bot" : "cliente", texto: corto(String(x?.texto || "").trim(), 2000) }))
    .filter((x) => x.texto)
    .slice(0, 400);
}

function limpiarContacto(c) {
  const campo = (v, n) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);
  const r = { nombre: campo(c?.nombre, 120), empresa: campo(c?.empresa, 120), telefono: campo(c?.telefono, 40), mail: campo(c?.mail, 120), motivo: campo(c?.motivo, 500) };
  return r.telefono || r.mail ? r : null;
}

function contactoTexto(c) {
  return [c.nombre && `Nombre: ${c.nombre}`, c.empresa && `Empresa: ${c.empresa}`, c.telefono && `Tel: ${c.telefono}`, c.mail && `Mail: ${c.mail}`, c.motivo && `Necesita: ${c.motivo}`].filter(Boolean).join(" · ");
}

function registrarRutasVozWeb(app, { db, bot, requirePermiso, crearNotificacion, puertoVoz = process.env.VOZ_PUERTO || 3002 }) {
  const soloLocal = (req, res, next) => (esLocalConSecreto(req) ? next() : res.sendStatus(403));
  const err = (res, e) => {
    console.error("[voz-web]", e.message);
    res.status(e.status || 500).json({ error: e.status ? e.message : "No se pudo completar la acción." });
  };
  const falla = (status, message) => Object.assign(new Error(message), { status });

  async function llamar(oferta, { origen, usuarioId = null, linkId = null, quien = null }) {
    if (!ofertaValida(oferta)) throw falla(400, "Pedido de llamada inválido.");
    if (!(await bot.botGlobal()) || process.env.VOZ_ACTIVA === "0") throw falla(503, `${NOMBRE_VOZ} no está atendiendo en este momento.`);
    const ctx = await bot.contexto();
    const [r] = await db.query("INSERT INTO voz_llamadas (origen, usuario_id, link_id, quien) VALUES (?, ?, ?, ?)", [origen, usuarioId, linkId, quien]);
    const llamadaId = r.insertId;
    let res;
    try {
      res = await fetch(`http://127.0.0.1:${puertoVoz}/web/oferta`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-voz-secreto": process.env.VOZ_SECRETO || "" },
        body: JSON.stringify({
          sdp: oferta.sdp,
          type: oferta.type,
          llamada_id: llamadaId,
          ctx: { nombre: NOMBRE_VOZ, quien, instrucciones: instruccionesVoz({ ...ctx, catalogo: catalogoTexto(ctx.productos), nombreCliente: quien, canal: "web" }), precios: preciosVoz(ctx.productos) },
        }),
        signal: AbortSignal.timeout(20000),
      });
    } catch (e) {
      await db.query("DELETE FROM voz_llamadas WHERE id = ?", [llamadaId]);
      throw falla(503, "El servicio de voz no responde. Avisale a sistemas.");
    }
    if (!res.ok) {
      await db.query("DELETE FROM voz_llamadas WHERE id = ?", [llamadaId]);
      if (res.status === 429) throw falla(429, `${NOMBRE_VOZ} está con muchas llamadas a la vez. Probá en un minuto.`);
      throw falla(503, "El servicio de voz no pudo atender. Probá de nuevo.");
    }
    const answer = await res.json();
    return { sdp: answer.sdp, type: answer.type, llamada_id: llamadaId, nombre: NOMBRE_VOZ };
  }

  // ---- desde la app
  app.post("/api/voz/llamar", requirePermiso("whatsapp"), async (req, res) => {
    try {
      const [[u]] = await db.query("SELECT nombre FROM usuarios WHERE id = ?", [req.user.id]);
      res.json(await llamar(req.body, { origen: "APP", usuarioId: req.user.id, quien: u?.nombre ? String(u.nombre).split(" ")[0] : null }));
    } catch (e) {
      err(res, e);
    }
  });

  app.get("/api/voz/links", requirePermiso("whatsapp"), async (req, res) => {
    try {
      const [rows] = await db.query("SELECT l.id, l.token, l.nombre, l.activo, l.vence_at, l.usos, l.ultimo_uso_at, l.created_at, u.nombre AS creado_por FROM voz_links l LEFT JOIN usuarios u ON u.id = l.creado_por_id ORDER BY l.activo DESC, l.id DESC LIMIT 100");
      res.json(rows.map((l) => ({ ...l, activo: !!l.activo, usable: linkUsable(l) })));
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/voz/links", requirePermiso("whatsapp"), async (req, res) => {
    try {
      const nombre = String(req.body?.nombre || "").trim().slice(0, 120);
      if (!nombre) throw falla(400, "Poné un nombre para saber a quién se lo pasaste.");
      const dias = Number(req.body?.dias);
      const vence = Number.isFinite(dias) && dias > 0 ? new Date(Date.now() + Math.min(dias, 365) * 86400000) : null;
      const token = nuevoToken();
      const [r] = await db.query("INSERT INTO voz_links (token, nombre, vence_at, creado_por_id) VALUES (?, ?, ?, ?)", [token, nombre, vence, req.user.id]);
      res.json({ id: r.insertId, token, nombre, vence_at: vence, activo: true, usable: true, usos: 0 });
    } catch (e) {
      err(res, e);
    }
  });

  app.delete("/api/voz/links/:id", requirePermiso("whatsapp"), async (req, res) => {
    try {
      await db.query("UPDATE voz_links SET activo = 0 WHERE id = ?", [Number(req.params.id) || 0]);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  app.get("/api/voz/llamadas", requirePermiso("whatsapp"), async (req, res) => {
    try {
      const [rows] = await db.query(
        `SELECT c.id, c.origen, c.quien, c.duracion, c.transcripcion, c.contacto, c.created_at, l.nombre AS link
         FROM voz_llamadas c LEFT JOIN voz_links l ON l.id = c.link_id ORDER BY c.id DESC LIMIT 50`,
      );
      const json = (v) => {
        try {
          return v ? JSON.parse(v) : null;
        } catch {
          return null;
        }
      };
      res.json(rows.map((c) => ({ ...c, transcripcion: json(c.transcripcion) || [], contacto: json(c.contacto) })));
    } catch (e) {
      err(res, e);
    }
  });

  // ---- link público (sin cuenta)
  const linkDe = async (token) => {
    if (!tokenValido(token)) return null;
    const [[l]] = await db.query("SELECT * FROM voz_links WHERE token = ?", [token]);
    return linkUsable(l) ? l : null;
  };

  app.get("/api/public/voz-web/:token", async (req, res) => {
    try {
      const l = await linkDe(req.params.token);
      if (!l) return res.status(404).json({ error: "Este link ya no está disponible." });
      res.json({ ok: true, nombre: NOMBRE_VOZ });
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/public/voz-web/:token/llamar", async (req, res) => {
    try {
      const l = await linkDe(req.params.token);
      if (!l) throw falla(404, "Este link ya no está disponible.");
      const r = await llamar(req.body, { origen: "LINK", linkId: l.id });
      await db.query("UPDATE voz_links SET usos = usos + 1, ultimo_uso_at = NOW() WHERE id = ?", [l.id]);
      res.json(r);
    } catch (e) {
      err(res, e);
    }
  });

  // ---- avisos del servicio de voz
  app.post("/api/public/voz/web-fin", soloLocal, async (req, res) => {
    try {
      const id = Number(req.body?.llamada_id) || 0;
      const duracion = Math.max(0, Math.round(Number(req.body?.duracion) || 0));
      await db.query("UPDATE voz_llamadas SET duracion = ?, transcripcion = ?, terminada_at = NOW() WHERE id = ?", [duracion, JSON.stringify(limpiarTranscripcion(req.body?.transcripcion)), id]);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/public/voz/web-contacto", soloLocal, async (req, res) => {
    try {
      const id = Number(req.body?.llamada_id) || 0;
      const c = limpiarContacto(req.body);
      if (!c) throw falla(400, "Falta un teléfono o mail.");
      await db.query("UPDATE voz_llamadas SET contacto = ? WHERE id = ?", [JSON.stringify(c), id]);
      crearNotificacion?.(db, { tipo: "WHATSAPP", titulo: `📞 ${c.nombre || "Un cliente"} pidió que lo contacten`, texto: contactoTexto(c), ruta: "whatsapp", roles: ROLES_CONTACTO, push: true });
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });
}

module.exports = { asegurarTablasVozWeb, registrarRutasVozWeb, linkUsable, ofertaValida, limpiarTranscripcion, limpiarContacto, contactoTexto, tokenValido, ORIGENES };
