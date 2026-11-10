"use strict";
// Lee una factura / nota de crédito en PDF (formato de Conoplas y Serenplas) y devuelve sus datos.
// Usa el texto con posición de cada palabra (pdfjs), así no depende de espacios ni saltos de línea.

const QTY = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/;
const NUM = /^-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})$/;

// Código de comprobante (AFIP) → qué es y con qué signo cuentan sus cantidades en lo vendido.
const TIPOS = {
  "001": { tipo: "FACTURA", letra: "A", signo: 1 },
  "002": { tipo: "NOTA_DEBITO", letra: "A", signo: 0 },
  "003": { tipo: "NOTA_CREDITO", letra: "A", signo: -1 },
  "006": { tipo: "FACTURA", letra: "B", signo: 1 },
  "007": { tipo: "NOTA_DEBITO", letra: "B", signo: 0 },
  "008": { tipo: "NOTA_CREDITO", letra: "B", signo: -1 },
  "011": { tipo: "FACTURA", letra: "C", signo: 1 },
  "012": { tipo: "NOTA_DEBITO", letra: "C", signo: 0 },
  "013": { tipo: "NOTA_CREDITO", letra: "C", signo: -1 },
  "019": { tipo: "FACTURA", letra: "E", signo: 1 }, // exportación
  "020": { tipo: "NOTA_DEBITO", letra: "E", signo: 0 },
  "021": { tipo: "NOTA_CREDITO", letra: "E", signo: -1 },
  "051": { tipo: "FACTURA", letra: "M", signo: 1 },
  "053": { tipo: "NOTA_CREDITO", letra: "M", signo: -1 },
  "201": { tipo: "FACTURA", letra: "A", signo: 1 }, // FCE MiPyME
  "203": { tipo: "NOTA_CREDITO", letra: "A", signo: -1 },
  "206": { tipo: "FACTURA", letra: "B", signo: 1 },
  "208": { tipo: "NOTA_CREDITO", letra: "B", signo: -1 },
};

