import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, ChevronDown, ChevronUp, History, Loader2, MessageCircle, ScanSearch, Volume2, VolumeX } from "lucide-react";
import { api } from "../produccion/util";
import { useToast } from "../produccion/useToast";
import EscenaLia from "./EscenaLia";
import ChatLia from "./ChatLia";
import Avisos from "./Avisos";
import Actividad from "./Actividad";
import EstadoActual from "./EstadoActual";
import { cuando } from "./formato";
import { propuestasDesde, saludoSegunHora } from "./propuestas";
import { dictar, prepararVoz, reproducirVoz, soportaDictado, textoParaVoz } from "./voz";
import { getApiUrl } from "../apiConfig";

const CLAVE_CHAT = "lia_chat_v2";
const CLAVE_VOZ = "lia_voz_v1";
const CLAVE_ESCENA = "lia_escena_v1";
const leerChat = () => {
  try {
    const g = JSON.parse(sessionStorage.getItem(CLAVE_CHAT) || "null");
    if (Array.isArray(g)) return g;
  } catch {
    /* sin almacenamiento */
  }
  return [];
};
const leerFlag = (clave, defecto) => {
  try {
    const v = localStorage.getItem(clave);
    return v === null ? defecto : v === "1";
  } catch {
    return defecto;
  }
};
const guardarFlag = (clave, v) => {
  try {
    localStorage.setItem(clave, v ? "1" : "0");
  } catch {
    /* sin almacenamiento */
  }
};

