// El departamento visto desde arriba: dónde está cada sala y quién se mueve adónde en cada momento.
// Todo sale del reloj de pared (no hay estado ni servidor): cada 40 s se decide, con una cuenta fija, quién se levanta,
// a quién va a ver o si va a tomar un café. Así el mapa, el menú y la cabecera de cada agente cuentan lo mismo.

export const W = 244;
export const H = 112;
export const PASILLO_Y = 62; // por dónde caminan (pies del personaje)
export const ORDEN = ["rrhh", "stock", "compras", "produccion", "ventas", "seguimiento"];

const SALAS = {
  rrhh: { x: 0, y: 0, izq: true, arriba: true },
  stock: { x: 108, y: 0, izq: false, arriba: true },
  compras: { x: 0, y: 66, izq: true, arriba: false },
  produccion: { x: 108, y: 66, izq: false, arriba: false },
  ventas: { x: 176, y: 0, izq: false, arriba: true },
  seguimiento: { x: 176, y: 66, izq: false, arriba: false },
};
export const SALA_W = 68;
export const SALA_H = 46;
export const CAFE = { x: 68, y: 66, w: 40, h: 46 };
export const REUNION = { x: 68, y: 0, w: 40, h: 46 };

/** Geometría de la sala de un agente: silla, escritorio, puerta y dónde se para una visita. */
export function geometria(id) {
  const s = SALAS[id];
  if (!s) return null;
  const sillaX = s.x + (s.izq ? 22 : 46);
  const sillaY = s.y + 27;
  return {
    ...s,
    w: SALA_W,
    h: SALA_H,
    silla: { x: sillaX, y: sillaY },
    escritorio: { x: s.x + (s.izq ? 10 : 34), y: s.y + 24, w: 24, h: 9 },
    puertaX: s.x + (s.izq ? 54 : 14),
    pasoY: sillaY - 8, // por dónde sale del escritorio
    visitaY: s.y + 30,
    visitaX: s.x + (s.izq ? 44 : 24),
    visitaDir: s.izq ? "left" : "right", // hacia dónde mira la visita
  };
}

const SPEED = 16; // unidades del mapa por segundo
const SLOT_MS = 40000;

function hash(a, b) {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return (x ^ (x >>> 16)) >>> 0;
}

const limpiar = (pts) => pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
function largo(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
  return l;
}
function dirDe(a, b) {
  if (Math.abs(b.x - a.x) > Math.abs(b.y - a.y)) return b.x > a.x ? "right" : "left";
  return b.y > a.y ? "down" : "up";
}
/** Punto y dirección a `d` unidades de recorrido sobre la poligonal. */
function sobre(pts, d) {
  let resto = Math.max(0, d);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (resto <= seg) {
      const k = seg ? resto / seg : 0;
      return { x: Math.round(a.x + (b.x - a.x) * k), y: Math.round(a.y + (b.y - a.y) * k), dir: dirDe(a, b), tramo: i };
    }
    resto -= seg;
  }
  const a = pts[pts.length - 2] || pts[0];
  const b = pts[pts.length - 1];
  return { x: b.x, y: b.y, dir: dirDe(a, b), tramo: pts.length - 1 };
}

const CAFE_SPOTS = [{ x: 80, y: 96 }, { x: 96, y: 96 }];

function camino(id, destino, k = 0) {
  const g = geometria(id);
  const pts = [g.silla, { x: g.silla.x, y: g.pasoY }, { x: g.puertaX, y: g.pasoY }, { x: g.puertaX, y: PASILLO_Y }];
  if (destino === "cafe") {
    const s = CAFE_SPOTS[k % 2];
    pts.push({ x: 88, y: PASILLO_Y }, { x: 88, y: 92 }, { x: s.x, y: 92 }, s);
    return { pts: limpiar(pts), dirFin: "down" };
  }
  const h = geometria(destino);
  pts.push({ x: h.puertaX, y: PASILLO_Y }, { x: h.puertaX, y: h.visitaY }, { x: h.visitaX, y: h.visitaY });
  return { pts: limpiar(pts), dirFin: h.visitaDir };
}

// ---- Reunión de las 08:00 (lunes a viernes): todos van a la sala del medio, se quedan 9 minutos y vuelven ----
const ZONA = "America/Argentina/Buenos_Aires";
const REUNION_SEG = 8 * 3600;
const REUNION_DURA = 10 * 60;
const REUNION_QUEDA = 9 * 60;
const REUNION_SPOTS = [{ x: 74, y: 42 }, { x: 83, y: 42 }, { x: 92, y: 42 }, { x: 101, y: 42 }, { x: 88, y: 37 }];

