"use strict";
// Chat de Vera, la agente de compras y proveedores. Mismo motor de IA que Connie, Lía y Nati. Arma UNA solicitud de
// compra a medida que se habla (con ella o con Nati) y la deja lista para las firmas; no firma ni pide al proveedor.
const { crearMotor, textoDerivacion } = require("./motorChat");
const { calcular } = require("../calculadora");
const { cargarStock, armarPanorama } = require("./vigilanteStock");
const { rankingProveedores } = require("./vigilanteCompras");
const L = require("./listaCompra");
const { eliminarSolicitud } = require("../comprasGestion");

function hoyArgentina() {
  const ahora = new Date();
  return {
    iso: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ahora),
    largo: ahora.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", year: "numeric", month: "long", day: "numeric" }),
  };
}

function construirInstrucciones(destinos = []) {
  const hoy = hoyArgentina();
  return `Sos Vera, la agente de compras y proveedores de Conoflex Argentina, una fábrica de productos plásticos de seguridad vial. Armás las solicitudes de compra, seguís lo que se pidió y no llegó, y conocés a cada proveedor. Hablás con gente de producción, compras o dirección.

HOY es ${hoy.largo} (${hoy.iso}).

TU ESPECIALIDAD (única y exclusiva)
- Solo atendés: solicitudes de compra, la lista de compra en armado, proveedores (a quién se le compra cada cosa, cumplimiento, demoras), compras en curso y qué conviene comprar.
- Si te piden algo de otra área (sueldos, fichadas, ventas, producción), decilo con amabilidad en una línea. Si es de stock (cuánto hay, qué se acaba), eso es de Nati: podés usar la información de stock que te dan tus herramientas, pero el análisis fino es de ella.
- Todo número, nombre, cantidad y proveedor sale textualmente del resultado de una herramienta. Nunca inventes precios (no tenés precios), proveedores ni cantidades.

CÓMO ARMÁS LA LISTA (muy importante)
- Hay UNA solicitud de compra en armado por persona. Todo lo que se hable con vos o que Nati te pase se agrega a ESA misma solicitud: nunca crees otra para la misma charla. Usá lista_actual para ver qué tiene.
- Para agregar materiales usá agregar_a_lista (con las cantidades que la persona te dice) o agregar_recomendadas (suma lo que hace falta según el stock, con las cantidades calculadas por el sistema). No tipees cantidades de memoria: las cantidades salen de la persona o de las herramientas.
- Si alguien dice "agregá lo que recomienda Nati" o "lo que se acaba", usá agregar_recomendadas. Si pide quitar algo, quitar_de_lista. Para cambiar de proveedor, cambiar_proveedor.
- Si la persona pide borrar o eliminar TODA la lista, usá eliminar_lista (queda sin ninguna y la próxima vez se arma una nueva); no la uses para quitar un solo material.
- Cuando la persona diga que la lista está completa o pida dejarla lista para firmar, usá cerrar_lista. Vos NO firmás ni mandás nada al proveedor: la solicitud queda en el módulo Solicitudes de Compra para las firmas.
- Después de agregar, decí en la primera línea qué agregaste y cuántos renglones tiene la lista, y mostrá la lista actual en tabla.
- Si faltan datos (proveedor "A definir"), avisalo con "Ojo:" y ofrecé completarlo.

${textoDerivacion(destinos)}
CÓMO RESPONDER (el formato importa: la persona lee en un chat y quiere poco texto, muy prolijo)
- Español rioplatense, cálida, directa. Primero la respuesta, después el detalle.
- PRIMERA LÍNEA = una frase corta y natural (máx. 25 palabras) que resume lo que hiciste, como dicha en voz alta: "Listo, sumé tres materiales a tu lista de compra." Sin símbolos, listas ni números largos.
- Después de una línea en blanco, los datos en MARKDOWN prolijo: tablas (máx. 8 filas: Material | Cantidad | Proveedor), listas con "- ", secciones "### Título" (máx. 3) y **negrita** solo para cifras o nombres clave.
- Mostrá lo importante primero y ofrecé el resto en una pregunta corta. Lo que requiera acción va en una línea final que empiece con "Ojo:".
- Si te saludan o preguntan quién sos, presentate en una o dos frases (sos Vera, de compras) y preguntá en qué ayudar.
- Formato argentino: miles con punto y decimales con coma. Aclará siempre la unidad.`;
}

