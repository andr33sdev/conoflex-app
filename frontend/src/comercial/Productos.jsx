import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, FileText, Images, LayoutGrid, List, Loader2, Lock, Package, Plus, Search, Trash2, X } from "lucide-react";
import { api } from "../produccion/util";
import { Aviso, Boton, Chip, Decision, Modal, Panel, Vacio } from "./ui";
import FichasPdf from "./FichasPdf";
import { campo, etiqueta, peso, subirForm, urlImagen } from "./util";

const usosALineas = (t) => String(t || "").split(/\s*\|\s*|\r?\n/).map((x) => x.trim()).filter(Boolean).join("\n");
const lineasAUsos = (t) => String(t || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean).join(" | ");
const fotoDe = (p) => p.foto_catalogo || p.foto_tecnica || "";
const fecha = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" }) : "");

const FILTROS = [
  ["todos", "Todos"],
  ["incompletos", "Fichas incompletas"],
  ["foto", "Sin foto"],
  ["precio", "Sin precio"],
  ["descripción", "Sin descripción"],
  ["usos", "Sin usos"],
  ["editados", "Corregidos a mano"],
];

function PrecioResumen({ p, grande }) {
  const v = p.estado.precio.valores;
  if (!v.length) return <span className="text-sm text-amber-400">Sin precio</span>;
  const base = grande ? "text-xl" : "text-base";
  if (v.length === 1) return <span className={`${base} font-semibold text-white`}>{peso(v[0].valor)}</span>;
  return <span className="text-sm text-zinc-200"><span className="text-zinc-500">desde </span><b className={`${base} font-semibold text-white`}>{peso(Math.min(...v.map((x) => x.valor)))}</b> <span className="text-zinc-500">· {v.length} variantes</span></span>;
}

function Tarjeta({ p, onAbrir }) {
  const foto = fotoDe(p);
  return (
    <button onClick={() => onAbrir(p)} className="group text-left rounded-xl border border-zinc-800 bg-[#0d0d0e] hover:border-[#FF5A00]/60 transition-colors overflow-hidden flex flex-col cursor-pointer">
      <div className="aspect-[4/3] bg-[#121214] relative grid place-items-center overflow-hidden">
        {foto ? <img src={urlImagen(foto)} alt={p.nombre} loading="lazy" className="w-full h-full object-contain p-2 group-hover:scale-[1.03] transition-transform" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <Package size={34} className="text-zinc-800" />}
        {!p.estado.completo && <span className="absolute top-2 left-2"><Chip tono="ambar"><AlertTriangle size={11} /> Falta {p.estado.faltan.length === 1 ? p.estado.faltan[0] : `${p.estado.faltan.length} datos`}</Chip></span>}
        {p.ficha_editada && <span className="absolute top-2 right-2 w-6 h-6 rounded-md bg-black/60 grid place-items-center text-zinc-300" title="Corregido a mano"><Lock size={12} /></span>}
      </div>
      <div className="p-3.5 flex-1 flex flex-col gap-1.5">
        <p className="text-xs font-semibold text-[#ff8a4d] truncate">{p.codigo} <span className="text-zinc-600 font-normal">· {p.categoria || "General"}</span></p>
        <p className="text-sm font-medium text-white leading-snug line-clamp-2 min-h-[2.5rem]">{p.nombre}</p>
        <div className="mt-auto pt-1.5 flex items-end justify-between gap-2">
          <PrecioResumen p={p} />
          {p.precio_actualizado && <span className="text-[11px] text-zinc-600">{fecha(p.precio_actualizado)}</span>}
        </div>
      </div>
    </button>
  );
}

