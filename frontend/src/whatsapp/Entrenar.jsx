import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "../produccion/util";
import { Boton } from "../comercial/ui";
import { campo } from "../comercial/util";
import { Corregir } from "./Conversaciones";

export default function Entrenar({ aviso }) {
  const [reglas, setReglas] = useState(null);
  const [original, setOriginal] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [correcciones, setCorrecciones] = useState(null);
  const [nueva, setNueva] = useState(false);

  const cargarCorrecciones = useCallback(() => api("/api/whatsapp/correcciones").then(setCorrecciones).catch(() => setCorrecciones([])), []);
  useEffect(() => {
    api("/api/whatsapp/reglas").then((d) => { setReglas(d.reglas || ""); setOriginal(d.reglas || ""); }).catch(() => aviso("No pude cargar las reglas.", "error"));
    cargarCorrecciones();
  }, [aviso, cargarCorrecciones]);

  const guardar = async () => {
    setGuardando(true);
    try {
      await api("/api/whatsapp/reglas", { method: "POST", body: { reglas } });
      setOriginal(reglas);
      aviso("Reglas guardadas.");
    } catch (e) {
      aviso(e.message, "error");
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async (id) => {
    try {
      await api(`/api/whatsapp/correcciones/${id}`, { method: "DELETE" });
      cargarCorrecciones();
    } catch (e) {
      aviso(e.message, "error");
    }
  };

  if (reglas === null) return <div className="p-10 grid place-items-center text-zinc-500"><Loader2 className="animate-spin" /></div>;
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-8">
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Reglas para WhatsApp</h2>
            <p className="text-sm text-zinc-500 mt-0.5">Productos, precios y reglas comerciales los toma de Comercial IA. Acá va solo lo propio de WhatsApp.</p>
          </div>
          <label htmlFor="wa-reglas" className="sr-only">Reglas para WhatsApp</label>
          <textarea id="wa-reglas" rows={9} value={reglas} onChange={(e) => setReglas(e.target.value)} className={`${campo} leading-relaxed`} placeholder={"Ej:\nHorario de atención: lunes a viernes de 8 a 17.\nRetiro en fábrica: (dirección).\nSi preguntan por envíos al interior, pedir localidad y derivar."} />
          <div className="flex items-center gap-3">
            <Boton onClick={guardar} cargando={guardando} disabled={reglas === original}>Guardar reglas</Boton>
            {reglas !== original && <span className="text-xs text-amber-400">Hay cambios sin guardar</span>}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-white">Correcciones</h2>
              <p className="text-sm text-zinc-500 mt-0.5">Ejemplos de cómo responder. Se agregan desde “Corregir” en una conversación o acá.</p>
            </div>
            <Boton variante="suave" onClick={() => setNueva(true)}><Plus size={15} /> Agregar</Boton>
          </div>
          {correcciones === null ? null : !correcciones.length ? (
            <p className="text-sm text-zinc-600">Todavía no hay correcciones.</p>
          ) : (
            <ul className="space-y-2">
              {correcciones.map((c) => (
                <li key={c.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 flex gap-3">
                  <div className="flex-1 min-w-0 text-sm space-y-1.5">
                    <p className="text-zinc-400 whitespace-pre-wrap break-words"><span className="text-zinc-500">Cliente:</span> {c.pregunta}</p>
                    <p className="text-zinc-100 whitespace-pre-wrap break-words"><span className="text-[#ff8a4d]">Respuesta:</span> {c.respuesta}</p>
                  </div>
                  <button onClick={() => quitar(c.id)} aria-label="Quitar corrección" className="w-8 h-8 grid place-items-center rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-900 cursor-pointer shrink-0"><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {nueva && <Corregir inicial={{}} aviso={aviso} onCerrar={(ok) => { setNueva(false); if (ok) cargarCorrecciones(); }} />}
    </div>
  );
}
