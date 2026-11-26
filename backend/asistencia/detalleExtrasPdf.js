"use strict";
// PDF con el DETALLE de horas extra de un operario, día por día y hora por hora.
// Muestra, para cada bloque: horario (desde-hasta), si es diurna o nocturna, si es al 50% o
// al 100%, cuántas horas, el motivo (por qué se paga así) y el importe. Solo horas extra.
// Reusa el generador sin dependencias (agentes/pdf.js) y el desglose que arma liquidacion.js.
const { Pdf, ancho, logoConoflex } = require("../agentes/pdf");

const A4 = { w: 595.28, h: 841.89 };
const M = 36;
const NARANJA = "#E85C0D";
const AMARILLO = "#FFD60A";
const TINTA = "#1f2430";
const GRIS = "#6b7280";

const ARS = (n) => "$ " + Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const HS = (n) => Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " hs";
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : "");
const cortar = (txt, size, negrita, max) => {
  let t = String(txt ?? "");
  if (ancho(t, size, negrita) <= max) return t;
  while (t.length > 1 && ancho(t + "…", size, negrita) > max) t = t.slice(0, -1);
  return t.trimEnd() + "…";
};

// "hora extra nocturna al 50%" -> "Nocturna · 50%". Si no matchea, devuelve la etiqueta tal cual.
function tipoCorto(cat, etiqueta) {
  const noche = /nocturna/i.test(cat || etiqueta || "");
  const cien = /100/.test(cat || "") || /al 100/i.test(etiqueta || "");
  return `${noche ? "Nocturna" : "Diurna"} · ${cien ? "100%" : "50%"}`;
}

/**
 * liq: salida individual de liquidarDesdeBD({ operario, ..., solo_extras:true, detalle:"completo" }).
 * @returns {{nombre:string, datos:Buffer}}
 */
