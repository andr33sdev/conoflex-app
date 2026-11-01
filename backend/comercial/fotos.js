"use strict";
// Fotos individuales de cada producto: se validan por contenido (no por la extensión que diga el archivo),
// se pueden subir de a una o en lote (el nombre del archivo es el código del producto) y se pueden quitar.
const fs = require("fs");
const path = require("path");
const { normalizarCodigo, mismoProducto } = require("./catalogo");

const MAX_BYTES = 8 * 1024 * 1024;
const TIPOS = { catalogo: "foto_catalogo", tecnica: "foto_tecnica" };

/** Tipo real de la imagen según sus primeros bytes. null si no es jpg/png/webp. */
function tipoImagen(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: ".jpg", mime: "image/jpeg" };
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: ".png", mime: "image/png" };
  if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return { ext: ".webp", mime: "image/webp" };
  return null;
}

/** "1025.jpg" → "1025"; "1570L-2R NA (2).png" → "1570L-2R NA"; "1570L_2R_NA" también sirve. */
function codigoDesdeArchivo(nombre) {
  const base = String(nombre || "").replace(/\.[a-z0-9]+$/i, "").replace(/\s*\(\d+\)\s*$/, "").replace(/\s*-\s*copia$/i, "");
  return base.trim();
}

/** Busca el producto de un archivo del lote. Devuelve {producto} o {motivo}. */
function productoParaArchivo(nombre, productos) {
  const cod = codigoDesdeArchivo(nombre);
  if (!cod) return { motivo: "sin nombre" };
  const variantes = new Set([normalizarCodigo(cod), normalizarCodigo(cod.replace(/_/g, " ")), normalizarCodigo(cod.replace(/_/g, "-"))]);
  const exactos = productos.filter((p) => String(p.codigo || "").split(/\s*[\/;,|]\s*/).some((a) => variantes.has(normalizarCodigo(a))));
  if (exactos.length === 1) return { producto: exactos[0] };
  if (exactos.length > 1) return { motivo: `el código ${cod} coincide con ${exactos.length} productos` };
  return { motivo: `no hay un producto con código ${cod}` };
}

function registrarRutasFotos(app, { db, multer, autenticarToken, autorizarRoles, dirImagenes, baseUrl }) {
  const permiso = [autenticarToken, autorizarRoles("ADMIN", "COMERCIAL")];
  const mem = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 60 } });
  const url = (nombre) => `${baseUrl()}/imagenes/${nombre}`;

  /** Borra el archivo anterior solo si es uno de los que guarda este módulo. */
  function borrarArchivo(valor) {
    const f = path.basename(String(valor || "").split("?")[0]);
    if (!/^prod_\d+_/.test(f)) return;
    fs.rm(path.join(dirImagenes, f), { force: true }, () => {});
  }

  async function guardar(producto, tipo, archivo, db) {
    const t = tipoImagen(archivo.buffer);
    if (!t) return { error: `"${archivo.originalname}" no es una imagen JPG, PNG o WEBP.` };
    const nombre = `prod_${producto.id}_${tipo}_${Date.now()}${t.ext}`;
    fs.mkdirSync(dirImagenes, { recursive: true });
    fs.writeFileSync(path.join(dirImagenes, nombre), archivo.buffer);
    const campo = TIPOS[tipo];
    borrarArchivo(producto[campo]);
    await db.query(`UPDATE productos SET ${campo} = ?, updated_at = NOW() WHERE id = ?`, [url(nombre), producto.id]);
    return { url: url(nombre) };
  }

  const manejar = (fn) => (req, res) =>
    fn(req, res).catch((e) => {
      console.error("[fotos]", e.message);
      res.status(500).json({ error: "No pude guardar la imagen." });
    });

  // Una foto de un producto.
  app.post("/api/comercial/productos/:id/foto", ...permiso, (req, res, next) => mem.single("imagen")(req, res, (e) => (e ? res.status(400).json({ error: e.code === "LIMIT_FILE_SIZE" ? "La imagen pesa más de 8 MB." : "No pude leer la imagen." }) : next())), manejar(async (req, res) => {
    const tipo = req.body?.tipo === "tecnica" ? "tecnica" : "catalogo";
    if (!req.file) return res.status(400).json({ error: "No se recibió ninguna imagen." });
    const [[p]] = await db.query("SELECT id, foto_tecnica, foto_catalogo FROM productos WHERE id = ?", [req.params.id]);
    if (!p) return res.status(404).json({ error: "No encontré ese producto." });
    const r = await guardar(p, tipo, req.file, db);
    if (r.error) return res.status(400).json({ error: r.error });
    res.json({ success: true, tipo, url: r.url });
  }));

  app.delete("/api/comercial/productos/:id/foto/:tipo", ...permiso, manejar(async (req, res) => {
    const campo = TIPOS[req.params.tipo];
    if (!campo) return res.status(400).json({ error: "Tipo de foto inválido." });
    const [[p]] = await db.query(`SELECT id, ${campo} AS foto FROM productos WHERE id = ?`, [req.params.id]);
    if (!p) return res.status(404).json({ error: "No encontré ese producto." });
    await db.query(`UPDATE productos SET ${campo} = NULL, updated_at = NOW() WHERE id = ?`, [p.id]);
    borrarArchivo(p.foto);
    res.json({ success: true });
  }));

  // Lote: cada archivo se llama como el código del producto. Por defecto no pisa fotos que ya existen.
  app.post("/api/comercial/fotos/lote", ...permiso, (req, res, next) => mem.array("imagenes", 60)(req, res, (e) => (e ? res.status(400).json({ error: e.code === "LIMIT_FILE_SIZE" ? "Alguna imagen pesa más de 8 MB." : "No pude leer las imágenes (máximo 60 por vez)." }) : next())), manejar(async (req, res) => {
    const archivos = req.files || [];
    if (!archivos.length) return res.status(400).json({ error: "No se recibió ninguna imagen." });
    const tipo = req.body?.tipo === "tecnica" ? "tecnica" : "catalogo";
    const pisar = req.body?.pisar === "true" || req.body?.pisar === true;
    const [productos] = await db.query("SELECT id, codigo, foto_tecnica, foto_catalogo FROM productos");
    const asignadas = [];
    const omitidas = [];
    const sinMatch = [];
    const usados = new Set();
    for (const a of archivos) {
      const m = productoParaArchivo(a.originalname, productos);
      if (!m.producto) {
        sinMatch.push({ archivo: a.originalname, motivo: m.motivo });
        continue;
      }
      const p = m.producto;
      if (usados.has(p.id)) {
        sinMatch.push({ archivo: a.originalname, motivo: `ya subiste otra foto para ${p.codigo} en este lote` });
        continue;
      }
      if (p[TIPOS[tipo]] && !pisar) {
        omitidas.push({ archivo: a.originalname, codigo: p.codigo, motivo: "ya tiene foto" });
        continue;
      }
      const r = await guardar(p, tipo, a, db);
      if (r.error) {
        sinMatch.push({ archivo: a.originalname, motivo: "no es una imagen JPG, PNG o WEBP" });
        continue;
      }
      usados.add(p.id);
      asignadas.push({ archivo: a.originalname, id: p.id, codigo: p.codigo, url: r.url });
    }
    res.json({ success: true, tipo, asignadas, omitidas, sin_match: sinMatch });
  }));
}

module.exports = { tipoImagen, codigoDesdeArchivo, productoParaArchivo, registrarRutasFotos, MAX_BYTES };
