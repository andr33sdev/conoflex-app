"use strict";
// Clasificación de los semielaborados y lista del próximo camión de Paraguay.
//  - origen: FABRICA (se fabrica acá), PROVEEDOR (se compra) o PARAGUAY (viene de la planta de Paraguay en camión).
//  - seguir_demanda: 1 = se le sigue el stock contra la demanda (alertas y prioridades); 0 = solo se muestra la demanda promedio.
//  - paraguay_proximo_items: lo que se va anotando para el próximo camión (cada 2 o 3 meses, unas 16.000 unidades de referencia).
const { demandaSemielaborados } = require("./demanda");

const ORIGENES = ["FABRICA", "PROVEEDOR", "PARAGUAY"];
const CAPACIDAD_CAMION = 16000;
const MESES_COBERTURA_CAMION = 3;

async function asegurarSemis(db) {
  const [cols] = await db.query("SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'semielaborados'");
  const tiene = new Set(cols.map((x) => x.c));
  if (!tiene.has("origen")) await db.query("ALTER TABLE semielaborados ADD COLUMN origen VARCHAR(20) NOT NULL DEFAULT 'FABRICA'");
  if (!tiene.has("seguir_demanda")) await db.query("ALTER TABLE semielaborados ADD COLUMN seguir_demanda TINYINT NOT NULL DEFAULT 1");
  // Margen de resguardo para la API de la tienda: % extra sobre lo que pide el cliente para
  // mostrar "entrega inmediata". Configurable por producto. Default 10%.
  if (!tiene.has("margen_web")) await db.query("ALTER TABLE semielaborados ADD COLUMN margen_web DECIMAL(6,2) NOT NULL DEFAULT 10");
  // Producto caliente: está reservado o necesita autorización superior para retirarlo. El motivo se muestra al solicitarlo.
  if (!tiene.has("caliente")) await db.query("ALTER TABLE semielaborados ADD COLUMN caliente TINYINT NOT NULL DEFAULT 0");
  if (!tiene.has("caliente_motivo")) await db.query("ALTER TABLE semielaborados ADD COLUMN caliente_motivo VARCHAR(255) NULL");
  // Stock mínimo: alerta cuando el stock del DEPÓSITO 33 llega o baja de este valor. 0 = sin alerta. Solo aplica al 33.
  if (!tiene.has("stock_minimo")) await db.query("ALTER TABLE semielaborados ADD COLUMN stock_minimo DECIMAL(12,2) NOT NULL DEFAULT 0");
  // Marca interna para no repetir el aviso: se pone en 1 al avisar y vuelve a 0 cuando el stock se recupera.
  if (!tiene.has("stock_min_avisado")) await db.query("ALTER TABLE semielaborados ADD COLUMN stock_min_avisado TINYINT NOT NULL DEFAULT 0");
  await db.query(`
    CREATE TABLE IF NOT EXISTS paraguay_proximo_items (
      semielaborado_id INT NOT NULL PRIMARY KEY,
      cantidad INT NOT NULL DEFAULT 0,
      notas VARCHAR(255) NULL,
      actualizado_por VARCHAR(255) NULL,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
}

/** Cuánto conviene pedir en el camión: lo que se vende en los meses que cubre el camión menos lo que ya hay. */
function sugeridoParaguay({ demanda_mensual = 0, stock_total = 0 }) {
  return Math.max(0, Math.round((Number(demanda_mensual) || 0) * MESES_COBERTURA_CAMION - (Number(stock_total) || 0)));
}

async function listaParaguay(db) {
  const [semis] = await db.query("SELECT id, codigo, nombre FROM semielaborados WHERE origen = 'PARAGUAY' ORDER BY nombre");
  const [elegidos] = await db.query("SELECT semielaborado_id, cantidad, notas FROM paraguay_proximo_items");
  const porId = new Map(elegidos.map((e) => [e.semielaborado_id, e]));
  const dem = await demandaSemielaborados(db, { meses: 3, solo_con_demanda: false });
  const porCodigo = new Map((dem.semielaborados || []).map((s) => [s.codigo, s]));
  const items = semis.map((s) => {
    const d = porCodigo.get(s.codigo) || {};
    const e = porId.get(s.id);
    const base = { demanda_mensual: Number(d.demanda_mensual) || 0, stock_total: Number(d.stock_total) || 0 };
    return { id: s.id, codigo: s.codigo, nombre: s.nombre, ...base, dias: d.dias_de_stock ?? null, sugerido: sugeridoParaguay(base), cantidad: e ? Number(e.cantidad) : 0, notas: e?.notas || "" };
  });
  const total = items.reduce((a, i) => a + i.cantidad, 0);
  return { items, total, capacidad_referencia: CAPACIDAD_CAMION, meses_cobertura: MESES_COBERTURA_CAMION };
}

function registrarRutasSemis(app, { db, nombreDeUsuario = () => null }) {
  const seguro = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      console.error("[semis]", e.message);
      res.status(500).json({ error: e.message });
    }
  };

  app.put("/api/semielaborados/:id/clasificacion", seguro(async (req, res) => {
    const sets = [];
    const vals = [];
    if (req.body.origen !== undefined) {
      const o = String(req.body.origen).toUpperCase();
      if (!ORIGENES.includes(o)) return res.status(400).json({ error: "Origen inválido: tiene que ser FABRICA, PROVEEDOR o PARAGUAY." });
      sets.push("origen = ?");
      vals.push(o);
    }
    if (req.body.seguir_demanda !== undefined) {
      sets.push("seguir_demanda = ?");
      vals.push(req.body.seguir_demanda ? 1 : 0);
    }
    if (req.body.margen_web !== undefined) {
      const m = Number(req.body.margen_web);
      if (!Number.isFinite(m) || m < 0 || m > 1000) return res.status(400).json({ error: "El margen web tiene que ser un porcentaje entre 0 y 1000." });
      sets.push("margen_web = ?");
      vals.push(Math.round(m * 100) / 100);
    }
    if (req.body.stock_minimo !== undefined) {
      const sm = Number(req.body.stock_minimo);
      if (!Number.isFinite(sm) || sm < 0) return res.status(400).json({ error: "El stock mínimo tiene que ser un número de 0 o más." });
      sets.push("stock_minimo = ?");
      vals.push(Math.round(sm * 100) / 100);
      // Al cambiar el mínimo, se reevalúa el aviso desde cero.
      sets.push("stock_min_avisado = 0");
    }
    if (!sets.length) return res.status(400).json({ error: "No hay nada para cambiar." });
    const [r] = await db.query(`UPDATE semielaborados SET ${sets.join(", ")} WHERE id = ?`, [...vals, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: "Ese semielaborado no existe." });
    // Si deja de venir de Paraguay, sale de la lista del camión.
    if (req.body.origen !== undefined && String(req.body.origen).toUpperCase() !== "PARAGUAY") await db.query("DELETE FROM paraguay_proximo_items WHERE semielaborado_id = ?", [req.params.id]);
    res.json({ ok: true });
  }));

  app.get("/api/paraguay/proximo", seguro(async (req, res) => res.json(await listaParaguay(db))));

  app.put("/api/paraguay/proximo/:semiId", seguro(async (req, res) => {
    const cantidad = Math.round(Number(req.body.cantidad));
    if (!Number.isFinite(cantidad) || cantidad < 0) return res.status(400).json({ error: "La cantidad tiene que ser un número de cero o más." });
    const [s] = await db.query("SELECT id FROM semielaborados WHERE id = ? AND origen = 'PARAGUAY'", [req.params.semiId]);
    if (!s.length) return res.status(404).json({ error: "Ese semielaborado no está marcado como de Paraguay." });
    if (cantidad === 0) {
      await db.query("DELETE FROM paraguay_proximo_items WHERE semielaborado_id = ?", [req.params.semiId]);
    } else {
      await db.query(
        "INSERT INTO paraguay_proximo_items (semielaborado_id, cantidad, notas, actualizado_por) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE cantidad = VALUES(cantidad), notas = VALUES(notas), actualizado_por = VALUES(actualizado_por)",
        [req.params.semiId, cantidad, String(req.body.notas || "").slice(0, 255) || null, await nombreDeUsuario(req)],
      );
    }
    res.json({ ok: true });
  }));

  app.delete("/api/paraguay/proximo", seguro(async (req, res) => {
    await db.query("DELETE FROM paraguay_proximo_items");
    res.json({ ok: true });
  }));

  // Borrar un semielaborado. Si está en recetas, primero devuelve el impacto (409) salvo ?forzar=1.
  app.delete("/api/semielaborados/:id", seguro(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Id inválido." });
    const [[semi]] = await db.query("SELECT id, codigo, nombre FROM semielaborados WHERE id = ?", [id]);
    if (!semi) return res.status(404).json({ error: "Ese semielaborado no existe." });
    const [[usan]] = await db.query("SELECT COUNT(DISTINCT ingenieria_id) AS n FROM ingenieria_detalles WHERE semielaborado_id = ?", [id]);
    const [[propias]] = await db.query("SELECT COUNT(*) AS n FROM ingenierias WHERE semielaborado_id = ?", [id]);
    const recetasUsan = Number(usan?.n) || 0;
    const recetasPropias = Number(propias?.n) || 0;
    // Sin ?forzar=1 no se borra nada: solo se devuelve el impacto para confirmar.
    if (req.query.forzar !== "1") {
      return res.json({ impacto: true, recetas_usan: recetasUsan, recetas_propias: recetasPropias, codigo: semi.codigo, nombre: semi.nombre });
    }
    // El borrado en cascada limpia las líneas de receta y las recetas propias de este semielaborado.
    await db.query("DELETE FROM semielaborados WHERE id = ?", [id]);
    res.json({ ok: true, eliminado: semi.codigo });
  }));
}

module.exports = { asegurarSemis, registrarRutasSemis, listaParaguay, sugeridoParaguay, ORIGENES, CAPACIDAD_CAMION, MESES_COBERTURA_CAMION };
