"use strict";
// Exportar los reportes de Clientes nuevos: PDF (para leer o imprimir) y Excel (para filtrar y trabajar).
const XLSX = require("xlsx");
const { Pdf, ancho } = require("./agentes/pdf");

const A4 = { w: 595.28, h: 841.89 };
const NARANJA = "#E85C0D";
const AMARILLO = "#FFD60A";
const M = 36;
const AN = A4.w - M * 2;
const TOPE = 792;
const COLOR_PRIORIDAD = { 1: "#E85C0D", 2: "#E0B400", 3: "#9aa0ad" };
const TEXTO_PRIORIDAD = { 1: "IR YA", 2: "INTERESANTE", 3: "A FUTURO" };
const TEXTO_ESTADO = { PENDIENTE: "", INTERESA: "Me interesa", CONTACTADA: "Contactada", GANADA: "Ganada / es cliente", DESCARTADA: "Descartada" };
const SEGMENTOS = { licitaciones: "Licitaciones", obras: "Obras", empresas: "Empresas", parecidos: "Parecidas a tus clientes" };

const dominio = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return String(u || "");
  }
};
const fechaLarga = (v) => new Date(v || Date.now()).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });

function partir(txt, size, negrita, maxAncho) {
  const salida = [];
  for (const parrafo of String(txt ?? "").split(/\n/)) {
    let linea = "";
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (ancho(prueba, size, negrita) <= maxAncho || !linea) linea = prueba;
      else {
        salida.push(linea);
        linea = palabra;
      }
    }
    salida.push(linea);
  }
  return salida;
}

/** Pequeño armador de páginas con cabecera de Conoflex, saltos automáticos y número de página. */
function documento({ titulo, subtitulo, generado }) {
  const pdf = new Pdf();
  const cab = () => {
    pdf.rect(0, 0, A4.w, 74, "#14141a");
    pdf.rect(0, 74, A4.w, 4, NARANJA);
    pdf.rect(36, 22, 30, 30, NARANJA);
    pdf.texto(51, 43, "C", { size: 20, negrita: true, color: "#ffffff", alinear: "centro" });
    pdf.texto(78, 38, "CONOFLEX", { size: 18, negrita: true, color: "#ffffff" });
    pdf.texto(78, 52, subtitulo, { size: 9, color: AMARILLO });
    pdf.texto(A4.w - 36, 38, titulo, { size: 13, negrita: true, color: "#ffffff", alinear: "der" });
    pdf.texto(A4.w - 36, 52, generado, { size: 9, color: "#c9ccd6", alinear: "der" });
    return 104;
  };
  let y = cab();
  const d = {
    pdf,
    get y() {
      return y;
    },
    espacio(n) {
      y += n;
    },
    asegurar(alto) {
      if (y + alto <= TOPE) return;
      pdf.nueva();
      y = cab();
    },
    parrafo(txt, { size = 10, negrita = false, color = "#222222", x = M, ancho: an = AN, interlineado = 1.4, despues = 4 } = {}) {
      for (const l of partir(txt, size, negrita, an)) {
        d.asegurar(size * interlineado);
        pdf.texto(x, y, l, { size, negrita, color });
        y += size * interlineado;
      }
      y += despues;
    },
    titulo(txt, { size = 13, color = "#14141a" } = {}) {
      d.asegurar(size + 18);
      y += 6;
      pdf.texto(M, y + size, txt, { size, negrita: true, color });
      y += size + 6;
      pdf.linea(M, y, A4.w - M, y, "#dddddd");
      y += 8;
    },
    cerrar() {
      pdf.paginas.forEach((ops, i) => {
        pdf.ops = ops;
        pdf.texto(A4.w / 2, A4.h - 22, `Página ${i + 1} de ${pdf.paginas.length}  ·  Información pública de internet: verificá fechas y contactos antes de actuar.`, { size: 8, color: "#888888", alinear: "centro" });
      });
      return pdf.build();
    },
  };
  return d;
}

