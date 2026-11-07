"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const w = require("../whatsapp");

test("firma de Meta: válida, inválida y faltante", () => {
  const cuerpo = Buffer.from('{"hola":1}');
  const firma = "sha256=" + crypto.createHmac("sha256", "secreto").update(cuerpo).digest("hex");
  assert.ok(w.firmaValida(cuerpo, firma, "secreto"));
  assert.ok(!w.firmaValida(cuerpo, firma, "otro"));
  assert.ok(!w.firmaValida(cuerpo, "sha256=abc", "secreto"));
  assert.ok(!w.firmaValida(null, firma, "secreto"));
  assert.ok(!w.firmaValida(cuerpo, undefined, "secreto"));
});

test("extrae mensajes del aviso de Meta e ignora estados de entrega", () => {
  const body = {
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ wa_id: "5491122334455", profile: { name: "Juan" } }],
              messages: [
                { id: "w1", from: "5491122334455", type: "text", text: { body: "precio cono 75" }, timestamp: "1" },
                { id: "w2", from: "5491122334455", type: "audio", audio: { id: "m1", mime_type: "audio/ogg" } },
                { id: "w3", from: "5491122334455", type: "image", image: { id: "m2", caption: "este" } },
              ],
            },
          },
          { value: { statuses: [{ id: "x", status: "delivered" }] } },
        ],
      },
    ],
  };
  const ms = w.extraerMensajes(body);
  assert.equal(ms.length, 3);
  assert.deepEqual([ms[0].texto, ms[0].nombre, ms[0].telefono], ["precio cono 75", "Juan", "5491122334455"]);
  assert.equal(ms[1].mediaId, "m1");
  assert.equal(ms[2].texto, "este");
  assert.equal(w.extraerMensajes({}).length, 0);
});

const productos = [
  { codigo: "1025", nombre: "Cono 75 cm", precio_lista: "$10.000,50", foto_catalogo: "http://66.97.34.163:3001/imagenes/cono.jpg" },
  { codigo: "2400-2R", nombre: "Reductor", precio_lista: "SIN FIJACIÓN $34.303,34 | HORMIGÓN - H / ASFALTO - A $55.430,57" },
  { codigo: "9999", nombre: "Sin precio", precio_lista: "Consultar" },
];

test("el servidor hace las cuentas; variantes y sin precio quedan afuera", () => {
  const c = w.calcularItems([{ codigo: "1025", cantidad: 3 }, { codigo: "2400-2R", cantidad: 2 }, { codigo: "9999", cantidad: 1 }, { codigo: "NOEXISTE", cantidad: 1 }, { codigo: "1025", cantidad: -1 }], productos);
  assert.equal(c.lineas.length, 1); // solo 1025: variantes, sin precio, inexistente y cantidad inválida quedan afuera
  assert.equal(c.lineas[0].subtotal, 30001.5);
  assert.equal(c.total, 30001.5);
  assert.equal(w.calcularItems([], productos), null);
  const t = w.textoCalculo(c, "más IVA");
  assert.match(t, /3 × Cono 75 cm/);
  assert.match(t, /\*Total: \$30\.001,50\* más IVA/);
});

test("pausa del bot y ventana de 24 h", () => {
  const ahora = new Date("2026-11-06T12:00:00Z");
  assert.ok(w.botPuedeResponder({ global: true, pausadoHasta: null }, ahora));
  assert.ok(!w.botPuedeResponder({ global: false, pausadoHasta: null }, ahora));
  assert.ok(!w.botPuedeResponder({ global: true, pausadoHasta: "2026-11-06T13:00:00Z" }, ahora));
  assert.ok(w.botPuedeResponder({ global: true, pausadoHasta: "2026-11-06T11:00:00Z" }, ahora));
  assert.ok(w.ventanaAbierta("2026-11-06T00:00:00Z", ahora));
  assert.ok(!w.ventanaAbierta("2026-11-05T11:00:00Z", ahora));
  assert.ok(!w.ventanaAbierta(null, ahora));
});

test("historial: junta mensajes seguidos y empieza por el cliente", () => {
  const h = w.historialContents([
    { direccion: "OUT", texto: "hola de antes" },
    { direccion: "IN", texto: "hola" },
    { direccion: "IN", texto: "precio?" },
    { direccion: "OUT", texto: "te paso" },
  ]);
  assert.equal(h.length, 2);
  assert.equal(h[0].role, "user");
  assert.equal(h[0].parts[0].text, "hola\nprecio?");
  assert.equal(h[1].role, "model");
});

test("salida de la IA: negrita de WhatsApp y campos seguros", () => {
  const s = w.normalizarSalida(w.parsearJson('```json\n{"respuesta":"El **cono** sale","fotos":["1025",2],"derivar":true}\n```'));
  assert.equal(s.respuesta, "El *cono* sale");
  assert.deepEqual(s.fotos, ["1025", "2"]);
  assert.equal(s.derivar, true);
  assert.equal(s.enviarLista, false);
  assert.equal(w.normalizarSalida({ respuesta: "  " }), null);
  assert.equal(w.normalizarSalida(null), null);
});

test("catálogo compacto y foto pública", () => {
  const t = w.catalogoTexto(productos);
  assert.equal(t.split("\n").length, 3);
  assert.match(t, /1025 \| Cono 75 cm \| precio: \$10\.000,50 \| tiene foto/);
  assert.equal(w.urlFotoPublica("http://66.97.34.163:3001/imagenes/cono 1.jpg"), "https://conoflex-app.vercel.app/imagenes/cono%201.jpg");
  assert.equal(w.urlFotoPublica(""), null);
});

test("instrucciones incluyen reglas, correcciones y catálogo", () => {
  const i = w.instrucciones({ reglasComerciales: "Precios más IVA", reglasWhatsapp: "Firmá como Equipo Conoflex", notas: "", correcciones: "Cliente: x\nRespuesta correcta: y", catalogo: "1025 | Cono", tieneLista: true });
  assert.match(i, /Precios más IVA/);
  assert.match(i, /Firmá como Equipo Conoflex/);
  assert.match(i, /CORRECCIONES DEL EQUIPO/);
  assert.match(i, /enviar_lista/);
});
