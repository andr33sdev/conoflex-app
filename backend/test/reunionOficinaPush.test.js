"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { ahoraAR, tocaReunion, hacerReunion } = require("../agentes/reunion");
const { leerConsultas, rutearPorPalabras } = require("../agentes/oficina");
const { asegurarPush, enviarPush, armarPayload } = require("../push");
const { crearNotificacion, alCrearNotificacion } = require("../notificaciones");

// 2026-10-30 es viernes; Argentina es UTC-3
const en = (iso) => new Date(iso);

test("la reunión toca de lunes a viernes entre las 08:00 y el mediodía", () => {
  assert.equal(tocaReunion(en("2026-10-30T11:00:00Z")), true); // vie 08:00
  assert.equal(tocaReunion(en("2026-10-30T10:59:00Z")), false); // vie 07:59
  assert.equal(tocaReunion(en("2026-10-30T15:30:00Z")), false); // vie 12:30
  assert.equal(tocaReunion(en("2026-10-31T11:30:00Z")), false); // sábado
  assert.equal(tocaReunion(en("2026-11-01T11:30:00Z")), false); // domingo
  assert.equal(tocaReunion(en("2026-11-02T11:00:00Z")), true); // lunes
  assert.equal(ahoraAR(en("2026-10-30T02:30:00Z")).hoy, "2026-10-29");
});

function dbFalsa() {
  const reuniones = new Map();
  return {
    reuniones,
    async query(sql, p = []) {
      if (/INSERT IGNORE INTO agentes_reuniones/.test(sql)) {
        if (reuniones.has(p[0])) return [{ affectedRows: 0 }];
        reuniones.set(p[0], null);
        return [{ affectedRows: 1 }];
      }
      if (/DELETE FROM agentes_reuniones/.test(sql)) {
        reuniones.delete(p[0]);
        return [{}];
      }
      if (/UPDATE agentes_reuniones/.test(sql)) {
        reuniones.set(p[1], p[0]);
        return [{}];
      }
      if (/FROM agentes_hallazgos/.test(sql)) return [[{ titulo: "Falta salida de Juan", severidad: "ALTA" }, { titulo: "Otro", severidad: "BAJA" }]];
      throw new Error("consulta inesperada: " + sql.slice(0, 60));
    },
  };
}

test("la reunión se hace una sola vez por día y avisa solo cuando no es forzada", async () => {
  const db = dbFalsa();
  const poolRoto = { query: async () => { throw new Error("sin datos"); } };
  let avisos = 0;
  const deps = { db, pool: poolRoto, agentes: [{ id: "rrhh", nombre: "Lía", puesto: "RRHH" }, { id: "stock", nombre: "Nati", puesto: "Stock" }], notificar: async () => { avisos++; } };
  const f = en("2026-10-30T11:05:00Z");
  const r1 = await hacerReunion(deps, { fecha: f });
  assert.equal(r1.secciones.length, 2);
  assert.equal(r1.secciones[0].urgente, true);
  assert.match(r1.secciones[0].resumen, /2 avisos abiertos, 1 urgente/);
  assert.equal(r1.secciones[1].resumen, "No pude leer el stock esta mañana."); // un área que falla no rompe la reunión
  assert.equal(await hacerReunion(deps, { fecha: f }), null); // ya se hizo
  assert.equal(avisos, 1);
  await hacerReunion(deps, { fecha: f, forzar: true });
  assert.equal(avisos, 1); // forzada: sin avisos
});

test("el ruteo de la oficina valida lo que dice el modelo", () => {
  const disp = [{ id: "stock" }, { id: "rrhh" }];
  const t = '```json\n{"consultas":[{"agente":"stock","pregunta":"¿Qué falta?"},{"agente":"stock","pregunta":"repetida"},{"agente":"inventado","pregunta":"x"},{"agente":"rrhh","pregunta":""}]}\n```';
  assert.deepEqual(leerConsultas(t, disp), [{ agente: "stock", pregunta: "¿Qué falta?" }]);
  assert.equal(leerConsultas("no es json", disp), null);
  assert.deepEqual(leerConsultas('{"consultas":[]}', disp), []);
});

test("sin modelo, el ruteo usa palabras clave y si no hay ninguna le pregunta a todos", () => {
  const disp = [{ id: "rrhh" }, { id: "stock" }, { id: "compras" }, { id: "produccion" }];
  assert.deepEqual(rutearPorPalabras("¿Cuántas horas extra hizo Juan?", disp).map((c) => c.agente), ["rrhh"]);
  assert.deepEqual(rutearPorPalabras("¿Cómo viene todo?", disp).map((c) => c.agente), ["rrhh", "stock", "compras", "produccion"]);
});

test("los avisos al celular llegan solo a los roles pedidos y se limpian los celulares que ya no existen", async () => {
  const claves = new Map();
  const borrados = [];
  const subs = [
    { id: 1, endpoint: "https://a", p256dh: "k", auth: "a" },
    { id: 2, endpoint: "https://muerta", p256dh: "k", auth: "a" },
  ];
  const db = {
    async query(sql, p = []) {
      if (/CREATE TABLE/.test(sql)) return [[]];
      if (/SELECT clave, valor FROM push_config/.test(sql)) return [[...claves].map(([clave, valor]) => ({ clave, valor }))];
      if (/INSERT IGNORE INTO push_config/.test(sql)) {
        claves.set("publica", p[0]);
        claves.set("privada", p[1]);
        return [{}];
      }
      if (/FROM push_suscripciones s JOIN usuarios/.test(sql)) {
        assert.deepEqual(p[0], ["ADMIN", "COMPRAS"]);
        return [subs];
      }
      if (/DELETE FROM push_suscripciones/.test(sql)) {
        borrados.push(p[0]);
        return [{}];
      }
      throw new Error("consulta inesperada");
    },
  };
  await asegurarPush(db);
  assert.equal(claves.size, 2); // generó las claves solas
  const enviados = [];
  const r = await enviarPush(db, { roles: ["admin", " compras ", "ADMIN"], titulo: "Hola", texto: "Algo urgente", ruta: "/agentes?a=stock" }, async (s, payload) => {
    if (s.endpoint === "https://muerta") throw Object.assign(new Error("gone"), { statusCode: 410 });
    enviados.push(JSON.parse(payload));
  });
  assert.deepEqual(r, { enviados: 1, fallidos: 1 });
  assert.deepEqual(borrados, [2]);
  assert.equal(enviados[0].ruta, "/agentes?a=stock");
  assert.equal(JSON.parse(armarPayload({ titulo: "x".repeat(300), texto: "y" })).titulo.length, 100);
});

test("crearNotificacion solo dispara el push cuando se lo piden", async () => {
  const db = { query: async () => [{ insertId: 7 }] };
  const llamadas = [];
  alCrearNotificacion((n) => llamadas.push(n));
  await crearNotificacion(db, { tipo: "AGENTE_STOCK", titulo: "t", roles: ["admin"] });
  await crearNotificacion(db, { tipo: "AGENTE_STOCK", titulo: "t", roles: ["admin"], push: true });
  alCrearNotificacion(null);
  assert.equal(llamadas.length, 1);
  assert.deepEqual(llamadas[0].roles, ["ADMIN"]);
});
