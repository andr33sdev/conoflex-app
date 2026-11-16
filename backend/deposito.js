"use strict";
// Módulo Depósito: la gente de depósito busca una OP y la marca como ARMADA o DESPACHADA, desde la app (reemplaza las
// columnas PREPARADO / DESPACHO de la planilla).
//
// - Los pedidos salen de estado_pedidos (que se recarga entera desde la planilla de ventas). Por eso las marcas viven
//   aparte, en deposito_pedidos, con clave OP + fecha del pedido, y después de cada sincronización se vuelven a escribir
//   en estado_pedidos (preparado / despacho) para que el resto de la app (hoja de ruta, pendientes) las vea.
// - Armar: no descuenta nada; los semielaborados del pedido quedan COMPROMETIDOS hasta que se despacha.
// - Despachar: descuenta del stock del 33 los semielaborados de cada ítem (receta activa del producto terminado) y deja
//   el detalle guardado para poder deshacerlo.
// - Si en la planilla ya figuraba preparado/despachado y la app no tiene marca, se muestra lo de la planilla.

const PERMISO = "deposito";
const MESES = 6;
const POR_PAGINA_MAX = 100;

const texto = (v, max = 255) => (v == null ? "" : String(v).trim().slice(0, max));
const normalizarOp = (op) => texto(op, 60).replace(/^OP[-\s]*/i, "").trim();
const isoDe = (v) => {
  if (!v) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  return String(v).slice(0, 10);
};
const fechaValida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const fechaPlanilla = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

/** ¿El valor de la planilla dice que se hizo? ("-", vacío, "SIN PREPARAR", "SIN DESPACHAR", "no" → no). */
function hechoEnPlanilla(v) {
  const t = texto(v).toUpperCase();
  return !!t && t !== "-" && t !== "NO" && !t.includes("SIN ");
}

