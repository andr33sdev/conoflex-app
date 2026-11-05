// PDF de la hoja de ruta de un día: solo la información (sin mapa ni calendario), pensado para imprimir y llevar en el camión.
import { listaOps } from "./ops";
import logoUrl from "../assets/logo.svg";
const API_BASE_URL = import.meta.env?.VITE_API_URL || "";
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const COLOR_PRIO = [null, [113, 113, 122], [14, 165, 233], [245, 158, 11], [249, 115, 22], [220, 38, 38]];
// Las fuentes estándar del PDF no tienen todos los símbolos: se dejan solo los que existen.
const limpio = (t) => String(t ?? "").replace(/[^ -ÿ–—‘’“”•€\n]/g, "");
const dmy = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;

function entrega(d) {
  if (d.tipo_entrega === "RETIRA") return "Retira en planta";
  if (d.tipo_entrega === "TRANSPORTE") return `Transporte: ${d.transporte_nombre || "—"}\n${d.direccion || ""}`;
  return `Domicilio\n${d.direccion || ""}`;
}

/** Ordena: primero lo que viene en `orden` (recorrido sugerido), después el resto por prioridad. */
export function ordenarDia(despachos, orden = []) {
  const pos = new Map(orden.map((id, i) => [id, i]));
  const enRuta = despachos.filter((d) => pos.has(d.id)).sort((a, b) => pos.get(a.id) - pos.get(b.id));
  const resto = despachos.filter((d) => !pos.has(d.id)).sort((a, b) => b.prioridad - a.prioridad || a.id - b.id);
  return { enRuta, resto };
}

/** El logo (SVG) pasado a imagen PNG para el PDF; si no se puede, el PDF sale igual sin logo. */
async function cargarLogo(px = 360) {
  try {
    const img = new Image();
    await new Promise((ok, mal) => { img.onload = ok; img.onerror = mal; img.src = logoUrl; });
    const c = document.createElement("canvas"); c.width = px; c.height = Math.round(px * (img.naturalHeight || 1) / (img.naturalWidth || 1)) || px;
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } catch { return null; }
}

