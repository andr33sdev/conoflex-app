"use strict";
const test = require("node:test");
const assert = require("node:assert");
const S = require("../agentes/seguimientoMails");

const DIA = 86400000;
const AHORA = Date.UTC(2026, 10, 1, 15, 0, 0);
const YO = "ventas@conoflex.com.ar";
const msg = (o) => ({ id: "m" + Math.random().toString(36).slice(2, 7), fecha: AHORA - 5 * DIA, de: YO, para: "Carlos <carlos@vial.com>", cc: "", asunto: "Presupuesto conos", enviado: true, borrador: false, automatico: false, snippet: "Adjunto presupuesto", ...o });
const hilo = (mensajes) => ({ threadId: "t1", historyId: "100", mensajes });

test("hilo con mail nuestro sin respuesta: queda esperando", () => {
  const a = S.analizarHilo(hilo([msg({ id: "a" })]), { miEmail: YO });
  assert.equal(a.estado, "ESPERANDO");
  assert.equal(a.contacto_email, "carlos@vial.com");
  assert.equal(a.contacto_nombre, "Carlos");
  assert.equal(a.ultimo_msg_id, "a");
  assert.equal(a.envios_sin_respuesta, 1);
});

test("si el cliente contestó después, está respondido", () => {
  const a = S.analizarHilo(hilo([msg({ id: "a" }), msg({ id: "b", enviado: false, de: "carlos@vial.com", para: YO, fecha: AHORA - 2 * DIA })]), { miEmail: YO });
  assert.equal(a.estado, "RESPONDIDO");
});

test("una respuesta automática no cuenta como respuesta", () => {
  const auto = msg({ id: "b", enviado: false, de: "carlos@vial.com", asunto: "Respuesta automática: fuera de la oficina", fecha: AHORA - 4 * DIA });
  assert.equal(S.analizarHilo(hilo([msg({ id: "a" }), auto]), { miEmail: YO }).estado, "ESPERANDO");
});

test("si insistimos dos veces sin respuesta se cuenta", () => {
  const a = S.analizarHilo(hilo([msg({ id: "a", fecha: AHORA - 9 * DIA }), msg({ id: "b", fecha: AHORA - 3 * DIA })]), { miEmail: YO });
  assert.equal(a.envios_sin_respuesta, 2);
  assert.equal(a.ultimo_msg_id, "b");
});

test("el borrador de Gmail no cuenta como mail enviado ni como respuesta", () => {
  const a = S.analizarHilo(hilo([msg({ id: "a" }), msg({ id: "d", borrador: true, enviado: false })]), { miEmail: YO });
  assert.equal(a.estado, "ESPERANDO");
  assert.equal(a.tiene_borrador, true);
});

test("mails internos, a direcciones automáticas o sin enviados se ignoran", () => {
  assert.equal(S.analizarHilo(hilo([msg({ para: "Planta <planta@conoflex.com.ar>" })]), { miEmail: YO }), null);
  assert.equal(S.analizarHilo(hilo([msg({ para: "noreply@banco.com" })]), { miEmail: YO }), null);
  assert.equal(S.analizarHilo(hilo([msg({ enviado: false, de: "x@y.com" })]), { miEmail: YO }), null);
  // con un Gmail personal no se puede deducir el dominio de la casa: solo se excluye la propia dirección
  assert.equal(S.analizarHilo(hilo([msg({ para: "yo@gmail.com" })]), { miEmail: "yo@gmail.com" }), null);
  assert.equal(S.analizarHilo(hilo([msg({ para: "otro@gmail.com" })]), { miEmail: "yo@gmail.com" }).estado, "ESPERANDO");
});

