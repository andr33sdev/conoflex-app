import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bell, FileDown, History, LayoutGrid, ClipboardList, Loader2, MessageCircle, ScanSearch, Volume2, VolumeX } from "lucide-react";
import { api } from "../produccion/util";
import { useToast } from "../produccion/useToast";
import Chat from "./Chat";
import Avisos from "./Avisos";
import Actividad from "./Actividad";
import { cuando, saludoSegunHora } from "./formato";
import { perfilDe } from "./perfiles";
import { estadoDe, useSlotEstado } from "./estados";
import { Avatar8 } from "./pixel";
import Panorama from "./Panorama";
import PanoramaCompras from "./PanoramaCompras";
import { dictar, fijarVozAgente, prepararVoz, reproducirVoz, soportaDictado, textoParaVoz } from "./voz";
import { getApiUrl } from "../apiConfig";

const leerChat = (clave) => {
  try {
    const g = JSON.parse(sessionStorage.getItem(clave) || "null");
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

const tituloDe = (texto, defecto) => {
  const h = /^\s*#{1,3}\s+(.+)$/m.exec(String(texto || ""));
  return (h ? h[1].replace(/[*_`]/g, "").trim() : defecto).slice(0, 100) || defecto;
};

export default function Pantalla({ agente, usuario, pregunta, onPreguntaUsada, onDerivar, onModo, onAbiertos, onVolver }) {
  const perfil = perfilDe(agente.id);
  const CLAVE_CHAT = perfil.claves.chat;
  const CLAVE_VOZ = perfil.claves.voz;
  const base = `/api/agentes/${agente.id}`;
  const { mostrar, nodo } = useToast();
  const [mensajes, setMensajes] = useState(() => leerChat(CLAVE_CHAT));
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [escribiendo, setEscribiendo] = useState(false);
  const [manos, setManos] = useState(false);
  const [notaVoz, setNotaVoz] = useState("");
  const [dictando, setDictando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [hablando, setHablando] = useState(false);
  const [vozActiva, setVozActiva] = useState(() => leerFlag(CLAVE_VOZ, false));
  const [tab, setTab] = useState("chat");
  const [estado, setEstado] = useState(null);
  const [version, setVersion] = useState(0);
  const [revisando, setRevisando] = useState(false);
  const [pano, setPano] = useState(null);
  const [errPano, setErrPano] = useState("");
  const reporteAuto = useRef(false); // el próximo texto que llegue se baja directo como PDF
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensajes]);

  useEffect(() => {
    let vivo = true;
    const cargar = () => {
      api(`${base}/estado`).then((r) => vivo && setEstado(r)).catch(() => {});
      if (perfil.panorama) api(`${base}/panorama`).then((r) => vivo && (setPano(r), setErrPano(""))).catch((e) => vivo && setErrPano(e.message));
    };
    cargar();
    const id = setInterval(cargar, 60000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [base, version, perfil.panorama]);

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

  const descargarReporte = async (textoPdf, titulo) => {
    try {
      const res = await fetch(getApiUrl(`${base}/reporte.pdf`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo, texto: textoPdf }) });
      if (!res.ok) {
        let msg = "No pude armar el PDF.";
        try { msg = (await res.json()).error || msg; } catch { /* sin cuerpo */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const nombre = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || "reporte.pdf";
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
    if (prep) {
      lectura.current = reproducirVoz(prep, textoParaVoz(resp), {
        onInicio: () => setHablando(true),
        onFin: () => {
          setHablando(false);
        },
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
      setMensajes([...nuevos, { rol: "assistant", texto: resp, herramientas: data.herramientas || [], derivacion: data.derivacion || null }]);
      if (promesa && !prep) {
        empezarAHablar(resp, null);
        promesa.then((p) => {
          if (turno.current !== mi) return;
          clearTimeout(timers.current.hablar);
          empezarAHablar(resp, p);
        });
      } else empezarAHablar(resp, prep);
      setVersion((v) => v + 1);
      if (reporteAuto.current) {
        reporteAuto.current = false;
        descargarReporte(resp, tituloDe(resp, `Reporte de ${perfil.nombre}`));
      }
    } catch (e) {
      reporteAuto.current = false;
      setMensajes([...nuevos, { rol: "assistant", texto: `No pude responderte: ${e.message}`, error: true }]);
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
        else if (err === "not-allowed" || err === "service-not-allowed") setAviso(`Tenés que permitir el micrófono en el navegador para hablarle a ${perfil.nombre}.`);
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
    // Se abre el micrófono ya, dentro del toque (Safari/iOS y algunos Chrome lo exigen) y no recién medio segundo después.
    escucharManos();
  };
  const escucharManos = () => {
    if (manosRef.current.escuchando) return;
    manosRef.current.escuchando = true;
    setDictando(true);
    dictado.current = dictar({
      onTexto: (v) => setTexto(v),
      onFin: (err, ultimo) => {
        manosRef.current.escuchando = false;
        setDictando(false);
        if (!manosRef.current.activo) return;
        if (err === "not-allowed" || err === "service-not-allowed") return terminarManos("Tenés que permitir el micrófono en el navegador para usar el manos libres.");
        if (err === "audio-capture") return terminarManos("No encuentro un micrófono disponible. Revisá que esté conectado y que ninguna otra aplicación lo esté usando.");
        if (err === "network") return terminarManos("El reconocimiento de voz del navegador no pudo conectarse a internet. Probá de nuevo o escribile.");
        if (err === "language-not-supported" || err === "no-soportado") return terminarManos("Este navegador no puede reconocer la voz. Usá Chrome o Edge, o escribile.");
        if (ultimo) {
          manosRef.current.fallos = 0;
          if (/^\s*(chau|chao|listo|terminar|terminá|salir|gracias|pará|parar|basta)\b/i.test(ultimo)) {
            setTexto("");
            return terminarManos("Listo, terminé el manos libres.");
          }
          enviarRef.current?.(ultimo, true);
        } else if (++manosRef.current.fallos >= 4) terminarManos("Pausé el manos libres porque no te escuché. Revisá que el micrófono correcto esté elegido en el navegador y tocá el botón para retomarlo.");
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

  const alPropuesta2 = (q) => {
    setTab("chat");
    enviar(q);
  };

  const pedirReporte = () => {
    if (enviando) return;
    reporteAuto.current = true;
    setTab("chat");
    enviar(perfil.reporte);
  };

  useEffect(() => {
    fijarVozAgente(perfil.voz);
  }, [perfil]);

  // Pregunta que llega derivada desde otro agente: se envía sola apenas esta pantalla está lista.
  useEffect(() => {
    if (!pregunta) return;
    onPreguntaUsada?.();
    enviarRef.current?.(pregunta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pregunta]);

  const modo = revisando ? "revisando" : enviando ? "pensando" : hablando ? "hablando" : escribiendo || dictando ? "escuchando" : "idle";
  const abiertos = estado?.abiertos ?? agente.abiertos ?? 0;
  useSlotEstado();
  const actual = estadoDe(agente.id, perfil.nombre, { modo, abiertos });
  useEffect(() => {
    onModo?.(modo);
  }, [modo, onModo]);
  useEffect(() => {
    onAbiertos?.(abiertos);
  }, [abiertos, onAbiertos]);
  useEffect(() => () => onModo?.("idle"), [onModo]);

  const TABS = [
    { id: "chat", texto: "Chat", icono: MessageCircle },
    ...(perfil.panorama === "stock" ? [{ id: "panorama", texto: "Panorama", icono: LayoutGrid }] : []),
    ...(perfil.panorama === "compras" ? [{ id: "panorama", texto: "Mi lista", icono: ClipboardList }] : []),
    { id: "avisos", texto: "Avisos", icono: Bell, n: abiertos },
    { id: "actividad", texto: "Actividad", icono: History },
  ];

  const boton = "h-10 px-3 rounded-lg text-[13px] font-semibold inline-flex items-center gap-2 text-zinc-300 hover:text-white hover:bg-white/[0.07] disabled:opacity-50 transition-colors";

  return (
    <div className="h-full min-h-0 flex flex-col bg-[#0c0c0f] text-zinc-200">
      <header className="shrink-0 flex items-center gap-3 px-3 sm:px-5 h-[76px] border-b border-white/[0.06]">
        {onVolver && (
          <button onClick={onVolver} aria-label="Volver al equipo" className="lg:hidden -ml-1 w-10 h-10 grid place-items-center rounded-lg text-zinc-300 hover:bg-white/[0.07]">
            <ArrowLeft size={20} />
          </button>
        )}
        <Avatar8 id={agente.id} tam={48} modo={actual.modo} ojos={actual.ojos} icono={actual.icono} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-bold text-white leading-tight truncate">{agente.nombre} <span className="hidden sm:inline font-medium text-zinc-500">· {agente.puesto}</span></h2>
          <p className="mt-0.5 text-[13px] text-zinc-400 truncate" aria-live="polite" key={actual.texto}><span className="cf-estado">{actual.texto}</span></p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={pedirReporte} disabled={enviando} className={boton} aria-label="Pedir un reporte en PDF" title="Pedir un reporte en PDF">
            <FileDown size={17} /> <span className="hidden md:inline">Reporte</span>
          </button>
          <button onClick={revisar} disabled={revisando} className={boton} aria-label="Revisar ahora" title="Revisar ahora">
            {revisando ? <Loader2 size={17} className="animate-spin" /> : <ScanSearch size={17} />} <span className="hidden md:inline">Revisar</span>
          </button>
          <button onClick={alternarVoz} aria-pressed={vozActiva} aria-label={vozActiva ? `Silenciar la voz de ${perfil.nombre}` : `Activar la voz de ${perfil.nombre}`} title={vozActiva ? "Voz activada" : "Voz desactivada"} className={`${boton} ${vozActiva ? "text-white bg-white/[0.09]" : ""}`}>
            {vozActiva ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
        </div>
      </header>

      <nav role="tablist" className="shrink-0 flex gap-1 px-3 sm:px-5 border-b border-white/[0.06] overflow-x-auto custom-scrollbar">
        {TABS.map((t) => {
          const activo = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={activo}
              onClick={() => setTab(t.id)}
              className={`relative shrink-0 h-11 px-3 text-[13.5px] font-semibold inline-flex items-center gap-1.5 transition-colors ${activo ? "text-white" : "text-zinc-500 hover:text-zinc-200"}`}
            >
              {t.texto}
              {t.n > 0 && <span className="text-[11.5px] font-bold text-zinc-400 tabular-nums">{t.n}</span>}
              {activo && <span className="absolute left-2 right-2 -bottom-px h-[2px] bg-[#FF5A00]" />}
            </button>
          );
        })}
        {estado?.ultima_revision && <span className="hidden sm:flex ml-auto items-center text-[12px] text-zinc-600 whitespace-nowrap pr-1">Última revisión {cuando(estado.ultima_revision)}</span>}
      </nav>

      <div className="flex-1 min-h-0">
        {tab === "chat" && (
          <Chat
            perfil={perfil}
            estado={actual}
            mensajes={mensajes}
            enviando={enviando}
            texto={texto}
            onTexto={alEscribir}
            onEnviar={enviar}
            dictando={dictando}
            onDictado={alternarDictado}
            puedeDictar={soportaDictado()}
            aviso={aviso || notaVoz}
            saludo={saludoSegunHora(usuario?.nombre)}
            resumen={perfil.resumen(estado, abiertos)}
            abiertos={abiertos}
            onVerAvisos={() => setTab("avisos")}
            manos={manos}
            onManos={alternarManos}
            hablando={hablando}
            onPdf={descargarPdf}
            onReporte={(t) => descargarReporte(t, tituloDe(t, `Respuesta de ${perfil.nombre}`))}
            onDerivar={onDerivar}
          />
        )}
        {tab === "panorama" && (
          <div className="h-full overflow-y-auto custom-scrollbar">
            {perfil.panorama === "compras" ? <PanoramaCompras datos={pano} error={errPano} onPreguntar={alPropuesta2} /> : <Panorama datos={pano} error={errPano} onPreguntar={alPropuesta2} />}
          </div>
        )}
        {tab === "avisos" && (
          <div className="h-full overflow-y-auto custom-scrollbar">
            <Avisos agenteId={agente.id} nombre={perfil.nombre} version={version} alCambiar={() => setVersion((v) => v + 1)} mostrar={mostrar} />
          </div>
        )}
        {tab === "actividad" && (
          <div className="h-full overflow-y-auto custom-scrollbar">
            <Actividad agenteId={agente.id} nombre={perfil.nombre} version={version} />
          </div>
        )}
      </div>
      {nodo}
    </div>
  );
}
