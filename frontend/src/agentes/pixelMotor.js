import { useSyncExternalStore } from "react";

// Motor de los personajes 8 bits: reloj compartido, sprites de 16×16 y parámetros de cada frame.

// ---------- reloj compartido: un solo temporizador mueve a todos los avatares ----------
const MS = 340;
let tick = 0;
let timer = null;
const oyentes = new Set();
const quieto = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
function suscribir(fn) {
  oyentes.add(fn);
  if (!timer && !quieto()) {
    timer = setInterval(() => {
      tick++;
      oyentes.forEach((f) => f());
    }, MS);
  }
  return () => {
    oyentes.delete(fn);
    if (!oyentes.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
export const useTick = () => useSyncExternalStore(suscribir, () => tick, () => 0);

// ---------- personajes ----------
export const PERSONAJES = {
  rrhh: { piel: "#e9bd9c", sombra: "#c9906f", pelo: "#4a2a1b", ropa: "#c8672f", ropa2: "#a04e20", pelos: "rodete", lentes: false, extra: null, rubor: "#e2a899" },
  stock: { piel: "#dba77f", sombra: "#b9805a", pelo: "#1e1e24", ropa: "#5d8a5c", ropa2: "#46704a", pelos: "cola", lentes: false, extra: "casco", rubor: "#c98f74" },
  compras: { piel: "#f1c9ac", sombra: "#d0a083", pelo: "#8d5a2b", ropa: "#51709e", ropa2: "#3d5782", pelos: "corto", lentes: true, extra: "auricular", rubor: "#e8b0a0" },
  ventas: { piel: "#4a4a54", sombra: "#3c3c45", pelo: "#33333b", ropa: "#3a3a44", ropa2: "#2d2d35", pelos: "corto", lentes: false, extra: null, rubor: "#4a4a54", apagado: true },
};

const OJO = "#1b1b21";
const BOCA = "#8a4a3c";
const BOCA_ABIERTA = "#4e1f1c";

function pintar(p, f) {
  const g = Array.from({ length: 16 }, () => Array(16).fill(null));
  const R = (x, y, w, h, c) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (j >= 0 && j < 16 && i >= 0 && i < 16) g[j][i] = c;
  };
  const dy = f.dy || 0;
  const H = (x, y, w, h, c) => R(x, y + dy, w, h, c);

  // pelo de atrás y cola
  if (p.pelos === "cola") H(13 + (f.cola || 0), 6, 2, 4, p.pelo);
  // torso
  R(3, 12, 10, 1, p.ropa);
  R(1, 13, 14, 3, p.ropa);
  R(1, 15, 14, 1, p.ropa2);
  R(7, 10, 2, 3, p.piel);
  R(7, 11, 2, 1, p.sombra);
  if (p.extra === "casco") {
    R(4, 13, 1, 3, "#d8d29a");
    R(11, 13, 1, 3, "#d8d29a");
    R(6, 12, 4, 1, p.piel);
  } else if (p.pelos === "corto" && !p.apagado) {
    R(6, 12, 4, 1, "#e8e9ef");
    R(7, 13, 2, 1, "#e8e9ef");
    R(5, 13, 1, 3, p.ropa2);
    R(10, 13, 1, 3, p.ropa2);
  } else {
    R(6, 12, 4, 1, p.piel);
    R(7, 13, 2, 1, p.piel);
  }

  // cabeza
  H(4, 3, 8, 8, p.piel);
  H(4, 10, 1, 1, null);
  H(11, 10, 1, 1, null);
  if (p.pelos === "corto") {
    H(3, 6, 1, 2, p.piel);
    H(12, 6, 1, 2, p.piel);
  }
  // pelo
  if (p.extra === "casco") {
    H(5, 0, 6, 1, "#e6bf48");
    H(4, 1, 8, 2, "#e6bf48");
    H(3, 3, 10, 1, "#d2a732");
    H(5, 1, 2, 1, "#f4de8c");
    H(3, 4, 1, 3, p.pelo);
    H(12, 4, 1, 3, p.pelo);
  } else {
    H(4, 2, 8, 2, p.pelo);
    H(3, 3, 1, p.pelos === "rodete" ? 5 : 3, p.pelo);
    H(12, 3, 1, p.pelos === "rodete" ? 5 : 3, p.pelo);
    if (p.pelos === "rodete") {
      H(6, 0, 4, 2, p.pelo);
      H(7, 0, 1, 1, "#6d4330");
    }
    if (p.pelos === "corto") H(4, 4, 3, 1, p.pelo);
    if (p.pelos === "cola") H(4, 4, 1, 1, p.pelo);
  }

  // cara
  const mx = f.mirada || 0;
  const oy = f.oy || 0;
  const ey = 6 + oy;
  const ojos = f.ojos || "abiertos";
  [6 + mx, 9 + mx].forEach((x) => {
    if (ojos === "abiertos") H(x, ey, 1, 2, OJO);
    else if (ojos === "medio") H(x, ey + 1, 1, 1, OJO);
    else {
      H(x, ey + 1, 1, 1, OJO);
    }
  });
  if (!p.lentes) H(8, 8, 1, 1, p.sombra);
  if (p.lentes) {
    const M = "#3d3d4a";
    H(5, 5, 6, 1, M);
    H(5, 6, 1, 2, M);
    H(7, 6, 2, 1, M);
    H(10, 6, 1, 2, M);
    // los ojos van sobre el marco
    [6 + mx, 9 + mx].forEach((x) => {
      if (x < 6 || x > 9) return;
      if (ojos === "abiertos") H(x, 6, 1, 2, OJO);
      else H(x, 7, 1, 1, OJO);
    });
    H(7, 7, 1, 1, p.piel);
    H(8, 7, 1, 1, p.piel);
  }
  const boca = f.boca || "neutra";
  if (boca === "neutra") H(7, 9, 2, 1, BOCA);
  else if (boca === "abierta") H(7, 9, 2, 2, BOCA_ABIERTA);
  else if (boca === "o") H(7, 9, 2, 1, BOCA_ABIERTA);
  else {
    H(6, 9, 1, 1, BOCA);
    H(9, 9, 1, 1, BOCA);
    H(7, 10, 2, 1, BOCA);
    H(5, 9, 1, 1, p.rubor);
    H(10, 9, 1, 1, p.rubor);
  }
  if (p.extra === "auricular") {
    const A = "#2b2b34";
    H(2, 5, 2, 4, A);
    H(3, 9, 1, 1, A);
    H(4, 10, 2, 1, A);
    H(4, 4, 1, 1, "#4a4a56");
  }
  return g;
}

/** Rectángulos horizontales por color: menos nodos SVG que un <rect> por píxel. */
function aRectas(g) {
  const out = [];
  g.forEach((fila, y) => {
    let x = 0;
    while (x < fila.length) {
      const c = fila[x];
      if (!c) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < fila.length && fila[x + w] === c) w++;
      out.push({ x, y, w, c });
      x += w;
    }
  });
  return out;
}

const cache = new Map();
export function rectas(id, f) {
  const k = `${id}|${f.ojos}|${f.mirada}|${f.oy}|${f.boca}|${f.dy}|${f.cola}`;
  let r = cache.get(k);
  if (!r) {
    r = aRectas(pintar(PERSONAJES[id] || PERSONAJES.rrhh, f));
    if (cache.size > 400) cache.clear();
    cache.set(k, r);
  }
  return r;
}

/** Parámetros del frame a partir del "modo" (qué hace) y el reloj. */
export function frameDe(modo, ojosBase, t, dormido = false) {
  const f = { ojos: "abiertos", mirada: 0, oy: 0, boca: "neutra", dy: Math.floor(t / 4) % 2, cola: Math.floor(t / 3) % 2 };
  if (dormido) return { ...f, ojos: "cerrados", dy: Math.floor(t / 6) % 2 };
  if (ojosBase === "scan") f.mirada = [-1, 0, 1, 0][t % 4];
  else if (ojosBase === "abajo") f.oy = 1;
  else if (ojosBase === "arriba") {
    f.oy = -1;
    f.mirada = Math.floor(t / 5) % 2 ? 1 : -1;
  } else if (ojosBase === "cafe") {
    f.ojos = "medio";
    f.boca = "sonrisa";
  } else if (ojosBase === "lado") f.mirada = Math.floor(t / 6) % 2 ? 1 : -1;
  if (modo === "hablando") f.boca = ["abierta", "neutra", "o", "abierta", "neutra", "neutra"][t % 6];
  else if (modo === "escuchando") {
    f.boca = "sonrisa";
    f.dy = Math.floor(t / 2) % 2;
  } else if (modo === "pensando") f.boca = "o";
  else if (modo === "idle" && ojosBase !== "cafe" && t % 17 === 0) f.boca = "sonrisa";
  if (f.ojos === "abiertos" && t % 11 === 0) f.ojos = "cerrados";
  return f;
}