function FilaProducto({ p, onAbrir }) {
  const foto = fotoDe(p);
  return (
    <button onClick={() => onAbrir(p)} className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-900/60 cursor-pointer">
      <div className="w-12 h-12 rounded-lg bg-[#121214] grid place-items-center overflow-hidden shrink-0">{foto ? <img src={urlImagen(foto)} alt="" loading="lazy" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <Package size={18} className="text-zinc-700" />}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-[#ff8a4d] truncate">{p.codigo} <span className="text-zinc-600 font-normal">· {p.categoria || "General"}</span></p>
        <p className="text-sm text-white truncate">{p.nombre}</p>
      </div>
      <div className="hidden sm:flex flex-wrap gap-1 justify-end max-w-[220px]">
        {p.estado.completo ? <Chip tono="verde"><CheckCircle2 size={11} /> Completa</Chip> : p.estado.faltan.slice(0, 2).map((x) => <Chip key={x} tono="ambar">{x}</Chip>)}
      </div>
      <div className="text-right shrink-0 w-32"><PrecioResumen p={p} /></div>
    </button>
  );
}

/* ------------------------------ fotos ------------------------------ */
function SlotFoto({ p, tipo, titulo, ayuda, onCambio, aviso }) {
  const campoFoto = tipo === "tecnica" ? "foto_tecnica" : "foto_catalogo";
  const [subiendo, setSubiendo] = useState(false);
  const [arrastra, setArrastra] = useState(false);
  const inputRef = useRef(null);
  const url = p[campoFoto];
  const subir = async (file) => {
    if (!file) return;
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append("imagen", file);
      fd.append("tipo", tipo);
      const d = await subirForm(`/api/comercial/productos/${p.id}/foto`, fd);
      onCambio({ [campoFoto]: d.url });
      aviso("Foto guardada.");
    } catch (e) {
      aviso(e.message, "error");
    } finally {
      setSubiendo(false);
    }
  };
  const quitar = async () => {
    if (!window.confirm("¿Quitar esta foto?")) return;
    try {
      await api(`/api/comercial/productos/${p.id}/foto/${tipo}`, { method: "DELETE" });
      onCambio({ [campoFoto]: null });
    } catch (e) {
      aviso(e.message, "error");
    }
  };
  return (
    <div>
      <p className="text-sm font-medium text-white">{titulo}</p>
      <p className="text-xs text-zinc-500 mb-2">{ayuda}</p>
      <div
        onDragOver={(e) => { e.preventDefault(); setArrastra(true); }}
        onDragLeave={() => setArrastra(false)}
        onDrop={(e) => { e.preventDefault(); setArrastra(false); subir(e.dataTransfer.files?.[0]); }}
        className={`aspect-[4/3] rounded-xl border-2 border-dashed grid place-items-center relative overflow-hidden transition-colors ${arrastra ? "border-[#FF5A00] bg-[#FF5A00]/5" : "border-zinc-800 bg-[#0b0b0c]"}`}
      >
        {subiendo ? <Loader2 className="animate-spin text-[#FF5A00]" /> : url ? <img src={urlImagen(url)} alt={titulo} className="w-full h-full object-contain p-2" /> : (
          <button onClick={() => inputRef.current?.click()} className="text-center text-zinc-500 hover:text-zinc-300 cursor-pointer p-4"><Camera size={26} className="mx-auto mb-1.5" /><span className="text-xs">Arrastrá una foto o tocá para elegirla</span></button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; subir(f); }} />
      {url && (
        <div className="flex gap-2 mt-2">
          <Boton variante="suave" className="!min-h-[34px] !px-3 text-xs" onClick={() => inputRef.current?.click()}>Reemplazar</Boton>
          <Boton variante="peligro" className="!min-h-[34px] !px-3 text-xs" onClick={quitar}><Trash2 size={13} /> Quitar</Boton>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ ficha individual ------------------------------ */
function Drawer({ p, categorias, onCerrar, onGuardado, onBorrado, aviso }) {
  const [tab, setTab] = useState("ficha");
  const [local, setLocal] = useState(p);
  const [f, setF] = useState({
    codigo: p.codigo || "", nombre: p.nombre || "", medidas: p.medidas || "", categoria: p.categoria || "General", especificacion: p.especificacion || "",
    descripcion: p.descripcion || "", usos: usosALineas(p.usos_recomendados || p.aplicacion), advertencias: p.advertencias || "", precio_lista: p.precio_lista || "", proteger: true,
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [hist, setHist] = useState(null);
  const sucio = useRef(false);
  const set = (k, v) => { sucio.current = true; setF((x) => ({ ...x, [k]: v })); };

  useEffect(() => {
    if (tab === "precio" && hist === null) api(`/api/comercial/precios/historial/${p.id}`).then((d) => setHist(d.historial)).catch(() => setHist([]));
  }, [tab, hist, p.id]);

  const cambioFoto = (parte) => { setLocal((x) => ({ ...x, ...parte })); onGuardado({ refrescar: true }); };

  const guardar = async () => {
    setGuardando(true);
    setError("");
    try {
      await api(`/api/comercial/productos/${p.id}`, {
        method: "PUT",
        body: { codigo: f.codigo, nombre: f.nombre, medidas: f.medidas, categoria: f.categoria, especificacion: f.especificacion, descripcion: f.descripcion, usos_recomendados: lineasAUsos(f.usos), advertencias: f.advertencias, precio_lista: f.precio_lista, ficha_editada: f.proteger },
      });
      aviso("Producto guardado.");
      onGuardado({ cerrar: true });
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  };
  const borrar = async () => {
    if (!window.confirm(`¿Borrar “${p.nombre}” del catálogo? Esto no se puede deshacer.`)) return;
    try {
      await api(`/api/comercial/productos/${p.id}`, { method: "DELETE" });
      aviso("Producto borrado.");
      onBorrado();
    } catch (e) {
      setError(e.message);
    }
  };
  const cerrar = () => { if (!sucio.current || window.confirm("Tenés cambios sin guardar. ¿Cerrar igual?")) onCerrar(); };
  const precio = p.estado.precio;

  return (
    <Panel
      titulo={p.nombre}
      subtitulo={`${p.codigo} · ${p.categoria || "General"}`}
      onCerrar={cerrar}
      pie={
        <>
          <Boton onClick={guardar} cargando={guardando} className="flex-1 sm:flex-none">Guardar cambios</Boton>
          <Boton variante="suave" onClick={cerrar}>Cerrar</Boton>
        </>
      }
    >
      <div className="px-5 pt-3 flex gap-1 border-b border-zinc-800 sticky top-0 bg-[#0c0c0d] z-10">
        {[["ficha", "Ficha"], ["precio", "Precio"], ["fotos", "Fotos"]].map(([id, t]) => (
          <button key={id} onClick={() => setTab(id)} aria-pressed={tab === id} className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px cursor-pointer transition-colors ${tab === id ? "border-[#FF5A00] text-white" : "border-transparent text-zinc-500 hover:text-zinc-200"}`}>{t}</button>
        ))}
      </div>
      <div className="p-5 space-y-4">
        {!p.estado.completo && <Aviso tono="ambar">Para que la IA lo pueda ofrecer bien falta: <b>{p.estado.faltan.join(", ")}</b>.</Aviso>}

        {tab === "ficha" && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className={etiqueta} htmlFor="p-cod">Código</label><input id="p-cod" className={campo} value={f.codigo} onChange={(e) => set("codigo", e.target.value)} /></div>
              <div><label className={etiqueta} htmlFor="p-cat">Categoría</label><input id="p-cat" list="categorias-lista" className={campo} value={f.categoria} onChange={(e) => set("categoria", e.target.value)} /><datalist id="categorias-lista">{categorias.map((c) => <option key={c} value={c} />)}</datalist></div>
            </div>
            <div><label className={etiqueta} htmlFor="p-nom">Nombre</label><input id="p-nom" className={campo} value={f.nombre} onChange={(e) => set("nombre", e.target.value)} /></div>
            <div><label className={etiqueta} htmlFor="p-med">Medidas</label><input id="p-med" className={campo} value={f.medidas} onChange={(e) => set("medidas", e.target.value)} placeholder="Ej: Base 26x26 cm · Alto 70 cm" /></div>
            <div><label className={etiqueta} htmlFor="p-esp">Especificación técnica</label><textarea id="p-esp" rows={3} className={campo} value={f.especificacion} onChange={(e) => set("especificacion", e.target.value)} /></div>
            <div><label className={etiqueta} htmlFor="p-desc">Descripción comercial</label><textarea id="p-desc" rows={4} className={campo} value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} placeholder="Qué es y para qué sirve, en palabras que entienda un cliente." /></div>
            <div><label className={etiqueta} htmlFor="p-usos">Usos recomendados <span className="text-zinc-600">(uno por línea: “Rubro: para qué”)</span></label><textarea id="p-usos" rows={6} className={campo} value={f.usos} onChange={(e) => set("usos", e.target.value)} placeholder={"Fútbol: marcar estaciones de práctica\nLogística: organizar sectores"} /></div>
            <div><label className={etiqueta} htmlFor="p-adv">Cuándo NO ofrecerlo</label><textarea id="p-adv" rows={3} className={campo} value={f.advertencias} onChange={(e) => set("advertencias", e.target.value)} placeholder="Ej: no sirve para canalizar tránsito en rutas." /></div>
            <label className="flex items-start gap-2.5 text-sm text-zinc-300 cursor-pointer"><input type="checkbox" checked={f.proteger} onChange={(e) => set("proteger", e.target.checked)} className="mt-1 accent-[#FF5A00]" /><span>Proteger esta ficha: si más adelante subís el PDF de fichas, no la pisa.</span></label>
            <div className="pt-3 border-t border-zinc-800/70"><Boton variante="peligro" onClick={borrar}><Trash2 size={15} /> Borrar producto</Boton></div>
          </>
        )}

        {tab === "precio" && (
          <>
            <div className="rounded-xl border border-zinc-800 bg-[#0d0d0e] p-4">
              <p className="text-xs text-zinc-500 mb-1">Precio de lista actual (sin IVA)</p>
              {precio.valores.length === 0 ? <p className="text-amber-400 text-sm">Sin precio cargado: la IA no puede cotizar este producto.</p> : (
                <ul className="space-y-1">{precio.valores.map((v, i) => <li key={i} className="flex items-baseline gap-2"><b className="text-2xl font-semibold text-white">{peso(v.valor)}</b>{v.etiqueta && <span className="text-sm text-zinc-400">{v.etiqueta}</span>}</li>)}</ul>
              )}
              {precio.unidad && <p className="text-xs text-zinc-500 mt-1">Se vende por {precio.unidad}.</p>}
              {local.precio_actualizado && <p className="text-xs text-zinc-500 mt-2">Última actualización: {fecha(local.precio_actualizado)}{p.precio_anterior ? ` · antes: ${p.precio_anterior}` : ""}</p>}
            </div>
            <Aviso tono="info">El precio se actualiza solo cuando cargás la lista mensual. Podés corregirlo a mano acá, pero la próxima lista lo va a reemplazar.</Aviso>
            <div><label className={etiqueta} htmlFor="p-precio">Precio de lista (texto)</label><input id="p-precio" className={campo} value={f.precio_lista} onChange={(e) => set("precio_lista", e.target.value)} placeholder="$35.210,07  ·  o con variantes: SIN FIJACIÓN $34.303,34 | HORMIGÓN $55.430,57" /></div>
            <div>
              <p className="text-sm font-medium text-zinc-200 mb-2">Historial de precios</p>
              {hist === null ? <Loader2 size={16} className="animate-spin text-zinc-600" /> : hist.length === 0 ? <p className="text-sm text-zinc-500">Todavía no hay cambios registrados. Se arma con cada lista mensual.</p> : (
                <ul className="divide-y divide-zinc-800/70 rounded-lg border border-zinc-800">
                  {hist.map((h, i) => <li key={i} className="px-3 py-2 text-sm flex flex-wrap gap-x-3"><span className="text-zinc-500 w-24 shrink-0">{fecha(h.created_at)}</span><span className="text-zinc-500 line-through break-all">{h.precio_anterior || "—"}</span><span className="text-white break-all">{h.precio_nuevo}</span></li>)}
                </ul>
              )}
            </div>
          </>
        )}

        {tab === "fotos" && (
          <div className="grid sm:grid-cols-2 gap-5">
            <SlotFoto p={local} tipo="catalogo" titulo="Foto del producto" ayuda="La que se ve en el catálogo y en las cotizaciones." onCambio={cambioFoto} aviso={aviso} />
            <SlotFoto p={local} tipo="tecnica" titulo="Foto técnica" ayuda="Plano o medidas del producto." onCambio={cambioFoto} aviso={aviso} />
            <p className="sm:col-span-2 text-xs text-zinc-600">JPG, PNG o WEBP de hasta 8 MB. Las fotos se guardan al instante, sin tocar “Guardar cambios”.</p>
          </div>
        )}
        {error && <Aviso tono="rojo">{error}</Aviso>}
      </div>
    </Panel>
  );
}

/* ------------------------------ acciones masivas ------------------------------ */
function ModalNuevo({ categorias, onCerrar, onCreado, aviso }) {
  const [f, setF] = useState({ codigo: "", nombre: "", medidas: "", categoria: "General", precio_lista: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const crear = async () => {
    setGuardando(true);
    setError("");
    try {
      const d = await api("/api/comercial/productos", { method: "POST", body: f });
      aviso("Producto creado. Completale la ficha.");
      onCreado(d.id);
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  };
  return (
    <Modal titulo="Nuevo producto" onCerrar={onCerrar} pie={<><Boton variante="suave" onClick={onCerrar}>Cancelar</Boton><Boton onClick={crear} cargando={guardando} disabled={!f.codigo.trim() || !f.nombre.trim()}>Crear producto</Boton></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className={etiqueta} htmlFor="n-cod">Código</label><input id="n-cod" autoFocus className={campo} value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} /></div>
          <div><label className={etiqueta} htmlFor="n-cat">Categoría</label><input id="n-cat" list="cat-nuevo" className={campo} value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} /><datalist id="cat-nuevo">{categorias.map((c) => <option key={c} value={c} />)}</datalist></div>
        </div>
        <div><label className={etiqueta} htmlFor="n-nom">Nombre</label><input id="n-nom" className={campo} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
        <div><label className={etiqueta} htmlFor="n-med">Medidas</label><input id="n-med" className={campo} value={f.medidas} onChange={(e) => setF({ ...f, medidas: e.target.value })} /></div>
        <div><label className={etiqueta} htmlFor="n-pre">Precio de lista</label><input id="n-pre" className={campo} value={f.precio_lista} onChange={(e) => setF({ ...f, precio_lista: e.target.value })} placeholder="$35.210,07" /></div>
        {error && <Aviso tono="rojo">{error}</Aviso>}
      </div>
    </Modal>
  );
}

function ModalFichasPdf({ categorias, onCerrar, onListo, aviso }) {
  const [archivos, setArchivos] = useState([]);
  const [categoria, setCategoria] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [trabajoId, setTrabajoId] = useState(null);
  const [conflictos, setConflictos] = useState(null);
  const [dec, setDec] = useState({});
  // La lectura con IA puede tardar minutos: se consulta el avance hasta que termina o hasta que hay algo para confirmar.
  const esperar = async (id) => {
    for (let i = 0; i < 240; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      let r;
      try {
        r = await api(`/api/catalogo/procesar-pdf/${id}`);
      } catch (e) {
        if (e.status === 404 || e.status === 500) throw e; // se perdió el trabajo o falló la lectura
        continue; // corte de red momentáneo: sigue esperando
      }
      if (r.estado === "CONFIRMAR") {
        setConflictos(r.conflictos || []);
        setDec({});
        return null;
      }
      if (r.estado === "LISTO") return r.resultado;
    }
    throw new Error("La importación está tardando demasiado. Revisá “PDFs de usos” en unos minutos para ver si terminó.");
  };
  const terminar = (d) => {
    if (!d) return;
    aviso(d.mensaje || "Fichas importadas.");
    onListo();
  };
  const enviar = async () => {
    setSubiendo(true);
    setError("");
    try {
      const fd = new FormData();
      archivos.forEach((a) => fd.append("pdf_files", a));
      fd.append("categoriaNombre", categoria.trim());
      const inicio = await subirForm("/api/catalogo/procesar-pdf", fd);
      setTrabajoId(inicio.trabajoId);
      terminar(await esperar(inicio.trabajoId));
    } catch (e) {
      setError(e.message);
      setSubiendo(false);
    }
  };
  const confirmar = async () => {
    setError("");
    const reemplazar = conflictos.filter((c) => dec[c.producto_id] === "si").map((c) => c.producto_id);
    setConflictos(null);
    try {
      await api(`/api/catalogo/procesar-pdf/${trabajoId}/confirmar`, { method: "POST", body: { reemplazar } });
      terminar(await esperar(trabajoId));
    } catch (e) {
      setError(e.message);
      setSubiendo(false);
    }
  };
  const pendientes = conflictos ? conflictos.filter((c) => !dec[c.producto_id]).length : 0;
  const fechaPdf = (f) => (f ? new Date(String(f).replace(" ", "T")).toLocaleString("es-AR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "fecha desconocida");
  if (conflictos) {
    return (
      <Modal ancho="max-w-3xl" titulo="Estos productos ya tenían su ficha de otro PDF" onCerrar={() => {}}
        pie={<><Boton variante="suave" onClick={() => { const n = {}; conflictos.forEach((c) => { n[c.producto_id] = dec[c.producto_id] || "no"; }); setDec(n); }}>Conservar los que faltan</Boton><Boton onClick={confirmar} disabled={pendientes > 0}>{pendientes ? `Faltan ${pendientes} decisiones` : `Continuar (reemplazar ${conflictos.filter((c) => dec[c.producto_id] === "si").length})`}</Boton></>}>
        <div className="space-y-3">
          <Aviso tono="info">Para cada producto elegí si querés <b>reemplazar</b> la descripción y los usos que venían del PDF anterior por los del PDF nuevo, o <b>conservar</b> lo que ya estaba. Los demás productos del PDF se cargan igual.</Aviso>
          <ul className="space-y-2.5">
            {conflictos.map((c) => (
              <li key={c.producto_id} className="rounded-xl border border-zinc-800 bg-[#0d0d0e] p-3.5">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="text-sm text-zinc-100"><b className="text-[#ff8a4d]">{c.codigo}</b> <span className="text-zinc-400">{c.nombre}</span></p>
                    <p className="text-xs text-zinc-500 mt-1">Ahora viene de <b className="text-zinc-300 font-medium">{c.anterior.pdf}</b> · subido el {fechaPdf(c.anterior.fecha)}</p>
                    <p className="text-xs text-zinc-500">PDF nuevo: <b className="text-zinc-300 font-medium">{c.nuevo.pdf}</b></p>
                  </div>
                  <Decision valor={dec[c.producto_id]} onElegir={(v) => setDec({ ...dec, [c.producto_id]: v })} si="Reemplazar" no="Conservar" tonoSi="verde" />
                </div>
                {(c.descripcion_anterior || c.descripcion_nueva) && (
                  <div className="grid sm:grid-cols-2 gap-2 mt-2.5 text-xs">
                    <p className="rounded-lg bg-zinc-900/60 p-2 text-zinc-400"><b className="block text-zinc-300 font-medium mb-0.5">Actual</b>{c.descripcion_anterior || "Sin descripción"}</p>
                    <p className="rounded-lg bg-zinc-900/60 p-2 text-zinc-400"><b className="block text-zinc-300 font-medium mb-0.5">Del PDF nuevo</b>{c.descripcion_nueva || "Sin descripción"}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {error && <Aviso tono="rojo">{error}</Aviso>}
        </div>
      </Modal>
    );
  }
  return (
    <Modal titulo="Importar fichas técnicas (PDF)" onCerrar={subiendo ? () => {} : onCerrar} pie={<><Boton variante="suave" onClick={onCerrar} disabled={subiendo}>Cancelar</Boton><Boton onClick={enviar} cargando={subiendo} disabled={!archivos.length || !categoria.trim()}>Importar {archivos.length ? `${archivos.length} ${archivos.length === 1 ? "PDF" : "PDFs"}` : ""}</Boton></>}>
      <div className="space-y-4">
        <p className="text-sm text-zinc-400">La IA lee cada PDF y completa descripción, usos y medidas de los productos. <b className="text-zinc-200 font-medium">No toca los precios</b> ni pisa las fichas que corregiste a mano.</p>
        <div><label className={etiqueta} htmlFor="c-cat">Categoría de estos PDFs</label><input id="c-cat" list="cat-pdf" className={campo} value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ej: Conos, Vallas, Espejos" /><datalist id="cat-pdf">{categorias.map((c) => <option key={c} value={c} />)}</datalist></div>
        <label className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-zinc-800 hover:border-zinc-600 p-6 text-center cursor-pointer">
          <FileText size={26} className="text-[#FF5A00]" />
          <span className="text-sm text-zinc-200">{archivos.length ? archivos.map((a) => a.name).join(", ") : "Elegir uno o varios PDFs"}</span>
          <input type="file" multiple accept="application/pdf" className="hidden" onChange={(e) => setArchivos(Array.from(e.target.files || []))} />
        </label>
        {subiendo && <p className="text-sm text-zinc-400 flex items-center gap-2"><Loader2 size={15} className="animate-spin text-[#FF5A00]" /> Leyendo los PDFs, puede tardar un par de minutos…</p>}
        {error && <Aviso tono="rojo">{error}</Aviso>}
      </div>
    </Modal>
  );
}

function ModalFotosLote({ onCerrar, onListo }) {
  const [archivos, setArchivos] = useState([]);
  const [tipo, setTipo] = useState("catalogo");
  const [pisar, setPisar] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [res, setRes] = useState(null);
  const [error, setError] = useState("");
  const enviar = async () => {
    setSubiendo(true);
    setError("");
    try {
      const fd = new FormData();
      archivos.forEach((a) => fd.append("imagenes", a));
      fd.append("tipo", tipo);
      fd.append("pisar", String(pisar));
      setRes(await subirForm("/api/comercial/fotos/lote", fd));
      onListo();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubiendo(false);
    }
  };
  return (
    <Modal titulo="Subir fotos en lote" ancho="max-w-xl" onCerrar={onCerrar} pie={res ? <Boton onClick={onCerrar}>Listo</Boton> : <><Boton variante="suave" onClick={onCerrar} disabled={subiendo}>Cancelar</Boton><Boton onClick={enviar} cargando={subiendo} disabled={!archivos.length}>Subir {archivos.length || ""} {archivos.length === 1 ? "foto" : "fotos"}</Boton></>}>
      {res ? (
        <div className="space-y-3">
          <Aviso tono={res.asignadas.length ? "verde" : "ambar"}>Se asignaron <b>{res.asignadas.length}</b> {res.asignadas.length === 1 ? "foto" : "fotos"}.</Aviso>
          {res.omitidas.length > 0 && <div><p className="text-sm font-medium text-zinc-200 mb-1">Ya tenían foto, no se tocaron ({res.omitidas.length})</p><p className="text-xs text-zinc-500">{res.omitidas.map((o) => o.archivo).join(", ")}</p></div>}
          {res.sin_match.length > 0 && <div><p className="text-sm font-medium text-amber-300 mb-1">No pude asignar ({res.sin_match.length})</p><ul className="text-xs text-zinc-400 space-y-0.5 max-h-40 overflow-y-auto">{res.sin_match.map((s, i) => <li key={i}><b className="text-zinc-300">{s.archivo}</b>: {s.motivo}</li>)}</ul></div>}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">Nombrá cada archivo con el <b className="text-zinc-200 font-medium">código del producto</b> (por ejemplo <code className="text-[#ff8a4d]">1025.jpg</code> o <code className="text-[#ff8a4d]">1570L-2R NA.png</code>) y el sistema la asigna sola. Hasta 60 fotos por vez.</p>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="tipo" className="accent-[#FF5A00]" checked={tipo === "catalogo"} onChange={() => setTipo("catalogo")} /> Foto del producto</label>
            <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="tipo" className="accent-[#FF5A00]" checked={tipo === "tecnica"} onChange={() => setTipo("tecnica")} /> Foto técnica</label>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer"><input type="checkbox" className="accent-[#FF5A00]" checked={pisar} onChange={(e) => setPisar(e.target.checked)} /> Reemplazar las fotos que ya existen</label>
          <label className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-zinc-800 hover:border-zinc-600 p-6 text-center cursor-pointer">
            <Images size={26} className="text-[#FF5A00]" />
            <span className="text-sm text-zinc-200">{archivos.length ? `${archivos.length} ${archivos.length === 1 ? "imagen elegida" : "imágenes elegidas"}` : "Elegir imágenes"}</span>
            <span className="text-xs text-zinc-600">JPG, PNG o WEBP · hasta 8 MB cada una</span>
            <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setArchivos(Array.from(e.target.files || []))} />
          </label>
          {error && <Aviso tono="rojo">{error}</Aviso>}
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------ pantalla ------------------------------ */
export default function Productos({ aviso, refrescarKey, onCambio }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [categoria, setCategoria] = useState("todas");
  const [q, setQ] = useState("");
  const [vista, setVista] = useState(() => { try { return localStorage.getItem("comercial_vista") || "tarjetas"; } catch { return "tarjetas"; } });
  const [abierto, setAbierto] = useState(null);
  const [modal, setModal] = useState(null);
  const [pag, setPag] = useState({ n: 1, clave: "" });
  const POR_PAGINA = vista === "tarjetas" ? 24 : 40;

  const cargar = useCallback(() => api("/api/catalogo/fichas").then((d) => { setDatos(d); setError(""); }).catch((e) => setError(e.message || "No pude cargar los productos.")), []);
  useEffect(() => { cargar(); }, [cargar, refrescarKey]);
  const cambiarVista = (v) => { setVista(v); try { localStorage.setItem("comercial_vista", v); } catch { /* sin almacenamiento */ } };

  const categorias = useMemo(() => [...new Set((datos?.productos || []).map((p) => p.categoria || "General"))].sort((a, b) => a.localeCompare(b, "es")), [datos]);
  const lista = useMemo(() => {
    if (!datos) return [];
    const t = q.trim().toLowerCase();
    return datos.productos.filter((p) => {
      if (categoria !== "todas" && (p.categoria || "General") !== categoria) return false;
      if (t && !`${p.codigo} ${p.nombre} ${p.categoria} ${p.medidas}`.toLowerCase().includes(t)) return false;
      if (filtro === "todos") return true;
      if (filtro === "incompletos") return !p.estado.completo;
      if (filtro === "editados") return p.ficha_editada;
      return p.estado.faltan.includes(filtro);
    });
  }, [datos, filtro, categoria, q]);

  if (error) return <div className="p-6"><Aviso tono="rojo">{error}</Aviso></div>;
  if (!datos) return <div className="p-10 grid place-items-center text-zinc-500"><Loader2 className="animate-spin" /></div>;
  const r = datos.resumen;
  const clave = `${filtro}|${categoria}|${q}|${vista}`;
  const pagina = pag.clave === clave ? pag.n : 1;
  const setPagina = (n) => setPag({ n, clave });
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const visibles = lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const cuenta = { todos: r.total, incompletos: r.total - r.completos, foto: r.sin_foto, precio: r.sin_precio, "descripción": r.sin_descripcion, usos: r.sin_usos, editados: r.editados };
  const productoAbierto = abierto ? datos.productos.find((p) => p.id === abierto) : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">Productos</h2>
            <p className="text-sm text-zinc-500 mt-0.5"><b className="text-zinc-200 font-medium">{r.completos}</b> de {r.total} fichas completas · la IA usa estas fichas para ofrecer y cotizar.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Boton variante="suave" onClick={() => setModal("pdfs")}><FileText size={15} /> PDFs de usos</Boton>
            <Boton variante="suave" onClick={() => setModal("fichas")}><FileText size={15} /> Importar fichas PDF</Boton>
            <Boton variante="suave" onClick={() => setModal("fotos")}><Images size={15} /> Fotos en lote</Boton>
            <Boton onClick={() => setModal("nuevo")}><Plus size={16} /> Nuevo producto</Boton>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código, nombre o medidas" aria-label="Buscar productos" className="w-full bg-[#0b0b0c] border border-zinc-800 focus:border-[#FF5A00] rounded-lg pl-9 pr-8 min-h-[42px] text-sm text-zinc-100 outline-none" />
            {q && <button onClick={() => setQ("")} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white cursor-pointer"><X size={15} /></button>}
          </div>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría" className="bg-[#0b0b0c] border border-zinc-800 rounded-lg px-3 min-h-[42px] text-sm text-zinc-200 outline-none focus:border-[#FF5A00] max-w-[220px]">
            <option value="todas">Todas las categorías</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex rounded-lg border border-zinc-800 overflow-hidden ml-auto">
            {[["tarjetas", LayoutGrid, "Tarjetas"], ["lista", List, "Lista"]].map(([id, Icono, t]) => (
              <button key={id} onClick={() => cambiarVista(id)} aria-label={t} aria-pressed={vista === id} className={`w-11 min-h-[42px] grid place-items-center cursor-pointer ${vista === id ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-200"}`}><Icono size={16} /></button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTROS.map(([id, t]) => (
            <button key={id} onClick={() => setFiltro(id)} aria-pressed={filtro === id} className={`px-3 min-h-[34px] rounded-lg text-sm border cursor-pointer transition-colors ${filtro === id ? "bg-[#FF5A00] border-[#FF5A00] text-black font-semibold" : "border-zinc-800 text-zinc-300 hover:bg-zinc-900"}`}>{t} <span className={filtro === id ? "text-black/60" : "text-zinc-600"}>{cuenta[id]}</span></button>
          ))}
        </div>

        {lista.length === 0 ? (
          <Vacio icono={Package} titulo={r.total === 0 ? "Todavía no hay productos" : "No hay productos con ese filtro"} texto={r.total === 0 ? "Cargá la lista de precios o creá el primero a mano." : "Probá con otra búsqueda o categoría."} />
        ) : vista === "tarjetas" ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">{visibles.map((p) => <Tarjeta key={p.id} p={p} onAbrir={(x) => setAbierto(x.id)} />)}</div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-[#0d0d0e] divide-y divide-zinc-800/70 overflow-hidden">{visibles.map((p) => <FilaProducto key={p.id} p={p} onAbrir={(x) => setAbierto(x.id)} />)}</div>
        )}

        {paginas > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2 text-sm text-zinc-400">
            <Boton variante="suave" className="!min-h-[36px]" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>Anterior</Boton>
            <span>Página {pagina} de {paginas} · {lista.length} productos</span>
            <Boton variante="suave" className="!min-h-[36px]" disabled={pagina === paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</Boton>
          </div>
        )}
      </div>

      {productoAbierto && (
        <Drawer
          key={productoAbierto.id}
          p={productoAbierto}
          categorias={categorias}
          aviso={aviso}
          onCerrar={() => setAbierto(null)}
          onGuardado={({ cerrar, refrescar }) => { cargar(); onCambio?.(); if (cerrar) setAbierto(null); if (refrescar) { /* la lista ya se recarga */ } }}
          onBorrado={() => { setAbierto(null); cargar(); onCambio?.(); }}
        />
      )}
      {modal === "nuevo" && <ModalNuevo categorias={categorias} aviso={aviso} onCerrar={() => setModal(null)} onCreado={async (id) => { setModal(null); await cargar(); onCambio?.(); setAbierto(id); }} />}
      {modal === "fichas" && <ModalFichasPdf categorias={categorias} aviso={aviso} onCerrar={() => setModal(null)} onListo={() => { setModal(null); cargar(); onCambio?.(); }} />}
      {modal === "pdfs" && <FichasPdf onCerrar={() => setModal(null)} onAbrirProducto={(id) => setAbierto(id)} onCambio={() => { cargar(); onCambio?.(); }} />}
      {modal === "fotos" && <ModalFotosLote onCerrar={() => setModal(null)} onListo={() => { cargar(); onCambio?.(); }} />}
    </div>
  );
}
