"use strict";
// Chat de Maru, la agente de producción y pedidos. Mismo motor de IA que Connie, Lía, Nati y Vera, con un perfil acotado:
// pedidos abiertos, plan de la semana, gente en planta y la decisión de qué fabricar primero. Solo LEE: propone, no lanza ni cambia nada.
const { crearMotor, textoDerivacion } = require("./motorChat");
const { calcular } = require("../calculadora");
const { decisionProduccion } = require("./produccionDecision");

function hoyArgentina() {
  const ahora = new Date();
  return {
    iso: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ahora),
    largo: ahora.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", year: "numeric", month: "long", day: "numeric" }),
  };
}

function construirInstrucciones(destinos = []) {
  const hoy = hoyArgentina();
  return `Sos Maru, la agente de producción y pedidos de Conoflex Argentina, una fábrica de productos plásticos de seguridad vial (inyección: bases de conos, lomos de burro, topes de estacionamiento, delimitadores). Conocés la planta: qué hay que entregar, qué hay en el depósito y quién está trabajando. Tu especialidad es decidir qué conviene fabricar primero.

HOY es ${hoy.largo} (${hoy.iso}).

TU ESPECIALIDAD (única y exclusiva)
- Solo atendés: pedidos abiertos de clientes, el plan de producción de la semana y su avance, el personal que está en planta ahora y la decisión de qué fabricar primero cruzando todo eso con el stock de semielaborados y materias primas.
- Si te piden algo de otra área (sueldos, horas, fichadas históricas, compras, precios, rentabilidad) decilo con amabilidad en una línea. Para el detalle del stock hablá de Nati; para sueldos, de Lía.
- SOLO LEÉS: nunca digas que lanzaste, cargaste o cambiaste algo del plan. Proponés y la persona lo hace.
- Todo número, nombre, cliente, OP y cantidad sale textualmente del resultado de una herramienta. Si no está, decí que no lo tenés. Nunca inventes pedidos ni cantidades.
- Para "qué hago primero" usá SIEMPRE que_fabricar_primero: ya cruza pedidos, stock y plan. Explicá el porqué con los motivos que trae, en lenguaje simple. Para el estado general, panorama_produccion. Para ver pedidos, pedidos_abiertos; el plan, plan_semana; la gente, personal_en_planta.
- El cruce de pedidos con semielaborados es por nombre de producto: si una herramienta lo aclara, decilo cuando importe. Si hay materias primas críticas, avisá que conviene confirmar con Nati que alcance el material.

${textoDerivacion(destinos)}
CÓMO RESPONDER (el formato importa: la persona lee en un chat y quiere poco texto, muy prolijo)
- Español rioplatense, cálido, directo. Primero la respuesta, después el detalle. Nada de relleno.
- PRIMERA LÍNEA = una frase corta y natural (máx. 25 palabras), como si la dijeras en voz alta: "Con lo que hay, esta semana conviene fabricar primero la base chica." Sin símbolos, listas ni números largos.
- Después de una línea en blanco, los datos en MARKDOWN prolijo: tabla (máx. 8 filas, columnas cortas) o lista con "- ". Mostrá lo más importante primero y ofrecé el resto en una pregunta corta.
- Lo que requiera acción va en una línea final que empiece con "Ojo:".
- Si te saludan o preguntan quién sos, presentate en una o dos frases (sos Maru, de producción y pedidos) y preguntá en qué ayudar.
- Formato argentino: miles con punto y decimales con coma. Aclará siempre la unidad.`;
}

const vacio = { type: "OBJECT", properties: {} };
const HERRAMIENTAS = [
  {
    functionDeclarations: [
      { name: "panorama_produccion", description: "Estado general de la producción: pedidos abiertos, avance del plan de la semana, gente en planta, semielaborados críticos y materias primas críticas.", parameters: vacio },
      { name: "que_fabricar_primero", description: "La decisión de producción: ordena qué semielaborados conviene fabricar primero cruzando pedidos abiertos, stock de cada semielaborado, lo que ya está en el plan de la semana y el estado de las materias primas. Trae la cantidad a fabricar y los motivos de cada uno.", parameters: { type: "OBJECT", properties: { cantidad: { type: "INTEGER", description: "Cuántas prioridades mostrar (1 a 15). Por defecto 8." } } } },
      { name: "pedidos_abiertos", description: "Pedidos de clientes que siguen abiertos: OP, cliente, artículo, cantidad pedida, cantidad hecha, lo que falta y desde cuándo.", parameters: { type: "OBJECT", properties: { cliente: { type: "STRING", description: "Filtrar por cliente (o parte del nombre)." } } } },
      { name: "plan_semana", description: "El plan de producción de esta semana: cada lote con lo planificado y lo ya producido y aprobado.", parameters: vacio },
      { name: "personal_en_planta", description: "Quiénes están en planta ahora (marcaron entrada y no salida) y desde qué hora.", parameters: vacio },
      { name: "calculadora", description: "Hace una cuenta exacta. Usala para cualquier operación aritmética.", parameters: { type: "OBJECT", properties: { expresion: { type: "STRING", description: "Expresión, ej: (1200 - 340) / 30" } }, required: ["expresion"] } },
    ],
  },
];

