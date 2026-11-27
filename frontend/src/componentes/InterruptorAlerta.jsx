// Interruptor de una alerta global (campanita). Solo se muestra a admin. Lee y guarda en /api/config/alertas.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../produccion/util";

export default function InterruptorAlerta({ campo, etiqueta, descripcion, esAdmin = false, icono: Icono }) {
  const [valor, setValor] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    api("/api/config/alertas").then((d) => vivo && setValor(!!d[campo])).catch(() => {});
    return () => { vivo = false; };
  }, [campo]);

  if (!esAdmin || valor === null) return null;

  const cambiar = async () => {
    const nuevo = !valor;
    setValor(nuevo);
    setGuardando(true);
    try {
      const d = await api("/api/config/alertas", { method: "PUT", body: { [campo]: nuevo } });
      setValor(!!d[campo]);
    } catch {
      setValor(!nuevo); // revierte si falló
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
      {Icono && <Icono size={18} className={valor ? "text-[#FFD60A]" : "text-zinc-500"} />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-zinc-100">{etiqueta}</p>
        {descripcion && <p className="text-xs text-zinc-500 mt-0.5">{descripcion}</p>}
      </div>
      {guardando && <Loader2 size={15} className="animate-spin text-zinc-500" />}
      <button
        type="button"
        role="switch"
        aria-checked={valor}
        aria-label={etiqueta}
        onClick={cambiar}
        disabled={guardando}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors cursor-pointer ${valor ? "bg-[#FF5A00]" : "bg-zinc-700"}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${valor ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );
}
