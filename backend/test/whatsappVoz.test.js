"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const v = require("../whatsappVoz");
const { tieneLlamadas } = require("../whatsapp");

test("detecta avisos de llamadas y no confunde mensajes", () => {
  assert.ok(tieneLlamadas({ entry: [{ changes: [{ field: "calls", value: { calls: [{ id: "wacid.1", event: "connect" }] } }] }] }));
  assert.ok(!tieneLlamadas({ entry: [{ changes: [{ field: "messages", value: { messages: [] } }] }] }));
  assert.ok(!tieneLlamadas({}));
});

test("precios para la voz: solo códigos con precio único", () => {
  const p = v.preciosVoz([
    { codigo: "1025", nombre: "Cono", precio_lista: "$10.000,50" },
    { codigo: "2400", nombre: "Reductor", precio_lista: "SIN FIJACIÓN $1.000 | ASFALTO $2.000" },
    { codigo: "", nombre: "x", precio_lista: "$5" },
  ]);
  assert.deepEqual(p, [{ codigo: "1025", nombre: "Cono", unitario: 10000.5 }]);
});

test("transcripción de la llamada para la bandeja", () => {
  const t = v.transcripcionTexto({ duracion: 151, transcripcion: [{ rol: "cliente", texto: "hola" }, { rol: "bot", texto: "¡Hola! Soy Aldana" }, { rol: "cliente", texto: "  " }] });
  assert.equal(t, "📞 Llamada (2:31)\nCliente: hola\nAldana: ¡Hola! Soy Aldana");
  assert.equal(v.transcripcionTexto({}), "📞 Llamada\n(sin transcripción)");
});

test("instrucciones de voz: hablado, con herramientas y charla previa", () => {
  const i = v.instruccionesVoz({ reglasComerciales: "Precios más IVA", reglasWhatsapp: "", notas: "", correcciones: "", catalogo: "1025 | Cono", nombreCliente: "Juan", charlaPrevia: "Cliente: precio conos" });
  for (const x of ["calcular_presupuesto", "enviar_por_whatsapp", "derivar_a_persona", "cortar_llamada", "Juan", "Cliente: precio conos", "1025 | Cono", "Precios más IVA"]) assert.ok(i.includes(x), x);
});

test("rutas de voz: solo desde el mismo servidor y con el secreto", () => {
  const antes = process.env.VOZ_SECRETO;
  process.env.VOZ_SECRETO = "s".repeat(32);
  const req = (ip, secreto) => ({ socket: { remoteAddress: ip }, headers: { "x-voz-secreto": secreto } });
  assert.ok(v.esLocalConSecreto(req("127.0.0.1", "s".repeat(32))));
  assert.ok(v.esLocalConSecreto(req("::ffff:127.0.0.1", "s".repeat(32))));
  assert.ok(!v.esLocalConSecreto(req("8.8.8.8", "s".repeat(32))));
  assert.ok(!v.esLocalConSecreto(req("127.0.0.1", "x".repeat(32))));
  assert.ok(!v.esLocalConSecreto(req("127.0.0.1", undefined)));
  process.env.VOZ_SECRETO = "corto";
  assert.ok(!v.esLocalConSecreto(req("127.0.0.1", "corto")));
  process.env.VOZ_SECRETO = antes;
});

test("voz: saca el formato HTML de las reglas y pide acento rioplatense", () => {
  const reglas = "ROL: asesora\n====\n<div style=\"x\">Atn. sr/a.</div>\n// comentario\n`\n- Precios más IVA\n   <b>Lista</b>";
  assert.equal(v.sinFormatoEscrito(reglas), "ROL: asesora\n- Precios más IVA");
  const i = v.instruccionesVoz({ reglasComerciales: reglas, catalogo: "1025 | Cono" });
  assert.ok(i.includes("rioplatense") && i.includes("tránsito"));
  assert.ok(!i.includes("<div"));
});
