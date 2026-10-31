import { memo, useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { rectasMini } from "./pixelMini";
import { estadoDe, equipoIds, useSlotEstado } from "./estados";
import { CAFE, H, REUNION, W, escena, geometria, segundosDeReunion } from "./escena";
import Reunion from "./Reunion";
import { useReunion } from "./useReunion";
import PreguntaOficina from "./PreguntaOficina";
import AvisosCelular from "./AvisosCelular";
import { PROXIMOS } from "./proximos";

// El departamento visto desde arriba. Todo se dibuja con rectángulos en un mapa de 176×112 unidades;
// las personas caminan por los pasillos según el reloj (ver escena.js).

const TINTES = {
  rrhh: ["#4b3b35", "#45362f", "#FF5A00"],
  stock: ["#34413a", "#2f3b34", "#22c55e"],
  compras: ["#333d4d", "#2e3846", "#3b82f6"],
  produccion: ["#3d3750", "#38324a", "#8b5cf6"],
};
const PARED = "#d6d2c6";
const SOMBRA = "rgba(0,0,0,0.32)";
const franja = (h) => (h >= 8 && h < 18 ? "dia" : (h >= 18 && h < 21) || (h >= 6 && h < 8) ? "tarde" : "noche");
const CIELO = { dia: "#9cc3e0", tarde: "#dba46a", noche: "#1a2240" };

function useReloj() {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const id = setInterval(() => setAhora(Date.now()), quieto ? 1000 : 140);
    return () => clearInterval(id);
  }, []);
  return ahora;
}

const lienzo = () => {
  const l = [];
  return { l, r: (x, y, w, h, c) => l.push({ x, y, w, h, c }) };
};

// ---------- fondo (no cambia salvo la hora del día) ----------
function pared(r, x, y, w, h) {
  r(x, y, w, h, PARED);
  r(x, y + h, w, 1, SOMBRA);
}
function pisoSala(r, x, y, w, h, [a, b]) {
  r(x, y, w, h, a);
  for (let j = y + 3; j < y + h; j += 4) r(x, j, w, 1, b);
}
function planta(r, x, y) {
  r(x + 1, y + 4, 4, 3, "#7a4a32");
  r(x + 1, y + 4, 4, 1, "#93593d");
  r(x, y + 1, 3, 3, "#4e9a56");
  r(x + 3, y, 3, 3, "#5cb064");
  r(x + 2, y + 2, 2, 2, "#3f7d46");
}
function caja(r, x, y, w, h, c = "#a07a4f") {
  r(x, y, w, h, c);
  r(x, y, w, 1, "#ffffff2a");
  r(x + Math.floor(w / 2), y + 1, 1, h - 1, "#00000030");
}
function estante(r, x, y, w) {
  r(x, y, w, 7, "#5b5f68");
  r(x, y, w, 1, "#7a808c");
  r(x, y + 3, w, 1, "#4a4e56");
  const cols = ["#a07a4f", "#8b6a44", "#4d6a7f", "#6c7f4d", "#a07a4f"];
  for (let i = 0, cx = x + 1; cx < x + w - 3; i++, cx += 5) {
    r(cx, y + 1, 4, 2, cols[i % cols.length]);
    r(cx + 1, y + 4, 3, 2, cols[(i + 2) % cols.length]);
  }
}

