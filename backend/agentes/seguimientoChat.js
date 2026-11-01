"use strict";
// Chat de Sofi, la agente de seguimiento de mails. Mismo motor de IA que el resto del equipo, con un perfil acotado:
// los mails que el equipo ENVIÓ (Cami y la persona de ventas) y que todavía no tuvieron respuesta. NUNCA envía: solo deja BORRADORES de seguimiento.
const { crearMotor, textoDerivacion } = require("./motorChat");
const { calcular } = require("../calculadora");
const S = require("./seguimientoMails");
const V = require("./ventasMails");

function hoyArgentina() {
  const ahora = new Date();
  return {
    iso: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(ahora),
    largo: ahora.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", year: "numeric", month: "long", day: "numeric" }),
  };
}

function construirInstrucciones(destinos = []) {
  const hoy = hoyArgentina();
  return `Sos Sofi, la agente de seguimiento de Conoflex Argentina, una fábrica de productos plásticos de seguridad vial (conos, postes, cadenas, lomos de burro, topes, delimitadores). Tu trabajo es que ningún presupuesto ni consulta se pierda: controlás los mails que el equipo de ventas ENVIÓ (los de Cami y los de la persona que vende) y que el cliente nunca contestó, y ayudás a retomarlos a tiempo.

HOY es ${hoy.largo} (${hoy.iso}).

TU ESPECIALIDAD (única y exclusiva)
- Solo atendés: mails enviados sin respuesta, su antigüedad, qué se mandó (presupuesto, consulta u otro) y los borradores de seguimiento.
- Si te piden algo de otra área (sueldos, stock, compras, producción, armar un presupuesto nuevo) decilo con amabilidad en una línea y, si podés, derivalo al agente que corresponde (los presupuestos nuevos los arma Cami).
- NUNCA enviás mails. Lo único que hacés es dejar BORRADORES de seguimiento en Gmail, dentro del mismo hilo, para que la persona los revise, los ajuste y los envíe ella. Jamás digas que mandaste o recordaste algo al cliente.
- No necesitás etiquetas: revisás toda la carpeta de enviados cada pocos minutos (y solo lo que cambió). Un hilo deja de aparecer cuando el cliente responde.
- Los datos salen de tus herramientas: nunca inventes clientes, fechas, importes ni cantidades de días. Si no lo tenés, decilo.
- Para el estado general usá panorama_seguimiento; para listar, hilos_sin_respuesta; para el detalle y lo que se escribió, ver_hilo; para dejar el seguimiento listo, preparar_seguimiento (solo si la persona lo pide o aprueba tu ofrecimiento).
- Si la persona dice que un cliente ya no hace falta seguir, usá descartar_hilo; si quiere que se lo recuerdes más adelante, posponer_hilo (en días); si se arrepiente, reabrir_hilo. Hacelo solo cuando lo pida.
- Reglas de urgencia: un presupuesto sin respuesta es ALTA desde ${S.CONFIG.diasUrgente} días y MEDIA desde ${S.CONFIG.diasAviso}; pasados ${S.CONFIG.diasFrio} días se considera frío y conviene decidir si se da por perdido. Una consulta o un mail informativo pesa menos. Los rebotes son siempre urgentes.
- Podés priorizar: primero los presupuestos más viejos que todavía no se enfriaron, después consultas, y avisá cuando algo ya se enfrió.

${textoDerivacion(destinos)}
CÓMO RESPONDER (el formato importa: la persona lee en un chat y quiere poco texto, muy prolijo)
- Español rioplatense, cálido, directo. Primero la respuesta, después el detalle. Nada de relleno.
- PRIMERA LÍNEA = una frase corta y natural (máx. 25 palabras), como si la dijeras en voz alta: "Tenés tres presupuestos sin respuesta, el más viejo hace nueve días." Sin símbolos, listas ni números largos.
- Después de una línea en blanco, los datos en MARKDOWN prolijo: lista con "- " o tabla corta (máx. 8 filas) con cliente, asunto, días y qué se mandó. Ofrecé el resto en una pregunta corta.
- Lo que requiera acción va en una línea final que empiece con "Ojo:" (ej: "Ojo: el mail a Pérez rebotó, hay que revisar la dirección.").
- Si te saludan o preguntan quién sos, presentate en una o dos frases (sos Sofi, de seguimiento de mails) y preguntá en qué ayudar.
- Formato argentino: miles con punto y decimales con coma.`;
}

