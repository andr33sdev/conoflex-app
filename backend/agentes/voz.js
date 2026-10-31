"use strict";
// Voz de los agentes: síntesis con el mismo Gemini que usa Connie (modelo de voz), siempre con voz femenina.
// Devuelve un WAV listo para reproducir en el navegador. Si falla, el frontend cae a la voz del dispositivo.
const MODELO_VOZ = process.env.AGENTES_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const VOCES_FEMENINAS = ["Leda", "Aoede", "Kore", "Zephyr", "Despina", "Achernar", "Sulafat", "Vindemiatrix", "Callirrhoe", "Autonoe"];
const VOZ_DEFECTO = VOCES_FEMENINAS.includes(process.env.AGENTES_VOZ) ? process.env.AGENTES_VOZ : "Leda";
const MAX_CARACTERES = 700;

/** Envuelve audio PCM de 16 bits (mono) en un contenedor WAV. */
function pcmAWav(pcm, frecuencia = 24000) {
  const cab = Buffer.alloc(44);
  cab.write("RIFF", 0);
  cab.writeUInt32LE(36 + pcm.length, 4);
  cab.write("WAVE", 8);
  cab.write("fmt ", 12);
  cab.writeUInt32LE(16, 16);
  cab.writeUInt16LE(1, 20); // PCM
  cab.writeUInt16LE(1, 22); // mono
  cab.writeUInt32LE(frecuencia, 24);
  cab.writeUInt32LE(frecuencia * 2, 28);
  cab.writeUInt16LE(2, 32);
  cab.writeUInt16LE(16, 34);
  cab.write("data", 36);
  cab.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([cab, pcm]);
}

function frecuenciaDe(mime) {
  const m = /rate=(\d+)/i.exec(String(mime || ""));
  return m ? Number(m[1]) : 24000;
}

async function sintetizar(ai, texto, { voz = VOZ_DEFECTO, modelo = MODELO_VOZ, timeoutMs = 25000 } = {}) {
  const limpio = String(texto || "").replace(/\s+/g, " ").trim().slice(0, MAX_CARACTERES);
  if (!limpio) throw new Error("Sin texto para leer.");
  const r = await ai.models.generateContent({
    model: modelo,
    contents: [{ role: "user", parts: [{ text: `Decilo con voz de mujer joven, cálida, natural y cercana, con acento rioplatense argentino y ritmo de conversación, sin sonar robótica: ${limpio}` }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOCES_FEMENINAS.includes(voz) ? voz : VOZ_DEFECTO } } },
      httpOptions: { timeout: timeoutMs },
    },
  });
  const parte = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!parte) throw new Error("El modelo no devolvió audio.");
  const pcm = Buffer.from(parte.inlineData.data, "base64");
  const mime = String(parte.inlineData.mimeType || "");
  // Si ya viene en WAV se devuelve tal cual; lo habitual es PCM crudo de 16 bits.
  return /wav/i.test(mime) ? pcm : pcmAWav(pcm, frecuenciaDe(mime));
}

module.exports = { sintetizar, pcmAWav, frecuenciaDe, VOZ_DEFECTO, VOCES_FEMENINAS, MODELO_VOZ, MAX_CARACTERES };
