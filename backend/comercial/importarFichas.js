"use strict";
// Importación de fichas técnicas desde PDF en dos tiempos:
//   1) la IA lee los PDF (lento)  2) se aplican a los productos (rápido), preguntando antes si un producto ya tenía su ficha de otro PDF.
// Cada producto recuerda de qué PDF vino (productos.ficha_pdf_id) y se guarda cómo estaba antes, para poder eliminar un PDF sin perder lo anterior.
const { mismoProducto } = require("./catalogo");
const { crearFicha, registrarAfectados, marcarIlegible } = require("./fichasPdf");

const MODELO = "gemini-2.5-flash";

const promptExtraccion = (categoria) => `
        Analizá el documento PDF adjunto con fichas técnico-comerciales de productos.
        Extraé todos los modelos de productos presentes.

        Para cada producto, generá un objeto JSON con:
        - "codigo": Código del modelo tal cual figura (ej: "1025", "2051L-1R", "2070-2R").
        - "nombre": Nombre comercial del modelo (ej: "Multiuso Flexible", "Ciudad Light Semiflexible").
        - "medidas": Datos técnicos en una línea (ej: "Altura: 20 cm | Base: 15 cm | Peso: 0,2 kg | Material: PVC flexible | Bandas: sin bandas").
        - "descripcion": Descripción técnica y comercial del producto, fiel al PDF.
        - "usos": Los usos recomendados tal cual figuran, cada uno como "Título: explicación" y separados entre sí por " | " (barra vertical con espacios).
        - "advertencias": Limitaciones o cuándo NO conviene ofrecerlo (ej: "No para canalizar tránsito en rutas", "Priorizar interiores"), si el PDF las menciona; si no, "".
        - "categoria": "${categoria}".

        Reglas: no inventes datos que no estén en el PDF y no traslades medidas o pesos de un modelo a otro.
        Devolvé ÚNICAMENTE un arreglo JSON válido sin formato markdown adicional.
      `;

