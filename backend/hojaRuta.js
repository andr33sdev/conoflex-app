"use strict";
const { ubicarEnSegundoPlano } = require("./hojaRutaMapa");
// Hoja de ruta: ventas carga los despachos pendientes (OP, cliente, día, dirección o transporte, prioridad 1 a 5, contacto y
// observaciones) y despacho/producción ve qué sale y cuándo. Cada despacho guarda qué usuario lo cargó.
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const TIPOS = ["ENTREGA", "TRANSPORTE", "RETIRA"];
const ESTADOS = ["PROGRAMADO", "DESPACHADO", "CANCELADO"];
const err = (status, mensaje) => Object.assign(new Error(mensaje), { status });
const limpiar = (v, max) => String(v ?? "").trim().slice(0, max);

async function asegurarTablaHojaRuta(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS hoja_ruta (
    id INT AUTO_INCREMENT PRIMARY KEY,
    op VARCHAR(40) NOT NULL,
    cliente VARCHAR(255) NOT NULL,
    fecha_despacho DATE NOT NULL,
    tipo_entrega VARCHAR(12) NOT NULL DEFAULT 'ENTREGA',
    direccion VARCHAR(300) NULL,
    transporte_nombre VARCHAR(150) NULL,
    prioridad TINYINT NOT NULL DEFAULT 3,
    contacto_nombre VARCHAR(150) NULL,
    contacto_telefono VARCHAR(60) NULL,
    observaciones TEXT NULL,
    articulos TEXT NULL,
    estado VARCHAR(12) NOT NULL DEFAULT 'PROGRAMADO',
    despachado_por VARCHAR(120) NULL,
    despachado_en DATETIME NULL,
    cancelado_motivo VARCHAR(255) NULL,
    creado_por_id INT NULL,
    creado_por VARCHAR(120) NULL,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_por VARCHAR(120) NULL,
    actualizado_en DATETIME NULL,
    KEY idx_fecha (fecha_despacho, estado),
    KEY idx_op (op)
  )`);
}

const normalizarOp = (op) => limpiar(op, 40).replace(/^OP[-\s]*/i, "").trim();

/** Valida y limpia lo que carga ventas. Devuelve los campos listos para guardar o lanza un error con el motivo. */
function validarDespacho(b = {}) {
  const op = normalizarOp(b.op);
  if (!op) throw err(400, "Poné el número de OP.");
  const cliente = limpiar(b.cliente, 255);
  if (!cliente) throw err(400, "Falta el cliente.");
  const fecha = String(b.fecha_despacho || "");
  if (!FECHA.test(fecha) || Number.isNaN(new Date(`${fecha}T12:00:00`).getTime())) throw err(400, "Elegí el día del despacho.");
  const tipo = String(b.tipo_entrega || "ENTREGA").toUpperCase();
  if (!TIPOS.includes(tipo)) throw err(400, "El tipo de entrega no es válido.");
  const direccion = limpiar(b.direccion, 300);
  const transporte = limpiar(b.transporte_nombre, 150);
  if (tipo === "ENTREGA" && !direccion) throw err(400, "Falta la dirección de entrega.");
  if (tipo === "TRANSPORTE") {
    if (!transporte) throw err(400, "Poné el nombre del transporte.");
    if (!direccion) throw err(400, "Poné la dirección del transporte.");
  }
  const prioridad = Number(b.prioridad ?? 3);
  if (!Number.isInteger(prioridad) || prioridad < 1 || prioridad > 5) throw err(400, "La prioridad va de 1 a 5.");
  let articulos = null;
  if (Array.isArray(b.articulos) && b.articulos.length) {
    articulos = JSON.stringify(b.articulos.slice(0, 60).map((a) => ({ modelo: limpiar(a.modelo, 200), cantidad: Number(a.cantidad) || 0 })).filter((a) => a.modelo));
  }
  return {
    op, cliente, fecha_despacho: fecha, tipo_entrega: tipo,
    direccion: tipo === "RETIRA" ? null : direccion || null,
    transporte_nombre: tipo === "TRANSPORTE" ? transporte : null,
    prioridad,
    contacto_nombre: limpiar(b.contacto_nombre, 150) || null,
    contacto_telefono: limpiar(b.contacto_telefono, 60) || null,
    observaciones: limpiar(b.observaciones, 2000) || null,
    articulos,
  };
}

const COLUMNAS = `id, op, cliente, DATE_FORMAT(fecha_despacho, '%Y-%m-%d') AS fecha_despacho, tipo_entrega, direccion, transporte_nombre, prioridad,
  contacto_nombre, contacto_telefono, observaciones, articulos, estado, despachado_por, DATE_FORMAT(despachado_en, '%Y-%m-%d %H:%i') AS despachado_en,
  cancelado_motivo, creado_por_id, creado_por, DATE_FORMAT(creado_en, '%Y-%m-%d %H:%i') AS creado_en, actualizado_por, DATE_FORMAT(actualizado_en, '%Y-%m-%d %H:%i') AS actualizado_en`;

const aFila = (r) => {
  let articulos = [];
  try { articulos = r.articulos ? JSON.parse(r.articulos) : []; } catch { articulos = []; }
  return { ...r, articulos };
};

const esAdmin = (u) => String(u?.rol || "").toUpperCase() === "ADMIN";
const puedeEditar = (fila, u) => esAdmin(u) || (fila.creado_por_id != null && Number(fila.creado_por_id) === Number(u?.id));

async function leer(db, id) {
  const [rows] = await db.query(`SELECT ${COLUMNAS} FROM hoja_ruta WHERE id = ?`, [id]);
  if (!rows.length) throw err(404, "Ese despacho no existe.");
  return rows[0];
}

/** Despachos entre dos fechas (inclusive). `estado`: PROGRAMADO | DESPACHADO | CANCELADO | TODOS. */
async function listarDespachos(db, { desde, hasta, estado = "TODOS", cargo = "" } = {}) {
  if (!FECHA.test(String(desde || "")) || !FECHA.test(String(hasta || ""))) throw err(400, "Elegí el rango de fechas.");
  if (hasta < desde) throw err(400, "El rango está al revés.");
  if ((new Date(`${hasta}T12:00:00`) - new Date(`${desde}T12:00:00`)) / 86400000 > 400) throw err(400, "El rango puede ser de hasta 13 meses.");
  const where = ["fecha_despacho BETWEEN ? AND ?"];
  const params = [desde, hasta];
  const est = String(estado || "TODOS").toUpperCase();
  if (ESTADOS.includes(est)) { where.push("estado = ?"); params.push(est); }
  else where.push("estado <> 'CANCELADO'"); // "todos" no incluye los cancelados
  if (cargo) { where.push("creado_por = ?"); params.push(String(cargo).slice(0, 120)); }
  const [rows] = await db.query(`SELECT ${COLUMNAS} FROM hoja_ruta WHERE ${where.join(" AND ")} ORDER BY fecha_despacho, prioridad DESC, id`, params);
  return rows.map(aFila);
}

async function crearDespacho(db, { datos, usuario }) {
  const d = validarDespacho(datos);
  const [r] = await db.query(
    `INSERT INTO hoja_ruta (op, cliente, fecha_despacho, tipo_entrega, direccion, transporte_nombre, prioridad, contacto_nombre, contacto_telefono, observaciones, articulos, creado_por_id, creado_por)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [d.op, d.cliente, d.fecha_despacho, d.tipo_entrega, d.direccion, d.transporte_nombre, d.prioridad, d.contacto_nombre, d.contacto_telefono, d.observaciones, d.articulos, usuario?.id ?? null, limpiar(usuario?.nombre, 120) || null],
  );
  if (d.tipo_entrega !== "RETIRA") ubicarEnSegundoPlano(db, d.direccion);
  return aFila(await leer(db, r.insertId));
}