function pdfOportunidades(b) {
  const r = b.resultado;
  const ops = (r.oportunidades || []).filter((o) => o.estado !== "DESCARTADA");
  const d = documento({ titulo: "Clientes nuevos", subtitulo: "Reporte de oportunidades", generado: fechaLarga(b.terminado_at || b.created_at) });
  if (r.resumen) d.parrafo(r.resumen, { size: 11, color: "#14141a", despues: 8 });
  const ya = ops.filter((o) => o.prioridad === 1).length;
  d.parrafo(`${ops.length} oportunidades · ${ya} para ir ya · ${ops.filter((o) => o.nueva).length} nuevas`, { size: 10, negrita: true, color: NARANJA, despues: 6 });
  for (const o of ops) {
    const lineasProd = o.productos?.length ? partir(`Qué ofrecerle: ${o.productos.join(", ")}${o.argumento ? ` — ${o.argumento}` : ""}`, 9.5, false, AN - 16) : [];
    const detalle = [
      o.que_paso && `Qué pasó: ${o.que_paso}`,
      o.siguiente_paso && `Próximo paso: ${o.siguiente_paso}`,
      `Contacto: ${o.contacto || "no figura"}`,
      o.fuentes?.length ? `Visto en: ${o.fuentes.slice(0, 3).map((f) => dominio(f.url)).join(", ")}` : "",
      o.url ? `Enlace: ${o.url}` : "",
      o.nota ? `Nota: ${o.nota}` : "",
    ].filter(Boolean);
    const alto = 20 + 14 + 14 + lineasProd.length * 13 + detalle.reduce((a, t) => a + partir(t, 9.5, false, AN - 16).length * 13, 0) + 14;
    d.asegurar(Math.min(alto, 220));
    const y0 = d.y;
    d.pdf.texto(M + 10, d.y + 10, `${TEXTO_PRIORIDAD[o.prioridad] || "INTERESANTE"}${o.nueva ? "  ·  NUEVA" : ""}${TEXTO_ESTADO[o.estado] ? `  ·  ${TEXTO_ESTADO[o.estado].toUpperCase()}` : ""}  ·  ${SEGMENTOS[o.segmento] || ""}`, { size: 8, negrita: true, color: COLOR_PRIORIDAD[o.prioridad] || "#888888" });
    if (o.fecha) d.pdf.texto(A4.w - M, d.y + 10, o.fecha, { size: 9, negrita: true, color: "#14141a", alinear: "der" });
    d.espacio(14);
    d.parrafo(o.titulo, { size: 12, negrita: true, color: "#14141a", x: M + 10, ancho: AN - 16, despues: 2 });
    d.parrafo(`${o.organizacion}${o.provincia ? ` · ${o.provincia}` : ""}${o.monto ? ` · ${o.monto}` : ""}`, { size: 10, color: "#555555", x: M + 10, ancho: AN - 16, despues: 4 });
    if (lineasProd.length) d.parrafo(`Qué ofrecerle: ${o.productos.join(", ")}${o.argumento ? ` — ${o.argumento}` : ""}`, { size: 9.5, negrita: true, color: "#8a3a00", x: M + 10, ancho: AN - 16, despues: 3 });
    for (const t of detalle) d.parrafo(t, { size: 9.5, color: "#333333", x: M + 10, ancho: AN - 16, despues: 2 });
    if (d.y > y0) d.pdf.rect(M, y0, 3, d.y - y0, COLOR_PRIORIDAD[o.prioridad] || "#9aa0ad");
    d.espacio(10);
  }
  if (!ops.length) d.parrafo("No hay oportunidades para mostrar.", { size: 11 });
  return d.cerrar();
}

function pdfCompetencia(b) {
  const r = b.resultado;
  const d = documento({ titulo: "Competencia", subtitulo: "Quién gana las licitaciones", generado: fechaLarga(b.terminado_at || b.created_at) });
  if (r.resumen) d.parrafo(r.resumen, { size: 11, color: "#14141a", despues: 8 });
  if (r.conclusiones?.length) {
    d.titulo("Conclusiones");
    for (const c of r.conclusiones) d.parrafo(`•  ${c}`, { size: 10, despues: 3 });
  }
  if (r.ranking?.length) {
    d.titulo("Quién gana más");
    for (const e of r.ranking.slice(0, 15)) d.parrafo(`${e.empresa} — ${e.victorias} ${e.victorias === 1 ? "licitación" : "licitaciones"}${e.provincias?.length ? ` · ${e.provincias.join(", ")}` : ""}`, { size: 10, despues: 3 });
  }
  if (r.adjudicaciones?.length) {
    d.titulo("Licitaciones adjudicadas");
    for (const a of r.adjudicaciones) {
      d.parrafo(`${a.objeto}`, { size: 10.5, negrita: true, color: "#14141a", despues: 1 });
      d.parrafo([a.organismo, a.provincia, a.ganador && `Ganó: ${a.ganador}`, a.monto && `Monto: ${a.monto}`, a.precio_unitario && `Precio: ${a.precio_unitario}`, a.fecha].filter(Boolean).join(" · "), { size: 9.5, color: "#444444", despues: 1 });
      if (a.fuentes?.length) d.parrafo(`Visto en: ${a.fuentes.slice(0, 3).map((f) => dominio(f.url)).join(", ")}`, { size: 8.5, color: "#888888", despues: 5 });
    }
  }
  if (r.competidores?.length) {
    d.titulo("Movimientos de la competencia");
    for (const c of r.competidores) {
      d.parrafo(`${c.empresa}${c.provincia ? ` · ${c.provincia}` : ""}${c.fecha_iso ? ` · ${c.fecha_iso}` : ""}`, { size: 10.5, negrita: true, color: "#14141a", despues: 1 });
      d.parrafo([c.novedad, c.que_vende, c.fortaleza && `Fortaleza: ${c.fortaleza}`, c.web].filter(Boolean).join(" · "), { size: 9.5, color: "#444444", despues: 5 });
    }
  }
  return d.cerrar();
}

