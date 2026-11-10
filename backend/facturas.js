"use strict";
// Facturas y notas de crédito reales (las lee el lector-facturas en la PC del trabajo desde los PDF del sistema
// de facturación) y el informe "Costo de lo vendido": en un rango de fechas, unidades facturadas de cada producto
// terminado (facturas − notas de crédito) × su costo actual según la receta.
const crypto = require("crypto");
const { costosCompletos } = require("./mpCostos");

const TIPOS_VALIDOS = new Set(["FACTURA", "NOTA_CREDITO", "NOTA_DEBITO"]);
const PERMISO = "costo-vendido";

/** Código de producto para comparar: mayúsculas y sin espacios ("2051-1R NA" = "2051-1RNA"). */
const norm = (c) => String(c ?? "").toUpperCase().replace(/\s+/g, "");
const sinGuiones = (c) => norm(c).replace(/[-_.]/g, "");
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fechaOk = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f || ""));

/** Valida y limpia un comprobante que manda el lector. Devuelve { error } o { c }. */
function validarComprobante(x) {
  if (!x || typeof x !== "object") return { error: "comprobante vacío" };
  if (!TIPOS_VALIDOS.has(x.tipo)) return { error: "tipo inválido" };
  const pv = String(x.punto_venta || "").replace(/\D/g, "");
  const nro = String(x.numero || "").replace(/\D/g, "");
  if (!pv || !nro) return { error: "sin número" };
  if (!fechaOk(x.fecha)) return { error: "sin fecha" };
  const signo = x.tipo === "FACTURA" ? 1 : x.tipo === "NOTA_CREDITO" ? -1 : 0;
  const items = (Array.isArray(x.items) ? x.items : []).slice(0, 300).map((i) => ({
    codigo: String(i?.codigo || "").trim().slice(0, 100),
    descripcion: String(i?.descripcion || "").trim().slice(0, 255),
    unidad: String(i?.unidad || "").trim().slice(0, 20),
    cantidad: Number(i?.cantidad),
    precio_unitario: Number.isFinite(Number(i?.precio_unitario)) ? Number(i.precio_unitario) : null,
    subtotal: Number.isFinite(Number(i?.subtotal)) ? Number(i.subtotal) : null,
  }));
  if (items.some((i) => !i.codigo || !Number.isFinite(i.cantidad))) return { error: "ítem sin código o cantidad" };
  return {
    c: {
      empresa: String(x.empresa || x.carpeta || "").toUpperCase().replace(/^FACTURAS_/, "").slice(0, 60) || "SIN EMPRESA",
      codigo_tipo: String(x.codigo_tipo || "").slice(0, 3),
      tipo: x.tipo,
      letra: String(x.letra || "").slice(0, 2),
      signo,
      punto_venta: pv.padStart(4, "0").slice(-5),
      numero: nro.padStart(8, "0").slice(-10),
      fecha: x.fecha,
      cliente_cuit: String(x.cliente_cuit || "").replace(/\D/g, "").slice(0, 11) || null,
      cliente_nombre: x.cliente_nombre ? String(x.cliente_nombre).slice(0, 200) : null,
      remito: x.remito ? String(x.remito).slice(0, 20) : null,
      orden_compra: x.orden_compra ? String(x.orden_compra).slice(0, 100) : null,
      referencia: x.referencia ? String(x.referencia).slice(0, 20) : null,
      total: Number.isFinite(Number(x.total)) ? Number(x.total) : null,
      archivo: x.archivo ? String(x.archivo).slice(0, 255) : null,
      items,
    },
  };
}

/**
 * Informe puro.
 *  lineas: [{ codigo, descripcion, cantidad, signo }]  (ítems de facturas y notas de crédito del rango)
 *  productos: [{ codigo, nombre, costo, completo, sin_receta }]  (de Costos)
 */
