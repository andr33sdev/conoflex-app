"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { analizarRRHH, feriadosEfectivos } = require("../agentes/vigilanteRRHH");
const { REGLAS_CONNIE } = require("../agentes/reglasLiquidacion");
const { HERRAMIENTAS_LIQUIDACION } = require("../agentes/herramientasLiquidacion");
const { construirInstrucciones, HERRAMIENTAS } = require("../agentes/liaChat");
const { agentePorId, ahoraArgentina } = require("../agentes");

const SRC_CONNIE = fs.readFileSync(path.join(__dirname, "..", "connie.js"), "utf8");

test("las reglas de liquidación de Lía son textuales a las de Connie (si Connie cambia, hay que revisar la copia)", () => {
  for (const linea of REGLAS_CONNIE) {
    // En connie.js el texto está dentro de un template literal (con \" escapadas): se compara sin barras.
    assert.ok(SRC_CONNIE.replace(/\\/g, "").includes(linea.replace(/\\/g, "")), `Connie ya no tiene esta regla: ${linea.slice(0, 80)}…`);
  }
});

test("las herramientas de liquidación son las mismas que las de Connie", () => {
  assert.deepEqual(HERRAMIENTAS_LIQUIDACION.map((h) => h.name), ["liquidar_horas", "simular_turno", "calculadora"]);
  for (const h of HERRAMIENTAS_LIQUIDACION) assert.ok(SRC_CONNIE.includes(`name: "${h.name}"`));
});

test("Lía no tiene herramientas de otras áreas (SQL libre, demanda, rentabilidad, gráficos)", () => {
  const nombres = HERRAMIENTAS[0].functionDeclarations.map((f) => f.name).sort();
  assert.deepEqual(nombres, ["avisos_abiertos", "calculadora", "liquidar_horas", "proximos_feriados", "simular_turno"]);
  const t = construirInstrucciones();
  assert.match(t, /única y exclusiva/);
  assert.match(t, /PRESENTISMO:/);
  assert.match(t, /REGLA DE ORO con liquidar_horas/);
});

test("el agente de RRHH existe, se llama Lía y tiene su propio permiso", () => {
  const a = agentePorId("rrhh");
  assert.equal(a.nombre, "Lía");
  assert.equal(a.permiso, "agente:rrhh");
  assert.equal(agentePorId("nada"), null);
});

test("ahoraArgentina devuelve la fecha de Argentina", () => {
  assert.equal(ahoraArgentina(new Date("2026-10-30T02:30:00Z")).hoy, "2026-10-29"); // 23:30 del 29 en Argentina
  assert.equal(ahoraArgentina(new Date("2026-10-30T15:00:00Z")).hoy, "2026-10-30");
});

