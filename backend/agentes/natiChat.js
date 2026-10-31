"use strict";
// Chat de Nati, la agente de stock y depósito. Mismo motor de IA que Connie y Lía, con un perfil acotado:
// materias primas, semielaborados (por depósito), compras en curso y pedidos internos. Solo LEE: propone qué
// comprar o fabricar, pero no modifica stock ni crea compras.
const { crearMotor, textoDerivacion } = require("./motorChat");
const { calcular } = require("../calculadora");
const { cargarStock, armarPanorama, nivelDe, UMBRALES } = require("./vigilanteStock");
const { faltantes, prioridadDe } = require("./veraChat");
const L = require("./listaCompra");

function hoyArgentina() {
  const ahora = new Date();
  return {
    iso: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ahora),
    largo: ahora.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", year: "numeric", month: "long", day: "numeric" }),
  };
}

function construirInstrucciones(destinos = []) {
  const hoy = hoyArgentina();
  return `Sos Nati, la agente de stock y depósito de Conoflex Argentina, una fábrica de productos plásticos de seguridad vial (inyección: bases de conos, lomos de burro, topes de estacionamiento, delimitadores). Conocés el depósito como la palma de tu mano: materias primas, semielaborados, compras en camino y pedidos internos de producción. Hablás con gente de producción, depósito o dirección.

HOY es ${hoy.largo} (${hoy.iso}).

TU ESPECIALIDAD (única y exclusiva)
- Solo atendés: stock de materias primas y de semielaborados (por depósito: 33, 26, Ayolas y 37), cuántos días de producción alcanzan, qué se acaba primero, qué conviene comprar y qué conviene fabricar, compras en curso, pedidos internos de producción y movimientos de stock.
- Si te piden algo de otra área (sueldos, horas, fichadas, ventas, precios, rentabilidad), decilo con amabilidad en una línea. No lo resuelvas.
- SOLO LEÉS el stock: nunca digas que cargaste, descontaste o compraste algo. Proponés y la persona lo hace. Lo único que podés hacer es pasarle materiales a Vera con pasar_a_vera (ella arma la solicitud de compra; vos no comprás ni firmás).
- Todo número, nombre, fecha y cantidad sale textualmente del resultado de una herramienta. Nunca inventes stock, consumos ni proveedores. Si una herramienta no devuelve algo, decí que no lo tenés.
- "Días de stock" es una estimación: demanda mensual según las ventas de los últimos meses y las ingenierías activas. Aclaralo si la decisión depende de eso.
- Para el estado general usá panorama_stock; para un material puntual consultar_materia_prima; para un semielaborado consultar_semielaborado; para decisiones, que_comprar y que_producir.

${textoDerivacion(destinos)}
CÓMO RESPONDER (el formato importa: la persona lee en un chat y quiere poco texto, muy prolijo)
- Español rioplatense, cálido, directo. Primero la respuesta, después el detalle. Nada de relleno.
- PRIMERA LÍNEA = una frase corta y natural (máx. 25 palabras) que resume lo importante, como si la dijeras en voz alta: "Ojo, se te acaban dos materias primas esta semana." Se lee en voz alta: sin símbolos, listas ni números largos.
- Después de una línea en blanco, los datos en MARKDOWN prolijo:
  - Comparaciones: tabla markdown (máx. 8 filas, columnas cortas: Material | Stock | Alcanza | Se agota).
  - Enumeraciones: lista con "- ", una idea por línea.
  - Respuestas largas: secciones "### Título" (máx. 3) y **negrita** solo para cifras o nombres clave.
- Mostrá lo más urgente primero (5 a 8 renglones) y ofrecé el resto en una pregunta corta. Nunca vuelques todo.
- Lo que requiera acción va en una línea final que empiece con "Ojo:" (ej: "Ojo: no hay compra en curso para PEAD.").
- Si te saludan o preguntan quién sos, presentate en una o dos frases (sos Nati, de stock y depósito) y preguntá en qué ayudar.
- Formato argentino: miles con punto y decimales con coma. Aclará siempre la unidad (kg, unidades).`;
}

