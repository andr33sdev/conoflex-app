// Carga de producción: pantalla de la tablet de planta. Muestra lo que se produce hoy (máquina, modelo, lote,
// cantidad, operario, receta) y permite cargar lo producido al terminar el turno con un botón.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Factory,
  Loader2,
  Maximize2,
  Minimize2,
  Moon,
  PencilLine,
  RefreshCw,
  Send,
  Sun,
  User,
} from "lucide-react";
import { useToast } from "./produccion/useToast";
import {
  api,
  diaMes,
  hoyISO,
  nombreDia,
  num,
  sumarDias,
  turnoDeAhora,
  turnoLabel,
} from "./produccion/util";
import FormularioCarga from "./tablet/FormularioCarga";

const suave = [0.2, 0.8, 0.2, 1];

function fechaInicial() {
  const h = new Date();
  return h.getHours() < 6 ? sumarDias(hoyISO(), -1) : hoyISO();
}

function Reloj() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="inline-flex items-center gap-2 text-lg font-bold text-zinc-300 tabular-nums">
      <Clock size={18} className="text-zinc-500" />
      {ahora.toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      })}
    </span>
  );
}

function Estado({ a }) {
  if (a.carga?.estado === "APROBADA")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-sm font-bold text-emerald-300">
        <CheckCircle2 size={16} /> Aprobada
      </span>
    );
  if (a.carga?.estado === "PENDIENTE")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFD60A]/15 border border-[#FFD60A]/30 px-3 py-1 text-sm font-bold text-[#FFD60A]">
        <Clock size={16} /> Enviada · esperando aprobación
      </span>
    );
  if (a.rechazo)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 border border-rose-500/30 px-3 py-1 text-sm font-bold text-rose-300">
        <AlertTriangle size={16} /> Hay que corregirla
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FF5A00]/15 border border-[#FF5A00]/30 px-3 py-1 text-sm font-bold text-[#ff8a4d]">
      <span className="w-2 h-2 rounded-full bg-[#FF5A00] animate-pulse" /> Para
      producir
    </span>
  );
}