function armarInforme(lineas, productos) {
  const exacto = new Map();
  const suelto = new Map();
  for (const p of productos) {
    if (!exacto.has(norm(p.codigo))) exacto.set(norm(p.codigo), p);
    if (!suelto.has(sinGuiones(p.codigo))) suelto.set(sinGuiones(p.codigo), p);
  }
  const porCodigo = new Map();
  for (const l of lineas) {
    if (!l.signo) continue;
    const k = norm(l.codigo);
    if (!k) continue;
    const a = porCodigo.get(k) || { codigo: String(l.codigo).trim(), descripcion: l.descripcion || "", unidades: 0 };
    a.unidades += l.signo * (Number(l.cantidad) || 0);
    if (!a.descripcion && l.descripcion) a.descripcion = l.descripcion;
    porCodigo.set(k, a);
  }
  const filas = [];
  for (const [k, a] of porCodigo) {
    const unidades = r2(a.unidades);
    if (Math.abs(unidades) < 1e-9) continue; // facturado y anulado del todo en el rango
    const p = exacto.get(k) || suelto.get(sinGuiones(k));
    let obs = "";
    let costo = null;
    if (!p) obs = "No está en productos terminados";
    else if (p.sin_receta) obs = "Sin receta";
    else {
      costo = p.costo;
      if (!p.completo) obs = `Costo incompleto (falta: ${(p.faltan || []).slice(0, 3).join(", ")}${(p.faltan || []).length > 3 ? "…" : ""})`;
    }
    filas.push({ codigo: a.codigo, producto: p?.codigo || null, descripcion: a.descripcion, unidades, costo_unitario: costo, costo_total: costo == null ? null : r2(costo * unidades), observacion: obs });
  }
  filas.sort((a, b) => (b.costo_total ?? -1) - (a.costo_total ?? -1) || b.unidades - a.unidades);
  return {
    filas,
    totales: {
      productos: filas.length,
      unidades: r2(filas.reduce((s, f) => s + f.unidades, 0)),
      costo_total: r2(filas.reduce((s, f) => s + (f.costo_total || 0), 0)),
      sin_costo: filas.filter((f) => f.costo_unitario == null).length,
      incompletos: filas.filter((f) => f.costo_unitario != null && f.observacion).length,
    },
  };
}

// ---------------------------------------------------------------- base de datos

