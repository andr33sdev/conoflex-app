"use strict";
// Motor de conversación de los agentes: el MISMO cliente Gemini y la misma configuración de Connie, con un bucle de
// herramientas. Cada agente aporta sus instrucciones, sus herramientas y cómo ejecutarlas. Todos pueden DERIVAR la
// consulta a otro agente ("derivar_a_agente"); la derivación viaja en la respuesta para que la pantalla la muestre.
const { CONFIG, normalizarHistorial } = require("../connie");

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// Los agentes usan herramientas que ya hacen las cuentas: no necesitan "pensar" tanto como Connie (responden antes).
const PENSAMIENTO = process.env.AGENTES_PENSAMIENTO !== undefined && process.env.AGENTES_PENSAMIENTO !== "" && Number.isFinite(Number(process.env.AGENTES_PENSAMIENTO)) ? Number(process.env.AGENTES_PENSAMIENTO) : 256;

function herramientaDerivar(destinos) {
  return {
    name: "derivar_a_agente",
    description:
      "Pasa la consulta a OTRO agente del equipo cuando el tema es de su especialidad y no de la tuya. Usala solo si el usuario necesita eso y vos no podés resolverlo; después de usarla, decí en una línea corta que se lo pasaste a ese agente (no respondas vos el contenido). " +
      `Agentes disponibles: ${destinos.map((d) => `${d.id} (${d.nombre}: ${d.puesto})`).join("; ") || "ninguno"}.`,
    parameters: {
      type: "OBJECT",
      properties: {
        agente: { type: "STRING", description: `Id del agente: ${destinos.map((d) => d.id).join(", ")}.` },
        pregunta: { type: "STRING", description: "La consulta reformulada para ese agente, completa y con todos los datos que necesita (autosuficiente)." },
        motivo: { type: "STRING", description: "En pocas palabras, por qué se la pasás (ej: 'es un tema de stock')." },
      },
      required: ["agente", "pregunta"],
    },
  };
}

/**
 * @param {object} cfg
 *  ai, construirInstrucciones(destinos) → string, herramientas: [{functionDeclarations}], palabras: {tool: texto},
 *  ejecutar(llamada, uso) → resultado, nombre
 */
