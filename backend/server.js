const cheerio = require("cheerio");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const mysql = require("mysql2/promise");
const xlsx = require("xlsx");
const { google } = require("googleapis");
const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { crearConnie } = require("./connie");
const { demandaMateriasPrimas } = require("./demanda");
const { separarDuplicadas, asegurarTablaDuplicadas } = require("./fichero");
const { asegurarTablasProduccion, registrarRutasProduccion } = require("./produccionRutas");
const { asegurarTablaReflectivas, registrarRutasReflectivas } = require("./reflectivasRutas");
const { asegurarTablasIngenieria, registrarRutasIngenieria } = require("./ingenieriasRutas");
const { asegurarTablasNotificaciones, crearNotificacion, registrarRutasNotificaciones } = require("./notificaciones");
const { asegurarTablaMovimientos, moverStock, historialMateriaPrima } = require("./stockMovimientos");
const { asegurarComprasStock, buscarMateriaPrima, aplicarRecepcion, norm } = require("./comprasStock");
const { asegurarColumnaPagoMensual } = require("./escala");
const { migrarPermisoConnie } = require("./permisos");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error(
    "FATAL: falta la variable de entorno JWT_SECRET. Definila en el .env (local) o en el panel del hosting antes de iniciar el servidor.",
  );
  process.exit(1);
}

// Configuración de la base de datos MySQL en Ferozo / Local
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Pool PROPIO de Connie: sus ajustes de sesión (límites de tiempo/filas) no se
// mezclan con el resto de la app. Si definís CONNIE_DB_USER / CONNIE_DB_PASSWORD
// (un usuario MySQL con permiso SOLO de lectura) lo usa; si no, usa el usuario
// normal (las protecciones por software y de transacción READ ONLY siguen activas).
const dbConnie = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.CONNIE_DB_USER || process.env.DB_USER,
  password: process.env.CONNIE_DB_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 3,
  queueLimit: 0,
  dateStrings: true, // fechas como "2026-10-29" (sin corrimientos de zona horaria)
  decimalNumbers: true, // DECIMAL como número, no como texto
});

// URL Dinámica para Frontend (Local vs Producción)
const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  (process.env.BASE_URL && process.env.BASE_URL.includes("onrender")
    ? "https://conoflex-app.vercel.app"
    : "http://localhost:5173");

// Directorios físicos para imágenes y archivos temporales
const IMAGENES_DIR = path.join(__dirname, "public/imagenes");
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(IMAGENES_DIR))
  fs.mkdirSync(IMAGENES_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Las imágenes de productos se muestran en <img> (no pueden enviar token): públicas.
// /uploads (archivos temporales de importación) ya NO se sirve públicamente.
app.use("/imagenes", express.static(IMAGENES_DIR));

// ---------------------------------------------------------------------------
// AUTENTICACIÓN: todas las rutas exigen un JWT válido salvo las públicas.
// ---------------------------------------------------------------------------
const RUTAS_PUBLICAS = [
  // Login
  { method: "POST", path: "/api/auth/login" },
  // Flujo OAuth de Google (son redirecciones del navegador, no llevan token)
  { method: "GET", path: "/auth/google" },
  { method: "GET", path: "/auth/google/callback" },
];
// Firma de solicitudes de compra desde el link de WhatsApp (sin sesión)
const PREFIJOS_PUBLICOS = ["/api/public/"];

// El script del reloj (corre en una PC, sin usuario) se identifica con un
// token propio, solo válido para estas dos rutas. Se define en el .env con
// FICHERO_SYNC_TOKEN; si no está definido, estas rutas exigen JWT como todas.
const RUTAS_SYNC_FICHERO = [
  { method: "GET", path: "/api/fichero/ultimo" },
  { method: "POST", path: "/api/fichero/sync" },
];
function esSyncFicheroValido(req) {
  const esperado = process.env.FICHERO_SYNC_TOKEN;
  const recibido = req.headers["x-sync-token"];
  if (!esperado || esperado.length < 16 || typeof recibido !== "string") return false;
  if (!RUTAS_SYNC_FICHERO.some((r) => r.method === req.method && r.path === req.path)) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAuth(req, res, next) {
  if (req.method === "OPTIONS") return next();
  if (esSyncFicheroValido(req)) return next();

  const esPublica =
    RUTAS_PUBLICAS.some((r) => r.method === req.method && r.path === req.path) ||
    PREFIJOS_PUBLICOS.some((p) => req.path.startsWith(p));
  if (esPublica) return next();

  const [esquema, token] = (req.headers.authorization || "").split(" ");
  // `codigo` permite al frontend distinguir "tu sesión no es válida" de otros
  // 401 propios de rutas (ej: Gmail no conectado en /api/mails).
  if (esquema !== "Bearer" || !token) {
    return res
      .status(401)
      .json({ error: "Sesión no iniciada.", codigo: "SESION_INVALIDA" });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    next();
  } catch (e) {
    return res
      .status(401)
      .json({ error: "Sesión inválida o vencida.", codigo: "SESION_INVALIDA" });
  }
}

// El rol se consulta en la base (no en el token): como los tokens no vencen,
// si a alguien le quitan el rol ADMIN pierde el acceso de inmediato.
async function requireAdmin(req, res, next) {
  try {
    const [rows] = await db.query("SELECT rol FROM usuarios WHERE id = ?", [
      req.user?.id,
    ]);
    if (String(rows[0]?.rol || "").toUpperCase() !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "Solo un administrador puede realizar esta acción." });
    }
    next();
  } catch (error) {
    console.error("Error verificando rol de administrador:", error);
    res.status(500).json({ error: "No se pudo verificar el rol." });
  }
}

// Acceso a un módulo: ADMIN siempre; el resto solo si su rol tiene ese módulo
// asignado en permisos_roles (mismo criterio que usa el login para el menú).
function requirePermiso(moduloId) {
  return async (req, res, next) => {
    try {
      const [usuarios] = await db.query("SELECT rol FROM usuarios WHERE id = ?", [
        req.user?.id,
      ]);
      const rol = usuarios[0]?.rol;
      if (String(rol || "").toUpperCase() === "ADMIN") return next();
      if (rol) {
        const [permisos] = await db.query(
          "SELECT 1 FROM permisos_roles WHERE rol_nombre = ? AND (modulo_id = ? OR modulo_id = '*') LIMIT 1",
          [rol, moduloId],
        );
        if (permisos.length) return next();
      }
      return res
        .status(403)
        .json({ error: "Tu rol no tiene acceso a este módulo." });
    } catch (error) {
      console.error("Error verificando permiso de módulo:", error);
      res.status(500).json({ error: "No se pudo verificar el permiso." });
    }
  };
}

app.use(requireAuth);

// Plan de producción semanal, turnos y carga desde la tablet de planta.
registrarRutasProduccion(app, db, requirePermiso);
registrarRutasReflectivas(app, db, requirePermiso, requireAdmin);
registrarRutasIngenieria(app, db, requirePermiso, requireAdmin);
registrarRutasNotificaciones(app, db);

// Multer Config
const uploadTemp = multer({ dest: UPLOADS_DIR });
const storageFotos = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGENES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `prod_${req.params.id}_${req.body.tipo || "foto"}_${Date.now()}${ext}`;
    cb(null, uniqueName);
  },
});
const uploadFoto = multer({ storage: storageFotos });

// ==========================================
// 🔗 CONFIGURACIÓN DE URLS DE GOOGLE SHEETS
// ==========================================
const VENTAS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_RUM1ExdkHAoOJmx_r-pPqH2VBa0Gto2AbfMZYQpoBJbXm7QskhW4F1ZvDbKnXYjaIED7GLBA5-Fd/pub?gid=2026958942&single=true&output=csv";

const STOCK_URLS = {
  stock_33:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS8kk1oZNfS1AOk6Ylu_rE6uNDdi7BJQBkMFKACCH_dRFpeIsJW8ii5QCdhyKQbSyCaQciC2GgVKLBR/pub?gid=1240979540&single=true&output=csv",
  stock_26:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS8kk1oZNfS1AOk6Ylu_rE6uNDdi7BJQBkMFKACCH_dRFpeIsJW8ii5QCdhyKQbSyCaQciC2GgVKLBR/pub?gid=1229097956&single=true&output=csv",
  stock_ayolas:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS8kk1oZNfS1AOk6Ylu_rE6uNDdi7BJQBkMFKACCH_dRFpeIsJW8ii5QCdhyKQbSyCaQciC2GgVKLBR/pub?gid=1103232715&single=true&output=csv",
  stock_37:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS8kk1oZNfS1AOk6Ylu_rE6uNDdi7BJQBkMFKACCH_dRFpeIsJW8ii5QCdhyKQbSyCaQciC2GgVKLBR/pub?gid=1269910757&single=true&output=csv",
};

const PRODUCCION_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTjGR3uoF0y5zooNuJEVUpGCVWyGr0Y6_HIMi-xtQgQOlIIHcru5zG6z_jUfrNU_XAFLD7FfLYu7HyY/pub?gid=0&single=true&output=csv";

const EXCLUDED_CODES = [
  "CODIGO",
  "ARTICULO",
  "DESCRIPCION",
  "STOCK",
  "ENTRADA",
  "SALIDA",
  "STOCK GENERAL",
  "STOCK ARTICULOS 33",
  "STOCK ARTICULOS 26",
  "STOCK ARTICULOS AYOLAS",
  "STOCK ARTICULOS 37",
  "EXPEDICION PEREZ QUINTANA",
  "RESPONSABLE:",
  "CONOS",
  "PARAGUAY",
  "MICRONIZADOS",
  "INSUMOS",
  "MASTERBATCHES",
];

// Configuración de Google OAuth & Gemini AI
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const TOKEN_PATH = path.join(__dirname, "token.json");
const TOKEN_PATH_WEB = path.join(__dirname, "tokens_web.json");

if (process.env.GOOGLE_REFRESH_TOKEN) {
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
  console.log(
    "✅ Credenciales de Google API cargadas desde variables de entorno.",
  );
} else if (fs.existsSync(TOKEN_PATH)) {
  oauth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
  console.log("✅ Credenciales de Google API cargadas desde token.json.");
} else if (fs.existsSync(TOKEN_PATH_WEB)) {
  oauth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH_WEB)));
  console.log("✅ Credenciales de Google API cargadas desde tokens_web.json.");
}

function crearRawEmail(to, subject, htmlBody, threadId) {
  const emailLines = [
    `To: ${to}`,
    "Content-Type: text/html; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: Re: ${subject.replace(/^Re:\s*/i, "")}`,
    "",
    htmlBody,
  ];
  const emailStr = emailLines.join("\r\n");
  const base64Encoded = Buffer.from(emailStr)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const requestBody = { message: { raw: base64Encoded } };
  if (threadId) requestBody.message.threadId = threadId;
  return requestBody;
}

