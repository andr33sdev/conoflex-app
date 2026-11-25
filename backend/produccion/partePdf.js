"use strict";
// Parte de producción de un día: qué se produjo, por máquina y operario, con buenas y fallas.
// Sin dependencias: reusa el generador agentes/pdf.js.
const { Pdf, ancho } = require("../agentes/pdf");

const A4 = { w: 595.28, h: 841.89 };
const M = 36;
const NARANJA = "#E85C0D";
const AMARILLO = "#FFD60A";
const TINTA = "#1f2430";
const GRIS = "#6b7280";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const n0 = (n) => Number(n || 0).toLocaleString("es-AR");
const sinSemi = (t) => String(t ?? "").replace(/semielaborados?/gi, "").replace(/\s{2,}/g, " ").trim() || String(t ?? "").trim();
const turnoLabel = (t) => (t === "NOCHE" ? "Noche" : "Día");
const cortar = (txt, size, neg, max) => {
  let t = String(txt ?? "");
  if (ancho(t, size, neg) <= max) return t;
  while (t.length > 1 && ancho(t + "…", size, neg) > max) t = t.slice(0, -1);
  return t.trimEnd() + "…";
};

function partePdf({ fecha, cargas = [], usuario = "", generado = new Date() }) {
  const pdf = new Pdf();
  const [a, m, d] = String(fecha).split("-").map(Number);
  const tituloFecha = `${d} de ${MESES[m - 1]} de ${a}`;
  const emitido = generado.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });

  let y = 0;
  let pagina = 0;
  const cabecera = () => {
    pdf.rect(0, 0, A4.w, 74, "#14141a");
    pdf.rect(0, 74, A4.w, 4, NARANJA);
    pdf.rect(M, 22, 30, 30, NARANJA);
    pdf.texto(M + 15, 43, "C", { size: 20, negrita: true, color: "#ffffff", alinear: "centro" });
    pdf.texto(M + 42, 38, "CONOFLEX", { size: 18, negrita: true, color: "#ffffff" });
    pdf.texto(M + 42, 52, "Parte de producción", { size: 9, color: AMARILLO });
    pdf.texto(A4.w - M, 44, tituloFecha, { size: 12, negrita: true, color: "#ffffff", alinear: "der" });
  };
  const pie = () => {
    pdf.linea(M, 806, A4.w - M, 806);
    pdf.texto(M, 820, `Parte de producción · emitido ${emitido}${usuario ? " por " + usuario : ""}`, { size: 8, color: GRIS });
    pdf.texto(A4.w - M, 820, `Página ${pagina}`, { size: 8, color: GRIS, alinear: "der" });
  };
  const nueva = () => {
    if (pagina > 0) { pie(); pdf.nueva(); }
    pagina += 1;
    cabecera();
    y = 100;
  };
  const asegurar = (alto) => { if (y + alto > 790) { nueva(); cabeceraTabla(); } };

  // Columnas
  const cProd = M + 8;
  const cTurno = M + 230;
  const cMaq = M + 285;
  const cBuenas = A4.w - M - 130;
  const cFallas = A4.w - M - 60;
  const cabeceraTabla = () => {
    pdf.rect(M, y, A4.w - 2 * M, 18, "#ececf1");
    pdf.texto(cProd, y + 12, "Producto", { size: 8, negrita: true, color: GRIS });
    pdf.texto(cTurno, y + 12, "Turno", { size: 8, negrita: true, color: GRIS });
    pdf.texto(cMaq, y + 12, "Máquina · operario", { size: 8, negrita: true, color: GRIS });
    pdf.texto(cBuenas, y + 12, "Buenas", { size: 8, negrita: true, color: GRIS, alinear: "der" });
    pdf.texto(cFallas, y + 12, "Fallas", { size: 8, negrita: true, color: GRIS, alinear: "der" });
    y += 18;
  };

  nueva();
  const totB = cargas.reduce((t, c) => t + (Number(c.total_producido) - Number(c.fallas)), 0);
  const totF = cargas.reduce((t, c) => t + Number(c.fallas), 0);

  if (cargas.length === 0) {
    pdf.texto(M, y + 10, "No hay producción registrada ese día.", { size: 11, color: GRIS });
    pie();
    return { nombre: `Parte_${fecha}.pdf`, datos: pdf.build() };
  }

  cabeceraTabla();
  for (const c of cargas) {
    asegurar(24);
    const buenas = Number(c.total_producido) - Number(c.fallas);
    pdf.texto(cProd, y + 13, cortar(sinSemi(c.modelo_nombre), 9.5, false, 210), { size: 9.5, color: TINTA });
    pdf.texto(cTurno, y + 13, turnoLabel(c.turno), { size: 9, color: GRIS });
    pdf.texto(cMaq, y + 13, cortar(`${c.maquina || "—"} · ${c.operario || ""}`, 8.5, false, cBuenas - cMaq - 10), { size: 8.5, color: "#555555" });
    pdf.texto(cBuenas, y + 13, n0(buenas), { size: 9.5, negrita: true, color: TINTA, alinear: "der" });
    pdf.texto(cFallas, y + 13, n0(c.fallas), { size: 9.5, color: Number(c.fallas) > 0 ? "#b4342f" : GRIS, alinear: "der" });
    if (c.estado === "PENDIENTE") pdf.texto(A4.w - M - 8, y + 13, "pend.", { size: 7.5, color: "#b06a00", alinear: "der" });
    y += 22;
    pdf.linea(M, y - 2, A4.w - M, y - 2, "#f0f0f3", 0.4);
  }

  // Totales
  asegurar(30);
  y += 4;
  pdf.rect(M, y, A4.w - 2 * M, 28, "#14141a");
  pdf.texto(cProd, y + 18, `Total del día · ${cargas.length} ${cargas.length === 1 ? "carga" : "cargas"}`, { size: 10, negrita: true, color: "#ffffff" });
  pdf.texto(cBuenas, y + 18, n0(totB), { size: 11, negrita: true, color: AMARILLO, alinear: "der" });
  pdf.texto(cFallas, y + 18, n0(totF), { size: 10, color: "#e7a6a2", alinear: "der" });
  y += 28;

  pie();
  return { nombre: `Parte_produccion_${fecha}.pdf`, datos: pdf.build() };
}

module.exports = { partePdf };
