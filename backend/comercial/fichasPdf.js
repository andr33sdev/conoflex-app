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
  const columna = async (tabla, col) => (await db.query("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [tabla, col]))[0].length > 0;
  // Cómo estaba el producto antes de que este PDF lo tocara (para volver atrás al eliminar el PDF).
  if (!(await columna("fichas_pdf_productos", "antes"))) await db.query("ALTER TABLE fichas_pdf_productos ADD COLUMN antes MEDIUMTEXT NULL");
  // De qué PDF vino la ficha de cada producto.
  if (!(await columna("productos", "ficha_pdf_id"))) {
    await db.query("ALTER TABLE productos ADD COLUMN ficha_pdf_id INT NULL");
    // PDFs importados antes de este cambio: cada producto queda ligado al último PDF que lo actualizó (si el nombre coincide con su ficha_origen).
    const [viejos] = await db.query(
      `SELECT fp.producto_id, f.id AS ficha_id FROM fichas_pdf_productos fp JOIN fichas_pdf f ON f.id = fp.ficha_id JOIN productos p ON p.id = fp.producto_id
        WHERE fp.accion IN ('ACTUALIZADO','NUEVO') AND p.ficha_origen = f.nombre ORDER BY f.id ASC`,
    );
    for (const v of viejos) await db.query("UPDATE productos SET ficha_pdf_id = ? WHERE id = ?", [v.ficha_id, v.producto_id]);
  }
}

/** Crea el registro del PDF (antes de aplicarlo, para que los productos puedan apuntar a él). */
async function crearFicha(db, { nombre, buffer, categoria, usuario }) {
  const [r] = await db.query("INSERT INTO fichas_pdf (nombre, bytes, categoria, usuario, leido, archivo) VALUES (?,?,?,?,1,?)", [String(nombre || "ficha.pdf").slice(0, 255), buffer ? buffer.length : 0, categoria || null, usuario || null, buffer || null]);
  return r.insertId;
}
const marcarIlegible = (db, id) => db.query("UPDATE fichas_pdf SET leido = 0 WHERE id = ?", [id]);
async function registrarAfectados(db, fichaId, afectados) {
  for (const a of afectados) {
    await db.query("INSERT INTO fichas_pdf_productos (ficha_id, producto_id, codigo, accion, antes) VALUES (?,?,?,?,?)", [fichaId, a.producto_id || null, String(a.codigo).slice(0, 120), a.accion, a.antes ? JSON.stringify(a.antes) : null]);
  }
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

function registrarRutasFichasPdf(app, { db, autenticarToken, autorizarRoles, eliminar }) {
  const permiso = [autenticarToken, autorizarRoles("ADMIN", "COMERCIAL")];
  app.get("/api/comercial/fichas-pdf", ...permiso, async (req, res) => {
    try {
      res.json({ fichas: await listarFichas(db) });
    } catch (e) {
      console.error("[fichas-pdf] listar:", e.message);
      res.status(500).json({ error: "No pude cargar los PDF." });
    }
  });
  app.delete("/api/comercial/fichas-pdf/:id", ...permiso, async (req, res) => {
    try {
      const r = await eliminar(db, Number(req.params.id));
      if (r.error) return res.status(r.status || 400).json({ error: r.error });
      res.json({ success: true, ...r });
    } catch (e) {
      console.error("[fichas-pdf] eliminar:", e.message);
      res.status(500).json({ error: "No pude eliminar el PDF. No se cambió nada." });
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

module.exports = { asegurarTablasFichasPdf, guardarFicha, crearFicha, registrarAfectados, marcarIlegible, listarFichas, registrarRutasFichasPdf };