/** Edita un despacho (solo quien lo cargó o un administrador). Un despacho ya hecho o cancelado no se edita. */
async function editarDespacho(db, { id, datos, usuario }) {
  const f = await leer(db, id);
  if (!puedeEditar(f, usuario)) throw err(403, `Solo ${f.creado_por || "quien lo cargó"} o un administrador puede modificar este despacho.`);
  if (f.estado !== "PROGRAMADO") throw err(409, "Este despacho ya no está programado: reabrilo para modificarlo.");
  const d = validarDespacho({ ...datos, articulos: datos?.articulos ?? aFila(f).articulos });
  await db.query(
    `UPDATE hoja_ruta SET op=?, cliente=?, fecha_despacho=?, tipo_entrega=?, direccion=?, transporte_nombre=?, prioridad=?, contacto_nombre=?, contacto_telefono=?, observaciones=?, articulos=?, actualizado_por=?, actualizado_en=NOW() WHERE id=?`,
    [d.op, d.cliente, d.fecha_despacho, d.tipo_entrega, d.direccion, d.transporte_nombre, d.prioridad, d.contacto_nombre, d.contacto_telefono, d.observaciones, d.articulos, limpiar(usuario?.nombre, 120) || null, id],
  );
  if (d.tipo_entrega !== "RETIRA") ubicarEnSegundoPlano(db, d.direccion);
  return aFila(await leer(db, id));
}

/**
 * Cambia el estado. Marcar como despachado (o reabrir) lo puede hacer cualquiera con acceso al módulo;
 * cancelar, solo quien lo cargó o un administrador (y con motivo).
 */
