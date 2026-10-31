"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { armarPropuesta, confirmarPropuesta, cancelarPropuesta } = require("../agentes/ajusteStock");

const admin = { id: 1, nombre: "Andrés", rol: "ADMIN" };
const otro = { id: 2, nombre: "Pedro", rol: "PRODUCCION" };
const mp = { id: 7, nombre: "PEBD", unidad: "kg" };

function dbFalso(stock) {
  const estado = { stock, movimientos: [], commit: 0, rollback: 0 };
  const conn = {
    beginTransaction: async () => {},
    commit: async () => { estado.commit++; },
    rollback: async () => { estado.rollback++; },
    release: () => {},
    query: async (sql, p) => {
      if (/SELECT stock_actual/.test(sql)) return [[{ stock_actual: estado.stock }]];
      if (/UPDATE materias_primas/.test(sql)) { estado.stock = p[0]; return [{}]; }
      if (/INSERT INTO mp_movimientos/.test(sql)) { estado.movimientos.push(p); return [{}]; }
      throw new Error("sql inesperado " + sql);
    },
  };
  return { db: { getConnection: async () => conn }, estado };
}

test("propuesta: calcula, rechaza a quien no es admin y valida cantidades", () => {
  assert.match(armarPropuesta({ usuario: otro, materia: mp, stockActual: 100, operacion: "sumar", cantidad: 5 }).error, /administrador/);
  const p = armarPropuesta({ usuario: admin, materia: mp, stockActual: 1200, operacion: "sumar", cantidad: 500 }).propuesta;
  assert.strictEqual(p.stockNuevo, 1700);
  assert.strictEqual(p.delta, 500);
  assert.strictEqual(armarPropuesta({ usuario: admin, materia: mp, stockActual: 1200, operacion: "restar", cantidad: 200 }).propuesta.stockNuevo, 1000);
  assert.strictEqual(armarPropuesta({ usuario: admin, materia: mp, stockActual: 1200, operacion: "fijar", cantidad: 900 }).propuesta.delta, -300);
  assert.ok(armarPropuesta({ usuario: admin, materia: mp, stockActual: 100, operacion: "restar", cantidad: 500 }).error);
  assert.ok(armarPropuesta({ usuario: admin, materia: mp, stockActual: 100, operacion: "sumar", cantidad: -3 }).error);
  assert.ok(armarPropuesta({ usuario: admin, materia: mp, stockActual: 100, operacion: "fijar", cantidad: 100 }).error);
  assert.ok(armarPropuesta({ usuario: admin, materia: mp, stockActual: 100, operacion: "borrar", cantidad: 1 }).error);
});

test("confirmar: aplica una sola vez y deja el movimiento", async () => {
  const { db, estado } = dbFalso(1200);
  const p = armarPropuesta({ usuario: admin, materia: mp, stockActual: 1200, operacion: "sumar", cantidad: 500, motivo: "ingreso" }).propuesta;
  const r = await confirmarPropuesta({ db, usuario: admin, token: p.token });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(estado.stock, 1700);
  assert.strictEqual(estado.movimientos.length, 1);
  assert.strictEqual(estado.commit, 1);
  const otra = await confirmarPropuesta({ db, usuario: admin, token: p.token });
  assert.strictEqual(otra.status, 404);
  assert.strictEqual(estado.stock, 1700);
});

test("confirmar: otro usuario, stock que cambió, cancelación y vencimiento no modifican nada", async () => {
  const { db, estado } = dbFalso(1200);
  const mk = () => armarPropuesta({ usuario: admin, materia: mp, stockActual: 1200, operacion: "sumar", cantidad: 10 }).propuesta;
  let p = mk();
  assert.strictEqual((await confirmarPropuesta({ db, usuario: otro, token: p.token })).status, 404);
  estado.stock = 1250; // alguien lo movió mientras tanto
  const r = await confirmarPropuesta({ db, usuario: admin, token: p.token });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(estado.stock, 1250);
  assert.strictEqual(estado.rollback, 1);
  p = mk();
  cancelarPropuesta({ usuario: admin, token: p.token });
  assert.strictEqual((await confirmarPropuesta({ db, usuario: admin, token: p.token })).status, 404);
  p = armarPropuesta({ usuario: admin, materia: mp, stockActual: 1250, operacion: "sumar", cantidad: 10 }).propuesta;
  assert.strictEqual((await confirmarPropuesta({ db, usuario: admin, token: p.token, ahora: Date.now() + 11 * 60 * 1000 })).status, 404);
  assert.strictEqual(estado.stock, 1250);
});
