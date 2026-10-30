// Reflectivas y pegado. Cada fila es un "artículo" que arma el administrador a mano (ej: "2071 Econo") y que agrupa
// los semielaborados que él elige como variantes (2071NA, 2071RO, 2071AM…). El sistema NO deduce grupos por el código:
// una variante pertenece a un solo artículo y solo entra si el administrador la agrega.
// Todos pueden verlo; solo ADMIN modifica.

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
  return normalizar(nuevo);
}

function validarNombre(v) {
  const n = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!n) return { error: "Poné el nombre del artículo (por ejemplo: 2071 Econo)." };
  if (n.length > 120) return { error: "El nombre es demasiado largo (máximo 120 caracteres)." };
  return { valor: n };
}

/** Lista de ids de semielaborados: enteros positivos, sin repetidos. */
function limpiarIds(v) {
  return [...new Set((Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}

async function asegurarTablaReflectivas(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS reflectivas_articulos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(120) NOT NULL,
      nombre_norm VARCHAR(120) NOT NULL,
      prograf TINYINT DEFAULT 0,
      china3m TINYINT DEFAULT 0,
      protector TINYINT DEFAULT 0,
      aplic_completa TINYINT DEFAULT 0,
      aplic_union TINYINT DEFAULT 0,
      actualizado_por VARCHAR(255) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_nombre (nombre_norm)
    )`);
  // Una variante (semielaborado) solo puede estar en un artículo.
  await db.query(`
    CREATE TABLE IF NOT EXISTS reflectivas_variantes (
      semielaborado_id INT PRIMARY KEY,
      articulo_id INT NOT NULL,
      KEY idx_articulo (articulo_id)
    )`);
  // Lo que se había cargado a mano en la versión anterior (un semielaborado por fila) pasa a artículos de una sola
  // variante. Lo que solo se había completado automáticamente desde las configuraciones viejas no se copia.
  const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM reflectivas_articulos");
  const [[{ viejas }]] = await db.query("SELECT COUNT(*) AS viejas FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'reflectivas_modelos'");
  if (Number(n) === 0 && Number(viejas) > 0) {
    const [manuales] = await db.query(
      `SELECT s.id, s.nombre, r.prograf, r.china3m, r.protector, r.aplic_completa, r.aplic_union, r.actualizado_por
         FROM reflectivas_modelos r JOIN semielaborados s ON s.id = r.semielaborado_id WHERE r.actualizado_por IS NOT NULL`,
    );
    for (const m of manuales) {
      const nombre = String(m.nombre).replace(/\s+/g, " ").trim().slice(0, 120);
      try {
        const [ins] = await db.query(
          "INSERT INTO reflectivas_articulos (nombre, nombre_norm, prograf, china3m, protector, aplic_completa, aplic_union, actualizado_por) VALUES (?,?,?,?,?,?,?,?)",
          [nombre, nombre.toLowerCase(), m.prograf, m.china3m, m.protector, m.aplic_completa, m.aplic_union, m.actualizado_por],
        );
        await db.query("INSERT IGNORE INTO reflectivas_variantes (semielaborado_id, articulo_id) VALUES (?,?)", [m.id, ins.insertId]);
      } catch (e) {
        if (e.code !== "ER_DUP_ENTRY") throw e;
      }
    }
  }
}

function registrarRutasReflectivas(app, db, requirePermiso, requireAdmin) {
  const VER = requirePermiso("reflectivas");
  const quien = (req) => req.user?.nombre || req.user?.email || null;
  const fila = (a) => ({ prograf: !!a.prograf, china3m: !!a.china3m, protector: !!a.protector, aplic_completa: !!a.aplic_completa, aplic_union: !!a.aplic_union });

  async function cargarArticulos(conn, soloId) {
    const [arts] = await conn.query(
      `SELECT id, nombre, prograf, china3m, protector, aplic_completa, aplic_union, actualizado_por FROM reflectivas_articulos ${soloId ? "WHERE id = ?" : ""} ORDER BY nombre ASC`,
      soloId ? [soloId] : [],
    );
    const [vars] = await conn.query(
      `SELECT v.articulo_id, s.id, s.codigo, s.nombre FROM reflectivas_variantes v JOIN semielaborados s ON s.id = v.semielaborado_id ${soloId ? "WHERE v.articulo_id = ?" : ""} ORDER BY s.codigo ASC`,
      soloId ? [soloId] : [],
    );
    const porArt = new Map();
    for (const v of vars) (porArt.get(v.articulo_id) || porArt.set(v.articulo_id, []).get(v.articulo_id)).push({ id: v.id, codigo: v.codigo, nombre: v.nombre });
    return arts.map((a) => ({ id: a.id, nombre: a.nombre, ...fila(a), actualizado_por: a.actualizado_por, variantes: porArt.get(a.id) || [] }));
  }

  app.get("/api/reflectivas", VER, async (req, res) => {
    try {
      res.json(await cargarArticulos(db));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Semielaborados para armar un artículo: indica cuáles ya están en otro artículo.
  app.get("/api/reflectivas/semielaborados", requireAdmin, async (req, res) => {
    try {
      const [rows] = await db.query(
        `SELECT s.id, s.codigo, s.nombre, v.articulo_id, a.nombre AS articulo_nombre
           FROM semielaborados s
           LEFT JOIN reflectivas_variantes v ON v.semielaborado_id = s.id
           LEFT JOIN reflectivas_articulos a ON a.id = v.articulo_id
          ORDER BY s.codigo ASC`,
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /** Reemplaza las variantes de un artículo. Devuelve {error,status} si alguna ya pertenece a otro artículo. */
  async function fijarVariantes(conn, articuloId, ids) {
    if (ids.length) {
      const [existentes] = await conn.query("SELECT id FROM semielaborados WHERE id IN (?)", [ids]);
      if (existentes.length !== ids.length) return { error: "Alguna de las variantes elegidas ya no existe. Actualizá la lista y probá de nuevo.", status: 400 };
      const [ocupadas] = await conn.query(
        `SELECT s.codigo, a.nombre FROM reflectivas_variantes v JOIN semielaborados s ON s.id = v.semielaborado_id JOIN reflectivas_articulos a ON a.id = v.articulo_id
          WHERE v.semielaborado_id IN (?) AND v.articulo_id <> ?`,
        [ids, articuloId],
      );
      if (ocupadas.length) return { error: `${ocupadas[0].codigo} ya está en "${ocupadas[0].nombre}". Una variante solo puede estar en un artículo.`, status: 409 };
    }
    await conn.query("DELETE FROM reflectivas_variantes WHERE articulo_id = ?", [articuloId]);
    for (const id of ids) await conn.query("INSERT INTO reflectivas_variantes (semielaborado_id, articulo_id) VALUES (?, ?)", [id, articuloId]);
    return null;
  }

  const soloBooleanos = (o) => Object.fromEntries(CAMPOS.filter((c) => typeof o?.[c] === "boolean").map((c) => [c, o[c]]));

  async function enTransaccion(res, fn) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const r = await fn(conn);
      if (r?.error) {
        await conn.rollback();
        return res.status(r.status || 400).json({ error: r.error });
      }
      await conn.commit();
      res.json(r);
    } catch (e) {
      await conn.rollback().catch(() => {});
      if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Ese nombre o alguna de esas variantes ya está en uso en otro artículo." });
      res.status(500).json({ error: e.message });
    } finally {
      conn.release();
    }
  }

  app.post("/api/reflectivas/articulos", requireAdmin, (req, res) =>
    enTransaccion(res, async (conn) => {
      const nombre = validarNombre(req.body.nombre);
      if (nombre.error) return { error: nombre.error };
      const ids = limpiarIds(req.body.variantes);
      if (!ids.length) return { error: "Agregá al menos una variante (semielaborado) al artículo." };
      const x = aplicarCambios({}, soloBooleanos(req.body));
      const [dup] = await conn.query("SELECT id FROM reflectivas_articulos WHERE nombre_norm = ?", [nombre.valor.toLowerCase()]);
      if (dup.length) return { error: `Ya existe un artículo llamado "${nombre.valor}".`, status: 409 };
      const [ins] = await conn.query(
        "INSERT INTO reflectivas_articulos (nombre, nombre_norm, prograf, china3m, protector, aplic_completa, aplic_union, actualizado_por) VALUES (?,?,?,?,?,?,?,?)",
        [nombre.valor, nombre.valor.toLowerCase(), x.prograf, x.china3m, x.protector, x.aplic_completa, x.aplic_union, quien(req)],
      );
      const err = await fijarVariantes(conn, ins.insertId, ids);
      if (err) return err;
      return { ok: true, articulo: (await cargarArticulos(conn, ins.insertId))[0] };
    }),
  );

  // Edita nombre, variantes y/o tildes (cualquiera de las tres; lo que no se envía no cambia).
  app.put("/api/reflectivas/articulos/:id", requireAdmin, (req, res) =>
    enTransaccion(res, async (conn) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return { error: "Datos inválidos." };
      const [[actual]] = await conn.query("SELECT * FROM reflectivas_articulos WHERE id = ? FOR UPDATE", [id]);
      if (!actual) return { error: "No encontré ese artículo.", status: 404 };
      const cambios = soloBooleanos(req.body);
      const quiereNombre = req.body.nombre !== undefined;
      const quiereVariantes = req.body.variantes !== undefined;
      if (!quiereNombre && !quiereVariantes && !Object.keys(cambios).length) return { error: "No hay nada para cambiar." };

      let nombre = actual.nombre;
      if (quiereNombre) {
        const v = validarNombre(req.body.nombre);
        if (v.error) return { error: v.error };
        nombre = v.valor;
        const [dup] = await conn.query("SELECT id FROM reflectivas_articulos WHERE nombre_norm = ? AND id <> ?", [nombre.toLowerCase(), id]);
        if (dup.length) return { error: `Ya existe un artículo llamado "${nombre}".`, status: 409 };
      }
      if (quiereVariantes) {
        const ids = limpiarIds(req.body.variantes);
        if (!ids.length) return { error: "El artículo tiene que tener al menos una variante." };
        const err = await fijarVariantes(conn, id, ids);
        if (err) return err;
      }
      const x = aplicarCambios(actual, cambios);
      await conn.query(
        "UPDATE reflectivas_articulos SET nombre = ?, nombre_norm = ?, prograf = ?, china3m = ?, protector = ?, aplic_completa = ?, aplic_union = ?, actualizado_por = ? WHERE id = ?",
        [nombre, nombre.toLowerCase(), x.prograf, x.china3m, x.protector, x.aplic_completa, x.aplic_union, quien(req), id],
      );
      return { ok: true, articulo: (await cargarArticulos(conn, id))[0] };
    }),
  );

  // Varios artículos a la vez (selección con tilde).
  app.put("/api/reflectivas/lote", requireAdmin, (req, res) =>
    enTransaccion(res, async (conn) => {
      const ids = limpiarIds(req.body.ids);
      const cambios = soloBooleanos(req.body.cambios);
      if (!ids.length) return { error: "Elegí al menos un artículo." };
      if (!Object.keys(cambios).length) return { error: "No hay nada para cambiar." };
      const [arts] = await conn.query("SELECT * FROM reflectivas_articulos WHERE id IN (?) FOR UPDATE", [ids]);
      let sinProtector = 0;
      for (const a of arts) {
        const x = aplicarCambios(a, cambios);
        if (!x.protector && (cambios.aplic_completa === true || cambios.aplic_union === true)) sinProtector++;
        await conn.query("UPDATE reflectivas_articulos SET prograf = ?, china3m = ?, protector = ?, aplic_completa = ?, aplic_union = ?, actualizado_por = ? WHERE id = ?", [x.prograf, x.china3m, x.protector, x.aplic_completa, x.aplic_union, quien(req), a.id]);
      }
      return { ok: true, actualizados: arts.length, sin_protector: sinProtector };
    }),
  );

  // Borra el artículo y sus vínculos. No toca los semielaborados.
  app.delete("/api/reflectivas/articulos/:id", requireAdmin, (req, res) =>
    enTransaccion(res, async (conn) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return { error: "Datos inválidos." };
      const [r] = await conn.query("DELETE FROM reflectivas_articulos WHERE id = ?", [id]);
      if (!r.affectedRows) return { error: "No encontré ese artículo.", status: 404 };
      await conn.query("DELETE FROM reflectivas_variantes WHERE articulo_id = ?", [id]);
      return { ok: true };
    }),
  );
}

module.exports = { asegurarTablaReflectivas, registrarRutasReflectivas, normalizar, aplicarCambios, validarNombre, limpiarIds };
