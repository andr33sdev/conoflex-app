// Costos (solo administradores): cuánto cuesta cada producto terminado y semielaborado según sus recetas
// activas, y el costo de cada materia prima (que se carga acá o en la ficha de la materia prima).
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Loader2, Search, X } from "lucide-react";
import { api } from "./produccion/util";
import { Drawer } from "./produccion/ui";
import CostoMP from "./materias/CostoMP";
import TraerDeSheets from "./costos/TraerDeSheets";
import { abrev, nf, norm, usd } from "./materias/util";

const DIAS_LIMITE = 60;
const paraRevisar = (x, tab) => (tab === "materias" ? x.costo == null || x.dias > DIAS_LIMITE : !x.completo);

const TABS = [
  { id: "productos", texto: "Terminados" },
  { id: "semielaborados", texto: "Semielaborados" },
  { id: "materias", texto: "Materias primas" },
];

function Estado({ x, tab }) {
  if (tab === "materias") {
    if (x.costo == null) return <span className="text-xs font-bold text-amber-300">Sin costo</span>;
    if (x.dias > DIAS_LIMITE) return <span className="text-xs font-bold text-amber-300">Hace {x.dias} días</span>;
    return null;
  }
  if (x.sin_receta) return <span className="text-xs font-bold text-zinc-500">Sin receta</span>;
  if (!x.completo) return <span className="text-xs font-bold text-amber-300 inline-flex items-center gap-1"><AlertTriangle size={12} /> Incompleto</span>;
  return null;
}