/** Segundos desde las 08:00 de hoy si ahora corre la reunión (lunes a viernes), o null. */
export function segundosDeReunion(ahora = Date.now()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: ZONA, weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
      .formatToParts(new Date(ahora)).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]),
  );
  if (["Sat", "Sun"].includes(p.weekday)) return null;
  const seg = (Number(p.hour) % 24) * 3600 + Number(p.minute) * 60 + Number(p.second) + (ahora % 1000) / 1000;
  const s = seg - REUNION_SEG;
  return s >= 0 && s < REUNION_DURA ? s : null;
}

function viajesReunion(lista) {
  return lista.map((id, i) => {
    const g = geometria(id);
    const spot = REUNION_SPOTS[i % REUNION_SPOTS.length];
    const pts = limpiar([g.silla, { x: g.silla.x, y: g.pasoY }, { x: g.puertaX, y: g.pasoY }, { x: g.puertaX, y: PASILLO_Y }, { x: 88, y: PASILLO_Y }, { x: 88, y: spot.y }, spot]);
    const L = largo(pts);
    const walk = L / SPEED;
    const off = i * 2;
    return { id, destino: "reunion", pts, dirFin: "up", L, walk, off, quedarse: Math.max(5, REUNION_QUEDA - off - walk) };
  });
}

const memo = new Map();
function planDe(slot, ids) {
  const clave = `${slot}|${ids.join(",")}`;
  if (memo.has(clave)) return memo.get(clave);
  const n = ids.length;
  let sale = ids.filter((_, i) => hash(slot, i + 1) % 100 < 45);
  if (!sale.length && n) sale = [ids[hash(slot, 99) % n]];
  if (sale.length === n && n > 1) sale = sale.slice(0, n - 1);
  const anfitriones = new Set();
  let cafes = 0;
  const viajes = [];
  sale.forEach((id, i) => {
    const libres = ids.filter((x) => !sale.includes(x) && !anfitriones.has(x));
    let destino = "cafe";
    if (libres.length && hash(slot, 50 + i) % 100 < 70) {
      destino = libres[hash(slot, 70 + i) % libres.length];
      anfitriones.add(destino);
    } else if (cafes >= 2) return;
    const k = destino === "cafe" ? cafes++ : 0;
    const { pts, dirFin } = camino(id, destino, k);
    const L = largo(pts);
    const walk = L / SPEED;
    const off = (hash(slot, 120 + i) % 5000) / 1000;
    const quedarse = Math.max(4, Math.min(13, SLOT_MS / 1000 - 2 * walk - off - 1));
    viajes.push({ id, destino, pts, dirFin, L, walk, off, quedarse });
  });
  const plan = { viajes };
  if (memo.size > 60) memo.clear();
  memo.set(clave, plan);
  return plan;
}

/**
 * Dónde está y qué hace cada agente en `ahora`.
 * Devuelve { [id]: { fase, x, y, dir, camina, sentado, con } } con fase: escritorio | sale | visita | cafe | recibe | vuelve.
 */
export function escena(ahora = Date.now(), ids = ORDEN) {
  const lista = ORDEN.filter((x) => ids.includes(x));
  const sReunion = segundosDeReunion(ahora);
  const slot = Math.floor(ahora / SLOT_MS);
  const t = sReunion != null ? sReunion : (ahora % SLOT_MS) / 1000;
  const viajes = sReunion != null ? viajesReunion(lista) : planDe(slot, lista).viajes;
  const out = {};
  for (const id of lista) {
    const g = geometria(id);
    out[id] = { fase: "escritorio", x: g.silla.x, y: g.silla.y, dir: "down", camina: false, sentado: true, con: null, paso: 0 };
  }
  for (const v of viajes) {
    const ini = v.off;
    const llega = ini + v.walk;
    const sigue = llega + v.quedarse;
    const fin = sigue + v.walk;
    const dest = v.destino;
    if (t < ini || t >= fin) continue;
    if (t < llega) {
      const p = sobre(v.pts, (t - ini) * SPEED);
      out[v.id] = { fase: "sale", x: p.x, y: p.y, dir: p.dir, camina: true, sentado: false, con: dest, paso: Math.floor((t - ini) * 3) };
    } else if (t < sigue) {
      const f = v.pts[v.pts.length - 1];
      out[v.id] = { fase: dest === "cafe" ? "cafe" : dest === "reunion" ? "reunion" : "visita", x: f.x, y: f.y, dir: v.dirFin, camina: false, sentado: false, con: dest, paso: 0 };
      if (dest !== "cafe" && dest !== "reunion" && out[dest]) {
        const h = geometria(dest);
        out[dest] = { ...out[dest], fase: "recibe", dir: h.visitaDir === "left" ? "right" : "left", con: v.id };
      }
    } else {
      const p = sobre(v.pts, (fin - t) * SPEED);
      const inv = { up: "down", down: "up", left: "right", right: "left" };
      out[v.id] = { fase: "vuelve", x: p.x, y: p.y, dir: inv[p.dir], camina: true, sentado: p.tramo <= 1, con: dest, paso: Math.floor((t - sigue) * 3) };
    }
  }
  return out;
}