/** Lee un PDF con la IA. Devuelve la lista de productos o null si no se pudo leer. */
async function extraer({ ai, file, categoria }) {
  const response = await ai.models.generateContent({
    model: MODELO,
    contents: [{ inlineData: { mimeType: "application/pdf", data: file.buffer.toString("base64") } }, promptExtraccion(categoria)],
    config: { responseMimeType: "application/json" },
  });
  try {
    const r = JSON.parse(response.text);
    return Array.isArray(r) ? r : null;
  } catch {
    const m = String(response.text || "").match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

const recorte = (t, n) => String(t || "").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * Productos que ya tienen su descripción y usos tomados de OTRO PDF (los corregidos a mano no entran: nunca se pisan).
 * `archivos`: [{ nombre, productos }]. Devuelve uno por producto, con el PDF anterior (nombre y fecha/hora) y el texto viejo y nuevo.
 */
async function buscarConflictos({ db, archivos }) {
  const [todos] = await db.query(
    `SELECT p.id, p.codigo, p.nombre, p.descripcion, p.usos_recomendados, p.ficha_editada, p.ficha_origen, p.ficha_pdf_id,
            DATE_FORMAT(p.ficha_actualizada, '%Y-%m-%d %H:%i') AS ficha_actualizada, f.nombre AS pdf_nombre, DATE_FORMAT(f.created_at, '%Y-%m-%d %H:%i') AS pdf_fecha
       FROM productos p LEFT JOIN fichas_pdf f ON f.id = p.ficha_pdf_id`,
  );
  const vistos = new Set();
  const out = [];
  for (const a of archivos) {
    for (const p of a.productos || []) {
      if (!p?.codigo) continue;
      for (const t of todos.filter((x) => mismoProducto(p.codigo, x.codigo))) {
        if (t.ficha_editada || vistos.has(t.id)) continue;
        const tiene = t.ficha_pdf_id || String(t.ficha_origen || "").trim();
        if (!tiene) continue;
        vistos.add(t.id);
        out.push({
          producto_id: t.id, codigo: t.codigo, nombre: t.nombre || "",
          anterior: { pdf: t.pdf_nombre || t.ficha_origen, fecha: t.pdf_fecha || t.ficha_actualizada || null },
          nuevo: { pdf: a.nombre },
          descripcion_anterior: recorte(t.descripcion, 220), descripcion_nueva: recorte(p.descripcion, 220),
          usos_anterior: recorte(t.usos_recomendados, 220), usos_nuevo: recorte(p.usos, 220),
        });
      }
    }
  }
  return out;
}

const COLUMNAS_ANTES = ["descripcion", "aplicacion", "usos_recomendados", "advertencias", "categoria", "ficha_origen", "ficha_actualizada", "ficha_pdf_id"];

/**
 * Aplica los PDF ya leídos. `reemplazar`: ids de productos que la persona aceptó pisar (con ficha de otro PDF).
 * Los que no están ahí y ya tenían ficha de otro PDF se conservan como están.
 */
async function aplicar({ db, archivos, categoria, usuario, reemplazar = new Set() }) {
  const informe = { actualizados: 0, nuevos: [], omitidosEditados: [], conservados: [], ilegibles: 0 };
  let total = 0;
  const tocadosAhora = new Set(); // lo que ya pisó otro archivo de esta misma tanda no se vuelve a preguntar
  for (const a of archivos) {
    const fichaId = await crearFicha(db, { nombre: a.nombre, buffer: a.buffer, categoria, usuario });
    if (!a.productos) {
      informe.ilegibles++;
      await marcarIlegible(db, fichaId);
      continue;
    }
    const afectados = [];
    const [todos] = await db.query(`SELECT id, codigo, ficha_editada, ficha_origen, ficha_pdf_id, ${COLUMNAS_ANTES.filter((c) => !["ficha_origen", "ficha_pdf_id"].includes(c)).join(", ")} FROM productos`);
    const origen = String(a.nombre || "").slice(0, 200);
    let enArchivo = 0;
    for (const p of a.productos) {
      if (!p?.codigo) continue;
      const usos = String(p.usos || "");
      const existentes = todos.filter((t) => mismoProducto(p.codigo, t.codigo));
      if (existentes.length) {
        const libres = existentes.filter((e) => !e.ficha_editada);
        if (!libres.length) {
          informe.omitidosEditados.push(p.codigo);
          existentes.forEach((e) => afectados.push({ producto_id: e.id, codigo: p.codigo, accion: "OMITIDO" }));
          continue;
        }
        for (const e of libres) {
          const tenia = e.ficha_pdf_id || String(e.ficha_origen || "").trim();
          if (tenia && !reemplazar.has(e.id) && !tocadosAhora.has(e.id)) {
            informe.conservados.push(p.codigo);
            afectados.push({ producto_id: e.id, codigo: p.codigo, accion: "CONSERVADO" });
            continue;
          }
          const antes = Object.fromEntries(COLUMNAS_ANTES.map((c) => [c, e[c] instanceof Date ? e[c].toISOString() : e[c] ?? null]));
          await db.query(
            `UPDATE productos SET medidas = IF(medidas IS NULL OR medidas = '', ?, medidas), descripcion = ?, aplicacion = ?, usos_recomendados = ?, advertencias = ?,
               categoria = ?, ficha_origen = ?, ficha_pdf_id = ?, ficha_actualizada = NOW() WHERE id = ?`,
            [p.medidas || "", p.descripcion || "", usos, usos, p.advertencias || "", p.categoria || categoria, origen, fichaId, e.id],
          );
          tocadosAhora.add(e.id);
          informe.actualizados++;
          afectados.push({ producto_id: e.id, codigo: p.codigo, accion: "ACTUALIZADO", antes });
        }
      } else {
        const [ins] = await db.query(
          `INSERT INTO productos (codigo, nombre, medidas, descripcion, aplicacion, usos_recomendados, advertencias, categoria, ficha_origen, ficha_pdf_id, ficha_actualizada)
           VALUES (?,?,?,?,?,?,?,?,?,?,NOW())`,
          [p.codigo, p.nombre || "", p.medidas || "", p.descripcion || "", usos, usos, p.advertencias || "", p.categoria || categoria, origen, fichaId],
        );
        informe.nuevos.push(p.codigo);
        afectados.push({ producto_id: ins.insertId, codigo: p.codigo, accion: "NUEVO", antes: null });
        tocadosAhora.add(ins.insertId);
      }
      enArchivo++;
      total++;
    }
    await registrarAfectados(db, fichaId, afectados);
    await db.query(
      `INSERT INTO categorias_pdf (nombre, pdf_filename, total_productos) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE pdf_filename = VALUES(pdf_filename), total_productos = VALUES(total_productos)`,
      [categoria, a.nombre, enArchivo],
    ).catch(() => {});
  }
  const partes = [`${informe.actualizados} actualizadas`, `${informe.nuevos.length} nuevas`];
  if (informe.conservados.length) partes.push(`${informe.conservados.length} conservadas (ya venían de otro PDF)`);
  if (informe.omitidosEditados.length) partes.push(`${informe.omitidosEditados.length} sin tocar porque las corregiste a mano`);
  if (informe.ilegibles) partes.push(`${informe.ilegibles} PDF no se pudieron leer`);
  return { success: true, mensaje: `Fichas procesadas: ${partes.join(", ")}.`, ...informe, total };
}

/**
 * Elimina un PDF y saca de los productos que afectó lo que ese PDF les había puesto (descripción, usos, advertencias).
 * - Si el producto ya tenía ficha de un PDF anterior, vuelve a como estaba antes.
 * - Los corregidos a mano, o los que otro PDF posterior ya reemplazó, no se tocan.
 */
async function eliminarFicha(db, id) {
  const [[f]] = await db.query("SELECT id, nombre FROM fichas_pdf WHERE id = ?", [id]);
  if (!f) return { error: "No encontré ese PDF.", status: 404 };
  const [filas] = await db.query("SELECT producto_id, codigo, accion, antes FROM fichas_pdf_productos WHERE ficha_id = ? AND producto_id IS NOT NULL AND accion IN ('ACTUALIZADO','NUEVO')", [id]);
  let limpiados = 0;
  let restaurados = 0;
  const sinTocar = [];
  for (const r of filas) {
    const [[p]] = await db.query("SELECT id, ficha_editada, ficha_pdf_id FROM productos WHERE id = ?", [r.producto_id]);
    if (!p) continue;
    if (Number(p.ficha_pdf_id) !== Number(id)) {
      sinTocar.push(`${r.codigo}: ya lo reemplazó otro PDF`);
      continue;
    }
    if (p.ficha_editada) {
      sinTocar.push(`${r.codigo}: lo corregiste a mano`);
      continue;
    }
    let antes = null;
    try {
      antes = r.antes ? JSON.parse(r.antes) : null;
    } catch {
      antes = null;
    }
    if (antes && (antes.ficha_pdf_id || String(antes.ficha_origen || "").trim())) {
      const [[previo]] = antes.ficha_pdf_id ? await db.query("SELECT id FROM fichas_pdf WHERE id = ?", [antes.ficha_pdf_id]) : [[null]];
      // Solo se vuelve al PDF anterior si ese PDF todavía existe; si no, queda sin ficha.
      if (previo || !antes.ficha_pdf_id) {
        await db.query(
          "UPDATE productos SET descripcion = ?, aplicacion = ?, usos_recomendados = ?, advertencias = ?, categoria = COALESCE(?, categoria), ficha_origen = ?, ficha_pdf_id = ?, ficha_actualizada = ? WHERE id = ?",
          [antes.descripcion ?? "", antes.aplicacion ?? "", antes.usos_recomendados ?? "", antes.advertencias ?? "", antes.categoria ?? null, antes.ficha_origen ?? null, previo ? previo.id : null, antes.ficha_actualizada ? (/T/.test(String(antes.ficha_actualizada)) ? new Date(antes.ficha_actualizada) : antes.ficha_actualizada) : null, r.producto_id],
        );
        restaurados++;
        continue;
      }
    }
    await db.query("UPDATE productos SET descripcion = '', aplicacion = '', usos_recomendados = '', advertencias = '', ficha_origen = NULL, ficha_pdf_id = NULL, ficha_actualizada = NULL WHERE id = ?", [r.producto_id]);
    limpiados++;
  }
  await db.query("DELETE FROM fichas_pdf_productos WHERE ficha_id = ?", [id]);
  await db.query("DELETE FROM fichas_pdf WHERE id = ?", [id]);
  return { ok: true, nombre: f.nombre, limpiados, restaurados, sinTocar };
}

module.exports = { extraer, buscarConflictos, aplicar, eliminarFicha, promptExtraccion };
