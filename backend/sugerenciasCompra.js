"use strict";
// Sugerencias de compra: el encargado de planta (producción) y el de depósito sugieren comprar una materia prima, con una
// urgencia del 1 al 5 (la misma escala que las solicitudes de compra). Quien compra las revisa y las agrega a una solicitud
// de compra abierta (tal cual o con otra cantidad, asignando el proveedor). Cada paso queda en una auditoría por sugerencia.

const URGENCIAS = { 1: "Baja", 2: "Normal", 3: "Media", 4: "Alta", 5: "Urgente" };
const ESTADOS = ["PENDIENTE", "AGREGADA", "DESCARTADA"];
const num = (v) => Number(String(v ?? "").replace(",", "."));
const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

async function asegurarTablasSugerencias(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS sugerencias_compra (
      id INT AUTO_INCREMENT PRIMARY KEY,
      materia_prima_id INT NOT NULL,
      mp_codigo VARCHAR(255) NOT NULL,
      mp_nombre VARCHAR(255) NOT NULL,
      unidad VARCHAR(50) NULL,
      cantidad DECIMAL(14,3) NOT NULL,
      urgencia TINYINT NOT NULL DEFAULT 3,
      motivo VARCHAR(300) NULL,
      estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
      sugerida_por_id INT NULL,
      sugerida_por VARCHAR(120) NULL,
      sugerida_por_rol VARCHAR(40) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resuelta_at DATETIME NULL,
      resuelta_por VARCHAR(120) NULL,
      solicitud_id INT NULL,
      cantidad_pedida DECIMAL(14,3) NULL,
      proveedor_asignado VARCHAR(255) NULL,
      motivo_descarte VARCHAR(300) NULL,
      KEY idx_estado (estado, urgencia),
      KEY idx_mp (materia_prima_id)
    )`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS sugerencias_compra_eventos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sugerencia_id INT NOT NULL,
      tipo VARCHAR(20) NOT NULL,
      usuario VARCHAR(120) NULL,
      detalle TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_sug (sugerencia_id)
    )`);
}

/** Valida lo que llega del formulario de una sugerencia nueva. Devuelve { error } o { valores }. */
function validarSugerencia(body = {}) {
  const mp = Number(body.materia_prima_id);
  if (!Number.isInteger(mp) || mp <= 0) return { error: "Elegí la materia prima de la lista." };
  const cantidad = num(body.cantidad);
  if (!Number.isFinite(cantidad) || cantidad <= 0) return { error: "La cantidad tiene que ser un número mayor a cero." };
  const urgencia = Number(body.urgencia);
  if (!Number.isInteger(urgencia) || urgencia < 1 || urgencia > 5) return { error: "La urgencia va del 1 al 5." };
  const motivo = String(body.motivo || "").trim().slice(0, 300);
  return { valores: { materia_prima_id: mp, cantidad, urgencia, motivo: motivo || null } };
}

/**
 * Pedidos de compra de una materia prima que ya se solicitaron y todavía no se recibieron completos.
 * Devuelve un Map: materia_prima_id → [{ solicitud_id, item_id, proveedor, pedida, recibida, fecha }].
 * Los renglones sin materia vinculada se reconocen por el nombre exacto del artículo.
 */
async function pedidosSinRecibir(db, materias) {
  const [rows] = await db.query(
    `SELECT i.id AS item_id, i.solicitud_id, i.articulo, i.proveedor, i.materia_prima_id, i.cantidad_solicitada, COALESCE(i.cantidad_recibida, 0) AS cantidad_recibida,
            s.fecha, s.estado
       FROM solicitudes_compra_items i JOIN solicitudes_compra s ON s.id = i.solicitud_id
      WHERE COALESCE(i.cantidad_recibida, 0) < i.cantidad_solicitada AND s.estado NOT IN ('CANCELADA', 'ANULADA')`,
  );
  const porNombre = new Map(materias.map((m) => [sinAcentos(m.nombre), m.id]));
  const mapa = new Map();
  for (const r of rows) {
    const id = r.materia_prima_id || porNombre.get(sinAcentos(r.articulo));
    if (!id) continue;
    if (!mapa.has(id)) mapa.set(id, []);
    mapa.get(id).push({ solicitud_id: r.solicitud_id, item_id: r.item_id, proveedor: r.proveedor, pedida: Number(r.cantidad_solicitada), recibida: Number(r.cantidad_recibida), fecha: r.fecha });
  }
  return mapa;
}