const vacio = { type: "OBJECT", properties: {} };
const porHilo = { type: "OBJECT", properties: { hilo: { type: "STRING", description: "Id del hilo, o parte del nombre del cliente, su mail o el asunto." } }, required: ["hilo"] };
const HERRAMIENTAS = [
  {
    functionDeclarations: [
      { name: "panorama_seguimiento", description: "Estado general: cuántos mails enviados esperan respuesta, cuántos son presupuestos, urgentes, rebotados y fríos; cuántos respondieron en los últimos 30 días; los más urgentes.", parameters: vacio },
      { name: "hilos_sin_respuesta", description: "Lista de hilos enviados sin respuesta, del más viejo al más nuevo, con días de espera y qué se mandó. Se puede filtrar por cliente, solo presupuestos o por mínimo de días.", parameters: { type: "OBJECT", properties: { cliente: { type: "STRING", description: "Parte del nombre, mail o asunto." }, solo_presupuestos: { type: "BOOLEAN" }, min_dias: { type: "NUMBER", description: "Mostrar solo los que llevan al menos esta cantidad de días." }, incluir_pospuestos: { type: "BOOLEAN" } } } },
      { name: "ver_hilo", description: "Detalle de UN hilo: a quién se lo mandamos, cuándo, qué se mandó y los últimos mensajes de la conversación.", parameters: porHilo },
      { name: "preparar_seguimiento", description: "Deja un BORRADOR de seguimiento en Gmail, en el mismo hilo (NO lo envía). Redacta el texto con IA a partir de la conversación; si la persona dictó el texto, pasalo en texto_propio.", parameters: { type: "OBJECT", properties: { hilo: { type: "STRING", description: "Id del hilo o parte del cliente/asunto." }, texto_propio: { type: "STRING", description: "Opcional: el texto exacto que quiere la persona." } }, required: ["hilo"] } },
      { name: "posponer_hilo", description: "Silencia un hilo unos días: vuelve a avisar cuando pase ese plazo (1 a 60 días). Usala solo si la persona lo pide.", parameters: { type: "OBJECT", properties: { hilo: { type: "STRING" }, dias: { type: "NUMBER" }, motivo: { type: "STRING" } }, required: ["hilo", "dias"] } },
      { name: "descartar_hilo", description: "Deja de reclamar ese hilo (el cliente ya no interesa, se resolvió por teléfono, etc.). Vuelve a aparecer solo si hay novedades en el hilo. Usala solo si la persona lo pide.", parameters: { type: "OBJECT", properties: { hilo: { type: "STRING" }, motivo: { type: "STRING" } }, required: ["hilo"] } },
      { name: "reabrir_hilo", description: "Vuelve a seguir un hilo que se había descartado o pospuesto.", parameters: porHilo },
      { name: "calculadora", description: "Hace una cuenta exacta. Usala para cualquier operación aritmética.", parameters: { type: "OBJECT", properties: { expresion: { type: "STRING", description: "Expresión, ej: (1200 - 340) / 30" } }, required: ["expresion"] } },
    ],
  },
];

const PALABRAS_HERRAMIENTA = {
  panorama_seguimiento: "Revisó el panorama de seguimiento",
  hilos_sin_respuesta: "Revisó los mails sin respuesta",
  ver_hilo: "Leyó un hilo",
  preparar_seguimiento: "Armó un borrador de seguimiento en Gmail",
  posponer_hilo: "Pospuso un seguimiento",
  descartar_hilo: "Dejó de seguir un hilo",
  reabrir_hilo: "Volvió a seguir un hilo",
  calculadora: "Hizo una cuenta",
};

const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const publico = (h) => ({
  id: h.thread_id, cliente: h.contacto_nombre || h.contacto_email, email: h.contacto_email, asunto: h.asunto, dias_sin_respuesta: h.dias, estado: h.estado,
  que_mandamos: h.que_enviamos || ({ PRESUPUESTO: "un presupuesto", CONSULTA: "una consulta", CORTESIA: "un saludo", OTRO: "un mail" }[h.clase] || "sin clasificar todavía"),
  urgencia: h.severidad || null, veces_que_escribimos_sin_respuesta: h.envios_sin_respuesta, tiene_borrador_de_seguimiento: !!h.borrador_id,
});

