"use strict";
// Catálogo comercial: códigos, precios y estado de las fichas (descripción, usos, advertencias).
// Todo lo "puro" (sin base de datos) vive acá para poder probarlo; las rutas están al final.

const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** "1570l-2r  na" → "1570L-2R NA" (mayúsculas, un solo tipo de guion, espacios simples). */
function normalizarCodigo(c) {
  return sinAcentos(c).toUpperCase().replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim();
}

/** Un producto puede tener varios códigos juntos: "2051L-1R / 2051-1R". */
const alternativas = (codigo) => String(codigo || "").split(/\s*[\/;,|]\s*/).map(normalizarCodigo).filter(Boolean);

/**
 * ¿La ficha del PDF (código "1570L-2R") es del producto de la lista ("1570L-2R NA")?
 * Coincide si el código es igual, o si el de la lista es el de la ficha más un sufijo separado por espacio (NA, FC…).
 * No se usa "contiene": "1025" no puede coincidir con "11025" ni "1570-2R" con "1570B-2R".
 */
function mismoProducto(codigoFicha, codigoProducto) {
  const f = normalizarCodigo(codigoFicha);
  if (!f) return false;
  return alternativas(codigoProducto).some((a) => a === f || a.startsWith(`${f} `));
}

const NUM = String.raw`\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?`;
const aNumero = (s) => Number(String(s).replace(/\./g, "").replace(",", "."));

/**
 * Lee el campo "precio_lista" (texto libre que sale de la lista).
 *  - "$35.210,07"                                   → un solo precio.
 *  - "SIN FIJACIÓN $34.303,34 | HORMIGÓN $55.430,57" → varios precios (variantes): no se elige uno solo.
 * `unidad` intenta detectar si el precio es por metro, por par, etc. (null = la lista no lo aclara).
 */
function leerPrecios(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return { valores: [], unico: null, unidad: null };
  const solo = new RegExp(String.raw`^\$?\s*(${NUM})\s*$`).exec(t);
  const valores = [];
  if (solo) valores.push({ etiqueta: "", valor: aNumero(solo[1]) });
  else {
    const re = new RegExp(String.raw`([^$\d]{0,40}?)\$\s*(${NUM})`, "g");
    let m;
    while ((m = re.exec(t))) valores.push({ etiqueta: m[1].replace(/^[\s|:;,\-–]+|[\s|:;,\-–]+$/g, ""), valor: aNumero(m[2]) });
  }
  const validos = valores.filter((v) => Number.isFinite(v.valor) && v.valor > 0);
  const u = /(por|x|\/)\s*(metro|mt|mts|m\b)|metro lineal|mt\.?\s*lineal|precio x mt/i.test(sinAcentos(t)) ? "metro" : /por par|venta por par/i.test(sinAcentos(t)) ? "par" : /por rollo/i.test(sinAcentos(t)) ? "rollo" : /por unidad|c\/u|cada una?/i.test(sinAcentos(t)) ? "unidad" : null;
  return { valores: validos, unico: validos.length === 1 ? validos[0].valor : null, unidad: u };
}

/** Estado de la ficha de un producto: qué le falta para que la IA pueda vender bien. */
function estadoFicha(p) {
  const precio = leerPrecios(p.precio_lista);
  const faltan = [];
  if (!String(p.descripcion || "").trim()) faltan.push("descripción");
  if (!String(p.usos_recomendados || p.aplicacion || "").trim()) faltan.push("usos");
  if (!precio.valores.length) faltan.push("precio");
  else if (precio.unico === null) faltan.push("precio con variantes");
  if (!String(p.foto_tecnica || "").trim() && !String(p.foto_catalogo || "").trim()) faltan.push("foto");
  return { completo: faltan.length === 0, faltan, precio };
}

function resumenFichas(lista) {
  const r = { total: lista.length, completos: 0, sin_descripcion: 0, sin_usos: 0, sin_precio: 0, con_variantes: 0, sin_foto: 0, editados: 0 };
  for (const p of lista) {
    if (p.estado.completo) r.completos++;
    if (p.estado.faltan.includes("descripción")) r.sin_descripcion++;
    if (p.estado.faltan.includes("usos")) r.sin_usos++;
    if (p.estado.faltan.includes("precio")) r.sin_precio++;
    if (p.estado.faltan.includes("precio con variantes")) r.con_variantes++;
    if (p.estado.faltan.includes("foto")) r.sin_foto++;
    if (p.ficha_editada) r.editados++;
  }
  return r;
}

