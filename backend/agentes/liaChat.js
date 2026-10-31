"use strict";
// Chat de Lía, la agente de RRHH y liquidaciones. Usa el MISMO motor de IA que Connie (mismo cliente Gemini, mismo
// modelo y configuración de CONFIG de connie.js) y las MISMAS funciones de liquidación (liquidarDesdeBD / simularTurno),
// pero con un perfil acotado: solo liquidaciones, horas extra, fichadas, presentismo, feriados y faltas.
const { CONFIG, normalizarHistorial } = require("../connie");
const { liquidarDesdeBD, simularTurno } = require("../liquidacionDb");
const { calcular } = require("../calculadora");
const { feriadosEfectivos } = require("./vigilanteRRHH");
const { REGLAS_CONNIE } = require("./reglasLiquidacion");
const { HERRAMIENTAS_LIQUIDACION } = require("./herramientasLiquidacion");

// Lía responde con herramientas que ya hacen las cuentas: no necesita pensar tanto como Connie (más rápido).
const PENSAMIENTO = Number.isFinite(Number(process.env.AGENTES_PENSAMIENTO)) && process.env.AGENTES_PENSAMIENTO !== undefined && process.env.AGENTES_PENSAMIENTO !== "" ? Number(process.env.AGENTES_PENSAMIENTO) : 256;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function hoyArgentina() {
  const ahora = new Date();
  return {
    iso: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ahora),
    largo: ahora.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", year: "numeric", month: "long", day: "numeric" }),
  };
}

function construirInstrucciones() {
  const hoy = hoyArgentina();
  return `Sos Lía, la agente de RRHH y liquidaciones de Conoflex Argentina, una fábrica de productos plásticos de seguridad vial. Trabajás en la oficina de personas: liquidás sueldos y horas, vigilás las fichadas y avisás lo que hay que atender. Hablás con alguien de RRHH o de la dirección de la planta.

HOY es ${hoy.largo} (${hoy.iso}).

TU ESPECIALIDAD (única y exclusiva)
- Solo atendés: liquidación de sueldos y de horas (normales y extra), valor de las horas, simulación de turnos, fichadas (ingresos y salidas que faltan), presentismo, llegadas tarde, feriados y faltas (y recordar justificarlas si corresponde), y consultas generales de la ley laboral argentina sobre estos temas.
- Si te piden algo de otra área (ventas, stock, compras, producción, rentabilidad, gráficos de negocio, etc.), decí con amabilidad y en una línea que eso no es lo tuyo y que para eso está Connie o el agente de esa área. No lo resuelvas aunque sepas hacerlo. No uses ninguna herramienta para eso.
- Para saber qué avisos tenés abiertos usá la herramienta avisos_abiertos; para los próximos feriados, proximos_feriados. Nunca inventes avisos ni feriados.
- Todo número, nombre, día e importe sale textualmente del resultado de una herramienta.

${REGLAS_CONNIE.join("\n")}

CÓMO RESPONDER (el formato importa: la persona lee en un chat y quiere poco texto, muy prolijo)
- Español rioplatense, cálido, directo. Primero la respuesta, después el detalle. Nada de relleno ni repetir lo que ya dijiste.
- PRIMERA LÍNEA = una frase corta y natural (máx. 25 palabras) que resume lo que hiciste, como si la dijeras en voz alta: "Listo, te preparé la liquidación de Juan de la primera quincena." Esa línea se lee en voz alta, así que sin números largos, sin símbolos y sin listas.
- Si hay datos para mostrar, dejá una línea en blanco y mostralos en MARKDOWN prolijo:
  - Comparaciones o desgloses: tabla markdown (máx. 8 filas, columnas cortas). Para importes, alineá con la columna de la derecha.
  - Enumeraciones: lista con "- ", una idea por línea.
  - Respuestas largas: secciones con "### Título" (máx. 3) y **negrita** solo para cifras o nombres clave.
- Si hay mucha información, mostrá lo más importante (los primeros 5 a 8 renglones) y ofrecé el resto en una pregunta corta ("¿Querés el detalle día por día?"). Nunca vuelques todo.
- Cuando liquides horas, ofrecé en una línea final descargar el PDF ("Si querés te lo dejo en PDF"): la pantalla muestra el botón de descarga sola cuando liquidás.
- Algo que RRHH deba saber (presentismo perdido, fichada faltante, falta por justificar) va en una línea final que empiece con "Ojo:".
- Si te saludan o preguntan quién sos, presentate en una o dos frases y preguntá en qué ayudar. No enumeres funciones salvo que te lo pidan.
- Formato argentino: miles con punto y decimales con coma ($ 1.234.567,89). Aclará unidad y período.
- No sos abogada ni contadora: en temas con consecuencias legales sugerí confirmar con el contador o un abogado laboralista.`;
}

const HERRAMIENTAS = [
  {
    functionDeclarations: [
      ...HERRAMIENTAS_LIQUIDACION,
      {
        name: "avisos_abiertos",
        description:
          "Lista los avisos que tu vigilante detectó y siguen abiertos: presentismo perdido o en riesgo, fichadas de ingreso o salida faltantes, posibles faltas por justificar, operarios sin categoría, feriados próximos y cierres de quincena.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "proximos_feriados",
        description: "Devuelve los feriados de los próximos N días (por defecto 60): los de la tabla de Control Asistencia y los nacionales de fecha fija.",
        parameters: { type: "OBJECT", properties: { dias: { type: "INTEGER", description: "Cantidad de días hacia adelante (1 a 365). Por defecto 60." } } },
      },
    ],
  },
];

const PALABRAS_HERRAMIENTA = {
  liquidar_horas: "Liquidó horas",
  simular_turno: "Simuló un turno",
  calculadora: "Hizo una cuenta",
  avisos_abiertos: "Revisó sus avisos",
  proximos_feriados: "Consultó los feriados",
};

