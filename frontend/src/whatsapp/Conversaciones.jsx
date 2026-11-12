import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, Loader2, MessageCircle, Send, UserRound } from "lucide-react";
import { api } from "../produccion/util";
import { Aviso, Boton, Chip, Modal } from "../comercial/ui";
import { campo } from "../comercial/util";
import Burbuja from "./Burbuja";
import FotoCliente from "./FotoCliente";

const hora = (f) => {
  if (!f) return "";
  const d = new Date(f);
  const hoy = new Date();
  return d.toDateString() === hoy.toDateString() ? d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
};
const nombreDe = (c) => c?.nombre || `+${c?.telefono}`;

function EstadoChip({ c }) {
  if (c.derivada) return <Chip tono="rojo">Necesita una persona</Chip>;
  if (c.pausado) return <Chip tono="verde">Atiende el equipo</Chip>;
  return <Chip tono="naranja">Bot</Chip>;
}

/** Primera vez: todavía no están cargados los datos de Meta en el servidor. */
function SinConfigurar({ estado }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-xl mx-auto p-6 space-y-4 text-center">
        <MessageCircle className="mx-auto text-zinc-600" size={40} />
        <h2 className="text-lg font-semibold text-white">Falta conectar el número</h2>
        <p className="text-sm text-zinc-400">Cuando el número esté registrado en Meta y los datos cargados en el servidor, acá vas a ver las conversaciones. Mientras tanto podés cargar reglas y probar el bot.</p>
        <div className="text-left">
          <Aviso tono="info">
            <p className="font-medium mb-1">Dirección del webhook para Meta</p>
            <code className="text-xs break-all text-[#ff8a4d]">{estado.webhook}</code>
            <p className="mt-2 text-xs text-zinc-500">Faltan en el .env: {estado.faltan.join(", ")}</p>
          </Aviso>
        </div>
      </div>
    </div>
  );
}

