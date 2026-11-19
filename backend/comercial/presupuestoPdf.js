"use strict";
// Presupuesto en PDF con la marca Conoflex, para mandar por WhatsApp cuando el cliente pide cotización.
// Reusa el generador de PDF sin dependencias (agentes/pdf.js).
const { Pdf, ancho } = require("../agentes/pdf");

const A4 = { w: 595.28, h: 841.89 };
const M = 40; // margen
const NARANJA = "#FF5A00";
const AMARILLO = "#FFD60A";
const GRIS = "#6b7280";
const TINTA = "#1f2430";

const pesos = (n) => `$${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cortar = (txt, size, negrita, max) => {
  let t = String(txt ?? "");
  if (ancho(t, size, negrita) <= max) return t;
  while (t.length > 1 && ancho(t + "…", size, negrita) > max) t = t.slice(0, -1);
  return t.trimEnd() + "…";
};

/**
 * Arma el PDF del presupuesto.
 * @param {{cliente?:string, lineas:Array<{nombre,codigo,cantidad,unitario,subtotal}>, total:number, nota?:string, fecha?:Date, validezDias?:number}}
 * @returns {{nombre:string, datos:Buffer}}
 */
function presupuestoPdf({ cliente, lineas = [], total = 0, nota = "", fecha = new Date(), validezDias = 7 } = {}) {
  const pdf = new Pdf();
  const f = (d) => new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

  // Encabezado con marca
  pdf.rect(0, 0, A4.w, 86, "#14141a");
  pdf.rect(0, 86, A4.w, 4, NARANJA);
  pdf.rect(M, 26, 34, 34, NARANJA);
  pdf.texto(M + 17, 50, "C", { size: 22, negrita: true, color: "#ffffff", alinear: "centro" });
  pdf.texto(M + 46, 44, "CONOFLEX", { size: 20, negrita: true, color: "#ffffff" });
  pdf.texto(M + 46, 60, "Productos de seguridad vial", { size: 9, color: AMARILLO });
  pdf.texto(A4.w - M, 40, "PRESUPUESTO", { size: 15, negrita: true, color: "#ffffff", alinear: "der" });
  pdf.texto(A4.w - M, 58, `Fecha: ${f(fecha)}`, { size: 9, color: "#c9ccd6", alinear: "der" });

  let y = 120;
  // Cliente
  if (cliente) {
    pdf.texto(M, y, "Cliente", { size: 8.5, negrita: true, color: GRIS });
    pdf.texto(M, y + 16, cortar(cliente, 13, true, A4.w - 2 * M), { size: 13, negrita: true, color: TINTA });
    y += 42;
  }

  // Cabecera de la tabla
  const colCant = M;
  const colProd = M + 52;
  const colUnit = A4.w - M - 190;
  const colSub = A4.w - M;
  pdf.rect(M, y, A4.w - 2 * M, 24, "#f3f4f6");
  pdf.texto(colCant, y + 16, "Cant.", { size: 9, negrita: true, color: GRIS });
  pdf.texto(colProd, y + 16, "Producto", { size: 9, negrita: true, color: GRIS });
  pdf.texto(colUnit, y + 16, "Unitario", { size: 9, negrita: true, color: GRIS, alinear: "der" });
  pdf.texto(colSub, y + 16, "Subtotal", { size: 9, negrita: true, color: GRIS, alinear: "der" });
  y += 24;

  // Filas
  for (const l of lineas) {
    if (y > 740) { pdf.nueva(); y = 60; }
    pdf.texto(colCant, y + 16, String(l.cantidad), { size: 10, color: TINTA });
    pdf.texto(colProd, y + 16, cortar(l.nombre, 10, false, colUnit - colProd - 60), { size: 10, color: TINTA });
    if (l.codigo) pdf.texto(colProd, y + 28, String(l.codigo), { size: 7.5, color: GRIS });
    pdf.texto(colUnit, y + 16, pesos(l.unitario), { size: 10, color: TINTA, alinear: "der" });
    pdf.texto(colSub, y + 16, pesos(l.subtotal), { size: 10, negrita: true, color: TINTA, alinear: "der" });
    y += 34;
    pdf.linea(M, y, A4.w - M, y, "#e5e7eb", 0.5);
  }

  // Total
  y += 14;
  pdf.rect(colUnit - 12, y, A4.w - M - (colUnit - 12), 34, "#14141a");
  pdf.texto(colUnit, y + 22, "TOTAL", { size: 11, negrita: true, color: "#ffffff" });
  pdf.texto(colSub - 6, y + 22, pesos(total), { size: 13, negrita: true, color: AMARILLO, alinear: "der" });
  y += 34;
  if (nota) { pdf.texto(colSub, y + 14, cortar(nota, 9, false, 260), { size: 9, color: GRIS, alinear: "der" }); y += 16; }

  // Condiciones / pie
  const pieY = A4.h - 70;
  pdf.linea(M, pieY, A4.w - M, pieY, "#e5e7eb", 0.6);
  pdf.texto(M, pieY + 18, `Presupuesto válido por ${validezDias} días. Precios de lista sujetos a confirmación.`, { size: 8.5, color: GRIS });
  pdf.texto(M, pieY + 32, "Conoflex · Productos de seguridad vial · Gracias por tu consulta.", { size: 8.5, color: GRIS });

  const nombre = `Presupuesto_Conoflex_${f(fecha).replace(/\//g, "-")}.pdf`;
  return { nombre, datos: pdf.build() };
}

module.exports = { presupuestoPdf };
