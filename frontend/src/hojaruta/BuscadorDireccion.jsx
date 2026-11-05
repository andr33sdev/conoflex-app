import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, MapPin, Crosshair, X } from "lucide-react";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "";
const campo = "w-full bg-[#0d0d0d] border border-zinc-700 rounded-md px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500";

async function pedir(path, opciones) {
  const res = await fetch(`${API_BASE_URL}${path}`, opciones && { ...opciones, headers: { "Content-Type": "application/json" }, body: JSON.stringify(opciones.body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.detalle ? `${d.error} (${d.detalle})` : d.error || "No se pudo completar.");
  return d;
}

/** Si la coincidencia es solo la calle, le devuelve la altura que escribió la persona. */
function conAltura(texto, escrito) {
  const n = String(escrito || "").match(/\b(\d{1,5})\b/)?.[1];
  if (!n || new RegExp(`\\b${n}\\b`).test(texto)) return texto;
  const [calle, ...resto] = texto.split(",");
  return [`${calle.trim()} ${n}`, ...resto.map((x) => x.trim())].join(", ");
}

/** Mapa para marcar a mano el punto exacto (clic o arrastrar el pin). */
function MarcarEnMapa({ centro, onGuardar, onCerrar, guardando }) {
  const div = useRef(null);
  const [punto, setPunto] = useState(null);
  useEffect(() => {
    const mapa = L.map(div.current, { zoomControl: true }).setView(centro || [-34.6, -58.5], centro ? 16 : 10);
    L.tileLayer(import.meta.env?.VITE_MAP_TILES || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(mapa);
    let pin = null;
    const poner = (ll) => {
      if (pin) pin.setLatLng(ll);
      else { pin = L.marker(ll, { draggable: true }).addTo(mapa); pin.on("dragend", () => setPunto(pin.getLatLng())); }
      setPunto(L.latLng(ll));
    };
    mapa.on("click", (e) => poner(e.latlng));
    return () => mapa.remove();
  }, [centro]);
  return (
    <div className="mt-2 rounded-md border border-zinc-700 bg-[#1c1c1c] p-2">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs text-zinc-300">Tocá el mapa donde está la dirección (podés arrastrar el pin).</p>
        <button type="button" onClick={onCerrar} className="text-zinc-500 hover:text-white"><X size={16} /></button>
      </div>
      <div ref={div} className="h-64 w-full rounded overflow-hidden" />
      <button type="button" disabled={!punto || guardando} onClick={() => onGuardar(punto)} className="mt-2 w-full py-2 rounded-md bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium disabled:opacity-40">
        {guardando ? "Guardando…" : "Usar este punto"}
      </button>
    </div>
  );
}

/**
 * Autocompletado: a medida que escribís aparecen las coincidencias (como Google Maps). También acepta pegar
 * coordenadas o un link de Google Maps, o marcar el punto a mano en el mapa.
 * `fijarPara`: si se pasa, la ubicación elegida se guarda para ESA dirección (sin cambiarle el texto).
 */
export default function BuscadorDireccion({ valor, onCambiar, onElegir, fijarPara, placeholder = "Calle, número, localidad", ubicada }) {
  const [lista, setLista] = useState(null);
  const [caido, setCaido] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [activo, setActivo] = useState(-1);
  const [mapa, setMapa] = useState(false);
  const seq = useRef(0);
  const tipeado = useRef(false);

  useEffect(() => {
    if (!tipeado.current) return undefined; // solo busca cuando la persona escribe, no al cargar un valor existente
    const q = valor.trim();
    const mi = ++seq.current;
    if (q.length < 4) { const t0 = setTimeout(() => { if (mi === seq.current) { setLista(null); setBuscando(false); } }, 0); return () => clearTimeout(t0); }
    const t = setTimeout(async () => {
      setBuscando(true); setError("");
      try {
        const d = await pedir(`/api/hoja-ruta/buscar-direccion?q=${encodeURIComponent(q)}`);
        if (mi !== seq.current) return; // respuesta vieja
        setLista(d.coincidencias || []); setCaido(!!d.caido); setActivo(-1);
      } catch (e) { if (mi === seq.current) setError(e.message); }
      finally { if (mi === seq.current) setBuscando(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [valor]);

  const guardar = async (texto, lat, lng, c) => {
    if (!Number.isFinite(Number(lat)) || lat === null || lng === null) { setError("Esa coincidencia no trae ubicación. Elegí otra o marcala en el mapa."); return; }
    setGuardando(true); setError("");
    try {
      await pedir("/api/hoja-ruta/ubicacion", { method: "POST", body: { direccion: texto, lat, lng } });
      tipeado.current = false; seq.current++; setLista(null); setMapa(false);
      onElegir(texto, c);
    } catch (e) { setError(e.message); } finally { setGuardando(false); }
  };

  const elegir = async (c) => {
    try {
      let { lat, lng, texto } = c;
      if (lat == null && c.placeId) { // Google: las coordenadas se piden recién al elegir
        setGuardando(true);
        const d = await pedir(`/api/hoja-ruta/direccion-detalle?id=${encodeURIComponent(c.placeId)}`);
        lat = d.lat; lng = d.lng; texto = d.texto || texto;
      }
      const final = fijarPara ?? (c.aprox ? conAltura(texto, valor) : texto);
      await guardar(final, lat, lng, c);
    } catch (e) { setError(e.message); setGuardando(false); }
  };

  const teclas = (e) => {
    if (!lista?.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActivo((a) => (a + 1) % lista.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((a) => (a <= 0 ? lista.length - 1 : a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); elegir(lista[activo >= 0 ? activo : 0]); }
    else if (e.key === "Escape") setLista(null);
  };

  const centro = lista?.find((c) => c.lat != null) ? [lista.find((c) => c.lat != null).lat, lista.find((c) => c.lat != null).lng] : null;

  return (
    <div className="relative">
      <div className="relative">
        <input className={campo} value={valor} autoComplete="off" onChange={(e) => { tipeado.current = true; onCambiar(e.target.value); }} onKeyDown={teclas} placeholder={placeholder} />
        {buscando && <Loader2 size={14} className="animate-spin text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2" />}
      </div>
      {ubicada && !lista && !mapa && <p className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1"><MapPin size={12} />Ubicada en el mapa</p>}
      {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
      {lista && !mapa && (
        <div className="mt-1.5 rounded-md border border-zinc-700 bg-[#1c1c1c] overflow-hidden">
          {lista.length === 0 && <p className={`text-xs px-3 py-2 ${caido ? "text-red-400" : "text-amber-400"}`}>{caido ? "El servicio de búsqueda no responde ahora. Probá de nuevo en un momento o marcala en el mapa." : "Sin coincidencias. Seguí escribiendo (calle, número, localidad) o marcala en el mapa."}</p>}
          <ul>
            {lista.map((c, i) => (
              <li key={`${c.placeId || ""}${c.lat},${c.lng},${c.texto}`}>
                <button type="button" disabled={guardando} onMouseEnter={() => setActivo(i)} onClick={() => elegir(c)} className={`w-full text-left px-3 py-2 flex items-start gap-2 ${i === activo ? "bg-zinc-800" : "hover:bg-zinc-800"}`}>
                  <MapPin size={14} className="text-orange-500 mt-0.5 shrink-0" />
                  <span className="min-w-0"><span className="block text-sm text-white">{c.aprox ? conAltura(c.texto, valor) : c.texto}</span>{c.aprox && <span className="block text-[11px] text-zinc-500">Solo la calle (esa altura no figura): quedará aproximada</span>}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setMapa(true)} className="w-full text-left px-3 py-2 border-t border-zinc-800 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"><Crosshair size={13} className="text-orange-500" />No aparece: marcarla en el mapa</button>
        </div>
      )}
      {!lista && !mapa && valor.trim().length >= 4 && <button type="button" onClick={() => setMapa(true)} className="mt-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1"><Crosshair size={12} />Marcar en el mapa</button>}
      {mapa && <MarcarEnMapa centro={centro} guardando={guardando} onCerrar={() => setMapa(false)} onGuardar={(p) => guardar(fijarPara ?? valor.trim(), p.lat, p.lng, { texto: valor.trim(), lat: p.lat, lng: p.lng, fuente: "manual" })} />}
    </div>
  );
}
