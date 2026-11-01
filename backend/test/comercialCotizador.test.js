"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../comercial/cotizador");

const productos = [
  { id: 1, codigo: "1570L-2R NA", nombre: "KING CONE LIGHT PVC", categoria: "Conos", medidas: "70cm | 1,7kg", precio_lista: "$35.210,07", descripcion: "Cono flexible con memoria. Ideal para vía pública.", usos_recomendados: "Vía pública: señalizar obras | Logística: sectores", advertencias: "", foto_tecnica: "https://x.test/t.png", foto_catalogo: "https://x.test/c.png" },
  { id: 2, codigo: "2071LE-2R", nombre: "ECONO", categoria: "Conos", medidas: "70cm", precio_lista: "$24.206,74", descripcion: "", usos_recomendados: "", advertencias: "" },
  { id: 3, codigo: "1570B-2R NA", nombre: "KING CONE PVC", categoria: "Conos", medidas: "70cm", precio_lista: "$55.852,23", descripcion: "", usos_recomendados: "", advertencias: "" },
  { id: 4, codigo: "2853-3R", nombre: "COLUMNA CON BASE", categoria: "Postes", medidas: "110 cm", precio_lista: "$67.319,10", descripcion: "", usos_recomendados: "", advertencias: "" },
  { id: 5, codigo: "CADENA 103", nombre: "CADENA PLASTICA", categoria: "Cadenas", medidas: "Eslabón 1,8 x 2,5cm", precio_lista: "$10.014,95", descripcion: "", usos_recomendados: "", advertencias: "" },
  { id: 6, codigo: "MP2014 NE", nombre: "ATENUADOR", categoria: "Lomos", medidas: "1 m", precio_lista: "SIN FIJACIÓN $34.303,34 | HORMIGÓN - H / ASFALTO - A $55.430,57", descripcion: "", usos_recomendados: "", advertencias: "" },
  { id: 7, codigo: "XX", nombre: "SIN PRECIO", categoria: "Otros", medidas: "", precio_lista: "", descripcion: "", usos_recomendados: "", advertencias: "" },
];

test("validarPedido: descarta ids inventados y repetidos, limpia cantidades y descuento", () => {
  const p = C.validarPedido({
    pide_lista_precios: true, descuento_pct: 35,
    items: [{ id: 1, cantidad: "10", unidad: "u" }, { id: 1 }, { id: 99 }, { id: 4, cantidad: -3, unidad: "x" }],
  }, productos);
  assert.equal(p.items.length, 2);
  assert.equal(p.items[0].cantidad, 10);
  assert.equal(p.items[1].cantidad, null);
  assert.equal(p.items[1].unidad, null);
  assert.equal(p.descuento_pct, 35);
  assert.equal(C.validarPedido({ descuento_pct: 95, items: [] }, productos).descuento_pct, null);
  assert.equal(C.validarPedido(null, productos), null);
});

test("cálculo: coincide con los precios de un borrador real (35% sobre lista)", () => {
  const ped = C.validarPedido({ items: [{ id: 1 }, { id: 2 }, { id: 3 }], descuento_pct: 35 }, productos);
  const c = C.calcularPedido(ped);
  assert.deepEqual(c.lineas.map((l) => l.calculo.conDescuento), [22886.55, 15734.38, 36303.95]);
  assert.deepEqual(c.lineas.map((l) => l.calculo.total), [22886.55, 15734.38, 36303.95]);
  assert.equal(c.avisos.length, 0);
});

test("cálculo: total por cantidad exacto y descuento configurado que pisa al de la IA", () => {
  const ped = C.validarPedido({ items: [{ id: 4, cantidad: 35, unidad: "u" }], descuento_pct: 35 }, productos);
  // el precio con descuento se redondea al centavo y recién después se multiplica (es el que ve el cliente en la tarjeta)
  assert.equal(C.calcularPedido(ped).lineas[0].calculo.conDescuento, 43757.42);
  assert.equal(C.calcularPedido(ped).lineas[0].calculo.total, 1531509.7);
  const sinDesc = C.calcularPedido(C.validarPedido({ items: [{ id: 4, cantidad: 35, unidad: "u" }] }, productos));
  assert.equal(sinDesc.lineas[0].calculo.total, 2356168.5);
  const config = C.calcularPedido(ped, 10);
  assert.equal(config.descuentoPct, 10);
  assert.equal(config.lineas[0].calculo.conDescuento, 60587.19);
});

