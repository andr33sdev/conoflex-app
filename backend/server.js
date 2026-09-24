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
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "conoflex_secreto_super_seguro";

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

app.use("/imagenes", express.static(IMAGENES_DIR));

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
// MÓDULO 0: AUTENTICACIÓN Y GESTIÓN DE USUARIOS
// ==========================================

app.post("/api/auth/register", async (req, res) => {
  const { nombre, email, password, rol } = req.body;
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: "Faltan campos obligatorios." });
  }

  try {
    const rolValido = ["ADMIN", "COMERCIAL", "PRODUCCION"].includes(rol)
      ? rol
      : "COMERCIAL";
    const [result] = await db.query(
      "INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)",
      [nombre.trim(), email.trim().toLowerCase(), password, rolValido],
    );

    res.json({
      success: true,
      id: result.insertId,
      mensaje: "Usuario registrado con éxito",
    });
  } catch (error) {
    res
      .status(400)
      .json({ error: "El email ya está registrado o datos inválidos." });
  }
});

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
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre },
      JWT_SECRET,
      { expiresIn: "12h" },
    );

    res.json({
      success: true,
      token,
      usuario: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/auth/me", autenticarToken, (req, res) => {
  res.json({ usuario: req.usuario || { rol: "ADMIN", nombre: "Usuario" } });
});

