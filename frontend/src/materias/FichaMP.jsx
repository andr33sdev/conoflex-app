import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, CalendarRange, ChevronDown, History, Layers, Mail, Pencil, Phone, Search } from "lucide-react";
import { Drawer } from "../produccion/ui";
import { TONO, abrev, estadoDe, fraccion, nf, norm, useContar } from "./util";
import CostoMP from "./CostoMP";

const EASE = [0.22, 1, 0.36, 1];

/** Anillo de stock: se llena hasta el nivel actual; la marca blanca es el punto de pedido. */
function Anillo({ m, tono }) {
  const R = 64;
  const C = 2 * Math.PI * R;
  const min = Number(m.stock_minimo) || 0;
  const stock = useContar(Number(m.stock_actual) || 0, { duracion: 1.1 });
  return (
    <div className="relative w-[176px] h-[176px] shrink-0 mx-auto sm:mx-0">
      <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
        <circle cx="80" cy="80" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="12" />
        <motion.circle cx="80" cy="80" r={R} fill="none" stroke={tono.color} strokeWidth="12" strokeLinecap="round" strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - fraccion(m)) }} transition={{ duration: 1.1, ease: EASE }} style={{ filter: `drop-shadow(0 0 10px ${tono.color}55)` }} />
        {min > 0 && <line x1="6" y1="80" x2="26" y2="80" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round" />}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-[30px] leading-none font-extrabold text-white tabular-nums">{nf(stock, 2)}</div>
          <div className="mt-1 text-sm font-semibold text-zinc-500">{abrev(m.unidad_medida)} en stock</div>
        </div>
      </div>
    </div>
  );
}

function Bloque({ titulo, children, className = "" }) {
  return (
    <section className={`rounded-3xl border border-white/[0.07] bg-white/[0.03] p-4 sm:p-5 ${className}`}>
      <h3 className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-zinc-500 mb-3">{titulo}</h3>
      {children}
    </section>
  );
}

function EstaSemana({ plan, u, cargando }) {
  if (cargando) return <p className="text-sm text-zinc-500">Calculando…</p>;
  if (!plan) return <p className="text-sm text-zinc-400 leading-snug">No está en el plan de producción de esta semana, así que no se estima ningún consumo.</p>;
  const falta = plan.falta > 0;
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-zinc-500">Falta producir usa</div>
          <div className="text-xl font-extrabold text-white tabular-nums">{nf(plan.necesidad, 1)} <span className="text-sm text-zinc-500">{u}</span></div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">{falta ? "Faltarían" : "Quedarían"}</div>
          <div className={`text-xl font-extrabold tabular-nums ${falta ? "text-rose-300" : "text-emerald-300"}`}>{nf(falta ? plan.falta : plan.stock_despues, 1)} <span className="text-sm opacity-70">{u}</span></div>
        </div>
      </div>
      <p className={`mt-3 text-sm font-semibold ${falta ? "text-rose-300" : "text-emerald-300"}`}>{falta ? "No alcanza para terminar la semana." : "Alcanza para terminar lo que falta de la semana."}</p>
    </div>
  );
}

