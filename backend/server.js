const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

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

const db = new Database("conoflex_local.db");

// ==========================================
// 1. TABLAS BASE
// ==========================================
db.exec(`
  CREATE TABLE IF NOT EXISTS materias_primas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    unidad_medida TEXT DEFAULT 'Unidades',
    stock_actual REAL DEFAULT 0.00,
    orden INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS configuraciones_pegado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT UNIQUE NOT NULL,
    reflectiva TEXT DEFAULT 'NINGUNA',
    protector_orajet INTEGER DEFAULT 0,
    aplicacion_protector TEXT DEFAULT 'NINGUNA',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS semielaborados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    unidad_medida TEXT DEFAULT 'Unidades',
    stock_33 REAL DEFAULT 0.00,
    stock_26 REAL DEFAULT 0.00,
    stock_ayolas REAL DEFAULT 0.00,
    stock_37 REAL DEFAULT 0.00,
    orden INTEGER DEFAULT 0,
    configuracion_pegado_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (configuracion_pegado_id) REFERENCES configuraciones_pegado (id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS productos_terminados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    promedio_ventas_mensual REAL DEFAULT 0.00,
    orden INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ingenierias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    semielaborado_id INTEGER,
    producto_terminado_id INTEGER,
    nombre_version TEXT NOT NULL,
    es_activa INTEGER DEFAULT 1,
    updated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (semielaborado_id) REFERENCES semielaborados (id) ON DELETE CASCADE,
    FOREIGN KEY (producto_terminado_id) REFERENCES productos_terminados (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ingenieria_detalles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingenieria_id INTEGER NOT NULL,
    materia_prima_id INTEGER,
    semielaborado_id INTEGER,
    cantidad REAL NOT NULL,
    unidad_medida TEXT DEFAULT 'Unidades',
    FOREIGN KEY (ingenieria_id) REFERENCES ingenierias (id) ON DELETE CASCADE,
    FOREIGN KEY (materia_prima_id) REFERENCES materias_primas (id) ON DELETE CASCADE,
    FOREIGN KEY (semielaborado_id) REFERENCES semielaborados (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS registro_produccion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT,
    categoria_maq TEXT,
    codigo_ot TEXT,
    codigo TEXT,
    articulo TEXT,
    cant_buenos REAL DEFAULT 0,
    segunda_calidad REAL DEFAULT 0,
    cant_fallas REAL DEFAULT 0,
    kg_total REAL DEFAULT 0,
    kg_fallas REAL DEFAULT 0,
    ingenieria_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cargas_produccion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_ot TEXT NOT NULL,
    semielaborado_codigo TEXT NOT NULL,
    articulo TEXT,
    cant_buenos REAL DEFAULT 0,
    cant_fallas REAL DEFAULT 0,
    fecha TEXT,
    operario_nombre TEXT,
    supervisor_nombre TEXT,
    observaciones TEXT,
    estado_aprobacion TEXT DEFAULT 'PENDIENTE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS grupos_alerta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    dias_critico INTEGER NOT NULL DEFAULT 5,
    dias_alerta INTEGER NOT NULL DEFAULT 15,
    es_predeterminado INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS ordenes_trabajo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_ot TEXT NOT NULL,
    semielaborado_codigo TEXT NOT NULL,
    articulo TEXT,
    maquina TEXT NOT NULL,
    destino TEXT,
    cant_objetivo INTEGER NOT NULL DEFAULT 1000,
    cant_producida INTEGER DEFAULT 0,
    kg_por_unidad REAL DEFAULT 1.0,
    estado TEXT DEFAULT 'PROGRAMADO',
    fecha_inicio TEXT,
    velocidad_u_hora INTEGER DEFAULT 100,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  /* ÍNDICES DE ALTO RENDIMIENTO SQLITE */
  CREATE INDEX IF NOT EXISTS idx_ing_detalles_ing_id ON ingenieria_detalles(ingenieria_id);
  CREATE INDEX IF NOT EXISTS idx_ing_detalles_mp_id ON ingenieria_detalles(materia_prima_id);
  CREATE INDEX IF NOT EXISTS idx_ing_detalles_se_id ON ingenieria_detalles(semielaborado_id);
  CREATE INDEX IF NOT EXISTS idx_ingenierias_se_id ON ingenierias(semielaborado_id);
  CREATE INDEX IF NOT EXISTS idx_ingenierias_pt_id ON ingenierias(producto_terminado_id);
  CREATE INDEX IF NOT EXISTS idx_cargas_estado ON cargas_produccion(estado_aprobacion);
`);