function crearSofi({ ai, db, seguimiento }) {
  const ejecutar = async (llamada, uso, ctx = {}) => {
    const args = llamada.args || {};
    if (llamada.name === "calculadora") return calcular(args.expresion);

    if (llamada.name === "panorama_seguimiento") {
      const c = await S.conteos(db);
      const lista = (await S.listar(db, { estados: ["ESPERANDO", "REBOTE"], limite: 200 })).filter((h) => h.severidad).sort((a, b) => ({ ALTA: 0, MEDIA: 1, BAJA: 2 }[a.severidad] - { ALTA: 0, MEDIA: 1, BAJA: 2 }[b.severidad]) || (b.dias ?? 0) - (a.dias ?? 0));
      return {
        esperando_respuesta: c.total_esperando, para_avisar_ya: c.para_avisar, presupuestos_sin_respuesta: c.presupuestos, urgentes: c.urgentes, rebotados: c.rebotes, fríos: c.frios, pospuestos: c.pospuestos, respondieron_ultimos_30_dias: c.respondidos_30d,
        mas_urgentes: lista.slice(0, 6).map(publico),
        aclaracion: "Se controla toda la carpeta de enviados (Cami y la persona de ventas) sin necesidad de etiquetas.",
      };
    }

    if (llamada.name === "hilos_sin_respuesta") {
      const q = sinAcentos(args.cliente);
      let lista = await S.listar(db, { estados: args.incluir_pospuestos ? ["ESPERANDO", "REBOTE", "POSPUESTO"] : ["ESPERANDO", "REBOTE"], limite: 200 });
      if (!args.incluir_pospuestos) lista = lista.filter((h) => !h.pospuesto);
      if (q) lista = lista.filter((h) => sinAcentos(`${h.contacto_nombre} ${h.contacto_email} ${h.asunto}`).includes(q));
      if (args.solo_presupuestos) lista = lista.filter((h) => h.clase === "PRESUPUESTO");
      if (Number(args.min_dias) > 0) lista = lista.filter((h) => (h.dias ?? 0) >= Number(args.min_dias));
      lista = lista.filter((h) => h.estado === "REBOTE" || h.clase !== "CORTESIA");
      lista.sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));
      return { cantidad: lista.length, hilos: lista.slice(0, 15).map(publico), ...(lista.length > 15 ? { aviso: `Hay ${lista.length - 15} más: pedime filtrar por cliente o por días.` } : {}) };
    }

    if (llamada.name === "ver_hilo") {
      const h = await S.obtener(db, args.hilo);
      if (!h) return { error: "No encontré ese hilo entre los mails enviados que sigo." };
      uso.operario = h.contacto_nombre;
      let conversacion = [];
      try {
        conversacion = (await seguimiento.historialHilo(h.thread_id)).slice(-3).map((m) => ({ de: m.enviado ? "nosotros" : "cliente", fecha: m.fecha, texto: String(m.texto || "").slice(0, 900) }));
      } catch (e) {
        if (e.status === 401) return { error: "Gmail no está conectado." };
      }
      return { ...publico({ ...h, severidad: S.severidadDe({ clase: h.clase, dias: h.dias ?? 0, estado: h.estado === "REBOTE" ? "REBOTE" : "ESPERANDO" }) }), ultimo_mail_nuestro: h.ultimo_nuestro_en, mensajes_en_el_hilo: h.mensajes, ultimos_mensajes: conversacion };
    }

    if (llamada.name === "preparar_seguimiento") {
      if (ctx.modo === "oficina") return { error: "Los borradores de seguimiento se piden hablando directo con Sofi." };
      const h = await S.obtener(db, args.hilo);
      if (!h) return { error: "No encontré ese hilo entre los mails enviados que sigo." };
      uso.operario = h.contacto_nombre;
      const r = await S.prepararSeguimiento({
        db, deps: seguimiento, ai, threadId: h.thread_id, reglas: await V.notasTexto(db).catch(() => ""), ejemplos: await V.ejemplosEnviadosTexto(db, { cantidad: 2, max: 600 }).catch(() => ""), textoPropio: args.texto_propio || null,
      });
      if (!r.ok) return { error: r.error || "No pude armar el seguimiento." };
      if (r.yaEstaba) return { ya_estaba: true, instruccion: "Ya hay un borrador de seguimiento armado para este hilo en Gmail. Decíselo a la persona." };
      return { ok: true, borrador_en_gmail: true, enviado: false, texto_del_borrador: r.texto, instruccion: "El borrador quedó en Gmail SIN enviar, en el mismo hilo. Mostrale el texto resumido y recordale que lo revise y lo envíe ella." };
    }

    if (llamada.name === "posponer_hilo") {
      if (ctx.modo === "oficina") return { error: "Esto se pide hablando directo con Sofi." };
      const r = await S.posponer(db, { threadId: args.hilo, dias: args.dias, usuario: ctx.usuario?.nombre, nota: args.motivo });
      if (r.error) return { error: r.error };
      uso.operario = r.hilo.contacto_nombre;
      return { ok: true, cliente: r.hilo.contacto_nombre, vuelve_a_avisar_en_dias: r.dias };
    }
    if (llamada.name === "descartar_hilo") {
      if (ctx.modo === "oficina") return { error: "Esto se pide hablando directo con Sofi." };
      const r = await S.descartar(db, { threadId: args.hilo, usuario: ctx.usuario?.nombre, nota: args.motivo });
      if (r.error) return { error: r.error };
      uso.operario = r.hilo.contacto_nombre;
      return { ok: true, cliente: r.hilo.contacto_nombre, nota: "Dejo de reclamarlo; reaparece solo si hay novedades en el hilo." };
    }
    if (llamada.name === "reabrir_hilo") {
      if (ctx.modo === "oficina") return { error: "Esto se pide hablando directo con Sofi." };
      const r = await S.reabrir(db, { threadId: args.hilo, usuario: ctx.usuario?.nombre });
      if (r.error) return { error: r.error };
      uso.operario = r.hilo.contacto_nombre;
      return { ok: true, cliente: r.hilo.contacto_nombre };
    }
    return { error: `Herramienta desconocida: ${llamada.name}` };
  };

  return crearMotor({ ai, nombre: "Sofi", construirInstrucciones, herramientas: HERRAMIENTAS, palabras: PALABRAS_HERRAMIENTA, ejecutar });
}

module.exports = { crearSofi, construirInstrucciones, HERRAMIENTAS };
