// Reflectivas y pegado: una fila por artículo (semielaborado) con qué reflectiva lleva (Prograf / China 3M),
// si lleva protector Orajet y cómo se aplica (completa / unión-puntas). Todos pueden verlo; solo ADMIN modifica.

const CAMPOS = ["prograf", "china3m", "protector", "aplic_completa", "aplic_union"];

/** Regla de negocio: la aplicación del protector solo existe si el artículo lleva protector. */
function normalizar(e) {
  const x = {};
  for (const c of CAMPOS) x[c] = e[c] ? 1 : 0;
  if (!x.protector) {
    x.aplic_completa = 0;
    x.aplic_union = 0;
  }
  return x;
}

/** Aplica cambios parciales ({campo: true|false}) sobre un estado y devuelve el estado válido. */
function aplicarCambios(actual, cambios) {
  const nuevo = { ...actual };
  for (const c of CAMPOS) if (typeof cambios[c] === "boolean") nuevo[c] = cambios[c] ? 1 : 0;
  // Si en esta misma operación se sacó el protector, la aplicación se limpia; si no lleva protector, no se puede tildar.
  return normalizar(nuevo);
}

async function asegurarTablaReflectivas(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS reflectivas_modelos (
      semielaborado_id INT PRIMARY KEY,
      prograf TINYINT DEFAULT 0,
      china3m TINYINT DEFAULT 0,
      protector TINYINT DEFAULT 0,
      aplic_completa TINYINT DEFAULT 0,
      aplic_union TINYINT DEFAULT 0,
      actualizado_por VARCHAR(255) NULL,
      actualizado_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
  // Primera vez: se parte de lo que ya estaba cargado en las configuraciones de pegado de cada semielaborado.
  const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM reflectivas_modelos");
  if (Number(n) === 0) {
    await db.query(`
      INSERT IGNORE INTO reflectivas_modelos (semielaborado_id, prograf, china3m, protector, aplic_completa, aplic_union)
      SELECT s.id,
             UPPER(c.reflectiva) LIKE '%PROGRAF%',
             UPPER(c.reflectiva) LIKE '%CHINA%',
             c.protector_orajet = 1,
             c.protector_orajet = 1 AND UPPER(c.aplicacion_protector) = 'COMPLETA',
             c.protector_orajet = 1 AND (UPPER(c.aplicacion_protector) LIKE '%UNI%' OR UPPER(c.aplicacion_protector) LIKE '%PUNTA%')
        FROM semielaborados s JOIN configuraciones_pegado c ON c.id = s.configuracion_pegado_id`);
  }
}

function registrarRutasReflectivas(app, db, requirePermiso, requireAdmin) {
  const VER = requirePermiso("reflectivas");

  app.get("/api/reflectivas", VER, async (req, res) => {
    try {
      const [rows] = await db.query(`
        SELECT s.id, s.codigo, s.nombre,
               COALESCE(r.prograf, 0) AS prograf, COALESCE(r.china3m, 0) AS china3m, COALESCE(r.protector, 0) AS protector,
               COALESCE(r.aplic_completa, 0) AS aplic_completa, COALESCE(r.aplic_union, 0) AS aplic_union,
               r.semielaborado_id IS NOT NULL AS definido, r.actualizado_por
          FROM semielaborados s LEFT JOIN reflectivas_modelos r ON r.semielaborado_id = s.id
         ORDER BY s.nombre ASC`);
      res.json(rows.map((r) => ({ ...r, prograf: !!r.prograf, china3m: !!r.china3m, protector: !!r.protector, aplic_completa: !!r.aplic_completa, aplic_union: !!r.aplic_union, definido: !!r.definido })));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  async function guardar(conn, id, cambios, quien) {
    const [[fila]] = await conn.query("SELECT prograf, china3m, protector, aplic_completa, aplic_union FROM reflectivas_modelos WHERE semielaborado_id = ? FOR UPDATE", [id]);
    const nuevo = aplicarCambios(fila || {}, cambios);
    await conn.query(
      `INSERT INTO reflectivas_modelos (semielaborado_id, prograf, china3m, protector, aplic_completa, aplic_union, actualizado_por)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE prograf = VALUES(prograf), china3m = VALUES(china3m), protector = VALUES(protector),
         aplic_completa = VALUES(aplic_completa), aplic_union = VALUES(aplic_union), actualizado_por = VALUES(actualizado_por)`,
      [id, nuevo.prograf, nuevo.china3m, nuevo.protector, nuevo.aplic_completa, nuevo.aplic_union, quien],
    );
    return { nuevo, pedidoAplicSinProtector: !nuevo.protector && (cambios.aplic_completa === true || cambios.aplic_union === true) };
  }

  const soloBooleanos = (o) => Object.fromEntries(CAMPOS.filter((c) => typeof o?.[c] === "boolean").map((c) => [c, o[c]]));

  // Varios artículos a la vez (selección con tilde). Va antes que la ruta con :id.
  app.put("/api/reflectivas/lote", requireAdmin, async (req, res) => {
    const ids = [...new Set((Array.isArray(req.body.ids) ? req.body.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    const cambios = soloBooleanos(req.body.cambios);
    if (!ids.length) return res.status(400).json({ error: "Elegí al menos un artículo." });
    if (!Object.keys(cambios).length) return res.status(400).json({ error: "No hay nada para cambiar." });
    const conn = await db.getConnection();
    try {
      const [existentes] = await conn.query("SELECT id FROM semielaborados WHERE id IN (?)", [ids]);
      await conn.beginTransaction();
      let sinProtector = 0;
      for (const { id } of existentes) {
        const r = await guardar(conn, id, cambios, req.user?.nombre || req.user?.email || null);
        if (r.pedidoAplicSinProtector) sinProtector++;
      }
      await conn.commit();
      res.json({ ok: true, actualizados: existentes.length, sin_protector: sinProtector });
    } catch (e) {
      await conn.rollback().catch(() => {});
      res.status(500).json({ error: e.message });
    } finally {
      conn.release();
    }
  });

  app.put("/api/reflectivas/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const cambios = soloBooleanos(req.body);
    if (!Number.isInteger(id) || id <= 0 || !Object.keys(cambios).length) return res.status(400).json({ error: "Datos inválidos." });
    const conn = await db.getConnection();
    try {
      const [ex] = await conn.query("SELECT id FROM semielaborados WHERE id = ?", [id]);
      if (!ex.length) return res.status(404).json({ error: "No encontré ese artículo." });
      await conn.beginTransaction();
      const r = await guardar(conn, id, cambios, req.user?.nombre || req.user?.email || null);
      await conn.commit();
      res.json({ ok: true, estado: { prograf: !!r.nuevo.prograf, china3m: !!r.nuevo.china3m, protector: !!r.nuevo.protector, aplic_completa: !!r.nuevo.aplic_completa, aplic_union: !!r.nuevo.aplic_union } });
    } catch (e) {
      await conn.rollback().catch(() => {});
      res.status(500).json({ error: e.message });
    } finally {
      conn.release();
    }
  });
}

module.exports = { asegurarTablaReflectivas, registrarRutasReflectivas, normalizar, aplicarCambios };
