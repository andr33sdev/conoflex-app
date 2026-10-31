"use strict";
// Generador mínimo de PDF (sin dependencias): páginas A4, texto Helvetica, rectángulos y líneas.
// Alcanza para informes prolijos de una o varias páginas (liquidaciones). Texto en WinAnsi (latin1 ampliado).

const A4 = { w: 595.28, h: 841.89 };
// Anchos de Helvetica (por 1000 unidades) para ASCII 32..126; las letras acentuadas usan el ancho de la base.
const W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const BASE = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ñ: "n", Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ñ: "N", ü: "u", Ü: "U" };

const ancho = (txt, size, negrita = false) => {
  let t = 0;
  for (const ch of String(txt)) {
    const c = BASE[ch] || ch;
    const code = c.charCodeAt(0);
    t += code >= 32 && code <= 126 ? W[code - 32] : 556;
  }
  return (t / 1000) * size * (negrita ? 1.06 : 1);
};

// Caracteres fuera de WinAnsi se reemplazan para no romper el archivo.
const CP1252 = { "€": 0x80, "…": 0x85, "–": 0x96, "—": 0x97, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95 };
function aBytes(txt) {
  const out = [];
  for (const ch of String(txt)) {
    const cp = ch.codePointAt(0);
    if (CP1252[ch]) out.push(CP1252[ch]);
    else if (cp < 256) out.push(cp);
    else out.push(0x3f);
  }
  return Buffer.from(out);
}
const esc = (buf) => Buffer.from(buf.toString("latin1").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"), "latin1");
const num = (n) => (Math.round(n * 100) / 100).toString();
const rgb = (hex) => {
  const h = String(hex || "#000000").replace("#", "");
  return [0, 2, 4].map((i) => num(parseInt(h.slice(i, i + 2), 16) / 255)).join(" ");
};

class Pdf {
  constructor() {
    this.paginas = [];
    this.nueva();
  }
  nueva() {
    this.ops = [];
    this.paginas.push(this.ops);
    return this;
  }
  /** Texto con la línea de base en (x, y) medido desde ARRIBA de la hoja. */
  texto(x, y, txt, { size = 10, negrita = false, color = "#222222", alinear = "izq" } = {}) {
    const t = String(txt ?? "");
    const w = ancho(t, size, negrita);
    const px = alinear === "der" ? x - w : alinear === "centro" ? x - w / 2 : x;
    this.ops.push(Buffer.concat([Buffer.from(`BT /${negrita ? "F2" : "F1"} ${num(size)} Tf ${rgb(color)} rg ${num(px)} ${num(A4.h - y)} Td (`), esc(aBytes(t)), Buffer.from(") Tj ET\n")]));
    return w;
  }
  rect(x, y, w, h, color) {
    this.ops.push(Buffer.from(`${rgb(color)} rg ${num(x)} ${num(A4.h - y - h)} ${num(w)} ${num(h)} re f\n`));
  }
  linea(x1, y1, x2, y2, color = "#cccccc", grosor = 0.6) {
    this.ops.push(Buffer.from(`${rgb(color)} RG ${num(grosor)} w ${num(x1)} ${num(A4.h - y1)} m ${num(x2)} ${num(A4.h - y2)} l S\n`));
  }
  build() {
    const objs = [];
    const add = (b) => objs.push(Buffer.isBuffer(b) ? b : Buffer.from(b, "latin1")) && objs.length;
    add("<< /Type /Catalog /Pages 2 0 R >>");
    add("PAGES");
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const kids = [];
    for (const ops of this.paginas) {
      const cont = Buffer.concat(ops);
      const idCont = add(Buffer.concat([Buffer.from(`<< /Length ${cont.length} >>\nstream\n`), cont, Buffer.from("\nendstream")]));
      const idPag = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${idCont} 0 R >>`);
      kids.push(`${idPag} 0 R`);
    }
    objs[1] = Buffer.from(`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`, "latin1");
    const partes = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
    const offsets = [];
    let pos = partes[0].length;
    objs.forEach((o, i) => {
      offsets.push(pos);
      const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, "latin1"), o, Buffer.from("\nendobj\n", "latin1")]);
      partes.push(b);
      pos += b.length;
    });
    const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
    partes.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`, "latin1"));
    return Buffer.concat(partes);
  }
}

