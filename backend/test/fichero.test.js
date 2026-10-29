"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { separarDuplicadas } = require("../fichero");

const f = (rec_no, hora, tipo = "ENTRADA", id = "7") => ({
  rec_no, empleado_id: id, nombre: "Juan", fecha_hora: `2026-10-29 ${hora}`, tipo,
});

test("entradas con segundos de diferencia: se conserva la primera", () => {
  const { nuevos, duplicados } = separarDuplicadas([f(1, "08:00:00"), f(2, "08:00:07"), f(3, "08:01:30")]);
  assert.deepEqual(nuevos.map((r) => r.rec_no), [1]);
  assert.deepEqual(duplicados.map((r) => r.rec_no), [2, 3]);
});

test("exactamente 3 minutos después ya es otra marca", () => {
  const { nuevos } = separarDuplicadas([f(1, "08:00:00"), f(2, "08:03:00")]);
  assert.equal(nuevos.length, 2);
});

test("ENTRADA y SALIDA a segundos de distancia son el mismo toque: se conserva la primera", () => {
  const { nuevos, duplicados } = separarDuplicadas([f(1, "08:00:00", "ENTRADA"), f(2, "08:00:20", "SALIDA")]);
  assert.equal(nuevos.length, 1);
  assert.equal(duplicados.length, 1);
  assert.equal(duplicados[0].rec_no, 2);
});

test("distintos empleados no se pisan", () => {
  const { nuevos } = separarDuplicadas([f(1, "08:00:00", "ENTRADA", "7"), f(2, "08:00:05", "ENTRADA", "8")]);
  assert.equal(nuevos.length, 2);
});

test("salidas repetidas: ráfaga larga no se encadena (se compara contra la conservada)", () => {
  const regs = [0, 2, 4, 6].map((m, i) => f(i + 1, `17:0${m}:00`, "SALIDA"));
  const { nuevos, duplicados } = separarDuplicadas(regs);
  assert.deepEqual(nuevos.map((r) => r.rec_no), [1, 3]); // 17:00 y 17:04
  assert.deepEqual(duplicados.map((r) => r.rec_no), [2, 4]);
});

test("compara contra fichadas ya guardadas en la base", () => {
  const existentes = [f(10, "08:00:00")];
  const { nuevos, duplicados } = separarDuplicadas([f(11, "08:00:40"), f(12, "09:00:00")], existentes);
  assert.deepEqual(duplicados.map((r) => r.rec_no), [11]);
  assert.deepEqual(nuevos.map((r) => r.rec_no), [12]);
});

test("llegan desordenadas: igual se conserva la más temprana", () => {
  const { nuevos } = separarDuplicadas([f(2, "08:00:10"), f(1, "08:00:00")]);
  assert.deepEqual(nuevos.map((r) => r.rec_no), [1]);
});

test("ventana 0 desactiva el filtro", () => {
  const { nuevos } = separarDuplicadas([f(1, "08:00:00"), f(2, "08:00:01")], [], 0);
  assert.equal(nuevos.length, 2);
});
