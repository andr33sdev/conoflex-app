"use strict";
// Avisos al celular (Web Push). Las claves VAPID se generan solas la primera vez y quedan en la base: no hay nada que configurar.
// Solo se mandan por push los avisos que se piden como urgentes; el resto queda en la campanita.
let webpush = null;
try {
  webpush = require("web-push");
} catch {
  console.warn("[push] falta instalar web-push (npm install en backend): los avisos al celular quedan desactivados.");
}

let configurado = false;
let clavePublica = null;

async function asegurarPush(db) {
  if (!webpush) return;
  await db.query(`CREATE TABLE IF NOT EXISTS push_config (clave VARCHAR(30) PRIMARY KEY, valor VARCHAR(255) NOT NULL)`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS push_suscripciones (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT NOT NULL,
      endpoint VARCHAR(700) NOT NULL,
      p256dh VARCHAR(255) NOT NULL,
      auth VARCHAR(100) NOT NULL,
      agente_usuario VARCHAR(200) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_endpoint (endpoint(255)),
      KEY idx_usuario (usuario_id)
    )`);
  let pub = process.env.VAPID_PUBLIC_KEY;
  let priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    const [rows] = await db.query("SELECT clave, valor FROM push_config WHERE clave IN ('publica','privada')");
    const m = Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
    if (m.publica && m.privada) {
      pub = m.publica;
      priv = m.privada;
    } else {
      const k = webpush.generateVAPIDKeys();
      await db.query("INSERT IGNORE INTO push_config (clave, valor) VALUES ('publica', ?), ('privada', ?)", [k.publicKey, k.privateKey]);
      const [r2] = await db.query("SELECT clave, valor FROM push_config WHERE clave IN ('publica','privada')");
      const m2 = Object.fromEntries(r2.map((r) => [r.clave, r.valor]));
      pub = m2.publica;
      priv = m2.privada;
    }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:sistemas@conoflex.com.ar", pub, priv);
  clavePublica = pub;
  configurado = true;
}

/** Quita lo que no hace falta en el cuerpo de la notificación del teléfono. */
function armarPayload({ titulo, texto, ruta }) {
  return JSON.stringify({ titulo: String(titulo || "Conoflex").slice(0, 100), texto: String(texto || "").slice(0, 180), ruta: ruta || "/agentes" });
}

/** Manda un aviso a todos los dispositivos de las personas con esos roles. `enviar` se puede reemplazar en las pruebas. */
async function enviarPush(db, { roles, titulo, texto, ruta, excluirUsuario = null }, enviar = (s, p) => webpush.sendNotification(s, p, { TTL: 6 * 3600, urgency: "high" })) {
  if (!configurado) return { enviados: 0, fallidos: 0 };
  const lista = [...new Set((roles || []).map((r) => String(r).trim().toUpperCase()).filter(Boolean))];
  if (!lista.length) return { enviados: 0, fallidos: 0 };
  const [subs] = await db.query(
    `SELECT s.id, s.endpoint, s.p256dh, s.auth FROM push_suscripciones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE UPPER(TRIM(u.rol)) IN (?) ${excluirUsuario ? "AND u.id <> ?" : ""}`,
    excluirUsuario ? [lista, excluirUsuario] : [lista],
  );
  const payload = armarPayload({ titulo, texto, ruta });
  let enviados = 0;
  let fallidos = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await enviar({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        enviados++;
      } catch (e) {
        fallidos++;
        // 404/410: el celular ya no existe o se revocó el permiso
        if (e && (e.statusCode === 404 || e.statusCode === 410)) await db.query("DELETE FROM push_suscripciones WHERE id = ?", [s.id]).catch(() => {});
        else console.error("[push]", e && (e.statusCode || e.message));
      }
    }),
  );
  return { enviados, fallidos };
}

function registrarRutasPush(app, db) {
  app.get("/api/push/clave", (req, res) => res.json({ habilitado: configurado, clave: configurado ? clavePublica : null }));

  app.get("/api/push/estado", async (req, res) => {
    try {
      const [[r]] = await db.query("SELECT COUNT(*) AS n FROM push_suscripciones WHERE usuario_id = ?", [req.user?.id]);
      res.json({ dispositivos: Number(r.n) });
    } catch {
      res.status(500).json({ error: "No pude leer el estado." });
    }
  });

  app.post("/api/push/suscribir", async (req, res) => {
    const s = req.body?.suscripcion;
    if (!configurado) return res.status(503).json({ error: "Los avisos al celular no están disponibles en este servidor." });
    if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth || !/^https:\/\//.test(s.endpoint)) return res.status(400).json({ error: "Suscripción inválida." });
    try {
      await db.query(
        "INSERT INTO push_suscripciones (usuario_id, endpoint, p256dh, auth, agente_usuario) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE usuario_id = VALUES(usuario_id), p256dh = VALUES(p256dh), auth = VALUES(auth)",
        [req.user.id, s.endpoint.slice(0, 700), s.keys.p256dh, s.keys.auth, String(req.headers["user-agent"] || "").slice(0, 200)],
      );
      res.json({ ok: true });
    } catch (e) {
      console.error("[push] suscribir:", e.message);
      res.status(500).json({ error: "No pude guardar la suscripción." });
    }
  });

  app.post("/api/push/baja", async (req, res) => {
    try {
      const ep = String(req.body?.endpoint || "");
      if (ep) await db.query("DELETE FROM push_suscripciones WHERE usuario_id = ? AND endpoint = ?", [req.user.id, ep]);
      else await db.query("DELETE FROM push_suscripciones WHERE usuario_id = ?", [req.user.id]);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "No pude quitar la suscripción." });
    }
  });

  // Aviso de prueba solo para quien lo pide, para comprobar que le llega al celular.
  app.post("/api/push/prueba", async (req, res) => {
    if (!configurado) return res.status(503).json({ error: "Los avisos al celular no están disponibles en este servidor." });
    try {
      const [[u]] = await db.query("SELECT rol FROM usuarios WHERE id = ?", [req.user.id]);
      const [subs] = await db.query("SELECT endpoint, p256dh, auth FROM push_suscripciones WHERE usuario_id = ?", [req.user.id]);
      if (!subs.length) return res.status(400).json({ error: "Este dispositivo todavía no tiene los avisos activados." });
      const payload = armarPayload({ titulo: "Conoflex", texto: "Listo: los avisos de los agentes te van a llegar al celular.", ruta: "/agentes" });
      let ok = 0;
      for (const s of subs) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 600 });
          ok++;
        } catch (e) {
          if (e && (e.statusCode === 404 || e.statusCode === 410)) await db.query("DELETE FROM push_suscripciones WHERE endpoint = ?", [s.endpoint]).catch(() => {});
        }
      }
      void u;
      res.json({ ok: ok > 0, enviados: ok });
    } catch {
      res.status(500).json({ error: "No pude mandar la prueba." });
    }
  });
}

module.exports = { asegurarPush, enviarPush, registrarRutasPush, armarPayload };
