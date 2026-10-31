import { useEffect, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { api } from "../produccion/util";
import { useToast } from "../produccion/useToast";

const aBytes = (b64) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};
const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const instalada = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone;
const motivoNavegador = () => {
  if (typeof window === "undefined") return "";
  if (!window.isSecureContext) return "Este sitio se abrió sin HTTPS (candado), y el navegador no deja activar avisos así. Hace falta entrar por una dirección https://.";
  if (esIOS() && !instalada()) return "En iPhone primero agregá la app a la pantalla de inicio (Compartir → Agregar a inicio) y abrila desde ahí.";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "Este navegador no soporta avisos. Probá con Chrome, Edge, Firefox o Safari (iPhone con la app en el inicio).";
  return "";
};
const soporta = () => typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Botón para activar los avisos urgentes de los agentes en este celular o computadora. */
export default function AvisosCelular() {
  const { mostrar, nodo } = useToast();
  const [estado, setEstado] = useState("cargando"); // cargando | no (navegador) | servidor | apagado | activo | bloqueado
  const [ocupado, setOcupado] = useState(false);
  const [ayuda, setAyuda] = useState("");

  useEffect(() => {
    let vivo = true;
    const ver = async () => {
      if (!soporta()) return vivo && setEstado("no");
      try {
        const k = await api("/api/push/clave");
        if (!k.habilitado) return vivo && setEstado("servidor");
        if (Notification.permission === "denied") return vivo && setEstado("bloqueado");
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        vivo && setEstado(sub && Notification.permission === "granted" ? "activo" : "apagado");
      } catch {
        vivo && setEstado("no");
      }
    };
    ver();
    return () => {
      vivo = false;
    };
  }, []);

  const activar = async () => {
    if (estado === "no" || estado === "servidor") {
      setAyuda(estado === "servidor" ? "El servidor todavía no tiene activados los avisos (falta ejecutar npm install en el backend y reiniciarlo)." : motivoNavegador() || "Este navegador no puede recibir avisos.");
      return;
    }
    setOcupado(true);
    try {
      if (esIOS() && !instalada()) {
        setAyuda(motivoNavegador());
        return;
      }
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueado" : "apagado");
        return;
      }
      const { clave } = await api("/api/push/clave");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(clave) }));
      await api("/api/push/suscribir", { method: "POST", body: { suscripcion: sub.toJSON() } });
      await api("/api/push/prueba", { method: "POST" }).catch(() => {});
      setEstado("activo");
      mostrar("Listo, los avisos urgentes te van a llegar acá.", "success");
    } catch (e) {
      mostrar(e.message || "No pude activar los avisos.", "error");
    } finally {
      setOcupado(false);
    }
  };

  const apagar = async () => {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await api("/api/push/baja", { method: "POST", body: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setEstado("apagado");
    } catch (e) {
      mostrar(e.message || "No pude desactivarlos.", "error");
    } finally {
      setOcupado(false);
    }
  };

  if (estado === "cargando") return null;
  return (
    <div className="flex flex-col items-start sm:items-end">
      <button
        onClick={estado === "activo" ? apagar : activar}
        disabled={ocupado || estado === "bloqueado"}
        title={estado === "no" || estado === "servidor" ? "Ver por qué no está disponible" : undefined}
        aria-pressed={estado === "activo"}
        className={`h-10 px-3 rounded-lg text-[13px] font-semibold inline-flex items-center gap-2 border transition-colors disabled:opacity-60 ${estado === "activo" ? "text-white border-white/25 bg-white/[0.07]" : "text-zinc-300 border-white/[0.1] hover:text-white hover:bg-white/[0.06]"}`}
      >
        {ocupado ? <Loader2 size={16} className="animate-spin" /> : <BellRing size={16} />}
        {estado === "activo" ? "Avisos en este dispositivo: sí" : "Avisarme en este dispositivo"}
      </button>
      {estado === "bloqueado" && <p className="mt-1 text-[12px] text-zinc-500 max-w-[260px]">Tenés las notificaciones bloqueadas para este sitio. Habilitalas desde el navegador.</p>}
      {ayuda && <p className="mt-1 text-[12px] text-zinc-400 max-w-[300px] sm:text-right">{ayuda}</p>}
      {nodo}
    </div>
  );
}
