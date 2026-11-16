import { useCallback, useEffect, useRef, useState } from "react";
import { getApiUrl, getAuthHeaders } from "../apiConfig";

// Llamada de voz con Aldana, por turnos (como Jared), para que suene fluida y bien pronunciada.
//
// El navegador transcribe lo que decís (reconocimiento de voz del navegador) y manda el texto.
// El backend responde en streaming: una oración por vez, cada una con su audio ya listo. Apenas
// dejás de hablar suena una muletilla para que no haya silencio.
//
// estado: "lista" | "conectando" | "en_llamada" | "terminada" | "error"
// niveles: ref { mic, bot } 0..1 para animar la esfera sin re-render.

const getSR = () => (typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null);
export const hayReconocimiento = !!getSR();

export default function useLlamada(rutaBase, { publico = false } = {}) {
  const [estado, setEstado] = useState("lista");
  const [error, setError] = useState(null);
  const [silenciado, setSilenciado] = useState(false);
  const [subtitulos, setSubtitulos] = useState([]);
  const [inicio, setInicio] = useState(null);
  const niveles = useRef({ mic: 0, bot: 0 });
  const motor = useRef(null);

  // Todo el motor de la llamada se arma una sola vez: así las funciones se llaman entre ellas sin
  // problemas de "closures viejas" de React. Avisa los cambios por los setters (que son estables).
  if (!motor.current) {
    const m = {
      vivo: false,
      llamadaId: null,
      muletillas: [],
      cola: [],
      reproduciendo: false,
      escuchando: false,
      procesando: false,
      silenciado: false,
      alTerminarAudio: null,
      audio: null,
      rec: null,
      mic: null,
      ctx: null,
      raf: 0,
    };

    const headers = () => (publico ? { "Content-Type": "application/json" } : getAuthHeaders());
    const subtitulo = (rol, texto) => texto && setSubtitulos((s) => [...s.slice(-40), { rol, texto, id: `${Date.now()}-${Math.random()}` }]);

    function bombear() {
      if (m.reproduciendo || !m.cola.length) return;
      m.reproduciendo = true;
      niveles.current.bot = 0.6;
      // Cuando termina (o falla) este audio: sigue el siguiente, o avisa que terminó de hablar.
      const siguiente = () => {
        if (!m.reproduciendo) return; // ya seguimos por otro camino
        m.reproduciendo = false;
        niveles.current.bot = 0;
        if (m.cola.length) bombear();
        else if (m.alTerminarAudio) {
          const cb = m.alTerminarAudio;
          m.alTerminarAudio = null;
          cb();
        }
      };
      const audio = m.audio || (m.audio = new Audio());
      audio.onended = siguiente;
      audio.onerror = siguiente;
      audio.src = "data:audio/mpeg;base64," + m.cola.shift();
      audio.play().catch(siguiente);
    }
    function reproducir(base64) {
      m.cola.push(base64);
      bombear();
    }
    function pararAudio() {
      m.cola = [];
      m.alTerminarAudio = null;
      if (m.audio) {
        m.audio.pause();
        m.audio.onended = null;
      }
      m.reproduciendo = false;
      niveles.current.bot = 0;
    }

    function escuchar() {
      const SR = getSR();
      if (!m.vivo || !SR || m.escuchando || m.silenciado || m.reproduciendo || m.procesando) return;
      const rec = new SR();
      m.rec = rec;
      rec.lang = "es-AR";
      rec.interimResults = false;
      rec.continuous = false;
      m.escuchando = true;
      rec.onresult = (e) => {
        const texto = Array.from(e.results).map((res) => res[0].transcript).join(" ").trim();
        m.escuchando = false;
        try { rec.stop(); } catch { /* ya parado */ }
        if (texto) enviarTurno(texto);
      };
      rec.onerror = (e) => {
        m.escuchando = false;
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          setError("Necesito permiso para el micrófono. Habilitalo y volvé a llamar.");
          terminar(true);
        } else if (m.vivo) {
          setTimeout(escuchar, 300); // no-speech / aborted: seguir escuchando
        }
      };
      rec.onend = () => {
        m.escuchando = false;
        if (m.vivo && !m.reproduciendo && !m.procesando && !m.silenciado) setTimeout(escuchar, 150);
      };
      try { rec.start(); } catch { m.escuchando = false; }
    }

    async function enviarTurno(texto) {
      if (!m.vivo) return;
      m.procesando = true;
      subtitulo("cliente", texto);
      if (m.muletillas.length) reproducir(m.muletillas[Math.floor(Math.random() * m.muletillas.length)]);
      let cortar = false;
      try {
        const res = await fetch(getApiUrl(`${rutaBase}/turno`), { method: "POST", headers: headers(), body: JSON.stringify({ llamada_id: m.llamadaId, texto }) });
        if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo responder.");
        const lector = res.body.getReader();
        const dec = new TextDecoder();
        let resto = "";
        for (;;) {
          const { value, done } = await lector.read();
          if (done) break;
          resto += dec.decode(value, { stream: true });
          const lineas = resto.split("\n");
          resto = lineas.pop() || "";
          for (const linea of lineas) {
            if (!linea.trim()) continue;
            let ev;
            try { ev = JSON.parse(linea); } catch { continue; }
            if (ev.tipo === "chunk") {
              subtitulo("bot", ev.texto);
              if (ev.audio) reproducir(ev.audio);
            } else if (ev.tipo === "fin") cortar = ev.cortar;
            else if (ev.tipo === "error") setError(ev.error);
          }
        }
      } catch (e) {
        setError(e.message);
      } finally {
        m.procesando = false;
        const seguir = () => (cortar ? terminar(false) : escuchar());
        if (m.reproduciendo || m.cola.length) m.alTerminarAudio = seguir;
        else seguir();
      }
    }

    async function medirMic() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        m.mic = stream;
        const AC = window.AudioContext || window.webkitAudioContext;
        const ctx = new AC();
        m.ctx = ctx;
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Float32Array(an.fftSize);
        const paso = () => {
          if (!m.vivo) return;
          an.getFloatTimeDomainData(buf);
          let s = 0;
          for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
          niveles.current.mic = m.reproduciendo ? 0 : Math.min(1, Math.sqrt(s / buf.length) * 4);
          m.raf = requestAnimationFrame(paso);
        };
        paso();
      } catch {
        /* sin medidor; la llamada igual funciona */
      }
    }

    async function llamar() {
      if (m.vivo) return;
      if (!getSR()) {
        setError("Esta llamada funciona en Google Chrome (en la compu o en Android). En este navegador no puedo escucharte.");
        setEstado("error");
        return;
      }
      setError(null);
      setSubtitulos([]);
      setSilenciado(false);
      m.silenciado = false;
      setInicio(null);
      setEstado("conectando");
      m.vivo = true;
      try {
        const res = await fetch(getApiUrl(`${rutaBase}/inicio`), { method: "POST", headers: headers(), body: "{}" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "No se pudo iniciar la llamada.");
        if (!m.vivo) return;
        m.llamadaId = data.llamada_id;
        m.muletillas = data.muletillas || [];
        setEstado("en_llamada");
        setInicio(Date.now());
        subtitulo("bot", data.texto);
        medirMic();
        m.alTerminarAudio = escuchar;
        if (data.audio) reproducir(data.audio);
        else escuchar();
      } catch (e) {
        m.vivo = false;
        setError(e.message);
        setEstado("error");
      }
    }

    function terminar(conError) {
      if (!m.vivo && !conError) return;
      const id = m.llamadaId;
      m.vivo = false;
      try { m.rec?.stop(); } catch { /* nada */ }
      pararAudio();
      cancelAnimationFrame(m.raf);
      m.mic?.getTracks().forEach((t) => t.stop());
      m.ctx?.close().catch(() => {});
      niveles.current = { mic: 0, bot: 0 };
      if (id) fetch(getApiUrl(`${rutaBase}/fin`), { method: "POST", headers: headers(), body: JSON.stringify({ llamada_id: id }) }).catch(() => {});
      m.llamadaId = null;
      setEstado((e) => (conError ? "error" : e === "conectando" || e === "en_llamada" ? "terminada" : e));
    }

    function silenciar() {
      m.silenciado = !m.silenciado;
      setSilenciado(m.silenciado);
      if (m.silenciado) {
        try { m.rec?.stop(); } catch { /* nada */ }
      } else if (m.vivo && !m.reproduciendo && !m.procesando) {
        setTimeout(escuchar, 100);
      }
    }

    m.llamar = llamar;
    m.colgar = () => terminar(false);
    m.silenciar = silenciar;
    motor.current = m;
  }

  const llamar = useCallback(() => motor.current.llamar(), []);
  const colgar = useCallback(() => motor.current.colgar(), []);
  const silenciar = useCallback(() => motor.current.silenciar(), []);

  useEffect(() => () => motor.current?.colgar(), []);

  return { estado, error, silenciado, subtitulos, inicio, niveles, llamar, colgar, silenciar, hayReconocimiento };
}
