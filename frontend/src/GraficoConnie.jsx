import React, { useEffect, useMemo, useRef, useState } from "react";

// Gráficos de Connie dibujados en SVG/HTML, sin librerías. Pensados para
// celular: el SVG escala con el ancho disponible y las barras horizontales
// son filas normales de HTML (se leen bien en pantallas angostas).

const COLORES = ["#FF5A00", "#FFD700", "#38BDF8", "#34D399", "#A78BFA", "#F472B6"];
const COLOR_TORTA = [
  "#FF5A00", "#FFD700", "#38BDF8", "#34D399", "#A78BFA", "#F472B6",
  "#FB923C", "#22D3EE", "#A3E635", "#E879F9", "#F87171", "#71717A",
];

const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

function formatear(n, unidad = "") {
  if (n === null || n === undefined) return "—";
  const u = unidad.trim();
  const texto = nf.format(n);
  if (u === "$") return `$ ${texto}`;
  return u ? `${texto} ${u}` : texto;
}

function compacto(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return `${nf.format(n / 1e9)} MM`;
  if (a >= 1e6) return `${nf.format(n / 1e6)} M`;
  if (a >= 1e4) return `${nf.format(n / 1e3)} mil`;
  return nf.format(n);
}

function escalaNice(min, max, pasos = 4) {
  if (min === max) return { min: Math.min(0, min), max: max === 0 ? 1 : max * 1.1, ticks: [min] };
  const rango = max - min;
  const bruto = rango / pasos;
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const norm = bruto / mag;
  const paso = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ini = Math.floor(min / paso) * paso;
  const fin = Math.ceil(max / paso) * paso;
  const ticks = [];
  for (let v = ini; v <= fin + paso / 2; v += paso) ticks.push(Number(v.toFixed(10)));
  return { min: ini, max: fin, ticks };
}

const recortar = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

function Leyenda({ series }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
      {series.map((s, i) => (
        <span key={i} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORES[i % COLORES.length] }} />
          {s.nombre || `Serie ${i + 1}`}
        </span>
      ))}
    </div>
  );
}

