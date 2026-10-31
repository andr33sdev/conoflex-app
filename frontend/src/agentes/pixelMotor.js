import { useSyncExternalStore } from "react";

// Motor de los personajes 8 bits: reloj compartido, sprites de 24×24 y parámetros de cada frame.

// ---------- reloj compartido: un solo temporizador mueve a todos los avatares ----------
const MS = 400;
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
export const GRILLA = 24;

// ---------- personajes ----------
export const PERSONAJES = {
  rrhh: { piel: "#ecc2a2", sombra: "#c99573", luz: "#f6d8bf", pelo: "#4a2a1b", peloLuz: "#6d4330", iris: "#5a3a28", ropa: "#c8672f", ropa2: "#a04e20", ropaLuz: "#dc8049", pelos: "rodete", lentes: false, extra: null, rubor: "#e2a899", labio: "#b8584c" },
  stock: { piel: "#dba77f", sombra: "#b9805a", luz: "#e8bd99", pelo: "#1e1e24", peloLuz: "#3a3a44", iris: "#2e2a28", ropa: "#5d8a5c", ropa2: "#46704a", ropaLuz: "#78a577", pelos: "cola", lentes: false, extra: "casco", rubor: "#c98f74", labio: "#a45a48" },
  compras: { piel: "#f1c9ac", sombra: "#d0a083", luz: "#f8dcc6", pelo: "#8d5a2b", peloLuz: "#ad7840", iris: "#3d5a7a", ropa: "#51709e", ropa2: "#3d5782", ropaLuz: "#6a8bb9", pelos: "corto", lentes: true, extra: "auricular", rubor: "#e8b0a0", labio: "#c0615a" },
  ventas: { piel: "#4a4a54", sombra: "#3c3c45", luz: "#555560", pelo: "#33333b", peloLuz: "#3f3f48", iris: "#2a2a30", ropa: "#3a3a44", ropa2: "#2d2d35", ropaLuz: "#464651", pelos: "corto", lentes: false, extra: null, rubor: "#4a4a54", labio: "#3c3c45", apagado: true },
};

const NEGRO = "#1b1b21";
const BLANCO = "#f1f0f4";
const BOCA_ABIERTA = "#4e1f1c";