export default function Costos() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("productos");
  const [busqueda, setBusqueda] = useState("");
  const [soloFaltan, setSoloFaltan] = useState(false);
  const [abierto, setAbierto] = useState(null);

  const cargar = useCallback(() => {
    api("/api/costos")
      .then((d) => {
        setDatos(d);
        setError("");
      })
      .catch((e) => setError(e.message || "No se pudieron cargar los costos."));
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const lista = useMemo(() => {
    if (!datos) return [];
    const q = norm(busqueda);
    return datos[tab].filter((x) => {
      if (soloFaltan && !paraRevisar(x, tab)) return false;
      return !q || norm(`${x.codigo} ${x.nombre}`).includes(q);
    });
  }, [datos, tab, busqueda, soloFaltan]);

  const faltan = datos ? datos[tab].filter((x) => paraRevisar(x, tab)).length : 0;
  const elegido = abierto && datos ? datos[abierto.tab].find((x) => x.id === abierto.id) : null;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-black text-zinc-200">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-9 pb-28">
        <div className="flex flex-wrap items-end gap-4">
          <div className="mr-auto">
            <h1 className="text-[34px] sm:text-5xl font-extrabold tracking-tight text-white leading-none">Costos</h1>
            <p className="mt-2.5 text-[15px] text-zinc-500">En dólares, según la receta activa de cada producto. Solo lo ven los administradores.</p>
          </div>
          <TraerDeSheets onListo={cargar} />
        </div>

        <nav className="mt-6 flex gap-2 overflow-x-auto no-scrollbar" aria-label="Qué ver">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setSoloFaltan(false); }} aria-current={tab === t.id ? "page" : undefined} className={`shrink-0 min-h-[42px] px-4 rounded-full text-sm font-bold border cursor-pointer transition-colors ${tab === t.id ? "bg-white text-black border-transparent" : "border-white/[0.09] text-zinc-400 hover:text-white bg-white/[0.03]"}`}>
              {t.texto}
            </button>
          ))}
        </nav>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <label htmlFor="costos-buscar" className="sr-only">Buscar</label>
            <input id="costos-buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por código o nombre…" className="w-full min-h-[48px] rounded-2xl bg-white/[0.05] border border-white/[0.08] focus:border-[#FF5A00]/60 pl-11 pr-11 text-[15px] text-white placeholder:text-zinc-600 outline-none" />
            {busqueda && <button onClick={() => setBusqueda("")} aria-label="Borrar búsqueda" className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-lg text-zinc-400 hover:text-white cursor-pointer"><X size={16} /></button>}
          </div>
          {faltan > 0 && (
            <button onClick={() => setSoloFaltan((v) => !v)} aria-pressed={soloFaltan} className={`min-h-[48px] px-4 rounded-2xl text-sm font-bold border cursor-pointer ${soloFaltan ? "bg-amber-400 text-black border-transparent" : "border-amber-400/30 text-amber-300 bg-amber-400/[0.06]"}`}>
              {tab === "materias" ? `${nf(faltan, 0)} para revisar` : `${nf(faltan, 0)} incompletos`}
            </button>
          )}
        </div>

        {error ? (
          <p className="mt-10 text-center text-rose-300">{error}</p>
        ) : !datos ? (
          <div className="mt-16 grid place-items-center text-zinc-500"><Loader2 className="animate-spin" /></div>
        ) : !lista.length ? (
          <p className="mt-10 text-center text-zinc-500">No hay nada para mostrar.</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/[0.05] rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
            {lista.slice(0, 400).map((x) => (
              <li key={x.id}>
                <button onClick={() => setAbierto({ tab, id: x.id })} className="w-full min-h-[58px] px-4 py-2.5 flex items-center gap-3 text-left hover:bg-white/[0.04] cursor-pointer">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-white truncate">{x.codigo}</span>
                    {x.nombre && x.nombre !== x.codigo && <span className="block text-xs text-zinc-500 truncate">{x.nombre}</span>}
                  </span>
                  <Estado x={x} tab={tab} />
                  <span className="text-sm font-extrabold text-white tabular-nums shrink-0">
                    {x.costo == null || x.sin_receta ? "—" : usd(x.costo)}
                    {tab === "materias" && x.costo != null && <span className="text-xs font-semibold text-zinc-500"> /{abrev(x.unidad)}</span>}
                  </span>
                  <ChevronRight size={16} className="text-zinc-600 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {lista.length > 400 && <p className="mt-3 text-xs text-zinc-500 text-center">Mostrando 400 de {nf(lista.length, 0)}. Buscá para encontrar el resto.</p>}
      </div>

      <Drawer abierto={!!elegido} onCerrar={() => setAbierto(null)} titulo={elegido?.codigo || ""} subtitulo={elegido?.nombre !== elegido?.codigo ? elegido?.nombre : ""}>
        {elegido && abierto.tab === "materias" && (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
            <CostoMP key={elegido.id} m={{ id: elegido.id, unidad_medida: elegido.unidad }} onGuardado={cargar} />
          </div>
        )}
        {elegido && abierto.tab !== "materias" && <Desglose x={elegido} />}
      </Drawer>
    </div>
  );
}

function Desglose({ x }) {
  if (x.sin_receta) return <p className="text-sm text-zinc-400">No tiene receta activa. Cargala en Ingeniería & BOM para calcular su costo.</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
        <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-zinc-500">Costo por unidad</p>
        <p className="mt-1 text-3xl font-extrabold text-white tabular-nums">{usd(x.costo)}</p>
        {!x.completo && <p className="mt-2 text-sm text-amber-300">Incompleto: solo suma lo que tiene costo. Falta: {x.faltan.join(", ")}.</p>}
      </div>
      <ul className="flex flex-col gap-1.5">
        {x.lineas.map((l, i) => (
          <li key={`${l.tipo}-${l.id}-${i}`} className="rounded-xl border border-white/[0.06] px-3 py-2.5 flex items-center gap-3">
            <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${l.tipo === "SE" ? "bg-sky-500/15 text-sky-300" : "bg-white/[0.07] text-zinc-300"}`}>{l.tipo === "SE" ? "SEMI" : "MP"}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-white truncate">{l.codigo || "?"}</span>
              <span className="block text-xs text-zinc-500">
                {nf(l.cantidad, 4)} {l.tipo === "SE" ? "u" : abrev(l.unidad)} × {l.unitario == null ? "sin costo" : usd(l.unitario)}
              </span>
            </span>
            <span className={`text-sm font-extrabold tabular-nums ${l.subtotal == null ? "text-amber-300" : "text-white"}`}>{l.subtotal == null ? "falta" : usd(l.subtotal)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