// ---------------------------------------------------------------------------
// Vigilante
// ---------------------------------------------------------------------------
const HOY = "2026-10-30"; // viernes
const AHORA = new Date(2026, 9, 30, 15, 0).getTime();
const pad = (n) => String(n).padStart(2, "0");
const diasHabiles = (desde, hasta) => {
  const out = [];
  for (let d = new Date(desde + "T00:00:00"); d <= new Date(hasta + "T00:00:00"); d.setDate(d.getDate() + 1)) {
    if (d.getDay() >= 1 && d.getDay() <= 5) out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return out;
};
const FERIADOS = new Map([["2026-10-12", "Día del Respeto a la Diversidad Cultural"], ["2026-11-06", "Feriado puente"]]);
const marca = (nombre, tipo, fecha, hora) => ({ nombre, tipo, fecha_hora: new Date(`${fecha}T${hora}:00`) });
const normal = (nombre, ingreso = "07:00", saltear = []) =>
  diasHabiles("2026-09-14", "2026-10-29")
    .filter((f) => !FERIADOS.has(f) && !saltear.includes(f))
    .flatMap((f) => [marca(nombre, "ENTRADA", f, ingreso), marca(nombre, "SALIDA", f, "16:00")]);
const conTarde = (nombre, fechasTarde) =>
  diasHabiles("2026-09-14", "2026-10-29").filter((f) => !FERIADOS.has(f)).flatMap((f) => [marca(nombre, "ENTRADA", f, fechasTarde.includes(f) ? "07:10" : "07:00"), marca(nombre, "SALIDA", f, "16:00")]);
const analizar = (fichadas, extra = {}) =>
  analizarRRHH({ hoy: HOY, ahoraMs: AHORA, fichadas, feriados: FERIADOS, categorias: new Map(["Ana", "Beto", "Carla", "Dani", "Eli"].map((n) => [n, "OP1"])), ...extra });
const tipos = (h, tipo) => h.filter((x) => x.tipo === tipo);

test("un operario puntual y regular no genera avisos propios", () => {
  const h = analizar(normal("Ana"));
  assert.deepEqual(h.filter((x) => x.operario === "Ana"), []);
});

test("la tercera llegada tarde del mes hace perder el presentismo", () => {
  const h = analizar(conTarde("Beto", ["2026-10-05", "2026-10-13", "2026-10-21"]));
  const p = tipos(h, "PRESENTISMO_PERDIDO");
  assert.equal(p.length, 1);
  assert.equal(p[0].operario, "Beto");
  assert.equal(p[0].severidad, "ALTA");
  assert.match(p[0].texto, /tercera fue el miércoles 21\/10/);
  assert.equal(tipos(h, "PRESENTISMO_RIESGO").length, 0);
});

test("con dos llegadas tarde avisa que una más y pierde el presentismo", () => {
  const h = analizar(conTarde("Carla", ["2026-10-05", "2026-10-13"]));
  assert.equal(tipos(h, "PRESENTISMO_RIESGO")[0].operario, "Carla");
  assert.equal(tipos(h, "PRESENTISMO_PERDIDO").length, 0);
});

test("una llegada dentro de los 5 minutos no cuenta como tarde", () => {
  const h = analizar(conTarde("Carla", []).map((m) => (m.tipo === "ENTRADA" ? { ...m, fecha_hora: new Date(m.fecha_hora.getTime() + 5 * 60000) } : m)));
  assert.equal(tipos(h, "PRESENTISMO_RIESGO").length + tipos(h, "PRESENTISMO_PERDIDO").length, 0);
});

test("ingreso sin salida de hace más de un día se avisa; el turno en curso no", () => {
  const f = [...normal("Dani"), marca("Dani", "ENTRADA", "2026-10-29", "07:00")].filter((m) => !(m.tipo === "SALIDA" && m.fecha_hora.getDate() === 29 && m.fecha_hora.getMonth() === 9));
  const h = analizar(f);
  const s = tipos(h, "SIN_SALIDA").filter((x) => x.operario === "Dani");
  assert.equal(s.length, 1);
  assert.equal(s[0].fecha, "2026-10-29");
  const hoyEnCurso = analizar([...normal("Dani"), marca("Dani", "ENTRADA", HOY, "07:00")]);
  assert.equal(tipos(hoyEnCurso, "SIN_SALIDA").length, 0);
});

test("una salida sin ingreso se avisa como ingreso no fichado, y no como falta", () => {
  const f = [...normal("Eli", "07:00", ["2026-10-28"]), marca("Eli", "SALIDA", "2026-10-28", "16:00")];
  const h = analizar(f);
  assert.equal(tipos(h, "SIN_INGRESO").filter((x) => x.operario === "Eli")[0].fecha, "2026-10-28");
  assert.equal(tipos(h, "POSIBLE_FALTA").filter((x) => x.operario === "Eli").length, 0);
});

test("un día laborable sin fichadas de alguien regular es una posible falta (con recordatorio de justificar)", () => {
  const h = analizar(normal("Ana", "07:00", ["2026-10-27"]));
  const f = tipos(h, "POSIBLE_FALTA").filter((x) => x.operario === "Ana");
  assert.equal(f.length, 1);
  assert.equal(f[0].fecha, "2026-10-27");
  assert.match(f[0].texto, /justificarla/);
});

test("un feriado no cuenta como falta, ni el fin de semana, ni quien no viene regularmente", () => {
  const h = analizar(normal("Ana"));
  assert.equal(tipos(h, "POSIBLE_FALTA").length, 0);
  const pocoRegular = diasHabiles("2026-09-14", "2026-09-18").flatMap((f) => [marca("Nuevo", "ENTRADA", f, "07:00"), marca("Nuevo", "SALIDA", f, "16:00")]);
  assert.equal(tipos(analizar(pocoRegular), "POSIBLE_FALTA").length, 0);
});

test("avisa los feriados de los próximos 14 días y dice que se liquidan al 100%", () => {
  const h = tipos(analizar(normal("Ana")), "FERIADO");
  assert.equal(h.length, 1);
  assert.equal(h[0].fecha, "2026-11-06");
  assert.match(h[0].texto, /100%/);
  assert.match(h[0].titulo, /viernes 06\/11/);
});

test("los feriados de fecha fija se conocen aunque no estén en la tabla", () => {
  const m = feriadosEfectivos(new Map(), "2026-12-01", "2026-12-31");
  assert.equal(m.get("2026-12-08"), "Inmaculada Concepción de María");
  assert.equal(m.get("2026-12-25"), "Navidad");
  assert.equal(feriadosEfectivos(new Map([["2026-12-25", "Navidad (tabla)"]]), "2026-12-01", "2026-12-31").get("2026-12-25"), "Navidad (tabla)");
});

test("quien ficha sin categoría se avisa (su liquidación saldría en $0)", () => {
  const h = analizar(normal("Ana"), { categorias: new Map() });
  assert.equal(tipos(h, "SIN_CATEGORIA")[0].operario, "Ana");
});

test("a fin de mes avisa el cierre de la segunda quincena; a mitad, el de la primera", () => {
  const fin = tipos(analizar(normal("Ana")), "CIERRE_QUINCENA");
  assert.equal(fin.length, 1);
  assert.match(fin[0].clave, /^cierre:2026-10-q2$/);
  const mitad = tipos(analizarRRHH({ hoy: "2026-10-15", ahoraMs: new Date(2026, 9, 15, 12).getTime(), fichadas: [], feriados: FERIADOS }), "CIERRE_QUINCENA");
  assert.match(mitad[0].clave, /^cierre:2026-10-q1$/);
});

test("las claves son estables (el mismo aviso no se repite entre revisiones)", () => {
  const f = conTarde("Beto", ["2026-10-05", "2026-10-13", "2026-10-21"]);
  assert.deepEqual(analizar(f).map((h) => h.clave), analizar(f).map((h) => h.clave));
});

test("voz: el WAV tiene cabecera válida y solo voces femeninas", () => {
  const { pcmAWav, frecuenciaDe, VOCES_FEMENINAS, VOZ_DEFECTO } = require("../agentes/voz");
  const pcm = Buffer.alloc(4800, 1);
  const wav = pcmAWav(pcm, 24000);
  assert.equal(wav.length, 44 + 4800);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt32LE(40), 4800);
  assert.equal(frecuenciaDe("audio/L16;codec=pcm;rate=24000"), 24000);
  assert.equal(frecuenciaDe("audio/L16;rate=16000"), 16000);
  assert.ok(VOCES_FEMENINAS.includes(VOZ_DEFECTO));
  assert.ok(!VOCES_FEMENINAS.some((v) => ["Puck", "Charon", "Fenrir", "Orus", "Enceladus", "Iapetus", "Algenib", "Rasalgethi", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Sadachbia", "Sadaltager", "Umbriel", "Laomedeia", "Erinome Male"].includes(v)));
});

test("voz: pide audio al modelo con voz femenina y arma el WAV", async () => {
  const { sintetizar } = require("../agentes/voz");
  let pedido;
  const ai = { models: { generateContent: async (p) => { pedido = p; return { candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: Buffer.alloc(960, 2).toString("base64") } }] } }] }; } } };
  const wav = await sintetizar(ai, "Hola, soy Lía.");
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.deepEqual(pedido.config.responseModalities, ["AUDIO"]);
  assert.equal(pedido.config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Leda");
  await assert.rejects(() => sintetizar(ai, "   "), /Sin texto/);
});