test("cálculo: metros sin unidad en la lista, variantes sin elegir y producto sin precio no inventan nada", () => {
  const ped = C.validarPedido({ items: [{ id: 5, cantidad: 70, unidad: "m" }, { id: 6, cantidad: 10 }, { id: 7 }] }, productos);
  const c = C.calcularPedido(ped);
  assert.equal(c.lineas[0].calculo.lista, 10014.95);
  assert.equal(c.lineas[0].calculo.total, null);
  assert.equal(c.lineas[1].calculo.lista, null);
  assert.equal(c.lineas[1].calculo.variantes.length, 2);
  assert.equal(c.lineas[2].calculo.lista, null);
  assert.equal(c.avisos.length, 3);
  const conVariante = C.calcularPedido(C.validarPedido({ items: [{ id: 6, cantidad: 2, variante: "hormigón" }] }, productos));
  assert.equal(conVariante.lineas[0].calculo.lista, 55430.57);
  assert.equal(conVariante.lineas[0].calculo.total, 110861.14);
});

test("HTML: tarjetas con precios del servidor, texto del modelo escapado", () => {
  const ped = C.validarPedido({ items: [{ id: 1, cantidad: 2 }, { id: 6 }], descuento_pct: 35 }, productos);
  const calculo = C.calcularPedido(ped);
  const html = C.armarHtml({ calculo, redaccion: { saludo: "Hola <script>alert(1)</script> **Joaquín**", por_producto: { 1: "Ideal para obras." }, cierre: "Confirmen razón social.", condiciones: [{ titulo: "Impuestos", texto: "Más IVA" }] } });
  assert.match(html, /Lista: \$35\.210,07 más IVA/);
  assert.match(html, /Precio c\/Desc\. \(35%\): \$22\.886,55 más IVA/);
  assert.match(html, /Total \(2 u\.\): \$45\.773,10 más IVA/);
  assert.match(html, /Precios según variante/);
  assert.ok(!html.includes("<script>"));
  assert.match(html, /<b>Joaquín<\/b>/);
  assert.match(html, /Información Importante para su Compra/);
  assert.match(html, /src="https:\/\/x\.test\/t\.png"/);
});

test("pipeline completo con IA simulada", async () => {
  const respuestas = [
    JSON.stringify({ pide_lista_precios: true, descuento_pct: 35, items: [{ id: 1 }, { id: 2 }], sin_equivalente: [], preguntas_al_cliente: ["¿Cantidad?"] }),
    JSON.stringify({ saludo: "Estimado Joaquín, gracias por su consulta.", por_producto: { 1: "Flexible con memoria." }, cierre: "Quedamos atentos.", condiciones: [] }),
  ];
  const llamadas = [];
  const ai = { models: { generateContent: async (a) => { llamadas.push(a); return { text: respuestas.shift() }; } } };
  const r = await C.generarCotizacion({ ai, modelo: "m", productos, reglas: "Descuento 35%", mailCliente: "a@b.com", nombreCliente: "Joaquín", texto: "Lista de precios para conos", adjuntaLista: false });
  assert.equal(llamadas.length, 2);
  assert.match(llamadas[0].contents.at(-1), /1 \| 1570L-2R NA \| KING CONE LIGHT PVC/);
  assert.match(llamadas[1].contents[0], /"con_descuento": 22886.55/);
  assert.ok(r.revision.avisos.some((a) => /adjuntala a mano/.test(a)));
  assert.ok(r.revision.avisos.some((a) => /¿Cantidad\?/.test(a)));
  assert.equal(r.revision.lineas[0].con_descuento, 22886.55);
  const mala = { models: { generateContent: async () => ({ text: "no es json" }) } };
  await assert.rejects(C.generarCotizacion({ ai: mala, modelo: "m", productos, reglas: "", mailCliente: "a", texto: "x" }));
});

test("correo crudo: con adjunto es multipart y el asunto con acentos va codificado", () => {
  const { crearCorreoCrudo } = require("../comercial/correo");
  const dec = (rb) => Buffer.from(rb.message.raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  const con = dec(crearCorreoCrudo({ to: "a@b.com", asunto: "Cotización de conos", html: "<p>Hola ñandú</p>", threadId: "T1", adjunto: { nombre: "Lista.pdf", datos: Buffer.from("%PDF-1.4 hola") } }));
  assert.match(con, /Content-Type: multipart\/mixed; boundary="conoflex_/);
  assert.match(con, /Content-Disposition: attachment; filename="Lista\.pdf"/);
  assert.match(con, /Subject: =\?UTF-8\?B\?/);
  const sin = crearCorreoCrudo({ to: "a@b.com", asunto: "Re: Consulta", html: "<p>x</p>" });
  assert.match(dec(sin), /Subject: Re: Consulta\r\n/);
  assert.ok(!/multipart/.test(dec(sin)));
  assert.equal(crearCorreoCrudo({ to: "a", asunto: "b", html: "c", threadId: "T9" }).message.threadId, "T9");
});

test("lista PDF: solo acepta PDF", () => {
  const { esPdf } = require("../comercial/listaPdf");
  assert.ok(esPdf(Buffer.from("%PDF-1.7 contenido")));
  assert.ok(!esPdf(Buffer.from("MZ binario")));
});
