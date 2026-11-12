"use strict";
// Modelo de IA de toda la app en un solo lugar.
//
// Google da de baja modelos cada tanto (gemini-2.5-flash, que usaba toda la app, se retiró en 2026). Para que no
// se caiga todo de golpe otra vez:
//   - Cualquier pedido a "gemini-2.5-flash" se manda al modelo configurado (GEMINI_MODELO).
//   - Si Google contesta que el modelo no existe o ya no está disponible, se reintenta con el de respaldo.
//   - Si contesta que está saturado o sin cuota por un momento, se reintenta una vez.
// Para cambiar de modelo alcanza con GEMINI_MODELO / GEMINI_MODELO_RESPALDO en el .env (y reiniciar).

const PRINCIPAL = () => process.env.GEMINI_MODELO || "gemini-3.5-flash";
const RESPALDO = () => process.env.GEMINI_MODELO_RESPALDO || "gemini-3.1-flash-lite";
const VOZ = () => process.env.AGENTES_TTS_MODEL || "gemini-3.1-flash-tts-preview";

/** Modelos viejos que se redirigen solos al configurado. */
function modeloPara(pedido) {
  const m = String(pedido || "");
  if (!m) return PRINCIPAL();
  if (/tts|image|audio|live/i.test(m)) return m; // voz, imágenes y audio tienen sus propios modelos
  if (/^gemini-(2\.0|2\.5)-flash(-lite)?(-\d+)?$/.test(m) || /^gemini-2\.5-flash-preview/.test(m)) return PRINCIPAL();
  return m;
}

const texto = (e) => `${e?.status || ""} ${e?.code || ""} ${e?.message || ""}`;
const esModeloNoDisponible = (e) => /\b404\b|NOT_FOUND|not found|no longer available|is not supported|deprecated|unsupported model/i.test(texto(e));
const esTransitorio = (e) => /\b429\b|\b503\b|\b500\b|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|try again/i.test(texto(e));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Envuelve ai.models.generateContent / generateContentStream con lo de arriba. Devuelve el mismo `ai`. */
function prepararIA(ai, { log = console } = {}) {
  if (!ai?.models || ai.__conoflexIA) return ai;
  for (const metodo of ["generateContent", "generateContentStream"]) {
    const original = ai.models[metodo]?.bind(ai.models);
    if (!original) continue;
    ai.models[metodo] = async (pedido = {}) => {
      const modelo = modeloPara(pedido.model);
      try {
        return await original({ ...pedido, model: modelo });
      } catch (e) {
        // Algunos modelos nuevos no aceptan el ajuste de "pensamiento" de los viejos: se reintenta sin él.
        if (pedido.config?.thinkingConfig && /thinking/i.test(texto(e))) {
          log.warn?.(`[ia] ${modelo} no acepta thinkingConfig; reintento sin él`);
          const { thinkingConfig, ...resto } = pedido.config;
          void thinkingConfig;
          return original({ ...pedido, model: modelo, config: resto });
        }
        if (esModeloNoDisponible(e) && /tts/i.test(modelo) && modelo !== VOZ()) {
          log.warn?.(`[ia] voz ${modelo} no disponible; uso ${VOZ()}`);
          return original({ ...pedido, model: VOZ() });
        }
        if (esModeloNoDisponible(e) && !/tts/i.test(modelo) && modelo !== RESPALDO()) {
          log.warn?.(`[ia] ${modelo} no disponible (${String(e.message).slice(0, 120)}); uso ${RESPALDO()}`);
          return original({ ...pedido, model: RESPALDO() });
        }
        if (esTransitorio(e)) {
          log.warn?.(`[ia] ${modelo} ocupado o sin cuota (${String(e.message).slice(0, 120)}); reintento`);
          await esperar(2000);
          return original({ ...pedido, model: modelo });
        }
        log.error?.(`[ia] ${modelo}: ${String(e.message).slice(0, 300)}`);
        throw e;
      }
    };
  }
  ai.__conoflexIA = true;
  return ai;
}

module.exports = { prepararIA, modeloPara, esModeloNoDisponible, esTransitorio, PRINCIPAL, RESPALDO };