async function cambiarEstado(db, { id, estado, motivo, usuario }) {
  estado = String(estado || "").toUpperCase();
  if (!ESTADOS.includes(estado)) throw err(400, "El estado no es válido.");
  const f = await leer(db, id);
  if (f.estado === estado) return aFila(f);
  const nombre = limpiar(usuario?.nombre, 120) || null;
  if (estado === "CANCELADO") {
    if (!puedeEditar(f, usuario)) throw err(403, `Solo ${f.creado_por || "quien lo cargó"} o un administrador puede cancelar este despacho.`);
    const m = limpiar(motivo, 255);
    if (!m) throw err(400, "Poné por qué se cancela.");
    await db.query("UPDATE hoja_ruta SET estado='CANCELADO', cancelado_motivo=?, actualizado_por=?, actualizado_en=NOW() WHERE id=?", [m, nombre, id]);
  } else if (estado === "DESPACHADO") {
    if (f.estado === "CANCELADO") throw err(409, "Está cancelado: reabrilo primero.");
    await db.query("UPDATE hoja_ruta SET estado='DESPACHADO', despachado_por=?, despachado_en=NOW(), actualizado_por=?, actualizado_en=NOW() WHERE id=?", [nombre, nombre, id]);
  } else {
    if (f.estado === "CANCELADO" && !puedeEditar(f, usuario)) throw err(403, "Solo quien lo cargó o un administrador puede reabrir un despacho cancelado.");
    await db.query("UPDATE hoja_ruta SET estado='PROGRAMADO', despachado_por=NULL, despachado_en=NULL, cancelado_motivo=NULL, actualizado_por=?, actualizado_en=NOW() WHERE id=?", [nombre, id]);
  }
  return aFila(await leer(db, id));
}

/** Datos de una OP (de la planilla de ventas) para completar el cliente y mostrar qué lleva, y si ya tiene despachos cargados. */
async function buscarOp(db, opTexto) {
  const op = normalizarOp(opTexto);
  if (!op) throw err(400, "Poné el número de OP.");
  let articulos = [];
  let cliente = null;
  let fechaOp = null;
  try {
    const [rows] = await db.query("SELECT cliente, modelo, detalles, cantidad, fecha FROM estado_pedidos WHERE op = ? OR op = ? ORDER BY fecha DESC, id DESC", [op, `OP-${op}`]);
    if (rows.length) {
      const masReciente = new Date(rows[0].fecha).getTime();
      const vigentes = rows.filter((r) => !r.fecha || new Date(r.fecha).getTime() === masReciente);
      cliente = vigentes[0].cliente || null;
      fechaOp = vigentes[0].fecha ? new Date(vigentes[0].fecha).toISOString().slice(0, 10) : null;
      articulos = vigentes.map((r) => ({ modelo: r.modelo || r.detalles || "Artículo sin especificar", cantidad: Number(r.cantidad) || 0 }));
    }
  } catch {
    /* sin planilla de ventas: se carga a mano */
  }
  const [ya] = await db.query(`SELECT id, DATE_FORMAT(fecha_despacho, '%Y-%m-%d') AS fecha_despacho, estado, creado_por FROM hoja_ruta WHERE op = ? AND estado <> 'CANCELADO' ORDER BY fecha_despacho`, [op]);
  return { op, encontrada: !!cliente, cliente, fecha_op: fechaOp, articulos, ya_cargados: ya };
}

// Un pedido está sin despachar cuando su "despacho" en la planilla de ventas está vacío (misma regla que Despachar Pedidos).
const SIN_DESPACHO = "(despacho IS NULL OR TRIM(despacho) = '' OR TRIM(despacho) = '-' OR UPPER(despacho) LIKE '%SIN DESPACHAR%')";
const NO_CANCELADO = "(estado IS NULL OR UPPER(TRIM(estado)) NOT LIKE 'CANCELAD%')";

/**
 * Clientes con pedidos sin despachar (según estado_pedidos) y sus OP. Se busca por cliente, no por OP.
 * Por cada OP solo cuentan sus renglones sin despachar, de la versión más reciente de la OP.
 * `exacto`: el nombre completo del cliente (para traer sus OP después de elegirlo).
 */
