import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Eye, Image as ImageIcon, Inbox, Mail, Paperclip, RefreshCw, Send, Sparkles, User, X } from "lucide-react";
import { Boton, Vacio } from "./ui";
import RevisionBorrador from "./RevisionBorrador";

const inicial = (t) => (String(t || "?").replace(/[^a-zA-Z0-9]/g, "")[0] || "?").toUpperCase();

export default function Bandeja({ aviso, onCuenta }) {
  const [mails, setMails] = useState([]);
  const [sel, setSel] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [conectado, setConectado] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [generando, setGenerando] = useState(false);
  const [revision, setRevision] = useState(null); // { mailId, revision }
  const [foto, setFoto] = useState(null);

  const traer = useCallback(async () => {
    try {
      const res = await fetch("/api/mails");
      const data = await res.json();
      if (!res.ok) {
        setConectado(false);
        setErrorMsg(data.error || "Hay que vincular la cuenta de Gmail.");
      } else {
        const lista = data.mails || [];
        setMails(lista);
        setConectado(true);
        onCuenta?.(lista.length);
        setSel((actual) => (actual && lista.find((m) => m.id === actual.id)) || lista[0] || null);
      }
    } catch {
      setConectado(false);
      setErrorMsg("No hay conexión con el servidor.");
    } finally {
      setCargando(false);
    }
  }, [onCuenta]);
  const cargar = useCallback(() => {
    setCargando(true);
    setErrorMsg("");
    return traer();
  }, [traer]);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("status") === "conectado") {
      window.history.replaceState({}, document.title, window.location.pathname);
      aviso("Gmail vinculado correctamente.");
    }
    const t = setTimeout(traer, 0);
    return () => clearTimeout(t);
  }, [traer, aviso]);

  const generarBorrador = async (mail) => {
    setGenerando(true);
    try {
      const res = await fetch("/api/crear-borrador-gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailCliente: mail.emailCliente,
          consultaText: mail.cuerpoCompleto || mail.cuerpo || mail.resumen,
          asunto: mail.asunto,
          threadId: mail.threadId,
          imagenes: mail.imagenes || [],
          nombreCliente: mail.remitente,
        }),
      });
      const data = await res.json();
      if (data.success) {
        aviso("Borrador listo en Gmail. Revisalo antes de enviarlo.");
        setRevision(data.revision ? { mailId: mail.id, revision: data.revision } : null);
        cargar();
      } else aviso(data.error || "No se pudo preparar el borrador.", "error");
    } catch {
      aviso("No hay conexión con el servidor.", "error");
    } finally {
      setGenerando(false);
    }
  };

  if (!conectado) {
    return (
      <Vacio icono={Mail} titulo="Falta vincular el Gmail comercial" texto={errorMsg || "Autorizá la cuenta para que la IA pueda leer las consultas y preparar borradores."}>
        <Boton onClick={() => { window.location.href = "/auth/google"; }}><ExternalLink size={15} /> Vincular con Google</Boton>
        <p className="text-xs text-zinc-600 mt-3">Mientras tanto podés usar Productos y la Lista de precios.</p>
      </Vacio>
    );
  }

  return (
    <div className="h-full flex flex-col md:flex-row min-h-0">
      <div className="w-full md:w-80 lg:w-96 md:border-r border-zinc-800 flex flex-col min-h-0 max-h-[40%] md:max-h-none shrink-0">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-200 flex items-center gap-2"><Mail size={15} className="text-[#FF5A00]" /> Consultas <span className="text-zinc-600">({mails.length})</span></span>
          <button onClick={cargar} disabled={cargando} aria-label="Actualizar" className="w-9 h-9 grid place-items-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 cursor-pointer"><RefreshCw size={15} className={cargando ? "animate-spin text-[#FF5A00]" : ""} /></button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
          {mails.map((m) => (
            <button key={m.id} onClick={() => setSel(m)} className={`w-full text-left p-3.5 flex gap-3 cursor-pointer transition-colors ${sel?.id === m.id ? "bg-zinc-900 border-l-2 border-[#FF5A00]" : "hover:bg-zinc-900/50 border-l-2 border-transparent"}`}>
              <div className="w-9 h-9 rounded-full bg-zinc-800 grid place-items-center text-sm font-semibold text-[#ff8a4d] shrink-0">{inicial(m.emailCliente)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-100 truncate">{m.remitente || m.emailCliente}</p>
                <p className="text-xs text-[#ff8a4d] truncate">{m.asunto}</p>
                <p className="text-xs text-zinc-500 line-clamp-2 mt-0.5">{m.cuerpoCompleto || m.cuerpo || m.resumen}</p>
                {m.imagenes?.length > 0 && <p className="text-[11px] text-amber-400 mt-1 flex items-center gap-1"><Paperclip size={11} /> {m.imagenes.length} {m.imagenes.length === 1 ? "imagen" : "imágenes"}</p>}
              </div>
            </button>
          ))}
          {mails.length === 0 && !cargando && <Vacio icono={Inbox} titulo="Bandeja al día" texto="Poné la etiqueta IA-Consulta a un mail en Gmail y aparece acá." />}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {sel ? (
          <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-[#0d0d0e] p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#ff8a4d]">Consulta del cliente</p>
                  <h3 className="text-lg font-semibold text-white break-words">{sel.asunto}</h3>
                </div>
                <span className="inline-flex items-center gap-1.5 text-sm text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5"><User size={13} className="text-zinc-500" /> {sel.emailCliente}</span>
              </div>
              <div className="bg-black/40 border border-zinc-800 rounded-lg p-4 text-sm leading-relaxed text-zinc-200 whitespace-pre-wrap max-h-96 overflow-y-auto">{sel.cuerpoCompleto || sel.cuerpo || sel.resumen}</div>
              {sel.imagenes?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-amber-400 flex items-center gap-2"><ImageIcon size={15} /> Imágenes del cliente ({sel.imagenes.length})</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {sel.imagenes.map((img, i) => {
                      const src = img.url || `data:${img.mimeType};base64,${img.data}`;
                      return (
                        <button key={i} onClick={() => setFoto({ url: src, titulo: `Imagen ${i + 1} de ${sel.emailCliente}` })} className="h-28 rounded-lg bg-black border border-zinc-800 hover:border-[#FF5A00] p-1.5 relative group overflow-hidden cursor-pointer">
                          <img src={src} alt={`Adjunto ${i + 1}`} className="w-full h-full object-contain" />
                          <span className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 grid place-items-center transition-opacity"><Eye size={16} className="text-white" /></span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {revision?.mailId === sel.id && <RevisionBorrador revision={revision.revision} />}

            <div className="rounded-xl border border-zinc-800 bg-[#0d0d0e] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center gap-2"><Sparkles size={15} className="text-[#FF5A00]" /> Preparar respuesta</h4>
                <p className="text-sm text-zinc-500 mt-1 max-w-lg">La IA lee el mensaje y las fotos, elige los productos, calcula los precios con tu lista y deja el borrador en Gmail. No se envía nada solo.</p>
              </div>
              <Boton onClick={() => generarBorrador(sel)} cargando={generando} className="shrink-0"><Send size={15} /> {generando ? "Preparando…" : "Crear borrador en Gmail"}</Boton>
            </div>
          </div>
        ) : (
          <Vacio icono={Inbox} titulo="Elegí una consulta" texto="Seleccioná un mail de la lista para leerlo y preparar la respuesta." />
        )}
      </div>

      {foto && (
        <div className="fixed inset-0 z-[300] bg-black/90 grid place-items-center p-4" onClick={() => setFoto(null)}>
          <div className="relative max-w-4xl w-full bg-[#0c0c0d] border border-zinc-800 rounded-xl p-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setFoto(null)} aria-label="Cerrar" className="absolute top-3 right-3 w-9 h-9 grid place-items-center rounded-lg bg-black text-zinc-400 hover:text-white border border-zinc-800 cursor-pointer"><X size={16} /></button>
            <p className="text-sm text-zinc-300 mb-3 pr-10">{foto.titulo}</p>
            <img src={foto.url} alt={foto.titulo} className="max-w-full max-h-[75vh] mx-auto object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