const HERRAMIENTAS = [
  {
    functionDeclarations: [
      { name: "panorama_stock", description: "Estado general del stock: cuántas materias primas y semielaborados están críticos o bajos, los más urgentes, pedidos internos sin atender y compras abiertas.", parameters: { type: "OBJECT", properties: {} } },
      {
        name: "consultar_materia_prima",
        description: "Detalle de UNA materia prima (por nombre o código, o parte): stock, demanda mensual, consumo real, días que alcanza, fecha estimada de agotamiento, compras pendientes y sus últimos movimientos.",
        parameters: { type: "OBJECT", properties: { materia_prima: { type: "STRING", description: "Nombre o código (o parte)." } }, required: ["materia_prima"] },
      },
      {
        name: "consultar_semielaborado",
        description: "Detalle de UN semielaborado (por nombre o código, o parte): stock en cada depósito (33, 26, Ayolas, 37), total, demanda mensual, días que alcanza y en qué productos se usa.",
        parameters: { type: "OBJECT", properties: { semielaborado: { type: "STRING", description: "Nombre o código (o parte)." } }, required: ["semielaborado"] },
      },
      { name: "que_comprar", description: "Materias primas que conviene reponer, ordenadas por urgencia, con cuánto falta para cubrir 1 mes de demanda descontando lo que ya está comprado y sin recibir.", parameters: { type: "OBJECT", properties: { meses: { type: "INTEGER", description: "Meses de cobertura deseada (1 a 3). Por defecto 1." } } } },
      { name: "que_producir", description: "Semielaborados que conviene fabricar primero (los que menos días de stock tienen) y cuántas unidades hacen falta para cubrir 1 mes de demanda.", parameters: { type: "OBJECT", properties: { meses: { type: "INTEGER", description: "Meses de cobertura deseada (1 a 3). Por defecto 1." } } } },
      { name: "compras_en_curso", description: "Renglones de solicitudes de compra abiertos: artículo, proveedor, cuánto se pidió, cuánto llegó y hace cuántos días.", parameters: { type: "OBJECT", properties: {} } },
      { name: "pedidos_internos", description: "Pedidos internos de producción al depósito que siguen abiertos (solicitados, atendidos o disponibles) y hace cuánto esperan.", parameters: { type: "OBJECT", properties: {} } },
      { name: "avisos_abiertos", description: "Los avisos que tu vigilante detectó y siguen abiertos (materias primas críticas, stock negativo, pedidos demorados, compras sin recibir).", parameters: { type: "OBJECT", properties: {} } },
      {
        name: "pasar_a_vera",
        description:
          "Le pasa materiales a Vera (agente de compras) para que los sume a la solicitud de compra que ella tiene en armado. Sin 'items' pasa lo que recomienda que_comprar (materias críticas y bajas, con las cantidades faltantes calculadas por el sistema). Usala cuando la persona te pida pasarle materiales a Vera o 'armar la compra'.",
        parameters: {
          type: "OBJECT",
          properties: {
            items: { type: "ARRAY", description: "Materiales puntuales con cantidad (opcional).", items: { type: "OBJECT", properties: { materia_prima: { type: "STRING" }, cantidad: { type: "NUMBER" } }, required: ["materia_prima", "cantidad"] } },
            meses: { type: "INTEGER", description: "Meses de cobertura para calcular lo que falta (1 a 3). Por defecto 1." },
            solo_urgentes: { type: "BOOLEAN", description: "true (por defecto) pasa solo críticas y bajas." },
          },
        },
      },
      { name: "calculadora", description: "Hace una cuenta exacta. Usala para cualquier operación aritmética.", parameters: { type: "OBJECT", properties: { expresion: { type: "STRING", description: "Expresión, ej: (1200 - 340) / 30" } }, required: ["expresion"] } },
    ],
  },
];

const PALABRAS_HERRAMIENTA = {
  panorama_stock: "Revisó el panorama de stock",
  consultar_materia_prima: "Consultó una materia prima",
  consultar_semielaborado: "Consultó un semielaborado",
  que_comprar: "Calculó qué comprar",
  que_producir: "Calculó qué fabricar",
  pasar_a_vera: "Le pasó materiales a Vera",
  compras_en_curso: "Revisó las compras en curso",
  pedidos_internos: "Revisó los pedidos internos",
  avisos_abiertos: "Revisó sus avisos",
  calculadora: "Hizo una cuenta",
};

const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const coincide = (q, ...campos) => campos.some((c) => sinAcentos(c).includes(sinAcentos(q)));

