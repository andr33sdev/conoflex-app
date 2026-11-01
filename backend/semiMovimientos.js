"use strict";
// Movimientos de stock de semielaborados:
//  - Transferencias entre depósitos hechas en la app (suman en uno y restan en otro).
//  - Lectura de las pestañas ENTRADA 33 y SALIDA 33 de la planilla. Cada salida nueva descuenta del 33 en el momento (igual que hace la
//    planilla en STOCK 33); cuando la planilla se sincroniza ya la trae descontada, así que las filas leídas en ese momento no se restan de nuevo.
//    Si ENTRADA 33 viene de otro depósito (26, 37 o Ayolas), Nati avisa.
//  - La sincronización con la planilla pisa el stock, así que lo que se movió en la app (producción y transferencias) se vuelve a sumar encima.
const crypto = require("crypto");

const BASE = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS8kk1oZNfS1AOk6Ylu_rE6uNDdi7BJQBkMFKACCH_dRFpeIsJW8ii5QCdhyKQbSyCaQciC2GgVKLBR/pub";
const URLS_HOJA = {
  ENTRADA: process.env.URL_ENTRADA_33 || `${BASE}?gid=522328943&single=true&output=csv`,
  SALIDA: process.env.URL_SALIDA_33 || `${BASE}?gid=1040146436&single=true&output=csv`,
};
const DEPOSITOS = { "33": "stock_33", "26": "stock_26", ayolas: "stock_ayolas", "37": "stock_37" };
const NOMBRE_DEPOSITO = { "33": "Depósito 33", "26": "Depósito 26", ayolas: "Ayolas", "37": "Depósito 37" };
const DIAS_AVISO = 14;

