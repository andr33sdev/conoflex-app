"use strict";
// Ingenierías (recetas): fórmula por tachada, quién y cuándo cambió cada receta, y avisos al admin cuando
// lo que se produjo no coincide con la receta definida.
const F = require("./ingenieriaFormula");

async function columnaExiste(db, tabla, columna) {
  const [r] = await db.query("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?", [tabla, columna]);
  return Number(r[0].n) > 0;
}

async function agregarColumna(db, tabla, columna, definicion) {
  if (!(await columnaExiste(db, tabla, columna))) await db.query(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
}

async function asegurarTablasIngenieria(db) {
  await agregarColumna(db, "ingenierias", "peso_pieza_kg", "DOUBLE NULL");
  await agregarColumna(db, "ingenierias", "proceso", "VARCHAR(20) NULL");
  await agregarColumna(db, "ingenierias", "creado_por", "VARCHAR(255) NULL");
  await agregarColumna(db, "ingenierias", "actualizado_por", "VARCHAR(255) NULL");
  await agregarColumna(db, "ingenieria_detalles", "cantidad_tachada", "DOUBLE NULL");
  await db.query(`
    CREATE TABLE IF NOT EXISTS ingenieria_historial (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ingenieria_id INT NULL,
      semielaborado_id INT NULL,
      producto_terminado_id INT NULL,
      nombre_version VARCHAR(255),
      accion VARCHAR(30) NOT NULL,
      usuario VARCHAR(255),
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      resumen TEXT NULL,
      detalle LONGTEXT NULL,
      KEY idx_ing (ingenieria_id),
      KEY idx_se (semielaborado_id),
      KEY idx_pt (producto_terminado_id)
    )`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS ingenieria_alertas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      carga_id INT NOT NULL,
      semielaborado_id INT NULL,
      semielaborado_codigo VARCHAR(255),
      semielaborado_nombre VARCHAR(255),
      ingenieria_id INT NULL,
      lote VARCHAR(40),
      fecha_carga DATE NULL,
      formula_usada LONGTEXT NOT NULL,
      diferencias LONGTEXT NOT NULL,
      firma VARCHAR(2000),
      estado VARCHAR(15) DEFAULT 'ABIERTA',
      resuelta_por VARCHAR(255) NULL,
      resuelta_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_carga (carga_id),
      KEY idx_estado (estado)
    )`);
}

// Cómo se fabrica un semielaborado. Solo el rotomoldeo lleva ciclos; solo la inyección se define por tachada.
const PROCESOS = { INYECCION: "Inyección", ROTOMOLDEO: "Rotomoldeo", EXTRUSION: "Extrusión" };
const procesoValido = (p) => (Object.prototype.hasOwnProperty.call(PROCESOS, String(p || "").toUpperCase()) ? String(p).toUpperCase() : null);

const ACCIONES = {
  CREADA: "Creó la receta",
  MODIFICADA: "Modificó la receta",
  ACTIVADA: "Activó la receta",
  ELIMINADA: "Eliminó la receta",
  ADOPTADA: "Adoptó la fórmula usada en producción",
};

const parse = (t, defecto = null) => {
  if (t == null) return defecto;
  try {
    return JSON.parse(t);
  } catch {
    return defecto;
  }
};

/** Receta completa tal como está guardada. */
async function fotoIngenieria(conn, id) {
  const [[ing]] = await conn.query("SELECT * FROM ingenierias WHERE id = ?", [id]);
  if (!ing) return null;
  const [det] = await conn.query(
    `SELECT d.materia_prima_id, d.semielaborado_id, d.cantidad, d.cantidad_tachada, d.unidad_medida,
            COALESCE(mp.codigo, se.codigo) AS codigo, COALESCE(mp.nombre, se.nombre) AS nombre
       FROM ingenieria_detalles d
       LEFT JOIN materias_primas mp ON mp.id = d.materia_prima_id
       LEFT JOIN semielaborados se ON se.id = d.semielaborado_id
      WHERE d.ingenieria_id = ? ORDER BY d.id`,
    [id],
  );
  return {
    id: ing.id,
    nombre_version: ing.nombre_version,
    es_activa: !!ing.es_activa,
    peso_pieza_kg: ing.peso_pieza_kg == null ? null : Number(ing.peso_pieza_kg),
    proceso: ing.proceso || null,
    semielaborado_id: ing.semielaborado_id,
    producto_terminado_id: ing.producto_terminado_id,
    ingredientes: det.map((d) => ({
      tipo: d.materia_prima_id ? "MP" : "SE",
      id: d.materia_prima_id || d.semielaborado_id,
      codigo: d.codigo,
      nombre: d.nombre,
      cantidad: Number(d.cantidad),
      cantidad_tachada: d.cantidad_tachada == null ? null : Number(d.cantidad_tachada),
      unidad: d.unidad_medida,
    })),
  };
}

/** Frase corta con lo que cambió entre dos fotos de una receta. */
function resumenCambios(antes, despues) {
  if (!antes) return "Receta nueva.";
  const out = [];
  if (antes.nombre_version !== despues.nombre_version) out.push(`Nombre: "${antes.nombre_version}" → "${despues.nombre_version}"`);
  if ((antes.proceso || null) !== (despues.proceso || null)) out.push(`Se hace en: ${PROCESOS[antes.proceso] || "sin definir"} → ${PROCESOS[despues.proceso] || "sin definir"}`);
  if ((antes.peso_pieza_kg || 0) !== (despues.peso_pieza_kg || 0)) out.push(`Peso de la pieza: ${antes.peso_pieza_kg ?? "—"} → ${despues.peso_pieza_kg ?? "—"} kg`);
  const clave = (i) => `${i.tipo}${i.id}`;
  const valor = (i) => (i.cantidad_tachada != null ? i.cantidad_tachada : i.cantidad);
  const A = new Map(antes.ingredientes.map((i) => [clave(i), i]));
  const B = new Map(despues.ingredientes.map((i) => [clave(i), i]));
  for (const [k, b] of B) {
    const a = A.get(k);
    if (!a) out.push(`Agregó ${b.nombre} (${valor(b)})`);
    else if (valor(a) !== valor(b)) out.push(`${b.nombre}: ${valor(a)} → ${valor(b)}`);
  }
  for (const [k, a] of A) if (!B.has(k)) out.push(`Quitó ${a.nombre}`);
  if (!!antes.es_activa !== !!despues.es_activa) out.push(despues.es_activa ? "Quedó activa" : "Dejó de ser la activa");
  return out.length ? out.join(" · ") : "Sin cambios en los datos.";
}

/**
 * Líneas de fórmula de una receta guardada. Si no tiene fórmula por tachada (recetas anteriores), se usan los kg por pieza
 * como si fueran la tachada: las proporciones son las mismas.
 */
function formulaDeFoto(foto) {
  if (!foto) return null;
  const mp = foto.ingredientes.filter((i) => i.tipo === "MP");
  if (!mp.length) return null;
  const lineas = mp.map((i) => ({ mp_id: i.id, codigo: i.codigo, nombre: i.nombre, kg_tachada: i.cantidad_tachada != null ? i.cantidad_tachada : i.cantidad }));
  const peso = foto.peso_pieza_kg > 0 ? foto.peso_pieza_kg : F.redondear(mp.reduce((a, i) => a + i.cantidad, 0), 6);
  return { peso, lineas, con_tachada: mp.every((i) => i.cantidad_tachada != null) };
}

/**
 * Valida el cuerpo de una receta y devuelve las filas a guardar.
 * Con fórmula por tachada (peso de la pieza + kg por tachada en las materias primas), la cantidad por pieza se calcula sola.
 */
function prepararReceta(body, { esSE = false } = {}) {
  const nombre = String(body.nombre_version || "").trim().replace(/\s+/g, " ");
  if (!nombre) return { error: "Poné un nombre para la receta." };
  if (nombre.length > 255) return { error: "El nombre es demasiado largo." };
  const lista = Array.isArray(body.ingredientes) ? body.ingredientes : [];
  const mp = lista.filter((i) => i.materia_prima_id);
  const se = lista.filter((i) => !i.materia_prima_id && i.semielaborado_id);
  if (lista.length !== mp.length + se.length) return { error: "Hay una línea sin material." };
  // Un semielaborado se hace en una máquina: de eso depende si lleva ciclos y si la receta es por tachada.
  let proceso = null;
  if (esSE) {
    proceso = procesoValido(body.proceso);
    if (!proceso) return { error: "Elegí en qué máquina se hace: Inyección, Rotomoldeo o Extrusión." };
  }
  const tieneTachada = mp.some((i) => i.cantidad_tachada != null && i.cantidad_tachada !== "");
  if (proceso === "INYECCION" && mp.length && !mp.every((i) => i.cantidad_tachada != null && i.cantidad_tachada !== "")) return { error: "La inyección se define por tachada: poné los kg de cada material por tachada." };
  // Fuera de la inyección la receta es por pieza: si llegara una tachada, se ignora.
  const conTachada = proceso ? proceso === "INYECCION" && tieneTachada : tieneTachada;
  const filas = [];
  let peso = null;
  if (conTachada) {
    peso = F.numero(body.peso_pieza_kg);
    if (!(peso > 0)) return { error: "Poné cuánto pesa la pieza (kg) para calcular cuánto lleva de cada material." };
    const v = F.validarLineas(mp.map((i) => ({ mp_id: i.materia_prima_id, kg_tachada: i.cantidad_tachada, codigo: i.codigo, nombre: i.nombre })));
    if (v.error) return { error: v.error };
    for (const c of F.cantidadesPorPieza(v.lineas, peso)) filas.push({ materia_prima_id: c.mp_id, semielaborado_id: null, cantidad: c.kg_pieza, cantidad_tachada: c.kg_tachada, unidad_medida: "Kg" });
  } else {
    const ids = new Set();
    for (const i of mp) {
      if (ids.has(i.materia_prima_id)) return { error: "Hay una materia prima repetida en la receta." };
      ids.add(i.materia_prima_id);
      const c = F.numero(i.cantidad);
      if (!(c > 0)) return { error: "Todas las cantidades tienen que ser mayores a cero." };
      filas.push({ materia_prima_id: i.materia_prima_id, semielaborado_id: null, cantidad: c, cantidad_tachada: null, unidad_medida: i.unidad_medida || "Unidades" });
    }
    const p = F.numero(body.peso_pieza_kg);
    if (p > 0) peso = p;
  }
  const seIds = new Set();
  for (const i of se) {
    if (seIds.has(i.semielaborado_id)) return { error: "Hay un semielaborado repetido en la receta." };
    seIds.add(i.semielaborado_id);
    const c = F.numero(i.cantidad);
    if (!(c > 0)) return { error: "Todas las cantidades tienen que ser mayores a cero." };
    filas.push({ materia_prima_id: null, semielaborado_id: i.semielaborado_id, cantidad: c, cantidad_tachada: null, unidad_medida: i.unidad_medida || "Unidades" });
  }
  return { nombre, peso, filas, proceso };
}

/** Compara lo usado en una carga con la receta activa del producto y, si difiere, deja un aviso para el admin. */
async function registrarAlertaDeCarga(conn, carga) {
  const usada = parse(carga.formula_usada);
  if (!usada || !Array.isArray(usada.lineas) || !usada.lineas.length) return null;
  const [sel] = await conn.query("SELECT id, codigo, nombre FROM semielaborados WHERE codigo = ? LIMIT 1", [carga.modelo_codigo]);
  if (!sel.length) return null;
  const [act] = await conn.query("SELECT id FROM ingenierias WHERE semielaborado_id = ? AND es_activa = 1 ORDER BY id DESC LIMIT 1", [sel[0].id]);
  const ingId = act[0]?.id || carga.ingenieria_id;
  if (!ingId) return null;
  const definida = formulaDeFoto(await fotoIngenieria(conn, ingId));
  if (!definida) return null;
  const cmp = F.compararFormulas(definida, { peso: Number(carga.kg_por_producto) || definida.peso, lineas: usada.lineas });
  if (!cmp.distinta) return null;
  const firma = F.firma({ peso: Number(carga.kg_por_producto) || definida.peso, lineas: usada.lineas });
  const [ya] = await conn.query("SELECT id FROM ingenieria_alertas WHERE semielaborado_id = ? AND estado = 'ABIERTA' AND firma = ? LIMIT 1", [sel[0].id, firma]);
  if (ya.length) return ya[0].id;
  const fecha = carga.fecha_iso || null;
  const [r] = await conn.query(
    `INSERT INTO ingenieria_alertas (carga_id, semielaborado_id, semielaborado_codigo, semielaborado_nombre, ingenieria_id, lote, fecha_carga, formula_usada, diferencias, firma)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      carga.id, sel[0].id, sel[0].codigo, sel[0].nombre, ingId, carga.lote, fecha,
      JSON.stringify({ peso: Number(carga.kg_por_producto) || definida.peso, lineas: usada.lineas }),
      JSON.stringify({ ...cmp, definida }), firma,
    ],
  );
  return r.insertId;
}

