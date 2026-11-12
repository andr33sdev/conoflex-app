// Bitácora del proyecto: contar lo que pasó (escrito o dictado), que el asistente lo ordene en etapas y pruebas,
// y la historia completa con quién hizo qué y cuándo.
import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Camera, CheckCircle2, ClipboardList, FileImage, FlaskConical, Loader2, Megaphone, Mic, MicOff, Package, PenLine, Sparkles, StickyNote, ToggleRight, Wand2, XCircle } from "lucide-react";
import { api } from "../produccion/util";
import { getApiUrl } from "../apiConfig";
import { ImagenPrivada } from "./util";
import { botonPrimario, botonSecundario, fechaHora } from "./formato";

const ICONOS = { CREADO: Sparkles, NOTA: StickyNote, ETAPA: ClipboardList, APROBACION: BadgeCheck, ARCHIVO: FileImage, PRUEBA: FlaskConical, ITEM: Package, DIFUSION: Megaphone, ESTADO: ToggleRight, DATOS: PenLine };
const NOMBRE_ETAPA = { ENTRADAS: "Entradas", MATRICERO: "Matricero", VERIFICACION: "Verificación", VALIDACION: "Validación", ESPECIFICACIONES: "Especificaciones", CAMBIOS: "Cambios" };

/** Dictado con el reconocimiento de voz del navegador (Chrome / Edge / Android). */
function useDictado(alTexto) {
  const [escuchando, setEscuchando] = useState(false);
  const rec = useRef(null);
  const Reconocedor = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const alternar = () => {
    if (!Reconocedor) return;
    if (escuchando) {
      rec.current?.stop();
      return;
    }
    const r = new Reconocedor();
    r.lang = "es-AR";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      const t = Array.from(e.results).slice(e.resultIndex).map((x) => x[0].transcript).join(" ");
      if (t.trim()) alTexto(t.trim());
    };
    r.onend = () => setEscuchando(false);
    r.onerror = () => setEscuchando(false);
    rec.current = r;
    r.start();
    setEscuchando(true);
  };
  useEffect(() => () => rec.current?.stop(), []);
  return { disponible: !!Reconocedor, escuchando, alternar };
}