export default function Conversaciones({ aviso, estado }) {
  const [lista, setLista] = useState(null);
  const [activa, setActiva] = useState(null);

  const cargar = useCallback(() => api("/api/whatsapp/conversaciones").then(setLista).catch(() => setLista((l) => l || [])), []);
  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 5000);
    return () => clearInterval(t);
  }, [cargar]);

  if (estado && !estado.configurado) return <SinConfigurar estado={estado} />;
  if (lista === null) return <div className="p-10 grid place-items-center text-zinc-500"><Loader2 className="animate-spin" /></div>;

  const conv = lista.find((c) => c.id === activa);
  return (
    <div className="h-full flex">
      <aside className={`${conv ? "hidden md:flex" : "flex"} w-full md:w-80 lg:w-96 shrink-0 flex-col border-r border-zinc-800 min-h-0`}>
        {!lista.length ? (
          <p className="p-8 text-sm text-zinc-500 text-center">Todavía no escribió nadie.</p>
        ) : (
          <ul className="overflow-y-auto">
            {lista.map((c) => (
              <li key={c.id}>
                <button onClick={() => setActiva(c.id)} className={`w-full text-left px-4 py-3 border-b border-zinc-900 cursor-pointer transition-colors ${c.id === activa ? "bg-zinc-900" : "hover:bg-zinc-900/60"}`}>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate text-sm font-medium text-white">{nombreDe(c)}</span>
                    <span className="text-[11px] text-zinc-500">{hora(c.ultimo_mensaje_en)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="flex-1 truncate text-xs text-zinc-400">{c.ultimo_texto}</span>
                    {c.no_leidos > 0 && <span className="text-[11px] font-semibold bg-[#FF5A00] text-black rounded-full px-1.5 min-w-[18px] text-center">{c.no_leidos}</span>}
                  </div>
                  {(c.derivada || c.pausado) ? <div className="mt-1.5"><EstadoChip c={c} /></div> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <section className={`${conv ? "flex" : "hidden md:flex"} flex-1 min-w-0 flex-col`}>
        {conv ? <Chat key={conv.id} conv={conv} aviso={aviso} onVolver={() => setActiva(null)} onCambio={cargar} /> : <div className="m-auto text-sm text-zinc-600">Elegí una conversación</div>}
      </section>
    </div>
  );
}

function Chat({ conv, aviso, onVolver, onCambio }) {
  const [mensajes, setMensajes] = useState(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState(null);
  const fin = useRef(null);
  const cantidad = useRef(0);

  const cargar = useCallback(() => api(`/api/whatsapp/conversaciones/${conv.id}/mensajes`).then(setMensajes).catch(() => setMensajes((m) => m || [])), [conv.id]);
  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 4000);
    return () => clearInterval(t);
  }, [cargar]);
  useEffect(() => {
    if (mensajes && mensajes.length !== cantidad.current) {
      cantidad.current = mensajes.length;
      fin.current?.scrollIntoView({ block: "end" });
    }
  }, [mensajes]);

  const enviar = async (e) => {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      await api(`/api/whatsapp/conversaciones/${conv.id}/enviar`, { method: "POST", body: { texto } });
      setTexto("");
      cargar();
      onCambio();
    } catch (err) {
      aviso(err.message, "error");
    } finally {
      setEnviando(false);
    }
  };

  const bot = async (activo) => {
    try {
      await api(`/api/whatsapp/conversaciones/${conv.id}/bot`, { method: "POST", body: { activo } });
      aviso(activo ? "El bot vuelve a responder en esta conversación." : "Bot pausado en esta conversación por 12 horas.");
      onCambio();
    } catch (err) {
      aviso(err.message, "error");
    }
  };

  /** Lo que el cliente escribió justo antes de esta respuesta del bot. */
  const preguntaPrevia = (idx) => {
    const partes = [];
    for (let i = idx - 1; i >= 0 && mensajes[i].direccion === "IN"; i--) partes.unshift(mensajes[i].texto);
    return partes.join("\n");
  };

  const conBot = !conv.pausado && !conv.derivada;
  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
        <button onClick={onVolver} className="md:hidden w-9 h-9 grid place-items-center rounded-lg text-zinc-400 hover:bg-zinc-900 cursor-pointer" aria-label="Volver"><ArrowLeft size={18} /></button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{nombreDe(conv)}</p>
          <p className="text-xs text-zinc-500">+{conv.telefono}</p>
        </div>
        {conBot ? (
          <Boton variante="suave" onClick={() => bot(false)}><UserRound size={15} /> Atender yo</Boton>
        ) : (
          <Boton variante="suave" onClick={() => bot(true)}><Bot size={15} /> Devolver al bot</Boton>
        )}
      </div>
      {conv.derivada ? (
        <div className="px-4 pt-3"><Aviso tono="rojo">El bot pidió ayuda: {conv.motivo_derivacion || "el cliente necesita una persona"}.</Aviso></div>
      ) : null}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {mensajes === null ? (
          <div className="grid place-items-center py-10 text-zinc-500"><Loader2 className="animate-spin" /></div>
        ) : (
          mensajes.map((m, i) => (
            <div key={m.id} className="flex flex-col gap-1.5">
            {m.direccion === "IN" && m.tiene_foto ? <FotoCliente mensaje={m} aviso={aviso} onCambio={cargar} /> : null}
            <Burbuja
              autor={m.autor}
              texto={m.texto}
              error={m.error}
              hora={hora(m.created_at)}
              accion={m.autor === "BOT" && m.tipo === "text" ? <button onClick={() => setCorrigiendo({ pregunta: preguntaPrevia(i), respuesta: m.texto })} className="text-[11px] text-zinc-400 hover:text-white underline underline-offset-2 cursor-pointer">Corregir</button> : null}
            />
            </div>
          ))
        )}
        <div ref={fin} />
      </div>

      {conv.ventana ? (
        <form onSubmit={enviar} className="flex items-end gap-2 px-4 py-3 border-t border-zinc-800">
          <label htmlFor="wa-texto" className="sr-only">Mensaje</label>
          <textarea id="wa-texto" rows={1} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && enviar(e)} placeholder={conBot ? "Si escribís, el bot se pausa en esta conversación" : "Escribí tu respuesta"} className={`${campo} resize-none max-h-32`} />
          <Boton type="submit" cargando={enviando} aria-label="Enviar"><Send size={16} /></Boton>
        </form>
      ) : (
        <p className="px-4 py-3 border-t border-zinc-800 text-xs text-zinc-500">Pasaron más de 24 h desde el último mensaje del cliente: WhatsApp no deja escribirle hasta que vuelva a escribir.</p>
      )}

      {corrigiendo && <Corregir inicial={corrigiendo} aviso={aviso} onCerrar={() => setCorrigiendo(null)} />}
    </>
  );
}

export function Corregir({ inicial, aviso, onCerrar }) {
  const [pregunta, setPregunta] = useState(inicial.pregunta || "");
  const [respuesta, setRespuesta] = useState(inicial.respuesta || "");
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    setGuardando(true);
    try {
      await api("/api/whatsapp/correcciones", { method: "POST", body: { pregunta, respuesta } });
      aviso("Listo: el bot va a responder así de ahora en más.");
      onCerrar(true);
    } catch (e) {
      aviso(e.message, "error");
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Modal titulo="Enseñarle al bot" onCerrar={() => onCerrar(false)} pie={<><Boton variante="fantasma" onClick={() => onCerrar(false)}>Cancelar</Boton><Boton onClick={guardar} cargando={guardando}>Guardar</Boton></>}>
      <div className="space-y-4">
        <div>
          <label htmlFor="wa-preg" className="text-sm font-medium text-zinc-300">Cuando el cliente dice</label>
          <textarea id="wa-preg" rows={3} value={pregunta} onChange={(e) => setPregunta(e.target.value)} className={`${campo} mt-1`} />
        </div>
        <div>
          <label htmlFor="wa-resp" className="text-sm font-medium text-zinc-300">Hay que responder así</label>
          <textarea id="wa-resp" rows={6} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} className={`${campo} mt-1`} />
        </div>
      </div>
    </Modal>
  );
}
