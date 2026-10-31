import { memo, useMemo } from "react";
import { Lock } from "lucide-react";
import { GRILLA, frameDe, rectas, useTick } from "./pixelMotor";
import { estadoDe, useSlotEstado } from "./estados";
import { PROXIMOS } from "./proximos";

// El "mundillo": una oficina de pixel art por agente. Todo se dibuja con rectángulos en una grilla de 64×44 celdas.
const W = 64;
const Hh = 38;

function lienzo() {
  const l = [];
  const r = (x, y, w, h, c) => l.push({ x, y, w, h, c });
  return { l, r };
}

const franja = (h) => (h >= 8 && h < 18 ? "dia" : h >= 18 && h < 21 || h >= 6 && h < 8 ? "tarde" : "noche");
const CIELO = { dia: "#8fb8d8", tarde: "#d9a066", noche: "#161d33" };

function ventana(r, x, y, w, h, f) {
  r(x - 1, y - 1, w + 2, h + 2, "#d9d4c8");
  r(x, y, w, h, CIELO[f]);
  if (f === "noche") {
    r(x + 2, y + 2, 1, 1, "#f4f1d0");
    r(x + w - 4, y + 4, 1, 1, "#f4f1d0");
    r(x + 5, y + 1, 1, 1, "#9aa3c7");
  } else {
    r(x + 2, y + h - 3, w - 4, 1, f === "dia" ? "#b6d3e8" : "#e7bb85");
    r(x + 1, y + 1, 3, 1, f === "dia" ? "#f4f8fb" : "#f0cf9f");
  }
  r(x + Math.floor(w / 2), y, 1, h, "#d9d4c8");
  r(x, y + Math.floor(h / 2), w, 1, "#d9d4c8");
  r(x - 2, y + h + 1, w + 4, 1, "#bdb6a8");
}

function reloj(r, cx, cy, ahora) {
  r(cx - 2, cy - 3, 5, 7, "#e9e5da");
  r(cx - 3, cy - 2, 7, 5, "#e9e5da");
  r(cx - 1, cy - 4, 3, 1, "#2b2b34");
  r(cx - 1, cy + 4, 3, 1, "#2b2b34");
  const m = ahora.getMinutes();
  const h = ahora.getHours() % 12;
  r(cx, cy, 1, 1, "#2b2b34");
  const aguja = (ang, largo, c) => {
    for (let i = 1; i <= largo; i++) r(cx + Math.round(Math.sin(ang) * i), cy - Math.round(Math.cos(ang) * i), 1, 1, c);
  };
  aguja((m / 60) * 2 * Math.PI, 2, "#2b2b34");
  aguja(((h + m / 60) / 12) * 2 * Math.PI, 1, "#8a3b1c");
}

function planta(r, x, y) {
  r(x + 1, y + 7, 5, 4, "#7a4a32");
  r(x + 1, y + 7, 5, 1, "#93593d");
  r(x + 3, y + 3, 1, 4, "#3f7d46");
  r(x, y + 2, 3, 2, "#4e9a56");
  r(x + 4, y + 1, 3, 2, "#4e9a56");
  r(x + 2, y, 3, 2, "#5cb064");
  r(x + 1, y + 4, 2, 1, "#3f7d46");
  r(x + 4, y + 4, 2, 1, "#3f7d46");
}

function escritorio(r) {
  // respaldo de la silla, detrás del personaje
  r(21, 18, 22, 13, "#2a2a33");
  r(21, 18, 22, 1, "#3a3a46");
  r(22, 19, 1, 11, "#34343f");
}
function mesada(r) {
  r(10, 29, 44, 2, "#8a6a4a");
  r(10, 29, 44, 1, "#a07d58");
  r(10, 31, 44, 13, "#5a4330");
  r(12, 32, 1, 12, "#4a3727");
  r(51, 32, 1, 12, "#4a3727");
  r(14, 34, 12, 8, "#4d3a2a");
  r(14, 34, 12, 1, "#6a5039");
  r(21, 37, 3, 1, "#c9a56a");
  r(39, 34, 12, 8, "#4d3a2a");
  r(39, 34, 12, 1, "#6a5039");
  r(41, 37, 3, 1, "#c9a56a");
}

