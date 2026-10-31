"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { proximaReunion, sugerenciasDe, ideasConIA } = require("../agentes/temario");

test("próxima reunión: hoy antes de las 08:00, mañana después, y salta el fin de semana", () => {
  // 2026-10-30 es viernes. 07:00 AR = 10:00Z
  assert.strictEqual(proximaReunion(new Date("2026-10-30T10:00:00Z")).cuando, "hoy a las 08:00");
  assert.strictEqual(proximaReunion(new Date("2026-10-29T15:00:00Z")).cuando, "mañana a las 08:00"); // jueves tarde
  assert.strictEqual(proximaReunion(new Date("2026-10-30T15:00:00Z")).cuando, "el lunes a las 08:00"); // viernes tarde
  assert.strictEqual(proximaReunion(new Date("2026-10-31T15:00:00Z")).cuando, "el lunes a las 08:00"); // sábado
});

const prev = (lineas) => ({ contenido: JSON.stringify({ secciones: [{ agente: "stock", lineas }] }) });
const dbFalso = (reuniones, viejos = []) => ({
  query: async (sql) => (/agentes_reuniones/.test(sql) ? [reuniones] : [viejos]),
});
const secs = [
  { agente: "stock", nombre: "Nati", urgente: true, resumen: "x", lineas: ["PEBD: alcanza para 3 días", "2 pedidos internos sin atender"] },
  { agente: "produccion", nombre: "Romi", urgente: true, resumen: "y", lineas: [] },
];

test("sugerencias: detecta lo que se repite en reuniones previas y los pedidos internos", async () => {
  const s = await sugerenciasDe({ db: dbFalso([prev(["PEBD: alcanza para 4 días"]), prev(["PEBD: stock negativo"])]), secciones: secs });
  assert.ok(s.some((x) => x.agente === "stock" && /PEBD.*3 reuniones/.test(x.texto)));
  assert.ok(s.some((x) => /pedidos internos/.test(x.texto)));
  assert.ok(s.some((x) => x.agente === "produccion"));
});

test("sugerencias: avisos viejos y caso sin urgencias", async () => {
  const s = await sugerenciasDe({ db: dbFalso([], [{ agente: "stock", n: 4 }]), secciones: [{ agente: "stock", nombre: "Nati", urgente: false, resumen: "ok", lineas: [] }] });
  assert.ok(s.some((x) => /4 avisos abiertos/.test(x.texto)));
  const vacio = await sugerenciasDe({ db: dbFalso([]), secciones: [{ agente: "stock", nombre: "Nati", urgente: false, resumen: "ok", lineas: [] }] });
  assert.strictEqual(vacio.length, 1);
});

test("ideas con IA: valida la respuesta y no rompe si falla", async () => {
  const ok = { models: { generateContent: async () => ({ text: '{"ideas":[{"agente":"stock","texto":"Revisar los mínimos de stock cada lunes."},{"agente":"zzz","texto":"inválida inválida inválida"}]}' }) } };
  const r = await ideasConIA({ ai: ok, secciones: secs });
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].ia, true);
  const mal = { models: { generateContent: async () => { throw new Error("sin red"); } } };
  assert.deepStrictEqual(await ideasConIA({ ai: mal, secciones: secs }), []);
  assert.deepStrictEqual(await ideasConIA({ ai: null, secciones: secs }), []);
});