/** Agrega las columnas nuevas de la tabla productos si faltan (no toca las que ya existen). */
async function asegurarColumnasCatalogo(db) {
  // Las tres primeras ya existen en producción; se declaran por si se instala en una base nueva.
  const nuevas = [
    ["categoria", "VARCHAR(100) DEFAULT 'General'"],
    ["descripcion", "TEXT NULL"],
    ["usos_recomendados", "TEXT NULL"],
    ["advertencias", "TEXT NULL"],
    ["ficha_editada", "TINYINT(1) NOT NULL DEFAULT 0"],
    ["ficha_origen", "VARCHAR(200) NULL"],
    ["ficha_actualizada", "DATETIME NULL"],
  ];
  const [cols] = await db.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'productos'");
  const hay = new Set(cols.map((c) => c.COLUMN_NAME));
  for (const [nombre, def] of nuevas) if (!hay.has(nombre)) await db.query(`ALTER TABLE productos ADD COLUMN ${nombre} ${def}`);
  await db.query(`CREATE TABLE IF NOT EXISTS categorias_pdf (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE,
    pdf_filename VARCHAR(255),
    total_productos INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

const CAMPOS_FICHA = ["id", "codigo", "nombre", "categoria", "medidas", "precio_lista", "especificacion", "aplicacion", "descripcion", "usos_recomendados", "advertencias", "ficha_editada", "ficha_origen", "foto_tecnica", "foto_catalogo", "precio_anterior"];

async function listarFichas(db) {
  const [rows] = await db.query(`SELECT ${CAMPOS_FICHA.join(", ")}, DATE_FORMAT(ficha_actualizada, '%Y-%m-%d %H:%i') AS ficha_actualizada, DATE_FORMAT(precio_actualizado, '%Y-%m-%d') AS precio_actualizado FROM productos ORDER BY categoria, nombre, codigo`);
  const productos = rows.map((p) => ({ ...p, ficha_editada: !!p.ficha_editada, estado: estadoFicha(p) }));
  return { productos, resumen: resumenFichas(productos) };
}

const limpio = (v, max) => String(v ?? "").replace(/\r/g, "").trim().slice(0, max);

/** Rutas: ver y corregir las fichas que salieron de los PDF. */
function registrarRutasCatalogo(app, { db, autenticarToken, autorizarRoles }) {
  const permiso = [autenticarToken, autorizarRoles("ADMIN", "COMERCIAL")];
  app.get("/api/catalogo/fichas", ...permiso, async (req, res) => {
    try {
      res.json(await listarFichas(db));
    } catch (e) {
      console.error("[catálogo] fichas:", e.message);
      res.status(500).json({ error: "No pude cargar las fichas." });
    }
  });
  // Corrección manual: queda marcada para que una nueva carga de PDF no la pise.
  app.put("/api/catalogo/fichas/:id", ...permiso, async (req, res) => {
    try {
      const b = req.body || {};
      const usos = limpio(b.usos_recomendados, 6000);
      const [r] = await db.query(
        `UPDATE productos SET descripcion = ?, usos_recomendados = ?, aplicacion = ?, advertencias = ?, categoria = ?, ficha_editada = ?, ficha_actualizada = NOW() WHERE id = ?`,
        [limpio(b.descripcion, 4000), usos, usos, limpio(b.advertencias, 2000), limpio(b.categoria, 100) || "General", b.ficha_editada === false ? 0 : 1, req.params.id],
      );
      if (!r.affectedRows) return res.status(404).json({ error: "No encontré ese producto." });
      res.json({ success: true });
    } catch (e) {
      console.error("[catálogo] guardar ficha:", e.message);
      res.status(500).json({ error: "No pude guardar la ficha." });
    }
  });

  // ---- Producto individual: alta, edición completa y baja ----
  const columnas = (b, parcial) => {
    const c = {
      codigo: limpio(b.codigo, 60), nombre: limpio(b.nombre, 200), medidas: limpio(b.medidas, 300), precio_lista: limpio(b.precio_lista, 250),
      especificacion: limpio(b.especificacion, 2000), categoria: limpio(b.categoria, 100) || "General",
      descripcion: limpio(b.descripcion, 4000), usos_recomendados: limpio(b.usos_recomendados, 6000), advertencias: limpio(b.advertencias, 2000),
    };
    c.aplicacion = c.usos_recomendados;
    return parcial ? Object.fromEntries(Object.entries(c).filter(([k]) => k in b || (k === "aplicacion" && "usos_recomendados" in b))) : c;
  };

  app.post("/api/comercial/productos", ...permiso, async (req, res) => {
    try {
      const c = columnas(req.body || {}, false);
      if (!c.codigo || !c.nombre) return res.status(400).json({ error: "Falta el código o el nombre del producto." });
      const [dup] = await db.query("SELECT id FROM productos WHERE codigo = ?", [c.codigo]);
      if (dup.length) return res.status(409).json({ error: `Ya existe un producto con el código ${c.codigo}.` });
      const [r] = await db.query(
        "INSERT INTO productos (codigo, nombre, medidas, precio_lista, especificacion, aplicacion, categoria, descripcion, usos_recomendados, advertencias, ficha_editada, ficha_actualizada) VALUES (?,?,?,?,?,?,?,?,?,?,1,NOW())",
        [c.codigo, c.nombre, c.medidas, c.precio_lista, c.especificacion, c.aplicacion, c.categoria, c.descripcion, c.usos_recomendados, c.advertencias],
      );
      res.json({ success: true, id: r.insertId });
    } catch (e) {
      console.error("[catálogo] crear producto:", e.message);
      res.status(500).json({ error: "No pude crear el producto." });
    }
  });

  // Edición completa de un producto (lo que toque el usuario queda protegido de futuras cargas de PDF).
  app.put("/api/comercial/productos/:id", ...permiso, async (req, res) => {
    try {
      const c = columnas(req.body || {}, true);
      if ("codigo" in c && !c.codigo) return res.status(400).json({ error: "El código no puede quedar vacío." });
      if ("nombre" in c && !c.nombre) return res.status(400).json({ error: "El nombre no puede quedar vacío." });
      if (c.codigo) {
        const [dup] = await db.query("SELECT id FROM productos WHERE codigo = ? AND id <> ?", [c.codigo, req.params.id]);
        if (dup.length) return res.status(409).json({ error: `Ya existe otro producto con el código ${c.codigo}.` });
      }
      const keys = Object.keys(c);
      if (!keys.length) return res.status(400).json({ error: "No hay nada para guardar." });
      const fichaCambia = keys.some((k) => ["descripcion", "usos_recomendados", "advertencias", "categoria"].includes(k));
      const [r] = await db.query(`UPDATE productos SET ${keys.map((k) => `${k} = ?`).join(", ")}${fichaCambia ? ", ficha_editada = 1, ficha_actualizada = NOW()" : ""}, updated_at = NOW() WHERE id = ?`, [...keys.map((k) => c[k]), req.params.id]);
      if (!r.affectedRows) return res.status(404).json({ error: "No encontré ese producto." });
      res.json({ success: true });
    } catch (e) {
      console.error("[catálogo] editar producto:", e.message);
      res.status(500).json({ error: "No pude guardar el producto." });
    }
  });

  app.delete("/api/comercial/productos/:id", ...permiso, async (req, res) => {
    try {
      const [r] = await db.query("DELETE FROM productos WHERE id = ?", [req.params.id]);
      if (!r.affectedRows) return res.status(404).json({ error: "No encontré ese producto." });
      res.json({ success: true });
    } catch (e) {
      console.error("[catálogo] borrar producto:", e.message);
      res.status(500).json({ error: "No pude borrar el producto." });
    }
  });
}

module.exports = { normalizarCodigo, mismoProducto, leerPrecios, estadoFicha, resumenFichas, asegurarColumnasCatalogo, listarFichas, registrarRutasCatalogo };
