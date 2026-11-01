"use strict";
// "Preguntale a la oficina": una sola pregunta para todo el equipo. Un paso corto decide a qué agentes les toca
// (cada uno con su parte de la pregunta) y después cada uno responde con sus propias herramientas.
const { CONFIG } = require("../connie");

const PALABRAS = {
  rrhh: /(sueld|liquidaci|horas? extra|fichad|presentismo|feriado|falta|llegad|operario|personal|ausen|licencia|turno|vacacion|legajo|asistencia)/i,
  stock: /(stock|dep[oó]sito|materia prima|semielaborad|inventario|quiebre|cu[aá]nto hay|se acaba|alcanza)/i,
  compras: /(compra|proveedor|solicitud|cotizaci|firma|orden de compra|entrega de material|pedir)/i,
  ventas: /(mail|correo|presupuesto|cotizaci[oó]n al cliente|borrador|lista de precios|consulta de (un )?cliente|vender|venta)/i,
  produccion: /(producci|fabricar|fabricaci|pedido|plan de la semana|planta|m[aá]quina|lote|entregar|cliente)/i,
};

/** Si el modelo no contesta, se decide por palabras clave; sin ninguna coincidencia se pregunta a todos. */
function rutearPorPalabras(pregunta, disponibles) {
  const hits = disponibles.filter((a) => PALABRAS[a.id]?.test(pregunta));
  const elegidos = hits.length ? hits : disponibles;
  return elegidos.map((a) => ({ agente: a.id, pregunta }));
}

function leerConsultas(texto, disponibles) {
  const limpio = String(texto || "").replace(/```json|```/g, "").trim();
  const ini = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (ini < 0 || fin <= ini) return null;
  let j;
  try {
    j = JSON.parse(limpio.slice(ini, fin + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(j.consultas)) return null;
  const vistos = new Set();
  const out = [];
  for (const c of j.consultas) {
    const id = String(c?.agente || "");
    const pregunta = String(c?.pregunta || "").trim().slice(0, 600);
    if (!disponibles.some((a) => a.id === id) || !pregunta || vistos.has(id)) continue;
    vistos.add(id);
    out.push({ agente: id, pregunta });
  }
  return out.slice(0, 4);
}

async function elegirAgentes({ ai, pregunta, disponibles }) {
  const lista = disponibles.map((a) => `- ${a.id} (${a.nombre}, ${a.puesto}): ${a.descripcion}`).join("\n");
  const prompt = `Sos quien recibe las preguntas en la oficina de una fábrica de productos plásticos de seguridad vial. Decidí a qué agentes del equipo les toca contestar.

Agentes:
${lista}

Pregunta de la persona: "${pregunta}"

Reglas:
- Elegí SOLO a quienes realmente tienen algo que aportar (normalmente 1 o 2). Una pregunta general sobre cómo está la planta puede ir a todos, con una consulta propia de su área para cada uno.
- Para cada agente reformulá la consulta para que sea completa y de SU área (autosuficiente).
- Si la pregunta no es de ninguna de estas áreas, devolvé una lista vacía.
Respondé SOLO con JSON: {"consultas":[{"agente":"id","pregunta":"consulta para ese agente"}]}`;
  try {
    const r = await ai.models.generateContent({
      model: CONFIG.modelo,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0, httpOptions: { timeout: 20000 }, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: "application/json" },
    });
    const c = leerConsultas(r.text, disponibles);
    if (c) return c;
  } catch (e) {
    console.error("[oficina] ruteo:", e.message);
  }
  return rutearPorPalabras(pregunta, disponibles);
}

/** Pregunta a los agentes elegidos en paralelo. `chats`: { id: { responder } }. */
async function preguntarOficina({ ai, chats, disponibles, mensaje, usuario }) {
  const consultas = await elegirAgentes({ ai, pregunta: mensaje, disponibles });
  if (!consultas.length) return { respuestas: [], nadie: true };
  const res = await Promise.allSettled(
    consultas.map((c) => chats[c.agente].responder({ mensaje: c.pregunta, historial: [], destinos: [], usuario, modo: "oficina" })),
  );
  const respuestas = consultas.map((c, i) => {
    const a = disponibles.find((x) => x.id === c.agente);
    const base = { agente: a.id, nombre: a.nombre, puesto: a.puesto, consulta: c.pregunta };
    const r = res[i];
    if (r.status === "fulfilled") return { ...base, respuesta: r.value.respuesta, herramientas: (r.value.herramientas || []).filter((h) => h.nombre !== "calculadora").map((h) => h.texto) };
    console.error(`[oficina ${a.nombre}]`, r.reason?.message);
    return { ...base, error: "No pude contestar en este momento." };
  });
  return { respuestas, nadie: false };
}

module.exports = { elegirAgentes, leerConsultas, rutearPorPalabras, preguntarOficina };
