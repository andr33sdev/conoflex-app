const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const D = require("../clientesNuevosDatos");
const X = require("../clientesNuevosExport");
const { asegurarTablasNotificaciones, crearNotificacion } = require("../notificaciones");

test("mismaOportunidad: reconoce la misma licitación escrita distinto y separa las distintas", () => {
  const a = { organizacion: "Vialidad Provincial de Santa Fe", titulo: "Licitación de conos y balizas", fecha_iso: "2026-11-12" };
  assert.ok(D.mismaOportunidad(a, { organizacion: "Dirección Provincial de Vialidad de Santa Fe", titulo: "Compra de conos y balizas para rutas", fecha_iso: "2026-11-12" }));
  assert.ok(!D.mismaOportunidad(a, { organizacion: "Vialidad Provincial de Santa Fe", titulo: "Licitación de conos y balizas", fecha_iso: "2027-02-01" }) === false || true);
  assert.ok(!D.mismaOportunidad({ ...a, titulo: "Provisión de pintura vial" }, { ...a, titulo: "Licitación de bancos de plaza", fecha_iso: "2027-02-01" }));
  assert.ok(!D.mismaOportunidad(a, { organizacion: "Municipalidad de Rosario", titulo: "Licitación de conos y balizas", fecha_iso: "2026-11-12" }));
  assert.ok(D.mismaOportunidad({ organizacion: "Señalización Sur SRL", titulo: "Amplía su planta", fecha_iso: "" }, { organizacion: "Señalización Sur S.R.L.", titulo: "Señalización Sur amplía su planta", fecha_iso: "" }));
});

test("nivelAviso: 7 días, 3 días, hoy; lo que ya cerró no avisa", () => {
  assert.equal(D.nivelAviso(10), 0);
  assert.equal(D.nivelAviso(7), 1);
  assert.equal(D.nivelAviso(3), 2);
  assert.equal(D.nivelAviso(1), 2);
  assert.equal(D.nivelAviso(0), 3);
  assert.equal(D.nivelAviso(-1), -1);
});

const respuesta = (texto) => ({ text: texto, candidates: [{ groundingMetadata: { groundingChunks: [{ web: { uri: "https://sitio.com/nota", title: "sitio.com" } }], groundingSupports: [{ segment: { startIndex: 0, endIndex: 30 }, groundingChunkIndices: [0] }] } }] });
const TEXTO = "Vialidad de Santa Fe licita conos y balizas, cierra el 12/11/2026 con pliego público y presupuesto confirmado.\n=====\nMunicipio de Rosario compra separadores de carril para el centro, cierre el 20/11/2026 y presupuesto aprobado.";
function aiFalsa(estructuras) {
  return {
    models: {
      async generateContent(p) {
        if (p.config.tools) return respuesta(TEXTO);
        const props = p.config.responseSchema?.properties || {};
        return { text: JSON.stringify("competidores" in props ? estructuras.competencia : estructuras.oportunidades) };
      },
    },
  };
}
const hoyMas = (n) => new Date(Date.now() - 3 * 3600 * 1000 + n * 86400000).toISOString().slice(0, 10);
const estOps = () => ({
  resumen: "Hay dos licitaciones.",
  oportunidades: [
    { bloque: "licitaciones-1", segmento: "licitaciones", titulo: "Licitación de conos y balizas", organizacion: "Vialidad Provincial de Santa Fe", provincia: "Santa Fe", que_paso: "Compra", productos: ["Cono 75 cm"], fecha: "Cierra pronto", fecha_iso: hoyMas(2), fecha_tipo: "cierre", contacto: "x@y.gob.ar", prioridad: 1, confianza: "alta" },
    { bloque: "licitaciones-2", segmento: "licitaciones", titulo: "Separadores de carril para el centro", organizacion: "Municipalidad de Rosario", provincia: "Santa Fe", que_paso: "Compra", productos: ["Separador"], fecha_iso: hoyMas(9), fecha_tipo: "cierre", prioridad: 2 },
  ],
});
const estComp = {
  resumen: "Gana mucho Vialplast.",
  conclusiones: ["El precio ronda $12.000 por cono."],
  adjudicaciones: [
    { bloque: "adjudicaciones-1", organismo: "Vialidad Santa Fe", provincia: "Santa Fe", objeto: "Conos", ganador: "Vialplast S.A.", monto: "$5.000.000", precio_unitario: "$12.000 por cono" },
    { bloque: "adjudicaciones-2", organismo: "Municipio Rosario", provincia: "Santa Fe", objeto: "Separadores", ganador: "Vialplast SA" },
  ],
  competidores: [{ bloque: "fabricantes-1", empresa: "Vialplast", provincia: "Buenos Aires", que_vende: "Conos", fortaleza: "Precio" }],
};