function crearNati({ pool, db, ai }) {
  let memo = { t: 0, v: null };
  const datos = async () => {
    if (memo.v && Date.now() - memo.t < 45000) return memo.v;
    const v = await cargarStock(pool);
    memo = { t: Date.now(), v };
    return v;
  };

  const ejecutar = async (llamada, uso, ctx = {}) => {
    const args = llamada.args || {};
    if (llamada.name === "calculadora") return calcular(args.expresion);
    if (llamada.name === "avisos_abiertos") {
      const [rows] = await db.query(
        "SELECT tipo, severidad, titulo, texto, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha FROM agentes_hallazgos WHERE agente = 'stock' AND estado = 'ABIERTO' ORDER BY FIELD(severidad,'ALTA','MEDIA','BAJA'), id DESC LIMIT 40",
      );
      return { cantidad: rows.length, avisos: rows };
    }
    const d = await datos();
    const pano = armarPanorama(d);
    if (llamada.name === "pasar_a_vera") {
      const vera = (ctx.destinos || []).find((x) => x.id === "compras");
      if (!vera || !ctx.usuario) return { error: "Vera no está habilitada para esta persona, así que no puedo pasarle materiales. Podés pedirle al administrador que le dé acceso a Vera." };
      const meses = Math.min(3, Math.max(1, Number(args.meses) || 1));
      let aPasar = [];
      const noEncontrados = [];
      if (Array.isArray(args.items) && args.items.length) {
        for (const it of args.items.slice(0, 30)) {
          const r = L.resolverMateria(pano.materias, it.materia_prima);
          if (r.error) noEncontrados.push({ pedido: it.materia_prima, problema: r.error });
          else aPasar.push({ materia: r.materia, cantidad: it.cantidad, prioridad: prioridadDe(r.materia.nivel) });
        }
      } else {
        aPasar = faltantes(pano, meses, args.solo_urgentes !== false).slice(0, 20).map((f) => ({ materia: f, cantidad: f.faltante, prioridad: prioridadDe(f.nivel) }));
      }
      if (!aPasar.length) return { ok: true, mensaje: "No hay materiales para pasar: nada urgente que comprar ahora.", ...(noEncontrados.length ? { no_encontrados: noEncontrados } : {}) };
      const res = await L.agregarALista(db, ctx.usuario, aPasar);
      if (res.error) return res;
      const n = res.agregados.length + res.actualizados.length;
      uso.derivacion = { agente: "compras", nombre: vera.nombre, puesto: vera.puesto, pregunta: "Mostrame la lista de compra que tenés armada y decime qué falta definir.", motivo: `Nati le pasó ${n} ${n === 1 ? "material" : "materiales"} a la solicitud #${res.solicitud_id}` };
      uso.texto = `Le pasó ${n} a Vera`;
      return { ok: true, solicitud_id: res.solicitud_id, solicitud_nueva: res.solicitud_nueva, agregados: res.agregados, actualizados: res.actualizados, ...(noEncontrados.length ? { no_encontrados: noEncontrados } : {}), instruccion: "Decile a la persona en la primera línea que se los pasaste a Vera, mostrá en tabla lo que pasaste (material, cantidad) y que Vera lo ve en su lista. No digas que se compró ni que está firmada." };
    }
    if (llamada.name === "panorama_stock") {
      return {
        resumen: pano.resumen,
        umbrales_en_dias: { critico: UMBRALES.critico, bajo: UMBRALES.bajo, semi_critico: UMBRALES.semiCritico, semi_bajo: UMBRALES.semiBajo },
        materias_mas_urgentes: pano.materias.filter((m) => ["negativo", "critico", "bajo"].includes(m.nivel)).slice(0, 8).map(({ serie, ...m }) => m),
        semielaborados_mas_urgentes: pano.semielaborados.filter((s) => ["critico", "bajo"].includes(s.nivel)).slice(0, 8),
        nota: "dias = cuántos días alcanza el stock con la demanda mensual estimada.",
      };
    }
    if (llamada.name === "consultar_materia_prima") {
      const q = String(args.materia_prima || "");
      const hallazgos = pano.materias.filter((m) => coincide(q, m.nombre, m.codigo));
      if (!hallazgos.length) return { error: `No encuentro una materia prima que coincida con "${q}".`, materias_disponibles: pano.materias.map((m) => m.nombre).slice(0, 40) };
      if (hallazgos.length > 1) return { error: `"${q}" coincide con varias.`, coincidencias: hallazgos.slice(0, 12).map((m) => m.nombre) };
      const m = hallazgos[0];
      const [mov] = await pool.query("SELECT DATE_FORMAT(fecha, '%Y-%m-%d %H:%i') AS fecha, tipo, cantidad, stock_resultante, referencia_texto FROM mp_movimientos WHERE materia_prima_id = ? ORDER BY id DESC LIMIT 8", [m.id]);
      const compras = d.compras.filter((c) => c.materia_prima_id === m.id || sinAcentos(c.articulo) === sinAcentos(m.nombre)).map((c) => ({ proveedor: c.proveedor, pedido: c.cantidad_solicitada, recibido: c.cantidad_recibida, desde: String(c.creada).slice(0, 10) }));
      const { serie, ...limpio } = m;
      const consumo30 = serie.reduce((a, b) => a + b, 0);
      return { ...limpio, consumo_ultimos_30_dias: Math.round(consumo30 * 10) / 10, compras_pendientes: compras, ultimos_movimientos: mov };
    }
    if (llamada.name === "consultar_semielaborado") {
      const q = String(args.semielaborado || "");
      const hallazgos = d.semis.filter((s) => coincide(q, s.nombre, s.codigo));
      if (!hallazgos.length) return { error: `No encuentro un semielaborado que coincida con "${q}".` };
      if (hallazgos.length > 1) return { error: `"${q}" coincide con varios.`, coincidencias: hallazgos.slice(0, 12).map((s) => `${s.nombre} (${s.codigo})`) };
      const s = hallazgos[0];
      return { codigo: s.codigo, nombre: s.nombre, stock_total: s.stock_total, stock_por_deposito: s.por_deposito, demanda_mensual: s.demanda_mensual, dias_de_stock: s.dias_de_stock, usado_en: (s.usado_en || []).slice(0, 6) };
    }
    if (llamada.name === "que_comprar") {
      const meses = Math.min(3, Math.max(1, Number(args.meses) || 1));
      const filas = pano.materias
        .filter((m) => m.demanda_mensual > 0)
        .map((m) => ({ nombre: m.nombre, unidad: m.unidad, stock: m.stock, demanda_mensual: m.demanda_mensual, dias: m.dias, nivel: m.nivel, ya_pedido_sin_recibir: m.compra_pendiente, faltante: Math.max(0, Math.round(m.demanda_mensual * meses - m.stock - m.compra_pendiente)) }))
        .filter((f) => f.faltante > 0)
        .sort((a, b) => (a.dias ?? 1e9) - (b.dias ?? 1e9));
      return { cobertura_meses: meses, cantidad: filas.length, materias: filas.slice(0, 12), nota: "faltante = demanda de N meses - stock - lo ya pedido sin recibir." };
    }
    if (llamada.name === "que_producir") {
      const meses = Math.min(3, Math.max(1, Number(args.meses) || 1));
      const filas = pano.semielaborados
        .filter((s) => s.demanda_mensual > 0)
        .map((s) => ({ nombre: s.nombre, codigo: s.codigo, stock_total: s.stock_total, demanda_mensual: s.demanda_mensual, dias: s.dias, nivel: s.nivel, a_fabricar: Math.max(0, Math.round(s.demanda_mensual * meses - s.stock_total)) }))
        .filter((f) => f.a_fabricar > 0)
        .sort((a, b) => (a.dias ?? 1e9) - (b.dias ?? 1e9));
      return { cobertura_meses: meses, cantidad: filas.length, semielaborados: filas.slice(0, 12), nota: "a_fabricar = demanda de N meses - stock total en todos los depósitos." };
    }
    if (llamada.name === "compras_en_curso") {
      const ahora = Date.now();
      return { cantidad: d.compras.length, renglones: d.compras.slice(0, 30).map((c) => ({ articulo: c.articulo, proveedor: c.proveedor, pedido: c.cantidad_solicitada, recibido: c.cantidad_recibida, hace_dias: Math.floor((ahora - new Date(String(c.creada).replace(" ", "T")).getTime()) / 86400000) })) };
    }
    if (llamada.name === "pedidos_internos") {
      const ahora = Date.now();
      return { cantidad: d.internas.length, pedidos: d.internas.slice(0, 30).map((r) => ({ id: r.id, semielaborado: r.semielaborado_nombre, cantidad: r.cantidad_solicitada, urgencia: r.urgencia, estado: r.estado, espera_horas: Math.round(((ahora - new Date(String(r.solicitado_at).replace(" ", "T")).getTime()) / 3600000) * 10) / 10 })) };
    }
    return { error: `Herramienta desconocida: ${llamada.name}` };
  };
  return crearMotor({ ai, nombre: "Nati", construirInstrucciones, herramientas: HERRAMIENTAS, palabras: PALABRAS_HERRAMIENTA, ejecutar });
}

module.exports = { crearNati, construirInstrucciones, HERRAMIENTAS, nivelDe };