export default function FichaMP({ m, proveedor, plan, planCargando, usos, esAdmin, onCerrar, onEditar, onHistorial, onSemana }) {
  const [verUsos, setVerUsos] = useState(false);
  const [filtro, setFiltro] = useState("");
  const abierto = !!m;
  const estado = m ? estadoDe(m) : "ok";
  const tono = TONO[estado];
  const u = m ? abrev(m.unidad_medida) : "kg";
  const lista = useMemo(() => {
    const t = norm(filtro);
    return (usos || []).filter((x) => !t || norm(`${x.productCode} ${x.productName}`).includes(t));
  }, [usos, filtro]);
  const min = Number(m?.stock_minimo) || 0;

  return (
    <Drawer abierto={abierto} onCerrar={onCerrar} titulo={m?.nombre || ""} subtitulo={m && <span className="font-mono text-[#ff8a4d] font-bold">{m.codigo}</span>} derecha={m && <button onClick={() => onEditar(m)} className="min-h-[40px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.08] text-sm font-bold text-zinc-100 inline-flex items-center gap-2 cursor-pointer"><Pencil size={15} /> Editar</button>}>
      {m && (
        <motion.div initial="oculto" animate="visto" variants={{ visto: { transition: { staggerChildren: 0.07 } } }} className="flex flex-col gap-4">
          <motion.div variants={{ oculto: { opacity: 0, y: 16 }, visto: { opacity: 1, y: 0 } }} transition={{ duration: 0.4, ease: EASE }} className="rounded-3xl border border-white/[0.07] bg-gradient-to-br from-white/[0.05] to-transparent p-5 flex flex-col sm:flex-row items-center gap-5">
            <Anillo m={m} tono={tono} />
            <div className="min-w-0 flex-1 w-full">
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-extrabold ${tono.chip}`}>{tono.texto}</span>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div><dt className="text-xs text-zinc-500">Punto de pedido</dt><dd className="font-bold text-white tabular-nums">{min > 0 ? `${nf(min, 2)} ${u}` : "Sin definir"}</dd></div>
                <div><dt className="text-xs text-zinc-500">Planta</dt><dd className="font-bold text-white">{m.planta || "Argentina"}</dd></div>
                <div><dt className="text-xs text-zinc-500">Unidad</dt><dd className="font-bold text-white">{String(m.unidad_medida || "KILOS").toLowerCase()}</dd></div>
                {min > 0 && <div><dt className="text-xs text-zinc-500">{estado === "ok" ? "Margen sobre el punto" : "Falta para el punto"}</dt><dd className="font-bold text-white tabular-nums">{nf(Math.abs((Number(m.stock_actual) || 0) - min), 2)} {u}</dd></div>}
              </dl>
            </div>
          </motion.div>

          <motion.div variants={{ oculto: { opacity: 0, y: 16 }, visto: { opacity: 1, y: 0 } }} transition={{ duration: 0.4, ease: EASE }}>
            <Bloque titulo="Esta semana">
              <EstaSemana plan={plan} u={u} cargando={planCargando} />
              <button onClick={onSemana} className="mt-3 text-sm font-bold text-zinc-300 hover:text-white inline-flex items-center gap-2 cursor-pointer"><CalendarRange size={15} /> Ver detalle por lote</button>
            </Bloque>
          </motion.div>

          {esAdmin && (
            <motion.div variants={{ oculto: { opacity: 0, y: 16 }, visto: { opacity: 1, y: 0 } }} transition={{ duration: 0.4, ease: EASE }}>
              <Bloque titulo="Costo · solo administradores">
                <CostoMP key={m.id} m={m} />
              </Bloque>
            </motion.div>
          )}

          <motion.div variants={{ oculto: { opacity: 0, y: 16 }, visto: { opacity: 1, y: 0 } }} transition={{ duration: 0.4, ease: EASE }}>
            <Bloque titulo="Proveedor">
              {proveedor ? (
                <div>
                  <p className="flex items-center gap-2 text-base font-bold text-white"><Building2 size={17} className="text-zinc-500" /> {proveedor.nombre}</p>
                  {(proveedor.contacto || proveedor.telefono || proveedor.email) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {proveedor.contacto && <span className="text-sm text-zinc-400 self-center mr-1">{proveedor.contacto}</span>}
                      {proveedor.telefono && <a href={`tel:${proveedor.telefono}`} className="min-h-[40px] px-3.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm font-semibold text-zinc-200 hover:bg-white/[0.1] inline-flex items-center gap-2"><Phone size={14} /> {proveedor.telefono}</a>}
                      {proveedor.email && <a href={`mailto:${proveedor.email}`} className="min-h-[40px] px-3.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm font-semibold text-zinc-200 hover:bg-white/[0.1] inline-flex items-center gap-2 max-w-full"><Mail size={14} className="shrink-0" /> <span className="truncate">{proveedor.email}</span></a>}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">Todavía no tiene proveedor asignado. <button onClick={() => onEditar(m)} className="font-bold text-[#ff8a4d] hover:underline cursor-pointer">Asignar uno</button></p>
              )}
            </Bloque>
          </motion.div>

          <motion.div variants={{ oculto: { opacity: 0, y: 16 }, visto: { opacity: 1, y: 0 } }} transition={{ duration: 0.4, ease: EASE }} className="grid grid-cols-2 gap-3">
            <button onClick={onHistorial} className="min-h-[64px] rounded-2xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-zinc-100 font-bold inline-flex items-center justify-center gap-2.5 cursor-pointer transition-colors"><History size={18} className="text-[#FFD60A]" /> Historial</button>
            <button onClick={() => setVerUsos((v) => !v)} disabled={!usos?.length} aria-expanded={verUsos} className="min-h-[64px] rounded-2xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-zinc-100 font-bold inline-flex items-center justify-center gap-2.5 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"><Layers size={18} className="text-sky-300" /> Se usa en {usos?.length || 0} <ChevronDown size={15} className={`transition-transform ${verUsos ? "rotate-180" : ""}`} /></button>
          </motion.div>

          <AnimatePresence initial={false}>
            {verUsos && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden">
                <Bloque titulo="Productos que la llevan">
                  {usos.length > 6 && (
                    <div className="relative mb-3">
                      <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar productos…" className="w-full min-h-[44px] rounded-xl bg-[#17171c] border border-white/[0.09] pl-10 pr-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FF5A00]/70" />
                    </div>
                  )}
                  <ul className="flex flex-col gap-1.5 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                    {lista.map((x, i) => (
                      <li key={`${x.productCode}-${i}`} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
                        <span className="min-w-0 flex-1"><span className="block font-mono text-[11px] font-bold text-[#ff8a4d] truncate">{x.productCode}</span><span className="block text-sm font-semibold text-zinc-100 truncate">{x.productName}</span></span>
                        <span className="text-[11px] font-bold text-zinc-400 border border-white/[0.1] rounded-full px-2 py-0.5 shrink-0">v{x.version}</span>
                      </li>
                    ))}
                    {!lista.length && <li className="text-sm text-zinc-500 py-2">Sin coincidencias.</li>}
                  </ul>
                </Bloque>
              </motion.div>
            )}
          </AnimatePresence>
          {!esAdmin && <p className="text-xs text-zinc-600 text-center">El stock solo lo modifica un administrador.</p>}
        </motion.div>
      )}
    </Drawer>
  );
}