const PALABRAS_HERRAMIENTA = {
  panorama_produccion: "Revisó el panorama de producción",
  que_fabricar_primero: "Calculó qué fabricar primero",
  pedidos_abiertos: "Revisó los pedidos abiertos",
  plan_semana: "Revisó el plan de la semana",
  personal_en_planta: "Vio quién está en planta",
  calculadora: "Hizo una cuenta",
};

const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function crearMaru({ pool, db, ai }) {
  void db;
  let memo = { t: 0, v: null };
  const datos = async () => {
    if (memo.v && Date.now() - memo.t < 45000) return memo.v;
    const v = await decisionProduccion(pool, { limite: 15 });
    memo = { t: Date.now(), v };
    return v;
  };
  const ejecutar = async (llamada) => {
    const args = llamada.args || {};
    if (llamada.name === "calculadora") return calcular(args.expresion);
    const d = await datos();
    if (llamada.name === "panorama_produccion") {
      const items = d.plan_semana.items;
      const plan = items.reduce((a, i) => a + i.planificado, 0);
      const hecho = items.reduce((a, i) => a + Math.min(i.producido, i.planificado), 0);
      return {
        resumen: d.resumen,
        plan_semana: { desde: d.plan_semana.semana, lotes: items.length, unidades_planificadas: plan, unidades_producidas: hecho, avance_pct: plan ? Math.round((hecho / plan) * 100) : null },
        en_planta: d.personal.en_planta,
        primeras_prioridades: d.prioridades.slice(0, 3).map((p) => ({ orden: p.orden, semielaborado: p.semielaborado, a_fabricar: p.a_fabricar, motivos: p.motivos })),
        ...(d.ojo_materia_prima ? { ojo_materia_prima: d.ojo_materia_prima } : {}),
      };
    }
    if (llamada.name === "que_fabricar_primero") {
      const n = Math.min(15, Math.max(1, Number(args.cantidad) || 8));
      return { prioridades: d.prioridades.slice(0, n), pedidos_abiertos: d.pedidos_abiertos, personal_en_planta: d.personal.en_planta, ...(d.ojo_materia_prima ? { ojo_materia_prima: d.ojo_materia_prima } : {}), nota: d.nota };
    }
    if (llamada.name === "pedidos_abiertos") {
      const q = sinAcentos(args.cliente);
      const lista = d.pedidos.filter((p) => !q || sinAcentos(p.cliente).includes(q));
      return {
        cantidad: lista.length,
        pedidos: lista.slice(0, 25).map((p) => ({ op: p.op, cliente: p.cliente, articulo: p.articulo, pedido: p.total, hecho: p.completada, falta: Math.max(0, p.total - p.completada), estado: p.estado, desde: p.fecha })),
      };
    }
    if (llamada.name === "plan_semana") {
      return { semana_desde: d.plan_semana.semana, cantidad: d.plan_semana.items.length, lotes: d.plan_semana.items.map((i) => ({ lote: i.lote, semielaborado: i.nombre, planificado: i.planificado, producido: i.producido })), ...(d.plan_semana.items.length ? {} : { aviso: "Todavía no hay un plan cargado para esta semana." }) };
    }
    if (llamada.name === "personal_en_planta") return d.personal;
    return { error: `Herramienta desconocida: ${llamada.name}` };
  };
  return crearMotor({ ai, nombre: "Maru", construirInstrucciones, herramientas: HERRAMIENTAS, palabras: PALABRAS_HERRAMIENTA, ejecutar });
}

module.exports = { crearMaru, construirInstrucciones, HERRAMIENTAS };
