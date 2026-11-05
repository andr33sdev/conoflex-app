// PDF de la hoja de ruta de un día: solo la información (sin mapa ni calendario), pensado para imprimir y llevar en el camión.
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

  // Encabezado
  doc.setFillColor(234, 88, 12); doc.rect(0, 0, ancho, 3, "F");
  doc.setTextColor(17, 24, 39); doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("HOJA DE RUTA", m, 15);
  doc.setFontSize(10); doc.setTextColor(234, 88, 12); doc.text("CONOFLEX", ancho - m, 11, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(13); doc.setTextColor(55, 65, 81);
  doc.text(titulo.charAt(0).toUpperCase() + titulo.slice(1), m, 22);
  const cuenta = (t) => filas.filter((d) => d.tipo_entrega === t).length;
  const partes = [`${filas.length} despacho${filas.length > 1 ? "s" : ""}`];
  if (cuenta("ENTREGA")) partes.push(`${cuenta("ENTREGA")} a domicilio`);
  if (cuenta("TRANSPORTE")) partes.push(`${cuenta("TRANSPORTE")} por transporte`);
  if (cuenta("RETIRA")) partes.push(`${cuenta("RETIRA")} retira${cuenta("RETIRA") > 1 ? "n" : ""} en planta`);
  if (km) partes.push(`recorrido sugerido: ${km} km`);
  doc.setFontSize(9.5); doc.setTextColor(107, 114, 128); doc.text(partes.join("  ·  "), m, 28);

  const fmtArticulos = (d) => (d.articulos?.length ? d.articulos.map((a) => `${a.cantidad ? `${a.cantidad} × ` : ""}${a.modelo}`).join("\n") : "—");
  const cuerpo = filas.map((d, i) => [
    conRecorrido ? (i < enRuta.length ? String(i + 1) : "—") : String(i + 1),
    d.op, limpio(d.cliente), limpio(fmtArticulos(d)), limpio(entrega(d)),
    limpio([d.contacto_nombre, d.contacto_telefono].filter(Boolean).join("\n") || "—"),
    "", limpio(d.observaciones || "—"), limpio(d.creado_por || "—"), "",
  ]);

  autoTable(doc, {
    startY: 33, margin: { left: m, right: m, bottom: 14 },
    head: [["#", "OP", "Cliente", "Pedido", "Cómo se entrega", "Contacto", "Prioridad", "Observaciones", "Cargó", "Listo"]],
    body: cuerpo,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.2, valign: "top", lineColor: [209, 213, 219], lineWidth: 0.2, textColor: [31, 41, 55], minCellHeight: 14 },
    headStyles: { fillColor: [31, 41, 55], textColor: 255, fontSize: 8.5, halign: "left", valign: "middle", minCellHeight: 8 },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: { 0: { cellWidth: 8, halign: "center", fontStyle: "bold" }, 1: { cellWidth: 14, fontStyle: "bold" }, 2: { cellWidth: 40, fontStyle: "bold" }, 3: { cellWidth: 40 }, 4: { cellWidth: 54 }, 5: { cellWidth: 30 }, 6: { cellWidth: 19 }, 7: { cellWidth: 34 }, 8: { cellWidth: 22 }, 9: { cellWidth: 12, halign: "center" } },
    rowPageBreak: "avoid",
    didDrawCell: (h) => {
      if (h.section !== "body") return;
      const d = filas[h.row.index];
      const { x, y, width, height } = h.cell;
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
    didDrawPage: () => {
      doc.setFontSize(7.5); doc.setTextColor(107, 114, 128); doc.setFont("helvetica", "normal");
      const ahora = new Date();
      const hh = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
      doc.text(limpio(`Generado el ${dmy(`${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`)} a las ${hh}${usuario ? ` por ${usuario}` : ""}`), m, alto - 7);
    },
  });
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(107, 114, 128); doc.text(`Página ${i} de ${paginas}`, ancho - m, alto - 7, { align: "right" }); }
  doc.save(`hoja-de-ruta-${fecha}.pdf`);
  return filas.length;
}