function fondo(r, ids, f) {
  // piso del pasillo (baldosas)
  r(0, 48, W, 16, "#2b2b34");
  for (let j = 48; j < 64; j += 8) for (let i = 0; i < W; i += 8) if (((i + j) / 8) % 2) r(i, j, 8, 8, "#30303a");
  // alfombra del pasillo
  r(72, 52, 32, 8, "#3a3550");
  r(73, 53, 30, 6, "#433d5e");

  // salas
  for (const id of ["rrhh", "stock", "compras", "produccion"]) {
    const g = geometria(id);
    pisoSala(r, g.x, g.y, g.w, g.h, TINTES[id]);
    r(g.escritorio.x - 2, g.escritorio.y - 4, g.escritorio.w + 4, g.escritorio.h + 12, TINTES[id][1]); // alfombra
    r(g.escritorio.x - 1, g.escritorio.y - 3, g.escritorio.w + 2, g.escritorio.h + 10, TINTES[id][0]);
    r(g.x + (g.izq ? 1 : 2), g.y + (g.arriba ? 0 : 1), 1, 1, TINTES[id][2]); // marca de color de la sala
  }
  // reunión y cocina
  pisoSala(r, REUNION.x, REUNION.y, REUNION.w, REUNION.h, ["#3a3a42", "#34343c"]);
  pisoSala(r, CAFE.x, CAFE.y, CAFE.w, CAFE.h, ["#3f3a33", "#39342d"]);

  // decorado de cada sala
  // RRHH: archiveros, planta
  r(48, 3, 18, 6, "#5b5f68");
  r(48, 3, 18, 1, "#7a808c");
  for (let i = 0; i < 3; i++) r(50 + i * 6, 5, 4, 3, "#6a6f79");
  r(5, 4, 9, 5, "#e8e4da");
  r(5, 4, 9, 1, "#FF5A00");
  planta(r, 58, 34);
  r(4, 36, 14, 7, "#4a3d38");
  r(5, 37, 12, 2, "#e8e4da");
  // Depósito: estantes y pallet
  estante(r, 110, 3, 26);
  estante(r, 138, 3, 20);
  r(146, 36, 24, 2, "#7a5a3e");
  r(146, 38, 24, 1, "#4a3727");
  caja(r, 148, 29, 8, 7);
  caja(r, 157, 31, 7, 5, "#8b6a44");
  caja(r, 150, 24, 6, 5);
  caja(r, 112, 36, 9, 8, "#4d6a7f");
  caja(r, 112, 30, 7, 6, "#a07a4f");
  // Compras: biblioteca, pizarra
  r(36, 103, 30, 7, "#4a4034");
  ["#51709e", "#b4524a", "#8a8f98", "#6c8f5a", "#c9a56a", "#51709e", "#b4524a"].forEach((c, i) => r(38 + i * 4, 104, 3, 5, c));
  r(4, 104, 22, 6, "#cfd2d9");
  r(5, 105, 20, 4, "#e9ecf2");
  r(7, 106, 8, 1, "#51709e");
  r(7, 108, 12, 1, "#7a8090");
  planta(r, 58, 69);
  // Producción: inyectora y pizarra
  r(110, 98, 30, 12, "#585d66");
  r(110, 98, 30, 2, "#7a808c");
  r(112, 101, 14, 6, "#3c4048");
  r(128, 101, 10, 6, "#8b5cf6");
  r(114, 109, 26, 1, SOMBRA);
  r(146, 104, 26, 6, "#cfd2d9");
  r(147, 105, 24, 4, "#f1f2f6");
  r(149, 106, 10, 1, "#8b5cf6");
  r(149, 108, 16, 1, "#9aa0ae");
  caja(r, 160, 68, 8, 7, "#a07a4f");
  caja(r, 168, 70, 6, 5, "#8b6a44");
  // Sala de reuniones
  r(76, 14, 24, 16, "#6b5238");
  r(76, 14, 24, 1, "#8a6a4a");
  r(77, 30, 22, 1, SOMBRA);
  [[78, 10], [86, 10], [94, 10], [78, 32], [86, 32], [94, 32]].forEach(([x, y]) => r(x, y, 6, 4, "#2a2a33"));
  r(78, 4, 20, 3, "#f1f2f6");
  r(80, 5, 8, 1, "#8b5cf6");
  planta(r, 98, 36);
  // Cocina
  r(70, 102, 36, 8, "#5b4a38");
  r(70, 102, 36, 2, "#8a7458");
  r(74, 98, 8, 5, "#2b2b34");
  r(75, 99, 6, 2, "#ff5a00");
  r(86, 98, 6, 5, "#e8e4da");
  r(96, 104, 8, 4, "#9ca3af");
  r(94, 70, 10, 10, "#6b5238");
  r(95, 71, 8, 8, "#8a6a4a");
  planta(r, 70, 70);
  // pasillo
  planta(r, 4, 54);
  planta(r, 166, 54);

  // paredes con puertas
  const tramos = (y, h, puertas) => {
    let x = 0;
    puertas.forEach(([a, b]) => {
      pared(r, x, y, a - x, h);
      x = b;
    });
    pared(r, x, y, W - x, h);
  };
  tramos(46, 2, [[49, 59], [83, 93], [117, 127]]);
  tramos(64, 2, [[49, 59], [83, 93], [117, 127]]);
  [0, 66].forEach((y) => {
    pared(r, 67, y === 0 ? 0 : 66, 2, 46);
    pared(r, 107, y === 0 ? 0 : 66, 2, 46);
  });
  // perímetro con ventanas
  pared(r, 0, 0, W, 2);
  pared(r, 0, 110, W, 2);
  pared(r, 0, 0, 2, H);
  pared(r, 174, 0, 2, H);
  [[8, 24], [112, 130], [140, 160], [72, 100]].forEach(([a, b]) => r(a, 0, b - a, 2, CIELO[f]));
  [[8, 24], [40, 58], [112, 130], [144, 160], [74, 100]].forEach(([a, b]) => r(a, 110, b - a, 2, CIELO[f]));
  [[10, 36], [74, 88]].forEach(([a, b]) => r(0, a, 2, b - a, CIELO[f]));
  [[10, 36], [74, 88]].forEach(([a, b]) => r(174, a, 2, b - a, CIELO[f]));
  // marcos de las puertas
  [49, 59, 83, 93, 117, 127].forEach((x) => {
    r(x - 1, 46, 1, 2, "#8a6a4a");
    r(x - 1, 64, 1, 2, "#8a6a4a");
  });
  void ids;
}

