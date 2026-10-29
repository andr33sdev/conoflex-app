import { useEffect, useRef, useState } from "react";
import { Copy, Check, RotateCcw, ArrowUp } from "lucide-react";
import AIAvatar from "./AIAvatar";
import GraficoConnie from "./GraficoConnie";

const SUGERENCIAS = [
  "Liquidá las horas de la primera quincena de este mes",
  "¿Quién perdió el presentismo este mes?",
  "Graficame las ventas de los últimos 6 meses",
  "¿Qué demanda mensual tienen los semielaborados?",
];

const SALUDO = {
  rol: "assistant",
  texto:
    "¡Hola! Soy Connie, la asistente de Conoflex. ¿En qué te puedo ayudar hoy?",
};

// La conversación se guarda en la sesión del navegador: así no se pierde al
// cambiar de módulo y volver.
const CLAVE_CHAT = "connie_chat_v1";
const leerChat = () => {
  try {
    const guardado = JSON.parse(sessionStorage.getItem(CLAVE_CHAT) || "null");
    if (Array.isArray(guardado) && guardado.length) return guardado;
  } catch {
    /* sin almacenamiento disponible */
  }
  return [SALUDO];
};

/** **negrita** sin interpretar HTML. */
function Texto({ texto }) {
  const partes = String(texto ?? "").split(/(\*\*[^*]+\*\*)/g);
  return partes.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
      <strong key={i} className="font-bold text-white">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export default function Connie() {
  const [mensajes, setMensajes] = useState(leerChat);
  const [inputChat, setInputChat] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(null);
  const finRef = useRef(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(CLAVE_CHAT, JSON.stringify(mensajes));
    } catch {
      /* sin almacenamiento disponible */
    }
  }, [mensajes]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, enviando]);

  const enviar = async (forzado) => {
    const texto = typeof forzado === "string" ? forzado : inputChat;
    if (!texto.trim() || enviando) return;

    const nuevos = [...mensajes, { rol: "user", texto }];
    setMensajes(nuevos);
    setInputChat("");
    setEnviando(true);

    try {
      const res = await fetch("/api/chat-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensaje: texto,
          historial: nuevos.map(({ rol, texto: t }) => ({ rol, texto: t })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMensajes([
          ...nuevos,
          {
            rol: "assistant",
            texto: data.respuesta,
            consultas: data.consultas || [],
            graficos: data.graficos || [],
          },
        ]);
      } else {
        setMensajes([
          ...nuevos,
          {
            rol: "assistant",
            texto:
              "Error: " + (data.error || "No se pudo procesar la solicitud."),
          },
        ]);
      }
    } catch {
      setMensajes([
        ...nuevos,
        {
          rol: "assistant",
          texto: "Error de conexión con el servidor de la IA.",
        },
      ]);
    } finally {
      setEnviando(false);
    }
  };

  const nuevaConversacion = () => {
    if (enviando) return;
    setMensajes([SALUDO]);
  };

  const copiar = async (texto, i) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(i);
      setTimeout(() => setCopiado(null), 1500);
    } catch {
      /* el navegador no permite copiar */
    }
  };

  const vacio = mensajes.length <= 1;

  return (
    <div className="h-full flex flex-col min-h-0 bg-[#0a0a0c] text-zinc-200 overflow-hidden">
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3 shrink-0 border-b border-white/[0.06] bg-[#0e0e11]">
        <AIAvatar estado={enviando ? "thinking" : "idle"} />
        <button
          onClick={nuevaConversacion}
          disabled={enviando || vacio}
          className="flex items-center gap-2 h-9 px-3 text-[13px] font-medium rounded-xl border border-white/10 text-zinc-400 hover:text-white hover:border-white/25 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <RotateCcw size={14} />
          <span className="hidden sm:inline">Nueva conversación</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
        <div className="w-full max-w-[820px] mx-auto px-4 sm:px-6 py-6 space-y-5">
          {mensajes.map((m, i) => {
            const esUsuario = m.rol === "user";
            return (
              <div
                key={i}
                className={`flex w-full cf-msg ${esUsuario ? "justify-end" : "justify-start"}`}
              >
                {esUsuario ? (
                  <div className="max-w-[88%] sm:max-w-[75%] bg-[#FF5A00] text-black font-medium text-[15px] leading-relaxed px-4 py-2.5 rounded-2xl rounded-br-md break-words whitespace-pre-wrap">
                    {m.texto}
                  </div>
                ) : (
                  <div className="min-w-0 max-w-full group relative text-zinc-100 text-[15px] leading-relaxed bg-[#131317] border border-white/[0.07] px-4 sm:px-5 py-3.5 rounded-2xl rounded-bl-md whitespace-pre-wrap break-words">
                    <Texto texto={m.texto} />
                    {m.graficos?.map((g, k) => (
                      <GraficoConnie key={k} grafico={g} />
                    ))}
                    {m.consultas?.length > 0 && (
                      <details className="mt-3 pt-3 border-t border-white/[0.08] text-xs text-zinc-400 whitespace-normal">
                        <summary className="cursor-pointer select-none hover:text-zinc-200 font-medium">
                          Ver cómo lo calculé ({m.consultas.length}{" "}
                          {m.consultas.length === 1 ? "consulta" : "consultas"})
                        </summary>
                        {m.consultas.map((c, j) => (
                          <div key={j} className="mt-2">
                            {c.proposito && (
                              <div className="font-medium text-zinc-300">
                                {c.proposito}
                              </div>
                            )}
                            <pre className="mt-1 p-2.5 bg-black/60 border border-white/[0.08] rounded-lg overflow-x-auto text-[11px] text-zinc-300 whitespace-pre-wrap font-mono">
                              {c.sql}
                            </pre>
                            {c.error && (
                              <div className="mt-1 text-amber-500">
                                No pudo ejecutarse: {c.error}
                              </div>
                            )}
                          </div>
                        ))}
                      </details>
                    )}
                    {i > 0 && (
                      <button
                        onClick={() => copiar(m.texto, i)}
                        aria-label="Copiar respuesta"
                        className="absolute -bottom-3 right-3 p-1.5 rounded-lg bg-[#17171c] border border-white/10 text-zinc-500 hover:text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      >
                        {copiado === i ? (
                          <Check size={12} className="text-emerald-400" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {vacio && !enviando && (
            <div className="pt-2">
              <p className="text-sm text-zinc-500 mb-3">
                Probá con alguna de estas:
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGERENCIAS.map((s) => (
                  <button
                    key={s}
                    onClick={() => enviar(s)}
                    className="text-left text-[13.5px] px-3.5 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-zinc-300 hover:border-[#FF5A00]/60 hover:text-white hover:bg-[#FF5A00]/[0.07]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {enviando && (
            <div className="flex cf-msg">
              <div
                className="bg-[#131317] border border-white/[0.07] px-4 py-3.5 rounded-2xl rounded-bl-md flex items-center gap-1.5"
                aria-label="Connie está escribiendo"
              >
                {[0, 1, 2].map((n) => (
                  <span
                    key={n}
                    className="w-2 h-2 rounded-full bg-[#FF5A00] cf-punto"
                    style={{ animationDelay: `${n * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={finRef} />
        </div>
      </div>

      <div className="shrink-0 px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#0a0a0c] border-t border-white/[0.06]">
        <div className="w-full max-w-[820px] mx-auto flex items-center gap-2 bg-[#131317] border border-white/10 focus-within:border-[#FF5A00] rounded-2xl pl-4 pr-2 h-14 transition-colors">
          <input
            type="text"
            value={inputChat}
            onChange={(e) => setInputChat(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enviar()}
            placeholder="Preguntale a Connie…"
            className="flex-1 min-w-0 bg-transparent text-[15px] text-white placeholder-zinc-500 outline-none"
          />
          <button
            onClick={() => enviar()}
            disabled={enviando || !inputChat.trim()}
            aria-label="Enviar"
            className="w-10 h-10 grid place-items-center rounded-xl bg-[#FF5A00] hover:bg-[#ff6d1f] text-black disabled:bg-white/10 disabled:text-zinc-600 disabled:cursor-not-allowed shrink-0"
          >
            <ArrowUp size={19} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
