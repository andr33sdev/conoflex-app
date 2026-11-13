"use strict";
// Módulo Proyectos y pruebas: seguimiento de todo lo que no es un producto nuevo (pruebas con proveedores, máquinas,
// objetivos, ideas, mejoras). Cada proyecto tiene su estado y próximo paso, pruebas con fotos y decisión (quién aprobó o
// por qué se rechazó), interesados que reciben avisos (ej. Compras esperando un resultado) y una historia completa.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const L = require("./proyectosLogica");

const PERMISO = "proyectos";
const MAX_ARCHIVO = 25 * 1024 * 1024;
const texto = (v, max = 2000) => (v == null ? null : String(v).trim().slice(0, max) || null);
const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null);
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// Fecha de la base (objeto Date o texto) a AAAA-MM-DD.
const isoDe = (v) => {
  if (!v) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  return String(v).slice(0, 10);
};
const FECHA = (c) => `DATE_FORMAT(${c}, '%Y-%m-%d')`;

async function asegurarTablasProyectos(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS pp_proyectos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    tipo VARCHAR(12) NOT NULL DEFAULT 'PRUEBA',
    titulo VARCHAR(200) NOT NULL,
    descripcion TEXT NULL,
    estado VARCHAR(12) NOT NULL DEFAULT 'EN_CURSO',
    prioridad VARCHAR(6) NOT NULL DEFAULT 'MEDIA',
    proveedor VARCHAR(200) NULL,
    responsable_id INT NULL,
    responsable_nombre VARCHAR(120) NULL,
    proximo_paso VARCHAR(300) NULL,
    proximo_paso_fecha DATE NULL,
    proximo_paso_quien VARCHAR(120) NULL,
    fecha_objetivo DATE NULL,
    resultado TEXT NULL,
    portada_id INT NULL,
    creado_por_id INT NULL,
    creado_por VARCHAR(120) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ultimo_movimiento DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX (estado), INDEX (tipo)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS pp_interesados (
    id INT AUTO_INCREMENT PRIMARY KEY,
    proyecto_id INT NOT NULL,
    usuario_id INT NOT NULL,
    usuario_nombre VARCHAR(120) NULL,
    UNIQUE KEY (proyecto_id, usuario_id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS pp_pruebas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    proyecto_id INT NOT NULL,
    que VARCHAR(200) NOT NULL,
    pieza VARCHAR(200) NULL,
    fecha DATE NULL,
    metodo VARCHAR(400) NULL,
    resultado TEXT NULL,
    estado VARCHAR(10) NOT NULL DEFAULT 'PENDIENTE',
    decidido_por VARCHAR(120) NULL,
    decidido_at DATETIME NULL,
    decision_cargada_por VARCHAR(120) NULL,
    motivo VARCHAR(600) NULL,
    creado_por VARCHAR(120) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX (proyecto_id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS pp_eventos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    proyecto_id INT NOT NULL,
    prueba_id INT NULL,
    tipo VARCHAR(14) NOT NULL,
    texto TEXT NULL,
    archivo_id INT NULL,
    usuario_id INT NULL,
    usuario_nombre VARCHAR(120) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX (proyecto_id, created_at), INDEX (prueba_id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS pp_archivos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    proyecto_id INT NOT NULL,
    prueba_id INT NULL,
    nombre VARCHAR(255) NOT NULL,
    archivo VARCHAR(120) NOT NULL,
    mime VARCHAR(100) NULL,
    tamano INT NULL,
    miniatura VARCHAR(120) NULL,
    descripcion VARCHAR(500) NULL,
    subido_por VARCHAR(120) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX (proyecto_id), INDEX (prueba_id)
  )`);
}

async function usuario(db, req) {
  const [r] = await db.query("SELECT id, nombre, rol FROM usuarios WHERE id = ?", [req.user?.id]);
  const u = r[0];
  return u ? { id: u.id, nombre: u.nombre || "Usuario", rol: String(u.rol || "").toUpperCase() } : { id: null, nombre: "Usuario", rol: "" };
}

/** Anota en la historia y marca el proyecto como movido hoy (así no aparece como olvidado). */
async function evento(db, proyectoId, u, tipo, txt, { pruebaId = null, archivoId = null } = {}) {
  await db.query("INSERT INTO pp_eventos (proyecto_id, prueba_id, tipo, texto, archivo_id, usuario_id, usuario_nombre) VALUES (?,?,?,?,?,?,?)", [proyectoId, pruebaId, tipo, texto(txt, 6000), archivoId, u?.id ?? null, u?.nombre ?? null]);
  await db.query("UPDATE pp_proyectos SET ultimo_movimiento = NOW() WHERE id = ?", [proyectoId]);
}

const fila = (p) => ({ ...p, proximo_paso_fecha: isoDe(p.proximo_paso_fecha) });

async function proyectoCompleto(db, id, u) {
  const [[p]] = await db.query(`SELECT *, ${FECHA("proximo_paso_fecha")} AS proximo_paso_fecha, ${FECHA("fecha_objetivo")} AS fecha_objetivo FROM pp_proyectos WHERE id = ?`, [id]);
  if (!p) return null;
  const [interesados] = await db.query("SELECT usuario_id, usuario_nombre FROM pp_interesados WHERE proyecto_id = ? ORDER BY usuario_nombre", [id]);
  const [pruebas] = await db.query(`SELECT *, ${FECHA("fecha")} AS fecha FROM pp_pruebas WHERE proyecto_id = ? ORDER BY COALESCE(fecha, DATE(created_at)) DESC, id DESC`, [id]);
  const [archivos] = await db.query("SELECT id, prueba_id, nombre, mime, tamano, miniatura IS NOT NULL AS tiene_miniatura, descripcion, subido_por, created_at FROM pp_archivos WHERE proyecto_id = ? ORDER BY created_at DESC", [id]);
  const [eventos] = await db.query("SELECT * FROM pp_eventos WHERE proyecto_id = ? ORDER BY created_at DESC, id DESC LIMIT 400", [id]);
  const arch = archivos.map((a) => ({ ...a, tiene_miniatura: !!a.tiene_miniatura }));
  return {
    ...fila(p),
    interesados,
    pruebas: pruebas.map((x) => ({ ...x, archivos: arch.filter((a) => a.prueba_id === x.id), comentarios: eventos.filter((e) => e.prueba_id === x.id && e.tipo === "COMENTARIO").reverse() })),
    archivos: arch,
    eventos,
    resumen_pruebas: L.resumenPruebas(pruebas),
    salud: L.salud(p),
    sigo: interesados.some((i) => i.usuario_id === u.id),
    yo: { id: u.id, nombre: u.nombre },
  };
}

function registrarRutasProyectos(app, { db, requirePermiso, crearNotificacion, ai = null, modelo = "gemini-2.5-flash", multer, dir }) {
  const DIR = dir || path.join(__dirname, "datos", "proyectos");
  fs.mkdirSync(DIR, { recursive: true });
  const puede = requirePermiso(PERMISO);
  const err = (res, e) => {
    console.error("[proyectos]", e);
    res.status(500).json({ error: e.message || "Error inesperado." });
  };
  const cargar = async (id) => {
    const [[p]] = await db.query("SELECT * FROM pp_proyectos WHERE id = ?", [id]);
    return p || null;
  };

  /** Avisa por la campanita al responsable y a los interesados (menos a quien hizo el cambio). */
  async function avisar(p, u, titulo, txt) {
    if (!crearNotificacion) return;
    const [ids] = await db.query("SELECT usuario_id FROM pp_interesados WHERE proyecto_id = ?", [p.id]);
    const destinos = [...new Set([p.responsable_id, ...ids.map((x) => x.usuario_id)].filter((x) => x && x !== u.id))];
    if (!destinos.length) return;
    const [rs] = await db.query("SELECT DISTINCT rol FROM usuarios WHERE id IN (?) AND rol IS NOT NULL", [destinos]);
    if (!rs.length) return;
    await crearNotificacion(db, { tipo: "PROYECTOS", titulo, texto: txt, ruta: `/proyectos?p=${p.id}`, roles: rs.map((r) => r.rol), creada_por_id: u.id, push: true });
  }

  app.get("/api/proyectos/usuarios", puede, async (req, res) => {
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

  app.get("/api/proyectos", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const [ps] = await db.query(`SELECT *, ${FECHA("proximo_paso_fecha")} AS proximo_paso_fecha, ${FECHA("fecha_objetivo")} AS fecha_objetivo FROM pp_proyectos ORDER BY ultimo_movimiento DESC`);
      const [prs] = await db.query("SELECT proyecto_id, estado FROM pp_pruebas");
      const [ints] = await db.query("SELECT proyecto_id, usuario_id, usuario_nombre FROM pp_interesados");
      const [ult] = await db.query(
        `SELECT e.proyecto_id, e.texto, e.tipo, e.usuario_nombre, e.created_at FROM pp_eventos e
           JOIN (SELECT proyecto_id, MAX(id) AS id FROM pp_eventos WHERE tipo IN ('NOVEDAD','DECISION','PRUEBA','ESTADO','PASO') GROUP BY proyecto_id) m ON m.id = e.id`,
      );
      const agrupar = (l) => l.reduce((m, x) => m.set(x.proyecto_id, [...(m.get(x.proyecto_id) || []), x]), new Map());
      const prP = agrupar(prs);
      const inP = agrupar(ints);
      const ultP = new Map(ult.map((x) => [x.proyecto_id, x]));
      const lista = ps.map((p) => {
        const intereses = inP.get(p.id) || [];
        return {
          id: p.id, codigo: p.codigo, tipo: p.tipo, titulo: p.titulo, estado: p.estado, prioridad: p.prioridad, proveedor: p.proveedor,
          responsable_id: p.responsable_id, responsable_nombre: p.responsable_nombre, proximo_paso: p.proximo_paso, proximo_paso_fecha: p.proximo_paso_fecha,
          proximo_paso_quien: p.proximo_paso_quien, portada_id: p.portada_id, ultimo_movimiento: p.ultimo_movimiento,
          ultima_novedad: ultP.get(p.id) || null,
          pruebas: L.resumenPruebas(prP.get(p.id) || []),
          interesados: intereses.map((i) => i.usuario_nombre),
          salud: L.salud(p),
          mio: p.responsable_id === u.id,
          sigo: intereses.some((i) => i.usuario_id === u.id),
        };
      });
      res.json({ proyectos: lista, yo: { id: u.id, nombre: u.nombre }, dias_olvido: L.DIAS_OLVIDO });
    } catch (e) {
      err(res, e);
    }
  });

  app.post("/api/proyectos", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const b = req.body || {};
      const titulo = texto(b.titulo, 200);
      if (!titulo) return res.status(400).json({ error: "Poné un título." });
      const tipo = L.TIPOS[b.tipo] ? b.tipo : "PRUEBA";
      const estado = L.ESTADOS[b.estado] ? b.estado : tipo === "IDEA" ? "IDEA" : "EN_CURSO";
      let resp = { id: u.id, nombre: u.nombre };
      if (b.responsable_id) {
        const [[r]] = await db.query("SELECT id, nombre FROM usuarios WHERE id = ?", [b.responsable_id]);
        if (r) resp = r;
      }
      const anio = new Date().getFullYear();
      let id = null;
      let codigo = null;
      for (let i = 0; i < 5 && !id; i++) {
        const [[ult]] = await db.query("SELECT codigo FROM pp_proyectos WHERE codigo LIKE ? ORDER BY id DESC LIMIT 1", [`PP-${anio}-%`]);
        codigo = L.siguienteCodigo(ult?.codigo, anio);
        try {
          const [r] = await db.query(
            `INSERT INTO pp_proyectos (codigo, tipo, titulo, descripcion, estado, prioridad, proveedor, responsable_id, responsable_nombre, proximo_paso, proximo_paso_fecha, proximo_paso_quien, fecha_objetivo, creado_por_id, creado_por)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [codigo, tipo, titulo, texto(b.descripcion, 5000), estado, L.PRIORIDADES.includes(b.prioridad) ? b.prioridad : "MEDIA", texto(b.proveedor, 200), resp.id, resp.nombre, texto(b.proximo_paso, 300), fecha(b.proximo_paso_fecha), texto(b.proximo_paso_quien, 120) || (b.proximo_paso ? resp.nombre : null), fecha(b.fecha_objetivo), u.id, u.nombre],
          );
          id = r.insertId;
        } catch (e) {
          if (e.code !== "ER_DUP_ENTRY") throw e;
        }
      }
      const ints = [...new Set((b.interesados || []).map(Number).filter(Boolean))];
      if (ints.length) {
        const [us] = await db.query("SELECT id, nombre FROM usuarios WHERE id IN (?)", [ints]);
        for (const x of us) await db.query("INSERT IGNORE INTO pp_interesados (proyecto_id, usuario_id, usuario_nombre) VALUES (?,?,?)", [id, x.id, x.nombre]);
      }
      await evento(db, id, u, "CREADO", `Creó «${titulo}» (${L.TIPOS[tipo].toLowerCase()}).`);
      if (ints.length) await avisar({ id, responsable_id: resp.id }, u, `Nuevo: ${titulo}`, `${u.nombre} te sumó como interesado en «${titulo}».`);
      res.json({ id, codigo });
    } catch (e) {
      err(res, e);
    }
  });

  app.get("/api/proyectos/:id", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const p = await proyectoCompleto(db, Number(req.params.id), u);
      if (!p) return res.status(404).json({ error: "No existe ese proyecto." });
      res.json(p);
    } catch (e) {
      err(res, e);
    }
  });

  // Datos, estado y próximo paso. Cambiar el estado avisa al responsable y a los interesados.
  app.put("/api/proyectos/:id", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const p = await cargar(Number(req.params.id));
      if (!p) return res.status(404).json({ error: "No existe ese proyecto." });
      const b = req.body || {};
      const sets = [];
      const vals = [];
      const set = (k, v) => {
        sets.push(`${k} = ?`);
        vals.push(v);
      };
      if (b.titulo !== undefined) {
        if (!texto(b.titulo, 200)) return res.status(400).json({ error: "El título no puede quedar vacío." });
        set("titulo", texto(b.titulo, 200));
      }
      if (b.descripcion !== undefined) set("descripcion", texto(b.descripcion, 5000));
      if (b.proveedor !== undefined) set("proveedor", texto(b.proveedor, 200));
      if (b.tipo !== undefined && L.TIPOS[b.tipo]) set("tipo", b.tipo);
      if (b.prioridad !== undefined && L.PRIORIDADES.includes(b.prioridad)) set("prioridad", b.prioridad);
      if (b.fecha_objetivo !== undefined) set("fecha_objetivo", fecha(b.fecha_objetivo));
      if (b.resultado !== undefined) set("resultado", texto(b.resultado, 5000));
      if (b.portada_id !== undefined) set("portada_id", b.portada_id ? Number(b.portada_id) : null);
      if (b.responsable_id !== undefined) {
        const [[r]] = await db.query("SELECT id, nombre FROM usuarios WHERE id = ?", [b.responsable_id]);
        set("responsable_id", r?.id ?? null);
        set("responsable_nombre", r?.nombre ?? null);
      }
      let cambioEstado = null;
      if (b.estado !== undefined) {
        if (!L.ESTADOS[b.estado]) return res.status(400).json({ error: "Estado inválido." });
        if (b.estado !== p.estado) cambioEstado = b.estado;
        set("estado", b.estado);
      }
      let cambioPaso = false;
      if (b.proximo_paso !== undefined || b.proximo_paso_fecha !== undefined || b.proximo_paso_quien !== undefined) {
        const paso = b.proximo_paso !== undefined ? texto(b.proximo_paso, 300) : p.proximo_paso;
        set("proximo_paso", paso);
        const nuevaFecha = paso ? (b.proximo_paso_fecha !== undefined ? fecha(b.proximo_paso_fecha) : isoDe(p.proximo_paso_fecha)) : null;
        set("proximo_paso_fecha", nuevaFecha);
        set("proximo_paso_quien", paso ? (b.proximo_paso_quien !== undefined ? texto(b.proximo_paso_quien, 120) : p.proximo_paso_quien) : null);
        cambioPaso = paso !== p.proximo_paso || nuevaFecha !== isoDe(p.proximo_paso_fecha);
      }
      if (!sets.length) return res.json({ ok: true });
      await db.query(`UPDATE pp_proyectos SET ${sets.join(", ")} WHERE id = ?`, [...vals, p.id]);
      const p2 = await cargar(p.id);
      if (cambioEstado) {
        const fin = cambioEstado === "LOGRADO" || cambioEstado === "DESCARTADO";
        await evento(db, p.id, u, "ESTADO", `Pasó a «${L.ESTADOS[cambioEstado]}»${fin && texto(b.resultado, 5000) ? `: ${texto(b.resultado, 5000)}` : "."}`);
        await avisar(p2, u, `${p.titulo}: ${L.ESTADOS[cambioEstado]}`, `${u.nombre} lo pasó a «${L.ESTADOS[cambioEstado]}».${fin && b.resultado ? ` ${String(b.resultado).slice(0, 200)}` : ""}`);
      }
      if (cambioPaso) {
        const d = isoDe(p2.proximo_paso_fecha);
        await evento(db, p.id, u, "PASO", p2.proximo_paso ? `Próximo paso: ${p2.proximo_paso}${p2.proximo_paso_quien ? ` (${p2.proximo_paso_quien})` : ""}${d ? `, para el ${d.split("-").reverse().join("/")}` : ""}.` : "Quitó el próximo paso.");
      }
      if (!cambioEstado && !cambioPaso) {
        const cuales = Object.keys(b).filter((k) => !["proximo_paso", "proximo_paso_fecha", "proximo_paso_quien", "estado", "portada_id"].includes(k));
        if (cuales.length) await evento(db, p.id, u, "DATOS", "Actualizó los datos del proyecto.");
      }
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  // Quiénes siguen el proyecto y reciben avisos (ej. Compras, que espera el resultado de una prueba).
  app.put("/api/proyectos/:id/interesados", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const p = await cargar(Number(req.params.id));
      if (!p) return res.status(404).json({ error: "No existe ese proyecto." });
      const ids = [...new Set((req.body?.usuarios || []).map(Number).filter(Boolean))];
      const [antes] = await db.query("SELECT usuario_id FROM pp_interesados WHERE proyecto_id = ?", [p.id]);
      const [us] = ids.length ? await db.query("SELECT id, nombre FROM usuarios WHERE id IN (?)", [ids]) : [[]];
      await db.query("DELETE FROM pp_interesados WHERE proyecto_id = ?", [p.id]);
      for (const x of us) await db.query("INSERT INTO pp_interesados (proyecto_id, usuario_id, usuario_nombre) VALUES (?,?,?)", [p.id, x.id, x.nombre]);
      const nuevos = us.filter((x) => !antes.some((a) => a.usuario_id === x.id));
      await evento(db, p.id, u, "DATOS", us.length ? `Interesados: ${us.map((x) => x.nombre).join(", ")}.` : "Quitó a todos los interesados.");
      if (nuevos.length && crearNotificacion) {
        const [rs] = await db.query("SELECT DISTINCT rol FROM usuarios WHERE id IN (?) AND id <> ?", [nuevos.map((x) => x.id), u.id]);
        if (rs.length) await crearNotificacion(db, { tipo: "PROYECTOS", titulo: `Te sumaron: ${p.titulo}`, texto: `${u.nombre} te sumó para que te enteres de las novedades de «${p.titulo}».`, ruta: `/proyectos?p=${p.id}`, roles: rs.map((r) => r.rol), creada_por_id: u.id, push: true });
      }
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  // Novedad del proyecto o comentario sobre una prueba.
  app.post("/api/proyectos/:id/novedades", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const p = await cargar(Number(req.params.id));
      if (!p) return res.status(404).json({ error: "No existe ese proyecto." });
      const t = texto(req.body?.texto, 5000);
      if (!t) return res.status(400).json({ error: "Escribí la novedad." });
      let pruebaId = null;
      if (req.body?.prueba_id) {
        const [[x]] = await db.query("SELECT id, que FROM pp_pruebas WHERE id = ? AND proyecto_id = ?", [req.body.prueba_id, p.id]);
        if (!x) return res.status(404).json({ error: "No existe esa prueba." });
        pruebaId = x.id;
      }
      await evento(db, p.id, u, pruebaId ? "COMENTARIO" : "NOVEDAD", t, { pruebaId });
      if (req.body?.avisar) await avisar(p, u, `Novedad: ${p.titulo}`, `${u.nombre}: ${t.slice(0, 250)}`);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  // ------------------------------------------------------------------ pruebas
  const datosPrueba = (b, base = {}) => ({
    que: b.que !== undefined ? texto(b.que, 200) : base.que,
    pieza: b.pieza !== undefined ? texto(b.pieza, 200) : base.pieza,
    fecha: b.fecha !== undefined ? fecha(b.fecha) : base.fecha || hoyISO(),
    metodo: b.metodo !== undefined ? texto(b.metodo, 400) : base.metodo,
    resultado: b.resultado !== undefined ? texto(b.resultado, 4000) : base.resultado,
  });
  app.post("/api/proyectos/:id/pruebas", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const p = await cargar(Number(req.params.id));
      if (!p) return res.status(404).json({ error: "No existe ese proyecto." });
      const d = datosPrueba(req.body || {});
      if (!d.que) return res.status(400).json({ error: "Indicá qué se prueba." });
      const [r] = await db.query("INSERT INTO pp_pruebas (proyecto_id, que, pieza, fecha, metodo, resultado, creado_por) VALUES (?,?,?,?,?,?,?)", [p.id, d.que, d.pieza, d.fecha, d.metodo, d.resultado, u.nombre]);
      await evento(db, p.id, u, "PRUEBA", `Cargó la prueba «${d.que}»${d.pieza ? ` en ${d.pieza}` : ""}.`, { pruebaId: r.insertId });
      res.json({ id: r.insertId });
    } catch (e) {
      err(res, e);
    }
  });
  app.put("/api/proyectos/pruebas/:id", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const [[x]] = await db.query(`SELECT *, ${FECHA("fecha")} AS fecha FROM pp_pruebas WHERE id = ?`, [Number(req.params.id)]);
      if (!x) return res.status(404).json({ error: "No existe esa prueba." });
      const d = datosPrueba(req.body || {}, x);
      if (!d.que) return res.status(400).json({ error: "Indicá qué se prueba." });
      await db.query("UPDATE pp_pruebas SET que = ?, pieza = ?, fecha = ?, metodo = ?, resultado = ? WHERE id = ?", [d.que, d.pieza, d.fecha, d.metodo, d.resultado, x.id]);
      if ((d.resultado || "") !== (x.resultado || "")) await evento(db, x.proyecto_id, u, "PRUEBA", `Resultado de «${d.que}»: ${d.resultado || "(sin resultado)"}`, { pruebaId: x.id });
      else await db.query("UPDATE pp_proyectos SET ultimo_movimiento = NOW() WHERE id = ?", [x.proyecto_id]);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });
  app.delete("/api/proyectos/pruebas/:id", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const [[x]] = await db.query("SELECT * FROM pp_pruebas WHERE id = ?", [Number(req.params.id)]);
      if (!x) return res.status(404).json({ error: "No existe esa prueba." });
      await db.query("DELETE FROM pp_pruebas WHERE id = ?", [x.id]);
      await db.query("UPDATE pp_archivos SET prueba_id = NULL WHERE prueba_id = ?", [x.id]); // las fotos quedan en el proyecto
      await evento(db, x.proyecto_id, u, "PRUEBA", `Borró la prueba «${x.que}» (sus fotos quedan en Archivos).`);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  // Aprobar, rechazar (con motivo) o volver a pendiente. "Aprobado por" es libre: puede ser alguien de afuera de la app.
  app.post("/api/proyectos/pruebas/:id/decidir", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const [[x]] = await db.query("SELECT * FROM pp_pruebas WHERE id = ?", [Number(req.params.id)]);
      if (!x) return res.status(404).json({ error: "No existe esa prueba." });
      const decision = req.body?.decision;
      if (!L.ESTADOS_PRUEBA.includes(decision)) return res.status(400).json({ error: "Decisión inválida." });
      const motivo = texto(req.body?.motivo, 600);
      if (decision === "RECHAZADA" && !motivo) return res.status(400).json({ error: "Contá por qué se rechaza." });
      const quien = texto(req.body?.nombre, 120) || u.nombre;
      const f = req.body?.fecha ? fecha(req.body.fecha) : null;
      if (req.body?.fecha && !f) return res.status(400).json({ error: "Fecha inválida." });
      if (f && f > hoyISO()) return res.status(400).json({ error: "La fecha no puede ser futura." });
      if (decision === "PENDIENTE") {
        await db.query("UPDATE pp_pruebas SET estado = 'PENDIENTE', decidido_por = NULL, decidido_at = NULL, decision_cargada_por = NULL, motivo = NULL WHERE id = ?", [x.id]);
        await evento(db, x.proyecto_id, u, "DECISION", `Volvió a pendiente la prueba «${x.que}».`, { pruebaId: x.id });
        return res.json({ ok: true });
      }
      await db.query(`UPDATE pp_pruebas SET estado = ?, decidido_por = ?, decidido_at = ${f ? "?" : "NOW()"}, decision_cargada_por = ?, motivo = ? WHERE id = ?`, [decision, quien, ...(f ? [`${f} 12:00:00`] : []), quien === u.nombre ? null : u.nombre, motivo, x.id]);
      const verbo = decision === "APROBADA" ? "aprobó" : "rechazó";
      const txt = `${quien} ${verbo} la prueba «${x.que}»${x.pieza ? ` (${x.pieza})` : ""}${motivo ? `: ${motivo}` : "."}${quien !== u.nombre ? ` (lo cargó ${u.nombre})` : ""}`;
      await evento(db, x.proyecto_id, u, "DECISION", txt, { pruebaId: x.id });
      const p = await cargar(x.proyecto_id);
      await avisar(p, u, `Prueba ${decision === "APROBADA" ? "aprobada" : "rechazada"}: ${p.titulo}`, txt);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  // ------------------------------------------------------------------ archivos (fotos, videos, documentos)
  const subir = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ARCHIVO, files: 12 } });
  app.post("/api/proyectos/:id/archivos", puede, (req, res, next) => {
    subir.array("archivos", 12)(req, res, (e) => {
      if (e) return res.status(e.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: e.code === "LIMIT_FILE_SIZE" ? "Un archivo pesa más de 25 MB." : "No se pudieron recibir los archivos." });
      next();
    });
  }, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const p = await cargar(Number(req.params.id));
      if (!p) return res.status(404).json({ error: "No existe ese proyecto." });
      const files = req.files || [];
      if (!files.length) return res.status(400).json({ error: "No llegó ningún archivo." });
      let pruebaId = null;
      if (req.body?.prueba_id) {
        const [[x]] = await db.query("SELECT id FROM pp_pruebas WHERE id = ? AND proyecto_id = ?", [req.body.prueba_id, p.id]);
        pruebaId = x?.id ?? null;
      }
      const carpeta = path.join(DIR, String(p.id));
      fs.mkdirSync(carpeta, { recursive: true });
      const nuevos = [];
      for (const f of files) {
        const nombre = Buffer.from(f.originalname || "archivo", "latin1").toString("utf8").slice(0, 255);
        const ext = (path.extname(nombre).toLowerCase().match(/^\.[a-z0-9]{1,8}$/) || [""])[0];
        const archivo = `${crypto.randomBytes(12).toString("hex")}${ext}`;
        fs.writeFileSync(path.join(carpeta, archivo), f.buffer);
        let miniatura = null;
        if (/^image\//.test(f.mimetype || "")) {
          try {
            const sharp = require("sharp");
            miniatura = `${archivo}.min.jpg`;
            await sharp(f.buffer).rotate().resize(640, 640, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toFile(path.join(carpeta, miniatura));
          } catch {
            miniatura = null;
          }
        }
        const [r] = await db.query("INSERT INTO pp_archivos (proyecto_id, prueba_id, nombre, archivo, mime, tamano, miniatura, descripcion, subido_por) VALUES (?,?,?,?,?,?,?,?,?)", [p.id, pruebaId, nombre, archivo, f.mimetype || null, f.size || null, miniatura, texto(req.body?.descripcion, 500), u.nombre]);
        nuevos.push({ id: r.insertId, nombre, foto: !!miniatura });
      }
      await evento(db, p.id, u, "ARCHIVO", nuevos.length === 1 ? `Subió «${nuevos[0].nombre}».` : `Subió ${nuevos.length} archivos.`, { pruebaId, archivoId: nuevos[0].id });
      const foto = nuevos.find((n) => n.foto);
      if (!p.portada_id && foto) await db.query("UPDATE pp_proyectos SET portada_id = ? WHERE id = ?", [foto.id, p.id]);
      res.json({ ok: true, archivos: nuevos });
    } catch (e) {
      err(res, e);
    }
  });
  const enviarArchivo = (mini) => async (req, res) => {
    try {
      const [[a]] = await db.query("SELECT * FROM pp_archivos WHERE id = ?", [Number(req.params.id)]);
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
  app.get("/api/proyectos/archivos/:id", puede, enviarArchivo(false));
  app.get("/api/proyectos/archivos/:id/miniatura", puede, enviarArchivo(true));
  app.put("/api/proyectos/archivos/:id", puede, async (req, res) => {
    try {
      const [[a]] = await db.query("SELECT * FROM pp_archivos WHERE id = ?", [Number(req.params.id)]);
      if (!a) return res.status(404).json({ error: "No existe ese archivo." });
      if (req.body?.descripcion !== undefined) await db.query("UPDATE pp_archivos SET descripcion = ? WHERE id = ?", [texto(req.body.descripcion, 500), a.id]);
      if (req.body?.prueba_id !== undefined) await db.query("UPDATE pp_archivos SET prueba_id = ? WHERE id = ?", [req.body.prueba_id ? Number(req.body.prueba_id) : null, a.id]);
      if (req.body?.portada) await db.query("UPDATE pp_proyectos SET portada_id = ? WHERE id = ?", [a.id, a.proyecto_id]);
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });
  app.delete("/api/proyectos/archivos/:id", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const [[a]] = await db.query("SELECT * FROM pp_archivos WHERE id = ?", [Number(req.params.id)]);
      if (!a) return res.status(404).json({ error: "No existe ese archivo." });
      await db.query("DELETE FROM pp_archivos WHERE id = ?", [a.id]);
      await db.query("UPDATE pp_proyectos SET portada_id = NULL WHERE id = ? AND portada_id = ?", [a.proyecto_id, a.id]);
      const carpeta = path.join(DIR, String(a.proyecto_id));
      fs.mkdirSync(path.join(carpeta, "papelera"), { recursive: true });
      for (const f of [a.archivo, a.miniatura].filter(Boolean)) {
        try {
          fs.renameSync(path.join(carpeta, f), path.join(carpeta, "papelera", f));
        } catch {
          /* ya no estaba */
        }
      }
      await evento(db, a.proyecto_id, u, "ARCHIVO", `Quitó «${a.nombre}».`, { pruebaId: a.prueba_id });
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  // ------------------------------------------------------------------ IA
  const pedirIA = async (prompt) => {
    const r = await ai.models.generateContent({ model: modelo, contents: prompt, config: { temperature: 0.2, responseMimeType: "application/json" } });
    return JSON.parse(String(r.text || "").replace(/^```(?:json)?\s*|\s*```$/g, ""));
  };

  // Contar una novedad en texto libre (o dictada): la IA la ordena en novedad, estado, próximo paso y pruebas.
  app.post("/api/proyectos/:id/asistente", puede, async (req, res) => {
    try {
      if (!ai) return res.status(503).json({ error: "La IA no está disponible en este servidor." });
      const p = await cargar(Number(req.params.id));
      if (!p) return res.status(404).json({ error: "No existe ese proyecto." });
      const t = texto(req.body?.texto, 6000);
      if (!t) return res.status(400).json({ error: "Escribí o dictá qué pasó." });
      const prompt = `Sos el asistente de seguimiento de proyectos de Conoflex (fábrica argentina de productos plásticos de seguridad vial).
Proyecto: ${p.titulo} (${L.TIPOS[p.tipo]}${p.proveedor ? `, proveedor ${p.proveedor}` : ""}). Estado actual: ${L.ESTADOS[p.estado]}. Próximo paso actual: ${p.proximo_paso || "ninguno"}.
Hoy es ${hoyISO()}.

Una persona contó esto (puede ser dictado, con errores):
"""${t}"""

Devolvé solo JSON con:
- "novedad": lo que pasó, prolijo y en español rioplatense, sin inventar datos (números y nombres tal cual).
- "resumen": una oración corta.
- "estado": solo si lo que contó cambia el estado (uno de ${Object.keys(L.ESTADOS).join(", ")}); si no, null.
- "proximo_paso": si se desprende qué hay que hacer ahora, en una frase; si no, null. "proximo_paso_fecha": AAAA-MM-DD solo si dijo una fecha o plazo concreto; si no, null.
- "pruebas": si menciona pruebas o ensayos, cada una con "que" (qué se probó), "pieza" (en qué pieza o producto), "metodo", "resultado", "estado" (APROBADA, RECHAZADA o PENDIENTE si no hay veredicto) y "motivo" (por qué se rechazó, si corresponde). No inventes lo que no dijo.`;
      let s;
      try {
        s = await pedirIA(prompt);
      } catch {
        return res.status(502).json({ error: "La IA no devolvió algo entendible. Probá de nuevo." });
      }
      res.json({ texto: t, ...L.limpiarSugerencia(s) });
    } catch (e) {
      err(res, e);
    }
  });
  app.post("/api/proyectos/:id/asistente/aplicar", puede, async (req, res) => {
    try {
      const u = await usuario(db, req);
      const p = await cargar(Number(req.params.id));
      if (!p) return res.status(404).json({ error: "No existe ese proyecto." });
      const s = L.limpiarSugerencia(req.body || {});
      await evento(db, p.id, u, "NOVEDAD", s.novedad || texto(req.body?.texto, 5000) || s.resumen);
      for (const x of s.pruebas) {
        const decidida = x.estado !== "PENDIENTE";
        const [r] = await db.query(
          "INSERT INTO pp_pruebas (proyecto_id, que, pieza, fecha, metodo, resultado, estado, decidido_por, decidido_at, motivo, creado_por) VALUES (?,?,?,CURDATE(),?,?,?,?,?,?,?)",
          [p.id, x.que, x.pieza || null, x.metodo || null, x.resultado || null, x.estado, decidida ? u.nombre : null, decidida ? new Date() : null, x.motivo || null, u.nombre],
        );
        await evento(db, p.id, u, decidida ? "DECISION" : "PRUEBA", decidida ? `${u.nombre} ${x.estado === "APROBADA" ? "aprobó" : "rechazó"} la prueba «${x.que}»${x.motivo ? `: ${x.motivo}` : "."}` : `Cargó la prueba «${x.que}».`, { pruebaId: r.insertId });
      }
      const sets = [];
      const vals = [];
      if (s.estado && s.estado !== p.estado) {
        sets.push("estado = ?");
        vals.push(s.estado);
      }
      if (s.proximo_paso) {
        sets.push("proximo_paso = ?", "proximo_paso_fecha = ?", "proximo_paso_quien = ?");
        vals.push(s.proximo_paso, s.proximo_paso_fecha, p.responsable_nombre);
      }
      if (sets.length) await db.query(`UPDATE pp_proyectos SET ${sets.join(", ")} WHERE id = ?`, [...vals, p.id]);
      if (s.estado && s.estado !== p.estado) await evento(db, p.id, u, "ESTADO", `Pasó a «${L.ESTADOS[s.estado]}».`);
      if (s.proximo_paso) await evento(db, p.id, u, "PASO", `Próximo paso: ${s.proximo_paso}${s.proximo_paso_fecha ? `, para el ${s.proximo_paso_fecha.split("-").reverse().join("/")}` : ""}.`);
      if (s.pruebas.some((x) => x.estado !== "PENDIENTE") || (s.estado && s.estado !== p.estado)) await avisar(await cargar(p.id), u, `Novedad: ${p.titulo}`, s.resumen || s.novedad.slice(0, 250));
      res.json({ ok: true });
    } catch (e) {
      err(res, e);
    }
  });

  // "¿En qué quedó?": la IA lee toda la historia y lo cuenta en pocas líneas.
  app.post("/api/proyectos/:id/resumen-ia", puede, async (req, res) => {
    try {
      if (!ai) return res.status(503).json({ error: "La IA no está disponible en este servidor." });
      const u = await usuario(db, req);
      const p = await proyectoCompleto(db, Number(req.params.id), u);
      if (!p) return res.status(404).json({ error: "No existe ese proyecto." });
      const historia = [...p.eventos].reverse().slice(-80).map((e) => `${String(new Date(e.created_at).toISOString()).slice(0, 10)} · ${e.usuario_nombre || "?"}: ${e.texto}`).join("\n");
      const pruebas = p.pruebas.map((x) => `- ${x.que}${x.pieza ? ` (${x.pieza})` : ""}: ${x.estado}${x.decidido_por ? ` por ${x.decidido_por}` : ""}${x.resultado ? `; resultado: ${x.resultado}` : ""}${x.motivo ? `; motivo: ${x.motivo}` : ""}`).join("\n");
      const prompt = `Sos el asistente de Conoflex. Contale a un jefe que perdió el rastro en qué quedó este proyecto. Hoy es ${hoyISO()}.
Proyecto: ${p.titulo} (${L.TIPOS[p.tipo]}${p.proveedor ? `, proveedor ${p.proveedor}` : ""}). Estado: ${L.ESTADOS[p.estado]}. Responsable: ${p.responsable_nombre || "—"}. Próximo paso: ${p.proximo_paso || "ninguno"}${p.proximo_paso_fecha ? ` (${p.proximo_paso_fecha})` : ""}.
Descripción: ${p.descripcion || "—"}
Pruebas:
${pruebas || "ninguna"}
Historia (de la más vieja a la más nueva):
${historia}

Respondé solo JSON: {"en_que_quedo": "2 a 4 oraciones claras en español rioplatense: qué se hizo, cuál fue lo último que pasó y con qué fecha, qué está pendiente y de quién depende", "sugerencia": "una acción concreta para destrabarlo o cerrarlo, o null"}. No inventes nada que no esté en los datos.`;
      let s;
      try {
        s = await pedirIA(prompt);
      } catch {
        return res.status(502).json({ error: "La IA no devolvió algo entendible. Probá de nuevo." });
      }
      res.json({ en_que_quedo: String(s?.en_que_quedo || "").slice(0, 1200), sugerencia: s?.sugerencia ? String(s.sugerencia).slice(0, 400) : null });
    } catch (e) {
      err(res, e);
    }
  });
}

module.exports = { PERMISO, asegurarTablasProyectos, registrarRutasProyectos, proyectoCompleto };
