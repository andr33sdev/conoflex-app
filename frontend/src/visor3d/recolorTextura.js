// Recolorea la textura de un modelo 3D: cambia SOLO las zonas con color intenso (el cuerpo) y deja igual
// lo que casi no tiene color (bandas plateadas/blancas, detalles negros). Conserva el sombreado de la textura.
import * as THREE from "three";

const paso = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Peso de "cuerpo" (0..1) según saturación y brillo de un píxel RGB (0..255). */
export function pesoCuerpo(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const v = mx / 255, s = mx === 0 ? 0 : (mx - mn) / mx;
  return paso(0.28, 0.5, s) * paso(0.08, 0.2, v);
}

const luz = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Devuelve los píxeles recoloreados (Uint8ClampedArray RGBA) a partir de los originales.
 * En colores oscuros, la tinta negra de las etiquetas (logo, textos) pasa a blanco para que se lea.
 */
export function recolorearPixeles(datos, [tr, tg, tb], referencia) {
  const sal = new Uint8ClampedArray(datos.length);
  const k = (v) => Math.max(0.25, Math.min(1.7, v));
  const oscuro = luz(tr, tg, tb) < 80;
  for (let i = 0; i < datos.length; i += 4) {
    const r = datos[i], g = datos[i + 1], b = datos[i + 2];
    const w = pesoCuerpo(r, g, b);
    const l = luz(r, g, b);
    // Tinta de etiqueta: pixeles mucho más oscuros que el cuerpo (en colores oscuros pasan a blanco para que se lean).
    const tinta = oscuro ? 1 - paso(0.3 * referencia, 0.55 * referencia, l) : 0;
    if (w === 0 || tinta > 0.5) {
      sal[i] = r + (238 - r) * tinta; sal[i + 1] = g + (238 - g) * tinta; sal[i + 2] = b + (238 - b) * tinta; sal[i + 3] = datos[i + 3];
      continue;
    }
    const f = k(luz(r, g, b) / referencia); // cuánta luz/sombra trae ese píxel respecto del promedio del cuerpo
    sal[i] = r + (tr * f - r) * w;
    sal[i + 1] = g + (tg * f - g) * w;
    sal[i + 2] = b + (tb * f - b) * w;
    sal[i + 3] = datos[i + 3];
  }
  return sal;
}

/** Luz promedio de las zonas de cuerpo de la textura original (referencia del sombreado). */
export function luzReferencia(datos) {
  let suma = 0, pesos = 0;
  for (let i = 0; i < datos.length; i += 4) {
    const w = pesoCuerpo(datos[i], datos[i + 1], datos[i + 2]);
    if (w > 0.5) { suma += luz(datos[i], datos[i + 1], datos[i + 2]); pesos++; }
  }
  return pesos ? suma / pesos : 128;
}

const hexARgb = (hex) => { const n = parseInt(String(hex).replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/**
 * Prepara el recoloreado de un modelo. Devuelve `pintar(hex)`, que cambia el color del cuerpo
 * (cada color se calcula una sola vez) y `liberar()`.
 */
export function prepararRecolor(material) {
  const original = material.map;
  const img = original?.image;
  if (!img) return { pintar: () => {}, liberar: () => {} };
  const w = img.width, h = img.height;
  const lienzo = document.createElement("canvas"); lienzo.width = w; lienzo.height = h;
  const ctx = lienzo.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const base = ctx.getImageData(0, 0, w, h);
  const referencia = luzReferencia(base.data);
  const cache = new Map();
  const pintar = (hex) => {
    const clave = String(hex).toLowerCase();
    let tex = cache.get(clave);
    if (!tex) {
      const salida = ctx.createImageData(w, h);
      salida.data.set(recolorearPixeles(base.data, hexARgb(clave), referencia));
      const c2 = document.createElement("canvas"); c2.width = w; c2.height = h;
      c2.getContext("2d").putImageData(salida, 0, 0);
      tex = new THREE.CanvasTexture(c2);
      tex.flipY = original.flipY; tex.colorSpace = original.colorSpace; tex.wrapS = original.wrapS; tex.wrapT = original.wrapT; tex.channel = original.channel;
      tex.anisotropy = original.anisotropy;
      cache.set(clave, tex);
    }
    material.map = tex; material.needsUpdate = true;
  };
  return { pintar, liberar: () => { cache.forEach((t) => t.dispose()); cache.clear(); } };
}
