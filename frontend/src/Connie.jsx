import { useEffect, useRef, useState } from "react";
import { Bot, Copy, Check, RotateCcw, Send } from "lucide-react";
import AIAvatar from "./AIAvatar";
import GraficoConnie from "./GraficoConnie";

const SALUDO = {
  rol: "assistant",
  texto: "¡Hola! Soy Connie, la asistente de Conoflex. ¿En qué te puedo ayudar hoy?",
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

  const enviar = async () => {
    const texto = inputChat;
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
          { rol: "assistant", texto: "Error: " + (data.error || "No se pudo procesar la solicitud.") },
        ]);
      }
    } catch {
      setMensajes([...nuevos, { rol: "assistant", texto: "Error de conexión con el servidor de la IA." }]);
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

  return (
    <div className="h-full flex flex-col min-h-0 bg-black font-sans text-zinc-200 overflow-hidden selection:bg-[#FF5A00]/30">
      {/* BARRA SUPERIOR DEL MÓDULO */}
      <div className="border-b border-zinc-800/50 px-4 py-2.5 flex items-center justify-between shrink-0 bg-black">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-[#FF5A00] shadow-[0_0_8px_#FF5A00] shrink-0" />
          <span className="text-xs font-black uppercase tracking-wider text-white">CONNIE IA</span>
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest hidden sm:inline truncate">
            • ASISTENTE OPERATIVO &amp; COMERCIAL
          </span>
        </div>
        <button
          onClick={nuevaConversacion}
          disabled={enviando || mensajes.length <= 1}
          className="flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-widest border border-zinc-800 bg-[#050505] text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          <RotateCcw size={13} />
          <span className="hidden sm:inline">Nueva conversación</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 p-2 sm:p-4 flex flex-col overflow-hidden">
        <div className="h-full flex-1 flex flex-col min-h-0 bg-[#030303] border border-zinc-800 shadow-[0_0_60px_rgba(0,0,0,0.95)] relative overflow-hidden w-full max-w-[1100px] mx-auto">
          <div className="border-b border-zinc-800 bg-[#050505] flex flex-col sm:flex-row items-stretch sm:items-center justify-between shrink-0">
            <AIAvatar estado={enviando ? "thinking" : "idle"} />
          </div>

          <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 min-h-0 bg-black custom-scrollbar">
            {mensajes.map((m, i) => {
              const esUsuario = m.rol === "user";
              return (
                <div
                  key={i}
                  className={`flex items-start gap-2 sm:gap-3 w-full animate-in fade-in duration-200 ${
                    esUsuario ? "justify-end" : "justify-start"
                  }`}
                >
                  {!esUsuario && (
                    <div className="hidden sm:flex w-9 h-9 rounded-xl border border-zinc-800 bg-[#0A0A0A] items-center justify-center text-[#FF5A00] shrink-0 mt-0.5 shadow-sm">
                      <Bot size={18} />
                    </div>
                  )}

                  {esUsuario ? (
                    <div className="max-w-[88%] sm:max-w-[70%] bg-[#FF5A00] text-black font-semibold text-sm leading-relaxed px-4 sm:px-5 py-3 sm:py-3.5 rounded-2xl rounded-tr-sm shadow-lg shadow-[#FF5A00]/10 break-words whitespace-pre-wrap">
                      {m.texto}
                    </div>
                  ) : (
                    <div className="min-w-0 max-w-full sm:max-w-[78%] group relative bg-[#0A0A0A] border border-zinc-800 text-zinc-100 font-medium text-sm leading-relaxed px-4 sm:px-5 py-3.5 sm:py-4 rounded-2xl rounded-tl-sm shadow-md whitespace-pre-wrap break-words">
                      <Texto texto={m.texto} />
                      {m.graficos?.map((g, k) => (
                        <GraficoConnie key={k} grafico={g} />
                      ))}
                      {m.consultas?.length > 0 && (
                        <details className="mt-3 pt-3 border-t border-zinc-800 text-xs text-zinc-400 whitespace-normal">
                          <summary className="cursor-pointer select-none hover:text-zinc-200 font-semibold">
                            Ver cómo lo calculé ({m.consultas.length}{" "}
                            {m.consultas.length === 1 ? "consulta" : "consultas"})
                          </summary>
                          {m.consultas.map((c, j) => (
                            <div key={j} className="mt-2">
                              {c.proposito && <div className="font-semibold text-zinc-300">{c.proposito}</div>}
                              <pre className="mt-1 p-2 bg-black border border-zinc-800 rounded-lg overflow-x-auto text-[11px] text-zinc-300 whitespace-pre-wrap font-mono">
                                {c.sql}
                              </pre>
                              {c.error && <div className="mt-1 text-amber-500">No pudo ejecutarse: {c.error}</div>}
                            </div>
                          ))}
                        </details>
                      )}
                      {i > 0 && (
                        <button
                          onClick={() => copiar(m.texto, i)}
                          aria-label="Copiar respuesta"
                          className="absolute -bottom-3 right-3 p-1.5 rounded-lg bg-[#050505] border border-zinc-800 text-zinc-500 hover:text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                        >
                          {copiado === i ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {enviando && (
              <div className="flex items-center gap-3 justify-start animate-in fade-in duration-200">
                <div className="w-9 h-9 rounded-xl border border-zinc-800 bg-[#0A0A0A] flex items-center justify-center text-[#FF5A00] shrink-0">
                  <Bot size={18} className="animate-spin" />
                </div>
                <div className="bg-[#0A0A0A] border border-zinc-800 px-5 py-3.5 rounded-2xl rounded-tl-sm text-xs font-semibold text-zinc-400 flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-[#FF5A00] animate-ping" />
                  <span className="tracking-wide">Connie está analizando la base de datos...</span>
                </div>
              </div>
            )}

            <div ref={finRef} />
          </div>

          <div className="p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#050505] border-t border-zinc-800 flex items-center gap-2 sm:gap-3">
            <input
              type="text"
              value={inputChat}
              onChange={(e) => setInputChat(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enviar()}
              placeholder="Preguntale a Connie..."
              className="flex-1 min-w-0 bg-black border border-zinc-800 hover:border-zinc-700 focus:border-[#FF5A00] rounded-xl px-4 sm:px-5 py-3.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors font-sans"
            />
            <button
              onClick={enviar}
              disabled={enviando || !inputChat.trim()}
              aria-label="Enviar"
              className="bg-[#FF5A00] hover:bg-white text-black font-bold px-4 sm:px-6 py-3.5 rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-xs uppercase tracking-widest shrink-0 shadow-lg shadow-[#FF5A00]/20 active:scale-95"
            >
              <span className="hidden sm:inline">ENVIAR</span>
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
