import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellRing, CheckCheck, ChevronRight, CircleCheckBig, PackageSearch, X } from "lucide-react";
import { api } from "./produccion/util";
import { fechaCorta, hace } from "./ingenieria/formato";

const CADA_MS = 45000;

/**
 * Campanita de admin y producción.
 * - Admin: además, avisa cuando se produjo con una fórmula distinta a la definida en Ingenierías.
 * - Admin y producción: avisa cuando el depósito genera una solicitud interna.
 */
export default function Campanita({ usuarioActual }) {
  const rol = String(usuarioActual?.rol || "").trim().toUpperCase();
  const admin = rol === "ADMIN";
  const conAgente = (usuarioActual?.permisos || []).some((p) => String(p).startsWith("agente:"));
  const puede = admin || rol === "PRODUCCION" || conAgente;
  const [n, setN] = useState(0);
  const [abierta, setAbierta] = useState(false);
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  const [sacudir, setSacudir] = useState(0);
  const previo = useRef(0);
  const primera = useRef(true);
  const [aviso, setAviso] = useState(null); // cartel emergente cuando un agente te avisa de algo nuevo
  const caja = useRef(null);

  const contar = useCallback(async () => {
    try {
      const [a, nt] = await Promise.all([admin ? api("/api/ingenierias/alertas/contador") : { abiertas: 0 }, api("/api/notificaciones/contador")]);
      const total = a.abiertas + nt.sin_leer;
      if (total > previo.current) {
        setSacudir((k) => k + 1);
        // No es la primera carga: busca qué llegó y, si es de un agente, lo muestra aunque no estés en su módulo.
        if (!primera.current && nt.sin_leer > 0) {
          api("/api/notificaciones")
            .then((l) => {
              const nueva = l.find((x) => x.sin_leer && String(x.tipo).startsWith("AGENTE_"));
              if (nueva) setAviso((v) => (v?.id === nueva.id ? v : nueva));
            })
            .catch(() => {});
        }
      }
      primera.current = false;
      previo.current = total;
      setN(total);
    } catch {
      /* sin conexión: se reintenta en el próximo ciclo */
    }
  }, [admin]);

  useEffect(() => {
    if (!puede) return undefined;
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
  }, [puede, contar]);

  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), 9000);
    return () => clearTimeout(t);
  }, [aviso]);

  useEffect(() => {
    if (!abierta) return undefined;
    let vivo = true;
    Promise.all([admin ? api("/api/ingenierias/alertas") : [], api("/api/notificaciones")])
      .then(([al, nt]) => {
        if (!vivo) return;
        const items = [
          ...al.map((a) => ({ clave: `a${a.id}`, tipo: "ALERTA", fecha: a.created_at, a })),
          ...nt.map((x) => ({ clave: `n${x.id}`, tipo: "NOTIF", fecha: x.created_at, sin_leer: x.sin_leer, x })),
        ].sort((p, q) => new Date(q.fecha) - new Date(p.fecha));
        setLista(items);
        setError("");
        const total = al.length + nt.filter((x) => x.sin_leer).length;
        previo.current = total;
        setN(total);
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
  }, [abierta, admin]);

  if (!puede) return null;

  const navegar = (ruta) => {
    setAbierta(false);
    window.history.pushState({}, document.title, ruta);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  const ir = (a) => navegar(`/ingenieria?alerta=${a.id}`);
  const abrirNotif = async (x) => {
    if (x.sin_leer) {
      try {
        await api(`/api/notificaciones/${x.id}/leer`, { method: "PUT" });
      } catch {
        /* si no se pudo marcar, igual se navega */
      }
      contar();
    }
    if (x.ruta) navegar(x.ruta);
  };
  const leerTodas = async () => {
    try {
      await api("/api/notificaciones/leer-todas", { method: "PUT" });
      setLista((l) => (l ? l.map((i) => (i.tipo === "NOTIF" ? { ...i, sin_leer: false } : i)) : l));
      contar();
    } catch {
      /* se reintenta al tocar de nuevo */
    }
  };
  const verAviso = async () => {
    const x = aviso;
    setAviso(null);
    if (x) await abrirNotif(x);
  };
  const haySinLeer = !!lista?.some((i) => i.tipo === "NOTIF" && i.sin_leer);

  return (
    <div className="relative" ref={caja}>
      <button onClick={() => { setLista(null); setAbierta((v) => !v); }} aria-label={n ? `Notificaciones: ${n} sin resolver` : "Notificaciones"} aria-expanded={abierta} className={`relative w-9 h-9 grid place-items-center rounded-xl border transition-colors cursor-pointer ${n ? "border-[#FFD60A]/40 bg-[#FFD60A]/10 text-[#FFD60A]" : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white hover:border-white/20"}`}>
        <motion.span key={sacudir} animate={sacudir ? { rotate: [0, -18, 16, -12, 8, 0] } : {}} transition={{ duration: 0.7 }} className="grid place-items-center">
          {n ? <BellRing size={17} /> : <Bell size={17} />}
        </motion.span>
        {n > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF5A00] text-black text-[11px] font-extrabold grid place-items-center tabular-nums">{n > 9 ? "9+" : n}</span>}
      </button>

      <AnimatePresence>
        {aviso && !abierta && (
          <motion.div
            key={`aviso${aviso.id}`}
            initial={{ opacity: 0, y: -14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            role="status"
            className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] sm:top-full sm:mt-2 sm:w-[380px] z-[95] rounded-2xl border border-[#FFD60A]/40 bg-[#17171b] shadow-[0_20px_60px_rgba(0,0,0,0.7)] overflow-hidden"
          >
            <button onClick={verAviso} className="w-full text-left flex items-start gap-3 p-3.5 cursor-pointer hover:bg-white/[0.04]">
              <span className="shrink-0 w-10 h-10 rounded-xl grid place-items-center text-black font-black" style={{ background: aviso.tipo === "AGENTE_STOCK" ? "#22c55e" : "#FF5A00" }}>{aviso.tipo === "AGENTE_STOCK" ? "N" : "L"}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#FFD60A]">{aviso.tipo === "AGENTE_STOCK" ? "Nati te avisa" : "Lía te avisa"}</span>
                <span className="block text-sm font-extrabold text-white leading-snug mt-0.5">{aviso.titulo}</span>
                {aviso.texto && <span className="block text-xs text-zinc-400 mt-0.5 leading-snug line-clamp-2">{aviso.texto}</span>}
              </span>
            </button>
            <button onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="absolute top-1.5 right-1.5 w-8 h-8 grid place-items-center rounded-lg text-zinc-500 hover:text-white cursor-pointer"><X size={15} /></button>
          </motion.div>
        )}
        {abierta && (
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} role="dialog" aria-label="Notificaciones" className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] sm:top-full sm:mt-2 sm:w-[400px] z-[90] rounded-3xl border border-white/[0.1] bg-[#111114] shadow-[0_24px_70px_rgba(0,0,0,0.65)] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.07]">
              <p className="flex-1 text-[15px] font-extrabold text-white">Notificaciones</p>
              {haySinLeer && <button onClick={leerTodas} className="min-h-[36px] px-3 rounded-lg text-xs font-bold text-zinc-300 hover:text-white hover:bg-white/[0.06] inline-flex items-center gap-1.5 cursor-pointer"><CheckCheck size={14} /> Marcar leídas</button>}
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
                  <p className="mt-1 text-sm text-zinc-500">No hay avisos nuevos.</p>
                </div>
              ) : (
                <ul className="p-2 flex flex-col gap-1.5">
                  {lista.map((it) => {
                    if (it.tipo === "NOTIF") {
                      const x = it.x;
                      return (
                        <li key={it.clave}>
                          <button onClick={() => abrirNotif(x)} className={`w-full text-left flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-white/[0.06] transition-colors cursor-pointer ${x.sin_leer ? "bg-white/[0.04]" : "opacity-70"}`}>
                            {String(x.tipo).startsWith("AGENTE_") ? (
                              <span className="shrink-0 w-10 h-10 rounded-xl grid place-items-center text-black font-black" style={{ background: x.tipo === "AGENTE_STOCK" ? "#22c55e" : "#FF5A00" }}>{x.tipo === "AGENTE_STOCK" ? "N" : "L"}</span>
                            ) : (
                              <span className="shrink-0 w-10 h-10 rounded-xl bg-[#FF5A00]/12 border border-[#FF5A00]/25 grid place-items-center text-[#ff9a63]"><PackageSearch size={17} /></span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-extrabold text-white leading-snug">{x.titulo}</span>
                              {x.texto && <span className="block text-xs text-zinc-400 mt-0.5 leading-snug">{x.texto}</span>}
                              <span className="block text-xs text-zinc-500 mt-0.5">{hace(x.created_at)}</span>
                            </span>
                            {x.sin_leer ? <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-[#FF5A00]" aria-label="Sin leer" /> : <ChevronRight size={16} className="text-zinc-600 shrink-0" />}
                          </button>
                        </li>
                      );
                    }
                    const a = it.a;
                    const dif = a.diferencias?.diferencias?.length || 0;
                    return (
                      <li key={it.clave}>
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
