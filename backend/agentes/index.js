"use strict";
// Módulo de agentes: cada agente tiene una especialidad, un permiso propio (agente:<id>) que se da por rol,
// un vigilante sin IA que corre solo, un registro de actividad y, si corresponde, un chat con IA.
// Hoy: "rrhh" (Lía). No toca a Connie: solo reutiliza su motor de IA y sus funciones de liquidación.
const { analizarRRHH, AUTORESOLVIBLES } = require("./vigilanteRRHH");
const { crearLia } = require("./liaChat");
const { crearNati } = require("./natiChat");
const { crearVera } = require("./veraChat");
const { analizarCompras, rankingProveedores, AUTORESOLVIBLES: AUTO_COMPRAS } = require("./vigilanteCompras");
const { asegurarTablaListas, leerLista } = require("./listaCompra");
const { analizarStock, armarPanorama, cargarStock } = require("./vigilanteStock");
const { sintetizar } = require("./voz");
const { pdfLiquidacion } = require("./pdf");
const { liquidarDesdeBD } = require("../liquidacionDb");
const { crearNotificacion } = require("../notificaciones");

const AGENTES = [
  {
    id: "rrhh",
    nombre: "Lía",
    puesto: "RRHH y liquidaciones",
    descripcion: "Liquida horas y sueldos igual que Connie, y vigila presentismo, feriados, fichadas y faltas.",
    permiso: "agente:rrhh",
    color: "#FF5A00",
    voz: "Leda",
    estilo: "mujer joven, cálida, simpática y cercana, de ritmo tranquilo",
  },
  {
    id: "stock",
    nombre: "Nati",
    puesto: "Stock y depósito",
    descripcion: "Vigila materias primas y semielaborados, anticipa quiebres de stock y te propone qué comprar y qué fabricar.",
    permiso: "agente:stock",
    color: "#22c55e",
    voz: "Zephyr",
    estilo: "mujer enérgica, canchera y alegre, de ritmo ágil y tono más agudo",
  },
  {
    id: "compras",
    nombre: "Vera",
    puesto: "Compras y proveedores",
    descripcion: "Arma las solicitudes de compra con lo que le pedís a ella o le pasa Nati, y sigue proveedores, demoras y firmas pendientes.",
    permiso: "agente:compras",
    color: "#3b82f6",
    voz: "Sulafat",
    estilo: "mujer segura, profesional y serena, de voz más grave y ritmo pausado",
  },
];
const agentePorId = (id) => AGENTES.find((a) => a.id === id) || null;

