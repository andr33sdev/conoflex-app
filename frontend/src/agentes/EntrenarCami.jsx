import { useEffect, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { api } from "../produccion/util";
import { cuando } from "./formato";

const TIPO_CLASE = { VACIO: "text-amber-300", CARACTERISTICA: "text-sky-300", PREGUNTA: "text-violet-300", MEJORA: "text-emerald-300" };
const ACCIONES = [
  { id: "REGLA", texto: "Dejarlo como regla" },
  { id: "PRODUCTOS", texto: "Qué productos lo tienen" },
  { id: "EN_CURSO", texto: "Lo vamos a trabajar" },
  { id: "DESCARTAR", texto: "No aplica" },
];

function Ejemplos({ lista }) {
  if (!lista?.length) return null;
  return (
    <ul className="mt-1.5 space-y-1">
      {lista.map((e, i) => (
        <li key={i} className="text-[12.5px] text-zinc-500 leading-snug">
          <span className="text-zinc-400">{e.cliente || "Cliente"}</span>{e.asunto ? ` · ${e.asunto}` : ""}
          {e.evidencia && <span className="block text-zinc-400 italic">“{e.evidencia}”</span>}
        </li>
      ))}
    </ul>
  );
}

function BuscadorProductos({ base, elegidos, onChange }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState([]);
  useEffect(() => {
    const t = setTimeout(() => {
      api(`${base}/productos-buscar?q=${encodeURIComponent(q)}`).then((r) => setRes(r.productos || [])).catch(() => setRes([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, base]);
  const ids = new Set(elegidos.map((p) => p.id));
  const alternar = (p) => onChange(ids.has(p.id) ? elegidos.filter((x) => x.id !== p.id) : [...elegidos, p]);
  return (
    <div className="mt-2">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-3.5 text-zinc-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto por código o nombre" className="w-full h-11 rounded-lg bg-[#15151a] border border-white/10 focus:border-white/30 pl-8 pr-3 text-base text-white placeholder-zinc-600 outline-none" />
      </div>
      {elegidos.length > 0 && <p className="mt-1.5 text-[12.5px] text-zinc-300">Elegidos ({elegidos.length}): {elegidos.map((p) => p.codigo).join(", ")}</p>}
      <ul className="mt-1.5 max-h-44 overflow-y-auto rounded-lg border border-white/[0.08] divide-y divide-white/[0.05]">
        {res.length === 0 && <li className="px-3 py-2 text-[12.5px] text-zinc-500">Sin resultados.</li>}
        {res.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => alternar(p)} className="w-full text-left px-3 py-2 min-h-[40px] flex items-center gap-2 text-[13px] text-zinc-200 hover:bg-white/[0.05]">
              <span className={`w-4 h-4 rounded border grid place-items-center shrink-0 ${ids.has(p.id) ? "bg-white border-white" : "border-white/30"}`}>{ids.has(p.id) && <Check size={11} className="text-black" />}</span>
              <b className="shrink-0">{p.codigo}</b> <span className="text-zinc-400 truncate">{p.nombre}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tarjeta({ a, base, alCambiar, mostrar }) {
  const [accion, setAccion] = useState(null);
  const [texto, setTexto] = useState("");
  const [prods, setProds] = useState([]);
  const [enviando, setEnviando] = useState(false);

  const listo = accion === "REGLA" ? texto.trim().length >= 8 : accion === "PRODUCTOS" ? prods.length > 0 || texto.trim().length >= 3 : !!accion;
  const guardar = async () => {
    setEnviando(true);
    try {
      await api(`${base}/aprendizajes/${a.id}/resolver`, { method: "POST", body: { accion, decision: texto, productos: prods.map((p) => p.id) } });
      mostrar?.("Anotado. Lo uso desde el próximo borrador.");
      alCambiar?.();
    } catch (e) {
      mostrar?.(e.message, "error");
    } finally {
      setEnviando(false);
    }
  };
  return (
    <li className="rounded-xl border border-white/[0.1] px-4 py-3.5">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em]"><span className={TIPO_CLASE[a.tipo] || "text-zinc-400"}>{a.tipo_texto}</span><span className="text-zinc-500 normal-case tracking-normal font-normal"> · {a.veces === 1 ? "apareció 1 vez" : `apareció ${a.veces} veces`}</span></p>
      <p className="mt-1 text-[14.5px] font-semibold text-white leading-snug break-words">{a.titulo}</p>
      {a.detalle && <p className="mt-0.5 text-[13px] text-zinc-400 leading-snug">{a.detalle}</p>}
      <Ejemplos lista={a.ejemplos} />
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {ACCIONES.map((x) => (
          <button key={x.id} type="button" onClick={() => setAccion(x.id === accion ? null : x.id)} aria-pressed={accion === x.id} className={`min-h-[38px] px-3 rounded-lg text-[13px] font-semibold border ${accion === x.id ? "bg-white text-black border-white" : "bg-white/[0.05] text-zinc-200 border-white/10 hover:bg-white/[0.1]"}`}>{x.texto}</button>
        ))}
      </div>
      {accion && (
        <div className="mt-2.5">
          {accion === "PRODUCTOS" && <BuscadorProductos base={base} elegidos={prods} onChange={setProds} />}
          {accion !== "DESCARTAR" && (
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={500} rows={2} placeholder={accion === "REGLA" ? "Escribí la regla: cómo tengo que responder esto de ahora en más" : accion === "PRODUCTOS" ? "Aclaración opcional (o escribí «ninguno»)" : "Algo que quieras aclarar (opcional)"} className="mt-2 w-full rounded-lg bg-[#15151a] border border-white/10 focus:border-white/30 px-3 py-2 text-base text-white placeholder-zinc-600 outline-none resize-none" />
          )}
          <button type="button" onClick={guardar} disabled={!listo || enviando} className="mt-2 min-h-[44px] px-4 rounded-lg bg-white text-black text-[13.5px] font-semibold hover:bg-zinc-200 disabled:opacity-50 inline-flex items-center gap-1.5">
            {enviando && <Loader2 size={14} className="animate-spin" />} Guardar decisión
          </button>
        </div>
      )}
    </li>
  );
}

/** "Para entrenar a Cami": lo que detectó en los mails, lo que falta definir y lo ya decidido. Cada decisión queda en la base y mejora los próximos borradores. */
export default function EntrenarCami({ base, datos, alCambiar, mostrar }) {
  const [cerrando, setCerrando] = useState(null);
  const { abiertas = [], en_curso: enCurso = [], decididas = [], conteos = {} } = datos || {};
  const cerrar = async (a) => {
    setCerrando(a.id);
    try {
      await api(`${base}/aprendizajes/${a.id}/cerrar`, { method: "POST", body: {} });
      mostrar?.("Listo, lo marqué como hecho.");
      alCambiar?.();
    } catch (e) {
      mostrar?.(e.message, "error");
    } finally {
      setCerrando(null);
    }
  };
  return (
    <section>
      <h4 className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-zinc-500 mb-2">Para entrenar a Cami</h4>
      <p className="mb-2.5 text-[13px] text-zinc-400 leading-relaxed">Leo cada consulta y te marco lo que falta definir, lo que se repite y lo que podríamos mejorar. Lo que decidas queda guardado y lo uso en todos los borradores siguientes. {conteos.RESUELTA ? `Ya definimos ${conteos.RESUELTA}.` : ""}</p>
      {abiertas.length === 0 ? (
        <p className="rounded-xl border border-white/[0.07] px-4 py-4 text-[13.5px] text-zinc-400">No tengo nada abierto. Cuando arme borradores y encuentre vacíos, preguntas repetidas o características pedidas, aparecen acá.</p>
      ) : (
        <ul className="space-y-2">{abiertas.map((a) => <Tarjeta key={a.id} a={a} base={base} alCambiar={alCambiar} mostrar={mostrar} />)}</ul>
      )}
      {enCurso.length > 0 && (
        <div className="mt-3">
          <p className="text-[12px] font-semibold text-zinc-400 mb-1.5">Lo estamos trabajando</p>
          <ul className="rounded-xl border border-white/[0.09] divide-y divide-white/[0.06]">
            {enCurso.map((a) => (
              <li key={a.id} className="px-4 py-2.5 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] text-white leading-snug break-words">{a.titulo}</p>
                  <p className="text-[12px] text-zinc-500">Mientras tanto le digo al cliente que lo consultamos.</p>
                </div>
                <button onClick={() => cerrar(a)} disabled={cerrando === a.id} className="shrink-0 min-h-[38px] px-3 rounded-lg text-[13px] font-semibold bg-white/[0.07] hover:bg-white/[0.12] text-zinc-100 disabled:opacity-60">Ya está hecho</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {decididas.length > 0 && (
        <div className="mt-3">
          <p className="text-[12px] font-semibold text-zinc-400 mb-1.5">Lo último que definimos</p>
          <ul className="rounded-xl border border-white/[0.09] divide-y divide-white/[0.06]">
            {decididas.map((a) => (
              <li key={a.id} className="px-4 py-2.5">
                <p className="text-[13.5px] text-white leading-snug break-words">{a.titulo}</p>
                <p className="text-[12px] text-zinc-500">{a.accion_texto || "Decidido"}{a.decision ? ` · ${a.decision}` : ""}{a.productos?.length ? ` · ${a.productos.map((p) => p.codigo).join(", ")}` : ""}{a.decidido_en ? ` · ${cuando(a.decidido_en)}` : ""}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
