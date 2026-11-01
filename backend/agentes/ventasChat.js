"use strict";
// Chat de Cami, la agente de ventas. Mismo motor de IA que el resto del equipo, con un perfil acotado: los mails de clientes que
// la persona etiquetó como IA-Consulta, sus borradores y lo que se corrigió. Solo puede dejar BORRADORES: nunca envía un mail.
const crypto = require("crypto");
const { crearMotor, textoDerivacion } = require("./motorChat");
const { calcular } = require("../calculadora");
const V = require("./ventasMails");

const VIGENCIA_MS = 10 * 60 * 1000;
const propuestas = new Map();
const limpiar = (ahora = Date.now()) => {
  for (const [k, p] of propuestas) if (p.vence < ahora) propuestas.delete(k);
};

/** Una nota nueva para las reglas comerciales: queda pendiente hasta que la persona la confirme con el botón. */
function proponerNota({ usuario, texto, ahora = Date.now() }) {
  const t = String(texto || "").replace(/\s+/g, " ").trim().slice(0, 500);
  if (t.length < 8) return { error: "La nota es muy corta: escribila completa." };
  limpiar(ahora);
  const token = crypto.randomBytes(12).toString("hex");
  propuestas.set(token, { token, usuarioId: usuario?.id, texto: t, vence: ahora + VIGENCIA_MS });
  return { propuesta: { tipo: "nota", token, texto: t } };
}
async function confirmarNota({ db, usuario, token, ahora = Date.now() }) {
  limpiar(ahora);
  const p = propuestas.get(String(token || ""));
  if (!p || p.usuarioId !== usuario?.id) return { error: "Esa confirmación venció o ya se usó. Pedímelo de nuevo.", status: 404 };
  propuestas.delete(p.token);
  const r = await V.guardarNota(db, { texto: p.texto, usuario: usuario.nombre });
  if (r.error) return { error: r.error, status: 400 };
  return { ok: true, texto: r.texto };
}
function cancelarNota({ usuario, token }) {
  const p = propuestas.get(String(token || ""));
  if (p && p.usuarioId === usuario?.id) propuestas.delete(p.token);
  return { ok: true };
}

function hoyArgentina() {
  const ahora = new Date();
  return {
    iso: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ahora),
    largo: ahora.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", year: "numeric", month: "long", day: "numeric" }),
  };
}