// MIGRACIÓN AUTOMÁTICA
try {
  const indices = db.prepare("PRAGMA index_list(ordenes_trabajo)").all();
  const hasUnique = indices.some((idx) => idx.unique);
  if (hasUnique) {
    db.exec(`
      CREATE TABLE ordenes_trabajo_temp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_ot TEXT NOT NULL,
        semielaborado_codigo TEXT NOT NULL,
        articulo TEXT,
        maquina TEXT NOT NULL,
        destino TEXT,
        cant_objetivo INTEGER NOT NULL DEFAULT 1000,
        cant_producida INTEGER DEFAULT 0,
        kg_por_unidad REAL DEFAULT 1.0,
        estado TEXT DEFAULT 'PROGRAMADO',
        fecha_inicio TEXT,
        velocidad_u_hora INTEGER DEFAULT 100,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO ordenes_trabajo_temp SELECT * FROM ordenes_trabajo;
      DROP TABLE ordenes_trabajo;
      ALTER TABLE ordenes_trabajo_temp RENAME TO ordenes_trabajo;
    `);
  }
} catch (e) {
  console.log("Migración de ordenes_trabajo no requerida o completada.");
}

const countGrupos = db
  .prepare("SELECT COUNT(*) as count FROM grupos_alerta")
  .get();
if (countGrupos.count === 0) {
  db.prepare(
    `
    INSERT INTO grupos_alerta (nombre, dias_critico, dias_alerta, es_predeterminado)
    VALUES ('General', 5, 15, 1)
  `,
  ).run();
}

// ==========================================
// 2. MIGRACIONES DINÁMICAS
// ==========================================
const tblSEInfo = db.prepare("PRAGMA table_info(semielaborados)").all();
if (!tblSEInfo.some((c) => c.name === "configuracion_pegado_id")) {
  db.exec(
    "ALTER TABLE semielaborados ADD COLUMN configuracion_pegado_id INTEGER;",
  );
}