// ---------- informe de liquidación ----------
const ARS = (n) => "$ " + Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const HS = (n) => Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const NARANJA = "#E85C0D";
const AMARILLO = "#FFD60A";

function cabecera(pdf, { titulo, subtitulo }) {
  pdf.rect(0, 0, A4.w, 74, "#14141a");
  pdf.rect(0, 74, A4.w, 4, NARANJA);
  pdf.rect(36, 22, 30, 30, NARANJA);
  pdf.texto(51, 43, "C", { size: 20, negrita: true, color: "#ffffff", alinear: "centro" });
  pdf.texto(78, 38, "CONOFLEX", { size: 18, negrita: true, color: "#ffffff" });
  pdf.texto(78, 52, "RRHH y liquidaciones", { size: 9, color: AMARILLO });
  pdf.texto(A4.w - 36, 38, titulo, { size: 13, negrita: true, color: "#ffffff", alinear: "der" });
  pdf.texto(A4.w - 36, 52, subtitulo, { size: 9, color: "#c9ccd6", alinear: "der" });
}
function pie(pdf, n, total) {
  pdf.linea(36, 806, A4.w - 36, 806);
  pdf.texto(36, 822, "Informe generado por Lía, agente de RRHH de Conoflex. Verificar antes de liquidar.", { size: 8, color: "#7a7f8e" });
  pdf.texto(A4.w - 36, 822, `Página ${n} de ${total}`, { size: 8, color: "#7a7f8e", alinear: "der" });
}

