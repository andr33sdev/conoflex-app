const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const F = require("../fotosCatalogo");
const w = require("../whatsapp");

const productos = [
  { codigo: "2301CS", nombre: "Obrador Classic", categoria: "Conos", medidas: "120 cm", foto_catalogo: "http://x/imagenes/obrador.jpg" },
  { codigo: "2300-2R", nombre: "Vencedor", categoria: "Conos", medidas: "120 cm", foto_catalogo: "http://x/imagenes/vencedor.jpg" },
  { codigo: "2071LE-2R", nombre: "Econo Semiflexible", categoria: "Conos", medidas: "70 cm", foto_catalogo: "http://x/imagenes/econo.jpg" },
  { codigo: "2853-3R", nombre: "Columna con base", categoria: "Columnas", foto_catalogo: "http://x/imagenes/columna.jpg" },
  { codigo: "SINFOTO", nombre: "Sin foto", categoria: "Conos" },
];

test("solo se da por reconocido si el primero es claramente el mejor", () => {
  assert.equal(F.decidir([{ codigo: "A", confianza: 92 }, { codigo: "B", confianza: 60 }]).reconocido.codigo, "A");
  assert.equal(F.decidir([{ codigo: "A", confianza: 85 }, { codigo: "B", confianza: 80 }]).reconocido, null); // muy parejo
  assert.equal(F.decidir([{ codigo: "A", confianza: 70 }]).reconocido, null); // poca confianza
  assert.deepEqual(F.decidir([{ codigo: "B", confianza: 50 }, { codigo: "A", confianza: 140 }, { codigo: null }]).opciones.map((o) => [o.codigo, o.confianza]), [["A", 100], ["B", 50]]);
});

test("se compara contra todos los productos del tipo, no contra unos pocos", () => {
  const conFoto = (p) => !!p.foto_catalogo;
  const o = F.elegirOpciones(productos, { categorias: ["conos"], candidatos: ["2071LE-2R"] }, conFoto);
  assert.deepEqual(o.map((p) => p.codigo), ["2071LE-2R", "2301CS", "2300-2R"]); // el candidato primero, después todos los conos con foto
  // Tipo dudoso (pocas opciones): se suma todo lo que tenga foto.
  assert.equal(F.elegirOpciones(productos, { categorias: ["Reductores"] }, conFoto).length, 4);
});

test("texto de la foto: reconocido o con opciones para preguntar", () => {
  const vista = { descripcion: "Cono naranja con cabezal pasacadenas", marca: "CONOFLEX" };
  assert.equal(
    F.textoFoto({ vista, decision: { reconocido: { codigo: "2301cs", confianza: 91 } }, productos, textoCliente: "busco este" }),
    "📷 Foto: Cono naranja con cabezal pasacadenas\nMarca: es un producto Conoflex (nuestro).\nProducto reconocido: 2301CS Obrador Classic (91% seguro).\nTexto del cliente: busco este",
  );
  assert.equal(
    F.textoFoto({ vista: { descripcion: "x", marca: "NO SE VE" }, decision: { reconocido: null, opciones: [{ codigo: "2301CS", confianza: 70 }, { codigo: "2300-2R", confianza: 65 }] }, productos }),
    "📷 Foto: x\nNo es seguro. Opciones más parecidas: 2301CS Obrador Classic (70%) · 2300-2R Vencedor (65%).",
  );
});

test("ruta segura a las fotos del catálogo", () => {
  assert.equal(F.rutaImagenLocal("http://66.97.34.163:3001/imagenes/cono%20obrador.jpg", "/app/imagenes"), "/app/imagenes/cono obrador.jpg");
  assert.equal(F.rutaImagenLocal("http://x/imagenes/../../etc/passwd", "/app/imagenes"), null);
});