export default function LiaPantalla({ agente, usuario }) {
  const base = `/api/agentes/${agente.id}`;
  const { mostrar, nodo } = useToast();
  const [mensajes, setMensajes] = useState(leerChat);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [escribiendo, setEscribiendo] = useState(false);
  const [manos, setManos] = useState(false);
  const [notaVoz, setNotaVoz] = useState("");
  const [dicho, setDicho] = useState("");
  const [dictando, setDictando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [hablando, setHablando] = useState(false);
  const [vozActiva, setVozActiva] = useState(() => leerFlag(CLAVE_VOZ, false));
  const [escenaVisible, setEscenaVisible] = useState(() => leerFlag(CLAVE_ESCENA, true));
  const [tab, setTab] = useState("chat");
  const [estado, setEstado] = useState(null);
  const [hallazgos, setHallazgos] = useState([]);
  const [version, setVersion] = useState(0);
  const [revisando, setRevisando] = useState(false);
  const [actividad, setActividad] = useState("");
  const escena = useRef(null);
  const timers = useRef({ escribir: null, hablar: null, nota: null });
  const lectura = useRef(null);
  const dictado = useRef(null);
  const turno = useRef(0); // sube cada vez que el usuario corta o manda algo nuevo: lo que llega tarde se descarta
  const manosRef = useRef({ activo: false, fallos: 0, timer: null });
  const enviarRef = useRef(null);
  const msgsRef = useRef(mensajes);

  useEffect(() => {
    msgsRef.current = mensajes;
    try {
      sessionStorage.setItem(CLAVE_CHAT, JSON.stringify(mensajes.slice(-60)));
    } catch {
      /* sin almacenamiento */
    }
  }, [mensajes]);

  useEffect(() => {
    let vivo = true;
    const cargar = () => {
      api(`${base}/estado`).then((r) => vivo && setEstado(r)).catch(() => {});
      api(`${base}/hallazgos`).then((r) => vivo && setHallazgos(r)).catch(() => {});
    };
    cargar();
    const id = setInterval(cargar, 60000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [base, version]);

  useEffect(() => {
    const t = timers.current;
    return () => {
      clearTimeout(t.escribir);
      clearTimeout(t.hablar);
      clearTimeout(t.nota);
      clearTimeout(manosRef.current.timer);
      manosRef.current.activo = false;
      lectura.current?.cortar();
      dictado.current?.parar();
    };
  }, []);

  const alEscribir = (v) => {
    setTexto(v);
    setEscribiendo(true);
    clearTimeout(timers.current.escribir);
    timers.current.escribir = setTimeout(() => setEscribiendo(false), 2200);
  };

  const cortarLectura = () => {
    turno.current++;
    lectura.current?.cortar();
    lectura.current = null;
    clearTimeout(timers.current.hablar);
    setHablando(false);
  };

  const empezarAHablar = (resp, prep) => {
    setDicho(textoParaVoz(resp));
    if (prep) {
      lectura.current = reproducirVoz(prep, textoParaVoz(resp), {
        onInicio: () => setHablando(true),
        onFin: () => {
          setHablando(false);
          escena.current?.nivel(-1);
        },
        onPulso: () => escena.current?.pulso(),
        onNivel: (n) => escena.current?.nivel(n),
        onSinVoz: () => {
          setNotaVoz("Sin audio esta vez: te lo dejé por escrito.");
          clearTimeout(timers.current.nota);
          timers.current.nota = setTimeout(() => setNotaVoz(""), 5000);
        },
      });
    } else {
      setHablando(true);
      timers.current.hablar = setTimeout(() => setHablando(false), Math.min(9000, 1500 + resp.length * 28));
    }
  };

  const enviar = async (forzado, porVoz = false) => {
    const t = (typeof forzado === "string" ? forzado : texto).trim();
    if (!t || enviando) return;
    cortarLectura();
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
      // Con voz: se prepara el audio mientras Lía "piensa" para que texto, voz y animación lleguen juntos.
      // Como la voz es solo una introducción, suele estar lista enseguida; si tarda más de 3,5 s, no se hace esperar.
      const resp = data.respuesta || "";
      const mi = turno.current;
      const conVoz = porVoz || vozActiva || manosRef.current.activo;
      const promesa = conVoz ? prepararVoz(textoParaVoz(resp), { base }) : null;
      const prep = promesa ? await Promise.race([promesa, new Promise((r) => setTimeout(() => r(null), 3500))]) : null;
      if (turno.current !== mi) return;
      setMensajes([...nuevos, { rol: "assistant", texto: resp, herramientas: data.herramientas || [] }]);
      if (promesa && !prep) {
        empezarAHablar(resp, null);
        promesa.then((p) => {
          if (turno.current !== mi) return;
          clearTimeout(timers.current.hablar);
          empezarAHablar(resp, p);
        });
      } else empezarAHablar(resp, prep);
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
    cortarLectura();
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

  // ---------- manos libres: escucha → responde en voz alta → vuelve a escuchar ----------
  const terminarManos = (aviso) => {
    manosRef.current.activo = false;
    clearTimeout(manosRef.current.timer);
    setManos(false);
    dictado.current?.parar();
    if (aviso) setAviso(aviso);
  };
  const alternarManos = () => {
    if (manosRef.current.activo) {
      terminarManos();
      cortarLectura();
      return;
    }
    cortarLectura();
    setAviso("");
    manosRef.current = { activo: true, fallos: 0, timer: null };
    setManos(true);
  };
  const escucharManos = () => {
    setDictando(true);
    dictado.current = dictar({
      onTexto: (v) => setTexto(v),
      onFin: (err, ultimo) => {
        setDictando(false);
        if (!manosRef.current.activo) return;
        if (err === "not-allowed" || err === "service-not-allowed") return terminarManos("Tenés que permitir el micrófono en el navegador para usar el manos libres.");
        if (ultimo) {
          manosRef.current.fallos = 0;
          if (/^\s*(chau|chao|listo|terminar|terminá|salir|gracias,? l[ií]a|pará|parar|basta)\b/i.test(ultimo)) {
            setTexto("");
            return terminarManos("Listo, terminé el manos libres.");
          }
          enviarRef.current?.(ultimo, true);
        } else if (++manosRef.current.fallos >= 4) terminarManos("Pausé el manos libres porque no te escuché. Tocá el botón para retomarlo.");
      },
    });
  };
  // Mientras el manos libres está activo y nadie habla ni piensa, vuelve a abrir el micrófono.
  useEffect(() => {
    if (!manos || enviando || hablando || dictando) return undefined;
    clearTimeout(manosRef.current.timer);
    manosRef.current.timer = setTimeout(() => manosRef.current.activo && escucharManos(), 500);
    return () => clearTimeout(manosRef.current.timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manos, enviando, hablando, dictando]);

  const descargarPdf = async (args) => {
    try {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(args || {})) qs.set(k, Array.isArray(v) ? v.join(",") : v === true ? "1" : String(v));
      const res = await fetch(getApiUrl(`${base}/liquidacion.pdf?${qs}`));
      if (!res.ok) {
        let msg = "No pude armar el PDF.";
        try { msg = (await res.json()).error || msg; } catch { /* sin cuerpo */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const nombre = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || "liquidacion.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      mostrar("PDF descargado.");
    } catch (e) {
      mostrar(e.message, "error");
    }
  };

  const alternarVoz = () => {
    const nueva = !vozActiva;
    setVozActiva(nueva);
    guardarFlag(CLAVE_VOZ, nueva);
    if (!nueva) cortarLectura();
  };
  const alternarEscena = () => {
    const nueva = !escenaVisible;
    setEscenaVisible(nueva);
    guardarFlag(CLAVE_ESCENA, nueva);
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

  const alPropuesta = (p) => {
    if (p.abrirAvisos) setTab("avisos");
    else enviar(p.pregunta);
  };

  const estadoEscena = enviando ? "thinking" : hablando ? "speaking" : escribiendo || dictando ? "listening" : "idle";
  const subtitulo = hablando ? dicho.slice(0, 190) + (dicho.length > 190 ? "…" : "") : "";
  const abiertos = estado?.abiertos ?? agente.abiertos ?? 0;
  const feriadoAviso = hallazgos.find((h) => h.tipo === "FERIADO")?.titulo || "";
  const altas = estado?.altas || 0;
  const operarios = estado?.operarios_revisados || 0;
  const feriado = /el (\S+ \d+\/\d+)/.exec(feriadoAviso)?.[1] || "";
  const infoEscena = useMemo(() => ({ abiertos, altas, operarios, feriado }), [abiertos, altas, operarios, feriado]);
  const resumen = estado?.ultima_revision
    ? abiertos > 0
      ? `Revisé las fichadas de ${estado.operarios_revisados ?? "todos los"} operarios y hay ${abiertos} ${abiertos === 1 ? "aviso abierto" : "avisos abiertos"}${estado.altas ? `, ${estado.altas} urgente${estado.altas === 1 ? "" : "s"}` : ""}. Esto es lo que atendería primero:`
      : "Revisé todo y no hay nada pendiente. Podés pedirme una liquidación o preguntarme lo que necesites."
    : "Todavía no hice mi primera revisión. Podés pedirme que revise ahora o preguntarme lo que necesites.";
  const propuestas = propuestasDesde(hallazgos);

  const TABS = [
    { id: "chat", texto: "Chat", icono: MessageCircle },
    { id: "avisos", texto: "Avisos", icono: Bell, n: abiertos },
    { id: "actividad", texto: "Actividad", icono: History },
  ];

  const botonesEscena = (
    <>
      <button
        onClick={revisar}
        disabled={revisando}
        aria-label="Revisar ahora"
        className="h-10 px-3 rounded-xl bg-black/55 backdrop-blur-md border border-white/10 text-[12.5px] font-bold text-white hover:border-[#FF5A00]/70 disabled:opacity-60 inline-flex items-center gap-1.5"
      >
        {revisando ? <Loader2 size={15} className="animate-spin" /> : <ScanSearch size={15} />}
        <span className="hidden sm:inline">{revisando ? "Revisando…" : "Revisar"}</span>
      </button>
      <button
        onClick={alternarVoz}
        aria-pressed={vozActiva}
        aria-label={vozActiva ? "Silenciar la voz de Lía" : "Activar la voz de Lía"}
        className={`h-10 px-3 rounded-xl backdrop-blur-md border text-[12.5px] font-bold inline-flex items-center gap-1.5 ${vozActiva ? "bg-[#FF5A00] border-[#FF5A00] text-black" : "bg-black/55 border-white/10 text-zinc-200 hover:border-white/30"}`}
      >
        {vozActiva ? <Volume2 size={15} /> : <VolumeX size={15} />}
        <span className="hidden sm:inline">{vozActiva ? "Con voz" : "Sin voz"}</span>
      </button>
    </>
  );

  return (
    <div className="h-full min-h-0 flex flex-col lg:flex-row bg-[#0a0a0c] text-zinc-200 overflow-hidden">
      {/* ESCENA: acotada, el espacio que sobra lo gana el chat */}
      <aside className="order-1 lg:order-2 shrink-0 flex flex-col lg:w-[clamp(340px,30vw,440px)] border-b lg:border-b-0 lg:border-l border-white/[0.06] bg-[#0b0b0e] lg:overflow-y-auto custom-scrollbar">
        {!escenaVisible && (
          <div className="lg:hidden flex items-center gap-3 px-3 h-14">
            <span className="w-9 h-9 shrink-0 rounded-xl bg-[#FF5A00] grid place-items-center text-black font-black shadow-[0_3px_0_#b33f00]">L</span>
            <EstadoActual texto={actividad} compacto className="flex-1" />
            <button onClick={alternarEscena} aria-label="Mostrar a Lía" className="w-10 h-10 grid place-items-center rounded-xl bg-white/[0.07] text-zinc-200"><ChevronDown size={18} /></button>
          </div>
        )}
        <div className={`relative shrink-0 overflow-hidden lg:block lg:h-[clamp(340px,52vh,470px)] lg:min-h-0 lg:max-h-none ${escenaVisible ? "block h-[30vh] min-h-[190px] max-h-[270px]" : "hidden"}`}>
          <EscenaLia ref={escena} estado={estadoEscena} hablando={hablando} info={infoEscena} onActividad={setActividad} />
          <div className="absolute top-2.5 left-2.5 right-2.5 flex items-start justify-between gap-2 pointer-events-none">
            <div className="pointer-events-auto hidden sm:block rounded-xl bg-black/55 backdrop-blur-md border border-white/10 px-3 py-1.5">
              <h2 className="text-[15px] font-black text-white leading-none">{agente.nombre}</h2>
              <p className="mt-0.5 text-[11px] font-semibold text-[#ff8a4d] leading-tight">{agente.puesto}</p>
            </div>
            <div className="pointer-events-auto flex gap-1.5">
              {botonesEscena}
              <button onClick={alternarEscena} aria-label="Ocultar a Lía" className="lg:hidden h-10 w-10 grid place-items-center rounded-xl bg-black/55 backdrop-blur-md border border-white/10 text-zinc-200"><ChevronUp size={17} /></button>
            </div>
          </div>
          <div className="absolute bottom-2.5 left-2.5 right-2.5 flex flex-col items-center gap-1.5 pointer-events-none">
            {notaVoz && <div className="rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-zinc-300 text-[12px] px-3 py-1.5 cf-msg">{notaVoz}</div>}
            {subtitulo && <div className="max-w-[520px] rounded-2xl rounded-bl-md bg-white text-zinc-900 text-[13px] font-semibold leading-snug px-3.5 py-2 shadow-xl cf-msg">{subtitulo}</div>}
          </div>
        </div>

        {escenaVisible && (
          <div className="lg:hidden shrink-0 px-3 py-2 border-t border-white/[0.06] bg-[#0b0b0e]"><EstadoActual texto={actividad} compacto /></div>
        )}

        {/* Tarjetas bajo la escena (escritorio) */}
        <div className="hidden lg:flex flex-col gap-2.5 p-3">
          <div className="rounded-2xl border border-white/[0.08] bg-[#111116] p-3.5">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-zinc-500 mb-1.5">Estado actual</p>
            <EstadoActual texto={actividad} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-white/[0.08] bg-[#111116] p-3.5">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-zinc-500">Última revisión</p>
              <p className="mt-1 text-[15px] font-extrabold text-white">{estado?.ultima_revision ? cuando(estado.ultima_revision) : "—"}</p>
              <p className="text-[11.5px] text-zinc-500">{estado?.operarios_revisados ? `${estado.operarios_revisados} operarios` : "sin datos aún"}</p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-[#111116] p-3.5">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-zinc-500">Avisos abiertos</p>
              <p className={`mt-1 text-[22px] leading-none font-black ${estado?.altas ? "text-rose-400" : abiertos ? "text-[#FFD60A]" : "text-emerald-400"}`}>{abiertos}</p>
              <p className="mt-1 text-[11.5px] text-zinc-500">{estado?.altas ? `${estado.altas} urgente${estado.altas === 1 ? "" : "s"}` : "ninguno urgente"}</p>
            </div>
          </div>
          {estado?.ultima_accion && (
            <div className="rounded-2xl border border-white/[0.08] bg-[#111116] p-3.5">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-zinc-500 mb-1">Última acción · {cuando(estado.ultima_accion.created_at)}</p>
              <p className="text-[13.5px] text-zinc-200 leading-snug">{estado.ultima_accion.titulo}</p>
            </div>
          )}
        </div>
      </aside>

      {/* CONVERSACIÓN */}
      <section className="order-2 lg:order-1 flex-1 min-h-0 min-w-0 flex flex-col bg-[#0c0c0f]">
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
              saludo={saludoSegunHora(usuario?.nombre)}
              resumen={resumen}
              propuestas={propuestas}
              onPropuesta={alPropuesta}
              manos={manos}
              onManos={alternarManos}
              onPdf={descargarPdf}
              hablando={hablando}
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
