"use strict";
// Notificaciones de la campanita. Cada una se dirige a uno o más roles; cada usuario las marca como leídas por su cuenta.

async function asegurarTablasNotificaciones(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS notificaciones (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tipo VARCHAR(40) NOT NULL,
      titulo VARCHAR(255) NOT NULL,
      texto VARCHAR(500) NULL,
      ruta VARCHAR(160) NULL,
      roles VARCHAR(255) NOT NULL,
      creada_por_id INT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_created (created_at)
    )`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS notificaciones_leidas (
      notificacion_id INT NOT NULL,
      usuario_id INT NOT NULL,
      leida_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (notificacion_id, usuario_id)
    )`);
}

// Quien quiera enterarse de cada notificación creada (los avisos al celular) se engancha acá.
let alCrear = null;
const alCrearNotificacion = (fn) => {
  alCrear = fn;
};

const limpiarRoles = (roles) => [...new Set((roles || []).map((r) => String(r).trim().toUpperCase()).filter(Boolean))];

/** Deja una notificación para los roles indicados. Nunca rompe la operación que la origina. */
async function crearNotificacion(db, { tipo, titulo, texto = null, ruta = null, roles, creada_por_id = null, push = false }) {
  try {
    const lista = limpiarRoles(roles);
    if (!lista.length) return null;
    const [r] = await db.query(
      "INSERT INTO notificaciones (tipo, titulo, texto, ruta, roles, creada_por_id) VALUES (?,?,?,?,?,?)",
      [tipo, String(titulo).slice(0, 255), texto ? String(texto).slice(0, 500) : null, ruta, lista.join(","), creada_por_id],
    );
    if (push && alCrear) Promise.resolve(alCrear({ roles: lista, titulo, texto, ruta, excluirUsuario: creada_por_id })).catch((e) => console.error("[notificaciones] push:", e.message));
    return r.insertId;
  } catch (e) {
    console.error("[notificaciones] no se pudo crear:", e.message);
    return null;
  }
}

function registrarRutasNotificaciones(app, db) {
  const quien = async (req) => {
    const [r] = await db.query("SELECT id, rol FROM usuarios WHERE id = ?", [req.user?.id]);
    return r[0] ? { id: r[0].id, rol: String(r[0].rol || "").trim().toUpperCase() } : null;
  };
  // Las del propio usuario no se le avisan a sí mismo; solo se ven las de los últimos 30 días.
  const DONDE = "FIND_IN_SET(?, n.roles) > 0 AND (n.creada_por_id IS NULL OR n.creada_por_id <> ?) AND n.created_at >= (NOW() - INTERVAL 30 DAY)";
  const SIN_LEER = "NOT EXISTS (SELECT 1 FROM notificaciones_leidas l WHERE l.notificacion_id = n.id AND l.usuario_id = ?)";

  app.get("/api/notificaciones/contador", async (req, res) => {
    try {
      const u = await quien(req);
      if (!u) return res.status(401).json({ error: "Sesión inválida." });
      const [[r]] = await db.query(`SELECT COUNT(*) AS n FROM notificaciones n WHERE ${DONDE} AND ${SIN_LEER}`, [u.rol, u.id, u.id]);
      res.json({ sin_leer: Number(r.n) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/notificaciones", async (req, res) => {
    try {
      const u = await quien(req);
      if (!u) return res.status(401).json({ error: "Sesión inválida." });
      const [rows] = await db.query(
        `SELECT n.id, n.tipo, n.titulo, n.texto, n.ruta, n.created_at, ${SIN_LEER} AS sin_leer
           FROM notificaciones n WHERE ${DONDE} ORDER BY n.id DESC LIMIT 30`,
        [u.id, u.rol, u.id],
      );
      res.json(rows.map((r) => ({ ...r, sin_leer: !!r.sin_leer })));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/notificaciones/leer-todas", async (req, res) => {
    try {
      const u = await quien(req);
      if (!u) return res.status(401).json({ error: "Sesión inválida." });
      await db.query(
        `INSERT IGNORE INTO notificaciones_leidas (notificacion_id, usuario_id)
           SELECT n.id, ? FROM notificaciones n WHERE ${DONDE} AND ${SIN_LEER}`,
        [u.id, u.rol, u.id, u.id],
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/notificaciones/:id/leer", async (req, res) => {
    try {
      const u = await quien(req);
      if (!u) return res.status(401).json({ error: "Sesión inválida." });
      const [[n]] = await db.query(`SELECT n.id FROM notificaciones n WHERE n.id = ? AND ${DONDE}`, [req.params.id, u.rol, u.id]);
      if (!n) return res.status(404).json({ error: "No encontré esa notificación." });
      await db.query("INSERT IGNORE INTO notificaciones_leidas (notificacion_id, usuario_id) VALUES (?,?)", [n.id, u.id]);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { alCrearNotificacion, asegurarTablasNotificaciones, crearNotificacion, registrarRutasNotificaciones, limpiarRoles };
