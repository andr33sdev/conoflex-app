import { useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "";
const campo = "w-full bg-[#0d0d0d] border border-zinc-700 rounded-md px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500";

async function pedir(path, opciones) {
  const res = await fetch(`${API_BASE_URL}${path}`, opciones && { ...opciones, headers: { "Content-Type": "application/json" }, body: JSON.stringify(opciones.body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.detalle ? `${d.error} (${d.detalle})` : d.error || "No se pudo completar.");
  return d;
}

/** Si la coincidencia es solo la calle, le devuelve la altura que escribió la persona ("Av. Perón 3798" → "Avenida Presidente Perón 3798, Morón"). */
function conAltura(texto, escrito) {
  const n = String(escrito || "").match(/\b(\d{1,5})\b/)?.[1];
  if (!n) return texto;
  const [calle, ...resto] = texto.split(",");
  return [`${calle.trim()} ${n}`, ...resto.map((x) => x.trim())].join(", ");
}

/**
 * Escribís una dirección, buscás y elegís entre las coincidencias (como en Google Maps).
 * Lo elegido queda ubicado en el mapa. `fijarPara`: si se pasa, la ubicación elegida se guarda para ESA dirección (sin cambiarle el texto).
 */
export default function BuscadorDireccion({ valor, onCambiar, onElegir, fijarPara, placeholder = "Calle, número, localidad", ubicada }) {
  const [lista, setLista] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");

  const buscar = async () => {
    if (valor.trim().length < 3) return;
    setBuscando(true); setError(""); setLista(null);
    try { setLista((await pedir(`/api/hoja-ruta/buscar-direccion?q=${encodeURIComponent(valor.trim())}`)).coincidencias); }
    catch (e) { setError(e.message); } finally { setBuscando(false); }
  };

  const elegir = async (c) => {
    const texto = fijarPara ?? (c.aprox ? conAltura(c.texto, valor) : c.texto);
    setBuscando(true); setError("");
    try {
      await pedir("/api/hoja-ruta/ubicacion", { method: "POST", body: { direccion: texto, lat: c.lat, lng: c.lng } });
      setLista(null);
      onElegir(texto, c);
    } catch (e) { setError(e.message); } finally { setBuscando(false); }
  };

  return (
    <div>
      <div className="flex gap-2">
        <input className={campo} value={valor} onChange={(e) => { onCambiar(e.target.value); setLista(null); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }} placeholder={placeholder} />
        <button type="button" onClick={buscar} disabled={buscando || valor.trim().length < 3} className="px-3 rounded-md border border-zinc-700 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 shrink-0 flex items-center gap-1.5">
          {buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}Buscar
        </button>
      </div>
      {ubicada && !lista && <p className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1"><MapPin size={12} />Ubicada en el mapa</p>}
      {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
      {lista && (
        lista.length === 0 ? (
          <p className="text-xs text-amber-400 mt-1.5">No encontré coincidencias. Probá escribiendo solo la calle y la localidad (sin abreviaturas raras).</p>
        ) : (
          <div className="mt-1.5 rounded-md border border-zinc-700 bg-[#1c1c1c] overflow-hidden">
            <p className="text-[11px] text-zinc-500 px-3 pt-2">Elegí la correcta:</p>
            <ul>
              {lista.map((c) => (
                <li key={`${c.lat},${c.lng},${c.texto}`}>
                  <button type="button" onClick={() => elegir(c)} className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-start gap-2">
                    <MapPin size={14} className="text-orange-500 mt-0.5 shrink-0" />
                    <span className="min-w-0"><span className="block text-sm text-white">{c.texto}</span>{c.aprox && <span className="block text-[11px] text-zinc-500">Solo la calle (no encontré esa altura): quedará aproximada</span>}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}
