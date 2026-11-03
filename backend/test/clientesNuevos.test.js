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

const sinResolver = async (u) => ({ url: u, titulo: null });

test("partirBloques y fuentesDeBloque: cada oportunidad queda con sus propias páginas (incluso con tildes)", () => {
  const texto = "1. Rosario compra conos para toda la ciudad, con cierre el 12/11 y presupuesto confirmado.\n=====\n2. Córdoba repavimenta la ruta 9 con inicio en diciembre y necesita señalización temporal.";
  const bloques = C.partirBloques(texto);
  assert.equal(bloques.length, 2);
  const inicio2 = Buffer.byteLength(texto.slice(0, texto.indexOf("2. Córdoba")));
  const resp = { candidates: [{ groundingMetadata: { groundingChunks: [{ web: { uri: "https://a.com/1", title: "a.com" } }, { web: { uri: "https://b.com/2", title: "b.com" } }], groundingSupports: [{ segment: { startIndex: 0, endIndex: 50 }, groundingChunkIndices: [0] }, { segment: { startIndex: inicio2 + 3, endIndex: inicio2 + 40 }, groundingChunkIndices: [1] }] } }] };
  assert.deepEqual(C.fuentesDeBloque(bloques[0], resp).map((f) => f.url), ["https://a.com/1"]);
  assert.deepEqual(C.fuentesDeBloque(bloques[1], resp).map((f) => f.url), ["https://b.com/2"]);
});

test("resolverUrl: sigue la redirección del buscador y, si falla, deja el enlace", async () => {
  const redir = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc";
  const ok = await C.resolverUrl(redir, { fetchFn: async () => ({ headers: new Headers({ location: "https://www.compr.ar/licitacion/9" }) }) });
  assert.deepEqual(ok, { url: "https://www.compr.ar/licitacion/9", titulo: "compr.ar" });
  assert.deepEqual(await C.resolverUrl(redir, { fetchFn: async () => { throw new Error("red"); } }), { url: redir, titulo: null });
  assert.deepEqual(await C.resolverUrl("https://otro.com/x"), { url: "https://otro.com/x", titulo: null });
});

const TEXTO_LIC = "1. Vialidad de Santa Fe licita conos y balizas, cierra el 12/11/2026. Pliego en https://compr.ar/pliego/77 con presupuesto de $85.000.000.\n=====\n2. Municipio X compró conos, la licitación cerró el 01/10/2026 y ya se adjudicó a otro proveedor.";
function aiFalsa({ estructura, fallaSegmento = null }) {
  let n = 0;
  return {
    models: {
      async generateContent(p) {
        if (p.config.tools) {
          const i = n++;
          if (fallaSegmento === i) throw new Error("cuota");
          const texto = i === 0 ? TEXTO_LIC : `Resultado ${i}: empresa del rubro que amplía su planta y busca proveedores de seguridad vial en la región.`;
          return { text: texto, candidates: [{ groundingMetadata: { groundingChunks: [{ web: { uri: `https://sitio${i}.com/nota`, title: `sitio${i}.com` } }], groundingSupports: [{ segment: { startIndex: 0, endIndex: 30 }, groundingChunkIndices: [0] }] } }] };
        }
        return { text: JSON.stringify(estructura) };
      },
    },
  };
}
const estructura = {
  resumen: "Hay una licitación de conos.",
  oportunidades: [
    { bloque: "empresas-1", segmento: "empresas", titulo: "Constructora X amplía", organizacion: "Constructora X", que_paso: "Amplió su flota", prioridad: 3 },
    { bloque: "licitaciones-1", segmento: "licitaciones", titulo: "Licitación de conos", organizacion: "Vialidad de Santa Fe", provincia: "Santa Fe", que_paso: "Compra de conos y balizas", productos: ["Cono 75 cm", "Baliza"], argumento: "Somos fabricantes locales", siguiente_paso: "Pedir el pliego", mensaje: "Hola, somos Conoflex...", fecha: "Cierra el 12/11/2026", fecha_iso: "2026-11-12", fecha_tipo: "cierre", monto: "$85.000.000", contacto: "compras@sf.gob.ar", url_directa: "https://compr.ar/pliego/77", prioridad: 1, confianza: "alta" },
    { bloque: "licitaciones-1", segmento: "licitaciones", titulo: "Licitación de conos", organizacion: "Vialidad de Santa Fe", que_paso: "repetida", prioridad: 1 },
    { bloque: "licitaciones-2", segmento: "licitaciones", titulo: "Compra de conos adjudicada", organizacion: "Municipio X", que_paso: "Ya cerró", fecha_iso: "2026-10-01", fecha_tipo: "cierre", url_directa: "https://inventada.com/x", prioridad: 2 },
  ],
};