const OBJ = (properties, required) => ({ type: "OBJECT", properties, ...(required ? { required } : {}) });
const ITEMS = {
  type: "ARRAY",
  description: "Materiales a agregar",
  items: OBJ({
    materia_prima: { type: "STRING", description: "Nombre o código de la materia prima." },
    cantidad: { type: "NUMBER", description: "Cantidad a pedir, en la unidad de la materia prima." },
    proveedor: { type: "STRING", description: "Proveedor (opcional; si no, se usa el habitual)." },
  }, ["materia_prima", "cantidad"]),
};

const HERRAMIENTAS = [
  {
    functionDeclarations: [
      { name: "lista_actual", description: "Muestra la solicitud de compra que está en armado (la lista): renglones, cantidades, proveedores.", parameters: OBJ({}) },
      { name: "agregar_a_lista", description: "Agrega materiales con cantidades a la solicitud de compra en armado (la crea si no hay). Si el material ya estaba, corrige su cantidad (o la suma con sumar=true).", parameters: OBJ({ items: ITEMS, sumar: { type: "BOOLEAN", description: "true para sumar a lo que ya había en lugar de reemplazar." } }, ["items"]) },
      { name: "agregar_recomendadas", description: "Agrega a la lista, con las cantidades calculadas por el sistema, las materias primas que hace falta comprar (faltante = demanda de N meses - stock - lo ya pedido). Por defecto solo las críticas y bajas.", parameters: OBJ({ meses: { type: "INTEGER", description: "Meses de cobertura (1 a 3). Por defecto 1." }, solo_urgentes: { type: "BOOLEAN", description: "true (por defecto) agrega solo críticas y bajas; false agrega todo lo que falte." } }) },
      { name: "quitar_de_lista", description: "Quita una materia prima de la lista en armado.", parameters: OBJ({ materia_prima: { type: "STRING" } }, ["materia_prima"]) },
      { name: "cambiar_proveedor", description: "Cambia el proveedor de un renglón de la lista en armado.", parameters: OBJ({ materia_prima: { type: "STRING" }, proveedor: { type: "STRING" } }, ["materia_prima", "proveedor"]) },
      { name: "cerrar_lista", description: "Da por completa la lista: la solicitud queda lista para las firmas en el módulo Solicitudes de Compra y la próxima vez se arma una nueva.", parameters: OBJ({}) },
      { name: "eliminar_lista", description: "Elimina por completo la lista de compra en armado (la solicitud y todos sus renglones). Usala SOLO si la persona pide explícitamente borrar/eliminar toda la lista; para sacar un material usá quitar_de_lista.", parameters: OBJ({}) },
      { name: "que_comprar", description: "Calcula qué materias primas conviene reponer (sin agregarlas a la lista), con cuánto falta para cubrir N meses.", parameters: OBJ({ meses: { type: "INTEGER" } }) },
      { name: "compras_en_curso", description: "Renglones de solicitudes de compra pedidos y sin recibir completos: artículo, proveedor, cuánto se pidió y llegó, hace cuántos días.", parameters: OBJ({ proveedor: { type: "STRING", description: "Filtrar por proveedor (opcional)." } }) },
      { name: "ficha_proveedor", description: "Historia de un proveedor: qué se le compra, cumplimiento de lo pedido, pendientes.", parameters: OBJ({ proveedor: { type: "STRING" } }, ["proveedor"]) },
      { name: "ranking_proveedores", description: "Proveedores ordenados por cantidad de renglones, con el porcentaje de lo pedido que entregaron.", parameters: OBJ({}) },
      { name: "solicitudes_por_firmar", description: "Solicitudes de compra abiertas y qué firmas les faltan.", parameters: OBJ({}) },
      { name: "avisos_abiertos", description: "Los avisos que tu vigilante detectó y siguen abiertos.", parameters: OBJ({}) },
      { name: "calculadora", description: "Hace una cuenta exacta.", parameters: OBJ({ expresion: { type: "STRING" } }, ["expresion"]) },
    ],
  },
];

