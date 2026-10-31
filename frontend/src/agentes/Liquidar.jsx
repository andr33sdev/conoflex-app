import { useEffect, useRef, useState } from "react";
import { Calculator, Loader2 } from "lucide-react";

const p2 = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const TIPOS = [
  ["ambas", "Ambas"],
  ["normales", "Horas normales"],
  ["extras", "Horas extra"],
];

/** Botón "Liquidar": elegís el rango de fechas y qué horas querés, y baja el PDF de la liquidación del plantel. */
export default function Liquidar({ onLiquidar, boton }) {
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [tipo, setTipo] = useState("ambas");
  const [bajando, setBajando] = useState(false);
  const caja = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => caja.current && !caja.current.contains(e.target) && setAbierto(false);
    const tecla = (e) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const rapido = (que) => {
    const h = new Date();
    const y = h.getFullYear();
    const m = h.getMonth();
    if (que === "q1") [setDesde(iso(new Date(y, m, 1))), setHasta(iso(new Date(y, m, 15)))];
    else if (que === "q2") [setDesde(iso(new Date(y, m, 16))), setHasta(iso(new Date(y, m + 1, 0)))];
    else if (que === "mes") [setDesde(iso(new Date(y, m, 1))), setHasta(iso(new Date(y, m + 1, 0)))];
    else [setDesde(iso(new Date(y, m - 1, 1))), setHasta(iso(new Date(y, m, 0)))];
  };

  const valido = desde && hasta && desde <= hasta;
  const bajar = async () => {
    if (!valido || bajando) return;
    setBajando(true);
    await onLiquidar({ desde, hasta, ...(tipo !== "ambas" ? { tipo } : {}) });
    setBajando(false);
    setAbierto(false);
  };
  const campo = "w-full h-11 rounded-lg bg-[#15151a] border border-white/10 focus:border-white/30 px-3 text-base text-white outline-none [color-scheme:dark]";
  const chip = "min-h-[32px] px-2.5 rounded-lg text-[12.5px] font-semibold bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12] hover:text-white";

  return (
    <div className="relative" ref={caja}>
      <button onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} className={`${boton} ${abierto ? "text-white bg-white/[0.09]" : ""}`} title="Liquidar horas">
        <Calculator size={17} /> <span className="hidden md:inline">Liquidar</span>
      </button>
      {abierto && (
        <div className="fixed sm:absolute inset-x-3 sm:inset-x-auto top-[84px] sm:top-full sm:right-0 sm:mt-2 z-40 sm:w-[340px] rounded-2xl border border-white/10 bg-[#121216] p-4 shadow-2xl cf-msg">
          <p className="text-[15px] font-bold text-white">Liquidar horas</p>
          <p className="text-[12.5px] text-zinc-500">Se descarga el PDF de todo el plantel.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button className={chip} onClick={() => rapido("q1")}>1ª quincena</button>
            <button className={chip} onClick={() => rapido("q2")}>2ª quincena</button>
            <button className={chip} onClick={() => rapido("mes")}>Este mes</button>
            <button className={chip} onClick={() => rapido("ant")}>Mes anterior</button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-zinc-500">Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={`${campo} mt-1 normal-case tracking-normal`} /></label>
            <label className="block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-zinc-500">Hasta<input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className={`${campo} mt-1 normal-case tracking-normal`} /></label>
          </div>
          <div role="radiogroup" aria-label="Qué horas liquidar" className="mt-3 flex gap-1 p-1 rounded-xl bg-white/[0.04]">
            {TIPOS.map(([id, t]) => (
              <button key={id} role="radio" aria-checked={tipo === id} onClick={() => setTipo(id)} className={`flex-1 min-h-[36px] rounded-lg text-[12.5px] font-semibold ${tipo === id ? "bg-white/[0.12] text-white" : "text-zinc-500 hover:text-zinc-200"}`}>{t}</button>
            ))}
          </div>
          {desde && hasta && desde > hasta && <p className="mt-2 text-[12px] text-zinc-400">La fecha “desde” tiene que ser anterior a “hasta”.</p>}
          <button onClick={bajar} disabled={!valido || bajando} className="mt-4 w-full min-h-[44px] rounded-xl bg-[#FF5A00] hover:bg-[#ff6d1f] text-black text-[14px] font-bold disabled:bg-white/[0.07] disabled:text-zinc-600 inline-flex items-center justify-center gap-2">
            {bajando && <Loader2 size={16} className="animate-spin" />} Descargar PDF
          </button>
        </div>
      )}
    </div>
  );
}