function construirInstrucciones(destinos = []) {
  const hoy = hoyArgentina();
  return `Sos Cami, la agente de ventas de Conoflex Argentina, una fábrica de productos plásticos de seguridad vial (conos, postes, cadenas, lomos de burro, topes, delimitadores). Tu trabajo es atender los mails de clientes que la persona marca en Gmail con la etiqueta IA-Consulta: los leés, preparás el borrador de respuesta con el cotizador y aprendés de lo que la persona corrige.

HOY es ${hoy.largo} (${hoy.iso}).

TU ESPECIALIDAD (única y exclusiva)
- Solo atendés: los mails etiquetados IA-Consulta, sus borradores de respuesta y las correcciones que se hicieron antes de enviarlos.
- Si te piden algo de otra área (sueldos, stock, compras, producción) decilo con amabilidad en una línea y, si podés, derivalo al agente que corresponde.
- NUNCA enviás mails. Lo único que hacés es dejar BORRADORES en Gmail para que la persona los revise, los ajuste y los envíe ella. Jamás digas que mandaste o respondiste un mail al cliente.
- Los precios, descuentos y totales de un borrador los calcula el sistema (no vos) a partir de la lista de precios cargada. Si preguntan cómo se calculó algo, explicalo con los datos de la herramienta; si falta, decí que no lo tenés. Nunca inventes precios, productos, clientes, fechas ni cantidades.
- Los borradores pueden traer avisos ("a confirmar"): contáselos tal cual, porque son lo que la persona tiene que revisar antes de enviar.
- Para el estado general usá panorama_ventas; para ver mails, mails_ventas; para el detalle de uno, ver_mail; para armar un borrador a pedido, preparar_borrador (podés usarla solo si la persona lo pide o confirma). Para lo que se corrigió, correcciones_recientes.
- APRENDER: si la persona te da una regla o preferencia comercial que debe valer para todos los borradores ("a los distribuidores siempre 35%", "no ofrezcas cadena sin consultar largo"), usá proponer_nota con la regla tal cual la dijo. Eso NO la guarda: en el chat aparece un botón para que la persona la confirme. Después de usarla decí en una frase qué nota entendiste y que la confirme con el botón. Nunca digas que quedó anotada hasta que toque el botón. Si detectás un patrón en correcciones_recientes, podés sugerirlo, pero no lo anotes sin que la persona lo pida.
- Las notas confirmadas se suman a las reglas comerciales que ya existen en el sistema y rigen desde el próximo borrador.

${textoDerivacion(destinos)}
CÓMO RESPONDER (el formato importa: la persona lee en un chat y quiere poco texto, muy prolijo)
- Español rioplatense, cálido, directo. Primero la respuesta, después el detalle. Nada de relleno.
- PRIMERA LÍNEA = una frase corta y natural (máx. 25 palabras), como si la dijeras en voz alta: "Tenés dos consultas nuevas y un borrador listo para revisar." Sin símbolos, listas ni números largos.
- Después de una línea en blanco, los datos en MARKDOWN prolijo: lista con "- " o tabla corta (máx. 8 filas). Mostrá lo más importante primero y ofrecé el resto en una pregunta corta.
- Lo que requiera acción va en una línea final que empiece con "Ojo:" (ej: "Ojo: el borrador marca la cadena como 'a confirmar'.").
- Si te saludan o preguntan quién sos, presentate en una o dos frases (sos Cami, de ventas y mails) y preguntá en qué ayudar.
- Formato argentino: miles con punto y decimales con coma.`;
}

const vacio = { type: "OBJECT", properties: {} };
const HERRAMIENTAS = [
  {
    functionDeclarations: [
      { name: "panorama_ventas", description: "Estado general de los mails de clientes: cuántos hay sin responder, con borrador listo, atendidos y con error; si el armado automático de borradores está activo; las notas comerciales vigentes.", parameters: vacio },
      { name: "mails_ventas", description: "Lista de mails de clientes con su estado (PENDIENTE sin borrador, BORRADOR listo para revisar, ATENDIDO ya enviado, ERROR, RETIRADO si se sacó la etiqueta, DESCARTADO si se borró el borrador).", parameters: { type: "OBJECT", properties: { estado: { type: "STRING", description: "Filtrar por estado (opcional): PENDIENTE, BORRADOR, ATENDIDO, ERROR, RETIRADO o DESCARTADO." }, cliente: { type: "STRING", description: "Filtrar por parte del nombre o mail del cliente (opcional)." } } } },
      { name: "ver_mail", description: "Detalle de UN mail: qué pidió el cliente (resumen), estado, qué productos y precios llevó el borrador y los avisos para revisar. Se busca por id, o por parte del cliente o del asunto.", parameters: { type: "OBJECT", properties: { mail: { type: "STRING", description: "Id del mail, o parte del cliente / asunto." } }, required: ["mail"] } },
      { name: "preparar_borrador", description: "Arma el borrador de respuesta de UN mail en Gmail con el cotizador (NO lo envía). Usala solo si la persona lo pidió. Tarda unos segundos.", parameters: { type: "OBJECT", properties: { mail: { type: "STRING", description: "Id del mail, o parte del cliente / asunto." } }, required: ["mail"] } },
      { name: "correcciones_recientes", description: "Qué se cambió en los últimos borradores antes de enviarlos (descuento, importes, texto) y los patrones que se repiten.", parameters: vacio },
      { name: "notas_comerciales", description: "Las notas comerciales confirmadas que hoy se suman a las reglas de cada borrador.", parameters: vacio },
      { name: "proponer_nota", description: "Arma la PROPUESTA de una nota comercial nueva (no la guarda: la persona la confirma con un botón en el chat). Usala cuando la persona te dé una regla o preferencia para los próximos borradores.", parameters: { type: "OBJECT", properties: { texto: { type: "STRING", description: "La regla, escrita clara y completa, tal cual la pidió la persona." } }, required: ["texto"] } },
      { name: "calculadora", description: "Hace una cuenta exacta. Usala para cualquier operación aritmética.", parameters: { type: "OBJECT", properties: { expresion: { type: "STRING", description: "Expresión, ej: (1200 - 340) / 30" } }, required: ["expresion"] } },
    ],
  },
];