function hoja(filas, anchos) {
  const ws = XLSX.utils.json_to_sheet(filas);
  ws["!cols"] = anchos.map((w) => ({ wch: w }));
  return ws;
}

function xlsxOportunidades(b) {
  const ops = (b.resultado.oportunidades || []).filter((o) => o.estado !== "DESCARTADA");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    hoja(
      ops.map((o) => ({
        Prioridad: TEXTO_PRIORIDAD[o.prioridad] || "", Estado: TEXTO_ESTADO[o.estado] || "Sin revisar", Nueva: o.nueva ? "Sí" : "", Tipo: SEGMENTOS[o.segmento] || "", Título: o.titulo, Organización: o.organizacion, Provincia: o.provincia, Fecha: o.fecha, Monto: o.monto,
        "Qué ofrecerle": (o.productos || []).join(", "), Argumento: o.argumento, "Qué pasó": o.que_paso, "Próximo paso": o.siguiente_paso, Contacto: o.contacto, "Visto en": (o.fuentes || []).map((f) => dominio(f.url)).join(", "), Enlace: o.url, Seguimiento: o.siguiendo ? "Sí" : "", Nota: o.nota || "",
      })),
      [11, 16, 7, 14, 46, 32, 16, 20, 16, 34, 40, 60, 40, 36, 30, 50, 11, 30],
    ),
    "Oportunidades",
  );
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function xlsxCompetencia(b) {
  const r = b.resultado;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hoja((r.ranking || []).map((e) => ({ Empresa: e.empresa, "Licitaciones ganadas": e.victorias, Provincias: (e.provincias || []).join(", ") })), [36, 20, 40]), "Ranking");
  XLSX.utils.book_append_sheet(wb, hoja((r.adjudicaciones || []).map((a) => ({ Organismo: a.organismo, Provincia: a.provincia, Objeto: a.objeto, Ganador: a.ganador, Monto: a.monto, "Precio unitario": a.precio_unitario, Fecha: a.fecha, "Visto en": (a.fuentes || []).map((f) => f.url).join(" | ") })), [34, 16, 50, 30, 18, 22, 14, 60]), "Adjudicaciones");
  XLSX.utils.book_append_sheet(wb, hoja((r.competidores || []).map((c) => ({ Empresa: c.empresa, Provincia: c.provincia, Novedad: c.novedad, Fecha: c.fecha_iso, "Qué vende": c.que_vende, Fortaleza: c.fortaleza, Web: c.web, "Visto en": (c.fuentes || []).map((f) => f.url).join(" | ") })), [32, 16, 46, 12, 50, 46, 30, 60]), "Competidores");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function registrarRutasExportar(app, { db, PERMISO, hidratar, filaBusqueda, falla }) {
  app.get("/api/clientes-nuevos/exportar/:id", PERMISO, async (req, res) => {
    try {
      const formato = String(req.query.formato || "pdf").toLowerCase();
      if (!["pdf", "xlsx"].includes(formato)) return res.status(400).json({ error: "Formato inválido: pdf o xlsx." });
      const [r] = await db.query("SELECT * FROM clientes_nuevos_busquedas WHERE id = ?", [req.params.id]);
      const b = r[0] && (await hidratar(db, filaBusqueda(r[0])));
      if (!b || b.estado !== "LISTO" || !b.resultado) return res.status(404).json({ error: "Esa búsqueda no tiene un reporte para exportar." });
      if (!["OPORTUNIDADES", "COMPETENCIA"].includes(b.tipo)) return res.status(400).json({ error: "Este tipo de búsqueda no se exporta." });
      const dia = new Date(b.terminado_at || b.created_at).toISOString().slice(0, 10);
      const nombre = `${b.tipo === "COMPETENCIA" ? "competencia" : "clientes-nuevos"}-${dia}.${formato}`;
      const buffer = formato === "pdf" ? (b.tipo === "COMPETENCIA" ? pdfCompetencia(b) : pdfOportunidades(b)) : b.tipo === "COMPETENCIA" ? xlsxCompetencia(b) : xlsxOportunidades(b);
      res.setHeader("Content-Type", formato === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
      res.send(buffer);
    } catch (e) {
      falla(res, e, "No pude armar el archivo.");
    }
  });
}

module.exports = { pdfOportunidades, pdfCompetencia, xlsxOportunidades, xlsxCompetencia, registrarRutasExportar };
