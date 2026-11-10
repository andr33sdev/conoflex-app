// Traer costos de materias primas desde la planilla de Google Sheets: por cada código de la app que aparezca
// en la hoja, el costo es la celda 4 columnas a la derecha. Primero muestra qué cambia; después aplica.
import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, FileSpreadsheet, Loader2 } from "lucide-react";
import { api } from "../produccion/util";
import { Drawer } from "../produccion/ui";
import { abrev, nf, usd } from "../materias/util";

export default function TraerDeSheets({ onListo }) {
  const [abierto, setAbierto] = useState(false);
  const [url, setUrl] = useState("");
  const [plan, setPlan] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState(null);

  const revisar = async (link) => {
    setCargando(true);
    setError("");
    try {
      const p = await api("/api/costos/sheets/previsualizar", { method: "POST", body: { url: link } });
      setUrl(p.url);
      setPlan(p);
    } catch (e) {
      setPlan(null);
      setError(e.message || "No pude leer la planilla.");
    } finally {
      setCargando(false);
    }
  };

  const abrir = async () => {
    setAbierto(true);
    setPlan(null);
    setHecho(null);
    setError("");
    try {
      const { url: guardada } = await api("/api/costos/sheets");
      setUrl(guardada || "");
      if (guardada) revisar(guardada); // con el link guardado, revisa directo
    } catch {
      /* sin link guardado: lo pega */
    }
  };

  const aplicar = async () => {
    setAplicando(true);
    setError("");
    try {
      const r = await api("/api/costos/sheets/aplicar", { method: "POST", body: { url } });
      setHecho(r);
      setPlan(null);
      onListo?.();
    } catch (e) {
      setError(e.message || "No se pudo aplicar.");
    } finally {
      setAplicando(false);
    }
  };

  return (
    <>
      <button onClick={abrir} className="min-h-[46px] px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.09] text-sm font-bold text-zinc-100 inline-flex items-center gap-2 cursor-pointer transition-colors">
        <FileSpreadsheet size={16} /> Traer costos de Sheets
      </button>

      <Drawer
        abierto={abierto}
        onCerrar={() => !aplicando && setAbierto(false)}
        titulo="Traer costos de Sheets"
        subtitulo="El costo de cada código es la celda 4 columnas a su derecha"
        pie={
          plan && plan.cambios.length > 0 ? (
            <button onClick={aplicar} disabled={aplicando} className="w-full min-h-[48px] rounded-xl bg-[#FFD60A] text-black text-sm font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
              {aplicando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />} Actualizar {nf(plan.cambios.length, 0)} costos
            </button>
          ) : null
        }
      >
        <div className="flex flex-col gap-4">
          <form onSubmit={(e) => { e.preventDefault(); revisar(url); }} className="flex flex-col gap-2">
            <label htmlFor="sheets-url" className="text-sm text-zinc-400">Link de la planilla (Compartir → «Cualquier persona con el enlace»)</label>
            <div className="flex gap-2">
              <input id="sheets-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className="flex-1 min-w-0 min-h-[46px] rounded-xl bg-white/[0.05] border border-white/[0.1] focus:border-[#FF5A00]/60 px-3 text-sm text-white outline-none" />
              <button type="submit" disabled={cargando || !url.trim()} className="min-h-[46px] px-4 rounded-xl bg-white text-black text-sm font-extrabold cursor-pointer disabled:opacity-40 inline-flex items-center gap-2">
                {cargando ? <Loader2 size={16} className="animate-spin" /> : "Revisar"}
              </button>
            </div>
          </form>

          {error && <p className="text-sm text-rose-300">{error}</p>}
          {hecho && (
            <p className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4 text-sm text-emerald-200">
              Listo: {nf(hecho.actualizados, 0)} costos actualizados{hecho.iguales ? `, ${nf(hecho.iguales, 0)} ya estaban igual` : ""}.
            </p>
          )}

          {plan && (
            <>
              <p className="text-sm text-zinc-400">
                Cambian <b className="text-white">{nf(plan.cambios.length, 0)}</b>, <b className="text-white">{nf(plan.iguales, 0)}</b> ya están igual
                {plan.sin_costo_y_no_estan > 0 && <> y <b className="text-white">{nf(plan.sin_costo_y_no_estan, 0)}</b> materias primas de la app siguen sin costo (no están en la planilla)</>}.
              </p>

              {(plan.conflictos.length > 0 || plan.sin_valor.length > 0) && (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-3 text-sm text-amber-200 flex gap-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-1">
                    {plan.conflictos.map((c) => (
                      <span key={c.codigo}><b>{c.codigo}</b> aparece más de una vez con costos distintos ({c.valores.map((v) => `${usd(v.costo)} en ${v.celda}`).join(", ")}): se usa el primero.</span>
                    ))}
                    {plan.sin_valor.length > 0 && <span>Sin costo en la planilla: {plan.sin_valor.map((s) => `${s.codigo} (${s.celda})`).join(", ")}.</span>}
                  </div>
                </div>
              )}

              {plan.cambios.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {plan.cambios.map((c) => (
                    <li key={c.id} className="rounded-xl border border-white/[0.06] px-3 py-2.5 flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-white truncate">{c.codigo}</span>
                        <span className="block text-xs text-zinc-500 truncate">{c.nombre} · celda {c.celda}</span>
                      </span>
                      <span className="text-sm tabular-nums text-zinc-500 shrink-0">{c.antes == null ? "sin costo" : usd(c.antes)}</span>
                      <ArrowRight size={14} className="text-zinc-600 shrink-0" />
                      <span className="text-sm font-extrabold tabular-nums text-white shrink-0">{usd(c.despues)}<span className="text-xs font-semibold text-zinc-500"> /{abrev(c.unidad)}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </Drawer>
    </>
  );
}