const tblProdInfo = db.prepare("PRAGMA table_info(registro_produccion)").all();
if (!tblProdInfo.some((c) => c.name === "codigo_ot")) {
  db.exec("ALTER TABLE registro_produccion ADD COLUMN codigo_ot TEXT;");
}
if (!tblProdInfo.some((c) => c.name === "ingenieria_id")) {
  db.exec("ALTER TABLE registro_produccion ADD COLUMN ingenieria_id INTEGER;");
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS registro_produccion_materiales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registro_id INTEGER,
      codigo_ot TEXT,
      materia_prima_codigo TEXT,
      materia_prima_nombre TEXT,
      cantidad_usada REAL,
      unidad_medida TEXT,
      fecha TEXT,
      FOREIGN KEY (registro_id) REFERENCES registro_produccion(id) ON DELETE CASCADE
    );
  `);
} catch (e) {
  console.log("Error en migración de materiales:", e);
}

// ==========================================
// 3. PARSER CSV COMPLETO
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
// MÓDULO 1: MATERIAS PRIMAS
// ==========================================
app.get("/api/materias-primas", (req, res) => {
  try {
    res.json(
      db
        .prepare("SELECT * FROM materias_primas ORDER BY orden ASC, id ASC")
        .all(),
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/materias-primas/:id/stock", (req, res) => {
  try {
    db.prepare("UPDATE materias_primas SET stock_actual = ? WHERE id = ?").run(
      req.body.stock,
      req.params.id,
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

    const currentMP = db.prepare("SELECT * FROM materias_primas").all();
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

app.post("/api/materias-primas/aplicar-sincronizacion", (req, res) => {
  const { nuevos, modificados } = req.body;

  try {
    const insertStmt = db.prepare(
      "INSERT INTO materias_primas (codigo, nombre, unidad_medida, stock_actual) VALUES (?, ?, ?, ?)",
    );
    const updateStmt = db.prepare(
      "UPDATE materias_primas SET stock_actual = ? WHERE id = ?",
    );

    let nuevosCount = 0;
    let modificadosCount = 0;

    db.transaction(() => {
      if (Array.isArray(nuevos)) {
        for (const n of nuevos) {
          insertStmt.run(
            n.codigo,
            n.nombre,
            n.unidad || "KILOS",
            n.stock_nuevo || 0,
          );
          nuevosCount++;
        }
      }
      if (Array.isArray(modificados)) {
        for (const m of modificados) {
          updateStmt.run(m.stock_nuevo, m.id);
          modificadosCount++;
        }
      }
    })();

    res.json({ success: true, nuevosCount, modificadosCount });
  } catch (error) {
    console.error("Error al aplicar sincronización de materias primas:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// MÓDULO 2: CONFIGURACIONES DE PEGADO Y REFLECTIVAS
// ==========================================
app.get("/api/configuraciones-pegado", (req, res) => {
  try {
    const rows = db
      .prepare(
        `
      SELECT c.*, COUNT(s.id) as semielaborados_count
      FROM configuraciones_pegado c
      LEFT JOIN semielaborados s ON s.configuracion_pegado_id = c.id
      GROUP BY c.id
      ORDER BY c.nombre ASC
    `,
      )
      .all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/configuraciones-pegado", (req, res) => {
  const { nombre, reflectiva, protector_orajet, aplicacion_protector } =
    req.body;
  if (!nombre || !nombre.trim())
    return res.status(400).json({ error: "Nombre requerido" });

  try {
    const info = db
      .prepare(
        `
      INSERT INTO configuraciones_pegado (nombre, reflectiva, protector_orajet, aplicacion_protector)
      VALUES (?, ?, ?, ?)
    `,
      )
      .run(
        nombre.trim().toUpperCase(),
        reflectiva || "NINGUNA",
        protector_orajet ? 1 : 0,
        aplicacion_protector || "NINGUNA",
      );
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/configuraciones-pegado/:id", (req, res) => {
  const { nombre, reflectiva, protector_orajet, aplicacion_protector } =
    req.body;
  try {
    db.prepare(
      `
      UPDATE configuraciones_pegado
      SET nombre = ?, reflectiva = ?, protector_orajet = ?, aplicacion_protector = ?
      WHERE id = ?
    `,
    ).run(
      nombre.trim().toUpperCase(),
      reflectiva || "NINGUNA",
      protector_orajet ? 1 : 0,
      aplicacion_protector || "NINGUNA",
      req.params.id,
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/configuraciones-pegado/:id", (req, res) => {
  try {
    db.transaction(() => {
      db.prepare(
        "UPDATE semielaborados SET configuracion_pegado_id = NULL WHERE configuracion_pegado_id = ?",
      ).run(req.params.id);
      db.prepare("DELETE FROM configuraciones_pegado WHERE id = ?").run(
        req.params.id,
      );
    })();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/semielaborados/:id/enlazar-pegado", (req, res) => {
  const { configuracion_pegado_id } = req.body;
  try {
    db.prepare(
      "UPDATE semielaborados SET configuracion_pegado_id = ? WHERE id = ?",
    ).run(configuracion_pegado_id || null, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/semielaborados/bulk-enlazar-pegado", (req, res) => {
  const { ids, configuracion_pegado_id } = req.body;
  if (!ids || !Array.isArray(ids))
    return res.status(400).json({ error: "IDs no válidos" });

  try {
    const stmt = db.prepare(
      "UPDATE semielaborados SET configuracion_pegado_id = ? WHERE id = ?",
    );
    db.transaction(() => {
      for (let id of ids) {
        stmt.run(configuracion_pegado_id || null, id);
      }
    })();
    res.json({ success: true, count: ids.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// MÓDULO 3: SEMIELABORADOS Y CRUCE DE DÍAS DE STOCK
// ==========================================
app.get("/api/semielaborados", (req, res) => {
  try {
    const semielaborados = db
      .prepare(
        `
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
      `,
      )
      .all();

    const pts = db
      .prepare("SELECT id, promedio_ventas_mensual FROM productos_terminados")
      .all();
    const activeRecipesPT = db
      .prepare(
        "SELECT id, producto_terminado_id FROM ingenierias WHERE es_activa = 1 AND producto_terminado_id IS NOT NULL",
      )
      .all();
    const recipeDetailsPT = db
      .prepare(
        "SELECT ingenieria_id, semielaborado_id, cantidad FROM ingenieria_detalles WHERE semielaborado_id IS NOT NULL",
      )
      .all();

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

app.put("/api/semielaborados/:id/stock", (req, res) => {
  try {
    db.prepare(
      `UPDATE semielaborados SET ${req.body.campoDeposito} = ? WHERE id = ?`,
    ).run(req.body.stock, req.params.id);
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
    const updateStmt = db.prepare(
      `UPDATE semielaborados SET stock_33 = COALESCE(?, stock_33), stock_26 = COALESCE(?, stock_26), stock_ayolas = COALESCE(?, stock_ayolas), stock_37 = COALESCE(?, stock_37) WHERE codigo = ?`,
    );
    db.transaction(() => {
      for (const [codeUpper, stocks] of Object.entries(updatesMap)) {
        updateStmt.run(
          stocks.stock_33 !== undefined ? stocks.stock_33 : null,
          stocks.stock_26 !== undefined ? stocks.stock_26 : null,
          stocks.stock_ayolas !== undefined ? stocks.stock_ayolas : null,
          stocks.stock_37 !== undefined ? stocks.stock_37 : null,
          codeUpper,
        );
      }
    })();
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

    const currentSE = db.prepare("SELECT * FROM semielaborados").all();
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

app.post("/api/semielaborados/aplicar-sincronizacion", (req, res) => {
  const { nuevos, modificados } = req.body;
  try {
    const insertStmt = db.prepare(
      "INSERT INTO semielaborados (codigo, nombre, stock_33, stock_26, stock_ayolas, stock_37) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const updateStmt = db.prepare(
      "UPDATE semielaborados SET stock_33 = ?, stock_26 = ?, stock_ayolas = ?, stock_37 = ? WHERE id = ?",
    );

    db.transaction(() => {
      if (Array.isArray(nuevos)) {
        for (const n of nuevos) {
          insertStmt.run(
            n.codigo,
            n.nombre,
            n.stock_33 || 0,
            n.stock_26 || 0,
            n.stock_ayolas || 0,
            n.stock_37 || 0,
          );
        }
      }
      if (Array.isArray(modificados)) {
        for (const m of modificados) {
          updateStmt.run(
            m.nuevo.stock_33,
            m.nuevo.stock_26,
            m.nuevo.stock_ayolas,
            m.nuevo.stock_37,
            m.id,
          );
        }
      }
    })();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// MÓDULO 4: PRODUCTOS TERMINADOS Y VENTAS
// ==========================================
app.get("/api/productos-terminados", (req, res) => {
  try {
    const rows = db
      .prepare(
        `
      SELECT p.*, COUNT(i.id) as recetas_count FROM productos_terminados p 
      LEFT JOIN ingenierias i ON p.id = i.producto_terminado_id GROUP BY p.id ORDER BY p.orden ASC, p.id ASC
    `,
      )
      .all();
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

    const upsertStmt = db.prepare(`
      INSERT INTO productos_terminados (codigo, nombre, promedio_ventas_mensual)
      VALUES (?, ?, ?) ON CONFLICT(codigo) DO UPDATE SET promedio_ventas_mensual = excluded.promedio_ventas_mensual
    `);

    db.transaction(() => {
      db.exec("UPDATE productos_terminados SET promedio_ventas_mensual = 0");
      for (const [cod, totalTrimestre] of Object.entries(ventasMap)) {
        const promedioMensual = totalTrimestre / 3;
        upsertStmt.run(cod, cod, promedioMensual);
      }
    })();

    res.json({ success: true, count: Object.keys(ventasMap).length });
  } catch (error) {
    console.error("Error en sincronización:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// MÓDULO 5: INGENIERÍAS / BOM
// ==========================================
app.get("/api/ingenierias/semielaborado/:id", (req, res) => {
  try {
    const ingenierias = db
      .prepare(
        "SELECT * FROM ingenierias WHERE semielaborado_id = ? ORDER BY es_activa DESC, id DESC",
      )
      .all(req.params.id);
    const getIngredientes = db.prepare(`
      SELECT d.id, d.ingenieria_id, d.materia_prima_id, d.semielaborado_id, d.cantidad, d.unidad_medida, COALESCE(mp.codigo, se.codigo) as item_codigo, COALESCE(mp.nombre, se.nombre) as item_nombre, CASE WHEN d.materia_prima_id IS NOT NULL THEN 'MP' ELSE 'SE' END as item_type FROM ingenieria_detalles d LEFT JOIN materias_primas mp ON d.materia_prima_id = mp.id LEFT JOIN semielaborados se ON d.semielaborado_id = se.id WHERE d.ingenieria_id = ?
    `);
    res.json(
      ingenierias.map((ing) => ({
        ...ing,
        ingredientes: getIngredientes.all(ing.id),
      })),
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/ingenierias/producto-terminado/:id", (req, res) => {
  try {
    const ingenierias = db
      .prepare(
        "SELECT * FROM ingenierias WHERE producto_terminado_id = ? ORDER BY es_activa DESC, id DESC",
      )
      .all(req.params.id);
    const getIngredientes = db.prepare(`
      SELECT d.id, d.ingenieria_id, d.materia_prima_id, d.semielaborado_id, d.cantidad, d.unidad_medida, COALESCE(mp.codigo, se.codigo) as item_codigo, COALESCE(mp.nombre, se.nombre) as item_nombre, CASE WHEN d.materia_prima_id IS NOT NULL THEN 'MP' ELSE 'SE' END as item_type FROM ingenieria_detalles d LEFT JOIN materias_primas mp ON d.materia_prima_id = mp.id LEFT JOIN semielaborados se ON d.semielaborado_id = se.id WHERE d.ingenieria_id = ?
    `);
    res.json(
      ingenierias.map((ing) => ({
        ...ing,
        ingredientes: getIngredientes.all(ing.id),
      })),
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/ingenierias/recetas-activas-bulk", (req, res) => {
  try {
    const rows = db
      .prepare(
        `
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
    `,
      )
      .all();

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

app.post("/api/ingenierias", (req, res) => {
  const { parent_id, parent_type, nombre_version, es_activa, ingredientes } =
    req.body;
  const now = new Date().toISOString();
  try {
    const isSE = parent_type === "SE";
    const insertIngenieria = db.prepare(
      `INSERT INTO ingenierias (semielaborado_id, producto_terminado_id, nombre_version, es_activa, updated_at) VALUES (?, ?, ?, ?, ?)`,
    );
    const insertDetalle = db.prepare(
      `INSERT INTO ingenieria_detalles (ingenieria_id, materia_prima_id, semielaborado_id, cantidad, unidad_medida) VALUES (?, ?, ?, ?, ?)`,
    );
    const resetActivas = db.prepare(
      `UPDATE ingenierias SET es_activa = 0 WHERE ${isSE ? "semielaborado_id" : "producto_terminado_id"} = ?`,
    );

    let newId;
    db.transaction(() => {
      if (es_activa) resetActivas.run(parent_id);
      const info = insertIngenieria.run(
        isSE ? parent_id : null,
        !isSE ? parent_id : null,
        nombre_version,
        es_activa ? 1 : 0,
        now,
      );
      newId = info.lastInsertRowid;
      if (ingredientes) {
        for (let ing of ingredientes)
          insertDetalle.run(
            newId,
            ing.materia_prima_id || null,
            ing.semielaborado_id || null,
            ing.cantidad,
            ing.unidad_medida || "Unidades",
          );
      }
    })();
    res.json({ success: true, id: newId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/ingenierias/:id", (req, res) => {
  const { id } = req.params;
  const { parent_id, parent_type, nombre_version, es_activa, ingredientes } =
    req.body;
  const now = new Date().toISOString();
  try {
    const isSE = parent_type === "SE";
    const updateIngenieria = db.prepare(
      `UPDATE ingenierias SET nombre_version = ?, es_activa = ?, updated_at = ? WHERE id = ?`,
    );
    const resetActivas = db.prepare(
      `UPDATE ingenierias SET es_activa = 0 WHERE ${isSE ? "semielaborado_id" : "producto_terminado_id"} = ?`,
    );
    const deleteDetalles = db.prepare(
      `DELETE FROM ingenieria_detalles WHERE ingenieria_id = ?`,
    );
    const insertDetalle = db.prepare(
      `INSERT INTO ingenieria_detalles (ingenieria_id, materia_prima_id, semielaborado_id, cantidad, unidad_medida) VALUES (?, ?, ?, ?, ?)`,
    );

    db.transaction(() => {
      if (es_activa) resetActivas.run(parent_id);
      updateIngenieria.run(nombre_version, es_activa ? 1 : 0, now, id);
      deleteDetalles.run(id);
      if (ingredientes) {
        for (let ing of ingredientes)
          insertDetalle.run(
            id,
            ing.materia_prima_id || null,
            ing.semielaborado_id || null,
            ing.cantidad,
            ing.unidad_medida || "Unidades",
          );
      }
    })();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/ingenierias/:id/activar", (req, res) => {
  const { id } = req.params;
  const { parent_id, parent_type } = req.body;
  try {
    db.transaction(() => {
      db.prepare(
        `UPDATE ingenierias SET es_activa = 0 WHERE ${parent_type === "SE" ? "semielaborado_id" : "producto_terminado_id"} = ?`,
      ).run(parent_id);
      db.prepare(
        `UPDATE ingenierias SET es_activa = 1, updated_at = ? WHERE id = ?`,
      ).run(new Date().toISOString(), id);
    })();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/ingenierias/:id", (req, res) => {
  try {
    db.prepare(`DELETE FROM ingenierias WHERE id = ?`).run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// MÓDULO 6: REGISTRO DE PRODUCCIÓN (MÉTRICAS & CARGAS)
// ==========================================
app.get("/api/metricas/produccion", (req, res) => {
  try {
    const rows = db
      .prepare("SELECT * FROM registro_produccion ORDER BY fecha DESC, id DESC")
      .all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get(
  "/api/metricas/produccion/materiales-consumidos/:codigo_ot",
  (req, res) => {
    try {
      const consumos = db
        .prepare(
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
        )
        .all(req.params.codigo_ot);

      res.json(consumos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

app.post("/api/metricas/produccion/manual", (req, res) => {
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

  try {
    db.transaction(() => {
      const info = db
        .prepare(
          `
        INSERT INTO registro_produccion 
        (fecha, categoria_maq, codigo_ot, codigo, articulo, cant_buenos, kg_total, ingenieria_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          fecha,
          categoria_maq,
          codigo_ot,
          codigo,
          articulo,
          Number(cant_buenos),
          Number(kg_total),
          ingenieria_id || null,
        );

      const registroId = info.lastInsertRowid;

      if (ingenieria_id) {
        const ingredientes = db
          .prepare(
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
          )
          .all(ingenieria_id);

        const stmtMat = db.prepare(`
          INSERT INTO registro_produccion_materiales 
          (registro_id, codigo_ot, materia_prima_codigo, materia_prima_nombre, cantidad_usada, unidad_medida, fecha)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const ing of ingredientes) {
          const cantidadConsumida = Number(cant_buenos) * (ing.cantidad || 0);
          stmtMat.run(
            registroId,
            codigo_ot,
            ing.item_codigo || "",
            ing.item_nombre || "",
            cantidadConsumida,
            ing.unidad_medida || "Kg",
            fecha,
          );
        }
      }

      db.prepare(
        `
        UPDATE ordenes_trabajo 
        SET cant_producida = cant_producida + ? 
        WHERE codigo_ot = ? AND semielaborado_codigo = ?
      `,
      ).run(Number(cant_buenos), codigo_ot, codigo);
    })();

    res.json({ success: true });
  } catch (error) {
    console.error("DETALLE DEL ERROR 500 EN SERVER:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Cargar producción pendiente de aprobación por supervisor
app.post("/api/metricas/produccion/cargar-pendiente", (req, res) => {
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

    const result = db
      .prepare(
        `
      INSERT INTO cargas_produccion (codigo_ot, semielaborado_codigo, articulo, cant_buenos, cant_fallas, fecha, operario_nombre, observaciones, estado_aprobacion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')
    `,
      )
      .run(
        codigo_ot,
        semielaborado_codigo,
        articulo,
        Number(cant_buenos) || 0,
        Number(cant_fallas) || 0,
        fecha,
        operario_nombre || "Operario Planta",
        observaciones || "",
      );

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Consultar cargas de producción (pendientes y aprobadas)
app.get("/api/metricas/produccion/cargas", (req, res) => {
  try {
    const cargas = db
      .prepare("SELECT * FROM cargas_produccion ORDER BY id DESC")
      .all();
    res.json(cargas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Aprobar Carga de Producción -> Actualiza OT + Genera Registro + Descuenta Materias Primas en BD
app.put("/api/metricas/produccion/aprobar/:id", (req, res) => {
  try {
    const { supervisor_nombre } = req.body;
    const carga = db
      .prepare("SELECT * FROM cargas_produccion WHERE id = ?")
      .get(req.params.id);

    if (!carga) {
      return res
        .status(404)
        .json({ error: "Carga de producción no encontrada" });
    }

    if (carga.estado_aprobacion === "APROBADO") {
      return res
        .status(400)
        .json({ error: "La carga ya fue aprobada previamente" });
    }

    db.transaction(() => {
      // 1. Cambiar estado de la carga a APROBADO
      db.prepare(
        `UPDATE cargas_produccion SET estado_aprobacion = 'APROBADO', supervisor_nombre = ? WHERE id = ?`,
      ).run(supervisor_nombre || "Supervisor", req.params.id);

      // 2. Obtener Semielaborado y Receta Activa
      const se = db
        .prepare("SELECT id FROM semielaborados WHERE codigo = ?")
        .get(carga.semielaborado_codigo);

      let activeIngenieriaId = null;
      if (se) {
        const recipe = db
          .prepare(
            "SELECT id FROM ingenierias WHERE semielaborado_id = ? AND es_activa = 1",
          )
          .get(se.id);
        if (recipe) activeIngenieriaId = recipe.id;
      }

      // 3. Insertar registro formal en registro_produccion para métricas y calendario
      const infoProd = db
        .prepare(
          `
        INSERT INTO registro_produccion 
        (fecha, categoria_maq, codigo_ot, codigo, articulo, cant_buenos, cant_fallas, ingenieria_id)
        VALUES (?, 'EXTRUSIÓN', ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          carga.fecha,
          carga.codigo_ot,
          carga.semielaborado_codigo,
          carga.articulo,
          carga.cant_buenos,
          carga.cant_fallas,
          activeIngenieriaId,
        );

      const registroId = infoProd.lastInsertRowid;

      // 4. Actualizar cantidad producida acumulada en la Orden de Trabajo (OT)
      db.prepare(
        `
        UPDATE ordenes_trabajo 
        SET cant_producida = cant_producida + ? 
        WHERE codigo_ot = ? AND semielaborado_codigo = ?
      `,
      ).run(carga.cant_buenos, carga.codigo_ot, carga.semielaborado_codigo);

      // 5. Descontar materias primas del stock según ingredientes de la receta activa
      if (activeIngenieriaId) {
        const detalles = db
          .prepare(
            `
          SELECT d.materia_prima_id, d.cantidad, d.unidad_medida, mp.codigo as item_codigo, mp.nombre as item_nombre
          FROM ingenieria_detalles d
          LEFT JOIN materias_primas mp ON d.materia_prima_id = mp.id
          WHERE d.ingenieria_id = ? AND d.materia_prima_id IS NOT NULL
        `,
          )
          .all(activeIngenieriaId);

        const stmtMat = db.prepare(`
          INSERT INTO registro_produccion_materiales 
          (registro_id, codigo_ot, materia_prima_codigo, materia_prima_nombre, cantidad_usada, unidad_medida, fecha)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const det of detalles) {
          const descuentoKg =
            Number(carga.cant_buenos) * Number(det.cantidad || 0);

          db.prepare(
            `UPDATE materias_primas SET stock_actual = stock_actual - ? WHERE id = ?`,
          ).run(descuentoKg, det.materia_prima_id);

          stmtMat.run(
            registroId,
            carga.codigo_ot,
            det.item_codigo || "",
            det.item_nombre || "",
            descuentoKg,
            det.unidad_medida || "Kg",
            carga.fecha,
          );
        }
      }
    })();

    res.json({ success: true });
  } catch (error) {
    console.error("Error al aprobar carga:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Rechazar Carga de Producción
app.delete("/api/metricas/produccion/rechazar/:id", (req, res) => {
  try {
    db.prepare("DELETE FROM cargas_produccion WHERE id = ?").run(req.params.id);
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

    const deleteStmt = db.prepare("DELETE FROM registro_produccion");
    const insertStmt = db.prepare(`
      INSERT INTO registro_produccion 
      (fecha, categoria_maq, codigo, articulo, cant_buenos, segunda_calidad, cant_fallas, kg_total, kg_fallas)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let count = 0;
    db.transaction(() => {
      deleteStmt.run();
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

        insertStmt.run(
          fechaFormatted,
          catMaqVal,
          codigoVal,
          articuloVal,
          idxBuenos !== -1 ? parseNum(cols[idxBuenos]) : 0,
          idxSegunda !== -1 ? parseNum(cols[idxSegunda]) : 0,
          idxFallas !== -1 ? parseNum(cols[idxFallas]) : 0,
          idxKgTotal !== -1 ? parseNum(cols[idxKgTotal]) : 0,
          idxKgFallas !== -1 ? parseNum(cols[idxKgFallas]) : 0,
        );
        count++;
      }
    })();

    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// MÓDULO 7: GRUPOS DE ALERTA DE STOCK
// ==========================================
app.get("/api/grupos-alerta", (req, res) => {
  try {
    const grupos = db
      .prepare("SELECT * FROM grupos_alerta ORDER BY id ASC")
      .all();
    res.json(grupos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/grupos-alerta", (req, res) => {
  try {
    const { id, nombre, dias_critico, dias_alerta } = req.body;
    if (!nombre || dias_critico === undefined || dias_alerta === undefined) {
      return res.status(400).json({ error: "Faltan campos obligatorios." });
    }

    if (id) {
      db.prepare(
        `
        UPDATE grupos_alerta 
        SET nombre = ?, dias_critico = ?, dias_alerta = ? 
        WHERE id = ?
      `,
      ).run(nombre.trim(), Number(dias_critico), Number(dias_alerta), id);
    } else {
      db.prepare(
        `
        INSERT INTO grupos_alerta (nombre, dias_critico, dias_alerta, es_predeterminado) 
        VALUES (?, ?, ?, 0)
      `,
      ).run(nombre.trim(), Number(dias_critico), Number(dias_alerta));
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/grupos-alerta/:id", (req, res) => {
  try {
    const { id } = req.params;
    db.prepare(
      "DELETE FROM grupos_alerta WHERE id = ? AND es_predeterminado = 0",
    ).run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// MÓDULO 8: ÓRDENES DE TRABAJO (PLANIFICACIÓN)
// ==========================================
app.get("/api/ordenes-trabajo", (req, res) => {
  try {
    const rows = db
      .prepare("SELECT * FROM ordenes_trabajo ORDER BY id DESC")
      .all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/ordenes-trabajo", (req, res) => {
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

    const stmt = db.prepare(`
      INSERT INTO ordenes_trabajo 
      (codigo_ot, semielaborado_codigo, articulo, maquina, destino, cant_objetivo, kg_por_unidad, estado, fecha_inicio, velocidad_u_hora)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
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
    );

    res.json({ success: true, id: info.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/ordenes-trabajo/:id/estado", (req, res) => {
  try {
    const { estado } = req.body;
    db.prepare("UPDATE ordenes_trabajo SET estado = ? WHERE id = ?").run(
      estado,
      req.params.id,
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/ordenes-trabajo/ot/:codigo_ot/estado-lote", (req, res) => {
  try {
    const { estado } = req.body;
    const { codigo_ot } = req.params;
    db.prepare("UPDATE ordenes_trabajo SET estado = ? WHERE codigo_ot = ?").run(
      estado,
      codigo_ot,
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/ordenes-trabajo/:id", (req, res) => {
  try {
    const { velocidad_u_hora, cant_objetivo, fecha_inicio, articulo, destino } =
      req.body;

    db.prepare(
      `
      UPDATE ordenes_trabajo 
      SET velocidad_u_hora = COALESCE(?, velocidad_u_hora),
          cant_objetivo = COALESCE(?, cant_objetivo),
          fecha_inicio = COALESCE(?, fecha_inicio),
          articulo = COALESCE(?, articulo),
          destino = COALESCE(?, destino)
      WHERE id = ?
    `,
    ).run(
      velocidad_u_hora ?? null,
      cant_objetivo ?? null,
      fecha_inicio ?? null,
      articulo ?? null,
      destino ?? null,
      req.params.id,
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/ordenes-trabajo/:id", (req, res) => {
  try {
    db.prepare("DELETE FROM ordenes_trabajo WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3001;
app.listen(PORT, () =>
  console.log(`Backend local corriendo en http://localhost:${PORT}`),
);