async function asegurarTablasFacturas(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS facturas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa VARCHAR(60) NOT NULL,
    codigo_tipo VARCHAR(3) NULL,
    tipo VARCHAR(20) NOT NULL,
    letra VARCHAR(2) NULL,
    signo TINYINT NOT NULL,
    punto_venta VARCHAR(5) NOT NULL,
    numero VARCHAR(10) NOT NULL,
    fecha DATE NOT NULL,
    cliente_cuit VARCHAR(11) NULL,
    cliente_nombre VARCHAR(200) NULL,
    remito VARCHAR(20) NULL,
    orden_compra VARCHAR(100) NULL,
    referencia VARCHAR(20) NULL,
    total DOUBLE NULL,
    archivo VARCHAR(255) NULL,
    leida_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY comprobante (empresa, tipo, letra, punto_venta, numero),
    INDEX (fecha)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS factura_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    factura_id INT NOT NULL,
    codigo VARCHAR(100) NOT NULL,
    descripcion VARCHAR(255) NULL,
    unidad VARCHAR(20) NULL,
    cantidad DOUBLE NOT NULL,
    precio_unitario DOUBLE NULL,
    subtotal DOUBLE NULL,
    INDEX (factura_id),
    FOREIGN KEY (factura_id) REFERENCES facturas (id) ON DELETE CASCADE
  )`);
}

/** Guarda (o actualiza, si ya estaba) un lote de comprobantes. */
async function guardarLote(db, comprobantes) {
  const conn = await db.getConnection();
  let guardados = 0;
  const errores = [];
  try {
    await conn.beginTransaction();
    for (const [i, x] of comprobantes.entries()) {
      const v = validarComprobante(x);
      if (v.error) {
        errores.push({ i, archivo: x?.archivo || null, error: v.error });
        continue;
      }
      const c = v.c;
      await conn.query(
        `INSERT INTO facturas (empresa, codigo_tipo, tipo, letra, signo, punto_venta, numero, fecha, cliente_cuit, cliente_nombre, remito, orden_compra, referencia, total, archivo)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE codigo_tipo = VALUES(codigo_tipo), signo = VALUES(signo), fecha = VALUES(fecha), cliente_cuit = VALUES(cliente_cuit), cliente_nombre = VALUES(cliente_nombre),
           remito = VALUES(remito), orden_compra = VALUES(orden_compra), referencia = VALUES(referencia), total = VALUES(total), archivo = VALUES(archivo), id = LAST_INSERT_ID(id)`,
        [c.empresa, c.codigo_tipo, c.tipo, c.letra, c.signo, c.punto_venta, c.numero, c.fecha, c.cliente_cuit, c.cliente_nombre, c.remito, c.orden_compra, c.referencia, c.total, c.archivo],
      );
      const [[{ id }]] = await conn.query("SELECT LAST_INSERT_ID() AS id");
      await conn.query("DELETE FROM factura_items WHERE factura_id = ?", [id]);
      if (c.items.length) {
        await conn.query("INSERT INTO factura_items (factura_id, codigo, descripcion, unidad, cantidad, precio_unitario, subtotal) VALUES ?", [c.items.map((it) => [id, it.codigo, it.descripcion, it.unidad, it.cantidad, it.precio_unitario, it.subtotal])]);
      }
      guardados++;
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return { guardados, errores };
}

async function informe(db, desde, hasta) {
  const [lineas] = await db.query(
    `SELECT i.codigo, i.descripcion, i.cantidad, f.signo
       FROM factura_items i JOIN facturas f ON f.id = i.factura_id
      WHERE f.fecha BETWEEN ? AND ? AND f.signo <> 0`,
    [desde, hasta],
  );
  const [[cuenta]] = await db.query("SELECT SUM(tipo = 'FACTURA') AS facturas, SUM(tipo = 'NOTA_CREDITO') AS notas_credito FROM facturas WHERE fecha BETWEEN ? AND ?", [desde, hasta]);
  const [[ultima]] = await db.query("SELECT DATE_FORMAT(MAX(fecha), '%Y-%m-%d') AS fecha, MAX(leida_at) AS leida FROM facturas");
  const { productos } = await costosCompletos(db);
  return {
    desde,
    hasta,
    comprobantes: { facturas: Number(cuenta?.facturas) || 0, notas_credito: Number(cuenta?.notas_credito) || 0 },
    ultima_factura: ultima?.fecha || null,
    ultima_lectura: ultima?.leida || null,
    ...armarInforme(lineas, productos),
  };
}

function tokenValido(req) {
  const esperado = process.env.FACTURAS_TOKEN || "";
  const recibido = String(req.headers["x-facturas-token"] || "");
  if (esperado.length < 16 || recibido.length !== esperado.length) return false;
  return crypto.timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado));
}

function registrarRutasFacturas(app, { db, requirePermiso }) {
  // Lo usa el lector de la PC del trabajo (con su token, sin sesión de usuario).
  app.post("/api/public/facturas/lote", async (req, res) => {
    if (!tokenValido(req)) return res.status(401).json({ error: "Token inválido." });
    try {
      const lista = Array.isArray(req.body?.comprobantes) ? req.body.comprobantes.slice(0, 200) : [];
      if (!lista.length) return res.status(400).json({ error: "No llegaron comprobantes." });
      const r = await guardarLote(db, lista);
      if (r.errores.length) console.warn("[facturas] comprobantes rechazados:", JSON.stringify(r.errores).slice(0, 500));
      res.json(r);
    } catch (e) {
      console.error("[facturas]", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/informes/costo-vendido", requirePermiso(PERMISO), async (req, res) => {
    try {
      const { desde, hasta } = req.query;
      if (!fechaOk(desde) || !fechaOk(hasta) || desde > hasta) return res.status(400).json({ error: "Elegí un rango de fechas válido." });
      res.json(await informe(db, desde, hasta));
    } catch (e) {
      console.error("[facturas] informe:", e);
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { PERMISO, norm, validarComprobante, armarInforme, asegurarTablasFacturas, guardarLote, informe, registrarRutasFacturas };
