"use strict";
// Módulo de agentes: cada agente tiene una especialidad, un permiso propio (agente:<id>) que se da por rol,
// un vigilante sin IA que corre solo, un registro de actividad y, si corresponde, un chat con IA.
// Hoy: "rrhh" (Lía). No toca a Connie: solo reutiliza su motor de IA y sus funciones de liquidación.
const { analizarRRHH, AUTORESOLVIBLES } = require("./vigilanteRRHH");
const { crearLia } = require("./liaChat");
const { crearNotificacion } = require("../notificaciones");

const AGENTES = [
  {
    id: "rrhh",
    nombre: "Lía",
    puesto: "RRHH y liquidaciones",
    descripcion: "Liquida horas y sueldos igual que Connie, y vigila presentismo, feriados, fichadas y faltas.",
    permiso: "agente:rrhh",
    color: "#FF5A00",
  },
];
const agentePorId = (id) => AGENTES.find((a) => a.id === id) || null;

async function asegurarTablasAgentes(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS agentes_estado (
      agente VARCHAR(30) PRIMARY KEY,
      ultima_revision DATETIME NULL,
      resumen VARCHAR(500) NULL,
      operarios_revisados INT NULL,
      ultimo_error VARCHAR(300) NULL
    )`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS agentes_actividad (
      id INT AUTO_INCREMENT PRIMARY KEY,
      agente VARCHAR(30) NOT NULL,
      tipo VARCHAR(20) NOT NULL,
      titulo VARCHAR(255) NOT NULL,
      detalle TEXT NULL,
      usuario VARCHAR(120) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_agente (agente, id)
    )`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS agentes_hallazgos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      agente VARCHAR(30) NOT NULL,
      clave VARCHAR(190) NOT NULL,
      tipo VARCHAR(30) NOT NULL,
      severidad VARCHAR(10) NOT NULL DEFAULT 'MEDIA',
      titulo VARCHAR(255) NOT NULL,
      texto TEXT NULL,
      operario VARCHAR(120) NULL,
      fecha DATE NULL,
      estado VARCHAR(15) NOT NULL DEFAULT 'ABIERTO',
      nota VARCHAR(300) NULL,
      resuelto_por VARCHAR(120) NULL,
      resuelto_en DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_agente_clave (agente, clave),
      KEY idx_estado (agente, estado)
    )`);
}

/** Hora actual de Argentina como { hoy:'YYYY-MM-DD', ahoraMs } en el mismo "reloj naive" que usan los turnos. */
function ahoraArgentina(fecha = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(fecha).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]),
  );
  const h = Number(p.hour) % 24;
  return { hoy: `${p.year}-${p.month}-${p.day}`, ahoraMs: new Date(Number(p.year), Number(p.month) - 1, Number(p.day), h, Number(p.minute)).getTime() };
}

async function registrarActividad(db, agente, tipo, titulo, detalle = null, usuario = null) {
  try {
    await db.query("INSERT INTO agentes_actividad (agente, tipo, titulo, detalle, usuario) VALUES (?,?,?,?,?)", [
      agente, tipo, String(titulo).slice(0, 255), detalle ? String(detalle).slice(0, 4000) : null, usuario ? String(usuario).slice(0, 120) : null,
    ]);
  } catch (e) {
    console.error("[agentes] no se pudo registrar la actividad:", e.message);
  }
}

async function rolesDelAgente(db, permiso) {
  const [rows] = await db.query("SELECT DISTINCT rol_nombre FROM permisos_roles WHERE modulo_id IN (?, '*')", [permiso]);
  return ["ADMIN", ...rows.map((r) => r.rol_nombre)];
}

/** Revisión del vigilante de RRHH: lee, analiza, guarda avisos nuevos, cierra los que se resolvieron y notifica. */
async function revisarRRHH({ pool, db }, { ahora = new Date() } = {}) {
  const agente = "rrhh";
  const { hoy, ahoraMs } = ahoraArgentina(ahora);
  const desde = new Date(ahoraMs - 46 * 86400000);
  const desdeTxt = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, "0")}-${String(desde.getDate()).padStart(2, "0")} 00:00:00`;
  try {
    const [fichadas] = await pool.query("SELECT nombre, tipo, fecha_hora FROM fichadas WHERE fecha_hora >= ? ORDER BY fecha_hora", [desdeTxt]);
    const [feriadosRows] = await pool.query("SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, descripcion FROM fichero_feriados");
    const [ajustes] = await pool.query("SELECT nombre_operario, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, TIME_FORMAT(hora_inicio_pactada, '%H:%i') AS hora_inicio_pactada FROM fichero_ajustes_dias");
    const [cats] = await pool.query("SELECT nombre_operario, categoria_codigo FROM fichero_operarios_categorias");
    const encontrados = analizarRRHH({
      hoy, ahoraMs, fichadas,
      feriados: new Map(feriadosRows.map((r) => [r.fecha, r.descripcion || ""])),
      ajustes,
      categorias: new Map(cats.filter((c) => c.categoria_codigo).map((c) => [c.nombre_operario, c.categoria_codigo])),
    });

    const [previos] = await db.query("SELECT id, clave, tipo, estado FROM agentes_hallazgos WHERE agente = ?", [agente]);
    const porClave = new Map(previos.map((p) => [p.clave, p]));
    const claves = new Set(encontrados.map((h) => h.clave));
    const nuevos = [];
    for (const h of encontrados) {
      const previo = porClave.get(h.clave);
      if (!previo) {
        await db.query(
          "INSERT INTO agentes_hallazgos (agente, clave, tipo, severidad, titulo, texto, operario, fecha) VALUES (?,?,?,?,?,?,?,?)",
          [agente, h.clave, h.tipo, h.severidad, h.titulo, h.texto, h.operario, h.fecha],
        );
        nuevos.push(h);
      } else if (previo.estado === "ABIERTO") {
        await db.query("UPDATE agentes_hallazgos SET severidad = ?, titulo = ?, texto = ? WHERE id = ?", [h.severidad, h.titulo, h.texto, previo.id]);
      }
    }
    const resueltos = previos.filter((p) => p.estado === "ABIERTO" && AUTORESOLVIBLES.has(p.tipo) && !claves.has(p.clave));
    for (const r of resueltos) {
      await db.query("UPDATE agentes_hallazgos SET estado = 'RESUELTO', resuelto_por = 'Lía (automático)', resuelto_en = NOW() WHERE id = ?", [r.id]);
    }

    if (nuevos.length) {
      const roles = await rolesDelAgente(db, "agente:rrhh");
      const aviso = (titulo, texto) => crearNotificacion(db, { tipo: "AGENTE_RRHH", titulo, texto, ruta: "/agentes", roles });
      if (nuevos.length <= 3) for (const h of nuevos) await aviso(`Lía: ${h.titulo}`, h.texto);
      else await aviso(`Lía encontró ${nuevos.length} avisos nuevos`, nuevos.slice(0, 3).map((h) => h.titulo).join(" · ") + (nuevos.length > 3 ? ` · y ${nuevos.length - 3} más` : ""));
      await registrarActividad(db, agente, "AVISO", `Detectó ${nuevos.length} ${nuevos.length === 1 ? "aviso nuevo" : "avisos nuevos"}`, nuevos.map((h) => `• ${h.titulo}`).join("\n"));
    }
    if (resueltos.length) {
      await registrarActividad(db, agente, "RESUELTO", `Cerró ${resueltos.length} ${resueltos.length === 1 ? "aviso que ya se resolvió" : "avisos que ya se resolvieron"}`);
    }

    const operarios = new Set(fichadas.map((f) => f.nombre)).size;
    const abiertos = (await db.query("SELECT COUNT(*) AS n FROM agentes_hallazgos WHERE agente = ? AND estado = 'ABIERTO'", [agente]))[0][0].n;
    const resumen = abiertos
      ? `Revisé ${operarios} ${operarios === 1 ? "operario" : "operarios"}: hay ${abiertos} ${Number(abiertos) === 1 ? "aviso abierto" : "avisos abiertos"}.`
      : `Revisé ${operarios} ${operarios === 1 ? "operario" : "operarios"}: todo en orden.`;
    await db.query(
      "INSERT INTO agentes_estado (agente, ultima_revision, resumen, operarios_revisados, ultimo_error) VALUES (?, NOW(), ?, ?, NULL) ON DUPLICATE KEY UPDATE ultima_revision = NOW(), resumen = VALUES(resumen), operarios_revisados = VALUES(operarios_revisados), ultimo_error = NULL",
      [agente, resumen, operarios],
    );
    return { ok: true, operarios, nuevos: nuevos.length, resueltos: resueltos.length, abiertos: Number(abiertos), resumen };
  } catch (e) {
    console.error("[agentes] revisión de RRHH falló:", e.message);
    await db.query(
      "INSERT INTO agentes_estado (agente, ultimo_error) VALUES (?, ?) ON DUPLICATE KEY UPDATE ultimo_error = VALUES(ultimo_error)",
      [agente, String(e.message).slice(0, 300)],
    ).catch(() => {});
    return { ok: false, error: "No pude revisar las fichadas en este momento." };
  }
}