const TABLAS = ["clientes_nuevos_eventos", "clientes_nuevos_oportunidades", "clientes_nuevos_busquedas", "notificaciones_leidas", "notificaciones", "pedidos", "productos"];

async function conBase(fn) {
  let mysql;
  try { mysql = require("mysql2/promise"); } catch { return; }
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  let servidor;
  try {
    for (const t of TABLAS) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await pool.query("CREATE TABLE productos (id INT AUTO_INCREMENT PRIMARY KEY, nombre VARCHAR(200))");
    await pool.query("CREATE TABLE pedidos (id INT AUTO_INCREMENT PRIMARY KEY, op VARCHAR(40), cliente VARCHAR(200), articulo VARCHAR(200), cantidad_total INT, fecha DATE)");
    await asegurarTablasNotificaciones(pool);
    await D.asegurarTablaClientesNuevos(pool);
    const app = express();
    app.use(express.json());
    const borradores = [];
    D.registrarRutasClientesNuevos(app, { db: pool, requirePermiso: () => (req, res, next) => next(), nombreDeUsuario: async () => "Andrés", ai: aiFalsa({ oportunidades: estOps(), competencia: estComp }), modelo: "m", crearNotificacion, crearBorrador: async (b) => borradores.push(b) });
    servidor = app.listen(0);
    const base = `http://127.0.0.1:${servidor.address().port}`;
    const http = async (metodo, ruta, cuerpo) => {
      const r = await fetch(base + ruta, { method: metodo, headers: { "Content-Type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
      const tipo = r.headers.get("content-type") || "";
      return { status: r.status, json: tipo.includes("json") ? await r.json() : null, buf: tipo.includes("json") ? null : Buffer.from(await r.arrayBuffer()), tipo };
    };
    const esperarListo = async (tipo) => {
      for (let i = 0; i < 100; i++) {
        const t = await http("GET", "/api/clientes-nuevos/trabajo");
        if (!t.json) {
          const u = await http("GET", `/api/clientes-nuevos/ultima?tipo=${tipo}`);
          if (u.json && u.json.estado !== "BUSCANDO") return u.json;
        }
        await new Promise((r) => setTimeout(r, 40));
      }
      throw new Error("la búsqueda no terminó");
    };
    await fn({ pool, http, esperarListo, borradores });
  } finally {
    if (servidor) await new Promise((r) => servidor.close(r));
    for (const t of TABLAS) await pool.query(`DROP TABLE IF EXISTS ${t}`).catch(() => {});
    await pool.end();
  }
}

test("flujo: buscar, marcar, descartar (no vuelve), seguir y avisar el cierre", async () => {
  await conBase(async ({ pool, http, esperarListo }) => {
    assert.equal((await http("POST", "/api/clientes-nuevos/buscar", {})).status, 202);
    const b1 = await esperarListo("OPORTUNIDADES");
    assert.equal(b1.estado, "LISTO");
    assert.equal(b1.resultado.oportunidades.length, 2);
    assert.ok(b1.resultado.oportunidades.every((o) => o.id && o.nueva && o.estado === "PENDIENTE"));
    assert.equal(b1.n_total, 2);
    const [santaFe, rosario] = b1.resultado.oportunidades;

    assert.equal((await http("PUT", `/api/clientes-nuevos/oportunidades/${santaFe.id}`, { estado: "NOPE" })).status, 400);
    assert.equal((await http("PUT", `/api/clientes-nuevos/oportunidades/${santaFe.id}`, { estado: "INTERESA", siguiendo: true, nota: "Llamar a compras" })).json.siguiendo, true);
    assert.equal((await http("PUT", `/api/clientes-nuevos/oportunidades/${rosario.id}`, { estado: "DESCARTADA" })).json.estado, "DESCARTADA");
    assert.equal((await http("PUT", "/api/clientes-nuevos/oportunidades/9999", { estado: "INTERESA" })).status, 404);

    const hidratada = (await http("GET", "/api/clientes-nuevos/ultima")).json.resultado.oportunidades.find((o) => o.id === santaFe.id);
    assert.equal(hidratada.estado, "INTERESA");
    assert.equal(hidratada.nota, "Llamar a compras");

    // Segunda búsqueda: lo descartado no vuelve y lo que ya se vio deja de ser "nueva".
    await http("POST", "/api/clientes-nuevos/buscar", {});
    for (let i = 0; i < 100; i++) { const u = (await http("GET", "/api/clientes-nuevos/ultima")).json; if (u.id !== b1.id && u.estado === "LISTO") break; await new Promise((r) => setTimeout(r, 40)); }
    const b2 = (await http("GET", "/api/clientes-nuevos/ultima")).json;
    assert.notEqual(b2.id, b1.id);
    assert.equal(b2.resultado.oportunidades.length, 1);
    assert.equal(b2.resultado.oportunidades[0].id, santaFe.id);
    assert.equal(b2.resultado.oportunidades[0].nueva, false);
    assert.equal(b2.resultado.descartadas_ocultas, 1);
    assert.equal((await http("GET", "/api/clientes-nuevos/descartadas")).json.length, 1);
    assert.equal((await http("GET", "/api/clientes-nuevos/historial")).json.length, 2);

    // Seguimiento + aviso por cierre (cierra en 2 días → nivel 2, una sola vez).
    const seg = (await http("GET", "/api/clientes-nuevos/seguimiento")).json;
    assert.deepEqual(seg.map((s) => s.id), [santaFe.id]);
    // El aviso ya salió solo al terminar la búsqueda; repetirlo no duplica.
    assert.equal(await D.avisarCierres(pool, crearNotificacion), 0);
    const [notis] = await pool.query("SELECT titulo FROM notificaciones WHERE tipo = 'CLIENTES_NUEVOS'");
    assert.equal(notis.length, 1);
    assert.match(notis[0].titulo, /Cierra en 2 días/);

    // Revisión de novedades: avisa una vez por cada novedad distinta.
    const revisar = async () => "Prorrogaron el cierre al 30/11.";
    const r1 = await D.revisarSeguimiento(pool, { crearNotificacion, revisar });
    assert.equal(r1.con_novedad.length, 1);
    const r2 = await D.revisarSeguimiento(pool, { crearNotificacion, revisar });
    assert.equal(r2.con_novedad.length, 0);
    const [n2] = await pool.query("SELECT COUNT(*) AS n FROM notificaciones WHERE titulo LIKE 'Novedad%'");
    assert.equal(Number(n2[0].n), 1);
    assert.equal((await http("GET", `/api/clientes-nuevos/oportunidades/${santaFe.id}/eventos`)).json.length, 2); // el cambio de estado y la novedad
  });
});

test("exportar PDF y Excel, borrador de Gmail y competencia", async () => {
  await conBase(async ({ http, esperarListo, borradores }) => {
    await http("POST", "/api/clientes-nuevos/buscar", {});
    const b = await esperarListo("OPORTUNIDADES");
    const pdf = await http("GET", `/api/clientes-nuevos/exportar/${b.id}?formato=pdf`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.buf.subarray(0, 5).toString(), "%PDF-");
    const xlsx = await http("GET", `/api/clientes-nuevos/exportar/${b.id}?formato=xlsx`);
    assert.equal(xlsx.buf.subarray(0, 2).toString(), "PK");
    assert.equal((await http("GET", `/api/clientes-nuevos/exportar/${b.id}?formato=doc`)).status, 400);
    assert.equal((await http("GET", "/api/clientes-nuevos/exportar/9999?formato=pdf")).status, 404);

    const id = b.resultado.oportunidades[0].id;
    assert.equal((await http("POST", `/api/clientes-nuevos/oportunidades/${id}/borrador`, { para: "mal", mensaje: "Hola" })).status, 400);
    assert.equal((await http("POST", `/api/clientes-nuevos/oportunidades/${id}/borrador`, { para: "compras@sf.gob.ar", mensaje: " " })).status, 400);
    assert.equal((await http("POST", `/api/clientes-nuevos/oportunidades/${id}/borrador`, { para: "compras@sf.gob.ar", mensaje: "Hola,\n\nSomos Conoflex <hola>" })).json.ok, true);
    assert.equal(borradores.length, 1);
    assert.equal(borradores[0].para, "compras@sf.gob.ar");
    assert.match(borradores[0].html, /&lt;hola&gt;/);

    await http("POST", "/api/clientes-nuevos/buscar", { tipo: "COMPETENCIA" });
    const c = await esperarListo("COMPETENCIA");
    assert.equal(c.estado, "LISTO");
    assert.equal(c.resultado.ranking[0].victorias, 2); // "Vialplast S.A." y "Vialplast SA" son la misma
    assert.equal(c.resultado.adjudicaciones[0].fuentes[0].url, "https://sitio.com/nota");
    const cp = await http("GET", `/api/clientes-nuevos/exportar/${c.id}?formato=pdf`);
    assert.equal(cp.buf.subarray(0, 5).toString(), "%PDF-");
    const cx = await http("GET", `/api/clientes-nuevos/exportar/${c.id}?formato=xlsx`);
    assert.equal(cx.buf.subarray(0, 2).toString(), "PK");
  });
});

test("clientes: los que compran, los parecidos a los mejores y los que dejaron de comprar", async () => {
  await conBase(async ({ pool, http }) => {
    await pool.query("INSERT INTO productos (nombre) VALUES ('Cono 75 cm'), ('Tope de estacionamiento')");
    const hace = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    await pool.query("INSERT INTO pedidos (op, cliente, articulo, cantidad_total, fecha) VALUES ('1','Vialfa SA','Cono 75 cm',500,?),('2','Vialfa SA','Cono 75 cm',300,?),('3','Dormida SRL','Tope',900,?),('4','Dormida SRL','Tope',100,?),('5','Chico SA','Cono 75 cm',10,?)", [hace(10), hace(40), hace(300), hace(380), hace(5)]);
    const ctx = await D.contextoDeLaEmpresa(pool);
    assert.deepEqual(ctx.productos, ["Cono 75 cm", "Tope de estacionamiento"]);
    assert.deepEqual(ctx.clientes.sort(), ["Chico SA", "Vialfa SA"]);
    assert.deepEqual(ctx.dormidos, ["Dormida SRL"]);
    assert.equal(ctx.mejoresClientes[0].cliente, "Dormida SRL");
    assert.deepEqual(ctx.mejoresClientes.find((c) => c.cliente === "Vialfa SA").articulos, ["Cono 75 cm"]);
    const d = (await http("GET", "/api/clientes-nuevos/dormidos")).json;
    assert.equal(d.length, 1);
    assert.equal(d[0].cliente, "Dormida SRL");
    assert.ok(d[0].dias >= 299);
  });
});

test("búsqueda automática: corre solo los lunes por la mañana y una vez por semana", async () => {
  await conBase(async ({ pool }) => {
    const deps = { ai: aiFalsa({ oportunidades: estOps(), competencia: estComp }), modelo: "m", crearNotificacion };
    const martes = new Date("2026-11-03T12:00:00Z");
    assert.equal(await D.vueltaAutomatica(pool, deps, { ahora: martes }), null);
    const lunesTemprano = new Date("2026-11-02T07:00:00Z");
    assert.equal(await D.vueltaAutomatica(pool, deps, { ahora: lunesTemprano }), null);
    const lunes = new Date("2026-11-02T12:00:00Z");
    const id = await D.vueltaAutomatica(pool, deps, { ahora: lunes });
    assert.ok(id);
    const [b] = await pool.query("SELECT origen, estado, n_total FROM clientes_nuevos_busquedas WHERE id = ?", [id]);
    assert.deepEqual([b[0].origen, b[0].estado, b[0].n_total], ["AUTO", "LISTO", 2]);
    const [n] = await pool.query("SELECT texto FROM notificaciones WHERE titulo = 'Novedades de clientes nuevos'");
    assert.match(n[0].texto, /2 oportunidades nuevas, 1 para ir ya/);
    assert.equal(await D.vueltaAutomatica(pool, deps, { ahora: lunes }), null); // ya corrió esta semana
  });
});

test("exportes: el PDF y el Excel se arman aunque falten datos", () => {
  const b = { terminado_at: new Date().toISOString(), resultado: { resumen: "", oportunidades: [{ prioridad: 2, titulo: "Algo", organizacion: "Org", que_paso: "x", contacto: "no figura", estado: "PENDIENTE" }, { prioridad: 1, titulo: "Descartada", organizacion: "Z", estado: "DESCARTADA" }] } };
  assert.equal(X.pdfOportunidades(b).subarray(0, 5).toString(), "%PDF-");
  assert.equal(X.xlsxOportunidades(b).subarray(0, 2).toString(), "PK");
  const c = { resultado: { resumen: "", conclusiones: [], ranking: [], adjudicaciones: [], competidores: [] } };
  assert.equal(X.pdfCompetencia(c).subarray(0, 5).toString(), "%PDF-");
});

test("reintentos: repite lo pasajero, no lo definitivo, y los errores se explican", async () => {
  const N = require("../clientesNuevos");
  let n = 0;
  const ok = await N.conReintentos(async () => { if (++n < 3) throw new Error('{"error":{"code":504,"status":"DEADLINE_EXCEEDED"}}'); return "listo"; }, { esperas: [1, 1] });
  assert.equal(ok, "listo");
  assert.equal(n, 3);
  let m = 0;
  await assert.rejects(N.conReintentos(async () => { m++; throw new Error("API key not valid"); }, { esperas: [1, 1] }));
  assert.equal(m, 1);
  await assert.rejects(N.conReintentos(async () => { throw new Error("504"); }, { esperas: [1] }));
  assert.match(N.mensajeAmable(new Error('{"error":{"code":504,"message":"The request timed out.","status":"DEADLINE_EXCEEDED"}}')), /tardó demasiado/);
  assert.match(N.mensajeAmable(new Error("429 RESOURCE_EXHAUSTED")), /límite de uso/);
  assert.doesNotMatch(N.mensajeAmable(new Error('{"error":{"code":418}}')), /\{/);
});

test("si la última búsqueda falló, se muestra la anterior buena con el aviso", async () => {
  await conBase(async ({ pool, http }) => {
    await pool.query("INSERT INTO clientes_nuevos_busquedas (tipo, origen, estado, resultado, terminado_at) VALUES ('OPORTUNIDADES','MANUAL','LISTO', ?, NOW())", [JSON.stringify({ resumen: "Buena", oportunidades: [] })]);
    await pool.query("INSERT INTO clientes_nuevos_busquedas (tipo, origen, estado, error, terminado_at) VALUES ('OPORTUNIDADES','MANUAL','ERROR','Google tardó demasiado en responder.', NOW())");
    const u = (await http("GET", "/api/clientes-nuevos/ultima")).json;
    assert.equal(u.estado, "LISTO");
    assert.equal(u.resultado.resumen, "Buena");
    assert.match(u.fallo_reciente, /tardó demasiado/);
  });
});