test("miniatura: achica las fotos grandes", async () => {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mini-"));
  const ruta = path.join(dir, "grande.png");
  await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#ff5a00" } }).png().toFile(ruta);
  const m = await F.miniatura(ruta);
  const meta = await sharp(Buffer.from(m.data, "base64")).metadata();
  assert.equal(meta.width, 512);
  assert.equal(m.mimeType, "image/jpeg");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("con base: se equivoca, el equipo confirma el producto y la próxima vez lo usa como referencia", async () => {
  let mysql;
  let sharp;
  try {
    mysql = require("mysql2/promise");
    sharp = require("sharp");
  } catch {
    return;
  }
  const db = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
  try {
    await db.query("SELECT 1");
  } catch {
    await db.end().catch(() => {});
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wa-"));
  const imagenesDir = path.join(tmp, "imagenes");
  const fotosDir = path.join(tmp, "fotos");
  fs.mkdirSync(imagenesDir);
  for (const [n, color] of [["obrador", "#f60"], ["vencedor", "#f70"], ["econo", "#f80"], ["columna", "#f90"]]) await sharp({ create: { width: 600, height: 900, channels: 3, background: color } }).jpeg().toFile(path.join(imagenesDir, `${n}.jpg`));
  const fotoCliente = (await sharp({ create: { width: 900, height: 1600, channels: 3, background: "#f61" } }).jpeg().toBuffer()).toString("base64");
  const fetchOriginal = global.fetch;
  try {
    for (const t of ["wa_fotos_referencia", "wa_mensajes", "wa_conversaciones", "wa_correcciones", "reglas", "productos"]) await db.query(`DROP TABLE IF EXISTS ${t}`);
    await db.query("CREATE TABLE reglas (clave VARCHAR(255) PRIMARY KEY, valor TEXT)");
    await db.query("CREATE TABLE productos (codigo VARCHAR(50), nombre VARCHAR(255), categoria VARCHAR(100), medidas TEXT, precio_lista TEXT, aplicacion TEXT, descripcion TEXT, usos_recomendados TEXT, advertencias TEXT, foto_catalogo TEXT, foto_tecnica TEXT)");
    for (const p of productos.slice(0, 4)) await db.query("INSERT INTO productos (codigo, nombre, categoria, medidas, precio_lista, foto_catalogo) VALUES (?,?,?,?,?,?)", [p.codigo, p.nombre, p.categoria, p.medidas || null, "$1", p.foto_catalogo.replace("http://x", "http://66.97.34.163:3001")]);
    await w.asegurarTablasWhatsapp(db);
    process.env.WHATSAPP_TOKEN = "t";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1";
    const enviadas = [];
    global.fetch = async (url, opts = {}) => {
      const json = (o) => ({ ok: true, status: 200, json: async () => o, arrayBuffer: async () => Buffer.from(fotoCliente, "base64"), headers: { get: () => "image/jpeg" } });
      if (String(url).endsWith("/messages")) {
        const b = JSON.parse(opts.body);
        if (b.type) enviadas.push(b.type === "text" ? b.text.body : `[foto ${b.image?.caption}]`);
        return json({ messages: [{ id: `wamid.${Math.random()}` }] });
      }
      return json({ url: "https://lookaside/x", mime_type: "image/jpeg" });
    };
    const comparaciones = [];
    const ai = {
      models: {
        generateContent: async (p) => {
          if (Array.isArray(p.contents) && p.contents[0]?.inlineData) {
            return { text: JSON.stringify({ descripcion: "Cono naranja con cabezal pasacadenas y base", marca: "CONOFLEX", categorias: ["Conos"], candidatos: ["2071LE-2R"] }) };
          }
          const partes = p.contents?.[0]?.parts;
          if (partes?.some((x) => x.inlineData)) {
            const textos = partes.filter((x) => x.text).map((x) => x.text);
            comparaciones.push(textos);
            const conReferencia = textos.some((t) => t.includes("foto real de un cliente"));
            // Sin referencias duda entre los conos de 120 cm; con la foto real confirmada, reconoce el Obrador.
            const top = conReferencia ? [{ codigo: "2301CS", confianza: 95 }, { codigo: "2300-2R", confianza: 55 }] : [{ codigo: "2300-2R", confianza: 72 }, { codigo: "2301CS", confianza: 70 }, { codigo: "2071LE-2R", confianza: 20 }];
            return { text: JSON.stringify({ top }) };
          }
          const ultimo = p.contents.at(-1).parts[0].text;
          if (/No es seguro/.test(ultimo)) return { text: JSON.stringify({ respuesta: "¿Es alguno de estos?", fotos: ["2300-2R", "2301CS"] }) };
          return { text: JSON.stringify({ respuesta: "Es nuestro Obrador Classic" }) };
        },
      },
    };
    const bot = w.crearBotWhatsapp({ db, ai, leerLista: () => null, notasTexto: async () => "", imagenesDir, fotosDir });
    const espera = (ms) => new Promise((r) => setTimeout(r, ms));

    // 1) Primera foto: no está seguro → muestra opciones y pregunta.
    await bot.recibir({ waId: "f1", telefono: "549333", nombre: "Jefa", tipo: "image", mediaId: "m1", mime: "image/jpeg", texto: "Estoy buscando este producto" });
    await espera(3400);
    const opciones = comparaciones[0].filter((t) => t.startsWith("PRODUCTO")).map((t) => t.split(" — ")[0]);
    assert.deepEqual(opciones, ["PRODUCTO 2071LE-2R", "PRODUCTO 2301CS", "PRODUCTO 2300-2R"]); // todos los conos con foto, no la columna
    const [[m1]] = await db.query("SELECT id, texto, media_archivo FROM wa_mensajes WHERE direccion = 'IN'");
    assert.match(m1.texto, /No es seguro\. Opciones más parecidas: 2300-2R Vencedor \(72%\) · 2301CS Obrador Classic \(70%\)/);
    assert.ok(fs.existsSync(path.join(fotosDir, m1.media_archivo))); // la foto del cliente quedó guardada
    assert.deepEqual(enviadas, ["¿Es alguno de estos?", "[foto Vencedor]", "[foto Obrador Classic]"]);

    // 2) El equipo marca que era el 2301CS → queda como foto de referencia.
    await db.query("INSERT INTO wa_fotos_referencia (codigo, archivo, mensaje_id) VALUES ('2301CS', ?, ?)", [m1.media_archivo, m1.id]);

    // 3) Otra foto del mismo producto: ahora compara también contra esa foto real y lo reconoce.
    await bot.recibir({ waId: "f2", telefono: "549444", nombre: "Otro", tipo: "image", mediaId: "m2", mime: "image/jpeg", texto: null });
    await espera(3400);
    assert.ok(comparaciones[1].includes("(foto real de un cliente, confirmada)"));
    const [[m2]] = await db.query("SELECT texto FROM wa_mensajes WHERE direccion = 'IN' ORDER BY id DESC LIMIT 1");
    assert.match(m2.texto, /Producto reconocido: 2301CS Obrador Classic \(95% seguro\)/);
  } finally {
    global.fetch = fetchOriginal;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    fs.rmSync(tmp, { recursive: true, force: true });
    await db.end();
  }
});
