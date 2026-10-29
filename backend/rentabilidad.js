"use strict";
// Rentabilidad por producto, calculada con los datos reales de la tabla estado_pedidos.
//
// Regla de Conoflex (la que manda):
//   - punisiva = precio UNITARIO sin IVA, en PESOS, al que se vendió ese artículo en ese pedido.
//   - cosusd   = costo UNITARIO en DÓLARES.
//   - Como las monedas no se pueden comparar, el precio en pesos SIEMPRE se pasa a dólares con el
//     tipo de cambio, y recién ahí se multiplica por la cantidad vendida de ese renglón:
//         ingreso_usd  = (punisiva / tipo_cambio) x cantidad
//         costo_usd    = cosusd x cantidad
//         rentabilidad = ingreso_usd - costo_usd
//   - Un renglón sin precio o sin costo cargado (0 o vacío) NO entra al cálculo: con costo 0 la
//     "rentabilidad" sería todo el ingreso y falsearía el ranking. Se informa aparte.

const redondear = (n, d = 2) => Math.round((Number(n) + Number.EPSILON) * 10 ** d) / 10 ** d;
const clave = (v) => String(v ?? "").trim().toUpperCase();
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Cálculo puro.
 *  filas: [{ modelo, cantidad, punisiva, cosusd }]  (un renglón de pedido cada una)
 *  tipoCambio: pesos por dólar (> 0)
 */
function calcularRentabilidad({ filas, tipoCambio, top = 10, orden = "rentabilidad", ascendente = false }) {
  const tc = num(tipoCambio);
  if (!(tc > 0)) return { error: "Falta un tipo de cambio válido para pasar los precios a dólares." };

  const porModelo = new Map();
  const excluidos = { lineas: 0, unidades: 0, sin_precio: 0, sin_costo: 0, modelos: new Map() };
  let lineasValidas = 0;

  for (const f of filas) {
    const modelo = clave(f.modelo) || "(SIN MODELO)";
    const cant = num(f.cantidad);
    const precio = num(f.punisiva);
    const costo = num(f.cosusd);
    if (!(cant > 0)) continue;
    if (!(precio > 0) || !(costo > 0)) {
      excluidos.lineas += 1;
      excluidos.unidades += cant;
      if (!(precio > 0)) excluidos.sin_precio += 1;
      if (!(costo > 0)) excluidos.sin_costo += 1;
      excluidos.modelos.set(modelo, (excluidos.modelos.get(modelo) || 0) + cant);
      continue;
    }
    lineasValidas += 1;
    const ingreso = (precio / tc) * cant;
    const costoTotal = costo * cant;
    const a = porModelo.get(modelo) || { modelo, unidades: 0, ingresos_usd: 0, costos_usd: 0 };
    a.unidades += cant;
    a.ingresos_usd += ingreso;
    a.costos_usd += costoTotal;
    porModelo.set(modelo, a);
  }

  let lista = [...porModelo.values()].map((a) => {
    const rent = a.ingresos_usd - a.costos_usd;
    return {
      modelo: a.modelo,
      unidades_vendidas: a.unidades,
      ingresos_usd: redondear(a.ingresos_usd),
      costos_usd: redondear(a.costos_usd),
      rentabilidad_usd: redondear(rent),
      rentabilidad_pesos: redondear(rent * tc),
      margen_porcentual: a.ingresos_usd > 0 ? redondear((rent / a.ingresos_usd) * 100, 1) : null,
      _rent: rent,
    };
  });

  const clavesOrden = {
    rentabilidad: (x) => x._rent,
    margen_porcentual: (x) => (x.margen_porcentual == null ? -Infinity : x.margen_porcentual),
    unidades: (x) => x.unidades_vendidas,
  };
  const f = clavesOrden[orden] || clavesOrden.rentabilidad;
  lista.sort((x, y) => (ascendente ? f(x) - f(y) : f(y) - f(x)) || x.modelo.localeCompare(y.modelo));

  const totalIng = lista.reduce((s, x) => s + x.ingresos_usd, 0);
  const totalRent = lista.reduce((s, x) => s + x._rent, 0);
  const totalCostos = lista.reduce((s, x) => s + x.costos_usd, 0);
  const n = Math.max(1, Math.min(100, Math.round(num(top)) || 10));
  const devueltos = lista.slice(0, n).map((x, i) => {
    const { _rent, ...resto } = x;
    return { puesto: i + 1, ...resto };
  });

  const topExcluidos = [...excluidos.modelos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([modelo, unidades]) => ({ modelo, unidades }));

  return {
    tipo_de_cambio_usado: tc,
    cantidad_de_productos_con_datos: lista.length,
    productos_devueltos: devueltos.length,
    productos: devueltos,
    totales: {
      renglones_calculados: lineasValidas,
      ingresos_usd: redondear(totalIng),
      costos_usd: redondear(totalCostos),
      rentabilidad_usd: redondear(totalRent),
      rentabilidad_pesos: redondear(totalRent * tc),
      margen_porcentual: totalIng > 0 ? redondear((totalRent / totalIng) * 100, 1) : null,
    },
    excluidos_por_datos_incompletos: {
      renglones: excluidos.lineas,
      unidades: excluidos.unidades,
      renglones_sin_precio: excluidos.sin_precio,
      renglones_sin_costo: excluidos.sin_costo,
      productos_mas_afectados: topExcluidos,
    },
  };
}

