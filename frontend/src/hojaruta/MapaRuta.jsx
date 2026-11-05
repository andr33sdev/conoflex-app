import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, MapPin, Navigation, Pencil, Route as RouteIcon, TrendingDown } from "lucide-react";
import Cruces from "./Cruces";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "";
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const horas = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min` : `${min} min`);

async function pedir(path, opciones) {
  const res = await fetch(`${API_BASE_URL}${path}`, opciones && { ...opciones, headers: { "Content-Type": "application/json" }, body: JSON.stringify(opciones.body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.detalle ? `${d.error} (${d.detalle})` : d.error || "No se pudo completar.");
  return d;
}

const PIN = (fondo, texto) => `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg"><path d="M16 1C8 1 1.5 7.4 1.5 15.3 1.5 26 16 41 16 41s14.5-15 14.5-25.7C30.5 7.4 24 1 16 1z" fill="${fondo}" stroke="#fff" stroke-width="2"/><text x="16" y="20" text-anchor="middle" font-family="system-ui,Arial" font-weight="800" font-size="13" fill="#fff">${texto}</text></svg>`;
const COLOR = { origen: "#1f2937", ruta: "#ea580c", fuera: "#9ca3af" };
const icono = (tipo, t) => L.divIcon({ className: "pin-mapa", html: PIN(COLOR[tipo], t), iconSize: [32, 42], iconAnchor: [16, 41], popupAnchor: [0, -38] });

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export default function MapaRuta({ fechaInicial, esAdmin }) {
  const [fecha, setFecha] = useState(fechaInicial || iso(new Date()));
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [fuera, setFuera] = useState(() => new Set()); // ids destildados
  const [vuelta, setVuelta] = useState(true);
  const [ruta, setRuta] = useState(null);
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

  const cargar = useCallback(async () => {
    try { setDatos(await pedir(`/api/hoja-ruta/mapa?fecha=${fecha}`)); setError(""); } catch (e) { setError(e.message); }
  }, [fecha]);
  // Carga el día elegido; si quedaron direcciones por ubicar, vuelve a pedir hasta que estén todas.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDatos(null); setFuera(new Set()); setRuta(null); setBase(null); cargar(); }, [cargar]);
  useEffect(() => {
    if (!datos?.pendientes) return undefined;
    const t = setTimeout(cargar, 1500);
    return () => clearTimeout(t);
  }, [datos, cargar]);

  const ubicadas = useMemo(() => (datos?.paradas || []).filter((p) => p.lat != null), [datos]);
  const sinUbicar = useMemo(() => (datos?.paradas || []).filter((p) => p.lat == null), [datos]);
  const elegidas = useMemo(() => ubicadas.filter((p) => !fuera.has(p.id)), [ubicadas, fuera]);
  const origen = datos?.origen;

  const calcular = useCallback(async (paradas) => {
    if (!origen || !paradas.length) return null;
    return pedir("/api/hoja-ruta/ruta", { method: "POST", body: { vuelta, puntos: [origen, ...paradas].map((p) => ({ lat: p.lat, lng: p.lng })) } });
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

  const ordenadas = useMemo(() => (ruta ? ruta.orden.filter((i) => i > 0).map((i) => elegidas[i - 1]).filter(Boolean) : elegidas), [ruta, elegidas]);

  // Mapa
  useEffect(() => {
    if (!mapaEl.current || mapa.current) return undefined;
    mapa.current = L.map(mapaEl.current, { zoomControl: true }).setView([-34.6, -58.45], 10);
    L.tileLayer(import.meta.env?.VITE_MAP_TILES || "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { maxZoom: 19, subdomains: "abcd", attribution: "© OpenStreetMap · © CARTO" }).addTo(mapa.current);
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
    if (ruta?.trazado?.length) {
      L.polyline(ruta.trazado, { color: "#1a56c4", weight: 9, opacity: 0.9, lineCap: "round", lineJoin: "round" }).addTo(capa.current);
      L.polyline(ruta.trazado, { color: "#4285f4", weight: 5, opacity: 1, lineCap: "round", lineJoin: "round" }).addTo(capa.current);
      puntos.push(...ruta.trazado);
    }
    ubicadas.forEach((p) => {
      const n = ordenadas.indexOf(p);
      const dentro = !fuera.has(p.id);
      marcadores.current[p.id] = L.marker([p.lat, p.lng], { icon: icono(dentro ? "ruta" : "fuera", dentro && n >= 0 ? n + 1 : "·"), zIndexOffset: dentro ? 100 : 0 }).bindPopup(`<b>${esc(p.cliente)}</b><br>OP ${esc(p.op)}<br>${esc(p.direccion)}`).addTo(capa.current);
      puntos.push([p.lat, p.lng]);
    });
    if (puntos.length > 1) mapa.current.fitBounds(L.latLngBounds(puntos), { padding: [30, 30], maxZoom: 15 });
    else if (puntos.length === 1) mapa.current.setView(puntos[0], 13);
  }, [ubicadas, ordenadas, ruta, origen, fuera]);

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
    const dest = ruta?.vuelta ? origen : ordenadas[ordenadas.length - 1];
    const medio = ruta?.vuelta ? ordenadas : ordenadas.slice(0, -1);
    const q = new URLSearchParams({ api: "1", origin: c(origen), destination: c(dest), travelmode: "driving" });
    if (medio.length) q.set("waypoints", medio.map(c).join("|"));
    return `https://www.google.com/maps/dir/?${q}`;
  }, [origen, ordenadas, ruta]);
  const alternar = (id) => setFuera((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const guardarOrigen = async () => {
    setGuardandoOrigen(true); setError("");
    try { await pedir("/api/hoja-ruta/origen", { method: "PUT", body: { direccion: textoOrigen } }); setEditOrigen(false); await cargar(); }
    catch (e) { setError(e.message); } finally { setGuardandoOrigen(false); }
  };

  const hayCambio = base && ruta && elegidas.length < ubicadas.length;
  const ahorroKm = hayCambio ? Math.round((base.distancia_km - ruta.distancia_km) * 10) / 10 : 0;
  const ahorroMin = hayCambio ? base.duracion_min - ruta.duracion_min : 0;
  const pill = (act) => `px-3 py-1.5 rounded-md text-xs font-semibold border ${act ? "border-orange-500 bg-orange-500/10 text-orange-300" : "border-zinc-800 text-zinc-400 hover:bg-zinc-800"}`;
  const ahora = new Date();
  const hoy = iso(ahora);
  const manana = iso(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1));

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} className="bg-[#121212] border border-zinc-800 rounded-md text-xs text-zinc-200 px-2 py-1.5" aria-label="Día" />
        <button onClick={() => setFecha(hoy)} className={pill(fecha === hoy)}>Hoy</button>
        <button onClick={() => setFecha(manana)} className={pill(fecha === manana)}>Mañana</button>
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
          <div ref={mapaEl} className="h-[380px] sm:h-[580px] w-full bg-zinc-200" data-testid="mapa" />
          {calculando && <div className="absolute top-3 right-3 z-[500] bg-black/70 text-white text-xs rounded-md px-2.5 py-1.5 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />Calculando ruta…</div>}
        </div>

        <div className="flex flex-col gap-3">
          {!datos ? <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-zinc-600" /></div> : (
            <>
              <div className="rounded-lg border border-zinc-800 bg-[#121212] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5"><RouteIcon size={12} />Ruta del día</p>
                  {origen && esAdmin && <button onClick={() => { setTextoOrigen(origen.direccion); setEditOrigen((v) => !v); }} className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1"><Pencil size={11} />Planta</button>}
                </div>
                {ruta ? (
                  <>
                    <p className="text-2xl font-black text-white mt-1 tabular-nums">{ruta.distancia_km} km <span className="text-base font-bold text-zinc-400">· {horas(ruta.duracion_min)}</span></p>
                    <p className="text-[11px] text-zinc-500">{elegidas.length} parada{elegidas.length > 1 ? "s" : ""}{ruta.vuelta ? " con vuelta a planta" : " sin vuelta"} · tiempo de manejo, sin contar descargas</p>
                    {hayCambio && (ahorroKm > 0 || ahorroMin > 0) && (
                      <p className="mt-2 text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-900/60 rounded-md px-2.5 py-1.5 flex items-center gap-1.5"><TrendingDown size={13} />Sin {ubicadas.length - elegidas.length} cliente{ubicadas.length - elegidas.length > 1 ? "s" : ""} ahorrás {ahorroKm} km y {horas(ahorroMin)}.</p>
                    )}
                    {urlGoogle && <a href={urlGoogle} target="_blank" rel="noreferrer" className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-md px-3 py-2"><Navigation size={13} />Abrir en Google Maps</a>}
                    {hayCambio && ahorroKm <= 0 && ahorroMin <= 0 && <p className="mt-2 text-xs text-zinc-400">Sacarlos casi no cambia el recorrido.</p>}
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
                    <li key={p.id}><Fila p={p} n={i + 1} tildado onAlternar={alternar} onVer={verEnMapa} tramo={ruta?.tramos?.[i]} /></li>
                  ))}
                  {ubicadas.filter((p) => fuera.has(p.id)).map((p) => <li key={p.id}><Fila p={p} onAlternar={alternar} onVer={verEnMapa} /></li>)}
                </ul>
              )}

              {sinUbicar.length > 0 && (
                <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-3">
                  <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5"><MapPin size={12} />{datos.pendientes ? "Ubicando direcciones…" : "No pude ubicar estas direcciones"}</p>
                  <ul className="mt-1.5 text-xs text-zinc-300 flex flex-col gap-1">
                    {sinUbicar.map((p) => <li key={p.id}><b>{p.cliente}</b> · {p.direccion}{p.estado_ubicacion === "no_encontrada" ? " — corregí la dirección en la lista (calle, número y localidad)." : p.estado_ubicacion === "sin_servicio" ? " — el servicio de mapas no respondió." : ""}</li>)}
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

function Fila({ p, n, tildado, onAlternar, onVer, tramo }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${tildado ? "border-zinc-800 bg-[#121212]" : "border-zinc-800/60 bg-transparent opacity-60"}`}>
      <input type="checkbox" checked={!!tildado} onChange={() => onAlternar(p.id)} className="mt-1 accent-orange-500 w-4 h-4 cursor-pointer" aria-label={`Incluir ${p.cliente}`} />
      <button type="button" onClick={() => onVer(p)} className="min-w-0 flex-1 flex items-start gap-2.5 text-left" title="Ver en el mapa">
        <span className={`shrink-0 w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center ${tildado ? "bg-orange-600 text-white" : "bg-zinc-700 text-zinc-300"}`}>{tildado ? n : "·"}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2"><span className="text-sm font-bold text-white truncate">{p.cliente}</span><Cruces valor={p.prioridad} tam="text-[11px]" /></span>
          <span className="block text-xs text-zinc-400 truncate">{p.tipo_entrega === "TRANSPORTE" ? `${p.transporte_nombre} · ` : ""}{p.direccion}</span>
          <span className="block text-[11px] text-zinc-500">OP {p.op}{tramo ? ` · ${tramo.km} km desde la anterior (${horas(tramo.min)})` : ""}</span>
        </span>
      </button>
    </div>
  );
}