function BarrasHorizontales({ g }) {
  const serie = g.series[0];
  const max = Math.max(...serie.valores.map((v) => v ?? 0), 0) || 1;
  return (
    <div className="space-y-2.5">
      {g.etiquetas.map((e, i) => {
        const v = serie.valores[i];
        const pct = Math.max(0, ((v ?? 0) / max) * 100);
        return (
          <div key={i}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-zinc-300 truncate">{e}</span>
              <span className="text-zinc-100 font-semibold tabular-nums shrink-0">{formatear(v, g.unidad)}</span>
            </div>
            <div className="mt-1 h-2.5 bg-zinc-900 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLORES[0] }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Ancho real del contenedor: así el texto del SVG mantiene su tamaño en pantallas chicas
function useAncho() {
  const ref = useRef(null);
  const [ancho, setAncho] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const medir = () => setAncho(Math.max(220, Math.round(el.getBoundingClientRect().width)));
    medir();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho];
}

function EjesXY({ g, tipo }) {
  const [sel, setSel] = useState(null);
  const [ref, ancho] = useAncho();
  const rotar = g.etiquetas.length > 5;
  const W = ancho, pl = ancho < 420 ? 44 : 54, pr = 8, pt = 12, pb = rotar ? 74 : 30;
  const H = (ancho < 420 ? 190 : 230) + pb;
  const todos = g.series.flatMap((s) => s.valores).filter((v) => v !== null);
  const esc = useMemo(
    () => escalaNice(Math.min(0, ...todos), Math.max(...todos, 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [g],
  );
  const n = g.etiquetas.length;
  const iw = W - pl - pr, ih = H - pt - pb;
  const y = (v) => pt + ih - ((v - esc.min) / (esc.max - esc.min || 1)) * ih;
  const salto = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(iw / 48)))); // etiquetas que entran sin pisarse
  const grupo = iw / n;

  const barras = tipo === "barras";
  const nSeries = g.series.length;
  const anchoBarra = Math.max(2, (grupo * 0.72) / nSeries);
  const xCentro = (i) => pl + grupo * i + grupo / 2;

  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full select-none" role="img" aria-label={g.titulo}>
        {esc.ticks.map((t, i) => (
          <g key={i}>
            <line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} stroke="#27272a" strokeWidth="1" />
            <text x={pl - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#71717a">
              {compacto(t)}
            </text>
          </g>
        ))}
        {g.etiquetas.map((e, i) =>
          i % salto === 0 ? (
            <text
              key={i}
              x={xCentro(i)}
              y={H - pb + 16}
              fontSize="11"
              fill="#a1a1aa"
              textAnchor={rotar ? "end" : "middle"}
              transform={rotar ? `rotate(-35 ${xCentro(i)} ${H - pb + 16})` : undefined}
            >
              {recortar(e, rotar ? 14 : 18)}
            </text>
          ) : null,
        )}

        {barras &&
          g.series.map((s, si) =>
            s.valores.map((v, i) => {
              if (v === null) return null;
              const x0 = pl + grupo * i + (grupo - anchoBarra * nSeries) / 2 + si * anchoBarra;
              const yv = y(v), y0 = y(0);
              return (
                <rect
                  key={`${si}-${i}`}
                  x={x0}
                  y={Math.min(yv, y0)}
                  width={anchoBarra - 1}
                  height={Math.max(1, Math.abs(y0 - yv))}
                  rx="2"
                  fill={COLORES[si % COLORES.length]}
                  opacity={sel === null || sel === i ? 1 : 0.45}
                />
              );
            }),
          )}

        {!barras &&
          g.series.map((s, si) => {
            const pts = s.valores
              .map((v, i) => (v === null ? null : [xCentro(i), y(v)]))
              .filter(Boolean);
            const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
            return (
              <g key={si}>
                <path d={d} fill="none" stroke={COLORES[si % COLORES.length]} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                {pts.map((p, i) => (
                  <circle key={i} cx={p[0]} cy={p[1]} r={n > 20 ? 2 : 3.5} fill={COLORES[si % COLORES.length]} />
                ))}
              </g>
            );
          })}

        {/* Zonas táctiles: tocar (o pasar el mouse) muestra los valores de esa posición */}
        {g.etiquetas.map((_, i) => (
          <rect
            key={i}
            x={pl + grupo * i}
            y={pt}
            width={grupo}
            height={ih}
            fill="transparent"
            onMouseEnter={() => setSel(i)}
            onMouseLeave={() => setSel(null)}
            onClick={() => setSel(sel === i ? null : i)}
          />
        ))}
      </svg>
      <div className="min-h-[2.25rem] mt-1 text-xs text-zinc-300">
        {sel !== null ? (
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            <span className="font-semibold text-zinc-100">{g.etiquetas[sel]}</span>
            {g.series.map((s, si) => (
              <span key={si} className="tabular-nums">
                {g.series.length > 1 && (
                  <span style={{ color: COLORES[si % COLORES.length] }}>{s.nombre || `Serie ${si + 1}`}: </span>
                )}
                {formatear(s.valores[sel], g.unidad)}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-zinc-600">Tocá el gráfico para ver los valores</span>
        )}
      </div>
    </div>
  );
}

function Torta({ g }) {
  const valores = g.series[0].valores;
  const total = valores.reduce((a, b) => a + (b || 0), 0) || 1;
  const R = 80, r = 50, c = 100;
  let acum = -Math.PI / 2;
  const arcos = valores.map((v, i) => {
    const ang = ((v || 0) / total) * Math.PI * 2;
    const a0 = acum, a1 = acum + ang;
    acum = a1;
    const g1 = ang > Math.PI * 1.9999 ? a0 + Math.PI * 1.9999 : a1;
    const p = (rad, a) => [c + rad * Math.cos(a), c + rad * Math.sin(a)];
    const [x0, y0] = p(R, a0), [x1, y1] = p(R, g1), [x2, y2] = p(r, g1), [x3, y3] = p(r, a0);
    const grande = g1 - a0 > Math.PI ? 1 : 0;
    const d = `M${x0},${y0} A${R},${R} 0 ${grande} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${grande} 0 ${x3},${y3} Z`;
    return { d, color: COLOR_TORTA[i % COLOR_TORTA.length], pct: ((v || 0) / total) * 100 };
  });
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg viewBox="0 0 200 200" className="w-44 h-44 shrink-0" role="img" aria-label={g.titulo}>
        {arcos.map((a, i) => (
          <path key={i} d={a.d} fill={a.color} stroke="#0A0A0A" strokeWidth="1.5" />
        ))}
        <text x="100" y="96" textAnchor="middle" fontSize="10" fill="#71717a">Total</text>
        <text x="100" y="114" textAnchor="middle" fontSize="13" fontWeight="700" fill="#f4f4f5">{compacto(total)}</text>
      </svg>
      <ul className="w-full space-y-1.5 text-xs">
        {g.etiquetas.map((e, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: arcos[i].color }} />
            <span className="text-zinc-300 truncate flex-1">{e}</span>
            <span className="text-zinc-100 font-semibold tabular-nums shrink-0">{formatear(valores[i], g.unidad)}</span>
            <span className="text-zinc-500 tabular-nums w-12 text-right shrink-0">{arcos[i].pct.toFixed(1).replace(".", ",")}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function GraficoConnie({ grafico }) {
  if (!grafico?.etiquetas?.length || !grafico?.series?.length) return null;
  return (
    <figure className="mt-3 p-3 sm:p-4 bg-black border border-zinc-800 rounded-xl whitespace-normal">
      {grafico.titulo && (
        <figcaption className="text-xs font-bold uppercase tracking-wider text-zinc-300 mb-3">
          {grafico.titulo}
          {grafico.unidad ? <span className="text-zinc-500 font-medium normal-case"> ({grafico.unidad})</span> : null}
        </figcaption>
      )}
      {grafico.tipo === "torta" ? (
        <Torta g={grafico} />
      ) : grafico.tipo === "barras_horizontales" ? (
        <BarrasHorizontales g={grafico} />
      ) : (
        <EjesXY g={grafico} tipo={grafico.tipo === "lineas" ? "lineas" : "barras"} />
      )}
      {grafico.tipo !== "torta" && grafico.tipo !== "barras_horizontales" && <Leyenda series={grafico.series} />}
    </figure>
  );
}
