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
}

module.exports = { asegurarSemis, registrarRutasSemis, listaParaguay, sugeridoParaguay, ORIGENES, CAPACIDAD_CAMION, MESES_COBERTURA_CAMION };