function Tarjeta({ a, i, onCargar }) {
  const c = a.carga;
  const lista = c?.estado === "APROBADA";
  const buenas = c ? c.total_producido - c.fallas : 0;
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        ease: suave,
        delay: Math.min(i * 0.07, 0.4),
      }}
      className={`relative overflow-hidden rounded-3xl border p-6 flex flex-col ${a.rechazo ? "border-rose-500/40 bg-[#1a1012]" : lista ? "border-emerald-500/25 bg-[#0e1612]" : "border-white/[0.09] bg-[#111114]"}`}
    >
      <div className="absolute inset-x-0 top-0 h-1.5 bg-[repeating-linear-gradient(135deg,#FFD60A_0_14px,transparent_14px_28px)] opacity-60" />
      <div className="flex flex-col-reverse items-start sm:flex-row sm:justify-between gap-3">
        <div className="min-w-0 max-w-full">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-zinc-500">
            Máquina
          </p>
          <h3 className="text-4xl font-extrabold text-white leading-none mt-1 truncate">
            {a.maquina || "Sin asignar"}
          </h3>
        </div>
        <Estado a={a} />
      </div>

      <div className="mt-5">
        <p className="text-2xl font-bold text-white leading-snug">
          {a.modelo_nombre}
        </p>
        <p className="mt-1 text-sm text-zinc-500">{a.modelo_codigo}</p>
      </div>

      <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-zinc-500">
            Cantidad
          </p>
          <p className="text-3xl font-extrabold text-[#FFD60A] tabular-nums leading-tight">
            {num(a.cantidad)}
          </p>
        </div>
        <div className="rounded-2xl bg-white/[0.04] px-4 py-3">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-zinc-500">
            Lote
          </p>
          <p className="text-xl font-extrabold text-white font-mono leading-tight mt-1.5">
            {a.lote}
          </p>
        </div>
        <div className="rounded-2xl bg-white/[0.04] px-4 py-3 min-w-0 col-span-2 sm:col-span-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-zinc-500">
            Operario
          </p>
          <p className="text-xl font-extrabold text-white leading-tight mt-1.5 truncate inline-flex items-center gap-1.5 max-w-full">
            <User size={16} className="text-zinc-500 shrink-0" />
            <span className="truncate">{a.operario || "—"}</span>
          </p>
        </div>
      </div>

      {a.receta.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-zinc-500 mb-2">
            Receta{a.receta_version ? ` · ${a.receta_version}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {a.receta.map((r) => (
              <span
                key={r.codigo}
                className="rounded-xl bg-white/[0.05] border border-white/[0.07] px-3 py-1.5 text-sm text-zinc-300"
              >
                <b className="text-white">{r.codigo}</b>{" "}
                <span className="text-zinc-500">· {r.nombre}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {a.rechazo && (
        <div className="mt-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-base text-rose-100">
          <b className="block text-rose-300 text-sm uppercase tracking-wide mb-0.5">
            Motivo del rechazo
          </b>
          {a.rechazo}
        </div>
      )}

      {c && (
        <div className="mt-4 rounded-2xl bg-white/[0.04] px-4 py-3 flex flex-wrap gap-x-6 gap-y-1 text-base text-zinc-300">
          <span>
            <b className="text-white tabular-nums">{num(c.total_producido)}</b>{" "}
            producidas
          </span>
          <span>
            <b className="text-emerald-300 tabular-nums">{num(buenas)}</b>{" "}
            buenas
          </span>
          <span>
            <b className="text-rose-300 tabular-nums">{num(c.fallas)}</b> fallas
          </span>
        </div>
      )}

      <div className="mt-auto pt-6">
        {lista ? (
          <p className="text-center text-base font-semibold text-emerald-300/80 py-4">
            Ya está cargada y aprobada. ¡Gracias!
          </p>
        ) : c ? (
          <button
            onClick={() => onCargar(a)}
            className="w-full min-h-[64px] rounded-2xl border border-white/[0.14] bg-white/[0.05] text-lg font-bold text-white inline-flex items-center justify-center gap-3 hover:bg-white/[0.1] active:scale-[0.99] transition-all cursor-pointer"
          >
            <PencilLine size={22} /> Corregir lo que cargué
          </button>
        ) : (
          <button
            onClick={() => onCargar(a)}
            className="w-full min-h-[76px] rounded-2xl bg-[#FF5A00] text-black text-2xl font-extrabold inline-flex items-center justify-center gap-3 hover:bg-[#ff7122] active:scale-[0.99] transition-all cursor-pointer shadow-[0_12px_36px_rgba(255,90,0,0.28)]"
          >
            <Send size={26} />{" "}
            {a.rechazo ? "Volver a cargar" : "Cargar producción"}
          </button>
        )}
      </div>
    </motion.article>
  );
}

function Aviso({ icono: Icono, titulo, texto, tono = "gris" }) {
  const t =
    tono === "ok"
      ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/25"
      : "text-zinc-400 bg-white/[0.04] border-white/[0.08]";
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: suave }}
      className="rounded-3xl border border-dashed border-white/[0.12] bg-white/[0.02] px-6 py-16 text-center"
    >
      <span
        className={`mx-auto w-20 h-20 rounded-full grid place-items-center border ${t}`}
      >
        <Icono size={36} />
      </span>
      <p className="mt-5 text-3xl font-extrabold text-white">{titulo}</p>
      <p className="mt-2 text-lg text-zinc-400 max-w-lg mx-auto">{texto}</p>
    </motion.div>
  );
}

export default function CargaProduccion() {
  const [fecha, setFecha] = useState(fechaInicial);
  const [turno, setTurno] = useState(() => turnoDeAhora());
  const [dato, setDato] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [operarios, setOperarios] = useState([]);
  const [cargando, setCargando] = useState(null);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const { mostrar: toast, nodo: toastNodo } = useToast();
  const clave = `${fecha}|${version}`;
  const abierto = useRef(false);
  useEffect(() => {
    abierto.current = !!cargando;
  }, [cargando]);

  useEffect(() => {
    let vivo = true;
    api("/api/prod/operarios")
      .then((d) => vivo && setOperarios(d))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    api(`/api/prod/tablet?fecha=${fecha}`)
      .then((d) => vivo && (setDato({ ...d, clave }), setError("")))
      .catch((e) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [fecha, version, clave]);

  // La tablet queda prendida todo el día: se actualiza sola cuando no se está cargando nada.
  useEffect(() => {
    const t = setInterval(() => {
      if (!abierto.current && !document.hidden) setVersion((v) => v + 1);
    }, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const h = () => setPantallaCompleta(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const alternarPantalla = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else
      document.documentElement
        .requestFullscreen?.()
        .catch(() =>
          toast("Este navegador no permite pantalla completa.", "error"),
        );
  };

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  const t = useMemo(
    () => dato?.turnos.find((x) => x.turno === turno),
    [dato, turno],
  );
  const hoy = hoyISO();
  const etiquetaDia =
    fecha === hoy
      ? "Hoy"
      : fecha === sumarDias(hoy, -1)
        ? "Ayer"
        : fecha === sumarDias(hoy, 1)
          ? "Mañana"
          : nombreDia(fecha);
  const cargandoDato = !error && (!dato || dato.clave !== clave) && !dato;

  const resumen = (tn) => {
    const x = dato?.turnos.find((y) => y.turno === tn);
    if (!x || !x.lanzado || x.sin_produccion) return null;
    const pend = x.asignaciones.filter((a) => !a.carga).length;
    return pend;
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 pb-28 lg:pb-10 flex flex-col gap-5">
        <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3 mr-auto">
            <span className="w-14 h-14 rounded-2xl bg-[#FF5A00] grid place-items-center text-black shadow-[0_8px_24px_rgba(255,90,0,0.3)]">
              <Factory size={28} />
            </span>
            <div>
              <h1 className="cf-h1-largo text-3xl font-extrabold text-white leading-none">
                Producción de planta
              </h1>
              <p className="text-base text-zinc-400 mt-1">
                Lo que hay que producir y la carga al terminar el turno
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-2xl bg-white/[0.05] border border-white/[0.08] p-1">
            <button
              onClick={() => setFecha((f) => sumarDias(f, -1))}
              aria-label="Día anterior"
              className="w-12 h-12 grid place-items-center rounded-xl text-zinc-300 hover:bg-white/[0.08] cursor-pointer"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              onClick={() => setFecha(fechaInicial())}
              className="min-w-[150px] px-3 text-center cursor-pointer rounded-xl hover:bg-white/[0.05] h-12"
            >
              <span className="block text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#FFD60A] leading-none">
                {etiquetaDia}
              </span>
              <span className="block text-lg font-extrabold text-white leading-tight">
                {nombreDia(fecha)} {diaMes(fecha)}
              </span>
            </button>
            <button
              onClick={() => setFecha((f) => sumarDias(f, 1))}
              aria-label="Día siguiente"
              className="w-12 h-12 grid place-items-center rounded-xl text-zinc-300 hover:bg-white/[0.08] cursor-pointer"
            >
              <ChevronRight size={24} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <Reloj />
            <button
              onClick={recargar}
              aria-label="Actualizar"
              className="w-12 h-12 grid place-items-center rounded-xl bg-white/[0.05] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.1] cursor-pointer"
            >
              <RefreshCw size={20} />
            </button>
            <button
              onClick={alternarPantalla}
              aria-label={
                pantallaCompleta
                  ? "Salir de pantalla completa"
                  : "Pantalla completa"
              }
              className="w-12 h-12 grid place-items-center rounded-xl bg-white/[0.05] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.1] cursor-pointer"
            >
              {pantallaCompleta ? (
                <Minimize2 size={20} />
              ) : (
                <Maximize2 size={20} />
              )}
            </button>
          </div>
        </header>

        <div role="tablist" className="grid grid-cols-2 gap-3">
          {[
            ["DIA", Sun],
            ["NOCHE", Moon],
          ].map(([id, Icono]) => {
            const pend = resumen(id);
            const activo = turno === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={activo}
                onClick={() => setTurno(id)}
                className={`relative min-h-[76px] rounded-2xl border px-3 sm:px-5 flex items-center gap-4 text-left transition-colors cursor-pointer ${activo ? "bg-[#FF5A00] border-[#FF5A00] text-black" : "bg-[#111114] border-white/[0.09] text-zinc-300 hover:border-white/25"}`}
              >
                <Icono size={30} />
                <span className="flex-1">
                  <span className="block text-lg sm:text-2xl font-extrabold leading-none">
                    Turno {turnoLabel(id).toLowerCase()}
                  </span>
                  <span
                    className={`block mt-1 text-sm font-semibold ${activo ? "text-black/70" : "text-zinc-500"}`}
                  >
                    {pend == null
                      ? dato?.turnos.find((y) => y.turno === id)?.sin_produccion
                        ? "Sin producción"
                        : "Sin lanzar"
                      : pend === 0
                        ? "Todo cargado"
                        : `${pend} para cargar`}
                  </span>
                </span>
                {pend > 0 && (
                  <span
                    className={`min-w-9 h-9 px-2 rounded-full grid place-items-center text-lg font-extrabold ${activo ? "bg-black text-[#FFD60A]" : "bg-[#FF5A00] text-black"}`}
                  >
                    {pend}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {error ? (
          <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-6 text-lg text-rose-100 flex items-start gap-3">
            <AlertTriangle className="shrink-0 mt-1" />{" "}
            <div>
              <b>No se pudo cargar la producción.</b>
              <p className="text-base mt-1">{error}</p>
              <button
                onClick={recargar}
                className="mt-3 min-h-[48px] px-5 rounded-xl bg-white/10 font-bold cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          </div>
        ) : cargandoDato ? (
          <div className="flex items-center justify-center gap-3 py-24 text-zinc-500 text-lg">
            <Loader2 className="animate-spin" /> Cargando…
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${fecha}-${turno}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: suave }}
            >
              {!t || !t.lanzado ? (
                t?.sin_produccion ? (
                  <Aviso
                    icono={turno === "NOCHE" ? Moon : Sun}
                    titulo={`Sin producción en el turno ${turnoLabel(turno).toLowerCase()}`}
                    texto={
                      t.motivo || "Este turno no tiene producción programada."
                    }
                  />
                ) : (
                  <Aviso
                    icono={Clock}
                    titulo="Todavía no hay producción para este turno"
                    texto="El jefe de producción la publica desde Planificación. Esta pantalla se actualiza sola."
                  />
                )
              ) : t.sin_produccion ? (
                <Aviso
                  icono={Moon}
                  titulo={`Sin producción en el turno ${turnoLabel(turno).toLowerCase()}`}
                  texto={
                    t.motivo || "Este turno no tiene producción programada."
                  }
                />
              ) : t.asignaciones.length === 0 ? (
                <Aviso
                  icono={Clock}
                  titulo="Este turno no tiene asignaciones"
                  texto="Consultá con el jefe de producción."
                />
              ) : (
                <>
                  {t.asignaciones.every((a) => a.carga) && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-4 flex items-center gap-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-4"
                    >
                      <CheckCircle2
                        size={32}
                        className="text-emerald-300 shrink-0"
                      />
                      <div>
                        <p className="text-xl font-extrabold text-white leading-tight">
                          ¡Todo cargado!
                        </p>
                        <p className="text-base text-emerald-100/70">
                          Si algo está mal, podés corregirlo hasta que lo
                          aprueben.
                        </p>
                      </div>
                    </motion.div>
                  )}
                  <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                    {t.asignaciones.map((a, i) => (
                      <Tarjeta key={a.id} a={a} i={i} onCargar={setCargando} />
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        )}

        <FormularioCarga
          asignacion={cargando}
          fecha={fecha}
          operarios={operarios}
          onCerrar={() => setCargando(null)}
          onGuardado={recargar}
          toast={toast}
        />
        {toastNodo}
      </div>
    </div>
  );
}
