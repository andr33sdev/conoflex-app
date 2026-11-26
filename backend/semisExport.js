"use strict";
// Semielaborados: cálculo de la lista (stock, demanda mensual y días de stock) y exportación a PDF/Excel.
// El cálculo es el mismo que usa GET /api/semielaborados; se comparte para que la exportación no se desvíe.
const XLSX = require("xlsx");
const { Pdf, ancho, logoConoflex } = require("./agentes/pdf");

const A4 = { w: 595.28, h: 841.89 };
const M = 36;
const NARANJA = "#E85C0D";
const AMARILLO = "#FFD60A";
const TINTA = "#1f2430";
const GRIS = "#6b7280";

const n0 = (n) => Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const cortar = (txt, size, neg, max) => {
  let t = String(txt ?? "");
  if (ancho(t, size, neg) <= max) return t;
  while (t.length > 1 && ancho(t + "…", size, neg) > max) t = t.slice(0, -1);
  return t.trimEnd() + "…";
};
const sigueDemanda = (s) => Number(s.seguir_demanda) === 1 || s.seguir_demanda === true;
const origenLabel = (o) => (o === "PARAGUAY" ? "Paraguay" : o === "PROVEEDOR" ? "Comprado" : "Propia");

/**
 * Calcula la lista de semielaborados con stock_total, demanda_mensual y dias_stock.
 * Misma lógica que GET /api/semielaborados (demanda vía ventas → recetas → BOM).
 */
async function calcularSemis(db, meses = 3) {
  const [[semielaborados], [pts], [ventasAgrupadas], [activeRecipesPT], [recipeDetailsPT]] = await Promise.all([
    db.query(`
      SELECT s.*,
             c.nombre AS pegado_nombre, c.reflectiva, c.protector_orajet, c.aplicacion_protector,
             (SELECT MAX(rp.fecha) FROM registro_produccion rp
               WHERE UPPER(rp.codigo) = UPPER(s.codigo) OR UPPER(rp.articulo) = UPPER(s.nombre)) AS ultima_produccion_fecha,
             COUNT(i.id) AS recetas_count
      FROM semielaborados s
      LEFT JOIN configuraciones_pegado c ON s.configuracion_pegado_id = c.id
      LEFT JOIN ingenierias i ON s.id = i.semielaborado_id
      GROUP BY s.id
      ORDER BY s.orden ASC, s.id ASC
    `),
    db.query("SELECT id, codigo, nombre, promedio_ventas_mensual FROM productos_terminados"),
    db.query(
      `SELECT UPPER(TRIM(modelo)) AS modelo, SUM(cantidad) AS total_vendido
       FROM estado_pedidos WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY UPPER(TRIM(modelo))`,
      [meses]
    ),
    db.query("SELECT id, producto_terminado_id FROM ingenierias WHERE es_activa = 1 AND producto_terminado_id IS NOT NULL"),
    db.query("SELECT ingenieria_id, semielaborado_id, cantidad FROM ingenieria_detalles WHERE semielaborado_id IS NOT NULL"),
  ]);

  const ventasMap = new Map();
  ventasAgrupadas.forEach((v) => {
    if (v.modelo) ventasMap.set(v.modelo, parseFloat(v.total_vendido) || 0);
  });

  const ptDemandMap = new Map();
  pts.forEach((pt) => {
    const keyCodigo = pt.codigo ? pt.codigo.trim().toUpperCase() : "";
    const keyNombre = pt.nombre ? pt.nombre.trim().toUpperCase() : "";
    let totalVendido = ventasMap.get(keyCodigo);
    if (totalVendido === undefined && keyNombre) totalVendido = ventasMap.get(keyNombre);
    const promedioMensual = totalVendido !== undefined ? totalVendido / meses : parseFloat(pt.promedio_ventas_mensual) || 0;
    ptDemandMap.set(pt.id, promedioMensual);
  });

  const seDemandMap = {};
  pts.forEach((pt) => {
    const ventaMensual = ptDemandMap.get(pt.id) || 0;
    if (ventaMensual === 0) return;
    const activeRecipe = activeRecipesPT.find((r) => r.producto_terminado_id === pt.id);
    if (!activeRecipe) return;
    recipeDetailsPT
      .filter((d) => d.ingenieria_id === activeRecipe.id)
      .forEach((det) => {
        seDemandMap[det.semielaborado_id] = (seDemandMap[det.semielaborado_id] || 0) + ventaMensual * parseFloat(det.cantidad || 0);
      });
  });

  return semielaborados.map((se) => {
    const rawStock = (se.stock_33 || 0) + (se.stock_26 || 0) + (se.stock_ayolas || 0) + (se.stock_37 || 0);
    const totalStock = Math.max(0, rawStock);
    const demand = seDemandMap[se.id] || 0;
    return {
      ...se,
      stock_total: totalStock,
      demanda_mensual: Math.round(demand),
      dias_stock: demand > 0 ? Math.round((totalStock / demand) * 30) : null,
    };
  });
}