const Fondo = memo(function Fondo({ ids, f }) {
  const l = useMemo(() => {
    const { l, r } = lienzo();
    fondo(r, ids, f);
    return l;
  }, [ids, f]);
  return l.map((q, i) => <rect key={i} x={q.x} y={q.y} width={q.w} height={q.h} fill={q.c} />);
});

// ---------- muebles que van por delante de las personas ----------
function Escritorio({ id, activo, ahora }) {
  const g = geometria(id);
  const d = g.escritorio;
  const cx = d.x + Math.floor(d.w / 2);
  const parpadeo = Math.floor(ahora / 600) % 3;
  return (
    <g>
      <rect x={d.x} y={d.y} width={d.w} height={d.h} fill="#8a6a4a" />
      <rect x={d.x} y={d.y} width={d.w} height="1" fill="#a98a63" />
      <rect x={d.x} y={d.y + d.h} width={d.w} height="1" fill="#5a4330" />
      <rect x={d.x} y={d.y + d.h + 1} width={d.w} height="1" fill={SOMBRA} />
      <rect x={cx - 3} y={d.y + 1} width="6" height="2" fill="#d7d9e2" />
      <rect x={cx - 4} y={d.y + 4} width="8" height="4" fill="#1c1c24" />
      <rect x={cx - 3} y={d.y + 7} width="6" height="1" fill={activo ? (parpadeo === 1 ? "#5d8fbf" : "#7fb4e6") : "#2e3a4a"} />
      <rect x={d.x + 2} y={d.y + 2} width="3" height="3" fill="#ececf2" />
      <rect x={d.x + d.w - 7} y={d.y + 2} width="5" height="4" fill="#e8e4da" />
      <rect x={d.x + d.w - 6} y={d.y + 3} width="3" height="1" fill="#b9b3a3" />
    </g>
  );
}

function Silla({ x, y }) {
  return (
    <g>
      <rect x={x - 5} y={y - 8} width="10" height="7" fill="#2a2a33" />
      <rect x={x - 5} y={y - 8} width="10" height="1" fill="#3a3a46" />
    </g>
  );
}

const Persona = memo(function Persona({ id, e }) {
  const sentado = e.sentado && !e.camina;
  const rs = rectasMini(id, e.dir, e.camina ? e.paso : 0);
  return (
    <g transform={`translate(${e.x - 5} ${e.y - 15})`}>
      {!sentado && <rect x="1" y="15" width="8" height="1" fill="rgba(0,0,0,0.4)" />}
      {rs.map((q) => <rect key={`${q.x},${q.y}`} x={q.x} y={q.y} width={q.w} height="1" fill={q.c} />)}
      {e.fase === "cafe" && <rect x={e.dir === "left" ? 0 : 8} y="9" width="2" height="2" fill="#ececf2" />}
    </g>
  );
});

