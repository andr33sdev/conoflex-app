import { useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { api } from "./produccion/util";
import LiaPantalla from "./agentes/LiaPantalla";
import Roster, { Proximamente } from "./agentes/Roster";
import { PROXIMOS } from "./agentes/proximos";

/** Módulo Agentes IA: elegís con qué agente hablar. Cada uno se habilita por rol (permiso "agente:<id>"). */
export default function Agentes({ usuarioActual }) {
  const [agentes, setAgentes] = useState(null);
  const [error, setError] = useState(null);
  const [elegido, setElegido] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("a");
    } catch {
      return null;
    }
  });
  const [pendiente, setPendiente] = useState(null); // { agente, pregunta } derivada desde otro agente

  useEffect(() => {
    let vivo = true;
    api("/api/agentes")
      .then((r) => vivo && setAgentes(r))
      .catch((e) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  if (error) return <div className="h-full grid place-items-center p-6 text-center text-rose-300 text-sm">{error}</div>;
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

  const proximo = PROXIMOS.find((p) => p.id === elegido);
  const agente = agentes.find((a) => a.id === elegido) || (proximo ? null : agentes[0]);
  return (
    <div className="h-full min-h-0 flex flex-col">
      <Roster agentes={agentes} elegido={agente?.id || proximo?.id} onElegir={setElegido} />
      <div className="flex-1 min-h-0">
        {agente ? (
          <LiaPantalla
            key={agente.id}
            agente={agente}
            usuario={usuarioActual}
            pregunta={pendiente?.agente === agente.id ? pendiente.pregunta : null}
            onPreguntaUsada={() => setPendiente(null)}
            onDerivar={(d) => {
              setPendiente({ agente: d.agente, pregunta: d.pregunta });
              setElegido(d.agente);
            }}
          />
        ) : <Proximamente agente={proximo} />}
      </div>
    </div>
  );
}