// EXTRAER NÚMEROS DE PRECIO (FORMATO Y LIMPIEZA)
function extractNumberFromVal(vVal) {
  if (vVal === null || vVal === undefined) return null;
  if (typeof vVal === "number") return vVal;
  if (typeof vVal === "string") {
    let s = vVal
      .replace(/\$/g, "")
      .replace(/ /g, "")
      .replace(/\xa0/g, "")
      .replace(/\t/g, "")
      .trim();
    if (/^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$/.test(s)) {
      let sClean = s.replace(/\./g, "").replace(",", ".");
      let n = parseFloat(sClean);
      if (!isNaN(n)) return n;
    } else if (/^\d+(?:\.\d{1,2})?$/.test(s)) {
      let n = parseFloat(s);
      if (!isNaN(n)) return n;
    } else if (/^\d+(?:,\d{1,2})?$/.test(s)) {
      let n = parseFloat(s.replace(",", "."));
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

// ALGORITMO DE EXTRACCIÓN DE TARJETAS EXCEL EN NODE.JS
function procesarExcelTarjetas(filePath) {
  const workbook = xlsx.readFile(filePath);
  let totalProductos = 0;
  let lineasResultado = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) continue;

    const range = xlsx.utils.decode_range(sheet["!ref"]);
    const maxR = range.e.r + 1;
    const maxC = range.e.c + 1;

    const getVal = (r, c) => {
      if (r < 1 || r > maxR || c < 1 || c > maxC) return null;
      const addr = xlsx.utils.encode_cell({ r: r - 1, c: c - 1 });
      const cell = sheet[addr];
      if (!cell || cell.v === undefined || cell.v === null) return null;
      return cell.v;
    };

    for (let r = 1; r <= maxR; r++) {
      for (let c = 1; c <= maxC; c++) {
        const val = getVal(r, c);
        if (!val) continue;

        const valStr = String(val).trim();
        const match = valStr.match(/Cód(?:igo|\.)?:?\s*(.+)/i);

        if (match) {
          let codigo = match[1].trim();

          if (!codigo || ["none", "nan"].includes(codigo.toLowerCase()))
            continue;
          if (
            codigo.length > 25 ||
            [
              "tipo de",
              "fijación",
              "ejemplo",
              "envío",
              "gratis",
              "página",
              "pág",
            ].some((gb) => codigo.toLowerCase().includes(gb))
          ) {
            continue;
          }

          // TÍTULO DEL PRODUCTO
          const tVal = getVal(r + 1, c);
          let titleParts = tVal
            ? [String(tVal).replace(/\n/g, " ").trim()]
            : [];

          const tVal2 = getVal(r + 2, c);
          if (tVal2 && typeof tVal2 === "string") {
            const tV2Str = String(tVal2).replace(/\n/g, " ").trim();
            if (
              [
                "PREMIUM",
                "ESTANDAR",
                "LINEA",
                "LOMO",
                "MACIZO",
                "PUNTERA",
              ].some((kw) => tV2Str.toUpperCase().includes(kw))
            ) {
              if (!extractNumberFromVal(tVal2)) {
                titleParts.push(tV2Str);
              }
            }
          }

          const titleStr = titleParts.join(" ").trim();

          // LÍMITE STRICTO DE TARJETA: 5 COLUMNAS Y 12 FILAS
          const maxColCard = Math.min(c + 4, maxC);
          let specs = [];
          let pricePairs = [];
          const maxRowCard = Math.min(r + 13, maxR);

          for (let pr = r + 2; pr <= maxRowCard; pr++) {
            let rowCells = [];
            let stopCard = false;

            for (let cc = c; cc <= maxColCard; cc++) {
              const cellV = getVal(pr, cc);
              if (cellV !== null && String(cellV).trim() !== "") {
                const vClean = String(cellV).trim();
                if (pr > r + 1 && /Cód(?:igo|\.)?:/i.test(vClean)) {
                  stopCard = true;
                  break;
                }
                rowCells.push({ col: cc, strV: vClean, rawV: cellV });
              }
            }

            if (stopCard) break;
            if (rowCells.length === 0) continue;

            let rowPrices = [];
            let labelsInRow = [];

            for (const item of rowCells) {
              const { strV, rawV } = item;
              if (
                [
                  "envío gratis",
                  "filtro uv",
                  "fabricados con",
                  "agregar al código",
                  "pág",
                  "página",
                ].some((gb) => strV.toLowerCase().includes(gb))
              ) {
                continue;
              }

              const num = extractNumberFromVal(rawV);
              if (num !== null && num >= 500) {
                rowPrices.push(num);
              } else {
                if (
                  !strV.startsWith("$") &&
                  strV.length > 1 &&
                  !strV.toLowerCase().startsWith("cód")
                ) {
                  if (
                    [
                      "SIN",
                      "CON",
                      "HORMIGÓN",
                      "ASFALTO",
                      "FIJACIÓN",
                      "LE",
                      "P",
                      "H",
                      "A",
                    ].some((k) => strV.toUpperCase().includes(k))
                  ) {
                    if (
                      ![
                        "Conformado:",
                        "Base:",
                        "Reflectivo:",
                        "Peso",
                        "Altura:",
                        "Pisada:",
                        "Ancho:",
                        "Pasacables",
                        "MEDIDAS:",
                      ].some((k) => strV.includes(k))
                    ) {
                      labelsInRow.push(strV.replace(/\n/g, " "));
                    }
                  }
                }
              }
            }

            if (rowPrices.length > 0) {
              const maxPrice = Math.max(...rowPrices);
              const parts = maxPrice.toFixed(2).split(".");
              const integerPart = parts[0].replace(
                /\B(?=(\d{3})+(?!\d))/g,
                ".",
              );
              const formattedPrice = `$${integerPart},${parts[1]}`;

              const labelStr = labelsInRow.length > 0 ? labelsInRow[0] : "";
              const pair = labelStr
                ? `${labelStr}: ${formattedPrice}`
                : formattedPrice;

              if (!pricePairs.includes(pair)) {
                pricePairs.push(pair);
              }
            } else {
              for (const item of rowCells) {
                const { strV, rawV } = item;
                if (typeof rawV === "number") continue;
                if (
                  strV.startsWith("$") ||
                  strV.toLowerCase().startsWith("cód")
                )
                  continue;
                if (
                  titleParts.includes(strV) ||
                  ["PREMIUM", "ESTANDAR", "PRECIO"].some((kw) =>
                    strV.toUpperCase().includes(kw),
                  )
                ) {
                  continue;
                }
                if (
                  [
                    "envío gratis",
                    "filtro uv",
                    "fabricados con",
                    "agregar al código",
                    "pág",
                    "página",
                  ].some((gb) => strV.toLowerCase().includes(gb))
                ) {
                  continue;
                }
                if (
                  ["SIN FIJACIÓN", "HORMIGÓN", "ASFALTO"].some((k) =>
                    strV.toUpperCase().includes(k),
                  )
                ) {
                  continue;
                }
                if (!specs.includes(strV)) {
                  specs.push(strV.replace(/\n/g, " "));
                }
              }
            }
          }

          const specText = specs.length > 0 ? specs.join(" | ") : "-";
          const priceText =
            pricePairs.length > 0 ? pricePairs.join(" | ") : "-";

          lineasResultado.push(`Cód: ${codigo}`);
          lineasResultado.push(`Nombre: ${titleStr}`);
          lineasResultado.push(`Medidas: ${specText}`);
          lineasResultado.push(`Precio Lista: ${priceText}`);
          lineasResultado.push(`Especificación: ${specText}`);
          lineasResultado.push(`----------------------------------------`);

          totalProductos++;
        }
      }
    }
  }

  return { totalProductos, textoFormateado: lineasResultado.join("\n") + "\n" };
}

// ==========================================
// INICIALIZACIÓN Y TABLAS MYSQL
// ==========================================
async function initDB() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        rol VARCHAR(50) NOT NULL DEFAULT 'COMERCIAL',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS reglas (
        clave VARCHAR(255) PRIMARY KEY,
        valor TEXT
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo VARCHAR(255),
        nombre VARCHAR(255),
        medidas VARCHAR(255),
        precio_lista VARCHAR(255),
        especificacion TEXT,
        aplicacion TEXT,
        foto_tecnica TEXT,
        foto_catalogo TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS materias_primas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo VARCHAR(255) UNIQUE NOT NULL,
        nombre VARCHAR(255) NOT NULL,
        unidad_medida VARCHAR(50) DEFAULT 'Unidades',
        stock_actual DOUBLE DEFAULT 0.00,
        orden INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS configuraciones_pegado (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) UNIQUE NOT NULL,
        reflectiva VARCHAR(255) DEFAULT 'NINGUNA',
        protector_orajet INT DEFAULT 0,
        aplicacion_protector VARCHAR(255) DEFAULT 'NINGUNA',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS semielaborados (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo VARCHAR(255) UNIQUE NOT NULL,
        nombre VARCHAR(255) NOT NULL,
        unidad_medida VARCHAR(50) DEFAULT 'Unidades',
        stock_33 DOUBLE DEFAULT 0.00,
        stock_26 DOUBLE DEFAULT 0.00,
        stock_ayolas DOUBLE DEFAULT 0.00,
        stock_37 DOUBLE DEFAULT 0.00,
        orden INT DEFAULT 0,
        configuracion_pegado_id INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (configuracion_pegado_id) REFERENCES configuraciones_pegado (id) ON DELETE SET NULL
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS productos_terminados (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo VARCHAR(255) UNIQUE NOT NULL,
        nombre VARCHAR(255) NOT NULL,
        promedio_ventas_mensual DOUBLE DEFAULT 0.00,
        orden INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ingenierias (
        id INT AUTO_INCREMENT PRIMARY KEY,
        semielaborado_id INT,
        producto_terminado_id INT,
        nombre_version VARCHAR(255) NOT NULL,
        es_activa INT DEFAULT 1,
        updated_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (semielaborado_id) REFERENCES semielaborados (id) ON DELETE CASCADE,
        FOREIGN KEY (producto_terminado_id) REFERENCES productos_terminados (id) ON DELETE CASCADE
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ingenieria_detalles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ingenieria_id INT NOT NULL,
        materia_prima_id INT,
        semielaborado_id INT,
        cantidad DOUBLE NOT NULL,
        unidad_medida VARCHAR(50) DEFAULT 'Unidades',
        FOREIGN KEY (ingenieria_id) REFERENCES ingenierias (id) ON DELETE CASCADE,
        FOREIGN KEY (materia_prima_id) REFERENCES materias_primas (id) ON DELETE CASCADE,
        FOREIGN KEY (semielaborado_id) REFERENCES semielaborados (id) ON DELETE CASCADE
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS registro_produccion (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fecha VARCHAR(50),
        categoria_maq VARCHAR(255),
        codigo_ot VARCHAR(255),
        codigo VARCHAR(255),
        articulo VARCHAR(255),
        cant_buenos DOUBLE DEFAULT 0,
        segunda_calidad DOUBLE DEFAULT 0,
        cant_fallas DOUBLE DEFAULT 0,
        kg_total DOUBLE DEFAULT 0,
        kg_fallas DOUBLE DEFAULT 0,
        ingenieria_id INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS cargas_produccion (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo_ot VARCHAR(255) NOT NULL,
        semielaborado_codigo VARCHAR(255) NOT NULL,
        articulo VARCHAR(255),
        cant_buenos DOUBLE DEFAULT 0,
        cant_fallas DOUBLE DEFAULT 0,
        fecha VARCHAR(50),
        operario_nombre VARCHAR(255),
        supervisor_nombre VARCHAR(255),
        observaciones TEXT,
        estado_aprobacion VARCHAR(50) DEFAULT 'PENDIENTE',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS grupos_alerta (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        dias_critico INT NOT NULL DEFAULT 5,
        dias_alerta INT NOT NULL DEFAULT 15,
        es_predeterminado INT DEFAULT 0
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ordenes_trabajo (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo_ot VARCHAR(255) NOT NULL,
        semielaborado_codigo VARCHAR(255) NOT NULL,
        articulo VARCHAR(255),
        maquina VARCHAR(255) NOT NULL,
        destino VARCHAR(255),
        cant_objetivo INT NOT NULL DEFAULT 1000,
        cant_producida INT DEFAULT 0,
        kg_por_unidad DOUBLE DEFAULT 1.0,
        estado VARCHAR(50) DEFAULT 'PROGRAMADO',
        fecha_inicio VARCHAR(50),
        velocidad_u_hora INT DEFAULT 100,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS registro_produccion_materiales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        registro_id INT,
        codigo_ot VARCHAR(255),
        materia_prima_codigo VARCHAR(255),
        materia_prima_nombre VARCHAR(255),
        cantidad_usada DOUBLE,
        unidad_medida VARCHAR(50),
        fecha VARCHAR(50),
        FOREIGN KEY (registro_id) REFERENCES registro_produccion(id) ON DELETE CASCADE
      );
    `);

    await db.query(`
  CREATE TABLE IF NOT EXISTS solicitudes_internas (
    id VARCHAR(20) PRIMARY KEY,
    semielaborado_codigo VARCHAR(50) NOT NULL,
    semielaborado_nombre VARCHAR(255) NOT NULL,
    cantidad_solicitada INT NOT NULL,
    cantidad_retirada INT DEFAULT 0,
    urgencia VARCHAR(20) NOT NULL DEFAULT 'MEDIA',
    estado VARCHAR(30) NOT NULL DEFAULT 'SOLICITADO',
    solicitado_at DATETIME NOT NULL,
    atendido_at DATETIME DEFAULT NULL,
    disponible_at DATETIME DEFAULT NULL,
    entregado_at DATETIME DEFAULT NULL,
    retiros_historial JSON DEFAULT NULL
  );
`);

    // USUARIO ADMIN POR DEFECTO
    const [adminRows] = await db.query(
      "SELECT COUNT(*) as count FROM usuarios",
    );
    if (adminRows[0].count === 0) {
      await db.query(
        "INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)",
        [
          "Administrador Conoflex",
          "admin@conoflex.com.ar",
          "admin123",
          "ADMIN",
        ],
      );
      console.log(
        "👤 Usuario Administrador creado por defecto: admin@conoflex.com.ar / admin123",
      );
    }

    // GRUPOS ALERTA POR DEFECTO
    const [grupoRows] = await db.query(
      "SELECT COUNT(*) as count FROM grupos_alerta",
    );
    if (grupoRows[0].count === 0) {
      await db.query(
        "INSERT INTO grupos_alerta (nombre, dias_critico, dias_alerta, es_predeterminado) VALUES (?, ?, ?, ?)",
        ["General", 5, 15, 1],
      );
    }

    await asegurarTablasProduccion(db);
    await asegurarTablaReflectivas(db);
    await asegurarTablasIngenieria(db);
    await asegurarTablasNotificaciones(db);
    await asegurarTablaMovimientos(db);
    await asegurarComprasStock(db);

    console.log("✅ Estructura MySQL inicializada correctamente.");
  } catch (err) {
    console.error("❌ Error inicializando base de datos MySQL:", err);
  }
}

initDB();

// MIDDLEWARES DE AUTENTICACIÓN Y ROLES (DESACTIVADOS PARA ACCESO DIRECTO LIBRE)
function autenticarToken(req, res, next) {
  next();
}

function autorizarRoles(...rolesPermitidos) {
  return (req, res, next) => {
    next();
  };
}

// ==========================================
// PARSER CSV COMPLETO
// ==========================================
function parseCSVFull(text) {
  const rows = [];
  let row = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1] || "";

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i++;
      row.push(current.trim());
      if (row.length > 1 || row[0] !== "") {
        rows.push(row);
      }
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  if (current || row.length > 0) {
    row.push(current.trim());
    if (row.length > 1 || row[0] !== "") {
      rows.push(row);
    }
  }

  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (line[i] === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else current += line[i];
  }
  result.push(current.trim());
  return result;
}

function parseFechaDeterminista(rawStr) {
  if (!rawStr || typeof rawStr !== "string") return null;
  const clean = rawStr.trim().replace(/^\//, "").split(" ")[0];
  if (!clean) return null;

  const mesesMap = {
    ene: "01",
    feb: "02",
    mar: "03",
    abr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    ago: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dic: "12",
  };

  const matchTexto = clean.toLowerCase().match(/^([a-z]{3})[-/]?(\d{2,4})$/);
  if (matchTexto) {
    const mesStr = matchTexto[1];
    let yearNum = parseInt(matchTexto[2], 10);
    if (yearNum < 100) yearNum += 2000;
    if (mesesMap[mesStr]) {
      return `${yearNum}-${mesesMap[mesStr]}-01`;
    }
  }

  if (clean.includes("/")) {
    const parts = clean.split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      let year = parseInt(parts[2], 10);
      if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
      if (year < 100) year += 2000;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  if (clean.includes("-")) {
    const parts = clean.split("-");
    if (parts.length === 3) {
      const p0 = parseInt(parts[0], 10);
      const p1 = parseInt(parts[1], 10);
      const p2 = parseInt(parts[2], 10);
      if (isNaN(p0) || isNaN(p1) || isNaN(p2)) return null;

      if (p0 > 1000) {
        return `${p0}-${String(p1).padStart(2, "0")}-${String(p2).padStart(2, "0")}`;
      } else {
        const year = p2 < 100 ? p2 + 2000 : p2;
        return `${year}-${String(p1).padStart(2, "0")}-${String(p0).padStart(2, "0")}`;
      }
    }
  }

  return null;
}

function inferMachineCategory(codigo, articulo) {
  const cod = String(codigo || "")
    .trim()
    .toUpperCase();
  const art = String(articulo || "")
    .trim()
    .toUpperCase();

  if (
    cod.startsWith("B1200") ||
    cod.startsWith("B2853") ||
    cod.startsWith("1200L") ||
    cod.startsWith("1570L") ||
    cod.startsWith("B2071") ||
    cod.startsWith("5023") ||
    cod.startsWith("LP2016") ||
    cod.startsWith("1200 S/B") ||
    cod.startsWith("NPC2020") ||
    cod.startsWith("MP2022") ||
    cod.startsWith("1570LSF") ||
    cod.startsWith("B1570") ||
    cod.startsWith("4000") ||
    cod.startsWith("4001") ||
    cod.startsWith("ORUGA") ||
    cod.startsWith("MP3041") ||
    cod.startsWith("MP3040") ||
    cod.startsWith("MP2009 NE")
  ) {
    return "EXTRUSIÓN";
  }
  if (
    art.includes("BASE") ||
    art.includes("CALZA") ||
    art.includes("TOPE") ||
    art.includes("ORUGA") ||
    art.includes("SUBIDA") ||
    art.includes("SCRAP")
  ) {
    return "EXTRUSIÓN";
  }

  if (
    cod.startsWith("1311") ||
    cod.startsWith("1301") ||
    cod.startsWith("2703") ||
    cod.startsWith("2401") ||
    cod.startsWith("2853") ||
    cod.startsWith("2901") ||
    cod.startsWith("2953") ||
    cod.startsWith("3701") ||
    cod.startsWith("3702") ||
    cod.startsWith("3805") ||
    cod.startsWith("2050") ||
    cod.startsWith("2051") ||
    cod.startsWith("DRD750") ||
    cod.startsWith("2702") ||
    cod.startsWith("2950") ||
    cod.startsWith("CPC27")
  ) {
    return "ROTOMOLDEO";
  }
  if (
    art.includes("BARRERA") ||
    art.includes("SUBURBANO") ||
    art.includes("CABALLETE") ||
    art.includes("ANTICHOQUE") ||
    art.includes("AUTOPISTA") ||
    art.includes("VALLA") ||
    art.includes("COLUMNA") ||
    art.includes("PALETA") ||
    art.includes("CARTEL")
  ) {
    return "ROTOMOLDEO";
  }

  if (
    cod.startsWith("2300") ||
    cod.startsWith("2012") ||
    cod.startsWith("2016") ||
    cod.startsWith("MP2009 LIGHT") ||
    cod.startsWith("MP2012")
  ) {
    return "INYECCIÓN";
  }
  if (
    art.includes("VENCEDOR") ||
    art.includes("LIGHT") ||
    art.includes("INYECCION") ||
    art.includes("INYECCIÓN")
  ) {
    return "INYECCIÓN";
  }

  return "ROTOMOLDEO";
}

// ==========================================
// GESTIÓN DE PERMISOS POR ROL
// ==========================================

// OBTENER TODOS LOS ROLES
app.get("/api/roles", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT nombre FROM roles ORDER BY id ASC");
    res.json(rows.map((r) => r.nombre));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREAR UN NUEVO ROL
app.post("/api/roles", requireAdmin, async (req, res) => {
  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "El nombre del rol es requerido." });
  }
  const rolNombre = nombre.trim().toUpperCase();
  try {
    await db.query("INSERT INTO roles (nombre) VALUES (?)", [rolNombre]);
    res.json({ success: true, nombre: rolNombre });
  } catch (error) {
    res.status(400).json({ error: "El rol ya existe o no es válido." });
  }
});

// OBTENER MATRIZ DE PERMISOS
app.get("/api/permisos", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT rol_nombre, modulo_id FROM permisos_roles",
    );
    const [rolesDb] = await db.query("SELECT nombre FROM roles");

    const permisos = { ADMIN: ["*"] };
    rolesDb.forEach((r) => {
      if (r.nombre !== "ADMIN") permisos[r.nombre] = [];
    });

    rows.forEach((row) => {
      if (permisos[row.rol_nombre] !== undefined) {
        permisos[row.rol_nombre].push(row.modulo_id);
      }
    });

    res.json(permisos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GUARDAR PERMISOS DE UN ROL
app.put("/api/permisos/:rol", requireAdmin, async (req, res) => {
  const { rol } = req.params;
  const { modulos } = req.body;

  if (rol.toUpperCase() === "ADMIN") {
    return res
      .status(400)
      .json({ error: "El rol ADMIN mantiene acceso total de forma fija." });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM permisos_roles WHERE rol_nombre = ?", [rol]);

    if (Array.isArray(modulos) && modulos.length > 0) {
      const values = modulos.map((moduloId) => [rol, moduloId]);
      await conn.query(
        "INSERT INTO permisos_roles (rol_nombre, modulo_id) VALUES ?",
        [values],
      );
    }

    await conn.commit();
    res.json({ success: true, mensaje: `Permisos actualizados para ${rol}` });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// ==========================================
// MÓDULO DE AUTENTICACIÓN Y USUARIOS
// ==========================================

// Helper para parsear vendedores de la BD
const parseVendedoresUser = (vendedoresRaw) => {
  if (!vendedoresRaw) return [];
  try {
    return typeof vendedoresRaw === "string"
      ? JSON.parse(vendedoresRaw)
      : vendedoresRaw || [];
  } catch (e) {
    return [];
  }
};

// 1. LOGIN CON VENDEDORES INCLUIDOS EN SESIÓN
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña requeridos." });
  }

  try {
    const [rows] = await db.query("SELECT * FROM usuarios WHERE email = ?", [
      email.trim().toLowerCase(),
    ]);
    const user = rows[0];

    if (!user || user.password_hash !== password) {
      return res
        .status(401)
        .json({ error: "Usuario o contraseña incorrectos." });
    }

    let permisos = ["*"];
    if (user.rol !== "ADMIN") {
      const [permRows] = await db.query(
        "SELECT modulo_id FROM permisos_roles WHERE rol_nombre = ?",
        [user.rol],
      );
      permisos = permRows.map((p) => p.modulo_id);
    }

    const vendedoresArr = parseVendedoresUser(user.vendedores);

    // Sin `expiresIn`: la sesión no vence nunca (el usuario queda logueado hasta
    // que cierre sesión o se cambie JWT_SECRET). Por eso el rol que viaja en el
    // token NO se usa para autorizar acciones de administrador (ver requireAdmin).
    const token = jwt.sign(
      { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre },
      JWT_SECRET,
    );

    res.json({
      success: true,
      token,
      usuario: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        permisos,
        vendedores: vendedoresArr, // <-- ENVIADO A LA SESIÓN
      },
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ error: error.message });
  }
});

// 2. OBTENER TODOS LOS USUARIOS (con sus vendedores)
app.get("/api/usuarios", async (req, res) => {
  try {
    const [users] = await db.query(
      "SELECT id, nombre, email, rol, vendedores, created_at FROM usuarios ORDER BY id ASC",
    );
    const usuariosFormateados = users.map((u) => ({
      ...u,
      vendedores: parseVendedoresUser(u.vendedores),
    }));
    res.json(usuariosFormateados);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. CREAR USUARIO (con rol y vendedores)
app.post("/api/usuarios", requireAdmin, async (req, res) => {
  const { nombre, email, password, rol, vendedores } = req.body;
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: "Faltan campos obligatorios." });
  }

  const rolLimpio = (rol || "PRODUCCION").trim().toUpperCase();
  const vendedoresJson = JSON.stringify(
    Array.isArray(vendedores) ? vendedores : [],
  );

  try {
    const [result] = await db.query(
      "INSERT INTO usuarios (nombre, email, password_hash, rol, vendedores) VALUES (?, ?, ?, ?, ?)",
      [
        nombre.trim(),
        email.trim().toLowerCase(),
        password,
        rolLimpio,
        vendedoresJson,
      ],
    );

    res.json({
      id: result.insertId,
      nombre: nombre.trim(),
      email: email.trim().toLowerCase(),
      rol: rolLimpio,
      vendedores: Array.isArray(vendedores) ? vendedores : [],
    });
  } catch (error) {
    console.error("Error al crear usuario:", error);
    res.status(400).json({
      error: "El email ya está registrado o los datos son inválidos.",
    });
  }
});

// 4. ACTUALIZAR VENDEDORES DE UN USUARIO
app.put("/api/usuarios/:id/vendedores", requireAdmin, async (req, res) => {
  const { vendedores } = req.body;
  const vendedoresJson = JSON.stringify(
    Array.isArray(vendedores) ? vendedores : [],
  );

  try {
    await db.query("UPDATE usuarios SET vendedores = ? WHERE id = ?", [
      vendedoresJson,
      req.params.id,
    ]);
    res.json({ success: true, mensaje: "Vendedores asignados correctamente" });
  } catch (error) {
    console.error("Error actualizando vendedores del usuario:", error);
    res.status(500).json({ error: error.message });
  }
});

// 1. CAMBIAR ROL DE USUARIO (Dinamico)
app.put("/api/usuarios/:id/rol", requireAdmin, async (req, res) => {
  const { rol } = req.body;
  if (!rol || typeof rol !== "string") {
    return res.status(400).json({ error: "El rol es requerido." });
  }

  const rolLimpio = rol.trim().toUpperCase();

  try {
    // Validar que el rol exista en la tabla roles de MySQL
    const [rolExistente] = await db.query(
      "SELECT nombre FROM roles WHERE nombre = ?",
      [rolLimpio],
    );

    if (rolExistente.length === 0) {
      return res
        .status(400)
        .json({ error: `El rol '${rolLimpio}' no existe en el sistema.` });
    }

    await db.query("UPDATE usuarios SET rol = ? WHERE id = ?", [
      rolLimpio,
      req.params.id,
    ]);

    res.json({ success: true, mensaje: "Rol actualizado correctamente" });
  } catch (error) {
    console.error("Error al actualizar rol de usuario:", error);
    res.status(500).json({ error: error.message });
  }
});

// 5. CAMBIAR CONTRASEÑA DE USUARIO
app.put("/api/usuarios/:id/password", requireAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: "Contraseña requerida" });
  }
  try {
    await db.query("UPDATE usuarios SET password_hash = ? WHERE id = ?", [
      password,
      req.params.id,
    ]);
    res.json({
      success: true,
      mensaje: "Contraseña actualizada correctamente",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. CONSULTAR PERMISOS
app.get("/api/permisos", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT rol_nombre, modulo_id FROM permisos_roles",
    );
    const permisos = {
      ADMIN: ["*"],
      PRODUCCION: [],
      DEPOSITO: [],
      COMERCIAL: [],
    };

    rows.forEach((row) => {
      if (!permisos[row.rol_nombre]) permisos[row.rol_nombre] = [];
      permisos[row.rol_nombre].push(row.modulo_id);
    });

    res.json(permisos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. GUARDAR PERMISOS DE UN ROL
app.put("/api/permisos/:rol", requireAdmin, async (req, res) => {
  const { rol } = req.params;
  const { modulos } = req.body;

  if (rol.toUpperCase() === "ADMIN") {
    return res
      .status(400)
      .json({ error: "El rol ADMIN mantiene acceso total fijo." });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM permisos_roles WHERE rol_nombre = ?", [rol]);

    if (Array.isArray(modulos) && modulos.length > 0) {
      const values = modulos.map((moduloId) => [rol, moduloId]);
      await conn.query(
        "INSERT INTO permisos_roles (rol_nombre, modulo_id) VALUES ?",
        [values],
      );
    }

    await conn.commit();
    res.json({ success: true, mensaje: `Permisos actualizados para ${rol}` });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// ==========================================
// MÓDULO EMAIL BOT, GEMINI Y CATÁLOGO COMERCIAL
// ==========================================

app.get("/api/reglas", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT valor FROM reglas WHERE clave = 'prompt_comercial'",
    );
    res.json({ reglas: rows[0] ? rows[0].valor : "" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post(
  "/api/reglas",
  autenticarToken,
  autorizarRoles("ADMIN", "COMERCIAL"),
  async (req, res) => {
    const { reglas } = req.body;
    try {
      await db.query(
        "INSERT INTO reglas (clave, valor) VALUES ('prompt_comercial', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)",
        [reglas || ""],
      );
      res.json({ success: true, mensaje: "Configuración guardada" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

// SINCRONIZACIÓN DE CATÁLOGO DESDE TEXTO (MYSQL)
async function poblarDBDesdeCatalogoTXT() {
  const CATALOGO_PATH = path.join(__dirname, "catalogo.txt");
  if (!fs.existsSync(CATALOGO_PATH)) return 0;

  const contenido = fs.readFileSync(CATALOGO_PATH, "utf-8");
  const bloques = contenido.split(
    /----------------------------------------|-----------------------------------/,
  );

  let totalProcesados = 0;
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    for (const bloque of bloques) {
      const lineas = bloque.trim().split("\n");
      if (lineas.length < 2) continue;

      let cod = "",
        nombre = "",
        medidas = "",
        precio = "",
        espec = "";

      for (const l of lineas) {
        const linea = l.trim();
        if (linea.match(/^Cód:|^Cod:|^Código:/i))
          cod = linea.replace(/^Cód:|^Cod:|^Código:/i, "").trim();
        else if (linea.match(/^Nombre:/i))
          nombre = linea.replace(/^Nombre:/i, "").trim();
        else if (linea.match(/^Medidas:/i))
          medidas = linea.replace(/^Medidas:/i, "").trim();
        else if (linea.match(/^Precio Lista:/i))
          precio = linea.replace(/^Precio Lista:/i, "").trim();
        else if (linea.match(/^Especificación:|^Especificacion:/i))
          espec = linea
            .replace(/^Especificación:|^Especificacion:/i, "")
            .trim();
      }

      if (cod && cod !== "-") {
        const [existente] = await conn.query(
          "SELECT id FROM productos WHERE codigo = ?",
          [cod],
        );

        if (existente && existente.length > 0) {
          await conn.query(
            `UPDATE productos 
             SET nombre = ?, medidas = ?, precio_lista = ?, especificacion = ?, updated_at = NOW() 
             WHERE codigo = ?`,
            [nombre || "", medidas || "", precio || "", espec || "", cod],
          );
        } else {
          await conn.query(
            `INSERT INTO productos 
             (codigo, nombre, medidas, precio_lista, especificacion, aplicacion, foto_tecnica, foto_catalogo) 
             VALUES (?, ?, ?, ?, ?, '', NULL, NULL)`,
            [cod, nombre || "", medidas || "", precio || "", espec || ""],
          );
        }
        totalProcesados++;
      }
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error("❌ Error al poblar MySQL desde catalogo.txt:", err);
    throw err;
  } finally {
    conn.release();
  }

  return totalProcesados;
}

// ENDPOINT PARA PROCESAR PDF / EXCEL / CSV DE PRECIOS CON GEMINI
app.post(
  "/api/catalogo/procesar",
  uploadTemp.single("lista_precios"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ error: "No se subió ningún archivo." });

      console.log(`📤 Procesando lista de precios: ${req.file.originalname}`);
      const ext = path.extname(req.file.originalname).toLowerCase();
      let catalogoTextoFormateado = "";

      // SI ES EXCEL (.xlsx / .xls) -> PROCESAMIENTO MATRICIAL 100% LOCAL
      if (ext === ".xlsx" || ext === ".xls") {
        const resultado = procesarExcelTarjetas(req.file.path);
        catalogoTextoFormateado = resultado.textoFormateado;
        console.log(
          `✅ Se extrajeron ${resultado.totalProductos} productos del Excel.`,
        );
      } else {
        // SI ES PDF / TXT -> SE USA EL MÉTODOS TRADICIONAL
        const promptText = `
        Analizá este documento de lista de precios/catálogo y convertí TODOS sus productos al siguiente formato de texto plano estructurado.
        Debes mantener exactamente estas etiquetas y el separador de guiones entre cada producto:

        Cód: [Código del producto]
        Nombre: [Nombre del producto]
        Medidas: [Medidas o especificaciones clave]
        Precio Lista: [Precio de lista o desglose de variantes de precio]
        Especificación: [Detalles técnicos adicionales o las mismas medidas]
        ----------------------------------------

        Reglas estrictamente obligatorias:
        - Respetá todos los precios en Pesos Argentinos ($) tal cual figuran.
        - No omitas ningún producto.
        - Devuelve ÚNICAMENTE el texto formateado, sin explicaciones, ni introducciones, ni bloques de código markdown.
        `;

        let contentsPayload = [];
        if (ext === ".pdf") {
          const uploadResult = await ai.files.upload({
            file: req.file.path,
            mimeType: "application/pdf",
          });
          const fileUri =
            uploadResult.uri || (uploadResult.file && uploadResult.file.uri);
          contentsPayload = [
            { fileData: { fileUri, mimeType: "application/pdf" } },
            promptText,
          ];
        } else {
          contentsPayload = [
            `TEXTO:\n${fs.readFileSync(req.file.path, "utf-8")}`,
            promptText,
          ];
        }

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: contentsPayload,
        });

        catalogoTextoFormateado = response.text.replace(/```/g, "").trim();
      }

      // GUARDAR RESULTADO EN catalogo.txt Y APLICAR TRANSACCIÓN EN BD
      const CATALOGO_PATH = path.join(__dirname, "catalogo.txt");
      fs.writeFileSync(CATALOGO_PATH, catalogoTextoFormateado, "utf-8");

      const totalCargados = await poblarDBDesdeCatalogoTXT();

      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

      res.json({
        success: true,
        mensaje: `¡Se actualizó el catálogo y se sincronizaron ${totalCargados} productos!`,
        totalProductos: totalCargados,
        contenidoPreview: catalogoTextoFormateado,
      });
    } catch (error) {
      console.error("Error procesando lista:", error);
      res
        .status(500)
        .json({ error: "Error procesando lista de precios: " + error.message });
    }
  },
);

// ==========================================
// RUTAS DE AUTENTICACIÓN GOOGLE (CORREGIDAS)
// ==========================================

app.get("/auth/google", (req, res) => {
  const referer = req.headers.referer || req.headers.origin || "";
  const isLocal = referer.includes("localhost");

  const redirectUri = isLocal
    ? "http://localhost:5173/auth/google/callback"
    : "https://conoflex-app.vercel.app/auth/google/callback";

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );

  // Permisos limpios de Gmail
  const scopes = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.modify",
  ];

  res.redirect(
    client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: scopes.join(" "),
      state: isLocal ? "local" : "prod",
    }),
  );
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    const isLocal = req.query.state === "local";

    const redirectUri = isLocal
      ? "http://localhost:5173/auth/google/callback"
      : "https://conoflex-app.vercel.app/auth/google/callback";

    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri,
    );

    const { tokens } = await client.getToken(req.query.code);

    oauth2Client.setCredentials(tokens);
    const mainTokenPath = path.join(__dirname, "token.json");
    fs.writeFileSync(mainTokenPath, JSON.stringify(tokens));

    const targetUrl = isLocal
      ? "http://localhost:5173"
      : process.env.FRONTEND_URL || "https://conoflex-app.vercel.app";

    res.redirect(`${targetUrl}?status=conectado&module=comercial`);
  } catch (error) {
    console.error("Error en callback de Google:", error);
    res.status(500).send("Error de autenticación con Google: " + error.message);
  }
});

