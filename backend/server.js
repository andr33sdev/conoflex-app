const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Inicializa o crea el archivo de base de datos local automáticamente
const db = new Database('conoflex_local.db');

// 2. Crea la tabla automáticamente si no existe
db.exec(`
  CREATE TABLE IF NOT EXISTS materias_primas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    unidad_medida TEXT DEFAULT 'Unidades',
    stock_actual REAL DEFAULT 0.00,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 3. Inserta datos de prueba si la base de datos está vacía
const count = db.prepare('SELECT COUNT(*) as total FROM materias_primas').get();
if (count.total === 0) {
  const insert = db.prepare('INSERT INTO materias_primas (codigo, nombre, unidad_medida, stock_actual) VALUES (?, ?, ?, ?)');
  insert.run('MP-001', 'Resina PVC Flexible Orange', 'Kg', 250.00);
  insert.run('MP-002', 'Base de Goma Negra 75cm', 'Unidades', 120.00);
  insert.run('MP-003', 'Cinta Reflectiva 3M 4 Pulgadas', 'Metros', 500.00);
}

// ENDPOINT 1: Obtener todas las materias primas (Lectura)
app.get('/api/materias-primas', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM materias_primas ORDER BY id DESC').all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ENDPOINT 2: Actualizar stock de un artículo (Lápiz -> Modal -> Diskette)
app.put('/api/materias-primas/:id/stock', (req, res) => {
  const { id } = req.params;
  const { stock } = req.body;
  
  try {
    const stmt = db.prepare('UPDATE materias_primas SET stock_actual = ? WHERE id = ?');
    stmt.run(stock, id);
    res.json({ success: true, message: 'Stock actualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ENDPOINT 3: Sincronizar Catálogo desde Excel (Agrega con stock 0 / Quita seleccionados)
app.post('/api/materias-primas/sincronizar', (req, res) => {
  const { paraAgregar, paraEliminarIds } = req.body;

  try {
    const insertStmt = db.prepare(`
      INSERT INTO materias_primas (codigo, nombre, unidad_medida, stock_actual)
      VALUES (?, ?, ?, 0.00)
      ON CONFLICT(codigo) DO UPDATE SET nombre=excluded.nombre
    `);

    const deleteStmt = db.prepare('DELETE FROM materias_primas WHERE id = ?');

    // Ejecución en transacción única
    const syncTransaction = db.transaction(() => {
      if (paraAgregar && paraAgregar.length > 0) {
        for (let item of paraAgregar) {
          insertStmt.run(item.codigo, item.nombre, item.unidad);
        }
      }
      if (paraEliminarIds && paraEliminarIds.length > 0) {
        for (let id of paraEliminarIds) {
          deleteStmt.run(id);
        }
      }
    });

    syncTransaction();
    res.json({ success: true, message: 'Sincronización completada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend local corriendo en http://localhost:${PORT} (Base de datos SQLite activa)`);
});