function registrarRutasIngenieria(app, db, requirePermiso, requireAdmin) {
  const PERM = requirePermiso("ingenieria");
  // Express 5 no admite expresiones en la ruta: si el id no es un número, sigue con la ruta siguiente.
  const NUM = (req, res, next) => (/^\d+$/.test(req.params.id) ? next() : next("route"));
  const nombreUsuario = async (req) => {
    const [r] = await db.query("SELECT nombre FROM usuarios WHERE id = ?", [req.user?.id]);
    return r[0]?.nombre || "Usuario";
  };

  async function historial(conn, ing, accion, usuario, { antes = null, despues = null, resumen = null, nota = null } = {}) {
    const ref = despues || antes || {};
    await conn.query(
      "INSERT INTO ingenieria_historial (ingenieria_id, semielaborado_id, producto_terminado_id, nombre_version, accion, usuario, resumen, detalle) VALUES (?,?,?,?,?,?,?,?)",
      [ing?.id ?? ref.id ?? null, ref.semielaborado_id ?? null, ref.producto_terminado_id ?? null, ref.nombre_version ?? null, accion, usuario, resumen ?? resumenCambios(antes, despues), JSON.stringify({ antes, despues, nota })],
    );
  }

  async function transaccion(res, fn) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const r = await fn(conn);
      if (r?.error) {
        await conn.rollback();
        return res.status(r.status || 400).json({ error: r.error });
      }
      await conn.commit();
      res.json(r);
    } catch (e) {
      await conn.rollback().catch(() => {});
      console.error("[ingenierias]", e);
      res.status(500).json({ error: "No se pudo guardar. Probá de nuevo." });
    } finally {
      conn.release();
    }
  }

  async function guardarFilas(conn, id, filas) {
    await conn.query("DELETE FROM ingenieria_detalles WHERE ingenieria_id = ?", [id]);
    for (const f of filas) {
      await conn.query(
        "INSERT INTO ingenieria_detalles (ingenieria_id, materia_prima_id, semielaborado_id, cantidad, cantidad_tachada, unidad_medida) VALUES (?,?,?,?,?,?)",
        [id, f.materia_prima_id, f.semielaborado_id, f.cantidad, f.cantidad_tachada, f.unidad_medida],
      );
    }
  }

  async function existenItems(conn, filas) {
    const mp = filas.filter((f) => f.materia_prima_id).map((f) => f.materia_prima_id);
    const se = filas.filter((f) => f.semielaborado_id).map((f) => f.semielaborado_id);
    if (mp.length) {
      const [r] = await conn.query("SELECT id FROM materias_primas WHERE id IN (?)", [mp]);
      if (r.length !== new Set(mp).size) return "Alguna materia prima ya no existe. Actualizá la pantalla.";
    }
    if (se.length) {
      const [r] = await conn.query("SELECT id FROM semielaborados WHERE id IN (?)", [se]);
      if (r.length !== new Set(se).size) return "Algún semielaborado ya no existe. Actualizá la pantalla.";
    }
    return null;
  }

  // ---------------------------------------------------------------- avisos de producción (campanita del admin)
  app.get("/api/ingenierias/alertas/contador", requireAdmin, async (req, res) => {
    try {
      const [[r]] = await db.query("SELECT COUNT(*) AS n FROM ingenieria_alertas WHERE estado = 'ABIERTA'");
      res.json({ abiertas: Number(r.n) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/ingenierias/alertas", requireAdmin, async (req, res) => {
    try {
      const soloAbiertas = req.query.estado !== "todas";
      const [rows] = await db.query(
        `SELECT a.*, DATE_FORMAT(a.fecha_carga, '%Y-%m-%d') AS fecha_carga_iso FROM ingenieria_alertas a ${soloAbiertas ? "WHERE a.estado = 'ABIERTA'" : ""} ORDER BY a.id DESC LIMIT 100`,
      );
      res.json(rows.map((a) => ({
        id: a.id, carga_id: a.carga_id, semielaborado_id: a.semielaborado_id, semielaborado_codigo: a.semielaborado_codigo, semielaborado_nombre: a.semielaborado_nombre,
        ingenieria_id: a.ingenieria_id, lote: a.lote, fecha_carga: a.fecha_carga_iso, estado: a.estado, resuelta_por: a.resuelta_por, resuelta_at: a.resuelta_at, created_at: a.created_at,
        formula_usada: parse(a.formula_usada), diferencias: parse(a.diferencias),
      })));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/ingenierias/alertas/:id/descartar", requireAdmin, (req, res) =>
    transaccion(res, async (conn) => {
      const usuario = await nombreUsuario(req);
      const [r] = await conn.query("UPDATE ingenieria_alertas SET estado = 'DESCARTADA', resuelta_por = ?, resuelta_at = NOW() WHERE id = ? AND estado = 'ABIERTA'", [usuario, req.params.id]);
      if (!r.affectedRows) return { error: "El aviso no existe o ya fue resuelto.", status: 409 };
      return { ok: true };
    }),
  );

  // Crea una receta nueva (activa) con la fórmula que realmente se usó en producción.
  app.put("/api/ingenierias/alertas/:id/adoptar", requireAdmin, (req, res) =>
    transaccion(res, async (conn) => {
      const usuario = await nombreUsuario(req);
      const [[al]] = await conn.query("SELECT * FROM ingenieria_alertas WHERE id = ? FOR UPDATE", [req.params.id]);
      if (!al) return { error: "No encontré ese aviso.", status: 404 };
      if (al.estado !== "ABIERTA") return { error: "Este aviso ya fue resuelto.", status: 409 };
      const usada = parse(al.formula_usada);
      const v = F.validarLineas(usada?.lineas);
      if (v.error) return { error: v.error };
      const peso = Number(usada.peso);
      if (!(peso > 0)) return { error: "La fórmula usada no tiene peso de pieza." };
      const nombre = String(req.body?.nombre_version || "").trim().replace(/\s+/g, " ") || `Usada en ${al.lote || "producción"}`;
      const [actual] = await conn.query("SELECT id FROM ingenierias WHERE semielaborado_id = ? AND es_activa = 1 ORDER BY id DESC LIMIT 1", [al.semielaborado_id]);
      const antes = actual.length ? await fotoIngenieria(conn, actual[0].id) : null;
      const proceso = antes?.proceso || null;
      // Fuera de la inyección la fórmula es por pieza: los kg usados quedan tal cual y el peso es su suma.
      const porPieza = !!proceso && proceso !== "INYECCION";
      const pesoNuevo = porPieza ? F.redondear(v.lineas.reduce((a, l) => a + l.kg_tachada, 0), 6) : peso;
      await conn.query("UPDATE ingenierias SET es_activa = 0 WHERE semielaborado_id = ?", [al.semielaborado_id]);
      const [ins] = await conn.query("INSERT INTO ingenierias (semielaborado_id, nombre_version, es_activa, peso_pieza_kg, proceso, creado_por, actualizado_por, updated_at) VALUES (?,?,1,?,?,?,?,NOW())", [al.semielaborado_id, nombre.slice(0, 255), pesoNuevo, proceso, usuario, usuario]);
      const filas = (porPieza ? v.lineas.map((l) => ({ mp_id: l.mp_id, kg_pieza: l.kg_tachada, kg_tachada: null })) : F.cantidadesPorPieza(v.lineas, peso)).map((c) => ({ materia_prima_id: c.mp_id, semielaborado_id: null, cantidad: c.kg_pieza, cantidad_tachada: c.kg_tachada, unidad_medida: "Kg" }));
      const falta = await existenItems(conn, filas);
      if (falta) return { error: falta };
      await guardarFilas(conn, ins.insertId, filas);
      // Los componentes que no son materia prima (semielaborados) de la receta anterior se conservan.
      if (antes) {
        for (const i of antes.ingredientes.filter((x) => x.tipo === "SE")) {
          await conn.query("INSERT INTO ingenieria_detalles (ingenieria_id, semielaborado_id, cantidad, unidad_medida) VALUES (?,?,?,?)", [ins.insertId, i.id, i.cantidad, i.unidad || "Unidades"]);
        }
      }
      const despues = await fotoIngenieria(conn, ins.insertId);
      await historial(conn, { id: ins.insertId }, "ADOPTADA", usuario, { antes, despues, resumen: `Fórmula usada en el lote ${al.lote || ""}${al.lote ? " " : ""}pasó a ser la receta activa.`, nota: { alerta_id: al.id, carga_id: al.carga_id } });
      await conn.query("UPDATE ingenieria_alertas SET estado = 'ADOPTADA', resuelta_por = ?, resuelta_at = NOW() WHERE id = ?", [usuario, al.id]);
      // Las demás alertas abiertas de este producto con la misma fórmula quedan resueltas.
      await conn.query("UPDATE ingenieria_alertas SET estado = 'ADOPTADA', resuelta_por = ?, resuelta_at = NOW() WHERE semielaborado_id = ? AND estado = 'ABIERTA' AND firma = ?", [usuario, al.semielaborado_id, al.firma]);
      return { ok: true, ingenieria_id: ins.insertId };
    }),
  );

  // Resumen por producto para la lista: receta activa, quién la tocó y avisos abiertos.
  app.get("/api/ingenierias/resumen", PERM, async (req, res) => {
    try {
      const esSE = req.query.parent_type !== "PT";
      const campo = esSE ? "semielaborado_id" : "producto_terminado_id";
      const [rows] = await db.query(
        `SELECT i.${campo} AS parent_id, i.id AS ingenieria_id, i.nombre_version, i.peso_pieza_kg, i.proceso, i.actualizado_por, i.updated_at,
                (SELECT COUNT(*) FROM ingenieria_detalles d WHERE d.ingenieria_id = i.id) AS n_items,
                (SELECT COUNT(*) FROM ingenieria_detalles d WHERE d.ingenieria_id = i.id AND d.cantidad_tachada IS NOT NULL) AS n_tachada
           FROM ingenierias i WHERE i.${campo} IS NOT NULL AND i.es_activa = 1`,
      );
      let alertas = [];
      if (esSE) [alertas] = await db.query("SELECT semielaborado_id AS parent_id, COUNT(*) AS n FROM ingenieria_alertas WHERE estado = 'ABIERTA' GROUP BY semielaborado_id");
      const porPadre = new Map();
      for (const r of rows) if (!porPadre.has(r.parent_id)) porPadre.set(r.parent_id, r);
      const out = {};
      for (const [id, r] of porPadre) {
        out[id] = { ingenieria_id: r.ingenieria_id, version: r.nombre_version, peso_pieza_kg: r.peso_pieza_kg == null ? null : Number(r.peso_pieza_kg), proceso: r.proceso || null, items: Number(r.n_items), con_formula: Number(r.n_tachada) > 0, actualizado_por: r.actualizado_por, actualizado_at: r.updated_at, alertas: 0 };
      }
      for (const a of alertas) {
        out[a.parent_id] = { ...(out[a.parent_id] || { ingenieria_id: null, version: null }), alertas: Number(a.n) };
      }
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ---------------------------------------------------------------- historial de cambios
  app.get("/api/ingenierias/historial", PERM, async (req, res) => {
    try {
      const campo = req.query.parent_type === "SE" ? "semielaborado_id" : req.query.parent_type === "PT" ? "producto_terminado_id" : null;
      const id = Number(req.query.parent_id);
      if (!campo || !Number.isInteger(id)) return res.status(400).json({ error: "Faltan datos." });
      const [rows] = await db.query(`SELECT id, ingenieria_id, nombre_version, accion, usuario, fecha, resumen FROM ingenieria_historial WHERE ${campo} = ? ORDER BY id DESC LIMIT 200`, [id]);
      res.json(rows.map((r) => ({ ...r, accion_texto: ACCIONES[r.accion] || r.accion })));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ---------------------------------------------------------------- alta, edición, activación y baja
  app.post("/api/ingenierias", PERM, (req, res) =>
    transaccion(res, async (conn) => {
      const { parent_id, parent_type } = req.body;
      const isSE = parent_type === "SE";
      if (!["SE", "PT"].includes(parent_type) || !Number.isInteger(Number(parent_id))) return { error: "Faltan datos del producto." };
      const [padre] = await conn.query(isSE ? "SELECT id FROM semielaborados WHERE id = ?" : "SELECT id FROM productos_terminados WHERE id = ?", [parent_id]);
      if (!padre.length) return { error: "Ese producto ya no existe.", status: 404 };
      const p = prepararReceta(req.body, { esSE: isSE });
      if (p.error) return { error: p.error };
      const falta = await existenItems(conn, p.filas);
      if (falta) return { error: falta };
      const usuario = await nombreUsuario(req);
      const campoFK = isSE ? "semielaborado_id" : "producto_terminado_id";
      if (req.body.es_activa) await conn.query(`UPDATE ingenierias SET es_activa = 0 WHERE ${campoFK} = ?`, [parent_id]);
      const [info] = await conn.query(
        "INSERT INTO ingenierias (semielaborado_id, producto_terminado_id, nombre_version, es_activa, peso_pieza_kg, proceso, creado_por, actualizado_por, updated_at) VALUES (?,?,?,?,?,?,?,?,NOW())",
        [isSE ? parent_id : null, !isSE ? parent_id : null, p.nombre, req.body.es_activa ? 1 : 0, p.peso, p.proceso, usuario, usuario],
      );
      await guardarFilas(conn, info.insertId, p.filas);
      const despues = await fotoIngenieria(conn, info.insertId);
      await historial(conn, { id: info.insertId }, "CREADA", usuario, { despues });
      return { success: true, id: info.insertId };
    }),
  );

  app.put("/api/ingenierias/:id", NUM, PERM, (req, res) =>
    transaccion(res, async (conn) => {
      const antes = await fotoIngenieria(conn, req.params.id);
      if (!antes) return { error: "No encontré esa receta.", status: 404 };
      const p = prepararReceta(req.body, { esSE: !!antes.semielaborado_id });
      if (p.error) return { error: p.error };
      const falta = await existenItems(conn, p.filas);
      if (falta) return { error: falta };
      const usuario = await nombreUsuario(req);
      const campoFK = antes.semielaborado_id ? "semielaborado_id" : "producto_terminado_id";
      const padre = antes.semielaborado_id || antes.producto_terminado_id;
      if (req.body.es_activa) await conn.query(`UPDATE ingenierias SET es_activa = 0 WHERE ${campoFK} = ?`, [padre]);
      await conn.query("UPDATE ingenierias SET nombre_version = ?, es_activa = ?, peso_pieza_kg = ?, proceso = ?, actualizado_por = ?, updated_at = NOW() WHERE id = ?", [p.nombre, req.body.es_activa ? 1 : 0, p.peso, p.proceso, usuario, req.params.id]);
      await guardarFilas(conn, req.params.id, p.filas);
      const despues = await fotoIngenieria(conn, req.params.id);
      await historial(conn, { id: Number(req.params.id) }, "MODIFICADA", usuario, { antes, despues });
      return { success: true };
    }),
  );

  app.put("/api/ingenierias/:id/activar", NUM, PERM, (req, res) =>
    transaccion(res, async (conn) => {
      const antes = await fotoIngenieria(conn, req.params.id);
      if (!antes) return { error: "No encontré esa receta.", status: 404 };
      const campoFK = antes.semielaborado_id ? "semielaborado_id" : "producto_terminado_id";
      const padre = antes.semielaborado_id || antes.producto_terminado_id;
      const usuario = await nombreUsuario(req);
      const [prev] = await conn.query(`SELECT id, nombre_version FROM ingenierias WHERE ${campoFK} = ? AND es_activa = 1 AND id <> ?`, [padre, req.params.id]);
      await conn.query(`UPDATE ingenierias SET es_activa = 0 WHERE ${campoFK} = ?`, [padre]);
      await conn.query("UPDATE ingenierias SET es_activa = 1, actualizado_por = ?, updated_at = NOW() WHERE id = ?", [usuario, req.params.id]);
      const despues = await fotoIngenieria(conn, req.params.id);
      await historial(conn, { id: Number(req.params.id) }, "ACTIVADA", usuario, { antes, despues, resumen: prev.length ? `Pasó a ser la activa (antes: "${prev[0].nombre_version}").` : "Pasó a ser la activa." });
      return { success: true };
    }),
  );

  app.delete("/api/ingenierias/:id", NUM, PERM, (req, res) =>
    transaccion(res, async (conn) => {
      const antes = await fotoIngenieria(conn, req.params.id);
      if (!antes) return { error: "No encontré esa receta.", status: 404 };
      const usuario = await nombreUsuario(req);
      await conn.query("DELETE FROM ingenierias WHERE id = ?", [req.params.id]);
      await historial(conn, { id: antes.id }, "ELIMINADA", usuario, { antes, resumen: `Eliminó la receta "${antes.nombre_version}".` });
      return { success: true };
    }),
  );

  // Receta de un producto lista para la pantalla de alertas: con porcentajes.
  app.get("/api/ingenierias/:id", NUM, PERM, async (req, res) => {
    try {
      const foto = await fotoIngenieria(db, req.params.id);
      if (!foto) return res.status(404).json({ error: "No encontré esa receta." });
      const [[meta]] = await db.query("SELECT creado_por, actualizado_por, created_at, updated_at FROM ingenierias WHERE id = ?", [req.params.id]);
      res.json({ ...foto, ...meta });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = { PROCESOS, procesoValido, asegurarTablasIngenieria, registrarRutasIngenieria, registrarAlertaDeCarga, fotoIngenieria, formulaDeFoto, prepararReceta, resumenCambios };