function pintar(p, f) {
  const N = GRILLA;
  const g = Array.from({ length: N }, () => Array(N).fill(null));
  const R = (x, y, w, h, c) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (j >= 0 && j < N && i >= 0 && i < N) g[j][i] = c;
  };
  const dy = f.dy || 0;
  const dx = f.dx || 0;
  const H = (x, y, w, h, c) => R(x + dx, y + dy, w, h, c);

  // pelo de atrás
  if (p.pelos === "cola") {
    H(19 + (f.cola || 0), 9, 3, 8, p.pelo);
    H(20 + (f.cola || 0), 10, 1, 5, p.peloLuz);
  }
  if (p.pelos === "rodete") H(5, 6, 14, 9, p.pelo);

  // torso
  R(5, 19, 14, 1, p.ropa);
  R(3, 20, 18, 1, p.ropa);
  R(2, 21, 20, 3, p.ropa);
  R(2, 23, 20, 1, p.ropa2);
  R(2, 21, 2, 3, p.ropa2);
  R(20, 21, 2, 3, p.ropa2);
  R(5, 19, 3, 1, p.ropaLuz);
  // cuello
  R(10, 16, 4, 4, p.piel);
  R(10, 17, 4, 1, p.sombra);
  if (p.extra === "casco") {
    // chaleco con bandas reflectivas sobre remera clara
    R(9, 19, 6, 1, "#e8e8ee");
    R(10, 20, 4, 1, p.piel);
    R(6, 20, 1, 4, "#d8d29a");
    R(17, 20, 1, 4, "#d8d29a");
    R(11, 21, 2, 3, p.ropa2);
  } else if (p.pelos === "corto" && !p.apagado) {
    // blazer con camisa blanca y solapas
    R(9, 19, 6, 1, "#e8e9ef");
    R(10, 20, 4, 2, "#e8e9ef");
    R(11, 22, 2, 1, "#e8e9ef");
    R(8, 20, 2, 4, p.ropa2);
    R(14, 20, 2, 4, p.ropa2);
    R(16, 22, 2, 1, "#e8e9ef");
  } else {
    // escote en V y un collar finito
    R(9, 19, 6, 1, p.piel);
    R(10, 20, 4, 1, p.piel);
    R(11, 21, 2, 1, p.piel);
    R(11, 22, 2, 1, "#e0b43a");
  }

  // cabeza
  H(6, 5, 12, 12, p.piel);
  H(7, 16, 10, 1, p.piel);
  H(6, 16, 1, 1, null);
  H(17, 16, 1, 1, null);
  H(6, 5, 1, 1, null);
  H(17, 5, 1, 1, null);
  H(16, 8, 2, 8, p.sombra); // sombra del lado derecho
  H(7, 16, 10, 1, p.sombra);
  H(8, 6, 4, 1, p.luz); // luz en la frente
  H(5, 10, 1, 3, p.piel);
  H(18, 10, 1, 3, p.piel);
  H(5, 11, 1, 1, p.sombra);
  H(18, 11, 1, 1, p.sombra);

  // pelo
  if (p.extra === "casco") {
    H(9, 1, 6, 1, "#e6bf48");
    H(7, 2, 10, 3, "#e6bf48");
    H(6, 5, 12, 1, "#d2a732");
    H(4, 6, 16, 1, "#c29a2c");
    H(9, 2, 3, 1, "#f4de8c");
    H(11, 1, 2, 1, "#f4de8c");
    H(5, 7, 2, 5, p.pelo);
    H(17, 7, 2, 5, p.pelo);
    H(5, 8, 1, 2, p.peloLuz);
  } else if (p.pelos === "rodete") {
    H(10, 0, 5, 4, p.pelo);
    H(11, 0, 2, 1, p.peloLuz);
    H(9, 3, 7, 1, p.pelo);
    H(6, 3, 12, 3, p.pelo);
    H(5, 5, 14, 2, p.pelo);
    H(5, 7, 3, 7, p.pelo);
    H(17, 7, 2, 7, p.pelo);
    H(8, 7, 4, 1, p.pelo);
    H(7, 4, 2, 1, p.peloLuz);
    H(13, 4, 3, 1, p.peloLuz);
    H(5, 8, 1, 3, p.peloLuz);
  } else {
    // corto con raya al costado
    H(6, 3, 12, 3, p.pelo);
    H(5, 5, 14, 2, p.pelo);
    H(5, 7, 2, 4, p.pelo);
    H(17, 7, 2, 4, p.pelo);
    H(7, 7, 6, 1, p.pelo);
    H(7, 8, 3, 1, p.pelo);
    H(8, 3, 3, 1, p.peloLuz);
    H(14, 4, 3, 1, p.peloLuz);
    H(6, 4, 1, 1, p.peloLuz);
  }

  // cejas
  const ceja = p.pelo;
  const alz = f.ceja === "alta" ? -1 : 0;
  H(8, 8 + alz, 3, 1, ceja);
  H(13, 8 + alz - (f.ceja === "alta" ? 0 : 0), 3, 1, ceja);

  // ojos: blanco 3×2 con iris de 1×2 (o cerrado)
  const mx = Math.max(-1, Math.min(1, f.mirada || 0));
  const oy = f.oy || 0;
  const ojos = f.ojos || "abiertos";
  [0, 1].forEach((idx) => {
    const x = idx === 0 ? 8 : 13;
    if (ojos === "abiertos") {
      H(x, 10, 3, 2, BLANCO);
      const px = x + 1 + mx;
      if (oy === 0) H(px, 10, 1, 2, p.iris);
      else H(px, oy < 0 ? 10 : 11, 1, 1, p.iris);
      H(px, oy > 0 ? 11 : 10, 1, 1, NEGRO);
    } else if (ojos === "medio") {
      H(x, 11, 3, 1, BLANCO);
      H(x + 1 + mx, 11, 1, 1, NEGRO);
      H(x, 10, 3, 1, p.sombra);
    } else {
      H(x, 11, 3, 1, NEGRO);
    }
    H(x, 9, 3, 1, p.sombra); // párpado
  });
  if (p.lentes) {
    const M = "#3d3d4a";
    H(7, 9, 5, 1, M);
    H(7, 12, 5, 1, M);
    H(7, 10, 1, 2, M);
    H(11, 10, 1, 2, M);
    H(12, 9, 5, 1, M);
    H(12, 12, 5, 1, M);
    H(12, 10, 1, 2, M);
    H(16, 10, 1, 2, M);
    H(11, 10, 2, 1, M);
    H(8, 12, 3, 1, "#8a97b5");
    H(13, 12, 3, 1, "#8a97b5");
  }
  // nariz
  H(11, 12, 2, 1, p.sombra);
  H(11, 13, 2, 1, p.sombra);
  H(12, 12, 1, 1, p.luz);
  // boca
  const boca = f.boca || "neutra";
  if (boca === "neutra") {
    H(10, 15, 4, 1, p.labio);
    H(11, 16, 2, 1, p.sombra);
  } else if (boca === "abierta") {
    H(10, 15, 4, 2, BOCA_ABIERTA);
    H(10, 15, 4, 1, BLANCO);
  } else if (boca === "o") {
    H(11, 15, 2, 2, BOCA_ABIERTA);
  } else {
    H(9, 14, 1, 1, p.labio);
    H(14, 14, 1, 1, p.labio);
    H(10, 15, 4, 1, p.labio);
    H(8, 13, 2, 1, p.rubor);
    H(14, 13, 2, 1, p.rubor);
  }
  if (p.extra === "auricular") {
    const A = "#2b2b34";
    H(3, 9, 3, 5, A);
    H(4, 8, 1, 1, "#4a4a56");
    H(5, 14, 1, 2, A);
    H(6, 16, 3, 1, A);
    H(8, 16, 1, 1, "#e8e9ef");
  }

  // manos y objetos (se dibujan encima del torso)
  const m = f.mano;
  const a = f.manoF ? 1 : 0;
  if (m === "tecleo") {
    R(5, 21 - a, 4, 3, p.piel);
    R(15, 20 + a, 4, 4, p.piel);
    R(5, 21 - a, 4, 1, p.luz);
  } else if (m === "saludo" || m === "gesto") {
    R(20, 15, 3, 8, p.ropa2);
    R(20, 11 + a - (m === "saludo" ? 1 : 0), 3, 4, p.piel);
    R(20, 11 + a - (m === "saludo" ? 1 : 0), 3, 1, p.luz);
  } else if (m === "taza") {
    R(14, 19, 6, 5, "#ececf2");
    R(14, 19, 6, 1, "#b9b9c6");
    R(20, 20, 2, 3, "#ececf2");
    R(13, 20, 1, 3, p.piel);
    R(16, a ? 16 : 17, 1, 1, "#9a9aa8");
    R(18, a ? 17 : 16, 1, 1, "#9a9aa8");
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
  const k = `${id}|${f.ojos}|${f.mirada}|${f.oy}|${f.boca}|${f.dy}|${f.cola}|${f.dx}|${f.mano}|${f.manoF}|${f.ceja}`;
  let r = cache.get(k);
  if (!r) {
    r = aRectas(pintar(PERSONAJES[id] || PERSONAJES.rrhh, f));
    if (cache.size > 600) cache.clear();
    cache.set(k, r);
  }
  return r;
}

