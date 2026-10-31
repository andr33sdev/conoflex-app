import { useEffect, useRef } from "react";
import { ArrowUp, AudioLines, FileDown, Mic, Square, ArrowRight } from "lucide-react";
import Markdown from "./Markdown";

export default function ChatLia({ mensajes, enviando, texto, onTexto, onEnviar, dictando, onDictado, puedeDictar, estadoDictado, saludo, resumen, propuestas, onPropuesta, manos, onManos, onPdf, hablando, perfil, onDerivar, ideas = [] }) {
  const fin = useRef(null);
  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes, enviando]);
  
  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 sm:px-4 py-4 space-y-3.5">
        <div className="flex gap-2.5 cf-msg">
          <div className="w-8 h-8 shrink-0 rounded-xl bg-[#FF5A00] grid place-items-center text-black font-black text-sm" style={{ background: perfil.color, boxShadow: `0 3px 0 color-mix(in srgb, ${perfil.color} 55%, black)` }}>{perfil.inicial}</div>
          <div className="min-w-0 max-w-[calc(100%-2.5rem)] text-zinc-100 text-[15px] leading-relaxed bg-[#131317] border border-white/[0.07] px-4 py-3 rounded-2xl rounded-tl-md">
            <p className="font-bold text-white">{saludo}. {perfil.presentacion}</p>
            <p className="mt-1 text-zinc-300">{resumen}</p>
          </div>
        </div>
        {propuestas.length > 0 && (
          <div className="pl-[42px] space-y-2 cf-msg">
            {propuestas.map((p) => (
              <button
                key={p.id}
                onClick={() => onPropuesta(p)}
                className="group w-full text-left rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#16161c] to-[#111116] hover:border-[#FF5A00]/60 transition-colors px-3.5 py-3 flex items-center gap-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-white leading-snug break-words">{p.titulo}</span>
                </span>
                <span className="shrink-0 text-[12px] font-extrabold text-black bg-[#FFD60A] group-hover:bg-white transition-colors rounded-lg px-2.5 py-1.5">{p.boton}</span>
              </button>
            ))}
          </div>
        )}
        {ideas.length > 0 && mensajes.length === 0 && (
          <div className="pl-[42px] cf-msg">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-zinc-500 mb-1.5">También podés pedirme</p>
            <div className="flex flex-wrap gap-2">
              {ideas.map((x) => (
                <button key={x} onClick={() => onEnviar(x)} className="min-h-[38px] px-3 rounded-full border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.1] hover:border-white/25 text-[13px] font-semibold text-zinc-200 transition-colors text-left">{x}</button>
              ))}
            </div>
          </div>
        )}
        {mensajes.map((m, i) =>
          m.rol === "user" ? (
            <div key={i} className="flex justify-end cf-msg">
              <div className="max-w-[88%] bg-[#FF5A00] text-black font-medium text-[15px] leading-relaxed px-4 py-2.5 rounded-2xl rounded-br-md break-words whitespace-pre-wrap">{m.texto}</div>
            </div>
          ) : (
            <div key={i} className="flex gap-2.5 cf-msg">
              <div className="w-8 h-8 shrink-0 rounded-xl bg-[#FF5A00] grid place-items-center text-black font-black text-sm" style={{ background: perfil.color, boxShadow: `0 3px 0 color-mix(in srgb, ${perfil.color} 55%, black)` }}>{perfil.inicial}</div>
              <div className="min-w-0 max-w-[calc(100%-2.5rem)] text-zinc-100 text-[15px] leading-relaxed bg-[#131317] border border-white/[0.07] px-4 py-3 rounded-2xl rounded-tl-md break-words">
                <Markdown texto={m.texto} />
                {m.herramientas?.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-white/[0.08] flex flex-wrap items-center gap-1.5 whitespace-normal">
                    {m.herramientas.filter((h) => h.nombre !== "derivar_a_agente").map((h, k) => (
                      <span key={k} className="text-[11px] font-bold text-zinc-400 bg-white/[0.05] border border-white/[0.07] rounded-full px-2.5 py-0.5">
                        {h.texto}{h.operario ? ` · ${h.operario}` : ""}{h.periodo ? ` · ${h.periodo}` : ""}
                      </span>
                    ))}
                    {m.herramientas.filter((h) => h.nombre === "liquidar_horas" && h.ok && h.args).slice(-1).map((h, k) => (
                      <button
                        key={`pdf${k}`}
                        onClick={() => onPdf?.(h.args)}
                        className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-extrabold text-black bg-[#FFD60A] hover:bg-white transition-colors rounded-lg px-3 min-h-[36px]"
                      >
                        <FileDown size={15} /> Descargar PDF
                      </button>
                    ))}
                  </div>
                )}
                {m.derivacion && (
                  <div className="mt-3 rounded-xl border border-white/[0.1] bg-gradient-to-br from-white/[0.06] to-transparent p-3">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-zinc-500">Esto lo sabe mejor {m.derivacion.nombre}</p>
                    <p className="mt-1 text-[13.5px] text-zinc-200 leading-snug">{m.derivacion.motivo || m.derivacion.pregunta}</p>
                    <button
                      onClick={() => onDerivar?.(m.derivacion)}
                      className="mt-2.5 inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-xl bg-[#FFD60A] hover:bg-white transition-colors text-black text-[13px] font-extrabold"
                    >
                      <ArrowRight size={15} /> Preguntarle a {m.derivacion.nombre} <span className="font-semibold opacity-70">· {m.derivacion.puesto}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ),
        )}
        {enviando && (
          <div className="flex gap-2.5 cf-msg">
            <div className="w-8 h-8 shrink-0 rounded-xl bg-[#FF5A00] grid place-items-center text-black font-black text-sm" style={{ background: perfil.color }}>{perfil.inicial}</div>
            <div className="bg-[#131317] border border-white/[0.07] px-4 py-3.5 rounded-2xl rounded-tl-md flex items-center gap-1.5" aria-label={`${perfil.nombre} está pensando`}>
              {[0, 1, 2].map((n) => (
                <span key={n} className="w-2 h-2 rounded-full bg-[#FF5A00] cf-punto" style={{ animationDelay: `${n * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={fin} />
      </div>

      <div className="shrink-0 px-3 sm:px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/[0.06] bg-[#0a0a0c]">
        {estadoDictado && <p className="text-xs text-amber-300/90 mb-1.5 px-1">{estadoDictado}</p>}
        {manos && (
          <div className="mb-2 flex items-center gap-3 rounded-xl border border-[#FF5A00]/40 bg-[#FF5A00]/[0.08] px-3 py-2" role="status">
            <span className="flex items-end gap-[3px] h-5 shrink-0" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((n) => (
                <span key={n} className={`w-[3px] rounded-full bg-[#FF5A00] ${hablando ? "cf-onda" : dictando ? "cf-onda" : ""}`} style={{ height: dictando || hablando ? undefined : 6, animationDelay: `${n * 0.12}s` }} />
              ))}
            </span>
            <span className="flex-1 min-w-0 text-[13px] leading-tight text-zinc-200">
              <b className="text-white">Manos libres</b> · {hablando ? `${perfil.nombre} te está hablando…` : enviando ? `${perfil.nombre} está pensando…` : dictando ? "te escucho…" : "preparando el micrófono…"}
              <span className="block text-[11.5px] text-zinc-400">Decí “chau” o tocá el botón para terminar.</span>
            </span>
            <button onClick={onManos} className="shrink-0 min-h-[36px] px-3 rounded-lg bg-white/10 hover:bg-white/15 text-[12.5px] font-bold text-white">Terminar</button>
          </div>
        )}
        <div className={`flex items-center gap-1.5 bg-[#131317] border rounded-2xl pl-4 pr-1.5 h-14 transition-colors ${dictando ? "border-rose-400" : "border-white/10 focus-within:border-[#FF5A00]"}`}>
          <input
            type="text"
            value={texto}
            onChange={(e) => onTexto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onEnviar()}
            placeholder={dictando ? "Te escucho…" : `Escribile o hablale a ${perfil.nombre}…`}
            enterKeyHint="send"
            className="flex-1 min-w-0 bg-transparent text-base text-white placeholder-zinc-500 outline-none"
          />
          {puedeDictar && (
            <button
              onClick={onManos}
              aria-label={manos ? "Terminar el manos libres" : `Conversar con ${perfil.nombre} sin tocar nada (manos libres)`}
              aria-pressed={manos}
              title="Manos libres"
              className={`w-11 h-11 grid place-items-center rounded-xl shrink-0 transition-colors ${manos ? "bg-[#FF5A00] text-black" : "bg-white/[0.07] text-zinc-300 hover:text-white hover:bg-white/[0.12]"}`}
            >
              <AudioLines size={19} />
            </button>
          )}
          {puedeDictar && (
            <button
              onClick={onDictado}
              aria-label={dictando ? "Dejar de dictar" : `Hablarle a ${perfil.nombre}`}
              aria-pressed={dictando}
              className={`w-11 h-11 grid place-items-center rounded-xl shrink-0 transition-colors ${dictando ? "bg-rose-500 text-white animate-pulse" : "bg-white/[0.07] text-zinc-300 hover:text-white hover:bg-white/[0.12]"}`}
            >
              {dictando ? <Square size={16} fill="currentColor" /> : <Mic size={19} />}
            </button>
          )}
          <button
            onClick={() => onEnviar()}
            disabled={enviando || !texto.trim()}
            aria-label="Enviar"
            className="w-11 h-11 grid place-items-center rounded-xl bg-[#FF5A00] hover:bg-[#ff6d1f] text-black disabled:bg-white/10 disabled:text-zinc-600 disabled:cursor-not-allowed shrink-0"
          >
            <ArrowUp size={19} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