function detalleExtrasPdf(liq, { generado = new Date(), usuario = "" } = {}) {
  const pdf = new Pdf();
  const fecha = generado.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });
  const subtitulo = `${liq.liquidacion_de || ""}`.slice(0, 80);
  const totalHs = liq.resumen?.horas_extra ?? liq.horas_extra ?? 0;
  const totalImp = liq.resumen?.valor_extras ?? liq.importe_extras ?? 0;

  let y = 0;
  let pagina = 0;
  const cabecera = () => {
    pdf.rect(0, 0, A4.w, 74, "#14141a");
    pdf.rect(0, 74, A4.w, 4, NARANJA);
    logoConoflex(pdf);
    pdf.texto(M + 42, 38, "CONOFLEX", { size: 18, negrita: true, color: "#ffffff" });
    pdf.texto(M + 42, 52, "Detalle de horas extra", { size: 9, color: AMARILLO });
    pdf.texto(A4.w - M, 38, "HORAS EXTRA", { size: 13, negrita: true, color: "#ffffff", alinear: "der" });
    pdf.texto(A4.w - M, 52, subtitulo, { size: 9, color: "#c9ccd6", alinear: "der" });
  };
  const pie = () => {
    pdf.linea(M, 806, A4.w - M, 806);
    pdf.texto(M, 820, "Detalle de horas extra. Verificar antes de liquidar.", { size: 8, color: GRIS });
    pdf.texto(A4.w - M, 820, `Página ${pagina}`, { size: 8, color: GRIS, alinear: "der" });
  };
  const nueva = () => {
    if (pagina > 0) pie();
    if (pagina > 0) pdf.nueva();
    pagina += 1;
    cabecera();
    y = 104;
  };
  const asegurar = (alto) => {
    if (y + alto > 790) nueva();
  };
  nueva();

  // Caja del operario
  pdf.texto(M, y, `Emitido el ${fecha}${usuario ? " por " + usuario : ""}`, { size: 8.5, color: GRIS });
  y += 20;
  pdf.rect(M, y, A4.w - 2 * M, 60, "#f6f2ea");
  pdf.texto(M + 12, y + 22, liq.operario || "", { size: 15, negrita: true, color: TINTA });
  pdf.texto(M + 12, y + 40, `Categoría: ${liq.categoria || "—"}`, { size: 9.5, color: "#555555" });
  if (liq.pago) pdf.texto(M + 12, y + 53, liq.pago.tipo === "mensual" ? `Sueldo mensual ${ARS(liq.pago.sueldo_mensual)} · hora ordinaria ${ARS(liq.pago.valor_hora_ordinaria)}` : `Valor hora ordinaria ${ARS(liq.pago.valor_hora_ordinaria)}`, { size: 9, color: "#555555" });
  pdf.texto(A4.w - M - 12, y + 26, ARS(totalImp), { size: 19, negrita: true, color: NARANJA, alinear: "der" });
  pdf.texto(A4.w - M - 12, y + 44, `${HS(totalHs)} extra en total`, { size: 9, color: "#555555", alinear: "der" });
  y += 78;

  const dias = (Array.isArray(liq.dias) ? liq.dias : []).filter((d) => d.sin_salida || (d.horas_extra || 0) > 0);
  if (!dias.length) {
    pdf.texto(M, y + 10, "No hay horas extra en el período.", { size: 11, color: GRIS });
    pie();
    return { nombre: nombreArchivo(liq), datos: pdf.build() };
  }

  // Columnas de los segmentos
  const cHorario = M + 10;
  const cTipo = M + 120;
  const cHs = M + 250;
  const cImporte = A4.w - M - 10;

  for (const d of dias) {
    asegurar(46);
    // Encabezado del día
    pdf.rect(M, y, A4.w - 2 * M, 22, "#14141a");
    const cruza = d.termina_al_dia_siguiente ? " +1d" : "";
    const izq = `${d.fecha}  ${cap(String(d.dia || "").slice(0, 3))}  ·  ${d.ingreso || "—"} a ${d.egreso || "—"}${cruza}${d.feriado ? "  ·  FERIADO" : ""}`;
    pdf.texto(M + 10, y + 15, izq, { size: 10, negrita: true, color: "#ffffff" });
    if (d.sin_salida) {
      pdf.texto(A4.w - M - 10, y + 15, "sin salida", { size: 9.5, color: AMARILLO, alinear: "der" });
      y += 22;
      pdf.linea(M, y, A4.w - M, y, "#e7e7ec", 0.5);
      y += 6;
      continue;
    }
    pdf.texto(A4.w - M - 10, y + 15, `${HS(d.horas_extra)} · ${ARS(d.importe)}`, { size: 9.5, negrita: true, color: AMARILLO, alinear: "der" });
    y += 22;

    const segs = Array.isArray(d.desglose) ? d.desglose.filter((s) => String(s.categoria || "").startsWith("extra")) : [];
    if (!segs.length) {
      // Sin desglose cargado: al menos mostrar las horas por categoría.
      pdf.texto(cHorario, y + 13, "Horas extra del día", { size: 9.5, color: TINTA });
      pdf.texto(cImporte, y + 13, ARS(d.importe), { size: 9.5, alinear: "der", color: TINTA });
      y += 18;
      pdf.linea(M, y, A4.w - M, y, "#ececeF", 0.4);
      y += 4;
      continue;
    }
    // Cabecera de columnas
    pdf.rect(M, y, A4.w - 2 * M, 16, "#ececf1");
    pdf.texto(cHorario, y + 11, "Horario", { size: 8, negrita: true, color: GRIS });
    pdf.texto(cTipo, y + 11, "Tipo", { size: 8, negrita: true, color: GRIS });
    pdf.texto(cHs, y + 11, "Horas", { size: 8, negrita: true, color: GRIS });
    pdf.texto(cImporte, y + 11, "Importe", { size: 8, negrita: true, color: GRIS, alinear: "der" });
    y += 16;
    for (const s of segs) {
      asegurar(26);
      pdf.texto(cHorario, y + 12, `${s.desde}–${s.hasta}`, { size: 9.5, color: TINTA });
      pdf.texto(cTipo, y + 12, tipoCorto(s.categoria, s.detalle), { size: 9.5, color: /100/.test(s.categoria) ? "#7a3cc0" : "#b06a00" });
      pdf.texto(cHs, y + 12, HS(s.horas), { size: 9.5, color: TINTA });
      pdf.texto(cImporte, y + 12, ARS(s.importe), { size: 9.5, color: TINTA, alinear: "der" });
      // Motivo (por qué se paga así), una línea gris debajo
      if (s.motivo) pdf.texto(cHorario, y + 23, cortar(cap(s.motivo), 8, false, A4.w - 2 * M - 20), { size: 8, color: GRIS });
      y += s.motivo ? 28 : 18;
      pdf.linea(M, y - 2, A4.w - M, y - 2, "#f0f0f3", 0.4);
    }
    y += 8;
  }
  pie();
  return { nombre: nombreArchivo(liq), datos: pdf.build() };
}

function nombreArchivo(liq) {
  const op = String(liq.operario || "operario").replace(/[^a-zA-Z0-9]+/g, "_");
  const per = String(liq.liquidacion_de || "").replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 40);
  return `Extras_${op}${per ? "_" + per : ""}.pdf`;
}

module.exports = { detalleExtrasPdf };
