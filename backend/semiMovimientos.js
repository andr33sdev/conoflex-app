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
      creado DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_semi (semielaborado_id),
      KEY idx_tipo (tipo, fecha)
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
    `SELECT h.id, h.codigo, COALESCE(s.nombre, h.descripcion, h.codigo) AS nombre, h.cantidad, h.procedencia, DATE_FORMAT(h.fecha, '%Y-%m-%d') AS fecha
       FROM semi_hoja_movs h LEFT JOIN semielaborados s ON s.id = h.semielaborado_id
      WHERE h.tipo = 'ENTRADA' AND h.atendida = 0 AND h.fecha >= DATE_SUB(CURDATE(), INTERVAL ? DAY) ORDER BY h.fecha, h.id`,
    [dias],
  );
  return rows.map((r) => ({ ...r, deposito: depositoDe(r.procedencia) })).filter((r) => r.deposito && r.deposito !== "33");
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
  const out = [
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
  app.post("/api/semielaborados/leer-planilla-movimientos", manejar(() => sincronizarHojas(db)));
}

module.exports = {
  asegurarMovimientos, parsearHoja, filasCSV, fechaISO, depositoDe, guardarHoja, sincronizarHojas, entradasPendientes,
  transferir, anularTransferencia, ajustesDeLaApp, conAjustesDeLaApp, historial, registrarRutasMovimientos, DEPOSITOS, NOMBRE_DEPOSITO,
};
