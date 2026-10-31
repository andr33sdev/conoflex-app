import { PERSONAJES } from "./pixelMotor";

// Personajes chiquitos (10×16) para el departamento visto desde arriba. Misma paleta que la cara de cada agente.
export const MW = 10;
export const MH = 16;
const NEGRO = "#1b1b21";
const PANTALON = "#2f3340";

function armar(p, dir, paso) {
  const g = Array.from({ length: MH }, () => Array(MW).fill(null));
  const R = (x, y, w, h, c) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (j >= 0 && j < MH && i >= 0 && i < MW) g[j][i] = c;
  };
  const lado = dir === "left" || dir === "right";
  const espejo = dir === "right";
  // En los perfiles se dibuja mirando a la izquierda y después se espeja.
  const X = (x, w) => (espejo ? MW - x - w : x);
  const Rx = (x, y, w, h, c) => R(lado ? X(x, w) : x, y, w, h, c);

  // piernas (se alternan al caminar)
  const a = paso % 2;
  if (lado) {
    Rx(3, 12, 2, a ? 3 : 4, PANTALON);
    Rx(5, 12, 2, a ? 4 : 3, PANTALON);
    Rx(3, a ? 15 : 16, 2, 1, NEGRO);
    Rx(5, a ? 16 : 15, 2, 1, NEGRO);
  } else {
    R(2, 12, 2, a ? 3 : 4, PANTALON);
    R(6, 12, 2, a ? 4 : 3, PANTALON);
    R(2, a ? 15 : 16, 2, 1, NEGRO);
    R(6, a ? 16 : 15, 2, 1, NEGRO);
  }
  // cuerpo
  if (lado) {
    Rx(2, 7, 6, 5, p.ropa);
    Rx(2, 7, 6, 1, p.ropaLuz);
    Rx(2, 11, 6, 1, p.ropa2);
    Rx(3, 8 + (a ? 1 : 0), 2, 3, p.ropa2); // brazo
    Rx(3, 11 + (a ? 1 : 0), 2, 1, p.piel);
  } else {
    R(1, 7, 8, 5, p.ropa);
    R(1, 7, 8, 1, p.ropaLuz);
    R(1, 11, 8, 1, p.ropa2);
    R(0, 8, 1, 3, p.ropa2);
    R(9, 8, 1, 3, p.ropa2);
    R(0, 11 + (a ? 0 : 1), 1, 1, p.piel);
    R(9, 11 + (a ? 1 : 0), 1, 1, p.piel);
    if (dir === "down") {
      if (p.extra === "casco") {
        R(2, 8, 1, 4, "#d8d29a");
        R(7, 8, 1, 4, "#d8d29a");
      } else if (p.extra === "chaqueta") R(4, 8, 2, 4, "#e8e9ef");
      else if (p.pelos === "corto") R(4, 7, 2, 3, "#e8e9ef");
      else R(4, 7, 2, 1, p.piel);
    }
  }
  // cabeza
  if (lado) {
    Rx(2, 1, 6, 6, p.piel);
    Rx(2, 6, 6, 1, p.sombra);
    Rx(5, 4, 1, 1, NEGRO); // ojo
    Rx(5, 3, 1, 1, p.pestanas ? p.pelo : p.sombra);
    Rx(2, 5, 1, 1, p.rubor);
    // pelo de atrás
    Rx(4, 0, 4, 4, p.pelo);
    Rx(6, 0, 2, 7, p.pelo);
    Rx(3, 0, 2, 2, p.pelo);
    Rx(5, 0, 2, 1, p.peloLuz);
  } else {
    R(2, 1, 6, 6, p.piel);
    R(2, 6, 6, 1, p.sombra);
    if (dir === "down") {
      R(3, 4, 1, 1, NEGRO);
      R(6, 4, 1, 1, NEGRO);
      if (p.pestanas) {
        R(3, 3, 1, 1, p.pelo);
        R(6, 3, 1, 1, p.pelo);
      }
      if (p.lentes) R(2, 3, 6, 1, "#3d3d4a");
      R(4, 6, 2, 1, p.labio);
      R(2, 5, 1, 1, p.rubor);
      R(7, 5, 1, 1, p.rubor);
    }
  }
  // pelo y accesorios, según el personaje
  const pelo = (x, y, w, h, c = p.pelo) => (lado ? Rx(x, y, w, h, c) : R(x, y, w, h, c));
  if (p.extra === "casco") {
    R(1, 0, 8, 1, "#e6bf48");
    R(1, 1, 8, 2, "#e6bf48");
    R(0, 3, 10, 1, "#c29a2c");
    R(3, 0, 3, 1, "#f4de8c");
    if (dir === "down") {
      R(1, 4, 1, 4, p.pelo);
      R(8, 4, 1, 4, p.pelo);
    } else if (dir === "up") {
      R(2, 3, 6, 4, p.pelo);
      R(4 + (a ? 1 : 0), 7, 2, 5, p.pelo); // la cola
    } else {
      Rx(5, 3, 3, 5, p.pelo);
      Rx(7, 7 + (a ? 1 : 0), 2, 4, p.pelo);
    }
  } else if (p.pelos === "rizos") {
    R(1, 0, 8, 4, p.pelo);
    R(0, 1, 10, 4, p.pelo);
    if (dir === "up") R(1, 1, 8, 7, p.pelo);
    if (dir === "down") {
      R(0, 4, 2, 4, p.pelo);
      R(8, 4, 2, 4, p.pelo);
    }
    if (lado) {
      Rx(5, 0, 4, 8, p.pelo);
      Rx(2, 0, 4, 3, p.pelo);
    }
    R(3, 0, 1, 1, p.peloLuz);
    R(7, 1, 1, 1, p.peloLuz);
    if (dir === "down") R(2, 1, 6, 1, p.pelo);
  } else if (p.pelos === "rodete") {
    if (dir !== "left" && dir !== "right") {
      R(2, 1, 6, 2, p.pelo);
      R(1, 2, 8, 2, p.pelo);
      R(3, 0, 4, 1, p.pelo);
      if (dir === "up") R(2, 1, 6, 6, p.pelo);
      else {
        R(1, 3, 1, 4, p.pelo);
        R(8, 3, 1, 4, p.pelo);
      }
    } else {
      Rx(2, 1, 6, 2, p.pelo);
      Rx(6, 2, 2, 5, p.pelo);
      Rx(4, 0, 3, 1, p.pelo);
    }
  } else {
    // corto (Vera)
    if (lado) {
      Rx(2, 1, 6, 2, p.pelo);
      Rx(5, 3, 3, 3, p.pelo);
    } else {
      R(2, 1, 6, 2, p.pelo);
      R(1, 2, 8, 1, p.pelo);
      if (dir === "up") R(2, 1, 6, 5, p.pelo);
      else {
        R(1, 3, 1, 2, p.pelo);
        R(8, 3, 1, 2, p.pelo);
      }
    }
    if (p.extra === "auricular" && dir !== "up") pelo(lado ? 4 : 1, 4, 1, 2, "#2b2b34");
  }
  if (p.aros && dir === "down") {
    R(1, 6, 1, 1, p.aros);
    R(8, 6, 1, 1, p.aros);
  }
  return g;
}

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
/** Rectángulos del personaje mirando hacia `dir` (down, up, left, right); `paso` alterna las piernas al caminar. */
export function rectasMini(id, dir = "down", paso = 0) {
  const k = `${id}|${dir}|${paso % 2}`;
  let r = cache.get(k);
  if (!r) {
    r = aRectas(armar(PERSONAJES[id] || PERSONAJES.rrhh, dir, paso));
    cache.set(k, r);
  }
  return r;
}
