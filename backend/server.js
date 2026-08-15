const express = require("express")
const cors = require("cors")
const Database = require("better-sqlite3")

const app = express()

app.use(cors())
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ limit: "50mb", extended: true }))

// ==========================================
// 🔗 CONFIGURACIÓN DE URLS DE GOOGLE SHEETS
// ==========================================
const VENTAS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_RUM1ExdkHAoOJmx_r-pPqH2VBa0Gto2AbfMZYQpoBJbXm7QskhW4F1ZvDbKnXYjaIED7GLBA5-Fd/pub?gid=2026958942&single=true&output=csv"

const STOCK_URLS = {
  stock_33:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS8kk1oZNfS1AOk6Ylu_rE6uNDdi7BJQBkMFKACCH_dRFpeIsJW8ii5QCdhyKQbSyCaQciC2GgVKLBR/pub?gid=1240979540&single=true&output=csv",
  stock_26:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS8kk1oZNfS1AOk6Ylu_rE6uNDdi7BJQBkMFKACCH_dRFpeIsJW8ii5QCdhyKQbSyCaQciC2GgVKLBR/pub?gid=1229097956&single=true&output=csv",
  stock_ayolas:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS8kk1oZNfS1AOk6Ylu_rE6uNDdi7BJQBkMFKACCH_dRFpeIsJW8ii5QCdhyKQbSyCaQciC2GgVKLBR/pub?gid=1103232715&single=true&output=csv",
  stock_37: "PEGA_AQUI_LA_URL_DE_STOCK_37",
}

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
]

const db = new Database("conoflex_local.db")

