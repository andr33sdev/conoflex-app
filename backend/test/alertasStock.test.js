"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { revisarStockMinimoSemis } = require("../alertasStock");
const { esAlertaIA } = require("../configApp");

// DB falsa mínima: responde la config y los semielaborados, y registra los UPDATE.
function fakeDb({ alertasOn = true, semis = [] }) {
  const updates = [];
  return {
    updates,
    async query(sql, params) {
      if (/FROM app_config/.test(sql)) return [alertasOn ? [{ clave: "alertas_stock_min_semi", valor: "1" }] : [{ clave: "alertas_stock_min_semi", valor: "0" }]];
      if (/FROM semielaborados WHERE stock_minimo/.test(sql)) return [semis];
      if (/UPDATE semielaborados SET stock_min_avisado/.test(sql)) { updates.push({ sql, params }); return [{ affectedRows: 1 }]; }
      return [[]];
    },
  };
}

test("esAlertaIA reconoce solo las de agentes (AGENTE_/MAIL_)", () => {
  assert.equal(esAlertaIA("AGENTE_STOCK"), true);
  assert.equal(esAlertaIA("MAIL_BORRADOR"), true);
  assert.equal(esAlertaIA("STOCK_MINIMO"), false);
  assert.equal(esAlertaIA("SOLICITUD_INTERNA"), false);
  assert.equal(esAlertaIA("AUTORIZACION_INTERNA"), false);
});

test("avisa cuando el stock 33 está en o por debajo del mínimo (una sola vez)", async () => {
  const notifs = [];
  const db = fakeDb({ semis: [
    { id: 1, codigo: "A", nombre: "Semi A", stock_33: 5, stock_minimo: 10, stock_min_avisado: 0 }, // bajo, no avisado → avisa
    { id: 2, codigo: "B", nombre: "Semi B", stock_33: 50, stock_minimo: 10, stock_min_avisado: 0 }, // ok → nada
    { id: 3, codigo: "C", nombre: "Semi C", stock_33: 3, stock_minimo: 10, stock_min_avisado: 1 }, // bajo, ya avisado → nada
  ] });
  const r = await revisarStockMinimoSemis(db, { notificar: async (_db, n) => notifs.push(n) });
  assert.equal(r.avisados, 1);
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].tipo, "STOCK_MINIMO");
  assert.match(notifs[0].titulo, /Semi A/);
});

test("reabre el aviso cuando el stock se recupera", async () => {
  const notifs = [];
  const db = fakeDb({ semis: [
    { id: 4, codigo: "D", nombre: "Semi D", stock_33: 40, stock_minimo: 10, stock_min_avisado: 1 }, // recuperado → resetea
  ] });
  const r = await revisarStockMinimoSemis(db, { notificar: async (_db, n) => notifs.push(n) });
  assert.equal(r.recuperados, 1);
  assert.equal(notifs.length, 0);
  assert.ok(db.updates.some((u) => /stock_min_avisado = 0/.test(u.sql)));
});

test("con el interruptor apagado no avisa nada", async () => {
  const notifs = [];
  const db = fakeDb({ alertasOn: false, semis: [{ id: 1, codigo: "A", nombre: "A", stock_33: 1, stock_minimo: 10, stock_min_avisado: 0 }] });
  const r = await revisarStockMinimoSemis(db, { notificar: async (_db, n) => notifs.push(n) });
  assert.equal(r.apagado, true);
  assert.equal(notifs.length, 0);
});
