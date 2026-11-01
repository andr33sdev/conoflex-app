"use strict";
// Tema visual (oscuro/claro) guardado POR USUARIO en el servidor: vale igual en el celular y en la computadora.
const TEMAS = ["oscuro", "claro"];
const normalizarTema = (t) => (TEMAS.includes(String(t || "").toLowerCase()) ? String(t).toLowerCase() : null);

async function asegurarColumnaTema(db) {
  const [cols] = await db.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'tema'");
  if (!cols.length) await db.query("ALTER TABLE usuarios ADD COLUMN tema VARCHAR(8) NULL");
}

function registrarRutasTema(app, { db, autenticarToken }) {
  app.get("/api/mi-tema", autenticarToken, async (req, res) => {
    try {
      const [[u]] = await db.query("SELECT tema FROM usuarios WHERE id = ?", [req.user?.id]);
      res.json({ tema: normalizarTema(u?.tema) || "oscuro" });
    } catch (e) {
      console.error("[tema] leer:", e.message);
      res.status(500).json({ error: "No pude leer tu tema." });
    }
  });
  app.put("/api/mi-tema", autenticarToken, async (req, res) => {
    const tema = normalizarTema(req.body?.tema);
    if (!tema) return res.status(400).json({ error: "El tema tiene que ser “oscuro” o “claro”." });
    try {
      const [r] = await db.query("UPDATE usuarios SET tema = ? WHERE id = ?", [tema, req.user?.id]);
      if (!r.affectedRows) return res.status(404).json({ error: "No encontré tu usuario." });
      res.json({ success: true, tema });
    } catch (e) {
      console.error("[tema] guardar:", e.message);
      res.status(500).json({ error: "No pude guardar tu tema." });
    }
  });
}

module.exports = { TEMAS, normalizarTema, asegurarColumnaTema, registrarRutasTema };
