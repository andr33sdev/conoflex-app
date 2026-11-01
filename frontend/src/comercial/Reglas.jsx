import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../produccion/util";
import { Boton } from "./ui";
import { campo } from "./util";

export default function Reglas({ aviso }) {
  const [texto, setTexto] = useState(null);
  const [original, setOriginal] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api("/api/reglas").then((d) => { setTexto(d.reglas || ""); setOriginal(d.reglas || ""); }).catch(() => aviso("No pude cargar las reglas.", "error"));
  }, [aviso]);

  const guardar = async () => {
    setGuardando(true);
    try {
      await api("/api/reglas", { method: "POST", body: { reglas: texto } });
      setOriginal(texto);
      aviso("Reglas guardadas.");
    } catch (e) {
      aviso(e.message, "error");
    } finally {
      setGuardando(false);
    }
  };

  if (texto === null) return <div className="p-10 grid place-items-center text-zinc-500"><Loader2 className="animate-spin" /></div>;
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Reglas comerciales de la IA</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Lo que tiene que saber al armar un presupuesto: IVA, escalas de descuento, entregas, formas de pago, tono del mail.</p>
        </div>
        <label htmlFor="reglas" className="sr-only">Reglas comerciales</label>
        <textarea id="reglas" rows={16} value={texto} onChange={(e) => setTexto(e.target.value)} className={`${campo} leading-relaxed`} placeholder="Ej: Los precios son más IVA 21%. Envío sin cargo en GBA para compras de más de $150.000." />
        <div className="flex items-center gap-3">
          <Boton onClick={guardar} cargando={guardando} disabled={texto === original}>Guardar reglas</Boton>
          {texto !== original && <span className="text-xs text-amber-400">Hay cambios sin guardar</span>}
        </div>
      </div>
    </div>
  );
}