test("pdf: la liquidación individual y la del plantel generan PDFs válidos (varias páginas si hace falta)", () => {
  const { pdfLiquidacion, ancho } = require("../agentes/pdf");
  const dias = Array.from({ length: 60 }, (_, i) => ({ fecha: `2026-10-${String(1 + (i % 28)).padStart(2, "0")}`, dia: "jueves", ingreso: "06:55", egreso: "15:05", horas_normales: 8, horas_extra: 0.17, importe: 81234.5 }));
  const r = { operario: "Leonel Montoya", categoria: "Oficial", pago: { tipo: "por hora", valor_hora_ordinaria: 8500 }, resumen: { horas_normales: 180, horas_extra: 94.5, horas_totales: 274.5, valor_normales: 1530090, valor_extras: 1602889.18, total: 3132979.18 }, presentismo: { pierde_presentismo: false }, dias, liquidacion_de: "octubre de 2026", informe: "" };
  const pdf = pdfLiquidacion(r);
  assert.equal(pdf.toString("latin1", 0, 8), "%PDF-1.4");
  assert.match(pdf.toString("latin1", pdf.length - 8), /%%EOF/);
  assert.match(pdf.toString("latin1"), /\/Count [2-9]/);
  const plantel = pdfLiquidacion({ liquidacion_de: "octubre", operarios: [{ operario: "Ana", categoria: "X", resumen: { horas_normales: 1, horas_extra: 2, total: 3 } }], informe: "" });
  assert.match(plantel.toString("latin1"), /\/Count 1/);
  assert.ok(ancho("Hola", 10) > 15 && ancho("Hola", 10) < 30);
});

