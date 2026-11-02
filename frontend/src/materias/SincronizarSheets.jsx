import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, CheckCircle2, Loader2, Plus, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Drawer } from "../produccion/ui";
import { nf } from "./util";

function Seccion({ titulo, icono: Icono, color, activo, onActivo, vacio, children, cantidad }) {
  return (
    <section className="rounded-3xl border border-white/[0.07] bg-white/[0.03] p-4">
      <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
        <input type="checkbox" checked={activo} onChange={(e) => onActivo(e.target.checked)} className="w-5 h-5 cursor-pointer" style={{ accentColor: color }} />
        <span className="flex-1 font-extrabold text-white inline-flex items-center gap-2"><Icono size={16} style={{ color }} /> {titulo} <span className="text-zinc-500 font-bold">({cantidad})</span></span>
      </label>
      {!activo ? <p className="text-sm text-zinc-500 mt-1">Se omite esta parte.</p> : cantidad === 0 ? <p className="text-sm text-zinc-500 mt-1">{vacio}</p> : <div className="mt-2 flex flex-col gap-1.5 max-h-72 overflow-y-auto custom-scrollbar pr-1">{children}</div>}
    </section>
  );
}

function Fila({ marcada, color, onToggle, izquierda, derecha }) {
  return (
    <button type="button" onClick={onToggle} className={`text-left w-full rounded-xl border px-3 py-2.5 flex items-center gap-3 cursor-pointer transition-colors ${marcada ? "bg-white/[0.06]" : "border-white/[0.06] opacity-55"}`} style={marcada ? { borderColor: `${color}66` } : undefined}>
      <span className="w-5 h-5 rounded-md border grid place-items-center shrink-0" style={{ borderColor: marcada ? color : "rgba(255,255,255,0.2)", background: marcada ? color : "transparent" }}>{marcada && <Check size={13} strokeWidth={4} className="text-black" />}</span>
      <span className="min-w-0 flex-1">{izquierda}</span>
      <span className="shrink-0 text-right">{derecha}</span>
    </button>
  );
}

/** Compara la planilla de Google Sheets con la base y deja elegir qué aplicar. */
export default function SincronizarSheets({ datos: datosProp, aplicando, onCerrar, onAplicar }) {
  // El padre cambia la key en cada comparación nueva: el estado inicial sale de esos datos.
  const [guardados] = useState(datosProp);
  const datos = datosProp || guardados; // mientras se cierra, la lista no desaparece de golpe
  const [conNuevos, setConNuevos] = useState(true);
  const [conMod, setConMod] = useState(true);
  const [selN, setSelN] = useState(() => (datosProp ? datosProp.nuevos.map((n) => n.codigo) : []));
  const [selM, setSelM] = useState(() => (datosProp ? datosProp.modificados.map((m) => m.id) : []));

  const hay = !!datos && (datos.nuevos.length > 0 || datos.modificados.length > 0);
  const alternar = (lista, set, v) => set(lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);
  const total = (conNuevos ? selN.length : 0) + (conMod ? selM.length : 0);

  return (
    <Drawer
      abierto={!!datosProp}
      onCerrar={onCerrar}
      titulo="Sincronizar con Google Sheets"
      subtitulo="Revisá las diferencias antes de aplicarlas"
      pie={hay && (
        <button onClick={() => onAplicar({ nuevos: conNuevos ? datos.nuevos.filter((n) => selN.includes(n.codigo)) : [], modificados: conMod ? datos.modificados.filter((m) => selM.includes(m.id)) : [] })} disabled={aplicando || total === 0} className="w-full min-h-[56px] rounded-2xl bg-[#FFD60A] text-black text-lg font-extrabold inline-flex items-center justify-center gap-2.5 hover:bg-white transition-all disabled:opacity-50 cursor-pointer">
          {aplicando ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={19} strokeWidth={3} />} Aplicar {total} {total === 1 ? "cambio" : "cambios"}
        </button>
      )}
    >
      {datos && !hay && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-16 text-center">
          <CheckCircle2 size={48} className="mx-auto text-emerald-400" />
          <p className="mt-4 text-lg font-extrabold text-white">Todo coincide</p>
          <p className="text-sm text-zinc-500 mt-1">La base está igual que la planilla de Google Sheets.</p>
        </motion.div>
      )}
      {hay && (
        <div className="flex flex-col gap-4">
          <Seccion titulo="Materias primas nuevas" icono={Plus} color="#FF5A00" activo={conNuevos} onActivo={(v) => { setConNuevos(v); setSelN(v ? datos.nuevos.map((n) => n.codigo) : []); }} cantidad={datos.nuevos.length} vacio="No hay materias primas nuevas.">
            {datos.nuevos.map((n) => (
              <Fila key={n.codigo} marcada={selN.includes(n.codigo)} color="#FF5A00" onToggle={() => alternar(selN, setSelN, n.codigo)} izquierda={<><span className="block font-mono text-[11px] font-bold text-[#ff8a4d]">{n.codigo}</span><span className="block text-sm font-semibold text-zinc-100 truncate">{n.nombre}</span></>} derecha={<span className="text-sm text-zinc-300 tabular-nums">{nf(n.stock_nuevo, 2)} <span className="text-zinc-500">{String(n.unidad || "").toLowerCase()}</span></span>} />
            ))}
          </Seccion>
          <Seccion titulo="Stocks que cambian" icono={RefreshCw} color="#FFD60A" activo={conMod} onActivo={(v) => { setConMod(v); setSelM(v ? datos.modificados.map((m) => m.id) : []); }} cantidad={datos.modificados.length} vacio="No hay diferencias de stock.">
            {datos.modificados.map((m) => (
              <Fila key={m.id} marcada={selM.includes(m.id)} color="#FFD60A" onToggle={() => alternar(selM, setSelM, m.id)} izquierda={<><span className="block font-mono text-[11px] font-bold text-[#FFD60A]">{m.codigo}</span><span className="block text-sm font-semibold text-zinc-100 truncate">{m.nombre}</span></>} derecha={<span className="inline-flex items-center gap-1.5 text-sm tabular-nums text-zinc-400">{nf(m.stock_actual, 1)} <ArrowRight size={13} /> <b className="text-white">{nf(m.stock_nuevo, 1)}</b>{m.diferencia > 0 ? <TrendingUp size={14} className="text-emerald-400" /> : <TrendingDown size={14} className="text-rose-400" />}</span>} />
            ))}
          </Seccion>
        </div>
      )}
    </Drawer>
  );
}
