import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Phone, PhoneOff, RotateCcw } from "lucide-react";
import useLlamada from "./useLlamada";

const NARANJA = "#FF5A00";

const reloj = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// Esfera que "respira" con la voz: crece y brilla cuando habla la asistente, y el anillo
// de afuera late con tu micrófono. Se anima leyendo los niveles directo, sin re-render.
function Orbe({ niveles, estado }) {
  const esfera = useRef(null);
  const anillo = useRef(null);
  const halo = useRef(null);
  const [quien, setQuien] = useState(null);

  useEffect(() => {
    let raf;
    let ultimo = null;
    const paso = (t) => {
      const { mic, bot } = niveles.current;
      const respira = estado === "conectando" ? 0.04 * Math.sin(t / 260) : 0.015 * Math.sin(t / 900);
      if (esfera.current) esfera.current.style.transform = `scale(${1 + respira + bot * 0.35})`;
      if (halo.current) halo.current.style.opacity = String(0.35 + bot * 0.65);
      if (halo.current) halo.current.style.transform = `scale(${1.05 + bot * 0.55})`;
      if (anillo.current) {
        anillo.current.style.transform = `scale(${1.12 + mic * 0.4})`;
        anillo.current.style.opacity = String(0.15 + mic * 0.85);
      }
      const ahora = bot > 0.08 ? "bot" : mic > 0.1 ? "vos" : null;
      if (ahora !== ultimo) {
        ultimo = ahora;
        setQuien(ahora);
      }
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [niveles, estado]);

  const activa = estado === "en_llamada" || estado === "conectando";
  return (
    <div className="relative w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center select-none" aria-hidden="true">
      <div ref={halo} className="absolute inset-0 rounded-full blur-3xl transition-opacity" style={{ background: `radial-gradient(circle, ${NARANJA}aa 0%, ${NARANJA}00 70%)`, opacity: activa ? 0.4 : 0.15 }} />
      <div ref={anillo} className="absolute inset-6 rounded-full border-2" style={{ borderColor: `${NARANJA}`, opacity: 0.15 }} />
      <div
        ref={esfera}
        className="relative w-40 h-40 sm:w-44 sm:h-44 rounded-full will-change-transform"
        style={{
          background: activa
            ? `radial-gradient(circle at 32% 28%, #ffd2b3 0%, #ff8a3d 22%, ${NARANJA} 48%, #b33a00 78%, #3a1200 100%)`
            : "radial-gradient(circle at 32% 28%, #52525b 0%, #27272a 55%, #09090b 100%)",
          boxShadow: activa ? `0 0 60px ${NARANJA}66, inset -18px -22px 40px #0006, inset 10px 12px 30px #fff3` : "inset -18px -22px 40px #0008",
          transition: "background 600ms ease, box-shadow 600ms ease",
        }}
      >
        <div className="absolute inset-0 rounded-full mix-blend-overlay opacity-60" style={{ background: "conic-gradient(from 0deg, #fff0, #fff4, #fff0 30%, #fff3 60%, #fff0)", animation: activa ? "orbe-gira 7s linear infinite" : "none" }} />
      </div>
      <span className="sr-only">{quien === "bot" ? "La asistente está hablando" : quien === "vos" ? "Estás hablando" : ""}</span>
      <style>{"@keyframes orbe-gira{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}

function Reloj({ inicio }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums">{reloj(ahora - inicio)}</span>;
}

function BotonRedondo({ onClick, titulo, color = "zinc", grande, children, disabled }) {
  const colores = {
    zinc: "bg-zinc-800/80 hover:bg-zinc-700 text-white border border-zinc-700",
    rojo: "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/40",
    verde: "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-900/40",
    blanco: "bg-white text-zinc-900 hover:bg-zinc-200",
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={titulo} aria-label={titulo} className={`${grande ? "w-[72px] h-[72px]" : "w-14 h-14"} rounded-full flex items-center justify-center cursor-pointer transition-all active:scale-95 disabled:opacity-50 disabled:cursor-wait ${colores[color]}`}>
      {children}
    </button>
  );
}

/** Pantalla de llamada completa. `urlOferta`: a dónde se manda la oferta (app o link público). */
export default function PantallaLlamada({ urlOferta, nombre = "Aldana", subtitulo = "Asistente de Conoflex", compacta, onEstado }) {
  const { estado, error, silenciado, subtitulos, inicio, niveles, llamar, colgar, silenciar } = useLlamada(urlOferta);
  const [verTexto, setVerTexto] = useState(true);
  const finTexto = useRef(null);
  const alCambiar = useRef(onEstado);
  useEffect(() => {
    alCambiar.current = onEstado;
  }, [onEstado]);
  useEffect(() => {
    alCambiar.current?.(estado);
  }, [estado]);
  useEffect(() => {
    finTexto.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [subtitulos]);

  const enCurso = estado === "conectando" || estado === "en_llamada";
  const linea =
    estado === "conectando" ? "Conectando…" : estado === "en_llamada" ? (silenciado ? "Micrófono silenciado" : <Reloj inicio={inicio} />) : estado === "terminada" ? "Llamada finalizada" : estado === "error" ? "No se pudo llamar" : "Tocá el botón y hablale como a una persona";

  return (
    <div className={`w-full flex flex-col items-center ${compacta ? "gap-4" : "gap-6"}`}>
      <div className="text-center">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">{nombre}</h2>
        <p className="text-sm text-zinc-400 mt-0.5">{subtitulo}</p>
      </div>

      <Orbe niveles={niveles} estado={estado} />

      <p className={`text-sm h-5 ${estado === "error" ? "text-red-400" : "text-zinc-300"}`} aria-live="polite">{linea}</p>

      {error && <p role="alert" className="max-w-sm text-center text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 -mt-3">{error}</p>}

      <div className="flex items-center gap-5">
        {enCurso ? (
          <>
            <BotonRedondo onClick={silenciar} titulo={silenciado ? "Activar micrófono" : "Silenciar micrófono"} color={silenciado ? "blanco" : "zinc"} disabled={estado !== "en_llamada"}>
              {silenciado ? <MicOff size={22} /> : <Mic size={22} />}
            </BotonRedondo>
            <BotonRedondo onClick={colgar} titulo="Cortar" color="rojo" grande>
              <PhoneOff size={28} />
            </BotonRedondo>
            <div className="w-14 h-14 flex items-center justify-center">{estado === "conectando" && <Loader2 size={22} className="animate-spin text-zinc-500" />}</div>
          </>
        ) : (
          <BotonRedondo onClick={llamar} titulo={estado === "lista" ? `Llamar a ${nombre}` : "Volver a llamar"} color="verde" grande>
            {estado === "lista" ? <Phone size={28} /> : <RotateCcw size={26} />}
          </BotonRedondo>
        )}
      </div>

      {subtitulos.length > 0 && (
        <div className="w-full max-w-md">
          <button type="button" onClick={() => setVerTexto((v) => !v)} className="text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer mx-auto block mb-2">
            {verTexto ? "Ocultar lo que se dice" : "Ver lo que se dice"}
          </button>
          {verTexto && (
            <div className="max-h-48 overflow-y-auto space-y-2 px-1 [mask-image:linear-gradient(to_bottom,transparent,black_24px)] pt-4">
              {subtitulos.map((s) => (
                <div key={s.id} className={`flex ${s.rol === "bot" ? "justify-start" : "justify-end"}`}>
                  <p className={`text-sm leading-snug rounded-2xl px-3.5 py-2 max-w-[85%] ${s.rol === "bot" ? "bg-zinc-800/80 text-zinc-100 rounded-bl-md" : "bg-[#FF5A00]/15 text-orange-100 rounded-br-md"}`}>{s.texto}</p>
                </div>
              ))}
              <div ref={finTexto} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
