"use strict";
// Reconocer qué producto del catálogo es la foto que manda un cliente por WhatsApp.
//
// 1) Qué tipo de producto es (cono, columna, reductor...) y sus rasgos, mirando la foto con el catálogo al lado.
// 2) La foto contra las FOTOS de todos los productos de ese tipo (no contra unos pocos elegidos por texto),
//    más las fotos reales de clientes que el equipo ya confirmó para cada producto ("referencias").
//    La IA devuelve los 3 más parecidos con un porcentaje de confianza.
// 3) Solo se da por reconocido si el primero es claramente el mejor. Si no, el bot muestra las opciones y pregunta.
//
// Las alturas estimadas en una foto engañan (perspectiva): se compara por forma, proporciones, cabezal, base,
// cantidad y ancho de bandas, y texto visible.
const fs = require("fs");
const path = require("path");

let sharp = null;
try {
  sharp = require("sharp");
} catch {
  sharp = null; // sin sharp se usan las fotos tal cual (solo las chicas)
}

const MAX_OPCIONES = 36; // productos a comparar por foto
const MAX_REFERENCIAS = 2; // fotos reales por producto
const MAX_BYTES_TOTAL = 14 * 1024 * 1024; // límite de lo que se manda a la IA en un pedido
const UMBRAL = 80; // % de confianza para darlo por reconocido
const VENTAJA = 15; // y tantos puntos más que el segundo

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const norm = (c) => String(c || "").trim().toUpperCase().replace(/\s+/g, " ");
const corto = (t, n) => {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

/** Ruta en disco de una foto del catálogo (".../imagenes/x.jpg" → <dir>/x.jpg). null si no es de la app. */
function rutaImagenLocal(url, dir) {
  if (!url || !dir) return null;
  const i = String(url).indexOf("/imagenes/");
  if (i < 0) return null;
  const nombre = decodeURIComponent(String(url).slice(i + "/imagenes/".length).split(/[?#]/)[0]);
  if (!nombre || nombre.includes("..")) return null;
  return path.join(dir, nombre);
}

const cacheMinis = new Map(); // ruta → { mtime, img }

/** Foto achicada (máx. 512 px) para comparar. Se guarda en memoria mientras el archivo no cambie. */
async function miniatura(ruta) {
  const ext = path.extname(ruta).toLowerCase();
  if (!MIME[ext]) return null;
  let st;
  try {
    st = await fs.promises.stat(ruta);
  } catch {
    return null;
  }
  const c = cacheMinis.get(ruta);
  if (c && c.mtime === st.mtimeMs) return c.img;
  let img = null;
  try {
    if (sharp) {
      const buf = await sharp(ruta).rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
      img = { mimeType: "image/jpeg", data: buf.toString("base64"), bytes: buf.length };
    } else if (st.size <= 1.2 * 1024 * 1024) {
      const buf = await fs.promises.readFile(ruta);
      img = { mimeType: MIME[ext], data: buf.toString("base64"), bytes: buf.length };
    }
  } catch {
    img = null;
  }
  cacheMinis.set(ruta, { mtime: st.mtimeMs, img });
  return img;
}

/** Productos a comparar: los de las categorías elegidas (con foto o referencias), primero los candidatos. */
function elegirOpciones(productos, { categorias = [], candidatos = [] }, tieneImagen) {
  const cats = new Set(categorias.map((c) => norm(c)));
  const porCodigo = new Map(productos.map((p) => [norm(p.codigo), p]));
  const vistos = new Set();
  const out = [];
  const sumar = (p) => {
    if (!p || vistos.has(norm(p.codigo)) || !tieneImagen(p)) return;
    vistos.add(norm(p.codigo));
    out.push(p);
  };
  for (const c of candidatos) sumar(porCodigo.get(norm(c)));
  for (const p of productos) if (cats.has(norm(p.categoria))) sumar(p);
  if (out.length < 3) for (const p of productos) sumar(p); // tipo dudoso: se compara contra todo lo que tenga foto
  return out.slice(0, MAX_OPCIONES);
}

/** De las 3 opciones con confianza, ¿hay un ganador claro? */
function decidir(top) {
  const lista = (Array.isArray(top) ? top : [])
    .map((t) => ({ codigo: t?.codigo, confianza: Math.max(0, Math.min(100, Number(t?.confianza) || 0)), motivo: corto(t?.motivo, 200) }))
    .filter((t) => t.codigo)
    .sort((a, b) => b.confianza - a.confianza)
    .slice(0, 3);
  const [a, b] = lista;
  const reconocido = a && a.confianza >= UMBRAL && a.confianza - (b?.confianza || 0) >= VENTAJA ? a : null;
  return { reconocido, opciones: lista };
}

/** Texto que queda de la foto (bandeja + lo que lee el bot). */
function textoFoto({ vista, decision, productos, textoCliente }) {
  const porCodigo = new Map(productos.map((p) => [norm(p.codigo), p]));
  const nombre = (c) => {
    const p = porCodigo.get(norm(c));
    return p ? `${p.codigo} ${p.nombre}` : null;
  };
  const lineas = [`📷 Foto: ${String(vista?.descripcion || "sin descripción").trim()}`];
  const marca = String(vista?.marca || "").toUpperCase();
  if (marca === "CONOFLEX") lineas.push("Marca: es un producto Conoflex (nuestro).");
  else if (marca && marca !== "NO SE VE") lineas.push(`Marca: ${vista.marca}.`);
  if (decision?.reconocido && nombre(decision.reconocido.codigo)) {
    lineas.push(`Producto reconocido: ${nombre(decision.reconocido.codigo)} (${decision.reconocido.confianza}% seguro).`);
  } else {
    const ops = (decision?.opciones || []).filter((o) => nombre(o.codigo)).map((o) => `${nombre(o.codigo)} (${o.confianza}%)`);
    if (ops.length) lineas.push(`No es seguro. Opciones más parecidas: ${ops.join(" · ")}.`);
  }
  if (textoCliente) lineas.push(`Texto del cliente: ${textoCliente}`);
  return lineas.join("\n");
}

function catalogoCorto(productos) {
  return productos.map((p) => [p.codigo, p.nombre, p.categoria, p.medidas && corto(p.medidas, 70)].filter(Boolean).join(" | ")).join("\n");
}

const parsear = (t) => {
  const s = String(t || "").replace(/^```json|^```|```$/gim, "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const m = /\{[\s\S]*\}/.exec(s);
    try {
      return m ? JSON.parse(m[0]) : null;
    } catch {
      return null;
    }
  }
};

/**
 * media: { mimeType, data } (la foto del cliente)
 * referencias: Map(codigo → [rutas de fotos reales confirmadas])
 */
async function reconocer({ ai, modelo, media, textoCliente, productos, imagenesDir, referencias = new Map() }) {
  const categorias = [...new Set(productos.map((p) => p.categoria).filter(Boolean))];
  // Paso 1: tipo de producto y rasgos.
  const r1 = await ai.models.generateContent({
    model: modelo,
    contents: [
      { inlineData: media },
      `Sos experto en los productos de Conoflex, fábrica argentina de seguridad vial. Un cliente mandó esta foto por WhatsApp${textoCliente ? ` con el texto: "${textoCliente}"` : ""}.
1) Describí el producto en 2 oraciones: tipo, color, forma del cuerpo, cabezal o asa, tipo de base, cantidad y ancho de bandas reflectivas, texto visible. NO estimes la altura en centímetros: en una foto engaña. Describí proporciones (por ejemplo "alto y delgado", "la base es ancha respecto del cuerpo").
2) Marca: los productos Conoflex llevan el logo CONOFLEX en relieve, que en fotos suele leerse mal (ONDIFLEX, CONOPLEX...). Si se parece, poné "CONOFLEX"; si se lee claramente otra marca, esa; si no se ve, "NO SE VE".
3) De estas CATEGORÍAS elegí las que pueden corresponder (1 a 3): ${categorias.join(" · ")}
4) Del CATÁLOGO, hasta 10 códigos que podrían ser, por tipo y nombre del modelo.
Respondé solo JSON: {"descripcion": "...", "marca": "...", "categorias": ["..."], "candidatos": ["codigo", ...]}

CATÁLOGO (código | nombre | categoría | medidas)
${catalogoCorto(productos)}`,
    ],
    config: { temperature: 0, responseMimeType: "application/json" },
  });
  const vista = parsear(r1.text) || { descripcion: corto(r1.text, 400), categorias: [], candidatos: [] };

  // Paso 2: la foto contra las fotos de todos los productos de ese tipo.
  const fotoDe = (p) => rutaImagenLocal(p.foto_catalogo || p.foto_tecnica, imagenesDir);
  const opciones = elegirOpciones(productos, { categorias: vista.categorias || [], candidatos: vista.candidatos || [] }, (p) => !!fotoDe(p) || (referencias.get(norm(p.codigo)) || []).length > 0);
  const partes = [{ text: "FOTO DEL CLIENTE:" }, { inlineData: media }];
  let bytes = 0;
  let incluidas = 0;
  for (const p of opciones) {
    const fotos = [];
    const cat = fotoDe(p) && (await miniatura(fotoDe(p)));
    if (cat) fotos.push({ etiqueta: "foto de catálogo", img: cat });
    for (const r of (referencias.get(norm(p.codigo)) || []).slice(0, MAX_REFERENCIAS)) {
      const m = await miniatura(r);
      if (m) fotos.push({ etiqueta: "foto real de un cliente, confirmada", img: m });
    }
    const peso = fotos.reduce((s, f) => s + f.img.bytes, 0);
    if (!fotos.length || bytes + peso > MAX_BYTES_TOTAL) continue;
    bytes += peso;
    incluidas++;
    partes.push({ text: `PRODUCTO ${p.codigo} — ${p.nombre}${p.medidas ? ` — medidas: ${corto(p.medidas, 90)}` : ""}` });
    for (const f of fotos) partes.push({ text: `(${f.etiqueta})` }, { inlineData: { mimeType: f.img.mimeType, data: f.img.data } });
  }
  if (!incluidas) return { vista, decision: decidir((vista.candidatos || []).slice(0, 3).map((c) => ({ codigo: c, confianza: 30 }))) };
  partes.push({
    text: `Compará la FOTO DEL CLIENTE con cada PRODUCTO. Fijate en: forma del cuerpo y proporciones, cabezal (forma del asa o pasacadenas), tipo y forma de la base, cantidad y ancho de las bandas reflectivas, si es rígido o flexible, texto o relieves. Las medidas escritas son reales; la altura que parece tener en la foto no es confiable. Las "fotos reales de un cliente, confirmadas" son ejemplos verdaderos de ese producto.
Devolvé los 3 productos más parecidos con un porcentaje de confianza (0 a 100). Sé exigente: más de 80 solo si los rasgos coinciden de verdad.
Respondé solo JSON: {"top": [{"codigo": "...", "confianza": 0, "motivo": "..."}]}`,
  });
  const r2 = await ai.models.generateContent({ model: modelo, contents: [{ role: "user", parts: partes }], config: { temperature: 0, responseMimeType: "application/json" } });
  const decision = decidir(parsear(r2.text)?.top);
  return { vista, decision };
}

module.exports = { UMBRAL, VENTAJA, rutaImagenLocal, miniatura, elegirOpciones, decidir, textoFoto, reconocer };
