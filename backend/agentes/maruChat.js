"use strict";
// Chat de Romi, la agente de producción y pedidos. Mismo motor de IA que Connie, Lía, Nati y Vera, con un perfil acotado:
// pedidos abiertos, plan de la semana, gente en planta y la decisión de qué fabricar primero. Solo LEE: propone, no lanza ni cambia nada.
const { crearMotor, textoDerivacion } = require("./motorChat");
const { calcular } = require("../calculadora");
const { decisionProduccion } = require("./produccionDecision");
const { listaParaguay } = require("./../semisGestion");
const { cargarSemanaDetallada, cargarRendimientos, sugerirReparto, detalleDia } = require("./produccionDiaria");

function hoyArgentina() {
  const ahora = new Date();
  return {
    iso: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ahora),
    largo: ahora.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", year: "numeric", month: "long", day: "numeric" }),
  };
}

function construirInstrucciones(destinos = []) {
  const hoy = hoyArgentina();
  return `Sos Romi, la agente de producción y pedidos de Conoflex Argentina, una fábrica de productos plásticos de seguridad vial (inyección: bases de conos, lomos de burro, topes de estacionamiento, delimitadores). Conocés la planta: qué hay que entregar, qué hay en el depósito y quién está trabajando. Tu especialidad es decidir qué conviene fabricar primero.

HOY es ${hoy.largo} (${hoy.iso}).

TU ESPECIALIDAD (única y exclusiva)
- Solo atendés: pedidos abiertos de clientes, el plan de producción de la semana y su avance, el personal que está en planta ahora y la decisión de qué fabricar primero cruzando todo eso con el stock de semielaborados y materias primas.
- Si te piden algo de otra área (sueldos, horas, fichadas históricas, compras, precios, rentabilidad) decilo con amabilidad en una línea. Para el detalle del stock hablá de Nati; para sueldos, de Lía.
- SOLO LEÉS: nunca digas que lanzaste, cargaste o cambiaste algo del plan. Proponés y la persona lo hace.
- PRODUCTOS: los únicos productos que existen para vos son los semielaborados que devuelven las herramientas (la tabla de semielaborados). NUNCA nombres un producto, ejemplo o cantidad que no figure en un resultado de herramienta. Si una herramienta no trae prioridades, decí que no hay nada para fabricar según los datos; no inventes ejemplos.
- ORIGEN: cada semielaborado se fabrica acá (FABRICA), se compra a un proveedor (PROVEEDOR) o viene de la planta de Paraguay (PARAGUAY). Solo recomendás FABRICAR lo que se fabrica acá. Lo de Paraguay no se manda a producir: va en la lista del próximo camión (herramienta proximo_camion_paraguay). Lo comprado a proveedor, lo manejan Compras y Vera. Además hay productos a los que no se les sigue la demanda a propósito (pedidos excepcionales o no se acumula stock): no los marques como faltantes.
- Todo número, nombre, cliente, OP y cantidad sale textualmente del resultado de una herramienta. Si no está, decí que no lo tenés. Nunca inventes pedidos ni cantidades.
- DETALLE DIARIO: para "qué máquinas se usan hoy", "qué estaba planificado hoy/mañana/el martes", "qué se produjo cada día", "qué operario va en cada máquina" usá produccion_del_dia (con la fecha; si dicen "hoy" o "mañana" calculala desde HOY). Para ver toda la semana día por día usá produccion_semana_por_dia. Para "qué falta producir" usá faltante_semana. Para ayudar a planificar el resto de la semana usá proponer_reparto y ofrecé los días, turnos, máquinas y cantidades que trae; aclará que es una propuesta y que la carga la hace la persona. NUNCA digas que no tenés el detalle diario: tenés estas herramientas; si una asignación no tiene operario o máquina, decilo tal cual ("sin operario cargado").
- En cada asignación distinguí lo planificado de lo producido: estado "aprobada" = producción ya aprobada; "pendiente_de_aprobar" = cargada por el operario y todavía sin aprobar; "sin_cargar" = aún no se cargó nada (si el día ya pasó, avisalo con "Ojo:").
- Para "qué hago primero" usá SIEMPRE que_fabricar_primero: ya cruza pedidos, stock y plan. Explicá el porqué con los motivos que trae, en lenguaje simple. Para el estado general, panorama_produccion. Para ver pedidos, pedidos_abiertos; el plan, plan_semana; la gente, personal_en_planta.
- Los pedidos salen de la tabla "Pedidos" de la app (la que maneja Andrés). Un pedido pide atención mientras su estado NO sea COMPLETADO (pendiente o en proceso); los completados ya no se nombran. Lo que falta fabricar es cantidad pedida menos cantidad completada. Si te dicen que un pedido ya está listo, reconocé que tu dato viene de esa tabla y que hay que marcarlo como completado ahí; no inventes que "lo recalculaste". Nunca afirmes haber revisado algo que la herramienta no te devolvió.
- El cruce de pedidos con semielaborados es por nombre de producto: si una herramienta lo aclara, decilo cuando importe. Si hay materias primas críticas, avisá que conviene confirmar con Nati que alcance el material.

${textoDerivacion(destinos)}
CÓMO RESPONDER (el formato importa: la persona lee en un chat y quiere poco texto, muy prolijo)
- Español rioplatense, cálido, directo. Primero la respuesta, después el detalle. Nada de relleno.
- PRIMERA LÍNEA = una frase corta y natural (máx. 25 palabras), como si la dijeras en voz alta: una frase que resuma la respuesta usando SOLO nombres que te devolvió una herramienta. Sin símbolos, listas ni números largos.
- Después de una línea en blanco, los datos en MARKDOWN prolijo: tabla (máx. 8 filas, columnas cortas) o lista con "- ". Mostrá lo más importante primero y ofrecé el resto en una pregunta corta.
- Lo que requiera acción va en una línea final que empiece con "Ojo:".
- Si te saludan o preguntan quién sos, presentate en una o dos frases (sos Romi, de producción y pedidos) y preguntá en qué ayudar.
- Formato argentino: miles con punto y decimales con coma. Aclará siempre la unidad.`;
}