/** Aplica el mismo filtro que la pantalla (todos/sigue/nosigue/comprado/paraguay/bajo) y ordena por demanda desc. */
function prepararFilas(filas, { filtro = "todos" } = {}) {
  const r = filas.filter((x) => {
    if (filtro === "sigue") return sigueDemanda(x);
    if (filtro === "nosigue") return !sigueDemanda(x);
    if (filtro === "comprado") return x.origen === "PROVEEDOR";
    if (filtro === "paraguay") return x.origen === "PARAGUAY";
    if (filtro === "bajo") return sigueDemanda(x) && x.dias_stock !== null && x.dias_stock <= 15;
    return true;
  });
  return r.sort((a, b) => (Number(b.demanda_mensual) || 0) - (Number(a.demanda_mensual) || 0));
}

const FILTRO_LABEL = {
  todos: "Todos los semielaborados",
  sigue: "Con seguimiento de demanda",
  nosigue: "Sin seguimiento de demanda",
  comprado: "Comprados a proveedor",
  paraguay: "Origen Paraguay",
  bajo: "Stock bajo (≤ 15 días)",
};

const esSimple = (detalle) => String(detalle || "completo").toLowerCase() === "simple";

/**
 * PDF de la lista de semielaborados ordenada por demanda mensual (mayor a menor).
 * detalle: "completo" (todas las columnas) o "simple" (solo código, semielaborado y demanda).
 */
