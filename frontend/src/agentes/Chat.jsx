import { useEffect, useRef } from "react";
import { ArrowRight, ArrowUp, AudioLines, FileDown, Mic, Square } from "lucide-react";
import Markdown from "./Markdown";
import { Avatar8 } from "./pixel";

/** Chat del agente: mensajes y una barra para escribir. Sin sugerencias ni tarjetas que ocupen lugar. */
export default function Chat({ perfil, estado, mensajes, enviando, texto, onTexto, onEnviar, dictando, onDictado, puedeDictar, aviso, saludo, resumen, abiertos, onVerAvisos, manos, onManos, hablando, onPdf, onReporte, onDerivar }) {
  const fin = useRef(null);
  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes, enviando]);

  const mini = <Avatar8 id={perfil.id} tam={32} burbuja={false} modo={estado.modo} ojos={estado.ojos} />;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {mensajes.length === 0 && !enviando ? (
          <div className="h-full grid place-items-center px-6 py-8">
            <div className="max-w-sm text-center cf-msg">
              <div className="flex justify-center"><Avatar8 id={perfil.id} tam={96} modo={estado.modo} ojos={estado.ojos} icono={estado.icono} /></div>
              <p className="mt-5 text-[19px] font-bold text-white">{saludo}</p>
              <p className="mt-1 text-[14.5px] text-zinc-400 leading-relaxed">{perfil.presentacion} {resumen}</p>
              {abiertos > 0 && (
                <button onClick={onVerAvisos} className="mt-3 text-[13px] font-semibold text-zinc-300 underline underline-offset-4 decoration-white/25 hover:text-white">
                  Ver {abiertos === 1 ? "el aviso" : `los ${abiertos} avisos`}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-3 sm:px-5 py-5 space-y-5">
            {mensajes.map((m, i) =>
              m.rol === "user" ? (
                <div key={i} className="flex justify-end cf-msg">
                  <div className="max-w-[88%] bg-[#26262d] text-zinc-100 text-[15px] leading-relaxed px-4 py-2.5 rounded-2xl rounded-br-md break-words whitespace-pre-wrap">{m.texto}</div>
                </div>
              ) : (
                <div key={i} className="flex gap-3 cf-msg">
                  <div className="shrink-0 pt-0.5">{mini}</div>
                  <div className="min-w-0 flex-1 text-zinc-200 text-[15px] leading-relaxed break-words">
                    {m.error ? <p className="text-zinc-400">{m.texto}</p> : <Markdown texto={m.texto} />}
                    {m.herramientas?.some((h) => h.nombre !== "derivar_a_agente") && (
                      <p className="mt-2 text-[11.5px] text-zinc-500 leading-snug">
                        {m.herramientas.filter((h) => h.nombre !== "derivar_a_agente").map((h) => `${h.texto}${h.operario ? ` · ${h.operario}` : ""}${h.periodo ? ` · ${h.periodo}` : ""}`).join("  ·  ")}
                      </p>
                    )}
                    {m.derivacion && (
                      <div className="mt-3 rounded-xl border border-white/[0.09] p-3">
                        <p className="text-[13px] text-zinc-300 leading-snug">Esto lo sabe mejor {m.derivacion.nombre}. {m.derivacion.motivo || ""}</p>
                        <button onClick={() => onDerivar?.(m.derivacion)} className="mt-2 inline-flex items-center gap-2 min-h-[38px] px-3 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] text-[13px] font-semibold text-white">
                          <ArrowRight size={15} /> Preguntarle a {m.derivacion.nombre}
                        </button>
                      </div>
                    )}
                    {!m.error && m.texto && (
                      <div className="mt-2 flex items-center gap-1 -ml-2">
                        {m.herramientas?.filter((h) => h.nombre === "liquidar_horas" && h.ok && h.args).slice(-1).map((h) => (
                          <button key="liq" onClick={() => onPdf?.(h.args)} className="inline-flex items-center gap-1.5 min-h-[32px] px-2 rounded-lg text-[12px] font-semibold text-zinc-400 hover:text-white hover:bg-white/[0.06]">
                            <FileDown size={14} /> Liquidación PDF
                          </button>
                        ))}
                        <button onClick={() => onReporte?.(m.texto)} className="inline-flex items-center gap-1.5 min-h-[32px] px-2 rounded-lg text-[12px] font-semibold text-zinc-500 hover:text-white hover:bg-white/[0.06]" title="Descargar esta respuesta como PDF">
                          <FileDown size={14} /> PDF
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
            {enviando && (
              <div className="flex gap-3 cf-msg">
                <div className="shrink-0 pt-0.5">{mini}</div>
                <div className="flex items-center gap-1.5 h-8" aria-label={`${perfil.nombre} está pensando`}>
                  {[0, 1, 2].map((n) => (
                    <span key={n} className="w-1.5 h-1.5 bg-zinc-400 cf-punto" style={{ animationDelay: `${n * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={fin} />
          </div>
        )}
      </div>

      <div className="shrink-0 px-3 sm:px-5 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#0c0c0f]">
        <div className="max-w-3xl mx-auto">
          {aviso && <p className="text-xs text-zinc-400 mb-1.5 px-1">{aviso}</p>}
          {manos && (
            <div className="mb-2 flex items-center gap-3 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2" role="status">
              <span className="flex items-end gap-[3px] h-5 shrink-0" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((n) => (
                  <span key={n} className={`w-[3px] bg-zinc-300 ${hablando || dictando ? "cf-onda" : ""}`} style={{ height: dictando || hablando ? undefined : 6, animationDelay: `${n * 0.12}s` }} />
                ))}
              </span>
              <span className="flex-1 min-w-0 text-[13px] leading-tight text-zinc-300">
                <b className="text-white">Manos libres</b> · {hablando ? `${perfil.nombre} te está hablando…` : enviando ? `${perfil.nombre} está pensando…` : dictando ? "te escucho…" : "preparando el micrófono…"}
                <span className="block text-[11.5px] text-zinc-500">Decí “chau” o tocá terminar.</span>
              </span>
              <button onClick={onManos} className="shrink-0 min-h-[34px] px-3 rounded-lg bg-white/10 hover:bg-white/15 text-[12.5px] font-semibold text-white">Terminar</button>
            </div>
          )}
          <div className={`flex items-center gap-1 bg-[#15151a] border rounded-2xl pl-4 pr-1.5 h-14 transition-colors ${dictando ? "border-white/40" : "border-white/[0.09] focus-within:border-white/30"}`}>
            <input
              type="text"
              value={texto}
              onChange={(e) => onTexto(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onEnviar()}
              placeholder={dictando ? "Te escucho…" : `Escribile a ${perfil.nombre}`}
              enterKeyHint="send"
              className="flex-1 min-w-0 bg-transparent text-base text-white placeholder-zinc-500 outline-none"
            />
            {puedeDictar && (
              <button onClick={onManos} aria-label={manos ? "Terminar el manos libres" : "Manos libres"} aria-pressed={manos} title="Manos libres" className={`w-10 h-10 grid place-items-center rounded-xl shrink-0 transition-colors ${manos ? "bg-white text-black" : "text-zinc-400 hover:text-white hover:bg-white/[0.08]"}`}>
                <AudioLines size={19} />
              </button>
            )}
            {puedeDictar && (
              <button onClick={onDictado} aria-label={dictando ? "Dejar de dictar" : `Hablarle a ${perfil.nombre}`} aria-pressed={dictando} title="Dictar" className={`w-10 h-10 grid place-items-center rounded-xl shrink-0 transition-colors ${dictando ? "bg-white text-black animate-pulse" : "text-zinc-400 hover:text-white hover:bg-white/[0.08]"}`}>
                {dictando ? <Square size={15} fill="currentColor" /> : <Mic size={19} />}
              </button>
            )}
            <button onClick={() => onEnviar()} disabled={enviando || !texto.trim()} aria-label="Enviar" className="w-10 h-10 grid place-items-center rounded-xl bg-[#FF5A00] hover:bg-[#ff6d1f] text-black disabled:bg-white/[0.07] disabled:text-zinc-600 disabled:cursor-not-allowed shrink-0">
              <ArrowUp size={19} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