const PALABRAS_HERRAMIENTA = {
  lista_actual: "Revisó la lista de compra",
  agregar_a_lista: "Agregó a la lista de compra",
  agregar_recomendadas: "Sumó lo que hace falta comprar",
  quitar_de_lista: "Quitó de la lista",
  cambiar_proveedor: "Cambió un proveedor",
  cerrar_lista: "Cerró la lista para firma",
  eliminar_lista: "Eliminó la lista de compra",
  que_comprar: "Calculó qué comprar",
  compras_en_curso: "Revisó las compras en curso",
  ficha_proveedor: "Consultó un proveedor",
  ranking_proveedores: "Comparó proveedores",
  solicitudes_por_firmar: "Revisó las firmas pendientes",
  avisos_abiertos: "Revisó sus avisos",
  calculadora: "Hizo una cuenta",
};

/** Cuánto falta comprar de cada materia prima (misma cuenta que usa Nati). */
function faltantes(pano, meses, soloUrgentes) {
  return pano.materias
    .filter((m) => m.demanda_mensual > 0)
    .map((m) => ({ id: m.id, codigo: m.codigo, nombre: m.nombre, unidad: m.unidad, stock: m.stock, demanda_mensual: m.demanda_mensual, dias: m.dias, nivel: m.nivel, ya_pedido_sin_recibir: m.compra_pendiente, faltante: Math.max(0, Math.round(m.demanda_mensual * meses - m.stock - m.compra_pendiente)) }))
    .filter((f) => f.faltante > 0 && (!soloUrgentes || ["negativo", "critico", "bajo"].includes(f.nivel)))
    .sort((a, b) => (a.dias ?? 1e9) - (b.dias ?? 1e9));
}
const prioridadDe = (nivel) => (nivel === "negativo" || nivel === "critico" ? 5 : nivel === "bajo" ? 4 : 3);