/**
 * Parámetros del frame a partir del "modo" (qué hace) y el reloj.
 * Los movimientos son chicos y lentos a propósito: respiración cada ~3 s, parpadeo ocasional, manos que apenas se mueven.
 */
export function frameDe(modo, ojosBase, t, dormido = false) {
  const f = { ojos: "abiertos", mirada: 0, oy: 0, boca: "neutra", dy: Math.floor(t / 7) % 2, cola: Math.floor(t / 9) % 2, dx: 0, mano: null, manoF: Math.floor(t / 2) % 2, ceja: "normal" };
  if (dormido) return { ...f, ojos: "cerrados", dy: Math.floor(t / 10) % 2, manoF: 0 };
  if (ojosBase === "scan") f.mirada = [-1, -1, 0, 0, 1, 1, 0, 0][t % 8];
  else if (ojosBase === "abajo") {
    f.oy = 1;
    f.mano = "tecleo";
    f.manoF = Math.floor(t / 2) % 2;
  } else if (ojosBase === "arriba") {
    f.oy = -1;
    f.mirada = Math.floor(t / 8) % 2 ? 1 : -1;
  } else if (ojosBase === "cafe") {
    f.ojos = "medio";
    f.boca = "sonrisa";
    f.mano = "taza";
    f.manoF = Math.floor(t / 3) % 2;
  } else if (ojosBase === "lado") f.mirada = Math.floor(t / 10) % 2 ? 1 : -1;
  if (modo === "hablando") {
    f.boca = ["abierta", "neutra", "o", "neutra"][t % 4];
    if (Math.floor(t / 8) % 3 === 2) {
      f.mano = "gesto";
      f.manoF = Math.floor(t / 2) % 2;
    }
  } else if (modo === "escuchando") {
    f.boca = "neutra";
    f.ceja = Math.floor(t / 9) % 3 === 2 ? "alta" : "normal";
  } else if (modo === "pensando") {
    f.boca = "neutra";
    f.ceja = "alta";
  } else if (modo === "idle" && ojosBase !== "cafe") {
    if (t % 31 < 3) f.boca = "sonrisa";
    if (t % 97 < 5) {
      f.mano = "saludo";
      f.manoF = Math.floor(t / 2) % 2;
      f.boca = "sonrisa";
    }
  }
  if (f.ojos === "abiertos" && t % 13 === 0) f.ojos = "cerrados";
  return f;
}
