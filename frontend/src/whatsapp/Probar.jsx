import { useEffect, useRef, useState } from "react";
import { RotateCcw, Send } from "lucide-react";
import { api } from "../produccion/util";
import { Boton, Chip } from "../comercial/ui";
import { campo } from "../comercial/util";
import Burbuja from "./Burbuja";

// Chat de prueba: escribís como si fueras el cliente y ves qué respondería el bot. No se envía nada por WhatsApp.
export default function Probar({ aviso }) {
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const fin = useRef(null);
  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [mensajes, pensando]);

  const enviar = async (e) => {
    e.preventDefault();
    if (!texto.trim() || pensando) return;
    const charla = [...mensajes, { deCliente: true, texto: texto.trim() }];
    setMensajes(charla);
    setTexto("");
    setPensando(true);
    try {
      const r = await api("/api/whatsapp/probar", { method: "POST", body: { mensajes: charla.map(({ deCliente, texto }) => ({ deCliente, texto })) } });
      setMensajes([...charla, { deCliente: false, texto: r.texto, extra: r }]);
    } catch (err) {
      aviso(err.message, "error");
    } finally {
      setPensando(false);
    }
  };

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto w-full">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {!mensajes.length && <p className="text-sm text-zinc-500 text-center py-10">Escribí como si fueras un cliente. Nada de esto se manda por WhatsApp.</p>}
        {mensajes.map((m, i) => (
          <div key={i} className="space-y-1">
            <Burbuja autor={m.deCliente ? "CLIENTE" : "BOT"} texto={m.texto} />
            {m.extra && (m.extra.fotos?.length || m.extra.enviarLista || m.extra.derivar) ? (
              <div className="flex flex-wrap justify-end gap-1.5">
                {m.extra.fotos?.map((f) => <Chip key={f.codigo}>📷 {f.nombre}</Chip>)}
                {m.extra.enviarLista && <Chip>📄 Lista de precios</Chip>}
                {m.extra.derivar && <Chip tono="rojo">Pasa a una persona: {m.extra.motivo || "sin motivo"}</Chip>}
              </div>
            ) : null}
          </div>
        ))}
        {pensando && <p className="text-xs text-zinc-500 text-right">El bot está escribiendo…</p>}
        <div ref={fin} />
      </div>
      <form onSubmit={enviar} className="flex items-end gap-2 px-4 py-3 border-t border-zinc-800">
        {mensajes.length > 0 && <Boton type="button" variante="fantasma" onClick={() => setMensajes([])} aria-label="Empezar de nuevo" title="Empezar de nuevo"><RotateCcw size={16} /></Boton>}
        <label htmlFor="wa-prueba" className="sr-only">Mensaje de prueba</label>
        <textarea id="wa-prueba" rows={1} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && enviar(e)} placeholder="Ej: hola, cuánto sale el cono de 75?" className={`${campo} resize-none max-h-32`} />
        <Boton type="submit" cargando={pensando} aria-label="Enviar"><Send size={16} /></Boton>
      </form>
    </div>
  );
}