test("rebote: Gmail avisa que no se entregó", () => {
  const rebote = msg({ id: "r", enviado: false, de: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", asunto: "Delivery Status Notification (Failure)", fecha: AHORA - 5 * DIA + 1000 });
  const a = S.analizarHilo(hilo([msg({ id: "a" }), rebote]), { miEmail: YO });
  assert.equal(a.estado, "REBOTE");
});

test("qué mandamos: presupuesto, consulta, cortesía", () => {
  assert.equal(S.clasificarHeuristico("Adjunto la cotización con valores $ 37.800 más IVA", "Re: consulta"), "PRESUPUESTO");
  assert.equal(S.clasificarHeuristico("¿Podrían confirmarnos la dirección de entrega?", "Entrega"), "CONSULTA");
  assert.equal(S.clasificarHeuristico("Muchas gracias, quedamos a disposición. Saludos.", "Gracias"), "CORTESIA");
  assert.equal(S.clasificarHeuristico("Le enviamos el certificado de calidad adjunto.", "Certificado"), "OTRO");
});

test("severidad: depende de lo que mandamos y de los días", () => {
  assert.equal(S.severidadDe({ clase: "PRESUPUESTO", dias: 1, estado: "ESPERANDO" }), null);
  assert.equal(S.severidadDe({ clase: "PRESUPUESTO", dias: 3, estado: "ESPERANDO" }), "MEDIA");
  assert.equal(S.severidadDe({ clase: "PRESUPUESTO", dias: 8, estado: "ESPERANDO" }), "ALTA");
  assert.equal(S.severidadDe({ clase: "PRESUPUESTO", dias: 40, estado: "ESPERANDO" }), "BAJA");
  assert.equal(S.severidadDe({ clase: "CONSULTA", dias: 4, estado: "ESPERANDO" }), "BAJA");
  assert.equal(S.severidadDe({ clase: "CORTESIA", dias: 20, estado: "ESPERANDO" }), null);
  assert.equal(S.severidadDe({ clase: "OTRO", dias: 4, estado: "ESPERANDO" }), null);
  assert.equal(S.severidadDe({ clase: null, dias: 0, estado: "REBOTE" }), "ALTA");
});

const fila = (o) => ({ thread_id: "t1", ultimo_msg_id: "m1", asunto: "Presupuesto conos", contacto_nombre: "Carlos", contacto_email: "carlos@vial.com", estado: "ESPERANDO", clase: "PRESUPUESTO", envios_sin_respuesta: 1, ultimo_nuestro_en: new Date(AHORA - 8 * DIA).toISOString().slice(0, 19).replace("T", " "), ...o });

test("hallazgos: uno por hilo con clave que cambia si insistimos", () => {
  const h = S.armarHallazgos([fila({})], { ahoraMs: AHORA });
  assert.equal(h.length, 1);
  assert.equal(h[0].severidad, "ALTA");
  assert.equal(h[0].tipo, "PRESUPUESTO_SIN_RESPUESTA");
  assert.match(h[0].titulo, /Carlos no respondió el presupuesto \(8 días\)/);
  assert.notEqual(h[0].clave, S.armarHallazgos([fila({ ultimo_msg_id: "m2" })], { ahoraMs: AHORA })[0].clave);
});

test("hallazgos: descartados, respondidos, cortesías y pospuestos no avisan", () => {
  const filas = [fila({ estado: "DESCARTADO" }), fila({ estado: "RESPONDIDO" }), fila({ clase: "CORTESIA" }), fila({ estado: "POSPUESTO", pospuesto_hasta: new Date(AHORA + DIA).toISOString().slice(0, 19).replace("T", " ") })];
  assert.equal(S.armarHallazgos(filas, { ahoraMs: AHORA }).length, 0);
  // vencido el plazo de posposición, vuelve a avisar
  assert.equal(S.armarHallazgos([fila({ estado: "POSPUESTO", pospuesto_hasta: new Date(AHORA - DIA).toISOString().slice(0, 19).replace("T", " ") })], { ahoraMs: AHORA }).length, 1);
});

test("hallazgos: lo muy viejo se marca como frío y el rebote como alto", () => {
  const frio = S.armarHallazgos([fila({ ultimo_nuestro_en: new Date(AHORA - 35 * DIA).toISOString().slice(0, 19).replace("T", " ") })], { ahoraMs: AHORA })[0];
  assert.equal(frio.tipo, "FRIO");
  assert.equal(frio.severidad, "BAJA");
  const rb = S.armarHallazgos([fila({ estado: "REBOTE", clase: null })], { ahoraMs: AHORA })[0];
  assert.equal(rb.tipo, "REBOTE");
  assert.equal(rb.severidad, "ALTA");
});

test("clasificaciones de la IA: solo se aceptan clases y números válidos", () => {
  const m = S.leerClasificaciones('```json\n[{"n":0,"clase":"presupuesto","resumen":"Presupuesto de conos"},{"n":5,"clase":"OTRO"},{"n":1,"clase":"INVENTADA"}]\n```', 2);
  assert.equal(m.size, 1);
  assert.equal(m.get(0).clase, "PRESUPUESTO");
  assert.equal(S.leerClasificaciones("no es json", 2), null);
});

test("aHtml: escapa y arma párrafos", () => {
  const h = S.aHtml("Hola <b>Carlos</b>\n\nSaludos");
  assert.match(h, /&lt;b>Carlos/);
  assert.equal((h.match(/<p>/g) || []).length, 2);
});

// ---- contra una base real (si hay MySQL de prueba); se omite si no está disponible ----
let mysql = null;
try { mysql = require("mysql2/promise"); } catch { /* sin driver */ }
const conBase = async (fn) => {
  if (!mysql) return;
  let pool;
  try {
    pool = mysql.createPool({ host: process.env.TEST_DB_HOST || "localhost", user: process.env.TEST_DB_USER || "root", password: process.env.TEST_DB_PASSWORD || "", database: process.env.TEST_DB_NAME || "test" });
    await pool.query("SELECT 1");
  } catch { if (pool) await pool.end().catch(() => {}); return; }
  try {
    await pool.query("DROP TABLE IF EXISTS seguimiento_hilos");
    await S.asegurarTablasSeguimiento(pool);
    await fn(pool);
  } finally {
    await pool.query("DROP TABLE IF EXISTS seguimiento_hilos").catch(() => {});
    await pool.end();
  }
};

test("sincronizar: incremental por historyId, detecta respuestas y pospone/descarta", async () => {
  await conBase(async (db) => {
    const gmail = {
      t1: { threadId: "t1", historyId: "1", mensajes: [msg({ id: "a1", fecha: AHORA - 8 * DIA })] },
      t2: { threadId: "t2", historyId: "5", mensajes: [msg({ id: "b1", para: "Planta <planta@conoflex.com.ar>", fecha: AHORA - 8 * DIA })] },
      t3: { threadId: "t3", historyId: "9", mensajes: [msg({ id: "c1", para: "ana@obra.com", fecha: AHORA - 10 * DIA }), msg({ id: "c2", enviado: false, de: "ana@obra.com", fecha: AHORA - 9 * DIA })] },
    };
    let lecturas = 0;
    const deps = {
      miEmail: async () => YO,
      listarEnviados: async () => Object.values(gmail).map((h) => ({ threadId: h.threadId, historyId: h.historyId })),
      leerHilo: async (id) => { lecturas++; return gmail[id]; },
    };
    let r = await S.sincronizar({ db, deps, ahoraMs: AHORA });
    assert.equal(lecturas, 3);
    assert.equal(r.nuevos, 1);
    assert.equal(r.ignorados, 1);
    // segunda pasada sin novedades en Gmail: cero lecturas
    lecturas = 0;
    r = await S.sincronizar({ db, deps, ahoraMs: AHORA });
    assert.equal(lecturas, 0);
    assert.equal(r.sin_cambios, 3);
    const esperando = await S.listar(db, { ahoraMs: AHORA });
    assert.deepEqual(esperando.map((x) => x.thread_id), ["t1"]);
    assert.equal(esperando[0].dias, 8);

    // el cliente contesta: cambia el historyId y el hilo pasa a respondido
    gmail.t1 = { threadId: "t1", historyId: "2", mensajes: [msg({ id: "a1", fecha: AHORA - 8 * DIA }), msg({ id: "a2", enviado: false, de: "carlos@vial.com", fecha: AHORA - DIA })] };
    r = await S.sincronizar({ db, deps, ahoraMs: AHORA });
    assert.equal(r.respondidos, 1);
    assert.equal((await S.listar(db, { ahoraMs: AHORA })).length, 0);
    assert.equal((await S.conteos(db, { ahoraMs: AHORA })).respondidos_30d, 2); // t1 y t3 (que ya estaba respondido al verlo)

    // nuevo mail nuestro, sin respuesta; se descarta y no vuelve a molestar hasta que haya novedades
    gmail.t1 = { threadId: "t1", historyId: "3", mensajes: [...gmail.t1.mensajes, msg({ id: "a3", fecha: AHORA - 6 * DIA + 7 * DIA - 2 * DIA })] };
    await S.sincronizar({ db, deps, ahoraMs: AHORA });
    assert.equal((await S.listar(db, { ahoraMs: AHORA }))[0].ultimo_msg_id, "a3");
    assert.equal((await S.descartar(db, { threadId: "t1", usuario: "Andrés" })).ok, true);
    await db.query("UPDATE seguimiento_hilos SET history_id = '0' WHERE thread_id = 't1'"); // fuerza releer sin novedades reales
    await S.sincronizar({ db, deps, ahoraMs: AHORA });
    assert.equal((await S.listar(db, { ahoraMs: AHORA })).length, 0);
    assert.equal((await S.obtener(db, "t1")).estado, "DESCARTADO");
    assert.equal((await S.reabrir(db, { threadId: "t1", usuario: "Andrés" })).ok, true);
    assert.equal((await S.listar(db, { ahoraMs: AHORA })).length, 1);
    const p = await S.posponer(db, { threadId: "carlos", dias: 3, usuario: "Andrés" });
    assert.equal(p.ok, true);
    assert.equal((await S.conteos(db, { ahoraMs: AHORA })).pospuestos, 1);
  });
});

test("sincronizar: los hilos que salen de la ventana quedan vencidos y se lee de a tandas", async () => {
  await conBase(async (db) => {
    const viejo = { threadId: "v1", historyId: "1", mensajes: [msg({ id: "v", fecha: AHORA - 20 * DIA })] };
    const deps = { miEmail: async () => YO, listarEnviados: async () => [{ threadId: "v1", historyId: "1" }], leerHilo: async () => viejo };
    await S.sincronizar({ db, deps, ahoraMs: AHORA, ventanaDias: 45 });
    // la ventana se achica: el hilo ya no aparece en la lista y es más viejo que la ventana
    deps.listarEnviados = async () => [];
    const r = await S.sincronizar({ db, deps, ahoraMs: AHORA, ventanaDias: 10 });
    assert.equal(r.vencidos, 1);
    assert.equal((await S.obtener(db, "v1")).estado, "VENCIDO");
  });
});

test("prepararSeguimiento: deja un borrador, no repite y no insiste con hilos respondidos", async () => {
  await conBase(async (db) => {
    await db.query("INSERT INTO seguimiento_hilos (thread_id, history_id, asunto, contacto_email, contacto_nombre, ultimo_msg_id, ultimo_de, ultimo_nuestro_en, estado, clase) VALUES ('p1','1','Presupuesto conos','carlos@vial.com','Carlos','m1','NOSOTROS',?, 'ESPERANDO','PRESUPUESTO')", [new Date(AHORA - 6 * DIA).toISOString().slice(0, 19).replace("T", " ")]);
    let creados = 0;
    const deps = {
      historialHilo: async () => [{ enviado: true, fecha: "2026-10-26", texto: "Adjunto el presupuesto de 100 conos." }],
      crearBorradorEnHilo: async (x) => { creados++; assert.equal(x.para, "carlos@vial.com"); assert.match(x.html, /<p>/); return { draftId: "dr1" }; },
    };
    const ai = { models: { generateContent: async () => ({ text: "Hola Carlos, ¿pudieron revisar el presupuesto que les enviamos? Quedamos a disposición para cualquier duda. Saludos, equipo de ventas de Conoflex." }) } };
    const r = await S.prepararSeguimiento({ db, deps, ai, threadId: "p1" });
    assert.equal(r.ok, true);
    assert.equal(creados, 1);
    assert.equal((await S.prepararSeguimiento({ db, deps, ai, threadId: "p1" })).yaEstaba, true);
    assert.equal(creados, 1);
    await db.query("UPDATE seguimiento_hilos SET estado = 'RESPONDIDO', borrador_id = NULL WHERE thread_id = 'p1'");
    assert.equal((await S.prepararSeguimiento({ db, deps, ai, threadId: "p1" })).ok, false);
    assert.equal((await S.prepararSeguimiento({ db, deps, ai, threadId: "nadie" })).ok, false);
  });
});

test("clasificarPendientes: reglas sin IA y afinado con IA, una sola vez por mail", async () => {
  await conBase(async (db) => {
    const ts = new Date(AHORA - 6 * DIA).toISOString().slice(0, 19).replace("T", " ");
    await db.query("INSERT INTO seguimiento_hilos (thread_id, asunto, ultimo_msg_id, ultimo_nuestro_en, estado) VALUES ('c1','Presupuesto','m1',?, 'ESPERANDO'), ('c2','Consulta','m2',?, 'ESPERANDO')", [ts, ts]);
    const deps = { textoMensaje: async (t) => (t === "c1" ? "Le enviamos la cotización: $ 1.200 más IVA" : "¿Podrían confirmarnos la dirección?") };
    let r = await S.clasificarPendientes({ db, deps, ahoraMs: AHORA });
    assert.equal(r.clasificados, 2);
    const [filas] = await db.query("SELECT thread_id, clase FROM seguimiento_hilos ORDER BY thread_id");
    assert.deepEqual(filas.map((f) => f.clase), ["PRESUPUESTO", "CONSULTA"]);
    r = await S.clasificarPendientes({ db, deps, ahoraMs: AHORA });
    assert.equal(r.clasificados, 0);
    // con IA: usa su clase y su resumen
    await db.query("UPDATE seguimiento_hilos SET clase_msg_id = NULL");
    const ai = { models: { generateContent: async () => ({ text: '[{"n":0,"clase":"OTRO","resumen":"Aviso de entrega"},{"n":1,"clase":"CONSULTA","resumen":"Pedimos la dirección"}]' }) } };
    r = await S.clasificarPendientes({ db, deps, ai, ahoraMs: AHORA });
    assert.equal(r.con_ia, true);
    const [[uno]] = await db.query("SELECT clase, que_enviamos FROM seguimiento_hilos WHERE thread_id IN ('c1','c2') ORDER BY ultimo_nuestro_en DESC, thread_id LIMIT 1");
    assert.ok(uno.que_enviamos);
  });
});

test("Sofi: no tiene ninguna herramienta para enviar y su regla es dejar solo borradores", () => {
  const { HERRAMIENTAS, construirInstrucciones } = require("../agentes/seguimientoChat");
  const nombres = HERRAMIENTAS[0].functionDeclarations.map((f) => f.name);
  assert.ok(nombres.includes("preparar_seguimiento"));
  assert.ok(!nombres.some((n) => /enviar|send|mandar/i.test(n)));
  assert.match(construirInstrucciones(), /NUNCA enviás mails/);
  const { AGENTES } = require("../agentes");
  const sofi = AGENTES.find((a) => a.id === "seguimiento");
  assert.equal(sofi.permiso, "agente:seguimiento");
  assert.equal(new Set(AGENTES.map((a) => a.voz)).size, AGENTES.length);
});

test("revisarSeguimiento: avisos por hilo, notificación y cierre cuando el cliente responde", async () => {
  await conBase(async (db) => {
    const { asegurarTablasAgentes, revisarSeguimiento } = require("../agentes");
    const { asegurarTablasNotificaciones } = require("../notificaciones");
    await db.query("CREATE TABLE IF NOT EXISTS permisos_roles (rol_nombre VARCHAR(30), modulo_id VARCHAR(60))");
    await asegurarTablasNotificaciones(db);
    await asegurarTablasAgentes(db);
    await db.query("DELETE FROM agentes_hallazgos WHERE agente = 'seguimiento'");
    await db.query("DELETE FROM agentes_estado WHERE agente = 'seguimiento'");
    const gmail = { t1: { threadId: "t1", historyId: "1", mensajes: [msg({ id: "a1", fecha: AHORA - 8 * DIA, snippet: "Adjunto presupuesto: $ 120.000 más IVA" })] } };
    const deps = {
      miEmail: async () => YO,
      listarEnviados: async () => Object.values(gmail).map((h) => ({ threadId: h.threadId, historyId: h.historyId })),
      leerHilo: async (id) => gmail[id],
      textoMensaje: async () => "Adjunto presupuesto: $ 120.000 más IVA",
    };
    const r = await revisarSeguimiento({ db, ai: null, seguimiento: deps }, { ahora: new Date(AHORA) });
    assert.equal(r.ok, true);
    assert.equal(r.nuevos, 1);
    const [[h]] = await db.query("SELECT tipo, severidad, titulo FROM agentes_hallazgos WHERE agente = 'seguimiento' AND estado = 'ABIERTO'");
    assert.equal(h.tipo, "PRESUPUESTO_SIN_RESPUESTA");
    assert.equal(h.severidad, "ALTA");
    // la segunda revisión no repite el aviso ni relee Gmail
    const r2 = await revisarSeguimiento({ db, ai: null, seguimiento: deps }, { ahora: new Date(AHORA) });
    assert.equal(r2.nuevos, 0);
    assert.equal(r2.gmail.leidos, 0);
    // el cliente responde
    gmail.t1 = { threadId: "t1", historyId: "2", mensajes: [...gmail.t1.mensajes, msg({ id: "a2", enviado: false, de: "carlos@vial.com", fecha: AHORA - DIA })] };
    const r3 = await revisarSeguimiento({ db, ai: null, seguimiento: deps }, { ahora: new Date(AHORA) });
    assert.equal(r3.resueltos, 1);
    assert.equal(r3.abiertos, 0);
    await db.query("DELETE FROM agentes_hallazgos WHERE agente = 'seguimiento'");
  });
});

test("Sofi sin responder: cliente que escribió y nadie contestó; ignora automáticos, internos y lo ya respondido", () => {
  const SR = require("../agentes/sinResponder");
  const ahora = Date.now();
  const m = (o) => ({ id: "m" + Math.random(), fecha: ahora - 2 * 86400000, de: "Juan Pérez <juan@cliente.com>", para: "ventas@conoflex.com", asunto: "Cotización conos", enviado: false, borrador: false, automatico: false, snippet: "Hola, necesito precios", ...o });
  const yo = "ventas@conoflex.com";
  const a = SR.analizarEntrante({ threadId: "t1", mensajes: [m({})] }, { miEmail: yo });
  assert.strictEqual(a.contacto_email, "juan@cliente.com");
  assert.strictEqual(a.contacto_nombre, "Juan Pérez");
  // ya contestamos
  assert.strictEqual(SR.analizarEntrante({ threadId: "t", mensajes: [m({}), m({ enviado: true, fecha: ahora - 86400000, de: yo })] }, { miEmail: yo }), null);
  // respuesta automática del cliente no cuenta, pero lo anterior sí
  assert.ok(SR.analizarEntrante({ threadId: "t", mensajes: [m({}), m({ automatico: true, fecha: ahora - 3600000 })] }, { miEmail: yo }));
  // no-reply e interno
  assert.strictEqual(SR.analizarEntrante({ threadId: "t", mensajes: [m({ de: "noreply@banco.com" })] }, { miEmail: yo }), null);
  assert.strictEqual(SR.analizarEntrante({ threadId: "t", mensajes: [m({ de: "Colega <colega@conoflex.com>" })] }, { miEmail: yo }), null);
  assert.strictEqual(SR.severidadEntrante(5), "BAJA");
  assert.strictEqual(SR.severidadEntrante(30), "MEDIA");
  assert.strictEqual(SR.severidadEntrante(80), "ALTA");
  const h = SR.armarHallazgos([{ ...a, ultimo_ms: ahora - 80 * 3600000 }], { ahoraMs: ahora })[0];
  assert.strictEqual(h.tipo, "CLIENTE_SIN_RESPUESTA");
  assert.match(h.clave, /^sinres:t1:/);
});