function semisPdf(filas, { meses = 3, filtro = "todos", detalle = "completo", usuario = "", generado = new Date() } = {}) {
  const simple = esSimple(detalle);
  const pdf = new Pdf();
  const emitido = generado.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });
  const subtitulo = `${FILTRO_LABEL[filtro] || FILTRO_LABEL.todos} · demanda de ${meses === 1 ? "1 mes" : meses + " meses"}`;

  // Posiciones y ancho de recorte del nombre según el modo.
  const X = simple
    ? { cod: M + 4, nom: 190, dem: A4.w - M - 2 }
    : { cod: M + 4, nom: 136, dem: 372, stk: 420, dia: 456, sig: 488, ori: A4.w - M - 2 };
  const anchoNom = simple ? 250 : 206;
  const COLS = simple
    ? [
        { t: "Código", x: X.cod, al: "izq" },
        { t: "Semielaborado", x: X.nom, al: "izq" },
        { t: "Demanda/mes", x: X.dem, al: "der" },
      ]
    : [
        { t: "Código", x: X.cod, al: "izq" },
        { t: "Semielaborado", x: X.nom, al: "izq" },
        { t: "Demanda/mes", x: X.dem, al: "der" },
        { t: "Stock", x: X.stk, al: "der" },
        { t: "Días", x: X.dia, al: "der" },
        { t: "Sigue", x: X.sig, al: "centro" },
        { t: "Origen", x: X.ori, al: "der" },
      ];

  let y = 0;
  let pagina = 0;
  const cabecera = () => {
    pdf.rect(0, 0, A4.w, 74, "#14141a");
    pdf.rect(0, 74, A4.w, 4, NARANJA);
    logoConoflex(pdf);
    pdf.texto(78, 38, "CONOFLEX", { size: 18, negrita: true, color: "#ffffff" });
    pdf.texto(78, 52, "Semielaborados", { size: 9, color: AMARILLO });
    pdf.texto(A4.w - M, 38, "CONTROL DE DEMANDA", { size: 13, negrita: true, color: "#ffffff", alinear: "der" });
    pdf.texto(A4.w - M, 52, cortar(subtitulo, 9, false, 300), { size: 9, color: "#c9ccd6", alinear: "der" });
  };
  const encabezadoTabla = () => {
    pdf.rect(M, y, A4.w - 2 * M, 18, "#14141a");
    for (const c of COLS) pdf.texto(c.x, y + 13, c.t, { size: 8.5, negrita: true, color: "#ffffff", alinear: c.al });
    y += 18;
  };
  const pie = () => {
    pdf.linea(M, 806, A4.w - M, 806);
    pdf.texto(M, 820, `Semielaborados · emitido ${emitido}${usuario ? " por " + usuario : ""} · ${filas.length} ítems`, { size: 8, color: GRIS });
    pdf.texto(A4.w - M, 820, `Página ${pagina}`, { size: 8, color: GRIS, alinear: "der" });
  };
  const nuevaPagina = () => {
    if (pagina > 0) {
      pie();
      pdf.nueva();
    }
    pagina++;
    cabecera();
    y = 94;
    pdf.texto(M, y, "Ordenado de mayor a menor demanda mensual", { size: 9, color: GRIS });
    y += 14;
    encabezadoTabla();
  };
  nuevaPagina();

  filas.forEach((s, i) => {
    if (y + 18 > 796) nuevaPagina();
    if (i % 2) pdf.rect(M, y, A4.w - 2 * M, 18, "#f6f6f9");
    pdf.texto(X.cod, y + 13, cortar(s.codigo || "—", 8, false, simple ? 130 : 94), { size: 8, color: TINTA });
    pdf.texto(X.nom, y + 13, cortar(s.nombre || "—", 8.5, false, anchoNom), { size: 8.5, color: TINTA });
    pdf.texto(X.dem, y + 13, n0(s.demanda_mensual), { size: 8.5, negrita: true, color: TINTA, alinear: "der" });
    if (!simple) {
      const marca = sigueDemanda(s);
      const bajo = marca && s.dias_stock !== null && s.dias_stock <= 15;
      pdf.texto(X.stk, y + 13, n0(s.stock_total), { size: 8.5, alinear: "der", color: TINTA });
      pdf.texto(X.dia, y + 13, s.dias_stock === null ? "—" : n0(s.dias_stock), { size: 8.5, alinear: "der", color: bajo ? "#a32121" : TINTA, negrita: bajo });
      pdf.texto(X.sig, y + 13, marca ? "Sí" : "·", { size: 8.5, alinear: "centro", color: marca ? "#1c6b3a" : GRIS });
      pdf.texto(X.ori, y + 13, origenLabel(s.origen), { size: 8, alinear: "der", color: GRIS });
    }
    pdf.linea(M, y + 18, A4.w - M, y + 18, "#e7e7ec", 0.4);
    y += 18;
  });

  pie();
  return pdf.build();
}

/**
 * Excel de la lista de semielaborados ordenada por demanda mensual.
 * detalle: "completo" o "simple" (solo código, semielaborado y demanda).
 */
function semisExcel(filas, { meses = 3, filtro = "todos", detalle = "completo" } = {}) {
  const simple = esSimple(detalle);
  const encabezado = simple
    ? ["Código", "Semielaborado", "Demanda mensual (u.)"]
    : ["Código", "Semielaborado", "Demanda mensual (u.)", "Stock total (u.)", "Días de stock", "Sigue demanda", "Origen"];
  const datos = filas.map((s) => {
    const base = [s.codigo || "", s.nombre || "", Number(s.demanda_mensual) || 0];
    if (simple) return base;
    return [
      ...base,
      Number(s.stock_total) || 0,
      s.dias_stock === null || s.dias_stock === undefined ? "" : Number(s.dias_stock),
      sigueDemanda(s) ? "Sí" : "No",
      origenLabel(s.origen),
    ];
  });
  const ultCol = encabezado.length - 1;
  const titulo = [`Conoflex · Semielaborados — control de demanda`];
  const sub = [`${FILTRO_LABEL[filtro] || FILTRO_LABEL.todos} · demanda de ${meses === 1 ? "1 mes" : meses + " meses"} · ${filas.length} ítems · ${new Date().toLocaleDateString("es-AR")}`];
  const aoa = [titulo, sub, [], encabezado, ...datos];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = simple
    ? [{ wch: 22 }, { wch: 46 }, { wch: 18 }]
    : [{ wch: 22 }, { wch: 46 }, { wch: 18 }, { wch: 15 }, { wch: 13 }, { wch: 14 }, { wch: 12 }];
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: ultCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: ultCol } },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Semielaborados");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

module.exports = { calcularSemis, prepararFilas, semisPdf, semisExcel, FILTRO_LABEL };
