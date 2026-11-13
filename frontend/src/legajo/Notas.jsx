// Notas personales sobre el operario: lo bueno y lo malo que uno va viendo, para tenerlo a mano al tomar decisiones.
// Cada nota puede marcarse positiva (verde) o negativa (roja). Solo las ve quien las escribió.
import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Lock, Pencil, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "";
const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fechaLarga = (f) => new Date(`${f}T12:00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });

async function llamar(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "No se pudo completar.");
  return d;
}

const TONOS = {
  POSITIVO: { texto: "Positiva", icono: ThumbsUp, activo: "bg-emerald-500/15 border-emerald-500 text-emerald-300", borde: "border-l-emerald-500", chip: "text-emerald-300" },
  NEGATIVO: { texto: "Negativa", icono: ThumbsDown, activo: "bg-rose-500/15 border-rose-500 text-rose-300", borde: "border-l-rose-500", chip: "text-rose-300" },
};

/** Elegir positiva / negativa (tocando de nuevo se quita: queda sin marca). */
function ElegirTono({ valor, onCambio }) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label="Tipo de nota">
      {Object.entries(TONOS).map(([k, t]) => {
        const I = t.icono;
        return (
          <button key={k} type="button" role="radio" aria-checked={valor === k} onClick={() => onCambio(valor === k ? null : k)} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold cursor-pointer transition-colors ${valor === k ? t.activo : "border-zinc-700 text-zinc-400 hover:text-white"}`}>
            <I size={14} /> {t.texto}
          </button>
        );
      })}
    </div>
  );
}

function Nota({ n, alCambiar, setError }) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ texto: n.texto, tono: n.tono, fecha: n.fecha });
  const [borrar, setBorrar] = useState(false);
  const t = TONOS[n.tono];
  const guardar = async () => {
    try {
      await llamar(`/api/legajo/notas/${n.id}`, { method: "PUT", body: f });
      setEditando(false);
      alCambiar();
    } catch (e) {
      setError(e.message);
    }
  };
  const quitar = async () => {
    try {
      await llamar(`/api/legajo/notas/${n.id}`, { method: "DELETE" });
      alCambiar();
    } catch (e) {
      setError(e.message);
    }
  };
  const Icono = t?.icono;
  return (
    <li className={`rounded-lg border border-zinc-800 border-l-4 ${t ? t.borde : "border-l-zinc-700"} bg-[#121212] p-3.5`}>
      {editando ? (
        <div className="flex flex-col gap-2.5">
          <textarea value={f.texto} onChange={(e) => setF((x) => ({ ...x, texto: e.target.value }))} rows={3} autoFocus className="w-full bg-[#18181b] border border-zinc-700 focus:border-[#FF5A00] rounded-lg p-2.5 text-sm text-white outline-none resize-y" />
          <div className="flex flex-wrap items-center gap-2">
            <ElegirTono valor={f.tono} onCambio={(tono) => setF((x) => ({ ...x, tono }))} />
            <input type="date" value={f.fecha} max={hoy()} onChange={(e) => setF((x) => ({ ...x, fecha: e.target.value }))} aria-label="Fecha" className="bg-[#18181b] border border-zinc-700 text-white text-xs p-2 rounded-lg outline-none focus:border-[#FF5A00] [color-scheme:dark]" />
            <span className="flex-1" />
            <button onClick={guardar} disabled={!f.texto.trim()} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-[#FF5A00] text-black text-xs font-bold cursor-pointer disabled:opacity-50"><Check size={14} /> Guardar</button>
            <button onClick={() => { setEditando(false); setF({ texto: n.texto, tono: n.tono, fecha: n.fecha }); }} className="px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-white cursor-pointer">Cancelar</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <p className="flex-1 text-xs text-zinc-500">
              {fechaLarga(n.fecha)}
              {t && <span className={`ml-2 inline-flex items-center gap-1 font-bold ${t.chip}`}>{Icono && <Icono size={12} />} {t.texto}</span>}
              {n.editado_en && <span className="ml-2 text-zinc-600">· editada</span>}
            </p>
            {!borrar && (
              <>
                <button onClick={() => setEditando(true)} aria-label="Editar nota" className="w-7 h-7 grid place-items-center rounded text-zinc-500 hover:text-white hover:bg-zinc-800 cursor-pointer"><Pencil size={13} /></button>
                <button onClick={() => setBorrar(true)} aria-label="Borrar nota" className="w-7 h-7 grid place-items-center rounded text-zinc-500 hover:text-rose-300 hover:bg-zinc-800 cursor-pointer"><Trash2 size={13} /></button>
              </>
            )}
          </div>
          <p className="mt-1 text-sm text-zinc-100 whitespace-pre-wrap leading-relaxed">{n.texto}</p>
          {borrar && (
            <div className="mt-2.5 flex items-center gap-2 text-xs">
              <span className="text-rose-200 flex-1">¿Borrar esta nota? No se puede recuperar.</span>
              <button onClick={quitar} className="px-3 py-1.5 rounded bg-rose-600 text-white font-bold cursor-pointer">Borrar</button>
              <button onClick={() => setBorrar(false)} aria-label="No borrar" className="px-2 py-1.5 rounded text-zinc-400 hover:text-white cursor-pointer"><X size={14} /></button>
            </div>
          )}
        </>
      )}
    </li>
  );
}

