import { useState } from "react";
import { BellOff, Clock, FileEdit, Loader2, Mail, MailWarning, RotateCcw } from "lucide-react";
import { api } from "../produccion/util";

const Titulo = ({ children }) => <h4 className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-zinc-500 mb-2">{children}</h4>;
const SEV = {
  ALTA: { texto: "Urgente", clase: "text-red-400" },
  MEDIA: { texto: "Hay que reclamar", clase: "text-amber-300" },
  BAJA: { texto: "Para mirar", clase: "text-zinc-400" },
};
const QUE = { PRESUPUESTO: "Presupuesto", CONSULTA: "Consulta", CORTESIA: "Cortesía", OTRO: "Otro mail" };
const hace = (d) => (d === null || d === undefined ? "—" : d === 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`);

function Dato({ titulo, valor, detalle }) {
  return (
    <div className="rounded-xl border border-white/[0.07] p-3.5">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-zinc-500">{titulo}</p>
      <p className="mt-1 text-[26px] leading-none font-bold text-white tabular-nums">{valor}</p>
      <p className="mt-1.5 text-[12px] text-zinc-500 leading-tight">{detalle}</p>
    </div>
  );
}

function Fila({ h, base, alCambiar, mostrar }) {
  const [ocupado, setOcupado] = useState(null);
  const [menu, setMenu] = useState(false);
  const sev = SEV[h.severidad];
  const rebote = h.estado === "REBOTE";
  const hacer = async (que, body, ok) => {
    setOcupado(que);
    try {
      await api(`${base}/hilos/${encodeURIComponent(h.thread_id)}/${que}`, { method: "POST", body: body || {} });
      mostrar?.(ok);
      alCambiar?.();
    } catch (e) {
      mostrar?.(e.message, "error");
    } finally {
      setOcupado(null);
      setMenu(false);
    }
  };
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        {rebote ? <MailWarning size={16} className="mt-1 shrink-0 text-red-400" /> : <Mail size={16} className="mt-1 shrink-0 text-zinc-500" />}
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold text-white leading-snug break-words">{h.contacto_nombre || h.contacto_email}</p>
          <p className="text-[13px] text-zinc-400 leading-snug break-words">{h.asunto}</p>
          <p className="mt-1 text-[12px] font-semibold">
            {rebote ? <span className="text-red-400">No llegó a destino</span> : sev ? <span className={sev.clase}>{sev.texto}</span> : <span className="text-zinc-500">Todavía es pronto</span>}
            <span className="font-normal text-zinc-500"> · {h.clase ? QUE[h.clase] : "mail"} enviado {hace(h.dias)}</span>
          </p>
          {h.que_enviamos && <p className="mt-0.5 text-[12.5px] text-zinc-500">{h.que_enviamos}</p>}
          {h.envios_sin_respuesta > 1 && <p className="mt-0.5 text-[12.5px] text-amber-300/90">Ya le escribimos {h.envios_sin_respuesta} veces sin respuesta.</p>}
          {h.borrador_id && <p className="mt-0.5 text-[12.5px] text-emerald-400">Borrador de seguimiento listo en Gmail (sin enviar).</p>}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5 pl-7">
        {!rebote && !h.borrador_id && (
          <button onClick={() => hacer("seguimiento", {}, "Listo: el borrador de seguimiento quedó en Gmail, sin enviar.")} disabled={!!ocupado} className="min-h-[38px] px-3 rounded-lg text-[13px] font-semibold bg-white text-black hover:bg-zinc-200 disabled:opacity-60 inline-flex items-center gap-1.5">
            {ocupado === "seguimiento" ? <Loader2 size={14} className="animate-spin" /> : <FileEdit size={14} />} {ocupado === "seguimiento" ? "Redactando…" : "Armar seguimiento"}
          </button>
        )}
        <div className="relative">
          <button onClick={() => setMenu((v) => !v)} aria-expanded={menu} disabled={!!ocupado} className="min-h-[38px] px-3 rounded-lg text-[13px] font-semibold bg-white/[0.07] hover:bg-white/[0.12] text-zinc-100 disabled:opacity-60 inline-flex items-center gap-1.5"><Clock size={14} /> Recordarme después</button>
          {menu && (
            <div className="absolute z-10 mt-1 w-44 rounded-lg border border-white/10 bg-[#15151a] p-1 shadow-xl">
              {[[2, "En 2 días"], [5, "En 5 días"], [10, "En 10 días"]].map(([d, t]) => (
                <button key={d} onClick={() => hacer("posponer", { dias: d }, `Listo: te lo recuerdo ${t.toLowerCase()}.`)} className="w-full text-left min-h-[38px] px-3 rounded-md text-[13px] text-zinc-200 hover:bg-white/[0.08]">{t}</button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => hacer("descartar", {}, "Listo: dejo de seguir este mail.")} disabled={!!ocupado} className="min-h-[38px] px-3 rounded-lg text-[13px] font-semibold bg-white/[0.07] hover:bg-white/[0.12] text-zinc-100 disabled:opacity-60 inline-flex items-center gap-1.5"><BellOff size={14} /> No seguir</button>
      </div>
    </li>
  );
}

/** Panel de Sofi: mails enviados (por Cami o por vos) que el cliente no respondió. Sofi solo deja borradores de seguimiento en Gmail. */
export default function PanoramaSeguimiento({ base, datos, error, onPreguntar, alCambiar, mostrar }) {
  const [filtro, setFiltro] = useState("todos");
  const [volviendo, setVolviendo] = useState(null);
  if (error) return <div className="p-6 text-center text-sm text-zinc-400">{error}</div>;
  if (!datos) return <div className="h-full grid place-items-center text-zinc-500 py-16"><Loader2 className="animate-spin" size={22} /></div>;
  const { conteos: c = {}, hilos = [], pospuestos = [], descartados = [], config = {}, sin_responder: sr = {} } = datos;
  const entrantes = sr.lista || [];

  const conAviso = hilos.filter((h) => h.estado === "REBOTE" || (h.severidad && h.clase !== "CORTESIA"));
  const pronto = hilos.filter((h) => !conAviso.includes(h) && h.clase !== "CORTESIA");
  const visibles = conAviso.filter((h) => (filtro === "presupuestos" ? h.clase === "PRESUPUESTO" : filtro === "urgentes" ? h.severidad === "ALTA" || h.estado === "REBOTE" : true));

  const reabrir = async (h) => {
    setVolviendo(h.thread_id);
    try {
      await api(`${base}/hilos/${encodeURIComponent(h.thread_id)}/reabrir`, { method: "POST", body: {} });
      mostrar?.("Listo: vuelvo a seguir este mail.");
      alCambiar?.();
    } catch (e) {
      mostrar?.(e.message, "error");
    } finally {
      setVolviendo(null);
    }
  };
  const chip = (id, texto) => (
    <button key={id} onClick={() => setFiltro(id)} aria-pressed={filtro === id} className={`min-h-[34px] px-3 rounded-full text-[12.5px] font-semibold border ${filtro === id ? "bg-white text-black border-white" : "bg-white/[0.05] text-zinc-300 border-white/10 hover:bg-white/[0.1]"}`}>{texto}</button>
  );

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-5 py-4 space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Dato titulo="Sin respuesta" valor={c.para_avisar || 0} detalle="para reclamar ahora" />
        <Dato titulo="Presupuestos" valor={c.presupuestos || 0} detalle="enviados sin respuesta" />
        <Dato titulo="Urgentes" valor={(c.urgentes || 0) + (c.rebotes || 0)} detalle="incluye rebotados" />
        <Dato titulo="Respondieron" valor={c.respondidos_30d || 0} detalle="en los últimos 30 días" />
      </div>

      <p className="rounded-xl border border-white/[0.07] px-4 py-3 text-[13px] text-zinc-400 leading-relaxed">
        Sofi revisa <b className="text-zinc-200">todos los mails que enviaron Cami y vos</b> en los últimos {config.ventana_dias || 45} días, sin que tengas que etiquetar nada, y avisa los que no tuvieron respuesta
        (desde los {config.dias_aviso || 3} días; urgentes desde los {config.dias_urgente || 7}). <b className="text-zinc-200">Nunca envía</b>: el seguimiento queda como borrador en Gmail y el envío siempre es tuyo.
      </p>

      <section>
        <Titulo>Escribieron y no les respondimos</Titulo>
        {sr.error && <p className="mb-2 text-[12.5px] text-amber-300">{sr.error}</p>}
        {entrantes.length === 0 ? (
          <p className="rounded-xl border border-white/[0.07] px-4 py-4 text-[13.5px] text-zinc-400">
            {sr.generado ? `No hay clientes esperando respuesta nuestra (miro la bandeja de los últimos ${sr.ventana_dias} días).` : "Todavía no revisé la bandeja de entrada: lo hago en la próxima revisión."}
          </p>
        ) : (
          <ul className="rounded-xl border border-white/[0.09] divide-y divide-white/[0.06]">
            {entrantes.map((h) => (
              <li key={`${h.threadId}-${h.ultimo_msg_id}`} className="px-4 py-3">
                <p className="text-[14.5px] font-semibold text-white leading-snug break-words">{h.contacto_nombre}</p>
                <p className="text-[13px] text-zinc-400 leading-snug break-words">{h.asunto}</p>
                {h.snippet && <p className="mt-1 text-[12.5px] text-zinc-500 leading-snug break-words">“{h.snippet.slice(0, 140)}”</p>}
                <p className={`mt-1 text-[12px] font-semibold ${SEV[h.severidad]?.clase || "text-zinc-400"}`}>
                  {h.dias >= 2 ? `Hace ${h.dias} días sin respuesta` : h.horas >= 24 ? "Hace 1 día sin respuesta" : `Hace ${h.horas} h sin respuesta`}
                  <span className="font-normal text-zinc-500">{h.nuestro_antes ? " · ya veníamos hablando" : " · contacto nuevo"}{h.tiene_borrador ? " · hay un borrador en Gmail" : ""}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-[12px] text-zinc-500">Cuento los mails de personas de afuera (sin promociones ni avisos automáticos) a los que nadie respondió pasadas {sr.minimo_horas || 4} horas. Se actualiza en cada revisión.</p>
      </section>

      <section>
        <Titulo>Esperando respuesta</Titulo>
        <div className="mb-2 flex flex-wrap gap-1.5">{chip("todos", `Todos (${conAviso.length})`)}{chip("presupuestos", "Presupuestos")}{chip("urgentes", "Urgentes")}</div>
        {visibles.length === 0 ? (
          <p className="rounded-xl border border-white/[0.07] px-4 py-5 text-[14px] text-zinc-400">{conAviso.length === 0 ? "Ningún mail enviado quedó sin respuesta. Cuando pase el plazo sin contestación, lo veo acá y te aviso." : "No hay nada con ese filtro."}</p>
        ) : (
          <ul className="rounded-xl border border-white/[0.09] divide-y divide-white/[0.06]">
            {visibles.map((h) => <Fila key={h.thread_id} h={h} base={base} alCambiar={alCambiar} mostrar={mostrar} />)}
          </ul>
        )}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button onClick={() => onPreguntar("¿Qué presupuestos siguen sin respuesta? Decime por cuál empezar a reclamar.")} className="min-h-[38px] px-3.5 rounded-lg text-[13px] font-semibold bg-white text-black hover:bg-zinc-200">Que me cuente</button>
          <button onClick={() => onPreguntar("¿Hay mails que rebotaron o que ya se enfriaron? ¿Los damos por perdidos?")} className="min-h-[38px] px-3.5 rounded-lg text-[13px] font-semibold bg-white/[0.07] hover:bg-white/[0.12] text-zinc-100">Qué se enfrió</button>
        </div>
      </section>

      {pronto.length > 0 && (
        <details className="rounded-xl border border-white/[0.07]">
          <summary className="cursor-pointer px-4 py-3 text-[13.5px] font-semibold text-zinc-300">Todavía es pronto para reclamar ({pronto.length})</summary>
          <ul className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
            {pronto.map((h) => (
              <li key={h.thread_id} className="px-4 py-2.5">
                <p className="text-[13.5px] font-semibold text-white leading-snug break-words">{h.contacto_nombre || h.contacto_email}</p>
                <p className="text-[12.5px] text-zinc-500 leading-snug break-words">{h.asunto} · enviado {hace(h.dias)}</p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {pospuestos.length > 0 && (
        <section>
          <Titulo>Te lo recuerdo después</Titulo>
          <ul className="rounded-xl border border-white/[0.09] divide-y divide-white/[0.06]">
            {pospuestos.map((h) => (
              <li key={h.thread_id} className="px-4 py-2.5 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-white leading-snug break-words">{h.contacto_nombre || h.contacto_email}</p>
                  <p className="text-[12.5px] text-zinc-500 leading-snug break-words">{h.asunto}</p>
                </div>
                <button onClick={() => reabrir(h)} disabled={volviendo === h.thread_id} className="shrink-0 min-h-[38px] px-3 rounded-lg text-[13px] font-semibold bg-white/[0.07] hover:bg-white/[0.12] text-zinc-100 disabled:opacity-60 inline-flex items-center gap-1.5"><RotateCcw size={14} /> Seguir ya</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {descartados.length > 0 && (
        <section>
          <Titulo>Dejé de seguir</Titulo>
          <ul className="rounded-xl border border-white/[0.09] divide-y divide-white/[0.06]">
            {descartados.map((h) => (
              <li key={h.thread_id} className="px-4 py-2.5 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-white leading-snug break-words">{h.contacto_nombre || h.contacto_email}</p>
                  <p className="text-[12.5px] text-zinc-500 leading-snug break-words">{h.asunto}{h.decidido_por ? ` · lo decidió ${h.decidido_por}` : ""}</p>
                </div>
                <button onClick={() => reabrir(h)} disabled={volviendo === h.thread_id} className="shrink-0 min-h-[38px] px-3 rounded-lg text-[13px] font-semibold bg-white/[0.07] hover:bg-white/[0.12] text-zinc-100 disabled:opacity-60 inline-flex items-center gap-1.5"><RotateCcw size={14} /> Volver a seguir</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
