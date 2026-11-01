"use strict";
// Cotizador de mails (etapa B). En vez de pasarle todo el catálogo a la IA y dejar que haga las cuentas:
//   1) Una primera llamada lee el mail (y las fotos) y elige QUÉ productos corresponden y cuántos.
//   2) El servidor trae solo esas fichas y calcula los precios (lista, descuento, total) con aritmética exacta.
//   3) Una segunda llamada redacta el mail usando esas fichas; el HTML de las tarjetas lo arma el servidor,
//      así los precios que se ven son siempre los calculados y el formato es siempre el mismo.
// Cuando hay una duda (precio con variantes, unidad que no coincide, producto sin precio) NO se inventa nada:
// se marca para revisar y el borrador lo dice.
const { leerPrecios, normalizarCodigo } = require("./catalogo");

const MAX_ITEMS = 6;
const UNIDADES = new Set(["u", "m", "par", "rollo"]);
const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Texto del modelo → HTML seguro (solo negrita con **). */
const textoHtml = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n+/g, "<br>");

const pesos = (n) => `$${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const redondear2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Una línea por producto para que la IA elija: id | código | nombre | categoría | medidas | usos (solo títulos). */
function indiceCatalogo(productos) {
  return productos
    .map((p) => {
      const titulos = String(p.usos_recomendados || "").split(/\s*\|\s*/).map((u) => u.split(":")[0].trim()).filter(Boolean).slice(0, 6).join(", ");
      return [p.id, p.codigo, p.nombre, p.categoria || "", String(p.medidas || "").slice(0, 70), titulos.slice(0, 120)].map((x) => String(x ?? "").replace(/\s+/g, " ").trim()).join(" | ");
    })
    .join("\n");
}

function parsearJson(texto) {
  const t = String(texto || "").replace(/^```json|^```|```$/gim, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const m = /\{[\s\S]*\}/.exec(t);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

