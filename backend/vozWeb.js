"use strict";
// Llamada de voz con Aldana desde el navegador (app y link para compartir), por turnos.
//
// El navegador transcribe lo que decís y manda el texto; acá se genera la respuesta con Gemini en
// streaming y cada oración completa se convierte en voz con ElevenLabs (ver vozLlamada.js). No usa
// WebRTC, ni el servicio voz/, ni Meta.
//
//   POST /api/voz/llamar/inicio                      saludo + muletillas (permiso "whatsapp")
//   POST /api/voz/llamar/turno    {llamada_id,texto} respuesta en streaming (NDJSON)
//   POST /api/voz/llamar/fin      {llamada_id}       guarda la transcripción
//   GET/POST/DELETE /api/voz/links                   links para compartir
//   GET  /api/voz/llamadas                           últimas llamadas con transcripción
//   GET  /api/public/voz-web/:token                  ¿el link sirve?
//   POST /api/public/voz-web/:token/(inicio|turno|fin)  lo mismo desde el link, sin cuenta
const crypto = require("crypto");
const { crearMotorLlamada, vozConfigurada, NOMBRE_VOZ } = require("./vozLlamada");
const { corto } = require("./whatsapp");

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

function registrarRutasVozWeb(app, { db, bot, ai, requirePermiso, crearNotificacion }) {
  const motor = crearMotorLlamada({ ai, contexto: () => bot.contexto() });
  const err = (res, e) => {
    if (!e.status) console.error("[voz-web]", e);
    res.status(e.status || 500).json({ error: e.status ? e.message : "No se pudo completar la acción." });
  };
  const falla = (status, message) => Object.assign(new Error(message), { status });

  async function disponible() {
    if (!vozConfigurada()) throw falla(503, "La voz todavía no está configurada (falta la clave de ElevenLabs).");
    if (!(await bot.botGlobal()) || process.env.VOZ_ACTIVA === "0") throw falla(503, `${NOMBRE_VOZ} no está atendiendo en este momento.`);
  }

  async function iniciar({ origen, usuarioId = null, linkId = null, quien = null }) {
    await disponible();
    const [r] = await db.query("INSERT INTO voz_llamadas (origen, usuario_id, link_id, quien) VALUES (?, ?, ?, ?)", [origen, usuarioId, linkId, quien]);
    const llamadaId = r.insertId;
    try {
      const saludo = await motor.iniciar(llamadaId, { quien });
      return { llamada_id: llamadaId, nombre: NOMBRE_VOZ, ...saludo };
    } catch (e) {
      await db.query("DELETE FROM voz_llamadas WHERE id = ?", [llamadaId]).catch(() => {});
      throw e;
    }
  }

  async function guardarContacto(llamadaId, contacto) {
    const c = limpiarContacto(contacto);
    if (!c) return;
    await db.query("UPDATE voz_llamadas SET contacto = ? WHERE id = ?", [JSON.stringify(c), llamadaId]);
    crearNotificacion?.(db, { tipo: "WHATSAPP", titulo: `📞 ${c.nombre || "Un cliente"} pidió que lo contacten`, texto: contactoTexto(c), ruta: "whatsapp", roles: ROLES_CONTACTO, push: true });
  }

  // Un turno: va escribiendo NDJSON (una línea por oración con su audio, y una final).
  function streamTurno(res, llamadaId, texto) {
    res.set({ "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
    (async () => {
      try {
        for await (const ev of motor.turno(llamadaId, texto)) {
          if (ev.tipo === "fin" && ev.contacto) await guardarContacto(llamadaId, ev.contacto).catch((e) => console.error("[voz-web] contacto:", e.message));
          res.write(JSON.stringify(ev) + "\n");
        }
      } catch (e) {
        res.write(JSON.stringify({ tipo: "error", error: e.status ? e.message : "Se cortó la respuesta." }) + "\n");
      } finally {
        res.end();
      }
    })();
  }

  async function finalizar(llamadaId) {
    const r = motor.terminar(llamadaId);
    if (!r) return { ok: true };
    await db.query("UPDATE voz_llamadas SET duracion = ?, transcripcion = ?, terminada_at = NOW() WHERE id = ?", [r.duracion, JSON.stringify(limpiarTranscripcion(r.transcripcion)), llamadaId]);
    if (r.contacto) await guardarContacto(llamadaId, r.contacto).catch(() => {});
    return { ok: true };
  }

  const textoTurno = (body) => {
    const t = String(body?.texto || "").trim().slice(0, 1000);
    if (!t) throw falla(400, "No se entendió lo que dijiste.");
    return t;
  };

  // ---- desde la app (permiso whatsapp)
  const permiso = requirePermiso("whatsapp");

  app.post("/api/voz/llamar/inicio", permiso, async (req, res) => {
    try {
      const [[u]] = await db.query("SELECT nombre FROM usuarios WHERE id = ?", [req.user.id]);
      res.json(await iniciar({ origen: "APP", usuarioId: req.user.id, quien: u?.nombre ? String(u.nombre).split(" ")[0] : null }));
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/voz/llamar/turno", permiso, async (req, res) => {
    try {
      const id = Number(req.body?.llamada_id) || 0;
      if (!motor.existe(id)) throw falla(404, "La llamada ya no está activa.");
      streamTurno(res, id, textoTurno(req.body));
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/voz/llamar/fin", permiso, async (req, res) => {
    try {
      res.json(await finalizar(Number(req.body?.llamada_id) || 0));
    } catch (e) {
      err(res, e);
    }
  });

  app.get("/api/voz/links", permiso, async (req, res) => {
    try {
      const [rows] = await db.query("SELECT l.id, l.token, l.nombre, l.activo, l.vence_at, l.usos, l.ultimo_uso_at, l.created_at, u.nombre AS creado_por FROM voz_links l LEFT JOIN usuarios u ON u.id = l.creado_por_id ORDER BY l.activo DESC, l.id DESC LIMIT 100");
      res.json(rows.map((l) => ({ ...l, activo: !!l.activo, usable: linkUsable(l) })));
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/voz/links", permiso, async (req, res) => {
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

  app.delete("/api/voz/links/:id", permiso, async (req, res) => {
    try {
      await db.query("UPDATE voz_links SET activo = 0 WHERE id = ?", [Number(req.params.id) || 0]);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  app.get("/api/voz/llamadas", permiso, async (req, res) => {
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

  app.post("/api/public/voz-web/:token/inicio", async (req, res) => {
    try {
      const l = await linkDe(req.params.token);
      if (!l) throw falla(404, "Este link ya no está disponible.");
      const r = await iniciar({ origen: "LINK", linkId: l.id });
      await db.query("UPDATE voz_links SET usos = usos + 1, ultimo_uso_at = NOW() WHERE id = ?", [l.id]);
      res.json(r);
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/public/voz-web/:token/turno", async (req, res) => {
    try {
      const l = await linkDe(req.params.token);
      if (!l) throw falla(404, "Este link ya no está disponible.");
      const id = Number(req.body?.llamada_id) || 0;
      if (!motor.existe(id)) throw falla(404, "La llamada ya no está activa.");
      streamTurno(res, id, textoTurno(req.body));
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/public/voz-web/:token/fin", async (req, res) => {
    try {
      const l = await linkDe(req.params.token);
      if (!l) throw falla(404, "Este link ya no está disponible.");
      res.json(await finalizar(Number(req.body?.llamada_id) || 0));
    } catch (e) {
      err(res, e);
    }
  });

  return { motor };
}

module.exports = { asegurarTablasVozWeb, registrarRutasVozWeb, linkUsable, limpiarTranscripcion, limpiarContacto, contactoTexto, tokenValido, ORIGENES };
