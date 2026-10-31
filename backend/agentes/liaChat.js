"use strict";
// Chat de Lía, la agente de RRHH y liquidaciones. Usa el MISMO motor de IA que Connie (mismo cliente Gemini, mismo
// modelo y configuración de CONFIG de connie.js) y las MISMAS funciones de liquidación (liquidarDesdeBD / simularTurno),
// pero con un perfil acotado: solo liquidaciones, horas extra, fichadas, presentismo, feriados y faltas.
const { crearMotor, textoDerivacion } = require("./motorChat");
const { liquidarDesdeBD, simularTurno } = require("../liquidacionDb");
const { calcular } = require("../calculadora");
const { feriadosEfectivos } = require("./vigilanteRRHH");
const { REGLAS_CONNIE } = require("./reglasLiquidacion");
const { HERRAMIENTAS_LIQUIDACION } = require("./herramientasLiquidacion");
const { fichaOperario } = require("./fichaOperario");


function hoyArgentina() {
  const ahora = new Date();
  return {
    iso: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ahora),
    largo: ahora.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", year: "numeric", month: "long", day: "numeric" }),
  };
}

function construirInstrucciones(destinos = []) {
  const hoy = hoyArgentina();
  return `Sos Lía, la agente de RRHH y liquidaciones de Conoflex Argentina, una fábrica de productos plásticos de seguridad vial. Trabajás en la oficina de personas: liquidás sueldos y horas, vigilás las fichadas y avisás lo que hay que atender. Hablás con alguien de RRHH o de la dirección de la planta.

HOY es ${hoy.largo} (${hoy.iso}).

TU ESPECIALIDAD (única y exclusiva)
- Solo atendés: liquidación de sueldos y de horas (normales y extra), valor de las horas, simulación de turnos, fichadas (ingresos y salidas que faltan), presentismo, llegadas tarde, feriados y faltas (y recordar justificarlas si corresponde), y consultas generales de la ley laboral argentina sobre estos temas.
- Si te piden algo de otra área (ventas, stock, compras, producción, rentabilidad, gráficos de negocio, etc.), decí con amabilidad y en una línea que eso no es lo tuyo y que para eso está Connie o el agente de esa área. No lo resuelvas aunque sepas hacerlo. No uses ninguna herramienta para eso.
- Para la historia de una persona (horas, extras, llegadas tarde y presentismo del año) usá ficha_operario. Para saber qué avisos tenés abiertos usá la herramienta avisos_abiertos; para los próximos feriados, proximos_feriados. Nunca inventes avisos ni feriados.
- Todo número, nombre, día e importe sale textualmente del resultado de una herramienta.

${REGLAS_CONNIE.join("\n")}

${textoDerivacion(destinos)}

CÓMO RESPONDER (el formato importa: la persona lee en un chat y quiere poco texto, muy prolijo)
- Español rioplatense, cálido, directo. Primero la respuesta, después el detalle. Nada de relleno ni repetir lo que ya dijiste.
- PRIMERA LÍNEA = una frase corta y natural (máx. 25 palabras) que resume lo que hiciste, como si la dijeras en voz alta: "Listo, te preparé la liquidación de Juan de la primera quincena." Esa línea se lee en voz alta, así que sin números largos, sin símbolos y sin listas.
- Si hay datos para mostrar, dejá una línea en blanco y mostralos en MARKDOWN prolijo:
  - Comparaciones o desgloses: tabla markdown (máx. 8 filas, columnas cortas). Para importes, alineá con la columna de la derecha.
  - Enumeraciones: lista con "- ", una idea por línea.
  - Respuestas largas: secciones con "### Título" (máx. 3) y **negrita** solo para cifras o nombres clave.
- DATOS REALES SIEMPRE: si una herramienta devuelve "tabla_markdown", copiala tal cual. Nunca inventes, repitas ni completes nombres, horas o importes: si no está en el resultado de la herramienta, no existe. Si el resultado no alcanza, decilo y volvé a consultar.
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
        name: "ficha_operario",
        description:
          "Ficha de UN operario en un año (por defecto el actual): mes por mes sus horas normales y extra, días trabajados, llegadas tarde y qué meses perdió el presentismo, más el total del año. Usala cuando pregunten por la historia de una persona (\"cómo viene Juan este año\", \"cuántas extras hizo\", \"llegó tarde seguido\").",
        parameters: {
          type: "OBJECT",
          properties: {
            operario: { type: "STRING", description: "Nombre (o parte) del operario." },
            anio: { type: "INTEGER", description: "Año de la ficha, por ejemplo 2026. Por defecto el actual." },
          },
          required: ["operario"],
        },
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
  ficha_operario: "Armó la ficha de un operario",
};

/** @param {{pool:any, db:any, ai:any}} deps  pool = el mismo pool de solo lectura de Connie. */
function crearLia({ pool, db, ai }) {
  const ejecutar = async (llamada, uso) => {
    const args = llamada.args || {};
    if (llamada.name === "liquidar_horas") {
      uso.args = parametrosPDF(args);
      const r = await liquidarDesdeBD(pool, args);
      if (r?.error) uso.ok = false;
      return compactarPlantel(r, args);
    }
    if (llamada.name === "simular_turno") return simularTurno(pool, args);
    if (llamada.name === "calculadora") return calcular(args.expresion);
    if (llamada.name === "avisos_abiertos") {
      const [rows] = await db.query(
        "SELECT tipo, severidad, titulo, texto, operario, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, estado FROM agentes_hallazgos WHERE agente = 'rrhh' AND estado = 'ABIERTO' ORDER BY FIELD(severidad,'ALTA','MEDIA','BAJA'), id DESC LIMIT 60",
      );
      return { cantidad: rows.length, avisos: rows };
    }
    if (llamada.name === "ficha_operario") return fichaOperario(pool, { operario: args.operario, anio: args.anio });
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
  };
  return crearMotor({ ai, nombre: "Lía", construirInstrucciones, herramientas: HERRAMIENTAS, palabras: PALABRAS_HERRAMIENTA, ejecutar, posprocesar: verificarRespuesta });
}

const pesos = (n) => `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const horas = (n) => Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 });