const TIPOS_OBSERVACION = new Set(["VACIO", "CARACTERISTICA", "PREGUNTA", "MEJORA"]);
/** Lo que la IA notó para que el equipo lo defina: cosas pedidas que el sistema no tiene definidas. Solo texto corto y de tipos conocidos. */
function normalizarObservaciones(lista) {
  const out = [];
  for (const o of Array.isArray(lista) ? lista : []) {
    const tipo = String(o?.tipo || "").toUpperCase();
    const titulo = String(o?.titulo || "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (!TIPOS_OBSERVACION.has(tipo) || titulo.length < 6) continue;
    out.push({ tipo, titulo, detalle: String(o?.detalle || "").replace(/\s+/g, " ").trim().slice(0, 400), evidencia: String(o?.evidencia || "").replace(/\s+/g, " ").trim().slice(0, 300) });
    if (out.length >= 4) break;
  }
  return out;
}

/** Valida lo que devolvió el primer paso: solo ids que existen, cantidades numéricas, sin repetidos. */
function validarPedido(crudo, productos) {
  if (!crudo || typeof crudo !== "object") return null;
  const porId = new Map(productos.map((p) => [String(p.id), p]));
  const vistos = new Set();
  const items = [];
  for (const it of Array.isArray(crudo.items) ? crudo.items : []) {
    const p = porId.get(String(it?.id));
    if (!p || vistos.has(p.id)) continue;
    vistos.add(p.id);
    const cant = Number(it.cantidad);
    items.push({
      producto: p,
      cantidad: Number.isFinite(cant) && cant > 0 ? cant : null,
      unidad: UNIDADES.has(String(it.unidad)) ? String(it.unidad) : null,
      variante: typeof it.variante === "string" && it.variante.trim() ? it.variante.trim().slice(0, 80) : null,
      motivo: String(it.motivo || "").slice(0, 200),
      correspondencia: typeof it.correspondencia === "string" && it.correspondencia.trim() ? it.correspondencia.trim().slice(0, 400) : null,
    });
    if (items.length >= MAX_ITEMS) break;
  }
  const pct = Number(crudo.descuento_pct);
  return {
    pide_lista_precios: !!crudo.pide_lista_precios,
    descuento_pct: Number.isFinite(pct) && pct > 0 && pct <= 60 ? redondear2(pct) : null,
    items,
    sin_equivalente: (Array.isArray(crudo.sin_equivalente) ? crudo.sin_equivalente : []).filter((x) => x && x.pedido).slice(0, 6).map((x) => ({ pedido: String(x.pedido).slice(0, 160), detalle: String(x.detalle || "").slice(0, 300) })),
    preguntas_al_cliente: (Array.isArray(crudo.preguntas_al_cliente) ? crudo.preguntas_al_cliente : []).map((x) => String(x).slice(0, 200)).filter(Boolean).slice(0, 4),
    observaciones: normalizarObservaciones(crudo.observaciones),
  };
}

/**
 * Precio de un ítem. Devuelve { lista, conDescuento, total, etiqueta, avisos[] }.
 * No elige un precio por su cuenta cuando hay variantes sin indicar ni cuando la unidad no coincide.
 */
function calcularItem(item, descuentoPct) {
  const p = leerPrecios(item.producto.precio_lista);
  const avisos = [];
  const nombre = item.producto.nombre || item.producto.codigo;
  let precio = null;
  let etiqueta = null;
  if (!p.valores.length) {
    avisos.push(`${nombre}: no tiene precio cargado en la lista.`);
  } else if (p.valores.length === 1) {
    precio = p.valores[0].valor;
  } else if (item.variante) {
    const v = sinAcentos(item.variante);
    const coinciden = p.valores.filter((x) => x.etiqueta && (sinAcentos(x.etiqueta).includes(v) || v.includes(sinAcentos(x.etiqueta))));
    if (coinciden.length === 1) {
      precio = coinciden[0].valor;
      etiqueta = coinciden[0].etiqueta;
    }
  }
  if (precio === null && p.valores.length > 1) avisos.push(`${nombre}: tiene precios distintos según la variante (${p.valores.map((x) => `${x.etiqueta || "?"} ${pesos(x.valor)}`).join(" / ")}); el cliente no aclaró cuál.`);

  let totalOk = precio !== null;
  const esMetros = item.unidad === "m";
  if (precio !== null && esMetros && p.unidad !== "metro") {
    totalOk = false;
    avisos.push(`${nombre}: el cliente pide ${item.cantidad ?? "?"} m pero la lista no aclara que el precio sea por metro; no se calculó el total.`);
  } else if (precio !== null && !esMetros && p.unidad === "metro") {
    totalOk = false;
    avisos.push(`${nombre}: el precio de lista es por metro y el pedido no está en metros; no se calculó el total.`);
  } else if (precio !== null && item.unidad === "par" && p.unidad !== "par") {
    avisos.push(`${nombre}: el cliente habla de pares y la lista no aclara que el precio sea por par; revisá la cantidad.`);
  }
  const lista = precio;
  const conDescuento = precio !== null && descuentoPct ? redondear2(precio * (1 - descuentoPct / 100)) : precio;
  const cant = item.cantidad ?? 1;
  const total = totalOk && conDescuento !== null ? redondear2(conDescuento * cant) : null;
  return { lista, conDescuento, total, cantidad: cant, cantidadDada: item.cantidad !== null, etiqueta, variantes: p.valores.length > 1 && precio === null ? p.valores : [], unidadPrecio: p.unidad, avisos };
}

function calcularPedido(pedido, descuentoOverride = null) {
  const pct = descuentoOverride ?? pedido.descuento_pct ?? null;
  const lineas = pedido.items.map((it) => ({ item: it, calculo: calcularItem(it, pct) }));
  return { descuentoPct: pct, lineas, avisos: lineas.flatMap((l) => l.calculo.avisos) };
}

const unidadTexto = (u, n) => (u === "m" ? "m" : u === "par" ? (n === 1 ? "par" : "pares") : u === "rollo" ? (n === 1 ? "rollo" : "rollos") : n === 1 ? "u." : "u.");
const num = (n) => Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 });

