"use strict";
const test = require("node:test");
const assert = require("node:assert");
const V = require("../agentes/ventasMails");
const { proponerNota, confirmarNota, cancelarNota, resumenRevision, construirInstrucciones, HERRAMIENTAS } = require("../agentes/ventasChat");

test("texto plano: saca etiquetas, estilos y entidades", () => {
  const t = V.textoPlano('<style>p{color:red}</style><p>Hola&nbsp;<b>Joaquín</b></p><table><tr><td>Total</td><td>$ 1.200,50</td></tr></table>');
  assert.ok(!/[<>]/.test(t));
  assert.match(t, /Hola Joaquín/);
  assert.match(t, /Total/);
});

test("importes y porcentajes: lee formato argentino", () => {
  assert.deepStrictEqual(V.importesEn("Lista $ 37.800 y total $1.531.509,70"), [37800, 1531509.7]);
  assert.deepStrictEqual(V.porcentajesEn("35% de descuento, antes 12,5 %"), [12.5, 35]);
  assert.deepStrictEqual(V.importesEn("hay 35 postes de 90 cm"), []); // sin signo $ no es importe
});

test("sinCita: corta la parte citada del mail enviado", () => {
  const t = "Hola Joaquín, te paso el precio.\nSaludos\n\nEl vie, 30 oct 2026 10:00, Joaquín <j@x.com> escribió:\n> Necesito lista de precios";
  assert.strictEqual(V.sinCita(t), "Hola Joaquín, te paso el precio.\nSaludos");
  assert.strictEqual(V.sinCita("Sin cita acá"), "Sin cita acá");
});

const borrador = "Estimados, gracias por comunicarse. Cono 75 cm Lista $37.800 con 35% de descuento $24.570. Total $245.700. Condiciones: IVA no incluido.";

test("comparar: enviado igual al borrador", () => {
  const c = V.compararVersiones(borrador, borrador + "\n\nEl vie, 30 oct 2026, X <x@y.com> escribió:\n> hola");
  assert.strictEqual(c.sinCambios, true);
  assert.strictEqual(V.describirCambios(c), "Lo enviaste igual que el borrador.");
});

test("comparar: cambió el descuento y el importe", () => {
  const enviado = "Estimados, gracias por comunicarse. Cono 75 cm Lista $37.800 con 40% de descuento $22.680. Total $226.800. Condiciones: IVA no incluido.";
  const c = V.compararVersiones(borrador, enviado);
  assert.strictEqual(c.sinCambios, false);
  assert.strictEqual(c.descuentoCambio, true);
  assert.deepStrictEqual(c.descuentoBorrador, [35]);
  assert.deepStrictEqual(c.descuentoEnviado, [40]);
  assert.ok(c.importesQuitados.includes(245700) && c.importesAgregados.includes(226800));
  assert.match(V.describirCambios(c), /borrador 35%, enviado 40%/);
});

test("comparar: texto reescrito", () => {
  const c = V.compararVersiones(borrador, "Joaquín, mañana paso por la fábrica y lo vemos en persona, así definimos todo juntos y cerramos la entrega.");
  assert.strictEqual(c.reescribio, true);
  assert.match(V.describirCambios(c), /reescribiste/);
});

test("patrones: solo cuando la corrección se repite", () => {
  const f = (de, a) => ({ cambios: { descuentoCambio: true, descuentoBorrador: [de], descuentoEnviado: [a], importesQuitados: [], importesAgregados: [], reescribio: false } });
  assert.deepStrictEqual(V.patronesDeCorreccion([f(35, 40)]), []);
  const p = V.patronesDeCorreccion([f(35, 40), f(35, 40), f(35, 30)]);
  assert.strictEqual(p.length, 1);
  assert.match(p[0].texto, /35% a 40% en 2 de los últimos 3/);
  const reesc = Array.from({ length: 4 }, (_, i) => ({ cambios: { descuentoCambio: false, descuentoBorrador: [], descuentoEnviado: [], importesQuitados: [], importesAgregados: [], reescribio: i < 3 } }));
  assert.ok(V.patronesDeCorreccion(reesc).some((x) => x.tipo === "TEXTO"));
});

test("nota comercial: propuesta con confirmación de un solo uso y solo para quien la pidió", async () => {
  const guardadas = [];
  const db = { query: async (sql, p) => (/SELECT id FROM ventas_notas/.test(sql) ? [[]] : (guardadas.push(p), [{ insertId: 7 }])) };
  const yo = { id: 5, nombre: "Andrés" };
  assert.ok(proponerNota({ usuario: yo, texto: "corto" }).error);
  const { propuesta } = proponerNota({ usuario: yo, texto: "A los distribuidores siempre ofrecer 35% de descuento." });
  assert.strictEqual(propuesta.tipo, "nota");
  assert.ok((await confirmarNota({ db, usuario: { id: 9, nombre: "Otro" }, token: propuesta.token })).error); // otro usuario
  const ok = await confirmarNota({ db, usuario: yo, token: propuesta.token });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(guardadas.length, 1);
  assert.ok((await confirmarNota({ db, usuario: yo, token: propuesta.token })).error); // ya se usó
  const p2 = proponerNota({ usuario: yo, texto: "Nunca ofrecer cadena sin consultar el largo." }).propuesta;
  cancelarNota({ usuario: yo, token: p2.token });
  assert.ok((await confirmarNota({ db, usuario: yo, token: p2.token })).error);
  assert.strictEqual(guardadas.length, 1);
});

test("notas: se suman a las reglas solo si existen", async () => {
  const sin = { query: async () => [[]] };
  assert.strictEqual(await V.notasTexto(sin), "");
  const con = { query: async () => [[{ id: 1, texto: "35% a distribuidores" }]] };
  assert.match(await V.notasTexto(con), /- 35% a distribuidores/);
});

test("Cami: nunca envía y sus herramientas no incluyen ninguna que envíe", () => {
  const nombres = HERRAMIENTAS[0].functionDeclarations.map((h) => h.name);
  assert.ok(!nombres.some((n) => /enviar|send/i.test(n)));
  assert.match(construirInstrucciones([]), /NUNCA enviás mails/);
  assert.deepStrictEqual(resumenRevision(null), null);
  const r = resumenRevision({ descuento_pct: 35, adjunta_lista: true, avisos: ["a"], lineas: [{ codigo: "2400", nombre: "Cono", cantidad: 3, lista: 100, con_descuento: 65, total: 195 }] });
  assert.strictEqual(r.productos[0].total, 195);
  assert.strictEqual(r.adjunta_lista_de_precios, true);
});
