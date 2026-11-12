const test = require("node:test");
const assert = require("node:assert/strict");
const { prepararIA, modeloPara } = require("../ia");

const silencio = { warn() {}, error() {} };
function falsa(responder) {
  const llamadas = [];
  const ai = { models: { generateContent: async (p) => (llamadas.push(p), responder(p, llamadas.length)) } };
  return { ai: prepararIA(ai, { log: silencio }), llamadas };
}

test("los pedidos a gemini-2.5-flash van al modelo configurado", async () => {
  delete process.env.GEMINI_MODELO;
  assert.equal(modeloPara("gemini-2.5-flash"), "gemini-3.5-flash");
  assert.equal(modeloPara("gemini-2.5-flash-lite"), "gemini-3.5-flash");
  assert.equal(modeloPara("gemini-2.5-flash-preview-tts"), "gemini-2.5-flash-preview-tts"); // la voz no se toca
  assert.equal(modeloPara("gemini-3.6-flash"), "gemini-3.6-flash");
  process.env.GEMINI_MODELO = "gemini-3.6-flash";
  assert.equal(modeloPara("gemini-2.5-flash"), "gemini-3.6-flash");
  delete process.env.GEMINI_MODELO;
  const { ai, llamadas } = falsa(() => ({ text: "ok" }));
  assert.equal((await ai.models.generateContent({ model: "gemini-2.5-flash", contents: "hola" })).text, "ok");
  assert.equal(llamadas[0].model, "gemini-3.5-flash");
});

test("si Google retiró el modelo, usa el de respaldo", async () => {
  const { ai, llamadas } = falsa((p) => {
    if (p.model === "gemini-3.5-flash") throw Object.assign(new Error("models/gemini-3.5-flash is not found for API version v1beta"), { status: 404 });
    return { text: "respaldo" };
  });
  assert.equal((await ai.models.generateContent({ model: "gemini-2.5-flash" })).text, "respaldo");
  assert.deepEqual(llamadas.map((l) => l.model), ["gemini-3.5-flash", "gemini-3.1-flash-lite"]);
});

test("voz: si el modelo de voz no está, usa el nuevo", async () => {
  const { ai, llamadas } = falsa((p) => {
    if (p.model === "gemini-2.5-flash-preview-tts") throw new Error("404 NOT_FOUND no longer available");
    return { ok: true };
  });
  await ai.models.generateContent({ model: "gemini-2.5-flash-preview-tts" });
  assert.deepEqual(llamadas.map((l) => l.model), ["gemini-2.5-flash-preview-tts", "gemini-3.1-flash-tts-preview"]);
});

test("reintenta sin thinkingConfig si el modelo no lo acepta, y una vez si está saturado", async () => {
  const a = falsa((p) => {
    if (p.config?.thinkingConfig) throw new Error("400 INVALID_ARGUMENT: thinking budget is not supported");
    return { text: "ok" };
  });
  await a.ai.models.generateContent({ model: "gemini-2.5-flash", config: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } } });
  assert.deepEqual(a.llamadas[1].config, { temperature: 0 });
  const b = falsa((p, n) => {
    if (n === 1) throw new Error("503 UNAVAILABLE: model overloaded");
    return { text: "ok" };
  });
  assert.equal((await b.ai.models.generateContent({ model: "gemini-3.5-flash" })).text, "ok");
  assert.equal(b.llamadas.length, 2);
});

test("otros errores se devuelven tal cual (por ejemplo, clave inválida)", async () => {
  const { ai, llamadas } = falsa(() => {
    throw new Error("400 API key not valid");
  });
  await assert.rejects(ai.models.generateContent({ model: "gemini-2.5-flash" }), /API key not valid/);
  assert.equal(llamadas.length, 1);
});
