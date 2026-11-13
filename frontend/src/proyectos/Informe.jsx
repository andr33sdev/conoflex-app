// Informe del proyecto para imprimir o mandar en PDF (ej. a Compras o al proveedor): en qué quedó, las pruebas con sus
// fotos y decisiones, y la historia. Con la marca de Conoflex.
import { useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { ESTADOS, PRUEBA, TIPOS } from "./formato";
import { Modal } from "./util";
import { imagenComoDataUrl } from "./api";
import LOGO_SVG from "../assets/logo.svg?raw";

const LOGO = LOGO_SVG.replace(/<\?xml[^>]*>\s*/, "");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fecha = (f) => (f ? new Date(String(f).length <= 10 ? `${String(f).slice(0, 10)}T12:00:00` : f).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const MAX_FOTOS_PRUEBA = 4;

function armarHtml(p, fotos, conHistoria) {
  const ultimo = p.eventos.find((e) => ["NOVEDAD", "DECISION", "PRUEBA", "ESTADO", "COMENTARIO"].includes(e.tipo));
  const dato = (k, v) => `<div class="dato"><span>${k}</span><b>${v || "—"}</b></div>`;
  const pruebas = p.pruebas.map((x) => {
    const sello = x.estado === "APROBADA" ? "ok" : x.estado === "RECHAZADA" ? "no" : "pend";
    const imgs = (fotos[x.id] || []).map((src) => `<img src="${src}">`).join("");
    const decision = x.estado === "PENDIENTE" ? "" : `<p class="decision ${sello}">${x.estado === "APROBADA" ? "Aprobó" : "Rechazó"} <b>${esc(x.decidido_por)}</b> el ${fecha(x.decidido_at)}${x.motivo ? ` — ${x.estado === "RECHAZADA" ? "Motivo: " : ""}${esc(x.motivo)}` : ""}</p>`;
    const coment = x.comentarios.length ? `<div class="coments">${x.comentarios.map((c) => `<p><b>${esc(c.usuario_nombre)}</b> <span>${fecha(c.created_at)}</span> ${esc(c.texto)}</p>`).join("")}</div>` : "";
    return `<section class="prueba">
      <div class="cab"><h3>${esc(x.que)}</h3><span class="sello ${sello}">${PRUEBA[x.estado].texto}</span></div>
      <p class="meta">${[x.pieza && `En: ${esc(x.pieza)}`, x.fecha && fecha(x.fecha), x.creado_por && `Cargó: ${esc(x.creado_por)}`].filter(Boolean).join(" · ")}</p>
      ${x.metodo ? `<p><span class="k">Cómo se probó:</span> ${esc(x.metodo)}</p>` : ""}
      ${x.resultado ? `<p><span class="k">Resultado:</span> ${esc(x.resultado)}</p>` : ""}
      ${decision}
      ${imgs ? `<div class="fotos">${imgs}</div>` : ""}
      ${coment}
    </section>`;
  }).join("");
  const historia = conHistoria && p.eventos.length
    ? `<section class="junta"><h2>Historia</h2><table><thead><tr><th class="f">Fecha</th><th class="q">Quién</th><th>Qué pasó</th></tr></thead><tbody>${[...p.eventos].reverse().map((e) => `<tr><td class="f">${fecha(e.created_at)}</td><td class="q">${esc(e.usuario_nombre)}</td><td>${esc(e.texto)}</td></tr>`).join("")}</tbody></table></section>`
    : "";
  const r = p.resumen_pruebas;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(p.codigo)} · ${esc(p.titulo)}</title><style>
    @page { size: A4; margin: 14mm 14mm 16mm; @bottom-left { content: "Conoflex · ${esc(p.codigo).replace(/"/g, "")}"; font: 7.5pt Helvetica, Arial, sans-serif; color: #9a9a9a; } @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 7.5pt Helvetica, Arial, sans-serif; color: #9a9a9a; } }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: "Archivo", "Segoe UI", Helvetica, Arial, sans-serif; color: #282827; font-size: 9.5pt; line-height: 1.45; margin: 0; }
    .enc { display: flex; align-items: center; gap: 12px; padding-bottom: 10px; border-bottom: 3px solid #e85c0d; }
    .enc svg { width: 44px; height: 44px; flex-shrink: 0; }
    .marca b { display: block; font-size: 17pt; letter-spacing: 3px; font-weight: 800; line-height: 1; } .marca span { font-size: 8pt; color: #7a7a7a; letter-spacing: .5px; text-transform: uppercase; }
    .doc { margin-left: auto; text-align: right; } .doc .tag { display: inline-block; background: #282827; color: #fff; font-weight: 700; font-size: 8pt; padding: 3px 8px; border-radius: 4px; } .doc div { font-size: 8pt; color: #7a7a7a; margin-top: 4px; }
    .eyebrow { margin-top: 16px; font-size: 7.5pt; font-weight: 700; color: #e85c0d; letter-spacing: 1.2px; text-transform: uppercase; }
    h1 { font-size: 20pt; line-height: 1.15; margin: 4px 0 10px; font-weight: 800; }
    .datos { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #e6e2de; border-radius: 8px; overflow: hidden; background: #faf8f6; }
    .dato { padding: 8px 10px; border-right: 1px solid #e6e2de; } .dato:last-child { border-right: 0; }
    .dato span { display: block; font-size: 7pt; color: #8a8a8a; text-transform: uppercase; letter-spacing: .6px; } .dato b { font-size: 9.5pt; }
    .estado { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .caja { border: 1px solid #e6e2de; border-radius: 8px; padding: 10px 12px; } .caja.paso { border-color: #f5cdb4; background: #fdf6f1; }
    .caja .t { font-size: 7pt; color: #8a8a8a; text-transform: uppercase; letter-spacing: .6px; font-weight: 700; } .caja p { margin: 4px 0 0; }
    .final { margin-top: 10px; border-radius: 8px; padding: 10px 12px; background: #e3f4ea; border: 1px solid #b9e2c8; }
    .final.no { background: #fbe4e2; border-color: #f2c3be; }
    h2 { font-size: 11pt; margin: 20px 0 8px; padding-left: 8px; border-left: 3px solid #e85c0d; break-after: avoid; page-break-after: avoid; }
    h2 small { font-weight: 400; color: #8a8a8a; font-size: 8.5pt; margin-left: 6px; }
    .prueba { border: 1px solid #e6e2de; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; break-inside: avoid; page-break-inside: avoid; }
    .cab { display: flex; align-items: center; gap: 8px; } h3 { font-size: 10.5pt; margin: 0; flex: 1; }
    .sello { font-size: 7.5pt; font-weight: 700; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
    .sello.ok, .decision.ok { background: #e3f4ea; color: #1f8f4e; } .sello.no, .decision.no { background: #fbe4e2; color: #b42318; } .sello.pend { background: #f0f0f0; color: #7a7a7a; }
    .meta { margin: 2px 0 6px; font-size: 8pt; color: #8a8a8a; } .prueba p { margin: 3px 0; } .k { color: #7a7a7a; }
    .decision { border-radius: 6px; padding: 5px 8px; margin-top: 6px !important; }
    .fotos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 8px; } .fotos img { width: 100%; height: 34mm; object-fit: cover; border-radius: 6px; border: 1px solid #e6e2de; }
    .coments { margin-top: 8px; border-top: 1px dashed #e6e2de; padding-top: 6px; font-size: 8.5pt; } .coments span { color: #9a9a9a; font-size: 7.5pt; } .coments p { margin: 2px 0; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e6e2de; border-radius: 8px; overflow: hidden; font-size: 8.5pt; }
    thead { display: table-header-group; } thead th { background: #282827; color: #fff; text-align: left; padding: 6px 8px; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .5px; }
    td { padding: 5px 8px; border-top: 1px solid #eee; vertical-align: top; } tbody tr:nth-child(even) td { background: #faf8f6; } tr { break-inside: avoid; page-break-inside: avoid; }
    .f { width: 18mm; white-space: nowrap; } .q { width: 28mm; }
    .junta { break-inside: auto; }
    .pie { margin-top: 12px; font-size: 7.5pt; color: #9a9a9a; }
    .estado, .datos, .final { break-inside: avoid; page-break-inside: avoid; }
  </style></head><body>
    <header class="enc">${LOGO}<div class="marca"><b>CONOFLEX</b><span>Proyectos y pruebas</span></div>
      <div class="doc"><span class="tag">${esc(p.codigo)}</span><div>Informe del ${fecha(new Date().toISOString())}</div></div></header>
    <div class="eyebrow">${esc(TIPOS[p.tipo]?.texto)}${p.proveedor ? ` · ${esc(p.proveedor)}` : ""}</div>
    <h1>${esc(p.titulo)}</h1>
    <div class="datos">
      ${dato("Estado", ESTADOS[p.estado]?.texto)}
      ${dato("Responsable", esc(p.responsable_nombre))}
      ${dato("Pruebas", r.total ? `${r.aprobadas} ✓ · ${r.rechazadas} ✕ · ${r.pendientes} pend.` : "—")}
      ${dato("Esperan", esc(p.interesados.map((i) => i.usuario_nombre).join(", ")))}
    </div>
    ${p.descripcion ? `<p style="margin:10px 0 0">${esc(p.descripcion)}</p>` : ""}
    ${p.resultado && (p.estado === "LOGRADO" || p.estado === "DESCARTADO") ? `<div class="final ${p.estado === "DESCARTADO" ? "no" : ""}"><b>Cómo terminó:</b> ${esc(p.resultado)}</div>` : ""}
    <div class="estado">
      <div class="caja"><div class="t">Lo último</div><p>${ultimo ? `${esc(ultimo.texto)}<br><span class="k">${esc(ultimo.usuario_nombre)} · ${fecha(ultimo.created_at)}</span>` : "Sin novedades."}</p></div>
      <div class="caja paso"><div class="t">Próximo paso</div><p>${p.proximo_paso ? `<b>${esc(p.proximo_paso)}</b><br><span class="k">${[esc(p.proximo_paso_quien), p.proximo_paso_fecha && `para el ${fecha(p.proximo_paso_fecha)}`].filter(Boolean).join(" · ")}</span>` : "Sin definir."}</p></div>
    </div>
    ${p.pruebas.length ? `<h2>Pruebas <small>${r.total} en total</small></h2>${pruebas}` : ""}
    ${historia}
    <p class="pie">Generado desde la app de Conoflex el ${new Date().toLocaleString("es-AR")}.</p>
  </body></html>`;
}

export default function Informe({ p, onCerrar }) {
  const [fotos, setFotos] = useState(null);
  const [historia, setHistoria] = useState(true);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const out = {};
      for (const x of p.pruebas) {
        const ids = x.archivos.filter((a) => a.tiene_miniatura).slice(0, MAX_FOTOS_PRUEBA).map((a) => a.id);
        out[x.id] = (await Promise.all(ids.map((id) => imagenComoDataUrl(id).catch(() => null)))).filter(Boolean);
      }
      if (vivo) setFotos(out);
    })();
    return () => {
      vivo = false;
    };
  }, [p]);

  const html = armarHtml(p, fotos || {}, historia);
  const imprimir = () => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
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
    <Modal titulo="Informe" subtitulo="En qué quedó, las pruebas con sus fotos y decisiones. Desde la ventana de impresión lo guardás en PDF." onCerrar={onCerrar} ancho="max-w-3xl">
      <div className="rounded-xl overflow-hidden border border-zinc-800 bg-white">
        <iframe title="Vista previa del informe" srcDoc={html} className="w-full h-[60vh] bg-white" />
      </div>
      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <button onClick={imprimir} disabled={fotos === null} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#FF5A00] hover:bg-[#ff7a2e] text-black cursor-pointer disabled:opacity-50">{fotos === null ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} Imprimir o guardar PDF</button>
        <label className="inline-flex items-center gap-2 text-sm text-zinc-300 cursor-pointer"><input type="checkbox" checked={historia} onChange={(e) => setHistoria(e.target.checked)} className="accent-[#FF5A00]" /> Incluir la historia completa</label>
      </div>
    </Modal>
  );
}
