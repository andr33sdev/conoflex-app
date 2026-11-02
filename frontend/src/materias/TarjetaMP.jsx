import { memo } from "react";
import { motion } from "framer-motion";
import { Building2, ChevronRight, Pencil } from "lucide-react";
import { TONO, abrev, estadoDe, fraccion, nf, useContar } from "./util";

const EASE = [0.22, 1, 0.36, 1];

function Barra({ m, tono }) {
  const min = Number(m.stock_minimo) || 0;
  return (
    <div className="relative h-1.5 rounded-full bg-white/[0.07] overflow-visible" aria-hidden="true">
      <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: tono.color }} initial={{ width: 0 }} animate={{ width: `${fraccion(m) * 100}%` }} transition={{ duration: 0.9, ease: EASE }} />
      {min > 0 && <span className="absolute -top-[3px] -bottom-[3px] left-1/2 w-px bg-white/40" />}
    </div>
  );
}

function Aviso({ estado, plan }) {
  if (plan?.falta > 0) return <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/12 px-2 py-0.5 text-[11px] font-bold text-rose-300">Faltan {nf(plan.falta, 1)} esta semana</span>;
  if (estado !== "ok") return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${TONO[estado].chip}`}>{TONO[estado].texto}</span>;
  if (plan) return <span className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[11px] font-bold text-zinc-400">En el plan · alcanza</span>;
  return null;
}

function TarjetaMP({ m, plan, proveedor, indice, modo, onAbrir, onEditar }) {
  const estado = estadoDe(m);
  const tono = TONO[estado];
  const stock = useContar(Number(m.stock_actual) || 0);
  const u = abrev(m.unidad_medida);
  const entra = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, ease: EASE, delay: Math.min(indice, 14) * 0.035 } };
  const paraguay = String(m.planta || "").toLowerCase() === "paraguay";

  const editar = (e) => {
    e.stopPropagation();
    onEditar(m);
  };

  if (modo === "lista") {
    return (
      <motion.div {...entra} className="group">
        <button onClick={() => onAbrir(m)} className="w-full text-left flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.05] hover:border-white/[0.14] px-4 py-3 transition-colors cursor-pointer">
          <span className={`w-2 h-2 rounded-full shrink-0 ${tono.punto}`} />
          <span className="w-[110px] sm:w-[150px] shrink-0 font-mono text-[12px] font-bold text-[#ff8a4d] truncate">{m.codigo}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-semibold text-zinc-100 truncate">{m.nombre}</span>
            <span className="block text-xs text-zinc-500 truncate">{proveedor?.nombre || "Sin proveedor"}{paraguay ? " · Paraguay" : ""}</span>
          </span>
          <span className="hidden md:block w-40 shrink-0"><Barra m={m} tono={tono} /></span>
          <span className="hidden lg:flex w-44 shrink-0 justify-end"><Aviso estado={estado} plan={plan} /></span>
          <span className="w-[110px] shrink-0 text-right tabular-nums"><b className="text-[15px] font-extrabold text-white">{nf(stock, 2)}</b> <span className="text-xs text-zinc-500">{u}</span></span>
          <ChevronRight size={16} className="text-zinc-600 group-hover:text-zinc-300 transition-colors shrink-0" />
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div {...entra} whileHover={{ y: -3 }} className="group relative">
      <button onClick={() => onAbrir(m)} className="w-full h-full text-left flex flex-col gap-3 rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.045] to-white/[0.015] hover:border-[#FF5A00]/40 hover:shadow-[0_18px_50px_-20px_rgba(255,90,0,0.35)] p-4 sm:p-5 transition-[border-color,box-shadow] duration-300 cursor-pointer">
        <span className="flex items-center gap-2 h-5">
          <span className={`w-2 h-2 rounded-full ${tono.punto} ${estado !== "ok" ? "animate-pulse" : ""}`} />
          <span className="font-mono text-[12px] font-bold tracking-wide text-[#ff8a4d] truncate">{m.codigo}</span>
          {paraguay && <span className="ml-auto text-[10px] font-extrabold uppercase tracking-wider text-sky-300 bg-sky-500/10 border border-sky-500/25 rounded-full px-2 py-0.5">PY</span>}
        </span>
        <span className="block text-[16px] leading-snug font-bold text-white line-clamp-2 min-h-[1.4em] sm:min-h-[2.8em]">{m.nombre}</span>
        <span className="flex items-center gap-1.5 text-[12.5px] text-zinc-500 truncate">
          <Building2 size={13} className="shrink-0" />
          <span className={`truncate ${proveedor ? "" : "text-zinc-600 italic"}`}>{proveedor?.nombre || "Sin proveedor"}</span>
        </span>
        <span className="mt-auto flex flex-col gap-2.5 pt-1">
          <span className="flex items-end justify-between gap-2">
            <span className="tabular-nums leading-none"><b className="text-[28px] font-extrabold text-white">{nf(stock, 2)}</b> <span className="text-sm font-semibold text-zinc-500">{u}</span></span>
          </span>
          <Barra m={m} tono={tono} />
          <span className="min-h-[24px] flex items-center"><Aviso estado={estado} plan={plan} /></span>
        </span>
      </button>
      <button onClick={editar} aria-label={`Editar ${m.nombre}`} className="absolute top-3 right-3 w-9 h-9 grid place-items-center rounded-xl bg-black/60 border border-white/[0.1] text-zinc-300 opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:hidden hover:bg-white/[0.12] transition-opacity cursor-pointer" style={{ right: paraguay ? "3.25rem" : undefined }}>
        <Pencil size={15} />
      </button>
    </motion.div>
  );
}

export default memo(TarjetaMP);
