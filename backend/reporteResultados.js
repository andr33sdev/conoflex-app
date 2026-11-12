"use strict";
// Partes del reporte de resultados que no son "por producto": unidades por familia mes a mes, ventas mes a mes
// (año anterior contra el actual) y alertas. Todo sale de las facturas leídas y de los costos de la app.

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Familias de producto, por la descripción de la factura (el primer patrón que coincide).
const FAMILIAS = [
  ["Tachas", /\bTACHAS?\b/],
  ["Topes", /\bTOPES?\b/],
  ["Reductores de velocidad", /LOMOS? DE BURRO|\bREDUCT|\bATENUADOR/],
  ["Delineadores", /\bDELINEADOR/],
  ["Bolardos", /\bBOLARDO/],
  ["Vallas y barreras", /\bVALLAS?\b|\bBARRERAS?\b|\bBARRICADAS?\b/],
  ["Conos", /\bCONOS?\b/],
];
const familia = (descripcion) => {
  const d = String(descripcion || "").toUpperCase();
  for (const [nombre, re] of FAMILIAS) if (re.test(d)) return nombre;
  return "Otros";
};
// Mismo orden que el reporte de la contadora.
const ORDEN_FAMILIAS = ["Conos", "Bolardos", "Delineadores", "Reductores de velocidad", "Vallas y barreras", "Tachas", "Topes", "Otros"];

/** Unidades por familia y mes. lineas: [{ mes (1-12), descripcion, cantidad, signo }] */
function unidadesPorFamilia(lineas) {
  const t = new Map(ORDEN_FAMILIAS.map((f) => [f, Array(12).fill(0)]));
  for (const l of lineas) {
    const mes = Number(l.mes);
    if (!(mes >= 1 && mes <= 12)) continue;
    t.get(familia(l.descripcion))[mes - 1] += l.signo * (Number(l.cantidad) || 0);
  }
  return ORDEN_FAMILIAS.map((f) => ({ familia: f, meses: t.get(f).map(r2) })).filter((f) => f.meses.some((x) => x !== 0));
}

/** Dólar oficial (venta) de cierre de cada mes, de una lista [{ fecha: "AAAA-MM-DD", venta }] ordenada o no. */
function dolarCierreMes(historial, anio, mes) {
  const fin = `${anio}-${String(mes).padStart(2, "0")}-31`;
  let mejor = null;
  for (const h of historial || []) if (h?.fecha && h.fecha <= fin && Number(h.venta) > 0 && (!mejor || h.fecha > mejor.fecha)) mejor = h;
  return mejor ? Number(mejor.venta) : null;
}

/** Ventas netas ($) por mes de dos años, pasadas a US$ con el dólar de cierre de cada mes. filas: [{ anio, mes, neto }] */
function ventasMensuales(filas, anios, historial, hoy = new Date().toISOString().slice(0, 10)) {
  const meses = [];
  for (let mes = 1; mes <= 12; mes++) {
    const fila = { mes };
    for (const anio of anios) {
      const futuro = `${anio}-${String(mes).padStart(2, "0")}-01` > hoy;
      const neto = filas.filter((f) => Number(f.anio) === anio && Number(f.mes) === mes).reduce((a, f) => a + Number(f.neto || 0), 0);
      const tc = futuro ? null : dolarCierreMes(historial, anio, mes);
      fila[anio] = futuro ? null : { neto: r2(neto), tc, usd: tc ? r2(neto / tc) : null };
    }
    meses.push(fila);
  }
  return meses;
}

/**
 * Alertas para revisar.
 *  lineas: renglones del rango [{ codigo, descripcion, cantidad, subtotal, signo, archivo, fecha, empresa }]
 *  filas: el informe por producto (con rentabilidad / margen_final / observacion)
 */
