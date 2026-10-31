"use strict";
// Temario de la reunión de las 08:00 y sugerencias de mejora.
// El temario es la misma "mirada" que hacen los agentes en la reunión, pero en vivo: así se ve durante el día qué va a tratar cada uno.
// Las sugerencias salen de reglas sobre los datos (siempre) y, si hay IA disponible, de algunas ideas extra redactadas por Gemini.
const { ahoraAR, armarReunion, HORA_REUNION } = require("./reunion");
const { CONFIG } = require("../connie");

const DIAS = ["", "el lunes", "el martes", "el miércoles", "el jueves", "el viernes", "el sábado", "el domingo"];

/** Cuándo es la próxima reunión: hoy (si todavía no son las 08:00 de un día hábil), mañana o el próximo día hábil. */
function proximaReunion(ahora = new Date()) {
  const a = ahoraAR(ahora);
  if (a.dow <= 5 && a.minutos < HORA_REUNION * 60) return { fecha: a.hoy, cuando: "hoy a las 08:00", hoy: true };
  for (let i = 1; i <= 7; i++) {
    const f = ahoraAR(new Date(ahora.getTime() + i * 86400000));
    if (f.dow <= 5) return { fecha: f.hoy, cuando: i === 1 ? "mañana a las 08:00" : `${DIAS[f.dow]} a las 08:00`, hoy: false };
  }
  return { fecha: a.hoy, cuando: "el próximo día hábil a las 08:00", hoy: false };
}

const nombreDeLinea = (l) => String(l).split(":")[0].trim().toLowerCase();

/** Ideas por reglas, con memoria de las últimas reuniones: lo que se repite es lo que más vale la pena arreglar de fondo. */
async function sugerenciasDe({ db, secciones }) {
  const out = [];
  const [prev] = await db.query("SELECT contenido FROM agentes_reuniones WHERE contenido IS NOT NULL ORDER BY fecha DESC LIMIT 6").catch(() => [[]]);
  const historial = [];
  for (const r of prev) {
    try {
      historial.push(JSON.parse(r.contenido));
    } catch {
      /* reunión ilegible: se ignora */
    }
  }
  const repeticiones = (agente, clave) => historial.filter((h) => (h.secciones || []).some((s) => s.agente === agente && (s.lineas || []).some((l) => nombreDeLinea(l) === clave))).length;

  const stock = secciones.find((s) => s.agente === "stock");
  for (const l of (stock?.lineas || []).filter((x) => !/pedidos? internos?/i.test(x)).slice(0, 3)) {
    const k = nombreDeLinea(l);
    const veces = repeticiones("stock", k);
    if (veces >= 2) out.push({ agente: "stock", texto: `${l.split(":")[0]} aparece en crítico en ${veces + 1} reuniones seguidas: conviene fijar un stock mínimo y un punto de pedido para que no vuelva a pasar.` });
  }
  if ((stock?.lineas || []).some((l) => /pedidos? internos?/i.test(l))) out.push({ agente: "stock", texto: "Hay pedidos internos sin atender: definir quién los revisa a primera hora para que no se acumulen." });

  const [viejos] = await db.query("SELECT agente, COUNT(*) AS n FROM agentes_hallazgos WHERE estado = 'ABIERTO' AND created_at < (NOW() - INTERVAL 7 DAY) GROUP BY agente").catch(() => [[]]);
  const nombres = Object.fromEntries(secciones.map((s) => [s.agente, s.nombre]));
  for (const v of viejos) {
    if (Number(v.n) >= 3 && nombres[v.agente]) out.push({ agente: v.agente, texto: `${nombres[v.agente]} tiene ${v.n} avisos abiertos hace más de una semana: cerrarlos, justificarlos o asignarles responsable, así los que quedan son los que importan.` });
  }

  const prod = secciones.find((s) => s.agente === "produccion");
  if (prod?.urgente) out.push({ agente: "produccion", texto: "Hay prioridades de producción urgentes: arrancar el turno con el plan de fabricación ya definido, en lugar de decidirlo en el momento." });

  const urgentes = secciones.filter((s) => s.urgente).length;
  if (urgentes >= 3) out.push({ agente: "produccion", texto: `Hoy hay ${urgentes} áreas con temas urgentes a la vez: conviene que la reunión termine con un responsable y una hora límite para cada uno.` });
  if (!out.length) out.push({ agente: "produccion", texto: "Sin urgencias: buen momento para revisar mínimos de stock y avisos viejos antes de que se vuelvan problema." });
  return out.slice(0, 5);
}

/** Algunas ideas redactadas por Gemini a partir del resumen. Si falla, no pasa nada: quedan las de reglas. */
async function ideasConIA({ ai, secciones, ya = [] }) {
  if (!ai?.models) return [];
  const datos = secciones.map((s) => `- ${s.nombre} (${s.puesto}): ${s.resumen}${s.lineas.length ? ` [${s.lineas.join("; ")}]` : ""}`).join("\n");
  const prompt = `Sos el equipo de agentes de una fábrica de productos plásticos de señalización vial (inyección). Terminó la reunión de las 08:00. Resumen:
${datos}

Ya se sugirió: ${ya.map((y) => y.texto).join(" | ") || "nada"}.
Proponé hasta 2 ideas NUEVAS, concretas y accionables, para mejorar la forma de trabajar (procesos, anticipación, orden). Sin inventar números ni hechos que no estén en el resumen. Cada idea en una oración, español rioplatense.
Respondé SOLO con JSON: {"ideas":[{"agente":"rrhh|stock|compras|produccion","texto":"..."}]}`;
  try {
    const r = await ai.models.generateContent({
      model: CONFIG.modelo,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.4, httpOptions: { timeout: 20000 }, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: "application/json" },
    });
    const validos = new Set(secciones.map((s) => s.agente));
    const j = JSON.parse(String(r.text || "").replace(/^```json|```$/g, "").trim());
    return (Array.isArray(j.ideas) ? j.ideas : [])
      .filter((i) => i && validos.has(i.agente) && typeof i.texto === "string" && i.texto.trim().length > 15)
      .slice(0, 2)
      .map((i) => ({ agente: i.agente, texto: i.texto.trim().slice(0, 260), ia: true }));
  } catch (e) {
    console.error("[temario] ideas IA:", e.message);
    return [];
  }
}

let cache = null;
/** Temario en vivo (con una memoria corta para no repetir consultas pesadas cada vez que alguien abre la pantalla). */
async function armarTemario(deps, { ttlMs = 90000, ahora = new Date() } = {}) {
  if (cache && Date.now() - cache.t < ttlMs) return cache.v;
  const c = await armarReunion({ pool: deps.pool, db: deps.db, agentes: deps.agentes });
  const v = { ...c, sugerencias: await sugerenciasDe({ db: deps.db, secciones: c.secciones }), proxima: proximaReunion(ahora), actualizado: new Date().toISOString() };
  cache = { t: Date.now(), v };
  return v;
}
const olvidarTemario = () => {
  cache = null;
};

module.exports = { proximaReunion, sugerenciasDe, ideasConIA, armarTemario, olvidarTemario };
