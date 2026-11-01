"use strict";
// Lo que Cami aprende con cada mail: puntos grises (algo que preguntaron y no está definido), características que piden los clientes,
// preguntas que se repiten y mejoras posibles. Cada sugerencia queda guardada con la evidencia (el mail y la frase del cliente) y,
// cuando la persona decide qué hacer, la decisión queda en la base y pasa a formar parte de lo que Cami sabe al armar los próximos borradores.
const { guardarNota } = require("./ventasMails");

const TIPOS = {
  VACIO: "Falta definir",
  CARACTERISTICA: "Característica pedida",
  PREGUNTA: "Pregunta que se repite",
  MEJORA: "Posible mejora",
};
// Estados: ABIERTA (sin decidir), EN_CURSO (se decidió trabajarlo), RESUELTA (definido), DESCARTADA (no aplica).
const ACCIONES = {
  REGLA: "Dejarlo como regla comercial",
  PRODUCTOS: "Definir qué productos lo tienen",
  EN_CURSO: "Lo vamos a trabajar",
  DESCARTAR: "No aplica",
};
const UMBRAL_PARECIDO = 0.5;
const VACIAS = new Set(["para", "con", "los", "las", "del", "una", "uno", "por", "que", "sus", "como", "sobre", "entre", "mas", "sin"]);
/** Palabras con sentido de un título, sin plurales ("plazos" = "plazo") para reconocer la misma duda escrita distinto. */
const raices = (t) => new Set(sinAcentos(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !VACIAS.has(w)).map((w) => (w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w)));
function similitud(a, b) {
  const A = raices(a);
  const B = raices(b);
  let comunes = 0;
  for (const w of A) if (B.has(w)) comunes++;
  return comunes / (A.size + B.size - comunes || 1);
}

const recorte = (t, n) => String(t ?? "").slice(0, n);
const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const claveDe = (tipo, titulo) => `${tipo}:${[...raices(titulo)].sort().slice(0, 6).join("-")}`.slice(0, 190);

async function asegurarTablasAprendizaje(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ventas_aprendizajes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      clave VARCHAR(190) NOT NULL,
      tipo VARCHAR(16) NOT NULL,
      titulo VARCHAR(255) NOT NULL,
      detalle TEXT NULL,
      veces INT NOT NULL DEFAULT 1,
      estado VARCHAR(12) NOT NULL DEFAULT 'ABIERTA',
      accion VARCHAR(12) NULL,
      decision VARCHAR(600) NULL,
      productos TEXT NULL,
      nota_id INT NULL,
      decidido_por VARCHAR(120) NULL,
      decidido_en DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_clave (clave),
      KEY idx_estado (estado, veces)
    )`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS ventas_aprendizajes_mails (
      id INT AUTO_INCREMENT PRIMARY KEY,
      aprendizaje_id INT NOT NULL,
      mail_id VARCHAR(64) NOT NULL,
      cliente VARCHAR(200) NULL,
      asunto VARCHAR(300) NULL,
      evidencia TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_mail (aprendizaje_id, mail_id),
      KEY idx_apr (aprendizaje_id)
    )`);
}

/**
 * Guarda lo que la IA notó en un mail. Si ya había algo parecido (aunque esté redactado distinto) suma una vez más en vez de duplicar:
 * así lo que se repite sube solo a lo más importante. Lo que ya se decidió no se reabre, pero sigue contando cuántas veces vuelve a aparecer.
 */