/** Arma el PDF de una liquidación (resultado de liquidarDesdeBD). */
function pdfLiquidacion(liq, { generado = new Date(), usuario = "", soloNormales = false } = {}) {
  const pdf = new Pdf();
  const fecha = generado.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });
  const individual = !liq.operarios;
  const lista = individual ? [liq] : liq.operarios;
  const titulo = individual ? `Liquidación de ${liq.operario}` : `Liquidación del plantel (${lista.length})`;
  const subtitulo = `${liq.liquidacion_de || ""}`.slice(0, 70);
  const soloExtras = /SOLO HORAS EXTRA/i.test(liq.informe || "");
  const soloNor = soloNormales && !soloExtras;
  const margenBase = 770;
  let y = 0;
  const nueva = () => {
    if (y) pdf.nueva();
    cabecera(pdf, { titulo, subtitulo });
    y = 104;
  };
  const asegurar = (alto) => {
    if (y + alto > margenBase) nueva();
  };
  nueva();
  pdf.texto(36, y, `Emitido el ${fecha}${usuario ? " por " + usuario : ""}`, { size: 8.5, color: "#7a7f8e" });
  y += 22;

  if (individual) {
    const r = liq;
    const res = r.resumen || {};
    pdf.rect(36, y, A4.w - 72, 62, "#f6f2ea");
    pdf.texto(48, y + 20, r.operario, { size: 15, negrita: true });
    pdf.texto(48, y + 38, `Categoría: ${r.categoria || "—"}`, { size: 9.5, color: "#555555" });
    if (r.pago) pdf.texto(48, y + 52, r.pago.tipo === "mensual" ? `Sueldo mensual ${ARS(r.pago.sueldo_mensual)} · hora ordinaria ${ARS(r.pago.valor_hora_ordinaria)}` : `Valor hora ordinaria ${ARS(r.pago.valor_hora_ordinaria)}`, { size: 9.5, color: "#555555" });
    pdf.texto(A4.w - 48, y + 28, soloExtras ? ARS(res.valor_extras) : soloNor ? ARS(res.valor_normales) : ARS(res.total), { size: 20, negrita: true, color: NARANJA, alinear: "der" });
    pdf.texto(A4.w - 48, y + 46, soloExtras ? "total de horas extra" : soloNor ? "total de horas normales" : "total a liquidar", { size: 9, color: "#555555", alinear: "der" });
    y += 82;

    const cols = soloExtras
      ? [["Concepto", 36, "izq"], ["Horas", 360, "der"], ["Importe", A4.w - 36, "der"]]
      : [["Concepto", 36, "izq"], ["Horas", 360, "der"], ["Importe", A4.w - 36, "der"]];
    pdf.rect(36, y, A4.w - 72, 20, "#14141a");
    for (const [t, x, al] of cols) pdf.texto(al === "izq" ? x + 8 : x - 8, y + 14, t, { size: 9.5, negrita: true, color: "#ffffff", alinear: al });
    y += 20;
    const filas = soloExtras
      ? [["Horas extra", res.horas_extra, res.valor_extras]]
      : soloNor
      ? [["Horas normales", res.horas_normales, res.valor_normales]]
      : [["Horas normales", res.horas_normales, res.valor_normales], ["Horas extra", res.horas_extra, res.valor_extras], ["Total", res.horas_totales, res.total]];
    filas.forEach(([c, h, v], i) => {
      const ultima = !soloExtras && !soloNor && i === filas.length - 1;
      if (ultima) pdf.rect(36, y, A4.w - 72, 22, "#fff4d6");
      pdf.texto(44, y + 15, c, { size: 10.5, negrita: ultima });
      pdf.texto(352, y + 15, HS(h), { size: 10.5, negrita: ultima, alinear: "der" });
      pdf.texto(A4.w - 44, y + 15, ARS(v), { size: 10.5, negrita: ultima, alinear: "der" });
      pdf.linea(36, y + 22, A4.w - 36, y + 22);
      y += 22;
    });
    y += 14;
    const pres = r.presentismo;
    if (pres) {
      const txt = pres.pierde_presentismo ? `Pierde el presentismo: ${pres.aviso || "llegadas tarde en el mes"}` : "Presentismo: sin llegadas tarde que lo hagan perder.";
      pdf.rect(36, y, A4.w - 72, 24, pres.pierde_presentismo ? "#ffe3e3" : "#e5f6ea");
      pdf.texto(46, y + 16, txt.slice(0, 105), { size: 9.5, color: pres.pierde_presentismo ? "#a32121" : "#1c6b3a", negrita: true });
      y += 38;
    }
    const dias = Array.isArray(r.dias) ? r.dias : [];
    if (dias.length) {
      asegurar(60);
      pdf.texto(36, y, "Detalle por día", { size: 12, negrita: true });
      y += 10;
      pdf.rect(36, y, A4.w - 72, 18, "#ececf1");
      const hd = soloNor
        ? [["Fecha", 44, "izq"], ["Ingreso", 170, "der"], ["Salida", 235, "der"], ["Normales", 310, "der"]]
        : [["Fecha", 44, "izq"], ["Ingreso", 170, "der"], ["Salida", 235, "der"], ["Normales", 310, "der"], ["Extras", 380, "der"], ["Importe", A4.w - 44, "der"]];
      for (const [t, x, al] of hd) pdf.texto(x, y + 13, t, { size: 9, negrita: true, alinear: al });
      y += 18;
      for (const d of dias) {
        asegurar(20);
        if (y === 104) y = 104;
        pdf.texto(44, y + 13, `${d.fecha} ${String(d.dia || "").slice(0, 3)}`, { size: 9.5 });
        pdf.texto(170, y + 13, d.ingreso || "—", { size: 9.5, alinear: "der" });
        pdf.texto(235, y + 13, d.sin_salida ? "sin salida" : d.egreso || "—", { size: 9.5, alinear: "der", color: d.sin_salida ? "#a32121" : "#222222" });
        pdf.texto(310, y + 13, d.sin_salida ? "—" : HS(d.horas_normales), { size: 9.5, alinear: "der" });
        if (!soloNor) {
          pdf.texto(380, y + 13, d.sin_salida ? "—" : HS(d.horas_extra), { size: 9.5, alinear: "der" });
          pdf.texto(A4.w - 44, y + 13, d.sin_salida ? "—" : ARS(d.importe), { size: 9.5, alinear: "der" });
        }
        pdf.linea(36, y + 18, A4.w - 36, y + 18, "#e7e7ec", 0.4);
        y += 18;
      }
    }
    if (Array.isArray(r.avisos) && r.avisos.length) {
      asegurar(30 + r.avisos.length * 14);
      y += 14;
      pdf.texto(36, y, "Observaciones", { size: 12, negrita: true });
      y += 16;
      for (const a of r.avisos.slice(0, 12)) {
        asegurar(14);
        pdf.texto(44, y, `• ${a}`.slice(0, 118), { size: 9, color: "#a32121" });
        y += 14;
      }
    }
  } else {
    pdf.rect(36, y, A4.w - 72, 20, "#14141a");
    const hd = soloExtras
      ? [["Operario", 44, "izq"], ["Categoría", 260, "izq"], ["Hs extra", 440, "der"], ["Importe extras", A4.w - 44, "der"]]
      : soloNor
      ? [["Operario", 44, "izq"], ["Categoría", 260, "izq"], ["Hs normales", 440, "der"], ["Importe normales", A4.w - 44, "der"]]
      : [["Operario", 44, "izq"], ["Categoría", 200, "izq"], ["Normales", 372, "der"], ["Extras", 432, "der"], ["Total", A4.w - 44, "der"]];
    for (const [t, x, al] of hd) pdf.texto(x, y + 14, t, { size: 9.5, negrita: true, color: "#ffffff", alinear: al });
    y += 20;
    lista.forEach((r, i) => {
      asegurar(22);
      const res = r.resumen || {};
      if (i % 2) pdf.rect(36, y, A4.w - 72, 20, "#f6f6f9");
      pdf.texto(44, y + 14, String(r.operario).slice(0, 28), { size: 9.5 });
      if (soloExtras || soloNor) {
        pdf.texto(260, y + 14, String(r.categoria || "—").slice(0, 26), { size: 9, color: "#555555" });
        pdf.texto(440, y + 14, HS(soloNor ? res.horas_normales : res.horas_extra), { size: 9.5, alinear: "der" });
        pdf.texto(A4.w - 44, y + 14, ARS(soloNor ? res.valor_normales : res.valor_extras), { size: 9.5, alinear: "der" });
      } else {
        pdf.texto(200, y + 14, String(r.categoria || "—").slice(0, 22), { size: 9, color: "#555555" });
        pdf.texto(372, y + 14, HS(res.horas_normales), { size: 9.5, alinear: "der" });
        pdf.texto(432, y + 14, HS(res.horas_extra), { size: 9.5, alinear: "der" });
        pdf.texto(A4.w - 44, y + 14, ARS(res.total), { size: 9.5, negrita: true, alinear: "der" });
      }
      y += 20;
    });
    asegurar(40);
    y += 8;
    pdf.rect(36, y, A4.w - 72, 26, "#fff4d6");
    pdf.texto(44, y + 17, "TOTAL", { size: 11, negrita: true });
    if (soloNor) {
      pdf.texto(440, y + 17, HS(liq.total_horas_normales), { size: 10.5, negrita: true, alinear: "der" });
      pdf.texto(A4.w - 44, y + 17, ARS(liq.total_importe_normales), { size: 11, negrita: true, alinear: "der" });
    } else if (soloExtras) {
      pdf.texto(440, y + 17, HS(liq.total_horas_extra), { size: 10.5, negrita: true, alinear: "der" });
      pdf.texto(A4.w - 44, y + 17, ARS(liq.total_importe_extras), { size: 11, negrita: true, alinear: "der" });
    } else {
      pdf.texto(372, y + 17, HS(liq.total_horas_normales), { size: 10.5, negrita: true, alinear: "der" });
      pdf.texto(432, y + 17, HS(liq.total_horas_extra), { size: 10.5, negrita: true, alinear: "der" });
      pdf.texto(A4.w - 44, y + 17, ARS(liq.total_importe), { size: 11, negrita: true, alinear: "der" });
    }
    y += 40;
    if (Array.isArray(liq.avisos_presentismo) && liq.avisos_presentismo.length) {
      asegurar(30);
      pdf.texto(36, y, "Presentismo perdido", { size: 11, negrita: true });
      y += 15;
      for (const a of liq.avisos_presentismo.slice(0, 15)) {
        asegurar(14);
        pdf.texto(44, y, `• ${a}`.slice(0, 118), { size: 9, color: "#a32121" });
        y += 14;
      }
    }
  }
  const total = pdf.paginas.length;
  pdf.paginas.forEach((ops, i) => {
    pdf.ops = ops;
    pie(pdf, i + 1, total);
  });
  return pdf.build();
}

