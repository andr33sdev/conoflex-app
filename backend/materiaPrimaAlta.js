"use strict";
// Alta de una materia prima nueva (código, nombre, unidad y proveedor). El stock inicial solo lo puede cargar un administrador
// y queda en el historial como edición directa, igual que cualquier ajuste manual.
const UNIDADES = ["KILOS", "UNIDADES", "METROS", "M2", "LITROS", "PAQUETES", "ROLLOS"];
const PLANTAS = ["Argentina", "Paraguay"];

const num = (v) => Number(String(v ?? "").replace(",", "."));

/** Valida y normaliza lo que llega del formulario. Devuelve { error } o { valores }. */
function validarAltaMP(body = {}) {
  const codigo = String(body.codigo || "").trim().toUpperCase().slice(0, 255);
  const nombre = String(body.nombre || "").trim().slice(0, 255);
  if (!codigo) return { error: "Poné el código de la materia prima." };
  if (/\s{2,}/.test(codigo)) return { error: "El código no puede tener espacios repetidos." };
  if (!nombre) return { error: "Poné el nombre de la materia prima." };
  const unidad = String(body.unidad_medida || "KILOS").trim().toUpperCase();
  if (!UNIDADES.includes(unidad)) return { error: "Elegí una unidad de medida válida." };
  const planta = PLANTAS.find((p) => p.toLowerCase() === String(body.planta || "Argentina").trim().toLowerCase());
  if (!planta) return { error: "Elegí una planta válida." };
  const minimo = body.stock_minimo === undefined || body.stock_minimo === null || body.stock_minimo === "" ? 0 : num(body.stock_minimo);
  if (!Number.isFinite(minimo) || minimo < 0) return { error: "El punto de pedido tiene que ser un número mayor o igual a cero." };
  const stock = body.stock_inicial === undefined || body.stock_inicial === null || body.stock_inicial === "" ? 0 : num(body.stock_inicial);
  if (!Number.isFinite(stock) || stock < 0) return { error: "El stock inicial tiene que ser un número mayor o igual a cero." };
  const proveedor = body.proveedor_id ? Number(body.proveedor_id) : null;
  if (body.proveedor_id && !Number.isInteger(proveedor)) return { error: "Proveedor no válido." };
  return { valores: { codigo, nombre, unidad_medida: unidad, planta, stock_minimo: minimo, stock_inicial: stock, proveedor_id: proveedor } };
}

// Algunas instalaciones crearon la tabla sin estas columnas: se agregan una sola vez si faltan.
let columnasListas = false;
async function asegurarColumnasMP(db) {
  if (columnasListas) return;
  const quiero = { proveedor_id: "INT NULL", planta: "VARCHAR(50) DEFAULT 'Argentina'", stock_minimo: "DOUBLE DEFAULT 0" };
  const [cols] = await db.query("SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'materias_primas'");
  const tiene = new Set(cols.map((x) => String(x.c).toLowerCase()));
  for (const [c, def] of Object.entries(quiero)) if (!tiene.has(c)) await db.query(`ALTER TABLE materias_primas ADD COLUMN ${c} ${def}`);
  columnasListas = true;
}

/**
 * Crea la materia prima. `usuario` = { nombre, email, rol }. `moverStock` es la función de stockMovimientos.
 * Devuelve { status, body } listo para responder.
 */
async function crearMateriaPrima(db, body, usuario, moverStock) {
  const v = validarAltaMP(body);
  if (v.error) return { status: 400, body: { error: v.error } };
  const x = v.valores;
  const esAdmin = String(usuario?.rol || "").toUpperCase() === "ADMIN";
  if (x.stock_inicial > 0 && !esAdmin) return { status: 403, body: { error: "Solo un administrador puede cargar el stock inicial. Creala sin stock y que lo cargue un administrador." } };
  await asegurarColumnasMP(db);
  if (x.proveedor_id) {
    const [p] = await db.query("SELECT id FROM proveedores WHERE id = ?", [x.proveedor_id]);
    if (!p.length) return { status: 400, body: { error: "Ese proveedor no existe." } };
  }
  const [dup] = await db.query("SELECT id, nombre FROM materias_primas WHERE UPPER(codigo) = ?", [x.codigo]);
  if (dup.length) return { status: 409, body: { error: `Ya existe una materia prima con el código ${x.codigo} (${dup[0].nombre}).` } };
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      "INSERT INTO materias_primas (codigo, nombre, unidad_medida, stock_actual, planta, proveedor_id, stock_minimo) VALUES (?,?,?,?,?,?,?)",
      [x.codigo, x.nombre, x.unidad_medida, 0, x.planta, x.proveedor_id, x.stock_minimo],
    );
    if (x.stock_inicial > 0) {
      await moverStock(conn, {
        mp_id: r.insertId, delta: x.stock_inicial, tipo: "AJUSTE_MANUAL", usuario: usuario?.nombre || usuario?.email || "Admin",
        referencia_texto: "Stock inicial", detalle: { stock_anterior: 0, stock_nuevo: x.stock_inicial, motivo: "Alta de la materia prima" },
      });
    }
    await conn.commit();
    const [fila] = await conn.query("SELECT * FROM materias_primas WHERE id = ?", [r.insertId]);
    return { status: 201, body: fila[0] };
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { validarAltaMP, crearMateriaPrima, asegurarColumnasMP, UNIDADES, PLANTAS };
