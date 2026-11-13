// Contar qué pasó (escrito o dictado), que la IA lo ordene, y la historia completa del proyecto.
import { useRef, useState } from "react";
import { BadgeCheck, Camera, CheckCircle2, CircleDot, FileImage, FlaskConical, Loader2, MessageSquare, Mic, MicOff, PenLine, Sparkles, StickyNote, ToggleRight, Wand2, XCircle } from "lucide-react";
import { api } from "../produccion/util";
import { ESTADOS, botonPrimario, botonSecundario, fechaCorta } from "./formato";
import { ImagenPrivada } from "./util";
import { subirArchivos } from "./api";
import { useDictado } from "./dictado";

const ICONOS = { CREADO: Sparkles, NOVEDAD: StickyNote, ESTADO: ToggleRight, PASO: CircleDot, PRUEBA: FlaskConical, DECISION: BadgeCheck, COMENTARIO: MessageSquare, ARCHIVO: FileImage, DATOS: PenLine };

export default function Novedades({ p, recargar, accion, aviso }) {
  const [texto, setTexto] = useState("");
  const [avisar, setAvisar] = useState(p.interesados.length > 0);
  const [pensando, setPensando] = useState(false);
  const [sugerencia, setSugerencia] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const archivoRef = useRef(null);
  const dictado = useDictado((t) => setTexto((x) => (x ? `${x} ${t}` : t)));

  const guardar = async () => {
    if (await accion(() => api(`/api/proyectos/${p.id}/novedades`, { method: "POST", body: { texto, avisar } }), avisar ? "Novedad guardada y avisada." : "Novedad guardada.")) setTexto("");
  };
  const ordenar = async () => {
    setPensando(true);
    try {
      setSugerencia(await api(`/api/proyectos/${p.id}/asistente`, { method: "POST", body: { texto } }));
    } catch (e) {
      aviso(e.message, "error");
    } finally {
      setPensando(false);
    }
  };
  const aplicar = async () => {
    if (await accion(() => api(`/api/proyectos/${p.id}/asistente/aplicar`, { method: "POST", body: sugerencia }), "Listo: quedó en la historia, las pruebas y el próximo paso.")) {
      setSugerencia(null);
      setTexto("");
    }
  };
  const subir = async (files) => {
    if (!files?.length) return;
    setSubiendo(true);
    try {
      const r = await subirArchivos(p.id, files);
      aviso(r.archivos.length === 1 ? "Foto subida." : `${r.archivos.length} archivos subidos.`);
      await recargar();
    } catch (e) {
      aviso(e.message, "error");
    } finally {
      setSubiendo(false);
      if (archivoRef.current) archivoRef.current.value = "";
    }
  };

  const dias = [];
  for (const e of p.eventos) {
    const d = new Date(e.created_at).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (!dias.length || dias[dias.length - 1].dia !== d) dias.push({ dia: d, eventos: [] });
    dias[dias.length - 1].eventos.push(e);
  }
  const nombrePrueba = (id) => p.pruebas.find((x) => x.id === id)?.que;

  return (
    <>
      <section className="rounded-2xl border border-zinc-800 bg-[#0b0b0c] p-4" aria-label="Contar una novedad">
        <label htmlFor="pp-texto" className="text-sm font-semibold text-white">¿Qué pasó?</label>
        <p className="text-xs text-zinc-500 mt-0.5">Escribilo o dictalo como te salga. La IA lo ordena: arma las pruebas, el estado y el próximo paso.</p>
        <textarea id="pp-texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Ej: vino el técnico de la embaladora, cambió el sensor del film. Probamos con 50 paquetes y anduvo bien, pero a más de 12 por minuto se traba. Quedó en volver el jueves con otro motor." className="mt-3 w-full bg-black border border-zinc-800 focus:border-[#FF5A00] rounded-xl px-3 py-2.5 text-sm text-white outline-none resize-y placeholder:text-zinc-600" />
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {dictado.disponible && (
            <button onClick={dictado.alternar} aria-pressed={dictado.escuchando} className={`${botonSecundario} ${dictado.escuchando ? "border-rose-500/60 text-rose-300" : ""}`}>
              {dictado.escuchando ? <MicOff size={16} /> : <Mic size={16} />} {dictado.escuchando ? "Parar" : "Dictar"}
            </button>
          )}
          <button onClick={() => archivoRef.current?.click()} disabled={subiendo} className={botonSecundario}>{subiendo ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />} Fotos</button>
          <input ref={archivoRef} type="file" multiple accept="image/*,video/*,.pdf,.xlsx,.docx" className="hidden" onChange={(e) => subir(e.target.files)} />
          {p.interesados.length > 0 && (
            <label className="inline-flex items-center gap-2 text-xs text-zinc-400 cursor-pointer px-1">
              <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} className="accent-[#FF5A00]" /> Avisar a {p.interesados.map((i) => i.usuario_nombre).join(", ")}
            </label>
          )}
          <div className="flex-1" />
          <button onClick={guardar} disabled={!texto.trim()} className={botonSecundario}>Guardar así</button>
          <button onClick={ordenar} disabled={!texto.trim() || pensando} className={botonPrimario}>{pensando ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />} Ordenar con IA</button>
        </div>

        {sugerencia && (
          <div className="mt-4 rounded-xl border border-[#FF5A00]/40 bg-[#FF5A00]/[0.05] p-4">
            <p className="text-xs font-semibold text-[#FF5A00] flex items-center gap-1.5"><Sparkles size={14} /> Así lo ordena la IA</p>
            <p className="mt-2 text-sm text-white whitespace-pre-wrap">{sugerencia.novedad || sugerencia.resumen}</p>
            {(sugerencia.estado || sugerencia.proximo_paso) && (
              <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-3">
                {sugerencia.estado && sugerencia.estado !== p.estado && <><dt className="text-zinc-500">Estado</dt><dd className="text-zinc-100">{ESTADOS[p.estado]?.texto} → <b>{ESTADOS[sugerencia.estado]?.texto}</b></dd></>}
                {sugerencia.proximo_paso && <><dt className="text-zinc-500">Próximo paso</dt><dd className="text-zinc-100">{sugerencia.proximo_paso}{sugerencia.proximo_paso_fecha ? ` · ${fechaCorta(sugerencia.proximo_paso_fecha)}` : ""}</dd></>}
              </dl>
            )}
            {sugerencia.pruebas.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5">
                {sugerencia.pruebas.map((x, i) => (
                  <li key={i} className="text-sm text-zinc-200 flex items-start gap-2">
                    {x.estado === "APROBADA" ? <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" /> : x.estado === "RECHAZADA" ? <XCircle size={16} className="text-rose-400 mt-0.5 shrink-0" /> : <span className="w-4 h-4 mt-0.5 rounded-full border border-zinc-600 shrink-0" />}
                    <span><b className="font-medium text-white">Prueba: {x.que}</b>{x.pieza && ` · ${x.pieza}`}{x.resultado && ` · ${x.resultado}`}{x.motivo && <span className="text-rose-300"> · {x.motivo}</span>}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex gap-2 flex-wrap">
              <button onClick={aplicar} className={botonPrimario}><CheckCircle2 size={16} /> Guardar todo</button>
              <button onClick={() => setSugerencia(null)} className={botonSecundario}>Descartar</button>
            </div>
          </div>
        )}
      </section>

      <section aria-label="Historia">
        {dias.map((d) => (
          <div key={d.dia} className="mb-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">{d.dia}</h3>
            <ol className="relative border-l border-zinc-800 ml-3">
              {d.eventos.map((e) => {
                const Icono = ICONOS[e.tipo] || StickyNote;
                const ok = e.tipo === "DECISION" && / aprobó /.test(e.texto || "");
                const no = e.tipo === "DECISION" && / rechazó /.test(e.texto || "");
                return (
                  <li key={e.id} className="ml-5 pb-4 relative">
                    <span className={`absolute -left-[33px] top-0 w-7 h-7 rounded-full grid place-items-center border ${ok ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : no ? "bg-rose-500/15 border-rose-500/40 text-rose-300" : e.tipo === "NOVEDAD" ? "bg-[#FF5A00]/10 border-[#FF5A00]/40 text-[#FF5A00]" : "bg-zinc-900 border-zinc-800 text-zinc-400"}`}><Icono size={14} /></span>
                    <p className="text-xs text-zinc-500">
                      <b className="font-semibold text-zinc-300">{e.usuario_nombre || "Sistema"}</b> · {new Date(e.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                      {e.prueba_id && nombrePrueba(e.prueba_id) && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400">Prueba: {nombrePrueba(e.prueba_id)}</span>}
                    </p>
                    <p className={`mt-1 text-sm whitespace-pre-wrap leading-relaxed ${e.tipo === "NOVEDAD" || e.tipo === "COMENTARIO" ? "text-zinc-100" : "text-zinc-300"}`}>{e.texto}</p>
                    {e.tipo === "ARCHIVO" && e.archivo_id && p.archivos.some((a) => a.id === e.archivo_id && a.tiene_miniatura) && <ImagenPrivada id={e.archivo_id} alt="" className="mt-2 w-40 h-28 object-cover rounded-lg border border-zinc-800" />}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </section>
    </>
  );
}
