const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../clientesNuevos");

const respuesta = (texto, fuentes = []) => ({ text: texto, candidates: [{ groundingMetadata: { groundingChunks: fuentes.map((u) => ({ web: { uri: u, title: new URL(u).hostname } })) } }] });

test("armarBusqueda: pide toda la Argentina, no inventar y excluye a los clientes", () => {
  const p = C.armarBusqueda(C.SEGMENTOS[0], { productos: ["Cono 75"], clientes: ["Vialfa SA"], fecha: "2026-11-03" });
  assert.match(p, /2026-11-03/);
  assert.match(p, /TODA la Argentina/);
  assert.match(p, /no inventes/);
  assert.match(p, /Vialfa SA/);
  assert.match(p, /Cono 75/);
});

test("extraerJSON: acepta JSON limpio o rodeado de texto y devuelve null si no hay", () => {
  assert.deepEqual(C.extraerJSON('{"a":1}'), { a: 1 });
  assert.deepEqual(C.extraerJSON('Acá está: {"a":2} fin'), { a: 2 });
  assert.equal(C.extraerJSON("nada"), null);
});

test("fuentesDe: junta los enlaces sin repetir", () => {
  const f = C.fuentesDe(respuesta("x", ["https://a.com/1", "https://a.com/1", "https://b.com/2"]));
  assert.equal(f.length, 2);
});

function aiFalsa({ estructura, fallaSegmento = null }) {
  let n = 0;
  return {
    models: {
      async generateContent(p) {
        if (p.config.tools) {
          const i = n++;
          if (fallaSegmento === i) throw new Error("cuota");
          return respuesta(`resultado ${i}`, [`https://sitio${i}.com/nota`]);
        }
        return { text: JSON.stringify(estructura) };
      },
    },
  };
}
const estructura = {
  resumen: "Hay una licitación de conos.",
  oportunidades: [
    { segmento: "empresas", titulo: "Constructora X amplía", organizacion: "Constructora X", que_paso: "Amplió su flota", prioridad: 3 },
    { segmento: "licitaciones", titulo: "Licitación de conos", organizacion: "Municipio de Rosario", que_paso: "Compra de 5000 conos", prioridad: 1, contacto: "compras@rosario.gob.ar" },
    { segmento: "licitaciones", titulo: "Licitación de conos", organizacion: "Municipio de Rosario", que_paso: "repetida", prioridad: 1 },
  ],
};

test("ejecutarBusqueda: ordena por prioridad, saca duplicados y marca las nuevas", async () => {
  const avisos = [];
  const previas = [];
  const r1 = await C.ejecutarBusqueda({ ai: aiFalsa({ estructura }), anteriores: previas, progreso: (t) => avisos.push(t) });
  assert.equal(r1.oportunidades.length, 2);
  assert.equal(r1.oportunidades[0].organizacion, "Municipio de Rosario");
  assert.ok(r1.oportunidades.every((o) => o.nueva));
  assert.equal(r1.fuentes.length, 3);
  assert.ok(avisos.length >= 2);
  const r2 = await C.ejecutarBusqueda({ ai: aiFalsa({ estructura }), anteriores: r1.oportunidades.map((o) => o.clave) });
  assert.ok(r2.oportunidades.every((o) => !o.nueva));
});

test("ejecutarBusqueda: si falla una búsqueda sigue con las otras y lo avisa; si fallan todas, error", async () => {
  const r = await C.ejecutarBusqueda({ ai: aiFalsa({ estructura, fallaSegmento: 1 }) });
  assert.deepEqual(r.segmentos_sin_resultado, ["Obras viales y proyectos nuevos"]);
  const todas = { models: { generateContent: async () => { throw new Error("sin cuota"); } } };
  await assert.rejects(() => C.ejecutarBusqueda({ ai: todas }), /No se pudo buscar en internet: sin cuota/);
});

test("ejecutarBusqueda: si la IA no devuelve datos ordenables, avisa", async () => {
  const ai = { models: { generateContent: async (p) => (p.config.tools ? respuesta("algo") : { text: "no json" }) } };
  await assert.rejects(() => C.ejecutarBusqueda({ ai }), /no pude ordenar/);
});