function crearVera({ pool, db, ai }) {
  const materias = async () => armarPanorama(await cargarStock(pool));

  const ejecutar = async (llamada, uso, ctx = {}) => {
    const args = llamada.args || {};
    const usuario = ctx.usuario;
    if (llamada.name === "calculadora") return calcular(args.expresion);
    if (llamada.name === "avisos_abiertos") {
      const [rows] = await db.query("SELECT tipo, severidad, titulo, texto, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha FROM agentes_hallazgos WHERE agente = 'compras' AND estado = 'ABIERTO' ORDER BY FIELD(severidad,'ALTA','MEDIA','BAJA'), id DESC LIMIT 40");
      return { cantidad: rows.length, avisos: rows };
    }
    if (!usuario) return { error: "No sé quién sos: volvé a iniciar sesión." };
    if (llamada.name === "lista_actual") return L.leerLista(db, usuario.id);
    if (llamada.name === "cerrar_lista") return L.cerrarLista(db, usuario);
    if (llamada.name === "eliminar_lista") return L.eliminarLista(db, usuario, { eliminarSolicitud });

    if (["agregar_a_lista", "agregar_recomendadas", "quitar_de_lista", "cambiar_proveedor", "que_comprar"].includes(llamada.name)) {
      const pano = await materias();
      if (llamada.name === "agregar_a_lista") {
        const aAgregar = [];
        const noEncontrados = [];
        for (const it of (Array.isArray(args.items) ? args.items : []).slice(0, 30)) {
          const r = L.resolverMateria(pano.materias, it.materia_prima);
          if (r.error) noEncontrados.push({ pedido: it.materia_prima, problema: r.error, ...(r.coincidencias ? { coincidencias: r.coincidencias } : {}) });
          else aAgregar.push({ materia: r.materia, cantidad: it.cantidad, proveedor: it.proveedor, prioridad: prioridadDe(r.materia.nivel), sumar: args.sumar === true });
        }
        const res = aAgregar.length ? await L.agregarALista(db, usuario, aAgregar) : { error: "No pude agregar nada." };
        uso.args = { agregados: aAgregar.length };
        return { ...res, ...(noEncontrados.length ? { no_agregados: noEncontrados } : {}), lista: await L.leerLista(db, usuario.id) };
      }
      if (llamada.name === "agregar_recomendadas") {
        const meses = Math.min(3, Math.max(1, Number(args.meses) || 1));
        const fl = faltantes(pano, meses, args.solo_urgentes !== false);
        if (!fl.length) return { ok: true, mensaje: "No hay nada urgente para comprar ahora.", lista: await L.leerLista(db, usuario.id) };
        const res = await L.agregarALista(db, usuario, fl.slice(0, 20).map((f) => ({ materia: f, cantidad: f.faltante, prioridad: prioridadDe(f.nivel), sumar: false })));
        return { ...res, cobertura_meses: meses, lista: await L.leerLista(db, usuario.id) };
      }
      if (llamada.name === "que_comprar") {
        const meses = Math.min(3, Math.max(1, Number(args.meses) || 1));
        const fl = faltantes(pano, meses, false);
        return { cobertura_meses: meses, cantidad: fl.length, materias: fl.slice(0, 12).map(({ id, ...x }) => x) }; // eslint-disable-line no-unused-vars
      }
      const r = L.resolverMateria(pano.materias, args.materia_prima);
      if (r.error) return r;
      return llamada.name === "quitar_de_lista" ? L.quitarDeLista(db, usuario, r.materia) : L.cambiarProveedor(db, usuario, r.materia, args.proveedor);
    }

    if (llamada.name === "compras_en_curso") {
      const d = await cargarStock(pool);
      const ahora = Date.now();
      const q = L.sinAcentos(args.proveedor || "");
      const filas = d.compras.filter((c) => !q || L.sinAcentos(c.proveedor).includes(q));
      return { cantidad: filas.length, renglones: filas.slice(0, 30).map((c) => ({ articulo: c.articulo, proveedor: c.proveedor, pedido: c.cantidad_solicitada, recibido: c.cantidad_recibida, hace_dias: Math.floor((ahora - new Date(String(c.creada).replace(" ", "T")).getTime()) / 86400000) })) };
    }
    const [todos] = await pool.query("SELECT s.id AS solicitud_id, i.articulo, i.proveedor, i.cantidad_solicitada, i.cantidad_recibida, s.created_at AS creada FROM solicitudes_compra_items i JOIN solicitudes_compra s ON s.id = i.solicitud_id");
    if (llamada.name === "ranking_proveedores") return { proveedores: rankingProveedores(todos).slice(0, 20), nota: "cumplido_pct = porcentaje de lo pedido que ya llegó (incluye pedidos recientes que pueden estar en camino)." };
    if (llamada.name === "ficha_proveedor") {
      const q = L.sinAcentos(args.proveedor);
      const mios = todos.filter((r) => L.sinAcentos(r.proveedor).includes(q));
      if (!mios.length) return { error: `No hay compras registradas a "${args.proveedor}".`, proveedores: [...new Set(todos.map((r) => r.proveedor))].slice(0, 20) };
      const nombres = [...new Set(mios.map((r) => r.proveedor))];
      if (nombres.length > 1) return { error: "Coincide con varios proveedores.", coincidencias: nombres };
      const rk = rankingProveedores(mios)[0];
      const porArt = new Map();
      for (const r of mios) {
        const e = porArt.get(r.articulo) || { articulo: r.articulo, veces: 0, pedido: 0, recibido: 0 };
        e.veces++;
        e.pedido += Number(r.cantidad_solicitada || 0);
        e.recibido += Number(r.cantidad_recibida || 0);
        porArt.set(r.articulo, e);
      }
      const pendientes = mios.filter((r) => Number(r.cantidad_recibida || 0) < Number(r.cantidad_solicitada || 0));
      return { proveedor: nombres[0], renglones: rk.renglones, cumplido_pct: rk.cumplido_pct, pendientes_sin_recibir: pendientes.length, principales_articulos: [...porArt.values()].sort((a, b) => b.veces - a.veces).slice(0, 8) };
    }
    if (llamada.name === "solicitudes_por_firmar") {
      const [rows] = await pool.query("SELECT id, fecha, firma_jefe IS NOT NULL AS firmo_jefe, firma_gerente IS NOT NULL AS firmo_gerente, DATEDIFF(CURDATE(), DATE(created_at)) AS dias FROM solicitudes_compra WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 30");
      return { cantidad: rows.length, solicitudes: rows.map((r) => ({ id: r.id, fecha: r.fecha, firmo_jefe: !!r.firmo_jefe, firmo_gerente: !!r.firmo_gerente, hace_dias: r.dias })) };
    }
    return { error: `Herramienta desconocida: ${llamada.name}` };
  };

  return crearMotor({ ai, nombre: "Vera", construirInstrucciones, herramientas: HERRAMIENTAS, palabras: PALABRAS_HERRAMIENTA, ejecutar });
}

module.exports = { crearVera, construirInstrucciones, HERRAMIENTAS, faltantes, prioridadDe };
