import { useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { api } from "./produccion/util";
import LiaPantalla from "./agentes/LiaPantalla";

/** Módulo Agentes IA: cada agente tiene su especialidad y se habilita por rol (permiso "agente:<id>"). */
export default function Agentes() {
  const [agentes, setAgentes] = useState(null);
  const [error, setError] = useState(null);
  const [elegido, setElegido] = useState(null);

  useEffect(() => {
    let vivo = true;
    api("/api/agentes")
      .then((r) => vivo && setAgentes(r))
      .catch((e) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  if (error)
    return <div className="h-full grid place-items-center p-6 text-center text-rose-300 text-sm">{error}</div>;
  if (!agentes)
    return <div className="h-full grid place-items-center text-zinc-500"><Loader2 className="animate-spin" size={24} /></div>;
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

  const agente = agentes.find((a) => a.id === elegido) || agentes[0];
  return (
    <div className="h-full min-h-0 flex flex-col">
      {agentes.length > 1 && (
        <div className="shrink-0 flex gap-2 overflow-x-auto px-3 py-2 border-b border-white/[0.06] bg-[#0e0e11]">
          {agentes.map((a) => (
            <button
              key={a.id}
              onClick={() => setElegido(a.id)}
              className={`shrink-0 min-h-[44px] px-4 rounded-xl text-sm font-bold border ${a.id === agente.id ? "bg-[#FF5A00] border-[#FF5A00] text-black" : "border-white/10 text-zinc-300 hover:text-white"}`}
            >
              {a.nombre} · {a.puesto}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <LiaPantalla key={agente.id} agente={agente} />
      </div>
    </div>
  );
}
