"use strict";
// Demanda mensual de semielaborados.
//
// Se parte de las ventas (la tabla estado_pedidos: cada pedido es una venta) de los últimos N meses,
// por modelo. Cada modelo es un producto terminado; su ingeniería activa dice de qué semielaborados
// está compuesto y cuántos lleva por unidad. La demanda mensual de un semielaborado es la suma,
// sobre TODOS los productos terminados en cuya ingeniería participa, de:
//     (unidades vendidas por mes del producto) x (cantidad del semielaborado por unidad).

const redondear = (n, d = 1) => Math.round((Number(n) + Number.EPSILON) * 10 ** d) / 10 ** d;
const clave = (v) => String(v ?? "").trim().toUpperCase();

/**
 * Cálculo puro.
 *  ventas: [{ modelo, total }]  (unidades vendidas en el período)
 *  productos: [{ id, codigo, nombre }]
 *  ingenieriasPT: [{ id, producto_terminado_id }]   (solo las activas)
 *  detalles: [{ ingenieria_id, semielaborado_id, cantidad }]
 *  semielaborados: [{ id, codigo, nombre, stock_total? }]
 */
function calcularDemanda({ meses, ventas, productos, ingenieriasPT, detalles, semielaborados }) {
  const ventasPorModelo = new Map();
  for (const v of ventas) ventasPorModelo.set(clave(v.modelo), (ventasPorModelo.get(clave(v.modelo)) || 0) + Number(v.total || 0));

  const usados = new Set(); // modelos que corresponden a algún producto
  const porProducto = new Map(); // id -> { producto, unidades, mensual }
  for (const p of productos) {
    const kc = clave(p.codigo);
    const kn = clave(p.nombre);
    let unidades = 0;
    if (kc && ventasPorModelo.has(kc)) { unidades = ventasPorModelo.get(kc); usados.add(kc); }
    else if (kn && ventasPorModelo.has(kn)) { unidades = ventasPorModelo.get(kn); usados.add(kn); }
    porProducto.set(p.id, { producto: p, unidades, mensual: unidades / meses });
  }

  const recetaDe = new Map(ingenieriasPT.map((i) => [i.producto_terminado_id, i.id]));
  const detallesPorIng = new Map();
  for (const d of detalles) {
    if (!detallesPorIng.has(d.ingenieria_id)) detallesPorIng.set(d.ingenieria_id, []);
    detallesPorIng.get(d.ingenieria_id).push(d);
  }

  const porSemi = new Map(); // id -> { demanda, usadoEn: [] }
  const sinIngenieria = [];
  for (const { producto, unidades, mensual } of porProducto.values()) {
    if (unidades <= 0) continue;
    const ing = recetaDe.get(producto.id);
    const det = ing ? detallesPorIng.get(ing) || [] : [];
    if (!det.length) {
      sinIngenieria.push({ producto: producto.nombre || producto.codigo, unidades_vendidas: redondear(unidades, 0) });
      continue;
    }
    for (const d of det) {
      const cant = Number(d.cantidad) || 0;
      if (!cant) continue;
      const acc = porSemi.get(d.semielaborado_id) || { demanda: 0, usadoEn: new Map() };
      const aporte = mensual * cant;
      acc.demanda += aporte;
      const u = acc.usadoEn.get(producto.id) || { producto: producto.nombre || producto.codigo, codigo: producto.codigo, ventas_mensuales: redondear(mensual, 1), cantidad_por_unidad: 0, aporte_mensual: 0 };
      u.cantidad_por_unidad = redondear(u.cantidad_por_unidad + cant, 3);
      u.aporte_mensual = redondear(u.aporte_mensual + aporte, 1);
      acc.usadoEn.set(producto.id, u);
      porSemi.set(d.semielaborado_id, acc);
    }
  }

  const resultado = semielaborados.map((se) => {
    const acc = porSemi.get(se.id);
    const demanda = acc ? acc.demanda : 0;
    const stock = se.stock_total;
    return {
      codigo: se.codigo,
      nombre: se.nombre,
      demanda_mensual: redondear(demanda, 1),
      ...(stock != null ? { stock_total: redondear(stock, 1), dias_de_stock: demanda > 0 ? Math.round((stock / demanda) * 30) : null } : {}),
      usado_en: acc ? [...acc.usadoEn.values()].sort((a, b) => b.aporte_mensual - a.aporte_mensual) : [],
    };
  });

  const modelosSinProducto = [...ventasPorModelo.entries()]
    .filter(([k]) => k && !usados.has(k))
    .map(([modelo, total]) => ({ modelo, unidades_vendidas: redondear(total, 0) }))
    .sort((a, b) => b.unidades_vendidas - a.unidades_vendidas);

  return { resultado, sinIngenieria, modelosSinProducto };
}

