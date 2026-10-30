const test = require("node:test");
const assert = require("node:assert/strict");
const { crearNotificacion, limpiarRoles } = require("../notificaciones");

test("los roles se normalizan y sin duplicados", () => {
  assert.deepEqual(limpiarRoles([" admin", "PRODUCCION", "admin", ""]), ["ADMIN", "PRODUCCION"]);
});

test("crear una notificación guarda los roles destino", async () => {
  const llamadas = [];
  const db = { query: async (sql, p) => { llamadas.push(p); return [{ insertId: 7 }]; } };
  const id = await crearNotificacion(db, { tipo: "X", titulo: "t", roles: ["admin", "produccion"], creada_por_id: 3 });
  assert.equal(id, 7);
  assert.equal(llamadas[0][4], "ADMIN,PRODUCCION");
  assert.equal(llamadas[0][5], 3);
});

test("sin roles no se crea nada, y un error de base no rompe a quien llama", async () => {
  const db = { query: async () => { throw new Error("caída"); } };
  assert.equal(await crearNotificacion(db, { tipo: "X", titulo: "t", roles: [] }), null);
  const original = console.error; console.error = () => {};
  assert.equal(await crearNotificacion(db, { tipo: "X", titulo: "t", roles: ["ADMIN"] }), null);
  console.error = original;
});
