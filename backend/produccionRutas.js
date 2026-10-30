"use strict";
// Tablas y rutas del plan de producción (ver produccionPlan.js para la lógica y el flujo).

const P = require("./produccionPlan");
const { demandaSemielaborados } = require("./demanda");

const FECHA = (col) => `DATE_FORMAT(${col}, '%Y-%m-%d')`;
const esISO = (v) => !!P.parseISO(v);
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function asegurarTablasProduccion(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS prod_maquinas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL UNIQUE,
      categoria VARCHAR(100) DEFAULT NULL,
      activa TINYINT DEFAULT 1,
      orden INT DEFAULT 0
    )`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS prod_plan_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      semana_inicio DATE NOT NULL,
      lote VARCHAR(40) NOT NULL UNIQUE,
      semielaborado_id INT NOT NULL,
      semielaborado_codigo VARCHAR(255),
      semielaborado_nombre VARCHAR(255),
      cantidad_semana INT NOT NULL,
      origen VARCHAR(20) DEFAULT 'MANUAL',
      notas VARCHAR(500),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_semana (semana_inicio)
    )`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS prod_turnos (
      fecha DATE NOT NULL,
      turno VARCHAR(5) NOT NULL,
      sin_produccion TINYINT DEFAULT 0,
      motivo VARCHAR(255),
      lanzado TINYINT DEFAULT 0,
      lanzado_at DATETIME NULL,
      comentario TEXT NULL,
      comentario_por VARCHAR(255) NULL,
      comentario_at DATETIME NULL,
      PRIMARY KEY (fecha, turno)
    )`);
  // Instalaciones que ya crearon la tabla sin el comentario del turno.
  const [colC] = await db.query("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'prod_turnos' AND column_name = 'comentario'");
  if (!Number(colC[0].n)) {
    await db.query("ALTER TABLE prod_turnos ADD COLUMN comentario TEXT NULL, ADD COLUMN comentario_por VARCHAR(255) NULL, ADD COLUMN comentario_at DATETIME NULL");
  }
  await db.query(`
    CREATE TABLE IF NOT EXISTS prod_asignaciones (
      id INT AUTO_INCREMENT PRIMARY KEY,
      item_id INT NOT NULL,
      fecha DATE NOT NULL,
      turno VARCHAR(5) NOT NULL,
      maquina_id INT NULL,
      cantidad INT NOT NULL,
      operario VARCHAR(255),
      ingenieria_id INT NULL,
      receta_confirmada TINYINT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_turno (fecha, turno),
      KEY idx_item (item_id)
    )`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS prod_cargas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      asignacion_id INT NULL,
      item_id INT NULL,
      lote VARCHAR(40),
      fecha DATE NOT NULL,
      turno VARCHAR(5),
      operario VARCHAR(255) NOT NULL,
      maquina VARCHAR(100),
      maquina_categoria VARCHAR(100),
      modelo_codigo VARCHAR(255),
      modelo_nombre VARCHAR(255),
      ciclos INT DEFAULT 0,
      total_producido INT NOT NULL,
      fallas INT DEFAULT 0,
      kg_por_producto DOUBLE DEFAULT 0,
      color VARCHAR(100),
      codigo_material VARCHAR(255),
      observaciones TEXT,
      estado VARCHAR(20) DEFAULT 'PENDIENTE',
      motivo_rechazo VARCHAR(500),
      ingenieria_id INT NULL,
      aprobado_por VARCHAR(255),
      aprobado_at DATETIME NULL,
      registro_id INT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_fecha (fecha),
      KEY idx_estado (estado),
      KEY idx_asig (asignacion_id)
    )`);

  // Primera vez: las máquinas que ya aparecían en órdenes de trabajo anteriores.
  const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM prod_maquinas");
  if (Number(n) === 0) {
    try {
      const [viejas] = await db.query("SELECT DISTINCT TRIM(maquina) AS m FROM ordenes_trabajo WHERE maquina IS NOT NULL AND TRIM(maquina) <> '' ORDER BY m");
      for (const [i, v] of viejas.entries()) {
        await db.query("INSERT IGNORE INTO prod_maquinas (nombre, orden) VALUES (?, ?)", [v.m.slice(0, 100), i]);
      }
    } catch (e) {
      console.error("[produccion] no se pudieron importar las máquinas anteriores:", e.message);
    }
  }
}