export default function Bitacora({ p, recargar, accion, aviso }) {
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [sugerencia, setSugerencia] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const archivoRef = useRef(null);
  const dictado = useDictado((t) => setTexto((x) => (x ? `${x} ${t}` : t)));

  const guardarNota = async () => {
    if (await accion(() => api(`/api/desarrollo/proyectos/${p.id}/notas`, { method: "POST", body: { texto } }), "Nota guardada.")) setTexto("");
  };
  const ordenar = async () => {
    setPensando(true);
    try {
      setSugerencia(await api(`/api/desarrollo/proyectos/${p.id}/asistente`, { method: "POST", body: { texto } }));
    } catch (e) {
      aviso(e.message, "error");
    } finally {
      setPensando(false);
    }
  };
  const aplicar = async () => {
    if (await accion(() => api(`/api/desarrollo/proyectos/${p.id}/asistente/aplicar`, { method: "POST", body: sugerencia }), "Listo: quedó en las etapas, en las pruebas y en la bitácora.")) {
      setSugerencia(null);
      setTexto("");
    }
  };
  const subirFotos = async (files) => {
    if (!files?.length) return;
    setSubiendo(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("archivos", f);
      const r = await fetch(getApiUrl(`/api/desarrollo/proyectos/${p.id}/archivos`), { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No se pudieron subir.");
      aviso(`${j.archivos.length === 1 ? "Archivo subido" : `${j.archivos.length} archivos subidos`}.`);
      await recargar();
    } catch (e) {
      aviso(e.message, "error");
    } finally {
      setSubiendo(false);
      if (archivoRef.current) archivoRef.current.value = "";
    }
  };

  // Agrupa la bitácora por día.
  const dias = [];
  for (const e of p.eventos) {
    const d = new Date(e.created_at).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (!dias.length || dias[dias.length - 1].dia !== d) dias.push({ dia: d, eventos: [] });
    dias[dias.length - 1].eventos.push(e);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <section className="rounded-2xl border border-zinc-800 bg-[#0b0b0c] p-4" aria-label="Contar qué pasó">
          <label htmlFor="dp-texto" className="text-sm font-semibold text-white">¿Qué pasó?</label>
          <p className="text-xs text-zinc-500 mt-0.5">Escribilo o dictalo como te salga. El asistente lo ordena en las etapas del R.032 y arma las pruebas.</p>
          <textarea id="dp-texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} placeholder="Ej: llegaron las primeras muestras, medimos el espesor con calibre y dio 3,1 mm, el peso 1,12 kg. El encastre con la base del 1200 entra justo. Falta probar la ciclohexanona." className="mt-3 w-full bg-black border border-zinc-800 focus:border-[#FF5A00] rounded-xl px-3 py-2.5 text-sm text-white outline-none resize-y placeholder:text-zinc-600" />
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {dictado.disponible && (
              <button onClick={dictado.alternar} className={`${botonSecundario} ${dictado.escuchando ? "border-rose-500/60 text-rose-300" : ""}`} aria-pressed={dictado.escuchando}>
                {dictado.escuchando ? <MicOff size={16} /> : <Mic size={16} />} {dictado.escuchando ? "Parar" : "Dictar"}
              </button>
            )}
            <button onClick={() => archivoRef.current?.click()} disabled={subiendo} className={botonSecundario}>
              {subiendo ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />} Fotos
            </button>
            <input ref={archivoRef} type="file" multiple accept="image/*,.pdf,.dwg,.dxf,.step,.stp,.igs,.iges,.stl,.sldprt,.xlsx,.docx" className="hidden" onChange={(e) => subirFotos(e.target.files)} />
            <div className="flex-1" />
            <button onClick={guardarNota} disabled={!texto.trim()} className={botonSecundario}>Guardar como nota</button>
            <button onClick={ordenar} disabled={!texto.trim() || pensando} className={botonPrimario}>
              {pensando ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />} Ordenar con IA
            </button>
          </div>

          {sugerencia && (
            <div className="mt-4 rounded-xl border border-[#FF5A00]/40 bg-[#FF5A00]/[0.05] p-4">
              <p className="text-xs font-semibold text-[#FF5A00] flex items-center gap-1.5"><Sparkles size={14} /> Así lo ordena el asistente</p>
              {sugerencia.resumen && <p className="mt-1.5 text-sm text-white">{sugerencia.resumen}</p>}
              {sugerencia.etapas.map((e) => (
                <div key={e.etapa} className="mt-3">
                  <p className="text-xs font-semibold text-zinc-400">{NOMBRE_ETAPA[e.etapa]}</p>
                  <ul className="mt-1 text-sm text-zinc-200 list-disc pl-5 space-y-0.5">{e.puntos.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              ))}
              {sugerencia.pruebas.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-zinc-400">Pruebas</p>
                  <ul className="mt-1 flex flex-col gap-1.5">
                    {sugerencia.pruebas.map((x, i) => (
                      <li key={i} className="text-sm text-zinc-200 flex items-start gap-2">
                        {x.cumple === "SI" ? <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" /> : x.cumple === "NO" ? <XCircle size={16} className="text-rose-400 mt-0.5 shrink-0" /> : <span className="w-4 h-4 mt-0.5 rounded-full border border-zinc-600 shrink-0" />}
                        <span><b className="font-medium text-white">{x.que}</b>{x.objetivo && ` · objetivo ${x.objetivo}`}{x.resultado && ` · resultado ${x.resultado}`}{x.metodo && <span className="text-zinc-500"> · {x.metodo}</span>}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!sugerencia.etapas.length && !sugerencia.pruebas.length && <p className="mt-2 text-sm text-zinc-400">No encontró nada para las etapas. Podés guardarlo como nota.</p>}
              <div className="mt-4 flex gap-2 flex-wrap">
                <button onClick={aplicar} className={botonPrimario}><CheckCircle2 size={16} /> Guardar todo</button>
                <button onClick={() => setSugerencia(null)} className={botonSecundario}>Descartar</button>
              </div>
            </div>
          )}
        </section>

        <section className="mt-6" aria-label="Historia del proyecto">
          {dias.map((d) => (
            <div key={d.dia} className="mb-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 first-letter:uppercase">{d.dia}</h3>
              <ol className="relative border-l border-zinc-800 ml-3">
                {d.eventos.map((e) => {
                  const Icono = ICONOS[e.tipo] || StickyNote;
                  const aprob = e.tipo === "APROBACION" && /^Aprobó/.test(e.texto || "");
                  return (
                    <li key={e.id} className="ml-5 pb-4 relative">
                      <span className={`absolute -left-[33px] top-0 w-7 h-7 rounded-full grid place-items-center border ${aprob ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : e.tipo === "NOTA" ? "bg-[#FF5A00]/10 border-[#FF5A00]/40 text-[#FF5A00]" : "bg-zinc-900 border-zinc-800 text-zinc-400"}`}><Icono size={14} /></span>
                      <p className="text-xs text-zinc-500">
                        <b className="font-semibold text-zinc-300">{e.usuario_nombre || "Sistema"}</b> · {fechaHora(e.created_at)}
                        {e.etapa && NOMBRE_ETAPA[e.etapa] && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400">{NOMBRE_ETAPA[e.etapa]}</span>}
                      </p>
                      <p className={`mt-1 text-sm whitespace-pre-wrap leading-relaxed ${e.tipo === "NOTA" ? "text-zinc-100" : "text-zinc-300"}`}>{e.texto}</p>
                      {e.tipo === "ARCHIVO" && e.archivo_id && p.archivos.some((a) => a.id === e.archivo_id && a.tiene_miniatura) && (
                        <ImagenPrivada id={e.archivo_id} alt="" className="mt-2 w-40 h-28 object-cover rounded-lg border border-zinc-800" />
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <Resumen p={p} />
      </aside>
    </div>
  );
}

/** Columna lateral: lo esencial del proyecto de un vistazo. */
function Resumen({ p }) {
  const pend = p.etapas.filter((e) => e.aprobacion_estado === "PEDIDA");
  const fotos = p.archivos.filter((a) => a.tiene_miniatura).slice(0, 6);
  return (
    <>
      <div className="rounded-2xl border border-zinc-800 bg-[#0b0b0c] p-4">
        <p className="text-xs font-semibold text-zinc-400">Ahora</p>
        <p className="mt-1 text-sm text-white">{p.estado === "TERMINADO" ? "Lanzado" : p.progreso.etapa_actual_nombre || "Todas las etapas cerradas"}</p>
        {pend.length > 0 && <p className="mt-2 text-xs text-amber-300">Esperando aprobación: {pend.map((e) => `${e.nombre} (${e.aprobador_nombre})`).join(", ")}</p>}
        {p.avisos.some((a) => !a.enterado_at) && <p className="mt-2 text-xs text-sky-300">Faltan confirmar: {p.avisos.filter((a) => !a.enterado_at).map((a) => a.usuario_nombre).join(", ")}</p>}
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <p className="text-xs font-semibold text-zinc-400">ISO 9001 · P-11</p>
          <ul className="mt-2 flex flex-col gap-1">
            {p.iso.items.filter((x) => !x.ok).slice(0, 4).map((x) => <li key={x.id} className="text-xs text-zinc-400 flex gap-1.5"><span className="text-zinc-600">○</span>{x.texto}</li>)}
            {p.iso.completo && <li className="text-xs text-emerald-300">Todo documentado: listo para auditoría.</li>}
          </ul>
        </div>
      </div>
      {fotos.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-[#0b0b0c] p-3 grid grid-cols-3 gap-2">
          {fotos.map((a) => <ImagenPrivada key={a.id} id={a.id} alt={a.nombre} className="aspect-square w-full object-cover rounded-lg" />)}
        </div>
      )}
    </>
  );
}
