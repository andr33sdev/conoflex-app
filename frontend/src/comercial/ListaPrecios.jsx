import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, FileSpreadsheet, FileText, History, Loader2, Paperclip, Search, Undo2, UploadCloud } from "lucide-react";
import { api } from "../produccion/util";
import { Aviso, Boton, Chip, Vacio } from "./ui";
import { subirForm } from "./util";

const fechaLarga = (v) => (v ? new Date(v).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" }) : "");
const pct = (v) => (v === null || v === undefined ? null : `${v > 0 ? "+" : ""}${String(v).replace(".", ",")}%`);

/** El PDF de la lista que se adjunta solo a los borradores cuando el cliente la pide. */
function ListaPdf() {
  const [est, setEst] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/api/comercial/lista-pdf").then(setEst).catch(() => setEst({ existe: false }));
  }, []);
  const subir = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSubiendo(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("lista", file);
      setEst(await subirForm("/api/comercial/lista-pdf", fd));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubiendo(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-[#0d0d0e] p-4">
      <Paperclip size={18} className="text-[#FF5A00] shrink-0" />
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-sm font-semibold text-white">PDF de la lista para adjuntar a los mails</p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {est === null ? "Cargando…" : est.existe ? `Cargado el ${fechaLarga(est.actualizado)} (${(est.bytes / 1024 / 1024).toFixed(1)} MB). Se adjunta solo cuando el cliente pide la lista.` : "Todavía no cargaste ninguno: hoy hay que adjuntarlo a mano en cada borrador."}
        </p>
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>
      <label className={`min-h-[40px] px-4 rounded-lg text-sm font-medium inline-flex items-center gap-2 cursor-pointer border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 ${subiendo ? "opacity-60 pointer-events-none" : ""}`}>
        {subiendo && <Loader2 size={14} className="animate-spin" />} {est?.existe ? "Reemplazar PDF" : "Subir PDF"}
        <input type="file" accept="application/pdf" className="hidden" onChange={subir} />
      </label>
    </div>
  );
}

function Historial({ cargas, onDeshacer, deshaciendo }) {
  if (!cargas) return null;
  if (!cargas.length) return <p className="text-sm text-zinc-500">Todavía no se aplicó ninguna lista con este sistema.</p>;
  const ultimaAplicada = cargas.find((c) => c.estado === "APLICADA");
  return (
    <ul className="divide-y divide-zinc-800/80 rounded-xl border border-zinc-800 bg-[#0d0d0e]">
      {cargas.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
          <div className="min-w-0 flex-1 basis-56">
            <p className="text-sm font-medium text-zinc-100 truncate">{c.archivo || "Lista de precios"}</p>
            <p className="text-xs text-zinc-500">{fechaLarga(c.aplicada_en || c.created_at)}{c.usuario ? ` · ${c.usuario}` : ""}</p>
          </div>
          <p className="text-xs text-zinc-400">{c.actualizados} precios{c.nuevos ? ` · ${c.nuevos} nuevos` : ""}</p>
          {c.estado === "DESHECHA" ? <Chip tono="ambar">Deshecha</Chip> : <Chip tono="verde">Aplicada</Chip>}
          {ultimaAplicada?.id === c.id && (
            <button onClick={() => onDeshacer(c)} disabled={deshaciendo} className="text-xs font-medium text-zinc-300 hover:text-white inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"><Undo2 size={13} /> Deshacer</button>
          )}
        </li>
      ))}
    </ul>
  );
}

function Pasos({ paso }) {
  const pasos = ["Subir lista", "Revisar cambios", "Listo"];
  return (
    <ol className="flex items-center gap-2 text-xs">
      {pasos.map((t, i) => (
        <li key={t} className="flex items-center gap-2">
          <span className={`w-6 h-6 rounded-full grid place-items-center font-semibold ${i < paso ? "bg-emerald-500/20 text-emerald-400" : i === paso ? "bg-[#FF5A00] text-black" : "bg-zinc-900 text-zinc-500"}`}>{i < paso ? <CheckCircle2 size={14} /> : i + 1}</span>
          <span className={i === paso ? "text-white font-medium" : "text-zinc-500"}>{t}</span>
          {i < pasos.length - 1 && <span className="w-6 h-px bg-zinc-800" />}
        </li>
      ))}
    </ol>
  );
}