// ---------- charla de pasillo: qué se dicen (ambientación, no son datos reales) ----------
const DICHOS = {
  "rrhh>stock": "¿Cuánta gente necesitás en el depósito?",
  "rrhh>compras": "Te paso los feriados que vienen",
  "rrhh>produccion": "¿Quién cubre el turno noche?",
  "stock>rrhh": "¿Quién está hoy en el depósito?",
  "stock>compras": "Se me acaba una materia prima",
  "stock>produccion": "Te aviso qué semielaborados faltan",
  "compras>rrhh": "¿Tenés el calendario de feriados?",
  "compras>stock": "¿Qué me falta pedir?",
  "compras>produccion": "¿Para cuándo necesitás el material?",
  "produccion>rrhh": "¿Quién ficha hoy en planta?",
  "produccion>stock": "¿Alcanza el material para esta semana?",
  "produccion>compras": "¿Cuándo llega lo que pedimos?",
};

function Globo({ e, texto, sub }) {
  const x = Math.min(86, Math.max(14, (e.x / W) * 100));
  const y = ((e.y - 17) / H) * 100;
  return (
    <div className="absolute pointer-events-none -translate-x-1/2 -translate-y-full z-10" style={{ left: `${x}%`, top: `${y}%` }}>
      <span className={`block max-w-[190px] rounded-md px-2 py-[3px] text-[10.5px] sm:text-[11.5px] font-semibold leading-tight shadow-lg ${sub ? "bg-[#26262d] text-zinc-200 border border-white/[0.12]" : "bg-[#f1f0f4] text-[#1b1b21]"}`}>{texto}</span>
    </div>
  );
}

/** Durante la reunión habla uno por vez: su globo trae lo más importante de su área. */
function ReunionEnCurso({ esc, reunion, s }) {
  const sentados = Object.entries(esc).filter(([, e]) => e.fase === "reunion").map(([id]) => id);
  if (!sentados.length) return null;
  const turno = Math.floor(Math.max(0, s - 20) / 9) % sentados.length;
  const id = sentados[turno];
  const sec = reunion?.secciones?.find((x) => x.agente === id);
  return (
    <>
      <div className="absolute left-1/2 -translate-x-1/2 top-[13%] pointer-events-none z-10">
        <span className="block rounded-md bg-black/60 px-2 py-0.5 text-[10.5px] sm:text-[11px] font-semibold text-zinc-200">Reunión de las 08:00 en curso</span>
      </div>
      {sec && <Globo e={esc[id]} texto={sec.resumen} />}
    </>
  );
}

