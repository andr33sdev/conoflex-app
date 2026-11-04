import { useRef, useState } from "react";
import { FileText, Paperclip, Plus, X } from "lucide-react";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "";
const dmy = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : "");
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

async function enviar(path, { method = "POST", body, json } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, { method, ...(json ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) } : { body }) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "No se pudo guardar.");
  return d;
}

/** Abre un adjunto (el servidor pide sesión, por eso se baja y se abre desde acá). */
async function abrirArchivo(a) {
  const res = await fetch(`${API_BASE_URL}/api/legajo/archivos/${a.id}`);
  if (!res.ok) throw new Error("No se pudo abrir el archivo.");
  const url = URL.createObjectURL(await res.blob());
  const w = window.open(url, "_blank");
  if (!w) {
    const l = document.createElement("a");
    l.href = url;
    l.download = a.nombre;
    l.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const estiloSancion = (s) => (s.anulada ? "border-zinc-800 bg-[#0D0D0D] opacity-60" : s.tipo === "SUSPENSION" ? "border-rose-800/70 bg-rose-950/20" : "border-amber-800/50 bg-amber-950/10");

function Formulario({ operario, proxima, alCerrar, alGuardar }) {
  const [fecha, setFecha] = useState(hoyISO());
  const [motivo, setMotivo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [archivos, setArchivos] = useState([]);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const input = useRef(null);
  const esSusp = proxima.tipo === "SUSPENSION";

  const guardar = async () => {
    setOcupado(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("operario", operario);
      fd.append("fecha", fecha);
      fd.append("motivo", motivo);
      fd.append("detalle", detalle);
      if (esSusp) {
        fd.append("suspension_desde", desde);
        fd.append("suspension_hasta", hasta);
      }
      archivos.forEach((a) => fd.append("archivos", a));
      await enviar("/api/legajo/sanciones", { body: fd });
      alGuardar();
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const campo = "w-full bg-[#18181b] border border-zinc-700 text-white text-xs p-2 rounded focus:border-[#FF5A00] outline-none";
  return (
    <div className="rounded-lg border border-zinc-700 bg-[#121212] p-4 flex flex-col gap-3">
      <p className={`text-xs font-bold px-3 py-2 rounded border ${esSusp ? "text-rose-200 bg-rose-950/40 border-rose-800/60" : "text-amber-200 bg-amber-950/30 border-amber-800/50"}`}>
        {esSusp ? "Esta va a ser una SUSPENSIÓN (3.ª sanción)." : `Esta va a ser la ${proxima.etiqueta}.`}
      </p>
      <div className="grid grid-cols-[150px_1fr] gap-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Fecha<input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${campo} mt-1 font-mono`} /></label>
        <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Motivo<input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={255} placeholder="Ej: llegadas tarde reiteradas" className={`${campo} mt-1`} /></label>
      </div>
      <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Detalle (opcional)<textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={3} maxLength={4000} className={`${campo} mt-1`} /></label>
      {esSusp && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Suspendido desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={`${campo} mt-1 font-mono`} /></label>
          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Hasta (inclusive)<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={`${campo} mt-1 font-mono`} /></label>
        </div>
      )}
      <div>
        <input ref={input} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx" className="hidden" onChange={(e) => { setArchivos((a) => [...a, ...Array.from(e.target.files)].slice(0, 5)); e.target.value = ""; }} />
        <button type="button" onClick={() => input.current?.click()} className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-300 hover:text-white cursor-pointer"><Paperclip size={13} /> Adjuntar acta o foto (PDF, imagen o Word, hasta 6 MB)</button>
        {archivos.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {archivos.map((a, i) => (
              <li key={i} className="flex items-center gap-2 text-[11px] text-zinc-300 bg-[#0D0D0D] border border-zinc-800 rounded px-2.5 py-1.5">
                <FileText size={12} className="text-zinc-500" /><span className="truncate">{a.name}</span><span className="text-zinc-600">{kb(a.size)}</span>
                <button type="button" onClick={() => setArchivos((x) => x.filter((_, j) => j !== i))} className="ml-auto text-zinc-500 hover:text-rose-300 cursor-pointer" aria-label="Quitar"><X size={12} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-[11px] text-rose-300 bg-rose-950/30 border border-rose-900/50 rounded px-2.5 py-1.5">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={alCerrar} className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 hover:text-white uppercase tracking-wider cursor-pointer">Cancelar</button>
        <button type="button" disabled={ocupado} onClick={guardar} className="bg-[#FF5A00] hover:bg-[#ff6e1f] disabled:opacity-60 text-white font-bold uppercase tracking-widest text-[10px] px-4 py-1.5 rounded cursor-pointer">{ocupado ? "Guardando…" : "Registrar"}</button>
      </div>
    </div>
  );
}

function Tarjeta({ s, alCambiar }) {
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const input = useRef(null);
  const accion = async (fn) => {
    setError("");
    try {
      await fn();
      alCambiar();
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <li className={`rounded-lg border p-3.5 ${estiloSancion(s)}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${s.anulada ? "bg-zinc-800 text-zinc-400" : s.tipo === "SUSPENSION" ? "bg-rose-900/60 text-rose-100" : "bg-amber-900/50 text-amber-100"}`}>{s.etiqueta}</span>
        <span className="text-xs text-zinc-400">{dmy(s.fecha)}</span>
        <span className="text-[11px] text-zinc-600 ml-auto">cargada por {s.creado_por || "—"}</span>
      </div>
      <p className={`mt-2 text-sm font-semibold ${s.anulada ? "line-through text-zinc-500" : "text-white"}`}>{s.motivo}</p>
      {s.detalle && <p className="mt-1 text-xs text-zinc-400 whitespace-pre-wrap">{s.detalle}</p>}
      {s.suspension_desde && <p className="mt-1.5 text-xs text-rose-200">Suspendido del {dmy(s.suspension_desde)}{s.suspension_hasta ? ` al ${dmy(s.suspension_hasta)}` : ""}</p>}
      {s.anulada && <p className="mt-1.5 text-xs text-zinc-500">Anulada el {dmy(s.anulada_en?.slice(0, 10))} por {s.anulada_por || "—"}: “{s.anulada_motivo}”</p>}
      {s.archivos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {s.archivos.map((a) => (
            <li key={a.id} className="flex items-center rounded-md bg-[#0D0D0D] border border-zinc-800 text-[11px]">
              <button type="button" onClick={() => accion(() => abrirArchivo(a))} className="flex items-center gap-1.5 px-2.5 py-1 text-zinc-200 hover:text-white cursor-pointer"><FileText size={12} className="text-zinc-500" /><span className="truncate max-w-[180px]">{a.nombre}</span></button>
              {!s.anulada && <button type="button" onClick={() => accion(() => enviar(`/api/legajo/archivos/${a.id}`, { method: "DELETE" }))} className="px-1.5 text-zinc-600 hover:text-rose-300 cursor-pointer" aria-label={`Quitar ${a.nombre}`} title="Quitar adjunto"><X size={11} /></button>}
            </li>
          ))}
        </ul>
      )}
      {!s.anulada && !anulando && (
        <div className="mt-2.5 flex gap-3">
          <input ref={input} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx" className="hidden" onChange={(e) => { const fd = new FormData(); Array.from(e.target.files).slice(0, 5).forEach((a) => fd.append("archivos", a)); e.target.value = ""; accion(() => enviar(`/api/legajo/sanciones/${s.id}/archivos`, { body: fd })); }} />
          <button type="button" onClick={() => input.current?.click()} className="text-[11px] font-bold text-zinc-400 hover:text-white cursor-pointer">Adjuntar</button>
          <button type="button" onClick={() => setAnulando(true)} className="text-[11px] font-bold text-zinc-500 hover:text-rose-300 cursor-pointer">Anular</button>
        </div>
      )}
      {anulando && (
        <div className="mt-3 flex flex-col gap-2">
          <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={255} placeholder="¿Por qué se anula? (queda registrado)" className="w-full bg-[#18181b] border border-zinc-700 text-white text-xs p-2 rounded focus:border-[#FF5A00] outline-none" />
          <p className="text-[10px] text-zinc-500">Al anularla deja de contar y las siguientes se renumeran.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => accion(() => enviar(`/api/legajo/sanciones/${s.id}/anular`, { json: { motivo } }))} className="px-3 py-1.5 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-100 text-[10px] font-bold uppercase tracking-wider cursor-pointer">Anular sanción</button>
            <button type="button" onClick={() => setAnulando(false)} className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 hover:text-white uppercase tracking-wider cursor-pointer">Cancelar</button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
    </li>
  );
}

/** Amonestaciones y suspensión: la 1.ª y la 2.ª son amonestaciones, la 3.ª es suspensión. */
export default function Sanciones({ operario, datos, alCambiar }) {
  const [abierto, setAbierto] = useState(false);
  const { sanciones, vigentes, proxima } = datos;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-[#121212] px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">{vigentes === 0 ? "Sin sanciones" : vigentes === 1 ? "1 sanción vigente" : `${vigentes} sanciones vigentes`}</p>
          <p className={`text-xs mt-0.5 ${proxima.tipo === "SUSPENSION" ? "text-rose-300" : "text-zinc-500"}`}>La próxima va a ser {proxima.tipo === "SUSPENSION" ? "una suspensión" : `la ${proxima.etiqueta}`}.</p>
        </div>
        {!abierto && <button type="button" onClick={() => setAbierto(true)} className="ml-auto flex items-center gap-1.5 bg-[#FF5A00] hover:bg-[#ff6e1f] text-white font-bold uppercase tracking-widest text-[10px] px-3.5 py-2 rounded cursor-pointer"><Plus size={13} /> Registrar</button>}
      </div>
      {abierto && <Formulario operario={operario} proxima={proxima} alCerrar={() => setAbierto(false)} alGuardar={() => { setAbierto(false); alCambiar(); }} />}
      {sanciones.length === 0 && !abierto && <p className="text-sm text-zinc-500 text-center py-8">No tiene amonestaciones ni suspensiones registradas.</p>}
      <ul className="flex flex-col gap-2.5">
        {sanciones.map((s) => <Tarjeta key={s.id} s={s} alCambiar={alCambiar} />)}
      </ul>
    </div>
  );
}
