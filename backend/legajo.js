"use strict";
// Legajo por operario: resumen de asistencia y producción en el rango que se elija, sanciones (amonestaciones y suspensión)
// y notas personales de cada jefe sobre el operario (positivas, negativas o neutras; cada uno ve solo las suyas).
// Regla de la empresa: la 1.ª y la 2.ª sanción son amonestaciones y la 3.ª es suspensión. El número se calcula siempre sobre las
// sanciones vigentes (las anuladas no cuentan), ordenadas por fecha, así que anular o cargar una con fecha anterior renumera solo.
const { liquidarDesdeBD } = require("./liquidacionDb");

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const err = (status, mensaje) => Object.assign(new Error(mensaje), { status });

const MAX_ARCHIVO = 6 * 1024 * 1024;
const TIPOS_ARCHIVO = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);

async function asegurarLegajo(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS legajo_sanciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    operario VARCHAR(150) NOT NULL,
    fecha DATE NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    detalle TEXT NULL,
    suspension_desde DATE NULL,
    suspension_hasta DATE NULL,
    anulada TINYINT NOT NULL DEFAULT 0,
    anulada_motivo VARCHAR(255) NULL,
    anulada_por VARCHAR(120) NULL,
    anulada_en DATETIME NULL,
    creado_por VARCHAR(120) NULL,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_operario (operario, fecha)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS legajo_sanciones_archivos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sancion_id INT NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    tipo VARCHAR(100) NOT NULL,
    tamano INT NOT NULL,
    contenido LONGBLOB NOT NULL,
    subido_por VARCHAR(120) NULL,
    subido_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_sancion (sancion_id)
  )`);
}

async function asegurarNotas(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS legajo_notas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    operario VARCHAR(150) NOT NULL,
    fecha DATE NOT NULL,
    texto TEXT NOT NULL,
    tono VARCHAR(10) NULL,
    autor_id INT NOT NULL,
    autor_nombre VARCHAR(120) NULL,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    editado_en DATETIME NULL,
    KEY idx_autor_operario (autor_id, operario, fecha)
  )`);
}

const TONOS = ["POSITIVO", "NEGATIVO"];
const hoyLocal = () => fechaDe(new Date());

function datosNota(b, { parcial = false } = {}) {
  const out = {};
  if (!parcial || b.texto !== undefined) {
    const t = String(b.texto || "").trim();
    if (!t) throw err(400, "La nota está vacía.");
    out.texto = t.slice(0, 5000);
  }
  if (!parcial || b.tono !== undefined) out.tono = TONOS.includes(b.tono) ? b.tono : null;
  if (!parcial || b.fecha !== undefined) {
    const f = b.fecha ? String(b.fecha) : hoyLocal();
    if (!FECHA.test(f)) throw err(400, "Fecha inválida.");
    if (f > hoyLocal()) throw err(400, "La fecha no puede ser futura.");
    out.fecha = f;
  }
  return out;
}

/** Notas que escribió este usuario sobre el operario (las de otros no se ven), más nuevas primero, con el balance. */
async function leerNotas(db, { operario, autorId }) {
  await asegurarNotas(db);
  const [notas] = await db.query(
    `SELECT id, operario, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, texto, tono, autor_nombre,
            DATE_FORMAT(creado_en, '%Y-%m-%d %H:%i') AS creado_en, DATE_FORMAT(editado_en, '%Y-%m-%d %H:%i') AS editado_en
       FROM legajo_notas WHERE autor_id = ? AND operario = ? ORDER BY fecha DESC, id DESC`,
    [autorId, operario],
  );
  return { notas, positivas: notas.filter((n) => n.tono === "POSITIVO").length, negativas: notas.filter((n) => n.tono === "NEGATIVO").length, total: notas.length };
}

