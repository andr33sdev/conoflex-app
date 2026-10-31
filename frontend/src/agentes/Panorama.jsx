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
      <p className="mt-1.5 text-[12px] text-zinc-500 leading-tight">{detalle}</p>
    </C>
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
        <Dato titulo="Críticas" valor={(r.criticas || 0) + (r.semis_criticos || 0)} detalle="alcanzan para una semana o menos" onClick={() => setFiltro("urgente")} />
        <Dato titulo="Bajas" valor={(r.bajas || 0) + (r.semis_bajos || 0)} detalle="entre una y dos semanas" onClick={() => setFiltro("urgente")} />
        <Dato titulo="Compras abiertas" valor={r.compras_abiertas || 0} detalle="renglones sin recibir" onClick={() => onPreguntar("¿Qué compras pedidas todavía no llegaron?")} />
        <Dato titulo="Pedidos internos" valor={r.internas_pendientes || 0} detalle="de semielaborados pendientes" onClick={() => onPreguntar("¿Qué pedidos internos de semielaborados están pendientes?")} />
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
          <p className="mt-1 text-sm text-zinc-500">{filtro === "urgente" ? "Todo lo que se consume tiene cobertura para más de dos semanas." : "Probá con otro filtro."}</p>
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {lista.slice(0, 60).map((x) => {
            const n = NIVELES[x.nivel] || NIVELES.ok;
            const esMP = ver === "materias";
            return (
              <li key={x.id ?? x.codigo} className="py-3.5">
                <div className="flex items-baseline gap-2">
                  <p className="text-[15px] font-semibold text-white leading-snug break-words min-w-0">{x.nombre}</p>
                  <span className={`ml-auto shrink-0 text-[11.5px] font-semibold uppercase tracking-[0.08em] ${n.urg ? "text-[#ff8a4d]" : "text-zinc-500"}`}>{n.txt}</span>
                </div>
                <p className="mt-0.5 text-[12.5px] text-zinc-400">
                  Stock <b className="text-zinc-200 font-semibold tabular-nums">{fmt(esMP ? x.stock : x.stock_total, 1)}</b> {esMP ? x.unidad : "u."}
                  {x.demanda_mensual > 0 && <> · consumo <b className="text-zinc-200 font-semibold tabular-nums">{fmt(x.demanda_mensual)}</b>/mes</>}
                  {x.dias != null && x.demanda_mensual > 0 && <> · alcanza <b className="text-zinc-200 font-semibold tabular-nums">{fmt(x.dias)} d</b></>}
                  {x.agota && <> · se agota ~{fechaCorta(x.agota)}</>}
                </p>
                {!esMP && x.por_deposito && (
                  <p className="mt-0.5 text-[12px] text-zinc-500">{Object.entries(x.por_deposito).filter(([, v]) => v).map(([k, v]) => `${k}: ${fmt(v)}`).join(" · ")}</p>
                )}
                <div className="mt-2"><Cobertura dias={x.demanda_mensual > 0 ? x.dias : null} urgente={n.urg} /></div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {esMP && x.compra_pendiente > 0 && <span className="text-[12px] text-zinc-500">Ya pedido: {fmt(x.compra_pendiente)} {x.unidad}</span>}
                  <button
                    onClick={() => onPreguntar(esMP ? `Contame de ${x.nombre}: cuánto me alcanza, qué productos lo usan y cuánto debería pedir.` : `Contame de ${x.nombre}: stock por depósito, cuánto debería fabricar y qué lo consume.`)}
                    className="ml-auto min-h-[34px] px-2.5 rounded-lg text-[12.5px] font-semibold text-zinc-400 hover:text-white hover:bg-white/[0.07]"
                  >
                    Preguntarle a Nati →
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11.5px] text-zinc-600 text-center">El consumo mensual es una estimación a partir de las ventas y las ingenierías. La barra marca 7 y 15 días.</p>
    </div>
  );
}
