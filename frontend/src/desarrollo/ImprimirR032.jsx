// Registro R.032 armado solo con lo cargado en el proyecto, con la marca de Conoflex, listo para imprimir o guardar en PDF.
import { useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { getApiUrl } from "../apiConfig";
import { Modal } from "./util";
import LOGO_SVG from "../assets/logo.svg?raw";

const LOGO = LOGO_SVG.replace(/<\?xml[^>]*>\s*/, "");
import { botonPrimario, fechaCorta } from "./formato";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fecha = (f) => (f ? new Date(String(f).length <= 10 ? `${String(f).slice(0, 10)}T12:00:00` : f).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const lineas = (t) => String(t || "").split("\n").map((x) => x.replace(/^\s*[-•]\s*/, "").trim()).filter(Boolean);
const aDataUrl = (blob) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
const ORIGEN = { DIRECCION: "Dirección", CLIENTE: "Cliente", MERCADO: "Mercado", INTERNO: "Interno" };
const ESTADO = { EN_CURSO: "En curso", PAUSADO: "Pausado", TERMINADO: "Lanzado", DESCARTADO: "Descartado" };

/** Estado de aprobación de una etapa: [clase, texto]. */
function sello(e) {
  if (e.estado === "NO_APLICA") return ["na", "No aplica"];
  if (e.aprobacion_estado === "APROBADA") return ["ok", `Aprobó ${esc(e.aprobador_nombre)} · ${fecha(e.aprobado_at)}`];
  if (e.aprobacion_estado === "PEDIDA") return ["pend", `Pendiente de ${esc(e.aprobador_nombre)}`];
  if (e.aprobacion_estado === "RECHAZADA") return ["no", `No aprobado por ${esc(e.aprobador_nombre)}`];
  if (!e.aprobable) return lineas(e.detalle).length ? ["na", "Registro"] : ["vacio", "Sin cambios"];
  return ["vacio", "Sin aprobar"];
}

/** Una sección con título: si es corta va entera a la hoja siguiente en vez de partirse; si es larga, se parte entre filas. */
const seccion = (titulo, contenido, filas) => `<section class="${filas <= 12 ? "junta" : "larga"}"><h2>${titulo}</h2>${contenido}</section>`;

function armarHtml(p, imagenes) {
  const pts = p.items.filter((x) => x.tipo === "PT");
  const cuentan = p.etapas.filter((e) => e.etapa !== "CAMBIOS");
  const tracker = cuentan.map((e, i) => {
    const [c] = sello(e);
    const hecho = e.cerrada;
    return `<div class="paso ${hecho ? "hecho" : c === "pend" ? "pend" : ""}"><span class="bola">${hecho ? "✓" : i + 1}</span><span class="paso-n">${esc(e.nombre)}</span><span class="paso-s">${hecho ? (e.estado === "NO_APLICA" ? "No aplica" : fecha(e.aprobado_at)) : c === "pend" ? "Pendiente" : "—"}</span></div>`;
  }).join("");
  const tarjetas = p.etapas.map((e, i) => {
    const [c, t] = sello(e);
    const l = lineas(e.detalle);
    return `<section class="etapa">
      <div class="etapa-cab"><span class="num">${i + 1}</span><h3>${esc(e.nombre)}</h3><span class="sello ${c}">${t}</span></div>
      ${e.estado === "NO_APLICA" ? `<p class="gris">No aplica para este desarrollo.</p>` : l.length ? `<ul>${l.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="gris">Sin registros.</p>`}
      ${e.aprobacion_comentario ? `<p class="coment">“${esc(e.aprobacion_comentario)}”</p>` : ""}
      ${e.fecha ? `<p class="meta">Fecha: ${fecha(e.fecha)}${e.actualizado_por ? ` · Registró: ${esc(e.actualizado_por)}` : ""}</p>` : ""}
    </section>`;
  });
  const etapas = `<div class="junta"><h2>Registro del desarrollo</h2>${tarjetas[0] || ""}</div>${tarjetas.slice(1).join("")}`;
  const pruebas = p.pruebas.length
    ? seccion("Pruebas de verificación y validación", `<table><thead><tr><th>Tipo</th><th>Qué se prueba</th><th>Método</th><th>Objetivo</th><th>Resultado</th><th class="c">Cumple</th><th class="c">Fecha</th></tr></thead><tbody>${p.pruebas.map((x) => `<tr><td>${x.tipo === "VALIDACION" ? "Validación" : "Verificación"}</td><td><b>${esc(x.que)}</b></td><td>${esc(x.metodo)}</td><td>${esc(x.objetivo)}</td><td>${esc(x.resultado)}${x.cumple === "NO" && x.accion ? `<div class="accion">Acción: ${esc(x.accion)}</div>` : ""}</td><td class="c"><span class="pill ${x.cumple === "SI" ? "ok" : x.cumple === "NO" ? "no" : "pend"}">${x.cumple === "SI" ? "Sí" : x.cumple === "NO" ? "No" : "Pendiente"}</span></td><td class="c">${fecha(x.fecha)}</td></tr>`).join("")}</tbody></table>`, p.pruebas.length)
    : "";
  const items = p.items.length
    ? seccion("Ítems en la app", `<table><thead><tr><th>Código</th><th>Descripción</th><th>Tipo</th><th class="c">Receta</th></tr></thead><tbody>${p.items.map((x) => `<tr><td><b>${esc(x.codigo)}</b></td><td>${esc(x.nombre)}</td><td>${x.tipo === "PT" ? "Producto terminado" : "Semielaborado"}</td><td class="c"><span class="pill ${x.tiene_receta ? "ok" : "pend"}">${x.tiene_receta ? "Cargada" : "Falta"}</span></td></tr>`).join("")}</tbody></table>`, p.items.length)
    : "";
  const difusion = p.avisos.length
    ? seccion("Difusión", `<table><thead><tr><th>Persona</th><th class="c">Avisado</th><th class="c">Confirmó</th><th>Comentario</th></tr></thead><tbody>${p.avisos.map((a) => `<tr><td><b>${esc(a.usuario_nombre)}</b></td><td class="c">${fecha(a.enviado_at)}</td><td class="c">${a.enterado_at ? `<span class="pill ok">${fecha(a.enterado_at)}</span>` : `<span class="pill pend">Pendiente</span>`}</td><td>${esc(a.comentario)}</td></tr>`).join("")}</tbody></table>`, p.avisos.length)
    : "";
  const iso = `<div class="iso ${p.iso.completo ? "completo" : ""}"><div><b>Revisión ISO 9001 · P-11</b><span>${p.iso.completo ? "Documentación completa." : `${p.iso.ok} de ${p.iso.total} requisitos cumplidos.`}</span></div>${p.iso.completo ? "" : `<ul>${p.iso.items.filter((x) => !x.ok).map((x) => `<li>${esc(x.texto)}</li>`).join("")}</ul>`}</div>`;
  const fotos = imagenes.length
    ? `<section class="salto"><h2>Imágenes del diseño 2D/3D oficial y aprobado</h2><p class="gris" style="margin-left:0">Aprobadas previo a la primera producción real.</p><div class="fotos${imagenes.length === 1 ? " una" : ""}">${imagenes.map((i) => `<figure><div class="marco"><img src="${i.src}"></div><figcaption><b>${esc(i.nombre)}</b>${i.descripcion ? `<br>${esc(i.descripcion)}` : ""}</figcaption></figure>`).join("")}</div></section>`
    : "";
  const dato = (k, v) => `<div class="dato"><span>${k}</span><b>${v || "—"}</b></div>`;
  const pie = `Conoflex · R.032 Rev.1 · ${p.codigo}`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>R.032 ${esc(p.codigo)} · ${esc(p.nombre)}</title><style>
    @page { size: A4; margin: 14mm 14mm 16mm; @bottom-left { content: "${pie.replace(/"/g, "")}"; font: 7.5pt Helvetica, Arial, sans-serif; color: #9a9a9a; } @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 7.5pt Helvetica, Arial, sans-serif; color: #9a9a9a; } }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: "Archivo", "Segoe UI", Helvetica, Arial, sans-serif; color: #282827; font-size: 9.5pt; line-height: 1.45; margin: 0; }
    .enc { display: flex; align-items: center; gap: 12px; padding-bottom: 10px; border-bottom: 3px solid #e85c0d; }
    .enc svg { width: 44px; height: 44px; flex-shrink: 0; }
    .marca b { display: block; font-size: 17pt; letter-spacing: 3px; font-weight: 800; line-height: 1; }
    .marca span { font-size: 8pt; color: #7a7a7a; letter-spacing: .5px; text-transform: uppercase; }
    .doc { margin-left: auto; text-align: right; }
    .doc .tag { display: inline-block; background: #282827; color: #fff; font-weight: 700; font-size: 8pt; padding: 3px 8px; border-radius: 4px; letter-spacing: .5px; }
    .doc div { font-size: 8pt; color: #7a7a7a; margin-top: 4px; }
    .hero { margin: 16px 0 12px; }
    .eyebrow { font-size: 7.5pt; font-weight: 700; color: #e85c0d; letter-spacing: 1.2px; text-transform: uppercase; }
    h1 { font-size: 21pt; line-height: 1.12; margin: 4px 0 6px; font-weight: 800; }
    .codigos span { display: inline-block; font-size: 8pt; font-weight: 700; border: 1px solid #282827; border-radius: 4px; padding: 1px 6px; margin-right: 4px; }
    .datos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; border: 1px solid #e6e2de; border-radius: 8px; overflow: hidden; margin: 12px 0; background: #faf8f6; }
    .dato { padding: 8px 10px; border-right: 1px solid #e6e2de; } .dato:last-child { border-right: 0; }
    .dato span { display: block; font-size: 7pt; color: #8a8a8a; text-transform: uppercase; letter-spacing: .6px; }
    .dato b { font-size: 9.5pt; }
    .si { color: #1f8f4e; } .nop { color: #9a9a9a; }
    .tracker { display: flex; gap: 6px; margin: 4px 0 18px; }
    .paso { flex: 1; text-align: center; position: relative; }
    .bola { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: #ededed; color: #8a8a8a; font-weight: 700; font-size: 9pt; }
    .paso.hecho .bola { background: #1f8f4e; color: #fff; } .paso.pend .bola { background: #f2b630; color: #fff; }
    .paso-n { display: block; font-size: 7.5pt; font-weight: 700; margin-top: 4px; line-height: 1.2; }
    .paso-s { display: block; font-size: 7pt; color: #8a8a8a; }
    h2 { font-size: 11pt; margin: 20px 0 8px; padding-left: 8px; border-left: 3px solid #e85c0d; }
    .etapa { border: 1px solid #e6e2de; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; page-break-inside: avoid; }
    .etapa-cab { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    .num { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: #282827; color: #fff; font-size: 8pt; font-weight: 700; flex-shrink: 0; }
    h3 { font-size: 10.5pt; margin: 0; flex: 1; }
    .sello { font-size: 7.5pt; font-weight: 700; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
    .sello.ok { background: #e3f4ea; color: #1f8f4e; } .sello.pend { background: #fdf1d6; color: #9a6a00; } .sello.no { background: #fbe4e2; color: #b42318; } .sello.na, .sello.vacio { background: #f0f0f0; color: #7a7a7a; }
    ul { margin: 2px 0 0; padding-left: 30px; } li { margin: 1.5px 0; }
    .gris { color: #8a8a8a; margin: 2px 0 0 28px; }
    .coment { margin: 4px 0 0 28px; font-style: italic; color: #1f8f4e; }
    .meta { margin: 4px 0 0 28px; font-size: 7.5pt; color: #9a9a9a; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e6e2de; border-radius: 8px; overflow: hidden; font-size: 8.5pt; }
    thead th { background: #282827; color: #fff; font-weight: 700; text-align: left; padding: 6px 8px; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .5px; }
    td { padding: 6px 8px; border-top: 1px solid #eee; vertical-align: top; }
    tbody tr:nth-child(even) td { background: #faf8f6; }
    tr { page-break-inside: avoid; }
    .c { text-align: center; white-space: nowrap; }
    .pill { display: inline-block; font-size: 7.5pt; font-weight: 700; padding: 1px 7px; border-radius: 999px; }
    .pill.ok { background: #e3f4ea; color: #1f8f4e; } .pill.no { background: #fbe4e2; color: #b42318; } .pill.pend { background: #fdf1d6; color: #9a6a00; }
    .accion { margin-top: 3px; font-size: 7.5pt; color: #b42318; }
    .iso { margin-top: 18px; border-radius: 8px; padding: 10px 12px; background: #fdf1e9; border: 1px solid #f5cdb4; page-break-inside: avoid; }
    .iso.completo { background: #e3f4ea; border-color: #b9e2c8; }
    .iso > div { display: flex; gap: 8px; align-items: baseline; } .iso span { color: #6b6b6b; }
    .iso ul { margin-top: 4px; padding-left: 18px; color: #6b6b6b; font-size: 8.5pt; }
    .salto { page-break-before: always; break-before: page; }
    .junta, .etapa, figure, .iso, .datos, .tracker { break-inside: avoid; page-break-inside: avoid; }
    .larga h2 { break-after: avoid; page-break-after: avoid; }
    h2 { break-after: avoid; page-break-after: avoid; }
    thead { display: table-header-group; }
    tr, td, th { break-inside: avoid; page-break-inside: avoid; }
    p, li { orphans: 3; widows: 3; }
    section.junta, section.larga { margin-top: 18px; }
    section.junta > h2, section.larga > h2 { margin-top: 0; }
    .fotos { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px; }
    .fotos.una { grid-template-columns: 1fr; } .fotos.una .marco img { max-height: 170mm; }
    figure { margin: 0; page-break-inside: avoid; }
    .marco { border: 1px solid #e6e2de; border-radius: 8px; padding: 8px; background: #fff; }
    .marco img { width: 100%; max-height: 105mm; object-fit: contain; display: block; }
    figcaption { font-size: 8pt; color: #6b6b6b; margin-top: 4px; }
    .firma { margin-top: 10px; font-size: 7.5pt; color: #9a9a9a; }
  </style></head><body>
    <header class="enc">${LOGO}<div class="marca"><b>CONOFLEX</b><span>Desarrollo de productos</span></div>
      <div class="doc"><span class="tag">R.032 · REV. 1</span><div>${esc(p.codigo)} · Emitido ${fecha(new Date().toISOString())}</div></div></header>
    <div class="hero">
      <div class="eyebrow">${p.tipo === "MODIFICACION" ? "Modificación de producto" : "Producto nuevo"}${p.origen ? ` · Lo pide ${ORIGEN[p.origen].toLowerCase()}` : ""}${p.cliente ? ` (${esc(p.cliente)})` : ""}</div>
      <h1>${esc(p.nombre)}</h1>
      ${pts.length ? `<div class="codigos">${pts.map((x) => `<span>${esc(x.codigo)}</span>`).join("")}</div>` : ""}
    </div>
    <div class="datos">
      ${dato("Responsable", esc(p.responsable_nombre))}
      ${dato("Estado", ESTADO[p.estado])}
      ${dato(p.fecha_lanzamiento ? "Lanzamiento" : "Fecha objetivo", fecha(p.fecha_lanzamiento || p.fecha_objetivo))}
      ${dato("Listado en ventas", p.listado_ventas ? `<span class="si">✓ Sí</span>` : `<span class="nop">✕ No</span>`)}
    </div>
    ${p.punto_partida ? `<p style="margin:0 0 12px"><span class="gris" style="margin:0">Punto de partida:</span> ${esc(p.punto_partida)}</p>` : ""}
    <div class="tracker junta">${tracker}</div>
    ${etapas}
    ${pruebas}${items}${difusion}
    <div class="junta">${iso}
    <p class="firma">Generado desde la app de Conoflex el ${new Date().toLocaleString("es-AR")}. La bitácora completa, con cada cambio, aprobación y archivo, queda en el módulo Desarrollo de productos.</p></div>
    ${fotos}
  </body></html>`;
}

export default function ImprimirR032({ p, onCerrar }) {
  const [imagenes, setImagenes] = useState(null);
  const oficiales = p.archivos.filter((a) => a.es_oficial && a.tiene_miniatura);

  useEffect(() => {
    let vivo = true;
    Promise.all(
      oficiales.map((a) =>
        fetch(getApiUrl(`/api/desarrollo/archivos/${a.id}`))
          .then((r) => (r.ok ? r.blob() : null))
          .then((b) => (b ? aDataUrl(b) : null))
          .then((src) => (src ? { src, nombre: a.nombre, descripcion: a.descripcion } : null))
          .catch(() => null),
      ),
    ).then((l) => vivo && setImagenes(l.filter(Boolean)));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);

  const imprimir = () => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(armarHtml(p, imagenes || []));
    doc.close();
    const listo = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => iframe.remove(), 2000);
    };
    const imgs = [...doc.images];
    if (!imgs.length) setTimeout(listo, 100);
    else Promise.all(imgs.map((i) => (i.complete ? null : new Promise((ok) => { i.onload = ok; i.onerror = ok; })))).then(listo);
  };

  return (
    <Modal titulo="Registro R.032" subtitulo="Se arma solo con lo cargado en el proyecto. Desde la ventana de impresión podés guardarlo como PDF." onCerrar={onCerrar} ancho="max-w-3xl">
      <div className="rounded-xl overflow-hidden border border-zinc-800 bg-white">
        <iframe title="Vista previa R.032" srcDoc={armarHtml(p, imagenes || [])} className="w-full h-[60vh] bg-white" />
      </div>
      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <button onClick={imprimir} disabled={imagenes === null} className={botonPrimario}>{imagenes === null ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} Imprimir o guardar PDF</button>
        <p className="text-xs text-zinc-500">{oficiales.length ? `Incluye ${oficiales.length} imagen${oficiales.length === 1 ? "" : "es"} oficial${oficiales.length === 1 ? "" : "es"}.` : "Sin imágenes oficiales: marcá en «Archivos» el plano o render aprobado."} Generado el {fechaCorta(new Date())}.</p>
      </div>
    </Modal>
  );
}