function crearMotor({ ai, nombre, construirInstrucciones, herramientas, palabras = {}, ejecutar, posprocesar = null }) {
  async function llamarModelo(contents, instrucciones, tools, { conHerramientas }) {
    const config = {
      systemInstruction: instrucciones,
      temperature: 0.2,
      httpOptions: { timeout: CONFIG.tiempoLlamadaModeloMs },
      tools,
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

  /** destinos: agentes a los que este usuario puede derivar [{id, nombre, puesto}] */
  async function responder({ mensaje, historial, destinos = [], usuario = null, modo = null }) {
    const inicio = Date.now();
    const instrucciones = construirInstrucciones(destinos);
    const tools = destinos.length ? [{ functionDeclarations: [...herramientas[0].functionDeclarations, herramientaDerivar(destinos)] }] : herramientas;
    const contents = [...normalizarHistorial(historial, mensaje), { role: "user", parts: [{ text: mensaje }] }];
    const usadas = [];
    const resultadosReales = []; // lo que devolvieron las herramientas: sirve para verificar la respuesta final
    let derivacion = null;
    let confirmacion = null;

    const ejecutarUna = async (llamada) => {
      const args = llamada.args || {};
      const uso = { nombre: llamada.name, texto: palabras[llamada.name] || llamada.name, periodo: args.mes || args.desde || (args.fechas ? args.fechas.join(", ") : null), operario: args.operario || args.materia_prima || args.semielaborado || null, ok: true };
      usadas.push(uso);
      try {
        if (llamada.name === "derivar_a_agente") {
          const d = destinos.find((x) => x.id === String(args.agente || ""));
          const pregunta = String(args.pregunta || "").trim().slice(0, 1500);
          if (!d || !pregunta) {
            uso.ok = false;
            return { error: "Ese agente no existe o no está habilitado para esta persona. Respondé vos con lo que puedas o decí que no podés ayudar con eso." };
          }
          derivacion = { agente: d.id, nombre: d.nombre, puesto: d.puesto, pregunta, motivo: String(args.motivo || "").trim().slice(0, 120) };
          uso.texto = `Se lo pasó a ${d.nombre}`;
          return { ok: true, derivado_a: d.nombre, instruccion: `Ya se lo pasaste a ${d.nombre}. Decile al usuario en UNA línea que se lo pasás y que ${d.nombre} lo ve ahora. No respondas el contenido.` };
        }
        const r = await ejecutar(llamada, uso, { usuario, destinos, modo });
        resultadosReales.push({ nombre: llamada.name, args, r });
        // Una herramienta puede dejar una derivación lista (ej: Nati le pasa materiales a Vera): la pantalla la muestra como tarjeta.
        if (uso.derivacion) {
          derivacion = uso.derivacion;
          delete uso.derivacion;
        }
        // Una herramienta puede dejar algo para confirmar con un botón (ej: Nati propone un ajuste de stock).
        if (uso.confirmacion) {
          confirmacion = uso.confirmacion;
          delete uso.confirmacion;
        }
        return r;
      } catch (e) {
        console.error(`[${nombre} ${llamada.name}]`, e.message);
        uso.ok = false;
        return { error: "No pude leer los datos para eso." };
      }
    };

    const finalizar = (resp) => {
      let texto = String(resp.text || "").replace(/\n{3,}/g, "\n\n").trim();
      if (posprocesar && texto) {
        try {
          texto = posprocesar(texto, resultadosReales) || texto;
        } catch (e) {
          console.error(`[${nombre} posprocesar]`, e.message);
        }
      }
      return {
        respuesta: texto || (derivacion ? `Se lo paso a ${derivacion.nombre}.` : "No pude armar una respuesta con los datos que tengo. ¿Me la repetís de otra forma?"),
        herramientas: usadas,
        derivacion,
        confirmacion,
        ms: Date.now() - inicio,
      };
    };

    let respuesta;
    for (let rondas = 0; rondas < CONFIG.maxRondas; rondas++) {
      if (Date.now() - inicio > CONFIG.tiempoTotalMs) break;
      respuesta = await llamarModelo(contents, instrucciones, tools, { conHerramientas: true });
      const llamadas = respuesta.functionCalls;
      if (!llamadas || !llamadas.length) return finalizar(respuesta);
      contents.push(respuesta.candidates[0].content);
      const resultados = await Promise.all(llamadas.map(ejecutarUna));
      contents.push({ role: "user", parts: llamadas.map((l, i) => ({ functionResponse: { name: l.name, response: { resultado: resultados[i] } } })) });
    }
    respuesta = await llamarModelo(contents, instrucciones, tools, { conHerramientas: false });
    return finalizar(respuesta);
  }

  return { responder };
}

/** Párrafo de instrucciones sobre derivaciones (vacío si no hay a quién derivar). */
function textoDerivacion(destinos = []) {
  if (!destinos.length) return "";
  return `EQUIPO Y DERIVACIONES
- Trabajás con otros agentes: ${destinos.map((d) => `${d.nombre} (${d.puesto})`).join("; ")}.
- Si la persona pide algo que es claramente de la especialidad de otro agente, usá derivar_a_agente con la consulta bien armada y avisale en UNA línea ("Se lo paso a ${destinos[0].nombre}, que lo ve ahora."). Si la consulta mezcla temas, respondé la parte tuya y derivá solo la otra.
- Derivá solo cuando haga falta; no derives saludos ni temas que podés resolver vos.
`;
}

module.exports = { textoDerivacion, crearMotor, herramientaDerivar, PENSAMIENTO };
