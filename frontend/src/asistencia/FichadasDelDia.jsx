import { useState } from "react";
import { ArrowLeftRight, Plus, Trash2, Check, X } from "lucide-react";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "";
const url = (p) => `${API_BASE_URL}${p}`;

async function llamar(path, method, body) {
  const res = await fetch(url(path), {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "No se pudo guardar el cambio.");
  return data;
}

/**
 * Fichadas del día de un operario, con alta, cambio de tipo y quitar.
 * `fichadas`: [{ id, tipo, hora, fechaISO, metodo, manual, otroDia }] ya ordenadas.
 */
export default function FichadasDelDia({ operario, fechaISO, fichadas, alCambiar }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [quitando, setQuitando] = useState(null);
  const [agregando, setAgregando] = useState(false);
  const [tipo, setTipo] = useState("SALIDA");
  const [fecha, setFecha] = useState(fechaISO);
  const [hora, setHora] = useState("");
  const [motivo, setMotivo] = useState("");

  const ejecutar = async (fn) => {
    setOcupado(true);
    setError("");
    try {
      await fn();
      await alCambiar();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const cambiarTipo = (f) =>
    ejecutar(() => llamar(`/api/fichero/fichadas/${f.id}/tipo`, "PATCH", { tipo: f.tipo === "ENTRADA" ? "SALIDA" : "ENTRADA", motivo: "Corregido desde el calendario" }));

  const quitar = async (f) => {
    if (await ejecutar(() => llamar(`/api/fichero/fichadas/${f.id}?motivo=${encodeURIComponent("Quitada desde el calendario")}`, "DELETE"))) setQuitando(null);
  };

  const agregar = async () => {
    if (!hora) return setError("Poné la hora.");
    const ok = await ejecutar(() => llamar("/api/fichero/fichadas/manual", "POST", { nombre: operario, fecha_hora: `${fecha} ${hora}`, tipo, motivo: motivo.trim() || "Cargada desde el calendario" }));
    if (ok) {
      setAgregando(false);
      setHora("");
      setMotivo("");
    }
  };

  const colorTipo = (t) => (t === "ENTRADA" ? "text-emerald-400 border-emerald-700/50 bg-emerald-950/30" : "text-amber-300 border-amber-700/50 bg-amber-950/30");

  return (
    <div className="border border-zinc-800 p-3.5 rounded-lg bg-[#121212] flex flex-col gap-3">
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
        <span className="font-bold text-[#FF5A00] uppercase tracking-wider text-[11px]">Fichadas de {operario}</span>
        {!agregando && (
          <button type="button" onClick={() => { setAgregando(true); setFecha(fechaISO); setError(""); }} className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300 hover:text-white cursor-pointer">
            <Plus size={12} /> Agregar
          </button>
        )}
      </div>

      {fichadas.length === 0 && !agregando && <p className="text-[11px] text-zinc-500">No hay fichadas este día.</p>}

      <ul className="flex flex-col gap-1.5">
        {fichadas.map((f) => (
          <li key={f.id} className="flex items-center gap-2 bg-[#0D0D0D] border border-zinc-800 rounded-md px-2.5 py-1.5">
            <span className={`text-[9px] font-black tracking-wider px-1.5 py-0.5 rounded border ${colorTipo(f.tipo)}`}>{f.tipo}</span>
            <span className="font-mono font-bold text-white text-xs">{f.hora}</span>
            {f.otroDia && <span className="text-[9px] text-zinc-500">día siguiente</span>}
            {f.manual && <span className="text-[9px] text-blue-300 bg-blue-900/40 border border-blue-700/40 rounded px-1">manual</span>}
            <span className="flex-1" />
            {quitando === f.id ? (
              <span className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-400">¿Quitar?</span>
                <button type="button" disabled={ocupado} onClick={() => quitar(f)} className="p-1 rounded bg-rose-900/60 text-rose-200 hover:bg-rose-800 cursor-pointer" title="Sí, quitar"><Check size={12} /></button>
                <button type="button" onClick={() => setQuitando(null)} className="p-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 cursor-pointer" title="No"><X size={12} /></button>
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <button type="button" disabled={ocupado} onClick={() => cambiarTipo(f)} className="flex items-center gap-1 text-[10px] font-bold text-zinc-300 hover:text-white px-1.5 py-1 rounded hover:bg-zinc-800 cursor-pointer" title={`Cambiar a ${f.tipo === "ENTRADA" ? "SALIDA" : "ENTRADA"}`}>
                  <ArrowLeftRight size={11} /> {f.tipo === "ENTRADA" ? "Es salida" : "Es entrada"}
                </button>
                <button type="button" disabled={ocupado} onClick={() => setQuitando(f.id)} className="p-1 rounded text-zinc-500 hover:text-rose-300 hover:bg-zinc-800 cursor-pointer" title="Quitar esta fichada"><Trash2 size={12} /></button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {agregando && (
        <div className="flex flex-col gap-2.5 bg-[#0D0D0D] border border-zinc-700 rounded-md p-3">
          <div className="flex gap-1.5">
            {["ENTRADA", "SALIDA"].map((t) => (
              <button key={t} type="button" onClick={() => setTipo(t)} className={`flex-1 text-[10px] font-black tracking-wider py-1.5 rounded border cursor-pointer ${tipo === t ? colorTipo(t) : "border-zinc-800 text-zinc-500 hover:text-zinc-300"}`}>{t}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="flex-1 bg-[#18181b] border border-zinc-700 text-white font-mono text-xs p-2 rounded focus:border-[#FF5A00] outline-none" />
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="w-28 bg-[#18181b] border border-zinc-700 text-white font-mono font-bold text-xs p-2 rounded focus:border-[#FF5A00] outline-none" />
          </div>
          <p className="text-[9px] text-zinc-500 -mt-1">Para una salida de turno noche, cambiá la fecha al día siguiente.</p>
          <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Motivo (opcional): se olvidó de fichar…" className="bg-[#18181b] border border-zinc-700 text-white text-xs p-2 rounded focus:border-[#FF5A00] outline-none" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setAgregando(false); setError(""); }} className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 hover:text-white uppercase tracking-wider cursor-pointer">Cancelar</button>
            <button type="button" disabled={ocupado} onClick={agregar} className="bg-[#FF5A00] hover:bg-[#ff6e1f] disabled:opacity-60 text-white font-bold uppercase tracking-widest text-[10px] px-4 py-1.5 rounded cursor-pointer">Agregar fichada</button>
          </div>
        </div>
      )}

      {error && <p className="text-[11px] text-rose-300 bg-rose-950/30 border border-rose-900/50 rounded px-2.5 py-1.5">{error}</p>}
    </div>
  );
}