const textoDe = (e) => {
  try {
    return e.detalle ? JSON.parse(e.detalle) : {};
  } catch {
    return {};
  }
};

/** Sugerencias pendientes para Vera: lo más urgente primero, con si ya hay un pedido sin recibir. */
async function pendientesParaVera(db) {
  const [rows] = await db.query("SELECT * FROM sugerencias_compra WHERE estado = 'PENDIENTE' ORDER BY urgencia DESC, id ASC LIMIT 60");
  const [mats] = await db.query("SELECT id, nombre FROM materias_primas");
  const enCurso = await pedidosSinRecibir(db, mats);
  return rows.map((s) => ({
    id: s.id,
    materia_prima: s.mp_nombre,
    codigo: s.mp_codigo,
    cantidad: Number(s.cantidad),
    unidad: s.unidad,
    urgencia: s.urgencia,
    urgencia_texto: URGENCIAS[s.urgencia],
    sugerida_por: s.sugerida_por,
    area: s.sugerida_por_rol,
    motivo: s.motivo,
    desde: s.created_at,
    ya_solicitado_sin_recibir: (enCurso.get(s.materia_prima_id) || []).map((p) => ({ solicitud: p.solicitud_id, proveedor: p.proveedor, pedido: p.pedida, recibido: p.recibida })),
  }));
}