function Mapa({ agentes, onElegir, modo, vivoId, abiertosVivo, reunion }) {
  const ahora = useReloj();
  useSlotEstado();
  const ids = equipoIds();
  const clave = ids.join(",");
  const ids2 = useMemo(() => clave.split(",").filter(Boolean), [clave]);
  const esc = escena(ahora, ids2);
  const hora = new Date(ahora).getHours();
  const f = franja(hora);
  const nombre = (id) => agentes.find((a) => a.id === id)?.nombre || id;
  const enReunion = segundosDeReunion(ahora);
  const lista = ids2.filter((id) => esc[id]).sort((a, b) => esc[a].y - esc[b].y);
  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-[#14141a] select-none">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" shapeRendering="crispEdges" role="img" aria-label="Departamento visto desde arriba">
        <Fondo ids={clave} f={f} />
        {ids2.map((id) => { const g = geometria(id); return <Silla key={id} x={g.silla.x} y={g.silla.y} />; })}
        {lista.map((id) => <Persona key={id} id={id} e={esc[id]} />)}
        {ids2.map((id) => <Escritorio key={id} id={id} activo={esc[id].sentado} ahora={ahora} />)}
        {ids2.some((id) => esc[id].fase === "cafe") && (
          <g>
            <rect x="77" y={Math.floor(ahora / 500) % 2 ? 94 : 95} width="1" height="2" fill="#ffffff66" />
            <rect x="79" y={Math.floor(ahora / 500) % 2 ? 95 : 94} width="1" height="2" fill="#ffffff44" />
          </g>
        )}
      </svg>
      {/* nombres de las salas */}
      {["rrhh", "stock", "compras", "produccion"].map((id) => {
        const g = geometria(id);
        const a = agentes.find((x) => x.id === id);
        if (!a) return null;
        return (
          <button key={id} onClick={() => onElegir(id)} className="group absolute rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60" style={{ left: `${(g.x / W) * 100}%`, top: `${(g.y / H) * 100}%`, width: `${(g.w / W) * 100}%`, height: `${(g.h / H) * 100}%` }} aria-label={`Hablar con ${a.nombre}`}>
            <span className="absolute inset-[3px] rounded-md ring-1 ring-transparent group-hover:ring-white/30 transition" />
            <span className={`absolute left-1.5 ${g.arriba ? "top-1.5" : "bottom-1.5"} rounded bg-black/55 px-1.5 py-[1px] text-[10px] sm:text-[11px] font-bold text-white/90 leading-tight`}>{a.nombre} · {a.puesto.split(" ")[0]}</span>
            <span className={`absolute right-1.5 ${g.arriba ? "top-1.5" : "bottom-1.5"} hidden group-hover:block rounded bg-white/90 px-1.5 py-[1px] text-[10px] font-bold text-black`}>Hablar →</span>
          </button>
        );
      })}
      <span className="absolute left-[40.5%] top-1.5 rounded bg-black/45 px-1.5 text-[10px] font-semibold text-zinc-300">Reunión</span>
      <span className="absolute left-[40.5%] bottom-1.5 rounded bg-black/45 px-1.5 text-[10px] font-semibold text-zinc-300">Cocina</span>
      {/* globos: solo para quien está yendo, charlando o recibiendo */}
      {lista.map((id) => {
        const e = esc[id];
        if (e.fase === "escritorio") return null;
        const est = estadoDe(id, nombre(id), { modo: id === vivoId ? modo : "idle", abiertos: id === vivoId ? abiertosVivo : 0, ahora });
        if (e.fase === "reunion") return null;
        if (e.fase === "visita") return <Globo key={id} e={e} texto={DICHOS[`${id}>${e.con}`] || est.texto} />;
        if (e.fase === "recibe") return <Globo key={id} e={e} texto={est.texto} sub />;
        return <Globo key={id} e={e} texto={est.texto} sub />;
      })}
      {enReunion != null && <ReunionEnCurso esc={esc} reunion={reunion} s={enReunion} />}
    </div>
  );
}

function Pendiente({ a, onClick }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2 text-[12.5px] text-zinc-400 hover:text-white">
      <Lock size={12} /> {a.nombre} · {a.puesto} · pronto
    </button>
  );
}

/** Vista principal del módulo: el departamento con todo el equipo a la vista. */
export default function Mundo({ agentes, onElegir, modo, abiertosVivo, vivoId, esAdmin }) {
  const [reunion, recargar] = useReunion();
  const total = agentes.reduce((a, x) => a + (x.id === vivoId && abiertosVivo != null ? abiertosVivo : x.abiertos || 0), 0);
  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-[#0b0b0d]">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
          <h1 className="text-[20px] font-bold text-white leading-tight">Oficina</h1>
          <p className="text-[13px] text-zinc-500 mt-0.5">{agentes.length} {agentes.length === 1 ? "agente trabajando" : "agentes trabajando"}{total > 0 ? ` · ${total} ${total === 1 ? "aviso abierto" : "avisos abiertos"} en total` : " · todo en orden"} · tocá una sala para hablar</p>
          </div>
          <AvisosCelular />
        </div>
        <div className="mb-4"><PreguntaOficina agentes={agentes} onElegir={onElegir} /></div>
        <Mapa agentes={agentes} onElegir={onElegir} modo={modo} vivoId={vivoId} abiertosVivo={abiertosVivo} reunion={reunion} />
        <div className="mt-4"><Reunion reunion={reunion} esAdmin={esAdmin} onRehacer={recargar} onElegir={onElegir} /></div>
        {PROXIMOS.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{PROXIMOS.map((a) => <Pendiente key={a.id} a={a} onClick={() => onElegir(a.id)} />)}</div>}
      </div>
    </div>
  );
}