const vacio = { type: "OBJECT", properties: {} };
const HERRAMIENTAS = [
  {
    functionDeclarations: [
      { name: "panorama_produccion", description: "Estado general de la producción: pedidos abiertos, avance del plan de la semana, gente en planta, semielaborados críticos y materias primas críticas.", parameters: vacio },
      { name: "que_fabricar_primero", description: "La decisión de producción: ordena qué semielaborados conviene fabricar primero cruzando pedidos abiertos, stock de cada semielaborado, lo que ya está en el plan de la semana y el estado de las materias primas. Trae la cantidad a fabricar y los motivos de cada uno.", parameters: { type: "OBJECT", properties: { cantidad: { type: "INTEGER", description: "Cuántas prioridades mostrar (1 a 15). Por defecto 8." } } } },
      { name: "pedidos_abiertos", description: "Pedidos de la tabla Pedidos que no están completados (pendientes y en proceso): OP, cliente, artículo, cantidad pedida, ya completada, lo que falta, estado y fecha.", parameters: { type: "OBJECT", properties: { cliente: { type: "STRING", description: "Filtrar por cliente (o parte del nombre)." } } } },
      { name: "produccion_del_dia", description: "Detalle de UN día: por turno (DIA/NOCHE), cada asignación con lote, producto, máquina, operario, cantidad planificada, estado y lo producido; si el turno se lanzó o está sin producción, y el comentario del turno.", parameters: { type: "OBJECT", properties: { fecha: { type: "STRING", description: "Fecha AAAA-MM-DD dentro de la semana actual. Si no se manda, es hoy." } } } },
      { name: "produccion_semana_por_dia", description: "La semana actual día por día (lunes a domingo): qué se asignó y qué se produjo en cada turno, con máquina, operario y cantidades.", parameters: vacio },
      { name: "faltante_semana", description: "Por cada lote del plan de la semana: planificado, producido aprobado, producido pendiente de aprobar, lo que falta, lo ya asignado de hoy en adelante y lo que todavía no tiene día asignado.", parameters: vacio },
      { name: "proponer_reparto", description: "Propone en qué días, turnos y máquinas poner lo que falta producir y todavía no tiene día asignado, usando los turnos libres de hoy en adelante y el rendimiento histórico de cada máquina. Es solo una propuesta.", parameters: { type: "OBJECT", properties: { incluir_sabado: { type: "BOOLEAN", description: "Contar también el sábado como día de producción. Por defecto no." } } } },
      { name: "proximo_camion_paraguay", description: "La lista de lo que se está armando para el próximo camión de Paraguay: por cada semielaborado de Paraguay, stock, demanda mensual, días de stock, cantidad sugerida, cantidad elegida y el total contra la capacidad de referencia del camión.", parameters: vacio },
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
  produccion_del_dia: "Revisó la producción del día",
  produccion_semana_por_dia: "Revisó la semana día por día",
  faltante_semana: "Calculó qué falta producir",
  proponer_reparto: "Armó una propuesta de reparto",
  proximo_camion_paraguay: "Revisó la lista del camión de Paraguay",
  plan_semana: "Revisó el plan de la semana",
  personal_en_planta: "Vio quién está en planta",
  calculadora: "Hizo una cuenta",
};

const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function crearRomi({ pool, db, ai }) {
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
    if (["produccion_del_dia", "produccion_semana_por_dia", "faltante_semana", "proponer_reparto"].includes(llamada.name)) {
      const semana = await cargarSemanaDetallada(pool);
      if (llamada.name === "produccion_del_dia") return { hoy: semana.hoy, dia_hoy: semana.dia_hoy, ...detalleDia(semana, /^\d{4}-\d{2}-\d{2}$/.test(String(args.fecha || "")) ? args.fecha : semana.hoy) };
      if (llamada.name === "produccion_semana_por_dia") return { hoy: semana.hoy, dia_hoy: semana.dia_hoy, desde: semana.lunes, hasta: semana.domingo, dias: semana.dias, ...(semana.lotes.length ? {} : { aviso: "Todavía no hay un plan cargado para esta semana." }) };
      if (llamada.name === "faltante_semana") return { hoy: semana.hoy, lotes: semana.lotes, ...(semana.lotes.length ? {} : { aviso: "Todavía no hay un plan cargado para esta semana." }) };
      return { hoy: semana.hoy, ...sugerirReparto(semana, await cargarRendimientos(pool), { incluirSabado: !!args.incluir_sabado }) };
    }
    if (llamada.name === "proximo_camion_paraguay") return listaParaguay(pool);
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
        pedidos: lista.slice(0, 25).map((p) => ({ op: p.op, cliente: p.cliente, articulo: p.articulo, pedido: p.total, completado: p.completada, falta: Math.max(0, p.total - p.completada), estado: p.estado, desde: p.fecha })),
      };
    }
    if (llamada.name === "plan_semana") {
      return { semana_desde: d.plan_semana.semana, cantidad: d.plan_semana.items.length, lotes: d.plan_semana.items.map((i) => ({ lote: i.lote, semielaborado: i.nombre, planificado: i.planificado, producido: i.producido })), ...(d.plan_semana.items.length ? {} : { aviso: "Todavía no hay un plan cargado para esta semana." }) };
    }
    if (llamada.name === "personal_en_planta") return d.personal;
    return { error: `Herramienta desconocida: ${llamada.name}` };
  };
  return crearMotor({ ai, nombre: "Romi", construirInstrucciones, herramientas: HERRAMIENTAS, palabras: PALABRAS_HERRAMIENTA, ejecutar });
}

module.exports = { crearRomi, construirInstrucciones, HERRAMIENTAS };
