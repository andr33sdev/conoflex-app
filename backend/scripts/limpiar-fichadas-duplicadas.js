"use strict";
// Limpia las fichadas duplicadas ya guardadas.
//   node scripts/limpiar-fichadas-duplicadas.js            -> SOLO vista previa
//   node scripts/limpiar-fichadas-duplicadas.js --aplicar  -> mueve los duplicados
// Los duplicados NO se borran: se mueven a la tabla fichadas_duplicadas
// (reversible con la consulta que se imprime al final).
// Hacer un backup de `fichadas` antes de aplicar.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mysql = require("mysql2/promise");
const { separarDuplicadas, asegurarTablaDuplicadas, VENTANA_SEG } = require("../fichero");

(async () => {
  const aplicar = process.argv.includes("--aplicar");
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    dateStrings: true,
  });
  const [filas] = await db.query(
    "SELECT rec_no, empleado_id, nombre, fecha_hora, tipo FROM fichadas ORDER BY fecha_hora ASC, rec_no ASC",
  );
  const { duplicados } = separarDuplicadas(filas, [], VENTANA_SEG);
  console.log(`Ventana: ${VENTANA_SEG} s | Fichadas: ${filas.length} | Duplicadas: ${duplicados.length}`);

  const porNombre = {};
  for (const d of duplicados) porNombre[d.nombre] = (porNombre[d.nombre] || 0) + 1;
  console.table(porNombre);
  console.log("Ejemplos:", duplicados.slice(0, 8).map((d) => `${d.nombre} ${d.tipo} ${d.fecha_hora} (rec ${d.rec_no})`));

  if (!aplicar) {
    console.log("\nVista previa solamente. Para aplicar: agregar --aplicar");
    return db.end();
  }
  if (!duplicados.length) return db.end();

  await asegurarTablaDuplicadas(db);
  await db.beginTransaction();
  try {
    const ids = duplicados.map((d) => d.rec_no);
    for (let i = 0; i < ids.length; i += 500) {
      const lote = ids.slice(i, i + 500);
      await db.query("INSERT IGNORE INTO fichadas_duplicadas SELECT * FROM fichadas WHERE rec_no IN (?)", [lote]);
      await db.query("DELETE FROM fichadas WHERE rec_no IN (?)", [lote]);
    }
    await db.commit();
  } catch (e) { await db.rollback(); throw e; }
  console.log(`\n✔ Movidas ${duplicados.length} fichadas a fichadas_duplicadas.`);
  console.log("Para revertir: INSERT IGNORE INTO fichadas SELECT * FROM fichadas_duplicadas;");
  await db.end();
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
