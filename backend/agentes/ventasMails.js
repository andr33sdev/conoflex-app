"use strict";
// Cami, la agente de ventas: trabaja los mails que la persona etiqueta como IA-Consulta en Gmail.
// REGLA DE ORO: solo deja BORRADORES en Gmail. Nunca envía nada: lo único que puede hacer con un mail es prepararle un borrador.
//
// Este archivo tiene la parte que no depende de la IA ni de Gmail directamente (todo lo de Gmail entra por `mails`, así se prueba solo):
//   - el registro de cada mail (tabla ventas_mails) y su ciclo: PENDIENTE → BORRADOR → ATENDIDO (o RETIRADO / DESCARTADO / ERROR);
//   - la comparación entre el borrador que armó y lo que finalmente se envió (para aprender de las correcciones);
//   - las notas que la persona confirma ("a los distribuidores siempre 35%"), que se suman a las reglas comerciales.

const ESTADOS = ["PENDIENTE", "BORRADOR", "ATENDIDO", "RETIRADO", "DESCARTADO", "ERROR"];
const MAX_AUTOMATICOS = 2; // borradores por revisión: cuida el gasto de IA y no llena Gmail de golpe
const MAX_INTENTOS = 3;

async function asegurarTablasVentas(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ventas_mails (
      mail_id VARCHAR(64) PRIMARY KEY,
      thread_id VARCHAR(64) NULL,
      asunto VARCHAR(300) NULL,
      remitente VARCHAR(300) NULL,
      email_cliente VARCHAR(200) NULL,
      resumen TEXT NULL,
      fecha_mail DATETIME NULL,
      estado VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE',
      draft_id VARCHAR(64) NULL,
      revision TEXT NULL,
      borrador_texto MEDIUMTEXT NULL,
      borrador_en DATETIME NULL,
      enviado_texto MEDIUMTEXT NULL,
      enviado_en DATETIME NULL,
      cambios TEXT NULL,
      nota VARCHAR(300) NULL,
      error VARCHAR(300) NULL,
      intentos INT NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_estado (estado, created_at)
    )`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS ventas_notas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      texto VARCHAR(500) NOT NULL,
      origen VARCHAR(20) NOT NULL DEFAULT 'USUARIO',
      creada_por VARCHAR(120) NULL,
      activa TINYINT NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
}

// ---------- texto y comparación ----------
const ENTIDADES = { "&nbsp;": " ", "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#39;": "'" };
function textoPlano(html) {
  return String(html || "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(nbsp|lt|gt|amp|quot|#39);/g, (m) => ENTIDADES[m] || m)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Saca del texto de un mail enviado la parte citada ("El … escribió:", líneas con ">") para comparar solo lo que se escribió. */
function sinCita(texto) {
  const lineas = String(texto || "").split("\n");
  const corte = lineas.findIndex((l, i) => /^(el .{5,120} (escribi[óo]|wrote):?\s*$|on .{5,120} wrote:?\s*$|-{2,}\s*(mensaje original|original message)|de:\s.+@)/i.test(l.trim()) || (l.trim().startsWith(">") && i > 0));
  return (corte >= 0 ? lineas.slice(0, corte) : lineas).join("\n").trim();
}

/** "35%" → 35, "12,5 %" → 12.5. */
function porcentajesEn(texto) {
  const out = new Set();
  for (const m of String(texto || "").matchAll(/(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g)) {
    const n = Number(m[1].replace(",", "."));
    if (n > 0 && n <= 100) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/** "$ 1.234.567,89" → 1234567.89. Solo importes con signo $ (los demás números son cantidades o medidas). */
function importesEn(texto) {
  const out = new Set();
  for (const m of String(texto || "").matchAll(/\$\s*([\d.]+(?:,\d{1,2})?)/g)) {
    const n = Number(m[1].replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n) && n > 0) out.add(Math.round(n * 100) / 100);
  }
  return [...out].sort((a, b) => a - b);
}

const palabras = (t) =>
  new Set(
    String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 4),
  );

/** Qué tanto se parecen dos textos (0 a 1), por palabras. */
function similitud(a, b) {
  const A = palabras(a);
  const B = palabras(b);
  if (!A.size && !B.size) return 1;
  let comunes = 0;
  for (const w of A) if (B.has(w)) comunes++;
  return comunes / (A.size + B.size - comunes || 1);
}

/**
 * Compara el borrador que armó Cami con lo que finalmente se envió.
 * Devuelve qué cambió en descuentos e importes (lo que de verdad importa para aprender) y qué tanto se reescribió el texto.
 */
function compararVersiones(borradorTexto, enviadoTexto) {
  const env = sinCita(enviadoTexto);
  const dB = porcentajesEn(borradorTexto);
  const dE = porcentajesEn(env);
  const iB = importesEn(borradorTexto);
  const iE = importesEn(env);
  const sim = similitud(borradorTexto, env);
  const quitados = iB.filter((x) => !iE.includes(x));
  const agregados = iE.filter((x) => !iB.includes(x));
  const descuentoCambio = dB.length > 0 && dE.length > 0 && (dB.some((x) => !dE.includes(x)) || dE.some((x) => !dB.includes(x)));
  const sinCambios = sim >= 0.9 && !descuentoCambio && !quitados.length && !agregados.length;
  return {
    sinCambios,
    similitud: Math.round(sim * 100) / 100,
    descuentoBorrador: dB,
    descuentoEnviado: dE,
    descuentoCambio,
    importesQuitados: quitados.slice(0, 8),
    importesAgregados: agregados.slice(0, 8),
    reescribio: sim < 0.6,
  };
}

const pct = (arr) => arr.map((n) => `${String(n).replace(".", ",")}%`).join(" / ");
const pesos = (n) => `$${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
function describirCambios(c) {
  if (!c) return "";
  if (c.sinCambios) return "Lo enviaste igual que el borrador.";
  const partes = [];
  if (c.descuentoCambio) partes.push(`descuento del borrador ${pct(c.descuentoBorrador)}, enviado ${pct(c.descuentoEnviado)}`);
  if (c.importesQuitados.length || c.importesAgregados.length) partes.push(`cambiaron ${Math.max(c.importesQuitados.length, c.importesAgregados.length)} importes (borrador: ${c.importesQuitados.slice(0, 3).map(pesos).join(", ") || "—"}; enviado: ${c.importesAgregados.slice(0, 3).map(pesos).join(", ") || "—"})`);
  if (c.reescribio) partes.push("reescribiste buena parte del texto");
  else if (!partes.length) partes.push("retocaste algunas frases");
  return partes.join("; ") + ".";
}

/**
 * Patrones en lo que se corrigió. Solo cuenta cuando se repite: una corrección suelta no es una regla.
 * Devuelve sugerencias de texto que la persona puede convertir en nota con confirmación.
 */
function patronesDeCorreccion(filas, { minimo = 2 } = {}) {
  const out = [];
  const conDesc = filas.filter((f) => f.cambios?.descuentoCambio && f.cambios.descuentoBorrador.length === 1 && f.cambios.descuentoEnviado.length === 1);
  const pares = new Map();
  for (const f of conDesc) {
    const k = `${f.cambios.descuentoBorrador[0]}>${f.cambios.descuentoEnviado[0]}`;
    pares.set(k, (pares.get(k) || 0) + 1);
  }
  for (const [k, n] of pares) {
    if (n < minimo) continue;
    const [de, a] = k.split(">");
    out.push({ tipo: "DESCUENTO", veces: n, texto: `Cambiaste el descuento de ${de.replace(".", ",")}% a ${a.replace(".", ",")}% en ${n} de los últimos ${filas.length} borradores.` });
  }
  const reescritos = filas.filter((f) => f.cambios?.reescribio).length;
  if (filas.length >= 3 && reescritos / filas.length >= 0.5) out.push({ tipo: "TEXTO", veces: reescritos, texto: `Reescribiste buena parte del texto en ${reescritos} de los últimos ${filas.length} borradores: contame cómo preferís que redacte y lo dejo anotado.` });
  const importes = filas.filter((f) => (f.cambios?.importesQuitados || []).length || (f.cambios?.importesAgregados || []).length).length;
  if (importes >= minimo) out.push({ tipo: "IMPORTES", veces: importes, texto: `Cambiaste importes en ${importes} borradores: conviene revisar con qué precios o condiciones los calculo.` });
  return out;
}

// ---------- tabla ----------
const recorte = (t, n) => String(t || "").slice(0, n);
const json = (v) => {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

function filaPublica(r) {
  return {
    mail_id: r.mail_id,
    asunto: r.asunto,
    remitente: r.remitente,
    email_cliente: r.email_cliente,
    resumen: r.resumen,
    fecha_mail: r.fecha_mail,
    estado: r.estado,
    draft_id: r.draft_id,
    revision: json(r.revision),
    cambios: json(r.cambios),
    nota: r.nota,
    error: r.error,
    intentos: r.intentos,
    recibido: r.created_at,
    borrador_en: r.borrador_en,
    enviado_en: r.enviado_en,
  };
}

async function listarRegistros(db, { estados = null, limite = 60 } = {}) {
  const where = estados?.length ? `WHERE estado IN (${estados.map(() => "?").join(",")})` : "";
  const [rows] = await db.query(`SELECT * FROM ventas_mails ${where} ORDER BY created_at DESC LIMIT ?`, [...(estados || []), limite]);
  return rows.map(filaPublica);
}

async function conteos(db) {
  const [rows] = await db.query("SELECT estado, COUNT(*) AS n FROM ventas_mails GROUP BY estado");
  const c = Object.fromEntries(ESTADOS.map((e) => [e, 0]));
  for (const r of rows) c[r.estado] = Number(r.n);
  return c;
}

// ---------- notas aprendidas ----------
async function notasActivas(db) {
  const [rows] = await db.query("SELECT id, texto, origen, creada_por, created_at FROM ventas_notas WHERE activa = 1 ORDER BY id").catch(() => [[]]);
  return rows;
}
/** Texto que se suma a las reglas comerciales cuando se arma un borrador. Vacío si no hay notas. */
async function notasTexto(db) {
  const notas = await notasActivas(db);
  if (!notas.length) return "";
  return `NOTAS COMERCIALES CONFIRMADAS POR EL EQUIPO DE VENTAS (valen igual que las reglas de arriba; ante un choque, mandan estas por ser más recientes):\n${notas.map((n) => `- ${n.texto}`).join("\n")}`;
}
async function guardarNota(db, { texto, usuario, origen = "USUARIO" }) {
  const t = recorte(String(texto || "").replace(/\s+/g, " ").trim(), 500);
  if (t.length < 8) return { error: "La nota es muy corta. Escribila completa." };
  const [dup] = await db.query("SELECT id FROM ventas_notas WHERE activa = 1 AND LOWER(texto) = LOWER(?)", [t]);
  if (dup.length) return { error: "Esa nota ya está anotada." };
  const [r] = await db.query("INSERT INTO ventas_notas (texto, origen, creada_por) VALUES (?,?,?)", [t, origen, usuario ? recorte(usuario, 120) : null]);
  return { ok: true, id: r.insertId, texto: t };
}
async function quitarNota(db, id) {
  const [r] = await db.query("UPDATE ventas_notas SET activa = 0 WHERE id = ? AND activa = 1", [id]);
  return r.affectedRows ? { ok: true } : { error: "No encontré esa nota." };
}

// ---------- sincronización con Gmail ----------
/**
 * Registra los mails etiquetados que todavía no conocía. Si el hilo ya tiene una respuesta nuestra como último mensaje, queda ATENDIDO;
 * si ya hay un borrador en el hilo (por ejemplo, armado a mano desde la pantalla comercial), no se duplica: queda BORRADOR.
 * Los pendientes cuya etiqueta se sacó pasan a RETIRADO.
 */
async function sincronizar({ db, mails, listar, estadoHilo }) {
  const lista = await listar();
  const vistos = new Set();
  const nuevos = [];
  for (const m of lista) {
    vistos.add(m.id);
    const [[previo]] = await db.query("SELECT mail_id, estado FROM ventas_mails WHERE mail_id = ?", [m.id]);
    if (previo) {
      // Si volvieron a etiquetar un mail que se había retirado o descartado, vuelve a la cola.
      if (["RETIRADO", "DESCARTADO"].includes(previo.estado)) await db.query("UPDATE ventas_mails SET estado = 'PENDIENTE', intentos = 0, error = NULL, draft_id = NULL WHERE mail_id = ?", [m.id]);
      continue;
    }
    let estado = "PENDIENTE";
    let nota = null;
    try {
      const h = await estadoHilo(m.threadId, 0);
      if (h.ultimoEsNuestro) {
        estado = "ATENDIDO";
        nota = "Ya tenía una respuesta enviada.";
      } else if (h.borradoresEnHilo > 0) {
        estado = "BORRADOR";
        nota = "Ya había un borrador armado en este hilo; no armé otro.";
      }
    } catch (e) {
      console.error("[ventas] hilo:", e.message);
    }
    await db.query(
      "INSERT INTO ventas_mails (mail_id, thread_id, asunto, remitente, email_cliente, resumen, fecha_mail, estado, nota) VALUES (?,?,?,?,?,?,?,?,?)",
      [m.id, m.threadId, recorte(m.asunto, 300), recorte(m.remitente, 300), recorte(m.emailCliente, 200), recorte(m.cuerpoCompleto || m.resumen, 2500), m.fecha ? new Date(m.fecha) : null, estado, nota],
    );
    if (estado === "PENDIENTE") nuevos.push({ id: m.id, asunto: m.asunto, remitente: m.remitente });
  }
  const [abiertos] = await db.query("SELECT mail_id FROM ventas_mails WHERE estado IN ('PENDIENTE','ERROR')");
  let retirados = 0;
  for (const a of abiertos) {
    if (!vistos.has(a.mail_id)) {
      await db.query("UPDATE ventas_mails SET estado = 'RETIRADO' WHERE mail_id = ?", [a.mail_id]);
      retirados++;
    }
  }
  return { nuevos, retirados, vistos: lista, total: lista.length };
}

/** Prepara el borrador de UN mail. Nunca envía. `mail`: el objeto completo de Gmail (con imágenes). */
async function prepararBorrador({ db, mail, borrador, reglasExtra = "" }) {
  const consultaText = [`Asunto: ${mail.asunto}`, mail.cuerpoCompleto || mail.resumen].filter(Boolean).join("\n\n");
  try {
    const r = await borrador({
      mailCliente: mail.emailCliente,
      consultaText,
      asunto: /^re:/i.test(mail.asunto || "") ? mail.asunto : `Re: ${mail.asunto || "Consulta"}`,
      threadId: mail.threadId,
      imagenes: mail.imagenes,
      nombreCliente: mail.remitente,
      reglasExtra,
    });
    await db.query(
      "UPDATE ventas_mails SET estado = 'BORRADOR', draft_id = ?, revision = ?, borrador_texto = ?, borrador_en = NOW(), error = NULL, nota = NULL WHERE mail_id = ?",
      [r.draftId, JSON.stringify(r.revision || null), recorte(textoPlano(r.html), 60000), mail.id],
    );
    return { ok: true, draftId: r.draftId, revision: r.revision || null };
  } catch (e) {
    console.error("[ventas] borrador:", e.message);
    await db.query("UPDATE ventas_mails SET estado = 'ERROR', error = ?, intentos = intentos + 1 WHERE mail_id = ?", [recorte(e.message, 290), mail.id]);
    return { ok: false, error: e.message };
  }
}

/**
 * Mira los borradores que ya armó: si se envió una respuesta en el hilo, queda ATENDIDO y se guarda qué cambió respecto del borrador;
 * si el borrador desapareció sin enviarse, queda DESCARTADO.
 */
async function revisarBorradores({ db, estadoHilo, existeBorrador }) {
  const [rows] = await db.query("SELECT mail_id, thread_id, draft_id, borrador_texto, UNIX_TIMESTAMP(borrador_en) * 1000 AS desde FROM ventas_mails WHERE estado = 'BORRADOR' AND draft_id IS NOT NULL");
  const out = { atendidos: [], descartados: [] };
  for (const r of rows) {
    try {
      const h = await estadoHilo(r.thread_id, Number(r.desde) || 0);
      if (h.enviado) {
        const cambios = compararVersiones(r.borrador_texto, h.enviadoTexto);
        await db.query("UPDATE ventas_mails SET estado = 'ATENDIDO', enviado_texto = ?, enviado_en = ?, cambios = ? WHERE mail_id = ?", [
          recorte(sinCita(h.enviadoTexto), 60000), new Date(h.enviadoEn || Date.now()), JSON.stringify(cambios), r.mail_id,
        ]);
        out.atendidos.push({ mail_id: r.mail_id, cambios });
      } else if (!(await existeBorrador(r.draft_id))) {
        await db.query("UPDATE ventas_mails SET estado = 'DESCARTADO', nota = 'El borrador se borró sin enviarse.' WHERE mail_id = ?", [r.mail_id]);
        out.descartados.push(r.mail_id);
      }
    } catch (e) {
      console.error("[ventas] revisando borrador:", e.message);
    }
  }
  return out;
}

/** Correcciones recientes (mails ya enviados que tenían borrador de Cami). */
async function correccionesRecientes(db, { limite = 12 } = {}) {
  const [rows] = await db.query("SELECT mail_id, asunto, remitente, cambios, enviado_en FROM ventas_mails WHERE estado = 'ATENDIDO' AND cambios IS NOT NULL ORDER BY enviado_en DESC LIMIT ?", [limite]);
  return rows.map((r) => ({ mail_id: r.mail_id, asunto: r.asunto, remitente: r.remitente, enviado_en: r.enviado_en, cambios: json(r.cambios) })).filter((r) => r.cambios);
}

module.exports = {
  ESTADOS, MAX_AUTOMATICOS, MAX_INTENTOS,
  asegurarTablasVentas, textoPlano, sinCita, porcentajesEn, importesEn, similitud, compararVersiones, describirCambios, patronesDeCorreccion,
  listarRegistros, conteos, filaPublica, notasActivas, notasTexto, guardarNota, quitarNota,
  sincronizar, prepararBorrador, revisarBorradores, correccionesRecientes,
};
