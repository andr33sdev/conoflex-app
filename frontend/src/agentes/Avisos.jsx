import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarDays, Check, CheckCheck, EyeOff, Loader2, RotateCcw, UserX, X } from "lucide-react";
import { api } from "../produccion/util";
import { Chip } from "../produccion/ui";
import { cuando, fechaCorta, TIPOS_AVISO } from "./formato";

const BORDE = { ALTA: "border-l-rose-500", MEDIA: "border-l-[#FF5A00]", BAJA: "border-l-sky-400" };
const ESTADO_TXT = { RESUELTO: "Resuelto", JUSTIFICADA: "Justificada", DESCARTADA: "Descartado" };

const ICONOS = { FERIADO: CalendarDays, CIERRE_QUINCENA: CalendarDays, POSIBLE_FALTA: UserX };

function Aviso({ h, onCambiar, ocupado }) {
  const [justificando, setJustificando] = useState(false);
  const [nota, setNota] = useState("");
  const Icono = ICONOS[h.tipo] || AlertTriangle;
  const tipo = TIPOS_AVISO[h.tipo] || { texto: h.tipo, tono: "gris" };
  const abierto = h.estado === "ABIERTO";
  return (
    <li className={`rounded-2xl border border-white/[0.07] border-l-4 ${BORDE[h.severidad] || "border-l-zinc-600"} bg-[#111116] p-3.5 ${abierto ? "" : "opacity-60"}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 w-9 h-9 shrink-0 rounded-xl bg-white/[0.05] grid place-items-center text-zinc-300">
          <Icono size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Chip tono={tipo.tono}>{tipo.texto}</Chip>
            {h.fecha && <span className="text-[11px] font-semibold text-zinc-500">{fechaCorta(h.fecha)}</span>}
          </div>
          <p className="mt-1.5 text-[15px] font-bold text-white leading-snug break-words">{h.titulo}</p>
          {h.texto && <p className="mt-1 text-[13.5px] text-zinc-400 leading-relaxed break-words">{h.texto}</p>}
          {!abierto && (
            <p className="mt-2 text-xs text-zinc-500">
              {ESTADO_TXT[h.estado] || h.estado}
              {h.resuelto_por ? ` · ${h.resuelto_por}` : ""} · {cuando(h.resuelto_en)}
              {h.nota ? ` · “${h.nota}”` : ""}
            </p>
          )}
        </div>
      </div>

      {abierto && !justificando && (
        <div className="mt-3 flex flex-wrap gap-2 pl-12">
          {h.tipo === "POSIBLE_FALTA" && (
            <button onClick={() => setJustificando(true)} disabled={ocupado} className="min-h-[40px] px-3.5 rounded-xl bg-[#FFD60A] text-black text-[13px] font-bold hover:bg-white disabled:opacity-50 inline-flex items-center gap-1.5">
              <CheckCheck size={15} /> Justificar falta
            </button>
          )}
          <button onClick={() => onCambiar(h, "RESUELTO")} disabled={ocupado} className="min-h-[40px] px-3.5 rounded-xl bg-white/[0.07] border border-white/10 text-zinc-100 text-[13px] font-bold hover:bg-white/[0.12] disabled:opacity-50 inline-flex items-center gap-1.5">
            <Check size={15} /> Ya lo resolví
          </button>
          <button onClick={() => onCambiar(h, "DESCARTADA")} disabled={ocupado} className="min-h-[40px] px-3.5 rounded-xl text-zinc-500 text-[13px] font-semibold hover:text-white hover:bg-white/[0.06] disabled:opacity-50 inline-flex items-center gap-1.5">
            <EyeOff size={15} /> Descartar
          </button>
        </div>
      )}
      {abierto && justificando && (
        <div className="mt-3 pl-12">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Motivo (opcional)</label>
          <input
            autoFocus
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            maxLength={300}
            placeholder="Ej: certificado médico, trámite…"
            className="w-full h-11 rounded-xl bg-black/40 border border-white/10 focus:border-[#FF5A00] px-3 text-base text-white placeholder-zinc-600 outline-none"
          />
          <div className="mt-2 flex gap-2">
            <button onClick={() => onCambiar(h, "JUSTIFICADA", nota)} disabled={ocupado} className="min-h-[40px] px-4 rounded-xl bg-[#FFD60A] text-black text-[13px] font-bold hover:bg-white disabled:opacity-50">Guardar justificación</button>
            <button onClick={() => setJustificando(false)} className="min-h-[40px] px-3 rounded-xl text-zinc-400 text-[13px] font-semibold hover:text-white inline-flex items-center gap-1"><X size={14} /> Cancelar</button>
          </div>
        </div>
      )}
      {!abierto && (
        <div className="mt-2 pl-12">
          <button onClick={() => onCambiar(h, "ABIERTO")} disabled={ocupado} className="text-xs font-semibold text-zinc-500 hover:text-white inline-flex items-center gap-1 disabled:opacity-50">
            <RotateCcw size={12} /> Reabrir
          </button>
        </div>
      )}
    </li>
  );
}

export default function Avisos({ agenteId, version, alCambiar, mostrar }) {
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
    <div className="p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-zinc-500 font-semibold">{todos ? "Abiertos e historial" : "Pendientes de atender"}</p>
        <button onClick={() => setTodos((v) => !v)} className="text-xs font-bold text-[#ff8a4d] hover:text-white">
          {todos ? "Ver solo abiertos" : "Ver también resueltos"}
        </button>
      </div>
      {error && <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">{error}</p>}
      {!lista && !error && (
        <div className="py-10 grid place-items-center text-zinc-500"><Loader2 className="animate-spin" size={20} /></div>
      )}
      {lista && lista.length === 0 && (
        <div className="py-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 grid place-items-center text-emerald-300"><CheckCheck size={22} /></div>
          <p className="mt-3 text-[15px] font-bold text-white">Todo en orden</p>
          <p className="mt-1 text-sm text-zinc-500">No hay nada pendiente. Lía te avisa cuando aparezca algo.</p>
        </div>
      )}
      {lista && lista.length > 0 && (
        <ul className="space-y-2.5">
          {lista.map((h) => (
            <Aviso key={h.id} h={h} onCambiar={cambiar} ocupado={ocupado} />
          ))}
        </ul>
      )}
    </div>
  );
}