async function registrarObservaciones(db, { mailId, cliente, asunto, observaciones }) {
  const resultado = { nuevas: 0, repetidas: 0 };
  for (const o of observaciones || []) {
    const tipo = String(o.tipo || "").toUpperCase();
    const titulo = recorte(String(o.titulo || "").replace(/\s+/g, " ").trim(), 250);
    if (!TIPOS[tipo] || titulo.length < 6) continue;
    const [existentes] = await db.query("SELECT id, titulo, estado FROM ventas_aprendizajes WHERE tipo = ? AND estado <> 'DESCARTADA' ORDER BY id DESC LIMIT 300", [tipo]);
    const k = claveDe(tipo, titulo);
    let previo = existentes.find((e) => similitud(e.titulo, titulo) >= UMBRAL_PARECIDO);
    if (!previo) {
      const [[porClave]] = await db.query("SELECT id, titulo, estado FROM ventas_aprendizajes WHERE clave = ?", [k]);
      previo = porClave;
    }
    let id;
    if (previo) {
      id = previo.id;
      const [[ya]] = await db.query("SELECT id FROM ventas_aprendizajes_mails WHERE aprendizaje_id = ? AND mail_id = ?", [id, mailId]);
      if (ya) continue;
      await db.query("UPDATE ventas_aprendizajes SET veces = veces + 1 WHERE id = ?", [id]);
      resultado.repetidas++;
    } else {
      const [r] = await db.query("INSERT INTO ventas_aprendizajes (clave, tipo, titulo, detalle) VALUES (?,?,?,?)", [k, tipo, titulo, recorte(o.detalle, 1000) || null]);
      id = r.insertId;
      resultado.nuevas++;
    }
    await db.query("INSERT IGNORE INTO ventas_aprendizajes_mails (aprendizaje_id, mail_id, cliente, asunto, evidencia) VALUES (?,?,?,?,?)", [id, String(mailId), recorte(cliente, 200), recorte(asunto, 300), recorte(o.evidencia, 400) || null]);
  }
  return resultado;
}

/** Patrones que se repiten al corregir borradores: entran como "posible mejora" con la misma lógica (sin duplicarse). */
async function registrarPatrones(db, patrones) {
  let nuevas = 0;
  for (const p of patrones || []) {
    const titulo = recorte(p.texto, 250);
    const k = `PATRON:${p.tipo}`;
    const [[previo]] = await db.query("SELECT id, estado FROM ventas_aprendizajes WHERE clave = ?", [k]);
    if (!previo) {
      await db.query("INSERT INTO ventas_aprendizajes (clave, tipo, titulo, detalle, veces) VALUES (?,?,?,?,?)", [k, "MEJORA", titulo, "Sale de comparar mis borradores con lo que finalmente enviaste.", p.veces || 2]);
      nuevas++;
    } else if (previo.estado === "ABIERTA") {
      await db.query("UPDATE ventas_aprendizajes SET titulo = ?, veces = ? WHERE id = ?", [titulo, p.veces || 2, previo.id]);
    }
  }
  return nuevas;
}

const json = (v) => {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};
const publica = (r, ejemplos = []) => ({
  id: r.id, tipo: r.tipo, tipo_texto: TIPOS[r.tipo] || r.tipo, titulo: r.titulo, detalle: r.detalle, veces: Number(r.veces), estado: r.estado,
  accion: r.accion, accion_texto: ACCIONES[r.accion] || null, decision: r.decision, productos: json(r.productos) || [], decidido_por: r.decidido_por, decidido_en: r.decidido_en, creada: r.created_at,
  ejemplos,
});

async function ejemplosDe(db, ids, por = 3) {
  if (!ids.length) return new Map();
  const [rows] = await db.query(`SELECT aprendizaje_id, mail_id, cliente, asunto, evidencia, created_at FROM ventas_aprendizajes_mails WHERE aprendizaje_id IN (${ids.map(() => "?").join(",")}) ORDER BY id DESC`, ids);
  const m = new Map();
  for (const r of rows) {
    const l = m.get(r.aprendizaje_id) || [];
    if (l.length < por) l.push({ mail_id: r.mail_id, cliente: r.cliente, asunto: r.asunto, evidencia: r.evidencia });
    m.set(r.aprendizaje_id, l);
  }
  return m;
}

/** Lista para la pantalla y el chat: primero lo que más se repite. */
async function listar(db, { estados = ["ABIERTA"], limite = 30 } = {}) {
  const [rows] = await db.query(`SELECT * FROM ventas_aprendizajes WHERE estado IN (${estados.map(() => "?").join(",")}) ORDER BY ${estados.includes("ABIERTA") && estados.length === 1 ? "veces DESC, id DESC" : "COALESCE(decidido_en, created_at) DESC"} LIMIT ?`, [...estados, limite]);
  const ej = await ejemplosDe(db, rows.map((r) => r.id));
  return rows.map((r) => publica(r, ej.get(r.id) || []));
}
async function obtener(db, id) {
  const [[r]] = await db.query("SELECT * FROM ventas_aprendizajes WHERE id = ?", [id]);
  if (!r) return null;
  return publica(r, (await ejemplosDe(db, [r.id], 10)).get(r.id) || []);
}
async function conteos(db) {
  const [rows] = await db.query("SELECT estado, COUNT(*) AS n FROM ventas_aprendizajes GROUP BY estado");
  const c = { ABIERTA: 0, EN_CURSO: 0, RESUELTA: 0, DESCARTADA: 0 };
  for (const r of rows) c[r.estado] = Number(r.n);
  return c;
}