// 1. INSPECTOR GEOMÉTRICO DE IMÁGENES (Sin dependencias externas)
function obtenerDimensionesBuffer(buf) {
  if (!buf || buf.length < 24) return null;

  // PNG
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }

  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return {
      width: buf.readUInt16LE(6),
      height: buf.readUInt16LE(8),
    };
  }

  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 8) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          height: buf.readUInt16BE(i + 5),
          width: buf.readUInt16BE(i + 7),
        };
      }
      const length = buf.readUInt16BE(i + 2);
      i += 2 + length;
    }
  }

  // WEBP
  if (
    buf.slice(0, 4).toString() === "RIFF" &&
    buf.slice(8, 12).toString() === "WEBP"
  ) {
    if (buf.slice(12, 16).toString() === "VP8 ") {
      return {
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
      };
    }
    if (buf.slice(12, 16).toString() === "VP8X") {
      return {
        width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
        height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
      };
    }
  }

  return null;
}

// 2. DISCRIMINADOR INTELIGENTE (FILTRA FIRMAS Y REDES SOCIALES)
function esImagenValidaProducto(buffer, filename = "", cid = "") {
  // A) Descartar píxeles invisibles o iconos menores a 1.5 KB
  if (!buffer || buffer.length < 1500) return false;

  // B) Descartar si el nombre explicita redes o firmas
  const meta = `${filename} ${cid}`.toLowerCase();
  const palabrasBasura = [
    "linkedin",
    "instagram",
    "youtube",
    "facebook",
    "twitter",
    "whatsapp",
    "signature",
    "firma",
    "avatar",
    "icon",
    "social",
  ];
  if (palabrasBasura.some((p) => meta.includes(p))) return false;

  // C) Filtro por proporciones reales
  const dims = obtenerDimensionesBuffer(buffer);
  if (dims && dims.width > 0 && dims.height > 0) {
    const { width, height } = dims;

    // Descartar iconos sociales pequeños (32x32, 48x48, 64x64)
    if (width <= 64 || height <= 64) {
      return false;
    }

    // Descartar banners de firmas (relación de aspecto ancho/alto >= 2.6)
    // Las firmas de Conoflex miden aprox 650x140 (ratio 4.6)
    const ratio = width / height;
    if (ratio >= 2.6) {
      return false;
    }

    // Descartar líneas o separadores verticales
    if (ratio <= 0.28) {
      return false;
    }
  }

  return true;
}

// 3. EXTRACCIÓN DEL CORREO
async function extraerContenidoMail(gmail, messageId, payload) {
  let cuerpoTexto = "";
  let cuerpoHtml = "";
  const imagenes = [];

  const decodeBase64 = (str) => {
    if (!str) return "";
    const base64Standard = str.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64Standard, "base64").toString("utf-8");
  };

  async function recorrerPartes(parts) {
    if (!parts || !Array.isArray(parts)) return;

    for (const part of parts) {
      if (part.mimeType === "text/plain" && part.body && part.body.data) {
        cuerpoTexto += decodeBase64(part.body.data) + "\n";
      }

      if (part.mimeType === "text/html" && part.body && part.body.data) {
        cuerpoHtml += decodeBase64(part.body.data) + "\n";
      }

      if (part.mimeType && part.mimeType.startsWith("image/")) {
        let base64Data = part.body?.data;

        if (!base64Data && part.body?.attachmentId) {
          try {
            const attachRes = await gmail.users.messages.attachments.get({
              userId: "me",
              messageId: messageId,
              id: part.body.attachmentId,
            });
            base64Data = attachRes.data.data;
          } catch (errAttach) {
            console.error("Error descargando adjunto:", errAttach.message);
          }
        }

        if (base64Data) {
          const rawBuffer = Buffer.from(
            base64Data.replace(/-/g, "+").replace(/_/g, "/"),
            "base64",
          );

          // Pasamos el buffer por el filtro de dimensiones y firmas
          if (
            esImagenValidaProducto(
              rawBuffer,
              part.filename,
              part.headers?.find((h) => h.name.toLowerCase() === "content-id")
                ?.value,
            )
          ) {
            imagenes.push({
              mimeType: part.mimeType,
              data: rawBuffer.toString("base64"),
            });
          }
        }
      }

      if (part.parts) {
        await recorrerPartes(part.parts);
      }
    }
  }

  if (payload.body && payload.body.data && payload.mimeType === "text/plain") {
    cuerpoTexto = decodeBase64(payload.body.data);
  } else if (payload.parts) {
    await recorrerPartes(payload.parts);
  }

  let cuerpoFinal = cuerpoTexto.trim();
  if (!cuerpoFinal && cuerpoHtml) {
    cuerpoFinal = cuerpoHtml
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*[\/]?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .trim();
  }

  return { cuerpoCompleto: cuerpoFinal, imagenes };
}

// ENDPOINT: LISTADO DE MAILS (CON CONTENIDO 100% COMPLETO E IMÁGENES)
app.get(
  "/api/mails",
  autenticarToken,
  autorizarRoles("ADMIN", "COMERCIAL"),
  async (req, res) => {
    try {
      const pathToken = fs.existsSync(path.join(__dirname, "token.json"))
        ? path.join(__dirname, "token.json")
        : path.join(__dirname, "tokens_web.json");

      if (fs.existsSync(pathToken)) {
        const tokens = JSON.parse(fs.readFileSync(pathToken));
        oauth2Client.setCredentials(tokens);
      }

      if (
        !oauth2Client.credentials ||
        (!oauth2Client.credentials.access_token &&
          !oauth2Client.credentials.refresh_token)
      ) {
        return res.status(401).json({ error: "No autenticado en Gmail" });
      }

      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const listRes = await gmail.users.messages.list({
        userId: "me",
        q: "label:IA-Consulta",
        maxResults: 10,
      });

      const messages = listRes.data.messages || [];
      const mailsDetalle = [];

      for (const msg of messages) {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "full",
        });

        const headers = detail.data.payload.headers || [];
        const subject =
          headers.find((h) => h.name.toLowerCase() === "subject")?.value ||
          "Sin asunto";
        const from =
          headers.find((h) => h.name.toLowerCase() === "from")?.value ||
          "Desconocido";
        const emailMatch = from.match(/<([^>]+)>/) || [null, from];

        // Extracción completa: cuerpo entero sin límites de caracteres + imágenes adjuntas
        const { cuerpoCompleto, imagenes } = await extraerContenidoMail(
          gmail,
          msg.id,
          detail.data.payload,
        );

        mailsDetalle.push({
          id: msg.id,
          threadId: detail.data.threadId,
          asunto: subject,
          remitente: from,
          emailCliente: emailMatch[1],
          resumen: cuerpoCompleto || detail.data.snippet || "",
          cuerpoCompleto: cuerpoCompleto || detail.data.snippet || "",
          imagenes: imagenes,
        });
      }

      res.json({ mails: mailsDetalle });
    } catch (error) {
      console.error("Error leyendo Gmail:", error);
      res.status(500).json({ error: "Error leyendo Gmail: " + error.message });
    }
  },
);

// ENDPOINT: GENERACIÓN MULTIMODAL DE BORRADOR CON GEMINI Y GMAIL
app.post(
  "/api/crear-borrador-gmail",
  autenticarToken,
  autorizarRoles("ADMIN", "COMERCIAL"),
  async (req, res) => {
    try {
      const { mailCliente, consultaText, asunto, threadId, imagenes } =
        req.body;
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      // 1. Preparar las imágenes para la API multimodal de Gemini
      const imagenesParaGemini = [];

      // A) Si vienen desde el frontend
      if (Array.isArray(imagenes) && imagenes.length > 0) {
        for (const img of imagenes) {
          if (img.data && img.mimeType) {
            imagenesParaGemini.push({
              inlineData: {
                mimeType: img.mimeType,
                data: img.data,
              },
            });
          }
        }
      }

      // B) Respaldo: Si no vinieron en el body pero hay threadId, extraerlas directamente del último mensaje
      if (imagenesParaGemini.length === 0 && threadId) {
        try {
          const threadRes = await gmail.users.threads.get({
            userId: "me",
            id: threadId,
            format: "full",
          });
          const msgs = threadRes.data.messages || [];
          const lastMsg = msgs[msgs.length - 1];

          if (lastMsg && lastMsg.payload) {
            const { imagenes: imgsThread } = await extraerContenidoMail(
              gmail,
              lastMsg.id,
              lastMsg.payload,
            );
            for (const img of imgsThread) {
              imagenesParaGemini.push({
                inlineData: {
                  mimeType: img.mimeType,
                  data: img.data,
                },
              });
            }
          }
        } catch (errThread) {
          console.warn(
            "Aviso al obtener adjuntos del hilo:",
            errThread.message,
          );
        }
      }

      // 2. Consultar reglas comerciales y catálogo en la base de datos
      const [reglaRows] = await db.query(
        "SELECT valor FROM reglas WHERE clave = 'prompt_comercial'",
      );
      const reglasEntrenamiento = reglaRows[0] ? reglaRows[0].valor : "";

      const [productosDB] = await db.query(
        "SELECT codigo, nombre, medidas, precio_lista, especificacion, aplicacion, foto_tecnica, foto_catalogo FROM productos",
      );

      // 3. Prompt con directiva estricta para visión y mapeo de competencia/similares
      const prompt = `
REGLAS Y POLÍTICAS COMERCIALES DEL USUARIO (PRIORIDAD MÁXIMA):
${reglasEntrenamiento}

CATÁLOGO OFICIAL DE PRODUCTOS CONOFLEX DISPONIBLES:
${JSON.stringify(productosDB, null, 2)}

CONSULTA COMPLETA DEL CLIENTE (${mailCliente}):
"""
${consultaText}
"""

DIRECTIVAS CLAVE DE ANÁLISIS MULTIMODAL E INTERPRETACIÓN VISUAL:
1. Revisa la TOTALIDAD del texto del cliente sin omitir detalles, medidas o cantidades.
2. Si se han adjuntado imágenes (fotos enviadas por el cliente), ANALÍZALAS DETENIDAMENTE:
   - Identifica el producto vial/industrial mostrado (conos, reductores, vallas, delineadores, etc.).
   - Aunque la foto sea de un producto de la competencia, un modelo roto, un boceto o una versión descatalogada, localiza en el catálogo de CONOFLEX el producto equivalente o alternativo más adecuado.
   - Explica brevemente al cliente en el cuerpo del correo la correspondencia (ej.: "En base a la fotografía que nos adjunta, nuestro modelo equivalente en Conoflex es...").

ESTILO DE REDACCIÓN Y TONO COMERCIAL:
- Saludo inicial natural y fluido (ej.: "Estimados, gracias por comunicarse con Conoflex Argentina. A continuación presentamos la propuesta comercial solicitada:").
- NUNCA incluyas corchetes ni comodines como "[Tu Nombre]", "[Firma]" o "Atn. sr/a.". Redacta directamente en representación del equipo de ventas de Conoflex.
- Tono técnico, seguro y comercialmente persuasivo.

INSTRUCCIONES DE MAQUETACIÓN EN TARJETAS HTML:
1. Para cada producto cotizado, genera una TARJETA HORIZONTAL en HTML (tabla con borde #e2e8f0, esquinas redondeadas y padding de 10px).
2. REGLA DE IMÁGENES:
   - Si el producto tiene valor en 'foto_tecnica', escribe exactamente: {FOTO_TECNICA_URL=poner_aqui_la_url_de_la_BD}
   - Si tiene 'foto_catalogo', escribe exactamente: {FOTO_CATALOGO_URL=poner_aqui_la_url_de_la_BD}
   - Si no tiene URL o es null, no incluyas la variable.
3. Muestra Nombre en negrita, Código, Medidas y Especificaciones/Aplicación.
4. Muestra las cajas de precio de forma ordenada (Lista, Precio c/Descuento y Total).
5. Incluye el cuadro final de condiciones con notas sobre IVA, descuentos y entrega.

Devuelve ÚNICAMENTE el código HTML crudo sin bloques Markdown (\`\`\`html) ni comentarios.
`;

      // 4. Invocación a Gemini 2.5 Flash con soporte multimodal
      const contentsGemini = [...imagenesParaGemini, prompt];

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contentsGemini,
      });

      let htmlBody = response.text
        .replace(/```html/gi, "")
        .replace(/```/g, "")
        .trim();

      // 5. Reemplazo de variables de imagen por etiquetas <img> reales
      htmlBody = htmlBody.replace(
        /\{FOTO_TECNICA_URL=(https?:\/\/[^\}]+)\}/g,
        '<img src="$1" width="100%" style="max-height:220px; height: auto; object-fit:contain; border-radius:4px; margin: 0 5px;" alt="Técnica" />',
      );
      htmlBody = htmlBody.replace(
        /\{FOTO_CATALOGO_URL=(https?:\/\/[^\}]+)\}/g,
        '<img src="$1" width="100%" style="max-height:220px; height: auto; object-fit:contain; border-radius:4px; margin: 0 5px;" alt="Catálogo" />',
      );

      // Limpieza de cualquier variable residual
      htmlBody = htmlBody.replace(/\{FOTO_TECNICA_URL=[^\}]*\}/g, "");
      htmlBody = htmlBody.replace(/\{FOTO_CATALOGO_URL=[^\}]*\}/g, "");

      // 6. Creación del borrador en Gmail
      const draftPayload = crearRawEmail(
        mailCliente,
        asunto || "Presupuesto Conoflex Argentina",
        htmlBody,
        threadId,
      );

      const draftCreated = await gmail.users.drafts.create({
        userId: "me",
        requestBody: draftPayload,
      });

      res.json({
        success: true,
        mensaje: "Borrador generado en Gmail",
        draftId: draftCreated.data.id,
      });
    } catch (error) {
      console.error("Error creando borrador:", error);
      res
        .status(500)
        .json({ error: "Error al generar borrador: " + error.message });
    }
  },
);

// ANÁLISIS ESTRATÉGICO Y DIAGNÓSTICO OPERATIVO CON IA
app.post(
  "/api/analisis-estrategico",
  autenticarToken,
  autorizarRoles("ADMIN", "PRODUCCION"),
  async (req, res) => {
    try {
      const [productosTerminados] = await db.query(
        "SELECT * FROM productos_terminados",
      );
      const [semielaborados] = await db.query("SELECT * FROM semielaborados");
      const [materiasPrimas] = await db.query("SELECT * FROM materias_primas");
      const [registrosProd] = await db.query(
        "SELECT * FROM registro_produccion ORDER BY id DESC LIMIT 50",
      );

      const prompt = `
      Sos el Director de Operaciones, Cadena de Suministro y Calidad Industrial de Conoflex Argentina.

      DATOS DE PLANTA EN TIEMPO REAL:
      - Productos Terminados (Ventas y Stock): ${JSON.stringify(productosTerminados, null, 2)}
      - Semielaborados (Stock por Depósito): ${JSON.stringify(semielaborados, null, 2)}
      - Materias Primas e Insumos: ${JSON.stringify(materiasPrimas, null, 2)}
      - Producción y Fallas Recientes: ${JSON.stringify(registrosProd, null, 2)}

      TAREA DE ANÁLISIS Y TOMA DE DECISIONES:
      1. COMPRA DE MATERIAS PRIMAS: Identificá los insumos cuyo stock esté bajo. Recomendá qué comprar e indicá prioridades.
      2. PLANIFICACIÓN DE PRODUCCIÓN: Analizá la demanda y stock de semielaborados e indicá qué modelos conviene fabricar primero.
      3. CONTROL DE CALIDAD Y FALLAS: Analizá el historial de fallas e indicá 3 acciones correctivas concretas.

      ESTRUCTURA DEL REPORTE:
      Generá un informe ejecutivo bien maquetado en HTML (usando tablas limpias, etiquetas de estado de color y viñetas).
      Devolver ÚNICAMENTE el código HTML sin bloques Markdown ni introducciones.
    `;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      let htmlReporte = response.text
        .replace(/```html/g, "")
        .replace(/```/g, "")
        .trim();

      res.json({ success: true, informe: htmlReporte });
    } catch (error) {
      console.error("Error generando análisis estratégico:", error);
      res
        .status(500)
        .json({ error: "Error al generar el informe: " + error.message });
    }
  },
);

