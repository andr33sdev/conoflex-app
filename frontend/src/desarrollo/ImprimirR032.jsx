// Registro R.032 armado solo, con el mismo formato de siempre, listo para imprimir o guardar en PDF.
import { useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { getApiUrl } from "../apiConfig";
import { Modal } from "./util";
import { botonPrimario, fechaCorta } from "./formato";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fecha = (f) => (f ? new Date(String(f).length <= 10 ? `${String(f).slice(0, 10)}T12:00:00` : f).toLocaleDateString("es-AR") : "");
const puntos = (t) => {
  const l = String(t || "").split("\n").map((x) => x.replace(/^\s*[-•]\s*/, "").trim()).filter(Boolean);
  return l.length ? `<ul>${l.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "<ul><li></li></ul>";
};
const aDataUrl = (blob) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });

function armarHtml(p, imagenes) {
  const filas = p.etapas.map((e) => {
    const aprobo = e.estado === "NO_APLICA" ? "N/A" : e.aprobacion_estado === "APROBADA" ? `${esc(e.aprobador_nombre)}<br><small>${fecha(e.aprobado_at)}</small>` : e.aprobacion_estado === "PEDIDA" ? `<small>Pendiente: ${esc(e.aprobador_nombre)}</small>` : "";
    return `<tr><td class="tema">${esc(e.nombre)}</td><td>${e.estado === "NO_APLICA" ? "<ul><li>No aplica</li></ul>" : puntos(e.detalle)}</td><td class="c">${fecha(e.fecha)}</td><td class="c">${aprobo}</td></tr>`;
  }).join("");
  const pruebas = p.pruebas.length
    ? `<h3>Pruebas de verificación y validación</h3><table><tr><th>Tipo</th><th>Qué se prueba</th><th>Método</th><th>Objetivo</th><th>Resultado</th><th>Cumple</th><th>Fecha</th></tr>${p.pruebas.map((x) => `<tr><td>${x.tipo === "VALIDACION" ? "Validación" : "Verificación"}</td><td>${esc(x.que)}</td><td>${esc(x.metodo)}</td><td>${esc(x.objetivo)}</td><td>${esc(x.resultado)}${x.cumple === "NO" && x.accion ? `<br><small>Acción: ${esc(x.accion)}</small>` : ""}</td><td class="c">${x.cumple === "SI" ? "Sí" : x.cumple === "NO" ? "No" : "Pendiente"}</td><td class="c">${fecha(x.fecha)}</td></tr>`).join("")}</table>`
    : "";
  const items = p.items.length ? `<p><b>Ítems en la app:</b> ${p.items.map((x) => `${esc(x.codigo)} (${x.tipo === "PT" ? "producto terminado" : "semielaborado"}${x.tiene_receta ? ", con receta" : ", sin receta"})`).join(" · ")}</p>` : "";
  const difusion = p.avisos.length ? `<h3>Difusión</h3><table><tr><th>Persona</th><th>Avisado</th><th>Confirmó</th><th>Comentario</th></tr>${p.avisos.map((a) => `<tr><td>${esc(a.usuario_nombre)}</td><td class="c">${fecha(a.enviado_at)}</td><td class="c">${a.enterado_at ? fecha(a.enterado_at) : "—"}</td><td>${esc(a.comentario)}</td></tr>`).join("")}</table>` : "";
  const fotos = imagenes.length ? `<div class="salto"></div><p class="vineta">● IMÁGENES DEL DISEÑO 2D/3D OFICIAL Y APROBADO PREVIO A PRIMERA PRODUCCIÓN REAL</p><div class="fotos">${imagenes.map((i) => `<figure><img src="${i.src}"><figcaption>${esc(i.nombre)}${i.descripcion ? ` — ${esc(i.descripcion)}` : ""}</figcaption></figure>`).join("")}</div>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>R.032 ${esc(p.codigo)} ${esc(p.nombre)}</title><style>
    @page { size: A4; margin: 16mm 14mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11pt; }
    .enc { font-size: 10pt; margin-bottom: 18px; display: flex; justify-content: space-between; }
    h1 { font-size: 18pt; font-weight: normal; margin: 0 0 6px; }
    h3 { font-size: 11pt; margin: 18px 0 6px; }
    .vineta { margin: 4px 0 10px 18px; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; page-break-inside: auto; }
    tr { page-break-inside: avoid; }
    th, td { border: 1px solid #000; padding: 5px 6px; vertical-align: top; text-align: left; font-size: 10pt; }
    th { font-weight: bold; }
    td.tema { width: 24%; } td.c { text-align: center; white-space: nowrap; width: 12%; }
    ul { margin: 0; padding-left: 16px; } li { margin: 1px 0; }
    small { color: #444; }
    .pie { margin-top: 14px; font-size: 9pt; color: #555; }
    .salto { page-break-before: always; }
    .fotos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    figure { margin: 0; } figure img { width: 100%; max-height: 110mm; object-fit: contain; border: 1px solid #ccc; } figcaption { font-size: 9pt; color: #444; margin-top: 3px; }
  </style></head><body>
    <div class="enc"><span>R.032 Rev.1 - Desarrollo de productos</span><span>${esc(p.codigo)}</span></div>
    <h1>Producto/Código: ${esc(p.nombre)}${p.items.filter((x) => x.tipo === "PT").length ? ` (${p.items.filter((x) => x.tipo === "PT").map((x) => esc(x.codigo)).join(", ")})` : ""}</h1>
    <p class="vineta">● Producto ${p.listado_ventas ? "listado" : "no listado"} en ventas ${p.listado_ventas ? "✅" : "❌"}</p>
    <table><tr><th>Tema</th><th>Detalle</th><th>Fecha</th><th>Aprobó</th></tr>${filas}</table>
    ${pruebas}${items}${difusion}
    <p class="pie">Generado desde la app el ${new Date().toLocaleString("es-AR")}. La bitácora completa, con cada cambio, aprobación y archivo, está en el módulo Desarrollo de productos.</p>
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
