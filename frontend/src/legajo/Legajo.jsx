import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import Sanciones from "./Sanciones";

const API_BASE_URL = import.meta.env?.VITE_API_URL || "";
const fmt = (n, d = 1) => Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: d });
const dmy = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : "");
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const RANGOS = [
  { id: "mes", texto: "Este mes", calc: (h) => [new Date(h.getFullYear(), h.getMonth(), 1), h] },
  { id: "mes_ant", texto: "Mes anterior", calc: (h) => [new Date(h.getFullYear(), h.getMonth() - 1, 1), new Date(h.getFullYear(), h.getMonth(), 0)] },
  { id: "30", texto: "Últimos 30 días", calc: (h) => [new Date(h.getFullYear(), h.getMonth(), h.getDate() - 29), h] },
  { id: "anio", texto: "Este año", calc: (h) => [new Date(h.getFullYear(), 0, 1), h] },
];

async function pedir(path) {
  const res = await fetch(`${API_BASE_URL}${path}`);
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "No se pudo cargar.");
  return d;
}

function Dato({ titulo, valor, detalle, alerta }) {
  return (
    <div className={`rounded-lg border px-3.5 py-3 ${alerta ? "border-amber-800/60 bg-amber-950/20" : "border-zinc-800 bg-[#121212]"}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{titulo}</p>
      <p className="mt-1 text-2xl font-black text-white tabular-nums leading-none">{valor}</p>
      {detalle && <p className="mt-1.5 text-[11px] text-zinc-500 leading-tight">{detalle}</p>}
    </div>
  );
}

function Asistencia({ a }) {
  if (!a.con_datos) return <p className="text-sm text-zinc-500 text-center py-10">{a.mensaje || "No hay fichadas en este rango."}</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Dato titulo="Días trabajados" valor={a.dias_trabajados} detalle={`${a.fichadas} fichadas`} />
        <Dato titulo="Horas normales" valor={fmt(a.horas_normales)} />
        <Dato titulo="Horas extra" valor={fmt(a.horas_extra)} />
        <Dato titulo="Llegadas tarde" valor={a.llegadas_tarde.length} alerta={a.llegadas_tarde.length > 0} />
      </div>
      {a.dias_sin_salida > 0 && <p className="text-xs text-amber-300 bg-amber-950/30 border border-amber-900/50 rounded px-3 py-2">Hay {a.dias_sin_salida} {a.dias_sin_salida === 1 ? "día" : "días"} sin salida fichada: no suman horas hasta corregirlos en el calendario.</p>}
      {a.llegadas_tarde.length > 0 && (
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Llegadas tarde</h4>
          <ul className="flex flex-wrap gap-1.5">
            {a.llegadas_tarde.map((l) => (
              <li key={l.fecha} className="text-[11px] px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">{dmy(l.fecha)} · {l.ingreso} · {l.minutos_tarde} min</li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Día por día</h4>
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[#121212] text-zinc-500 text-[10px] uppercase tracking-wider">
              <tr><th className="text-left px-3 py-2">Día</th><th className="text-left px-2">Ingreso</th><th className="text-left px-2">Salida</th><th className="text-right px-2">Normales</th><th className="text-right px-3">Extra</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {a.dias.map((d) => (
                <tr key={d.fecha} className={d.sin_salida ? "bg-amber-950/10" : ""}>
                  <td className="px-3 py-1.5 text-zinc-200">{dmy(d.fecha)} <span className="text-zinc-500">{d.dia}</span>{d.feriado ? <span className="ml-1 text-purple-300">feriado</span> : null}</td>
                  <td className="px-2 font-mono text-zinc-300">{d.ingreso}</td>
                  <td className={`px-2 font-mono ${d.sin_salida ? "text-amber-300" : "text-zinc-300"}`}>{d.egreso || "sin salida"}</td>
                  <td className="px-2 text-right tabular-nums text-zinc-300">{d.sin_salida ? "—" : fmt(d.horas_normales)}</td>
                  <td className="px-3 text-right tabular-nums text-zinc-300">{d.sin_salida ? "—" : fmt(d.horas_extra)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Tabla({ titulo, filas }) {
  if (!filas.length) return null;
  return (
    <div>
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">{titulo}</h4>
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-xs">
          <tbody className="divide-y divide-zinc-900">
            {filas.map((f) => (
              <tr key={f.nombre}>
                <td className="px-3 py-1.5 text-zinc-200 truncate max-w-[220px]">{f.nombre}</td>
                <td className="px-2 text-right tabular-nums text-zinc-400">{f.cargas} {f.cargas === 1 ? "carga" : "cargas"}</td>
                <td className="px-2 text-right tabular-nums text-white font-semibold">{fmt(f.producido, 0)}</td>
                <td className="px-3 text-right tabular-nums text-zinc-500">{f.producido ? fmt((f.fallas / f.producido) * 100) : 0}% fallas</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Produccion({ p }) {
  if (!p.disponible) return <p className="text-sm text-zinc-500 text-center py-10">Todavía no hay producción cargada en el sistema.</p>;
  if (!p.cargas) return <p className="text-sm text-zinc-500 text-center py-10">No cargó producción en este rango.</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Dato titulo="Producido" valor={fmt(p.total_producido, 0)} detalle={`${fmt(p.buenas, 0)} buenas`} />
        <Dato titulo="Fallas" valor={`${fmt(p.porcentaje_fallas)}%`} detalle={`${fmt(p.fallas, 0)} piezas`} alerta={p.porcentaje_fallas >= 5} />
        <Dato titulo="Turnos" valor={p.turnos} />
        <Dato titulo="Cargas" valor={p.cargas} />
      </div>
      <Tabla titulo="Por producto" filas={p.por_modelo} />
      <Tabla titulo="Por máquina" filas={p.por_maquina} />
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Últimas cargas</h4>
        <ul className="rounded-lg border border-zinc-800 divide-y divide-zinc-900 overflow-hidden">
          {p.detalle.map((c, i) => (
            <li key={i} className="px-3 py-2 text-xs flex flex-wrap gap-x-3 gap-y-0.5 items-baseline">
              <span className="text-zinc-300 font-semibold">{dmy(c.fecha)} {c.turno === "NOCHE" ? "noche" : c.turno === "DIA" ? "día" : c.turno || ""}</span>
              <span className="text-zinc-400 truncate">{c.modelo} · {c.maquina}</span>
              <span className="ml-auto tabular-nums text-white">{fmt(c.producido, 0)}{c.fallas ? <span className="text-zinc-500"> ({fmt(c.fallas, 0)} fallas)</span> : null}</span>
              {c.estado === "PENDIENTE" && <span className="text-[10px] text-amber-300">sin aprobar</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Legajo de un operario: asistencia y producción en el rango que se elija, y sus sanciones. */
export default function Legajo({ operarioInicial, onCerrar }) {
  const [lista, setLista] = useState([]);
  const [operario, setOperario] = useState(operarioInicial || "");
  const [rango, setRango] = useState("mes");
  const [fechas, setFechas] = useState(() => {
    const [d, h] = RANGOS[0].calc(new Date());
    return { desde: iso(d), hasta: iso(h) };
  });
  const [tab, setTab] = useState("asistencia");
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    pedir("/api/legajo/operarios").then((l) => { setLista(l); setOperario((o) => o || l[0]?.nombre || ""); }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!operario) return undefined;
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError("");
    pedir(`/api/legajo/resumen?operario=${encodeURIComponent(operario)}&desde=${fechas.desde}&hasta=${fechas.hasta}`)
      .then((d) => vivo && setDatos(d))
      .catch((e) => vivo && (setDatos(null), setError(e.message)));
    return () => {
      vivo = false;
    };
  }, [operario, fechas, version]);

  const elegirRango = (r) => {
    setRango(r.id);
    const [d, h] = r.calc(new Date());
    setFechas({ desde: iso(d), hasta: iso(h) });
  };
  const alCambiar = useCallback(() => setVersion((v) => v + 1), []);
  const sanciones = datos?.sanciones;
  const tabs = useMemo(() => [["asistencia", "Asistencia"], ["produccion", "Producción"], ["sanciones", `Amonestaciones${sanciones?.vigentes ? ` (${sanciones.vigentes})` : ""}`]], [sanciones]);
  const cargando = operario && !datos && !error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4">
      <div className="bg-[#0D0D0D] border border-zinc-800 rounded-xl w-full max-w-3xl h-[92vh] shadow-2xl flex flex-col overflow-hidden text-zinc-200">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800 bg-[#121212]">
          <h3 className="text-xs font-black tracking-widest uppercase text-white shrink-0">Legajo</h3>
          <select value={operario} onChange={(e) => { setOperario(e.target.value); setDatos(null); }} className="flex-1 min-w-0 bg-[#18181b] border border-zinc-700 text-white font-bold text-xs p-2 rounded focus:border-[#FF5A00] outline-none">
            {lista.map((o) => <option key={o.nombre} value={o.nombre}>{o.nombre}{o.sanciones ? ` · ${o.sanciones} sanc.` : ""}</option>)}
          </select>
          <button onClick={onCerrar} className="text-zinc-500 hover:text-white p-1 rounded hover:bg-zinc-800 cursor-pointer" aria-label="Cerrar"><X size={16} /></button>
        </div>

        <div className="px-5 py-3 border-b border-zinc-800 flex flex-wrap items-center gap-1.5">
          {RANGOS.map((r) => (
            <button key={r.id} onClick={() => elegirRango(r)} className={`px-3 py-1 rounded text-[11px] font-bold cursor-pointer ${rango === r.id ? "bg-[#FF5A00] text-white" : "bg-zinc-900 text-zinc-400 hover:text-white"}`}>{r.texto}</button>
          ))}
          <span className="flex items-center gap-1.5 ml-auto">
            <input type="date" value={fechas.desde} onChange={(e) => { setRango("otro"); setFechas((f) => ({ ...f, desde: e.target.value })); }} className="bg-[#18181b] border border-zinc-700 text-white font-mono text-[11px] p-1.5 rounded outline-none focus:border-[#FF5A00]" aria-label="Desde" />
            <span className="text-zinc-600 text-xs">a</span>
            <input type="date" value={fechas.hasta} onChange={(e) => { setRango("otro"); setFechas((f) => ({ ...f, hasta: e.target.value })); }} className="bg-[#18181b] border border-zinc-700 text-white font-mono text-[11px] p-1.5 rounded outline-none focus:border-[#FF5A00]" aria-label="Hasta" />
          </span>
        </div>

        <div className="px-5 border-b border-zinc-800 flex gap-1">
          {tabs.map(([id, t]) => (
            <button key={id} onClick={() => setTab(id)} className={`px-3.5 py-2.5 text-xs font-bold border-b-2 cursor-pointer ${tab === id ? "border-[#FF5A00] text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>{t}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {cargando && <div className="grid place-items-center py-16 text-zinc-500"><Loader2 className="animate-spin" size={22} /></div>}
          {error && <p className="text-sm text-rose-300">{error}</p>}
          {datos && tab === "asistencia" && <Asistencia a={datos.asistencia} />}
          {datos && tab === "produccion" && <Produccion p={datos.produccion} />}
          {datos && tab === "sanciones" && <Sanciones operario={datos.operario} datos={datos.sanciones} alCambiar={alCambiar} />}
        </div>
      </div>
    </div>
  );
}
