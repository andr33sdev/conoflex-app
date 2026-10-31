import { useMemo, useState } from "react";
import { ArrowUpRight, Boxes, Factory, Loader2, PackageCheck, ShoppingCart, TriangleAlert } from "lucide-react";
import { fechaCorta } from "./formato";

const NIVELES = {
  negativo: { txt: "Negativo", color: "#ef4444" },
  critico: { txt: "Crítico", color: "#f43f5e" },
  bajo: { txt: "Bajo", color: "#FFD60A" },
  ok: { txt: "En orden", color: "#34d399" },
  exceso: { txt: "De sobra", color: "#38bdf8" },
  sin_demanda: { txt: "Sin consumo", color: "#8b93a1" },
};
const fmt = (n, d = 0) => (n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toLocaleString("es-AR", { maximumFractionDigits: d }));

function Spark({ datos, color }) {
  const max = Math.max(...datos, 0.0001);
  const w = 96;
  const h = 26;
  const paso = w / Math.max(1, datos.length - 1);
  const pts = datos.map((v, i) => `${(i * paso).toFixed(1)},${(h - 2 - (v / max) * (h - 5)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

function Cobertura({ dias, color }) {
  // 0 a 60 días; las marcas son los umbrales de crítico (7) y bajo (15)
  const pct = dias == null ? 100 : Math.max(2, Math.min(100, (dias / 60) * 100));
  return (
    <div className="relative h-2 rounded-full bg-white/[0.07] overflow-hidden" role="img" aria-label={dias == null ? "sin consumo" : `alcanza para ${Math.round(dias)} días`}>
      <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: color }} />
      <span className="absolute inset-y-0 w-px bg-black/60" style={{ left: `${(7 / 60) * 100}%` }} />
      <span className="absolute inset-y-0 w-px bg-black/60" style={{ left: `${(15 / 60) * 100}%` }} />
    </div>
  );
}

function Tarjeta({ icono: Icono, titulo, valor, detalle, color, onClick }) {
  return (
    <button onClick={onClick} className="text-left rounded-2xl border border-white/[0.08] bg-[#111116] p-3.5 hover:border-white/25 transition-colors">
      <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-zinc-500"><Icono size={13} style={{ color }} /> {titulo}</p>
      <p className="mt-1 text-[26px] leading-none font-black tabular-nums" style={{ color }}>{valor}</p>
      <p className="mt-1 text-[11.5px] text-zinc-500 leading-tight">{detalle}</p>
    </button>
  );
}

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

  if (error) return <div className="p-6 text-center text-sm text-rose-300">{error}</div>;
  if (!datos) return <div className="h-full grid place-items-center text-zinc-500 py-16"><Loader2 className="animate-spin" size={22} /></div>;

  return (
    <div className="p-3 sm:p-4 space-y-3.5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Tarjeta icono={TriangleAlert} titulo="Críticas" valor={(r.criticas || 0) + (r.semis_criticos || 0)} detalle="alcanzan para una semana o menos" color={r.criticas || r.semis_criticos ? "#fb7185" : "#34d399"} onClick={() => setFiltro("urgente")} />
        <Tarjeta icono={Boxes} titulo="Bajas" valor={(r.bajas || 0) + (r.semis_bajos || 0)} detalle="entre una y dos semanas" color="#FFD60A" onClick={() => setFiltro("urgente")} />
        <Tarjeta icono={ShoppingCart} titulo="Compras abiertas" valor={r.compras_abiertas || 0} detalle="renglones sin recibir" color="#60a5fa" onClick={() => onPreguntar("¿Qué compras pedidas todavía no llegaron?")} />
        <Tarjeta icono={Factory} titulo="Pedidos internos" valor={r.internas_pendientes || 0} detalle="de semielaborados pendientes" color="#c4b5fd" onClick={() => onPreguntar("¿Qué pedidos internos de semielaborados están pendientes?")} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex gap-1 p-1 rounded-xl bg-white/[0.05]">
          {[["materias", "Materias primas"], ["semis", "Semielaborados"]].map(([id, t]) => (
            <button key={id} role="tab" aria-selected={ver === id} onClick={() => setVer(id)} className={`min-h-[36px] px-3 rounded-lg text-[13px] font-bold ${ver === id ? "bg-white/[0.12] text-white" : "text-zinc-500 hover:text-zinc-200"}`}>{t}</button>
          ))}
        </div>
        <div className="flex gap-1.5 ml-auto">
          {[["urgente", "Lo urgente"], ["todo", "Todo"], ["exceso", "De sobra"]].map(([id, t]) => (
            <button key={id} onClick={() => setFiltro(id)} aria-pressed={filtro === id} className={`min-h-[36px] px-3 rounded-full border text-[12.5px] font-bold ${filtro === id ? "bg-[#22c55e] border-[#22c55e] text-black" : "border-white/10 text-zinc-300 hover:border-white/30"}`}>{t}</button>
          ))}
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.07] bg-[#111116] p-8 text-center">
          <PackageCheck size={26} className="mx-auto text-emerald-400" />
          <p className="mt-3 text-[15px] font-bold text-white">{filtro === "urgente" ? "Nada urgente en el depósito" : "No hay nada para mostrar acá"}</p>
          <p className="mt-1 text-sm text-zinc-500">{filtro === "urgente" ? "Todo lo que se consume tiene cobertura para más de dos semanas." : "Probá con otro filtro."}</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {lista.slice(0, 60).map((x) => {
            const n = NIVELES[x.nivel] || NIVELES.ok;
            const esMP = ver === "materias";
            return (
              <li key={x.id ?? x.codigo} className="rounded-2xl border border-white/[0.07] border-l-4 bg-[#111116] p-3.5" style={{ borderLeftColor: n.color }}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-[15px] font-bold text-white leading-snug break-words">{x.nombre}</p>
                      <span className="text-[10.5px] font-extrabold uppercase tracking-wide rounded-full px-2 py-0.5" style={{ color: n.color, background: `${n.color}1f` }}>{n.txt}</span>
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-zinc-400">
                      Stock <b className="text-zinc-200 tabular-nums">{fmt(esMP ? x.stock : x.stock_total, 1)}</b> {esMP ? x.unidad : "u."}
                      {x.demanda_mensual > 0 && <> · consumo <b className="text-zinc-200 tabular-nums">{fmt(x.demanda_mensual)}</b>/mes</>}
                      {x.dias != null && x.demanda_mensual > 0 && <> · alcanza <b className="tabular-nums" style={{ color: n.color }}>{fmt(x.dias)} d</b></>}
                      {x.agota && <> · se agota ~{fechaCorta(x.agota)}</>}
                    </p>
                    {!esMP && x.por_deposito && (
                      <p className="mt-0.5 text-[11.5px] text-zinc-500">{Object.entries(x.por_deposito).filter(([, v]) => v).map(([k, v]) => `${k}: ${fmt(v)}`).join(" · ")}</p>
                    )}
                  </div>
                  {esMP && x.serie?.some((v) => v > 0) && <Spark datos={x.serie} color={n.color} />}
                </div>
                <div className="mt-2.5"><Cobertura dias={x.demanda_mensual > 0 ? x.dias : null} color={n.color} /></div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {esMP && x.compra_pendiente > 0 && <span className="text-[11.5px] font-bold text-sky-300 bg-sky-400/10 rounded-full px-2.5 py-0.5">Ya pedido: {fmt(x.compra_pendiente)} {x.unidad}</span>}
                  <button
                    onClick={() => onPreguntar(esMP ? `Contame de ${x.nombre}: cuánto me alcanza, qué productos lo usan y cuánto debería pedir.` : `Contame de ${x.nombre}: stock por depósito, cuánto debería fabricar y qué lo consume.`)}
                    className="ml-auto inline-flex items-center gap-1 min-h-[36px] px-3 rounded-lg bg-white/[0.07] hover:bg-white/[0.13] text-[12.5px] font-bold text-zinc-100"
                  >
                    Preguntarle a Nati <ArrowUpRight size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-zinc-600 text-center">El consumo mensual es una estimación a partir de las ventas y las ingenierías. La barra marca 7 y 15 días.</p>
    </div>
  );
}