// PRODUCTOS DEL CATÁLOGO COMERCIAL
app.get("/api/productos", async (req, res) => {
  try {
    const [productos] = await db.query(
      "SELECT * FROM productos ORDER BY id ASC",
    );
    res.json({ productos });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put(
  "/api/productos/:id",
  autenticarToken,
  autorizarRoles("ADMIN", "COMERCIAL"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        codigo,
        nombre,
        medidas,
        precio_lista,
        especificacion,
        aplicacion,
      } = req.body;

      await db.query(
        `
        UPDATE productos
        SET codigo = ?, nombre = ?, medidas = ?, precio_lista = ?, especificacion = ?, aplicacion = ?, updated_at = NOW()
        WHERE id = ?
      `,
        [
          codigo || "",
          nombre || "",
          medidas || "",
          precio_lista || "",
          especificacion || "",
          aplicacion || "",
          id,
        ],
      );

      res.json({
        success: true,
        mensaje: "Producto actualizado correctamente.",
      });
    } catch (err) {
      res
        .status(500)
        .json({ error: "Error actualizando producto: " + err.message });
    }
  },
);

app.post(
  "/api/productos/:id/imagen",
  autenticarToken,
  autorizarRoles("ADMIN", "COMERCIAL"),
  uploadFoto.single("imagen"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { tipo } = req.body;
      if (!req.file)
        return res.status(400).json({ error: "No se recibió ninguna imagen." });

      const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
      const imageUrl = `${baseUrl}/imagenes/${req.file.filename}`;
      const campoBD = tipo === "tecnica" ? "foto_tecnica" : "foto_catalogo";

      await db.query(`UPDATE productos SET ${campoBD} = ? WHERE id = ?`, [
        imageUrl,
        id,
      ]);

      res.json({
        success: true,
        mensaje: `Foto ${tipo} subida correctamente.`,
        imageUrl,
      });
    } catch (err) {
      res.status(500).json({ error: "Error al guardar la imagen." });
    }
  },
);

