import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { api } from "./produccion/util";
import Pantalla from "./agentes/Pantalla";
import { Equipo, Proximamente } from "./agentes/Equipo";
import { PROXIMOS } from "./agentes/proximos";

const useEscritorio = () => {
  const [v, setV] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const f = () => setV(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return v;
};

/** Módulo Agentes IA: el equipo a la izquierda y la conversación con el agente elegido a la derecha. Cada agente se habilita por rol. */
export default function Agentes({ usuarioActual }) {
  const [agentes, setAgentes] = useState(null);
  const [error, setError] = useState(null);
  const escritorio = useEscritorio();
  const [elegido, setElegido] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("a");
    } catch {
      return null;
    }
  });
  const [pendiente, setPendiente] = useState(null); // { agente, pregunta } derivada desde otro agente
  const [vivo, setVivo] = useState({ id: null, modo: "idle", abiertos: null }); // lo que informa la pantalla abierta

  useEffect(() => {
    let vivoOk = true;
    api("/api/agentes")
      .then((r) => vivoOk && setAgentes(r))
      .catch((e) => vivoOk && setError(e.message));
    return () => {
      vivoOk = false;
    };
  }, []);

  const activo = agentes ? (agentes.some((a) => a.id === elegido) || PROXIMOS.some((p) => p.id === elegido) ? elegido : escritorio ? agentes[0]?.id : null) : null;
  const alModo = useCallback((modo) => setVivo((v) => (v.modo === modo ? v : { ...v, modo })), []);
  const alAbiertos = useCallback((abiertos) => setVivo((v) => (v.abiertos === abiertos ? v : { ...v, abiertos })), []);

  if (error) return <div className="h-full grid place-items-center p-6 text-center text-zinc-400 text-sm">{error}</div>;
  if (!agentes) return <div className="h-full grid place-items-center text-zinc-500"><Loader2 className="animate-spin" size={24} /></div>;
  if (agentes.length === 0)
    return (
      <div className="h-full grid place-items-center p-8 text-center">
        <div>
          <div className="mx-auto w-14 h-14 rounded-2xl bg-white/[0.05] grid place-items-center text-zinc-400"><Lock size={24} /></div>
          <p className="mt-4 text-lg font-bold text-white">No tenés agentes habilitados</p>
          <p className="mt-1 text-sm text-zinc-500">Pedile al administrador que te asigne uno desde el Panel Administrador.</p>
        </div>
      </div>
    );

  const proximo = PROXIMOS.find((p) => p.id === activo);
  const agente = agentes.find((a) => a.id === activo);
  const elegir = (id) => {
    setVivo((v) => ({ ...v, modo: "idle", abiertos: null }));
    setElegido(id);
  };

  return (
    <div className="h-full min-h-0 flex bg-[#0b0b0d]">
      <div className={`${activo ? "hidden lg:flex" : "flex"} w-full lg:w-[320px] xl:w-[340px] shrink-0 flex-col border-r border-white/[0.06]`}>
        <Equipo agentes={agentes} activo={activo} onElegir={elegir} modo={vivo.modo} abiertosVivo={vivo.abiertos} vivoId={agente?.id} />
      </div>
      <div className={`${activo ? "flex" : "hidden lg:flex"} flex-1 min-w-0 min-h-0 flex-col`}>
        {agente ? (
          <Pantalla
            key={agente.id}
            agente={agente}
            usuario={usuarioActual}
            pregunta={pendiente?.agente === agente.id ? pendiente.pregunta : null}
            onPreguntaUsada={() => setPendiente(null)}
            onModo={alModo}
            onAbiertos={alAbiertos}
            onVolver={() => elegir(null)}
            onDerivar={(d) => {
              setPendiente({ agente: d.agente, pregunta: d.pregunta });
              elegir(d.agente);
            }}
          />
        ) : proximo ? (
          <Proximamente agente={proximo} onVolver={() => elegir(null)} />
        ) : null}
      </div>
    </div>
  );
}