async function crearNota(db, { operario, autorId, autorNombre, ...b }) {
  await asegurarNotas(db);
  operario = String(operario || "").trim();
  if (!operario) throw err(400, "Falta el operario.");
  if (!autorId) throw err(401, "Sesión inválida.");
  const d = datosNota(b);
  const [r] = await db.query("INSERT INTO legajo_notas (operario, fecha, texto, tono, autor_id, autor_nombre) VALUES (?,?,?,?,?,?)", [operario.slice(0, 150), d.fecha, d.texto, d.tono, autorId, autorNombre ? String(autorNombre).slice(0, 120) : null]);
  return { ok: true, id: r.insertId };
}

/** Solo quien la escribió puede cambiarla o borrarla. */
async function notaPropia(db, id, autorId) {
  await asegurarNotas(db);
  const [[n]] = await db.query("SELECT id, autor_id FROM legajo_notas WHERE id = ?", [id]);
  if (!n || n.autor_id !== autorId) throw err(404, "Esa nota no existe.");
  return n;
}

async function editarNota(db, { id, autorId, ...b }) {
  await notaPropia(db, id, autorId);
  const d = datosNota(b, { parcial: true });
  const campos = Object.keys(d);
  if (!campos.length) return { ok: true };
  await db.query(`UPDATE legajo_notas SET ${campos.map((c) => `${c} = ?`).join(", ")}, editado_en = NOW() WHERE id = ?`, [...campos.map((c) => d[c]), id]);
  return { ok: true };
}

async function borrarNota(db, { id, autorId }) {
  await notaPropia(db, id, autorId);
  await db.query("DELETE FROM legajo_notas WHERE id = ?", [id]);
  return { ok: true };
}

/** Qué sería la sanción número n según la regla de la empresa. */
function tipoDeSancion(n) {
  return n >= 3 ? "SUSPENSION" : "AMONESTACION";
}
const etiquetaSancion = (n) => (n >= 3 ? "Suspensión" : `${n}.ª amonestación`);

/** Numera las sanciones vigentes (por fecha y luego por orden de carga). Las anuladas quedan sin número. */
function numerarSanciones(filas) {
  const vigentes = filas.filter((s) => !s.anulada).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || a.id - b.id);
  const numero = new Map(vigentes.map((s, i) => [s.id, i + 1]));
  const lista = filas.map((s) => {
    const n = numero.get(s.id) || null;
    return { ...s, numero: n, tipo: n ? tipoDeSancion(n) : null, etiqueta: n ? etiquetaSancion(n) : "Anulada" };
  });
  const siguiente = vigentes.length + 1;
  return { lista, vigentes: vigentes.length, proxima: { numero: siguiente, tipo: tipoDeSancion(siguiente), etiqueta: etiquetaSancion(siguiente) } };
}