// ==========================================
// MÓDULO 1: MATERIAS PRIMAS
// ==========================================
app.get("/api/materias-primas", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM materias_primas ORDER BY orden ASC, id ASC",
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Demanda de materias primas (ventas de N meses abiertas por receta) contra el stock actual.
app.get("/api/materias-primas/demanda", async (req, res) => {
  try {
    const r = await demandaMateriasPrimas(db, {
      meses: req.query.meses,
      materia_prima: req.query.q,
      materia_prima_id: req.query.id,
      solo_con_demanda: req.query.todas === "1" ? false : undefined,
    });
    if (r.error) return res.status(404).json({ error: r.error });
    res.json(r);
  } catch (error) {
    console.error("Error calculando demanda de materias primas:", error);
    res.status(500).json({ error: "No se pudo calcular la demanda." });
  }
});

// 2. NUEVO ENDPOINT: OBTENER AUDITORÍA POR RANGO DE FECHAS
app.get("/api/materias-primas/:id/auditoria", async (req, res) => {
  const { id } = req.params;
  const { desde, hasta } = req.query; // Formato YYYY-MM-DD

  try {
    let query = "SELECT * FROM movimientos_stock WHERE materia_prima_id = ?";
    let params = [id];

    if (desde && hasta) {
      query += " AND DATE(fecha) BETWEEN ? AND ?";
      params.push(desde, hasta);
    }
    query += " ORDER BY fecha DESC LIMIT 100"; // Límite de seguridad

    const [movimientos] = await db.query(query, params);
    res.json(movimientos);
  } catch (error) {
    console.error("Error obteniendo auditoria:", error);
    res.status(500).json({ error: "Error al obtener historial" });
  }
});

// Historial detallado: en qué se gastó cada kilo y qué compras lo repusieron (más los ajustes manuales).
app.get("/api/materias-primas/:id/historial", async (req, res) => {
  try {
    const { desde, hasta, tipo } = req.query;
    const [[mp]] = await db.query("SELECT id, codigo, nombre, unidad_medida, stock_actual FROM materias_primas WHERE id = ?", [req.params.id]);
    if (!mp) return res.status(404).json({ error: "No encontré esa materia prima." });
    const movimientos = await historialMateriaPrima(db, mp.id, { desde, hasta, tipo });
    res.json({ materia_prima: mp, movimientos });
  } catch (error) {
    console.error("Error obteniendo historial de materia prima:", error);
    res.status(500).json({ error: "Error al obtener el historial." });
  }
});

app.post("/api/materias-primas/previsualizar-sheets", async (req, res) => {
  const MATERIAS_PRIMAS_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTt66qDCe0E3GUbp7BLqGj4IHYK8nrXF1gvfmf45vY2kkP3-gL3fpPcxjltnFBX8EP7kBzEhnIvHw0L/pub?output=csv";

  try {
    const response = await fetch(MATERIAS_PRIMAS_CSV_URL);
    if (!response.ok) {
      return res
        .status(400)
        .json({ error: "No se pudo descargar el CSV de Google Sheets" });
    }

    const csvText = await response.text();
    const rows = parseCSVFull(csvText);
    if (rows.length < 2) {
      return res
        .status(400)
        .json({ error: "El archivo de Google Sheets está vacío" });
    }

    const [currentMP] = await db.query("SELECT * FROM materias_primas");
    const currentMap = {};
    currentMP.forEach((m) => {
      currentMap[m.codigo.toUpperCase().trim()] = m;
    });

    const nuevos = [];
    const modificados = [];

    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      if (!cols[0]) continue;

      const codigoUpper = cols[0].toUpperCase().trim();
      if (EXCLUDED_CODES.includes(codigoUpper)) continue;

      const nombre = cols[1] ? cols[1].trim() : codigoUpper;
      const unidad = cols[2] ? cols[2].trim().toUpperCase() : "KILOS";
      const stockNuevo =
        parseFloat(String(cols[4] || cols[3] || "0").replace(",", ".")) || 0;

      const existing = currentMap[codigoUpper];

      if (existing) {
        if (Math.abs(existing.stock_actual - stockNuevo) > 0.001) {
          modificados.push({
            id: existing.id,
            codigo: existing.codigo,
            nombre: existing.nombre,
            unidad: existing.unidad_medida,
            stock_actual: existing.stock_actual,
            stock_nuevo: stockNuevo,
            diferencia: stockNuevo - existing.stock_actual,
          });
        }
      } else {
        nuevos.push({
          codigo: codigoUpper,
          nombre: nombre,
          unidad: unidad,
          stock_nuevo: stockNuevo,
        });
      }
    }

    res.json({ nuevos, modificados });
  } catch (error) {
    console.error("Error al previsualizar materias primas:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/materias-primas/aplicar-sincronizacion", async (req, res) => {
  const { nuevos, modificados } = req.body;
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    let nuevosCount = 0;
    let modificadosCount = 0;

    if (Array.isArray(nuevos)) {
      for (const n of nuevos) {
        await conn.query(
          "INSERT INTO materias_primas (codigo, nombre, unidad_medida, stock_actual) VALUES (?, ?, ?, ?)",
          [n.codigo, n.nombre, n.unidad || "KILOS", n.stock_nuevo || 0],
        );
        nuevosCount++;
      }
    }

    if (Array.isArray(modificados)) {
      for (const m of modificados) {
        await conn.query(
          "UPDATE materias_primas SET stock_actual = ? WHERE id = ?",
          [m.stock_nuevo, m.id],
        );
        modificadosCount++;
      }
    }

    await conn.commit();
    res.json({ success: true, nuevosCount, modificadosCount });
  } catch (error) {
    await conn.rollback();
    console.error("Error al aplicar sincronización de materias primas:", error);
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// ==========================================
// MÓDULO 2: CONFIGURACIONES DE PEGADO Y REFLECTIVAS
// ==========================================
app.get("/api/configuraciones-pegado", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT c.*, COUNT(s.id) as semielaborados_count
      FROM configuraciones_pegado c
      LEFT JOIN semielaborados s ON s.configuracion_pegado_id = c.id
      GROUP BY c.id
      ORDER BY c.nombre ASC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/configuraciones-pegado", async (req, res) => {
  const { nombre, reflectiva, protector_orajet, aplicacion_protector } =
    req.body;
  if (!nombre || !nombre.trim())
    return res.status(400).json({ error: "Nombre requerido" });

  try {
    const [result] = await db.query(
      `
      INSERT INTO configuraciones_pegado (nombre, reflectiva, protector_orajet, aplicacion_protector)
      VALUES (?, ?, ?, ?)
    `,
      [
        nombre.trim().toUpperCase(),
        reflectiva || "NINGUNA",
        protector_orajet ? 1 : 0,
        aplicacion_protector || "NINGUNA",
      ],
    );
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/configuraciones-pegado/:id", async (req, res) => {
  const { nombre, reflectiva, protector_orajet, aplicacion_protector } =
    req.body;
  try {
    await db.query(
      `
      UPDATE configuraciones_pegado
      SET nombre = ?, reflectiva = ?, protector_orajet = ?, aplicacion_protector = ?
      WHERE id = ?
    `,
      [
        nombre.trim().toUpperCase(),
        reflectiva || "NINGUNA",
        protector_orajet ? 1 : 0,
        aplicacion_protector || "NINGUNA",
        req.params.id,
      ],
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/configuraciones-pegado/:id", async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      "UPDATE semielaborados SET configuracion_pegado_id = NULL WHERE configuracion_pegado_id = ?",
      [req.params.id],
    );
    await conn.query("DELETE FROM configuraciones_pegado WHERE id = ?", [
      req.params.id,
    ]);
    await conn.commit();
    res.json({ success: true });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

app.put("/api/semielaborados/:id/enlazar-pegado", async (req, res) => {
  const { configuracion_pegado_id } = req.body;
  try {
    await db.query(
      "UPDATE semielaborados SET configuracion_pegado_id = ? WHERE id = ?",
      [configuracion_pegado_id || null, req.params.id],
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/semielaborados/bulk-enlazar-pegado", async (req, res) => {
  const { ids, configuracion_pegado_id } = req.body;
  if (!ids || !Array.isArray(ids))
    return res.status(400).json({ error: "IDs no válidos" });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (let id of ids) {
      await conn.query(
        "UPDATE semielaborados SET configuracion_pegado_id = ? WHERE id = ?",
        [configuracion_pegado_id || null, id],
      );
    }
    await conn.commit();
    res.json({ success: true, count: ids.length });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// ==========================================
// 1. NUEVO ENDPOINT: OBTENER PROVEEDORES
// ==========================================
// OBTENER TODOS LOS PROVEEDORES
app.get("/api/proveedores", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM proveedores ORDER BY nombre ASC",
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener proveedores" });
  }
});

// CREAR PROVEEDOR
app.post("/api/proveedores", async (req, res) => {
  const { nombre, cuit, contacto, telefono, email, direccion, estado } =
    req.body;
  try {
    const [result] = await db.query(
      `INSERT INTO proveedores (nombre, cuit, contacto, telefono, email, direccion, estado) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nombre, cuit, contacto, telefono, email, direccion, estado || "ACTIVO"],
    );
    res.json({ id: result.insertId, ...req.body });
  } catch (err) {
    console.error("Error CREAR PROVEEDOR:", err);
    res.status(500).json({ error: "Error al crear proveedor" });
  }
});

// ACTUALIZAR PROVEEDOR
app.put("/api/proveedores/:id", async (req, res) => {
  const { id } = req.params;
  const { nombre, cuit, contacto, telefono, email, direccion, estado } =
    req.body;
  try {
    await db.query(
      `UPDATE proveedores 
       SET nombre = ?, cuit = ?, contacto = ?, telefono = ?, email = ?, direccion = ?, estado = ? 
       WHERE id = ?`,
      [nombre, cuit, contacto, telefono, email, direccion, estado, id],
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Error ACTUALIZAR PROVEEDOR:", err);
    res.status(500).json({ error: "Error al actualizar proveedor" });
  }
});

// OBTENER MATERIAS PRIMAS ASOCIADAS A UN PROVEEDOR
app.get("/api/proveedores/:id/materias-primas", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      "SELECT id, codigo, nombre, stock_actual, unidad_medida, planta FROM materias_primas WHERE proveedor_id = ?",
      [id],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener insumos del proveedor" });
  }
});

// Edición de una materia prima. Cambiar el STOCK a mano es solo para administradores y queda en el
// historial como "edición directa" (stock anterior, nuevo, quién y por qué).
app.put("/api/materias-primas/:id/stock", async (req, res) => {
  const { id } = req.params;
  const { stock, unidad_medida, planta, proveedor_id, stock_minimo, motivo } = req.body;
  const conn = await db.getConnection();
  try {
    const [[usuario]] = await conn.query("SELECT nombre, email, rol FROM usuarios WHERE id = ?", [req.user?.id]);
    const esAdmin = String(usuario?.rol || "").toUpperCase() === "ADMIN";

    await conn.beginTransaction();
    const [actual] = await conn.query("SELECT stock_actual FROM materias_primas WHERE id = ? FOR UPDATE", [id]);
    if (!actual.length) {
      await conn.rollback();
      return res.status(404).json({ error: "No encontré esa materia prima." });
    }
    const stockAnterior = Number(actual[0].stock_actual) || 0;
    const quiereCambiarStock = stock !== undefined && stock !== null && stock !== "";
    const nuevoStock = quiereCambiarStock ? Number(String(stock).replace(",", ".")) : stockAnterior;
    if (!Number.isFinite(nuevoStock)) {
      await conn.rollback();
      return res.status(400).json({ error: "El stock tiene que ser un número." });
    }
    const cambiaStock = Math.abs(nuevoStock - stockAnterior) > 1e-9;
    if (cambiaStock && !esAdmin) {
      await conn.rollback();
      return res.status(403).json({ error: "Solo un administrador puede modificar el stock de una materia prima." });
    }

    await conn.query(
      "UPDATE materias_primas SET unidad_medida = ?, planta = ?, proveedor_id = ?, stock_minimo = ? WHERE id = ?",
      [unidad_medida, planta, proveedor_id || null, stock_minimo || 0, id],
    );
    let r = { stock_resultante: stockAnterior };
    if (cambiaStock) {
      r = await moverStock(conn, {
        mp_id: Number(id),
        delta: nuevoStock - stockAnterior,
        tipo: "AJUSTE_MANUAL",
        usuario: usuario?.nombre || usuario?.email || "Admin",
        referencia_texto: "Edición directa",
        detalle: { stock_anterior: stockAnterior, stock_nuevo: nuevoStock, motivo: String(motivo || "").trim().slice(0, 300) || null },
      });
    }
    await conn.commit();
    res.json({ success: true, stock_actual: r.stock_resultante });
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Error actualizando materia prima:", error);
    res.status(500).json({ error: "Error al actualizar la materia prima" });
  } finally {
    conn.release();
  }
});

// ==========================================
// MÓDULO 3: SEMIELABORADOS Y CRUCE DE DÍAS DE STOCK (ULTRA OPTIMIZADO)
// ==========================================
app.get("/api/semielaborados", async (req, res) => {
  try {
    const meses = parseInt(req.query.meses) || 3;

    // 1. Ejecutamos todas las consultas principales en PARALELO para máxima velocidad
    const [
      [semielaborados],
      [pts],
      [ventasAgrupadas],
      [activeRecipesPT],
      [recipeDetailsPT],
    ] = await Promise.all([
      db.query(`
        SELECT s.*, 
               c.nombre as pegado_nombre,
               c.reflectiva,
               c.protector_orajet,
               c.aplicacion_protector,
               (
                 SELECT MAX(rp.fecha) 
                 FROM registro_produccion rp 
                 WHERE UPPER(rp.codigo) = UPPER(s.codigo) OR UPPER(rp.articulo) = UPPER(s.nombre)
               ) as ultima_produccion_fecha,
               COUNT(i.id) as recetas_count 
        FROM semielaborados s 
        LEFT JOIN configuraciones_pegado c ON s.configuracion_pegado_id = c.id
        LEFT JOIN ingenierias i ON s.id = i.semielaborado_id 
        GROUP BY s.id 
        ORDER BY s.orden ASC, s.id ASC
      `),
      db.query(
        "SELECT id, codigo, nombre, promedio_ventas_mensual FROM productos_terminados",
      ),
      // 🚀 Consulta única ultra rápida: agrupa todas las ventas del período en 1 solo paso
      db.query(
        `
        SELECT UPPER(TRIM(modelo)) as modelo, SUM(cantidad) as total_vendido
        FROM estado_pedidos
        WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
        GROUP BY UPPER(TRIM(modelo))
      `,
        [meses],
      ),
      db.query(
        "SELECT id, producto_terminado_id FROM ingenierias WHERE es_activa = 1 AND producto_terminado_id IS NOT NULL",
      ),
      db.query(
        "SELECT ingenieria_id, semielaborado_id, cantidad FROM ingenieria_detalles WHERE semielaborado_id IS NOT NULL",
      ),
    ]);

    // 2. Mapeamos las ventas en un Map de JS (Búsqueda en 0.001 ms)
    const ventasMap = new Map();
    ventasAgrupadas.forEach((v) => {
      if (v.modelo) {
        ventasMap.set(v.modelo, parseFloat(v.total_vendido) || 0);
      }
    });

    // 3. Calculamos el promedio mensual por Producto Terminado
    const ptDemandMap = new Map();
    pts.forEach((pt) => {
      const keyCodigo = pt.codigo ? pt.codigo.trim().toUpperCase() : "";
      const keyNombre = pt.nombre ? pt.nombre.trim().toUpperCase() : "";

      let totalVendido = ventasMap.get(keyCodigo);
      if (totalVendido === undefined && keyNombre) {
        totalVendido = ventasMap.get(keyNombre);
      }

      let promedioMensual = 0;
      if (totalVendido !== undefined) {
        promedioMensual = totalVendido / meses;
      } else {
        promedioMensual = parseFloat(pt.promedio_ventas_mensual) || 0;
      }

      ptDemandMap.set(pt.id, promedioMensual);
    });

    // 4. Trasladamos la demanda a Semielaborados vía Recetas (BOM)
    const seDemandMap = {};
    pts.forEach((pt) => {
      const ventaMensual = ptDemandMap.get(pt.id) || 0;
      if (ventaMensual === 0) return;

      const activeRecipe = activeRecipesPT.find(
        (r) => r.producto_terminado_id === pt.id,
      );
      if (!activeRecipe) return;

      const details = recipeDetailsPT.filter(
        (d) => d.ingenieria_id === activeRecipe.id,
      );

      details.forEach((det) => {
        if (!seDemandMap[det.semielaborado_id]) {
          seDemandMap[det.semielaborado_id] = 0;
        }
        seDemandMap[det.semielaborado_id] +=
          ventaMensual * parseFloat(det.cantidad || 0);
      });
    });

    // 5. Resultado final con Stock Total, Demanda y Días de Stock
    const result = semielaborados.map((se) => {
      const rawStock =
        (se.stock_33 || 0) +
        (se.stock_26 || 0) +
        (se.stock_ayolas || 0) +
        (se.stock_37 || 0);
      const totalStock = Math.max(0, rawStock);
      const demand = seDemandMap[se.id] || 0;

      let dias_stock =
        demand > 0 ? Math.round((totalStock / demand) * 30) : null;

      return {
        ...se,
        stock_total: totalStock,
        demanda_mensual: Math.round(demand),
        dias_stock: dias_stock,
      };
    });

    res.json(result);
  } catch (error) {
    console.error("Error en /api/semielaborados:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/semielaborados/:id/stock", async (req, res) => {
  const { campoDeposito, stock } = req.body;
  const permitidos = ["stock_33", "stock_26", "stock_ayolas", "stock_37"];

  if (!permitidos.includes(campoDeposito)) {
    return res.status(400).json({ error: "Campo de depósito inválido" });
  }

  try {
    await db.query(
      `UPDATE semielaborados SET ${campoDeposito} = ? WHERE id = ?`,
      [stock, req.params.id],
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/semielaborados/recargar-sheets", async (req, res) => {
  try {
    const updatesMap = {};
    for (const [sucursalKey, csvUrl] of Object.entries(STOCK_URLS)) {
      if (!csvUrl || csvUrl.startsWith("PEGA_AQUI")) continue;
      const response = await fetch(csvUrl);
      if (!response.ok) continue;
      const lines = (await response.text()).split("\n");
      for (let line of lines) {
        const cols = parseCSVLine(line);
        if (cols.length < 5 || !cols[0]) continue;
        const codeUpper = cols[0].toUpperCase();
        if (EXCLUDED_CODES.includes(codeUpper)) continue;
        const parsedStock = parseFloat(cols[4].replace(",", "."));
        if (isNaN(parsedStock)) continue;
        if (!updatesMap[codeUpper]) updatesMap[codeUpper] = {};
        updatesMap[codeUpper][sucursalKey] = parsedStock;
      }
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      for (const [codeUpper, stocks] of Object.entries(updatesMap)) {
        await conn.query(
          `UPDATE semielaborados 
           SET stock_33 = COALESCE(?, stock_33), 
               stock_26 = COALESCE(?, stock_26), 
               stock_ayolas = COALESCE(?, stock_ayolas), 
               stock_37 = COALESCE(?, stock_37) 
           WHERE codigo = ?`,
          [
            stocks.stock_33 !== undefined ? stocks.stock_33 : null,
            stocks.stock_26 !== undefined ? stocks.stock_26 : null,
            stocks.stock_ayolas !== undefined ? stocks.stock_ayolas : null,
            stocks.stock_37 !== undefined ? stocks.stock_37 : null,
            codeUpper,
          ],
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/semielaborados/previsualizar-sheets", async (req, res) => {
  try {
    const updatesMap = {};

    for (const [sucursalKey, csvUrl] of Object.entries(STOCK_URLS)) {
      if (!csvUrl || csvUrl.startsWith("PEGA_AQUI")) continue;
      const response = await fetch(csvUrl);
      if (!response.ok) continue;
      const text = await response.text();
      const lines = text.split("\n");

      for (let line of lines) {
        const cols = parseCSVLine(line);
        if (cols.length < 5 || !cols[0]) continue;
        const codeUpper = cols[0].toUpperCase().trim();
        if (EXCLUDED_CODES.includes(codeUpper)) continue;

        const parsedStock = parseFloat(cols[4].replace(",", ".")) || 0;

        if (!updatesMap[codeUpper]) {
          updatesMap[codeUpper] = {
            codigo: codeUpper,
            nombre: cols[1] ? cols[1].trim() : codeUpper,
            stock_33: 0,
            stock_26: 0,
            stock_ayolas: 0,
            stock_37: 0,
          };
        }
        updatesMap[codeUpper][sucursalKey] = parsedStock;
      }
    }

    const [currentSE] = await db.query("SELECT * FROM semielaborados");
    const currentMap = {};
    currentSE.forEach((s) => {
      currentMap[s.codigo.toUpperCase().trim()] = s;
    });

    const nuevos = [];
    const modificados = [];

    for (const [codeUpper, sheetData] of Object.entries(updatesMap)) {
      const existing = currentMap[codeUpper];
      if (existing) {
        const diff33 = sheetData.stock_33 - (existing.stock_33 || 0);
        const diff26 = sheetData.stock_26 - (existing.stock_26 || 0);
        const diffAyolas =
          sheetData.stock_ayolas - (existing.stock_ayolas || 0);
        const diff37 = sheetData.stock_37 - (existing.stock_37 || 0);

        if (
          Math.abs(diff33) > 0.001 ||
          Math.abs(diff26) > 0.001 ||
          Math.abs(diffAyolas) > 0.001 ||
          Math.abs(diff37) > 0.001
        ) {
          modificados.push({
            id: existing.id,
            codigo: existing.codigo,
            nombre: existing.nombre,
            actual: {
              stock_33: existing.stock_33 || 0,
              stock_26: existing.stock_26 || 0,
              stock_ayolas: existing.stock_ayolas || 0,
              stock_37: existing.stock_37 || 0,
            },
            nuevo: {
              stock_33: sheetData.stock_33,
              stock_26: sheetData.stock_26,
              stock_ayolas: sheetData.stock_ayolas,
              stock_37: sheetData.stock_37,
            },
          });
        }
      } else {
        nuevos.push(sheetData);
      }
    }

    res.json({ nuevos, modificados });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/semielaborados/aplicar-sincronizacion", async (req, res) => {
  const { nuevos, modificados } = req.body;
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    if (Array.isArray(nuevos)) {
      for (const n of nuevos) {
        await conn.query(
          "INSERT INTO semielaborados (codigo, nombre, stock_33, stock_26, stock_ayolas, stock_37) VALUES (?, ?, ?, ?, ?, ?)",
          [
            n.codigo,
            n.nombre,
            n.stock_33 || 0,
            n.stock_26 || 0,
            n.stock_ayolas || 0,
            n.stock_37 || 0,
          ],
        );
      }
    }

    if (Array.isArray(modificados)) {
      for (const m of modificados) {
        await conn.query(
          "UPDATE semielaborados SET stock_33 = ?, stock_26 = ?, stock_ayolas = ?, stock_37 = ? WHERE id = ?",
          [
            m.nuevo.stock_33,
            m.nuevo.stock_26,
            m.nuevo.stock_ayolas,
            m.nuevo.stock_37,
            m.id,
          ],
        );
      }
    }

    await conn.commit();
    res.json({ success: true });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// ==========================================
// MÓDULO 4: PRODUCTOS TERMINADOS Y VENTAS
// ==========================================
app.get("/api/productos-terminados", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.*, COUNT(i.id) as recetas_count 
      FROM productos_terminados p 
      LEFT JOIN ingenierias i ON p.id = i.producto_terminado_id 
      GROUP BY p.id 
      ORDER BY p.orden ASC, p.id ASC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/productos-terminados/sincronizar-ventas", async (req, res) => {
  const csvUrl = req.body?.csvUrl || VENTAS_CSV_URL;
  if (!csvUrl || csvUrl.startsWith("PEGA_AQUI")) {
    return res.status(400).json({
      error: "No se ha configurado la URL de VENTAS_CSV_URL en server.js",
    });
  }

  try {
    const response = await fetch(csvUrl);
    if (!response.ok)
      return res
        .status(400)
        .json({ error: "No se pudo acceder a la URL del CSV" });

    const csvText = await response.text();
    const lines = parseCSVFull(csvText);
    if (lines.length < 2) return res.status(400).json({ error: "CSV vacío" });

    const headers = lines[0].map((h) => h.toUpperCase().trim());
    const idxFecha = headers.indexOf("FECHA");
    const idxModelo = headers.indexOf("MODELO");
    const idxCantidad = headers.indexOf("CANTIDAD");
    const idxEstado = headers.indexOf("ESTADO");

    if (idxFecha === -1 || idxModelo === -1 || idxCantidad === -1) {
      return res
        .status(400)
        .json({ error: "El CSV debe contener FECHA, MODELO y CANTIDAD" });
    }

    let maxFecha = new Date(0);
    const parsedRows = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i];
      if (cols.length <= Math.max(idxFecha, idxModelo, idxCantidad)) continue;

      const estado =
        idxEstado !== -1 ? cols[idxEstado].trim().toUpperCase() : "";
      if (estado === "CANCELADO" || estado === "SIN STOCK") continue;

      const d = parseFechaDeterminista(cols[idxFecha]);
      if (d) {
        const dateObj = new Date(d);
        if (dateObj > maxFecha) maxFecha = dateObj;

        let cant = parseFloat(cols[idxCantidad].replace(",", "."));
        if (isNaN(cant)) cant = 0;

        let cod = cols[idxModelo].trim().toUpperCase();

        const matchMultiplicador = cod.match(/(.*?)\s+X(\d+)$/);
        if (matchMultiplicador) {
          cod = matchMultiplicador[1].trim();
          cant = cant * parseInt(matchMultiplicador[2], 10);
        }

        if (cod && cant > 0) {
          parsedRows.push({ date: dateObj, cod, cant });
        }
      }
    }

    const limiteTrimestre = new Date(maxFecha);
    limiteTrimestre.setDate(limiteTrimestre.getDate() - 93);

    const ventasMap = {};
    for (const row of parsedRows) {
      if (row.date >= limiteTrimestre) {
        if (!ventasMap[row.cod]) ventasMap[row.cod] = 0;
        ventasMap[row.cod] += row.cant;
      }
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        "UPDATE productos_terminados SET promedio_ventas_mensual = 0",
      );

      for (const [cod, totalTrimestre] of Object.entries(ventasMap)) {
        const promedioMensual = totalTrimestre / 3;
        await conn.query(
          `INSERT INTO productos_terminados (codigo, nombre, promedio_ventas_mensual)
           VALUES (?, ?, ?) 
           ON DUPLICATE KEY UPDATE promedio_ventas_mensual = VALUES(promedio_ventas_mensual)`,
          [cod, cod, promedioMensual],
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    res.json({ success: true, count: Object.keys(ventasMap).length });
  } catch (error) {
    console.error("Error en sincronización:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// MÓDULO 5: INGENIERÍAS / BOM
// ==========================================
app.get("/api/ingenierias/semielaborado/:id", async (req, res) => {
  try {
    const [ingenierias] = await db.query(
      "SELECT * FROM ingenierias WHERE semielaborado_id = ? ORDER BY es_activa DESC, id DESC",
      [req.params.id],
    );

    const result = [];
    for (const ing of ingenierias) {
      const [ingredientes] = await db.query(
        `SELECT d.id, d.ingenieria_id, d.materia_prima_id, d.semielaborado_id, d.cantidad, d.cantidad_tachada, d.unidad_medida, 
                COALESCE(mp.codigo, se.codigo) as item_codigo, 
                COALESCE(mp.nombre, se.nombre) as item_nombre, 
                CASE WHEN d.materia_prima_id IS NOT NULL THEN 'MP' ELSE 'SE' END as item_type 
         FROM ingenieria_detalles d 
         LEFT JOIN materias_primas mp ON d.materia_prima_id = mp.id 
         LEFT JOIN semielaborados se ON d.semielaborado_id = se.id 
         WHERE d.ingenieria_id = ?`,
        [ing.id],
      );
      result.push({ ...ing, ingredientes });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/ingenierias/producto-terminado/:id", async (req, res) => {
  try {
    const [ingenierias] = await db.query(
      "SELECT * FROM ingenierias WHERE producto_terminado_id = ? ORDER BY es_activa DESC, id DESC",
      [req.params.id],
    );

    const result = [];
    for (const ing of ingenierias) {
      const [ingredientes] = await db.query(
        `SELECT d.id, d.ingenieria_id, d.materia_prima_id, d.semielaborado_id, d.cantidad, d.cantidad_tachada, d.unidad_medida, 
                COALESCE(mp.codigo, se.codigo) as item_codigo, 
                COALESCE(mp.nombre, se.nombre) as item_nombre, 
                CASE WHEN d.materia_prima_id IS NOT NULL THEN 'MP' ELSE 'SE' END as item_type 
         FROM ingenieria_detalles d 
         LEFT JOIN materias_primas mp ON d.materia_prima_id = mp.id 
         LEFT JOIN semielaborados se ON d.semielaborado_id = se.id 
         WHERE d.ingenieria_id = ?`,
        [ing.id],
      );
      result.push({ ...ing, ingredientes });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/ingenierias/recetas-activas-bulk", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        se.codigo as productCode,
        se.nombre as productName,
        ing.nombre_version as version,
        mp.codigo as item_codigo,
        mp.nombre as item_nombre
      FROM ingenierias ing
      JOIN semielaborados se ON ing.semielaborado_id = se.id
      JOIN ingenieria_detalles d ON d.ingenieria_id = ing.id
      LEFT JOIN materias_primas mp ON d.materia_prima_id = mp.id
      WHERE ing.es_activa = 1 AND d.materia_prima_id IS NOT NULL
    `);

    const recipesMap = {};
    for (const r of rows) {
      const key = `${r.productCode}_${r.version}`;
      if (!recipesMap[key]) {
        recipesMap[key] = {
          productCode: r.productCode,
          productName: r.productName,
          version: r.version,
          ingredientes: [],
        };
      }
      recipesMap[key].ingredientes.push({
        item_codigo: r.item_codigo,
        item_nombre: r.item_nombre,
      });
    }

    res.json(Object.values(recipesMap));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// OBTENER PLANIFICACIÓN OT
app.get("/api/planificacion-produccion", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM planificacion_ot");
    const planMap = {};
    rows.forEach((r) => {
      planMap[r.fecha] =
        typeof r.items === "string" ? JSON.parse(r.items) : r.items;
    });
    res.json(planMap);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener planificación OT" });
  }
});

// GUARDAR / ACTUALIZAR PLANIFICACIÓN OT POR DÍA
app.post("/api/planificacion-produccion", async (req, res) => {
  const planData = req.body; // { "2026-10-07": [...] }
  try {
    for (const [fecha, items] of Object.entries(planData)) {
      await db.query(
        `INSERT INTO planificacion_ot (fecha, items) VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE items = ?`,
        [fecha, JSON.stringify(items), JSON.stringify(items)],
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Error al guardar planificación OT" });
  }
});

// ==========================================
// MÓDULO 6: REGISTRO DE PRODUCCIÓN (MÉTRICAS & CARGAS)
// ==========================================
app.get("/api/metricas/produccion", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM registro_produccion ORDER BY fecha DESC, id DESC",
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get(
  "/api/metricas/produccion/materiales-consumidos/:codigo_ot",
  async (req, res) => {
    try {
      const [consumos] = await db.query(
        `
        SELECT 
          materia_prima_codigo as codigo,
          materia_prima_nombre as nombre,
          unidad_medida as unidad,
          SUM(cantidad_usada) as consumido_real
        FROM registro_produccion_materiales
        WHERE codigo_ot = ?
        GROUP BY materia_prima_codigo, materia_prima_nombre, unidad_medida
      `,
        [req.params.codigo_ot],
      );

      res.json(consumos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

app.post("/api/metricas/produccion/manual", async (req, res) => {
  const {
    fecha,
    categoria_maq,
    codigo_ot,
    codigo,
    articulo,
    cant_buenos,
    kg_total,
    ingenieria_id,
  } = req.body;

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [info] = await conn.query(
      `
        INSERT INTO registro_produccion 
        (fecha, categoria_maq, codigo_ot, codigo, articulo, cant_buenos, kg_total, ingenieria_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        fecha,
        categoria_maq,
        codigo_ot,
        codigo,
        articulo,
        Number(cant_buenos),
        Number(kg_total),
        ingenieria_id || null,
      ],
    );

    const registroId = info.insertId;

    if (ingenieria_id) {
      const [ingredientes] = await conn.query(
        `
          SELECT 
            COALESCE(mp.codigo, se.codigo) as item_codigo,
            COALESCE(mp.nombre, se.nombre) as item_nombre,
            d.cantidad,
            d.unidad_medida
          FROM ingenieria_detalles d
          LEFT JOIN materias_primas mp ON d.materia_prima_id = mp.id
          LEFT JOIN semielaborados se ON d.semielaborado_id = se.id
          WHERE d.ingenieria_id = ?
        `,
        [ingenieria_id],
      );

      for (const ing of ingredientes) {
        const cantidadConsumida = Number(cant_buenos) * (ing.cantidad || 0);
        await conn.query(
          `
            INSERT INTO registro_produccion_materiales 
            (registro_id, codigo_ot, materia_prima_codigo, materia_prima_nombre, cantidad_usada, unidad_medida, fecha)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [
            registroId,
            codigo_ot,
            ing.item_codigo || "",
            ing.item_nombre || "",
            cantidadConsumida,
            ing.unidad_medida || "Kg",
            fecha,
          ],
        );
      }
    }

    await conn.query(
      `
        UPDATE ordenes_trabajo 
        SET cant_producida = cant_producida + ? 
        WHERE codigo_ot = ? AND semielaborado_codigo = ?
      `,
      [Number(cant_buenos), codigo_ot, codigo],
    );

    await conn.commit();
    res.json({ success: true });
  } catch (error) {
    await conn.rollback();
    console.error("DETALLE DEL ERROR EN SERVER:", error.message);
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// Cargar producción pendiente de aprobación por supervisor
app.post("/api/metricas/produccion/cargar-pendiente", async (req, res) => {
  try {
    const {
      codigo_ot,
      semielaborado_codigo,
      articulo,
      cant_buenos,
      cant_fallas,
      fecha,
      operario_nombre,
      observaciones,
    } = req.body;

    const [result] = await db.query(
      `
      INSERT INTO cargas_produccion (codigo_ot, semielaborado_codigo, articulo, cant_buenos, cant_fallas, fecha, operario_nombre, observaciones, estado_aprobacion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')
    `,
      [
        codigo_ot,
        semielaborado_codigo,
        articulo,
        Number(cant_buenos) || 0,
        Number(cant_fallas) || 0,
        fecha,
        operario_nombre || "Operario Planta",
        observaciones || "",
      ],
    );

    res.json({ success: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Consultar cargas de producción (pendientes y aprobadas)
app.get("/api/metricas/produccion/cargas", async (req, res) => {
  try {
    const [cargas] = await db.query(
      "SELECT * FROM cargas_produccion ORDER BY id DESC",
    );
    res.json(cargas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Aprobar Carga de Producción -> Actualiza OT + Genera Registro + Descuenta Materias Primas en BD
app.put("/api/metricas/produccion/aprobar/:id", async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { supervisor_nombre } = req.body;
    const [cargas] = await conn.query(
      "SELECT * FROM cargas_produccion WHERE id = ?",
      [req.params.id],
    );
    const carga = cargas[0];

    if (!carga) {
      conn.release();
      return res
        .status(404)
        .json({ error: "Carga de producción no encontrada" });
    }

    if (carga.estado_aprobacion === "APROBADO") {
      conn.release();
      return res
        .status(400)
        .json({ error: "La carga ya fue aprobada previamente" });
    }

    await conn.beginTransaction();

    // 1. Cambiar estado de la carga a APROBADO
    await conn.query(
      `UPDATE cargas_produccion SET estado_aprobacion = 'APROBADO', supervisor_nombre = ? WHERE id = ?`,
      [supervisor_nombre || "Supervisor", req.params.id],
    );

    // 2. Obtener Semielaborado y Receta Activa
    const [ses] = await conn.query(
      "SELECT id FROM semielaborados WHERE codigo = ?",
      [carga.semielaborado_codigo],
    );
    const se = ses[0];

    let activeIngenieriaId = null;
    if (se) {
      const [recipes] = await conn.query(
        "SELECT id FROM ingenierias WHERE semielaborado_id = ? AND es_activa = 1",
        [se.id],
      );
      if (recipes[0]) activeIngenieriaId = recipes[0].id;
    }

    // 3. Insertar registro formal en registro_produccion para métricas y calendario
    const [infoProd] = await conn.query(
      `
        INSERT INTO registro_produccion 
        (fecha, categoria_maq, codigo_ot, codigo, articulo, cant_buenos, cant_fallas, ingenieria_id)
        VALUES (?, 'EXTRUSIÓN', ?, ?, ?, ?, ?, ?)
      `,
      [
        carga.fecha,
        carga.codigo_ot,
        carga.semielaborado_codigo,
        carga.articulo,
        carga.cant_buenos,
        carga.cant_fallas,
        activeIngenieriaId,
      ],
    );

    const registroId = infoProd.insertId;

    // 4. Actualizar cantidad producida acumulada en la Orden de Trabajo (OT)
    await conn.query(
      `
        UPDATE ordenes_trabajo 
        SET cant_producida = cant_producida + ? 
        WHERE codigo_ot = ? AND semielaborado_codigo = ?
      `,
      [carga.cant_buenos, carga.codigo_ot, carga.semielaborado_codigo],
    );

    // 5. Descontar materias primas del stock según ingredientes de la receta activa
    if (activeIngenieriaId) {
      const [detalles] = await conn.query(
        `
          SELECT d.materia_prima_id, d.cantidad, d.unidad_medida, mp.codigo as item_codigo, mp.nombre as item_nombre
          FROM ingenieria_detalles d
          LEFT JOIN materias_primas mp ON d.materia_prima_id = mp.id
          WHERE d.ingenieria_id = ? AND d.materia_prima_id IS NOT NULL
        `,
        [activeIngenieriaId],
      );

      for (const det of detalles) {
        const descuentoKg =
          Number(carga.cant_buenos) * Number(det.cantidad || 0);

        await moverStock(conn, {
          mp_id: det.materia_prima_id,
          delta: -descuentoKg,
          tipo: "CONSUMO_PRODUCCION",
          usuario: supervisor_nombre || "Supervisor",
          referencia_tipo: "CARGA_ANTERIOR",
          referencia_id: carga.id,
          referencia_texto: `${carga.codigo_ot || "Sin OT"} · ${carga.articulo || carga.semielaborado_codigo || ""}`.trim(),
          detalle: { lote: carga.codigo_ot, fecha: carga.fecha, modelo_codigo: carga.semielaborado_codigo, modelo_nombre: carga.articulo, buenas: carga.cant_buenos, fallas: carga.cant_fallas, operario: carga.operario_nombre },
        });

        await conn.query(
          `
            INSERT INTO registro_produccion_materiales 
            (registro_id, codigo_ot, materia_prima_codigo, materia_prima_nombre, cantidad_usada, unidad_medida, fecha)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [
            registroId,
            carga.codigo_ot,
            det.item_codigo || "",
            det.item_nombre || "",
            descuentoKg,
            det.unidad_medida || "Kg",
            carga.fecha,
          ],
        );
      }
    }

    await conn.commit();
    res.json({ success: true });
  } catch (error) {
    await conn.rollback();
    console.error("Error al aprobar carga:", error.message);
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// Rechazar Carga de Producción
app.delete("/api/metricas/produccion/rechazar/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM cargas_produccion WHERE id = ?", [
      req.params.id,
    ]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/metricas/recargar", async (req, res) => {
  const csvUrl = req.body?.csvUrl || PRODUCCION_CSV_URL;
  if (!csvUrl || csvUrl.startsWith("PEGA_AQUI")) {
    return res
      .status(400)
      .json({ error: "Pega la URL del Google Sheets en PRODUCCION_CSV_URL" });
  }

  try {
    const response = await fetch(csvUrl);
    if (!response.ok)
      return res
        .status(400)
        .json({ error: "No se pudo descargar el archivo CSV" });

    const text = await response.text();
    const rows = parseCSVFull(text);
    if (rows.length < 2)
      return res.status(400).json({ error: "El archivo está vacío" });

    const headers = rows[0].map((h) =>
      h
        .toUpperCase()
        .replace(/\r?\n|\r|\t/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );

    const idxFecha = headers.findIndex((h) => h.includes("FECHA"));
    const idxMaq = headers.findIndex(
      (h) => h.includes("CATEGORÍA MÁQ") || h.includes("CATEGORIA MÁQ"),
    );
    const idxCodigo = headers.findIndex(
      (h) => h === "CODIGO" || h === "CÓDIGO",
    );
    const idxArticulo = headers.findIndex(
      (h) => h === "ARTICULO" || h === "ARTÍCULO",
    );
    const idxBuenos = headers.findIndex(
      (h) => h.includes("CANT. BUENOS") || h.includes("BUENOS"),
    );
    const idxSegunda = headers.findIndex(
      (h) => h.includes("SEGUNDA CALIDAD") || h.includes("SEGUNDA"),
    );
    const idxFallas = headers.findIndex(
      (h) => h.includes("CANT. FALLAS") || h.includes("FALLAS"),
    );
    const idxKgTotal = headers.findIndex(
      (h) => h === "KG TOTAL" || h.includes("KG TOTAL"),
    );
    const idxKgFallas = headers.findIndex(
      (h) => h === "KG FALLAS" || h.includes("KG FALLAS"),
    );

    const conn = await db.getConnection();
    let count = 0;

    try {
      await conn.beginTransaction();
      await conn.query("DELETE FROM registro_produccion");

      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i];
        if (cols.length < 5) continue;
        if (
          (!cols[idxCodigo] || cols[idxCodigo].trim() === "") &&
          (!cols[idxArticulo] || cols[idxArticulo].trim() === "")
        )
          continue;

        const fechaFormatted =
          parseFechaDeterminista(cols[idxFecha]) || "1970-01-01";

        const parseNum = (val) => {
          if (!val || val === "-") return 0;
          const num = parseFloat(String(val).replace(",", "."));
          return isNaN(num) ? 0 : num;
        };

        const codigoVal =
          idxCodigo !== -1 && cols[idxCodigo]
            ? cols[idxCodigo].toUpperCase()
            : "";
        const articuloVal =
          idxArticulo !== -1 && cols[idxArticulo] ? cols[idxArticulo] : "";

        let catMaqVal =
          idxMaq !== -1 && cols[idxMaq]
            ? cols[idxMaq].toUpperCase().trim()
            : "";
        if (!catMaqVal || catMaqVal === "NAN" || catMaqVal === "GENERAL") {
          catMaqVal = inferMachineCategory(codigoVal, articuloVal);
        }

        await conn.query(
          `
          INSERT INTO registro_produccion 
          (fecha, categoria_maq, codigo, articulo, cant_buenos, segunda_calidad, cant_fallas, kg_total, kg_fallas)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            fechaFormatted,
            catMaqVal,
            codigoVal,
            articuloVal,
            idxBuenos !== -1 ? parseNum(cols[idxBuenos]) : 0,
            idxSegunda !== -1 ? parseNum(cols[idxSegunda]) : 0,
            idxFallas !== -1 ? parseNum(cols[idxFallas]) : 0,
            idxKgTotal !== -1 ? parseNum(cols[idxKgTotal]) : 0,
            idxKgFallas !== -1 ? parseNum(cols[idxKgFallas]) : 0,
          ],
        );
        count++;
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// MÓDULO 7: GRUPOS DE ALERTA DE STOCK
// ==========================================
app.get("/api/grupos-alerta", async (req, res) => {
  try {
    const [grupos] = await db.query(
      "SELECT * FROM grupos_alerta ORDER BY id ASC",
    );
    res.json(grupos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/grupos-alerta", async (req, res) => {
  try {
    const { id, nombre, dias_critico, dias_alerta } = req.body;
    if (!nombre || dias_critico === undefined || dias_alerta === undefined) {
      return res.status(400).json({ error: "Faltan campos obligatorios." });
    }

    if (id) {
      await db.query(
        `
        UPDATE grupos_alerta 
        SET nombre = ?, dias_critico = ?, dias_alerta = ? 
        WHERE id = ?
      `,
        [nombre.trim(), Number(dias_critico), Number(dias_alerta), id],
      );
    } else {
      await db.query(
        `
        INSERT INTO grupos_alerta (nombre, dias_critico, dias_alerta, es_predeterminado) 
        VALUES (?, ?, ?, 0)
      `,
        [nombre.trim(), Number(dias_critico), Number(dias_alerta)],
      );
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/grupos-alerta/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(
      "DELETE FROM grupos_alerta WHERE id = ? AND es_predeterminado = 0",
      [id],
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// MÓDULO 8: ÓRDENES DE TRABAJO (PLANIFICACIÓN)
// ==========================================
app.get("/api/ordenes-trabajo", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM ordenes_trabajo ORDER BY id DESC",
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/ordenes-trabajo", async (req, res) => {
  try {
    const {
      codigo_ot,
      semielaborado_codigo,
      articulo,
      maquina,
      destino,
      cant_objetivo,
      kg_por_unidad,
      estado,
      fecha_inicio,
      velocidad_u_hora,
    } = req.body;

    const [info] = await db.query(
      `
      INSERT INTO ordenes_trabajo 
      (codigo_ot, semielaborado_codigo, articulo, maquina, destino, cant_objetivo, kg_por_unidad, estado, fecha_inicio, velocidad_u_hora)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        codigo_ot,
        semielaborado_codigo,
        articulo || semielaborado_codigo,
        maquina,
        destino || "Stock",
        cant_objetivo || 1000,
        kg_por_unidad || 1.0,
        estado || "PROGRAMADO",
        fecha_inicio || "",
        velocidad_u_hora || 100,
      ],
    );

    res.json({ success: true, id: info.insertId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/ordenes-trabajo/:id/estado", async (req, res) => {
  try {
    const { estado } = req.body;
    await db.query("UPDATE ordenes_trabajo SET estado = ? WHERE id = ?", [
      estado,
      req.params.id,
    ]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/ordenes-trabajo/ot/:codigo_ot/estado-lote", async (req, res) => {
  try {
    const { estado } = req.body;
    const { codigo_ot } = req.params;
    await db.query(
      "UPDATE ordenes_trabajo SET estado = ? WHERE codigo_ot = ?",
      [estado, codigo_ot],
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/ordenes-trabajo/:id", async (req, res) => {
  try {
    const { velocidad_u_hora, cant_objetivo, fecha_inicio, articulo, destino } =
      req.body;

    await db.query(
      `
      UPDATE ordenes_trabajo 
      SET velocidad_u_hora = COALESCE(?, velocidad_u_hora),
          cant_objetivo = COALESCE(?, cant_objetivo),
          fecha_inicio = COALESCE(?, fecha_inicio),
          articulo = COALESCE(?, articulo),
          destino = COALESCE(?, destino)
      WHERE id = ?
    `,
      [
        velocidad_u_hora ?? null,
        cant_objetivo ?? null,
        fecha_inicio ?? null,
        articulo ?? null,
        destino ?? null,
        req.params.id,
      ],
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/ordenes-trabajo/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM ordenes_trabajo WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// MÓDULO SOLICITUDES INTERNAS (PERSISTENTE)
// ==========================================

// Helper para parsear JSON de retiros de MySQL
const parseRetirosHistorial = (hist) => {
  if (!hist) return [];
  if (typeof hist === "string") {
    try {
      return JSON.parse(hist);
    } catch (e) {
      return [];
    }
  }
  return Array.isArray(hist) ? hist : [];
};

// Helper para formatear fechas de MySQL a formato YYYY-MM-DD HH:mm:ss sin usar UTC
const formatLocal = (dateInput) => {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// 1. OBTENER TODAS LAS SOLICITUDES
app.get("/api/solicitudes-internas", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        id,
        semielaborado_codigo AS semielaboradoCodigo,
        semielaborado_nombre AS semielaboradoNombre,
        cantidad_solicitada AS cantidadSolicitada,
        cantidad_retirada AS cantidadRetirada,
        urgencia,
        motivo_uso AS motivoUso,
        estado,
        solicitado_at AS solicitadoAt,
        atendido_at AS atendidoAt,
        disponible_at AS disponibleAt,
        entregado_at AS entregadoAt,
        retiros_historial AS retirosHistorial
      FROM solicitudes_internas
      ORDER BY id DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener solicitudes:", error);
    res.status(500).json({ error: "Error al consultar solicitudes." });
  }
});

// 2. CREAR NUEVA SOLICITUD
app.post("/api/solicitudes-internas", async (req, res) => {
  try {
    const {
      id,
      semielaboradoCodigo,
      semielaborado_codigo,
      semielaboradoNombre,
      semielaborado_nombre,
      cantidadSolicitada,
      cantidad_solicitada,
      urgencia,
      motivoUso,
      motivo_uso,
      motivo,
      estado,
      solicitadoAt,
      solicitado_at,
    } = req.body;

    // 1. Normalización de campos (acepta camelCase y snake_case)
    const codigo = semielaboradoCodigo || semielaborado_codigo;
    const nombre = semielaboradoNombre || semielaborado_nombre;
    const cantidad = cantidadSolicitada || cantidad_solicitada;
    const motivoFinal = motivoUso || motivo_uso || motivo || null;
    const urg = urgencia || "MEDIA";
    const est = estado || "SOLICITADO";
    const fecha = solicitadoAt || solicitado_at || new Date();

    // 2. ID de respaldo si la BD exige VARCHAR(20) y no recibe ID del frontend
    const solId = id || `SOL-${Date.now().toString().slice(-5)}`;

    if (!codigo || !cantidad) {
      return res
        .status(400)
        .json({ error: "Faltan datos requeridos (código o cantidad)." });
    }

    // 3. Consulta SQL ajustada a la estructura real de tu tabla MySQL
    const query = `
      INSERT INTO solicitudes_internas 
      (id, semielaborado_codigo, semielaborado_nombre, cantidad_solicitada, urgencia, motivo_uso, estado, solicitado_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.query(query, [
      solId,
      codigo,
      nombre,
      cantidad,
      urg,
      motivoFinal,
      est,
      fecha,
    ]);

    // Aviso en la campanita de producción y admin (no del depósito, que es quien las genera).
    const urgTexto = { BAJA: "baja", MEDIA: "media", ALTA: "alta", URGENTE: "urgente" }[String(urg).toUpperCase()] || String(urg).toLowerCase();
    let quien = "Depósito";
    try {
      quien = await nombreDeUsuario(req);
    } catch {
      /* sin nombre: se avisa igual */
    }
    await crearNotificacion(db, {
      tipo: "SOLICITUD_INTERNA",
      titulo: `Nueva solicitud interna: ${nombre || codigo}`,
      texto: `${cantidad} ${Number(cantidad) === 1 ? "unidad" : "unidades"} · urgencia ${urgTexto}${motivoFinal ? ` · ${motivoFinal}` : ""} · pedida por ${quien}`,
      ruta: "/solicitudes-internas",
      roles: ["ADMIN", "PRODUCCION"],
      creada_por_id: req.user?.id || null,
    });

    return res.json({ success: true, id: solId });
  } catch (error) {
    // Imprime el error real de MySQL en la terminal de Node para diagnóstico inmediato
    console.error("=== ERROR MYSQL AL CREAR SOLICITUD ===");
    console.error(error);
    return res.status(500).json({
      error: "Error interno en el servidor.",
      detalle: error.message,
    });
  }
});

// PUT: EDITAR SOLICITUD INTERNA
app.put("/api/solicitudes-internas/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const cantidad =
      req.body.cantidadSolicitada || req.body.cantidad_solicitada;
    const urgencia = req.body.urgencia;
    const motivo =
      req.body.motivoUso || req.body.motivo_uso || req.body.motivo || "";

    if (!id || id === "undefined") {
      return res.status(400).json({ error: "ID de solicitud no válido." });
    }

    // Acepta tanto "SOL-1" como "1"
    const cleanNumId = String(id).replace(/^SOL-/i, "");

    const query = `
      UPDATE solicitudes_internas 
      SET cantidad_solicitada = ?, 
          urgencia = ?, 
          motivo_uso = ? 
      WHERE id = ? OR id = ?
    `;

    const [result] = await db.query(query, [
      cantidad,
      urgencia,
      motivo,
      id,
      cleanNumId,
    ]);

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: "No se encontró la solicitud para actualizar." });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error al editar solicitud:", error);
    res
      .status(500)
      .json({ error: "Error interno en el servidor al editar la solicitud." });
  }
});

// PUT: CAMBIAR ESTADO DE SOLICITUD
app.put("/api/solicitudes-internas/:id/estado", async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, atendidoAt, disponibleAt } = req.body;

    if (!id || id === "undefined") {
      return res.status(400).json({ error: "ID no válido." });
    }

    // Normaliza el ID por si en MySQL se guarda como '24' o como 'SOL-24'
    const cleanId = String(id).replace(/^SOL-/i, "");

    const query = `
      UPDATE solicitudes_internas 
      SET estado = ?, 
          atendido_at = COALESCE(?, atendido_at),
          disponible_at = COALESCE(?, disponible_at)
      WHERE id = ? OR id = ?
    `;

    const [result] = await db.query(query, [
      estado,
      atendidoAt || null,
      disponibleAt || null,
      id,
      cleanId,
    ]);

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: "No se encontró la solicitud especificada." });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Error al actualizar estado:", error);
    return res.status(500).json({ error: "Error interno en el servidor." });
  }
});

// 4. REGISTRAR EXTRACCIÓN Y RETIRO PARCIAL
app.put("/api/solicitudes-internas/:id/retiro", async (req, res) => {
  const { id } = req.params;
  const { cantidadRetirada, estado, entregadoAt, retirosHistorial } = req.body;

  try {
    await db.query(
      `UPDATE solicitudes_internas 
       SET cantidad_retirada = ?, estado = ?, entregado_at = ?, retiros_historial = ?
       WHERE id = ?`,
      [
        cantidadRetirada,
        estado,
        entregadoAt || null,
        JSON.stringify(retirosHistorial || []),
        id,
      ],
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error al registrar retiro:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// HELPER: OBTENER DÓLAR OFICIAL EN TIEMPO REAL (BANCO NACIÓN)
// ==========================================
const obtenerDolarOficial = async () => {
  try {
    const response = await fetch("https://dolarapi.com/v1/dolares/oficial");
    if (!response.ok) return null;
    const data = await response.json();
    return {
      compra: data.compra,
      venta: data.venta,
      fecha: data.fechaActualizacion,
    };
  } catch (err) {
    console.error("Error consultando cotización del dólar:", err);
    return null;
  }
};

// ==========================================
// HELPER PARA CONVERTIR FECHAS DE SHEETS A MYSQL
// ==========================================
const parseFecha = (val) => {
  if (!val) return null;
  const str = String(val).trim();
  if (!str) return null;

  // Si ya está en formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // Parsea formatos como "24/9/26", "24/09/2026", "30/8/26"
  const parts = str.split(/[\/\.-]/);
  if (parts.length === 3) {
    let day = parts[0].padStart(2, "0");
    let month = parts[1].padStart(2, "0");
    let year = parts[2];

    // Convertir año de 2 dígitos (ej: "26" -> "2026")
    if (year.length === 2) {
      year = "20" + year;
    }

    // Si por alguna razón vino como YYYY/MM/DD
    if (parts[0].length === 4) {
      year = parts[0];
      month = parts[1].padStart(2, "0");
      day = parts[2].padStart(2, "0");
    }

    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  }
  return null;
};

// ==========================================
// MÓDULO 9: ESTADO DE PEDIDOS (VENTAS SHEETS)
// ==========================================

// 1. Obtener listado de pedidos
app.get("/api/estado-pedidos", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM estado_pedidos ORDER BY fecha DESC, id DESC LIMIT 500",
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// MÓDULO PEDIDOS - ENDPOINTS
// ==========================================

// 1. OBTENER LISTADO DE PEDIDOS CON SU AVANCE
app.get("/api/pedidos", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.*, 
        COUNT(i.id) as total_items,
        SUM(CASE WHEN i.completado = 1 THEN 1 ELSE 0 END) as items_completados
      FROM pedidos p
      LEFT JOIN pedido_items i ON p.id = i.pedido_id
      GROUP BY p.id
      ORDER BY p.id DESC
    `);
    res.json(rows || []);
  } catch (error) {
    console.error("Error al obtener pedidos:", error);
    res.status(500).json({ error: "Error al obtener pedidos." });
  }
});

// BUSCAR OP EN 'estado_pedidos' (TRAE ÚNICAMENTE LA VERSIÓN MÁS RECIENTE)
app.get("/api/estado-pedidos/op/:op", async (req, res) => {
  try {
    const { op } = req.params;
    const cleanOp = op.trim().replace(/^OP-/i, "");

    // 1. Buscamos todas las coincidencias y las ordenamos por fecha (la más nueva primero)
    const [rows] = await db.query(
      `SELECT * FROM estado_pedidos 
       WHERE op = ? OR op = ?
       ORDER BY fecha DESC, id DESC`,
      [cleanOp, `OP-${cleanOp}`],
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: "No se encontró la OP especificada." });
    }

    // 2. Capturamos la fecha del primer registro (que obligatoriamente es la más reciente por el ORDER BY)
    const fechaMasReciente = rows[0].fecha;

    // 3. Filtramos la lista para quedarnos SÓLO con los renglones que coincidan con esa fecha exacta
    // Así se ignora cualquier artículo que pertenezca a la misma OP pero de años anteriores.
    const rowsRecientes = rows.filter((r) => {
      if (!r.fecha || !fechaMasReciente) return true;
      // Comparamos el valor de tiempo exacto para descartar fechas viejas
      return (
        new Date(r.fecha).getTime() === new Date(fechaMasReciente).getTime()
      );
    });

    const primerRow = rowsRecientes[0];
    const articulos = rowsRecientes.map((r, index) => ({
      id: r.id || index,
      modelo: r.modelo || r.detalles || "ARTÍCULO SIN ESPECIFICAR",
      cantidad: Number(r.cantidad) || 0,
    }));

    res.json({
      op: primerRow.op,
      cliente: primerRow.cliente || "CLIENTE S/N",
      fecha: primerRow.fecha || primerRow.created_at || new Date(),
      articulos: articulos,
    });
  } catch (error) {
    console.error("Error al buscar OP:", error);
    res.status(500).json({ error: "Error al consultar la OP." });
  }
});

// CREAR NUEVOS PEDIDOS INDIVIDUALES POR ARTÍCULO (ADMIN)
app.post("/api/pedidos", async (req, res) => {
  try {
    const { op, cliente, fecha, articulosSeleccionados } = req.body;

    if (
      !op ||
      !cliente ||
      !articulosSeleccionados ||
      !articulosSeleccionados.length
    ) {
      return res
        .status(400)
        .json({ error: "Faltan datos o no seleccionaste ningún artículo." });
    }

    // Por cada artículo marcado, creamos un Pedido INDEPENDIENTE en la BD
    for (const art of articulosSeleccionados) {
      const modeloLimpio = art.modelo.trim().toUpperCase();
      const cantidadArticulo = Number(art.cantidad) || 0;

      const [result] = await db.query(
        `INSERT INTO pedidos (op, cliente, articulo, cantidad_total, cantidad_completada, estado, fecha) 
         VALUES (?, ?, ?, ?, 0, 'PENDIENTE', ?)`,
        [op, cliente, modeloLimpio, cantidadArticulo, fecha || new Date()],
      );

      const pedidoId = result.insertId;

      // Autocreamos el primer checkpoint con el nombre del artículo
      await db.query(
        `INSERT INTO pedido_items (pedido_id, descripcion, cantidad_objetivo, cantidad_completada, completado) 
         VALUES (?, ?, ?, 0, 0)`,
        [pedidoId, modeloLimpio, cantidadArticulo],
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error al crear los pedidos:", error);
    res
      .status(500)
      .json({ error: "Error al guardar los pedidos en la base de datos." });
  }
});

// 4. OBTENER DETALLES COMPLETOS DE UN PEDIDO (ITEMS + HISTORIAL DE AVANCES)
app.get("/api/pedidos/:id/detalles", async (req, res) => {
  try {
    const { id } = req.params;

    const [pedidos] = await db.query(`SELECT * FROM pedidos WHERE id = ?`, [
      id,
    ]);
    if (pedidos.length === 0) {
      return res.status(404).json({ error: "Pedido no encontrado." });
    }

    const [items] = await db.query(
      `SELECT * FROM pedido_items WHERE pedido_id = ? ORDER BY id ASC`,
      [id],
    );
    const [historial] = await db.query(
      `SELECT h.*, i.descripcion as item_nombre 
       FROM pedido_historial h
       LEFT JOIN pedido_items i ON h.item_id = i.id
       WHERE h.pedido_id = ? 
       ORDER BY h.id DESC`,
      [id],
    );

    res.json({
      pedido: pedidos[0],
      items: items || [],
      historial: historial || [],
    });
  } catch (error) {
    console.error("Error al obtener detalles del pedido:", error);
    res.status(500).json({ error: "Error al cargar los detalles." });
  }
});

// AGREGAR ÍTEM / CHECKPOINT (SI NO HAY CANTIDAD, ES CHECKLIST COMÚN)
app.post("/api/pedidos/:id/items", async (req, res) => {
  try {
    const { id } = req.params;
    const { descripcion, cantidadObjetivo } = req.body;
    const cantNum = Number(cantidadObjetivo) || 0; // 0 = Checklist común

    if (!descripcion || !descripcion.trim()) {
      return res.status(400).json({ error: "Falta la descripción del ítem." });
    }

    const [result] = await db.query(
      `INSERT INTO pedido_items (pedido_id, descripcion, cantidad_objetivo, cantidad_completada, completado) 
       VALUES (?, ?, ?, 0, 0)`,
      [id, descripcion.trim().toUpperCase(), cantNum],
    );

    res.json({ success: true, itemId: result.insertId });
  } catch (error) {
    console.error("Error al agregar ítem:", error);
    res.status(500).json({ error: "Error al guardar el ítem." });
  }
});

// TILDAR/MARCAR LISTO UN CHECKLIST COMÚN (SIN CANTIDAD)
app.put("/api/pedidos/:id/items/:itemId/tildar", async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { usuario, fechaHora } = req.body;

    // Marcar como completado
    await db.query(
      `UPDATE pedido_items SET completado = 1 WHERE id = ? AND pedido_id = ?`,
      [itemId, id],
    );

    // Obtener la descripción del ítem para el log
    const [itemRows] = await db.query(
      `SELECT descripcion FROM pedido_items WHERE id = ?`,
      [itemId],
    );
    const desc = itemRows[0]?.descripcion || "Ítem";

    // Auditoría
    await db.query(
      `INSERT INTO pedido_historial (pedido_id, item_id, cantidad_avanzada, usuario, fecha_hora) 
       VALUES (?, ?, 0, ?, ?)`,
      [id, itemId, usuario || "Producción", fechaHora || new Date()],
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error al tildar ítem:", error);
    res.status(500).json({ error: "Error al marcar ítem." });
  }
});

// GUARDAR / ACTUALIZAR OBSERVACIONES DEL PEDIDO
app.put("/api/pedidos/:id/observaciones", async (req, res) => {
  try {
    const { id } = req.params;
    const { observaciones } = req.body;

    await db.query(`UPDATE pedidos SET observaciones = ? WHERE id = ?`, [
      observaciones ? observaciones.trim() : null,
      id,
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error("Error al guardar observaciones:", error);
    res.status(500).json({ error: "Error al guardar observaciones." });
  }
});

// 6. REGISTRAR AVANCE PARCIAL O TOTAL EN UN ÍTEM (PRODUCCIÓN/ADMIN)
app.put("/api/pedidos/:id/items/:itemId/avance", async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { cantidadAvanzada, usuario, fechaHora } = req.body;
    const qty = Number(cantidadAvanzada);

    if (!qty || qty <= 0) {
      return res.status(400).json({ error: "Ingresá una cantidad válida." });
    }

    // 1. Actualizar el ítem específico que se avanzó
    const [itemRows] = await db.query(
      `SELECT * FROM pedido_items WHERE id = ? AND pedido_id = ?`,
      [itemId, id],
    );
    if (itemRows.length === 0) {
      return res.status(404).json({ error: "Ítem no encontrado." });
    }

    const itemObj = itemRows[0];
    const nuevaCantCompletada = Math.min(
      itemObj.cantidad_completada + qty,
      itemObj.cantidad_objetivo,
    );
    const estaCompletado =
      nuevaCantCompletada >= itemObj.cantidad_objetivo ? 1 : 0;

    await db.query(
      `UPDATE pedido_items SET cantidad_completada = ?, completado = ? WHERE id = ?`,
      [nuevaCantCompletada, estaCompletado, itemId],
    );

    // 2. Registrar log de auditoría
    await db.query(
      `INSERT INTO pedido_historial (pedido_id, item_id, cantidad_avanzada, usuario, fecha_hora) 
       VALUES (?, ?, ?, ?, ?)`,
      [id, itemId, qty, usuario || "Producción", fechaHora || new Date()],
    );

    // 3. RECALCULAR ESTADO GLOBAL BASADO **SÓLO** EN EL ARTÍCULO PRINCIPAL (El 1er ítem)
    const [mainItemRows] = await db.query(
      `SELECT * FROM pedido_items WHERE pedido_id = ? ORDER BY id ASC LIMIT 1`,
      [id],
    );

    let completadoPedido = 0;
    let nuevoEstado = "PENDIENTE";

    if (mainItemRows.length > 0) {
      const mainItem = mainItemRows[0];
      completadoPedido = mainItem.cantidad_completada; // SÓLO toma el avance del artículo

      if (completadoPedido === 0) {
        nuevoEstado = "PENDIENTE";
      } else if (
        completadoPedido >= mainItem.cantidad_objetivo &&
        mainItem.cantidad_objetivo > 0
      ) {
        nuevoEstado = "COMPLETADO";
      } else {
        nuevoEstado = "EN_PROCESO";
      }
    }

    // Si el artículo principal sigue en 0, pero Producción empezó una tarea secundaria, lo pasamos a EN_PROCESO
    if (nuevoEstado === "PENDIENTE") {
      const [anyProgress] = await db.query(
        `SELECT COUNT(*) as count FROM pedido_items WHERE pedido_id = ? AND (cantidad_completada > 0 OR completado = 1)`,
        [id],
      );
      if (anyProgress[0].count > 0) {
        nuevoEstado = "EN_PROCESO";
      }
    }

    // 4. Actualizar tabla principal de pedidos (Sin sumar basura de otras tareas)
    await db.query(
      `UPDATE pedidos SET cantidad_completada = ?, estado = ? WHERE id = ?`,
      [completadoPedido, nuevoEstado, id],
    );

    res.json({ success: true, estadoPedido: nuevoEstado });
  } catch (error) {
    console.error("Error al registrar avance:", error);
    res.status(500).json({ error: "Error interno al registrar el avance." });
  }
});

// 7. TILDAR/MARCAR LISTO UN CHECKLIST COMÚN (SIN CANTIDAD)
app.put("/api/pedidos/:id/items/:itemId/tildar", async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { usuario, fechaHora } = req.body;

    await db.query(
      `UPDATE pedido_items SET completado = 1 WHERE id = ? AND pedido_id = ?`,
      [itemId, id],
    );

    await db.query(
      `INSERT INTO pedido_historial (pedido_id, item_id, cantidad_avanzada, usuario, fecha_hora) 
       VALUES (?, ?, 0, ?, ?)`,
      [id, itemId, usuario || "Producción", fechaHora || new Date()],
    );

    // Actualizamos a EN_PROCESO si estaba PENDIENTE, pero NO alteramos la cantidad global
    await db.query(
      `UPDATE pedidos SET estado = 'EN_PROCESO' WHERE id = ? AND estado = 'PENDIENTE'`,
      [id],
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error al tildar ítem:", error);
    res.status(500).json({ error: "Error al marcar ítem." });
  }
});

// ARCHIVAR / DESARCHIVAR PEDIDO (SÓLO ADMIN)
app.put("/api/pedidos/:id/archivar", async (req, res) => {
  try {
    const { id } = req.params;
    const { archivado } = req.body; // true (1) o false (0)
    const valor = archivado ? 1 : 0;

    const [result] = await db.query(
      "UPDATE pedidos SET archivado = ? WHERE id = ?",
      [valor, id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Pedido no encontrado." });
    }

    res.json({ success: true, archivado: valor });
  } catch (error) {
    console.error("Error al archivar pedido:", error);
    res.status(500).json({ error: "Error al actualizar estado de archivado." });
  }
});

// Helper para normalizar números argentinos ("6.738,02" -> 6738.02)
const parsearMonedaArg = (str) => {
  if (!str) return 0;
  const limpio = str.replace(/[^\d,\.]/g, "").trim();
  if (!limpio) return 0;
  const estandar = limpio.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(estandar);
  return isNaN(num) ? 0 : num;
};

// Helper para convertir nombres de mes a formato YYYY-MM
const parsearMesAnio = (texto) => {
  const mesesMap = {
    enero: "01",
    febrero: "02",
    marzo: "03",
    abril: "04",
    mayo: "05",
    junio: "06",
    julio: "07",
    agosto: "08",
    septiembre: "09",
    octubre: "10",
    noviembre: "11",
    diciembre: "12",
  };
  const match = texto
    .toLowerCase()
    .match(
      /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)[^\d]*(\d{4})/,
    );
  if (!match) return null;
  const mesNum = mesesMap[match[1]];
  const anio = match[2];
  const nombreMes = match[1].charAt(0).toUpperCase() + match[1].slice(1);
  return {
    periodo: `${anio}-${mesNum}`,
    label: `${nombreMes} ${anio}`,
  };
};

// ENDPOINT DE SINCRONIZACIÓN EXACTO (TABLEPRESS UOYEP)
app.post("/api/fichero/sincronizar-uoyep", async (req, res) => {
  try {
    const respuestaWeb = await fetch(
      "https://www.uoyepweb.org.ar/escala-salarial/",
      {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      },
    );

    if (!respuestaWeb.ok) {
      throw new Error(`Error HTTP al consultar UOYEP: ${respuestaWeb.status}`);
    }

    const html = await respuestaWeb.text();
    const $ = cheerio.load(html);

    const $tabla = $("#tablepress-16").length
      ? $("#tablepress-16")
      : $("table").first();
    if (!$tabla.length) {
      return res
        .status(404)
        .json({ error: "No se encontró la tabla de UOYEP" });
    }

    // 1. Detectar períodos y mapear el índice exacto de su columna
    const periodosDetectados = [];
    const filaMeses = $tabla.find("tr.row-1").children();

    filaMeses.each((colIdx, el) => {
      const texto = $(el).text().trim();
      const parsed = parsearMesAnio(texto);
      if (parsed) {
        periodosDetectados.push({
          periodo: parsed.periodo,
          label: parsed.label,
          colValorHora: colIdx, // Índice directo de la columna Valor Hora (1, 4, 7, 10, 13, 16)
          colSumaFija: colIdx + 1, // Suma fija contigua
        });
      }
    });

    if (periodosDetectados.length === 0) {
      return res
        .status(422)
        .json({ error: "No se pudieron detectar los períodos" });
    }

    // 2. Guardar períodos en la base de datos
    for (let i = 0; i < periodosDetectados.length; i++) {
      const p = periodosDetectados[i];
      await db.query(
        `INSERT INTO fichero_uoyep_periodos (periodo, label, orden)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE label = VALUES(label), orden = VALUES(orden)`,
        [p.periodo, p.label, i],
      );
    }

    // Limpiar tabla de valores para remover datos desfasados previos
    await db.query("DELETE FROM fichero_uoyep_valores");

    // 3. Recorrer las filas del cuerpo
    let areaActual = "Producción";
    const filas = $tabla.find("tbody tr");

    for (let r = 0; r < filas.length; r++) {
      const celdas = $(filas[r]).children();
      if (celdas.length === 0) continue;

      const textoPrimeraCol = $(celdas[0]).text().trim();
      if (!textoPrimeraCol || textoPrimeraCol === "Categorías") continue;

      // Detección de subtítulos de área ("Producción", "Mantenimiento", "Administrativas")
      const lower = textoPrimeraCol.toLowerCase();
      if (
        lower === "producción" ||
        lower === "mantenimiento" ||
        lower === "administrativas"
      ) {
        areaActual = textoPrimeraCol;
        continue;
      }

      const nombreCategoria = textoPrimeraCol.toUpperCase();
      const codigoCategoria = nombreCategoria
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9]/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 50);

      // Guardar categoría
      await db.query(
        `INSERT INTO fichero_uoyep_categorias (codigo, nombre, area)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), area = VALUES(area)`,
        [codigoCategoria, nombreCategoria, areaActual],
      );

      // Guardar tarifas leyendo el índice real de cada mes
      for (const p of periodosDetectados) {
        if (p.colValorHora < celdas.length) {
          const valHora = parsearMonedaArg($(celdas[p.colValorHora]).text());
          const sumaNoRem =
            p.colSumaFija < celdas.length
              ? parsearMonedaArg($(celdas[p.colSumaFija]).text())
              : 0;

          await db.query(
            `INSERT INTO fichero_uoyep_valores (categoria_codigo, periodo, valor_hora, suma_no_remunerativa)
             VALUES (?, ?, ?, ?)`,
            [codigoCategoria, p.periodo, valHora, sumaNoRem],
          );
        }
      }
    }

    res.json({ success: true, totalPeriodos: periodosDetectados.length });
  } catch (err) {
    console.error("Error sincronizando con UOYEP:", err);
    res.status(500).json({ error: err.message });
  }
});

// 2. ENDPOINT PARA CONSULTAR LA ESCALA ACTIVA
app.get("/api/fichero/escala-uoyep", async (req, res) => {
  try {
    const conMarcaPago = await asegurarColumnaPagoMensual(db);
    const [periodos] = await db.query(
      "SELECT periodo, label FROM fichero_uoyep_periodos ORDER BY orden ASC, periodo ASC",
    );
    const [categorias] = await db.query(
      `SELECT codigo, nombre, area${conMarcaPago ? ", pago_mensual" : ""} FROM fichero_uoyep_categorias ORDER BY area ASC, nombre ASC`,
    );
    const [valores] = await db.query(
      "SELECT categoria_codigo, periodo, valor_hora, suma_no_remunerativa FROM fichero_uoyep_valores",
    );
    const [asignaciones] = await db.query(
      "SELECT nombre_operario, categoria_codigo FROM fichero_operarios_categorias",
    );

    res.json({ periodos, categorias, valores, asignaciones });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// MARCAR UNA CATEGORÍA COMO MENSUAL / POR HORA / AUTOMÁTICA
app.post("/api/fichero/categoria-pago", async (req, res) => {
  try {
    const { codigo, pago } = req.body || {};
    const valor = pago === "MENSUAL" ? 1 : pago === "HORA" ? 0 : null;
    if (!codigo) return res.status(400).json({ error: "Falta la categoría." });
    await asegurarColumnaPagoMensual(db);
    const [r] = await db.query("UPDATE fichero_uoyep_categorias SET pago_mensual = ? WHERE codigo = ?", [valor, codigo]);
    if (!r.affectedRows) return res.status(404).json({ error: "Categoría inexistente." });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. ASIGNAR CATEGORÍA A OPERARIO
app.post("/api/fichero/asignar-categoria", async (req, res) => {
  try {
    const { nombre_operario, categoria_codigo } = req.body;
    await db.query(
      `INSERT INTO fichero_operarios_categorias (nombre_operario, categoria_codigo)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE categoria_codigo = VALUES(categoria_codigo)`,
      [nombre_operario, categoria_codigo || null],
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 1. Obtener el último N° de registro almacenado en la base de datos
app.get("/api/fichero/ultimo", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT MAX(rec_no) AS ultimo_rec FROM fichadas",
    );
    let ultimo = rows[0]?.ultimo_rec || 0;
    // Las marcas descartadas como duplicadas también cuentan como "ya leídas",
    // si no el script las volvería a pedir al reloj en cada ciclo.
    try {
      const [dup] = await db.query(
        "SELECT MAX(rec_no) AS ultimo_rec FROM fichadas_duplicadas",
      );
      ultimo = Math.max(ultimo, dup[0]?.ultimo_rec || 0);
    } catch {
      /* la tabla aún no existe: no hay duplicadas */
    }
    return res.json({ ultimo_rec: ultimo });
  } catch (error) {
    console.error("Error al consultar último registro:", error);
    return res.status(500).json({ error: error.message });
  }
});

// 2. Recibir e insertar las fichadas nuevas
app.post("/api/fichero/sync", async (req, res) => {
  let { registros } = req.body;

  if (!registros || !Array.isArray(registros) || registros.length === 0) {
    return res.json({
      mensaje: "Sin registros nuevos para insertar.",
      insertados: 0,
    });
  }

  try {
    await asegurarTablaDuplicadas(db);
    const fila = (r) => [
      r.rec_no,
      r.empleado_id,
      r.nombre,
      r.fecha_hora,
      r.tipo,
      r.metodo || "Facial",
    ];

    // Registros ya procesados antes (guardados o descartados): se ignoran, así
    // un reenvío no se confunde con un duplicado de sí mismo.
    const recs = registros.map((r) => r.rec_no);
    const [yaG] = await db.query("SELECT rec_no FROM fichadas WHERE rec_no IN (?)", [recs]);
    const [yaD] = await db.query("SELECT rec_no FROM fichadas_duplicadas WHERE rec_no IN (?)", [recs]);
    const conocidos = new Set([...yaG, ...yaD].map((x) => Number(x.rec_no)));
    registros = registros.filter((r) => !conocidos.has(Number(r.rec_no)));
    if (!registros.length) {
      return res.json({ ok: true, insertados: 0, duplicadas_descartadas: 0 });
    }

    // Fichadas ya guardadas cerca de las que llegan (para comparar contra ellas)
    const ids = [...new Set(registros.map((r) => r.empleado_id))];
    const tiempos = registros.map((r) => new Date(String(r.fecha_hora).replace(" ", "T")).getTime());
    const margen = 10 * 60 * 1000;
    const desde = new Date(Math.min(...tiempos) - margen);
    const hasta = new Date(Math.max(...tiempos) + margen);
    const fmt = (d) => {
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    };
    const [existentes] = await db.query(
      `SELECT empleado_id, nombre, tipo, fecha_hora FROM fichadas
       WHERE empleado_id IN (?) AND fecha_hora BETWEEN ? AND ?`,
      [ids, fmt(desde), fmt(hasta)],
    );

    const { nuevos, duplicados } = separarDuplicadas(registros, existentes);

    let insertados = 0;
    if (nuevos.length) {
      // INSERT IGNORE descarta registros si el rec_no ya existe
      const [resultado] = await db.query(
        `INSERT IGNORE INTO fichadas
         (rec_no, empleado_id, nombre, fecha_hora, tipo, metodo)
         VALUES ?`,
        [nuevos.map(fila)],
      );
      insertados = resultado.affectedRows;
    }
    if (duplicados.length) {
      await db.query(
        `INSERT IGNORE INTO fichadas_duplicadas
         (rec_no, empleado_id, nombre, fecha_hora, tipo, metodo)
         VALUES ?`,
        [duplicados.map(fila)],
      );
    }
    console.log(
      `✔ Sincronización: ${insertados} fichadas insertadas, ${duplicados.length} duplicadas descartadas.`,
    );

    return res.json({
      ok: true,
      insertados,
      duplicadas_descartadas: duplicados.length,
    });
  } catch (error) {
    console.error("Error al guardar fichadas:", error);
    return res.status(500).json({ error: error.message });
  }
});

// 3. Consultar fichadas ordenadas para la app de gestión
app.get("/api/fichero/historial", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM fichadas ORDER BY fecha_hora DESC",
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// OBTENER FERIADOS Y AJUSTES DE DÍAS
app.get("/api/fichero/configuracion-dias", async (req, res) => {
  try {
    const [feriados] = await db.query(
      "SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, descripcion FROM fichero_feriados",
    );
    const [ajustes] = await db.query(
      "SELECT nombre_operario, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, TIME_FORMAT(hora_inicio_pactada, '%H:%i') AS hora_inicio_pactada, horas_normales, todas_extra FROM fichero_ajustes_dias",
    );
    res.json({ feriados, ajustes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// TOGGLE / GUARDAR FERIADO (GLOBAL)
app.post("/api/fichero/feriado", async (req, res) => {
  try {
    const { fecha, es_feriado, descripcion } = req.body;
    if (es_feriado) {
      await db.query(
        "INSERT INTO fichero_feriados (fecha, descripcion) VALUES (?, ?) ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion)",
        [fecha, descripcion || "Feriado"],
      );
    } else {
      await db.query("DELETE FROM fichero_feriados WHERE fecha = ?", [fecha]);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GUARDAR AJUSTE DE JORNADA (POR OPERARIO)
app.post("/api/fichero/ajuste-dia", async (req, res) => {
  try {
    const {
      nombre_operario,
      fecha,
      hora_inicio_pactada,
      horas_normales,
      todas_extra,
      eliminar,
    } = req.body;
    if (eliminar) {
      await db.query(
        "DELETE FROM fichero_ajustes_dias WHERE nombre_operario = ? AND fecha = ?",
        [nombre_operario, fecha],
      );
    } else {
      await db.query(
        `INSERT INTO fichero_ajustes_dias (nombre_operario, fecha, hora_inicio_pactada, horas_normales, todas_extra)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           hora_inicio_pactada = VALUES(hora_inicio_pactada),
           horas_normales = VALUES(horas_normales),
           todas_extra = VALUES(todas_extra)`,
        [
          nombre_operario,
          fecha,
          hora_inicio_pactada || null,
          horas_normales ?? 9,
          todas_extra ? 1 : 0,
        ],
      );
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// MÓDULO ESTADO PEDIDOS & DESPACHOS
// ==========================================

// 1. Obtener lista de vendedores y fecha de última sincronización
app.get("/api/estado-pedidos/vendedores", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT DISTINCT vendedor FROM estado_pedidos WHERE vendedor IS NOT NULL AND TRIM(vendedor) != '' AND vendedor != '-' ORDER BY vendedor ASC",
    );
    res.json(rows.map((r) => r.vendedor));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CONSULTAR PENDIENTES DE DESPACHO (Filtro estricto)
app.get("/api/estado-pedidos/pendientes-despacho", async (req, res) => {
  try {
    const { vendedores } = req.query;

    if (!vendedores) {
      return res
        .status(400)
        .json({ error: "Debe seleccionar al menos un vendedor." });
    }

    const listaVendedores = vendedores
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (listaVendedores.length === 0) {
      return res.status(400).json({ error: "Lista de vendedores inválida." });
    }

    const query = `
      SELECT id, fecha, op, cliente, modelo, cantidad, preparado, estado, vendedor
      FROM estado_pedidos
      WHERE (preparado IS NOT NULL AND preparado != '' AND preparado != '-' AND preparado NOT LIKE '%SIN PREPARAR%')
        AND (despacho IS NULL OR despacho = '' OR despacho = '-' OR despacho LIKE '%SIN DESPACHAR%')
        AND vendedor IS NOT NULL AND vendedor != '-' AND TRIM(vendedor) != ''
        AND vendedor IN (?)
      ORDER BY preparado ASC, fecha DESC
    `;

    const [rows] = await db.query(query, [listaVendedores]);
    res.json(rows);
  } catch (error) {
    console.error("Error al obtener pendientes de despacho:", error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Sincronizar desde Sheets guardando fecha y hora exacta de ejecución
app.post("/api/estado-pedidos/sincronizar", async (req, res) => {
  try {
    let csvUrl = process.env.GOOGLE_SHEETS_PEDIDOS_URL || VENTAS_CSV_URL;

    if (!csvUrl) {
      return res
        .status(400)
        .json({ error: "No se configuró GOOGLE_SHEETS_PEDIDOS_URL en .env" });
    }

    // AGREGAR CACHE-BUSTER PARA FORZAR DATOS FRESCOS DE GOOGLE
    const cacheBusterParam = `_t=${Date.now()}`;
    const urlConAntiCache = csvUrl.includes("?")
      ? `${csvUrl}&${cacheBusterParam}`
      : `${csvUrl}?${cacheBusterParam}`;

    const response = await fetch(urlConAntiCache, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });

    const csvText = await response.text();

    const parseMonto = (val) => {
      if (!val) return 0;
      let str = String(val).replace(/\$/g, "").replace(/\s/g, "").trim();
      if (str.includes(".") && str.includes(",")) {
        str = str.replace(/\./g, "").replace(",", ".");
      } else if (str.includes(",")) {
        str = str.replace(",", ".");
      }
      return parseFloat(str) || 0;
    };

    const parseCSVLine = (text) => {
      const result = [];
      let cell = "";
      let inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
          inQuotes = !inQuotes;
        } else if (c === "," && !inQuotes) {
          result.push(cell.trim().replace(/^"|"$/g, ""));
          cell = "";
        } else {
          cell += c;
        }
      }
      result.push(cell.trim().replace(/^"|"$/g, ""));
      return result;
    };

    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      return res.status(400).json({ error: "El archivo no contiene filas." });
    }

    const headers = parseCSVLine(lines[0]).map((h) => h.toUpperCase().trim());

    const idxFecha = headers.indexOf("FECHA");
    const idxPeriodo = headers.indexOf("PERIODO");
    const idxOp = headers.indexOf("OP");
    const idxCliente = headers.indexOf("CLIENTE");
    const idxModelo = headers.indexOf("MODELO");
    const idxDetalles = headers.indexOf("DETALLES");
    const idxOc = headers.indexOf("OC");
    const idxCantidad = headers.indexOf("CANTIDAD");
    const idxEstado = headers.indexOf("ESTADO");
    const idxProgramado = headers.indexOf("PROGRAMADO");
    const idxPreparado = headers.indexOf("PREPARADO");
    const idxDespacho = headers.indexOf("DESPACHO");
    const idxDemoraEntrega = headers.findIndex((h) =>
      h.includes("DEMORA ENTREGA"),
    );
    const idxDemoraPrep = headers.findIndex((h) =>
      h.includes("DEMORA PREPARACION"),
    );
    const idxComentarios = headers.indexOf("COMENTARIOS");
    const idxDespachado = headers.indexOf("DESPACHADO");
    const idxPunisiva = headers.indexOf("PUNISIVA");
    const idxCosusd = headers.indexOf("COSUSD");
    const idxVendedor = headers.indexOf("VENDEDOR");

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("TRUNCATE TABLE estado_pedidos");

      const insertQuery = `
        INSERT INTO estado_pedidos 
        (fecha, periodo, op, cliente, modelo, detalles, oc, cantidad, estado, programado, preparado, despacho, demora_entrega_dias, demora_preparacion, comentarios, despachado, punisiva, cosusd, vendedor) 
        VALUES ?
      `;

      const valuesToInsert = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (!cols[idxOp] && !cols[idxModelo]) continue;

        const fechaFormateada = parseFechaDeterminista(cols[idxFecha]);
        const punisivaVal =
          idxPunisiva !== -1 ? parseMonto(cols[idxPunisiva]) : 0;
        const cosusdVal = idxCosusd !== -1 ? parseMonto(cols[idxCosusd]) : 0;
        const cantVal =
          idxCantidad !== -1 ? parseInt(cols[idxCantidad]) || 1 : 1;

        let vendedorVal = null;
        if (idxVendedor !== -1 && cols[idxVendedor] && fechaFormateada) {
          if (fechaFormateada >= "2026-10-05") {
            const vClean = cols[idxVendedor].trim();
            vendedorVal = vClean.length > 0 ? vClean : null;
          }
        }

        valuesToInsert.push([
          fechaFormateada,
          cols[idxPeriodo] || null,
          cols[idxOp] || "",
          cols[idxCliente] || "",
          cols[idxModelo] || "",
          cols[idxDetalles] || "",
          cols[idxOc] || "",
          cantVal,
          cols[idxEstado] || "En stock",
          cols[idxProgramado] || "-",
          cols[idxPreparado] || "-",
          cols[idxDespacho] || "-",
          parseInt(cols[idxDemoraEntrega]) || 0,
          parseInt(cols[idxDemoraPrep]) || 0,
          cols[idxComentarios] || "",
          cols[idxDespachado] || "no",
          punisivaVal,
          cosusdVal,
          vendedorVal,
        ]);
      }

      if (valuesToInsert.length > 0) {
        const chunkSize = 1000;
        for (let i = 0; i < valuesToInsert.length; i += chunkSize) {
          const chunk = valuesToInsert.slice(i, i + chunkSize);
          await conn.query(insertQuery, [chunk]);
        }
      }

      // Guardar fecha y hora actual en la tabla reglas
      const ahora = new Date();
      await conn.query(
        "INSERT INTO reglas (clave, valor) VALUES ('ultima_sincronizacion_pedidos', ?) ON DUPLICATE KEY UPDATE valor = ?",
        [ahora.toISOString(), ahora.toISOString()],
      );

      await conn.commit();
      res.json({
        success: true,
        mensaje: `Se sincronizaron ${valuesToInsert.length} pedidos.`,
        ultimaSincronizacion: ahora.toISOString(),
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error("Error al sincronizar estado_pedidos:", error);
    res.status(500).json({ error: "Error procesando la sincronización." });
  }
});

// OBTENER TODAS LAS SOLICITUDES CON SUS ÍTEMS
app.get("/api/compras/solicitudes", async (req, res) => {
  try {
    const [solicitudes] = await db.query(
      "SELECT * FROM solicitudes_compra ORDER BY id DESC",
    );
    const [items] = await db.query("SELECT * FROM solicitudes_compra_items");

    // Anidar los ítems dentro de cada solicitud
    const solicitudesConItems = solicitudes.map((sc) => ({
      ...sc,
      items: items.filter((item) => item.solicitud_id === sc.id),
    }));

    res.json(solicitudesConItems);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const nombreDeUsuario = async (req) => {
  const [r] = await db.query("SELECT nombre FROM usuarios WHERE id = ?", [req.user?.id]);
  return r[0]?.nombre || "Usuario";
};

// CREAR NUEVA SOLICITUD
app.post("/api/compras/solicitudes", async (req, res) => {
  const { fecha, items } = req.body;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "Agregá al menos un ítem." });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      "INSERT INTO solicitudes_compra (fecha, estado) VALUES (?, 'ABIERTA')",
      [fecha],
    );
    const solicitudId = result.insertId;

    for (let item of items) {
      const mp = await buscarMateriaPrima(conn, item);
      await conn.query(
        "INSERT INTO solicitudes_compra_items (solicitud_id, articulo, proveedor, cantidad_solicitada, prioridad, materia_prima_id) VALUES (?, ?, ?, ?, ?, ?)",
        [
          solicitudId,
          item.articulo,
          item.proveedor,
          item.cantidad_solicitada,
          item.prioridad,
          mp?.id || null,
        ],
      );
    }
    await conn.commit();
    res.json({ success: true, insertId: solicitudId });
  } catch (error) {
    await conn.rollback().catch(() => {});
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// ACTUALIZAR SOLICITUD COMPLETA (EDICIÓN)
app.put("/api/compras/solicitudes/:id", async (req, res) => {
  const { id } = req.params;
  const { fecha, items } = req.body;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "Agregá al menos un ítem." });
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();
    const usuario = await nombreDeUsuario(req);
    const [viejos] = await conn.query("SELECT * FROM solicitudes_compra_items WHERE solicitud_id = ?", [id]);
    await conn.query("UPDATE solicitudes_compra SET fecha = ? WHERE id = ?", [
      fecha,
      id,
    ]);
    // Reemplazamos los ítems para hacer la edición más sencilla
    await conn.query(
      "DELETE FROM solicitudes_compra_items WHERE solicitud_id = ?",
      [id],
    );

    const usados = new Set();
    const resumen = [];
    for (let item of items) {
      const mp = await buscarMateriaPrima(conn, item);
      const recibida = parseFloat(item.cantidad_recibida) || 0;
      const [ins] = await conn.query(
        "INSERT INTO solicitudes_compra_items (solicitud_id, articulo, proveedor, cantidad_solicitada, cantidad_recibida, prioridad, numero_oc, materia_prima_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          id,
          item.articulo,
          item.proveedor,
          item.cantidad_solicitada,
          recibida,
          item.prioridad,
          item.numero_oc,
          mp?.id || null,
        ],
      );
      // Lo recibido de más (o de menos) respecto de lo que ya estaba cargado ajusta el stock.
      let previo = item.id ? viejos.find((v) => v.id === Number(item.id) && !usados.has(v.id)) : null;
      if (!previo) previo = viejos.find((v) => !usados.has(v.id) && norm(v.articulo) === norm(item.articulo));
      if (previo) usados.add(previo.id);
      const delta = recibida - (previo ? parseFloat(previo.cantidad_recibida) || 0 : 0);
      if (delta) {
        const r = await aplicarRecepcion(conn, { item: { ...item, id: ins.insertId, materia_prima_id: mp?.id }, delta, usuario, solicitud_id: Number(id) });
        resumen.push({ articulo: item.articulo, ...r });
      }
    }
    await conn.commit();
    res.json({ success: true, stock: resumen });
  } catch (error) {
    await conn.rollback().catch(() => {});
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// INGRESAR MERCADERÍA Y/O ASIGNAR O.C. A UN ÍTEM
app.put("/api/compras/items/:itemId", async (req, res) => {
  const { itemId } = req.params;
  const { cantidad_recibida, numero_oc, materia_prima_id } = req.body;
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();
    const [[item]] = await conn.query("SELECT * FROM solicitudes_compra_items WHERE id = ? FOR UPDATE", [itemId]);
    if (!item) {
      await conn.rollback();
      return res.status(404).json({ error: "No encontré ese ítem." });
    }
    const delta = cantidad_recibida !== undefined ? parseFloat(cantidad_recibida) : 0;
    if (cantidad_recibida !== undefined && !Number.isFinite(delta)) {
      await conn.rollback();
      return res.status(400).json({ error: "La cantidad recibida no es válida." });
    }

    let query = "UPDATE solicitudes_compra_items SET ";
    let params = [];

    if (cantidad_recibida !== undefined) {
      query += "cantidad_recibida = cantidad_recibida + ?, ";
      params.push(delta);
    }
    if (numero_oc !== undefined) {
      query += "numero_oc = ?, ";
      params.push(numero_oc);
    }
    // Vincular (o desvincular) el renglón con una materia prima: solo afecta a los ingresos que vengan después.
    if (materia_prima_id !== undefined) {
      if (materia_prima_id !== null) {
        const [[mpOk]] = await conn.query("SELECT id FROM materias_primas WHERE id = ?", [materia_prima_id]);
        if (!mpOk) {
          await conn.rollback();
          return res.status(400).json({ error: "Esa materia prima no existe." });
        }
      }
      query += "materia_prima_id = ?, ";
      params.push(materia_prima_id);
      item.materia_prima_id = materia_prima_id;
    }

    if (params.length) {
      query = query.slice(0, -2) + " WHERE id = ?";
      params.push(itemId);
      await conn.query(query, params);
    }

    // La mercadería que entra suma al stock de su materia prima y queda en su historial.
    let stock = { vinculada: false };
    if (delta) {
      stock = await aplicarRecepcion(conn, { item: { ...item, numero_oc: numero_oc !== undefined ? numero_oc : item.numero_oc }, delta, usuario: await nombreDeUsuario(req), solicitud_id: item.solicitud_id });
    }

    // Revisar si la solicitud ya está completa para cambiar el estado automáticamente
    const [all_items] = await conn.query(
      "SELECT cantidad_solicitada, cantidad_recibida FROM solicitudes_compra_items WHERE solicitud_id = ?",
      [item.solicitud_id],
    );

    const estaCompleta = all_items.every(
      (i) =>
        parseFloat(i.cantidad_recibida) >= parseFloat(i.cantidad_solicitada),
    );

    if (estaCompleta) {
      await conn.query(
        "UPDATE solicitudes_compra SET estado = 'COMPLETADA' WHERE id = ?",
        [item.solicitud_id],
      );
    }

    await conn.commit();
    res.json({ success: true, stock });
  } catch (error) {
    await conn.rollback().catch(() => {});
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

// OBTENER SOLICITUD PÚBLICA PARA FIRMAR
app.get("/api/public/solicitudes-compra/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [solicitudes] = await db.query(
      "SELECT id, fecha, estado, firma_jefe, firma_gerente, fecha_firma_jefe, fecha_firma_gerente FROM solicitudes_compra WHERE id = ?",
      [id],
    );
    if (solicitudes.length === 0)
      return res.status(404).json({ error: "Solicitud no encontrada" });

    const [items] = await db.query(
      "SELECT * FROM solicitudes_compra_items WHERE solicitud_id = ? ORDER BY prioridad DESC",
      [id],
    );

    res.json({ ...solicitudes[0], items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GUARDAR FIRMA DIGITAL (JEFE O GERENTE)
app.post("/api/public/solicitudes-compra/:id/firmar", async (req, res) => {
  const { id } = req.params;
  const { rol, firma } = req.body; // rol: 'jefe' | 'gerente'

  if (!firma) return res.status(400).json({ error: "Firma vacía" });

  try {
    if (rol === "gerente") {
      await db.query(
        "UPDATE solicitudes_compra SET firma_gerente = ?, fecha_firma_gerente = NOW() WHERE id = ?",
        [firma, id],
      );
    } else {
      await db.query(
        "UPDATE solicitudes_compra SET firma_jefe = ?, fecha_firma_jefe = NOW() WHERE id = ?",
        [firma, id],
      );
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// CARGA Y PROCESAMIENTO DE PDFS DE CATEGORÍAS (CON BUSQUEDA INTELIGENTE)
// ==========================================
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // Límite 25MB
});

app.post(
  "/api/catalogo/procesar-pdf",
  uploadMemory.array("pdf_files", 5),
  async (req, res) => {
    try {
      const files = req.files;
      const categoriaNombre = req.body.categoriaNombre || "Conos";

      if (!files || files.length === 0) {
        return res
          .status(400)
          .json({ error: "No se recibió ningún archivo PDF." });
      }

      let totalProductosProcesados = 0;

      for (const file of files) {
        const pdfBase64 = file.buffer.toString("base64");

        const promptExtraccion = `
        Analizá el documento PDF adjunto con fichas técnico-comerciales de productos.
        Extraé todos los modelos de productos presentes.

        Para cada producto, generá un objeto JSON con:
        - "codigo": Código del modelo (ej: "1025", "2051L-1R", "2070-2R").
        - "nombre": Nombre comercial del modelo (ej: "Multiuso Flexible", "Ciudad Light Semiflexible").
        - "medidas": Medidas de altura, base, peso y material (ej: "Conformado: 1 Pieza | Base: 35x35cm. | Reflectivo: 1x7cm.").
        - "descripcion": Resumen descriptivo técnico y comercial del producto.
        - "usos": Lista detallada de usos recomendados y aplicaciones de venta separados por coma.
        - "categoria": "${categoriaNombre}".

        Devolvé ÚNICAMENTE un arreglo JSON válido sin formato markdown adicional.
      `;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            {
              inlineData: {
                mimeType: "application/pdf",
                data: pdfBase64,
              },
            },
            promptExtraccion,
          ],
          config: {
            responseMimeType: "application/json",
          },
        });

        let productosExtraidos = [];
        try {
          productosExtraidos = JSON.parse(response.text);
        } catch (e) {
          const match = response.text.match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (match) {
            productosExtraidos = JSON.parse(match[0]);
          } else {
            console.error(
              "Error parseando respuesta JSON de Gemini:",
              response.text,
            );
            continue;
          }
        }

        if (
          Array.isArray(productosExtraidos) &&
          productosExtraidos.length > 0
        ) {
          for (const p of productosExtraidos) {
            if (!p.codigo) continue;

            // 1. Buscar si el producto ya existe por código exacto o contenido en código compuesto (ej: "2051L-1R / 2051-1R")
            const [existentes] = await db.query(
              `SELECT id FROM productos WHERE codigo = ? OR codigo LIKE ?`,
              [p.codigo, `%${p.codigo}%`],
            );

            if (existentes.length > 0) {
              // 2. Si existe, actualizamos la ficha técnica, descripción y usos
              const ids = existentes.map((e) => e.id);
              await db.query(
                `UPDATE productos 
               SET 
                 medidas = IF(medidas IS NULL OR medidas = '', ?, medidas),
                 descripcion = ?,
                 aplicacion = ?,
                 usos_recomendados = ?,
                 categoria = ?
               WHERE id IN (?)`,
                [
                  p.medidas || "",
                  p.descripcion || "",
                  p.usos || "",
                  p.usos || "",
                  p.categoria || categoriaNombre,
                  ids,
                ],
              );
            } else {
              // 3. Si no existe en la base de datos, lo insertamos como nuevo
              await db.query(
                `INSERT INTO productos 
               (codigo, nombre, medidas, descripcion, aplicacion, usos_recomendados, categoria) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                  p.codigo,
                  p.nombre || "",
                  p.medidas || "",
                  p.descripcion || "",
                  p.usos || "",
                  p.usos || "",
                  p.categoria || categoriaNombre,
                ],
              );
            }
            totalProductosProcesados++;
          }
        }

        // Guardar registro de la categoría
        await db.query(
          `INSERT INTO categorias_pdf (nombre, pdf_filename, total_productos)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           pdf_filename = VALUES(pdf_filename),
           total_productos = total_productos + VALUES(total_productos)`,
          [categoriaNombre, file.originalname, totalProductosProcesados],
        );
      }

      res.json({
        success: true,
        mensaje: `¡Fichas procesadas con éxito! Se actualizaron ${totalProductosProcesados} productos en el catálogo.`,
      });
    } catch (error) {
      console.error("Error en procesar-pdf:", error);
      res
        .status(500)
        .json({ error: `Error al procesar el PDF: ${error.message}` });
    }
  },
);

// ==========================================
// CONNIE: analista de datos con acceso de solo lectura a toda la base
// (la lógica vive en ./connie.js)
// ==========================================
const connie = crearConnie({
  pool: dbConnie,
  ai,
  obtenerDolar: obtenerDolarOficial,
});
app.post("/api/chat-ia", requirePermiso("connie"), connie.manejador());

app.listen(PORT, () => {
  console.log(`🚀 Servidor Conoflex unificado ejecutándose en puerto ${PORT}`);
  migrarPermisoConnie(db);
  connie.calentarEsquema();
});