/**
 * Liquidación de TODO el plantel: el modelo no tiene que "armar" una fila por operario (ahí inventaba nombres y cifras
 * repetidas). Se le entrega la tabla ya hecha, con los datos reales, para que la copie tal cual, y sin el detalle diario.
 */
function compactarPlantel(r, args = {}) {
  if (!r || r.error || args.operario || !Array.isArray(r.operarios)) return r;
  const soloExtras = args.solo_extras === true;
  const filas = r.operarios.map((o) => {
    const x = o.resumen || {};
    return soloExtras
      ? `| ${o.operario} | ${horas(x.horas_extra)} | ${pesos(x.valor_extras)} |`
      : `| ${o.operario} | ${horas(x.horas_normales)} | ${horas(x.horas_extra)} | ${pesos(x.valor_extras)} | ${pesos(x.total)} |`;
  });
  const cab = soloExtras ? "| Operario | Horas extra | Importe extra |\n|---|---:|---:|" : "| Operario | Horas normales | Horas extra | Importe extra | Total |\n|---|---:|---:|---:|---:|";
  const total = soloExtras
    ? `| **TOTAL** | **${horas(r.total_horas_extra)}** | **${pesos(r.total_importe_extras)}** |`
    : `| **TOTAL** | **${horas(r.total_horas_normales)}** | **${horas(r.total_horas_extra)}** | **${pesos(r.total_importe_extras)}** | **${pesos(r.total_importe)}** |`;
  const operarios = r.operarios.map(({ dias, ...o }) => o); // eslint-disable-line no-unused-vars
  return {
    liquidacion_de: r.liquidacion_de,
    informe: r.informe,
    cantidad_de_operarios: r.cantidad_de_operarios,
    ...(r.avisos_presentismo ? { avisos_presentismo: r.avisos_presentismo } : {}),
    ...(r.operarios_sin_categoria ? { operarios_sin_categoria: r.operarios_sin_categoria } : {}),
    feriados_en_el_rango: r.feriados_en_el_rango,
    INSTRUCCION: "Mostrá la tabla_markdown COPIADA TAL CUAL (todas las filas, mismos nombres y cifras; no agregues, quites ni cambies ninguna). Es la liquidación real de todo el plantel. Nunca completes filas por tu cuenta.",
    tabla_markdown: `${cab}\n${filas.join("\n")}\n${total}`,
    operarios,
  };
}

const NOMBRE_PROPIO = /[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+/g;

/**
 * Última barrera contra datos inventados. Si la liquidación fue de todo el plantel, la tabla y los totales de la respuesta
 * salen SIEMPRE del servidor (el modelo solo aporta, a lo sumo, lo que dice después de la tabla). Y una línea "Ojo:"
 * se descarta si nombra a alguien que no está en lo que devolvieron las herramientas.
 */
function verificarRespuesta(texto, resultados = []) {
  const reales = JSON.stringify(resultados.map((x) => x.r)).toLowerCase();
  const plantel = [...resultados].reverse().find((x) => x.nombre === "liquidar_horas" && x.r?.tabla_markdown);
  let lineas = texto.split("\n");
  if (plantel) {
    // se saca todo bloque de tabla escrito por el modelo y se lo reemplaza por el real
    lineas = lineas.filter((l) => !/^\s*\|/.test(l));
    const r = plantel.r;
    const extras = plantel.args?.solo_extras === true;
    const intro = `Listo, te preparé la liquidación de ${r.liquidacion_de || "horas"} de ${r.cantidad_de_operarios} ${r.cantidad_de_operarios === 1 ? "operario" : "operarios"}.`;
    const resto = lineas.filter((l) => l.trim() && !/^listo|^te prepar/i.test(l.trim()) && !/\d[\d.]*,\d{2}|\b\d+\s*(horas|hs)\b/i.test(l));
    lineas = [intro, "", r.tabla_markdown, ...(resto.length ? ["", ...resto] : [])];
    void extras;
  }
  // "Ojo:" solo si lo que dice está respaldado
  const hayAvisos = (x) => /avisos_presentismo|operarios_sin_categoria|fichada|"avisos"/i.test(JSON.stringify(x.r || {}).slice(0, 200000));
  lineas = lineas.filter((l) => {
    if (!/^\s*(\*\*)?ojo/i.test(l)) return true;
    const nombres = l.match(NOMBRE_PROPIO) || [];
    if (nombres.some((n) => !reales.includes(n.toLowerCase()))) return false;
    return resultados.some(hayAvisos);
  });
  return lineas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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

module.exports = { verificarRespuesta, compactarPlantel, parametrosPDF, crearLia, construirInstrucciones, HERRAMIENTAS };