/** Nota que se suma a las reglas de cada borrador según lo decidido. */
function textoDeNota(a, { accion, decision, productos }) {
  const d = recorte(String(decision || "").replace(/\s+/g, " ").trim(), 380);
  if (accion === "REGLA") return d;
  if (accion === "PRODUCTOS") return `${a.titulo}: ${productos.length ? `lo tienen estos productos: ${productos.map((p) => p.codigo).join(", ")}.` : "ningún producto lo tiene."}${d ? ` ${d}` : ""}`;
  if (accion === "EN_CURSO") return `${a.titulo}: todavía no está definido, lo estamos trabajando. No lo prometas ni lo afirmes; decile al cliente que lo consultamos y le confirmamos.${d ? ` ${d}` : ""}`;
  return null;
}

/**
 * Guarda la decisión de la persona. REGLA, PRODUCTOS y EN_CURSO suman una nota que Cami usa desde el próximo borrador;
 * DESCARTAR deja registro de que no aplica (y no vuelve a molestar). `productos`: [{ id, codigo, nombre }] ya verificados contra el catálogo.
 */
async function resolver(db, { id, accion, decision = "", productos = [], usuario }) {
  if (!ACCIONES[accion]) return { error: "Elegí qué hacer con esto.", status: 400 };
  const a = await obtener(db, id);
  if (!a) return { error: "No encontré esa sugerencia.", status: 404 };
  const d = String(decision || "").trim();
  if ((accion === "REGLA") && d.length < 8) return { error: "Escribí la regla completa para dejarla anotada.", status: 400 };
  if (accion === "PRODUCTOS" && !productos.length && d.length < 3) return { error: "Elegí qué productos lo tienen (o escribí que ninguno).", status: 400 };
  let notaId = null;
  const texto = textoDeNota(a, { accion, decision: d, productos });
  if (texto) {
    const r = await guardarNota(db, { texto, usuario, origen: "APRENDIZAJE" });
    if (r.error && !/ya está anotada/.test(r.error)) return { error: r.error, status: 400 };
    notaId = r.id || null;
  }
  const estado = accion === "EN_CURSO" ? "EN_CURSO" : accion === "DESCARTAR" ? "DESCARTADA" : "RESUELTA";
  await db.query("UPDATE ventas_aprendizajes SET estado = ?, accion = ?, decision = ?, productos = ?, nota_id = ?, decidido_por = ?, decidido_en = NOW() WHERE id = ?", [
    estado, accion, recorte(d, 600) || null, JSON.stringify(productos.map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre }))), notaId, usuario ? recorte(usuario, 120) : null, id,
  ]);
  return { ok: true, estado, nota: texto, titulo: a.titulo };
}

/** Marca como resuelta una cosa que estaba "en curso" (ya se hizo). */
async function cerrarEnCurso(db, { id, usuario, decision = "" }) {
  const [r] = await db.query("UPDATE ventas_aprendizajes SET estado = 'RESUELTA', decision = COALESCE(NULLIF(?, ''), decision), decidido_por = ?, decidido_en = NOW() WHERE id = ? AND estado = 'EN_CURSO'", [recorte(decision, 600), usuario || null, id]);
  return r.affectedRows ? { ok: true } : { error: "Esa sugerencia no está en curso.", status: 404 };
}

/** Busca productos del catálogo por código o nombre (para "qué productos tienen esta característica"). */
async function buscarProductos(db, textos) {
  const [todos] = await db.query("SELECT id, codigo, nombre FROM productos");
  const out = [];
  const noEncontrados = [];
  for (const t of textos) {
    const q = sinAcentos(t).trim();
    if (!q) continue;
    const hit = todos.find((p) => sinAcentos(p.codigo) === q) || todos.find((p) => sinAcentos(p.codigo).startsWith(q)) || todos.find((p) => sinAcentos(p.nombre).includes(q));
    if (hit && !out.some((x) => x.id === hit.id)) out.push(hit);
    else if (!hit) noEncontrados.push(t);
  }
  return { productos: out, noEncontrados };
}

module.exports = { TIPOS, ACCIONES, asegurarTablasAprendizaje, registrarObservaciones, registrarPatrones, listar, obtener, conteos, resolver, cerrarEnCurso, buscarProductos, claveDe, similitud };
