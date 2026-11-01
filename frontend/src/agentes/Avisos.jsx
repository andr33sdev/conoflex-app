import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../produccion/util";
import { cuando, fechaCorta, TIPOS_AVISO } from "./formato";

const ESTADO_TXT = { RESUELTO: "Resuelto", JUSTIFICADA: "Justificada", DESCARTADA: "Descartado" };
const SEV = { ALTA: "Urgente", MEDIA: "", BAJA: "" };

const btn = "min-h-[38px] px-3 rounded-lg text-[13px] font-semibold disabled:opacity-50 transition-colors";

function Aviso({ h, onCambiar, ocupado }) {
  const [justificando, setJustificando] = useState(false);
  const [nota, setNota] = useState("");
  const [verTexto, setVerTexto] = useState(false);
  const tipo = TIPOS_AVISO[h.tipo]?.texto || h.tipo;
  const abierto = h.estado === "ABIERTO";
  const meta = [tipo, h.fecha ? fechaCorta(h.fecha) : "", SEV[h.severidad]].filter(Boolean).join(" · ");
  return (
    <li className={`py-4 ${abierto ? "" : "opacity-55"}`}>
      <div className="flex gap-3">
        <span className={`mt-[7px] w-2 h-2 shrink-0 ${h.severidad === "ALTA" && abierto ? "bg-[#FF5A00]" : "bg-zinc-600"}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-zinc-500">{meta}</p>
          <p className="mt-1 text-[15px] font-semibold text-white leading-snug break-words">{h.titulo}</p>
          {h.texto && (verTexto || !abierto) && <p className="mt-1 text-[13.5px] text-zinc-400 leading-relaxed break-words">{h.texto}</p>}
          {h.texto && abierto && <button onClick={() => setVerTexto((v) => !v)} aria-expanded={verTexto} className="mt-1 text-[12.5px] font-semibold text-zinc-500 hover:text-white">{verTexto ? "Ocultar detalle" : "Ver detalle"}</button>}
          {!abierto && (
            <p className="mt-1.5 text-xs text-zinc-500">
              {ESTADO_TXT[h.estado] || h.estado}
              {h.resuelto_por ? ` · ${h.resuelto_por}` : ""} · {cuando(h.resuelto_en)}
              {h.nota ? ` · “${h.nota}”` : ""}
            </p>
          )}
          {abierto && !justificando && (
            <div className="mt-2.5 flex flex-wrap gap-1.5 -ml-1">
              {h.tipo === "POSIBLE_FALTA" && (
                <button onClick={() => setJustificando(true)} disabled={ocupado} className={`${btn} bg-white text-black hover:bg-zinc-200`}>Justificar falta</button>
              )}
              <button onClick={() => onCambiar(h, "RESUELTO")} disabled={ocupado} className={`${btn} bg-white/[0.07] text-zinc-100 hover:bg-white/[0.12]`}>Ya lo resolví</button>
              <button onClick={() => onCambiar(h, "DESCARTADA")} disabled={ocupado} className={`${btn} text-zinc-500 hover:text-white hover:bg-white/[0.06]`}>Descartar</button>
            </div>
          )}
          {abierto && justificando && (
            <div className="mt-3">
              <input
                autoFocus
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                maxLength={300}
                placeholder="Motivo (opcional): certificado médico, trámite…"
                className="w-full h-11 rounded-lg bg-[#15151a] border border-white/10 focus:border-white/30 px-3 text-base text-white placeholder-zinc-600 outline-none"
              />
              <div className="mt-2 flex gap-1.5">
                <button onClick={() => onCambiar(h, "JUSTIFICADA", nota)} disabled={ocupado} className={`${btn} bg-white text-black hover:bg-zinc-200`}>Guardar</button>
                <button onClick={() => setJustificando(false)} className={`${btn} text-zinc-400 hover:text-white`}>Cancelar</button>
              </div>
            </div>
          )}
          {!abierto && (
            <button onClick={() => onCambiar(h, "ABIERTO")} disabled={ocupado} className="mt-1 text-xs font-semibold text-zinc-500 hover:text-white disabled:opacity-50">Reabrir</button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function Avisos({ agenteId, nombre, version, alCambiar, mostrar }) {
  const [todos, setTodos] = useState(false);
  const [lista, setLista] = useState(null);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await api(`/api/agentes/${agenteId}/hallazgos${todos ? "?estado=todos" : ""}`);
      setLista(r);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [agenteId, todos]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar, version]);

  const cambiar = async (h, estado, nota) => {
    setOcupado(true);
    try {
      await api(`/api/agentes/${agenteId}/hallazgos/${h.id}`, { method: "PUT", body: { estado, nota } });
      mostrar(estado === "ABIERTO" ? "Aviso reabierto." : "Listo, quedó registrado.");
      await cargar();
      alCambiar();
    } catch (e) {
      mostrar(e.message, "error");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-5 py-4">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-zinc-500">{todos ? "Abiertos e historial" : "Pendientes de atender"}</p>
        <button onClick={() => setTodos((v) => !v)} className="text-[12.5px] font-semibold text-zinc-400 hover:text-white">
          {todos ? "Ver solo abiertos" : "Ver también resueltos"}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-zinc-300 border border-white/10 rounded-xl p-3">{error}</p>}
      {!lista && !error && <div className="py-10 grid place-items-center text-zinc-500"><Loader2 className="animate-spin" size={20} /></div>}
      {lista && lista.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-[15px] font-semibold text-white">Todo en orden</p>
          <p className="mt-1 text-sm text-zinc-500">No hay nada pendiente. {nombre} te avisa cuando aparezca algo.</p>
        </div>
      )}
      {lista && lista.length > 0 && (
        <ul className="mt-1 divide-y divide-white/[0.06]">
          {lista.map((h) => (
            <Aviso key={h.id} h={h} onCambiar={cambiar} ocupado={ocupado} />
          ))}
        </ul>
      )}
    </div>
  );
}