function Decision({ valor, onElegir, si, no, tonoSi }) {
  const on = tonoSi === "rojo" ? "bg-red-600 border-red-600 text-white font-semibold" : "bg-emerald-600 border-emerald-600 text-white font-semibold";
  return (
    <div className="flex gap-2 shrink-0" role="group">
      <button type="button" aria-pressed={valor === "si"} onClick={() => onElegir("si")} className={`px-3 min-h-[36px] rounded-lg text-sm border cursor-pointer transition-colors ${valor === "si" ? on : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}>{si}</button>
      <button type="button" aria-pressed={valor === "no"} onClick={() => onElegir("no")} className={`px-3 min-h-[36px] rounded-lg text-sm border cursor-pointer transition-colors ${valor === "no" ? "bg-zinc-600 border-zinc-600 text-white font-semibold" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}>{no}</button>
    </div>
  );
}

function Revision({ a, onAplicar, onCancelar, aplicando }) {
  const [sel, setSel] = useState(() => new Set(a.tildados));
  const [decNuevos, setDecNuevos] = useState({});
  const [decAus, setDecAus] = useState({});
  const [vista, setVista] = useState(a.cambios.length ? "cambios" : a.nuevos.length ? "nuevos" : "cambios");
  const [q, setQ] = useState("");
  const [soloRevisar, setSoloRevisar] = useState(false);

  const cambios = useMemo(() => {
    const t = q.trim().toLowerCase();
    return a.cambios.filter((c) => (!soloRevisar || c.revisar) && (!t || `${c.codigo} ${c.nombre}`.toLowerCase().includes(t)));
  }, [a.cambios, q, soloRevisar]);
  const nuevos = useMemo(() => {
    const t = q.trim().toLowerCase();
    return a.nuevos.filter((n) => !t || `${n.codigo} ${n.nombre}`.toLowerCase().includes(t));
  }, [a.nuevos, q]);
  const nRevisar = a.cambios.filter((c) => c.revisar).length;
  const alternar = (set, setter, v) => {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    setter(n);
  };
  const subas = a.cambios.filter((c) => c.variacion !== null);
  const ordenadas = subas.map((c) => c.variacion).sort((x, y) => x - y);
  const mediana = ordenadas.length ? (ordenadas.length % 2 ? ordenadas[(ordenadas.length - 1) / 2] : Math.round(((ordenadas[ordenadas.length / 2 - 1] + ordenadas[ordenadas.length / 2]) / 2) * 10) / 10) : null;
  const nuevosPosibles = a.nuevos.filter((n) => !n.aviso);
  const agregar = nuevosPosibles.filter((n) => decNuevos[n.codigo] === "si").map((n) => n.codigo);
  const quitar = a.ausentes.filter((p) => decAus[p.id] === "si").map((p) => p.id);
  const pendNuevos = nuevosPosibles.filter((n) => !decNuevos[n.codigo]).length;
  const pendAus = a.ausentes.filter((p) => !decAus[p.id]).length;
  const pendientes = pendNuevos + pendAus;
  const total = sel.size + agregar.length + quitar.length;
  const decidirResto = (setter, actual, claves, v) => {
    const n = { ...actual };
    claves.forEach((k) => { if (!n[k]) n[k] = v; });
    setter(n);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Precios que cambian", a.cambios.length, "naranja"],
          ["Sin cambios", a.sinCambios, "neutro"],
          ["Productos nuevos en la lista", a.nuevos.length, "neutro"],
          ["En el sistema y no en la lista", a.ausentes.length, a.ausentes.length ? "ambar" : "neutro"],
        ].map(([t, n, tono]) => (
          <div key={t} className="rounded-xl border border-zinc-800 bg-[#0d0d0e] p-3.5">
            <p className={`text-2xl font-semibold ${tono === "naranja" ? "text-[#FF5A00]" : tono === "ambar" ? "text-amber-400" : "text-white"}`}>{n}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{t}</p>
          </div>
        ))}
      </div>

      {mediana !== null && <p className="text-sm text-zinc-400">Variación típica de los productos con un solo precio: <b className="text-white">{pct(mediana)}</b>.</p>}
      {a.avisos.map((t, i) => <Aviso key={i} tono="ambar"><span className="flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {t}</span></Aviso>)}
      {a.descartados?.length > 0 && <Aviso tono="info">No pude leer {a.descartados.length} {a.descartados.length === 1 ? "ítem" : "ítems"} de la lista (sin código o sin precio): {a.descartados.slice(0, 5).join(", ")}{a.descartados.length > 5 ? "…" : ""}.</Aviso>}
      <Aviso tono="info">Solo se actualiza el <b>precio</b>. Las descripciones, usos, advertencias, fotos y medidas de cada producto quedan como están.</Aviso>

      <div className="flex flex-wrap items-center gap-2">
        {[["cambios", `Cambios (${a.cambios.length})`], ["nuevos", `Nuevos (${a.nuevos.length})${pendNuevos ? ` · ${pendNuevos} sin decidir` : ""}`], ["ausentes", `Ya no están (${a.ausentes.length})${pendAus ? ` · ${pendAus} sin decidir` : ""}`]].map(([id, t]) => (
          <button key={id} onClick={() => setVista(id)} aria-pressed={vista === id} className={`px-3 min-h-[36px] rounded-lg text-sm border cursor-pointer transition-colors ${vista === id ? "bg-[#FF5A00] border-[#FF5A00] text-black font-semibold" : "border-zinc-800 text-zinc-300 hover:bg-zinc-900"}`}>{t}</button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código o nombre" className="w-full bg-[#0b0b0c] border border-zinc-800 focus:border-[#FF5A00] rounded-lg pl-9 pr-3 min-h-[40px] text-sm text-zinc-100 outline-none" />
        </div>
      </div>

      {vista === "cambios" && (
        <div className="rounded-xl border border-zinc-800 bg-[#0d0d0e] overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-zinc-800 text-xs text-zinc-400">
            <span>{sel.size} de {a.cambios.length} tildados</span>
            <button className="text-[#ff8a4d] hover:underline cursor-pointer" onClick={() => setSel(new Set(a.cambios.filter((c) => c.match === "exacto" && !c.revisar).map((c) => c.id)))}>Solo los seguros</button>
            <button className="text-[#ff8a4d] hover:underline cursor-pointer" onClick={() => setSel(new Set(a.cambios.map((c) => c.id)))}>Todos</button>
            <button className="text-[#ff8a4d] hover:underline cursor-pointer" onClick={() => setSel(new Set())}>Ninguno</button>
            {nRevisar > 0 && (
              <label className="ml-auto inline-flex items-center gap-1.5 cursor-pointer text-amber-400"><input type="checkbox" className="accent-[#FF5A00]" checked={soloRevisar} onChange={(e) => setSoloRevisar(e.target.checked)} /> Ver solo los {nRevisar} para revisar</label>
            )}
          </div>
          {cambios.length === 0 ? <Vacio titulo="No hay cambios en este filtro" /> : (
            <ul className="divide-y divide-zinc-800/70 max-h-[52vh] overflow-y-auto">
              {cambios.map((c) => (
                <li key={c.id} className={`px-4 py-2.5 flex items-start gap-3 ${c.revisar ? "bg-amber-500/[0.04]" : ""}`}>
                  <input type="checkbox" aria-label={`Aplicar ${c.codigo}`} checked={sel.has(c.id)} onChange={() => alternar(sel, setSel, c.id)} className="mt-1.5 accent-[#FF5A00] w-4 h-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-100 truncate"><b className="text-[#ff8a4d] font-semibold">{c.codigo}</b> <span className="text-zinc-400">{c.nombre}</span></p>
                    <p className="text-sm mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-zinc-500 line-through decoration-zinc-700 break-all">{c.anterior || "sin precio"}</span>
                      <ArrowRight size={13} className="text-zinc-600 shrink-0" />
                      <span className="text-white font-medium break-all">{c.nuevo}</span>
                      {c.variacion !== null && <Chip tono={c.revisar ? "ambar" : c.variacion > 0 ? "naranja" : "verde"}>{pct(c.variacion)}</Chip>}
                    </p>
                    {c.avisos.map((t, i) => <p key={i} className="text-xs text-amber-400 mt-1">{t}</p>)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {vista === "nuevos" && (
        <div className="rounded-xl border border-zinc-800 bg-[#0d0d0e] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-zinc-800 text-xs text-zinc-400 flex flex-wrap items-center gap-3">
            <span>Estos códigos son nuevos: no existen en el sistema. Decidí uno por uno si querés agregarlos (se crean con nombre y precio; la ficha la cargás después).</span>
            {pendNuevos > 0 && <button className="text-[#ff8a4d] hover:underline cursor-pointer" onClick={() => decidirResto(setDecNuevos, decNuevos, nuevosPosibles.map((n) => n.codigo), "no")}>No agregar los {pendNuevos} que faltan</button>}
          </div>
          {nuevos.length === 0 ? <Vacio titulo="No hay productos nuevos" texto="Todos los códigos de la lista ya estaban en el sistema." /> : (
            <ul className="divide-y divide-zinc-800/70 max-h-[52vh] overflow-y-auto">
              {nuevos.map((n) => (
                <li key={n.codigo} className="px-4 py-3 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="text-sm text-zinc-100 truncate"><b className="text-[#ff8a4d] font-semibold">{n.codigo}</b> <span className="text-zinc-400">{n.nombre}</span></p>
                    <p className="text-sm text-white break-all">{n.precio}</p>
                    {n.aviso && <p className="text-xs text-amber-400 mt-1">{n.aviso}</p>}
                  </div>
                  {!n.aviso && <Decision valor={decNuevos[n.codigo]} onElegir={(v) => setDecNuevos({ ...decNuevos, [n.codigo]: v })} si="Agregar" no="No agregar" tonoSi="verde" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {vista === "ausentes" && (
        <div className="rounded-xl border border-zinc-800 bg-[#0d0d0e] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-zinc-800 text-xs text-zinc-400 flex flex-wrap items-center gap-3">
            <span>Estos productos están en el sistema pero ya no aparecen en la lista. Decidí uno por uno cuáles quitar; los que mantengas siguen con el precio anterior. Si quitás alguno, “Deshacer” lo restaura.</span>
            {pendAus > 0 && <button className="text-[#ff8a4d] hover:underline cursor-pointer" onClick={() => decidirResto(setDecAus, decAus, a.ausentes.map((p) => p.id), "no")}>Mantener los {pendAus} que faltan</button>}
          </div>
          {a.ausentes.length === 0 ? <Vacio titulo="Todos los productos del sistema están en la lista" /> : (
            <ul className="divide-y divide-zinc-800/70 max-h-[52vh] overflow-y-auto">
              {a.ausentes.filter((p) => !q.trim() || `${p.codigo} ${p.nombre}`.toLowerCase().includes(q.trim().toLowerCase())).map((p) => (
                <li key={p.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
                  <p className="min-w-0 flex-1 basis-56 text-sm"><b className="text-zinc-200">{p.codigo}</b> <span className="text-zinc-500">{p.nombre}</span> <span className="text-zinc-600">· {p.precio_lista || "sin precio"}</span></p>
                  <Decision valor={decAus[p.id]} onElegir={(v) => setDecAus({ ...decAus, [p.id]: v })} si="Quitar" no="Mantener" tonoSi="rojo" />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-gradient-to-t from-[#050505] via-[#050505] to-transparent flex flex-wrap items-center gap-3">
        <Boton onClick={() => onAplicar([...sel], agregar, quitar)} cargando={aplicando} disabled={total === 0 || pendientes > 0}>
          <CheckCircle2 size={16} /> Aplicar {sel.size} {sel.size === 1 ? "precio" : "precios"}{agregar.length ? ` · agregar ${agregar.length}` : ""}{quitar.length ? ` · quitar ${quitar.length}` : ""}
        </Boton>
        <Boton variante="suave" onClick={onCancelar} disabled={aplicando}>Cancelar</Boton>
        <p className={`text-xs ${pendientes ? "text-amber-400" : "text-zinc-500"}`}>{pendientes ? `Faltan ${pendientes} decisiones entre productos nuevos y que ya no están.` : "Hasta que no toques “Aplicar”, no se cambia nada."}</p>
      </div>
    </div>
  );
}

export default function ListaPrecios({ aviso, onCambioPrecios, irAProductos }) {
  const [paso, setPaso] = useState(0);
  const [analisis, setAnalisis] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState("");
  const [cargas, setCargas] = useState(null);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef(null);

  const cargarHistorial = useCallback(() => {
    api("/api/comercial/precios/cargas").then((d) => setCargas(d.cargas)).catch(() => setCargas([]));
  }, []);
  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  const leer = async (file) => {
    if (!file) return;
    setError("");
    setLeyendo(true);
    try {
      const fd = new FormData();
      fd.append("lista", file);
      const d = await subirForm("/api/comercial/precios/analizar", fd);
      setAnalisis(d);
      setPaso(1);
    } catch (e) {
      setError(e.message);
    } finally {
      setLeyendo(false);
    }
  };

  const aplicar = async (ids, nuevos, quitar) => {
    setAplicando(true);
    setError("");
    try {
      const d = await api(`/api/comercial/precios/${analisis.id}/aplicar`, { method: "POST", body: { ids, nuevos, quitar } });
      setResultado(d);
      setPaso(2);
      cargarHistorial();
      onCambioPrecios?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setAplicando(false);
    }
  };

  const deshacer = async (c) => {
    if (!window.confirm(`¿Deshacer la lista “${c.archivo || "Lista de precios"}”? Los productos vuelven al precio anterior.`)) return;
    setDeshaciendo(true);
    try {
      const d = await api(`/api/comercial/precios/${c.id}/deshacer`, { method: "POST" });
      aviso(`Se deshicieron ${d.revertidos} precios.`);
      cargarHistorial();
      onCambioPrecios?.();
    } catch (e) {
      aviso(e.message, "error");
    } finally {
      setDeshaciendo(false);
    }
  };

  const reiniciar = () => {
    setPaso(0);
    setAnalisis(null);
    setResultado(null);
    setError("");
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">Lista de precios mensual</h2>
            <p className="text-sm text-zinc-500 mt-0.5 max-w-xl">Subí la lista nueva cuando salga. El sistema compara con lo que hay, te muestra qué cambia y recién ahí aplicás. <b className="text-zinc-300 font-medium">Solo se actualizan los precios.</b></p>
          </div>
          <Pasos paso={paso} />
        </div>

        {error && <Aviso tono="rojo">{error}</Aviso>}

        {paso === 0 && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastrando(false); leer(e.dataTransfer.files?.[0]); }}
              className={`rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-colors ${arrastrando ? "border-[#FF5A00] bg-[#FF5A00]/5" : "border-zinc-800 bg-[#0d0d0e]"}`}
            >
              {leyendo ? (
                <div className="space-y-3">
                  <Loader2 size={36} className="mx-auto text-[#FF5A00] animate-spin" />
                  <p className="text-base font-medium text-white">Leyendo la lista…</p>
                  <p className="text-sm text-zinc-500">Un PDF de 30 páginas puede tardar uno o dos minutos. No cierres esta pantalla.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <UploadCloud size={40} className="mx-auto text-[#FF5A00]" />
                  <div>
                    <p className="text-base font-medium text-white">Arrastrá la lista de precios acá</p>
                    <p className="text-sm text-zinc-500 mt-1 flex items-center justify-center gap-3 flex-wrap"><span className="inline-flex items-center gap-1"><FileText size={14} /> PDF</span><span className="inline-flex items-center gap-1"><FileSpreadsheet size={14} /> Excel</span><span>CSV o TXT</span></p>
                  </div>
                  <Boton onClick={() => inputRef.current?.click()}><UploadCloud size={16} /> Elegir archivo</Boton>
                  <input ref={inputRef} type="file" accept=".pdf,.xlsx,.xls,.csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; leer(f); }} />
                </div>
              )}
            </div>
            <ListaPdf />
            <div>
              <h3 className="text-sm font-semibold text-zinc-200 mb-2 flex items-center gap-2"><History size={15} className="text-zinc-500" /> Listas anteriores</h3>
              <Historial cargas={cargas} onDeshacer={deshacer} deshaciendo={deshaciendo} />
            </div>
          </>
        )}

        {paso === 1 && analisis && (
          <>
            <p className="text-sm text-zinc-400">Archivo: <b className="text-zinc-200 font-medium">{analisis.archivo}</b> · {analisis.extraidos} productos leídos · {analisis.productos_en_sistema} en el sistema</p>
            <Revision key={analisis.id} a={analisis} onAplicar={aplicar} onCancelar={reiniciar} aplicando={aplicando} />
          </>
        )}

        {paso === 2 && resultado && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center space-y-4">
            <CheckCircle2 size={44} className="mx-auto text-emerald-400" />
            <div>
              <p className="text-lg font-semibold text-white">Lista aplicada</p>
              <p className="text-sm text-zinc-300 mt-1">{resultado.actualizados} {resultado.actualizados === 1 ? "precio actualizado" : "precios actualizados"}{resultado.quitados ? `, ${resultado.quitados} ${resultado.quitados === 1 ? "producto quitado" : "productos quitados"}` : ""}{resultado.nuevos ? ` y ${resultado.nuevos} ${resultado.nuevos === 1 ? "producto creado" : "productos creados"}` : ""}. Las fichas quedaron intactas.</p>
              {resultado.saltados?.length > 0 && <p className="text-xs text-amber-400 mt-2">No se pudo: {resultado.saltados.join("; ")}</p>}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Boton onClick={irAProductos}>Ver productos</Boton>
              <Boton variante="suave" onClick={reiniciar}>Subir otra lista</Boton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
