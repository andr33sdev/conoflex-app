"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const si = require("../solicitudesInternas");

test("solo el depósito 37 entra en el circuito firmado", () => {
  assert.equal(si.esDeposito37("37"), true);
  assert.equal(si.esDeposito37("33"), false);
  assert.equal(si.esDeposito37(null), false);
  assert.equal(si.requiereFirmaSolicitud("37"), true);
  assert.equal(si.requiereFirmaSolicitud("26"), false);
});

test("estado inicial: caliente queda pendiente de autorización", () => {
  assert.equal(si.estadoInicial({ caliente: true }), "PENDIENTE_AUTORIZACION");
  assert.equal(si.estadoInicial({ caliente: false }), "SOLICITADO");
});

test("token de autorización es único y hexadecimal", () => {
  const a = si.nuevoToken();
  const b = si.nuevoToken();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, b);
});

test("texto de autorización incluye producto, cantidad, motivo y link", () => {
  const t = si.textoAutorizacion({ cantidad: 5, producto: "Base Cono", motivoCaliente: "reservado para licitación", solicitante: "Juan", link: "https://app/x" });
  assert.match(t, /Base Cono/);
  assert.match(t, /5/);
  assert.match(t, /reservado para licitación/);
  assert.match(t, /Juan/);
  assert.match(t, /https:\/\/app\/x/);
});

test("accesos de autorización: link y un wa.me por autorizador", () => {
  const { link, whatsapp } = si.accesosAutorizacion({ baseUrl: "https://app.conoflex.com/", token: "abc123", cantidad: 2, producto: "Cono", motivoCaliente: "stock crítico", solicitante: "Ana" });
  assert.equal(link, "https://app.conoflex.com/?autorizar_interna=abc123");
  assert.equal(whatsapp.length, si.AUTORIZADORES.length);
  assert.ok(whatsapp.length >= 1);
  for (const w of whatsapp) {
    assert.match(w.url, /^https:\/\/wa\.me\/\d+\?text=/);
    assert.match(w.url, /autorizar_interna%3Dabc123/);
  }
});