test("lía: el prompt pide primera línea corta y markdown prolijo; la liquidación guarda los parámetros para el PDF", () => {
  const { parametrosPDF } = require("../agentes/liaChat");
  assert.match(construirInstrucciones(), /PRIMERA LÍNEA/);
  assert.match(construirInstrucciones(), /tabla markdown/);
  assert.deepEqual(parametrosPDF({ operario: "Juan", mes: "2026-10", quincena: 1, basura: "x", solo_extras: true }), { operario: "Juan", mes: "2026-10", quincena: 1, solo_extras: true });
});

// ---------- Nati (stock) ----------
const { analizarStock, armarPanorama } = require("../agentes/vigilanteStock");
const AHORA_N = new Date("2026-10-30T12:00:00").getTime();
const mp = (id, nombre, stock, demanda, dias) => ({ id, codigo: `C${id}`, nombre, unidad: "KILOS", stock_actual: stock, demanda_mensual: demanda, dias_de_stock: dias });

test("nati: detecta críticas, bajas, exceso y stock negativo; ignora lo que no tiene demanda", () => {
  const h = analizarStock({
    ahoraMs: AHORA_N,
    mps: [mp(1, "PEAD", 100, 600, 5), mp(2, "Masterbatch", 500, 1000, 15), mp(3, "Pigmento", 9000, 300, 900), mp(4, "Tinta", -20, 10, null), mp(5, "Sin uso", 50, 0, null), mp(6, "OK", 900, 600, 45)],
  });
  const por = Object.fromEntries(h.map((x) => [x.tipo, x]));
  assert.equal(por.MP_CRITICA.severidad, "ALTA");
  assert.match(por.MP_CRITICA.titulo, /PEAD: alcanza para 5 días/);
  assert.equal(por.MP_CRITICA.fecha, "2026-11-04");
  assert.match(por.MP_CRITICA.texto, /No hay ninguna compra en curso/);
  assert.equal(por.MP_BAJA.severidad, "MEDIA");
  assert.equal(por.MP_EXCESO.severidad, "BAJA");
  assert.equal(por.STOCK_NEGATIVO.severidad, "ALTA");
  assert.equal(h.length, 4);
});

test("nati: si hay una compra en curso lo dice, y las claves son estables", () => {
  const datos = { ahoraMs: AHORA_N, mps: [mp(1, "PEAD", 100, 600, 5)], compras: [{ id: 7, materia_prima_id: 1, articulo: "PEAD", proveedor: "Dow", cantidad_solicitada: 2000, cantidad_recibida: 500, creada: "2026-10-20 10:00:00" }] };
  const a = analizarStock(datos);
  assert.match(a[0].texto, /compra en curso con Dow por 1\.500/);
  assert.deepEqual(analizarStock(datos).map((x) => x.clave), a.map((x) => x.clave));
});

