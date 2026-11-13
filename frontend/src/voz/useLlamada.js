import { useCallback, useEffect, useRef, useState } from "react";
import { getApiUrl } from "../apiConfig";

// Llamada de voz con la asistente, directo desde el navegador (WebRTC).
// El backend recibe la "oferta" y la pasa al servicio de voz; el audio va directo navegador ⇄ servidor.
//
// estado: "lista" | "conectando" | "en_llamada" | "terminada" | "error"
// niveles: ref con { mic, bot } entre 0 y 1, se actualiza ~60 veces por segundo (para animar sin re-render).

const ICE = [{ urls: "stun:stun.l.google.com:19302" }];
const ESPERA_CONEXION_MS = 20000;

function esperarCandidatos(pc, ms = 2500) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((ok) => {
    const t = setTimeout(listo, ms);
    function listo() {
      clearTimeout(t);
      pc.removeEventListener("icegatheringstatechange", alCambiar);
      ok();
    }
    function alCambiar() {
      if (pc.iceGatheringState === "complete") listo();
    }
    pc.addEventListener("icegatheringstatechange", alCambiar);
  });
}

function mensajeError(e) {
  if (e?.name === "NotAllowedError" || e?.name === "SecurityError") return "Necesito permiso para usar el micrófono. Habilitalo en el navegador y probá de nuevo.";
  if (e?.name === "NotFoundError") return "No encontré un micrófono en este dispositivo.";
  return e?.message || "No se pudo conectar la llamada.";
}

export default function useLlamada(urlOferta) {
  const [estado, setEstado] = useState("lista");
  const [error, setError] = useState(null);
  const [silenciado, setSilenciado] = useState(false);
  const [subtitulos, setSubtitulos] = useState([]);
  const [inicio, setInicio] = useState(null);
  const niveles = useRef({ mic: 0, bot: 0 });
  const r = useRef({});

  const limpiar = useCallback(() => {
    const x = r.current;
    clearInterval(x.ping);
    clearTimeout(x.espera);
    cancelAnimationFrame(x.raf);
    try {
      x.pc?.close();
    } catch {
      /* ya cerrada */
    }
    x.mic?.getTracks().forEach((t) => t.stop());
    x.ctx?.close().catch(() => {});
    if (x.audio) {
      x.audio.pause();
      x.audio.srcObject = null;
    }
    niveles.current = { mic: 0, bot: 0 };
    r.current = {};
  }, []);

  const terminar = useCallback(
    (motivo) => {
      if (!r.current.pc) return;
      limpiar();
      if (motivo) {
        setError(motivo);
        setEstado("error");
      } else {
        setEstado("terminada");
      }
    },
    [limpiar],
  );

  const colgar = useCallback(() => {
    try {
      r.current.dc?.readyState === "open" && r.current.dc.send(JSON.stringify({ type: "conoflex", evento: "colgar" }));
    } catch {
      /* nada */
    }
    // un instante para que el aviso salga antes de cerrar
    setTimeout(() => terminar(), 150);
  }, [terminar]);

  const medir = useCallback(() => {
    const x = r.current;
    const nivel = (an, buf) => {
      if (!an) return 0;
      an.getFloatTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      return Math.min(1, Math.sqrt(s / buf.length) * 4);
    };
    const paso = () => {
      const n = niveles.current;
      n.mic = n.mic * 0.6 + nivel(x.anMic, x.bufMic) * 0.4;
      n.bot = n.bot * 0.6 + nivel(x.anBot, x.bufBot) * 0.4;
      x.raf = requestAnimationFrame(paso);
    };
    x.raf = requestAnimationFrame(paso);
  }, []);

  const llamar = useCallback(async () => {
    if (r.current.pc) return;
    setError(null);
    setSubtitulos([]);
    setSilenciado(false);
    setInicio(null);
    setEstado("conectando");
    // El audio se crea dentro del clic: así iOS/Safari lo deja sonar.
    const audio = new Audio();
    audio.autoplay = true;
    audio.playsInline = true;
    r.current.audio = audio;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      r.current.ctx = ctx;
      ctx.resume().catch(() => {});
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      r.current.mic = mic;
      const anMic = ctx.createAnalyser();
      anMic.fftSize = 512;
      ctx.createMediaStreamSource(mic).connect(anMic);
      Object.assign(r.current, { anMic, bufMic: new Float32Array(anMic.fftSize) });

      const pc = new RTCPeerConnection({ iceServers: ICE });
      r.current.pc = pc;
      pc.addTransceiver(mic.getAudioTracks()[0], { direction: "sendrecv", streams: [mic] });

      const dc = pc.createDataChannel("chat", { ordered: true });
      r.current.dc = dc;
      dc.onopen = () => {
        r.current.ping = setInterval(() => dc.readyState === "open" && dc.send(`ping: ${Date.now()}`), 1000);
      };
      dc.onmessage = (ev) => {
        let m;
        try {
          m = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (m?.type === "signalling" && m.message?.type === "peerLeft") return terminar();
        if (m?.type !== "conoflex") return;
        if (m.evento === "fin") return terminar();
        if (m.texto) setSubtitulos((s) => [...s.slice(-30), { rol: m.rol === "bot" ? "bot" : "cliente", texto: m.texto, id: `${Date.now()}-${Math.random()}` }]);
      };

      pc.ontrack = (ev) => {
        const stream = ev.streams[0] || new MediaStream([ev.track]);
        audio.srcObject = stream;
        audio.play().catch(() => {});
        try {
          const anBot = ctx.createAnalyser();
          anBot.fftSize = 512;
          ctx.createMediaStreamSource(stream).connect(anBot);
          Object.assign(r.current, { anBot, bufBot: new Float32Array(anBot.fftSize) });
        } catch {
          /* sin animación del bot, la llamada sigue */
        }
      };
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === "connected") {
          clearTimeout(r.current.espera);
          setInicio(Date.now());
          setEstado("en_llamada");
        } else if (s === "failed") {
          terminar("Se cortó la conexión de audio. Revisá internet y probá de nuevo.");
        } else if (s === "closed") {
          terminar();
        }
      };

      await pc.setLocalDescription(await pc.createOffer());
      await esperarCandidatos(pc);
      if (r.current.pc !== pc) return; // colgó mientras conectaba

      let res;
      try {
        res = await fetch(getApiUrl(urlOferta), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sdp: pc.localDescription.sdp, type: "offer" }),
        });
      } catch {
        throw new Error("No hay conexión con el servidor.");
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo conectar la llamada.");
      if (r.current.pc !== pc) return;
      await pc.setRemoteDescription({ type: "answer", sdp: json.sdp });
      r.current.espera = setTimeout(() => {
        if (pc.connectionState !== "connected") terminar("No se pudo establecer el audio. Puede que la red bloquee las llamadas (probá con datos del celular).");
      }, ESPERA_CONEXION_MS);
      medir();
    } catch (e) {
      limpiar();
      setError(mensajeError(e));
      setEstado("error");
    }
  }, [urlOferta, limpiar, terminar, medir]);

  const silenciar = useCallback(() => {
    const t = r.current.mic?.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setSilenciado(!t.enabled);
  }, []);

  useEffect(() => () => {
    try {
      r.current.dc?.readyState === "open" && r.current.dc.send(JSON.stringify({ type: "conoflex", evento: "colgar" }));
    } catch {
      /* nada */
    }
    limpiar();
  }, [limpiar]);

  return { estado, error, silenciado, subtitulos, inicio, niveles, llamar, colgar, silenciar };
}
