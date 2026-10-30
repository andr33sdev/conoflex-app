import { useEffect, useRef } from "react";
import { ArrowUp, Mic, Square } from "lucide-react";

/** **negrita** sin interpretar HTML. */
function Texto({ texto }) {
  const partes = String(texto ?? "").split(/(\*\*[^*]+\*\*)/g);
  return partes.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
      <strong key={i} className="font-bold text-white">{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

const SUGERENCIAS = [
  "Liquidá la primera quincena de este mes",
  "¿Quién perdió el presentismo este mes?",
  "¿Cuándo es el próximo feriado?",
  "¿Qué avisos tengo abiertos?",
];

export default function ChatLia({ mensajes, enviando, texto, onTexto, onEnviar, dictando, onDictado, puedeDictar, estadoDictado }) {
  const fin = useRef(null);
  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes, enviando]);
  const vacio = mensajes.length <= 1;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 sm:px-4 py-4 space-y-3.5">
        {mensajes.map((m, i) =>
          m.rol === "user" ? (
            <div key={i} className="flex justify-end cf-msg">
              <div className="max-w-[88%] bg-[#FF5A00] text-black font-medium text-[15px] leading-relaxed px-4 py-2.5 rounded-2xl rounded-br-md break-words whitespace-pre-wrap">{m.texto}</div>
            </div>
          ) : (
            <div key={i} className="flex gap-2.5 cf-msg">
              <div className="w-8 h-8 shrink-0 rounded-xl bg-[#FF5A00] grid place-items-center text-black font-black text-sm shadow-[0_3px_0_#b33f00]">L</div>
              <div className="min-w-0 max-w-[calc(100%-2.5rem)] text-zinc-100 text-[15px] leading-relaxed bg-[#131317] border border-white/[0.07] px-4 py-3 rounded-2xl rounded-tl-md whitespace-pre-wrap break-words">
                <Texto texto={m.texto} />
                {m.herramientas?.length > 0 && (
                  <div className="mt-2.5 pt-2.5 border-t border-white/[0.08] flex flex-wrap gap-1.5 whitespace-normal">
                    {m.herramientas.map((h, k) => (
                      <span key={k} className="text-[11px] font-bold text-zinc-400 bg-white/[0.05] border border-white/[0.07] rounded-full px-2.5 py-0.5">
                        {h.texto}{h.operario ? ` · ${h.operario}` : ""}{h.periodo ? ` · ${h.periodo}` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        )}
        {vacio && !enviando && (
          <div className="pt-1">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Probá con</p>
            <div className="flex flex-wrap gap-2">
              {SUGERENCIAS.map((s) => (
                <button key={s} onClick={() => onEnviar(s)} className="text-left text-[13.5px] min-h-[40px] px-3.5 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-zinc-300 hover:border-[#FF5A00]/60 hover:text-white hover:bg-[#FF5A00]/[0.07]">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {enviando && (
          <div className="flex gap-2.5 cf-msg">
            <div className="w-8 h-8 shrink-0 rounded-xl bg-[#FF5A00] grid place-items-center text-black font-black text-sm">L</div>
            <div className="bg-[#131317] border border-white/[0.07] px-4 py-3.5 rounded-2xl rounded-tl-md flex items-center gap-1.5" aria-label="Lía está pensando">
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
        <div className={`flex items-center gap-1.5 bg-[#131317] border rounded-2xl pl-4 pr-1.5 h-14 transition-colors ${dictando ? "border-rose-400" : "border-white/10 focus-within:border-[#FF5A00]"}`}>
          <input
            type="text"
            value={texto}
            onChange={(e) => onTexto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onEnviar()}
            placeholder={dictando ? "Te escucho…" : "Escribile o hablale a Lía…"}
            enterKeyHint="send"
            className="flex-1 min-w-0 bg-transparent text-base text-white placeholder-zinc-500 outline-none"
          />
          {puedeDictar && (
            <button
              onClick={onDictado}
              aria-label={dictando ? "Dejar de dictar" : "Hablarle a Lía"}
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