function teclado(r) {
  r(24, 30, 16, 1, "#2e2e38");
  for (let i = 0; i < 8; i++) r(25 + i * 2, 30, 1, 1, "#4a4a58");
}

function monitor(r, t, activo) {
  r(44, 20, 11, 9, "#1c1c24");
  r(45, 21, 9, 6, activo ? "#24415f" : "#1b2430");
  if (activo) {
    const o = Math.floor(t / 2) % 3;
    r(46, 22, 4 + (o === 1 ? 1 : 0), 1, "#7fb4e6");
    r(46, 24, 6 - o, 1, "#5d8fbf");
    r(46, 26 - (o === 2 ? 1 : 0), 3, 1, "#7fb4e6");
  }
  r(48, 27, 3, 1, "#2b2b34");
  r(47, 28, 5, 1, "#3a3a46");
}

function taza(r, t, x = 15) {
  r(x, 26, 3, 3, "#ececf2");
  r(x + 3, 27, 1, 1, "#ececf2");
  r(x, 26, 3, 1, "#b9b9c6");
  const a = Math.floor(t / 3) % 2;
  r(x + 1, 24 - a, 1, 1, "#7a7a88");
  r(x + 2 - a, 23 - a, 1, 1, "#5f5f6c");
}

// ---------- cada oficina ----------
function fondoRRHH(r, f, ahora) {
  r(0, 0, W, 22, "#4a3d38");
  r(0, 0, W, 1, "#3a2f2b");
  r(0, 21, W, 1, "#38302c");
  for (let y = 22; y < Hh; y += 4) for (let x = 0; x < W; x += 4) r(x, y, 4, 4, (x / 4 + y / 4) % 2 ? "#2e2623" : "#342b28");
  ventana(r, 6, 4, 12, 10, f);
  reloj(r, 30, 8, ahora);
  // calendario de pared
  r(46, 3, 11, 11, "#e8e4da");
  r(46, 3, 11, 3, "#c8672f");
  for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) r(47 + i * 2 + (i > 1 ? 1 : 0), 8 + j * 2, 1, 1, "#8c8678");
  r(51, 10, 1, 1, "#c8672f");
  // archivero
  r(2, 17, 8, 17, "#5b5f68");
  r(2, 17, 8, 1, "#737883");
  for (let i = 0; i < 3; i++) {
    r(3, 19 + i * 5, 6, 4, "#6a6f79");
    r(5, 20 + i * 5, 2, 1, "#c9ccd6");
  }
  planta(r, 56, 24);
}
function fondoDeposito(r, f, ahora) {
  r(0, 0, W, 22, "#36403a");
  for (let x = 0; x < W; x += 2) r(x, 10, 1, 11, "#3b463f");
  r(0, 0, W, 1, "#2b332e");
  r(0, 20, W, 2, "#d8b53a");
  for (let x = 0; x < W; x += 4) r(x, 20, 2, 2, "#23252a");
  for (let y = 22; y < Hh; y += 4) for (let x = 0; x < W; x += 4) r(x, y, 4, 4, (x / 4 + y / 4) % 2 ? "#2c2e2d" : "#303231");
  // portón enrollable
  r(26, 3, 18, 16, "#4b5350");
  for (let y = 4; y < 18; y += 2) r(26, y, 18, 1, "#5a635f");
  r(26, 3, 18, 1, "#2b332e");
  void ahora;
  void f;
  // estantería con cajas
  r(1, 4, 22, 1, "#8a8f98");
  r(1, 11, 22, 1, "#8a8f98");
  r(1, 18, 22, 1, "#8a8f98");
  r(1, 4, 1, 15, "#6b7079");
  r(22, 4, 1, 15, "#6b7079");
  const caja = (x, y, w, h, c) => {
    r(x, y, w, h, c);
    r(x, y, w, 1, "#ffffff22");
    r(x + Math.floor(w / 2), y, 1, h, "#00000030");
  };
  caja(3, 6, 5, 5, "#a07a4f");
  caja(9, 7, 5, 4, "#8b6a44");
  caja(15, 5, 6, 6, "#a07a4f");
  caja(3, 13, 6, 5, "#4d6a7f");
  caja(10, 14, 4, 4, "#a07a4f");
  caja(15, 13, 6, 5, "#6c7f4d");
  // pallet con cajas
  r(50, 38, 13, 2, "#7a5a3e");
  r(50, 40, 13, 1, "#4a3727");
  caja(51, 31, 6, 7, "#a07a4f");
  caja(57, 33, 5, 5, "#8b6a44");
  caja(53, 27, 5, 4, "#a07a4f");
}
function fondoCompras(r, f, ahora) {
  r(0, 0, W, 22, "#364050");
  r(0, 0, W, 1, "#2a3340");
  r(0, 21, W, 1, "#2b3340");
  for (let y = 22; y < Hh; y += 4) for (let x = 0; x < W; x += 4) r(x, y, 4, 4, (x / 4 + y / 4) % 2 ? "#272b34" : "#2b303a");
  ventana(r, 27, 4, 11, 10, f);
  void ahora;
  // pizarra con lista
  r(3, 3, 20, 14, "#cfd2d9");
  r(4, 4, 18, 12, "#e9ecf2");
  for (let i = 0; i < 4; i++) {
    r(6, 6 + i * 3, 2, 2, i < 2 ? "#51709e" : "#9aa0ae");
    r(10, 6 + i * 3, 9 - (i % 2) * 3, 1, "#7a8090");
  }
  r(5, 17, 5, 1, "#51709e");
  r(12, 17, 3, 1, "#b4524a");
  // biblioteca con carpetas
  r(44, 3, 18, 18, "#4a4034");
  r(45, 4, 16, 7, "#2d2a27");
  r(45, 12, 16, 8, "#2d2a27");
  const cols = ["#51709e", "#b4524a", "#8a8f98", "#6c8f5a", "#c9a56a", "#51709e", "#8a8f98", "#b4524a"];
  cols.forEach((c, i) => {
    r(46 + i * 2, 5, 2, 6, c);
    r(46 + i * 2, 13 - (i % 3 === 0 ? 1 : 0), 2, 7 + (i % 3 === 0 ? 1 : 0), cols[(i + 3) % 8]);
  });
  planta(r, 2, 24);
}