function registrarRutasSugerencias(app, { db, requirePermiso, nombreDeUsuario, crearNotificacion }) {
  const PERMISO = requirePermiso("sugerencias-compra");

  const quien = async (req) => {
    const [r] = await db.query("SELECT id, nombre, rol FROM usuarios WHERE id = ?", [req.user?.id]);
    const u = r[0] || {};
    return { id: u.id || null, nombre: u.nombre || "Usuario", rol: String(u.rol || "").trim().toUpperCase() };
  };
  // Agregar a una solicitud o descartar lo hace quien gestiona las compras (ADMIN o quien tenga Solicitudes de Compra).
  const puedeGestionar = async (u) => {
    if (u.rol === "ADMIN") return true;
    if (!u.rol) return false;
    const [p] = await db.query("SELECT 1 FROM permisos_roles WHERE rol_nombre = ? AND modulo_id IN ('solicitudes-compra', '*') LIMIT 1", [u.rol]);
    return p.length > 0;
  };
  const evento = (conn, id, tipo, usuario, detalle) =>
    conn.query("INSERT INTO sugerencias_compra_eventos (sugerencia_id, tipo, usuario, detalle) VALUES (?,?,?,?)", [id, tipo, usuario, detalle ? JSON.stringify(detalle) : null]);

  // Materias primas para elegir, con lo que ya está pedido y sin recibir.
  app.get("/api/sugerencias-compra/materias", PERMISO, async (req, res) => {
    try {
      const [mats] = await db.query("SELECT id, codigo, nombre, unidad_medida, stock_actual, stock_minimo FROM materias_primas ORDER BY codigo ASC");
      const enCurso = await pedidosSinRecibir(db, mats);
      const [pend] = await db.query("SELECT materia_prima_id, COUNT(*) AS n FROM sugerencias_compra WHERE estado = 'PENDIENTE' GROUP BY materia_prima_id");
      const pendientes = new Map(pend.map((p) => [p.materia_prima_id, Number(p.n)]));
      res.json(mats.map((m) => ({ ...m, en_curso: enCurso.get(m.id) || [], sugerencias_pendientes: pendientes.get(m.id) || 0 })));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/sugerencias-compra", PERMISO, async (req, res) => {
    try {
      const u = await quien(req);
      const [rows] = await db.query(
        `SELECT s.*, m.stock_actual, m.stock_minimo FROM sugerencias_compra s LEFT JOIN materias_primas m ON m.id = s.materia_prima_id
          WHERE s.estado = 'PENDIENTE' OR s.resuelta_at >= (NOW() - INTERVAL 60 DAY)
          ORDER BY s.id DESC LIMIT 400`,
      );
      const [mats] = await db.query("SELECT id, nombre FROM materias_primas");
      const enCurso = await pedidosSinRecibir(db, mats);
      res.json({
        puede_gestionar: await puedeGestionar(u),
        yo: { id: u.id, nombre: u.nombre },
        sugerencias: rows.map((s) => ({ ...s, cantidad: Number(s.cantidad), cantidad_pedida: s.cantidad_pedida === null ? null : Number(s.cantidad_pedida), en_curso: s.estado === "PENDIENTE" ? enCurso.get(s.materia_prima_id) || [] : [] })),
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Solicitudes de compra abiertas (a las que se puede agregar).
  app.get("/api/sugerencias-compra/solicitudes-abiertas", PERMISO, async (req, res) => {
    try {
      const [rows] = await db.query(
        `SELECT s.id, s.fecha, (SELECT COUNT(*) FROM solicitudes_compra_items i WHERE i.solicitud_id = s.id) AS renglones
           FROM solicitudes_compra s WHERE s.estado = 'ABIERTA' ORDER BY s.id DESC LIMIT 40`,
      );
      res.json(rows.map((r) => ({ ...r, renglones: Number(r.renglones) })));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/sugerencias-compra", PERMISO, async (req, res) => {
    try {
      const v = validarSugerencia(req.body);
      if (v.error) return res.status(400).json({ error: v.error });
      const x = v.valores;
      const [[mp]] = await db.query("SELECT id, codigo, nombre, unidad_medida FROM materias_primas WHERE id = ?", [x.materia_prima_id]);
      if (!mp) return res.status(404).json({ error: "Esa materia prima no existe. Elegila de la lista." });
      const u = await quien(req);
      const conn = await db.getConnection();
      let id;
      try {
        await conn.beginTransaction();
        const [r] = await conn.query(
          `INSERT INTO sugerencias_compra (materia_prima_id, mp_codigo, mp_nombre, unidad, cantidad, urgencia, motivo, sugerida_por_id, sugerida_por, sugerida_por_rol)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [mp.id, mp.codigo, mp.nombre, mp.unidad_medida, x.cantidad, x.urgencia, x.motivo, u.id, u.nombre, u.rol],
        );
        id = r.insertId;
        await evento(conn, id, "SUGERIDA", u.nombre, { cantidad: x.cantidad, urgencia: x.urgencia, motivo: x.motivo, area: u.rol });
        await conn.commit();
      } catch (e) {
        await conn.rollback().catch(() => {});
        throw e;
      } finally {
        conn.release();
      }
      const area = u.rol === "DEPOSITO" ? "Depósito" : u.rol === "PRODUCCION" ? "Producción" : u.nombre;
      // Se avisa a producción, al administrador y a los roles que gestionan las solicitudes de compra (quien sugiere no recibe su propio aviso).
      const [rolesCompra] = await db.query("SELECT DISTINCT rol_nombre FROM permisos_roles WHERE modulo_id IN ('solicitudes-compra', '*')");
      await crearNotificacion(db, {
        tipo: "SUGERENCIA_COMPRA",
        titulo: `${area} sugiere comprar: ${mp.nombre}`,
        texto: `${x.cantidad} ${String(mp.unidad_medida || "").toLowerCase()} · urgencia ${x.urgencia} (${URGENCIAS[x.urgencia].toLowerCase()})${x.motivo ? ` · ${x.motivo}` : ""} · ${u.nombre}`,
        ruta: "/sugerencias-compra",
        roles: ["ADMIN", "PRODUCCION", ...rolesCompra.map((r) => r.rol_nombre)],
        creada_por_id: u.id,
        push: x.urgencia >= 5,
      });
      res.json({ success: true, id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Agregar la sugerencia a una solicitud de compra abierta.
  app.post("/api/sugerencias-compra/:id/agregar", PERMISO, async (req, res) => {
    const id = Number(req.params.id);
    const u = await quien(req);
    if (!(await puedeGestionar(u))) return res.status(403).json({ error: "Solo quien gestiona las compras puede agregarla a una solicitud." });
    const solicitudId = Number(req.body.solicitud_id);
    if (!Number.isInteger(solicitudId) || solicitudId <= 0) return res.status(400).json({ error: "Elegí la solicitud de compra." });
    const proveedor = String(req.body.proveedor || "").trim().slice(0, 255);
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [[s]] = await conn.query("SELECT * FROM sugerencias_compra WHERE id = ? FOR UPDATE", [id]);
      if (!s) {
        await conn.rollback();
        return res.status(404).json({ error: "No encontré esa sugerencia." });
      }
      if (s.estado !== "PENDIENTE") {
        await conn.rollback();
        return res.status(409).json({ error: s.estado === "AGREGADA" ? "Esa sugerencia ya se agregó a una solicitud." : "Esa sugerencia ya se descartó." });
      }
      const cantidad = req.body.cantidad === undefined || req.body.cantidad === null || req.body.cantidad === "" ? Number(s.cantidad) : num(req.body.cantidad);
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        await conn.rollback();
        return res.status(400).json({ error: "La cantidad tiene que ser un número mayor a cero." });
      }
      const [[sol]] = await conn.query("SELECT id, estado FROM solicitudes_compra WHERE id = ? FOR UPDATE", [solicitudId]);
      if (!sol || sol.estado !== "ABIERTA") {
        await conn.rollback();
        return res.status(409).json({ error: "Esa solicitud de compra no está abierta." });
      }
      // Aviso previo: si ese artículo ya se solicitó y no se recibió, se frena hasta que se confirme.
      const [mats] = await conn.query("SELECT id, nombre FROM materias_primas");
      const previos = (await pedidosSinRecibir(conn, mats)).get(s.materia_prima_id) || [];
      if (previos.length && req.body.confirmar_duplicado !== true) {
        await conn.rollback();
        return res.status(409).json({ codigo: "YA_SOLICITADO", error: `${s.mp_nombre} ya se solicitó y está esperando recepción.`, pedidos: previos });
      }
      const cambio = Math.abs(cantidad - Number(s.cantidad)) > 1e-9;
      const [ins] = await conn.query(
        `INSERT INTO solicitudes_compra_items (solicitud_id, articulo, proveedor, cantidad_solicitada, prioridad, materia_prima_id, cantidad_sugerida, pedido_corregido_en)
         VALUES (?,?,?,?,?,?,?,?)`,
        [solicitudId, s.mp_nombre, proveedor || "A definir", cantidad, s.urgencia, s.materia_prima_id, cambio ? s.cantidad : null, cambio ? new Date() : null],
      );
      await conn.query(
        "UPDATE sugerencias_compra SET estado = 'AGREGADA', resuelta_at = NOW(), resuelta_por = ?, solicitud_id = ?, cantidad_pedida = ?, proveedor_asignado = ? WHERE id = ?",
        [u.nombre, solicitudId, cantidad, proveedor || null, id],
      );
      await evento(conn, id, "AGREGADA", u.nombre, {
        solicitud_id: solicitudId,
        item_id: ins.insertId,
        cantidad,
        cantidad_sugerida: Number(s.cantidad),
        proveedor: proveedor || null,
        ya_solicitado: previos.length ? previos.map((p) => ({ solicitud_id: p.solicitud_id, proveedor: p.proveedor, pedida: p.pedida, recibida: p.recibida })) : undefined,
      });
      await conn.commit();
      res.json({ success: true, solicitud_id: solicitudId, item_id: ins.insertId });
    } catch (e) {
      await conn.rollback().catch(() => {});
      res.status(500).json({ error: e.message });
    } finally {
      conn.release();
    }
  });

  // Descartar: la puede descartar quien gestiona las compras o la persona que la sugirió (mientras esté pendiente).
  app.post("/api/sugerencias-compra/:id/descartar", PERMISO, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const u = await quien(req);
      const [[s]] = await db.query("SELECT * FROM sugerencias_compra WHERE id = ?", [id]);
      if (!s) return res.status(404).json({ error: "No encontré esa sugerencia." });
      if (s.estado !== "PENDIENTE") return res.status(409).json({ error: "Esa sugerencia ya fue resuelta." });
      if (!(await puedeGestionar(u)) && s.sugerida_por_id !== u.id) return res.status(403).json({ error: "Solo la puede descartar quien la sugirió o quien gestiona las compras." });
      const motivo = String(req.body.motivo || "").trim().slice(0, 300) || null;
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query("UPDATE sugerencias_compra SET estado = 'DESCARTADA', resuelta_at = NOW(), resuelta_por = ?, motivo_descarte = ? WHERE id = ? AND estado = 'PENDIENTE'", [u.nombre, motivo, id]);
        await evento(conn, id, "DESCARTADA", u.nombre, { motivo });
        await conn.commit();
      } catch (e) {
        await conn.rollback().catch(() => {});
        throw e;
      } finally {
        conn.release();
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/sugerencias-compra/:id/auditoria", PERMISO, async (req, res) => {
    try {
      const [rows] = await db.query("SELECT tipo, usuario, detalle, created_at FROM sugerencias_compra_eventos WHERE sugerencia_id = ? ORDER BY id ASC", [Number(req.params.id)]);
      res.json(rows.map((e) => ({ tipo: e.tipo, usuario: e.usuario, fecha: e.created_at, detalle: textoDe(e) })));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { asegurarTablasSugerencias, registrarRutasSugerencias, validarSugerencia, pedidosSinRecibir, pendientesParaVera, URGENCIAS, ESTADOS };