async function asegurarTablasDeposito(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS deposito_pedidos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    op VARCHAR(60) NOT NULL,
    fecha_pedido DATE NOT NULL,
    armado_at DATETIME NULL,
    armado_por VARCHAR(120) NULL,
    despachado_at DATETIME NULL,
    despachado_por VARCHAR(120) NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_op_fecha (op, fecha_pedido)
  )`);
  // Lo que se descontó del 33 en cada despacho (para mostrarlo y poder deshacerlo).
  await db.query(`CREATE TABLE IF NOT EXISTS deposito_descuentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id INT NOT NULL,
    semielaborado_id INT NOT NULL,
    cantidad DOUBLE NOT NULL,
    stock_antes DOUBLE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_pedido (pedido_id),
    KEY idx_semi (semielaborado_id)
  )`);
}

// ---------- lógica pura ----------

/** Agrupa los renglones de estado_pedidos por OP + fecha y les pone el estado (app primero, planilla si no hay marca). */
function agruparPedidos(renglones, marcas) {
  const porClave = new Map();
  for (const r of renglones) {
    const op = normalizarOp(r.op);
    const fecha = isoDe(r.fecha);
    if (!op || !fecha) continue;
    const k = `${op}|${fecha}`;
    if (!porClave.has(k)) porClave.set(k, { op, fecha, cliente: texto(r.cliente), vendedor: texto(r.vendedor), estado_planilla: texto(r.estado, 60), items: [], planilla_armado: false, planilla_despachado: false, planilla_preparado_txt: "", planilla_despacho_txt: "" });
    const p = porClave.get(k);
    p.items.push({ modelo: texto(r.modelo), detalles: texto(r.detalles, 500), cantidad: Number(r.cantidad) || 0 });
    if (hechoEnPlanilla(r.preparado)) {
      p.planilla_armado = true;
      p.planilla_preparado_txt = texto(r.preparado, 40);
    }
    if (hechoEnPlanilla(r.despacho) || /^s[ií]$/i.test(texto(r.despachado))) {
      p.planilla_despachado = true;
      p.planilla_despacho_txt = hechoEnPlanilla(r.despacho) ? texto(r.despacho, 40) : "Sí";
    }
  }
  const lista = [];
  for (const p of porClave.values()) {
    const m = marcas.get(`${p.op}|${p.fecha}`);
    const armadoApp = m?.armado_at || null;
    const despachadoApp = m?.despachado_at || null;
    const despachado = !!despachadoApp || p.planilla_despachado;
    const armado = despachado || !!armadoApp || p.planilla_armado;
    lista.push({
      op: p.op,
      fecha: p.fecha,
      cliente: p.cliente,
      vendedor: p.vendedor,
      estado_planilla: p.estado_planilla,
      items: p.items.length,
      unidades: p.items.reduce((a, i) => a + i.cantidad, 0),
      resumen: p.items.slice(0, 3).map((i) => i.modelo).join(", ") + (p.items.length > 3 ? ` y ${p.items.length - 3} más` : ""),
      armado,
      despachado,
      armado_at: armadoApp,
      armado_por: m?.armado_por || null,
      despachado_at: despachadoApp,
      despachado_por: m?.despachado_por || null,
      armado_txt: armadoApp ? null : p.planilla_armado ? p.planilla_preparado_txt : null,
      despachado_txt: despachadoApp ? null : p.planilla_despachado ? p.planilla_despacho_txt : null,
      // Se despachó en la planilla (no desde la app): su stock ya se descontó allá.
      despachado_en_planilla: !despachadoApp && p.planilla_despachado,
      etapa: despachado ? "DESPACHADO" : armado ? "ARMADO" : "PENDIENTE",
    });
  }
  lista.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : String(b.op).localeCompare(String(a.op), "es", { numeric: true })));
  return lista;
}

/** Filtra, cuenta y pagina. */
function filtrarPedidos(lista, { q = "", etapa = "TODOS", pagina = 1, porPagina = 25 } = {}) {
  const t = texto(q, 80).toLowerCase().replace(/^op[-\s]*/i, "");
  const conBusqueda = t ? lista.filter((p) => p.op.toLowerCase().includes(t) || p.cliente.toLowerCase().includes(t)) : lista;
  const cuentas = { TODOS: conBusqueda.length, PENDIENTE: 0, ARMADO: 0, DESPACHADO: 0 };
  for (const p of conBusqueda) cuentas[p.etapa]++;
  const filtrada = etapa && etapa !== "TODOS" ? conBusqueda.filter((p) => p.etapa === etapa) : conBusqueda;
  const pp = Math.min(POR_PAGINA_MAX, Math.max(5, Number(porPagina) || 25));
  const paginas = Math.max(1, Math.ceil(filtrada.length / pp));
  const pag = Math.min(paginas, Math.max(1, Number(pagina) || 1));
  return { pedidos: filtrada.slice((pag - 1) * pp, pag * pp), total: filtrada.length, pagina: pag, paginas, por_pagina: pp, cuentas };
}

/**
 * Semielaborados que lleva un pedido según la receta activa de cada producto terminado.
 * recetas: Map(MODELO en mayúsculas → [{ semielaborado_id, codigo, nombre, cantidad, stock_33 }]).
 */
function semisDelPedido(items, recetas) {
  const total = new Map();
  const sinReceta = [];
  for (const it of items) {
    const r = recetas.get(texto(it.modelo).toUpperCase());
    if (!r || !r.length) {
      sinReceta.push(it.modelo);
      continue;
    }
    for (const s of r) {
      const prev = total.get(s.semielaborado_id) || { semielaborado_id: s.semielaborado_id, codigo: s.codigo, nombre: s.nombre, stock_33: Number(s.stock_33) || 0, cantidad: 0, por: [] };
      const c = (Number(s.cantidad) || 0) * (Number(it.cantidad) || 0);
      prev.cantidad += c;
      prev.por.push({ modelo: it.modelo, cantidad: c });
      total.set(s.semielaborado_id, prev);
    }
  }
  const semis = [...total.values()].map((s) => ({ ...s, cantidad: Math.round(s.cantidad * 1000) / 1000, queda: Math.round((s.stock_33 - s.cantidad) * 1000) / 1000 }));
  semis.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true }));
  return { semis, sin_receta: [...new Set(sinReceta)] };
}

// ---------- acceso a datos ----------

async function marcasPorClave(db) {
  const [rows] = await db.query("SELECT id, op, DATE_FORMAT(fecha_pedido, '%Y-%m-%d') AS fecha, armado_at, armado_por, despachado_at, despachado_por FROM deposito_pedidos");
  return new Map(rows.map((m) => [`${m.op}|${m.fecha}`, m]));
}

async function renglonesDesde(db, desde) {
  const [rows] = await db.query(
    "SELECT op, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, cliente, vendedor, modelo, detalles, cantidad, estado, preparado, despacho, despachado FROM estado_pedidos WHERE fecha >= ? ORDER BY fecha DESC, id ASC",
    [desde],
  );
  return rows;
}

async function renglonesDePedido(db, op, fecha) {
  const [rows] = await db.query(
    "SELECT op, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, cliente, vendedor, modelo, detalles, cantidad, estado, preparado, despacho, despachado FROM estado_pedidos WHERE (op = ? OR op = ? OR op = ?) AND fecha = ? ORDER BY id ASC",
    [op, `OP-${op}`, `OP ${op}`, fecha],
  );
  return rows;
}

/** Recetas activas de los productos terminados (solo sus semielaborados). */
async function recetasActivas(db, modelos) {
  const nombres = [...new Set(modelos.map((m) => texto(m).toUpperCase()).filter(Boolean))];
  const recetas = new Map();
  if (!nombres.length) return recetas;
  const [rows] = await db.query(
    `SELECT UPPER(TRIM(pt.codigo)) AS modelo, i.id AS ingenieria_id, d.semielaborado_id, s.codigo, s.nombre, s.stock_33, d.cantidad
       FROM productos_terminados pt
       JOIN ingenierias i ON i.producto_terminado_id = pt.id AND i.es_activa = 1
       JOIN ingenieria_detalles d ON d.ingenieria_id = i.id AND d.semielaborado_id IS NOT NULL
       JOIN semielaborados s ON s.id = d.semielaborado_id
      WHERE UPPER(TRIM(pt.codigo)) IN (?)
      ORDER BY i.id DESC`,
    [nombres],
  );
  // Si un producto tuviera más de una receta activa, vale la más nueva.
  const elegida = new Map();
  for (const r of rows) {
    if (!elegida.has(r.modelo)) elegida.set(r.modelo, r.ingenieria_id);
    if (elegida.get(r.modelo) !== r.ingenieria_id) continue;
    if (!recetas.has(r.modelo)) recetas.set(r.modelo, []);
    recetas.get(r.modelo).push(r);
  }
  return recetas;
}

/** Desde cuándo se muestran pedidos (hoy menos 6 meses). */
function desdeSeisMeses(hoy = new Date()) {
  const d = new Date(hoy.getFullYear(), hoy.getMonth() - MESES, hoy.getDate());
  return isoDe(d);
}

/** Pedidos armados y no despachados (app o planilla) de los últimos 6 meses. */
async function pedidosArmados(db) {
  const lista = agruparPedidos(await renglonesDesde(db, desdeSeisMeses()), await marcasPorClave(db));
  return lista.filter((p) => p.etapa === "ARMADO");
}

/** Comprometido en el 33 por semielaborado: Map(id → { cantidad, pedidos: [{op, fecha, cliente, cantidad}] }). */
async function comprometidos(db) {
  const armados = await pedidosArmados(db);
  const res = new Map();
  if (!armados.length) return res;
  const renglones = await renglonesDesde(db, armados.reduce((m, p) => (p.fecha < m ? p.fecha : m), armados[0].fecha));
  const porClave = new Map();
  for (const r of renglones) {
    const k = `${normalizarOp(r.op)}|${r.fecha}`;
    if (!porClave.has(k)) porClave.set(k, []);
    porClave.get(k).push(r);
  }
  const recetas = await recetasActivas(db, renglones.map((r) => r.modelo));
  for (const p of armados) {
    const renglonesPedido = porClave.get(`${p.op}|${p.fecha}`) || [];
    const { semis } = semisDelPedido(renglonesPedido, recetas);
    for (const s of semis) {
      const c = res.get(s.semielaborado_id) || { cantidad: 0, pedidos: [] };
      c.cantidad += s.cantidad;
      c.pedidos.push({
        op: p.op,
        fecha: p.fecha,
        cliente: p.cliente,
        cantidad: s.cantidad,
        armado_at: p.armado_at,
        armado_por: p.armado_por,
        armado_txt: p.armado_txt,
        // de qué artículos sale lo comprometido, y el pedido completo
        por: s.por,
        items: renglonesPedido.map((r) => ({ modelo: r.modelo, detalles: r.detalles, cantidad: Number(r.cantidad) || 0 })),
      });
      res.set(s.semielaborado_id, c);
    }
  }
  return res;
}

/** Vuelve a escribir en estado_pedidos las marcas de la app (se pierden con cada sincronización de la planilla). */
async function aplicarMarcasEnPedidos(db) {
  const [marcas] = await db.query("SELECT op, DATE_FORMAT(fecha_pedido, '%Y-%m-%d') AS fecha, armado_at, despachado_at FROM deposito_pedidos WHERE armado_at IS NOT NULL OR despachado_at IS NOT NULL");
  for (const m of marcas) await escribirEnPedidos(db, m.op, m.fecha, m);
  return marcas.length;
}

async function escribirEnPedidos(db, op, fecha, { armado_at, despachado_at }) {
  const prep = armado_at ? fechaPlanilla(new Date(armado_at)) : despachado_at ? fechaPlanilla(new Date(despachado_at)) : null;
  const desp = despachado_at ? fechaPlanilla(new Date(despachado_at)) : null;
  const sets = [];
  const vals = [];
  if (prep) {
    sets.push("preparado = ?");
    vals.push(prep);
  }
  if (desp) {
    sets.push("despacho = ?", "despachado = 'si'");
    vals.push(desp);
  }
  if (!sets.length) return;
  await db.query(`UPDATE estado_pedidos SET ${sets.join(", ")} WHERE (op = ? OR op = ? OR op = ?) AND fecha = ?`, [...vals, op, `OP-${op}`, `OP ${op}`, fecha]);
}

// ---------- sincronización automática del 33 (activar / desactivar) ----------
const CLAVE_ESPEJO = "stock33_espejo_activo";

async function espejoActivo(db) {
  try {
    const [[r]] = await db.query("SELECT valor FROM reglas WHERE clave = ?", [CLAVE_ESPEJO]);
    return r ? String(r.valor) !== "0" : true;
  } catch {
    return true;
  }
}

async function cambiarEspejo(db, activo) {
  await db.query("INSERT INTO reglas (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [CLAVE_ESPEJO, activo ? "1" : "0"]);
}

// ---------- rutas ----------

function registrarRutasDeposito(app, { db, requirePermiso, estadoEspejo, sincronizarPedidos }) {
  const err = (res, e) => {
    if (!e.status) console.error("[deposito]", e);
    res.status(e.status || 500).json({ error: e.status ? e.message : "No se pudo completar la acción." });
  };
  const falla = (status, message) => Object.assign(new Error(message), { status });
  const quien = async (req) => {
    const [[u]] = await db.query("SELECT nombre FROM usuarios WHERE id = ?", [req.user?.id]);
    return texto(u?.nombre, 120) || "Alguien";
  };
  const esAdmin = async (req) => {
    const [[u]] = await db.query("SELECT rol FROM usuarios WHERE id = ?", [req.user?.id]);
    return String(u?.rol || "").toUpperCase() === "ADMIN";
  };

  app.get("/api/deposito/pedidos", requirePermiso(PERMISO), async (req, res) => {
    try {
      const lista = agruparPedidos(await renglonesDesde(db, desdeSeisMeses()), await marcasPorClave(db));
      const [[s]] = await db.query("SELECT valor FROM reglas WHERE clave = 'ultima_sincronizacion_pedidos'").catch(() => [[null]]);
      res.json({ ...filtrarPedidos(lista, { q: req.query.q, etapa: String(req.query.etapa || "TODOS").toUpperCase(), pagina: req.query.pagina, porPagina: req.query.por_pagina }), desde: desdeSeisMeses(), ultima_sincronizacion: s?.valor || null });
    } catch (e) {
      err(res, e);
    }
  });

  app.get("/api/deposito/pedidos/:op/:fecha", requirePermiso(PERMISO), async (req, res) => {
    try {
      const op = normalizarOp(req.params.op);
      if (!op || !fechaValida(req.params.fecha)) throw falla(400, "Pedido inválido.");
      const renglones = await renglonesDePedido(db, op, req.params.fecha);
      if (!renglones.length) throw falla(404, "No encontré esa OP. Probá actualizar los pedidos.");
      const marcas = await marcasPorClave(db);
      const [pedido] = agruparPedidos(renglones, marcas);
      const recetas = await recetasActivas(db, renglones.map((r) => r.modelo));
      const { semis, sin_receta } = semisDelPedido(renglones, recetas);
      let descontado = [];
      const m = marcas.get(`${op}|${req.params.fecha}`);
      if (m?.despachado_at) {
        const [d] = await db.query("SELECT d.semielaborado_id, s.codigo, s.nombre, d.cantidad, d.stock_antes FROM deposito_descuentos d JOIN semielaborados s ON s.id = d.semielaborado_id WHERE d.pedido_id = ? ORDER BY s.codigo", [m.id]);
        descontado = d;
      }
      res.json({ pedido, items: renglones.map((r) => ({ modelo: r.modelo, detalles: r.detalles, cantidad: Number(r.cantidad) || 0, tiene_receta: recetas.has(texto(r.modelo).toUpperCase()) })), semis, sin_receta, descontado, espejo_activo: await espejoActivo(db) });
    } catch (e) {
      err(res, e);
    }
  });

  async function marcar(req, accion) {
    const op = normalizarOp(req.params.op);
    const fecha = req.params.fecha;
    if (!op || !fechaValida(fecha)) throw falla(400, "Pedido inválido.");
    const renglones = await renglonesDePedido(db, op, fecha);
    if (!renglones.length) throw falla(404, "No encontré esa OP. Probá actualizar los pedidos.");
    const nombre = await quien(req);
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("INSERT IGNORE INTO deposito_pedidos (op, fecha_pedido) VALUES (?, ?)", [op, fecha]);
      const [[m]] = await conn.query("SELECT * FROM deposito_pedidos WHERE op = ? AND fecha_pedido = ? FOR UPDATE", [op, fecha]);
      const [p] = agruparPedidos(renglones, new Map());
      let descontados = [];
      if (accion === "armar") {
        if (m.despachado_at) throw falla(409, "Ese pedido ya está despachado.");
        if (m.armado_at) throw falla(409, `Ya lo armó ${m.armado_por || "alguien"}.`);
        if (p.despachado_en_planilla) throw falla(409, "Ese pedido ya figura despachado en la planilla.");
        await conn.query("UPDATE deposito_pedidos SET armado_at = NOW(), armado_por = ? WHERE id = ?", [nombre, m.id]);
      } else if (accion === "despachar") {
        if (m.despachado_at) throw falla(409, `Ya lo despachó ${m.despachado_por || "alguien"}.`);
        if (p.despachado_en_planilla) throw falla(409, "Ese pedido ya figura despachado en la planilla: su stock ya se descontó allá.");
        const recetas = await recetasActivas(conn, renglones.map((r) => r.modelo));
        const { semis } = semisDelPedido(renglones, recetas);
        for (const s of semis) {
          if (!(s.cantidad > 0)) continue;
          const [[actual]] = await conn.query("SELECT stock_33 FROM semielaborados WHERE id = ? FOR UPDATE", [s.semielaborado_id]);
          const antes = Number(actual?.stock_33) || 0;
          const despues = Math.round((antes - s.cantidad) * 1000) / 1000;
          await conn.query("UPDATE semielaborados SET stock_33 = ? WHERE id = ?", [despues, s.semielaborado_id]);
          await conn.query("INSERT INTO deposito_descuentos (pedido_id, semielaborado_id, cantidad, stock_antes) VALUES (?, ?, ?, ?)", [m.id, s.semielaborado_id, s.cantidad, antes]);
          await conn.query("INSERT INTO semi_ajustes (semielaborado_id, deposito, antes, despues, delta, nota, usuario) VALUES (?, '33', ?, ?, ?, ?, ?)", [s.semielaborado_id, antes, despues, -s.cantidad, `Despacho OP ${op}`, nombre]).catch(() => {});
          descontados.push({ codigo: s.codigo, cantidad: s.cantidad, queda: despues });
        }
        // Si se despacha sin haberlo armado antes en la app, queda armado en el mismo momento.
        await conn.query("UPDATE deposito_pedidos SET despachado_at = NOW(), despachado_por = ?, armado_at = COALESCE(armado_at, NOW()), armado_por = COALESCE(armado_por, ?) WHERE id = ?", [nombre, nombre, m.id]);
      }
      await conn.commit();
      const [[nuevo]] = await db.query("SELECT armado_at, despachado_at FROM deposito_pedidos WHERE id = ?", [m.id]);
      await escribirEnPedidos(db, op, fecha, nuevo).catch((e) => console.error("[deposito] no se pudo escribir en estado_pedidos:", e.message));
      return { ok: true, descontados };
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  app.post("/api/deposito/pedidos/:op/:fecha/armar", requirePermiso(PERMISO), async (req, res) => {
    try {
      res.json(await marcar(req, "armar"));
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/deposito/pedidos/:op/:fecha/despachar", requirePermiso(PERMISO), async (req, res) => {
    try {
      res.json(await marcar(req, "despachar"));
    } catch (e) {
      err(res, e);
    }
  });

  // Deshacer (por si se tocó el botón equivocado): despacho → devuelve el stock; armado → vuelve a pendiente.
  app.post("/api/deposito/pedidos/:op/:fecha/deshacer", requirePermiso(PERMISO), async (req, res) => {
    const op = normalizarOp(req.params.op);
    const fecha = req.params.fecha;
    const conn = await db.getConnection();
    try {
      if (!op || !fechaValida(fecha)) throw falla(400, "Pedido inválido.");
      await conn.beginTransaction();
      const [[m]] = await conn.query("SELECT * FROM deposito_pedidos WHERE op = ? AND fecha_pedido = ? FOR UPDATE", [op, fecha]);
      if (!m || (!m.armado_at && !m.despachado_at)) throw falla(409, "Ese pedido no tiene nada marcado desde la app.");
      const nombre = await quien(req);
      let paso;
      if (m.despachado_at) {
        const [d] = await conn.query("SELECT * FROM deposito_descuentos WHERE pedido_id = ?", [m.id]);
        for (const x of d) {
          const [[actual]] = await conn.query("SELECT stock_33 FROM semielaborados WHERE id = ? FOR UPDATE", [x.semielaborado_id]);
          const antes = Number(actual?.stock_33) || 0;
          const despues = Math.round((antes + Number(x.cantidad)) * 1000) / 1000;
          await conn.query("UPDATE semielaborados SET stock_33 = ? WHERE id = ?", [despues, x.semielaborado_id]);
          await conn.query("INSERT INTO semi_ajustes (semielaborado_id, deposito, antes, despues, delta, nota, usuario) VALUES (?, '33', ?, ?, ?, ?, ?)", [x.semielaborado_id, antes, despues, Number(x.cantidad), `Deshacer despacho OP ${op}`, nombre]).catch(() => {});
        }
        await conn.query("DELETE FROM deposito_descuentos WHERE pedido_id = ?", [m.id]);
        await conn.query("UPDATE deposito_pedidos SET despachado_at = NULL, despachado_por = NULL WHERE id = ?", [m.id]);
        paso = "despacho";
      } else {
        await conn.query("UPDATE deposito_pedidos SET armado_at = NULL, armado_por = NULL WHERE id = ?", [m.id]);
        paso = "armado";
      }
      await conn.commit();
      // estado_pedidos se corrige con la próxima sincronización; mientras tanto se limpia lo que escribió la app.
      if (paso === "despacho") await db.query("UPDATE estado_pedidos SET despacho = '-', despachado = 'no' WHERE (op = ? OR op = ? OR op = ?) AND fecha = ?", [op, `OP-${op}`, `OP ${op}`, fecha]).catch(() => {});
      else await db.query("UPDATE estado_pedidos SET preparado = '-' WHERE (op = ? OR op = ? OR op = ?) AND fecha = ?", [op, `OP-${op}`, `OP ${op}`, fecha]).catch(() => {});
      res.json({ ok: true, deshecho: paso });
    } catch (e) {
      await conn.rollback().catch(() => {});
      err(res, e);
    } finally {
      conn.release();
    }
  });

  // Traer los pedidos nuevos de la planilla de ventas (y volver a aplicar las marcas de la app).
  app.post("/api/deposito/actualizar", requirePermiso(PERMISO), async (req, res) => {
    try {
      if (!sincronizarPedidos) throw falla(501, "No está disponible.");
      const r = await sincronizarPedidos();
      res.json(r);
    } catch (e) {
      err(res, e);
    }
  });

  // Comprometido en pedidos armados, para la pantalla de semielaborados.
  app.get("/api/deposito/comprometido", requirePermiso("semielaborados"), async (req, res) => {
    try {
      const c = await comprometidos(db);
      res.json(Object.fromEntries([...c].map(([id, v]) => [id, Math.round(v.cantidad * 1000) / 1000])));
    } catch (e) {
      err(res, e);
    }
  });

  app.get("/api/deposito/comprometido/:semiId", requirePermiso("semielaborados"), async (req, res) => {
    try {
      const c = (await comprometidos(db)).get(Number(req.params.semiId)) || { cantidad: 0, pedidos: [] };
      res.json({ cantidad: Math.round(c.cantidad * 1000) / 1000, pedidos: c.pedidos });
    } catch (e) {
      err(res, e);
    }
  });

  // Sincronización automática del 33 con la planilla.
  app.get("/api/deposito/sincronizacion-33", requirePermiso(PERMISO), async (req, res) => {
    try {
      res.json({ activo: await espejoActivo(db), ...(estadoEspejo ? estadoEspejo() : {}), puede_cambiar: await esAdmin(req) });
    } catch (e) {
      err(res, e);
    }
  });

  app.put("/api/deposito/sincronizacion-33", requirePermiso(PERMISO), async (req, res) => {
    try {
      if (!(await esAdmin(req))) throw falla(403, "Solo un administrador puede cambiar la sincronización.");
      const activo = !!req.body?.activo;
      await cambiarEspejo(db, activo);
      console.log(`[stock33] sincronización automática ${activo ? "ACTIVADA" : "DESACTIVADA"} por ${await quien(req)}`);
      res.json({ activo });
    } catch (e) {
      err(res, e);
    }
  });
}

module.exports = {
  PERMISO,
  asegurarTablasDeposito,
  registrarRutasDeposito,
  agruparPedidos,
  filtrarPedidos,
  semisDelPedido,
  hechoEnPlanilla,
  normalizarOp,
  desdeSeisMeses,
  comprometidos,
  aplicarMarcasEnPedidos,
  espejoActivo,
  cambiarEspejo,
};
