"use strict";
// Sofi, segunda función: clientes que NOS escribieron y todavía no les respondimos (el lado "recibido" del seguimiento).
// Solo lee encabezados de Gmail, no guarda nada en la base (se recalcula en cada revisión) y NUNCA envía.
const S = require("./seguimientoMails");

const HORA = 3600000;
const DIA = 24 * HORA;
const CONFIG = {
  ventanaDias: Number(process.env.SEGUIMIENTO_RECIBIDOS_DIAS) > 0 ? Number(process.env.SEGUIMIENTO_RECIBIDOS_DIAS) : 10,
  minimoHoras: 4, // hasta ahí es normal que todavía no se haya contestado
  maxHilos: 60,
};

/**
 * ¿Hay alguien afuera esperando nuestra respuesta en este hilo?
 * Sí si lo último real (sin respuestas automáticas) es de un externo, nadie de casa contestó después y no hay un borrador armado.
 */
function analizarEntrante(hilo, { miEmail = "", internos = S.dominiosInternos(miEmail) } = {}) {
  const yo = String(miEmail || "").toLowerCase();
  const todos = (hilo?.mensajes || []).slice().sort((a, b) => a.fecha - b.fecha);
  const msgs = todos.filter((m) => !m.borrador);
  if (!msgs.length) return null;
  const reales = msgs.filter((m) => m.enviado || !(m.automatico || S.AUTOMATICO.test(m.asunto || "")));
  const ultimo = reales[reales.length - 1];
  if (!ultimo || ultimo.enviado) return null;
  const de = S.direccion(ultimo.de);
  if (!de || de === yo || internos.has(de.split("@")[1]) || S.NO_REPLY.test(de) || S.REBOTE.test(`${ultimo.de} ${ultimo.asunto}`)) return null;
  const nombre = S.nombreDe(String(ultimo.de || "").replace(/<[^>]*>/, ""));
  return {
    threadId: hilo.threadId, asunto: S.recorte(ultimo.asunto || "(sin asunto)", 300), contacto_email: de, contacto_nombre: nombre || de,
    ultimo_ms: ultimo.fecha, ultimo_msg_id: ultimo.id, mensajes: msgs.length, snippet: S.recorte(ultimo.snippet, 300),
    tiene_borrador: todos.some((m) => m.borrador),
    nuestro_antes: msgs.some((m) => m.enviado), // ya veníamos hablando con esa persona
  };
}

function severidadEntrante(horas) {
  if (horas >= 72) return "ALTA";
  if (horas >= 24) return "MEDIA";
  return "BAJA";
}

const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const hace = (horas) => (horas >= 48 ? plural(Math.floor(horas / 24), "día", "días") : plural(Math.max(1, Math.floor(horas)), "hora", "horas"));

function armarHallazgos(lista, { ahoraMs = Date.now() } = {}) {
  return lista.map((h) => {
    const horas = Math.max(0, (ahoraMs - h.ultimo_ms) / HORA);
    return {
      clave: `sinres:${h.threadId}:${h.ultimo_msg_id}`,
      tipo: "CLIENTE_SIN_RESPUESTA",
      severidad: severidadEntrante(horas),
      titulo: `${h.contacto_nombre} escribió hace ${hace(horas)} y no le respondimos`,
      texto: `${h.asunto}.${h.nuestro_antes ? " Ya veníamos hablando." : " Es un contacto nuevo."}${h.tiene_borrador ? " Ya hay un borrador armado en Gmail." : ""} ${h.snippet ? `Dice: “${h.snippet.slice(0, 160)}”` : ""}`.trim(),
      operario: h.contacto_nombre,
      fecha: null,
    };
  });
}

/** Busca en la bandeja de entrada. `deps`: { miEmail(), listarRecibidos({dias,max}), leerHilo(threadId) }. */
async function buscar({ deps, ahoraMs = Date.now(), ventanaDias = CONFIG.ventanaDias }) {
  const yo = await deps.miEmail();
  const internos = S.dominiosInternos(yo);
  const hilos = await deps.listarRecibidos({ dias: ventanaDias, max: CONFIG.maxHilos });
  const out = [];
  for (const t of hilos) {
    let hilo;
    try {
      hilo = await deps.leerHilo(t.threadId);
    } catch (e) {
      if (e.status === 401 || e.code === 401) throw e;
      continue;
    }
    const a = analizarEntrante(hilo, { miEmail: yo, internos });
    if (!a) continue;
    const horas = (ahoraMs - a.ultimo_ms) / HORA;
    if (horas < CONFIG.minimoHoras) continue;
    out.push({ ...a, horas: Math.floor(horas), dias: Math.floor(horas / 24), severidad: severidadEntrante(horas) });
  }
  return out.sort((x, y) => y.horas - x.horas);
}

module.exports = { CONFIG, analizarEntrante, armarHallazgos, buscar, severidadEntrante, DIA };