/** Tarjeta horizontal de un producto (mismo estilo que los borradores que ya se usan). */
function tarjetaHtml({ item, calculo }, descuentoPct, frase) {
  const p = item.producto;
  const caja = (t) => `<div style="border:1px solid #ea580c;background:#fff7ed;color:#9a3412;font-weight:bold;font-size:13px;text-align:center;padding:6px 4px;margin-top:6px;border-radius:6px;">${t}</div>`;
  const imgs = [p.foto_tecnica, p.foto_catalogo].filter((u) => /^https?:\/\//.test(String(u || "")));
  const imgHtml = imgs.length
    ? `<table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:6px;"><tr>${imgs.map((u) => `<td width="${Math.floor(100 / imgs.length)}%" align="center" valign="middle"><img src="${esc(u)}" width="100%" style="max-height:200px;height:auto;object-fit:contain;border-radius:4px;" alt="${esc(p.nombre)}" /></td>`).join("")}</tr></table>`
    : "";
  const medidas = p.medidas ? `<div style="font-size:12px;color:#334155;"><b>Medidas:</b> ${esc(p.medidas)}</div>` : "";
  const desc = frase || String(p.descripcion || "").split(/(?<=\.)\s/)[0] || "";
  let precios;
  if (calculo.lista === null) {
    precios = calculo.variantes.length
      ? caja(`Precios según variante: ${calculo.variantes.map((v) => `${esc(v.etiqueta || "")} ${pesos(v.valor)}`).join(" · ")} más IVA`)
      : caja("Precio a confirmar");
  } else {
    const filas = [caja(`Lista: ${pesos(calculo.lista)} más IVA${calculo.etiqueta ? ` (${esc(calculo.etiqueta)})` : ""}`)];
    if (descuentoPct) filas.push(caja(`Precio c/Desc. (${num(descuentoPct)}%): ${pesos(calculo.conDescuento)} más IVA`));
    filas.push(caja(calculo.total !== null ? `Total (${num(calculo.cantidad)} ${unidadTexto(item.unidad, calculo.cantidad)}): ${pesos(calculo.total)} más IVA` : "Total a confirmar"));
    precios = filas.join("");
  }
  return `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px;font-family:Arial,Helvetica,sans-serif;">${imgHtml}<div style="text-align:center;font-size:14px;font-weight:bold;color:#0f172a;">${esc(p.nombre)}</div><div style="text-align:center;font-size:12px;color:#334155;"><b>Cód:</b> ${esc(p.codigo)}</div>${medidas ? `<div style="text-align:center;">${medidas}</div>` : ""}${desc ? `<div style="text-align:center;font-size:12px;color:#475569;margin-top:4px;">${textoHtml(desc)}</div>` : ""}${precios}</div>`;
}

/** Arma el mail completo. `redaccion`: { saludo, por_producto, cierre, condiciones }. */
function armarHtml({ calculo, redaccion }) {
  const por = redaccion.por_producto || {};
  const tarjetas = calculo.lineas.map((l) => tarjetaHtml(l, calculo.descuentoPct, typeof por[l.item.producto.id] === "string" ? por[l.item.producto.id].slice(0, 280) : ""));
  const porFila = Math.min(3, Math.max(1, tarjetas.length));
  const filas = [];
  for (let i = 0; i < tarjetas.length; i += porFila) filas.push(tarjetas.slice(i, i + porFila));
  const ancho = Math.floor(100 / porFila);
  const tabla = filas.length
    ? `<table width="100%" cellspacing="8" cellpadding="0" style="border-collapse:separate;margin:8px 0;">${filas.map((f) => `<tr>${f.map((t) => `<td width="${ancho}%" valign="top">${t}</td>`).join("")}${"<td></td>".repeat(porFila - f.length)}</tr>`).join("")}</table>`
    : "";
  const conds = (Array.isArray(redaccion.condiciones) ? redaccion.condiciones : []).filter((c) => c && c.texto).slice(0, 6);
  const condHtml = conds.length
    ? `<div style="border-left:4px solid #ea580c;padding:8px 14px;margin:12px 0;font-size:13px;color:#0f172a;"><div style="color:#ea580c;font-weight:bold;margin-bottom:4px;">Información Importante para su Compra:</div>${conds.map((c) => `<div>• <b>${esc(c.titulo || "")}${c.titulo ? ":" : ""}</b> ${textoHtml(c.texto)}</div>`).join("")}</div>`
    : "";
  const lista = (v, max, largo) => (Array.isArray(v) ? v : []).map((x) => String(x || "").trim()).filter(Boolean).slice(0, max).map((x) => x.slice(0, largo));
  let pasos = lista(redaccion.proximos_pasos, 5, 260);
  const datos = lista(redaccion.datos_a_confirmar, 6, 200);
  let cierre = String(redaccion.cierre || "").trim();
  // Respaldo: si la IA devolvió todo en un solo bloque ("cierre" largo), se separa en oraciones para que no quede un muro de texto.
  if (!pasos.length && cierre.length > 160) {
    const frases = cierre.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
    pasos = frases.slice(0, Math.max(1, frases.length - 1)).slice(0, 5);
    cierre = frases.length > 1 ? frases[frases.length - 1] : "";
  }
  const pasosHtml = pasos.length
    ? `<div style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px;padding:12px 14px;margin:14px 0;"><div style="font-size:14px;font-weight:bold;color:#0f172a;margin-bottom:8px;">Próximos pasos</div><table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${pasos.map((t, i) => `<tr><td width="30" valign="top" style="padding:4px 0;"><div style="width:22px;height:22px;line-height:22px;border-radius:11px;background:#ea580c;color:#ffffff;font-size:12px;font-weight:bold;text-align:center;">${i + 1}</div></td><td valign="top" style="padding:4px 0 4px 6px;font-size:13.5px;color:#0f172a;line-height:1.45;">${textoHtml(t)}</td></tr>`).join("")}</table></div>`
    : "";
  const datosHtml = datos.length
    ? `<div style="border:1px dashed #cbd5e1;border-radius:10px;padding:12px 14px;margin:14px 0;"><div style="font-size:14px;font-weight:bold;color:#0f172a;margin-bottom:6px;">Para avanzar necesitamos que nos confirme</div>${datos.map((t) => `<div style="font-size:13.5px;color:#0f172a;line-height:1.45;padding:2px 0;">&#9744;&nbsp; ${textoHtml(t)}</div>`).join("")}</div>`
    : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a;line-height:1.55;">` +
    `<p style="margin:0 0 10px 0;">${textoHtml(redaccion.saludo || "")}</p>${tabla}` +
    pasosHtml +
    datosHtml +
    condHtml +
    (cierre ? `<p style="margin:12px 0 0 0;">${textoHtml(cierre)}</p>` : "") +
    `</div>`;
}

function promptPedido({ reglas, indice, mailCliente, texto }) {
  return `Sos el asistente comercial de Conoflex Argentina (fábrica de productos de señalización vial). Leé la consulta del cliente (y las fotos, si hay) y decidí QUÉ productos del catálogo corresponden y cuántos. Todavía NO redactes el mail.

REGLAS Y POLÍTICAS COMERCIALES (prioridad máxima):
${reglas || "(sin reglas cargadas)"}

CATÁLOGO (id | código | nombre | categoría | medidas | usos):
${indice}

CONSULTA DEL CLIENTE (${mailCliente}):
"""
${texto}
"""

Devolvé SOLO un JSON con esta forma:
{
  "pide_lista_precios": true|false,
  "descuento_pct": null,
  "observaciones": [{"tipo": "VACIO"|"CARACTERISTICA"|"PREGUNTA"|"MEJORA", "titulo": "frase corta", "detalle": "qué falta definir", "evidencia": "frase textual del cliente"}],
  "items": [{"id": id del catálogo, "cantidad": número|null, "unidad": "u"|"m"|"par"|"rollo"|null, "variante": texto|null, "motivo": "por qué este producto", "correspondencia": "si mandó foto o nombró otra marca: qué se ve y por qué equivale; si no, null"}],
  "sin_equivalente": [{"pedido": "lo que pidió", "detalle": "por qué no hay"}],
  "preguntas_al_cliente": ["datos que faltan para cotizar bien"]
}
Reglas:
- Usá SOLO ids que figuren en el catálogo de arriba. Nunca inventes productos.
- "descuento_pct": dejalo siempre en null: el descuento lo define la persona del equipo antes de armar el borrador, no vos.
- "observaciones": ayudan al equipo a entrenarte. Anotá (máximo 4, solo si de verdad aplica) lo que el cliente pidió o preguntó y que NO está definido en las reglas comerciales ni en el catálogo: "VACIO" = política o dato que falta (plazo de entrega, formas de pago, instalación, certificaciones, mínimos de compra); "CARACTERISTICA" = una característica que el cliente pide para el producto (color, material, peso, reflectivo, medida) y que el catálogo no confirma; "PREGUNTA" = una duda del cliente que seguramente se repite y conviene tener respondida; "MEJORA" = algo que haría las respuestas más acertadas (un producto que falta, un dato a agregar a una ficha). "titulo" = frase corta y genérica (sin nombres de clientes), "evidencia" = cita textual breve del mail. Si no hay nada para anotar, devolvé [].
- Si el cliente no precisa un modelo (ej: "quiero comprar conos"), proponé 2 o 3 alternativas de esa categoría según las reglas y los usos del catálogo (máximo ${MAX_ITEMS} ítems en total).
- "cantidad" solo si el cliente la dijo ("35 postes" → 35; "70m de cadena" → 70 con unidad "m"). Si no la dijo, null.
- "variante": si el cliente aclaró una variante (color, tipo de fijación, etc.) ponela; si no, null.
- Si pide algo que Conoflex no vende o no figura en el catálogo, ponelo en "sin_equivalente".`;
}

function promptRedaccion({ reglas, cliente, texto, calculo, adjuntaLista, pedido }) {
  const fichas = calculo.lineas.map((l) => {
    const p = l.item.producto;
    const c = l.calculo;
    return {
      id: p.id, codigo: p.codigo, nombre: p.nombre, medidas: p.medidas || null,
      descripcion: p.descripcion || null,
      usos_recomendados: String(p.usos_recomendados || p.aplicacion || "").split(/\s*\|\s*/).filter(Boolean).slice(0, 12),
      advertencias: p.advertencias || null,
      pedido_cliente: { cantidad: l.item.cantidad, unidad: l.item.unidad, motivo: l.item.motivo, correspondencia: l.item.correspondencia },
      precio: { lista: c.lista, con_descuento: c.conDescuento, total: c.total, a_confirmar: c.lista === null || c.total === null },
    };
  });
  return `Redactá la respuesta comercial de Conoflex Argentina a este cliente. El sistema ya eligió los productos y calculó los precios; vos escribís los textos.

REGLAS Y POLÍTICAS COMERCIALES (prioridad máxima):
${reglas || "(sin reglas cargadas)"}

CLIENTE: ${cliente}
CONSULTA DEL CLIENTE:
"""
${texto}
"""

PRODUCTOS ELEGIDOS (con su ficha y precios YA calculados):
${JSON.stringify(fichas, null, 1)}

DESCUENTO APLICADO: ${calculo.descuentoPct ? `${calculo.descuentoPct}%` : "ninguno"}
${adjuntaLista ? "SE ADJUNTA AL MAIL la lista de precios completa en PDF." : "NO se adjunta la lista de precios en PDF: no digas que la adjuntás."}
${pedido.sin_equivalente.length ? `NO HAY EQUIVALENTE PARA: ${pedido.sin_equivalente.map((x) => `${x.pedido} (${x.detalle})`).join("; ")}. Decíselo con honestidad y ofrecé consultarlo.` : ""}
${calculo.avisos.length ? `COSAS A CONFIRMAR (no las des por cerradas en el mail, pedí o aclará lo que falte): ${calculo.avisos.join(" | ")}` : ""}
${pedido.preguntas_al_cliente.length ? `DATOS QUE FALTAN DEL CLIENTE: ${pedido.preguntas_al_cliente.join(" | ")}` : ""}

Devolvé SOLO un JSON:
{
  "saludo": "apertura natural y cálida de 1 a 3 oraciones: agradecé la consulta, nombrá al cliente si se sabe y presentá la propuesta",
  "por_producto": {"<id del producto>": "1 o 2 oraciones de venta, adaptadas a lo que el cliente necesita, usando SOLO los usos de la ficha"},
  "proximos_pasos": ["entre 2 y 4 pasos MUY breves, cada uno una sola oración en infinitivo o imperativo cordial (ej: 'Confirmar el modelo elegido y la cantidad de unidades.', 'Indicarnos Razón Social y CUIT para facturar.', 'Coordinamos la reserva de stock y el despacho sin cargo a CABA y GBA.')"],
  "datos_a_confirmar": ["solo las preguntas concretas que faltan del cliente, una por ítem y cortas (ej: 'Preferencia de altura o peso', 'Uso en interiores o exteriores'); [] si no falta nada"],
  "cierre": "UNA sola oración final cordial, de menos de 140 caracteres (ej: 'Quedamos a su disposición para cualquier consulta.')",
  "condiciones": [{"titulo": "Impuestos", "texto": "..."}, {"titulo": "Descuentos", "texto": "..."}, {"titulo": "Logística y Envíos", "texto": "..."}]
}
Reglas de redacción:
- NO escribas precios, totales ni porcentajes de descuento que no estén en los datos de arriba: los números los coloca el sistema en las tarjetas.
- Respetá las "advertencias" de cada ficha: si el uso que pide el cliente no es el recomendado, decilo con tacto y sugerí lo adecuado.
- Si el cliente mandó foto o nombró otra marca, explicá brevemente la correspondencia ("En base a la fotografía, nuestro modelo equivalente es…").
- Las "condiciones" salen de las reglas comerciales (IVA, descuentos por cantidad, logística, plazos); no inventes condiciones que las reglas no mencionen. Si no hay ninguna, devolvé [].
- FORMATO: nada de párrafos largos. El saludo máximo 3 oraciones; los próximos pasos y los datos a confirmar van en listas cortas (no repitas lo mismo en ambos); el cierre es una sola frase. Cada ítem de lista, una idea. Si hay precios sujetos a confirmación, decilo en UN paso, no en un párrafo aparte.
- Tono técnico, seguro y persuasivo. NUNCA uses corchetes ni comodines como "[Tu Nombre]" ni firmes con un nombre inventado.
- Español rioplatense, sin markdown salvo **negrita** para resaltar.`;
}

/**
 * Pipeline completo. `deps`: { ai, modelo, productos, reglas, mailCliente, nombreCliente, texto, imagenes (inlineData), adjuntaLista, descuentoConfig }
 * Devuelve { html, revision } o tira un error si la IA no devolvió algo utilizable (el llamador puede caer al método anterior).
 */
async function generarCotizacion(deps) {
  const { ai, modelo, productos, reglas, mailCliente, nombreCliente, texto, imagenes = [], adjuntaLista = false, descuentoConfig = null } = deps;
  if (descuentoConfig !== null && !(Number.isFinite(descuentoConfig) && descuentoConfig >= 0 && descuentoConfig <= 60)) throw new Error("Descuento inválido.");
  const r1 = await ai.models.generateContent({
    model: modelo,
    contents: [...imagenes, promptPedido({ reglas, indice: indiceCatalogo(productos), mailCliente, texto })],
    config: { responseMimeType: "application/json", temperature: 0.1 },
  });
  const pedido = validarPedido(parsearJson(r1.text), productos);
  if (!pedido) throw new Error("La IA no devolvió un pedido legible.");
  if (!pedido.items.length && !pedido.sin_equivalente.length) throw new Error("La IA no encontró productos para esta consulta.");

  const calculo = calcularPedido(pedido, descuentoConfig);
  const adjunta = !!adjuntaLista && pedido.pide_lista_precios;
  const r2 = await ai.models.generateContent({
    model: modelo,
    contents: [promptRedaccion({ reglas, cliente: nombreCliente || mailCliente, texto, calculo, adjuntaLista: adjunta, pedido })],
    config: { responseMimeType: "application/json", temperature: 0.4 },
  });
  const redaccion = parsearJson(r2.text);
  if (!redaccion || typeof redaccion.saludo !== "string") throw new Error("La IA no devolvió una redacción legible.");

  const html = armarHtml({ calculo, redaccion });
  const revision = {
    descuento_pct: calculo.descuentoPct,
    descuento_definido: descuentoConfig !== null,
    observaciones: pedido.observaciones,
    adjunta_lista: adjunta,
    pide_lista_precios: pedido.pide_lista_precios,
    avisos: [
      ...calculo.avisos,
      ...(pedido.pide_lista_precios && !adjunta ? ["El cliente pide la lista de precios: adjuntala a mano (no hay una lista PDF cargada en el sistema)."] : []),
      ...pedido.sin_equivalente.map((x) => `Sin equivalente en el catálogo: ${x.pedido}.`),
      ...pedido.preguntas_al_cliente.map((q) => `Falta preguntarle al cliente: ${q}`),
    ],
    lineas: calculo.lineas.map((l) => ({ id: l.item.producto.id, codigo: l.item.producto.codigo, nombre: l.item.producto.nombre, cantidad: l.item.cantidad, unidad: l.item.unidad, lista: l.calculo.lista, con_descuento: l.calculo.conDescuento, total: l.calculo.total })),
  };
  return { html, revision };
}

module.exports = { indiceCatalogo, parsearJson, validarPedido, calcularItem, calcularPedido, tarjetaHtml, armarHtml, promptPedido, promptRedaccion, generarCotizacion, pesos, normalizarCodigo, normalizarObservaciones };