// ---------- reporte genérico (cualquier agente) ----------
const TITULOS_AGENTE = { rrhh: "RRHH", stock: "Depósito y stock", compras: "Compras" };

/** Texto con **negritas** y `código` → texto plano (el PDF mínimo no mezcla estilos dentro de una línea). */
const limpiarMd = (t) => String(t || "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

function partirLineas(txt, size, negrita, maxAncho) {
  const palabras = String(txt).split(/\s+/).filter(Boolean);
  const out = [];
  let linea = "";
  for (const p of palabras) {
    const prueba = linea ? `${linea} ${p}` : p;
    if (ancho(prueba, size, negrita) <= maxAncho || !linea) linea = prueba;
    else {
      out.push(linea);
      linea = p;
    }
  }
  if (linea) out.push(linea);
  return out.length ? out : [""];
}

/**
 * PDF de un reporte: el texto (markdown simple: títulos #, viñetas, numeradas, tablas | a | b |) que armó el agente.
 * Usa la cabecera de Conoflex y numera las páginas.
 */
function pdfReporte({ agente, titulo, texto, usuario = "", generado = new Date() }) {
  const pdf = new Pdf();
  const fecha = generado.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });
  const area = TITULOS_AGENTE[agente.id] || agente.puesto || "Agentes IA";
  const M = 36;
  const AN = A4.w - M * 2;
  const TOPE = 790;
  const cab = () => {
    pdf.rect(0, 0, A4.w, 74, "#14141a");
    pdf.rect(0, 74, A4.w, 4, NARANJA);
    pdf.rect(36, 22, 30, 30, NARANJA);
    pdf.texto(51, 43, "C", { size: 20, negrita: true, color: "#ffffff", alinear: "centro" });
    pdf.texto(78, 38, "CONOFLEX", { size: 18, negrita: true, color: "#ffffff" });
    pdf.texto(78, 52, area, { size: 9, color: AMARILLO });
    pdf.texto(A4.w - 36, 38, "Reporte", { size: 13, negrita: true, color: "#ffffff", alinear: "der" });
    pdf.texto(A4.w - 36, 52, fecha, { size: 9, color: "#c9ccd6", alinear: "der" });
    return 104;
  };
  let y = cab();
  const salto = (alto) => {
    if (y + alto <= TOPE) return;
    pdf.nueva();
    y = cab();
  };
  const parrafo = (txt, { size = 10, negrita = false, color = "#222222", x = M, ancho: an = AN, interlineado = 1.4, despues = 4 } = {}) => {
    for (const l of partirLineas(limpiarMd(txt), size, negrita, an)) {
      salto(size * interlineado);
      pdf.texto(x, y + size, l, { size, negrita, color });
      y += size * interlineado;
    }
    y += despues;
  };

  parrafo(String(titulo || "Reporte").slice(0, 120), { size: 18, negrita: true, color: "#14141a", despues: 2 });
  parrafo(`${agente.nombre} · ${agente.puesto}${usuario ? ` · pedido por ${usuario}` : ""}`, { size: 9, color: "#7a7f8e", despues: 8 });
  pdf.linea(M, y, A4.w - M, y);
  y += 12;

  const lineas = String(texto || "").replace(/\r/g, "").split("\n").slice(0, 600);
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i].trimEnd();
    if (!l.trim()) {
      y += 4;
      continue;
    }
    let m;
    if (/^\s*\|.*\|\s*$/.test(l)) {
      // tabla: junta todas las filas seguidas
      const filas = [];
      while (i < lineas.length && /^\s*\|.*\|\s*$/.test(lineas[i])) {
        const celdas = lineas[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => limpiarMd(c.trim()));
        if (!celdas.every((c) => /^:?-{2,}:?$/.test(c))) filas.push(celdas);
        i++;
      }
      i--;
      const cols = Math.max(...filas.map((f) => f.length));
      const colAn = AN / cols;
      filas.forEach((f, fi) => {
        const cab1 = fi === 0;
        const partes = f.map((c) => partirLineas(c, 8.5, cab1, colAn - 8).slice(0, 4));
        const alto = Math.max(...partes.map((p) => p.length)) * 11 + 6;
        salto(alto);
        if (cab1) pdf.rect(M, y, AN, alto, "#eceef3");
        else if (fi % 2 === 0) pdf.rect(M, y, AN, alto, "#f7f8fa");
        partes.forEach((p, ci) => p.forEach((t, k) => pdf.texto(M + ci * colAn + 4, y + 11 + k * 11 - 1, t, { size: 8.5, negrita: cab1, color: "#222222" })));
        y += alto;
      });
      y += 6;
    } else if ((m = /^(#{1,3})\s+(.*)$/.exec(l))) {
      const nivel = m[1].length;
      y += nivel === 1 ? 8 : 5;
      parrafo(m[2], { size: nivel === 1 ? 14 : nivel === 2 ? 12 : 10.5, negrita: true, color: nivel === 3 ? "#333333" : "#14141a", despues: 3 });
    } else if ((m = /^(\s*)[-*•]\s+(.*)$/.exec(l))) {
      const sangria = Math.min(3, Math.floor(m[1].length / 2)) * 14;
      const x = M + 6 + sangria;
      const alto = 14;
      salto(alto);
      pdf.rect(x, y + 5, 3, 3, NARANJA);
      parrafo(m[2], { x: x + 10, ancho: AN - (x - M) - 10, despues: 2 });
    } else if ((m = /^\s*(\d+)[.)]\s+(.*)$/.exec(l))) {
      salto(14);
      pdf.texto(M + 4, y + 10, `${m[1]}.`, { size: 10, negrita: true, color: NARANJA });
      parrafo(m[2], { x: M + 22, ancho: AN - 22, despues: 2 });
    } else if (/^\s*(---+|\*\*\*+)\s*$/.test(l)) {
      y += 3;
      pdf.linea(M, y, A4.w - M, y, "#dddddd");
      y += 6;
    } else {
      parrafo(l.replace(/^>\s?/, ""), { despues: 3 });
    }
  }
  const total = pdf.paginas.length;
  pdf.paginas.forEach((ops, n) => {
    pdf.ops = ops;
    pdf.linea(36, 806, A4.w - 36, 806);
    pdf.texto(36, 822, `Reporte generado por ${agente.nombre}, agente de Conoflex. Verificar los datos antes de decidir.`, { size: 8, color: "#7a7f8e" });
    pdf.texto(A4.w - 36, 822, `Página ${n + 1} de ${total}`, { size: 8, color: "#7a7f8e", alinear: "der" });
  });
  return pdf.build();
}

module.exports = { Pdf, pdfLiquidacion, pdfReporte, ancho };