function registrarRutasProduccion(app, db, requirePermiso) {
  // Acepta a quien tenga CUALQUIERA de los módulos (ADMIN siempre pasa).
  const requireAlguno = (...ids) => async (req, res, next) => {
    let denegado = null;
    for (const id of ids) {
      let pasa = false;
      await requirePermiso(id)(req, { status: () => ({ json: (b) => { denegado = b; } }) }, () => { pasa = true; });
      if (pasa) return next();
    }
    return res.status(403).json(denegado || { error: "Tu rol no tiene acceso a este módulo." });
  };
  const PLAN = requirePermiso("planificacion");
  const TABLET = requireAlguno("carga-produccion", "planificacion");

  const seguro = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      console.error(`[produccion] ${req.method} ${req.path}:`, e);
      if (!res.headersSent) res.status(500).json({ error: "No se pudo completar la operación." });
    }
  };
  const quien = async (req) => {
    const [r] = await db.query("SELECT nombre FROM usuarios WHERE id = ?", [req.user?.id]);
    return r[0]?.nombre || "Usuario";
  };
  const entero = (v) => (v === "" || v == null ? NaN : Number(v));

  // ---------------------------------------------------------------- máquinas y catálogo
  app.get("/api/prod/maquinas", TABLET, seguro(async (req, res) => {
    const [rows] = await db.query("SELECT id, nombre, categoria, activa, orden FROM prod_maquinas ORDER BY activa DESC, orden, nombre");
    res.json(rows);
  }));

  app.post("/api/prod/maquinas", PLAN, seguro(async (req, res) => {
    const nombre = String(req.body.nombre || "").trim().slice(0, 100);
    if (!nombre) return res.status(400).json({ error: "Poné un nombre para la máquina." });
    const categoria = String(req.body.categoria || "").trim().slice(0, 100) || null;
    const [dup] = await db.query("SELECT id FROM prod_maquinas WHERE nombre = ?", [nombre]);
    if (dup.length) return res.status(409).json({ error: `Ya existe una máquina llamada "${nombre}".` });
    const [r] = await db.query("INSERT INTO prod_maquinas (nombre, categoria, orden) VALUES (?, ?, (SELECT COALESCE(MAX(m.orden), 0) + 1 FROM prod_maquinas m))", [nombre, categoria]);
    res.json({ id: r.insertId });
  }));

  app.put("/api/prod/maquinas/:id", PLAN, seguro(async (req, res) => {
    const sets = [];
    const vals = [];
    if (req.body.nombre !== undefined) {
      const nombre = String(req.body.nombre || "").trim().slice(0, 100);
      if (!nombre) return res.status(400).json({ error: "El nombre no puede quedar vacío." });
      const [dup] = await db.query("SELECT id FROM prod_maquinas WHERE nombre = ? AND id <> ?", [nombre, req.params.id]);
      if (dup.length) return res.status(409).json({ error: `Ya existe una máquina llamada "${nombre}".` });
      sets.push("nombre = ?"); vals.push(nombre);
    }
    if (req.body.categoria !== undefined) { sets.push("categoria = ?"); vals.push(String(req.body.categoria || "").trim().slice(0, 100) || null); }
    if (req.body.activa !== undefined) { sets.push("activa = ?"); vals.push(req.body.activa ? 1 : 0); }
    if (!sets.length) return res.status(400).json({ error: "Nada para actualizar." });
    const [r] = await db.query(`UPDATE prod_maquinas SET ${sets.join(", ")} WHERE id = ?`, [...vals, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: "Máquina no encontrada." });
    res.json({ ok: true });
  }));

  app.get("/api/prod/operarios", TABLET, seguro(async (req, res) => {
    const [rows] = await db.query(
      `SELECT nombre FROM (
         SELECT TRIM(nombre) AS nombre FROM fichadas WHERE nombre IS NOT NULL AND TRIM(nombre) <> ''
         UNION SELECT TRIM(nombre_operario) FROM fichero_operarios_categorias
       ) t WHERE nombre <> '' ORDER BY nombre`,
    );
    res.json(rows.map((r) => r.nombre));
  }));

  app.get("/api/prod/catalogo", PLAN, seguro(async (req, res) => {
    const [rows] = await db.query(
      `SELECT s.id, s.codigo, s.nombre,
              COALESCE(s.stock_33,0)+COALESCE(s.stock_26,0)+COALESCE(s.stock_ayolas,0)+COALESCE(s.stock_37,0) AS stock_total,
              EXISTS(SELECT 1 FROM ingenierias i WHERE i.semielaborado_id = s.id AND i.es_activa = 1) AS tiene_receta
         FROM semielaborados s ORDER BY s.nombre`,
    );
    res.json(rows.map((r) => ({ ...r, stock_total: Math.max(0, Number(r.stock_total) || 0), tiene_receta: !!r.tiene_receta })));
  }));

  // ---------------------------------------------------------------- plan semanal
  async function cargarSemana(lunes) {
    const fin = P.sumarDias(lunes, 6);
    const [items] = await db.query(
      `SELECT i.id, i.lote, ${FECHA("i.semana_inicio")} AS semana_inicio, i.semielaborado_id, i.semielaborado_codigo AS codigo,
              i.semielaborado_nombre AS nombre, i.cantidad_semana, i.origen, i.notas,
              (SELECT COALESCE(SUM(a.cantidad),0) FROM prod_asignaciones a WHERE a.item_id = i.id) AS asignado,
              (SELECT COALESCE(SUM(c.total_producido - c.fallas),0) FROM prod_cargas c WHERE c.item_id = i.id AND c.estado = 'APROBADA') AS producido,
              (SELECT COALESCE(SUM(c.total_producido - c.fallas),0) FROM prod_cargas c WHERE c.item_id = i.id AND c.estado = 'PENDIENTE') AS por_aprobar
         FROM prod_plan_items i WHERE i.semana_inicio = ? ORDER BY i.lote`,
      [lunes],
    );
    const [turnos] = await db.query(
      `SELECT ${FECHA("fecha")} AS fecha, turno, sin_produccion, motivo, lanzado, comentario, comentario_por FROM prod_turnos WHERE fecha BETWEEN ? AND ?`,
      [lunes, fin],
    );
    const [asig] = await db.query(
      `SELECT a.id, a.item_id, ${FECHA("a.fecha")} AS fecha, a.turno, a.maquina_id, m.nombre AS maquina, a.cantidad, a.operario,
              a.ingenieria_id, ing.nombre_version AS receta_version, a.receta_confirmada,
              i.lote, i.semielaborado_codigo, i.semielaborado_nombre
         FROM prod_asignaciones a
         JOIN prod_plan_items i ON i.id = a.item_id
         LEFT JOIN prod_maquinas m ON m.id = a.maquina_id
         LEFT JOIN ingenierias ing ON ing.id = a.ingenieria_id
        WHERE a.fecha BETWEEN ? AND ? ORDER BY a.fecha, a.turno, a.id`,
      [lunes, fin],
    );
    const [[{ pend }]] = await db.query("SELECT COUNT(*) AS pend FROM prod_cargas WHERE estado = 'PENDIENTE'");
    // Lo realmente producido por cada asignación (la carga vigente: pendiente o aprobada).
    const ids = asig.map((a) => a.id);
    const realPorAsig = new Map();
    if (ids.length) {
      const [cs] = await db.query(
        "SELECT asignacion_id, estado, operario, total_producido, fallas FROM prod_cargas WHERE asignacion_id IN (?) AND estado <> 'RECHAZADA' ORDER BY id",
        [ids],
      );
      for (const c of cs) realPorAsig.set(c.asignacion_id, { estado: c.estado, operario: c.operario, total: Number(c.total_producido), fallas: Number(c.fallas), buenas: Number(c.total_producido) - Number(c.fallas) });
    }
    return {
      semana: lunes,
      dias: Array.from({ length: 7 }, (_, i) => P.sumarDias(lunes, i)),
      items: items.map((i) => ({ ...i, asignado: Number(i.asignado), producido: Number(i.producido), por_aprobar: Number(i.por_aprobar) })),
      turnos: turnos.map((t) => ({ ...t, sin_produccion: !!t.sin_produccion, lanzado: !!t.lanzado })),
      asignaciones: asig.map((a) => ({ ...a, receta_confirmada: !!a.receta_confirmada, real: realPorAsig.get(a.id) || null })),
      choques: P.detectarChoques(asig),
      cargas_pendientes: Number(pend),
    };
  }

  app.get("/api/prod/plan", PLAN, seguro(async (req, res) => {
    const base = esISO(req.query.semana) ? req.query.semana : hoyISO();
    res.json(await cargarSemana(P.lunesDe(base)));
  }));

  app.get("/api/prod/sugerencias", PLAN, seguro(async (req, res) => {
    const base = esISO(req.query.semana) ? req.query.semana : hoyISO();
    const lunes = P.lunesDe(base);
    const cobertura = Math.min(120, Math.max(7, Math.round(Number(req.query.cobertura) || 30)));
    const meses = Math.min(12, Math.max(1, Math.round(Number(req.query.meses) || 3)));
    const dem = await demandaSemielaborados(db, { meses });
    if (dem.error) return res.status(400).json({ error: dem.error });

    const [plan] = await db.query("SELECT semielaborado_id, SUM(cantidad_semana) AS c FROM prod_plan_items WHERE semana_inicio = ? GROUP BY semielaborado_id", [lunes]);
    const planificado = Object.fromEntries(plan.map((p) => [p.semielaborado_id, Number(p.c)]));

    const [det] = await db.query(
      `SELECT ing.semielaborado_id, ing.id AS ingenieria_id, ing.nombre_version, d.materia_prima_id, d.cantidad, d.unidad_medida,
              mp.codigo, mp.nombre, mp.stock_actual
         FROM ingenierias ing
         JOIN ingenieria_detalles d ON d.ingenieria_id = ing.id AND d.materia_prima_id IS NOT NULL
         JOIN materias_primas mp ON mp.id = d.materia_prima_id
        WHERE ing.es_activa = 1 AND ing.semielaborado_id IS NOT NULL`,
    );
    const recetas = {};
    for (const r of det) {
      const k = r.semielaborado_id;
      if (!recetas[k]) recetas[k] = { ingenieria_id: r.ingenieria_id, version: r.nombre_version, ingredientes: [] };
      recetas[k].ingredientes.push({ mp_id: r.materia_prima_id, codigo: r.codigo, nombre: r.nombre, cantidad: r.cantidad, stock: r.stock_actual });
    }
    // La demanda identifica al semielaborado por código; acá hace falta su id.
    const [ids] = await db.query("SELECT id, codigo FROM semielaborados");
    const idPorCodigo = new Map(ids.map((x) => [String(x.codigo), x.id]));
    const demanda = dem.semielaborados.filter((f) => idPorCodigo.has(String(f.codigo))).map((f) => ({ ...f, id: idPorCodigo.get(String(f.codigo)) }));
    const sugerencias = P.sugerirProduccion({ demanda, planificado, recetas, coberturaDias: cobertura });
    res.json({ semana: lunes, cobertura_dias: cobertura, meses, periodo: dem.periodo, sugerencias });
  }));

  app.post("/api/prod/plan/items", PLAN, seguro(async (req, res) => {
    const lunes = P.lunesDe(req.body.semana);
    if (!lunes) return res.status(400).json({ error: "Semana inválida." });
    const cantidad = entero(req.body.cantidad);
    if (!Number.isInteger(cantidad) || cantidad <= 0) return res.status(400).json({ error: "La cantidad debe ser un entero mayor a cero." });
    const [se] = await db.query("SELECT id, codigo, nombre FROM semielaborados WHERE id = ?", [req.body.semielaborado_id]);
    if (!se.length) return res.status(404).json({ error: "No encontré ese semielaborado." });
    const origen = req.body.origen === "SUGERIDO" ? "SUGERIDO" : "MANUAL";
    const notas = String(req.body.notas || "").trim().slice(0, 500) || null;

    for (let intento = 0; intento < 5; intento++) {
      const [lotes] = await db.query("SELECT lote FROM prod_plan_items WHERE semana_inicio = ?", [lunes]);
      const lote = P.generarLote(lunes, P.siguienteSecuencia(lotes.map((l) => l.lote)));
      try {
        const [r] = await db.query(
          "INSERT INTO prod_plan_items (semana_inicio, lote, semielaborado_id, semielaborado_codigo, semielaborado_nombre, cantidad_semana, origen, notas) VALUES (?,?,?,?,?,?,?,?)",
          [lunes, lote, se[0].id, se[0].codigo, se[0].nombre, cantidad, origen, notas],
        );
        return res.json({ id: r.insertId, lote });
      } catch (e) {
        if (e.code !== "ER_DUP_ENTRY") throw e; // dos personas agregando a la vez: reintenta con el número siguiente
      }
    }
    res.status(409).json({ error: "No se pudo asignar un número de lote. Probá de nuevo." });
  }));

  app.put("/api/prod/plan/items/:id", PLAN, seguro(async (req, res) => {
    const sets = [];
    const vals = [];
    if (req.body.cantidad !== undefined) {
      const c = entero(req.body.cantidad);
      if (!Number.isInteger(c) || c <= 0) return res.status(400).json({ error: "La cantidad debe ser un entero mayor a cero." });
      sets.push("cantidad_semana = ?"); vals.push(c);
    }
    if (req.body.notas !== undefined) { sets.push("notas = ?"); vals.push(String(req.body.notas || "").trim().slice(0, 500) || null); }
    if (!sets.length) return res.status(400).json({ error: "Nada para actualizar." });
    const [r] = await db.query(`UPDATE prod_plan_items SET ${sets.join(", ")} WHERE id = ?`, [...vals, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: "Renglón no encontrado." });
    res.json({ ok: true });
  }));

  app.delete("/api/prod/plan/items/:id", PLAN, seguro(async (req, res) => {
    const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM prod_asignaciones WHERE item_id = ?", [req.params.id]);
    if (Number(n) > 0) return res.status(409).json({ error: "Este lote ya tiene producción asignada en algún turno. Sacalo de los turnos primero." });
    const [r] = await db.query("DELETE FROM prod_plan_items WHERE id = ?", [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: "Renglón no encontrado." });
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- turnos y asignaciones
  const turnoOk = (t) => P.TURNOS.includes(t);

  async function turnoLanzado(fecha, turno) {
    const [r] = await db.query("SELECT lanzado FROM prod_turnos WHERE fecha = ? AND turno = ?", [fecha, turno]);
    return !!r[0]?.lanzado;
  }
  const bloqueado = (res) => res.status(409).json({ error: "Este turno ya fue lanzado a la tablet. Retiralo de la tablet para modificarlo." });

  app.put("/api/prod/turnos", PLAN, seguro(async (req, res) => {
    const { fecha, turno } = req.body;
    if (!esISO(fecha) || !turnoOk(turno)) return res.status(400).json({ error: "Fecha o turno inválido." });
    if (await turnoLanzado(fecha, turno)) return bloqueado(res);
    const sin = req.body.sin_produccion ? 1 : 0;
    if (sin) {
      const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM prod_asignaciones WHERE fecha = ? AND turno = ?", [fecha, turno]);
      if (Number(n) > 0) return res.status(409).json({ error: "Este turno tiene producción asignada. Sacala antes de marcarlo como \"sin producción\"." });
    }
    const motivo = String(req.body.motivo || "").trim().slice(0, 255) || null;
    await db.query(
      "INSERT INTO prod_turnos (fecha, turno, sin_produccion, motivo) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE sin_produccion = VALUES(sin_produccion), motivo = VALUES(motivo)",
      [fecha, turno, sin, sin ? motivo : null],
    );
    res.json({ ok: true });
  }));

  app.post("/api/prod/asignaciones", PLAN, seguro(async (req, res) => {
    const { item_id, fecha, turno } = req.body;
    if (!esISO(fecha) || !turnoOk(turno)) return res.status(400).json({ error: "Fecha o turno inválido." });
    const cantidad = entero(req.body.cantidad);
    if (!Number.isInteger(cantidad) || cantidad <= 0) return res.status(400).json({ error: "La cantidad debe ser un entero mayor a cero." });
    const [it] = await db.query("SELECT id, semielaborado_id, " + FECHA("semana_inicio") + " AS semana_inicio FROM prod_plan_items WHERE id = ?", [item_id]);
    if (!it.length) return res.status(404).json({ error: "Ese renglón de la lista semanal no existe." });
    if (P.lunesDe(fecha) !== it[0].semana_inicio) return res.status(400).json({ error: "El día elegido no pertenece a la semana de ese lote." });
    if (await turnoLanzado(fecha, turno)) return bloqueado(res);
    const [filaTurno] = await db.query("SELECT sin_produccion FROM prod_turnos WHERE fecha = ? AND turno = ?", [fecha, turno]);
    if (filaTurno[0]?.sin_produccion) return res.status(409).json({ error: "Ese turno está marcado como \"sin producción\"." });

    let maquina_id = null;
    if (req.body.maquina_id) {
      const [m] = await db.query("SELECT id FROM prod_maquinas WHERE id = ? AND activa = 1", [req.body.maquina_id]);
      if (!m.length) return res.status(400).json({ error: "Esa máquina no existe o está desactivada." });
      maquina_id = m[0].id;
    }
    // Receta propuesta: la activa del semielaborado (queda sin confirmar hasta que el jefe la confirme).
    const [rec] = await db.query("SELECT id FROM ingenierias WHERE semielaborado_id = ? AND es_activa = 1 ORDER BY id DESC LIMIT 1", [it[0].semielaborado_id]);
    const operario = String(req.body.operario || "").trim().slice(0, 255) || null;
    const [r] = await db.query(
      "INSERT INTO prod_asignaciones (item_id, fecha, turno, maquina_id, cantidad, operario, ingenieria_id, receta_confirmada) VALUES (?,?,?,?,?,?,?,0)",
      [item_id, fecha, turno, maquina_id, cantidad, operario, rec[0]?.id || null],
    );
    res.json({ id: r.insertId, ingenieria_id: rec[0]?.id || null });
  }));

  async function asignacion(id) {
    const [r] = await db.query(`SELECT a.*, ${FECHA("a.fecha")} AS fecha_iso, i.semielaborado_id FROM prod_asignaciones a JOIN prod_plan_items i ON i.id = a.item_id WHERE a.id = ?`, [id]);
    return r[0] || null;
  }

  app.put("/api/prod/asignaciones/:id", PLAN, seguro(async (req, res) => {
    const a = await asignacion(req.params.id);
    if (!a) return res.status(404).json({ error: "Asignación no encontrada." });
    if (await turnoLanzado(a.fecha_iso, a.turno)) return bloqueado(res);
    const sets = [];
    const vals = [];
    if (req.body.cantidad !== undefined) {
      const c = entero(req.body.cantidad);
      if (!Number.isInteger(c) || c <= 0) return res.status(400).json({ error: "La cantidad debe ser un entero mayor a cero." });
      sets.push("cantidad = ?"); vals.push(c);
    }
    if (req.body.maquina_id !== undefined) {
      if (req.body.maquina_id) {
        const [m] = await db.query("SELECT id FROM prod_maquinas WHERE id = ? AND activa = 1", [req.body.maquina_id]);
        if (!m.length) return res.status(400).json({ error: "Esa máquina no existe o está desactivada." });
      }
      sets.push("maquina_id = ?"); vals.push(req.body.maquina_id || null);
    }
    if (req.body.operario !== undefined) { sets.push("operario = ?"); vals.push(String(req.body.operario || "").trim().slice(0, 255) || null); }
    if (!sets.length) return res.status(400).json({ error: "Nada para actualizar." });
    await db.query(`UPDATE prod_asignaciones SET ${sets.join(", ")} WHERE id = ?`, [...vals, req.params.id]);
    res.json({ ok: true });
  }));

  app.delete("/api/prod/asignaciones/:id", PLAN, seguro(async (req, res) => {
    const a = await asignacion(req.params.id);
    if (!a) return res.status(404).json({ error: "Asignación no encontrada." });
    if (await turnoLanzado(a.fecha_iso, a.turno)) return bloqueado(res);
    await db.query("DELETE FROM prod_asignaciones WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  }));

  // Versiones de receta del semielaborado de esa asignación, con sus ingredientes, para confirmarla.
  app.get("/api/prod/asignaciones/:id/recetas", PLAN, seguro(async (req, res) => {
    const a = await asignacion(req.params.id);
    if (!a) return res.status(404).json({ error: "Asignación no encontrada." });
    const [ings] = await db.query("SELECT id, nombre_version, es_activa FROM ingenierias WHERE semielaborado_id = ? ORDER BY es_activa DESC, id DESC", [a.semielaborado_id]);
    const out = [];
    for (const ing of ings) {
      const [ingredientes] = await db.query(
        `SELECT d.cantidad, d.unidad_medida, mp.codigo, mp.nombre, mp.stock_actual
           FROM ingenieria_detalles d JOIN materias_primas mp ON mp.id = d.materia_prima_id
          WHERE d.ingenieria_id = ? ORDER BY mp.nombre`,
        [ing.id],
      );
      out.push({ id: ing.id, version: ing.nombre_version, activa: !!ing.es_activa, ingredientes });
    }
    res.json({ elegida: a.ingenieria_id, confirmada: !!a.receta_confirmada, recetas: out });
  }));

  app.put("/api/prod/asignaciones/:id/confirmar-receta", PLAN, seguro(async (req, res) => {
    const a = await asignacion(req.params.id);
    if (!a) return res.status(404).json({ error: "Asignación no encontrada." });
    if (await turnoLanzado(a.fecha_iso, a.turno)) return bloqueado(res);
    const [ing] = await db.query("SELECT id FROM ingenierias WHERE id = ? AND semielaborado_id = ?", [req.body.ingenieria_id, a.semielaborado_id]);
    if (!ing.length) return res.status(400).json({ error: "Esa receta no corresponde a este producto." });
    await db.query("UPDATE prod_asignaciones SET ingenieria_id = ?, receta_confirmada = 1 WHERE id = ?", [ing[0].id, req.params.id]);
    res.json({ ok: true });
  }));

  app.post("/api/prod/turnos/lanzar", PLAN, seguro(async (req, res) => {
    const { fecha, turno } = req.body;
    if (!esISO(fecha) || !turnoOk(turno)) return res.status(400).json({ error: "Fecha o turno inválido." });
    const [filaTurno] = await db.query("SELECT sin_produccion, lanzado FROM prod_turnos WHERE fecha = ? AND turno = ?", [fecha, turno]);
    if (filaTurno[0]?.lanzado) return res.status(409).json({ error: "Este turno ya está lanzado." });
    const [asig] = await db.query(
      `SELECT a.id, a.maquina_id, a.cantidad, a.operario, a.receta_confirmada, i.lote, i.semielaborado_codigo, i.semielaborado_nombre
         FROM prod_asignaciones a JOIN prod_plan_items i ON i.id = a.item_id WHERE a.fecha = ? AND a.turno = ?`,
      [fecha, turno],
    );
    const problemas = P.validarLanzamiento(filaTurno[0] || { sin_produccion: 0 }, asig);
    if (problemas.length) return res.status(400).json({ error: "No se puede lanzar todavía.", problemas });
    await db.query(
      "INSERT INTO prod_turnos (fecha, turno, lanzado, lanzado_at) VALUES (?,?,1,NOW()) ON DUPLICATE KEY UPDATE lanzado = 1, lanzado_at = NOW()",
      [fecha, turno],
    );
    res.json({ ok: true });
  }));

  app.post("/api/prod/turnos/retirar", PLAN, seguro(async (req, res) => {
    const { fecha, turno } = req.body;
    if (!esISO(fecha) || !turnoOk(turno)) return res.status(400).json({ error: "Fecha o turno inválido." });
    const [[{ n }]] = await db.query(
      "SELECT COUNT(*) AS n FROM prod_cargas c JOIN prod_asignaciones a ON a.id = c.asignacion_id WHERE a.fecha = ? AND a.turno = ? AND c.estado <> 'RECHAZADA'",
      [fecha, turno],
    );
    if (Number(n) > 0) return res.status(409).json({ error: "Ya hay producción cargada en este turno: no se puede retirar de la tablet." });
    await db.query("UPDATE prod_turnos SET lanzado = 0, lanzado_at = NULL WHERE fecha = ? AND turno = ?", [fecha, turno]);
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- tablet de planta
  app.get("/api/prod/tablet", TABLET, seguro(async (req, res) => {
    const fecha = esISO(req.query.fecha) ? req.query.fecha : hoyISO();
    const [turnos] = await db.query(`SELECT turno, sin_produccion, motivo, lanzado, comentario, comentario_por FROM prod_turnos WHERE fecha = ?`, [fecha]);
    const [asig] = await db.query(
      `SELECT a.id, a.turno, a.cantidad, a.operario, a.ingenieria_id, ing.nombre_version AS receta_version,
              i.lote, i.semielaborado_codigo AS modelo_codigo, i.semielaborado_nombre AS modelo_nombre, m.nombre AS maquina
         FROM prod_asignaciones a
         JOIN prod_plan_items i ON i.id = a.item_id
         JOIN prod_turnos t ON t.fecha = a.fecha AND t.turno = a.turno AND t.lanzado = 1
         LEFT JOIN prod_maquinas m ON m.id = a.maquina_id
         LEFT JOIN ingenierias ing ON ing.id = a.ingenieria_id
        WHERE a.fecha = ? ORDER BY a.turno, m.nombre, a.id`,
      [fecha],
    );
    const ids = asig.map((a) => a.id);
    let cargas = [];
    if (ids.length) {
      [cargas] = await db.query(
        `SELECT id, asignacion_id, operario, ciclos, total_producido, fallas, kg_por_producto, color, codigo_material, observaciones, estado, motivo_rechazo
           FROM prod_cargas WHERE asignacion_id IN (?) ORDER BY id DESC`,
        [ids],
      );
    }
    const recetas = {};
    const ingIds = [...new Set(asig.map((a) => a.ingenieria_id).filter(Boolean))];
    if (ingIds.length) {
      const [det] = await db.query(
        `SELECT d.ingenieria_id, mp.codigo, mp.nombre, d.cantidad, d.unidad_medida FROM ingenieria_detalles d JOIN materias_primas mp ON mp.id = d.materia_prima_id WHERE d.ingenieria_id IN (?) ORDER BY mp.nombre`,
        [ingIds],
      );
      for (const d of det) (recetas[d.ingenieria_id] ||= []).push({ codigo: d.codigo, nombre: d.nombre, cantidad: d.cantidad, unidad: d.unidad_medida });
    }
    res.json({
      fecha,
      turnos: ["DIA", "NOCHE"].map((tn) => {
        const t = turnos.find((x) => x.turno === tn);
        return {
          turno: tn,
          sin_produccion: !!t?.sin_produccion,
          motivo: t?.motivo || null,
          lanzado: !!t?.lanzado,
          comentario: t?.comentario || null,
          comentario_por: t?.comentario_por || null,
          asignaciones: asig
            .filter((a) => a.turno === tn)
            .map((a) => {
              const propias = cargas.filter((c) => c.asignacion_id === a.id);
              const vigente = propias.find((c) => c.estado !== "RECHAZADA") || null;
              const rechazada = !vigente ? propias.find((c) => c.estado === "RECHAZADA") || null : null;
              return { ...a, receta: recetas[a.ingenieria_id] || [], carga: vigente, rechazo: rechazada ? rechazada.motivo_rechazo || "La carga fue rechazada. Volvé a cargarla." : null };
            }),
        };
      }),
    });
  }));

  // Comentario libre del operario sobre su turno (queda guardado junto al turno).
  app.put("/api/prod/turnos/comentario", TABLET, seguro(async (req, res) => {
    const { fecha, turno } = req.body;
    if (!esISO(fecha) || !turnoOk(turno)) return res.status(400).json({ error: "Fecha o turno inválido." });
    const [t] = await db.query("SELECT lanzado FROM prod_turnos WHERE fecha = ? AND turno = ?", [fecha, turno]);
    if (!t.length || !t[0].lanzado) return res.status(409).json({ error: "Ese turno no está lanzado." });
    const comentario = String(req.body.comentario || "").trim().slice(0, 2000) || null;
    const por = String(req.body.operario || "").trim().slice(0, 255) || null;
    await db.query("UPDATE prod_turnos SET comentario = ?, comentario_por = ?, comentario_at = NOW() WHERE fecha = ? AND turno = ?", [comentario, comentario ? por : null, fecha, turno]);
    res.json({ ok: true });
  }));

  async function datosParaCarga(asignacion_id) {
    const [r] = await db.query(
      `SELECT a.id, a.item_id, a.turno, ${FECHA("a.fecha")} AS fecha, a.ingenieria_id, i.lote, i.semielaborado_codigo, i.semielaborado_nombre,
              m.nombre AS maquina, m.categoria AS maquina_categoria, t.lanzado
         FROM prod_asignaciones a
         JOIN prod_plan_items i ON i.id = a.item_id
         LEFT JOIN prod_maquinas m ON m.id = a.maquina_id
         LEFT JOIN prod_turnos t ON t.fecha = a.fecha AND t.turno = a.turno
        WHERE a.id = ?`,
      [asignacion_id],
    );
    return r[0] || null;
  }

  app.post("/api/prod/cargas", TABLET, seguro(async (req, res) => {
    const a = await datosParaCarga(req.body.asignacion_id);
    if (!a) return res.status(404).json({ error: "Esa producción no existe." });
    if (!a.lanzado) return res.status(409).json({ error: "Ese turno no está lanzado." });
    const v = P.validarCarga(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const operario = String(req.body.operario || "").trim().slice(0, 255);
    if (!operario) return res.status(400).json({ error: "Indicá quién cargó la producción." });
    const [ya] = await db.query("SELECT id FROM prod_cargas WHERE asignacion_id = ? AND estado <> 'RECHAZADA'", [a.id]);
    if (ya.length) return res.status(409).json({ error: "Esta producción ya fue cargada." });
    const x = v.valores;
    const [r] = await db.query(
      `INSERT INTO prod_cargas (asignacion_id, item_id, lote, fecha, turno, operario, maquina, maquina_categoria, modelo_codigo, modelo_nombre,
                                ciclos, total_producido, fallas, kg_por_producto, color, codigo_material, observaciones, ingenieria_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [a.id, a.item_id, a.lote, a.fecha, a.turno, operario, a.maquina, a.maquina_categoria, a.semielaborado_codigo, a.semielaborado_nombre,
       x.ciclos, x.total_producido, x.fallas, x.kg_por_producto, x.color, x.codigo_material, x.observaciones, a.ingenieria_id],
    );
    res.json({ id: r.insertId });
  }));

  app.put("/api/prod/cargas/:id", TABLET, seguro(async (req, res) => {
    const [c] = await db.query("SELECT id, estado FROM prod_cargas WHERE id = ?", [req.params.id]);
    if (!c.length) return res.status(404).json({ error: "Carga no encontrada." });
    if (c[0].estado !== "PENDIENTE") return res.status(409).json({ error: "Esta carga ya fue revisada y no se puede modificar." });
    const v = P.validarCarga(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const x = v.valores;
    const operario = String(req.body.operario || "").trim().slice(0, 255);
    if (!operario) return res.status(400).json({ error: "Indicá quién cargó la producción." });
    await db.query(
      "UPDATE prod_cargas SET operario=?, ciclos=?, total_producido=?, fallas=?, kg_por_producto=?, color=?, codigo_material=?, observaciones=? WHERE id=? AND estado='PENDIENTE'",
      [operario, x.ciclos, x.total_producido, x.fallas, x.kg_por_producto, x.color, x.codigo_material, x.observaciones, req.params.id],
    );
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- revisión del jefe
  app.get("/api/prod/cargas", PLAN, seguro(async (req, res) => {
    const estado = ["PENDIENTE", "APROBADA", "RECHAZADA"].includes(req.query.estado) ? req.query.estado : null;
    const [rows] = await db.query(
      `SELECT id, ${FECHA("fecha")} AS fecha, turno, lote, operario, maquina, modelo_codigo, modelo_nombre, ciclos, total_producido, fallas,
              kg_por_producto, color, codigo_material, observaciones, estado, motivo_rechazo, aprobado_por
         FROM prod_cargas ${estado ? "WHERE estado = ?" : ""} ORDER BY fecha DESC, id DESC LIMIT 200`,
      estado ? [estado] : [],
    );
    res.json(rows);
  }));

  app.put("/api/prod/cargas/:id/aprobar", PLAN, seguro(async (req, res) => {
    const nombre = await quien(req);
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [cs] = await conn.query(`SELECT *, ${FECHA("fecha")} AS fecha_iso FROM prod_cargas WHERE id = ? FOR UPDATE`, [req.params.id]);
      const c = cs[0];
      if (!c) { await conn.rollback(); return res.status(404).json({ error: "Carga no encontrada." }); }
      if (c.estado !== "PENDIENTE") { await conn.rollback(); return res.status(409).json({ error: "Esta carga ya fue revisada." }); }
      const fecha = c.fecha_iso;

      let ingredientes = [];
      if (c.ingenieria_id) {
        const [det] = await conn.query(
          `SELECT d.materia_prima_id AS mp_id, d.cantidad, d.unidad_medida AS unidad, mp.codigo, mp.nombre
             FROM ingenieria_detalles d JOIN materias_primas mp ON mp.id = d.materia_prima_id WHERE d.ingenieria_id = ?`,
          [c.ingenieria_id],
        );
        ingredientes = det;
      }
      const ef = P.calcularEfectosCarga(c, ingredientes);

      const [reg] = await conn.query(
        `INSERT INTO registro_produccion (fecha, categoria_maq, codigo_ot, codigo, articulo, cant_buenos, segunda_calidad, cant_fallas, kg_total, kg_fallas, ingenieria_id)
         VALUES (?,?,?,?,?,?,0,?,?,?,?)`,
        [fecha, (c.maquina_categoria || c.maquina || "GENERAL").toUpperCase(), c.lote, c.modelo_codigo, c.modelo_nombre, ef.buenas, c.fallas, ef.kg_total, ef.kg_fallas, c.ingenieria_id],
      );
      for (const k of ef.consumos) {
        await conn.query("UPDATE materias_primas SET stock_actual = stock_actual - ? WHERE id = ?", [k.cantidad, k.mp_id]);
        await conn.query(
          "INSERT INTO registro_produccion_materiales (registro_id, codigo_ot, materia_prima_codigo, materia_prima_nombre, cantidad_usada, unidad_medida, fecha) VALUES (?,?,?,?,?,?,?)",
          [reg.insertId, c.lote, k.codigo || "", k.nombre || "", k.cantidad, k.unidad, fecha],
        );
      }
      await conn.query("UPDATE prod_cargas SET estado='APROBADA', aprobado_por=?, aprobado_at=NOW(), registro_id=? WHERE id=?", [nombre, reg.insertId, c.id]);
      await conn.commit();
      res.json({ ok: true, buenas: ef.buenas, consumos: ef.consumos });
    } catch (e) {
      await conn.rollback();
      console.error("[produccion] aprobar carga:", e);
      res.status(500).json({ error: "No se pudo aprobar la carga." });
    } finally {
      conn.release();
    }
  }));

  app.put("/api/prod/cargas/:id/rechazar", PLAN, seguro(async (req, res) => {
    const motivo = String(req.body.motivo || "").trim().slice(0, 500) || null;
    const [r] = await db.query("UPDATE prod_cargas SET estado='RECHAZADA', motivo_rechazo=?, aprobado_por=? WHERE id=? AND estado='PENDIENTE'", [motivo, await quien(req), req.params.id]);
    if (!r.affectedRows) return res.status(409).json({ error: "La carga no existe o ya fue revisada." });
    res.json({ ok: true });
  }));
}

module.exports = { asegurarTablasProduccion, registrarRutasProduccion };
