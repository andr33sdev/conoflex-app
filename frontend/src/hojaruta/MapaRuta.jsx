import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { AlertTriangle, Calculator, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Loader2, MapPin, Navigation, Pencil, Phone, Route as RouteIcon, TrendingDown, Undo2 } from "lucide-react";
import "./mapa.css";
import Cruces from "./Cruces";
import BuscadorDireccion from "./BuscadorDireccion";
import BotonPdf from "./BotonPdf";
import { listaOps } from "./ops";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "";
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function pedir(path, opciones) {
  const res = await fetch(`${API_BASE_URL}${path}`, opciones && { ...opciones, headers: { "Content-Type": "application/json" }, body: JSON.stringify(opciones.body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.detalle ? `${d.error} (${d.detalle})` : d.error || "No se pudo completar.");
  return d;
}

const PIN = (fondo, texto) => `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg"><path d="M16 1C8 1 1.5 7.4 1.5 15.3 1.5 26 16 41 16 41s14.5-15 14.5-25.7C30.5 7.4 24 1 16 1z" fill="${fondo}" stroke="#fff" stroke-width="2"/><text x="16" y="20" text-anchor="middle" font-family="system-ui,Arial" font-weight="800" font-size="13" fill="#fff">${texto}</text></svg>`;
const COLOR = { origen: "#1f2937", ruta: "#ea580c", fuera: "#9ca3af" };
const icono = (tipo, t) => L.divIcon({ className: "pin-mapa", html: PIN(COLOR[tipo], t), iconSize: [32, 42], iconAnchor: [16, 41], popupAnchor: [0, -38] });

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const aFecha = (f) => new Date(`${f}T12:00:00`);
const sumarDias = (f, n) => { const d = aFecha(f); d.setDate(d.getDate() + n); return iso(d); };
const tituloDia = (f) => { const d = aFecha(f); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
const corto = (t, n = 24) => (t.length > n ? `${t.slice(0, n - 1).trim()}…` : t);

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const normCli = (t) => String(t || "").trim().toLowerCase().replace(/\s+/g, " ");
const textoOps = (p) => `OP ${p.ops.join(" · ")}`;
/** Junta las OP del mismo cliente y el mismo lugar en una sola parada. */
function agruparParadas(lista) {
  const grupos = new Map();
  for (const p of lista) {
    const lugar = p.lat != null ? `${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}` : `d:${normCli(p.direccion)}`;
    const k = `${normCli(p.cliente)}|${lugar}`;
    const g = grupos.get(k);
    if (!g) { grupos.set(k, { ...p, ids: [p.id], ops: listaOps(p.op), observaciones: p.observaciones || "" }); continue; }
    g.ids.push(p.id);
    for (const o of listaOps(p.op)) if (!g.ops.includes(o)) g.ops.push(o);
    g.prioridad = Math.max(g.prioridad || 0, p.prioridad || 0);
    g.contacto_nombre = g.contacto_nombre || p.contacto_nombre;
    g.contacto_telefono = g.contacto_telefono || p.contacto_telefono;
    if (p.observaciones && !g.observaciones.split(" / ").includes(p.observaciones)) g.observaciones = g.observaciones ? `${g.observaciones} / ${p.observaciones}` : p.observaciones;
    g.aproximada = g.aproximada || p.aproximada;
  }
  return [...grupos.values()];
}

export default function MapaRuta({ fechaInicial, esAdmin, usuario }) {
  const [fecha, setFecha] = useState(fechaInicial || iso(new Date()));
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [fuera, setFuera] = useState(() => new Set()); // ids destildados
  const [vuelta, setVuelta] = useState(true);
  const [ruta, setRuta] = useState(null);
  const [manual, setManual] = useState(null); // orden elegido a mano (ids) o null = el mejor recorrido
  const [rutaManual, setRutaManual] = useState(null);
  const [base, setBase] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [errRuta, setErrRuta] = useState("");
  const [editOrigen, setEditOrigen] = useState(false);
  const [textoOrigen, setTextoOrigen] = useState("");
  const [guardandoOrigen, setGuardandoOrigen] = useState(false);
  const mapaEl = useRef(null);
  const mapa = useRef(null);
  const capa = useRef(null);
  const turno = useRef(0);
  const marcadores = useRef({});
  const [aportes, setAportes] = useState(null);
  const [calcAportes, setCalcAportes] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async () => {
    try { setDatos(await pedir(`/api/hoja-ruta/mapa?fecha=${fecha}`)); setError(""); } catch (e) { setError(e.message); }
  }, [fecha]);
  // Carga el día elegido; si quedaron direcciones por ubicar, vuelve a pedir hasta que estén todas.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDatos(null); setFuera(new Set()); setRuta(null); setBase(null); setManual(null); setRutaManual(null); cargar(); }, [cargar]);
  useEffect(() => {
    if (!datos?.pendientes) return undefined;
    const t = setTimeout(cargar, 1500);
    return () => clearTimeout(t);
  }, [datos, cargar]);

  // Un cliente con varias OP para el mismo lugar aparece una sola vez (con todas sus OP).
  const paradas = useMemo(() => agruparParadas(datos?.paradas || []), [datos]);
  const ubicadas = useMemo(() => paradas.filter((p) => p.lat != null), [paradas]);
  const revisar = useMemo(() => paradas.filter((p) => p.lat == null || p.aproximada), [paradas]);
  const elegidas = useMemo(() => ubicadas.filter((p) => !fuera.has(p.id)), [ubicadas, fuera]);
  const origen = datos?.origen;

  const calcular = useCallback(async (paradas, fijo = false) => {
    if (!origen || !paradas.length) return null;
    return pedir("/api/hoja-ruta/ruta", { method: "POST", body: { vuelta, fijo, puntos: [origen, ...paradas].map((p) => ({ lat: p.lat, lng: p.lng })) } });
  }, [origen, vuelta]);

  // Ruta con todos (para comparar cuánto cambia al sacar alguno).
  useEffect(() => { let vivo = true; calcular(ubicadas).then((r) => vivo && setBase(r)).catch(() => vivo && setBase(null)); return () => { vivo = false; }; }, [calcular, ubicadas]);

  // Ruta óptima con los clientes tildados: se recalcula al tildar/destildar.
  const claveSel = elegidas.map((p) => p.id).join(",");
  useEffect(() => {
    const mi = ++turno.current;
    const t = setTimeout(async () => {
      if (!origen || !elegidas.length) { setRuta(null); setErrRuta(""); return; }
      setCalculando(true);
      try {
        const r = await calcular(elegidas);
        if (mi === turno.current) { setRuta(r); setErrRuta(""); }
      } catch (e) { if (mi === turno.current) { setRuta(null); setErrRuta(e.message); } }
      finally { if (mi === turno.current) setCalculando(false); }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveSel, calcular]);

  const optimas = useMemo(() => (ruta ? ruta.orden.filter((i) => i > 0).map((i) => elegidas[i - 1]).filter(Boolean) : elegidas), [ruta, elegidas]);
  // Orden a mano: se mantiene para lo ya ordenado y lo recién tildado se agrega al final.
  const manuales = useMemo(() => {
    if (!manual) return null;
    const por = new Map(elegidas.map((p) => [p.id, p]));
    return [...manual.filter((id) => por.has(id)).map((id) => por.get(id)), ...elegidas.filter((p) => !manual.includes(p.id))];
  }, [manual, elegidas]);
  const ordenadas = manuales || optimas;
  const claveManual = manuales ? manuales.map((p) => p.id).join(",") : "";
  useEffect(() => {
    if (!manuales || !origen) return undefined;
    let vivo = true;
    const t = setTimeout(async () => {
      setCalculando(true);
      try { const r = await calcular(manuales, true); if (vivo) { setRutaManual(r); setErrRuta(""); } }
      catch (e) { if (vivo) { setRutaManual(null); setErrRuta(e.message); } }
      finally { if (vivo) setCalculando(false); }
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveManual, calcular]);
  const rutaVista = manuales ? rutaManual : ruta; // lo que se dibuja y se suma
  const mover = (id, dir) => {
    const ids = ordenadas.map((p) => p.id);
    const i = ids.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setManual(ids);
  };
  const diferenciaKm = manuales && rutaManual && ruta ? Math.round((rutaManual.distancia_km - ruta.distancia_km) * 10) / 10 : null;

  // Mapa
  useEffect(() => {
    if (!mapaEl.current || mapa.current) return undefined;
    mapa.current = L.map(mapaEl.current, { zoomControl: true }).setView([-34.6, -58.45], 10);
    L.tileLayer(import.meta.env?.VITE_MAP_TILES || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(mapa.current);
    mapa.current.zoomControl.setPosition("bottomright");
    capa.current = L.layerGroup().addTo(mapa.current);
    return () => { mapa.current?.remove(); mapa.current = null; };
  }, []);
  useEffect(() => {
    if (!mapa.current || !capa.current) return;
    capa.current.clearLayers();
    marcadores.current = {};
    const puntos = [];
    if (origen) { L.marker([origen.lat, origen.lng], { icon: icono("origen", "P") }).bindPopup(`<b>Planta</b><br>${esc(origen.direccion)}`).addTo(capa.current); puntos.push([origen.lat, origen.lng]); }
    if (rutaVista?.trazado?.length) {
      L.polyline(rutaVista.trazado, { color: "#ffffff", weight: 11, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(capa.current);
      L.polyline(rutaVista.trazado, { color: "#2563eb", weight: 6, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(capa.current);
      puntos.push(...rutaVista.trazado);
    }
    ubicadas.forEach((p) => {
      const n = ordenadas.indexOf(p);
      const dentro = !fuera.has(p.id);
      marcadores.current[p.id] = L.marker([p.lat, p.lng], { icon: icono(dentro ? "ruta" : "fuera", dentro && n >= 0 ? n + 1 : "·"), zIndexOffset: dentro ? 100 : 0 }).bindPopup(`<b>${esc(p.cliente)}</b><br>${esc(textoOps(p))}<br>${esc(p.direccion)}`).addTo(capa.current);
      if (dentro && ordenadas.length <= 15) marcadores.current[p.id].bindTooltip(esc(corto(p.cliente)), { permanent: true, direction: "right", offset: [12, -22], className: "tip-mapa" });
      puntos.push([p.lat, p.lng]);
    });
    if (puntos.length > 1) mapa.current.fitBounds(L.latLngBounds(puntos), { padding: [30, 30], maxZoom: 15 });
    else if (puntos.length === 1) mapa.current.setView(puntos[0], 13);
  }, [ubicadas, ordenadas, rutaVista, origen, fuera]);

  const verEnMapa = (p) => {
    const m = marcadores.current[p.id];
    if (!m || !mapa.current) return;
    mapa.current.flyTo([p.lat, p.lng], Math.max(mapa.current.getZoom(), 15), { duration: 0.6 });
    m.openPopup();
  };
  // Abre el recorrido en Google Maps (para el celular del chofer), en el orden óptimo.
  const urlGoogle = useMemo(() => {
    if (!origen || !ordenadas.length) return null;
    const c = (x) => `${x.lat},${x.lng}`;
    const dest = rutaVista?.vuelta ? origen : ordenadas[ordenadas.length - 1];
    const medio = rutaVista?.vuelta ? ordenadas : ordenadas.slice(0, -1);
    const q = new URLSearchParams({ api: "1", origin: c(origen), destination: c(dest), travelmode: "driving" });
    if (medio.length) q.set("waypoints", medio.map(c).join("|"));
    return `https://www.google.com/maps/dir/?${q}`;
  }, [origen, ordenadas, rutaVista]);
  const alternar = (id) => setFuera((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const guardarOrigen = async () => {
    setGuardandoOrigen(true); setError("");
    try { await pedir("/api/hoja-ruta/origen", { method: "PUT", body: { direccion: textoOrigen } }); setEditOrigen(false); await cargar(); }
    catch (e) { setError(e.message); } finally { setGuardandoOrigen(false); }
  };

  const claveAportes = `${claveSel}|${vuelta}`;
  const aporte = aportes?.clave === claveAportes ? aportes.datos : null;
  const calcularAportes = async () => {
    if (!ruta || elegidas.length < 2) return;
    setCalcAportes(true); setError("");
    try {
      const out = {};
      for (const p of elegidas.slice(0, 15)) {
        const r = await calcular(elegidas.filter((x) => x.id !== p.id));
        out[p.id] = { km: Math.round((ruta.distancia_km - r.distancia_km) * 10) / 10 };
      }
      setAportes({ clave: claveAportes, datos: out });
    } catch (e) { setError(e.message); } finally { setCalcAportes(false); }
  };
  const masCaro = aporte ? elegidas.filter((p) => aporte[p.id]).sort((a, b) => aporte[b.id].km - aporte[a.id].km)[0] : null;
  const fueraAlta = ubicadas.filter((p) => fuera.has(p.id) && p.prioridad >= 4);

  const copiarRuta = async () => {
    const l = [`HOJA DE RUTA · ${tituloDia(fecha)}`, `${rutaVista.distancia_km} km en total`, ""];
    ordenadas.forEach((p, i) => {
      l.push(`${i + 1}) ${p.cliente} (${textoOps(p)})`);
      l.push(`   ${p.tipo_entrega === "TRANSPORTE" ? `${p.transporte_nombre} · ` : ""}${p.direccion}`);
      if (p.contacto_nombre || p.contacto_telefono) l.push(`   Contacto: ${[p.contacto_nombre, p.contacto_telefono].filter(Boolean).join(" · ")}`);
      if (p.observaciones) l.push(`   Obs: ${p.observaciones}`);
    });
    if (urlGoogle) l.push("", `Mapa: ${urlGoogle}`);
    const texto = l.join("\n");
    try { await navigator.clipboard.writeText(texto); } catch {
      const t = document.createElement("textarea"); t.value = texto; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
    }
    setCopiado(true); setTimeout(() => setCopiado(false), 2000);
  };

  const hayCambio = base && ruta && elegidas.length < ubicadas.length;
  const ahorroKm = hayCambio ? Math.round((base.distancia_km - ruta.distancia_km) * 10) / 10 : 0;
  const pill = (act) => `px-3 py-1.5 rounded-md text-xs font-semibold border ${act ? "border-orange-500 bg-orange-500/10 text-orange-300" : "border-zinc-800 text-zinc-400 hover:bg-zinc-800"}`;
  const ahora = new Date();
  const hoy = iso(ahora);
  const manana = iso(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1));

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <button onClick={() => setFecha(sumarDias(fecha, -1))} className="p-2 rounded-md border border-zinc-800 hover:bg-zinc-800 text-zinc-300" aria-label="Día anterior"><ChevronLeft size={15} /></button>
        <input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} className="bg-[#121212] border border-zinc-800 rounded-md text-xs text-zinc-200 px-2 py-1.5" aria-label="Día" />
        <button onClick={() => setFecha(sumarDias(fecha, 1))} className="p-2 rounded-md border border-zinc-800 hover:bg-zinc-800 text-zinc-300" aria-label="Día siguiente"><ChevronRight size={15} /></button>
        <button onClick={() => setFecha(hoy)} className={pill(fecha === hoy)}>Hoy</button>
        <button onClick={() => setFecha(manana)} className={pill(fecha === manana)}>Mañana</button>
        <p className="text-sm font-bold text-white first-letter:uppercase ml-1 hidden sm:block">{tituloDia(fecha)}</p>
        <label className="flex items-center gap-1.5 text-xs text-zinc-400 ml-auto cursor-pointer"><input type="checkbox" checked={vuelta} onChange={(e) => setVuelta(e.target.checked)} className="accent-orange-500" />Incluir la vuelta a planta</label>
      </div>

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      {datos && !origen && (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-4 mb-4">
          <p className="text-sm text-amber-200 font-semibold">Falta la dirección de la planta</p>
          <p className="text-xs text-zinc-400 mt-1">La ruta sale desde ahí. {esAdmin ? "Cargala una sola vez:" : "Pedile a un administrador que la cargue."}</p>
          {esAdmin && (
            <div className="flex gap-2 mt-2">
              <input value={textoOrigen} onChange={(e) => setTextoOrigen(e.target.value)} placeholder="Calle, número, localidad" className="flex-1 bg-[#0d0d0d] border border-zinc-700 rounded-md px-3 py-2 text-sm text-white placeholder-zinc-600" />
              <button onClick={guardarOrigen} disabled={guardandoOrigen || !textoOrigen.trim()} className="px-4 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold disabled:opacity-50">{guardandoOrigen ? <Loader2 size={14} className="animate-spin" /> : "Guardar"}</button>
            </div>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4 items-start">
        <div className="relative rounded-lg overflow-hidden border border-zinc-800">
          <div ref={mapaEl} className="mapa-ruta h-[420px] lg:h-[calc(100vh-230px)] lg:min-h-[520px] w-full bg-zinc-200" data-testid="mapa" />
          {calculando && <div className="absolute top-3 right-3 z-[500] bg-black/70 text-white text-xs rounded-md px-2.5 py-1.5 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />Calculando ruta…</div>}
        </div>

        <div className="flex flex-col gap-3 lg:max-h-[calc(100vh-230px)] lg:overflow-y-auto lg:pr-1">
          {!datos ? <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-zinc-600" /></div> : (
            <>
              <div className="rounded-lg border border-zinc-700 bg-[#161616] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5"><RouteIcon size={12} />Ruta del día</p>
                  {origen && esAdmin && <button onClick={() => { setTextoOrigen(origen.direccion); setEditOrigen((v) => !v); }} className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1"><Pencil size={11} />Planta</button>}
                </div>
                {rutaVista ? (
                  <>
                    <p className="text-2xl font-black text-white mt-1 tabular-nums">{rutaVista.distancia_km} km</p>
                    <p className="text-[11px] text-zinc-500">{elegidas.length} parada{elegidas.length > 1 ? "s" : ""}{rutaVista.vuelta ? " con vuelta a planta" : " sin vuelta"}{manuales ? " · orden manual" : ""}</p>
                    {manuales && (
                      <div className="mt-2 rounded-md border border-sky-900/60 bg-sky-950/30 px-2.5 py-1.5 text-xs text-sky-200 flex items-center justify-between gap-2">
                        <span>{diferenciaKm === null ? "Orden elegido por vos." : diferenciaKm > 0 ? `Tu orden suma ${diferenciaKm} km respecto al mejor.` : diferenciaKm < 0 ? `Tu orden ahorra ${-diferenciaKm} km.` : "Tu orden es tan corto como el mejor."}</span>
                        <button onClick={() => { setManual(null); setRutaManual(null); }} className="shrink-0 font-bold text-sky-300 hover:text-white inline-flex items-center gap-1"><Undo2 size={12} />Mejor orden</button>
                      </div>
                    )}
                    {hayCambio && ahorroKm > 0 && (
                      <p className="mt-2 text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-900/60 rounded-md px-2.5 py-1.5 flex items-center gap-1.5"><TrendingDown size={13} />Sin {ubicadas.length - elegidas.length} cliente{ubicadas.length - elegidas.length > 1 ? "s" : ""} ahorrás {ahorroKm} km.</p>
                    )}
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {urlGoogle && <a href={urlGoogle} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-md px-3 py-2"><Navigation size={13} />Abrir en Google Maps</a>}
                      <BotonPdf fecha={fecha} usuario={usuario} orden={ordenadas.flatMap((p) => p.ids)} km={rutaVista?.distancia_km} etiqueta="Exportar PDF" />
                      <button onClick={copiarRuta} className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-200 border border-zinc-600 hover:bg-zinc-800 rounded-md px-3 py-2">{copiado ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}{copiado ? "Copiada" : "Copiar para WhatsApp"}</button>
                      {elegidas.length > 1 && <button onClick={calcularAportes} disabled={calcAportes} className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-200 border border-zinc-600 hover:bg-zinc-800 rounded-md px-3 py-2 disabled:opacity-60">{calcAportes ? <Loader2 size={13} className="animate-spin" /> : <Calculator size={13} />}¿Cuánto suma cada cliente?</button>}
                    </div>
                    {masCaro && <p className="mt-2 text-xs text-amber-200 bg-amber-950/30 border border-amber-900/50 rounded-md px-2.5 py-1.5">El que más suma a la ruta: <b>{masCaro.cliente}</b> (+{aporte[masCaro.id].km} km).</p>}
                    {fueraAlta.length > 0 && <p className="mt-2 text-xs text-red-300 bg-red-950/30 border border-red-900/50 rounded-md px-2.5 py-1.5 flex items-start gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-0.5" />Sacaste {fueraAlta.length === 1 ? "un cliente" : `${fueraAlta.length} clientes`} de prioridad alta: {fueraAlta.map((p) => p.cliente).join(", ")}.</p>}
                    {hayCambio && ahorroKm <= 0 && <p className="mt-2 text-xs text-zinc-400">Sacarlos casi no cambia el recorrido.</p>}
                  </>
                ) : errRuta ? <p className="text-sm text-red-400 mt-1">{errRuta}</p>
                  : <p className="text-sm text-zinc-500 mt-1">{!origen ? "Cargá la planta para ver la ruta." : elegidas.length ? "Calculando…" : "Tildá al menos un cliente."}</p>}
              </div>

              {editOrigen && esAdmin && origen && (
                <div className="flex gap-2">
                  <input value={textoOrigen} onChange={(e) => setTextoOrigen(e.target.value)} className="flex-1 bg-[#0d0d0d] border border-zinc-700 rounded-md px-3 py-2 text-sm text-white" />
                  <button onClick={guardarOrigen} disabled={guardandoOrigen || !textoOrigen.trim()} className="px-3 rounded-md bg-orange-600 text-white text-sm font-bold disabled:opacity-50">Guardar</button>
                </div>
              )}

              {datos.paradas.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-6">No hay entregas con dirección para este día.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {ordenadas.map((p, i) => (
                    <li key={p.id}><Fila p={p} n={i + 1} tildado onAlternar={alternar} onVer={verEnMapa} tramo={rutaVista?.tramos?.[i]} aporte={manuales ? null : aporte?.[p.id]} masCaro={masCaro?.id === p.id} onMover={mover} primero={i === 0} ultimo={i === ordenadas.length - 1} /></li>
                  ))}
                  {ubicadas.filter((p) => fuera.has(p.id)).map((p) => <li key={p.id}><Fila p={p} onAlternar={alternar} onVer={verEnMapa} /></li>)}
                </ul>
              )}

              {revisar.length > 0 && (
                <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-3">
                  <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5"><MapPin size={12} />{datos.pendientes ? "Ubicando direcciones…" : "Revisá estas direcciones"}</p>
                  <ul className="mt-2 flex flex-col gap-2.5">
                    {revisar.map((p) => <li key={p.id}><Revisar p={p} onListo={cargar} /></li>)}
                  </ul>
                </div>
              )}
              {datos.retiran.length > 0 && <p className="text-xs text-zinc-500">Retiran en planta: {datos.retiran.map((r) => r.cliente).join(", ")}.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Fila({ p, n, tildado, onAlternar, onVer, tramo, aporte, masCaro, onMover, primero, ultimo }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${tildado ? "border-zinc-800 bg-[#121212]" : "border-zinc-800/60 bg-transparent opacity-60"}`}>
      <input type="checkbox" checked={!!tildado} onChange={() => onAlternar(p.id)} className="mt-1 accent-orange-500 w-4 h-4 cursor-pointer" aria-label={`Incluir ${p.cliente}`} />
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => onVer(p)} className="w-full flex items-start gap-2.5 text-left" title="Ver en el mapa">
          <span className={`shrink-0 w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center ${tildado ? "bg-orange-600 text-white" : "bg-zinc-700 text-zinc-300"}`}>{tildado ? n : "·"}</span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2"><span className="text-sm font-bold text-white truncate">{p.cliente}</span><Cruces valor={p.prioridad} tam="text-[11px]" /></span>
            <span className="block text-xs text-zinc-400 truncate">{p.tipo_entrega === "TRANSPORTE" ? `${p.transporte_nombre} · ` : ""}{p.direccion}</span>
            <span className="block text-[11px] text-zinc-500">{textoOps(p)}{tramo ? ` · ${tramo.km} km desde la anterior` : ""}</span>
          </span>
        </button>
        {aporte && <span className={`mt-1.5 ml-[34px] inline-block text-[11px] font-bold rounded px-1.5 py-0.5 ${masCaro ? "bg-amber-900/50 text-amber-200" : "bg-zinc-800 text-zinc-300"}`}>Suma {aporte.km > 0 ? "+" : ""}{aporte.km} km</span>}
        {(p.contacto_telefono || p.contacto_nombre) && (
          <p className="mt-1 ml-[34px] text-[11px] text-zinc-400 flex items-center gap-1.5"><Phone size={11} className="text-zinc-500" />{p.contacto_nombre}{p.contacto_telefono && <a href={`tel:${String(p.contacto_telefono).replace(/[^\d+]/g, "")}`} className="text-sky-300 hover:underline">{p.contacto_telefono}</a>}</p>
        )}
        {p.observaciones && <p className="mt-1 ml-[34px] text-[11px] text-zinc-400 bg-zinc-900 rounded px-2 py-1">{p.observaciones}</p>}
      </div>
      {tildado && onMover && (
        <div className="shrink-0 flex flex-col gap-0.5">
          <button type="button" onClick={() => onMover(p.id, -1)} disabled={primero} className="p-1 rounded border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-25 disabled:hover:bg-transparent" aria-label={`Subir ${p.cliente}`} title="Hacer esta entrega antes"><ChevronUp size={14} /></button>
          <button type="button" onClick={() => onMover(p.id, 1)} disabled={ultimo} className="p-1 rounded border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-25 disabled:hover:bg-transparent" aria-label={`Bajar ${p.cliente}`} title="Hacer esta entrega después"><ChevronDown size={14} /></button>
        </div>
      )}
    </div>
  );
}

function Revisar({ p, onListo }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(p.direccion);
  const detalle = p.estado_ubicacion === "sin_servicio" ? "el servicio de mapas no respondió" : p.lat == null ? "no la pude ubicar" : "ubicación aproximada (solo la calle)";
  return (
    <div className="text-xs text-zinc-300">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0"><b className="text-white">{p.cliente}</b> · {p.direccion}<span className="text-amber-300"> — {detalle}</span></p>
        {p.estado_ubicacion !== "pendiente" && <button onClick={() => setAbierto((v) => !v)} className="shrink-0 text-[11px] font-bold text-orange-400 hover:text-orange-300">{abierto ? "Cerrar" : "Elegir ubicación"}</button>}
      </div>
      {abierto && <div className="mt-2"><BuscadorDireccion valor={texto} onCambiar={setTexto} fijarPara={p.direccion} onElegir={() => { setAbierto(false); onListo(); }} /></div>}
    </div>
  );
}