function registrarRutasAgentes(app, { db, pool, ai }) {
  const lia = crearLia({ pool, db, ai });

  const quien = async (req) => {
    const [r] = await db.query("SELECT id, nombre, rol FROM usuarios WHERE id = ?", [req.user?.id]);
    return r[0] || null;
  };
  const tienePermiso = async (usuario, permiso) => {
    if (!usuario) return false;
    if (String(usuario.rol || "").toUpperCase() === "ADMIN") return true;
    const [r] = await db.query("SELECT 1 FROM permisos_roles WHERE rol_nombre = ? AND modulo_id IN (?, '*') LIMIT 1", [usuario.rol, permiso]);
    return r.length > 0;
  };
  // Middleware: el agente existe y el rol del usuario lo tiene habilitado.
  const delAgente = async (req, res, next) => {
    try {
      const agente = agentePorId(req.params.id);
      if (!agente) return res.status(404).json({ error: "Ese agente no existe." });
      const usuario = await quien(req);
      if (!(await tienePermiso(usuario, agente.permiso))) return res.status(403).json({ error: "Tu rol no tiene habilitado este agente." });
      req.agente = agente;
      req.usuario = usuario;
      next();
    } catch (e) {
      console.error("[agentes] permiso:", e.message);
      res.status(500).json({ error: "No se pudo verificar el permiso." });
    }
  };

  app.get("/api/agentes", async (req, res) => {
    try {
      const usuario = await quien(req);
      const visibles = [];
      for (const a of AGENTES) if (await tienePermiso(usuario, a.permiso)) visibles.push(a);
      const resultado = [];
      for (const a of visibles) {
        const [estRows] = await db.query("SELECT ultima_revision, resumen FROM agentes_estado WHERE agente = ?", [a.id]);
        const est = estRows[0];
        const [[ab]] = await db.query("SELECT COUNT(*) AS n FROM agentes_hallazgos WHERE agente = ? AND estado = 'ABIERTO'", [a.id]);
        resultado.push({ id: a.id, nombre: a.nombre, puesto: a.puesto, descripcion: a.descripcion, color: a.color, ultima_revision: est?.ultima_revision || null, resumen: est?.resumen || null, abiertos: Number(ab.n) });
      }
      res.json(resultado);
    } catch (e) {
      console.error("[agentes] lista:", e.message);
      res.status(500).json({ error: "No se pudieron cargar los agentes." });
    }
  });

  app.get("/api/agentes/:id/estado", delAgente, async (req, res) => {
    try {
      const [est] = await db.query("SELECT ultima_revision, resumen, operarios_revisados, ultimo_error FROM agentes_estado WHERE agente = ?", [req.agente.id]);
      const [[ab]] = await db.query("SELECT COUNT(*) AS n, SUM(severidad = 'ALTA') AS altas FROM agentes_hallazgos WHERE agente = ? AND estado = 'ABIERTO'", [req.agente.id]);
      const [ult] = await db.query("SELECT tipo, titulo, created_at FROM agentes_actividad WHERE agente = ? ORDER BY id DESC LIMIT 1", [req.agente.id]);
      res.json({ agente: { id: req.agente.id, nombre: req.agente.nombre, puesto: req.agente.puesto, descripcion: req.agente.descripcion }, ...(est[0] || { ultima_revision: null, resumen: null, operarios_revisados: null, ultimo_error: null }), abiertos: Number(ab.n), altas: Number(ab.altas || 0), ultima_accion: ult[0] || null });
    } catch (e) {
      res.status(500).json({ error: "No se pudo cargar el estado." });
    }
  });

  app.get("/api/agentes/:id/hallazgos", delAgente, async (req, res) => {
    try {
      const todos = req.query.estado === "todos";
      const [rows] = await db.query(
        `SELECT id, tipo, severidad, titulo, texto, operario, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, estado, nota, resuelto_por, resuelto_en, created_at
           FROM agentes_hallazgos WHERE agente = ? ${todos ? "" : "AND estado = 'ABIERTO'"}
          ORDER BY (estado = 'ABIERTO') DESC, FIELD(severidad,'ALTA','MEDIA','BAJA'), id DESC LIMIT 200`,
        [req.agente.id],
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "No se pudieron cargar los avisos." });
    }
  });

  const ESTADOS_MANUALES = new Set(["ABIERTO", "RESUELTO", "JUSTIFICADA", "DESCARTADA"]);
  app.put("/api/agentes/:id/hallazgos/:hid", delAgente, async (req, res) => {
    try {
      const estado = String(req.body?.estado || "").toUpperCase();
      if (!ESTADOS_MANUALES.has(estado)) return res.status(400).json({ error: "Estado inválido." });
      const nota = req.body?.nota ? String(req.body.nota).trim().slice(0, 300) : null;
      const [[h]] = await db.query("SELECT id, titulo, estado, tipo FROM agentes_hallazgos WHERE id = ? AND agente = ?", [req.params.hid, req.agente.id]);
      if (!h) return res.status(404).json({ error: "No encontré ese aviso." });
      if (estado === "JUSTIFICADA" && h.tipo !== "POSIBLE_FALTA") return res.status(400).json({ error: "Solo las faltas se pueden marcar como justificadas." });
      if (estado === "ABIERTO") await db.query("UPDATE agentes_hallazgos SET estado = 'ABIERTO', nota = ?, resuelto_por = NULL, resuelto_en = NULL WHERE id = ?", [nota, h.id]);
      else await db.query("UPDATE agentes_hallazgos SET estado = ?, nota = ?, resuelto_por = ?, resuelto_en = NOW() WHERE id = ?", [estado, nota, req.usuario.nombre, h.id]);
      const verbo = { RESUELTO: "marcó como resuelto", JUSTIFICADA: "justificó la falta", DESCARTADA: "descartó", ABIERTO: "reabrió" }[estado];
      await registrarActividad(db, req.agente.id, "GESTION", `${req.usuario.nombre} ${verbo}: ${h.titulo}`, nota, req.usuario.nombre);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "No se pudo actualizar el aviso." });
    }
  });

  app.get("/api/agentes/:id/actividad", delAgente, async (req, res) => {
    try {
      const limite = Math.min(100, Math.max(1, Number(req.query.limite) || 40));
      const [rows] = await db.query("SELECT id, tipo, titulo, detalle, usuario, created_at FROM agentes_actividad WHERE agente = ? ORDER BY id DESC LIMIT ?", [req.agente.id, limite]);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "No se pudo cargar la actividad." });
    }
  });

  let revisando = false;
  app.post("/api/agentes/:id/revisar", delAgente, async (req, res) => {
    if (req.agente.id !== "rrhh") return res.status(400).json({ error: "Este agente no tiene vigilante." });
    if (revisando) return res.status(429).json({ error: "Ya estoy revisando, esperá un momento." });
    revisando = true;
    try {
      const r = await revisarRRHH({ pool, db });
      if (r.ok) await registrarActividad(db, "rrhh", "REVISION", `Revisión pedida por ${req.usuario.nombre}`, r.resumen, req.usuario.nombre);
      res.status(r.ok ? 200 : 500).json(r);
    } finally {
      revisando = false;
    }
  });

  // Límite por usuario (igual criterio que Connie): una consulta a la vez y un tope cada 5 minutos.
  const CONFIG_LIMITE = Number(process.env.AGENTES_LIMITE_PEDIDOS) || 20;
  const uso = new Map();
  const controlarUso = (id) => {
    const ahora = Date.now();
    const e = uso.get(id) || { marcas: [], enCurso: false };
    e.marcas = e.marcas.filter((t) => ahora - t < 5 * 60 * 1000);
    uso.set(id, e);
    if (e.enCurso) return { ok: false, error: "Todavía estoy procesando tu consulta anterior." };
    if (e.marcas.length >= CONFIG_LIMITE) return { ok: false, error: "Hiciste muchas consultas seguidas. Esperá unos minutos y seguimos." };
    e.marcas.push(ahora);
    e.enCurso = true;
    return { ok: true, liberar: () => (e.enCurso = false) };
  };
  app.post("/api/agentes/:id/chat", delAgente, async (req, res) => {
    if (req.agente.id !== "rrhh") return res.status(400).json({ error: "Este agente todavía no conversa." });
    const mensaje = String(req.body?.mensaje || "").trim().slice(0, 2000);
    if (!mensaje) return res.status(400).json({ error: "Escribile algo a Lía." });
    const u = controlarUso(req.usuario.id);
    if (!u.ok) return res.status(429).json({ error: u.error });
    try {
      const r = await lia.responder({ mensaje, historial: req.body?.historial });
      const hechas = r.herramientas.filter((h) => h.nombre !== "calculadora");
      await registrarActividad(
        db, "rrhh", hechas.some((h) => h.nombre === "liquidar_horas") ? "LIQUIDACION" : "CHAT",
        hechas.length ? `${hechas[0].texto}${hechas[0].operario ? " de " + hechas[0].operario : ""}${hechas[0].periodo ? " (" + hechas[0].periodo + ")" : ""}` : "Respondió una consulta",
        `Consulta de ${req.usuario.nombre}: ${mensaje.slice(0, 200)}`, req.usuario.nombre,
      );
      res.json({ success: true, respuesta: r.respuesta, herramientas: r.herramientas, ms: r.ms });
    } catch (error) {
      console.error("[Lía] Error:", error);
      const saturado = error && (error.status === 503 || error.status === 429);
      res.status(saturado ? 503 : 500).json({ error: saturado ? "El servicio de IA está saturado. Probá de nuevo en unos segundos." : "Error al procesar la consulta." });
    } finally {
      u.liberar();
    }
  });

  return { revisarRRHH: () => revisarRRHH({ pool, db }) };
}

/** Deja corriendo el vigilante: una revisión poco después de arrancar y luego cada N minutos (sin IA, solo consultas). */
function iniciarVigilantes(agentes, { intervaloMin = Number(process.env.AGENTES_INTERVALO_MIN) || 30 } = {}) {
  if (String(process.env.AGENTES_VIGILANTE || "").toLowerCase() === "off") return () => {};
  const correr = () => agentes.revisarRRHH().catch((e) => console.error("[agentes] vigilante:", e.message));
  const t0 = setTimeout(correr, 20000);
  const t = setInterval(correr, Math.max(5, intervaloMin) * 60 * 1000);
  t0.unref?.();
  t.unref?.();
  return () => {
    clearTimeout(t0);
    clearInterval(t);
  };
}

module.exports = { AGENTES, agentePorId, asegurarTablasAgentes, registrarRutasAgentes, iniciarVigilantes, revisarRRHH, ahoraArgentina };