test("nati: pedidos internos demorados y compras sin recibir hace semanas", () => {
  const h = analizarStock({
    ahoraMs: AHORA_N,
    internas: [
      { id: "SI-1", semielaborado_nombre: "Base 33", cantidad_solicitada: 40, urgencia: "ALTA", estado: "SOLICITADO", solicitado_at: "2026-10-30 08:00:00" },
      { id: "SI-2", semielaborado_nombre: "Base 26", cantidad_solicitada: 10, urgencia: "MEDIA", estado: "SOLICITADO", solicitado_at: "2026-10-30 11:00:00" },
      { id: "SI-3", semielaborado_nombre: "Base 37", cantidad_solicitada: 10, urgencia: "ALTA", estado: "ENTREGADO", solicitado_at: "2026-10-01 11:00:00" },
    ],
    compras: [{ id: 9, materia_prima_id: null, articulo: "Caja", proveedor: "X", cantidad_solicitada: 100, cantidad_recibida: 0, creada: "2026-10-01 09:00:00" }],
  });
  assert.deepEqual(h.map((x) => x.tipo).sort(), ["COMPRA_DEMORADA", "INTERNA_DEMORADA"]);
  assert.equal(h.find((x) => x.tipo === "INTERNA_DEMORADA").severidad, "ALTA");
});

test("nati: el panorama ordena lo más urgente primero y cuenta los niveles", () => {
  const p = armarPanorama({
    ahoraMs: AHORA_N,
    mps: [mp(1, "OK", 900, 600, 45), mp(2, "Crítica", 50, 600, 2), mp(3, "Baja", 300, 600, 15)],
    semis: [{ codigo: "S1", nombre: "Semi", stock_total: 10, demanda_mensual: 300, dias_de_stock: 1 }],
    series: new Map([[2, [0, 1, 2]]]),
  });
  assert.deepEqual(p.materias.map((m) => m.nombre), ["Crítica", "Baja", "OK"]);
  assert.equal(p.resumen.criticas, 1);
  assert.equal(p.resumen.bajas, 1);
  assert.equal(p.resumen.semis_criticos, 1);
  assert.deepEqual(p.materias[0].serie, [0, 1, 2]);
});

test("nati: sus instrucciones la acotan al stock y las herramientas son solo de lectura", () => {
  const { construirInstrucciones: instr, HERRAMIENTAS: H } = require("../agentes/natiChat");
  assert.match(instr(), /SOLO LEÉS/);
  assert.match(instr([{ id: "rrhh", nombre: "Lía", puesto: "RRHH" }]), /derivar_a_agente/);
  const nombres = H[0].functionDeclarations.map((f) => f.name);
  assert.ok(nombres.includes("que_comprar") && nombres.includes("panorama_stock"));
  assert.ok(!nombres.some((n) => /^(crear|modificar|cargar|descontar|comprar)_/.test(n)));
});

test("derivaciones: el motor deriva solo a agentes habilitados", async () => {
  const { crearMotor } = require("../agentes/motorChat");
  let ronda = 0;
  const ai = { models: { generateContent: async (p) => {
    ronda++;
    if (ronda === 1) { assert.ok(p.config.tools[0].functionDeclarations.some((f) => f.name === "derivar_a_agente")); return { functionCalls: [{ name: "derivar_a_agente", args: { agente: "stock", pregunta: "¿Cuánto PEAD queda?", motivo: "es de stock" } }], candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "derivar_a_agente", args: {} } }] } }] }; }
    return { text: "Se lo paso a Nati.", candidates: [{ content: { parts: [{ text: "Se lo paso a Nati." }] } }] };
  } } };
  const m = crearMotor({ ai, nombre: "T", construirInstrucciones: () => "x", herramientas: [{ functionDeclarations: [] }], ejecutar: async () => ({}) });
  const r = await m.responder({ mensaje: "hola", historial: [], destinos: [{ id: "stock", nombre: "Nati", puesto: "Stock" }] });
  assert.equal(r.derivacion.agente, "stock");
  assert.equal(r.derivacion.pregunta, "¿Cuánto PEAD queda?");
  // Sin destinos, la herramienta ni siquiera existe
  ronda = 1;
  const ai2 = { models: { generateContent: async (p) => { assert.ok(!p.config.tools[0].functionDeclarations.some((f) => f.name === "derivar_a_agente")); return { text: "ok", candidates: [{ content: { parts: [{ text: "ok" }] } }] }; } } };
  const r2 = await crearMotor({ ai: ai2, nombre: "T", construirInstrucciones: () => "x", herramientas: [{ functionDeclarations: [] }], ejecutar: async () => ({}) }).responder({ mensaje: "hola", historial: [], destinos: [] });
  assert.equal(r2.derivacion, null);
});