const FONDOS = { rrhh: fondoRRHH, stock: fondoDeposito, compras: fondoCompras, ventas: fondoCompras };

const Cuarto = memo(function Cuarto({ id, est, apagado = false }) {
  const t = useTick();
  const ahora = new Date();
  const minuto = ahora.getMinutes();
  const f = franja(ahora.getHours());
  const estatico = useMemo(() => {
    const { l, r } = lienzo();
    FONDOS[id](r, f, ahora);
    escritorio(r);
    return l;
    // el reloj de pared se refresca cuando cambia el minuto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, f, minuto]);
  const frente = (() => {
    const { l, r } = lienzo();
    mesada(r);
    teclado(r);
    monitor(r, t, !apagado);
    if (id === "rrhh") {
      r(12, 27, 6, 2, "#e8e4da");
      r(12, 26, 5, 1, "#f2efe6");
      taza(r, t, 20);
    } else if (id === "compras") {
      r(13, 26, 5, 3, "#1c1c24");
      r(14, 25, 3, 1, "#2b2b34");
      r(19, 27, 4, 2, "#e8e4da");
      const llama = est.icono === "telefono";
      r(16, 27, 1, 1, llama && Math.floor(t / 2) % 2 ? "#ff5a00" : "#3a3a46");
      taza(r, t, 46);
    } else if (id === "stock") {
      r(13, 26, 6, 3, "#d8c28a");
      r(13, 26, 6, 1, "#e8d9a8");
      r(21, 27, 4, 2, "#e8e4da");
      taza(r, t, 46);
    }
    return l;
  })();
  const sprite = rectas(id, frameDe(est.modo, est.ojos, t, apagado));
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full h-auto block" shapeRendering="crispEdges" role="img" aria-label={`Oficina de ${id}`}>
      {estatico.map((q, i) => <rect key={i} x={q.x} y={q.y} width={q.w} height={q.h} fill={q.c} />)}
      <svg x={20} y={6} width={GRILLA} height={GRILLA} viewBox={`0 0 ${GRILLA} ${GRILLA}`}>
        {sprite.map((q) => <rect key={`${q.x},${q.y}`} x={q.x} y={q.y} width={q.w} height="1" fill={q.c} />)}
      </svg>
      {frente.map((q, i) => <rect key={i} x={q.x} y={q.y} width={q.w} height={q.h} fill={q.c} />)}
      {apagado && <rect x="0" y="0" width={W} height={Hh} fill="#0b0b0d" opacity="0.72" />}
    </svg>
  );
});

function Tarjeta({ id, nombre, puesto, est, avisos, onClick, apagado }) {
  return (
    <button onClick={onClick} className="group text-left rounded-2xl border border-white/[0.08] bg-[#111114] overflow-hidden hover:border-white/25 transition-colors">
      <div className="relative">
        <Cuarto id={id} est={est} apagado={apagado} />
        {!apagado && (
          <div className="absolute left-1/2 -translate-x-1/2 top-2 max-w-[92%]" key={est.texto}>
            <span className="cf-estado block rounded-lg bg-[#f1f0f4] text-[#1b1b21] text-[11.5px] sm:text-[12px] font-semibold leading-tight px-2.5 py-1 shadow-lg truncate">{est.texto}</span>
            <span className="block mx-auto w-2 h-2 -mt-1 rotate-45 bg-[#f1f0f4]" />
          </div>
        )}
        {apagado && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-black/60 text-zinc-300 text-[12px] font-semibold px-3 py-1.5"><Lock size={12} /> Pronto</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15.5px] font-bold text-white leading-tight">{nombre}</p>
          <p className="text-[12.5px] text-zinc-500 leading-tight">{puesto}</p>
        </div>
        {!apagado && avisos > 0 && <span className="text-[12px] font-semibold text-zinc-500 tabular-nums">{avisos} {avisos === 1 ? "aviso" : "avisos"}</span>}
        <span className="text-[12.5px] font-semibold text-zinc-400 group-hover:text-white">{apagado ? "Ver" : "Hablar →"}</span>
      </div>
    </button>
  );
}

/** Vista principal del módulo: las oficinas de cada agente, todas a la vista. */
export default function Mundo({ agentes, onElegir, modo, abiertosVivo, vivoId }) {
  useSlotEstado();
  const total = agentes.reduce((a, x) => a + (x.id === vivoId && abiertosVivo != null ? abiertosVivo : x.abiertos || 0), 0);
  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-[#0b0b0d]">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-5">
        <div className="mb-4">
          <h1 className="text-[20px] font-bold text-white leading-tight">Oficina</h1>
          <p className="text-[13px] text-zinc-500 mt-0.5">{agentes.length} {agentes.length === 1 ? "agente trabajando" : "agentes trabajando"}{total > 0 ? ` · ${total} ${total === 1 ? "aviso abierto" : "avisos abiertos"} en total` : " · todo en orden"}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {agentes.map((a) => {
            const propio = a.id === vivoId;
            const avisos = propio && abiertosVivo != null ? abiertosVivo : a.abiertos || 0;
            const est = estadoDe(a.id, a.nombre, { modo: propio ? modo : "idle", abiertos: avisos });
            return <Tarjeta key={a.id} id={a.id} nombre={a.nombre} puesto={a.puesto} est={est} avisos={avisos} onClick={() => onElegir(a.id)} />;
          })}
          {PROXIMOS.map((a) => (
            <Tarjeta key={a.id} id="ventas" nombre={a.nombre} puesto={a.puesto} est={{ texto: "", modo: "idle", ojos: "frente", icono: null }} avisos={0} apagado onClick={() => onElegir(a.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
