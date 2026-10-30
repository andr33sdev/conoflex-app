import { useEffect, useMemo, useRef, useState } from "react";
import { norm } from "./formato";

/**
 * Campo con sugerencias. El texto es libre; si elige una sugerencia se avisa con onElegir.
 * opciones: [{ clave, titulo, detalle?, extra?, valor }]
 */
export default function Autocompletar({ valor, onTexto, onElegir, opciones, placeholder, icono: Icono, etiqueta, className = "" }) {
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const ref = useRef(null);

  const coincidencias = useMemo(() => {
    const t = norm(valor);
    if (!t) return [];
    return opciones.filter((o) => norm(`${o.titulo} ${o.detalle || ""}`).includes(t)).slice(0, 8);
  }, [valor, opciones]);

  useEffect(() => {
    const fuera = (e) => ref.current && !ref.current.contains(e.target) && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("touchstart", fuera);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("touchstart", fuera);
    };
  }, []);

  const elegir = (o) => {
    onElegir(o);
    setAbierto(false);
  };
  const teclas = (e) => {
    if (!abierto || !coincidencias.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActivo((a) => (a + 1) % coincidencias.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((a) => (a - 1 + coincidencias.length) % coincidencias.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      elegir(coincidencias[Math.min(activo, coincidencias.length - 1)]);
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      {etiqueta && <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 mb-1.5">{etiqueta}</span>}
      <div className="flex items-center gap-2.5 rounded-xl bg-[#17171c] border border-white/[0.1] px-3 min-h-[48px] focus-within:border-[#FF5A00]/70 transition-colors">
        {Icono && <Icono size={16} className="text-zinc-500 shrink-0" />}
        <input
          value={valor}
          onFocus={() => setAbierto(true)}
          onChange={(e) => {
            onTexto(e.target.value);
            setAbierto(true);
            setActivo(0);
          }}
          onKeyDown={teclas}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={abierto && coincidencias.length > 0}
          aria-autocomplete="list"
          className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-white placeholder:text-zinc-600 outline-none"
        />
      </div>
      {abierto && coincidencias.length > 0 && (
        <ul role="listbox" className="absolute left-0 right-0 top-full mt-1.5 z-40 max-h-64 overflow-y-auto custom-scrollbar rounded-xl border border-white/[0.12] bg-[#121216] shadow-[0_18px_50px_rgba(0,0,0,0.7)] p-1.5">
          {coincidencias.map((o, i) => (
            <li key={o.clave} role="option" aria-selected={i === activo}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(o);
                }}
                onMouseEnter={() => setActivo(i)}
                className={`w-full text-left rounded-lg px-3 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${i === activo ? "bg-[#FF5A00]/15" : "hover:bg-white/[0.05]"}`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-white truncate">{o.titulo}</span>
                  {o.detalle && <span className="block text-xs text-zinc-500 truncate">{o.detalle}</span>}
                </span>
                {o.extra && <span className="shrink-0 text-xs font-bold text-zinc-400 tabular-nums">{o.extra}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