export async function descargarPdfDia({ fecha, orden = [], km = null, usuario = "" }) {
  const res = await fetch(`${API_BASE_URL}/api/hoja-ruta?desde=${fecha}&hasta=${fecha}&estado=TODOS`);
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error || "No se pudo cargar el día.");
  const despachos = datos.despachos || [];
  if (!despachos.length) throw new Error("No hay despachos cargados para ese día.");
  const [{ jsPDF }, plugin] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  // Según cómo se empaquete, la función viene en distintos lugares del módulo.
  const autoTable = [plugin.default, plugin.default?.default, plugin.autoTable].find((f) => typeof f === "function");
  if (!autoTable) throw new Error("No se pudo cargar el generador de tablas del PDF.");

  const { enRuta, resto } = ordenarDia(despachos, orden);
  const filas = [...enRuta, ...resto];
  const conRecorrido = enRuta.length > 0;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const m = 12;
  const d0 = new Date(`${fecha}T12:00:00`);
  const titulo = `${DIAS[d0.getDay()]} ${d0.getDate()} de ${MESES[d0.getMonth()]} de ${d0.getFullYear()}`;

  const logo = await cargarLogo();
  const NAVY = [24, 31, 42], NARANJA = [232, 92, 13], GRIS = [107, 114, 128];
  const cuenta = (t) => filas.filter((d) => d.tipo_entrega === t).length;

  // Encabezado: franja oscura con el logo, el título y el día
  doc.setFillColor(...NAVY); doc.rect(0, 0, ancho, 30, "F");
  doc.setFillColor(...NARANJA); doc.rect(0, 30, ancho, 1.6, "F");
  if (logo) doc.addImage(logo, "PNG", m, 5.5, 19, 19);
  const xt = logo ? m + 25 : m;
  doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(255, 255, 255); doc.text("HOJA DE RUTA", xt, 15.5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(12); doc.setTextColor(253, 186, 116);
  doc.text(titulo.charAt(0).toUpperCase() + titulo.slice(1), xt, 23);
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(255, 255, 255); doc.text("CONOFLEX", ancho - m, 14.5, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(156, 163, 175); doc.text("Ventas y despacho", ancho - m, 20, { align: "right" });

  // Resumen del día en tarjetas
  const tarjetas = [[String(filas.length), filas.length === 1 ? "despacho" : "despachos"]];
  if (cuenta("ENTREGA")) tarjetas.push([String(cuenta("ENTREGA")), "a domicilio"]);
  if (cuenta("TRANSPORTE")) tarjetas.push([String(cuenta("TRANSPORTE")), "por transporte"]);
  if (cuenta("RETIRA")) tarjetas.push([String(cuenta("RETIRA")), "retiran en planta"]);
  if (km) tarjetas.push([`${km} km`, "recorrido sugerido"]);
  const gap = 4, wTar = Math.min(48, (ancho - 2 * m - gap * (tarjetas.length - 1)) / tarjetas.length);
  tarjetas.forEach(([n, t], i) => {
    const x = m + i * (wTar + gap);
    doc.setFillColor(249, 250, 251); doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3); doc.roundedRect(x, 37, wTar, 13, 2, 2, "FD");
    doc.setFillColor(...NARANJA); doc.rect(x, 39, 1.1, 9, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...NAVY); doc.text(n, x + 5, 45);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GRIS); doc.text(t, x + 5, 48.4);
  });

  const fmtArticulos = (d) => {
    const arts = d.articulos || [];
    if (!arts.length) return "—";
    const lin = (a) => `${a.cantidad ? `${a.cantidad} × ` : ""}${a.modelo}`;
    if (listaOps(d.op).length < 2) return arts.map(lin).join("\n");
    return listaOps(d.op).map((op) => [`OP ${op}:`, ...arts.filter((a) => a.op === op).map((a) => `  ${lin(a)}`)].join("\n")).join("\n");
  };
  const cuerpo = filas.map((d, i) => [
    conRecorrido ? (i < enRuta.length ? String(i + 1) : "—") : String(i + 1),
    listaOps(d.op).join("\n"), limpio(d.cliente), limpio(fmtArticulos(d)), limpio(entrega(d)),
    limpio([d.contacto_nombre, d.contacto_telefono].filter(Boolean).join("\n") || "—"),
    "", limpio(d.observaciones || "—"), limpio(d.creado_por || "—"), "",
  ]);

  autoTable(doc, {
    startY: 55, margin: { top: 22, left: m, right: m, bottom: 16 },
    head: [["#", "OP", "Cliente", "Pedido", "Cómo se entrega", "Contacto", "Prioridad", "Observaciones", "Cargó", "Listo"]],
    body: cuerpo,
    theme: "plain",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: { top: 3, bottom: 3, left: 2.6, right: 2.6 }, valign: "top", lineColor: [229, 231, 235], lineWidth: { bottom: 0.25 }, textColor: [31, 41, 55], minCellHeight: 15 },
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8, fontStyle: "bold", halign: "left", valign: "middle", minCellHeight: 8.5, lineWidth: 0 },
    alternateRowStyles: { fillColor: [248, 249, 251] },
    columnStyles: { 0: { cellWidth: 8, halign: "center", fontStyle: "bold" }, 1: { cellWidth: 15, fontStyle: "bold", textColor: [194, 65, 12] }, 2: { cellWidth: 40, fontStyle: "bold" }, 3: { cellWidth: 54 }, 4: { cellWidth: 46 }, 5: { cellWidth: 29 }, 6: { cellWidth: 19 }, 7: { cellWidth: 28 }, 8: { cellWidth: 22 }, 9: { cellWidth: 12, halign: "center" } },
    rowPageBreak: "avoid",
    didDrawCell: (h) => {
      if (h.section !== "body") return;
      const d = filas[h.row.index];
      const { x, y, width, height } = h.cell;
      if (h.column.index === 0) { doc.setFillColor(...(COLOR_PRIO[d.prioridad] || GRIS)); doc.rect(x, y, 1.2, height, "F"); }
      if (h.column.index === 6) {
        // prioridad: cruces encendidas según el nivel
        const paso = 3.4, tam = 1.3, x0 = x + (width - paso * 4 - tam * 2) / 2, yc = y + 5;
        for (let n = 1; n <= 5; n++) {
          const col = n <= d.prioridad ? COLOR_PRIO[d.prioridad] : [209, 213, 219];
          doc.setDrawColor(...col); doc.setLineWidth(0.5);
          const cx = x0 + (n - 1) * paso + tam;
          doc.line(cx - tam, yc - tam, cx + tam, yc + tam); doc.line(cx - tam, yc + tam, cx + tam, yc - tam);
        }
        doc.setFontSize(7); doc.setTextColor(107, 114, 128); doc.text(`${d.prioridad} de 5`, x + width / 2, yc + 5, { align: "center" });
      }
      if (h.column.index === 9) {
        const l = 5, bx = x + (width - l) / 2, by = y + 3;
        doc.setDrawColor(55, 65, 81); doc.setLineWidth(0.3); doc.rect(bx, by, l, l);
        if (d.estado === "DESPACHADO") {
          doc.setDrawColor(5, 150, 105); doc.setLineWidth(0.6);
          doc.line(bx + 1, by + 2.7, bx + 2.1, by + 3.9); doc.line(bx + 2.1, by + 3.9, bx + 4.1, by + 1.2);
        }
      }
      void height;
    },
    didDrawPage: (h) => {
      if (h.pageNumber > 1) { // páginas siguientes: encabezado chico
        doc.setFillColor(...NAVY); doc.rect(0, 0, ancho, 14, "F"); doc.setFillColor(...NARANJA); doc.rect(0, 14, ancho, 1, "F");
        if (logo) doc.addImage(logo, "PNG", m, 2.5, 9, 9);
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(255, 255, 255); doc.text("HOJA DE RUTA", logo ? m + 12 : m, 9.2);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(253, 186, 116); doc.text(titulo.charAt(0).toUpperCase() + titulo.slice(1), ancho - m, 9.2, { align: "right" });
      }
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3); doc.line(m, alto - 11, ancho - m, alto - 11);
      doc.setFontSize(7.5); doc.setTextColor(107, 114, 128); doc.setFont("helvetica", "normal");
      const ahora = new Date();
      const hh = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
      doc.text(limpio(`Conoflex · Generado el ${dmy(`${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`)} a las ${hh}${usuario ? ` por ${usuario}` : ""}`), m, alto - 6.5);
    },
  });
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(107, 114, 128); doc.text(`Página ${i} de ${paginas}`, ancho - m, alto - 6.5, { align: "right" }); }
  doc.save(`hoja-de-ruta-${fecha}.pdf`);
  return filas.length;
}