const pad = (n) => String(n).padStart(2, "0");
const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !Number.isNaN(Date.parse(s));

/** Período pedido: mes "YYYY-MM" o desde/hasta "YYYY-MM-DD" (ambos inclusive). Sin período: error. */
function resolverPeriodo({ mes, desde, hasta }) {
  if (mes) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(mes).trim());
    if (!m || +m[2] < 1 || +m[2] > 12) return { error: `El mes "${mes}" no es válido (formato AAAA-MM).` };
    const ultimo = new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate();
    return { desde: `${m[1]}-${m[2]}-01`, hasta: `${m[1]}-${m[2]}-${pad(ultimo)}` };
  }
  if (desde || hasta) {
    if (!esFecha(desde) || !esFecha(hasta)) return { error: "Para un rango indicá 'desde' y 'hasta' como AAAA-MM-DD." };
    if (desde > hasta) return { error: "La fecha 'desde' es posterior a 'hasta'." };
    return { desde, hasta };
  }
  return { error: "Falta el período: preguntale al usuario de qué fechas quiere la rentabilidad (mes, o desde y hasta)." };
}

/** Lee estado_pedidos y calcula. tipoCambio = pesos por dólar (venta oficial salvo que el usuario indique otro). */
async function rentabilidadProductos(pool, { mes, desde, hasta, top, modelo, orden, ascendente, incluir_cancelados, tipoCambio } = {}) {
  const p = resolverPeriodo({ mes, desde, hasta });
  if (p.error) return { error: p.error };

  const params = [p.desde, p.hasta];
  let filtroModelo = "";
  if (modelo && String(modelo).trim()) {
    filtroModelo = "AND UPPER(modelo) LIKE ?";
    params.push(`%${String(modelo).trim().toUpperCase().replace(/[%_]/g, "")}%`);
  }
  const [filas] = await pool.query(
    `SELECT modelo, cantidad, punisiva, cosusd
       FROM estado_pedidos
      WHERE fecha >= ? AND fecha <= ?
        ${incluir_cancelados ? "" : "AND (estado IS NULL OR UPPER(TRIM(estado)) NOT LIKE 'CANCELAD%')"}
        ${filtroModelo}`,
    params,
  );

  const r = calcularRentabilidad({ filas, tipoCambio, top, orden, ascendente });
  if (r.error) return r;
  const [[rango]] = await pool.query("SELECT MIN(fecha) AS primera, MAX(fecha) AS ultima FROM estado_pedidos");
  const f = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);
  return {
    periodo: `${p.desde} al ${p.hasta} (pedidos de estado_pedidos${incluir_cancelados ? "" : ", sin cancelados"})`,
    datos_disponibles_de: f(rango?.primera),
    datos_disponibles_hasta: f(rango?.ultima),
    renglones_leidos: filas.length,
    formula: "rentabilidad = (precio unitario sin IVA en pesos / tipo de cambio − costo unitario en dólares) × cantidad, sumado por producto",
    ...r,
  };
}

module.exports = { calcularRentabilidad, rentabilidadProductos, resolverPeriodo };