test("ejecutarBusqueda: arma la ficha completa, saca duplicados y vencidas, ordena y marca las nuevas", async () => {
  const avisos = [];
  const r1 = await C.ejecutarBusqueda({ ai: aiFalsa({ estructura }), fecha: "2026-11-03", resolver: sinResolver, progreso: (t) => avisos.push(t) });
  assert.equal(r1.oportunidades.length, 2);
  assert.equal(r1.vencidas_descartadas, 1);
  const lic = r1.oportunidades[0];
  assert.equal(lic.organizacion, "Vialidad de Santa Fe");
  assert.deepEqual(lic.productos, ["Cono 75 cm", "Baliza"]);
  assert.equal(lic.url, "https://compr.ar/pliego/77"); // figura en el texto original
  assert.equal(lic.fuentes[0].url, "https://sitio0.com/nota");
  assert.equal(lic.fuentes_aproximadas, false);
  assert.equal(lic.fecha_iso, "2026-11-12");
  assert.equal(lic.monto, "$85.000.000");
  assert.ok(lic.nueva);
  const emp = r1.oportunidades[1];
  assert.equal(emp.url, emp.fuentes[0].url); // sin dirección directa usa la primera fuente
  assert.ok(avisos.length >= 3);
  const r2 = await C.ejecutarBusqueda({ ai: aiFalsa({ estructura }), fecha: "2026-11-03", resolver: sinResolver, anteriores: r1.oportunidades.map((o) => o.clave) });
  assert.ok(r2.oportunidades.every((o) => !o.nueva));
});

test("ejecutarBusqueda: una dirección que no figura en el texto no se muestra como directa", async () => {
  const est = { resumen: "x", oportunidades: [{ bloque: "licitaciones-1", segmento: "licitaciones", titulo: "T", organizacion: "O", que_paso: "p", url_directa: "https://inventada.com/x", prioridad: 1 }] };
  const r = await C.ejecutarBusqueda({ ai: aiFalsa({ estructura: est }), fecha: "2026-11-03", resolver: sinResolver });
  assert.equal(r.oportunidades[0].url, "https://sitio0.com/nota");
});

test("ejecutarBusqueda: si falla una búsqueda sigue con las otras y lo avisa; si fallan todas, error", async () => {
  const r = await C.ejecutarBusqueda({ ai: aiFalsa({ estructura, fallaSegmento: 1 }), fecha: "2026-11-03", resolver: sinResolver });
  assert.deepEqual(r.segmentos_sin_resultado, ["Obras viales y proyectos nuevos"]);
  const todas = { models: { generateContent: async () => { throw new Error("sin cuota"); } } };
  await assert.rejects(() => C.ejecutarBusqueda({ ai: todas }), /No se pudo buscar en internet: sin cuota/);
});

test("ejecutarBusqueda: si la IA no devuelve datos ordenables, avisa", async () => {
  const ai = { models: { generateContent: async (p) => (p.config.tools ? { text: "algo sin separadores pero con texto suficiente para contar como resultado" } : { text: "no json" }) } };
  await assert.rejects(() => C.ejecutarBusqueda({ ai, resolver: sinResolver }), /no pude ordenar/);
});
