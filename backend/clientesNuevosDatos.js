"use strict";
// Clientes nuevos, parte de datos: cada oportunidad que aparece queda guardada con su estado (sin revisar, me interesa,
// contactada, ganada, descartada). Lo descartado no vuelve a aparecer. También: seguimiento de licitaciones con aviso por
// cierre y revisión de novedades, búsqueda semanal automática, historial, clientes que dejaron de comprar y borradores de Gmail.
const N = require("./clientesNuevos");

const ESTADOS = ["PENDIENTE", "INTERESA", "CONTACTADA", "GANADA", "DESCARTADA"];
const TIPOS = ["OPORTUNIDADES", "COMPETENCIA", "SEGUIMIENTO"];
const EN_CURSO_MAX_MS = 15 * 60 * 1000;
const DIAS_DORMIDO = 120;

async function asegurarColumna(db, tabla, columna, ddl) {
  const [c] = await db.query("SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [tabla, columna]);
  if (!Number(c[0].n)) await db.query(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${ddl}`);
}

async function asegurarTablaClientesNuevos(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS clientes_nuevos_busquedas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tipo VARCHAR(15) NOT NULL DEFAULT 'OPORTUNIDADES',
      origen VARCHAR(10) NOT NULL DEFAULT 'MANUAL',
      estado VARCHAR(15) NOT NULL DEFAULT 'BUSCANDO',
      progreso VARCHAR(200) NULL,
      resultado LONGTEXT NULL,
      error VARCHAR(500) NULL,
      creado_por VARCHAR(120) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      terminado_at DATETIME NULL,
      n_total INT NULL,
      n_ya INT NULL,
      n_nuevas INT NULL,
      KEY idx_tipo (tipo, id)
    )`);
  await asegurarColumna(db, "clientes_nuevos_busquedas", "tipo", "VARCHAR(15) NOT NULL DEFAULT 'OPORTUNIDADES'");
  await asegurarColumna(db, "clientes_nuevos_busquedas", "origen", "VARCHAR(10) NOT NULL DEFAULT 'MANUAL'");
  await asegurarColumna(db, "clientes_nuevos_busquedas", "n_total", "INT NULL");
  await asegurarColumna(db, "clientes_nuevos_busquedas", "n_ya", "INT NULL");
  await asegurarColumna(db, "clientes_nuevos_busquedas", "n_nuevas", "INT NULL");
  await db.query(`
    CREATE TABLE IF NOT EXISTS clientes_nuevos_oportunidades (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organizacion VARCHAR(200) NOT NULL,
      titulo VARCHAR(255) NOT NULL,
      segmento VARCHAR(20) NULL,
      provincia VARCHAR(60) NULL,
      fecha_iso DATE NULL,
      fecha_tipo VARCHAR(10) NULL,
      datos LONGTEXT NOT NULL,
      estado VARCHAR(15) NOT NULL DEFAULT 'PENDIENTE',
      siguiendo TINYINT NOT NULL DEFAULT 0,
      nota VARCHAR(500) NULL,
      novedad VARCHAR(600) NULL,
      novedad_at DATETIME NULL,
      aviso_cierre TINYINT NOT NULL DEFAULT 0,
      primera_busqueda_id INT NULL,
      ultima_busqueda_id INT NULL,
      primera_vez DATETIME DEFAULT CURRENT_TIMESTAMP,
      ultima_vez DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_por VARCHAR(120) NULL,
      actualizado_at DATETIME NULL,
      KEY idx_estado (estado, siguiendo)
    )`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS clientes_nuevos_eventos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      oportunidad_id INT NOT NULL,
      tipo VARCHAR(20) NOT NULL,
      usuario VARCHAR(120) NULL,
      detalle VARCHAR(600) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_op (oportunidad_id, id)
    )`);
  // Si el servidor se reinició a mitad de una búsqueda, queda como cortada.
  await db.query("UPDATE clientes_nuevos_busquedas SET estado = 'ERROR', error = 'Se cortó por un reinicio del servidor.', terminado_at = NOW() WHERE estado = 'BUSCANDO'");
}

// ---------- reconocer la misma oportunidad entre búsquedas ----------
const PALABRAS_VACIAS = new Set(["de", "del", "la", "el", "los", "las", "y", "e", "para", "en", "por", "con", "a", "al", "un", "una", "provincia", "provincial", "municipalidad", "municipio", "licitacion", "publica", "publico", "compra", "compras", "provision", "contratacion", "gobierno"]);
const tokens = (t) => N.sinAcentos(N.normEmpresa(t)).split(/\s+/).filter((x) => x.length > 2 && !PALABRAS_VACIAS.has(x));
function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let i = 0;
  for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i);
}
/** ¿Son la misma organización y la misma licitación/obra, aunque la IA la haya escrito distinto? */
function mismaOportunidad(a, b) {
  const ta = tokens(a.organizacion);
  const tb = tokens(b.organizacion);
  const orgIgual = N.normEmpresa(a.organizacion) === N.normEmpresa(b.organizacion) || jaccard(ta, tb) >= 0.6;
  if (!orgIgual) return false;
  if (a.fecha_iso && b.fecha_iso) return a.fecha_iso === b.fecha_iso || jaccard(tokens(a.titulo), tokens(b.titulo)) >= 0.5;
  return jaccard(tokens(a.titulo), tokens(b.titulo)) >= 0.35;
}

/** Guarda lo encontrado, saca lo descartado y marca qué es nuevo de verdad. Devuelve el resultado con los ids. */
async function registrarOportunidades(db, resultado, busquedaId) {
  const [filas] = await db.query("SELECT id, organizacion, titulo, DATE_FORMAT(fecha_iso, '%Y-%m-%d') AS fecha_iso, estado FROM clientes_nuevos_oportunidades");
  const salida = [];
  let ocultas = 0;
  for (const o of resultado.oportunidades) {
    const f = filas.find((x) => mismaOportunidad(x, o));
    if (f) {
      await db.query("UPDATE clientes_nuevos_oportunidades SET ultima_busqueda_id = ?, ultima_vez = NOW() WHERE id = ?", [busquedaId, f.id]);
      if (f.estado === "DESCARTADA") {
        ocultas++;
        continue;
      }
      await db.query("UPDATE clientes_nuevos_oportunidades SET aviso_cierre = IF(fecha_iso <=> ?, aviso_cierre, 0), datos = ?, titulo = ?, organizacion = ?, segmento = ?, provincia = ?, fecha_iso = ?, fecha_tipo = ? WHERE id = ?", [o.fecha_iso || null, JSON.stringify(o), o.titulo, o.organizacion, o.segmento, o.provincia || null, o.fecha_iso || null, o.fecha_tipo || null, f.id]);
      salida.push({ ...o, id: f.id, nueva: false });
    } else {
      const [ins] = await db.query("INSERT INTO clientes_nuevos_oportunidades (organizacion, titulo, segmento, provincia, fecha_iso, fecha_tipo, datos, primera_busqueda_id, ultima_busqueda_id) VALUES (?,?,?,?,?,?,?,?,?)", [o.organizacion, o.titulo, o.segmento, o.provincia || null, o.fecha_iso || null, o.fecha_tipo || null, JSON.stringify(o), busquedaId, busquedaId]);
      filas.push({ id: ins.insertId, organizacion: o.organizacion, titulo: o.titulo, fecha_iso: o.fecha_iso || null, estado: "PENDIENTE" });
      salida.push({ ...o, id: ins.insertId, nueva: true });
    }
  }
  return { ...resultado, oportunidades: salida, descartadas_ocultas: ocultas };
}

const parsear = (t) => {
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
};

const filaBusqueda = (f) =>
  f && { id: f.id, tipo: f.tipo, origen: f.origen, estado: f.estado, progreso: f.progreso, error: f.error, creado_por: f.creado_por, created_at: f.created_at, terminado_at: f.terminado_at, n_total: f.n_total, n_ya: f.n_ya, n_nuevas: f.n_nuevas, resultado: parsear(f.resultado) };

/** Al reporte guardado se le pone el estado de hoy de cada oportunidad (marcas, seguimiento, notas, novedades). */
async function hidratar(db, b) {
  if (!b?.resultado?.oportunidades?.length) return b;
  const ids = b.resultado.oportunidades.map((o) => o.id).filter(Boolean);
  if (!ids.length) return b;
  const [filas] = await db.query("SELECT id, estado, siguiendo, nota, novedad, novedad_at FROM clientes_nuevos_oportunidades WHERE id IN (?)", [ids]);
  const por = new Map(filas.map((f) => [f.id, f]));
  b.resultado.oportunidades = b.resultado.oportunidades.map((o) => {
    const f = por.get(o.id);
    return f ? { ...o, estado: f.estado, siguiendo: !!f.siguiendo, nota: f.nota || "", novedad: f.novedad || "", novedad_at: f.novedad_at } : { ...o, estado: "PENDIENTE", siguiendo: false, nota: "" };
  });
  return b;
}

async function ultimaBusqueda(db, tipo = "OPORTUNIDADES") {
  const [r] = await db.query("SELECT * FROM clientes_nuevos_busquedas WHERE tipo = ? ORDER BY id DESC LIMIT 1", [tipo]);
  return hidratar(db, filaBusqueda(r[0]));
}

// ---------- lo que sabemos de la empresa (para orientar y filtrar la búsqueda) ----------
async function contextoDeLaEmpresa(db) {
  let productos = [];
  let activos = [];
  let dormidos = [];
  let mejoresClientes = [];
  try {
    const [p] = await db.query("SELECT DISTINCT nombre FROM productos WHERE nombre IS NOT NULL AND nombre <> '' ORDER BY nombre LIMIT 60");
    productos = p.map((x) => x.nombre);
  } catch {
    /* sin catálogo cargado */
  }
  try {
    const [c] = await db.query(`SELECT cliente, COUNT(*) AS pedidos, COALESCE(SUM(cantidad_total), 0) AS unidades, DATEDIFF(NOW(), MAX(fecha)) AS dias FROM pedidos WHERE cliente IS NOT NULL AND cliente <> '' GROUP BY cliente`);
    activos = c.filter((x) => x.dias === null || Number(x.dias) <= DIAS_DORMIDO);
    dormidos = c.filter((x) => Number(x.dias) > DIAS_DORMIDO && Number(x.pedidos) >= 2).sort((a, b) => Number(b.unidades) - Number(a.unidades));
    const top = [...c].sort((a, b) => Number(b.unidades) - Number(a.unidades)).slice(0, 8);
    const [art] = await db.query("SELECT cliente, articulo, SUM(cantidad_total) AS u FROM pedidos WHERE cliente IN (?) GROUP BY cliente, articulo ORDER BY u DESC", [top.length ? top.map((x) => x.cliente) : [""]]);
    mejoresClientes = top.map((x) => ({ cliente: x.cliente, pedidos: Number(x.pedidos), unidades: Number(x.unidades), articulos: art.filter((a) => a.cliente === x.cliente).slice(0, 3).map((a) => a.articulo) }));
  } catch {
    /* sin pedidos */
  }
  let excluir = [];
  let ganadas = [];
  try {
    const [d] = await db.query("SELECT DISTINCT organizacion, estado FROM clientes_nuevos_oportunidades WHERE estado IN ('DESCARTADA', 'GANADA') ORDER BY id DESC LIMIT 200");
    excluir = d.filter((x) => x.estado === "DESCARTADA").map((x) => x.organizacion).slice(0, 80);
    ganadas = d.filter((x) => x.estado === "GANADA").map((x) => x.organizacion);
  } catch {
    /* tabla nueva */
  }
  return { productos, clientes: [...activos.map((x) => x.cliente).slice(0, 150), ...ganadas], dormidos: dormidos.map((x) => x.cliente).slice(0, 30), mejoresClientes, excluir };
}

async function clientesDormidos(db) {
  const [c] = await db.query(
    `SELECT cliente, COUNT(*) AS pedidos, COALESCE(SUM(cantidad_total), 0) AS unidades, DATE_FORMAT(MAX(fecha), '%Y-%m-%d') AS ultima, DATEDIFF(NOW(), MAX(fecha)) AS dias
     FROM pedidos WHERE cliente IS NOT NULL AND cliente <> '' GROUP BY cliente HAVING COUNT(*) >= 2 AND DATEDIFF(NOW(), MAX(fecha)) > ? ORDER BY unidades DESC LIMIT 40`,
    [DIAS_DORMIDO],
  );
  return c.map((x) => ({ cliente: x.cliente, pedidos: Number(x.pedidos), unidades: Number(x.unidades), ultima: x.ultima, dias: Number(x.dias) }));
}

// ---------- aviso cuando se acerca el cierre de una licitación que se sigue ----------
const diasEntre = (hoy, iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86400000);
/** 0 = sin aviso, 1 = faltan 7 días o menos, 2 = faltan 3 o menos, 3 = cierra hoy. Negativo = ya cerró. */
function nivelAviso(dias) {
  if (dias < 0) return -1;
  if (dias === 0) return 3;
  if (dias <= 3) return 2;
  if (dias <= 7) return 1;
  return 0;
}

async function avisarCierres(db, crearNotificacion, hoy = N.hoyAR()) {
  const [filas] = await db.query("SELECT id, titulo, organizacion, DATE_FORMAT(fecha_iso, '%Y-%m-%d') AS fecha_iso, aviso_cierre FROM clientes_nuevos_oportunidades WHERE siguiendo = 1 AND fecha_tipo = 'cierre' AND fecha_iso IS NOT NULL AND estado NOT IN ('DESCARTADA', 'GANADA')");
  let avisos = 0;
  for (const f of filas) {
    const dias = diasEntre(hoy, f.fecha_iso);
    const nivel = nivelAviso(dias);
    if (nivel <= 0 || nivel <= f.aviso_cierre) continue;
    await crearNotificacion(db, {
      tipo: "CLIENTES_NUEVOS",
      titulo: dias === 0 ? "Hoy cierra una licitación que seguís" : `Cierra en ${dias} ${dias === 1 ? "día" : "días"} una licitación que seguís`,
      texto: `${f.titulo} · ${f.organizacion}`,
      ruta: "/clientes-nuevos",
      roles: ["ADMIN"],
      push: nivel >= 2,
    });
    await db.query("UPDATE clientes_nuevos_oportunidades SET aviso_cierre = ? WHERE id = ?", [nivel, f.id]);
    avisos++;
  }
  return avisos;
}

/** Busca novedades de cada licitación seguida (de a pocas, para no saturar). */
async function revisarSeguimiento(db, { ai, modelo, crearNotificacion, progreso = () => {}, hoy = N.hoyAR(), revisar = N.revisarLicitacion }) {
  const [filas] = await db.query("SELECT id, titulo, organizacion, provincia, datos, novedad, DATE_FORMAT(fecha_iso, '%Y-%m-%d') AS fecha_iso FROM clientes_nuevos_oportunidades WHERE siguiendo = 1 AND estado NOT IN ('DESCARTADA', 'GANADA') AND (fecha_iso IS NULL OR fecha_iso >= ?) ORDER BY (fecha_iso IS NULL), fecha_iso LIMIT 8", [hoy]);
  const conNovedad = [];
  let hechas = 0;
  progreso(filas.length ? `Revisando ${filas.length} ${filas.length === 1 ? "licitación" : "licitaciones"} que seguís…` : "No hay licitaciones seguidas para revisar.");
  for (let i = 0; i < filas.length; i += 3) {
    await Promise.all(
      filas.slice(i, i + 3).map(async (f) => {
        const d = parsear(f.datos) || {};
        try {
          const texto = await revisar({ ai, modelo, oportunidad: { titulo: f.titulo, organizacion: f.organizacion, provincia: f.provincia, fecha: d.fecha }, fecha: hoy });
          hechas++;
          if (texto && texto !== f.novedad) {
            await db.query("UPDATE clientes_nuevos_oportunidades SET novedad = ?, novedad_at = NOW() WHERE id = ?", [texto, f.id]);
            await db.query("INSERT INTO clientes_nuevos_eventos (oportunidad_id, tipo, usuario, detalle) VALUES (?,?,?,?)", [f.id, "NOVEDAD", "IA", texto.slice(0, 590)]);
            conNovedad.push({ id: f.id, titulo: f.titulo, organizacion: f.organizacion, novedad: texto });
            await crearNotificacion(db, { tipo: "CLIENTES_NUEVOS", titulo: "Novedad en una licitación que seguís", texto: `${f.titulo}: ${texto}`, ruta: "/clientes-nuevos", roles: ["ADMIN"], push: true });
          }
        } catch (e) {
          console.error("[clientes-nuevos] revisión:", e.message);
        }
      }),
    );
  }
  return { revisadas: hechas, de: filas.length, con_novedad: conNovedad };
}

// ---------- trabajos en segundo plano ----------
async function hayEnCurso(db) {
  const [r] = await db.query("SELECT id, tipo, created_at FROM clientes_nuevos_busquedas WHERE estado = 'BUSCANDO' ORDER BY id DESC LIMIT 1");
  if (!r[0]) return null;
  return Date.now() - new Date(r[0].created_at).getTime() < EN_CURSO_MAX_MS ? r[0] : null;
}

async function trabajoActual(db) {
  const e = await hayEnCurso(db);
  if (!e) return null;
  const [r] = await db.query("SELECT id, tipo, progreso, created_at FROM clientes_nuevos_busquedas WHERE id = ?", [e.id]);
  return r[0] || null;
}

async function iniciarTrabajo(db, { tipo, origen = "MANUAL", quien = "Usuario", ai, modelo, crearNotificacion, ejecutores = {} }) {
  const actual = await hayEnCurso(db);
  if (actual) return { id: actual.id, ya_buscando: true };
  const [ins] = await db.query("INSERT INTO clientes_nuevos_busquedas (tipo, origen, estado, progreso, creado_por) VALUES (?, ?, 'BUSCANDO', 'Empezando…', ?)", [tipo, origen, quien]);
  const id = ins.insertId;
  const progreso = (t) => db.query("UPDATE clientes_nuevos_busquedas SET progreso = ? WHERE id = ?", [String(t).slice(0, 190), id]).catch(() => {});
  const terminar = (resultado, n) =>
    db.query("UPDATE clientes_nuevos_busquedas SET estado = 'LISTO', progreso = NULL, resultado = ?, terminado_at = NOW(), n_total = ?, n_ya = ?, n_nuevas = ? WHERE id = ?", [JSON.stringify(resultado), n.total ?? null, n.ya ?? null, n.nuevas ?? null, id]);

  const correr = async () => {
    try {
      if (tipo === "OPORTUNIDADES") {
        const ctx = await contextoDeLaEmpresa(db);
        const crudo = await (ejecutores.oportunidades || N.ejecutarBusqueda)({ ai, modelo, ...ctx, progreso });
        const resultado = await registrarOportunidades(db, crudo, id);
        const ops = resultado.oportunidades;
        await terminar(resultado, { total: ops.length, ya: ops.filter((o) => o.prioridad === 1).length, nuevas: ops.filter((o) => o.nueva).length });
        if (origen === "AUTO") {
          await revisarSeguimiento(db, { ai, modelo, crearNotificacion, progreso }).catch((e) => console.error("[clientes-nuevos] seguimiento auto:", e.message));
          const nuevasYa = ops.filter((o) => o.nueva && o.prioridad === 1).length;
          await crearNotificacion(db, { tipo: "CLIENTES_NUEVOS", titulo: "Novedades de clientes nuevos", texto: `${ops.filter((o) => o.nueva).length} oportunidades nuevas${nuevasYa ? `, ${nuevasYa} para ir ya` : ""}.`, ruta: "/clientes-nuevos", roles: ["ADMIN"], push: nuevasYa > 0 });
        }
        await avisarCierres(db, crearNotificacion).catch(() => {});
      } else if (tipo === "COMPETENCIA") {
        const ctx = await contextoDeLaEmpresa(db);
        const resultado = await (ejecutores.competencia || N.ejecutarCompetencia)({ ai, modelo, productos: ctx.productos, progreso });
        await terminar(resultado, { total: resultado.adjudicaciones.length, ya: resultado.ranking.length, nuevas: resultado.competidores.length });
      } else {
        const resultado = await revisarSeguimiento(db, { ai, modelo, crearNotificacion, progreso, revisar: ejecutores.revisar });
        await terminar(resultado, { total: resultado.revisadas, ya: resultado.con_novedad.length, nuevas: 0 });
      }
    } catch (e) {
      console.error(`[clientes-nuevos] ${tipo}:`, e.message);
      await db.query("UPDATE clientes_nuevos_busquedas SET estado = 'ERROR', progreso = NULL, error = ?, terminado_at = NOW() WHERE id = ?", [String(e.message || "Error").slice(0, 490), id]).catch(() => {});
    }
  };
  return { id, correr };
}

// ---------- búsqueda semanal automática ----------
const ahoraAR = () => new Date(Date.now() - 3 * 3600 * 1000);
async function vueltaAutomatica(db, deps, { ahora = ahoraAR(), diaSemana = 1, desdeHora = 8 } = {}) {
  await avisarCierres(db, deps.crearNotificacion).catch((e) => console.error("[clientes-nuevos] avisos:", e.message));
  if (ahora.getUTCDay() !== diaSemana || ahora.getUTCHours() < desdeHora) return null;
  const [r] = await db.query("SELECT COUNT(*) AS n FROM clientes_nuevos_busquedas WHERE tipo = 'OPORTUNIDADES' AND created_at >= (NOW() - INTERVAL 5 DAY)");
  if (Number(r[0].n) > 0) return null;
  const t = await iniciarTrabajo(db, { tipo: "OPORTUNIDADES", origen: "AUTO", quien: "Búsqueda automática", ...deps });
  if (t.correr) await t.correr();
  return t.id;
}

function iniciarBusquedaSemanal(db, deps, { minutos = Number(process.env.CLIENTES_NUEVOS_AUTO_MIN ?? 30), arranqueMs = 60000 } = {}) {
  if (process.env.CLIENTES_NUEVOS_AUTO === "0" || !(minutos > 0)) return null;
  let corriendo = false;
  const vuelta = async () => {
    if (corriendo) return;
    corriendo = true;
    try {
      await vueltaAutomatica(db, deps);
    } catch (e) {
      console.error("[clientes-nuevos] vuelta automática:", e.message);
    } finally {
      corriendo = false;
    }
  };
  setTimeout(vuelta, arranqueMs).unref?.();
  const t = setInterval(vuelta, minutos * 60 * 1000);
  t.unref?.();
  return t;
}

// ---------- rutas ----------
function registrarRutasClientesNuevos(app, { db, requirePermiso, nombreDeUsuario, ai, modelo, crearNotificacion, crearBorrador = null }) {
  const PERMISO = requirePermiso("clientes-nuevos");
  const deps = { ai, modelo, crearNotificacion };
  const falla = (res, e, msg) => {
    console.error("[clientes-nuevos]", msg, e.message);
    res.status(500).json({ error: msg });
  };

  app.get("/api/clientes-nuevos/ultima", PERMISO, async (req, res) => {
    try {
      const tipo = TIPOS.includes(String(req.query.tipo)) ? String(req.query.tipo) : "OPORTUNIDADES";
      res.json((await ultimaBusqueda(db, tipo)) || null);
    } catch (e) {
      falla(res, e, "No pude cargar la última búsqueda.");
    }
  });

  app.get("/api/clientes-nuevos/trabajo", PERMISO, async (req, res) => {
    try {
      res.json((await trabajoActual(db)) || null);
    } catch (e) {
      falla(res, e, "No pude consultar la búsqueda.");
    }
  });

  app.post("/api/clientes-nuevos/buscar", PERMISO, async (req, res) => {
    try {
      const tipo = TIPOS.includes(String(req.body?.tipo)) ? String(req.body.tipo) : "OPORTUNIDADES";
      const t = await iniciarTrabajo(db, { tipo, quien: (await nombreDeUsuario(req)) || "Usuario", ...deps });
      res.status(202).json({ id: t.id, ya_buscando: !!t.ya_buscando });
      if (t.correr) t.correr(); // sigue en segundo plano: la pantalla pregunta cada tanto cómo va
    } catch (e) {
      if (!res.headersSent) falla(res, e, "No pude iniciar la búsqueda.");
    }
  });

  app.get("/api/clientes-nuevos/historial", PERMISO, async (req, res) => {
    try {
      const tipo = TIPOS.includes(String(req.query.tipo)) ? String(req.query.tipo) : "OPORTUNIDADES";
      const [r] = await db.query("SELECT id, tipo, origen, estado, creado_por, created_at, terminado_at, n_total, n_ya, n_nuevas, error FROM clientes_nuevos_busquedas WHERE tipo = ? ORDER BY id DESC LIMIT 40", [tipo]);
      res.json(r);
    } catch (e) {
      falla(res, e, "No pude cargar el historial.");
    }
  });

  app.get("/api/clientes-nuevos/busqueda/:id", PERMISO, async (req, res) => {
    try {
      const [r] = await db.query("SELECT * FROM clientes_nuevos_busquedas WHERE id = ?", [req.params.id]);
      if (!r[0]) return res.status(404).json({ error: "Esa búsqueda no existe." });
      res.json(await hidratar(db, filaBusqueda(r[0])));
    } catch (e) {
      falla(res, e, "No pude cargar esa búsqueda.");
    }
  });

  // Marcar el resultado: estado, si se sigue y una nota. Descartar la saca de las próximas búsquedas.
  app.put("/api/clientes-nuevos/oportunidades/:id", PERMISO, async (req, res) => {
    try {
      const sets = [];
      const vals = [];
      const cambios = {};
      if (req.body.estado !== undefined) {
        const e = String(req.body.estado).toUpperCase();
        if (!ESTADOS.includes(e)) return res.status(400).json({ error: "Estado inválido." });
        sets.push("estado = ?");
        vals.push(e);
        cambios.estado = e;
      }
      if (req.body.siguiendo !== undefined) {
        sets.push("siguiendo = ?");
        vals.push(req.body.siguiendo ? 1 : 0);
        cambios.siguiendo = req.body.siguiendo ? 1 : 0;
        if (req.body.siguiendo) sets.push("aviso_cierre = 0");
      }
      if (req.body.nota !== undefined) {
        sets.push("nota = ?");
        vals.push(String(req.body.nota || "").trim().slice(0, 500) || null);
        cambios.nota = String(req.body.nota || "").trim().slice(0, 500);
      }
      if (!sets.length) return res.status(400).json({ error: "No hay nada para cambiar." });
      const quien = (await nombreDeUsuario(req)) || "Usuario";
      const [r] = await db.query(`UPDATE clientes_nuevos_oportunidades SET ${sets.join(", ")}, actualizado_por = ?, actualizado_at = NOW() WHERE id = ?`, [...vals, quien, req.params.id]);
      if (!r.affectedRows) return res.status(404).json({ error: "Esa oportunidad no existe." });
      await db.query("INSERT INTO clientes_nuevos_eventos (oportunidad_id, tipo, usuario, detalle) VALUES (?,?,?,?)", [req.params.id, cambios.estado ? "ESTADO" : cambios.siguiendo !== undefined ? (cambios.siguiendo ? "SEGUIR" : "DEJAR") : "NOTA", quien, JSON.stringify(cambios).slice(0, 590)]);
      const [f] = await db.query("SELECT id, estado, siguiendo, nota FROM clientes_nuevos_oportunidades WHERE id = ?", [req.params.id]);
      res.json({ id: f[0].id, estado: f[0].estado, siguiendo: !!f[0].siguiendo, nota: f[0].nota || "" });
    } catch (e) {
      falla(res, e, "No pude guardar el cambio.");
    }
  });

  app.get("/api/clientes-nuevos/oportunidades/:id/eventos", PERMISO, async (req, res) => {
    try {
      const [r] = await db.query("SELECT tipo, usuario, detalle, created_at FROM clientes_nuevos_eventos WHERE oportunidad_id = ? ORDER BY id DESC LIMIT 30", [req.params.id]);
      res.json(r);
    } catch (e) {
      falla(res, e, "No pude cargar la actividad.");
    }
  });

  // Seguimiento: lo que se sigue o ya se contactó, con las licitaciones que cierran antes primero.
  app.get("/api/clientes-nuevos/seguimiento", PERMISO, async (req, res) => {
    try {
      const [r] = await db.query(
        `SELECT id, datos, estado, siguiendo, nota, novedad, novedad_at, DATE_FORMAT(fecha_iso, '%Y-%m-%d') AS fecha_iso, fecha_tipo
         FROM clientes_nuevos_oportunidades WHERE estado <> 'DESCARTADA' AND (siguiendo = 1 OR estado IN ('INTERESA', 'CONTACTADA', 'GANADA'))
         ORDER BY (fecha_iso IS NULL), fecha_iso, id DESC LIMIT 200`,
      );
      res.json(r.map((f) => ({ ...(parsear(f.datos) || {}), id: f.id, estado: f.estado, siguiendo: !!f.siguiendo, nota: f.nota || "", novedad: f.novedad || "", novedad_at: f.novedad_at, fecha_iso: f.fecha_iso || "", fecha_tipo: f.fecha_tipo || "" })));
    } catch (e) {
      falla(res, e, "No pude cargar el seguimiento.");
    }
  });

  app.get("/api/clientes-nuevos/descartadas", PERMISO, async (req, res) => {
    try {
      const [r] = await db.query("SELECT id, organizacion, titulo, provincia, datos FROM clientes_nuevos_oportunidades WHERE estado = 'DESCARTADA' ORDER BY actualizado_at DESC LIMIT 100");
      res.json(r.map((f) => ({ ...(parsear(f.datos) || {}), id: f.id, estado: "DESCARTADA" })));
    } catch (e) {
      falla(res, e, "No pude cargar las descartadas.");
    }
  });

  app.get("/api/clientes-nuevos/dormidos", PERMISO, async (req, res) => {
    try {
      res.json(await clientesDormidos(db));
    } catch (e) {
      falla(res, e, "No pude cargar los clientes que dejaron de comprar.");
    }
  });

  // El mensaje sugerido queda como BORRADOR en Gmail. Nunca se envía.
  app.post("/api/clientes-nuevos/oportunidades/:id/borrador", PERMISO, async (req, res) => {
    try {
      if (!crearBorrador) return res.status(501).json({ error: "Gmail no está configurado en el servidor." });
      const para = String(req.body?.para || "").trim();
      if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(para)) return res.status(400).json({ error: "Escribí un mail válido para el destinatario." });
      const mensaje = String(req.body?.mensaje || "").trim().slice(0, 4000);
      if (!mensaje) return res.status(400).json({ error: "El mensaje está vacío." });
      const [f] = await db.query("SELECT id, titulo FROM clientes_nuevos_oportunidades WHERE id = ?", [req.params.id]);
      if (!f[0]) return res.status(404).json({ error: "Esa oportunidad no existe." });
      const asunto = String(req.body?.asunto || "").trim().slice(0, 150) || `Conoflex: ${f[0].titulo}`.slice(0, 150);
      const html = mensaje.split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`).join("");
      await crearBorrador({ para, asunto, html });
      const quien = (await nombreDeUsuario(req)) || "Usuario";
      await db.query("INSERT INTO clientes_nuevos_eventos (oportunidad_id, tipo, usuario, detalle) VALUES (?,?,?,?)", [req.params.id, "BORRADOR", quien, `Borrador en Gmail para ${para}`]);
      res.json({ ok: true });
    } catch (e) {
      console.error("[clientes-nuevos] borrador:", e.message);
      res.status(500).json({ error: "No pude crear el borrador en Gmail. Revisá que la cuenta esté conectada." });
    }
  });

  require("./clientesNuevosExport").registrarRutasExportar(app, { db, PERMISO, hidratar, filaBusqueda, falla });
}

module.exports = {
  ESTADOS, TIPOS, asegurarTablaClientesNuevos, mismaOportunidad, registrarOportunidades, hidratar, ultimaBusqueda, contextoDeLaEmpresa, clientesDormidos,
  nivelAviso, avisarCierres, revisarSeguimiento, iniciarTrabajo, vueltaAutomatica, iniciarBusquedaSemanal, registrarRutasClientesNuevos,
};