const PALABRAS_HERRAMIENTA = {
  panorama_ventas: "Revisó el panorama de mails",
  mails_ventas: "Revisó los mails de clientes",
  ver_mail: "Leyó un mail de cliente",
  preparar_borrador: "Armó un borrador en Gmail",
  correcciones_recientes: "Revisó las correcciones recientes",
  notas_comerciales: "Revisó las notas comerciales",
  proponer_nota: "Preparó una nota comercial para confirmar",
  calculadora: "Hizo una cuenta",
};

const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Resume la revisión del cotizador para contarla en el chat. */
function resumenRevision(rev) {
  if (!rev) return null;
  return {
    descuento_pct: rev.descuento_pct ?? null,
    adjunta_lista_de_precios: !!rev.adjunta_lista,
    productos: (rev.lineas || []).slice(0, 12).map((l) => ({ codigo: l.codigo, producto: l.nombre, cantidad: l.cantidad ?? null, unidad: l.unidad || null, precio_lista: l.lista ?? null, precio_con_descuento: l.con_descuento ?? null, total: l.total ?? null })),
    avisos: (rev.avisos || []).slice(0, 8),
  };
}

function crearCami({ ai, db, mails, autoActivo = async () => true }) {
  const buscar = async (q) => {
    const t = sinAcentos(q).trim();
    if (!t) return null;
    const todos = await V.listarRegistros(db, { limite: 100 });
    return todos.find((m) => m.mail_id === q) || todos.find((m) => sinAcentos(`${m.remitente} ${m.email_cliente} ${m.asunto}`).includes(t)) || null;
  };

  const ejecutar = async (llamada, uso, ctx = {}) => {
    const args = llamada.args || {};
    if (llamada.name === "calculadora") return calcular(args.expresion);

    if (llamada.name === "panorama_ventas") {
      const c = await V.conteos(db);
      const notas = await V.notasActivas(db);
      const pendientes = await V.listarRegistros(db, { estados: ["PENDIENTE", "BORRADOR", "ERROR"], limite: 8 });
      return {
        sin_responder_sin_borrador: c.PENDIENTE,
        borradores_listos_para_revisar: c.BORRADOR,
        con_error: c.ERROR,
        atendidos: c.ATENDIDO,
        armado_automatico_de_borradores: (await autoActivo()) ? "activo" : "apagado (solo arma borradores si se lo pedís)",
        notas_comerciales_vigentes: notas.length,
        para_atender: pendientes.map((m) => ({ id: m.mail_id, cliente: m.remitente, asunto: m.asunto, estado: m.estado, aviso: m.error || m.nota || null })),
      };
    }

    if (llamada.name === "mails_ventas") {
      const estado = String(args.estado || "").toUpperCase();
      const q = sinAcentos(args.cliente);
      let lista = await V.listarRegistros(db, { estados: V.ESTADOS.includes(estado) ? [estado] : null, limite: 60 });
      if (q) lista = lista.filter((m) => sinAcentos(`${m.remitente} ${m.email_cliente} ${m.asunto}`).includes(q));
      return { cantidad: lista.length, mails: lista.slice(0, 15).map((m) => ({ id: m.mail_id, cliente: m.remitente, asunto: m.asunto, estado: m.estado, recibido: m.fecha_mail || m.recibido, aviso: m.error || m.nota || null })) };
    }

    if (llamada.name === "ver_mail") {
      const m = await buscar(args.mail);
      if (!m) return { error: "No encontré ese mail entre los etiquetados IA-Consulta." };
      uso.operario = m.remitente;
      return {
        id: m.mail_id, cliente: m.remitente, email: m.email_cliente, asunto: m.asunto, estado: m.estado, recibido: m.fecha_mail || m.recibido,
        lo_que_pidio_el_cliente: String(m.resumen || "").slice(0, 1500),
        borrador: resumenRevision(m.revision),
        correccion_al_enviar: m.cambios ? V.describirCambios(m.cambios) : null,
        aviso: m.error || m.nota || null,
      };
    }

    if (llamada.name === "preparar_borrador") {
      if (ctx.modo === "oficina") return { error: "Los borradores se piden hablando directo con Cami." };
      const m = await buscar(args.mail);
      if (!m) return { error: "No encontré ese mail entre los etiquetados IA-Consulta." };
      uso.operario = m.remitente;
      if (m.estado === "BORRADOR" && m.draft_id) return { ya_estaba: true, instruccion: "Ya hay un borrador armado para este mail en Gmail. Decíselo a la persona; si quiere otro, que borre ese borrador de Gmail y te lo pida de nuevo." };
      if (m.estado === "ATENDIDO") return { error: "Ese mail ya está respondido (hay una respuesta enviada en el hilo)." };
      const lista = await mails.listar();
      const completo = lista.find((x) => x.id === m.mail_id);
      if (!completo) return { error: "Ese mail ya no tiene la etiqueta IA-Consulta en Gmail, así que no puedo leerlo. Volvé a etiquetarlo y probamos." };
      const r = await V.prepararBorrador({ db, mail: completo, borrador: mails.borrador, reglasExtra: await V.notasTexto(db) });
      if (!r.ok) return { error: "No pude armar el borrador en este momento. Probá de nuevo en unos minutos." };
      return { ok: true, borrador_en_gmail: true, enviado: false, revision: resumenRevision(r.revision), instruccion: "El borrador quedó en Gmail SIN enviar. Contá qué productos y descuento lleva y los avisos 'a confirmar' que tiene que revisar la persona antes de enviarlo." };
    }

    if (llamada.name === "correcciones_recientes") {
      const filas = await V.correccionesRecientes(db, { limite: 12 });
      return {
        cantidad: filas.length,
        correcciones: filas.slice(0, 8).map((f) => ({ cliente: f.remitente, asunto: f.asunto, que_cambio: V.describirCambios(f.cambios) })),
        patrones: V.patronesDeCorreccion(filas).map((p) => p.texto),
        ...(filas.length ? {} : { aviso: "Todavía no hay borradores que se hayan enviado para comparar." }),
      };
    }

    if (llamada.name === "notas_comerciales") {
      const notas = await V.notasActivas(db);
      return { cantidad: notas.length, notas: notas.map((n) => n.texto) };
    }

    if (llamada.name === "proponer_nota") {
      if (ctx.modo === "oficina") return { error: "Las notas comerciales se piden hablando directo con Cami, para poder confirmarlas con el botón." };
      const prop = proponerNota({ usuario: ctx.usuario, texto: args.texto });
      if (prop.error) return { error: prop.error };
      uso.confirmacion = prop.propuesta;
      uso.texto = "Preparó una nota comercial";
      return { ok: true, pendiente_de_confirmacion: true, nota: prop.propuesta.texto, instruccion: "NO está guardada. Decile a la persona qué nota entendiste y que la confirme con el botón de abajo." };
    }
    return { error: `Herramienta desconocida: ${llamada.name}` };
  };

  return crearMotor({ ai, nombre: "Cami", construirInstrucciones, herramientas: HERRAMIENTAS, palabras: PALABRAS_HERRAMIENTA, ejecutar });
}

module.exports = { crearCami, construirInstrucciones, HERRAMIENTAS, proponerNota, confirmarNota, cancelarNota, resumenRevision };
