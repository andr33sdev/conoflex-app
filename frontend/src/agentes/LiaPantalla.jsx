import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, History, Loader2, MessageCircle, ScanSearch, Volume2, VolumeX } from "lucide-react";
import { api } from "../produccion/util";
import { useToast } from "../produccion/useToast";
import EscenaLia from "./EscenaLia";
import ChatLia from "./ChatLia";
import Avisos from "./Avisos";
import Actividad from "./Actividad";
import { cuando } from "./formato";
import { cortarVoz, dictar, hablar, soportaDictado, soportaLectura, textoParaVoz } from "./voz";

const SALUDO = {
  rol: "assistant",
  texto: "¡Hola! Soy Lía, de RRHH. Me ocupo de las liquidaciones: horas, extras, presentismo y feriados. Preguntame lo que necesites o pedime que liquide un período.",
};
const CLAVE_CHAT = "lia_chat_v1";
const CLAVE_VOZ = "lia_voz_v1";
const leerChat = () => {
  try {
    const g = JSON.parse(sessionStorage.getItem(CLAVE_CHAT) || "null");
    if (Array.isArray(g) && g.length) return g;
  } catch {
    /* sin almacenamiento */
  }
  return [SALUDO];
};
const leerVoz = () => {
  try {
    return localStorage.getItem(CLAVE_VOZ) === "1";
  } catch {
    return false;
  }
};

