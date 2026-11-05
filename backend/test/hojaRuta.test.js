"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validarDespacho, cambiarEstado, editarDespacho, normalizarOp } = require("../hojaRuta");

const base = { op: "OP-1234", cliente: "Vial SA", fecha_despacho: "2026-11-10", tipo_entrega: "ENTREGA", direccion: "Calle 1", prioridad: 4 };

test("normaliza la OP y limpia los campos", () => {
  assert.equal(normalizarOp(" OP-1234 "), "1234");
  const d = validarDespacho({ ...base, contacto_nombre: " Ana ", contacto_telefono: "" });
  assert.equal(d.op, "1234");
  assert.equal(d.contacto_nombre, "Ana");
  assert.equal(d.contacto_telefono, null);
});

test("exige dirección, transporte y prioridad válida", () => {
  assert.throws(() => validarDespacho({ ...base, direccion: "" }), /dirección/);
  assert.throws(() => validarDespacho({ ...base, tipo_entrega: "TRANSPORTE", direccion: "X" }), /transporte/);
  assert.throws(() => validarDespacho({ ...base, tipo_entrega: "TRANSPORTE", transporte_nombre: "T", direccion: "" }), /dirección del transporte/);
  assert.throws(() => validarDespacho({ ...base, prioridad: 6 }), /1 a 5/);
  assert.throws(() => validarDespacho({ ...base, fecha_despacho: "10/11" }), /día/);
  assert.throws(() => validarDespacho({ ...base, op: "" }), /OP/);
  const r = validarDespacho({ ...base, tipo_entrega: "RETIRA", direccion: "" });
  assert.equal(r.direccion, null);
});

function dbFalsa(fila) {
  const llamadas = [];
  return {
    llamadas,
    async query(sql, p) {
      llamadas.push(sql);
      if (/^SELECT/.test(sql)) return [[{ ...fila }]];
      return [{}];
    },
  };
}
const fila = { id: 1, estado: "PROGRAMADO", creado_por_id: 7, creado_por: "Vero", articulos: null };

test("solo quien cargó o un admin cancela y edita; cualquiera marca despachado", async () => {
  await assert.rejects(cambiarEstado(dbFalsa(fila), { id: 1, estado: "CANCELADO", motivo: "x", usuario: { id: 9, rol: "COMERCIAL" } }), /Vero/);
  await assert.rejects(editarDespacho(dbFalsa(fila), { id: 1, datos: base, usuario: { id: 9, rol: "COMERCIAL" } }), /Vero/);
  await assert.rejects(cambiarEstado(dbFalsa(fila), { id: 1, estado: "CANCELADO", motivo: "", usuario: { id: 7, rol: "COMERCIAL" } }), /por qué/);
  const db = dbFalsa(fila);
  await cambiarEstado(db, { id: 1, estado: "DESPACHADO", usuario: { id: 9, nombre: "Depo", rol: "DEPOSITO" } });
  assert.ok(db.llamadas.some((s) => /estado='DESPACHADO'/.test(s)));
  const adm = dbFalsa(fila);
  await cambiarEstado(adm, { id: 1, estado: "CANCELADO", motivo: "cliente pospuso", usuario: { id: 1, rol: "ADMIN" } });
  assert.ok(adm.llamadas.some((s) => /estado='CANCELADO'/.test(s)));
});

test("un despacho ya hecho no se edita", async () => {
  await assert.rejects(editarDespacho(dbFalsa({ ...fila, estado: "DESPACHADO" }), { id: 1, datos: base, usuario: { id: 7 } }), /reabrilo/);
});
