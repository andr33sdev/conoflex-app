"use strict";
// Módulo Desarrollo de productos (P-11 / R.032): proyectos de productos nuevos y modificaciones, con etapas,
// aprobaciones con usuario y fecha, bitácora automática, fotos y planos, pruebas, ítems creados en la app
// (con su costo por receta y sus ventas reales) y difusión de cambios con confirmación de "enterado".

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const L = require("./desarrolloLogica");

const PERMISO = "desarrollo";
const MAX_ARCHIVO = 25 * 1024 * 1024;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const normCodigo = (c) => String(c ?? "").toUpperCase().replace(/\s+/g, "");
const texto = (v, max = 2000) => (v == null ? null : String(v).trim().slice(0, max) || null);
const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null);

async function asegurarTablasDesarrollo(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS dp_proyectos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(200) NOT NULL,
    tipo VARCHAR(20) NOT NULL DEFAULT 'NUEVO',
    origen VARCHAR(20) NULL,
    cliente VARCHAR(200) NULL,
    punto_partida VARCHAR(500) NULL,
    descripcion TEXT NULL,
    producto_base VARCHAR(100) NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'EN_CURSO',
    listado_ventas TINYINT NOT NULL DEFAULT 0,
    responsable_id INT NULL,
    responsable_nombre VARCHAR(120) NULL,
    fecha_objetivo DATE NULL,
    fecha_lanzamiento DATE NULL,
    portada_id INT NULL,
    creado_por_id INT NULL,
    creado_por VARCHAR(120) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (estado)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS dp_etapas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    proyecto_id INT NOT NULL,
    etapa VARCHAR(20) NOT NULL,
    detalle TEXT NULL,
    estado VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE',
    fecha DATE NULL,
    aprobacion_estado VARCHAR(12) NULL,
    aprobador_id INT NULL,
    aprobador_nombre VARCHAR(120) NULL,
    aprobacion_pedida_por VARCHAR(120) NULL,
    aprobacion_pedida_at DATETIME NULL,
    aprobado_at DATETIME NULL,
    aprobacion_comentario VARCHAR(500) NULL,
    actualizado_por VARCHAR(120) NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY (proyecto_id, etapa)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS dp_eventos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    proyecto_id INT NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    etapa VARCHAR(20) NULL,
    texto TEXT NULL,
    archivo_id INT NULL,
    usuario_id INT NULL,
    usuario_nombre VARCHAR(120) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX (proyecto_id, created_at)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS dp_archivos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    proyecto_id INT NOT NULL,
    etapa VARCHAR(20) NULL,
    tipo VARCHAR(12) NOT NULL DEFAULT 'FOTO',
    nombre VARCHAR(255) NOT NULL,
    archivo VARCHAR(120) NOT NULL,
    mime VARCHAR(100) NULL,
    tamano INT NULL,
    miniatura VARCHAR(120) NULL,
    descripcion VARCHAR(500) NULL,
    es_oficial TINYINT NOT NULL DEFAULT 0,
    subido_por VARCHAR(120) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX (proyecto_id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS dp_pruebas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    proyecto_id INT NOT NULL,
    tipo VARCHAR(12) NOT NULL DEFAULT 'VERIFICACION',
    que VARCHAR(200) NOT NULL,
    metodo VARCHAR(400) NULL,
    objetivo VARCHAR(200) NULL,
    resultado VARCHAR(400) NULL,
    cumple VARCHAR(10) NOT NULL DEFAULT 'PENDIENTE',
    accion VARCHAR(400) NULL,
    fecha DATE NULL,
    usuario_nombre VARCHAR(120) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX (proyecto_id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS dp_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    proyecto_id INT NOT NULL,
    tipo VARCHAR(4) NOT NULL,
    ref_id INT NOT NULL,
    codigo VARCHAR(255) NOT NULL,
    nombre VARCHAR(255) NULL,
    creado TINYINT NOT NULL DEFAULT 0,
    usuario_nombre VARCHAR(120) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY (proyecto_id, tipo, ref_id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS dp_avisos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    proyecto_id INT NOT NULL,
    usuario_id INT NOT NULL,
    usuario_nombre VARCHAR(120) NULL,
    mensaje VARCHAR(1000) NULL,
    enviado_por VARCHAR(120) NULL,
    enviado_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    enterado_at DATETIME NULL,
    comentario VARCHAR(500) NULL,
    UNIQUE KEY (proyecto_id, usuario_id)
  )`);
}

/** Quién está usando la app: id, nombre y rol. */
async function usuario(db, req) {
  const [r] = await db.query("SELECT id, nombre, rol FROM usuarios WHERE id = ?", [req.user?.id]);
  const u = r[0];
  return u ? { id: u.id, nombre: u.nombre || "Usuario", rol: String(u.rol || "").toUpperCase(), admin: String(u.rol || "").toUpperCase() === "ADMIN" } : { id: null, nombre: "Usuario", rol: "", admin: false };
}

async function evento(db, proyectoId, u, tipo, textoEv, { etapa = null, archivoId = null } = {}) {
  await db.query("INSERT INTO dp_eventos (proyecto_id, tipo, etapa, texto, archivo_id, usuario_id, usuario_nombre) VALUES (?,?,?,?,?,?,?)", [proyectoId, tipo, etapa, texto(textoEv, 5000), archivoId, u?.id ?? null, u?.nombre ?? null]);
}

/** Ventas reales (facturas leídas) de unos códigos: por mes, desde una fecha. */
async function ventasDe(db, codigos, desde) {
  const lista = [...new Set(codigos.map(normCodigo).filter(Boolean))];
  if (!lista.length) return null;
  try {
    const [r] = await db.query(
      `SELECT DATE_FORMAT(f.fecha, '%Y-%m') AS mes, SUM(f.signo * i.cantidad) AS unidades, SUM(f.signo * ABS(COALESCE(i.subtotal, 0))) AS neto,
              MIN(f.fecha) AS primera
         FROM factura_items i JOIN facturas f ON f.id = i.factura_id
        WHERE f.signo <> 0 AND UPPER(REPLACE(i.codigo, ' ', '')) IN (?) ${desde ? "AND f.fecha >= ?" : ""}
        GROUP BY DATE_FORMAT(f.fecha, '%Y-%m') ORDER BY mes`,
      desde ? [lista, desde] : [lista],
    );
    const meses = r.map((x) => ({ mes: x.mes, unidades: r2(x.unidades), neto: r2(x.neto) }));
    return { meses, unidades: r2(meses.reduce((a, m) => a + m.unidades, 0)), neto: r2(meses.reduce((a, m) => a + m.neto, 0)), desde: desde || null };
  } catch {
    return null; // sin tablas de facturas (lector no instalado)
  }
}

/** Ítems del proyecto con su receta, costo (Costos) y ventas. */
async function itemsConDatos(db, proyecto, items, costosCompletos) {
  if (!items.length) return { items: [], ventas: null };
  let costos = null;
  try {
    costos = costosCompletos ? await costosCompletos(db) : null;
  } catch {
    costos = null;
  }
  const ptCosto = new Map((costos?.productos || []).map((p) => [p.id, p]));
  const seCosto = new Map((costos?.semielaborados || []).map((p) => [p.id, p]));
  const out = items.map((i) => {
    const c = (i.tipo === "PT" ? ptCosto : seCosto).get(i.ref_id);
    return { ...i, costo: c?.costo ?? null, costo_completo: !!c?.completo, tiene_receta: c ? !c.sin_receta : false, faltan: c?.faltan || [] };
  });
  const pts = out.filter((i) => i.tipo === "PT").map((i) => i.codigo);
  const ventas = await ventasDe(db, pts, proyecto.fecha_lanzamiento ? String(proyecto.fecha_lanzamiento).slice(0, 10) : null);
  return { items: out, ventas };
}

async function proyectoCompleto(db, id, u, { costosCompletos } = {}) {
  const [[p]] = await db.query("SELECT * FROM dp_proyectos WHERE id = ?", [id]);
  if (!p) return null;
  const [etapas] = await db.query("SELECT * FROM dp_etapas WHERE proyecto_id = ?", [id]);
  const [archivos] = await db.query("SELECT id, etapa, tipo, nombre, mime, tamano, miniatura IS NOT NULL AS tiene_miniatura, descripcion, es_oficial, subido_por, created_at FROM dp_archivos WHERE proyecto_id = ? ORDER BY es_oficial DESC, created_at DESC", [id]);
  const [eventos] = await db.query("SELECT * FROM dp_eventos WHERE proyecto_id = ? ORDER BY created_at DESC, id DESC LIMIT 300", [id]);
  const [pruebas] = await db.query("SELECT * FROM dp_pruebas WHERE proyecto_id = ? ORDER BY tipo, id", [id]);
  const [itemsDb] = await db.query("SELECT * FROM dp_items WHERE proyecto_id = ? ORDER BY tipo, id", [id]);
  const [avisos] = await db.query("SELECT * FROM dp_avisos WHERE proyecto_id = ? ORDER BY enviado_at", [id]);
  const { items, ventas } = await itemsConDatos(db, p, itemsDb, costosCompletos);
  const defs = L.etapasDe(p.tipo);
  const porId = new Map(etapas.map((e) => [e.etapa, e]));
  const etapasOut = defs.map((d) => ({ ...d, ...(porId.get(d.id) || { etapa: d.id, estado: "PENDIENTE", detalle: "" }), etapa: d.id, cerrada: L.etapaCerrada(porId.get(d.id), d) }));
  const base = { ...p, etapas: etapasOut, archivos: archivos.map((a) => ({ ...a, es_oficial: !!a.es_oficial, tiene_miniatura: !!a.tiene_miniatura })), eventos, pruebas, items, avisos, ventas };
  return {
    ...base,
    listado_ventas: !!p.listado_ventas,
    progreso: L.progreso(p.tipo, etapas),
    iso: L.revisionIso(base),
    puedo_aprobar: etapasOut.filter((e) => e.aprobacion_estado === "PEDIDA" && (e.aprobador_id === u.id || u.admin)).map((e) => e.etapa),
    mi_aviso: avisos.find((a) => a.usuario_id === u.id && !a.enterado_at) || null,
  };
}

function registrarRutasDesarrollo(app, { db, requirePermiso, crearNotificacion, ai = null, modelo = "gemini-2.5-flash", multer, costosCompletos = null, dir }) {
  const DIR = dir || path.join(__dirname, "datos", "desarrollo");
  fs.mkdirSync(DIR, { recursive: true });
  const puede = requirePermiso(PERMISO);
  const err = (res, e) => {
    console.error("[desarrollo]", e);
    res.status(500).json({ error: e.message || "Error inesperado." });
  };
  const avisar = async (u, destinoId, titulo, txt, proyectoId) => {
    if (!crearNotificacion || !destinoId) return;
    const [[d]] = await db.query("SELECT rol FROM usuarios WHERE id = ?", [destinoId]);
    if (!d?.rol) return;
    await crearNotificacion(db, { tipo: "DESARROLLO", titulo, texto: txt, ruta: `/desarrollo?p=${proyectoId}`, roles: [d.rol], creada_por_id: u.id, push: true });
  };
  const existe = async (id) => {
    const [[p]] = await db.query("SELECT id, codigo, nombre, tipo FROM dp_proyectos WHERE id = ?", [id]);
    return p || null;
  };

  // Personas que pueden aprobar o recibir avisos: quienes tienen acceso al módulo (y los administradores).
  app.get("/api/desarrollo/usuarios", puede, async (req, res) => {
    try {
      const [r] = await db.query(
        `SELECT u.id, u.nombre, u.rol FROM usuarios u
          WHERE UPPER(u.rol) = 'ADMIN' OR EXISTS (SELECT 1 FROM permisos_roles pr WHERE pr.rol_nombre = u.rol AND (pr.modulo_id = ? OR pr.modulo_id = '*'))
          ORDER BY u.nombre`,
        [PERMISO],
      );
      res.json(r);
    } catch (e) {
      err(res, e);
    }
  });

  app.get("/api/desarrollo/proyectos", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const [ps] = await db.query("SELECT * FROM dp_proyectos ORDER BY FIELD(estado, 'EN_CURSO', 'PAUSADO', 'TERMINADO', 'DESCARTADO'), updated_at DESC");
      const [ets] = await db.query("SELECT proyecto_id, etapa, estado, aprobacion_estado, aprobador_id FROM dp_etapas");
      const [archs] = await db.query("SELECT proyecto_id, COUNT(*) AS n FROM dp_archivos GROUP BY proyecto_id");
      const [avs] = await db.query("SELECT proyecto_id, usuario_id, enterado_at FROM dp_avisos");
      const [ult] = await db.query("SELECT proyecto_id, MAX(created_at) AS ultimo FROM dp_eventos GROUP BY proyecto_id");
      const porP = (lista) => lista.reduce((m, x) => m.set(x.proyecto_id, [...(m.get(x.proyecto_id) || []), x]), new Map());
      const etP = porP(ets);
      const avP = porP(avs);
      const nArch = new Map(archs.map((a) => [a.proyecto_id, Number(a.n)]));
      const ultimo = new Map(ult.map((x) => [x.proyecto_id, x.ultimo]));
      const lista = ps.map((p) => {
        const e = etP.get(p.id) || [];
        const a = avP.get(p.id) || [];
        return {
          id: p.id, codigo: p.codigo, nombre: p.nombre, tipo: p.tipo, estado: p.estado, cliente: p.cliente, origen: p.origen,
          responsable_nombre: p.responsable_nombre, fecha_objetivo: p.fecha_objetivo, portada_id: p.portada_id, listado_ventas: !!p.listado_ventas,
          progreso: L.progreso(p.tipo, e), archivos: nArch.get(p.id) || 0, ultimo_movimiento: ultimo.get(p.id) || p.updated_at,
          espera_mi_aprobacion: e.filter((x) => x.aprobacion_estado === "PEDIDA" && (x.aprobador_id === u.id || (u.admin && x.aprobador_id == null))).map((x) => x.etapa),
          aprobaciones_pedidas: e.filter((x) => x.aprobacion_estado === "PEDIDA").length,
          espera_mi_enterado: a.some((x) => x.usuario_id === u.id && !x.enterado_at),
          avisos_pendientes: a.filter((x) => !x.enterado_at).length,
        };
      });
      res.json({ proyectos: lista, yo: { id: u.id, nombre: u.nombre, admin: u.admin } });
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/desarrollo/proyectos", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const b = req.body || {};
      const nombre = texto(b.nombre, 200);
      if (!nombre) return res.status(400).json({ error: "Poné un nombre para el desarrollo." });
      const tipo = L.TIPOS.includes(b.tipo) ? b.tipo : "NUEVO";
      const anio = new Date().getFullYear();
      let codigo = null;
      let id = null;
      for (let i = 0; i < 5 && !id; i++) {
        const [[ult]] = await db.query("SELECT codigo FROM dp_proyectos WHERE codigo LIKE ? ORDER BY id DESC LIMIT 1", [`DP-${anio}-%`]);
        codigo = L.siguienteCodigo(ult?.codigo, anio);
        try {
          const [r] = await db.query(
            "INSERT INTO dp_proyectos (codigo, nombre, tipo, origen, cliente, punto_partida, descripcion, producto_base, responsable_id, responsable_nombre, fecha_objetivo, creado_por_id, creado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [codigo, nombre, tipo, L.ORIGENES.includes(b.origen) ? b.origen : null, texto(b.cliente, 200), texto(b.punto_partida, 500), texto(b.descripcion, 5000), texto(b.producto_base, 100), u.id, u.nombre, fecha(b.fecha_objetivo), u.id, u.nombre],
          );
          id = r.insertId;
        } catch (e) {
          if (e.code !== "ER_DUP_ENTRY") throw e;
        }
      }
      for (const d of L.etapasDe(tipo)) await db.query("INSERT IGNORE INTO dp_etapas (proyecto_id, etapa) VALUES (?, ?)", [id, d.id]);
      // Lo que se escribió al crear queda como primer punto de las entradas.
      const entradas = [b.descripcion, b.punto_partida && `Punto de partida: ${b.punto_partida}`, b.cliente && `Cliente: ${b.cliente}`].filter(Boolean);
      if (entradas.length) await db.query("UPDATE dp_etapas SET detalle = ?, estado = 'EN_CURSO', fecha = CURDATE(), actualizado_por = ? WHERE proyecto_id = ? AND etapa = 'ENTRADAS'", [L.sumarPuntos("", entradas), u.nombre, id]);
      await evento(db, id, u, "CREADO", `${tipo === "MODIFICACION" ? "Modificación" : "Desarrollo"} creado: ${nombre}`);
      res.json({ id, codigo });
    } catch (e) {
      err(res, e);
    }
  });

  app.get("/api/desarrollo/proyectos/:id", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const p = await proyectoCompleto(db, Number(req.params.id), u, { costosCompletos });
      if (!p) return res.status(404).json({ error: "No existe ese desarrollo." });
      res.json(p);
    } catch (e) {
      err(res, e);
    }
  });

  app.put("/api/desarrollo/proyectos/:id", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const id = Number(req.params.id);
      const [[p]] = await db.query("SELECT * FROM dp_proyectos WHERE id = ?", [id]);
      if (!p) return res.status(404).json({ error: "No existe ese desarrollo." });
      const b = req.body || {};
      const sets = [];
      const vals = [];
      const cambios = [];
      const campo = (k, v, etiqueta) => {
        sets.push(`${k} = ?`);
        vals.push(v);
        if (String(v ?? "") !== String(p[k] ?? "")) cambios.push(etiqueta);
      };
      if (b.nombre !== undefined) {
        if (!texto(b.nombre, 200)) return res.status(400).json({ error: "El nombre no puede quedar vacío." });
        campo("nombre", texto(b.nombre, 200), "nombre");
      }
      if (b.cliente !== undefined) campo("cliente", texto(b.cliente, 200), "cliente");
      if (b.punto_partida !== undefined) campo("punto_partida", texto(b.punto_partida, 500), "punto de partida");
      if (b.descripcion !== undefined) campo("descripcion", texto(b.descripcion, 5000), "descripción");
      if (b.producto_base !== undefined) campo("producto_base", texto(b.producto_base, 100), "producto base");
      if (b.origen !== undefined) campo("origen", L.ORIGENES.includes(b.origen) ? b.origen : null, "origen");
      if (b.fecha_objetivo !== undefined) campo("fecha_objetivo", fecha(b.fecha_objetivo), "fecha objetivo");
      if (b.fecha_lanzamiento !== undefined) campo("fecha_lanzamiento", fecha(b.fecha_lanzamiento), "fecha de lanzamiento");
      if (b.listado_ventas !== undefined) campo("listado_ventas", b.listado_ventas ? 1 : 0, b.listado_ventas ? "listado en ventas: sí" : "listado en ventas: no");
      if (b.portada_id !== undefined) campo("portada_id", b.portada_id ? Number(b.portada_id) : null, "foto de portada");
      if (b.responsable_id !== undefined) {
        const [[r]] = await db.query("SELECT id, nombre FROM usuarios WHERE id = ?", [b.responsable_id]);
        campo("responsable_id", r?.id ?? null, "responsable");
        sets.push("responsable_nombre = ?");
        vals.push(r?.nombre ?? null);
      }
      if (b.estado !== undefined) {
        if (!L.ESTADOS_PROYECTO.includes(b.estado)) return res.status(400).json({ error: "Estado inválido." });
        campo("estado", b.estado, `estado: ${b.estado}`);
        if (b.estado === "TERMINADO" && !p.fecha_lanzamiento && b.fecha_lanzamiento === undefined) {
          sets.push("fecha_lanzamiento = CURDATE()");
        }
      }
      if (!sets.length) return res.json({ ok: true });
      await db.query(`UPDATE dp_proyectos SET ${sets.join(", ")} WHERE id = ?`, [...vals, id]);
      if (cambios.length) await evento(db, id, u, b.estado !== undefined && b.estado !== p.estado ? "ESTADO" : "DATOS", `Cambió ${cambios.join(", ")}.`);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  // Etapa del R.032: detalle, estado y fecha. Si estaba aprobada y se cambia el detalle, la aprobación se cae.
  app.put("/api/desarrollo/proyectos/:id/etapas/:etapa", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const id = Number(req.params.id);
      const p = await existe(id);
      if (!p) return res.status(404).json({ error: "No existe ese desarrollo." });
      const def = L.etapasDe(p.tipo).find((d) => d.id === req.params.etapa);
      if (!def) return res.status(400).json({ error: "Etapa inválida." });
      await db.query("INSERT IGNORE INTO dp_etapas (proyecto_id, etapa) VALUES (?, ?)", [id, def.id]);
      const [[e]] = await db.query("SELECT * FROM dp_etapas WHERE proyecto_id = ? AND etapa = ?", [id, def.id]);
      const b = req.body || {};
      const detalle = b.detalle !== undefined ? texto(b.detalle, 8000) || "" : e.detalle;
      const estado = b.estado !== undefined ? (L.ESTADOS_ETAPA.includes(b.estado) ? b.estado : null) : e.estado;
      if (!estado) return res.status(400).json({ error: "Estado inválido." });
      const f = b.fecha !== undefined ? fecha(b.fecha) : e.fecha || (detalle ? new Date().toISOString().slice(0, 10) : null);
      const cambioDetalle = String(detalle || "") !== String(e.detalle || "");
      const caeAprobacion = cambioDetalle && e.aprobacion_estado === "APROBADA";
      await db.query(
        `UPDATE dp_etapas SET detalle = ?, estado = ?, fecha = ?, actualizado_por = ?${caeAprobacion ? ", aprobacion_estado = NULL, aprobado_at = NULL, aprobacion_comentario = NULL" : ""} WHERE id = ?`,
        [detalle, estado === "PENDIENTE" && detalle ? "EN_CURSO" : estado, f, u.nombre, e.id],
      );
      const partes = [];
      if (cambioDetalle) partes.push("actualizó el detalle");
      if (estado !== e.estado) partes.push(`la pasó a ${estado.replace("_", " ").toLowerCase()}`);
      if (partes.length) await evento(db, id, u, "ETAPA", `${def.nombre}: ${partes.join(" y ")}.${caeAprobacion ? " La aprobación anterior quedó sin efecto porque cambió el contenido." : ""}`, { etapa: def.id });
      res.json({ ok: true, aprobacion_caida: caeAprobacion });
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/desarrollo/proyectos/:id/etapas/:etapa/pedir-aprobacion", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const id = Number(req.params.id);
      const p = await existe(id);
      if (!p) return res.status(404).json({ error: "No existe ese desarrollo." });
      const def = L.etapasDe(p.tipo).find((d) => d.id === req.params.etapa && d.aprobable);
      if (!def) return res.status(400).json({ error: "Esa etapa no se aprueba." });
      const [[a]] = await db.query("SELECT id, nombre FROM usuarios WHERE id = ?", [req.body?.aprobador_id]);
      if (!a) return res.status(400).json({ error: "Elegí quién aprueba." });
      const [[e]] = await db.query("SELECT detalle FROM dp_etapas WHERE proyecto_id = ? AND etapa = ?", [id, def.id]);
      if (!String(e?.detalle || "").replace(/[\s-]/g, "")) return res.status(400).json({ error: "Escribí el detalle de la etapa antes de pedir la aprobación." });
      await db.query(
        "UPDATE dp_etapas SET estado = 'LISTA', aprobacion_estado = 'PEDIDA', aprobador_id = ?, aprobador_nombre = ?, aprobacion_pedida_por = ?, aprobacion_pedida_at = NOW(), aprobado_at = NULL, aprobacion_comentario = NULL WHERE proyecto_id = ? AND etapa = ?",
        [a.id, a.nombre, u.nombre, id, def.id],
      );
      await evento(db, id, u, "APROBACION", `Pidió a ${a.nombre} que apruebe «${def.nombre}».`, { etapa: def.id });
      await avisar(u, a.id, `Aprobación pendiente: ${p.nombre}`, `${u.nombre} te pide que apruebes «${def.nombre}» (${p.codigo}).`, id);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  // Solo la persona elegida (o un administrador) puede aprobar o rechazar.
  app.post("/api/desarrollo/proyectos/:id/etapas/:etapa/aprobar", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const id = Number(req.params.id);
      const p = await existe(id);
      if (!p) return res.status(404).json({ error: "No existe ese desarrollo." });
      const def = L.etapasDe(p.tipo).find((d) => d.id === req.params.etapa && d.aprobable);
      if (!def) return res.status(400).json({ error: "Esa etapa no se aprueba." });
      const [[e]] = await db.query("SELECT * FROM dp_etapas WHERE proyecto_id = ? AND etapa = ?", [id, def.id]);
      if (e?.aprobacion_estado !== "PEDIDA") return res.status(400).json({ error: "Esa etapa no tiene una aprobación pendiente." });
      if (e.aprobador_id !== u.id && !u.admin) return res.status(403).json({ error: `La aprobación le corresponde a ${e.aprobador_nombre}.` });
      const aprueba = req.body?.decision !== "RECHAZADA";
      const comentario = texto(req.body?.comentario, 500);
      if (!aprueba && !comentario) return res.status(400).json({ error: "Contá por qué no se aprueba, así se puede corregir." });
      await db.query(
        `UPDATE dp_etapas SET aprobacion_estado = ?, aprobado_at = NOW(), aprobacion_comentario = ?, aprobador_id = ?, aprobador_nombre = ?, estado = ? WHERE id = ?`,
        [aprueba ? "APROBADA" : "RECHAZADA", comentario, u.id, u.nombre, aprueba ? "LISTA" : "EN_CURSO", e.id],
      );
      await evento(db, id, u, "APROBACION", `${aprueba ? "Aprobó" : "No aprobó"} «${def.nombre}»${comentario ? `: ${comentario}` : "."}`, { etapa: def.id });
      const [[p2]] = await db.query("SELECT responsable_id FROM dp_proyectos WHERE id = ?", [id]);
      const [[pidio]] = await db.query("SELECT id FROM usuarios WHERE nombre = ? LIMIT 1", [e.aprobacion_pedida_por]);
      for (const destino of new Set([p2?.responsable_id, pidio?.id].filter((x) => x && x !== u.id))) {
        await avisar(u, destino, `${aprueba ? "Aprobado" : "No aprobado"}: ${def.nombre}`, `${u.nombre} ${aprueba ? "aprobó" : "no aprobó"} «${def.nombre}» de ${p.nombre}.${comentario ? ` ${comentario}` : ""}`, id);
      }
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/desarrollo/proyectos/:id/notas", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const id = Number(req.params.id);
      if (!(await existe(id))) return res.status(404).json({ error: "No existe ese desarrollo." });
      const t = texto(req.body?.texto, 5000);
      if (!t) return res.status(400).json({ error: "La nota está vacía." });
      const etapa = L.ETAPAS.some((d) => d.id === req.body?.etapa) ? req.body.etapa : null;
      await evento(db, id, u, "NOTA", t, { etapa });
      await db.query("UPDATE dp_proyectos SET updated_at = NOW() WHERE id = ?", [id]);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  // --------------------------------------------------------------- archivos
  const subir = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ARCHIVO, files: 12 } });
  app.post("/api/desarrollo/proyectos/:id/archivos", puede, (req, res, next) => {
    subir.array("archivos", 12)(req, res, (e) => {
      if (e) return res.status(e.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: e.code === "LIMIT_FILE_SIZE" ? "Un archivo pesa más de 25 MB." : "No se pudieron recibir los archivos." });
      next();
    });
  }, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const id = Number(req.params.id);
      const p = await existe(id);
      if (!p) return res.status(404).json({ error: "No existe ese desarrollo." });
      const files = req.files || [];
      if (!files.length) return res.status(400).json({ error: "No llegó ningún archivo." });
      const etapa = L.ETAPAS.some((d) => d.id === req.body?.etapa) ? req.body.etapa : null;
      const carpeta = path.join(DIR, String(id));
      fs.mkdirSync(carpeta, { recursive: true });
      const nuevos = [];
      for (const f of files) {
        const nombre = Buffer.from(f.originalname || "archivo", "latin1").toString("utf8").slice(0, 255);
        const ext = (path.extname(nombre).toLowerCase().match(/^\.[a-z0-9]{1,8}$/) || [""])[0];
        const archivo = `${crypto.randomBytes(12).toString("hex")}${ext}`;
        fs.writeFileSync(path.join(carpeta, archivo), f.buffer);
        const esImagen = /^image\/(jpeg|png|webp|gif|heic|heif|avif|tiff)$/.test(f.mimetype || "");
        let miniatura = null;
        if (esImagen) {
          try {
            const sharp = require("sharp");
            miniatura = `${archivo}.min.jpg`;
            await sharp(f.buffer).rotate().resize(640, 640, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toFile(path.join(carpeta, miniatura));
          } catch {
            miniatura = null;
          }
        }
        const tipo = L.TIPOS_ARCHIVO.includes(req.body?.tipo) ? req.body.tipo : esImagen ? "FOTO" : /pdf|dwg|dxf|step|stp|igs|iges|sldprt|sldasm/i.test(ext) ? "PLANO" : "DOCUMENTO";
        const [r] = await db.query(
          "INSERT INTO dp_archivos (proyecto_id, etapa, tipo, nombre, archivo, mime, tamano, miniatura, descripcion, subido_por) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [id, etapa, tipo, nombre, archivo, f.mimetype || null, f.size || null, miniatura, texto(req.body?.descripcion, 500), u.nombre],
        );
        nuevos.push({ id: r.insertId, nombre, tipo });
      }
      await evento(db, id, u, "ARCHIVO", nuevos.length === 1 ? `Subió «${nuevos[0].nombre}».` : `Subió ${nuevos.length} archivos: ${nuevos.map((n) => n.nombre).join(", ")}.`, { etapa, archivoId: nuevos[0].id });
      // La primera foto que se sube queda de portada.
      const [[pp]] = await db.query("SELECT portada_id FROM dp_proyectos WHERE id = ?", [id]);
      const primeraFoto = nuevos.find((n) => n.tipo === "FOTO" || n.tipo === "RENDER");
      if (!pp.portada_id && primeraFoto) await db.query("UPDATE dp_proyectos SET portada_id = ? WHERE id = ?", [primeraFoto.id, id]);
      res.json({ ok: true, archivos: nuevos });
    } catch (e) {
      err(res, e);
    }
  });

  const enviarArchivo = (mini) => async (req, res) => {
    try {
      const [[a]] = await db.query("SELECT * FROM dp_archivos WHERE id = ?", [Number(req.params.id)]);
      if (!a) return res.status(404).json({ error: "No existe ese archivo." });
      const nombre = mini && a.miniatura ? a.miniatura : a.archivo;
      const ruta = path.join(DIR, String(a.proyecto_id), path.basename(nombre));
      if (!fs.existsSync(ruta)) return res.status(404).json({ error: "El archivo no está en el servidor." });
      res.setHeader("Cache-Control", "private, max-age=86400");
      if (mini && a.miniatura) res.type("jpg");
      else {
        res.type(a.mime || "application/octet-stream");
        res.setHeader("Content-Disposition", `${req.query.descargar ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(a.nombre)}`);
      }
      fs.createReadStream(ruta).pipe(res);
    } catch (e) {
      err(res, e);
    }
  };
  app.get("/api/desarrollo/archivos/:id", puede, enviarArchivo(false));
  app.get("/api/desarrollo/archivos/:id/miniatura", puede, enviarArchivo(true));

  app.put("/api/desarrollo/archivos/:id", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const [[a]] = await db.query("SELECT * FROM dp_archivos WHERE id = ?", [Number(req.params.id)]);
      if (!a) return res.status(404).json({ error: "No existe ese archivo." });
      const b = req.body || {};
      const sets = [];
      const vals = [];
      if (b.descripcion !== undefined) { sets.push("descripcion = ?"); vals.push(texto(b.descripcion, 500)); }
      if (b.tipo !== undefined && L.TIPOS_ARCHIVO.includes(b.tipo)) { sets.push("tipo = ?"); vals.push(b.tipo); }
      if (b.etapa !== undefined) { sets.push("etapa = ?"); vals.push(L.ETAPAS.some((d) => d.id === b.etapa) ? b.etapa : null); }
      if (b.es_oficial !== undefined) { sets.push("es_oficial = ?"); vals.push(b.es_oficial ? 1 : 0); }
      if (!sets.length) return res.json({ ok: true });
      await db.query(`UPDATE dp_archivos SET ${sets.join(", ")} WHERE id = ?`, [...vals, a.id]);
      if (b.es_oficial !== undefined && !!b.es_oficial !== !!a.es_oficial) {
        await evento(db, a.proyecto_id, u, "ARCHIVO", b.es_oficial ? `Marcó «${a.nombre}» como imagen oficial aprobada (2D/3D).` : `«${a.nombre}» dejó de ser imagen oficial.`, { archivoId: a.id });
      }
      if (b.portada) await db.query("UPDATE dp_proyectos SET portada_id = ? WHERE id = ?", [a.id, a.proyecto_id]);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  app.delete("/api/desarrollo/archivos/:id", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const [[a]] = await db.query("SELECT * FROM dp_archivos WHERE id = ?", [Number(req.params.id)]);
      if (!a) return res.status(404).json({ error: "No existe ese archivo." });
      if (a.es_oficial && !u.admin) return res.status(403).json({ error: "Es la imagen oficial aprobada: primero quitale la marca de oficial." });
      await db.query("DELETE FROM dp_archivos WHERE id = ?", [a.id]);
      await db.query("UPDATE dp_proyectos SET portada_id = NULL WHERE id = ? AND portada_id = ?", [a.proyecto_id, a.id]);
      // El archivo se mueve a una papelera del proyecto: nunca se pierde evidencia de un desarrollo.
      const carpeta = path.join(DIR, String(a.proyecto_id));
      fs.mkdirSync(path.join(carpeta, "papelera"), { recursive: true });
      for (const f of [a.archivo, a.miniatura].filter(Boolean)) {
        try {
          fs.renameSync(path.join(carpeta, f), path.join(carpeta, "papelera", f));
        } catch {
          /* ya no estaba */
        }
      }
      await evento(db, a.proyecto_id, u, "ARCHIVO", `Quitó «${a.nombre}».`);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  // --------------------------------------------------------------- pruebas (verificación / validación)
  const datosPrueba = (b) => ({
    tipo: b.tipo === "VALIDACION" ? "VALIDACION" : "VERIFICACION",
    que: texto(b.que, 200),
    metodo: texto(b.metodo, 400),
    objetivo: texto(b.objetivo, 200),
    resultado: texto(b.resultado, 400),
    cumple: L.CUMPLE.includes(b.cumple) ? b.cumple : "PENDIENTE",
    accion: texto(b.accion, 400),
    fecha: fecha(b.fecha) || new Date().toISOString().slice(0, 10),
  });
  app.post("/api/desarrollo/proyectos/:id/pruebas", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const id = Number(req.params.id);
      if (!(await existe(id))) return res.status(404).json({ error: "No existe ese desarrollo." });
      const d = datosPrueba(req.body || {});
      if (!d.que) return res.status(400).json({ error: "Indicá qué se prueba." });
      const [r] = await db.query("INSERT INTO dp_pruebas (proyecto_id, tipo, que, metodo, objetivo, resultado, cumple, accion, fecha, usuario_nombre) VALUES (?,?,?,?,?,?,?,?,?,?)", [id, d.tipo, d.que, d.metodo, d.objetivo, d.resultado, d.cumple, d.accion, d.fecha, u.nombre]);
      await evento(db, id, u, "PRUEBA", `Cargó la prueba «${d.que}»${d.cumple !== "PENDIENTE" ? ` (${d.cumple === "SI" ? "cumple" : "no cumple"})` : ""}.`, { etapa: d.tipo });
      res.json({ id: r.insertId });
    } catch (e) {
      err(res, e);
    }
  });
  app.put("/api/desarrollo/pruebas/:id", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const [[x]] = await db.query("SELECT * FROM dp_pruebas WHERE id = ?", [Number(req.params.id)]);
      if (!x) return res.status(404).json({ error: "No existe esa prueba." });
      const d = datosPrueba({ ...x, fecha: x.fecha ? new Date(x.fecha).toISOString().slice(0, 10) : null, ...req.body });
      if (!d.que) return res.status(400).json({ error: "Indicá qué se prueba." });
      await db.query("UPDATE dp_pruebas SET tipo = ?, que = ?, metodo = ?, objetivo = ?, resultado = ?, cumple = ?, accion = ?, fecha = ?, usuario_nombre = ? WHERE id = ?", [d.tipo, d.que, d.metodo, d.objetivo, d.resultado, d.cumple, d.accion, d.fecha, u.nombre, x.id]);
      if (d.cumple !== x.cumple || d.resultado !== x.resultado) await evento(db, x.proyecto_id, u, "PRUEBA", `Actualizó la prueba «${d.que}»: ${d.cumple === "SI" ? "cumple" : d.cumple === "NO" ? "no cumple" : "pendiente"}${d.resultado ? ` (resultado: ${d.resultado})` : ""}.`, { etapa: d.tipo });
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });
  app.delete("/api/desarrollo/pruebas/:id", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const [[x]] = await db.query("SELECT * FROM dp_pruebas WHERE id = ?", [Number(req.params.id)]);
      if (!x) return res.status(404).json({ error: "No existe esa prueba." });
      await db.query("DELETE FROM dp_pruebas WHERE id = ?", [x.id]);
      await evento(db, x.proyecto_id, u, "PRUEBA", `Borró la prueba «${x.que}».`, { etapa: x.tipo });
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  // --------------------------------------------------------------- ítems de la app (PT / semielaborado)
  app.get("/api/desarrollo/buscar-items", puede, async (req, res) => {
    try {
      const q = `%${String(req.query.q || "").trim()}%`;
      const [pt] = await db.query("SELECT id, codigo, nombre, 'PT' AS tipo FROM productos_terminados WHERE codigo LIKE ? OR nombre LIKE ? ORDER BY codigo LIMIT 15", [q, q]);
      const [se] = await db.query("SELECT id, codigo, nombre, 'SE' AS tipo FROM semielaborados WHERE codigo LIKE ? OR nombre LIKE ? ORDER BY codigo LIMIT 15", [q, q]);
      res.json([...pt, ...se]);
    } catch (e) {
      err(res, e);
    }
  });

  // Vincula un ítem que ya existe o lo crea en la app (producto terminado o semielaborado).
  app.post("/api/desarrollo/proyectos/:id/items", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const id = Number(req.params.id);
      if (!(await existe(id))) return res.status(404).json({ error: "No existe ese desarrollo." });
      const tipo = req.body?.tipo === "SE" ? "SE" : "PT";
      const tabla = tipo === "PT" ? "productos_terminados" : "semielaborados";
      const codigo = texto(req.body?.codigo, 255);
      const nombre = texto(req.body?.nombre, 255);
      if (!codigo) return res.status(400).json({ error: "Poné el código." });
      const [[ya]] = await db.query(`SELECT id, codigo, nombre FROM ${tabla} WHERE codigo = ?`, [codigo]);
      let ref = ya;
      let creado = 0;
      if (!ref) {
        if (!req.body?.crear) return res.status(404).json({ error: `No existe el ${tipo === "PT" ? "producto terminado" : "semielaborado"} ${codigo}.`, puede_crear: true });
        if (!nombre) return res.status(400).json({ error: "Poné el nombre para crearlo." });
        const [r] = await db.query(`INSERT INTO ${tabla} (codigo, nombre) VALUES (?, ?)`, [codigo, nombre]);
        ref = { id: r.insertId, codigo, nombre };
        creado = 1;
      }
      await db.query("INSERT IGNORE INTO dp_items (proyecto_id, tipo, ref_id, codigo, nombre, creado, usuario_nombre) VALUES (?,?,?,?,?,?,?)", [id, tipo, ref.id, ref.codigo, ref.nombre, creado, u.nombre]);
      await evento(db, id, u, "ITEM", `${creado ? "Creó" : "Vinculó"} el ${tipo === "PT" ? "producto terminado" : "semielaborado"} ${ref.codigo} · ${ref.nombre}.`);
      res.json({ ok: true, creado: !!creado, ref });
    } catch (e) {
      err(res, e);
    }
  });
  app.delete("/api/desarrollo/items/:id", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const [[x]] = await db.query("SELECT * FROM dp_items WHERE id = ?", [Number(req.params.id)]);
      if (!x) return res.status(404).json({ error: "No existe ese vínculo." });
      await db.query("DELETE FROM dp_items WHERE id = ?", [x.id]);
      await evento(db, x.proyecto_id, u, "ITEM", `Desvinculó ${x.codigo} del desarrollo (el ítem sigue existiendo en la app).`);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  // --------------------------------------------------------------- difusión (reemplaza el grupo "Novedades producción")
  app.post("/api/desarrollo/proyectos/:id/difusion", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const id = Number(req.params.id);
      const p = await existe(id);
      if (!p) return res.status(404).json({ error: "No existe ese desarrollo." });
      const ids = [...new Set((req.body?.usuarios || []).map(Number).filter(Boolean))];
      const mensaje = texto(req.body?.mensaje, 1000);
      if (!ids.length) return res.status(400).json({ error: "Elegí al menos una persona." });
      if (!mensaje) return res.status(400).json({ error: "Escribí qué tienen que saber y hacer." });
      const [us] = await db.query("SELECT id, nombre FROM usuarios WHERE id IN (?)", [ids]);
      for (const d of us) {
        await db.query(
          "INSERT INTO dp_avisos (proyecto_id, usuario_id, usuario_nombre, mensaje, enviado_por) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE mensaje = VALUES(mensaje), enviado_por = VALUES(enviado_por), enviado_at = NOW(), enterado_at = NULL, comentario = NULL",
          [id, d.id, d.nombre, mensaje, u.nombre],
        );
        await avisar(u, d.id, `Novedad de producto: ${p.nombre}`, `${mensaje.slice(0, 300)} — Confirmá que estás enterado.`, id);
      }
      await evento(db, id, u, "DIFUSION", `Avisó a ${us.map((x) => x.nombre).join(", ")}: ${mensaje}`);
      res.json({ ok: true, avisados: us.length });
    } catch (e) {
      err(res, e);
    }
  });
  app.post("/api/desarrollo/proyectos/:id/enterado", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const id = Number(req.params.id);
      const [[a]] = await db.query("SELECT * FROM dp_avisos WHERE proyecto_id = ? AND usuario_id = ?", [id, u.id]);
      if (!a) return res.status(404).json({ error: "No tenés un aviso de este desarrollo." });
      const comentario = texto(req.body?.comentario, 500);
      await db.query("UPDATE dp_avisos SET enterado_at = NOW(), comentario = ? WHERE id = ?", [comentario, a.id]);
      await evento(db, id, u, "DIFUSION", `Confirmó que está enterado${comentario ? `: ${comentario}` : "."}`);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  // --------------------------------------------------------------- asistente: texto libre → etapas y pruebas
  app.post("/api/desarrollo/proyectos/:id/asistente", puede, async (req, res) => {
    try {
      if (!ai) return res.status(503).json({ error: "La IA no está disponible en este servidor." });
      const id = Number(req.params.id);
      const p = await existe(id);
      if (!p) return res.status(404).json({ error: "No existe ese desarrollo." });
      const t = texto(req.body?.texto, 6000);
      if (!t) return res.status(400).json({ error: "Escribí o dictá qué pasó." });
      const defs = L.etapasDe(p.tipo);
      const prompt = `Sos el asistente de desarrollo de productos de Conoflex (fábrica argentina de productos plásticos de seguridad vial: conos, delineadores, tachas, topes; inyección y rotomoldeo). Llevan el registro R.032 del procedimiento ISO P-11.
Proyecto: ${p.codigo} · ${p.nombre} (${p.tipo === "MODIFICACION" ? "modificación de un producto existente" : "producto nuevo"}).
Etapas posibles:
${defs.map((d) => `- ${d.id}: ${d.nombre}. ${d.ayuda}`).join("\n")}

Una persona del equipo contó esto (puede ser dictado, con errores):
"""${t}"""

Ordenalo para el registro:
1) "etapas": a qué etapa(s) corresponde, con puntos cortos y concretos en español rioplatense (sin inventar datos, sin repetir; números y unidades tal cual los dijo).
2) "pruebas": si menciona controles o ensayos (medidas, pesos, espesores, encastres, impactos, adherencia, intemperie...), cada uno con "tipo" (VERIFICACION si compara contra lo pedido en el diseño; VALIDACION si es apto para el uso real), "que", "metodo", "objetivo", "resultado" y "cumple" (SI, NO o PENDIENTE si todavía no hay resultado). No inventes lo que no dijo: dejá vacío.
3) "resumen": una oración.
Respondé solo JSON: {"resumen":"","etapas":[{"etapa":"ENTRADAS","puntos":[""]}],"pruebas":[{"tipo":"VERIFICACION","que":"","metodo":"","objetivo":"","resultado":"","cumple":"PENDIENTE"}]}`;
      const r = await ai.models.generateContent({ model: modelo, contents: prompt, config: { temperature: 0.2, responseMimeType: "application/json" } });
      let s = null;
      try {
        s = JSON.parse(String(r.text || "").replace(/^```(?:json)?\s*|\s*```$/g, ""));
      } catch {
        return res.status(502).json({ error: "La IA no devolvió algo entendible. Probá de nuevo." });
      }
      res.json({ texto: t, ...L.limpiarSugerencia(s, p.tipo) });
    } catch (e) {
      err(res, e);
    }
  });
  app.post("/api/desarrollo/proyectos/:id/asistente/aplicar", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const id = Number(req.params.id);
      const p = await existe(id);
      if (!p) return res.status(404).json({ error: "No existe ese desarrollo." });
      const s = L.limpiarSugerencia(req.body || {}, p.tipo);
      for (const e of s.etapas) {
        await db.query("INSERT IGNORE INTO dp_etapas (proyecto_id, etapa) VALUES (?, ?)", [id, e.etapa]);
        const [[act]] = await db.query("SELECT id, detalle, estado, aprobacion_estado FROM dp_etapas WHERE proyecto_id = ? AND etapa = ?", [id, e.etapa]);
        const nuevo = L.sumarPuntos(act.detalle, e.puntos);
        if (nuevo === String(act.detalle || "")) continue;
        const cae = act.aprobacion_estado === "APROBADA";
        await db.query(`UPDATE dp_etapas SET detalle = ?, estado = IF(estado = 'PENDIENTE', 'EN_CURSO', estado), fecha = COALESCE(fecha, CURDATE()), actualizado_por = ?${cae ? ", aprobacion_estado = NULL, aprobado_at = NULL" : ""} WHERE id = ?`, [nuevo, u.nombre, act.id]);
      }
      for (const x of s.pruebas) {
        await db.query("INSERT INTO dp_pruebas (proyecto_id, tipo, que, metodo, objetivo, resultado, cumple, fecha, usuario_nombre) VALUES (?,?,?,?,?,?,?,CURDATE(),?)", [id, x.tipo, x.que, x.metodo || null, x.objetivo || null, x.resultado || null, x.cumple, u.nombre]);
        await evento(db, id, u, "PRUEBA", `Cargó la prueba «${x.que}»${x.cumple !== "PENDIENTE" ? ` (${x.cumple === "SI" ? "cumple" : "no cumple"})` : ""}.`, { etapa: x.tipo });
      }
      const t = texto(req.body?.texto, 5000);
      await evento(db, id, u, "NOTA", `${t || s.resumen}${s.etapas.length || s.pruebas.length ? `\n\n(Ordenado con el asistente: ${[s.etapas.length && `${s.etapas.length} etapa(s)`, s.pruebas.length && `${s.pruebas.length} prueba(s)`].filter(Boolean).join(" y ")}.)` : ""}`);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });
}

module.exports = { PERMISO, asegurarTablasDesarrollo, registrarRutasDesarrollo, proyectoCompleto, ventasDe };