export default function LiaPantalla({ agente }) {
  const base = `/api/agentes/${agente.id}`;
  const { mostrar, nodo } = useToast();
  const [mensajes, setMensajes] = useState(leerChat);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [escribiendo, setEscribiendo] = useState(false);
  const [dictando, setDictando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [hablando, setHablando] = useState(false);
  const [vozActiva, setVozActiva] = useState(leerVoz);
  const [tab, setTab] = useState("chat");
  const [estado, setEstado] = useState(null);
  const [version, setVersion] = useState(0);
  const [revisando, setRevisando] = useState(false);
  const escena = useRef(null);
  const timers = useRef({ escribir: null, hablar: null });
  const cortarLectura = useRef(() => {});
  const dictado = useRef(null);
  const enviarRef = useRef(null);
  const msgsRef = useRef(mensajes);

  useEffect(() => {
    msgsRef.current = mensajes;
    try {
      sessionStorage.setItem(CLAVE_CHAT, JSON.stringify(mensajes));
    } catch {
      /* sin almacenamiento */
    }
  }, [mensajes]);

  const cargarEstado = useCallback(() => api(`${base}/estado`).then(setEstado).catch(() => {}), [base]);
  useEffect(() => {
    cargarEstado();
    const id = setInterval(cargarEstado, 60000);
    return () => clearInterval(id);
  }, [cargarEstado, version]);

  useEffect(() => {
    const t = timers.current;
    return () => {
      clearTimeout(t.escribir);
      clearTimeout(t.hablar);
      cortarVoz();
      dictado.current?.parar();
    };
  }, []);

  const alEscribir = (v) => {
    setTexto(v);
    setEscribiendo(true);
    clearTimeout(timers.current.escribir);
    timers.current.escribir = setTimeout(() => setEscribiendo(false), 2200);
  };

  const empezarAHablar = (resp, porVoz) => {
    clearTimeout(timers.current.hablar);
    cortarLectura.current();
    if ((porVoz || vozActiva) && soportaLectura()) {
      cortarLectura.current = hablar(textoParaVoz(resp), {
        onInicio: () => setHablando(true),
        onFin: () => setHablando(false),
        onPulso: () => escena.current?.pulso(),
      });
    } else {
      setHablando(true);
      timers.current.hablar = setTimeout(() => setHablando(false), Math.min(9000, 1500 + resp.length * 28));
    }
  };

  const enviar = async (forzado, porVoz = false) => {
    const t = (typeof forzado === "string" ? forzado : texto).trim();
    if (!t || enviando) return;
    cortarLectura.current();
    setHablando(false);
    clearTimeout(timers.current.hablar);
    const nuevos = [...msgsRef.current, { rol: "user", texto: t }];
    setMensajes(nuevos);
    setTexto("");
    setEscribiendo(false);
    setTab("chat");
    setEnviando(true);
    try {
      const data = await api(`${base}/chat`, {
        method: "POST",
        body: { mensaje: t, historial: nuevos.slice(-20).map(({ rol, texto: x }) => ({ rol, texto: x })) },
      });
      setMensajes([...nuevos, { rol: "assistant", texto: data.respuesta, herramientas: data.herramientas || [] }]);
      empezarAHablar(data.respuesta || "", porVoz);
      setVersion((v) => v + 1);
    } catch (e) {
      setMensajes([...nuevos, { rol: "assistant", texto: `No pude responderte: ${e.message}` }]);
    } finally {
      setEnviando(false);
    }
  };
  useEffect(() => {
    enviarRef.current = enviar;
  });

  const alternarDictado = () => {
    if (dictando) {
      dictado.current?.parar();
      return;
    }
    cortarLectura.current();
    setHablando(false);
    setAviso("");
    setDictando(true);
    dictado.current = dictar({
      onTexto: (v) => setTexto(v),
      onFin: (err, ultimo) => {
        setDictando(false);
        if (ultimo) enviarRef.current?.(ultimo, true);
        else if (err === "not-allowed" || err === "service-not-allowed") setAviso("Tenés que permitir el micrófono en el navegador para hablarle a Lía.");
        else if (err === "no-speech") setAviso("No te escuché. Probá de nuevo acercándote al micrófono.");
        else if (err) setAviso("No pude usar el micrófono en este navegador. Escribile y listo.");
      },
    });
  };

  const alternarVoz = () => {
    const nueva = !vozActiva;
    setVozActiva(nueva);
    try {
      localStorage.setItem(CLAVE_VOZ, nueva ? "1" : "0");
    } catch {
      /* sin almacenamiento */
    }
    if (!nueva) {
      cortarLectura.current();
      setHablando(false);
    }
  };

  const revisar = async () => {
    if (revisando) return;
    setRevisando(true);
    try {
      const r = await api(`${base}/revisar`, { method: "POST" });
      mostrar(r.resumen || "Revisión lista.");
      setVersion((v) => v + 1);
    } catch (e) {
      mostrar(e.message, "error");
    } finally {
      setRevisando(false);
    }
  };

  const estadoEscena = enviando ? "thinking" : hablando ? "speaking" : escribiendo || dictando ? "listening" : "idle";
  const ultimoDicho = [...mensajes].reverse().find((m) => m.rol === "assistant")?.texto || "";
  const subtitulo = hablando ? ultimoDicho.replace(/[*_`#]/g, "").slice(0, 150) + (ultimoDicho.length > 150 ? "…" : "") : "";
  const abiertos = estado?.abiertos ?? agente.abiertos ?? 0;

  const TABS = [
    { id: "chat", texto: "Chat", icono: MessageCircle },
    { id: "avisos", texto: "Avisos", icono: Bell, n: abiertos },
    { id: "actividad", texto: "Actividad", icono: History },
  ];

  return (
    <div className="h-full min-h-0 flex flex-col lg:flex-row bg-[#0a0a0c] text-zinc-200 overflow-hidden">
      {/* ESCENA */}
      <section className="relative shrink-0 h-[40vh] min-h-[250px] max-h-[430px] lg:h-auto lg:max-h-none lg:flex-1 lg:min-h-0 overflow-hidden border-b lg:border-b-0 lg:border-r border-white/[0.06]">
        <EscenaLia ref={escena} estado={estadoEscena} hablando={hablando} info={{ abiertos, altas: estado?.altas || 0 }} />

        <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 pointer-events-none">
          <div className="pointer-events-auto rounded-2xl bg-black/55 backdrop-blur-md border border-white/10 px-3.5 py-2.5 max-w-[68%]">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>
              <h2 className="text-lg font-black text-white leading-none">{agente.nombre}</h2>
            </div>
            <p className="mt-1 text-[12px] font-semibold text-[#ff8a4d] leading-tight">{agente.puesto}</p>
            <p className="mt-1.5 text-[11.5px] text-zinc-400 leading-snug">
              {estado?.ultima_revision ? `Última revisión: ${cuando(estado.ultima_revision)}` : "Todavía no hizo su primera revisión"}
            </p>
          </div>
          <div className="pointer-events-auto flex flex-col gap-2">
            <button
              onClick={revisar}
              disabled={revisando}
              className="h-11 px-3.5 rounded-2xl bg-black/55 backdrop-blur-md border border-white/10 text-[13px] font-bold text-white hover:border-[#FF5A00]/70 disabled:opacity-60 inline-flex items-center gap-2"
            >
              {revisando ? <Loader2 size={16} className="animate-spin" /> : <ScanSearch size={16} />}
              <span className="hidden sm:inline">{revisando ? "Revisando…" : "Revisar ahora"}</span>
            </button>
            {soportaLectura() && (
              <button
                onClick={alternarVoz}
                aria-pressed={vozActiva}
                aria-label={vozActiva ? "Silenciar la voz de Lía" : "Activar la voz de Lía"}
                className={`h-11 px-3.5 rounded-2xl backdrop-blur-md border text-[13px] font-bold inline-flex items-center gap-2 ${vozActiva ? "bg-[#FF5A00] border-[#FF5A00] text-black" : "bg-black/55 border-white/10 text-zinc-200 hover:border-white/30"}`}
              >
                {vozActiva ? <Volume2 size={16} /> : <VolumeX size={16} />}
                <span className="hidden sm:inline">{vozActiva ? "Voz activada" : "Voz silenciada"}</span>
              </button>
            )}
          </div>
        </div>

        <div className="absolute bottom-3 left-3 right-3 flex flex-col items-center gap-2 pointer-events-none">
          {subtitulo && (
            <div className="max-w-[560px] rounded-2xl rounded-bl-md bg-white text-zinc-900 text-[13.5px] font-semibold leading-snug px-4 py-2.5 shadow-xl cf-msg">{subtitulo}</div>
          )}
          {!subtitulo && enviando && (
            <div className="rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-xs font-bold text-zinc-200 px-3.5 py-1.5">Lía está pensando…</div>
          )}
          {!subtitulo && !enviando && (escribiendo || dictando) && (
            <div className="rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-xs font-bold text-zinc-200 px-3.5 py-1.5">{dictando ? "Te escucho…" : "Lía te está escuchando…"}</div>
          )}
          {!subtitulo && !enviando && !escribiendo && !dictando && estado?.ultima_accion && (
            <div className="max-w-full rounded-full bg-black/55 backdrop-blur-md border border-white/10 text-[11.5px] text-zinc-300 px-3.5 py-1.5 truncate">
              <span className="font-bold text-zinc-100">Última acción · {cuando(estado.ultima_accion.created_at)}:</span> {estado.ultima_accion.titulo}
            </div>
          )}
        </div>
      </section>

      {/* PANEL */}
      <section className="flex-1 min-h-0 min-w-0 flex flex-col lg:flex-none lg:w-[460px] xl:w-[520px] bg-[#0c0c0f]">
        <div role="tablist" className="shrink-0 flex gap-1 p-2 border-b border-white/[0.06]">
          {TABS.map((t) => {
            const Icono = t.icono;
            const activo = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={activo}
                onClick={() => setTab(t.id)}
                className={`flex-1 min-h-[44px] rounded-xl text-[13.5px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${activo ? "bg-white/[0.09] text-white" : "text-zinc-500 hover:text-zinc-200"}`}
              >
                <Icono size={16} className={activo ? "text-[#FF5A00]" : ""} />
                {t.texto}
                {t.n > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#FF5A00] text-black text-[11px] font-black grid place-items-center">{t.n}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex-1 min-h-0">
          {tab === "chat" && (
            <ChatLia
              mensajes={mensajes}
              enviando={enviando}
              texto={texto}
              onTexto={alEscribir}
              onEnviar={enviar}
              dictando={dictando}
              onDictado={alternarDictado}
              puedeDictar={soportaDictado()}
              estadoDictado={aviso}
            />
          )}
          {tab === "avisos" && (
            <div className="h-full overflow-y-auto custom-scrollbar">
              <Avisos agenteId={agente.id} version={version} alCambiar={() => setVersion((v) => v + 1)} mostrar={mostrar} />
            </div>
          )}
          {tab === "actividad" && (
            <div className="h-full overflow-y-auto custom-scrollbar">
              <Actividad agenteId={agente.id} version={version} />
            </div>
          )}
        </div>
      </section>
      {nodo}
    </div>
  );
}