async function pedidosPendientes(db, { q = "", exacto = false } = {}) {
  const texto = limpiar(q, 120).toLowerCase();
  if (texto.length < 2) return [];
  let rows;
  try {
    [rows] = await db.query(
      `SELECT op, cliente, modelo, detalles, cantidad, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha
         FROM estado_pedidos
        WHERE ${exacto ? "LOWER(TRIM(cliente)) = ?" : "LOWER(cliente) LIKE ?"} AND ${SIN_DESPACHO} AND ${NO_CANCELADO}
          AND op IS NOT NULL AND TRIM(op) <> ''
        ORDER BY fecha DESC, id DESC LIMIT 800`,
      [exacto ? texto : `%${texto.replace(/[%_]/g, "")}%`],
    );
  } catch { return []; } // sin planilla de ventas
  if (!rows.length) return [];
  // La versión vigente de cada OP: la de fecha más reciente (las anteriores son de OP viejas con el mismo número).
  const opsCrudas = [...new Set(rows.map((r) => r.op))];
  const [vigentes] = await db.query("SELECT op, DATE_FORMAT(MAX(fecha), '%Y-%m-%d') AS mx FROM estado_pedidos WHERE op IN (?) GROUP BY op", [opsCrudas]);
  const mx = Object.fromEntries(vigentes.map((v) => [v.op, v.mx]));
  const clientes = new Map();
  for (const r of rows) {
    if (mx[r.op] && r.fecha && r.fecha !== mx[r.op]) continue;
    const k = r.cliente.trim().toLowerCase();
    if (!clientes.has(k)) clientes.set(k, { cliente: r.cliente.trim(), ops: new Map() });
    const ops = clientes.get(k).ops;
    const num = normalizarOp(r.op);
    if (!ops.has(num)) ops.set(num, { op: num, fecha: r.fecha, articulos: [] });
    ops.get(num).articulos.push({ modelo: r.modelo || r.detalles || "Artículo sin especificar", cantidad: Number(r.cantidad) || 0 });
  }
  const lista = [...clientes.values()].sort((a, b) => a.cliente.localeCompare(b.cliente, "es")).slice(0, exacto ? 1 : 8)
    .map((c) => ({ cliente: c.cliente, ops: [...c.ops.values()].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 40) }));
  const todas = lista.flatMap((c) => c.ops.map((o) => o.op));
  if (todas.length) {
    const [ya] = await db.query(`SELECT op, DATE_FORMAT(fecha_despacho, '%Y-%m-%d') AS fecha_despacho, estado, creado_por FROM hoja_ruta WHERE op IN (?) AND estado <> 'CANCELADO' ORDER BY fecha_despacho`, [todas]);
    for (const c of lista) for (const o of c.ops) o.ya = ya.filter((y) => y.op === o.op).map(({ fecha_despacho, estado, creado_por }) => ({ fecha_despacho, estado, creado_por }));
  }
  return lista;
}

/** Quiénes cargaron despachos (para el filtro "cargó"). */
async function quienesCargaron(db) {
  const [rows] = await db.query("SELECT DISTINCT creado_por FROM hoja_ruta WHERE creado_por IS NOT NULL AND creado_por <> '' ORDER BY creado_por");
  return rows.map((r) => r.creado_por);
}

function registrarRutasHojaRuta(app, db, requirePermiso) {
  const acceso = requirePermiso("hoja-de-ruta");
  const quien = async (req) => {
    const [r] = await db.query("SELECT id, nombre, rol FROM usuarios WHERE id = ?", [req.user?.id]);
    return r[0] || { id: req.user?.id, nombre: null, rol: null };
  };
  const salir = (res, error) => {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error("Error en la hoja de ruta:", error);
    return res.status(500).json({ error: "No se pudo completar la operación." });
  };
  app.get("/api/hoja-ruta", acceso, async (req, res) => {
    try {
      res.json({ despachos: await listarDespachos(db, { desde: req.query.desde, hasta: req.query.hasta, estado: req.query.estado, cargo: req.query.cargo }), cargadores: await quienesCargaron(db) });
    } catch (e) { salir(res, e); }
  });
  app.get("/api/hoja-ruta/pendientes", acceso, async (req, res) => {
    try { res.json({ clientes: await pedidosPendientes(db, { q: req.query.q, exacto: req.query.exacto === "1" }) }); } catch (e) { salir(res, e); }
  });
  app.get("/api/hoja-ruta/op/:op", acceso, async (req, res) => {
    try { res.json(await buscarOp(db, req.params.op)); } catch (e) { salir(res, e); }
  });
  app.post("/api/hoja-ruta", acceso, async (req, res) => {
    try { res.json(await crearDespacho(db, { datos: req.body, usuario: await quien(req) })); } catch (e) { salir(res, e); }
  });
  app.put("/api/hoja-ruta/:id", acceso, async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    try { res.json(await editarDespacho(db, { id: Number(req.params.id), datos: req.body, usuario: await quien(req) })); } catch (e) { salir(res, e); }
  });
  app.post("/api/hoja-ruta/:id/estado", acceso, async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    try { res.json(await cambiarEstado(db, { id: Number(req.params.id), estado: req.body?.estado, motivo: req.body?.motivo, usuario: await quien(req) })); } catch (e) { salir(res, e); }
  });
}

module.exports = { pedidosPendientes, asegurarTablaHojaRuta, validarDespacho, normalizarOp, listarDespachos, crearDespacho, editarDespacho, cambiarEstado, buscarOp, quienesCargaron, registrarRutasHojaRuta, TIPOS, ESTADOS };
