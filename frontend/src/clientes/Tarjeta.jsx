import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Banknote, Building2, Check, ChevronDown, Clock, Copy, Globe, Landmark, MapPin, Package, Route, Sparkle, Target } from "lucide-react";
import { PRIORIDAD, SEGMENTOS, dominio, reloj } from "./util";

const ICONO = { licitaciones: Landmark, obras: Route, empresas: Building2 };
const EASE = [0.22, 1, 0.36, 1];

/** Convierte en enlace lo que parezca una web o un mail. */
function Contacto({ texto }) {
  const t = String(texto || "").trim();
  if (!t || /^no figura/i.test(t)) return <span className="text-zinc-600">No figura</span>;
  const partes = t.split(/(https?:\/\/\S+|[\w.+-]+@[\w-]+\.[\w.-]+|www\.[\w-]+\.[\w./-]+)/g);
  return (
    <span className="break-words">
      {partes.map((p, i) => {
        if (/^(https?:\/\/|www\.)/.test(p)) return <a key={i} href={p.startsWith("http") ? p : `https://${p}`} target="_blank" rel="noreferrer noopener" className="text-[#ff8a4d] hover:underline">{p}</a>;
        if (/^[\w.+-]+@/.test(p)) return <a key={i} href={`mailto:${p}`} className="text-[#ff8a4d] hover:underline">{p}</a>;
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
}

function Bloque({ icono: Icono, titulo, children }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 min-w-0">
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500"><Icono size={13} /> {titulo}</span>
      <div className="mt-2 text-[15px] text-zinc-200 leading-relaxed">{children}</div>
    </div>
  );
}

export default function Tarjeta({ o, i, onCopiar }) {
  const [abierta, setAbierta] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const p = PRIORIDAD[o.prioridad] || PRIORIDAD[2];
  const Icono = ICONO[o.segmento] || Building2;
  const rel = reloj(o);
  const fuentes = o.fuentes || [];

  const copiar = async () => {
    const ok = await onCopiar(o.mensaje);
    if (ok) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2200);
    }
  };

  return (
    <motion.article layout="position" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: Math.min(i, 8) * 0.05 }} className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0d0d10] hover:border-white/[0.16] transition-colors">
      <span aria-hidden="true" className={`absolute left-0 top-0 bottom-0 w-1.5 ${p.barra}`} />
      <div className="p-5 sm:p-7 pl-6 sm:pl-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-extrabold ${p.chip}`}>{p.t}</span>
          {o.nueva && <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs font-extrabold text-emerald-300">Nueva</span>}
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500"><Icono size={14} /> {SEGMENTOS[o.segmento] || "Oportunidad"}</span>
          {rel && <span className={`sm:ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-extrabold ${rel.clase}`}><Clock size={13} /> {rel.t}</span>}
        </div>

        <h3 className="mt-4 text-xl sm:text-2xl font-extrabold text-white leading-snug tracking-tight">{o.titulo}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[15px] text-zinc-400">
          <b className="text-zinc-200 font-bold">{o.organizacion}</b>
          {o.provincia && <span className="inline-flex items-center gap-1.5"><MapPin size={14} className="text-zinc-500" /> {o.provincia}</span>}
          {o.monto && <span className="inline-flex items-center gap-1.5 text-emerald-300 font-bold"><Banknote size={15} /> {o.monto}</span>}
        </div>

        {(o.productos?.length > 0 || o.argumento) && (
          <div className="mt-5 rounded-2xl border border-[#FF5A00]/20 bg-[#FF5A00]/[0.05] p-4">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#ff8a4d]"><Package size={13} /> Qué ofrecerle</span>
            {o.productos?.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {o.productos.map((x) => <li key={x} className="rounded-xl bg-black/40 border border-white/[0.1] px-3 py-1.5 text-sm font-bold text-white">{x}</li>)}
              </ul>
            )}
            {o.argumento && <p className="mt-3 text-sm text-zinc-300 leading-relaxed">{o.argumento}</p>}
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-white/[0.06] flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0 mr-auto">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">Visto en</span>
            {fuentes.length === 0 && <span className="text-sm text-zinc-600">sin fuente</span>}
            {fuentes.slice(0, 3).map((f) => (
              <a key={f.url} href={f.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 max-w-[200px] rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1 text-xs font-bold text-zinc-300 hover:text-white hover:border-white/[0.25] transition-colors">
                <Globe size={12} className="shrink-0 text-zinc-500" /> <span className="truncate">{f.titulo && !/^https?:/.test(f.titulo) ? f.titulo : dominio(f.url)}</span>
              </a>
            ))}
            {fuentes.length > 3 && <span className="text-xs font-bold text-zinc-500">+{fuentes.length - 3}</span>}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {o.url && (
              <a href={o.url} target="_blank" rel="noreferrer noopener" className="flex-1 sm:flex-none min-h-[44px] px-4 rounded-xl bg-[#FFD60A] text-black text-sm font-extrabold inline-flex items-center justify-center gap-1.5 hover:bg-white transition-colors">
                Abrir fuente <ArrowUpRight size={16} />
              </a>
            )}
            <button onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} className="flex-1 sm:flex-none min-h-[44px] px-4 rounded-xl border border-white/[0.12] bg-white/[0.04] text-sm font-bold text-zinc-200 hover:bg-white/[0.09] inline-flex items-center justify-center gap-1.5 cursor-pointer">
              {abierta ? "Ver menos" : "Ver detalle"} <ChevronDown size={16} className={`transition-transform ${abierta ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {abierta && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden">
              <div className="pt-5 grid gap-3 md:grid-cols-2">
                <Bloque icono={Sparkle} titulo="Qué pasó">{o.que_paso}</Bloque>
                <Bloque icono={Target} titulo="Próximo paso">{o.siguiente_paso || <span className="text-zinc-600">Sin sugerencia</span>}</Bloque>
                <Bloque icono={ArrowUpRight} titulo="Contacto"><Contacto texto={o.contacto} /></Bloque>
                <Bloque icono={Globe} titulo={`Fuentes (${fuentes.length})`}>
                  {fuentes.length === 0 ? <span className="text-zinc-600">No se pudo identificar una fuente.</span> : (
                    <ul className="flex flex-col gap-1.5">
                      {fuentes.map((f) => <li key={f.url}><a href={f.url} target="_blank" rel="noreferrer noopener" className="text-sm text-[#ff8a4d] hover:underline break-all">{f.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 70)}</a></li>)}
                    </ul>
                  )}
                  {o.fuentes_aproximadas && <p className="mt-2 text-xs text-zinc-500">Son las fuentes generales de la búsqueda: no se pudo asociar una página exacta a esta oportunidad.</p>}
                </Bloque>
              </div>
              {o.mensaje && (
                <div className="mt-3 rounded-2xl border border-white/[0.08] bg-black/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">Mensaje sugerido</span>
                    <button onClick={copiar} className="min-h-[40px] px-3.5 rounded-xl border border-white/[0.12] bg-white/[0.05] text-sm font-bold text-zinc-100 hover:bg-white/[0.1] inline-flex items-center gap-2 cursor-pointer">
                      {copiado ? <Check size={15} className="text-emerald-300" /> : <Copy size={15} />} {copiado ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                  <p className="mt-3 text-[15px] text-zinc-300 leading-relaxed whitespace-pre-line">{o.mensaje}</p>
                </div>
              )}
              {o.confianza === "baja" && <p className="mt-3 text-xs text-[#ff8a4d]">Dato poco verificable: confirmalo antes de actuar.</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}
