"use strict";
// Módulo de agentes: cada agente tiene una especialidad, un permiso propio (agente:<id>) que se da por rol,
// un vigilante sin IA que corre solo, un registro de actividad y, si corresponde, un chat con IA.
// Hoy: "rrhh" (Lía). No toca a Connie: solo reutiliza su motor de IA y sus funciones de liquidación.
const { analizarRRHH, AUTORESOLVIBLES } = require("./vigilanteRRHH");
const { crearLia } = require("./liaChat");
const { crearNati } = require("./natiChat");
const { crearVera } = require("./veraChat");
const { crearRomi } = require("./maruChat");
const { crearCami, confirmarNota, cancelarNota } = require("./ventasChat");
const V = require("./ventasMails");
const Apr = require("./ventasAprendizaje");
const S = require("./seguimientoMails");
const SR = require("./sinResponder");
const { crearSofi } = require("./seguimientoChat");
const { decisionProduccion } = require("./produccionDecision");
const { listarOperarios, fichaOperario } = require("./fichaOperario");
const { confirmarPropuesta, cancelarPropuesta } = require("./ajusteStock");
const { armarTemario, olvidarTemario } = require("./temario");
const { asegurarTablaReuniones, hacerReunion, ultimaReunion, iniciarReunion, ahoraAR } = require("./reunion");
const { preguntarOficina } = require("./oficina");
const { analizarCompras, rankingProveedores, AUTORESOLVIBLES: AUTO_COMPRAS } = require("./vigilanteCompras");
const { asegurarTablaListas, leerLista } = require("./listaCompra");
const { analizarStock, armarPanorama, cargarStock } = require("./vigilanteStock");
const { sintetizar } = require("./voz");
const { pdfLiquidacion, pdfReporte } = require("./pdf");
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
  {
    id: "produccion",
    nombre: "Romi",
    puesto: "Producción y pedidos",
    descripcion: "Cruza pedidos abiertos, stock, plan de la semana y gente en planta para decirte qué conviene fabricar primero.",
    permiso: "agente:produccion",
    color: "#8b5cf6",
    voz: "Aoede",
    estilo: "mujer resuelta y práctica, de voz clara y firme, ritmo ágil pero ordenado",
  },
  {
    id: "ventas",
    nombre: "Cami",
    puesto: "Ventas y mails",
    descripcion: "Lee los mails de clientes que etiquetás IA-Consulta, te deja el borrador listo en Gmail cuando definís el descuento (nunca envía) y aprende de lo que corregís y de lo que preguntan los clientes.",
    permiso: "agente:ventas",
    color: "#14b8a6",
    voz: "Autonoe",
    estilo: "mujer comercial, simpática y segura, de voz brillante y ritmo ágil y cálido",
  },
  {
    id: "seguimiento",
    nombre: "Sofi",
    puesto: "Seguimiento de mails",
    descripcion: "Controla los mails que enviaron Cami y vos (sin etiquetas) y que el cliente nunca respondió: presupuestos olvidados, consultas sin contestar y rebotes. Te deja el borrador de seguimiento en Gmail, sin enviarlo.",
    permiso: "agente:seguimiento",
    color: "#ec4899",
    voz: "Kore",
    estilo: "mujer atenta y constante, de voz serena y firme, ritmo medio y tono amable que insiste sin presionar",
  },
];
const agentePorId = (id) => AGENTES.find((a) => a.id === id) || null;

