import { useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { api } from "../produccion/util";
import { Avatar8 } from "./pixel";
import Markdown from "./Markdown";

const EJEMPLOS = ["¿Cómo viene la semana?", "¿Qué se me puede complicar esta semana?", "¿Qué conviene hacer primero hoy?"];

/** Una sola pregunta para todo el equipo: se la reparten según el tema y cada uno contesta con lo suyo. */
export default function PreguntaOficina({ agentes, onElegir }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [res, setRes] = useState(null);
  const [error, setError] = useState("");
  const [pregunta, setPregunta] = useState("");

  const preguntar = async (q) => {
    const m = (q ?? texto).trim();
    if (!m || enviando) return;
    setEnviando(true);
    setError("");
    setRes(null);
    setPregunta(m);
    setTexto("");
    try {
      setRes(await api("/api/agentes/oficina/preguntar", { method: "POST", body: { mensaje: m } }));
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#111114] p-4" aria-label="Preguntale a la oficina">
      <h2 className="text-[15px] font-bold text-white">Preguntale a la oficina</h2>
      <p className="text-[12.5px] text-zinc-500 mt-0.5">Una sola pregunta: se la reparten entre {agentes.length === 1 ? "el equipo" : agentes.map((a) => a.nombre).join(", ")} y cada uno contesta lo suyo.</p>
      <form onSubmit={(e) => { e.preventDefault(); preguntar(); }} className="mt-3 flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.03] pl-3.5 pr-1.5 focus-within:border-white/30">
        <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1500} placeholder="Preguntá lo que quieras…" aria-label="Pregunta para toda la oficina" className="flex-1 min-w-0 h-11 bg-transparent text-[15px] text-white placeholder:text-zinc-600 outline-none" />
        <button type="submit" disabled={!texto.trim() || enviando} aria-label="Preguntar" className="h-8 w-8 grid place-items-center rounded-lg bg-white text-black disabled:bg-white/[0.08] disabled:text-zinc-600">
          {enviando ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />}
        </button>
      </form>
      {!res && !enviando && !error && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {EJEMPLOS.map((e) => <button key={e} onClick={() => preguntar(e)} className="min-h-[32px] px-3 rounded-full border border-white/[0.09] text-[12.5px] text-zinc-400 hover:text-white hover:border-white/25">{e}</button>)}
        </div>
      )}
      {enviando && <p className="mt-3 text-[13px] text-zinc-400" role="status">Eligiendo a quién le toca y consultando…</p>}
      {error && <p className="mt-3 text-[13px] text-zinc-300">{error}</p>}
      {res && (
        <div className="mt-3 space-y-2.5">
          <p className="text-[12.5px] text-zinc-500">Tu pregunta: “{pregunta}”</p>
          {res.nadie || !res.respuestas.length ? (
            <p className="rounded-xl border border-white/[0.07] px-4 py-3 text-[14px] text-zinc-300">Eso no es de ninguna de nuestras áreas. Para otras consultas de la empresa podés usar Connie.</p>
          ) : (
            res.respuestas.map((r) => (
              <article key={r.agente} className="rounded-xl border border-white/[0.09] p-3.5 flex gap-3">
                <Avatar8 id={r.agente} tam={48} burbuja={false} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-bold text-white leading-tight">{r.nombre} <span className="font-medium text-zinc-500">· {r.puesto}</span></p>
                  {r.error ? <p className="mt-1 text-[14px] text-zinc-400">{r.error}</p> : <div className="mt-1.5 text-[14.5px] leading-relaxed text-zinc-200"><Markdown texto={r.respuesta} /></div>}
                  <button onClick={() => onElegir(r.agente)} className="mt-2 text-[12.5px] font-semibold text-zinc-400 hover:text-white">Seguir hablando con {r.nombre} →</button>
                </div>
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
}
