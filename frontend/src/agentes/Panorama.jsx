import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { fechaCorta } from "./formato";

const NIVELES = {
  negativo: { txt: "Negativo", urg: true },
  critico: { txt: "Crítico", urg: true },
  bajo: { txt: "Bajo" },
  ok: { txt: "En orden" },
  exceso: { txt: "De sobra" },
  sin_demanda: { txt: "Sin consumo" },
};
const fmt = (n, d = 0) => (n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toLocaleString("es-AR", { maximumFractionDigits: d }));

function Cobertura({ dias, urgente }) {
  // 0 a 60 días; las marcas son los umbrales de crítico (7) y bajo (15)
  const pct = dias == null ? 100 : Math.max(2, Math.min(100, (dias / 60) * 100));
  return (
    <div className="relative h-1.5 bg-white/[0.07]" role="img" aria-label={dias == null ? "sin consumo" : `alcanza para ${Math.round(dias)} días`}>
      <div className={`absolute inset-y-0 left-0 ${urgente ? "bg-[#FF5A00]" : "bg-zinc-500"}`} style={{ width: `${pct}%` }} />
      <span className="absolute inset-y-0 w-px bg-black/70" style={{ left: `${(7 / 60) * 100}%` }} />
      <span className="absolute inset-y-0 w-px bg-black/70" style={{ left: `${(15 / 60) * 100}%` }} />
    </div>
  );
}

function Dato({ titulo, valor, detalle, onClick }) {
  const C = onClick ? "button" : "div";
  return (
    <C onClick={onClick} className={`text-left rounded-xl border border-white/[0.07] p-3.5 ${onClick ? "hover:border-white/20 transition-colors" : ""}`}>
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-zinc-500">{titulo}</p>
      <p className="mt-1 text-[26px] leading-none font-bold text-white tabular-nums">{valor}</p>
      {detalle && <p className="mt-1.5 text-[12px] text-zinc-500 leading-tight">{detalle}</p>}
    </C>
  );
}

/** Una fila: nombre, estado y cuánto alcanza. El resto (stock, consumo, depósitos) aparece al abrirla. */
function Fila({ x, esMP, onPreguntar }) {
  const [abierta, setAbierta] = useState(false);
  const n = NIVELES[x.nivel] || NIVELES.ok;
  const alcanza = x.demanda_mensual > 0 && x.dias != null ? `Alcanza ${fmt(x.dias)} ${Math.round(x.dias) === 1 ? "día" : "días"}` : "Sin consumo";
  return (
    <li className="py-3">
      <button onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} className="w-full text-left">
        <span className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold text-white leading-snug break-words min-w-0">{x.nombre}</span>
          <span className={`ml-auto shrink-0 text-[12.5px] font-semibold ${n.urg ? "text-[#ff8a4d]" : "text-zinc-500"}`}>{alcanza}</span>
        </span>
        <span className="mt-2 block"><Cobertura dias={x.demanda_mensual > 0 ? x.dias : null} urgente={n.urg} /></span>
      </button>
      {abierta && (
        <div className="mt-2.5 space-y-1 text-[13px] text-zinc-400">
          <p>Stock <b className="text-zinc-200 font-semibold tabular-nums">{fmt(esMP ? x.stock : x.stock_total, 1)}</b> {esMP ? x.unidad : "u."}{x.demanda_mensual > 0 && <> · consumo <b className="text-zinc-200 font-semibold tabular-nums">{fmt(x.demanda_mensual)}</b>/mes</>}{x.agota && <> · se agota ~{fechaCorta(x.agota)}</>}</p>
          {!esMP && x.por_deposito && <p className="text-zinc-500">{Object.entries(x.por_deposito).filter(([, v]) => v).map(([k, v]) => `${k}: ${fmt(v)}`).join(" · ")}</p>}
          {esMP && x.compra_pendiente > 0 && <p className="text-zinc-500">Ya pedido: {fmt(x.compra_pendiente)} {x.unidad}</p>}
          <button onClick={() => onPreguntar(esMP ? `Contame de ${x.nombre}: cuánto me alcanza, qué productos lo usan y cuánto debería pedir.` : `Contame de ${x.nombre}: stock por depósito, cuánto debería fabricar y qué lo consume.`)} className="pt-1 font-semibold text-zinc-300 hover:text-white">Preguntarle a Nati →</button>
        </div>
      )}
    </li>
  );
}

const Pastilla = ({ activo, onClick, children }) => (
  <button onClick={onClick} aria-pressed={activo} className={`min-h-[34px] px-3 rounded-lg text-[13px] font-semibold ${activo ? "bg-white/[0.1] text-white" : "text-zinc-500 hover:text-zinc-200"}`}>{children}</button>
);

/** Panorama de Nati: cobertura de cada materia prima y semielaborado, con la tendencia de consumo y qué preguntarle. */
export default function Panorama({ datos, error, onPreguntar }) {
  const [filtro, setFiltro] = useState("urgente");
  const [ver, setVer] = useState("materias");
  const r = datos?.resumen;

  const lista = useMemo(() => {
    const base = ver === "materias" ? datos?.materias || [] : datos?.semielaborados || [];
    if (filtro === "urgente") return base.filter((x) => ["negativo", "critico", "bajo"].includes(x.nivel));
    if (filtro === "exceso") return base.filter((x) => x.nivel === "exceso");
    return base;
  }, [datos, filtro, ver]);

  if (error) return <div className="p-6 text-center text-sm text-zinc-400">{error}</div>;
  if (!datos) return <div className="h-full grid place-items-center text-zinc-500 py-16"><Loader2 className="animate-spin" size={22} /></div>;

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-5 py-4 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Dato titulo="Críticas" valor={(r.criticas || 0) + (r.semis_criticos || 0)} onClick={() => setFiltro("urgente")} />
        <Dato titulo="Bajas" valor={(r.bajas || 0) + (r.semis_bajos || 0)} onClick={() => setFiltro("urgente")} />
        <Dato titulo="Compras sin recibir" valor={r.compras_abiertas || 0} onClick={() => onPreguntar("¿Qué compras pedidas todavía no llegaron?")} />
        <Dato titulo="Pedidos internos" valor={r.internas_pendientes || 0} onClick={() => onPreguntar("¿Qué pedidos internos de semielaborados están pendientes?")} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex gap-1 p-1 rounded-xl bg-white/[0.04]">
          <Pastilla activo={ver === "materias"} onClick={() => setVer("materias")}>Materias primas</Pastilla>
          <Pastilla activo={ver === "semis"} onClick={() => setVer("semis")}>Semielaborados</Pastilla>
        </div>
        <div className="flex gap-1 ml-auto">
          <Pastilla activo={filtro === "urgente"} onClick={() => setFiltro("urgente")}>Lo urgente</Pastilla>
          <Pastilla activo={filtro === "todo"} onClick={() => setFiltro("todo")}>Todo</Pastilla>
          <Pastilla activo={filtro === "exceso"} onClick={() => setFiltro("exceso")}>De sobra</Pastilla>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="py-14 text-center">
          <p className="text-[15px] font-semibold text-white">{filtro === "urgente" ? "Nada urgente en el depósito" : "No hay nada para mostrar acá"}</p>
          {filtro !== "urgente" && <p className="mt-1 text-sm text-zinc-500">Probá con otro filtro.</p>}
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {lista.slice(0, 60).map((x) => <Fila key={x.id ?? x.codigo} x={x} esMP={ver === "materias"} onPreguntar={onPreguntar} />)}
        </ul>
      )}
    </div>
  );
}