function alertas(lineas, filas) {
  const out = [];
  // 1) Precios fuera de lo normal: un renglón con precio unitario muy lejos del promedio de ese código,
  //    o casi regalado (menos de $ 100 la unidad).
  const porCodigo = new Map();
  for (const l of lineas) {
    if (l.signo <= 0 || !(Number(l.cantidad) > 0) || !(Number(l.subtotal) > 0)) continue;
    const k = String(l.codigo || "").toUpperCase().replace(/\s+/g, "");
    const a = porCodigo.get(k) || { neto: 0, cant: 0, n: 0 };
    a.neto += Number(l.subtotal);
    a.cant += Number(l.cantidad);
    a.n++;
    porCodigo.set(k, a);
  }
  for (const l of lineas) {
    if (l.signo <= 0 || !(Number(l.cantidad) > 0) || l.subtotal == null) continue;
    const precio = Number(l.subtotal) / Number(l.cantidad);
    const k = String(l.codigo || "").toUpperCase().replace(/\s+/g, "");
    const a = porCodigo.get(k);
    const prom = a && a.n >= 3 ? a.neto / a.cant : null;
    let detalle = null;
    if (Number(l.subtotal) === 0) detalle = "Renglón sin cargo ($ 0).";
    else if (precio < 100) detalle = `Precio unitario de $ ${r2(precio).toLocaleString("es-AR")}: parece un error de carga.`;
    else if (prom && precio < prom * 0.4) detalle = `Precio unitario $ ${Math.round(precio).toLocaleString("es-AR")}, ${Math.round((1 - precio / prom) * 100)}% debajo de su promedio del período ($ ${Math.round(prom).toLocaleString("es-AR")}).`;
    else if (prom && precio > prom * 2.5) detalle = `Precio unitario $ ${Math.round(precio).toLocaleString("es-AR")}, ${(precio / prom).toFixed(1)} veces su promedio del período.`;
    if (detalle) out.push({ tipo: "Precio", codigo: l.codigo, descripcion: l.descripcion, detalle, comprobante: l.archivo || "", fecha: l.fecha || null, importe: l.subtotal == null ? null : r2(l.subtotal) });
  }
  // 2) Productos que pierden plata.
  for (const f of filas) {
    if (f.rentabilidad != null && f.rentabilidad < 0) out.push({ tipo: "Rentabilidad negativa", codigo: f.codigo, descripcion: f.descripcion, detalle: `Se vende por debajo del costo: rentabilidad US$ ${f.rentabilidad.toLocaleString("es-AR")}.`, comprobante: "", fecha: null, importe: f.importe_neto });
    else if (f.margen_final != null && f.margen_final < 0) out.push({ tipo: "Margen final negativo", codigo: f.codigo, descripcion: f.descripcion, detalle: `Cubre el costo pero no los gastos: margen final US$ ${f.margen_final.toLocaleString("es-AR")}.`, comprobante: "", fecha: null, importe: f.importe_neto });
  }
  // 3) Productos sin costo calculable (los que más venden primero).
  for (const f of [...filas].filter((x) => x.observacion).sort((a, b) => (b.importe_neto || 0) - (a.importe_neto || 0))) {
    out.push({ tipo: "Costo", codigo: f.codigo, descripcion: f.descripcion, detalle: f.observacion, comprobante: "", fecha: null, importe: f.importe_neto });
  }
  return out;
}

// Historial del dólar oficial (argentinadatos.com), guardado 6 horas.
let cacheDolar = { t: 0, datos: null };
async function historialDolar() {
  if (cacheDolar.datos && Date.now() - cacheDolar.t < 6 * 3600e3) return cacheDolar.datos;
  try {
    const r = await fetch("https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial", { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return cacheDolar.datos || [];
    const d = await r.json();
    cacheDolar = { t: Date.now(), datos: Array.isArray(d) ? d.map((x) => ({ fecha: String(x.fecha).slice(0, 10), venta: Number(x.venta) })) : [] };
    return cacheDolar.datos;
  } catch {
    return cacheDolar.datos || [];
  }
}

/** Lo extra del reporte completo: familias y ventas del año (todas las empresas y canales) y alertas del rango. */
async function extras(db, { desde, hasta, lineas, filas }) {
  const anio = Number(String(hasta).slice(0, 4));
  const [fam] = await db.query(
    `SELECT MONTH(f.fecha) AS mes, i.descripcion, i.cantidad, f.signo
       FROM factura_items i JOIN facturas f ON f.id = i.factura_id
      WHERE f.fecha BETWEEN ? AND ? AND f.signo <> 0`,
    [`${anio}-01-01`, `${anio}-12-31`],
  );
  const [ven] = await db.query(
    `SELECT YEAR(f.fecha) AS anio, MONTH(f.fecha) AS mes, SUM(f.signo * ABS(i.subtotal)) AS neto
       FROM factura_items i JOIN facturas f ON f.id = i.factura_id
      WHERE f.fecha BETWEEN ? AND ? AND f.signo <> 0 AND i.subtotal IS NOT NULL
      GROUP BY YEAR(f.fecha), MONTH(f.fecha)`,
    [`${anio - 1}-01-01`, `${anio}-12-31`],
  );
  return {
    anio,
    familias: unidadesPorFamilia(fam),
    ventas_mensuales: { anios: [anio - 1, anio], meses: ventasMensuales(ven, [anio - 1, anio], await historialDolar()) },
    alertas: alertas(lineas, filas),
    rango_alertas: { desde, hasta },
  };
}

module.exports = { FAMILIAS, familia, unidadesPorFamilia, dolarCierreMes, ventasMensuales, alertas, extras };