const fechaDe = (v) => (v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}` : v ? String(v).slice(0, 10) : null);

async function leerSanciones(db, operario) {
  await asegurarLegajo(db);
  const [filas] = await db.query(
    `SELECT id, operario, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, motivo, detalle,
            DATE_FORMAT(suspension_desde, '%Y-%m-%d') AS suspension_desde, DATE_FORMAT(suspension_hasta, '%Y-%m-%d') AS suspension_hasta,
            anulada, anulada_motivo, anulada_por, DATE_FORMAT(anulada_en, '%Y-%m-%d %H:%i') AS anulada_en, creado_por, DATE_FORMAT(creado_en, '%Y-%m-%d %H:%i') AS creado_en
       FROM legajo_sanciones WHERE operario = ? ORDER BY fecha, id`,
    [operario],
  );
  const [arch] = filas.length
    ? await db.query("SELECT id, sancion_id, nombre, tipo, tamano, subido_por, DATE_FORMAT(subido_en, '%Y-%m-%d %H:%i') AS subido_en FROM legajo_sanciones_archivos WHERE sancion_id IN (?) ORDER BY id", [filas.map((f) => f.id)])
    : [[]];
  const porSancion = new Map();
  for (const a of arch) porSancion.set(a.sancion_id, [...(porSancion.get(a.sancion_id) || []), a]);
  const { lista, vigentes, proxima } = numerarSanciones(filas.map((f) => ({ ...f, anulada: !!f.anulada, archivos: porSancion.get(f.id) || [] })));
  return { sanciones: lista.reverse(), vigentes, proxima };
}

function validarArchivo(a) {
  if (!a || !a.buffer?.length) throw err(400, "El archivo está vacío.");
  if (a.size > MAX_ARCHIVO || a.buffer.length > MAX_ARCHIVO) throw err(413, `El archivo "${a.originalname}" pesa más de 6 MB.`);
  if (!TIPOS_ARCHIVO.has(a.mimetype)) throw err(415, `"${a.originalname}": solo se aceptan PDF, imágenes o Word.`);
}

async function guardarArchivos(db, sancionId, archivos, usuario) {
  for (const a of archivos || []) {
    await db.query("INSERT INTO legajo_sanciones_archivos (sancion_id, nombre, tipo, tamano, contenido, subido_por) VALUES (?,?,?,?,?,?)", [sancionId, String(a.originalname || "archivo").slice(0, 255), a.mimetype, a.buffer.length, a.buffer, usuario ? String(usuario).slice(0, 120) : null]);
  }
}

/** Registra una sanción. El tipo (amonestación o suspensión) lo define la cantidad de sanciones vigentes, no quien la carga. */
async function crearSancion(db, { operario, fecha, motivo, detalle, suspension_desde, suspension_hasta, archivos = [], usuario }) {
  operario = String(operario || "").trim();
  if (!operario) throw err(400, "Falta el operario.");
  if (!FECHA.test(String(fecha || ""))) throw err(400, "Poné la fecha de la sanción.");
  motivo = String(motivo || "").trim();
  if (!motivo) throw err(400, "Poné el motivo.");
  for (const a of archivos) validarArchivo(a);
  const previas = await leerSanciones(db, operario);
  // El número que le toca según la fecha: cuántas vigentes tienen fecha menor o igual (las de la misma fecha van antes, por orden de carga).
  const numero = previas.sanciones.filter((s) => s.numero && s.fecha <= fecha).length + 1;
  const sera = tipoDeSancion(numero);
  let desde = null;
  let hasta = null;
  if (sera === "SUSPENSION") {
    desde = suspension_desde || null;
    hasta = suspension_hasta || null;
    if ((desde && !FECHA.test(desde)) || (hasta && !FECHA.test(hasta))) throw err(400, "Las fechas de la suspensión no son válidas.");
    if (desde && hasta && hasta < desde) throw err(400, "La suspensión termina antes de empezar.");
  }
  const [r] = await db.query("INSERT INTO legajo_sanciones (operario, fecha, motivo, detalle, suspension_desde, suspension_hasta, creado_por) VALUES (?,?,?,?,?,?,?)", [operario, fecha, motivo.slice(0, 255), detalle ? String(detalle).slice(0, 4000) : null, desde, hasta, usuario ? String(usuario).slice(0, 120) : null]);
  await guardarArchivos(db, r.insertId, archivos, usuario);
  const despues = await leerSanciones(db, operario);
  const creada = despues.sanciones.find((s) => s.id === r.insertId);
  return { ok: true, id: r.insertId, numero: creada.numero, tipo: creada.tipo, etiqueta: creada.etiqueta, proxima: despues.proxima };
}

async function adjuntarArchivos(db, { sancion_id, archivos, usuario }) {
  await asegurarLegajo(db);
  const [[s]] = await db.query("SELECT id FROM legajo_sanciones WHERE id = ?", [sancion_id]);
  if (!s) throw err(404, "Esa sanción no existe.");
  if (!archivos?.length) throw err(400, "No hay archivos para adjuntar.");
  for (const a of archivos) validarArchivo(a);
  await guardarArchivos(db, sancion_id, archivos, usuario);
  return { ok: true };
}

async function anularSancion(db, { id, motivo, usuario }) {
  await asegurarLegajo(db);
  motivo = String(motivo || "").trim();
  if (!motivo) throw err(400, "Poné por qué se anula.");
  const [[s]] = await db.query("SELECT id, anulada FROM legajo_sanciones WHERE id = ?", [id]);
  if (!s) throw err(404, "Esa sanción no existe.");
  if (s.anulada) throw err(409, "Ya estaba anulada.");
  await db.query("UPDATE legajo_sanciones SET anulada = 1, anulada_motivo = ?, anulada_por = ?, anulada_en = NOW() WHERE id = ?", [motivo.slice(0, 255), usuario ? String(usuario).slice(0, 120) : null, id]);
  return { ok: true };
}

async function archivoPorId(db, id) {
  await asegurarLegajo(db);
  const [[a]] = await db.query("SELECT id, nombre, tipo, contenido FROM legajo_sanciones_archivos WHERE id = ?", [id]);
  if (!a) throw err(404, "Ese archivo no existe.");
  return a;
}

async function quitarArchivo(db, id) {
  await asegurarLegajo(db);
  const [r] = await db.query("DELETE FROM legajo_sanciones_archivos WHERE id = ?", [id]);
  if (!r.affectedRows) throw err(404, "Ese archivo no existe.");
  return { ok: true };
}

/** Operarios con fichadas, producción o sanciones, con cuántas sanciones vigentes tienen. */
async function listarLegajos(db) {
  await asegurarLegajo(db);
  const [nom] = await db.query("SELECT DISTINCT nombre FROM fichadas WHERE nombre IS NOT NULL AND nombre <> '' UNION SELECT DISTINCT operario FROM legajo_sanciones");
  const [san] = await db.query("SELECT operario, COUNT(*) AS n FROM legajo_sanciones WHERE anulada = 0 GROUP BY operario");
  const porOp = new Map(san.map((s) => [s.operario, Number(s.n)]));
  return [...new Set(nom.map((r) => r.nombre))].sort((a, b) => a.localeCompare(b, "es")).map((nombre) => ({ nombre, sanciones: porOp.get(nombre) || 0 }));
}

/** Asistencia del operario en el rango: horas, días, llegadas tarde y fichadas. */
async function resumenAsistencia(db, { operario, desde, hasta }) {
  const [[{ n: fichadas }]] = await db.query("SELECT COUNT(*) AS n FROM fichadas WHERE nombre = ? AND fecha_hora >= ? AND fecha_hora < DATE_ADD(?, INTERVAL 1 DAY)", [operario, desde, hasta]);
  const liq = await liquidarDesdeBD(db, { operario, desde, hasta, detalle: "compacto" });
  if (liq.error && !liq.operario) return { fichadas: Number(fichadas), con_datos: false, mensaje: liq.coincidencias ? liq.error : "No hay fichadas de este operario en ese rango." };
  const tardes = [];
  for (const m of liq.presentismo?.meses || []) for (const l of m.llegadas_tarde || []) if (l.fecha >= desde && l.fecha <= hasta) tardes.push({ fecha: l.fecha, dia: l.dia, ingreso: l.ingreso, minutos_tarde: l.minutos_tarde });
  const dias = (liq.dias || []).map((d) => ({ fecha: d.fecha, dia: d.dia, ingreso: d.ingreso, egreso: d.egreso || null, sin_salida: !!d.sin_salida, horas_normales: r2(d.horas_normales), horas_extra: r2(d.horas_extra), feriado: !!d.feriado })).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return {
    con_datos: true,
    fichadas: Number(fichadas),
    categoria: liq.categoria,
    horas_normales: r2(liq.horas_normales),
    horas_extra: r2(liq.horas_extra),
    dias_trabajados: dias.filter((d) => !d.sin_salida).length,
    dias_sin_salida: dias.filter((d) => d.sin_salida).length,
    llegadas_tarde: tardes.sort((a, b) => b.fecha.localeCompare(a.fecha)),
    dias,
  };
}

/** Producción cargada por el operario en el rango (sin las cargas rechazadas). */
async function resumenProduccion(db, { operario, desde, hasta }) {
  let cargas = [];
  try {
    [cargas] = await db.query(
      `SELECT id, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, turno, maquina, modelo_codigo, modelo_nombre, ciclos, total_producido, fallas, estado
         FROM prod_cargas WHERE TRIM(operario) = ? AND fecha BETWEEN ? AND ? AND estado <> 'RECHAZADA' ORDER BY fecha DESC, id DESC`,
      [operario, desde, hasta],
    );
  } catch {
    return { disponible: false, cargas: 0, total_producido: 0, fallas: 0, buenas: 0, porcentaje_fallas: 0, turnos: 0, por_modelo: [], por_maquina: [], detalle: [] };
  }
  const total = cargas.reduce((a, c) => a + Number(c.total_producido), 0);
  const fallas = cargas.reduce((a, c) => a + Number(c.fallas), 0);
  const agrupar = (clave, nombre) => {
    const m = new Map();
    for (const c of cargas) {
      const k = clave(c) || "—";
      const a = m.get(k) || { nombre: nombre(c) || k, cargas: 0, producido: 0, fallas: 0 };
      a.cargas += 1;
      a.producido += Number(c.total_producido);
      a.fallas += Number(c.fallas);
      m.set(k, a);
    }
    return [...m.values()].map((a) => ({ ...a, buenas: a.producido - a.fallas })).sort((x, y) => y.producido - x.producido);
  };
  return {
    disponible: true,
    cargas: cargas.length,
    turnos: new Set(cargas.map((c) => `${c.fecha}|${c.turno}`)).size,
    total_producido: total,
    fallas,
    buenas: total - fallas,
    porcentaje_fallas: total ? r2((fallas / total) * 100) : 0,
    por_modelo: agrupar((c) => c.modelo_codigo, (c) => c.modelo_nombre || c.modelo_codigo).slice(0, 12),
    por_maquina: agrupar((c) => c.maquina, (c) => c.maquina).slice(0, 12),
    detalle: cargas.slice(0, 60).map((c) => ({ fecha: c.fecha, turno: c.turno, maquina: c.maquina, modelo: c.modelo_nombre || c.modelo_codigo, producido: Number(c.total_producido), fallas: Number(c.fallas), estado: c.estado })),
  };
}

async function resumenLegajo(db, { operario, desde, hasta }) {
  operario = String(operario || "").trim();
  if (!operario) throw err(400, "Falta el operario.");
  if (!FECHA.test(String(desde || "")) || !FECHA.test(String(hasta || ""))) throw err(400, "Elegí las fechas del rango.");
  if (hasta < desde) throw err(400, "El rango está al revés: la fecha final es anterior a la inicial.");
  if ((new Date(`${hasta}T12:00:00`) - new Date(`${desde}T12:00:00`)) / 86400000 > 400) throw err(400, "El rango puede ser de hasta 13 meses.");
  const [asistencia, produccion, sanciones] = await Promise.all([resumenAsistencia(db, { operario, desde, hasta }), resumenProduccion(db, { operario, desde, hasta }), leerSanciones(db, operario)]);
  return { operario, desde, hasta, asistencia, produccion, sanciones };
}

module.exports = { asegurarNotas, leerNotas, crearNota, editarNota, borrarNota, asegurarLegajo, numerarSanciones, tipoDeSancion, leerSanciones, crearSancion, adjuntarArchivos, anularSancion, archivoPorId, quitarArchivo, listarLegajos, resumenAsistencia, resumenProduccion, resumenLegajo, fechaDe, MAX_ARCHIVO };