async function asegurarTablasAgentes(db) {
  await asegurarTablaReuniones(db).catch((e) => console.error("[agentes] tabla de reuniones:", e.message));
  await asegurarTablaListas(db).catch((e) => console.error("[agentes] tabla de listas:", e.message));
  await V.asegurarTablasVentas(db).catch((e) => console.error("[agentes] tablas de ventas:", e.message));
  await Apr.asegurarTablasAprendizaje(db).catch((e) => console.error("[agentes] tablas de aprendizaje:", e.message));
  await S.asegurarTablasSeguimiento(db).catch((e) => console.error("[agentes] tablas de seguimiento:", e.message));
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
      const aviso = (titulo, texto, push = false) => crearNotificacion(db, { tipo: "AGENTE_RRHH", titulo, texto, ruta: "/agentes?a=rrhh", roles, push });
      if (nuevos.length <= 3) for (const h of nuevos) await aviso(`Lía: ${h.titulo}`, h.texto, h.severidad === "ALTA");
      else await aviso(`Lía encontró ${nuevos.length} avisos nuevos`, nuevos.slice(0, 3).map((h) => h.titulo).join(" · ") + (nuevos.length > 3 ? ` · y ${nuevos.length - 3} más` : ""), nuevos.some((h) => h.severidad === "ALTA"));
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
      const aviso = (titulo, texto, push = false) => crearNotificacion(db, { tipo: "AGENTE_STOCK", titulo, texto, ruta: "/agentes?a=stock", roles, push });
      if (aNotificar.length <= 3) for (const h of aNotificar) await aviso(`Nati: ${h.titulo}`, h.texto, h.severidad === "ALTA");
      else await aviso(`Nati encontró ${aNotificar.length} cosas para atender en el stock`, aNotificar.slice(0, 3).map((h) => h.titulo).join(" · ") + ` · y ${aNotificar.length - 3} más`, aNotificar.some((h) => h.severidad === "ALTA"));
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
      const aviso = (titulo, texto, push = false) => crearNotificacion(db, { tipo: "AGENTE_COMPRAS", titulo, texto, ruta: "/agentes?a=compras", roles, push });
      if (aNotificar.length <= 3) for (const h of aNotificar) await aviso(`Vera: ${h.titulo}`, h.texto, h.severidad === "ALTA");
      else await aviso(`Vera encontró ${aNotificar.length} cosas para atender en compras`, aNotificar.slice(0, 3).map((h) => h.titulo).join(" · ") + ` · y ${aNotificar.length - 3} más`, aNotificar.some((h) => h.severidad === "ALTA"));
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

const nombreCliente = (remitente, email) => String(remitente || "").replace(/<[^>]*>/g, "").replace(/["']/g, "").trim() || email || "un cliente";

/**
 * Revisión de Cami (ventas): lee los mails etiquetados IA-Consulta en Gmail, detecta los que ya se respondieron y guarda qué se corrigió.
 * NO arma borradores sola: cada borrador necesita que la persona defina antes si lleva descuento y de cuánto. NUNCA envía un mail.
 */
async function revisarVentas({ db, mails }, { ahora = new Date() } = {}) {
  void ahora;
  const agente = "ventas";
  try {
    let sync;
    try {
      sync = await V.sincronizar({ db, listar: mails.listar, estadoHilo: mails.estadoHilo });
    } catch (e) {
      if (e.status === 401) {
        await db.query("INSERT INTO agentes_estado (agente, ultimo_error) VALUES (?, ?) ON DUPLICATE KEY UPDATE ultimo_error = VALUES(ultimo_error)", [agente, "Gmail no está conectado."]).catch(() => {});
        return { ok: false, error: "Gmail no está conectado: conectalo desde Comercial y vuelvo a revisar." };
      }
      throw e;
    }
    const hechos = [];

    const seguimiento = await V.revisarBorradores({ db, estadoHilo: mails.estadoHilo, existeBorrador: mails.existeBorrador });
    // Lo que se repite al corregir mis borradores entra como sugerencia para entrenarme.
    await Apr.registrarPatrones(db, V.patronesDeCorreccion(await V.correccionesRecientes(db, { limite: 12 }))).catch((e) => console.error("[ventas] patrones:", e.message));

    // Avisos: un hallazgo por mail que espera a la persona (borrador para revisar, consulta sin responder o error).
    const filas = await V.listarRegistros(db, { estados: ["PENDIENTE", "BORRADOR", "ERROR"], limite: 100 });
    const hace1d = Date.now() - 86400000;
    const encontrados = filas.map((m) => {
      const cliente = nombreCliente(m.remitente, m.email_cliente);
      const viejo = new Date(m.fecha_mail || m.recibido).getTime() < hace1d;
      const avisos = m.revision?.avisos?.length || 0;
      if (m.estado === "BORRADOR")
        return { clave: `mail:${m.mail_id}`, tipo: "MAIL_BORRADOR", severidad: viejo ? "ALTA" : "MEDIA", titulo: `Borrador listo para revisar: ${cliente}`, texto: `${m.asunto || "Consulta"}.${avisos ? ` Trae ${avisos === 1 ? "1 cosa" : `${avisos} cosas`} a confirmar antes de enviar.` : ""} Está en Borradores de Gmail; revisalo y enviá.`, operario: cliente };
      if (m.estado === "ERROR")
        return { clave: `mail:${m.mail_id}`, tipo: "MAIL_ERROR", severidad: "ALTA", titulo: `No pude armar el borrador de ${cliente}`, texto: `${m.asunto || "Consulta"}. ${m.error || "Falló la IA o Gmail."} Pedímelo de nuevo desde acá o respondelo a mano.`, operario: cliente };
      return { clave: `mail:${m.mail_id}`, tipo: "MAIL_PENDIENTE", severidad: viejo ? "ALTA" : "MEDIA", titulo: `Consulta sin responder: ${cliente}`, texto: `${m.asunto || "Consulta"}. Decime si lleva descuento y de cuánto (o si va sin descuento) y te armo el borrador.`, operario: cliente };
    });

    const [previos] = await db.query("SELECT id, clave, tipo, estado FROM agentes_hallazgos WHERE agente = ?", [agente]);
    const porClave = new Map(previos.map((p) => [p.clave, p]));
    const claves = new Set(encontrados.map((h) => h.clave));
    const nuevos = [];
    for (const h of encontrados) {
      if (h.conservar) continue;
      const previo = porClave.get(h.clave);
      if (!previo) {
        await db.query("INSERT INTO agentes_hallazgos (agente, clave, tipo, severidad, titulo, texto, operario, fecha) VALUES (?,?,?,?,?,?,?,NULL)", [agente, h.clave, h.tipo, h.severidad, h.titulo, h.texto, h.operario]);
        nuevos.push(h);
      } else if (previo.estado === "ABIERTO") {
        await db.query("UPDATE agentes_hallazgos SET tipo = ?, severidad = ?, titulo = ?, texto = ? WHERE id = ?", [h.tipo, h.severidad, h.titulo, h.texto, previo.id]);
        // Pasó de "sin responder" a "borrador listo": eso sí es una novedad para la persona.
        if (previo.tipo !== h.tipo && h.tipo === "MAIL_BORRADOR") nuevos.push(h);
      }
    }
    const resueltos = previos.filter((p) => p.estado === "ABIERTO" && !claves.has(p.clave));
    for (const r of resueltos) await db.query("UPDATE agentes_hallazgos SET estado = 'RESUELTO', resuelto_por = 'Cami (automático)', resuelto_en = NOW() WHERE id = ?", [r.id]);

    if (nuevos.length) {
      const roles = await rolesDelAgente(db, "agente:ventas");
      const aviso = (titulo, texto) => crearNotificacion(db, { tipo: "AGENTE_VENTAS", titulo, texto, ruta: "/agentes?a=ventas", roles, push: true });
      if (nuevos.length <= 3) for (const h of nuevos) await aviso(`Cami: ${h.titulo}`, h.texto);
      else await aviso(`Cami tiene ${nuevos.length} mails de clientes para vos`, nuevos.slice(0, 3).map((h) => h.operario).join(" · ") + ` · y ${nuevos.length - 3} más`);
    }
    if (hechos.length) await registrarActividad(db, agente, "BORRADOR", `Armó ${hechos.filter((h) => h.ok).length} ${hechos.filter((h) => h.ok).length === 1 ? "borrador" : "borradores"} de respuesta`, hechos.map((h) => `• ${h.ok ? "Borrador" : "No pudo"}: ${h.mail.asunto} (${nombreCliente(h.mail.remitente, h.mail.emailCliente)})`).join("\n"));
    if (seguimiento.atendidos.length) await registrarActividad(db, agente, "ENVIADO", `${seguimiento.atendidos.length === 1 ? "Se envió 1 respuesta" : `Se enviaron ${seguimiento.atendidos.length} respuestas`} con borrador mío`, seguimiento.atendidos.map((a) => `• ${V.describirCambios(a.cambios)}`).join("\n"));
    if (sync.retirados) await registrarActividad(db, agente, "RESUELTO", `Dejó de seguir ${sync.retirados} ${sync.retirados === 1 ? "mail al que le sacaron" : "mails a los que les sacaron"} la etiqueta IA-Consulta`);

    const c = await V.conteos(db);
    const abiertos = Number((await db.query("SELECT COUNT(*) AS n FROM agentes_hallazgos WHERE agente = ? AND estado = 'ABIERTO'", [agente]))[0][0].n);
    const resumen = abiertos
      ? `Revisé ${sync.total} ${sync.total === 1 ? "mail" : "mails"} etiquetados: ${c.BORRADOR} con borrador listo y ${c.PENDIENTE + c.ERROR} sin responder.`
      : `Revisé ${sync.total} ${sync.total === 1 ? "mail" : "mails"} etiquetados: no hay nada esperándote.`;
    await db.query(
      "INSERT INTO agentes_estado (agente, ultima_revision, resumen, operarios_revisados, ultimo_error) VALUES (?, NOW(), ?, ?, NULL) ON DUPLICATE KEY UPDATE ultima_revision = NOW(), resumen = VALUES(resumen), operarios_revisados = VALUES(operarios_revisados), ultimo_error = NULL",
      [agente, resumen, sync.total],
    );
    return { ok: true, operarios: sync.total, nuevos: nuevos.length, resueltos: resueltos.length, abiertos, resumen };
  } catch (e) {
    console.error("[agentes] revisión de ventas falló:", e.message);
    await db.query("INSERT INTO agentes_estado (agente, ultimo_error) VALUES (?, ?) ON DUPLICATE KEY UPDATE ultimo_error = VALUES(ultimo_error)", [agente, String(e.message).slice(0, 300)]).catch(() => {});
    return { ok: false, error: "No pude revisar los mails en este momento." };
  }
}

/**
 * Revisión de Sofi (seguimiento): mira la carpeta de enviados de Gmail SIN etiquetas, solo lo que cambió desde la última vez,
 * detecta los hilos cuyo último mail es nuestro y no tuvo respuesta, y los deja como avisos según lo que se mandó y los días de espera.
 * NUNCA envía un mail.
 */
// Último resultado de "clientes que escribieron y no respondimos" (se recalcula en cada revisión; no se guarda en la base).
let sinResponderActual = { generado: null, lista: [], error: null };

async function revisarSeguimiento({ db, ai, seguimiento }, { ahora = new Date() } = {}) {
  const agente = "seguimiento";
  try {
    let sync;
    try {
      sync = await S.sincronizar({ db, deps: seguimiento, ahoraMs: ahora.getTime() });
    } catch (e) {
      if (e.status === 401) {
        await db.query("INSERT INTO agentes_estado (agente, ultimo_error) VALUES (?, ?) ON DUPLICATE KEY UPDATE ultimo_error = VALUES(ultimo_error)", [agente, "Gmail no está conectado."]).catch(() => {});
        return { ok: false, error: "Gmail no está conectado: conectalo desde Comercial y vuelvo a revisar." };
      }
      throw e;
    }
    // Qué mandamos (presupuesto, consulta...) solo se mira para lo que ya lleva días esperando.
    await S.clasificarPendientes({ db, deps: seguimiento, ai, ahoraMs: ahora.getTime() }).catch((e) => {
      if (e.status === 401) throw e;
      console.error("[seguimiento] clasificar:", e.message);
    });

    const filas = await S.listar(db, { estados: ["ESPERANDO", "POSPUESTO", "REBOTE"], limite: 300, ahoraMs: ahora.getTime() });
    const encontrados = S.armarHallazgos(filas, { ahoraMs: ahora.getTime() });
    // Segunda función: clientes que escribieron y no respondimos. Si falla no frena el seguimiento de lo enviado.
    try {
      const entrantes = await SR.buscar({ deps: seguimiento, ahoraMs: ahora.getTime() });
      sinResponderActual = { generado: ahora.toISOString(), lista: entrantes, error: null };
      encontrados.push(...SR.armarHallazgos(entrantes, { ahoraMs: ahora.getTime() }));
    } catch (e) {
      if (e.status === 401) throw e;
      console.error("[seguimiento] sin responder:", e.message);
      sinResponderActual = { ...sinResponderActual, error: "No pude revisar la bandeja de entrada." };
      // Para no cerrar por error los avisos de la revisión anterior, se conservan abiertos.
      const [abiertosEntrantes] = await db.query("SELECT clave FROM agentes_hallazgos WHERE agente = ? AND estado = 'ABIERTO' AND tipo = 'CLIENTE_SIN_RESPUESTA'", [agente]);
      for (const a of abiertosEntrantes) encontrados.push({ clave: a.clave, tipo: "CLIENTE_SIN_RESPUESTA", severidad: "BAJA", titulo: null, texto: null, operario: null, fecha: null, conservar: true });
    }
    const [previos] = await db.query("SELECT id, clave, tipo, estado FROM agentes_hallazgos WHERE agente = ?", [agente]);
    const porClave = new Map(previos.map((p) => [p.clave, p]));
    const claves = new Set(encontrados.map((h) => h.clave));
    const nuevos = [];
    for (const h of encontrados) {
      const previo = porClave.get(h.clave);
      if (!previo) {
        await db.query("INSERT INTO agentes_hallazgos (agente, clave, tipo, severidad, titulo, texto, operario, fecha) VALUES (?,?,?,?,?,?,?,NULL)", [agente, h.clave, h.tipo, h.severidad, h.titulo, h.texto, h.operario]);
        nuevos.push(h);
      } else if (previo.estado === "ABIERTO") {
        await db.query("UPDATE agentes_hallazgos SET tipo = ?, severidad = ?, titulo = ?, texto = ? WHERE id = ?", [h.tipo, h.severidad, h.titulo, h.texto, previo.id]);
        // Subió de urgencia o se enfrió: vale un aviso nuevo; el resto de los cambios (los días que pasan) son silenciosos.
        if (previo.tipo !== h.tipo && h.tipo !== "FRIO") nuevos.push(h);
      }
    }
    // Se cierran solos cuando el cliente responde, se descarta, se pospone o se vence.
    const resueltos = previos.filter((p) => p.estado === "ABIERTO" && !claves.has(p.clave));
    for (const r of resueltos) await db.query("UPDATE agentes_hallazgos SET estado = 'RESUELTO', resuelto_por = 'Sofi (automático)', resuelto_en = NOW() WHERE id = ?", [r.id]);

    const aNotificar = nuevos.filter((h) => h.severidad !== "BAJA");
    if (aNotificar.length) {
      const roles = await rolesDelAgente(db, "agente:seguimiento");
      const aviso = (titulo, texto, push = false) => crearNotificacion(db, { tipo: "AGENTE_SEGUIMIENTO", titulo, texto, ruta: "/agentes?a=seguimiento", roles, push });
      if (aNotificar.length <= 3) for (const h of aNotificar) await aviso(`Sofi: ${h.titulo}`, h.texto, h.severidad === "ALTA");
      else await aviso(`Sofi tiene ${aNotificar.length} mails para atender`, aNotificar.slice(0, 3).map((h) => h.operario).join(" · ") + ` · y ${aNotificar.length - 3} más`, aNotificar.some((h) => h.severidad === "ALTA"));
    }
    if (nuevos.length) await registrarActividad(db, agente, "AVISO", `Detectó ${nuevos.length} ${nuevos.length === 1 ? "mail pendiente de seguimiento" : "mails pendientes de seguimiento"}`, nuevos.map((h) => `• ${h.titulo}`).join("\n"));
    if (sync.respondidos) await registrarActividad(db, agente, "RESUELTO", `${sync.respondidos === 1 ? "1 cliente respondió" : `${sync.respondidos} clientes respondieron`} un mail que estaba esperando`);
    if (sync.vencidos) await registrarActividad(db, agente, "RESUELTO", `Dejó de seguir ${sync.vencidos} ${sync.vencidos === 1 ? "hilo" : "hilos"} que salieron de la ventana de ${S.CONFIG.ventanaDias} días`);

    const c = await S.conteos(db, { ahoraMs: ahora.getTime() });
    const abiertos = Number((await db.query("SELECT COUNT(*) AS n FROM agentes_hallazgos WHERE agente = ? AND estado = 'ABIERTO'", [agente]))[0][0].n);
    const resumen = abiertos
      ? `Miré ${sync.en_ventana} hilos enviados: ${c.presupuestos ? `${c.presupuestos} ${c.presupuestos === 1 ? "presupuesto" : "presupuestos"} sin respuesta` : `${abiertos} ${abiertos === 1 ? "mail" : "mails"} sin respuesta`}${c.urgentes ? `, ${c.urgentes} ${c.urgentes === 1 ? "urgente" : "urgentes"}` : ""}.`
      : `Miré ${sync.en_ventana} hilos enviados: no hay nada sin respuesta que reclamar.`;
    await db.query(
      "INSERT INTO agentes_estado (agente, ultima_revision, resumen, operarios_revisados, ultimo_error) VALUES (?, NOW(), ?, ?, NULL) ON DUPLICATE KEY UPDATE ultima_revision = NOW(), resumen = VALUES(resumen), operarios_revisados = VALUES(operarios_revisados), ultimo_error = NULL",
      [agente, resumen, sync.en_ventana],
    );
    return { ok: true, operarios: sync.en_ventana, nuevos: nuevos.length, resueltos: resueltos.length, abiertos, resumen, gmail: { leidos: sync.leidos, sin_cambios: sync.sin_cambios, pendientes_de_leer: sync.pendientes_de_leer } };
  } catch (e) {
    console.error("[agentes] revisión de seguimiento falló:", e.message);
    await db.query("INSERT INTO agentes_estado (agente, ultimo_error) VALUES (?, ?) ON DUPLICATE KEY UPDATE ultimo_error = VALUES(ultimo_error)", [agente, String(e.message).slice(0, 300)]).catch(() => {});
    return { ok: false, error: "No pude revisar los mails enviados en este momento." };
  }
}

function registrarRutasAgentes(app, { db, pool, ai, mails = null, seguimiento = null }) {
  // Lo que Cami nota en cada mail (puntos grises, características pedidas, preguntas repetidas) queda guardado para que el equipo lo defina.
  const observar = (o) => Apr.registrarObservaciones(db, o);
  const chats = { rrhh: crearLia({ pool, db, ai }), stock: crearNati({ pool, db, ai }), compras: crearVera({ pool, db, ai }), produccion: crearRomi({ pool, db, ai }) };
  const revisiones = { rrhh: () => revisarRRHH({ pool, db }), stock: () => revisarStock({ pool, db }), compras: () => revisarCompras({ pool, db }) };
  if (mails) {
    chats.ventas = crearCami({ ai, db, mails, observar });
    revisiones.ventas = () => revisarVentas({ db, mails });
  }
  if (seguimiento) {
    chats.seguimiento = crearSofi({ ai, db, seguimiento });
    revisiones.seguimiento = () => revisarSeguimiento({ db, ai, seguimiento });
  }
  // Los agentes que dependen de Gmail solo existen si el servidor lo conecta.
  const disponible = (a) => (a.id === "ventas" ? !!mails : a.id === "seguimiento" ? !!seguimiento : true);

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
      if (!agente || !disponible(agente)) return res.status(404).json({ error: "Ese agente no existe." });
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
      for (const a of AGENTES) if (disponible(a) && (await tienePermiso(usuario, a.permiso))) visibles.push(a);
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

  // ---- Reunión de las 08:00 ----
  const permisosDe = async (usuario) => {
    const ok = [];
    for (const a of AGENTES) if (disponible(a) && (await tienePermiso(usuario, a.permiso))) ok.push(a);
    return ok;
  };
  app.get("/api/agentes/reunion", async (req, res) => {
    try {
      const usuario = await quien(req);
      const mios = await permisosDe(usuario);
      if (!mios.length) return res.status(403).json({ error: "Tu rol no tiene agentes habilitados." });
      const r = await ultimaReunion(db);
      const hoy = ahoraAR().hoy;
      if (!r) return res.json({ hay: false, hoy: false });
      const ids = new Set(mios.map((a) => a.id));
      res.json({ hay: true, hoy: r.fecha === hoy, fecha: r.fecha, generada: r.generada, sugerencias: (r.sugerencias || []).filter((x) => ids.has(x.agente)), secciones: r.secciones.filter((x) => ids.has(x.agente)), urgentes: r.secciones.filter((x) => ids.has(x.agente) && x.urgente).length });
    } catch (e) {
      console.error("[agentes] reunión:", e.message);
      res.status(500).json({ error: "No pude cargar la reunión." });
    }
  });
  // Temario en vivo: lo que cada agente va encontrando y llevaría a la próxima reunión.
  app.get("/api/agentes/reunion/temario", async (req, res) => {
    try {
      const usuario = await quien(req);
      const mios = await permisosDe(usuario);
      if (!mios.length) return res.status(403).json({ error: "Tu rol no tiene agentes habilitados." });
      const t = await armarTemario({ pool, db, agentes: AGENTES.filter(disponible) });
      const ids = new Set(mios.map((a) => a.id));
      const secciones = t.secciones.filter((x) => ids.has(x.agente));
      res.json({ secciones, urgentes: secciones.filter((x) => x.urgente).length, sugerencias: t.sugerencias.filter((x) => ids.has(x.agente)), proxima: t.proxima, actualizado: t.actualizado });
    } catch (e) {
      console.error("[agentes] temario:", e.message);
      res.status(500).json({ error: "No pude armar el temario." });
    }
  });
  // Solo administración: rehace la reunión de hoy (sin avisar a nadie), para probarla o actualizarla.
  app.post("/api/agentes/reunion/ahora", async (req, res) => {
    try {
      const usuario = await quien(req);
      if (String(usuario?.rol || "").toUpperCase() !== "ADMIN") return res.status(403).json({ error: "Solo administración puede rehacer la reunión." });
      await hacerReunion(depsReunion, { forzar: true });
      olvidarTemario();
      res.json({ ok: true });
    } catch (e) {
      console.error("[agentes] reunión ahora:", e.message);
      res.status(500).json({ error: "No pude armar la reunión." });
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
    if (!["stock", "compras", "produccion", "ventas", "seguimiento"].includes(req.agente.id)) return res.status(400).json({ error: "Este agente no tiene panorama." });
    try {
      if (req.agente.id === "seguimiento") {
        const lista = (await S.listar(db, { estados: ["ESPERANDO", "POSPUESTO", "REBOTE"], limite: 200 })).sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));
        return res.json({
          generado: new Date().toISOString(),
          conteos: await S.conteos(db),
          config: { dias_aviso: S.CONFIG.diasAviso, dias_urgente: S.CONFIG.diasUrgente, dias_frio: S.CONFIG.diasFrio, ventana_dias: S.CONFIG.ventanaDias },
          sin_responder: { ...sinResponderActual, ventana_dias: SR.CONFIG.ventanaDias, minimo_horas: SR.CONFIG.minimoHoras },
          hilos: lista.filter((h) => !h.pospuesto).map((h) => ({ ...h, clase_texto: { PRESUPUESTO: "Presupuesto", CONSULTA: "Consulta", CORTESIA: "Cortesía", OTRO: "Otro" }[h.clase] || null })),
          pospuestos: lista.filter((h) => h.pospuesto),
          descartados: await S.listar(db, { estados: ["DESCARTADO"], limite: 8 }),
        });
      }
      if (req.agente.id === "ventas") {
        const filas = await V.listarRegistros(db, { limite: 40 });
        const correcciones = await V.correccionesRecientes(db, { limite: 12 });
        return res.json({
          generado: new Date().toISOString(),
          conteos: await V.conteos(db),
          aprendizajes: { conteos: await Apr.conteos(db), abiertas: await Apr.listar(db, { estados: ["ABIERTA"], limite: 20 }), en_curso: await Apr.listar(db, { estados: ["EN_CURSO"], limite: 20 }), decididas: await Apr.listar(db, { estados: ["RESUELTA", "DESCARTADA"], limite: 8 }) },
          mails: filas.filter((m) => ["PENDIENTE", "BORRADOR", "ERROR"].includes(m.estado)),
          atendidos: filas.filter((m) => m.estado === "ATENDIDO").slice(0, 8).map((m) => ({ ...m, que_cambio: V.describirCambios(m.cambios) })),
          patrones: V.patronesDeCorreccion(correcciones),
          notas: await V.notasActivas(db),
          puede_configurar: String(req.usuario.rol || "").toUpperCase() === "ADMIN",
        });
      }
      if (req.agente.id === "produccion") return res.json({ generado: new Date().toISOString(), ...(await decisionProduccion(pool, { limite: 12 })) });
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
  // ---- Preguntale a la oficina: una pregunta, el equipo se reparte la respuesta ----
  app.post("/api/agentes/oficina/preguntar", async (req, res) => {
    const mensaje = String(req.body?.mensaje || "").trim().slice(0, 1500);
    if (!mensaje) return res.status(400).json({ error: "Escribí tu pregunta." });
    const usuario = await quien(req).catch(() => null);
    const disponibles = (await permisosDe(usuario)).filter((a) => chats[a.id]).map((a) => ({ id: a.id, nombre: a.nombre, puesto: a.puesto, descripcion: a.descripcion }));
    if (!disponibles.length) return res.status(403).json({ error: "Tu rol no tiene agentes habilitados." });
    const u = controlarUso(usuario.id);
    if (!u.ok) return res.status(429).json({ error: u.error });
    try {
      const r = await preguntarOficina({ ai, chats, disponibles, mensaje, usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol } });
      await registrarActividad(db, r.respuestas[0]?.agente || disponibles[0].id, "CHAT", `Pregunta a la oficina: ${mensaje.slice(0, 120)}`, `Contestaron: ${r.respuestas.map((x) => x.nombre).join(", ") || "nadie"}`, usuario.nombre);
      res.json({ success: true, ...r });
    } catch (error) {
      console.error("[oficina] Error:", error);
      const saturado = error && (error.status === 503 || error.status === 429);
      res.status(saturado ? 503 : 500).json({ error: saturado ? "El servicio de IA está saturado. Probá de nuevo en unos segundos." : "No pude procesar la pregunta." });
    } finally {
      u.liberar();
    }
  });

  // Confirmación (o cancelación) de un ajuste de stock que Nati propuso en el chat.
  app.post("/api/agentes/stock/confirmar", async (req, res) => {
    try {
      const usuario = await quien(req);
      if (!usuario || !(await tienePermiso(usuario, "agente:stock"))) return res.status(403).json({ error: "No tenés acceso a Nati." });
      if (req.body?.cancelar) return res.json(cancelarPropuesta({ usuario, token: req.body?.token }));
      const r = await confirmarPropuesta({ db, usuario, token: req.body?.token });
      if (r.error) return res.status(r.status || 400).json({ error: r.error });
      await registrarActividad(db, "stock", "AJUSTE_STOCK", `Ajuste de stock confirmado: ${r.materia}`, `${r.stock_anterior} → ${r.stock_actual} ${r.unidad} (${r.delta > 0 ? "+" : ""}${r.delta})`, usuario.nombre).catch(() => {});
      res.json({ success: true, ...r });
    } catch (e) {
      console.error("[agentes] confirmar ajuste de stock:", e.message);
      res.status(500).json({ error: "No pude aplicar el ajuste." });
    }
  });


  // ---- Sofi (seguimiento): borrador de seguimiento en el hilo (nunca se envía) y decisiones sobre cada hilo ----
  const soloSeguimiento = (req, res, next) => (req.agente.id === "seguimiento" ? next() : res.status(400).json({ error: "Esto es solo de Sofi." }));
  app.post("/api/agentes/:id/hilos/:tid/seguimiento", delAgente, soloSeguimiento, async (req, res) => {
    try {
      const r = await S.prepararSeguimiento({
        db, deps: seguimiento, ai, threadId: String(req.params.tid), reglas: await V.notasTexto(db).catch(() => ""), ejemplos: await V.ejemplosEnviadosTexto(db, { cantidad: 2, max: 600 }).catch(() => ""),
        textoPropio: req.body?.texto || null,
      });
      if (!r.ok) return res.status(r.status || 400).json({ error: r.error });
      if (!r.yaEstaba) await registrarActividad(db, "seguimiento", "BORRADOR", `${req.usuario.nombre} pidió el seguimiento de ${r.hilo.contacto_nombre || r.hilo.contacto_email}`, r.hilo.asunto, req.usuario.nombre);
      res.json({ success: true, ...r });
    } catch (e) {
      console.error("[seguimiento] borrador:", e.message);
      res.status(e.status === 401 ? 401 : 500).json({ error: e.status === 401 ? "Gmail no está conectado." : "No pude armar el seguimiento. Probá de nuevo." });
    }
  });
  const accionHilo = (nombre, hacer, verbo) =>
    app.post(`/api/agentes/:id/hilos/:tid/${nombre}`, delAgente, soloSeguimiento, async (req, res) => {
      try {
        const r = await hacer(req);
        if (r.error) return res.status(r.status || 400).json({ error: r.error });
        await registrarActividad(db, "seguimiento", "GESTION", `${req.usuario.nombre} ${verbo(r)}: ${r.hilo.contacto_nombre || r.hilo.contacto_email}`, r.hilo.asunto, req.usuario.nombre);
        res.json({ ok: true });
      } catch (e) {
        res.status(500).json({ error: "No pude guardar el cambio." });
      }
    });
  accionHilo("posponer", (req) => S.posponer(db, { threadId: req.params.tid, dias: req.body?.dias, usuario: req.usuario.nombre, nota: req.body?.nota }), (r) => `pospuso ${r.dias} ${r.dias === 1 ? "día" : "días"}`);
  accionHilo("descartar", (req) => S.descartar(db, { threadId: req.params.tid, usuario: req.usuario.nombre, nota: req.body?.nota }), () => "dejó de seguir");
  accionHilo("reabrir", (req) => S.reabrir(db, { threadId: req.params.tid, usuario: req.usuario.nombre }), () => "volvió a seguir");

  // ---- Cami (ventas): borrador a pedido (siempre con el descuento definido), aprendizajes y notas comerciales ----
  const soloVentas = (req, res, next) => (req.agente.id === "ventas" ? next() : res.status(400).json({ error: "Esto es solo de Cami." }));
  const armando = new Set();
  app.post("/api/agentes/:id/mails/:mailId/borrador", delAgente, soloVentas, async (req, res) => {
    const id = String(req.params.mailId);
    const descuento = V.validarDescuento(req.body?.descuento);
    if (!descuento) return res.status(400).json({ error: V.ERROR_DESCUENTO, codigo: "DESCUENTO_REQUERIDO" });
    if (armando.has(id)) return res.status(429).json({ error: "Ya estoy armando ese borrador, esperá un momento." });
    armando.add(id);
    try {
      const [[m]] = await db.query("SELECT mail_id, estado FROM ventas_mails WHERE mail_id = ?", [id]);
      if (!m) return res.status(404).json({ error: "No encontré ese mail." });
      if (m.estado === "ATENDIDO") return res.status(400).json({ error: "Ese mail ya tiene una respuesta enviada." });
      if (m.estado === "BORRADOR") return res.status(400).json({ error: "Ya hay un borrador armado: está en Borradores de Gmail." });
      const lista = await mails.listar();
      const completo = lista.find((x) => x.id === id);
      if (!completo) return res.status(400).json({ error: "Ese mail ya no tiene la etiqueta IA-Consulta en Gmail." });
      const r = await V.prepararBorrador({ db, mail: completo, borrador: mails.borrador, reglasExtra: await V.notasTexto(db), descuento, alObservar: observar });
      if (!r.ok) return res.status(500).json({ error: "No pude armar el borrador. Probá de nuevo en unos minutos." });
      await registrarActividad(db, "ventas", "BORRADOR", `${req.usuario.nombre} pidió el borrador de ${nombreCliente(completo.remitente, completo.emailCliente)} (${descuento.pct ? `${descuento.pct}% de descuento` : "sin descuento"})`, completo.asunto, req.usuario.nombre);
      // El aviso de este mail queda resuelto con la próxima revisión; la hacemos ahora para que el tablero lo refleje.
      await revisiones.ventas();
      res.json({ success: true, revision: r.revision });
    } catch (e) {
      console.error("[ventas] borrador a pedido:", e.message);
      res.status(e.status === 401 ? 401 : 500).json({ error: e.status === 401 ? "Gmail no está conectado." : "No pude armar el borrador." });
    } finally {
      armando.delete(id);
    }
  });
  app.get("/api/agentes/:id/descuento-sugerido", delAgente, soloVentas, async (req, res) => {
    try {
      res.json(await V.sugerirDescuento(db, req.query.email));
    } catch (e) {
      res.status(500).json({ error: "No pude buscar sugerencias de descuento." });
    }
  });
  app.get("/api/agentes/:id/aprendizajes", delAgente, soloVentas, async (req, res) => {
    try {
      const estados = String(req.query.estado || "ABIERTA").split(",").filter((x) => ["ABIERTA", "EN_CURSO", "RESUELTA", "DESCARTADA"].includes(x));
      res.json({ conteos: await Apr.conteos(db), aprendizajes: await Apr.listar(db, { estados: estados.length ? estados : ["ABIERTA"], limite: 60 }) });
    } catch (e) {
      res.status(500).json({ error: "No pude cargar lo que estoy aprendiendo." });
    }
  });
  // Buscador de productos para definir "qué productos tienen esta característica".
  app.get("/api/agentes/:id/productos-buscar", delAgente, soloVentas, async (req, res) => {
    try {
      const q = String(req.query.q || "").trim().slice(0, 60);
      const like = `%${q.replace(/[%_]/g, "")}%`;
      const [rows] = q ? await db.query("SELECT id, codigo, nombre FROM productos WHERE codigo LIKE ? OR nombre LIKE ? ORDER BY codigo LIMIT 25", [like, like]) : await db.query("SELECT id, codigo, nombre FROM productos ORDER BY codigo LIMIT 25");
      res.json({ productos: rows });
    } catch (e) {
      res.status(500).json({ error: "No pude buscar productos." });
    }
  });
  // La persona decide qué hacer con una sugerencia: queda guardada en la base y pasa a las reglas de los próximos borradores.
  app.post("/api/agentes/:id/aprendizajes/:aid/resolver", delAgente, soloVentas, async (req, res) => {
    try {
      const b = req.body || {};
      let productos = [];
      if (Array.isArray(b.productos) && b.productos.length) {
        const ids = b.productos.map(Number).filter(Number.isFinite).slice(0, 80);
        if (ids.length) [productos] = await db.query(`SELECT id, codigo, nombre FROM productos WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
      }
      const r = await Apr.resolver(db, { id: Number(req.params.aid), accion: String(b.accion || ""), decision: b.decision, productos, usuario: req.usuario.nombre });
      if (r.error) return res.status(r.status || 400).json({ error: r.error });
      await registrarActividad(db, "ventas", "GESTION", `${req.usuario.nombre} definió: ${r.titulo}`, `${Apr.ACCIONES[b.accion]}${r.nota ? `\n${r.nota}` : ""}`, req.usuario.nombre);
      res.json({ ok: true, ...r });
    } catch (e) {
      console.error("[ventas] resolver aprendizaje:", e.message);
      res.status(500).json({ error: "No pude guardar la decisión." });
    }
  });
  app.post("/api/agentes/:id/aprendizajes/:aid/cerrar", delAgente, soloVentas, async (req, res) => {
    try {
      const r = await Apr.cerrarEnCurso(db, { id: Number(req.params.aid), usuario: req.usuario.nombre, decision: req.body?.decision });
      if (r.error) return res.status(r.status || 400).json({ error: r.error });
      await registrarActividad(db, "ventas", "GESTION", `${req.usuario.nombre} marcó como hecho un pendiente de entrenamiento`, null, req.usuario.nombre);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "No pude guardar el cambio." });
    }
  });
  app.post("/api/agentes/:id/notas", delAgente, soloVentas, async (req, res) => {
    try {
      const r = await V.guardarNota(db, { texto: req.body?.texto, usuario: req.usuario.nombre });
      if (r.error) return res.status(400).json({ error: r.error });
      await registrarActividad(db, "ventas", "GESTION", `${req.usuario.nombre} anotó una regla comercial`, r.texto, req.usuario.nombre);
      res.json({ ok: true, ...r });
    } catch (e) {
      res.status(500).json({ error: "No pude guardar la nota." });
    }
  });
  app.delete("/api/agentes/:id/notas/:nid", delAgente, soloVentas, async (req, res) => {
    try {
      const r = await V.quitarNota(db, Number(req.params.nid));
      if (r.error) return res.status(404).json({ error: r.error });
      await registrarActividad(db, "ventas", "GESTION", `${req.usuario.nombre} quitó una regla comercial`, null, req.usuario.nombre);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "No pude quitar la nota." });
    }
  });
  // Confirmación (o cancelación) de una nota comercial que Cami propuso en el chat.
  app.post("/api/agentes/ventas/confirmar-nota", async (req, res) => {
    try {
      const usuario = await quien(req);
      if (!mails || !usuario || !(await tienePermiso(usuario, "agente:ventas"))) return res.status(403).json({ error: "No tenés acceso a Cami." });
      if (req.body?.cancelar) return res.json(cancelarNota({ usuario, token: req.body?.token }));
      const r = await confirmarNota({ db, usuario, token: req.body?.token });
      if (r.error) return res.status(r.status || 400).json({ error: r.error });
      await registrarActividad(db, "ventas", "GESTION", r.decision ? `${usuario.nombre} confirmó una decisión de entrenamiento` : `${usuario.nombre} confirmó una regla comercial`, r.texto, usuario.nombre);
      res.json({ success: true, ...r });
    } catch (e) {
      console.error("[agentes] confirmar nota:", e.message);
      res.status(500).json({ error: "No pude guardar la nota." });
    }
  });

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
      res.json({ success: true, respuesta: r.respuesta, herramientas: r.herramientas, derivacion: r.derivacion || null, confirmacion: r.confirmacion || null, ms: r.ms });
    } catch (error) {
      console.error(`[${req.agente.nombre}] Error:`, error);
      const saturado = error && (error.status === 503 || error.status === 429);
      res.status(saturado ? 503 : 500).json({ error: saturado ? "El servicio de IA está saturado. Probá de nuevo en unos segundos." : "Error al procesar la consulta." });
    } finally {
      u.liberar();
    }
  });

  // Ficha por operario (Lía): lista de personas y su historial de un año.
  const soloRRHH = (req, res, next) => (req.agente.id === "rrhh" ? next() : res.status(400).json({ error: "Este agente no tiene fichas de personal." }));
  app.get("/api/agentes/:id/personal", delAgente, soloRRHH, async (req, res) => {
    try {
      const anio = Number(req.query.anio) > 2000 ? Number(req.query.anio) : new Date().getFullYear();
      res.json({ anio, operarios: await listarOperarios(pool, anio) });
    } catch (e) {
      console.error("[agentes] personal:", e.message);
      res.status(500).json({ error: "No pude cargar el personal." });
    }
  });
  app.get("/api/agentes/:id/personal/ficha", delAgente, soloRRHH, async (req, res) => {
    try {
      const f = await fichaOperario(pool, { operario: String(req.query.operario || "").slice(0, 80), anio: req.query.anio });
      if (f.error) return res.status(400).json(f);
      res.json(f);
    } catch (e) {
      console.error("[agentes] ficha:", e.message);
      res.status(500).json({ error: "No pude armar la ficha." });
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
        solo_extras: q.tipo === "extras" || q.solo_extras === "1" || q.solo_extras === "true" || undefined,
        solo_con_categoria: q.solo_con_categoria === "1" || q.solo_con_categoria === "true" || undefined,
        fechas: typeof q.fechas === "string" && q.fechas ? q.fechas.split(",").map((f) => f.trim()).filter(Boolean).slice(0, 40) : undefined,
        detalle: "completo",
      };
      const liq = await liquidarDesdeBD(pool, params);
      if (liq.error) return res.status(400).json({ error: liq.error });
      const pdf = pdfLiquidacion(liq, { usuario: req.usuario.nombre, soloNormales: q.tipo === "normales" });
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

  // Reporte en PDF de cualquier agente: arma el PDF con el texto que el agente escribió en el chat.
  app.post("/api/agentes/:id/reporte.pdf", delAgente, async (req, res) => {
    const texto = String(req.body?.texto || "").trim().slice(0, 30000);
    if (!texto) return res.status(400).json({ error: "No hay nada para pasar a PDF." });
    try {
      const titulo = String(req.body?.titulo || "").trim().slice(0, 120) || `Reporte de ${req.agente.nombre}`;
      const pdf = pdfReporte({ agente: req.agente, titulo, texto, usuario: req.usuario.nombre });
      const slug = titulo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 40) || "reporte";
      await registrarActividad(db, req.agente.id, "GESTION", `${req.usuario.nombre} descargó un reporte en PDF`, titulo, req.usuario.nombre);
      res.set({ "Content-Type": "application/pdf", "Content-Length": pdf.length, "Content-Disposition": `attachment; filename="${slug}.pdf"`, "Cache-Control": "no-store" });
      res.send(pdf);
    } catch (e) {
      console.error("[agentes] reporte pdf:", e.message);
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

  // La reunión de las 08:00 se avisa por la campanita y al celular a todos los roles que tengan algún agente.
  const depsReunion = {
    pool, db, ai, agentes: AGENTES.filter(disponible),
    revisar: [revisiones.rrhh, revisiones.stock, revisiones.compras, ...(revisiones.ventas ? [revisiones.ventas] : []), ...(revisiones.seguimiento ? [revisiones.seguimiento] : [])],
    notificar: async (c) => {
      const [rows] = await db.query("SELECT DISTINCT rol_nombre FROM permisos_roles WHERE modulo_id LIKE 'agente:%' OR modulo_id = '*'");
      const roles = ["ADMIN", ...rows.map((r) => r.rol_nombre)];
      const partes = c.secciones.filter((x) => x.urgente).map((x) => `${x.nombre}: ${x.resumen}`);
      await crearNotificacion(db, {
        tipo: "AGENTE_REUNION",
        titulo: c.urgentes ? `Reunión de las 08:00: ${c.urgentes === 1 ? "1 cosa urgente" : `${c.urgentes} cosas urgentes`}` : "Reunión de las 08:00: todo en orden",
        texto: partes.length ? partes.join(" · ") : "Nada urgente esta mañana.",
        ruta: "/agentes", roles, push: true,
      });
    },
  };
  return { revisarRRHH: revisiones.rrhh, revisarStock: revisiones.stock, revisarCompras: revisiones.compras, revisarVentas: revisiones.ventas, revisarSeguimiento: revisiones.seguimiento, iniciarReunion: () => iniciarReunion(depsReunion) };
}

/** Deja corriendo el vigilante: una revisión poco después de arrancar y luego cada N minutos (sin IA, solo consultas). */
function iniciarVigilantes(agentes, { intervaloMin = Number(process.env.AGENTES_INTERVALO_MIN) || 30 } = {}) {
  if (String(process.env.AGENTES_VIGILANTE || "").toLowerCase() === "off") return () => {};
  const correr = () => {
    agentes.revisarRRHH().catch((e) => console.error("[agentes] vigilante RRHH:", e.message));
    // Nati revisa un poco después para no pisar la revisión de Lía.
    setTimeout(() => agentes.revisarStock?.().catch((e) => console.error("[agentes] vigilante stock:", e.message)), 15000).unref?.();
    setTimeout(() => agentes.revisarCompras?.().catch((e) => console.error("[agentes] vigilante compras:", e.message)), 30000).unref?.();
    setTimeout(() => agentes.revisarVentas?.().catch((e) => console.error("[agentes] vigilante ventas:", e.message)), 45000).unref?.();
    setTimeout(() => agentes.revisarSeguimiento?.().catch((e) => console.error("[agentes] vigilante seguimiento:", e.message)), 60000).unref?.();
  };
  agentes.iniciarReunion?.();
  const t0 = setTimeout(correr, 20000);
  const t = setInterval(correr, Math.max(5, intervaloMin) * 60 * 1000);
  t0.unref?.();
  t.unref?.();
  return () => {
    clearTimeout(t0);
    clearInterval(t);
  };
}

module.exports = { revisarSeguimiento, revisarVentas, revisarCompras, AGENTES, agentePorId, asegurarTablasAgentes, registrarRutasAgentes, iniciarVigilantes, revisarRRHH, revisarStock, ahoraArgentina };
