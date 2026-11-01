"use strict";
// PDFs de fichas/usos que se suben a Comercial IA: se guardan y se registra a qué productos afectó cada uno.
const { esPdf } = require("./listaPdf");

async function asegurarTablasFichasPdf(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS fichas_pdf (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    bytes INT NOT NULL DEFAULT 0,
    categoria VARCHAR(120) NULL,
    usuario VARCHAR(120) NULL,
    leido TINYINT(1) NOT NULL DEFAULT 1,
    archivo LONGBLOB NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS fichas_pdf_productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ficha_id INT NOT NULL,
    producto_id INT NULL,
    codigo VARCHAR(120) NOT NULL,
    accion VARCHAR(12) NOT NULL,
    KEY idx_ficha (ficha_id),
    KEY idx_producto (producto_id)
  )`);
}

/** Guarda un PDF y sus productos afectados. `afectados`: [{producto_id, codigo, accion: ACTUALIZADO|NUEVO|OMITIDO}] */
async function guardarFicha(db, { nombre, buffer, categoria, usuario, leido = true, afectados = [] }) {
  const [r] = await db.query("INSERT INTO fichas_pdf (nombre, bytes, categoria, usuario, leido, archivo) VALUES (?,?,?,?,?,?)", [
    String(nombre || "ficha.pdf").slice(0, 255), buffer ? buffer.length : 0, categoria || null, usuario || null, leido ? 1 : 0, buffer || null,
  ]);
  for (const a of afectados) {
    await db.query("INSERT INTO fichas_pdf_productos (ficha_id, producto_id, codigo, accion) VALUES (?,?,?,?)", [r.insertId, a.producto_id || null, String(a.codigo).slice(0, 120), a.accion]);
  }
  return r.insertId;
}

async function listarFichas(db) {
  const [fichas] = await db.query("SELECT id, nombre, bytes, categoria, usuario, leido, created_at FROM fichas_pdf ORDER BY id DESC LIMIT 200");
  if (!fichas.length) return [];
  const [filas] = await db.query(
    `SELECT fp.ficha_id, fp.producto_id, fp.codigo, fp.accion, p.nombre AS producto_nombre
       FROM fichas_pdf_productos fp LEFT JOIN productos p ON p.id = fp.producto_id
      WHERE fp.ficha_id IN (?) ORDER BY fp.codigo`,
    [fichas.map((f) => f.id)],
  );
  const por = new Map();
  for (const f of filas) {
    if (!por.has(f.ficha_id)) por.set(f.ficha_id, []);
    por.get(f.ficha_id).push({ producto_id: f.producto_id, codigo: f.codigo, nombre: f.producto_nombre || "", accion: f.accion, existe: !!f.producto_nombre || f.producto_id !== null });
  }
  return fichas.map((f) => {
    const productos = por.get(f.id) || [];
    const cuenta = (a) => productos.filter((p) => p.accion === a).length;
    return { ...f, productos, actualizados: cuenta("ACTUALIZADO"), nuevos: cuenta("NUEVO"), omitidos: cuenta("OMITIDO") };
  });
}

function registrarRutasFichasPdf(app, { db, autenticarToken, autorizarRoles }) {
  const permiso = [autenticarToken, autorizarRoles("ADMIN", "COMERCIAL")];
  app.get("/api/comercial/fichas-pdf", ...permiso, async (req, res) => {
    try {
      res.json({ fichas: await listarFichas(db) });
    } catch (e) {
      console.error("[fichas-pdf] listar:", e.message);
      res.status(500).json({ error: "No pude cargar los PDF." });
    }
  });
  app.get("/api/comercial/fichas-pdf/:id/archivo", ...permiso, async (req, res) => {
    try {
      const [[f]] = await db.query("SELECT nombre, archivo FROM fichas_pdf WHERE id = ?", [Number(req.params.id)]);
      if (!f || !f.archivo || !esPdf(f.archivo)) return res.status(404).json({ error: "Ese PDF no está guardado." });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(f.nombre)}"`);
      res.send(f.archivo);
    } catch (e) {
      res.status(500).json({ error: "No pude abrir el PDF." });
    }
  });
}

module.exports = { asegurarTablasFichasPdf, guardarFicha, listarFichas, registrarRutasFichasPdf };
