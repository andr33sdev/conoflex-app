"use strict";
// La lista de precios en PDF que se adjunta a los borradores cuando el cliente la pide.
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "datos_comercial");
const ARCHIVO = path.join(DIR, "lista_precios.pdf");
const NOMBRE_ADJUNTO = "Lista_de_Precios_Conoflex.pdf";

function leerLista() {
  try {
    return { nombre: NOMBRE_ADJUNTO, datos: fs.readFileSync(ARCHIVO) };
  } catch {
    return null;
  }
}

function estadoLista() {
  try {
    const st = fs.statSync(ARCHIVO);
    return { existe: true, bytes: st.size, actualizado: st.mtime.toISOString() };
  } catch {
    return { existe: false };
  }
}

const esPdf = (buf) => Buffer.isBuffer(buf) && buf.length > 8 && buf.slice(0, 5).toString("latin1") === "%PDF-";

function registrarRutasListaPdf(app, { multer, autenticarToken, autorizarRoles }) {
  const subir = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }).single("lista");
  const permiso = [autenticarToken, autorizarRoles("ADMIN", "COMERCIAL")];
  app.get("/api/comercial/lista-pdf", ...permiso, (req, res) => res.json(estadoLista()));
  app.post("/api/comercial/lista-pdf", ...permiso, subir, (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo." });
    if (!esPdf(req.file.buffer)) return res.status(400).json({ error: "El archivo tiene que ser un PDF." });
    try {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(ARCHIVO, req.file.buffer);
      res.json({ success: true, ...estadoLista() });
    } catch (e) {
      console.error("[comercial] lista pdf:", e.message);
      res.status(500).json({ error: "No pude guardar la lista." });
    }
  });
}

module.exports = { leerLista, estadoLista, registrarRutasListaPdf, esPdf, DIR };