async function asegurarMovimientos(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS semi_transferencias (
      id INT AUTO_INCREMENT PRIMARY KEY,
      semielaborado_id INT NOT NULL,
      desde VARCHAR(10) NOT NULL,
      hasta VARCHAR(10) NOT NULL,
      cantidad DOUBLE NOT NULL,
      nota VARCHAR(255) NULL,
      usuario VARCHAR(255) NULL,
      cubierta DOUBLE NOT NULL DEFAULT 0,
      anulada TINYINT NOT NULL DEFAULT 0,
      creado DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_semi (semielaborado_id)
    )`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS semi_hoja_movs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      clave CHAR(40) NOT NULL UNIQUE,
      tipo VARCHAR(10) NOT NULL,
      fecha DATE NULL,
      codigo VARCHAR(100) NOT NULL,
      descripcion VARCHAR(255) NULL,
      cantidad DOUBLE NOT NULL,
      op VARCHAR(100) NULL,
      procedencia VARCHAR(100) NULL,
      semielaborado_id INT NULL,
      atendida TINYINT NOT NULL DEFAULT 0,
      avisada_en DATETIME NULL,
      recordada_en DATETIME NULL,
      creado DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_semi (semielaborado_id),
      KEY idx_tipo (tipo, fecha)
    )`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS semi_ajustes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      semielaborado_id INT NOT NULL,
      deposito VARCHAR(20) NOT NULL,
      antes DOUBLE NOT NULL,
      despues DOUBLE NOT NULL,
      delta DOUBLE NOT NULL,
      nota VARCHAR(255) NULL,
      usuario VARCHAR(255) NULL,
      creado DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_semi (semielaborado_id)
    )`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS semi_alineacion (
      codigo VARCHAR(100) NOT NULL PRIMARY KEY,
      hoja DOUBLE NOT NULL,
      app DOUBLE NOT NULL,
      desde DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
}

// ---------- Planilla ----------
function filasCSV(texto) {
  const filas = [];
  let fila = [], cel = "", comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') { cel += '"'; i++; }
      else if (ch === '"') comillas = false;
      else cel += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === ",") { fila.push(cel.trim()); cel = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texto[i + 1] === "\n") i++;
      fila.push(cel.trim()); cel = "";
      if (fila.some((c) => c !== "")) filas.push(fila);
      fila = [];
    } else cel += ch;
  }
  fila.push(cel.trim());
  if (fila.some((c) => c !== "")) filas.push(fila);
  return filas;
}

const sinTildes = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

function fechaISO(txt) {
  const m = String(txt || "").trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1])));
  if (d.getUTCMonth() !== Number(m[2]) - 1) return null;
  return d.toISOString().slice(0, 10);
}

/** "26", "Dep 26", "DEPOSITO 37", "Ayolas" → "26" | "37" | "ayolas" | "33" | null. */
function depositoDe(txt) {
  const t = sinTildes(txt);
  if (!t) return null;
  if (/ayolas/.test(t)) return "ayolas";
  const n = t.match(/(?:^|\D)(26|33|37)(?:\D|$)/);
  return n ? n[1] : null;
}

/** Lee el texto CSV de una pestaña. Reconoce las columnas por su título, no por su posición. */
function parsearHoja(texto, tipo) {
  const filas = filasCSV(texto);
  const h = filas.findIndex((f) => f.some((c) => /^c[oó]digo$/i.test(c)));
  if (h < 0) return { movimientos: [], invalidas: 0, error: "No encontré la fila de títulos (CÓDIGO)." };
  const tit = filas[h].map(sinTildes);
  const col = (re) => tit.findIndex((t) => re.test(t));
  const c = { codigo: col(/^codigo/), desc: col(/descrip|nombre/), fecha: col(/fecha/), cant: col(/cantidad/), op: col(/pedido|^op$|^ot$/), proc: col(/proced|origen|desde|deposito/) };
  if (c.codigo < 0 || c.cant < 0 || c.fecha < 0) return { movimientos: [], invalidas: 0, error: "Faltan columnas (CÓDIGO, FECHA o CANTIDAD)." };
  const vistos = new Map();
  const movimientos = [];
  let invalidas = 0;
  for (const f of filas.slice(h + 1)) {
    const codigo = (f[c.codigo] || "").toUpperCase().trim();
    const desc = c.desc >= 0 ? f[c.desc] || "" : "";
    if (!codigo) { if (/no existe/i.test(desc)) invalidas++; continue; }
    const cantidad = parseFloat(String(f[c.cant] || "").replace(/\./g, "").replace(",", "."));
    const fecha = fechaISO(f[c.fecha]);
    if (!(cantidad > 0) || !fecha || /no existe/i.test(desc)) { invalidas++; continue; }
    const op = c.op >= 0 ? (f[c.op] || "").trim() : "";
    const procTxt = c.proc >= 0 ? (f[c.proc] || "").trim() : "";
    const base = [tipo, fecha, codigo, cantidad, op, procTxt].join("|");
    const n = (vistos.get(base) || 0) + 1;
    vistos.set(base, n);
    movimientos.push({ tipo, fecha, codigo, descripcion: desc.slice(0, 255), cantidad, op: op.slice(0, 100), procedencia: procTxt.slice(0, 100), clave: crypto.createHash("sha1").update(`${base}|${n}`).digest("hex") });
  }
  return { movimientos, invalidas };
}

/** Guarda las filas nuevas. La primera vez que se lee una pestaña, todo lo anterior queda como ya atendido (no avisa del pasado). */
async function guardarHoja(db, tipo, movimientos, { aplicar = true } = {}) {
  const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM semi_hoja_movs WHERE tipo = ?", [tipo]);
  const primera = Number(n) === 0;
  const [semis] = await db.query("SELECT id, codigo FROM semielaborados");
  const porCodigo = new Map(semis.map((s) => [String(s.codigo).toUpperCase().trim(), s.id]));
  let nuevas = 0;
  for (const m of movimientos) {
    const [r] = await db.query(
      "INSERT IGNORE INTO semi_hoja_movs (clave, tipo, fecha, codigo, descripcion, cantidad, op, procedencia, semielaborado_id, atendida) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [m.clave, m.tipo, m.fecha, m.codigo, m.descripcion, m.cantidad, m.op || null, m.procedencia || null, porCodigo.get(m.codigo) || null, primera ? 1 : 0],
    );
    nuevas += r.affectedRows;
    // Salida nueva del 33: se descuenta ya (la planilla lo hace en STOCK 33). Nunca baja de cero.
    if (r.affectedRows && aplicar && !primera && tipo === "SALIDA" && porCodigo.get(m.codigo)) {
      await db.query("UPDATE semielaborados SET stock_33 = GREATEST(0, COALESCE(stock_33,0) - ?) WHERE id = ?", [m.cantidad, porCodigo.get(m.codigo)]);
    }
  }
  return { nuevas, primera };
}

async function sincronizarHojas(db, { aplicar = true, traer = (u) => fetch(u).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))) } = {}) {
  const resultado = {};
  for (const tipo of Object.keys(URLS_HOJA)) {
    try {
      const { movimientos, invalidas, error } = parsearHoja(await traer(URLS_HOJA[tipo]), tipo);
      if (error) { resultado[tipo] = { error }; continue; }
      resultado[tipo] = { ...(await guardarHoja(db, tipo, movimientos, { aplicar })), filas: movimientos.length, invalidas };
    } catch (e) {
      resultado[tipo] = { error: e.message };
    }
  }
  return resultado;
}

/** Entradas al 33 que dicen venir de otro depósito y todavía no se transfirieron en la app. */
async function entradasPendientes(db, { dias = DIAS_AVISO } = {}) {
  const [rows] = await db.query(
    `SELECT h.id, h.codigo, COALESCE(s.nombre, h.descripcion, h.codigo) AS nombre, h.cantidad, h.procedencia, DATE_FORMAT(h.fecha, '%Y-%m-%d') AS fecha, DATE_FORMAT(h.avisada_en, '%H:%i') AS avisada_hora, DATE_FORMAT(h.recordada_en, '%H:%i') AS recordada_hora
       FROM semi_hoja_movs h LEFT JOIN semielaborados s ON s.id = h.semielaborado_id
      WHERE h.tipo = 'ENTRADA' AND h.atendida = 0 AND h.fecha >= DATE_SUB(CURDATE(), INTERVAL ? DAY) ORDER BY h.fecha, h.id`,
    [dias],
  );
  return rows.map((r) => ({ ...r, deposito: depositoDe(r.procedencia) })).filter((r) => r.deposito && r.deposito !== "33");
}


// ---------- Recordatorio del mismo aviso ----------
const MIN_RECORDATORIO = 30;
/** Marca la hora en que se avisó cada entrada (la primera vez que Nati la mostró). */
async function marcarAvisadas(db, ids) {
  if (ids.length) await db.query("UPDATE semi_hoja_movs SET avisada_en = NOW() WHERE avisada_en IS NULL AND id IN (?)", [ids]);
}
/** Entradas avisadas hace más de media hora que siguen sin transferirse y todavía no se recordaron. */
async function entradasParaRecordar(db) {
  const [rows] = await db.query(
    "SELECT id FROM semi_hoja_movs WHERE tipo = 'ENTRADA' AND atendida = 0 AND recordada_en IS NULL AND avisada_en IS NOT NULL AND avisada_en <= DATE_SUB(NOW(), INTERVAL ? MINUTE)",
    [MIN_RECORDATORIO],
  );
  return rows.map((r) => r.id);
}
async function marcarRecordadas(db, ids) {
  if (ids.length) await db.query("UPDATE semi_hoja_movs SET recordada_en = NOW() WHERE id IN (?)", [ids]);
}

// ---------- Corregir el stock a mano ----------
/** Deja el depósito en la cantidad contada; desde ahí la app lo sigue moviendo sola. Queda el rastro de cuánto había y cuánto se puso. */
async function ajustarStock(db, { semielaborado_id, deposito, cantidad, nota, usuario }) {
  const nuevo = Number(cantidad);
  if (!DEPOSITOS[deposito]) throw Object.assign(new Error("Elegí el depósito."), { status: 400 });
  if (!(nuevo >= 0) || !Number.isFinite(nuevo)) throw Object.assign(new Error("Poné la cantidad que hay realmente (0 o más)."), { status: 400 });
  const col = DEPOSITOS[deposito];
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[s]] = await conn.query(`SELECT id, nombre, ${col} AS actual FROM semielaborados WHERE id = ? FOR UPDATE`, [semielaborado_id]);
    if (!s) throw Object.assign(new Error("Ese semielaborado no existe."), { status: 404 });
    const antes = Number(s.actual) || 0;
    const delta = nuevo - antes;
    if (delta !== 0) {
      await conn.query(`UPDATE semielaborados SET ${col} = ? WHERE id = ?`, [nuevo, s.id]);
      await conn.query("INSERT INTO semi_ajustes (semielaborado_id, deposito, antes, despues, delta, nota, usuario) VALUES (?,?,?,?,?,?,?)", [s.id, deposito, antes, nuevo, delta, (nota || "").slice(0, 255) || null, usuario || null]);
    }
    await conn.commit();
    return { semielaborado: s.nombre, deposito, antes, despues: nuevo, cambio: delta };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ---------- Planilla vs app (depósito 33) ----------
const URL_STOCK_33 = process.env.URL_STOCK_33 || `${BASE}?gid=1240979540&single=true&output=csv`;
const MIN_DESALINEADO = 20;

/** Stock del 33 que figura en la pestaña STOCK 33 (misma lectura que usa la sincronización: código en A, stock en E). */
function parsearStockPlanilla(texto) {
  const out = new Map();
  for (const f of filasCSV(texto)) {
    if (f.length < 5 || !f[0]) continue;
    const v = parseFloat(String(f[4]).replace(",", "."));
    if (Number.isNaN(v)) continue;
    out.set(f[0].toUpperCase().trim(), { nombre: f[1] || f[0], stock: v });
  }
  return out;
}

/** Compara el 33 de la planilla con el de la app. Guarda desde cuándo está desalineado cada código. */
async function compararStock33(db, { traer = (u) => fetch(u).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))), minutos = MIN_DESALINEADO } = {}) {
  const hoja = parsearStockPlanilla(await traer(URL_STOCK_33));
  const [semis] = await db.query("SELECT id, codigo, nombre, stock_33 FROM semielaborados");
  const dif = [];
  for (const s of semis) {
    const h = hoja.get(String(s.codigo).toUpperCase().trim());
    if (!h) continue;
    const app = Number(s.stock_33) || 0;
    if (Math.abs(h.stock - app) > 0.001) dif.push({ id: s.id, codigo: s.codigo, nombre: s.nombre, hoja: h.stock, app, diferencia: app - h.stock });
  }
  const codigos = dif.map((d) => d.codigo);
  if (codigos.length) await db.query("DELETE FROM semi_alineacion WHERE codigo NOT IN (?)", [codigos]);
  else await db.query("DELETE FROM semi_alineacion");
  for (const d of dif) await db.query("INSERT INTO semi_alineacion (codigo, hoja, app) VALUES (?,?,?) ON DUPLICATE KEY UPDATE hoja = VALUES(hoja), app = VALUES(app)", [d.codigo, d.hoja, d.app]);
  const [persist] = await db.query("SELECT codigo FROM semi_alineacion WHERE desde <= DATE_SUB(NOW(), INTERVAL ? MINUTE)", [minutos]);
  const firmes = new Set(persist.map((r) => r.codigo));
  return { comparados: [...hoja.keys()].length, diferencias: dif.map((d) => ({ ...d, persistente: firmes.has(d.codigo) })) };
}

// ---------- Transferencias ----------
async function transferir(db, { semielaborado_id, desde, hasta, cantidad, nota, usuario }) {
  const cant = Number(cantidad);
  if (!DEPOSITOS[desde] || !DEPOSITOS[hasta]) throw Object.assign(new Error("Elegí los dos depósitos."), { status: 400 });
  if (desde === hasta) throw Object.assign(new Error("El depósito de origen y el de destino son el mismo."), { status: 400 });
  if (!(cant > 0)) throw Object.assign(new Error("La cantidad tiene que ser mayor a cero."), { status: 400 });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[s]] = await conn.query("SELECT id, codigo, nombre, stock_33, stock_26, stock_ayolas, stock_37 FROM semielaborados WHERE id = ? FOR UPDATE", [semielaborado_id]);
    if (!s) throw Object.assign(new Error("Ese semielaborado no existe."), { status: 404 });
    const hay = Number(s[DEPOSITOS[desde]]) || 0;
    if (cant > hay) throw Object.assign(new Error(`En ${NOMBRE_DEPOSITO[desde]} hay ${hay} unidades; no se pueden transferir ${cant}.`), { status: 409 });
    await conn.query(`UPDATE semielaborados SET ${DEPOSITOS[desde]} = COALESCE(${DEPOSITOS[desde]},0) - ?, ${DEPOSITOS[hasta]} = COALESCE(${DEPOSITOS[hasta]},0) + ? WHERE id = ?`, [cant, cant, s.id]);
    const [r] = await conn.query("INSERT INTO semi_transferencias (semielaborado_id, desde, hasta, cantidad, nota, usuario) VALUES (?,?,?,?,?,?)", [s.id, desde, hasta, cant, (nota || "").slice(0, 255) || null, usuario || null]);
    // Si había entradas al 33 avisadas desde ese depósito, quedan atendidas (hasta cubrir lo transferido).
    let atendidas = 0;
    let cubierta = 0;
    if (hasta === "33") {
      const [ents] = await conn.query("SELECT id, cantidad, procedencia FROM semi_hoja_movs WHERE tipo = 'ENTRADA' AND atendida = 0 AND semielaborado_id = ? ORDER BY fecha, id", [s.id]);
      let resta = cant;
      for (const e of ents) {
        if (depositoDe(e.procedencia) !== desde || resta + 0.001 < e.cantidad) continue;
        await conn.query("UPDATE semi_hoja_movs SET atendida = 1 WHERE id = ?", [e.id]);
        resta -= e.cantidad;
        cubierta += Number(e.cantidad);
        atendidas++;
      }
      // La planilla suma esas entradas en STOCK 33: al sincronizar no hay que sumarlas otra vez.
      if (cubierta) await conn.query("UPDATE semi_transferencias SET cubierta = ? WHERE id = ?", [cubierta, r.insertId]);
    }
    await conn.commit();
    return { id: r.insertId, semielaborado: s.nombre, desde, hasta, cantidad: cant, entradas_atendidas: atendidas, stock_desde: hay - cant };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function anularTransferencia(db, id) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[t]] = await conn.query("SELECT * FROM semi_transferencias WHERE id = ? FOR UPDATE", [id]);
    if (!t) throw Object.assign(new Error("Esa transferencia no existe."), { status: 404 });
    if (t.anulada) throw Object.assign(new Error("Esa transferencia ya estaba deshecha."), { status: 409 });
    const [[s]] = await conn.query("SELECT stock_33, stock_26, stock_ayolas, stock_37 FROM semielaborados WHERE id = ? FOR UPDATE", [t.semielaborado_id]);
    if (s && (Number(s[DEPOSITOS[t.hasta]]) || 0) < t.cantidad) throw Object.assign(new Error(`En ${NOMBRE_DEPOSITO[t.hasta]} ya no quedan ${t.cantidad} unidades para devolver.`), { status: 409 });
    await conn.query(`UPDATE semielaborados SET ${DEPOSITOS[t.hasta]} = COALESCE(${DEPOSITOS[t.hasta]},0) - ?, ${DEPOSITOS[t.desde]} = COALESCE(${DEPOSITOS[t.desde]},0) + ? WHERE id = ?`, [t.cantidad, t.cantidad, t.semielaborado_id]);
    await conn.query("UPDATE semi_transferencias SET anulada = 1 WHERE id = ?", [id]);
    await conn.commit();
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ---------- Que la planilla no pise lo hecho en la app ----------
/** Lo movido en la app (producción aprobada y transferencias), por código y depósito. */
async function ajustesDeLaApp(db) {
  const mapa = new Map();
  const sumar = (codigo, col, v) => {
    const k = String(codigo).toUpperCase().trim();
    const o = mapa.get(k) || { stock_33: 0, stock_26: 0, stock_ayolas: 0, stock_37: 0 };
    o[col] += v;
    mapa.set(k, o);
  };
  try {
    const [prod] = await db.query("SELECT s.codigo, m.deposito, SUM(m.cantidad) AS c FROM prod_semi_stock_movs m JOIN semielaborados s ON s.id = m.semielaborado_id GROUP BY s.codigo, m.deposito");
    for (const r of prod) if (Object.values(DEPOSITOS).includes(r.deposito)) sumar(r.codigo, r.deposito, Number(r.c));
  } catch { /* todavía sin producción aprobada */ }
  try {
    const [tr] = await db.query("SELECT s.codigo, t.desde, t.hasta, SUM(t.cantidad) AS c, SUM(t.cubierta) AS cub FROM semi_transferencias t JOIN semielaborados s ON s.id = t.semielaborado_id WHERE t.anulada = 0 GROUP BY s.codigo, t.desde, t.hasta");
    for (const r of tr) {
      if (DEPOSITOS[r.desde]) sumar(r.codigo, DEPOSITOS[r.desde], -Number(r.c));
      if (DEPOSITOS[r.hasta]) sumar(r.codigo, DEPOSITOS[r.hasta], Number(r.c) - Number(r.cub || 0));
    }
  } catch { /* todavía sin transferencias */ }
  try {
    const [aj] = await db.query("SELECT s.codigo, a.deposito, SUM(a.delta) AS c FROM semi_ajustes a JOIN semielaborados s ON s.id = a.semielaborado_id GROUP BY s.codigo, a.deposito");
    for (const r of aj) if (Object.values(DEPOSITOS).includes(DEPOSITOS[r.deposito])) sumar(r.codigo, DEPOSITOS[r.deposito], Number(r.c));
  } catch { /* todavía sin correcciones */ }
  return mapa;
}

/** Suma lo hecho en la app a los valores que vienen de la planilla ({ CODIGO: { stock_33, ... } }). Solo toca los depósitos que trae la planilla. */
async function conAjustesDeLaApp(db, valoresPorCodigo) {
  const ajustes = await ajustesDeLaApp(db);
  for (const [codigo, vals] of Object.entries(valoresPorCodigo)) {
    const a = ajustes.get(String(codigo).toUpperCase().trim());
    if (!a) continue;
    for (const col of Object.values(DEPOSITOS)) if (vals[col] !== undefined && a[col]) vals[col] = Math.max(0, Number(vals[col]) + a[col]);
  }
  return valoresPorCodigo;
}

// ---------- Historial de un semielaborado ----------
async function historial(db, semielaboradoId, { limite = 60 } = {}) {
  const [[s]] = await db.query("SELECT codigo FROM semielaborados WHERE id = ?", [semielaboradoId]);
  if (!s) return [];
  const [hoja] = await db.query(
    "SELECT tipo, DATE_FORMAT(fecha,'%Y-%m-%d') AS fecha, cantidad, op, procedencia FROM semi_hoja_movs WHERE UPPER(TRIM(codigo)) = UPPER(TRIM(?)) ORDER BY fecha DESC, id DESC LIMIT ?",
    [s.codigo, limite],
  );
  const [tr] = await db.query("SELECT id, DATE_FORMAT(creado,'%Y-%m-%d') AS fecha, desde, hasta, cantidad, nota, usuario, anulada FROM semi_transferencias WHERE semielaborado_id = ? ORDER BY id DESC LIMIT ?", [semielaboradoId, limite]);
  const [aj] = await db.query("SELECT DATE_FORMAT(creado,'%Y-%m-%d') AS fecha, deposito, antes, despues, nota, usuario FROM semi_ajustes WHERE semielaborado_id = ? ORDER BY id DESC LIMIT ?", [semielaboradoId, limite]);
  const out = [
    ...aj.map((a) => ({ clase: "ajuste", fecha: a.fecha, cantidad: a.despues, op: null, detalle: `Corregido a mano en ${NOMBRE_DEPOSITO[a.deposito]}: figuraba ${a.antes}${a.nota ? ` · ${a.nota}` : ""}${a.usuario ? ` · ${a.usuario}` : ""}`, origen: "app" })),
    ...hoja.map((h) => ({ clase: h.tipo === "SALIDA" ? "salida" : "entrada", fecha: h.fecha, cantidad: h.cantidad, op: h.op, detalle: h.tipo === "SALIDA" ? "Salida del 33" : `Entrada al 33${h.procedencia ? ` desde ${h.procedencia}` : ""}`, origen: "planilla" })),
    ...tr.map((t) => ({ clase: "transferencia", id: t.id, fecha: t.fecha, cantidad: t.cantidad, op: null, detalle: `${NOMBRE_DEPOSITO[t.desde]} → ${NOMBRE_DEPOSITO[t.hasta]}${t.nota ? ` · ${t.nota}` : ""}${t.usuario ? ` · ${t.usuario}` : ""}`, anulada: !!t.anulada, origen: "app" })),
  ];
  return out.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, limite);
}

function registrarRutasMovimientos(app, db, { nombreDeUsuario = async (req) => req.user?.nombre || null } = {}) {
  const manejar = (fn) => async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (e) {
      if (!e.status) console.error("[semi-mov]", e);
      res.status(e.status || 500).json({ error: e.status ? e.message : "No se pudo completar la operación." });
    }
  };
  app.post("/api/semielaborados/transferir", manejar(async (req) => transferir(db, { ...req.body, usuario: await nombreDeUsuario(req) })));
  app.delete("/api/semielaborados/transferencias/:id", manejar((req) => anularTransferencia(db, Number(req.params.id))));
  app.get("/api/semielaborados/:id/movimientos", manejar((req) => historial(db, Number(req.params.id))));
  app.post("/api/semielaborados/:id/ajustar", manejar(async (req) => ajustarStock(db, { ...req.body, semielaborado_id: Number(req.params.id), usuario: await nombreDeUsuario(req) })));
  app.get("/api/semielaborados/alineacion-33", manejar(() => compararStock33(db)));
  app.post("/api/semielaborados/leer-planilla-movimientos", manejar(() => sincronizarHojas(db)));
}

module.exports = {
  asegurarMovimientos, parsearHoja, filasCSV, fechaISO, depositoDe, guardarHoja, sincronizarHojas, entradasPendientes,
  marcarAvisadas, entradasParaRecordar, marcarRecordadas, ajustarStock, compararStock33, parsearStockPlanilla, MIN_RECORDATORIO,
  transferir, anularTransferencia, ajustesDeLaApp, conAjustesDeLaApp, historial, registrarRutasMovimientos, DEPOSITOS, NOMBRE_DEPOSITO,
};
