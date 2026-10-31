import { memo } from "react";
import { frameDe, rectas, useTick } from "./pixelMotor";

// ---------- íconos de actividad de 7×7 ----------
const ICONOS = {
  lupa: [[".###...", "#...#..", "#...#..", "#...#..", ".####..", ".....#.", "......#"]],
  doc: [["####...", "#...#..", "#.###..", "#...#..", "#.###..", "#...#..", "#####.."], ["####...", "#...#..", "#.#.#..", "#...#..", "#.###..", "#...#..", "#####.."]],
  calendario: [[".#...#.", "#######", "#.....#", "#.#.#.#", "#.....#", "#.#.#.#", "#######"], [".#...#.", "#######", "#.....#", "#.#.#.#", "#.....#", "#.#.###", "#######"]],
  calculadora: [["#######", "#.###.#", "#.....#", "#.#.#.#", "#.....#", "#.#.#.#", "#######"], ["#######", "#.###.#", "#.....#", "#.#.#.#", "#.....#", "#.#.#.#", "#######"]],
  taza: [["..#.#..", ".#.#...", ".......", "#####..", "#...##.", "#...#.#", ".###.#."], [".#.#...", "..#.#..", ".......", "#####..", "#...##.", "#...#.#", ".###.#."]],
  caja: [[".#####.", "##...##", "#######", "#..#..#", "#..#..#", "#..#..#", "#######"], [".......", ".#####.", "##...##", "#######", "#..#..#", "#..#..#", "#######"]],
  camion: [["#####..", "#...##.", "#...###", "#######", ".#...#.", "..#.#..", "......."], ["#####..", "#...##.", "#...###", "#######", "#.#.#.#", ".#...#.", "......."]],
  telefono: [["##.....", "###....", ".##....", "..##...", "...##.#", "....###", ".....##"], ["##...#.", "###.#..", ".##....", "..##...", "...##..", "....###", ".....##"]],
  reloj: [[".#####.", "#..#..#", "#..#..#", "#..##.#", "#.....#", "#.....#", ".#####."], [".#####.", "#..#..#", "#..#..#", "#.##..#", "#.....#", "#.....#", ".#####."]],
  tilde: [[".....#.", "....##.", "#..##..", "##.#...", ".##....", "..#....", "......."]],
  puntos: [[".......", ".......", "#......", ".......", ".......", ".......", "......."], [".......", ".......", "#.#....", ".......", ".......", ".......", "......."], [".......", ".......", "#.#.#..", ".......", ".......", ".......", "......."]],
  onda: [["...#...", "..##.#.", "###..#.", "###..#.", "..##.#.", "...#...", "......."], ["...#...", "..##...", "###.#..", "###.#..", "..##...", "...#...", "......."]],
  mic: [["..###..", "..###..", "..###..", "#.###.#", "#.###.#", ".#####.", "...#..."], ["..###..", "..###..", "..###..", "#.###.#", "#.###.#", ".#####.", "..###.."]],
  engranaje: [["..#.#..", ".#####.", "##...##", ".#...#.", "##...##", ".#####.", "..#.#.."], ["#.....#", ".#####.", ".#...#.", ".#...#.", ".#...#.", ".#####.", "#.....#"]],
  lapiz: [[".....##", "....###", "...###.", "..###..", ".###...", "##.#...", "#......"]],
  carpeta: [["###....", "#######", "#.....#", "#.....#", "#.....#", "#.....#", "#######"]],
  lista: [["#.####.", ".......", "#.####.", ".......", "#.####.", ".......", "#.####."], ["#.####.", ".......", "#.###..", ".......", "#.####.", ".......", "#.##..."]],
  grafico: [[".....#.", "..#..#.", "..#.##.", "#.#.##.", "#.#.##.", "#######", "......."], ["....##.", "..#.##.", "..#.##.", "#.#.##.", "#.#.##.", "#######", "......."]],
};

export const Icono8 = memo(function Icono8({ nombre, t = 0, tam = 14, className = "" }) {
  const frames = ICONOS[nombre] || ICONOS.puntos;
  const filas = frames[Math.floor(t / 2) % frames.length];
  const bob = frames.length === 1 && Math.floor(t / 3) % 2 === 1;
  const rs = [];
  filas.forEach((fila, y) => {
    let x = 0;
    while (x < fila.length) {
      if (fila[x] !== "#") {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < fila.length && fila[x + w] === "#") w++;
      rs.push(<rect key={`${x},${y}`} x={x} y={bob ? y - 1 : y} width={w} height="1" />);
      x += w;
    }
  });
  return (
    <svg width={tam} height={tam} viewBox="0 -1 7 8" shapeRendering="crispEdges" fill="currentColor" className={className} aria-hidden="true">
      {rs}
    </svg>
  );
});

/**
 * Avatar pixel art con una burbuja chiquita que muestra qué está haciendo.
 * tam debe ser múltiplo de 16 para que cada "píxel" caiga en un número entero de píxeles de pantalla.
 */
export const Avatar8 = memo(function Avatar8({ id, tam = 64, modo = "idle", ojos = "frente", icono, burbuja = true, dormido = false, className = "" }) {
  const t = useTick();
  const f = frameDe(modo, ojos, t, dormido);
  const rs = rectas(id, f);
  const mostrar = burbuja && icono && !dormido;
  const bt = Math.max(18, Math.round(tam * 0.34));
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: tam, height: tam }}>
      <span className="absolute inset-0 rounded-[10px] bg-[#1a1a20] border border-white/[0.08] overflow-hidden">
        <svg viewBox="0 0 16 16" width="100%" height="100%" shapeRendering="crispEdges" style={{ imageRendering: "pixelated" }} aria-hidden="true">
          {rs.map((r) => (
            <rect key={`${r.x},${r.y}`} x={r.x} y={r.y} width={r.w} height="1" fill={r.c} />
          ))}
        </svg>
      </span>
      {mostrar && (
        <span className="absolute -bottom-1 -right-1 grid place-items-center rounded-md bg-[#0b0b0d] border border-white/[0.12] text-zinc-200" style={{ width: bt, height: bt }}>
          <Icono8 nombre={icono} t={t} tam={Math.round(bt * 0.62 / 7) * 7 || 7} />
        </span>
      )}
    </span>
  );
});
