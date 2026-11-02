import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock, Loader2, Search, Send, X } from "lucide-react";
import { Drawer, Etiqueta } from "../produccion/ui";
import { campo } from "../produccion/estilos";
import { EscalaUrgencia } from "./Urgencia";
import { abrev, nf, norm } from "./util";

const EASE = [0.22, 1, 0.36, 1];

/** Aviso de lo que ya está pedido de esa materia prima (no impide sugerir). */
export function AvisoEnCurso({ materia }) {
  const pedidos = materia?.en_curso || [];
  if (!pedidos.length && !materia?.sugerencias_pendientes) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.08] px-4 py-3 text-sm text-sky-100">
      {pedidos.length > 0 && (
        <p className="flex items-start gap-2"><Clock size={16} className="mt-0.5 shrink-0 text-sky-300" /><span><b>Ya se solicitó y está esperando recepción:</b> {pedidos.map((p) => `${nf(p.pedida, 3)} a ${p.proveedor || "proveedor sin definir"}${p.recibida ? ` (llegaron ${nf(p.recibida, 3)})` : ""}`).join(" · ")}</span></p>
      )}
      {materia.sugerencias_pendientes > 0 && <p className={`${pedidos.length ? "mt-1.5 " : ""}text-sky-200/90`}>Ya hay {materia.sugerencias_pendientes === 1 ? "otra sugerencia pendiente" : `${materia.sugerencias_pendientes} sugerencias pendientes`} de esta materia prima.</p>}
    </motion.div>
  );
}

// El padre lo monta de nuevo cada vez que se abre (cambia la key): arranca siempre vacío.
export default function FormularioSugerencia({ abierto, materias, cargando, onCerrar, onEnviar }) {
  const [q, setQ] = useState("");
  const [id, setId] = useState(null);
  const [cantidad, setCantidad] = useState("");
  const [urgencia, setUrgencia] = useState(3);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(false);
  const cant = useRef(null);

  const elegida = materias.find((m) => m.id === id) || null;
  const lista = useMemo(() => {
    const t = norm(q);
    return materias.filter((m) => !t || norm(`${m.codigo} ${m.nombre}`).includes(t)).slice(0, 40);
  }, [materias, q]);

  const n = Number(String(cantidad).replace(",", "."));
  const errCant = !(n > 0) ? "Poné cuánto hace falta." : "";

  const elegir = (m) => {
    setId(m.id);
    setTimeout(() => cant.current?.focus(), 350);
  };

  const enviar = async () => {
    setIntento(true);
    if (!elegida || errCant) return;
    setEnviando(true);
    setError("");
    try {
      await onEnviar({ materia_prima_id: elegida.id, cantidad: n, urgencia, motivo });
    } catch (e) {
      setError(e.message || "No se pudo enviar la sugerencia.");
      setEnviando(false);
    }
  };

  return (
    <Drawer
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Sugerir una compra"
      subtitulo="Elegí la materia prima, cuánto hace falta y qué tan urgente es"
      pie={
        <div className="flex flex-col gap-2">
          <AnimatePresence>{error && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="text-sm font-semibold text-rose-300 overflow-hidden">{error}</motion.p>}</AnimatePresence>
          <div className="flex gap-3">
            <button type="button" onClick={onCerrar} className="min-h-[56px] px-5 rounded-2xl text-zinc-300 hover:text-white hover:bg-white/[0.06] font-bold cursor-pointer">Cancelar</button>
            <button type="button" onClick={enviar} disabled={enviando || !elegida} className="flex-1 min-h-[56px] rounded-2xl bg-[#FFD60A] text-black text-lg font-extrabold inline-flex items-center justify-center gap-2.5 hover:bg-white active:scale-[0.99] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              {enviando ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />} Enviar sugerencia
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div>
          <Etiqueta>Materia prima</Etiqueta>
          <AnimatePresence mode="wait" initial={false}>
            {elegida ? (
              <motion.div key="elegida" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] px-4 py-3">
                <Check size={18} className="text-emerald-300 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-white leading-snug">{elegida.nombre}</p>
                  <p className="text-xs text-zinc-400"><span className="font-mono text-[#ff8a4d]">{elegida.codigo}</span> · hay {nf(elegida.stock_actual, 2)} {abrev(elegida.unidad_medida)}</p>
                </div>
                <button type="button" onClick={() => setId(null)} aria-label="Cambiar materia prima" className="w-10 h-10 grid place-items-center rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.08] cursor-pointer"><X size={17} /></button>
              </motion.div>
            ) : (
              <motion.div key="buscar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="relative">
                  <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o código…" className={`${campo} !min-h-[52px] pl-11`} />
                </div>
                <div className="mt-2 flex flex-col gap-1.5">
                  {cargando && Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[56px] rounded-xl bg-white/[0.04] animate-pulse" />)}
                  {!cargando && lista.map((m, i) => (
                    <motion.button key={m.id} type="button" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE, delay: Math.min(i, 8) * 0.02 }} onClick={() => elegir(m)} className="text-left min-h-[56px] px-4 rounded-xl bg-white/[0.035] hover:bg-white/[0.08] border border-white/[0.06] flex items-center gap-3 cursor-pointer transition-colors">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-zinc-100 truncate">{m.nombre}</span>
                        <span className="block font-mono text-[11.5px] font-bold text-[#ff8a4d]">{m.codigo}</span>
                      </span>
                      {m.en_curso.length > 0 && <span className="shrink-0 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-bold text-sky-300">Ya pedida</span>}
                    </motion.button>
                  ))}
                  {!cargando && !lista.length && <p className="text-sm text-zinc-500 px-1 py-3">{materias.length ? "No hay materias primas con ese nombre. Solo se puede sugerir una que ya esté cargada." : "Todavía no hay materias primas cargadas."}</p>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {intento && !elegida && <p className="mt-1.5 text-sm font-semibold text-rose-300">Elegí la materia prima de la lista.</p>}
        </div>

        <AnimatePresence>
          {elegida && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} className="flex flex-col gap-6">
              <AvisoEnCurso materia={elegida} />
              <label className="block">
                <Etiqueta>Cantidad que hace falta</Etiqueta>
                <div className="relative">
                  <input ref={cant} inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="0" className={`${campo} !min-h-[60px] !text-2xl font-extrabold tabular-nums pr-20`} />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-500">{abrev(elegida.unidad_medida)}</span>
                </div>
                {intento && errCant && <p className="mt-1.5 text-sm font-semibold text-rose-300">{errCant}</p>}
              </label>
              <div>
                <Etiqueta>Urgencia</Etiqueta>
                <EscalaUrgencia valor={urgencia} onChange={setUrgencia} />
              </div>
              <label className="block">
                <Etiqueta>Motivo (opcional)</Etiqueta>
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Ej: queda para dos días" className={campo} />
              </label>
              <p className="text-xs text-zinc-600 -mt-2">El proveedor lo define quien compra.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Drawer>
  );
}
