import { useState } from "react";
import { Check, Loader2, Mail, Plus, Trash2 } from "lucide-react";
import { api } from "../produccion/util";
import { cuando } from "./formato";

const Titulo = ({ children }) => <h4 className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-zinc-500 mb-2">{children}</h4>;
const ESTADO = {
  BORRADOR: { texto: "Borrador listo", clase: "text-emerald-400" },
  PENDIENTE: { texto: "Sin borrador", clase: "text-amber-400" },
  ERROR: { texto: "Falló el borrador", clase: "text-red-400" },
};
const limpiarNombre = (r, email) => String(r || "").replace(/<[^>]*>/g, "").replace(/["']/g, "").trim() || email || "Cliente";

function Dato({ titulo, valor, detalle }) {
  return (
    <div className="rounded-xl border border-white/[0.07] p-3.5">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-zinc-500">{titulo}</p>
      <p className="mt-1 text-[26px] leading-none font-bold text-white tabular-nums">{valor}</p>
      <p className="mt-1.5 text-[12px] text-zinc-500 leading-tight">{detalle}</p>
    </div>
  );
}

/** Panel de Cami: mails de clientes que esperan, lo que se corrigió al enviar y las reglas comerciales anotadas. Cami solo deja borradores en Gmail. */
export default function PanoramaVentas({ base, datos, error, onPreguntar, alCambiar, mostrar }) {
  const [armando, setArmando] = useState(null);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  if (error) return <div className="p-6 text-center text-sm text-zinc-400">{error}</div>;
  if (!datos) return <div className="h-full grid place-items-center text-zinc-500 py-16"><Loader2 className="animate-spin" size={22} /></div>;
  const { conteos: c = {}, mails = [], atendidos = [], patrones = [], notas = [] } = datos;

  const armar = async (m) => {
    setArmando(m.mail_id);
    try {
      await api(`${base}/mails/${m.mail_id}/borrador`, { method: "POST" });
      mostrar?.("Listo: el borrador quedó en Gmail, sin enviar.");
      alCambiar?.();
    } catch (e) {
      mostrar?.(e.message, "error");
    } finally {
      setArmando(null);
    }
  };
  const guardarNota = async (e) => {
    e.preventDefault();
    if (nota.trim().length < 8) return;
    setGuardando(true);
    try {
      await api(`${base}/notas`, { method: "POST", body: { texto: nota } });
      setNota("");
      mostrar?.("Anotado: lo uso desde el próximo borrador.");
      alCambiar?.();
    } catch (er) {
      mostrar?.(er.message, "error");
    } finally {
      setGuardando(false);
    }
  };
  const quitar = async (n) => {
    try {
      await api(`${base}/notas/${n.id}`, { method: "DELETE" });
      alCambiar?.();
    } catch (er) {
      mostrar?.(er.message, "error");
    }
  };
  const alternarAuto = async () => {
    try {
      await api(`${base}/auto`, { method: "PUT", body: { activo: !datos.auto } });
      alCambiar?.();
    } catch (er) {
      mostrar?.(er.message, "error");
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-5 py-4 space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Dato titulo="Borradores listos" valor={c.BORRADOR || 0} detalle="para revisar y enviar" />
        <Dato titulo="Sin responder" valor={(c.PENDIENTE || 0) + (c.ERROR || 0)} detalle="todavía sin borrador" />
        <Dato titulo="Atendidos" valor={c.ATENDIDO || 0} detalle="ya enviados" />
        <Dato titulo="Reglas anotadas" valor={notas.length} detalle="se suman a cada borrador" />
      </div>

      <p className="rounded-xl border border-white/[0.07] px-4 py-3 text-[13px] text-zinc-400 leading-relaxed">
        Cami lee los mails con la etiqueta <b className="text-zinc-200">IA-Consulta</b> y te deja el borrador en Gmail. <b className="text-zinc-200">Nunca envía</b>: el envío siempre es tuyo.
        {datos.puede_configurar ? (
          <button onClick={alternarAuto} className="ml-1 font-semibold text-white underline underline-offset-2 hover:text-zinc-300">
            {datos.auto ? "Armado automático: activo (tocá para apagarlo)" : "Armado automático: apagado (tocá para activarlo)"}
          </button>
        ) : (
          <span className="ml-1">Armado automático: {datos.auto ? "activo" : "apagado"}.</span>
        )}
      </p>

      <section>
        <Titulo>Mails esperando</Titulo>
        {mails.length === 0 ? (
          <p className="rounded-xl border border-white/[0.07] px-4 py-5 text-[14px] text-zinc-400">No hay mails de clientes esperando. Etiquetá uno con IA-Consulta en Gmail y lo tomo en la próxima revisión.</p>
        ) : (
          <ul className="rounded-xl border border-white/[0.09] divide-y divide-white/[0.06]">
            {mails.map((m) => {
              const e = ESTADO[m.estado] || ESTADO.PENDIENTE;
              const avisos = m.revision?.avisos || [];
              return (
                <li key={m.mail_id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <Mail size={16} className="mt-1 shrink-0 text-zinc-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] font-semibold text-white leading-snug break-words">{limpiarNombre(m.remitente, m.email_cliente)}</p>
                      <p className="text-[13px] text-zinc-400 leading-snug break-words">{m.asunto}</p>
                      <p className={`mt-1 text-[12px] font-semibold ${e.clase}`}>{e.texto}<span className="font-normal text-zinc-500"> · {cuando(m.fecha_mail || m.recibido)}</span></p>
                      {m.estado === "ERROR" && m.error && <p className="mt-0.5 text-[12.5px] text-zinc-500">{m.error}</p>}
                      {m.nota && <p className="mt-0.5 text-[12.5px] text-zinc-500">{m.nota}</p>}
                      {avisos.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {avisos.slice(0, 4).map((a) => <li key={a} className="text-[12.5px] text-amber-300/90 leading-snug">• {a}</li>)}
                          {avisos.length > 4 && <li className="text-[12.5px] text-zinc-500">y {avisos.length - 4} más en el borrador</li>}
                        </ul>
                      )}
                    </div>
                    {m.estado !== "BORRADOR" && (
                      <button onClick={() => armar(m)} disabled={armando === m.mail_id} className="shrink-0 min-h-[38px] px-3 rounded-lg text-[13px] font-semibold bg-white text-black hover:bg-zinc-200 disabled:opacity-60 inline-flex items-center gap-1.5">
                        {armando === m.mail_id ? <Loader2 size={14} className="animate-spin" /> : null} {armando === m.mail_id ? "Armando…" : "Armar borrador"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button onClick={() => onPreguntar("¿Qué mails tengo para atender? Decime el más urgente primero.")} className="min-h-[38px] px-3.5 rounded-lg text-[13px] font-semibold bg-white text-black hover:bg-zinc-200">Que me cuente</button>
          <button onClick={() => onPreguntar("¿Qué corregí en los últimos borradores antes de enviarlos?")} className="min-h-[38px] px-3.5 rounded-lg text-[13px] font-semibold bg-white/[0.07] hover:bg-white/[0.12] text-zinc-100">Qué corregí</button>
        </div>
      </section>

      {(atendidos.length > 0 || patrones.length > 0) && (
        <section>
          <Titulo>Lo que corregiste al enviar</Titulo>
          {patrones.length > 0 && (
            <ul className="mb-2 space-y-1.5">
              {patrones.map((p) => (
                <li key={p.texto} className="rounded-xl border border-white/[0.14] bg-white/[0.04] px-4 py-3 text-[13.5px] text-zinc-200 leading-snug">
                  {p.texto}
                  <button onClick={() => onPreguntar(`${p.texto} Quiero que lo tengas en cuenta desde ahora: te explico la regla.`)} className="ml-2 font-semibold text-white underline underline-offset-2 hover:text-zinc-300">Anotarlo como regla</button>
                </li>
              ))}
            </ul>
          )}
          {atendidos.length > 0 && (
            <ul className="rounded-xl border border-white/[0.09] divide-y divide-white/[0.06]">
              {atendidos.map((m) => (
                <li key={m.mail_id} className="px-4 py-2.5">
                  <p className="text-[13.5px] font-semibold text-white leading-snug break-words">{limpiarNombre(m.remitente, m.email_cliente)} <span className="font-normal text-zinc-500">· {cuando(m.enviado_en)}</span></p>
                  <p className="text-[12.5px] text-zinc-400 leading-snug">{m.que_cambio || "Respondido sin pasar por un borrador mío."}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section>
        <Titulo>Reglas que tengo anotadas</Titulo>
        {notas.length === 0 ? (
          <p className="rounded-xl border border-white/[0.07] px-4 py-4 text-[13.5px] text-zinc-400">Todavía no hay reglas. Podés anotar una acá o contármela en el chat y la confirmás con un botón. Se suman a las reglas comerciales del sistema.</p>
        ) : (
          <ul className="rounded-xl border border-white/[0.09] divide-y divide-white/[0.06]">
            {notas.map((n) => (
              <li key={n.id} className="flex items-start gap-3 px-4 py-2.5">
                <Check size={15} className="mt-1 shrink-0 text-emerald-400" />
                <span className="min-w-0 flex-1 text-[14px] text-zinc-100 leading-snug break-words">{n.texto}</span>
                <button onClick={() => quitar(n)} className="shrink-0 p-2 -m-1 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.07]" aria-label="Quitar regla"><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={guardarNota} className="mt-2.5 flex gap-2">
          <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} placeholder="Ej: a distribuidores siempre ofrecer 35% desde 10 unidades" className="min-w-0 flex-1 h-11 rounded-lg bg-[#15151a] border border-white/10 focus:border-white/30 px-3 text-base text-white placeholder-zinc-600 outline-none" />
          <button type="submit" disabled={guardando || nota.trim().length < 8} className="shrink-0 min-h-[44px] px-4 rounded-lg bg-white text-black text-[13.5px] font-semibold hover:bg-zinc-200 disabled:opacity-50 inline-flex items-center gap-1.5"><Plus size={15} /> Anotar</button>
        </form>
      </section>
    </div>
  );
}
