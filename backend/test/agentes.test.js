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
