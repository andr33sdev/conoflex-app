import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellRing, ChevronRight, CircleCheckBig, X } from "lucide-react";
import { api } from "./produccion/util";
import { fechaCorta, hace } from "./ingenieria/formato";

const CADA_MS = 45000;

/** Campanita del admin: avisa cuando se produjo con una fórmula distinta a la definida en Ingenierías. */
export default function Campanita({ usuarioActual }) {
  const admin = String(usuarioActual?.rol || "").toUpperCase() === "ADMIN";
  const [n, setN] = useState(0);
  const [abierta, setAbierta] = useState(false);
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  const [sacudir, setSacudir] = useState(0);
  const previo = useRef(0);
  const caja = useRef(null);

  const contar = useCallback(async () => {
    try {
      const r = await api("/api/ingenierias/alertas/contador");
      if (r.abiertas > previo.current) setSacudir((k) => k + 1);
      previo.current = r.abiertas;
      setN(r.abiertas);
    } catch {
      /* sin conexión: se reintenta en el próximo ciclo */
    }
  }, []);

  useEffect(() => {
    if (!admin) return undefined;
    Promise.resolve().then(contar);
    const t = setInterval(contar, CADA_MS);
    const alVolver = () => document.visibilityState === "visible" && contar();
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("cf:alertas", contar);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("cf:alertas", contar);
    };
  }, [admin, contar]);

  useEffect(() => {
    if (!abierta) return undefined;
    let vivo = true;
    api("/api/ingenierias/alertas")
      .then((l) => {
        if (!vivo) return;
        setLista(l);
        setError("");
        previo.current = l.length;
        setN(l.length);
      })
      .catch((e) => vivo && setError(e.message));
    const afuera = (e) => caja.current && !caja.current.contains(e.target) && setAbierta(false);
    const esc = (e) => e.key === "Escape" && setAbierta(false);
    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", esc);
    return () => {
      vivo = false;
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierta]);

  if (!admin) return null;

  const ir = (a) => {
    setAbierta(false);
    window.history.pushState({}, document.title, `/ingenieria?alerta=${a.id}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <div className="relative" ref={caja}>
      <button onClick={() => { setLista(null); setAbierta((v) => !v); }} aria-label={n ? `Notificaciones: ${n} sin resolver` : "Notificaciones"} aria-expanded={abierta} className={`relative w-9 h-9 grid place-items-center rounded-xl border transition-colors cursor-pointer ${n ? "border-[#FFD60A]/40 bg-[#FFD60A]/10 text-[#FFD60A]" : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white hover:border-white/20"}`}>
        <motion.span key={sacudir} animate={sacudir ? { rotate: [0, -18, 16, -12, 8, 0] } : {}} transition={{ duration: 0.7 }} className="grid place-items-center">
          {n ? <BellRing size={17} /> : <Bell size={17} />}
        </motion.span>
        {n > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF5A00] text-black text-[11px] font-extrabold grid place-items-center tabular-nums">{n > 9 ? "9+" : n}</span>}
      </button>

      <AnimatePresence>
        {abierta && (
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} role="dialog" aria-label="Notificaciones" className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] sm:top-full sm:mt-2 sm:w-[400px] z-[90] rounded-3xl border border-white/[0.1] bg-[#111114] shadow-[0_24px_70px_rgba(0,0,0,0.65)] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.07]">
              <p className="flex-1 text-[15px] font-extrabold text-white">Notificaciones</p>
              <button onClick={() => setAbierta(false)} aria-label="Cerrar" className="w-9 h-9 grid place-items-center rounded-lg text-zinc-500 hover:text-white cursor-pointer"><X size={17} /></button>
            </div>
            <div className="max-h-[min(60vh,440px)] overflow-y-auto custom-scrollbar">
              {error ? (
                <p className="px-4 py-8 text-center text-sm text-rose-300">{error}</p>
              ) : !lista ? (
                <div className="p-4 flex flex-col gap-2">{[0, 1].map((i) => <div key={i} className="h-16 rounded-2xl bg-white/[0.05] animate-pulse" />)}</div>
              ) : lista.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <span className="mx-auto w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-400/20 grid place-items-center text-emerald-300"><CircleCheckBig size={24} /></span>
                  <p className="mt-3 text-base font-extrabold text-white">Todo en orden</p>
                  <p className="mt-1 text-sm text-zinc-500">Lo producido coincide con las recetas definidas.</p>
                </div>
              ) : (
                <ul className="p-2 flex flex-col gap-1.5">
                  {lista.map((a) => {
                    const dif = a.diferencias?.diferencias?.length || 0;
                    return (
                      <li key={a.id}>
                        <button onClick={() => ir(a)} className="w-full text-left flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-white/[0.06] transition-colors cursor-pointer">
                          <span className="shrink-0 w-10 h-10 rounded-xl bg-[#FFD60A]/12 border border-[#FFD60A]/25 grid place-items-center text-[#FFD60A]"><BellRing size={17} /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-extrabold text-white leading-snug">{a.semielaborado_codigo} · {a.semielaborado_nombre}</span>
                            <span className="block text-xs text-zinc-400 mt-0.5">Se produjo con una fórmula distinta a la definida{dif ? ` (${dif} ${dif === 1 ? "diferencia" : "diferencias"})` : ""}</span>
                            <span className="block text-xs text-zinc-500 mt-0.5">Lote {a.lote || "—"} · {fechaCorta(a.fecha_carga)} · {hace(a.created_at)}</span>
                          </span>
                          <ChevronRight size={16} className="text-zinc-600 shrink-0" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