async function asegurarTablasAgentes(db) {
  await asegurarTablaListas(db).catch((e) => console.error("[agentes] tabla de listas:", e.message));
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
      const aviso = (titulo, texto) => crearNotificacion(db, { tipo: "AGENTE_RRHH", titulo, texto, ruta: "/agentes?a=rrhh", roles });
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

/** Revisión del vigilante de stock (Nati): lee, analiza, guarda avisos nuevos, cierra los que se resolvieron y notifica. */
async function revisarStock({ pool, db }, { ahora = new Date() } = {}) {
  const agente = "stock";
  try {
    const datos = await cargarStock(pool, { ahoraMs: ahora.getTime() });
    const encontrados = analizarStock(datos);
    const [previos] = await db.query("SELECT id, clave, tipo, estado FROM agentes_hallazgos WHERE agente = ?", [agente]);
    const porClave = new Map(previos.map((p) => [p.clave, p]));
    const claves = new Set(encontrados.map((h) => h.clave));
    const nuevos = [];
    for (const h of encontrados) {
      const previo = porClave.get(h.clave);
      if (!previo) {
        await db.query("INSERT INTO agentes_hallazgos (agente, clave, tipo, severidad, titulo, texto, operario, fecha) VALUES (?,?,?,?,?,?,?,?)", [agente, h.clave, h.tipo, h.severidad, h.titulo, h.texto, h.operario, h.fecha]);
        nuevos.push(h);
      } else if (previo.estado === "ABIERTO") {
        await db.query("UPDATE agentes_hallazgos SET severidad = ?, titulo = ?, texto = ?, fecha = ? WHERE id = ?", [h.severidad, h.titulo, h.texto, h.fecha, previo.id]);
      }
    }
    // Todo lo de stock se resuelve solo cuando la condición desaparece (llegó la compra, se fabricó, se corrigió la carga).
    const resueltos = previos.filter((p) => p.estado === "ABIERTO" && !claves.has(p.clave));
    for (const r of resueltos) await db.query("UPDATE agentes_hallazgos SET estado = 'RESUELTO', resuelto_por = 'Nati (automático)', resuelto_en = NOW() WHERE id = ?", [r.id]);

    const aNotificar = nuevos.filter((h) => h.severidad !== "BAJA");
    if (aNotificar.length) {
      const roles = await rolesDelAgente(db, "agente:stock");
      const aviso = (titulo, texto) => crearNotificacion(db, { tipo: "AGENTE_STOCK", titulo, texto, ruta: "/agentes?a=stock", roles });
      if (aNotificar.length <= 3) for (const h of aNotificar) await aviso(`Nati: ${h.titulo}`, h.texto);
      else await aviso(`Nati encontró ${aNotificar.length} cosas para atender en el stock`, aNotificar.slice(0, 3).map((h) => h.titulo).join(" · ") + ` · y ${aNotificar.length - 3} más`);
    }
    if (nuevos.length) await registrarActividad(db, agente, "AVISO", `Detectó ${nuevos.length} ${nuevos.length === 1 ? "aviso nuevo" : "avisos nuevos"}`, nuevos.map((h) => `• ${h.titulo}`).join("\n"));
    if (resueltos.length) await registrarActividad(db, agente, "RESUELTO", `Cerró ${resueltos.length} ${resueltos.length === 1 ? "aviso que ya se resolvió" : "avisos que ya se resolvieron"}`);

    const items = datos.mps.length + datos.semis.length;
    const abiertos = Number((await db.query("SELECT COUNT(*) AS n FROM agentes_hallazgos WHERE agente = ? AND estado = 'ABIERTO'", [agente]))[0][0].n);
    const resumen = abiertos ? `Revisé ${items} ítems de stock: hay ${abiertos} ${abiertos === 1 ? "aviso abierto" : "avisos abiertos"}.` : `Revisé ${items} ítems de stock: todo en orden.`;
    await db.query(
      "INSERT INTO agentes_estado (agente, ultima_revision, resumen, operarios_revisados, ultimo_error) VALUES (?, NOW(), ?, ?, NULL) ON DUPLICATE KEY UPDATE ultima_revision = NOW(), resumen = VALUES(resumen), operarios_revisados = VALUES(operarios_revisados), ultimo_error = NULL",
      [agente, resumen, items],
    );
    return { ok: true, operarios: items, nuevos: nuevos.length, resueltos: resueltos.length, abiertos, resumen };
  } catch (e) {
    console.error("[agentes] revisión de stock falló:", e.message);
    await db.query("INSERT INTO agentes_estado (agente, ultimo_error) VALUES (?, ?) ON DUPLICATE KEY UPDATE ultimo_error = VALUES(ultimo_error)", [agente, String(e.message).slice(0, 300)]).catch(() => {});
    return { ok: false, error: "No pude revisar el stock en este momento." };
  }
}

async function cargarCompras(pool, db) {
  const [solicitudes] = await pool.query("SELECT id, fecha, estado, firma_jefe IS NOT NULL AS firma_jefe, firma_gerente IS NOT NULL AS firma_gerente, created_at FROM solicitudes_compra");
  const [renglones] = await pool.query(
    "SELECT i.solicitud_id, i.articulo, i.proveedor, i.cantidad_solicitada, i.cantidad_recibida, s.created_at AS creada FROM solicitudes_compra_items i JOIN solicitudes_compra s ON s.id = i.solicitud_id WHERE UPPER(COALESCE(s.estado,'')) NOT IN ('CANCELADA','ANULADA')",
  );
  const [listas] = await db.query(
    `SELECT l.solicitud_id, u.nombre AS usuario, l.created_at AS desde, (SELECT COUNT(*) FROM solicitudes_compra_items i WHERE i.solicitud_id = l.solicitud_id) AS renglones
       FROM agentes_compras_listas l LEFT JOIN usuarios u ON u.id = l.usuario_id WHERE l.cerrada = 0`,
  ).then((r) => r).catch(() => [[]]);
  return { solicitudes, renglones, listas: listas.map((l) => ({ ...l, renglones: Number(l.renglones), usuario: l.usuario || "alguien" })) };
}

/** Revisión del vigilante de compras (Vera): firmas pendientes, renglones demorados, proveedores que incumplen y listas a medias. */
async function revisarCompras({ pool, db }, { ahora = new Date() } = {}) {
  const agente = "compras";
  try {
    const datos = await cargarCompras(pool, db);
    const encontrados = analizarCompras({ ...datos, ahoraMs: ahora.getTime() });
    const [previos] = await db.query("SELECT id, clave, tipo, estado FROM agentes_hallazgos WHERE agente = ?", [agente]);
    const porClave = new Map(previos.map((p) => [p.clave, p]));
    const claves = new Set(encontrados.map((h) => h.clave));
    const nuevos = [];
    for (const h of encontrados) {
      const previo = porClave.get(h.clave);
      if (!previo) {
        await db.query("INSERT INTO agentes_hallazgos (agente, clave, tipo, severidad, titulo, texto, operario, fecha) VALUES (?,?,?,?,?,?,?,?)", [agente, h.clave, h.tipo, h.severidad, h.titulo, h.texto, h.operario, h.fecha]);
        nuevos.push(h);
      } else if (previo.estado === "ABIERTO") {
        await db.query("UPDATE agentes_hallazgos SET severidad = ?, titulo = ?, texto = ?, fecha = ? WHERE id = ?", [h.severidad, h.titulo, h.texto, h.fecha, previo.id]);
      }
    }
    const resueltos = previos.filter((p) => p.estado === "ABIERTO" && AUTO_COMPRAS.has(p.tipo) && !claves.has(p.clave));
    for (const r of resueltos) await db.query("UPDATE agentes_hallazgos SET estado = 'RESUELTO', resuelto_por = 'Vera (automático)', resuelto_en = NOW() WHERE id = ?", [r.id]);

    const aNotificar = nuevos.filter((h) => h.severidad !== "BAJA");
    if (aNotificar.length) {
      const roles = await rolesDelAgente(db, "agente:compras");
      const aviso = (titulo, texto) => crearNotificacion(db, { tipo: "AGENTE_COMPRAS", titulo, texto, ruta: "/agentes?a=compras", roles });
      if (aNotificar.length <= 3) for (const h of aNotificar) await aviso(`Vera: ${h.titulo}`, h.texto);
      else await aviso(`Vera encontró ${aNotificar.length} cosas para atender en compras`, aNotificar.slice(0, 3).map((h) => h.titulo).join(" · ") + ` · y ${aNotificar.length - 3} más`);
    }
    if (nuevos.length) await registrarActividad(db, agente, "AVISO", `Detectó ${nuevos.length} ${nuevos.length === 1 ? "aviso nuevo" : "avisos nuevos"}`, nuevos.map((h) => `• ${h.titulo}`).join("\n"));
    if (resueltos.length) await registrarActividad(db, agente, "RESUELTO", `Cerró ${resueltos.length} ${resueltos.length === 1 ? "aviso que ya se resolvió" : "avisos que ya se resolvieron"}`);
    const abiertos = Number((await db.query("SELECT COUNT(*) AS n FROM agentes_hallazgos WHERE agente = ? AND estado = 'ABIERTO'", [agente]))[0][0].n);
    const items = datos.solicitudes.length;
    const resumen = abiertos ? `Revisé ${items} solicitudes de compra: hay ${abiertos} ${abiertos === 1 ? "aviso abierto" : "avisos abiertos"}.` : `Revisé ${items} solicitudes de compra: todo en orden.`;
    await db.query(
      "INSERT INTO agentes_estado (agente, ultima_revision, resumen, operarios_revisados, ultimo_error) VALUES (?, NOW(), ?, ?, NULL) ON DUPLICATE KEY UPDATE ultima_revision = NOW(), resumen = VALUES(resumen), operarios_revisados = VALUES(operarios_revisados), ultimo_error = NULL",
      [agente, resumen, items],
    );
    return { ok: true, operarios: items, nuevos: nuevos.length, resueltos: resueltos.length, abiertos, resumen };
  } catch (e) {
    console.error("[agentes] revisión de compras falló:", e.message);
    await db.query("INSERT INTO agentes_estado (agente, ultimo_error) VALUES (?, ?) ON DUPLICATE KEY UPDATE ultimo_error = VALUES(ultimo_error)", [agente, String(e.message).slice(0, 300)]).catch(() => {});
    return { ok: false, error: "No pude revisar las compras en este momento." };
  }
}

function registrarRutasAgentes(app, { db, pool, ai }) {
  const chats = { rrhh: crearLia({ pool, db, ai }), stock: crearNati({ pool, db, ai }), compras: crearVera({ pool, db, ai }) };
  const revisiones = { rrhh: () => revisarRRHH({ pool, db }), stock: () => revisarStock({ pool, db }), compras: () => revisarCompras({ pool, db }) };

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

  const revisando = new Set();
  app.post("/api/agentes/:id/revisar", delAgente, async (req, res) => {
    const revisar = revisiones[req.agente.id];
    if (!revisar) return res.status(400).json({ error: "Este agente no tiene vigilante." });
    if (revisando.has(req.agente.id)) return res.status(429).json({ error: "Ya estoy revisando, esperá un momento." });
    revisando.add(req.agente.id);
    try {
      const r = await revisar();
      if (r.ok) await registrarActividad(db, req.agente.id, "REVISION", `Revisión pedida por ${req.usuario.nombre}`, r.resumen, req.usuario.nombre);
      res.status(r.ok ? 200 : 500).json(r);
    } finally {
      revisando.delete(req.agente.id);
    }
  });

  // Panorama de stock (Nati): niveles reales de materias primas y semielaborados, para el tablero y el depósito 3D.
  app.get("/api/agentes/:id/panorama", delAgente, async (req, res) => {
    if (req.agente.id !== "stock" && req.agente.id !== "compras") return res.status(400).json({ error: "Este agente no tiene panorama." });
    try {
      if (req.agente.id === "compras") {
        const d = await cargarCompras(pool, db);
        const lista = await leerLista(db, req.usuario.id);
        const ahoraMs = Date.now();
        const sinRecibir = d.renglones.filter((r) => Number(r.cantidad_recibida || 0) < Number(r.cantidad_solicitada || 0) && !d.listas.some((l) => l.solicitud_id === r.solicitud_id));
        const porFirmar = d.solicitudes.filter((s) => String(s.estado).toUpperCase() === "ABIERTA" && !d.listas.some((l) => l.solicitud_id === s.id) && (!s.firma_jefe || !s.firma_gerente));
        return res.json({
          generado: new Date().toISOString(),
          lista,
          resumen: { en_armado: lista.total_renglones, por_firmar: porFirmar.length, sin_recibir: sinRecibir.length, proveedores: new Set(d.renglones.map((r) => r.proveedor)).size },
          por_firmar: porFirmar.slice(0, 12).map((s) => ({ id: s.id, fecha: String(s.fecha || "").slice(0, 10), firmo_jefe: !!s.firma_jefe, firmo_gerente: !!s.firma_gerente, dias: Math.floor((ahoraMs - new Date(String(s.created_at).replace(" ", "T")).getTime()) / 86400000) })),
          sin_recibir: sinRecibir.slice(0, 40).map((r) => ({ solicitud_id: r.solicitud_id, articulo: r.articulo, proveedor: r.proveedor, pedido: r.cantidad_solicitada, recibido: r.cantidad_recibida, dias: Math.floor((ahoraMs - new Date(String(r.creada).replace(" ", "T")).getTime()) / 86400000) })),
          proveedores: rankingProveedores(d.renglones).slice(0, 12),
        });
      }
      const p = armarPanorama(await cargarStock(pool));
      res.json(p);
    } catch (e) {
      console.error("[agentes] panorama:", e.message);
      res.status(500).json({ error: "No pude armar el panorama del stock." });
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
    const cerebro = chats[req.agente.id];
    if (!cerebro) return res.status(400).json({ error: "Este agente todavía no conversa." });
    const mensaje = String(req.body?.mensaje || "").trim().slice(0, 2000);
    if (!mensaje) return res.status(400).json({ error: `Escribile algo a ${req.agente.nombre}.` });
    const u = controlarUso(req.usuario.id);
    if (!u.ok) return res.status(429).json({ error: u.error });
    try {
      // A quién puede derivar: los otros agentes que este usuario tiene habilitados y que ya conversan.
      const destinos = [];
      for (const a of AGENTES) if (a.id !== req.agente.id && chats[a.id] && (await tienePermiso(req.usuario, a.permiso))) destinos.push({ id: a.id, nombre: a.nombre, puesto: a.puesto });
      const r = await cerebro.responder({ mensaje, historial: req.body?.historial, destinos, usuario: { id: req.usuario.id, nombre: req.usuario.nombre, rol: req.usuario.rol } });
      const hechas = r.herramientas.filter((h) => h.nombre !== "calculadora" && h.nombre !== "derivar_a_agente");
      const tipo = hechas.some((h) => h.nombre === "liquidar_horas") ? "LIQUIDACION" : r.derivacion ? "DERIVACION" : "CHAT";
      await registrarActividad(
        db, req.agente.id, tipo,
        r.derivacion ? `Le pasó una consulta a ${r.derivacion.nombre}` : hechas.length ? `${hechas[0].texto}${hechas[0].operario ? " · " + hechas[0].operario : ""}${hechas[0].periodo ? " (" + hechas[0].periodo + ")" : ""}` : "Respondió una consulta",
        `Consulta de ${req.usuario.nombre}: ${mensaje.slice(0, 200)}`, req.usuario.nombre,
      );
      res.json({ success: true, respuesta: r.respuesta, herramientas: r.herramientas, derivacion: r.derivacion || null, ms: r.ms });
    } catch (error) {
      console.error(`[${req.agente.nombre}] Error:`, error);
      const saturado = error && (error.status === 503 || error.status === 429);
      res.status(saturado ? 503 : 500).json({ error: saturado ? "El servicio de IA está saturado. Probá de nuevo en unos segundos." : "Error al procesar la consulta." });
    } finally {
      u.liberar();
    }
  });

  // Liquidación en PDF (la misma liquidación que hace Lía en el chat), para descargar desde la conversación.
  app.get("/api/agentes/:id/liquidacion.pdf", delAgente, async (req, res) => {
    if (req.agente.id !== "rrhh") return res.status(400).json({ error: "Este agente no liquida." });
    try {
      const q = req.query;
      const texto = (k) => (typeof q[k] === "string" && q[k].trim() ? q[k].trim().slice(0, 80) : undefined);
      const params = {
        operario: texto("operario"), mes: texto("mes"), desde: texto("desde"), hasta: texto("hasta"),
        quincena: Number.isInteger(Number(q.quincena)) && q.quincena !== "" && q.quincena !== undefined ? Number(q.quincena) : undefined,
        solo_extras: q.solo_extras === "1" || q.solo_extras === "true" || undefined,
        solo_con_categoria: q.solo_con_categoria === "1" || q.solo_con_categoria === "true" || undefined,
        fechas: typeof q.fechas === "string" && q.fechas ? q.fechas.split(",").map((f) => f.trim()).filter(Boolean).slice(0, 40) : undefined,
        detalle: "completo",
      };
      const liq = await liquidarDesdeBD(pool, params);
      if (liq.error) return res.status(400).json({ error: liq.error });
      const pdf = pdfLiquidacion(liq, { usuario: req.usuario.nombre });
      const slug = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
      const nombre = ["liquidacion", slug(liq.operario || "plantel"), slug(params.mes || params.desde || liq.liquidacion_de).slice(0, 20), params.quincena ? `q${params.quincena}` : ""].filter(Boolean).join("-");
      await registrarActividad(db, "rrhh", "LIQUIDACION", `${req.usuario.nombre} descargó el PDF de ${liq.operario ? "la liquidación de " + liq.operario : "la liquidación del plantel"}`, liq.liquidacion_de, req.usuario.nombre);
      res.set({ "Content-Type": "application/pdf", "Content-Length": pdf.length, "Content-Disposition": `attachment; filename="${nombre}.pdf"`, "Cache-Control": "no-store" });
      res.send(pdf);
    } catch (e) {
      console.error("[agentes] pdf:", e.message);
      res.status(500).json({ error: "No pude armar el PDF." });
    }
  });

  // Voz natural (Gemini): devuelve un WAV. Tope por usuario para no gastar de más.
  const usoVoz = new Map();
  app.post("/api/agentes/:id/voz", delAgente, async (req, res) => {
    const texto = String(req.body?.texto || "").trim();
    if (!texto) return res.status(400).json({ error: "Falta el texto." });
    const ahora = Date.now();
    const marcas = (usoVoz.get(req.usuario.id) || []).filter((t) => ahora - t < 5 * 60 * 1000);
    if (marcas.length >= 30) return res.status(429).json({ error: "Demasiadas lecturas seguidas." });
    marcas.push(ahora);
    usoVoz.set(req.usuario.id, marcas);
    try {
      const wav = await sintetizar(ai, texto, { voz: req.agente.voz, estilo: req.agente.estilo });
      res.set({ "Content-Type": "audio/wav", "Content-Length": wav.length, "Cache-Control": "no-store" });
      res.send(wav);
    } catch (e) {
      console.error("[agentes] voz:", e.message);
      res.status(502).json({ error: "No pude generar la voz." });
    }
  });

  return { revisarRRHH: revisiones.rrhh, revisarStock: revisiones.stock, revisarCompras: revisiones.compras };
}

/** Deja corriendo el vigilante: una revisión poco después de arrancar y luego cada N minutos (sin IA, solo consultas). */
function iniciarVigilantes(agentes, { intervaloMin = Number(process.env.AGENTES_INTERVALO_MIN) || 30 } = {}) {
  if (String(process.env.AGENTES_VIGILANTE || "").toLowerCase() === "off") return () => {};
  const correr = () => {
    agentes.revisarRRHH().catch((e) => console.error("[agentes] vigilante RRHH:", e.message));
    // Nati revisa un poco después para no pisar la revisión de Lía.
    setTimeout(() => agentes.revisarStock?.().catch((e) => console.error("[agentes] vigilante stock:", e.message)), 15000).unref?.();
    setTimeout(() => agentes.revisarCompras?.().catch((e) => console.error("[agentes] vigilante compras:", e.message)), 30000).unref?.();
  };
  const t0 = setTimeout(correr, 20000);
  const t = setInterval(correr, Math.max(5, intervaloMin) * 60 * 1000);
  t0.unref?.();
  t.unref?.();
  return () => {
    clearTimeout(t0);
    clearInterval(t);
  };
}

module.exports = { revisarCompras, AGENTES, agentePorId, asegurarTablasAgentes, registrarRutasAgentes, iniciarVigilantes, revisarRRHH, revisarStock, ahoraArgentina };
