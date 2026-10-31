"use strict";
// Lista de compra de Vera: UNA solicitud de compra "en armado" por persona. Vera (y Nati, cuando le pasa materiales) van
// agregando renglones a esa misma solicitud en lugar de crear una por cada charla. Usa las mismas tablas que el módulo
// Solicitudes de Compra (solicitudes_compra / solicitudes_compra_items), así lo que se arma acá se ve y se firma allá.
const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

async function asegurarTablaListas(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS agentes_compras_listas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT NOT NULL,
      solicitud_id INT NOT NULL,
      cerrada TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      cerrada_at DATETIME NULL,
      KEY idx_usuario (usuario_id, cerrada)
    )`);
}

const hoyIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());

/** Busca una materia prima por nombre o código dentro de la lista [{id,codigo,nombre,unidad}]. */
function resolverMateria(materias, q) {
  const t = sinAcentos(q);
  if (!t) return { error: "Falta indicar la materia prima." };
  let c = materias.filter((m) => sinAcentos(m.nombre) === t || sinAcentos(m.codigo) === t);
  if (!c.length) c = materias.filter((m) => sinAcentos(m.nombre).includes(t) || sinAcentos(m.codigo).includes(t));
  if (!c.length) return { error: `No encuentro una materia prima que coincida con "${q}".` };
  if (c.length > 1) return { error: `"${q}" coincide con varias materias primas. Indicá cuál.`, coincidencias: c.slice(0, 10).map((m) => m.nombre) };
  return { materia: c[0] };
}

async function listaAbierta(db, usuarioId) {
  const [r] = await db.query(
    `SELECT l.id, l.solicitud_id, DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i') AS creada
       FROM agentes_compras_listas l JOIN solicitudes_compra s ON s.id = l.solicitud_id
      WHERE l.usuario_id = ? AND l.cerrada = 0 ORDER BY l.id DESC LIMIT 1`,
    [usuarioId],
  );
  return r[0] || null;
}

async function leerLista(db, usuarioId) {
  const l = await listaAbierta(db, usuarioId);
  if (!l) return { abierta: false, solicitud_id: null, items: [], total_renglones: 0 };
  const [items] = await db.query(
    "SELECT id, articulo, proveedor, cantidad_solicitada AS cantidad, prioridad, materia_prima_id FROM solicitudes_compra_items WHERE solicitud_id = ? ORDER BY prioridad DESC, id",
    [l.solicitud_id],
  );
  return { abierta: true, solicitud_id: l.solicitud_id, creada: l.creada, items, total_renglones: items.length };
}

async function proveedorHabitual(db, mp) {
  const [r] = await db.query(
    "SELECT proveedor, COUNT(*) AS n FROM solicitudes_compra_items WHERE (materia_prima_id = ? OR LOWER(TRIM(articulo)) = LOWER(TRIM(?))) AND proveedor IS NOT NULL AND proveedor <> '' AND proveedor <> 'Libre' GROUP BY proveedor ORDER BY n DESC, MAX(id) DESC LIMIT 1",
    [mp.id, mp.nombre],
  );
  return r[0]?.proveedor || null;
}

/**
 * Agrega renglones a la solicitud en armado (la crea si no hay una).
 * items: [{ materia:{id,nombre}, cantidad, proveedor?, prioridad?, sumar? }]
 * Si el material ya está en la lista, se corrige su cantidad (o se suma si sumar=true): nunca queda duplicado.
 */
async function agregarALista(db, usuario, items) {
  const validos = (items || []).filter((i) => i?.materia?.id && Number(i.cantidad) > 0);
  if (!validos.length) return { error: "No hay materiales con cantidad para agregar." };
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let l = await listaAbierta(conn, usuario.id);
    let creada = false;
    if (!l) {
      const [s] = await conn.query("INSERT INTO solicitudes_compra (fecha, estado) VALUES (?, 'ABIERTA')", [hoyIso()]);
      const [li] = await conn.query("INSERT INTO agentes_compras_listas (usuario_id, solicitud_id) VALUES (?, ?)", [usuario.id, s.insertId]);
      l = { id: li.insertId, solicitud_id: s.insertId };
      creada = true;
    }
    const agregados = [];
    const actualizados = [];
    for (const it of validos) {
      const cantidad = Math.round(Number(it.cantidad) * 100) / 100;
      const [ex] = await conn.query("SELECT id, cantidad_solicitada, proveedor FROM solicitudes_compra_items WHERE solicitud_id = ? AND (materia_prima_id = ? OR LOWER(TRIM(articulo)) = LOWER(TRIM(?))) LIMIT 1", [l.solicitud_id, it.materia.id, it.materia.nombre]);
      if (ex[0]) {
        const nueva = it.sumar ? Math.round((Number(ex[0].cantidad_solicitada) + cantidad) * 100) / 100 : cantidad;
        await conn.query("UPDATE solicitudes_compra_items SET cantidad_solicitada = ?, proveedor = COALESCE(?, proveedor) WHERE id = ?", [nueva, it.proveedor || null, ex[0].id]);
        actualizados.push({ articulo: it.materia.nombre, antes: Number(ex[0].cantidad_solicitada), ahora: nueva });
      } else {
        const proveedor = it.proveedor || (await proveedorHabitual(conn, it.materia)) || "A definir";
        const prioridad = Math.min(5, Math.max(1, Number(it.prioridad) || 3));
        await conn.query(
          "INSERT INTO solicitudes_compra_items (solicitud_id, articulo, proveedor, cantidad_solicitada, prioridad, materia_prima_id) VALUES (?, ?, ?, ?, ?, ?)",
          [l.solicitud_id, it.materia.nombre, proveedor, cantidad, prioridad, it.materia.id],
        );
        agregados.push({ articulo: it.materia.nombre, cantidad, unidad: it.materia.unidad || "", proveedor, prioridad });
      }
    }
    await conn.commit();
    return { ok: true, solicitud_id: l.solicitud_id, solicitud_nueva: creada, agregados, actualizados };
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

async function quitarDeLista(db, usuario, materia) {
  const l = await listaAbierta(db, usuario.id);
  if (!l) return { error: "No hay una lista de compra en armado." };
  const [r] = await db.query("DELETE FROM solicitudes_compra_items WHERE solicitud_id = ? AND (materia_prima_id = ? OR LOWER(TRIM(articulo)) = LOWER(TRIM(?))) AND COALESCE(cantidad_recibida,0) = 0", [l.solicitud_id, materia.id, materia.nombre]);
  if (!r.affectedRows) return { error: `${materia.nombre} no está en la lista.` };
  return { ok: true, quitado: materia.nombre, solicitud_id: l.solicitud_id };
}

async function cambiarProveedor(db, usuario, materia, proveedor) {
  const l = await listaAbierta(db, usuario.id);
  if (!l) return { error: "No hay una lista de compra en armado." };
  const [r] = await db.query("UPDATE solicitudes_compra_items SET proveedor = ? WHERE solicitud_id = ? AND (materia_prima_id = ? OR LOWER(TRIM(articulo)) = LOWER(TRIM(?)))", [String(proveedor).slice(0, 120), l.solicitud_id, materia.id, materia.nombre]);
  if (!r.affectedRows) return { error: `${materia.nombre} no está en la lista.` };
  return { ok: true, articulo: materia.nombre, proveedor };
}

/** Deja la solicitud lista para firmar: la próxima vez que se agregue algo se arma una nueva. */
async function cerrarLista(db, usuario) {
  const l = await listaAbierta(db, usuario.id);
  if (!l) return { error: "No hay una lista de compra en armado." };
  const [[c]] = await db.query("SELECT COUNT(*) AS n FROM solicitudes_compra_items WHERE solicitud_id = ?", [l.solicitud_id]);
  if (!Number(c.n)) return { error: "La lista está vacía: agregale materiales antes de cerrarla." };
  await db.query("UPDATE agentes_compras_listas SET cerrada = 1, cerrada_at = NOW() WHERE id = ?", [l.id]);
  return { ok: true, solicitud_id: l.solicitud_id, renglones: Number(c.n), siguiente_paso: "Queda en el módulo Solicitudes de Compra, lista para las firmas del jefe y del gerente." };
}

module.exports = { asegurarTablaListas, resolverMateria, leerLista, listaAbierta, agregarALista, quitarDeLista, cambiarProveedor, cerrarLista, sinAcentos };