app.get(
  "/api/usuarios",
  autenticarToken,
  autorizarRoles("ADMIN"),
  async (req, res) => {
    try {
      const [users] = await db.query(
        "SELECT id, nombre, email, rol, created_at FROM usuarios",
      );
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

app.put(
  "/api/usuarios/:id/rol",
  autenticarToken,
  autorizarRoles("ADMIN"),
  async (req, res) => {
    const { rol } = req.body;
    if (!["ADMIN", "COMERCIAL", "PRODUCCION"].includes(rol)) {
      return res.status(400).json({ error: "Rol no válido" });
    }
    try {
      await db.query("UPDATE usuarios SET rol = ? WHERE id = ?", [
        rol,
        req.params.id,
      ]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

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

      if (ext === ".xlsx" || ext === ".xls") {
        const workbook = xlsx.readFile(req.file.path);
        let textoExcel = "";
        workbook.SheetNames.forEach((sheetName) => {
          textoExcel +=
            `\n--- HOJA: ${sheetName} ---\n` +
            xlsx.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        });
        contentsPayload = [`DATOS EXCEL:\n${textoExcel}`, promptText];
      } else if (ext === ".pdf") {
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

      const catalogoTextoFormateado = response.text.replace(/```/g, "").trim();

      const CATALOGO_PATH = path.join(__dirname, "catalogo.txt");
      fs.writeFileSync(CATALOGO_PATH, catalogoTextoFormateado, "utf-8");

      const totalCargados = await poblarDBDesdeCatalogoTXT();

      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

      res.json({
        success: true,
        mensaje: `¡Se actualizó el catálogo y se sincronizaron ${totalCargados} productos en MySQL!`,
        totalProductos: totalCargados,
        contenidoPreview: catalogoTextoFormateado,
      });
    } catch (error) {
      console.error("Error procesando lista de precios:", error);
      if (req.file && fs.existsSync(req.file.path))
        fs.unlinkSync(req.file.path);
      res
        .status(500)
        .json({ error: "Error procesando lista de precios: " + error.message });
    }
  },
);

// ==========================================
// RUTAS DE AUTENTICACIÓN GOOGLE (CON STATE DYNAMIC)
// ==========================================
app.get("/auth/google", (req, res) => {
  const referer = req.headers.referer || req.headers.origin || "";
  const isLocal = referer.includes("localhost");

  const redirectUri = isLocal
    ? "http://localhost:5173/auth/google/callback"
    : "[https://conoflex-app.vercel.app/auth/google/callback](https://conoflex-app.vercel.app/auth/google/callback)";

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );

  const scopes = [
    "[https://www.googleapis.com/auth/gmail.readonly](https://www.googleapis.com/auth/gmail.readonly)",
    "[https://www.googleapis.com/auth/gmail.compose](https://www.googleapis.com/auth/gmail.compose)",
    "[https://www.googleapis.com/auth/gmail.modify](https://www.googleapis.com/auth/gmail.modify)",
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
      : "[https://conoflex-app.vercel.app/auth/google/callback](https://conoflex-app.vercel.app/auth/google/callback)";

    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri,
    );

    const { tokens } = await client.getToken(req.query.code);

    // Asignamos tokens al cliente global y guardamos en archivo
    oauth2Client.setCredentials(tokens);
    const mainTokenPath = path.join(__dirname, "token.json");
    fs.writeFileSync(mainTokenPath, JSON.stringify(tokens));

    const targetUrl = isLocal
      ? "http://localhost:5173"
      : process.env.FRONTEND_URL ||
        "[https://conoflex-app.vercel.app](https://conoflex-app.vercel.app)";

    res.redirect(`${targetUrl}?status=conectado&module=comercial`);
  } catch (error) {
    console.error("Error en callback de Google:", error);
    res.status(500).send("Error de autenticación con Google: " + error.message);
  }
});

app.get(
  "/api/mails",
  autenticarToken,
  autorizarRoles("ADMIN", "COMERCIAL"),
  async (req, res) => {
    try {
      // Cargar tokens guardados si aún no están vinculados en memoria
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
        const headers = detail.data.payload.headers;
        const subject =
          headers.find((h) => h.name === "Subject")?.value || "Sin asunto";
        const from =
          headers.find((h) => h.name === "From")?.value || "Desconocido";
        const emailMatch = from.match(/<([^>]+)>/) || [null, from];

        mailsDetalle.push({
          id: msg.id,
          threadId: detail.data.threadId,
          asunto: subject,
          remitente: from,
          emailCliente: emailMatch[1],
          resumen: detail.data.snippet || "",
        });
      }
      res.json({ mails: mailsDetalle });
    } catch (error) {
      res.status(500).json({ error: "Error leyendo Gmail: " + error.message });
    }
  },
);

app.post(
  "/api/crear-borrador-gmail",
  autenticarToken,
  autorizarRoles("ADMIN", "COMERCIAL"),
  async (req, res) => {
    try {
      const { mailCliente, consultaText, asunto, threadId } = req.body;

      const [reglaRows] = await db.query(
        "SELECT valor FROM reglas WHERE clave = 'prompt_comercial'",
      );
      const reglasEntrenamiento = reglaRows[0] ? reglaRows[0].valor : "";

      const [productosDB] = await db.query(
        "SELECT codigo, nombre, medidas, precio_lista, especificacion, aplicacion, foto_tecnica, foto_catalogo FROM productos",
      );

      const prompt = `
      Sos el asesor comercial técnico senior de Conoflex Argentina.

      CATÁLOGO DE PRODUCTOS DISPONIBLES:
      ${JSON.stringify(productosDB, null, 2)}

      REGLAS DE NEGOCIO Y POLITICAS:
      ${reglasEntrenamiento}

      CONSULTA DEL CLIENTE (${mailCliente}):
      "${consultaText}"

      INSTRUCCIONES DE MAQUETACIÓN HTML Y SELECCIÓN DE PRODUCTOS:
      1. Analiza la consulta y busca los productos cuyo campo 'aplicacion' o 'especificacion' mejor responden al requerimiento (garages, autopistas, obras, etc.).
      2. Redacta un saludo comercial cordial.
      3. Para cada producto cotizado, crea una TARJETA HORIZONTAL en HTML (tabla con borde #e2e8f0, esquinas redondeadas y padding de 10px).
      4. MUY IMPORTANTE PARA LAS IMÁGENES:
         - Si el producto tiene valor en 'foto_tecnica', escribí exactamente este texto crudo centrado arriba: {FOTO_TECNICA_URL=poner_aqui_la_url_de_la_BD}
         - Si tiene 'foto_catalogo', escribí exactamente: {FOTO_CATALOGO_URL=poner_aqui_la_url_de_la_BD}
         - NUNCA uses la etiqueta <img>. Yo me encargo de procesarlo. Si el valor es null, no escribas nada.
      5. Muestra Nombre en negrita, Código, Medidas y Especificaciones/Aplicación.
      6. Muestra las 3 cajas de precio naranjas (Lista, Precio c/Descuento y Total).
      7. Agrega el cuadro final con notas comerciales sobre IVA, bonificaciones y despacho gratis.

      Devuelve ÚNICAMENTE el código HTML crudo sin bloques Markdown, sin explicaciones.
    `;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      let htmlBody = response.text
        .replace(/```html/g, "")
        .replace(/```/g, "")
        .trim();

      // PROCESAMIENTO POST-IA: Node.js reemplaza las variables por las etiquetas de imagen reales
      htmlBody = htmlBody.replace(
        /\{FOTO_TECNICA_URL=(https?:\/\/[^\}]+)\}/g,
        '<img src="$1" width="100%" style="max-height:220px; height: auto; object-fit:contain; border-radius:4px; margin: 0 5px;" alt="Técnica" />',
      );
      htmlBody = htmlBody.replace(
        /\{FOTO_CATALOGO_URL=(https?:\/\/[^\}]+)\}/g,
        '<img src="$1" width="100%" style="max-height:220px; height: auto; object-fit:contain; border-radius:4px; margin: 0 5px;" alt="Catálogo" />',
      );

      // Limpieza de seguridad por si la IA dejó variables sueltas por productos sin foto
      htmlBody = htmlBody.replace(/\{FOTO_TECNICA_URL=[^\}]*\}/g, "");
      htmlBody = htmlBody.replace(/\{FOTO_CATALOGO_URL=[^\}]*\}/g, "");

      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
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

app.put("/api/materias-primas/:id/stock", async (req, res) => {
  try {
    await db.query("UPDATE materias_primas SET stock_actual = ? WHERE id = ?", [
      req.body.stock,
      req.params.id,
    ]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/materias-primas/previsualizar-sheets", async (req, res) => {
  const MATERIAS_PRIMAS_CSV_URL =
    "[https://docs.google.com/spreadsheets/d/e/2PACX-1vTt66qDCe0E3GUbp7BLqGj4IHYK8nrXF1gvfmf45vY2kkP3-gL3fpPcxjltnFBX8EP7kBzEhnIvHw0L/pub?output=csv](https://docs.google.com/spreadsheets/d/e/2PACX-1vTt66qDCe0E3GUbp7BLqGj4IHYK8nrXF1gvfmf45vY2kkP3-gL3fpPcxjltnFBX8EP7kBzEhnIvHw0L/pub?output=csv)";

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
// MÓDULO 3: SEMIELABORADOS Y CRUCE DE DÍAS DE STOCK
// ==========================================
app.get("/api/semielaborados", async (req, res) => {
  try {
    const [semielaborados] = await db.query(`
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
    `);

    const [pts] = await db.query(
      "SELECT id, promedio_ventas_mensual FROM productos_terminados",
    );
    const [activeRecipesPT] = await db.query(
      "SELECT id, producto_terminado_id FROM ingenierias WHERE es_activa = 1 AND producto_terminado_id IS NOT NULL",
    );
    const [recipeDetailsPT] = await db.query(
      "SELECT ingenieria_id, semielaborado_id, cantidad FROM ingenieria_detalles WHERE semielaborado_id IS NOT NULL",
    );

    const seDemandMap = {};
    pts.forEach((pt) => {
      if (!pt.promedio_ventas_mensual) return;
      const activeRecipe = activeRecipesPT.find(
        (r) => r.producto_terminado_id === pt.id,
      );
      if (!activeRecipe) return;

      const details = recipeDetailsPT.filter(
        (d) => d.ingenieria_id === activeRecipe.id,
      );
      details.forEach((det) => {
        if (!seDemandMap[det.semielaborado_id])
          seDemandMap[det.semielaborado_id] = 0;
        seDemandMap[det.semielaborado_id] +=
          pt.promedio_ventas_mensual * det.cantidad;
      });
    });

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
        `SELECT d.id, d.ingenieria_id, d.materia_prima_id, d.semielaborado_id, d.cantidad, d.unidad_medida, 
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
        `SELECT d.id, d.ingenieria_id, d.materia_prima_id, d.semielaborado_id, d.cantidad, d.unidad_medida, 
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

app.post("/api/ingenierias", async (req, res) => {
  const { parent_id, parent_type, nombre_version, es_activa, ingredientes } =
    req.body;
  const isSE = parent_type === "SE";
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    if (es_activa) {
      const campoFK = isSE ? "semielaborado_id" : "producto_terminado_id";
      await conn.query(
        `UPDATE ingenierias SET es_activa = 0 WHERE ${campoFK} = ?`,
        [parent_id],
      );
    }

    const [info] = await conn.query(
      `INSERT INTO ingenierias (semielaborado_id, producto_terminado_id, nombre_version, es_activa, updated_at) VALUES (?, ?, ?, ?, NOW())`,
      [
        isSE ? parent_id : null,
        !isSE ? parent_id : null,
        nombre_version,
        es_activa ? 1 : 0,
      ],
    );

    const newId = info.insertId;

    if (ingredientes && Array.isArray(ingredientes)) {
      for (let ing of ingredientes) {
        await conn.query(
          `INSERT INTO ingenieria_detalles (ingenieria_id, materia_prima_id, semielaborado_id, cantidad, unidad_medida) VALUES (?, ?, ?, ?, ?)`,
          [
            newId,
            ing.materia_prima_id || null,
            ing.semielaborado_id || null,
            ing.cantidad,
            ing.unidad_medida || "Unidades",
          ],
        );
      }
    }

    await conn.commit();
    res.json({ success: true, id: newId });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

app.put("/api/ingenierias/:id", async (req, res) => {
  const { id } = req.params;
  const { parent_id, parent_type, nombre_version, es_activa, ingredientes } =
    req.body;
  const isSE = parent_type === "SE";
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    if (es_activa) {
      const campoFK = isSE ? "semielaborado_id" : "producto_terminado_id";
      await conn.query(
        `UPDATE ingenierias SET es_activa = 0 WHERE ${campoFK} = ?`,
        [parent_id],
      );
    }

    await conn.query(
      `UPDATE ingenierias SET nombre_version = ?, es_activa = ?, updated_at = NOW() WHERE id = ?`,
      [nombre_version, es_activa ? 1 : 0, id],
    );

    await conn.query(
      `DELETE FROM ingenieria_detalles WHERE ingenieria_id = ?`,
      [id],
    );

    if (ingredientes && Array.isArray(ingredientes)) {
      for (let ing of ingredientes) {
        await conn.query(
          `INSERT INTO ingenieria_detalles (ingenieria_id, materia_prima_id, semielaborado_id, cantidad, unidad_medida) VALUES (?, ?, ?, ?, ?)`,
          [
            id,
            ing.materia_prima_id || null,
            ing.semielaborado_id || null,
            ing.cantidad,
            ing.unidad_medida || "Unidades",
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

app.put("/api/ingenierias/:id/activar", async (req, res) => {
  const { id } = req.params;
  const { parent_id, parent_type } = req.body;
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();
    const campoFK =
      parent_type === "SE" ? "semielaborado_id" : "producto_terminado_id";

    await conn.query(
      `UPDATE ingenierias SET es_activa = 0 WHERE ${campoFK} = ?`,
      [parent_id],
    );
    await conn.query(
      `UPDATE ingenierias SET es_activa = 1, updated_at = NOW() WHERE id = ?`,
      [id],
    );

    await conn.commit();
    res.json({ success: true });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
  }
});

app.delete("/api/ingenierias/:id", async (req, res) => {
  try {
    await db.query(`DELETE FROM ingenierias WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

        await conn.query(
          `UPDATE materias_primas SET stock_actual = stock_actual - ? WHERE id = ?`,
          [descuentoKg, det.materia_prima_id],
        );

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

app.listen(PORT, () =>
  console.log(`🚀 Servidor Conoflex unificado ejecutándose en puerto ${PORT}`),
);