export default function Notas({ operario, alContar }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [nueva, setNueva] = useState({ texto: "", tono: null, fecha: hoy() });
  const [guardando, setGuardando] = useState(false);
  const [filtro, setFiltro] = useState("TODAS");

  const cargar = useCallback(() => {
    llamar(`/api/legajo/notas?operario=${encodeURIComponent(operario)}`)
      .then((d) => {
        setDatos(d);
        alContar?.(d.total);
      })
      .catch((e) => setError(e.message));
  }, [operario, alContar]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError("");
    try {
      await llamar("/api/legajo/notas", { method: "POST", body: { operario, ...nueva } });
      setNueva({ texto: "", tono: null, fecha: hoy() });
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const visibles = (datos?.notas || []).filter((n) => filtro === "TODAS" || n.tono === filtro);

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={guardar} className="rounded-lg border border-zinc-800 bg-[#121212] p-3.5 flex flex-col gap-2.5">
        <label htmlFor="nota-texto" className="text-xs font-bold text-zinc-300">Nueva nota sobre {operario}</label>
        <textarea id="nota-texto" value={nueva.texto} onChange={(e) => setNueva((x) => ({ ...x, texto: e.target.value }))} rows={3} placeholder="Ej: se quedó después de hora para terminar el pedido de Vialidad sin que se lo pidieran." className="w-full bg-[#18181b] border border-zinc-700 focus:border-[#FF5A00] rounded-lg p-2.5 text-sm text-white outline-none resize-y placeholder:text-zinc-600" />
        <div className="flex flex-wrap items-center gap-2">
          <ElegirTono valor={nueva.tono} onCambio={(tono) => setNueva((x) => ({ ...x, tono }))} />
          <input type="date" value={nueva.fecha} max={hoy()} onChange={(e) => setNueva((x) => ({ ...x, fecha: e.target.value }))} aria-label="Fecha de la nota" className="bg-[#18181b] border border-zinc-700 text-white text-xs p-2 rounded-lg outline-none focus:border-[#FF5A00] [color-scheme:dark]" />
          <span className="flex-1" />
          <button type="submit" disabled={guardando || !nueva.texto.trim()} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FF5A00] hover:bg-[#ff7a2e] text-black text-xs font-bold cursor-pointer disabled:opacity-50">
            {guardando && <Loader2 size={14} className="animate-spin" />} Guardar nota
          </button>
        </div>
        <p className="text-[11px] text-zinc-500 flex items-center gap-1.5"><Lock size={11} /> Solo vos ves tus notas.</p>
      </form>

      {error && <p className="text-sm text-rose-300">{error}</p>}
      {!datos ? (
        <div className="grid place-items-center py-10 text-zinc-500"><Loader2 className="animate-spin" size={20} /></div>
      ) : datos.total === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-8">Todavía no escribiste notas sobre {operario}.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {[["TODAS", `Todas (${datos.total})`], ["POSITIVO", `Positivas (${datos.positivas})`], ["NEGATIVO", `Negativas (${datos.negativas})`]].map(([k, t]) => (
              <button key={k} onClick={() => setFiltro(k)} className={`px-3 py-1.5 rounded text-[11px] font-bold cursor-pointer ${filtro === k ? (k === "POSITIVO" ? "bg-emerald-500/20 text-emerald-300" : k === "NEGATIVO" ? "bg-rose-500/20 text-rose-300" : "bg-[#FF5A00] text-white") : "bg-zinc-900 text-zinc-400 hover:text-white"}`}>{t}</button>
            ))}
            {(datos.positivas > 0 || datos.negativas > 0) && (
              <div className="ml-auto flex items-center gap-2 min-w-[140px]" title={`${datos.positivas} positivas · ${datos.negativas} negativas`}>
                <div className="flex-1 h-2 rounded-full overflow-hidden bg-zinc-800 flex">
                  <div className="h-full bg-emerald-500" style={{ width: `${(datos.positivas / (datos.positivas + datos.negativas)) * 100}%` }} />
                  <div className="h-full bg-rose-500" style={{ width: `${(datos.negativas / (datos.positivas + datos.negativas)) * 100}%` }} />
                </div>
                <span className="text-[11px] tabular-nums text-zinc-400"><span className="text-emerald-300">{datos.positivas}</span> / <span className="text-rose-300">{datos.negativas}</span></span>
              </div>
            )}
          </div>
          <ul className="flex flex-col gap-2">
            {visibles.map((n) => <Nota key={`${n.id}-${n.editado_en || ""}`} n={n} alCambiar={cargar} setError={setError} />)}
          </ul>
        </>
      )}
    </div>
  );
}