/** "1.689.769,00" → 1689769 · "5,089,388.82" → 5089388.82 · "-17.573,68" → -17573.68 */
function numero(s) {
  let t = String(s ?? "").replace(/[$\s]/g, "");
  if (!t) return null;
  const coma = t.lastIndexOf(",");
  const punto = t.lastIndexOf(".");
  if (coma > punto) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "6/11/2026" → "2026-11-06" */
function fecha(s) {
  const m = String(s || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

/** Agrupa las palabras en renglones (misma altura), de izquierda a derecha. items: [{ s, x, y }] */
function renglones(items) {
  const orden = items.filter((i) => String(i.s).trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const out = [];
  for (const it of orden) {
    const r = out[out.length - 1];
    if (r && Math.abs(r.y - it.y) <= 2.5) r.t.push(it);
    else out.push({ y: it.y, t: [it] });
  }
  for (const r of out) r.t.sort((a, b) => a.x - b.x);
  return out;
}

/** Valor que sigue a una etiqueta en el mismo renglón. */
function despuesDe(lineas, etiqueta) {
  for (const r of lineas) {
    const i = r.t.findIndex((x) => x.s.trim().toLowerCase().startsWith(etiqueta.toLowerCase()));
    if (i >= 0) {
      const sig = r.t[i + 1];
      if (sig && !/:\s*\$?$/.test(sig.s.trim())) return sig.s.trim();
      return "";
    }
  }
  return null;
}

/**
 * paginas: [[{ s, x, y }]] (palabras de cada página). archivo: nombre del PDF (para el tipo si no aparece).
 * Devuelve el comprobante o { error }.
 */
function leerComprobante(paginas, archivo = "") {
  const primera = renglones(paginas[0] || []);
  const cod = (despuesDe(primera, "COD.") || "").replace(/\D/g, "").padStart(3, "0");
  const porNombre = String(archivo).match(/^(\d{2,3})\s+(\d{4,5})-(\d{8})(?:\s+(\d{6,14}))?/);
  const codigo = TIPOS[cod] ? cod : porNombre ? porNombre[1].padStart(3, "0") : cod;
  const t = TIPOS[codigo];
  if (!t) return { error: `tipo de comprobante desconocido (${cod || "?"})` };

  const empresaTxt = primera.flatMap((r) => r.t).find((x) => /^de\s+\S+/i.test(x.s.trim()));
  const empresa = empresaTxt ? empresaTxt.s.trim().replace(/^de\s+/i, "").replace(/\s+S\.?R\.?L\.?$/i, "").trim().toUpperCase() : null;
  const puntoVenta = (despuesDe(primera, "Punto de Venta") || (porNombre && porNombre[2]) || "").replace(/\D/g, "");
  const nro = (despuesDe(primera, "Comp. Nro") || (porNombre && porNombre[3]) || "").replace(/\D/g, "");
  const cuit = (despuesDe(primera, "CUIT :") || (porNombre && porNombre[4]) || "").replace(/\D/g, "");
  const items = [];

  for (const pag of paginas) {
    const lineas = renglones(pag);
    // La columna "Detalle" (MAYORISTA, OFERTA...) va pegada a la descripción: se corta un poco antes de su título.
    const tituloDetalle = lineas.flatMap((r) => r.t).find((x) => x.s.trim() === "Detalle");
    const finDesc = tituloDetalle ? tituloDetalle.x - 30 : 220;
    for (let k = 0; k < lineas.length; k++) {
      const tk = lineas[k].t;
      if (tk.length < 6 || tk[0].x > 45 || !QTY.test(tk[0].s.trim())) continue;
      const cantidad = numero(tk[0].s);
      const unidad = tk[1].s.trim();
      const codigoArt = tk[2].s.trim();
      // Columnas numéricas del final: ... Precio C/Dto | Subtotal | Alícuota % | Subtotal c/IVA
      const iPct = tk.findIndex((x) => /%$/.test(x.s.trim()));
      const subtotal = iPct > 0 ? numero(tk[iPct - 1].s) : null;
      const precioUnit = iPct > 1 ? numero(tk[iPct - 2].s) : null;
      const primeraNum = tk.findIndex((x, i) => i > 2 && NUM.test(x.s.trim()));
      const desc = [tk.slice(3, primeraNum > 0 ? primeraNum : tk.length).filter((x) => x.x < finDesc).map((x) => x.s.trim()).join(" ")];
      // La descripción sigue en los renglones de abajo (sin cantidad) hasta el próximo ítem.
      for (let j = k + 1; j < lineas.length; j++) {
        const n = lineas[j].t;
        if (QTY.test(n[0].s.trim()) && n[0].x <= 45) break;
        if (n.some((x) => /^Obs:?$/i.test(x.s.trim()))) break;
        const extra = n.filter((x) => x.x >= 120 && x.x < finDesc).map((x) => x.s.trim());
        if (!extra.length || n.some((x) => x.x < 60)) break;
        desc.push(extra.join(" "));
      }
      items.push({ codigo: codigoArt, descripcion: desc.join(" ").replace(/\s+/g, " ").trim().slice(0, 255), unidad, cantidad, precio_unitario: precioUnit == null ? null : Math.abs(precioUnit), subtotal: subtotal == null ? null : Math.abs(subtotal) });
    }
  }

  const oc = despuesDe(primera, "Orden de Compra") || "";
  const refFc = (oc.match(/FC\s*(\d{4})-(\d{8})/i) || []).slice(1);
  const pie = paginas.flatMap((p) => renglones(p));
  const total = numero(despuesDe(pie, "Importe Total") || "");
  return {
    empresa,
    codigo_tipo: codigo,
    tipo: t.tipo,
    letra: t.letra,
    signo: t.signo,
    punto_venta: puntoVenta.padStart(4, "0"),
    numero: nro.padStart(8, "0"),
    fecha: fecha(despuesDe(primera, "Fecha de Emisi")),
    cliente_cuit: cuit || null,
    cliente_nombre: (despuesDe(primera, "Apellido y Nombre") || "").slice(0, 200) || null,
    remito: (despuesDe(primera, "Nro. Remito") || "").replace(/\D/g, "") || null,
    orden_compra: oc.slice(0, 100) || null,
    referencia: refFc.length ? `${refFc[0]}-${refFc[1]}` : null,
    total,
    items,
  };
}

/** Lee el PDF (Buffer) con pdfjs y devuelve las palabras con posición de cada página. */
async function palabrasDelPdf(buffer) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buffer), verbosity: 0, isEvalSupported: false }).promise;
  const paginas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    paginas.push(tc.items.map((i) => ({ s: i.str, x: Math.round(i.transform[4]), y: Math.round(i.transform[5]) })));
  }
  await doc.destroy();
  return paginas;
}

module.exports = { TIPOS, numero, fecha, renglones, leerComprobante, palabrasDelPdf };