function fechaISO(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Carga los datos y devuelve la demanda mensual de semielaborados. */
async function demandaSemielaborados(pool, { meses, semielaborado, producto, incluir_cancelados, solo_con_demanda, ahora = new Date() } = {}) {
  const n = Math.min(36, Math.max(1, Math.round(Number(meses) || 3)));
  const hasta = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const desde = new Date(hasta.getFullYear(), hasta.getMonth() - n, hasta.getDate());

  const [ventas] = await pool.query(
    `SELECT UPPER(TRIM(modelo)) AS modelo, SUM(cantidad) AS total
       FROM estado_pedidos
      WHERE fecha >= ? AND fecha <= ?
        ${incluir_cancelados ? "" : "AND (estado IS NULL OR UPPER(TRIM(estado)) NOT LIKE 'CANCELAD%')"}
      GROUP BY UPPER(TRIM(modelo))`,
    [fechaISO(desde), fechaISO(hasta)],
  );
  const [productos] = await pool.query("SELECT id, codigo, nombre FROM productos_terminados");
  const [ingenieriasPT] = await pool.query("SELECT id, producto_terminado_id FROM ingenierias WHERE es_activa = 1 AND producto_terminado_id IS NOT NULL");
  const [detalles] = await pool.query("SELECT ingenieria_id, semielaborado_id, cantidad FROM ingenieria_detalles WHERE semielaborado_id IS NOT NULL");
  const [semis] = await pool.query("SELECT id, codigo, nombre, stock_33, stock_26, stock_ayolas, stock_37 FROM semielaborados");
  const semielaborados = semis.map((s) => ({
    id: s.id, codigo: s.codigo, nombre: s.nombre,
    stock_total: Math.max(0, (Number(s.stock_33) || 0) + (Number(s.stock_26) || 0) + (Number(s.stock_ayolas) || 0) + (Number(s.stock_37) || 0)),
  }));

  const calc = calcularDemanda({ meses: n, ventas, productos, ingenieriasPT, detalles, semielaborados });
  let filas = calc.resultado;
  const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  if (semielaborado) {
    const q = sinAcentos(semielaborado);
    filas = filas.filter((f) => sinAcentos(f.nombre).includes(q) || sinAcentos(f.codigo).includes(q));
    if (!filas.length) return { error: `No encuentro un semielaborado que coincida con "${semielaborado}".` };
  }
  if (producto) {
    const q = sinAcentos(producto);
    filas = filas
      .map((f) => ({ ...f, usado_en: f.usado_en.filter((u) => sinAcentos(u.producto).includes(q) || sinAcentos(u.codigo).includes(q)) }))
      .filter((f) => f.usado_en.length)
      .map((f) => {
        const demanda = f.usado_en.reduce((a, u) => a + u.aporte_mensual, 0);
        return { ...f, demanda_mensual: redondear(demanda, 1), ...(f.stock_total != null ? { dias_de_stock: demanda > 0 ? Math.round((f.stock_total / demanda) * 30) : null } : {}) };
      });
  }
  if (solo_con_demanda !== false && !semielaborado) filas = filas.filter((f) => f.demanda_mensual > 0);
  filas.sort((a, b) => b.demanda_mensual - a.demanda_mensual);

  return {
    periodo: `últimos ${n} ${n === 1 ? "mes" : "meses"} (${fechaISO(desde)} al ${fechaISO(hasta)}), tabla estado_pedidos${incluir_cancelados ? "" : ", sin pedidos cancelados"}`,
    meses: n,
    metodo: "unidades vendidas del producto en el período / meses x cantidad del semielaborado por unidad en la ingeniería activa del producto, sumado sobre todos los productos en los que participa",
    ...(producto ? { filtrado_por_producto: producto } : {}),
    cantidad_de_semielaborados: filas.length,
    semielaborados: filas,
    productos_vendidos_sin_ingenieria_activa: calc.sinIngenieria,
    modelos_vendidos_sin_producto_cargado: calc.modelosSinProducto.slice(0, 15),
  };
}

/**
 * Demanda mensual de materias primas (cálculo puro).
 * Las ventas de cada producto terminado se "explotan" por su ingeniería activa: los materiales directos suman
 * su cantidad, y cada semielaborado se abre a su vez por su propia receta activa (kg por pieza).
 *   demanda de la MP = Σ productos ( ventas por mes × cantidad que lleva, a través de cada semielaborado )
 */
function calcularDemandaMP({ meses, ventas, productos, ingenieriasPT, ingenieriasSE, detalles, materiasPrimas, semielaborados = [] }) {
  const ventasPorModelo = new Map();
  for (const v of ventas) ventasPorModelo.set(clave(v.modelo), (ventasPorModelo.get(clave(v.modelo)) || 0) + Number(v.total || 0));

  const detPorIng = new Map();
  for (const d of detalles) {
    if (!detPorIng.has(d.ingenieria_id)) detPorIng.set(d.ingenieria_id, []);
    detPorIng.get(d.ingenieria_id).push(d);
  }
  const recetaPT = new Map(ingenieriasPT.map((i) => [i.producto_terminado_id, i.id]));
  const recetaSE = new Map(ingenieriasSE.map((i) => [i.semielaborado_id, i.id]));
  const nombreSE = new Map(semielaborados.map((s) => [s.id, s.nombre || s.codigo]));

  const porMP = new Map(); // id -> { demanda, usadoEn: Map }
  const sinReceta = new Map(); // semielaborado_id -> unidades por mes que quedan sin explotar
  const sinIngenieria = [];

  function explotar(ingId, factor, ctx, camino) {
    for (const d of detPorIng.get(ingId) || []) {
      const cant = Number(d.cantidad) || 0;
      if (!cant) continue;
      if (d.materia_prima_id) {
        const acc = porMP.get(d.materia_prima_id) || { demanda: 0, usadoEn: new Map() };
        const aporte = factor * cant;
        acc.demanda += aporte;
        const k = `${ctx.producto.id}|${ctx.via || ""}`;
        const u = acc.usadoEn.get(k) || { producto: ctx.producto.nombre || ctx.producto.codigo, codigo: ctx.producto.codigo, via: ctx.via || null, aporte_mensual: 0 };
        u.aporte_mensual += aporte;
        acc.usadoEn.set(k, u);
        porMP.set(d.materia_prima_id, acc);
      } else if (d.semielaborado_id) {
        const rec = recetaSE.get(d.semielaborado_id);
        if (!rec || camino.includes(d.semielaborado_id) || camino.length > 5) {
          if (!rec) sinReceta.set(d.semielaborado_id, (sinReceta.get(d.semielaborado_id) || 0) + factor * cant);
          continue;
        }
        explotar(rec, factor * cant, { producto: ctx.producto, via: ctx.via || nombreSE.get(d.semielaborado_id) || `SE ${d.semielaborado_id}` }, [...camino, d.semielaborado_id]);
      }
    }
  }

  const usados = new Set();
  for (const p of productos) {
    const kc = clave(p.codigo);
    const kn = clave(p.nombre);
    let unidades = 0;
    if (kc && ventasPorModelo.has(kc)) { unidades = ventasPorModelo.get(kc); usados.add(kc); }
    else if (kn && ventasPorModelo.has(kn)) { unidades = ventasPorModelo.get(kn); usados.add(kn); }
    if (unidades <= 0) continue;
    const ing = recetaPT.get(p.id);
    if (!ing || !(detPorIng.get(ing) || []).length) {
      sinIngenieria.push({ producto: p.nombre || p.codigo, unidades_vendidas: redondear(unidades, 0) });
      continue;
    }
    explotar(ing, unidades / meses, { producto: p, via: null }, []);
  }

  const resultado = materiasPrimas.map((mp) => {
    const acc = porMP.get(mp.id);
    const demanda = acc ? acc.demanda : 0;
    const stock = Number(mp.stock_actual) || 0;
    return {
      id: mp.id,
      codigo: mp.codigo,
      nombre: mp.nombre,
      unidad: mp.unidad_medida || "KILOS",
      stock_actual: redondear(stock, 2),
      demanda_mensual: redondear(demanda, 1),
      consumo_real_mensual: mp.consumo_real_mensual != null ? redondear(mp.consumo_real_mensual, 1) : null,
      dias_de_stock: demanda > 0 ? Math.max(0, Math.round((stock / demanda) * 30)) : null,
      a_reponer_1_mes: demanda > 0 ? redondear(Math.max(0, demanda - stock), 0) : 0,
      usado_en: acc ? [...acc.usadoEn.values()].map((u) => ({ ...u, aporte_mensual: redondear(u.aporte_mensual, 1) })).sort((a, b) => b.aporte_mensual - a.aporte_mensual) : [],
    };
  });
  return {
    resultado,
    sinIngenieria,
    semielaboradosSinReceta: [...sinReceta.entries()].map(([id, u]) => ({ nombre: nombreSE.get(id) || `SE ${id}`, unidades_por_mes: redondear(u, 1) })),
  };
}

/** Carga los datos y devuelve la demanda mensual de materias primas (por defecto, últimos 6 meses). */
async function demandaMateriasPrimas(pool, { meses, materia_prima, materia_prima_id, solo_con_demanda, ahora = new Date() } = {}) {
  const n = Math.min(36, Math.max(1, Math.round(Number(meses) || 6)));
  const hasta = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const desde = new Date(hasta.getFullYear(), hasta.getMonth() - n, hasta.getDate());

  const [ventas] = await pool.query(
    `SELECT UPPER(TRIM(modelo)) AS modelo, SUM(cantidad) AS total
       FROM estado_pedidos
      WHERE fecha >= ? AND fecha <= ?
        AND (estado IS NULL OR UPPER(TRIM(estado)) NOT LIKE 'CANCELAD%')
      GROUP BY UPPER(TRIM(modelo))`,
    [fechaISO(desde), fechaISO(hasta)],
  );
  const [productos] = await pool.query("SELECT id, codigo, nombre FROM productos_terminados");
  const [ingenieriasPT] = await pool.query("SELECT id, producto_terminado_id FROM ingenierias WHERE es_activa = 1 AND producto_terminado_id IS NOT NULL");
  const [ingenieriasSE] = await pool.query("SELECT id, semielaborado_id FROM ingenierias WHERE es_activa = 1 AND semielaborado_id IS NOT NULL");
  const [detalles] = await pool.query("SELECT ingenieria_id, materia_prima_id, semielaborado_id, cantidad FROM ingenieria_detalles");
  const [semielaborados] = await pool.query("SELECT id, codigo, nombre FROM semielaborados");
  const [mps] = await pool.query("SELECT id, codigo, nombre, unidad_medida, stock_actual FROM materias_primas");

  // Consumo real registrado (producción aprobada) en el mismo período, como contraste.
  let consumo = new Map();
  try {
    const [c] = await pool.query(
      "SELECT materia_prima_id, SUM(-cantidad) AS total FROM mp_movimientos WHERE tipo IN ('CONSUMO_PRODUCCION', 'REVERSA_PRODUCCION') AND DATE(fecha) >= ? AND DATE(fecha) <= ? GROUP BY materia_prima_id",
      [fechaISO(desde), fechaISO(hasta)],
    );
    consumo = new Map(c.map((r) => [r.materia_prima_id, Number(r.total) || 0]));
  } catch { /* sin tabla de movimientos */ }
  const materiasPrimas = mps.map((m) => ({ ...m, consumo_real_mensual: consumo.has(m.id) ? consumo.get(m.id) / n : null }));

  const calc = calcularDemandaMP({ meses: n, ventas, productos, ingenieriasPT, ingenieriasSE, detalles, materiasPrimas, semielaborados });
  const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let filas = calc.resultado;
  const filtro = materia_prima_id != null || materia_prima;
  if (materia_prima_id != null) filas = filas.filter((f) => f.id === Number(materia_prima_id));
  else if (materia_prima) {
    const q = sinAcentos(materia_prima);
    filas = filas.filter((f) => sinAcentos(f.nombre).includes(q) || sinAcentos(f.codigo).includes(q));
  }
  if (filtro && !filas.length) return { error: `No encuentro una materia prima que coincida con "${materia_prima ?? materia_prima_id}".` };
  if (solo_con_demanda !== false && !filtro) filas = filas.filter((f) => f.demanda_mensual > 0 || f.stock_actual < 0);
  filas.sort((a, b) => b.demanda_mensual - a.demanda_mensual);

  return {
    periodo: `últimos ${n} ${n === 1 ? "mes" : "meses"} (${fechaISO(desde)} al ${fechaISO(hasta)}), pedidos sin cancelados`,
    meses: n,
    metodo: "unidades vendidas por mes de cada producto x lo que lleva de la materia prima (directo o a través de cada semielaborado, según su ingeniería activa). consumo_real_mensual es lo descontado por producción aprobada en el mismo período.",
    cantidad: filas.length,
    materias_primas: filas,
    productos_vendidos_sin_ingenieria_activa: calc.sinIngenieria,
    semielaborados_sin_receta_activa: calc.semielaboradosSinReceta,
  };
}

module.exports = { calcularDemanda, demandaSemielaborados, calcularDemandaMP, demandaMateriasPrimas };