/** @param {{pool:any, db:any, ai:any}} deps  pool = el mismo pool de solo lectura de Connie. */
function crearLia({ pool, db, ai }) {
  async function llamarModelo(contents, instrucciones, { conHerramientas }) {
    const config = {
      systemInstruction: instrucciones,
      temperature: 0.2,
      httpOptions: { timeout: CONFIG.tiempoLlamadaModeloMs },
      tools: HERRAMIENTAS,
      thinkingConfig: { thinkingBudget: PENSAMIENTO },
    };
    if (!conHerramientas) config.toolConfig = { functionCallingConfig: { mode: "NONE" } };
    const intentar = () => ai.models.generateContent({ model: CONFIG.modelo, contents, config });
    try {
      return await intentar();
    } catch (error) {
      if (error && (error.status === 503 || error.status === 429)) {
        await esperar(1500);
        return intentar();
      }
      throw error;
    }
  }

  async function responder({ mensaje, historial }) {
    const inicio = Date.now();
    const instrucciones = construirInstrucciones();
    const contents = [...normalizarHistorial(historial, mensaje), { role: "user", parts: [{ text: mensaje }] }];
    const usadas = [];

    const ejecutar = async (llamada) => {
      const args = llamada.args || {};
      const uso = { nombre: llamada.name, texto: PALABRAS_HERRAMIENTA[llamada.name] || llamada.name, periodo: args.mes || args.desde || (args.fechas ? args.fechas.join(", ") : null), operario: args.operario || null, ok: true };
      if (llamada.name === "liquidar_horas") uso.args = parametrosPDF(args);
      usadas.push(uso);
      try {
        if (llamada.name === "liquidar_horas") {
          const r = await liquidarDesdeBD(pool, args);
          if (r?.error) uso.ok = false;
          return r;
        }
        if (llamada.name === "simular_turno") return await simularTurno(pool, args);
        if (llamada.name === "calculadora") return calcular(args.expresion);
        if (llamada.name === "avisos_abiertos") {
          const [rows] = await db.query(
            "SELECT tipo, severidad, titulo, texto, operario, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, estado FROM agentes_hallazgos WHERE agente = 'rrhh' AND estado = 'ABIERTO' ORDER BY FIELD(severidad,'ALTA','MEDIA','BAJA'), id DESC LIMIT 60",
          );
          return { cantidad: rows.length, avisos: rows };
        }
        if (llamada.name === "proximos_feriados") {
          const dias = Math.min(365, Math.max(1, Number(args.dias) || 60));
          const hoy = hoyArgentina().iso;
          const hasta = new Date(new Date(`${hoy}T00:00:00`).getTime() + dias * 86400000);
          const hastaIso = `${hasta.getFullYear()}-${String(hasta.getMonth() + 1).padStart(2, "0")}-${String(hasta.getDate()).padStart(2, "0")}`;
          const [rows] = await db.query("SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, descripcion FROM fichero_feriados");
          const mapa = feriadosEfectivos(new Map(rows.map((r) => [r.fecha, r.descripcion || ""])), hoy, hastaIso);
          const lista = [...mapa.entries()].filter(([f]) => f >= hoy && f <= hastaIso).sort().map(([fecha, descripcion]) => ({ fecha, descripcion }));
          return { desde: hoy, hasta: hastaIso, feriados: lista, nota: "Incluye los de la tabla de Control Asistencia y los nacionales de fecha fija; los trasladables o puentes solo aparecen si están cargados en la tabla." };
        }
        return { error: `Herramienta desconocida: ${llamada.name}` };
      } catch (e) {
        console.error(`[Lía ${llamada.name}]`, e.message);
        return { error: "No pude leer los datos para eso." };
      }
    };

    let respuesta;
    let rondas = 0;
    for (; rondas < CONFIG.maxRondas; rondas++) {
      if (Date.now() - inicio > CONFIG.tiempoTotalMs) break;
      respuesta = await llamarModelo(contents, instrucciones, { conHerramientas: true });
      const llamadas = respuesta.functionCalls;
      if (!llamadas || !llamadas.length) return finalizar(respuesta);
      contents.push(respuesta.candidates[0].content);
      const resultados = await Promise.all(llamadas.map(ejecutar));
      contents.push({ role: "user", parts: llamadas.map((l, i) => ({ functionResponse: { name: l.name, response: { resultado: resultados[i] } } })) });
    }
    respuesta = await llamarModelo(contents, instrucciones, { conHerramientas: false });
    return finalizar(respuesta);

    function finalizar(resp) {
      const texto = String(resp.text || "").replace(/\n{3,}/g, "\n\n").trim();
      return { respuesta: texto || "No pude armar una respuesta con los datos que tengo. ¿Me la repetís de otra forma?", herramientas: usadas, ms: Date.now() - inicio };
    }
  }

  return { responder };
}

/** Parámetros de una liquidación que alcanzan para volver a generarla en PDF (solo los conocidos y con tipos simples). */
function parametrosPDF(a = {}) {
  const o = {};
  for (const k of ["operario", "mes", "desde", "hasta"]) if (typeof a[k] === "string" && a[k]) o[k] = a[k].slice(0, 80);
  if (Number.isInteger(a.quincena)) o.quincena = a.quincena;
  if (a.solo_extras === true) o.solo_extras = true;
  if (a.solo_con_categoria === true) o.solo_con_categoria = true;
  if (Array.isArray(a.fechas)) o.fechas = a.fechas.filter((f) => typeof f === "string").slice(0, 40);
  return o;
}

module.exports = { parametrosPDF, crearLia, construirInstrucciones, HERRAMIENTAS };