// 1. CREACIÓN DE TABLAS
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
`)

function getCurrentLocalTime() {
  return new Date()
    .toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour12: false,
    })
    .replace(",", "")
}

function parseCSVLine(line) {
  const result = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes
    else if (line[i] === "," && !inQuotes) {
      result.push(current.trim())
      current = ""
    } else current += line[i]
  }
  result.push(current.trim())
  return result
}

function parseFechaDeterminista(rawStr) {
  if (!rawStr || typeof rawStr !== "string") return null
  const clean = rawStr.trim().split(" ")[0]
  if (!clean) return null

  if (clean.includes("/")) {
    const parts = clean.split("/")
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10)
      const month = parseInt(parts[1], 10)
      let year = parseInt(parts[2], 10)
      if (isNaN(day) || isNaN(month) || isNaN(year)) return null
      if (year < 100) year += 2000
      const d = new Date(year, month - 1, day)
      if (!isNaN(d.getTime())) return d
    }
  }

  if (clean.includes("-")) {
    const parts = clean.split("-")
    if (parts.length === 3) {
      const p0 = parseInt(parts[0], 10)
      const p1 = parseInt(parts[1], 10)
      const p2 = parseInt(parts[2], 10)
      if (isNaN(p0) || isNaN(p1) || isNaN(p2)) return null

      if (p0 > 1000) {
        const d = new Date(p0, p1 - 1, p2)
        if (!isNaN(d.getTime())) return d
      } else {
        const year = p2 < 100 ? p2 + 2000 : p2
        const d = new Date(year, p1 - 1, p0)
        if (!isNaN(d.getTime())) return d
      }
    }
  }

  return null
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
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.put("/api/materias-primas/:id/stock", (req, res) => {
  try {
    db.prepare("UPDATE materias_primas SET stock_actual = ? WHERE id = ?").run(
      req.body.stock,
      req.params.id,
    )
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ==========================================
// MÓDULO 2: SEMIELABORADOS Y DÍAS DE STOCK
// ==========================================
app.get("/api/semielaborados", (req, res) => {
  try {
    const semielaborados = db
      .prepare(
        `
      SELECT s.*, COUNT(i.id) as recetas_count FROM semielaborados s 
      LEFT JOIN ingenierias i ON s.id = i.semielaborado_id GROUP BY s.id ORDER BY s.orden ASC, s.id ASC
    `,
      )
      .all()

    const pts = db
      .prepare("SELECT id, promedio_ventas_mensual FROM productos_terminados")
      .all()
    const activeRecipesPT = db
      .prepare(
        "SELECT id, producto_terminado_id FROM ingenierias WHERE es_activa = 1 AND producto_terminado_id IS NOT NULL",
      )
      .all()
    const recipeDetailsPT = db
      .prepare(
        "SELECT ingenieria_id, semielaborado_id, cantidad FROM ingenieria_detalles WHERE semielaborado_id IS NOT NULL",
      )
      .all()

    const seDemandMap = {}
    pts.forEach((pt) => {
      if (!pt.promedio_ventas_mensual) return
      const activeRecipe = activeRecipesPT.find(
        (r) => r.producto_terminado_id === pt.id,
      )
      if (!activeRecipe) return

      const details = recipeDetailsPT.filter(
        (d) => d.ingenieria_id === activeRecipe.id,
      )
      details.forEach((det) => {
        if (!seDemandMap[det.semielaborado_id])
          seDemandMap[det.semielaborado_id] = 0
        seDemandMap[det.semielaborado_id] +=
          pt.promedio_ventas_mensual * det.cantidad
      })
    })

    const result = semielaborados.map((se) => {
      const totalStock =
        (se.stock_33 || 0) +
        (se.stock_26 || 0) +
        (se.stock_ayolas || 0) +
        (se.stock_37 || 0)
      const demand = seDemandMap[se.id] || 0
      let dias_stock =
        demand > 0 ? Math.round((totalStock / demand) * 30) : null
      return {
        ...se,
        demanda_mensual: Math.round(demand),
        dias_stock: dias_stock,
      }
    })

    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.put("/api/semielaborados/:id/stock", (req, res) => {
  try {
    db.prepare(
      `UPDATE semielaborados SET ${req.body.campoDeposito} = ? WHERE id = ?`,
    ).run(req.body.stock, req.params.id)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post("/api/semielaborados/recargar-sheets", async (req, res) => {
  try {
    const updatesMap = {}
    for (const [sucursalKey, csvUrl] of Object.entries(STOCK_URLS)) {
      if (!csvUrl || csvUrl.startsWith("PEGA_AQUI")) continue
      const response = await fetch(csvUrl)
      if (!response.ok) continue
      const lines = (await response.text()).split("\n")
      for (let line of lines) {
        const cols = parseCSVLine(line)
        if (cols.length < 5 || !cols[0]) continue
        const codeUpper = cols[0].toUpperCase()
        if (EXCLUDED_CODES.includes(codeUpper)) continue
        const parsedStock = parseFloat(cols[4].replace(",", "."))
        if (isNaN(parsedStock)) continue
        if (!updatesMap[codeUpper]) updatesMap[codeUpper] = {}
        updatesMap[codeUpper][sucursalKey] = parsedStock
      }
    }
    const updateStmt = db.prepare(
      `UPDATE semielaborados SET stock_33 = COALESCE(?, stock_33), stock_26 = COALESCE(?, stock_26), stock_ayolas = COALESCE(?, stock_ayolas), stock_37 = COALESCE(?, stock_37) WHERE codigo = ?`,
    )
    db.transaction(() => {
      for (const [codeUpper, stocks] of Object.entries(updatesMap)) {
        updateStmt.run(
          stocks.stock_33 !== undefined ? stocks.stock_33 : null,
          stocks.stock_26 !== undefined ? stocks.stock_26 : null,
          stocks.stock_ayolas !== undefined ? stocks.stock_ayolas : null,
          stocks.stock_37 !== undefined ? stocks.stock_37 : null,
          codeUpper,
        )
      }
    })()
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ==========================================
// MÓDULO 3: PRODUCTOS TERMINADOS (VENTAS)
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
      .all()
    res.json(rows)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post("/api/productos-terminados/sincronizar-ventas", async (req, res) => {
  const csvUrl = req.body?.csvUrl || VENTAS_CSV_URL
  if (!csvUrl || csvUrl.startsWith("PEGA_AQUI")) {
    return res
      .status(400)
      .json({
        error: "No se ha configurado la URL de VENTAS_CSV_URL en server.js",
      })
  }

  try {
    const response = await fetch(csvUrl)
    if (!response.ok)
      return res
        .status(400)
        .json({ error: "No se pudo acceder a la URL del CSV" })

    const csvText = await response.text()
    const lines = csvText.split("\n")
    if (lines.length < 2) return res.status(400).json({ error: "CSV vacío" })

    const headers = parseCSVLine(lines[0]).map((h) => h.toUpperCase().trim())
    const idxFecha = headers.indexOf("FECHA")
    const idxModelo = headers.indexOf("MODELO")
    const idxCantidad = headers.indexOf("CANTIDAD")
    const idxEstado = headers.indexOf("ESTADO")

    if (idxFecha === -1 || idxModelo === -1 || idxCantidad === -1) {
      return res
        .status(400)
        .json({ error: "El CSV debe contener FECHA, MODELO y CANTIDAD" })
    }

    let maxFecha = new Date(0)
    const parsedRows = []

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i])
      if (cols.length <= Math.max(idxFecha, idxModelo, idxCantidad)) continue

      const estado =
        idxEstado !== -1 ? cols[idxEstado].trim().toUpperCase() : ""
      if (estado === "CANCELADO" || estado === "SIN STOCK") continue

      const d = parseFechaDeterminista(cols[idxFecha])
      if (d) {
        if (d > maxFecha) maxFecha = d

        let cant = parseFloat(cols[idxCantidad].replace(",", "."))
        if (isNaN(cant)) cant = 0

        let cod = cols[idxModelo].trim().toUpperCase()

        const matchMultiplicador = cod.match(/(.*?)\s+X(\d+)$/)
        if (matchMultiplicador) {
          cod = matchMultiplicador[1].trim()
          cant = cant * parseInt(matchMultiplicador[2], 10)
        }

        if (cod && cant > 0) {
          parsedRows.push({ date: d, cod, cant })
        }
      }
    }

    const limiteTrimestre = new Date(maxFecha)
    limiteTrimestre.setDate(limiteTrimestre.getDate() - 93)

    const ventasMap = {}
    for (const row of parsedRows) {
      if (row.date >= limiteTrimestre) {
        if (!ventasMap[row.cod]) ventasMap[row.cod] = 0
        ventasMap[row.cod] += row.cant
      }
    }

    const upsertStmt = db.prepare(`
      INSERT INTO productos_terminados (codigo, nombre, promedio_ventas_mensual)
      VALUES (?, ?, ?) ON CONFLICT(codigo) DO UPDATE SET promedio_ventas_mensual = excluded.promedio_ventas_mensual
    `)

    db.transaction(() => {
      db.exec("UPDATE productos_terminados SET promedio_ventas_mensual = 0")
      for (const [cod, totalTrimestre] of Object.entries(ventasMap)) {
        const promedioMensual = totalTrimestre / 3
        upsertStmt.run(cod, cod, promedioMensual)
      }
    })()

    res.json({ success: true, count: Object.keys(ventasMap).length })
  } catch (error) {
    console.error("Error en sincronización:", error)
    res.status(500).json({ error: error.message })
  }
})

// ==========================================
// MÓDULO 4: INGENIERÍAS / BOM
// ==========================================
app.get("/api/ingenierias/semielaborado/:id", (req, res) => {
  try {
    const ingenierias = db
      .prepare(
        "SELECT * FROM ingenierias WHERE semielaborado_id = ? ORDER BY es_activa DESC, id DESC",
      )
      .all(req.params.id)
    const getIngredientes = db.prepare(`
      SELECT d.id, d.ingenieria_id, d.materia_prima_id, d.semielaborado_id, d.cantidad, d.unidad_medida, COALESCE(mp.codigo, se.codigo) as item_codigo, COALESCE(mp.nombre, se.nombre) as item_nombre, CASE WHEN d.materia_prima_id IS NOT NULL THEN 'MP' ELSE 'SE' END as item_type FROM ingenieria_detalles d LEFT JOIN materias_primas mp ON d.materia_prima_id = mp.id LEFT JOIN semielaborados se ON d.semielaborado_id = se.id WHERE d.ingenieria_id = ?
    `)
    res.json(
      ingenierias.map((ing) => ({
        ...ing,
        ingredientes: getIngredientes.all(ing.id),
      })),
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get("/api/ingenierias/producto-terminado/:id", (req, res) => {
  try {
    const ingenierias = db
      .prepare(
        "SELECT * FROM ingenierias WHERE producto_terminado_id = ? ORDER BY es_activa DESC, id DESC",
      )
      .all(req.params.id)
    const getIngredientes = db.prepare(`
      SELECT d.id, d.ingenieria_id, d.materia_prima_id, d.semielaborado_id, d.cantidad, d.unidad_medida, COALESCE(mp.codigo, se.codigo) as item_codigo, COALESCE(mp.nombre, se.nombre) as item_nombre, CASE WHEN d.materia_prima_id IS NOT NULL THEN 'MP' ELSE 'SE' END as item_type FROM ingenieria_detalles d LEFT JOIN materias_primas mp ON d.materia_prima_id = mp.id LEFT JOIN semielaborados se ON d.semielaborado_id = se.id WHERE d.ingenieria_id = ?
    `)
    res.json(
      ingenierias.map((ing) => ({
        ...ing,
        ingredientes: getIngredientes.all(ing.id),
      })),
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post("/api/ingenierias", (req, res) => {
  const { parent_id, parent_type, nombre_version, es_activa, ingredientes } =
    req.body
  const now = getCurrentLocalTime()
  try {
    const isSE = parent_type === "SE"
    const insertIngenieria = db.prepare(
      `INSERT INTO ingenierias (semielaborado_id, producto_terminado_id, nombre_version, es_activa, updated_at) VALUES (?, ?, ?, ?, ?)`,
    )
    const insertDetalle = db.prepare(
      `INSERT INTO ingenieria_detalles (ingenieria_id, materia_prima_id, semielaborado_id, cantidad, unidad_medida) VALUES (?, ?, ?, ?, ?)`,
    )
    const resetActivas = db.prepare(
      `UPDATE ingenierias SET es_activa = 0 WHERE ${isSE ? "semielaborado_id" : "producto_terminado_id"} = ?`,
    )

    let newId
    db.transaction(() => {
      if (es_activa) resetActivas.run(parent_id)
      const info = insertIngenieria.run(
        isSE ? parent_id : null,
        !isSE ? parent_id : null,
        nombre_version,
        es_activa ? 1 : 0,
        now,
      )
      newId = info.lastInsertRowid
      if (ingredientes) {
        for (let ing of ingredientes)
          insertDetalle.run(
            newId,
            ing.materia_prima_id || null,
            ing.semielaborado_id || null,
            ing.cantidad,
            ing.unidad_medida || "Unidades",
          )
      }
    })()
    res.json({ success: true, id: newId })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.put("/api/ingenierias/:id", (req, res) => {
  const { id } = req.params
  const { parent_id, parent_type, nombre_version, es_activa, ingredientes } =
    req.body
  const now = getCurrentLocalTime()
  try {
    const isSE = parent_type === "SE"
    const updateIngenieria = db.prepare(
      `UPDATE ingenierias SET nombre_version = ?, es_activa = ?, updated_at = ? WHERE id = ?`,
    )
    const resetActivas = db.prepare(
      `UPDATE ingenierias SET es_activa = 0 WHERE ${isSE ? "semielaborado_id" : "producto_terminado_id"} = ?`,
    )
    const deleteDetalles = db.prepare(
      `DELETE FROM ingenieria_detalles WHERE ingenieria_id = ?`,
    )
    const insertDetalle = db.prepare(
      `INSERT INTO ingenieria_detalles (ingenieria_id, materia_prima_id, semielaborado_id, cantidad, unidad_medida) VALUES (?, ?, ?, ?, ?)`,
    )

    db.transaction(() => {
      if (es_activa) resetActivas.run(parent_id)
      updateIngenieria.run(nombre_version, es_activa ? 1 : 0, now, id)
      deleteDetalles.run(id)
      if (ingredientes) {
        for (let ing of ingredientes)
          insertDetalle.run(
            id,
            ing.materia_prima_id || null,
            ing.semielaborado_id || null,
            ing.cantidad,
            ing.unidad_medida || "Unidades",
          )
      }
    })()
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.put("/api/ingenierias/:id/activar", (req, res) => {
  const { id } = req.params
  const { parent_id, parent_type } = req.body
  try {
    db.transaction(() => {
      db.prepare(
        `UPDATE ingenierias SET es_activa = 0 WHERE ${parent_type === "SE" ? "semielaborado_id" : "producto_terminado_id"} = ?`,
      ).run(parent_id)
      db.prepare(
        `UPDATE ingenierias SET es_activa = 1, updated_at = ? WHERE id = ?`,
      ).run(getCurrentLocalTime(), id)
    })()
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.delete("/api/ingenierias/:id", (req, res) => {
  try {
    db.prepare(`DELETE FROM ingenierias WHERE id = ?`).run(req.params.id)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

const PORT = 3001
app.listen(PORT, () =>
  console.log(`Backend local corriendo en http://localhost:${PORT}`),
)
