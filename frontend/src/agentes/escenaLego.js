// Escena 3D de Lía: minifigura LEGO sentada en su puesto de trabajo, en una oficina de ladrillos con el logo de Conoflex.
// Se carga recién cuando se abre el módulo (import dinámico), así three.js no pesa en el resto de la app.
//
// Estados que le manda la pantalla: "idle" (trabaja y hace sus cosas), "listening" (el usuario escribe o dicta),
// "thinking" (procesando) y "speaking" (habla). En "idle" va cambiando de actividad cada tanto y avisa cuál es
// para que la pantalla muestre su "estado actual".
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { crearPersonajeArcilla } from "./personajeArcilla.js";
import { vestirConFBX } from "./personajeFBX.js";

export function soportaWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

export const COLOR = {
  piel: 0xf2cd37,
  pelo: 0x5b2f1b,
  saco: 0x2b2e3b,
  pantalon: 0x1c1d24,
  naranja: 0xe85c0d, // el naranja del logo
  amarillo: 0xffd60a,
  blanco: 0xf4f1ea,
  suelo: 0x15161b,
  pared: 0xb8bbc2,
};

export const plastico = (color, extra = {}) => {
  // materiales de oficina real (pintura satinada, laminado, goma): sin barniz brillante de juguete
  const { clearcoat, clearcoatRoughness, ...resto } = extra;
  void clearcoat;
  void clearcoatRoughness;
  return new THREE.MeshPhysicalMaterial({ color, metalness: 0.03, ...resto, roughness: Math.max(0.5, resto.roughness ?? 0.62) });
};

// ---------- superficies realistas (texturas dibujadas en el momento, sin descargar nada) ----------
const ruido = (ctx, w, h, fuerza, n = 1) => {
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const k = (Math.random() - 0.5) * fuerza * n;
    img.data[i] += k;
    img.data[i + 1] += k;
    img.data[i + 2] += k;
  }
  ctx.putImageData(img, 0, 0);
};
const conRepeticion = (t, rx, ry) => {
  t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping;
  t.tex.repeat.set(rx, ry);
  return t.tex;
};
/** Piso: "parquet" (madera), "hormigon" (cemento pulido con juntas) o "alfombra" (placas de alfombra de oficina). */
export function pisoReal(tipo, rx = 4, ry = 3) {
  const t = textura(1024, 1024, (ctx, W, H) => {
    if (tipo === "parquet") {
      const tablas = 8;
      const largo = 4;
      for (let j = 0; j < tablas * 2; j++) {
        const h0 = H / (tablas * 2);
        let x = -((j * 137) % 200);
        while (x < W) {
          const l = W / largo + ((j * 53 + x) % 60);
          const tono = 118 + Math.random() * 34;
          ctx.fillStyle = `rgb(${tono + 34},${tono + 4},${tono - 40})`;
          ctx.fillRect(x, j * h0, l - 3, h0 - 3);
          ctx.strokeStyle = "rgba(60,35,15,0.25)";
          for (let v = 0; v < 6; v++) {
            ctx.beginPath();
            const yy = j * h0 + Math.random() * h0;
            ctx.moveTo(x, yy);
            ctx.bezierCurveTo(x + l * 0.3, yy + (Math.random() - 0.5) * 6, x + l * 0.7, yy + (Math.random() - 0.5) * 6, x + l, yy);
            ctx.stroke();
          }
          x += l;
        }
      }
      ctx.fillStyle = "rgba(30,18,8,0.55)";
      for (let j = 0; j <= tablas * 2; j++) ctx.fillRect(0, j * (H / (tablas * 2)) - 1.5, W, 3);
    } else if (tipo === "alfombra") {
      ctx.fillStyle = "#4a4e5a";
      ctx.fillRect(0, 0, W, H);
      ruido(ctx, W, H, 46, 1);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      for (let i = 0; i <= 4; i++) {
        ctx.fillRect((i * W) / 4 - 1.5, 0, 3, H);
        ctx.fillRect(0, (i * H) / 4 - 1.5, W, 3);
      }
    } else {
      ctx.fillStyle = "#6c6f75";
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 70; i++) {
        const g = ctx.createRadialGradient(Math.random() * W, Math.random() * H, 4, Math.random() * W, Math.random() * H, 160);
        const a = Math.random() * 0.08;
        g.addColorStop(0, Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      ruido(ctx, W, H, 18, 1);
      ctx.fillStyle = "rgba(20,20,22,0.55)";
      ctx.fillRect(W / 2 - 1.5, 0, 3, H);
      ctx.fillRect(0, H / 2 - 1.5, W, 3);
    }
  });
  const tex = conRepeticion(t, rx, ry);
  return new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: tipo === "alfombra" ? 0.6 : 0.25, roughness: tipo === "parquet" ? 0.5 : tipo === "alfombra" ? 0.95 : 0.55, metalness: 0 });
}
/** Pared pintada con textura suave de enduido. */
export function paredReal(color = "#b8bbc2", rx = 3, ry = 2) {
  const t = textura(512, 512, (ctx, W, H) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    ruido(ctx, W, H, 14, 1);
    for (let i = 0; i < 30; i++) {
      const g = ctx.createRadialGradient(Math.random() * W, Math.random() * H, 2, Math.random() * W, Math.random() * H, 120);
      g.addColorStop(0, `rgba(0,0,0,${Math.random() * 0.05})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  });
  const tex = conRepeticion(t, rx, ry);
  return new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.15, roughness: 0.85, metalness: 0 });
}
export const sombra = (m) => {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};
export const caja = (w, h, d, mat, r = 0.06) => sombra(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), mat));
export const cilindro = (rt, rb, h, mat, seg = 40) => sombra(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat));
export const amortiguar = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const difAngulo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export const rnd = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const suavizar = (x) => x * x * (3 - 2 * x);
export const pulso = (u, a, b) => suavizar(clamp((u - a) / (b - a), 0, 1)); // 0→1 entre a y b

export function textura(w, h, dibujar) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  dibujar?.(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { canvas, ctx, tex, w, h };
}
export const elipse = (ctx, x, y, rx, ry) => {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
};

// ---------- cara ----------
// e: parp (0-1), boca (0-1), forma (0 ancha, 1 redonda), sonrisa (-1..1), ceja (-1..1), mirarX/Y, guiño (0-1)
export function dibujarCara(ctx, W, H, e) {
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // mejillas y pecas
  const g1 = ctx.createRadialGradient(W * 0.2, H * 0.64, 2, W * 0.2, H * 0.64, 60);
  g1.addColorStop(0, "rgba(255,105,95,0.5)");
  g1.addColorStop(1, "rgba(255,105,95,0)");
  const g2 = ctx.createRadialGradient(W * 0.8, H * 0.64, 2, W * 0.8, H * 0.64, 60);
  g2.addColorStop(0, "rgba(255,105,95,0.5)");
  g2.addColorStop(1, "rgba(255,105,95,0)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(150,80,30,0.35)";
  for (const [x, y] of [[0.2, 0.56], [0.25, 0.6], [0.17, 0.6], [0.8, 0.56], [0.75, 0.6], [0.83, 0.6]]) {
    elipse(ctx, W * x, H * y, 3.2, 3.2);
    ctx.fill();
  }
  for (const sx of [0.34, 0.66]) {
    const dir = sx < 0.5 ? -1 : 1;
    const guiño = e.guiño > 0 && dir === 1 ? e.guiño : 0;
    const cierre = Math.max(e.parp, guiño);
    const x = W * sx + e.mirarX * 11;
    const y = H * 0.46 + e.mirarY * 9;
    const ry = Math.max(3, 27 * (1 - cierre));
    // ojo
    ctx.fillStyle = "#17100c";
    elipse(ctx, x, y, 20, ry);
    ctx.fill();
    if (cierre < 0.55) {
      ctx.fillStyle = "#fff";
      elipse(ctx, x - 7, y - 9 * (1 - cierre), 6.5, 6.5 * (1 - cierre) + 1);
      ctx.fill();
      elipse(ctx, x + 8, y + 8 * (1 - cierre), 3, 3 * (1 - cierre) + 0.5);
      ctx.fill();
    }
    // párpado y pestañas
    ctx.strokeStyle = "#17100c";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x - 23, y - ry * 0.2);
    ctx.quadraticCurveTo(x, y - ry - 6, x + 23, y - ry * 0.2);
    ctx.stroke();
    ctx.lineWidth = 5;
    for (const [dx, dy] of [[24, -3], [29, -12], [20, -20]]) {
      ctx.beginPath();
      ctx.moveTo(x + dir * 19, y - ry * 0.55);
      ctx.lineTo(x + dir * dx + dir * 9, y - ry - 3 + dy * 0.45);
      ctx.stroke();
    }
    // ceja expresiva (ceja>0 sube, <0 se frunce hacia el centro)
    const yb = H * 0.285 - e.ceja * 24;
    ctx.strokeStyle = "#47230f";
    ctx.lineWidth = 11;
    ctx.beginPath();
    const interior = e.ceja < 0 ? -e.ceja * 18 : 0;
    ctx.moveTo(x - 34 + (dir < 0 ? 0 : 0), yb + 8 + (dir > 0 ? interior : 0) * 0.0);
    ctx.quadraticCurveTo(x, yb - 12, x + 34, yb + 7 + (dir < 0 ? interior : 0));
    ctx.stroke();
  }
  // nariz
  ctx.strokeStyle = "rgba(160,100,10,0.55)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(W * 0.5 - 7, H * 0.6);
  ctx.quadraticCurveTo(W * 0.5, H * 0.63, W * 0.5 + 7, H * 0.6);
  ctx.stroke();
  // boca
  const cx = W * 0.5;
  const cy = H * 0.76;
  const ancho = 44 + e.sonrisa * 32;
  if (e.boca > 0.1) {
    const abre = 8 + e.boca * 36;
    const redonda = e.forma;
    const aw = ancho * (1 - redonda * 0.45);
    ctx.fillStyle = "#4a0f19";
    ctx.beginPath();
    ctx.moveTo(cx - aw, cy - 3);
    ctx.quadraticCurveTo(cx, cy - 10 + e.sonrisa * 4, cx + aw, cy - 3);
    ctx.quadraticCurveTo(cx + aw * 0.7, cy + abre * 1.9, cx, cy + abre * 2);
    ctx.quadraticCurveTo(cx - aw * 0.7, cy + abre * 1.9, cx - aw, cy - 3);
    ctx.fill();
    if (e.boca > 0.3 && redonda < 0.5) {
      ctx.fillStyle = "#fff8ee";
      ctx.beginPath();
      ctx.roundRect(cx - aw * 0.68, cy - 5, aw * 1.36, 11, 5);
      ctx.fill();
      ctx.fillStyle = "#ff8d84";
      elipse(ctx, cx, cy + abre * 1.45, aw * 0.4, abre * 0.36);
      ctx.fill();
    }
    ctx.strokeStyle = "#c92a35";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(cx - aw, cy - 3);
    ctx.quadraticCurveTo(cx, cy - 10 + e.sonrisa * 4, cx + aw, cy - 3);
    ctx.quadraticCurveTo(cx + aw * 0.7, cy + abre * 1.9, cx, cy + abre * 2);
    ctx.quadraticCurveTo(cx - aw * 0.7, cy + abre * 1.9, cx - aw, cy - 3);
    ctx.stroke();
  } else {
    ctx.strokeStyle = "#c92a35";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(cx - ancho, cy - e.sonrisa * 4);
    ctx.quadraticCurveTo(cx, cy + 8 + 34 * e.sonrisa, cx + ancho, cy - e.sonrisa * 4);
    ctx.stroke();
    // brillo del labial
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(cx - ancho * 0.35, cy + 10 + 22 * e.sonrisa);
    ctx.quadraticCurveTo(cx - ancho * 0.1, cy + 14 + 26 * e.sonrisa, cx + ancho * 0.05, cy + 12 + 25 * e.sonrisa);
    ctx.stroke();
  }
}

export const HORA_ARG = () => {
  try {
    const p = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date());
    return { h: Number(p.find((x) => x.type === "hour").value) % 24, m: Number(p.find((x) => x.type === "minute").value) };
  } catch {
    const d = new Date();
    return { h: d.getHours(), m: d.getMinutes() };
  }
};

export function crearEscena(contenedor, { logoUrl, onActividad, onSaludo } = {}) {
  const movil = window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 700;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, movil ? 2 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:pan-y;outline:none";
  contenedor.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const entorno = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = entorno.texture;
  scene.environmentIntensity = 0.6;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  const TARGET = new THREE.Vector3(1.3, 2.9, 0.6);
  const DIR_CAM = new THREE.Vector3(-2.3, 2.3, 12.0).normalize();
  camera.position.copy(TARGET).addScaledVector(DIR_CAM, 12);
  const controles = new OrbitControls(camera, renderer.domElement);
  controles.target.copy(TARGET);
  controles.enableDamping = true;
  controles.dampingFactor = 0.08;
  controles.enablePan = false;
    controles.minPolarAngle = 0.45;
  controles.maxPolarAngle = Math.PI / 2 - 0.08;
  controles.minAzimuthAngle = -1.3;
  controles.maxAzimuthAngle = 0.9;
  controles.rotateSpeed = 0.7;
  controles.update();
  let ultimoToque = -99;
  controles.addEventListener("start", () => (ultimoToque = performance.now() / 1000));

  // ----- luces (el momento del día sale de la hora real) -----
  const hemi = new THREE.HemisphereLight(0xcfd8ff, 0x20222a, 0.7);
  scene.add(hemi);
  const sol = new THREE.DirectionalLight(0xfff2e0, 2.4);
  sol.position.set(5, 10, 8);
  sol.castShadow = true;
  const res = movil ? 1536 : 2048;
  sol.shadow.mapSize.set(res, res);
  Object.assign(sol.shadow.camera, { left: -8, right: 9, top: 8, bottom: -7, near: 1, far: 30 });
  sol.shadow.bias = -0.0004;
  sol.shadow.normalBias = 0.03;
  scene.add(sol);
  const luzNaranja = new THREE.PointLight(0xff8a3a, 14, 12, 2);
  luzNaranja.position.set(0.4, 3.8, 1.8);
  scene.add(luzNaranja);

  // ----- logo (se dibuja en varias texturas cuando termina de cargar) -----
  const logo = new Image();
  let logoListo = false;
  const alLogo = [];
  logo.onload = () => {
    logoListo = true;
    alLogo.forEach((f) => f());
  };
  if (logoUrl) logo.src = logoUrl;
  const conLogo = (fn) => {
    alLogo.push(fn);
    if (logoListo) fn();
  };

  // ----- mundo -----
  const mundo = new THREE.Group();
  scene.add(mundo);
  const piso = caja(12.4, 0.5, 9.4, pisoReal("parquet", 4.5, 3.4), 0.12);
  piso.position.set(1.4, -0.25, 0.2);
  mundo.add(piso);

  // alfombra redonda con el logo
  const alfombra = textura(512, 512, () => {});
  const dibujarAlfombra = () => {
    const { ctx } = alfombra;
    ctx.clearRect(0, 0, 512, 512);
    ctx.fillStyle = "#e85c0d";
    ctx.beginPath();
    ctx.arc(256, 256, 256, 0, 7);
    ctx.fill();
    ctx.fillStyle = "#2b2e3b";
    ctx.beginPath();
    ctx.arc(256, 256, 226, 0, 7);
    ctx.fill();
    ctx.strokeStyle = "#ffd60a";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(256, 256, 208, 0, 7);
    ctx.stroke();
    if (logoListo) ctx.drawImage(logo, 156, 140, 200, 200);
    ctx.fillStyle = "#fff";
    ctx.font = "800 34px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("CONOFLEX", 256, 392);
    alfombra.tex.needsUpdate = true;
  };
  dibujarAlfombra();
  conLogo(dibujarAlfombra);
  const alfMesh = new THREE.Mesh(new THREE.CircleGeometry(2.55, 64), new THREE.MeshStandardMaterial({ map: alfombra.tex, roughness: 0.8, transparent: true }));
  alfMesh.rotation.x = -Math.PI / 2;
  alfMesh.position.set(1.4, 0.18, 0.7);
  alfMesh.receiveShadow = true;
  mundo.add(alfMesh);
  const alfBase = cilindro(2.55, 2.55, 0.16, plastico(0x2b2e3b, { roughness: 0.7, clearcoat: 0.1 }), 64);
  alfBase.position.set(1.4, 0.08, 0.7);
  mundo.add(alfBase);

  // pared del fondo
  const pared = caja(12.4, 7.2, 0.5, paredReal(), 0.15);
  pared.position.set(1.4, 3.6, -4.2);
  mundo.add(pared);
  const zocalo = caja(12.4, 0.4, 0.62, plastico(COLOR.naranja), 0.1);
  zocalo.position.set(1.4, 0.2, -4.14);
  mundo.add(zocalo);

  // gran logo en la pared
  const aro = cilindro(1.38, 1.38, 0.2, plastico(COLOR.naranja), 64);
  aro.rotation.x = Math.PI / 2;
  aro.position.set(2.3, 4.5, -3.85);
  mundo.add(aro);
  const discoLogo = textura(512, 512, () => {});
  const dibujarDisco = () => {
    const { ctx } = discoLogo;
    ctx.clearRect(0, 0, 512, 512);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(256, 256, 256, 0, 7);
    ctx.fill();
    if (logoListo) ctx.drawImage(logo, 0, 0, 512, 512);
    discoLogo.tex.needsUpdate = true;
  };
  dibujarDisco();
  conLogo(dibujarDisco);
  const discoMesh = new THREE.Mesh(new THREE.CircleGeometry(1.22, 64), new THREE.MeshBasicMaterial({ map: discoLogo.tex, transparent: true, toneMapped: false }));
  discoMesh.position.set(2.3, 4.5, -3.74);
  mundo.add(discoMesh);

  // ventana con el cielo de la hora real
  const cielo = textura(512, 512, () => {});
  const dibujarCielo = () => {
    const { h } = HORA_ARG();
    const { ctx } = cielo;
    const noche = h >= 20 || h < 6;
    const tarde = (h >= 17 && h < 20) || (h >= 6 && h < 8);
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    if (noche) {
      g.addColorStop(0, "#0b1230");
      g.addColorStop(1, "#27325e");
    } else if (tarde) {
      g.addColorStop(0, "#5b6fd0");
      g.addColorStop(0.6, "#ff9a5a");
      g.addColorStop(1, "#ffd08a");
    } else {
      g.addColorStop(0, "#4aa3ff");
      g.addColorStop(1, "#cfeaff");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    if (noche) {
      ctx.fillStyle = "#fff";
      for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % 512, (i * 53) % 300, i % 5 === 0 ? 3 : 2, i % 5 === 0 ? 3 : 2);
      ctx.fillStyle = "#fff6d6";
      ctx.beginPath();
      ctx.arc(380, 110, 36, 0, 7);
      ctx.fill();
      ctx.fillStyle = "#27325e";
      ctx.beginPath();
      ctx.arc(396, 100, 32, 0, 7);
      ctx.fill();
    } else {
      ctx.fillStyle = tarde ? "#ffe08a" : "#fff5b0";
      ctx.beginPath();
      ctx.arc(tarde ? 130 : 380, tarde ? 330 : 110, 44, 0, 7);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (const [x, y, r] of [[120, 130, 40], [165, 120, 52], [215, 135, 38], [330, 220, 34], [370, 212, 44]]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 7);
        ctx.fill();
      }
    }
    // ciudad de ladrillos
    ctx.fillStyle = noche ? "#0d1020" : "#3d4560";
    const edif = [[0, 120], [70, 200], [140, 150], [210, 250], [290, 170], [360, 230], [430, 140]];
    for (const [x, alto] of edif) {
      ctx.fillRect(x, 512 - alto, 68, alto);
      ctx.fillStyle = noche ? "#ffd60a" : "rgba(255,255,255,0.35)";
      for (let k = 0; k < 6; k++) ctx.fillRect(x + 10 + (k % 2) * 28, 512 - alto + 14 + Math.floor(k / 2) * 34, 14, 18);
      ctx.fillStyle = noche ? "#0d1020" : "#3d4560";
    }
    cielo.tex.needsUpdate = true;
    const hn = noche ? 0.45 : tarde ? 0.8 : 1;
    sol.intensity = 2.4 * hn;
    hemi.intensity = 0.7 * (noche ? 0.7 : 1);
  };
  dibujarCielo();
  const marcoV = caja(2.5, 2.4, 0.25, plastico(0xf4f1ea), 0.1);
  marcoV.position.set(-2.9, 3.8, -3.85);
  mundo.add(marcoV);
  const vidrio = new THREE.Mesh(new THREE.PlaneGeometry(2.14, 2.04), new THREE.MeshBasicMaterial({ map: cielo.tex, toneMapped: false }));
  vidrio.position.set(-2.9, 3.8, -3.71);
  mundo.add(vidrio);
  for (const [w, h, x, y] of [[0.1, 2.04, -2.9, 3.8], [2.14, 0.1, -2.9, 3.8]]) {
    const b = caja(w, h, 0.08, plastico(0xf4f1ea), 0.02);
    b.position.set(x, y, -3.66);
    mundo.add(b);
  }

  // reloj de pared (hora real)
  const reloj = textura(256, 256, () => {});
  const dibujarReloj = () => {
    const { h, m } = HORA_ARG();
    const { ctx } = reloj;
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = "#f6f2ea";
    ctx.beginPath();
    ctx.arc(128, 128, 124, 0, 7);
    ctx.fill();
    ctx.strokeStyle = "#e85c0d";
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.fillStyle = "#222";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.fillRect(128 + Math.sin(a) * 100 - 4, 128 - Math.cos(a) * 100 - 4, 8, 8);
    }
    const mano = (ang, largo, ancho, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = ancho;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(128, 128);
      ctx.lineTo(128 + Math.sin(ang) * largo, 128 - Math.cos(ang) * largo);
      ctx.stroke();
    };
    mano(((h % 12) + m / 60) / 12 * Math.PI * 2, 58, 12, "#222");
    mano((m / 60) * Math.PI * 2, 86, 8, "#222");
    reloj.tex.needsUpdate = true;
  };
  dibujarReloj();
  const relojMesh = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40), new THREE.MeshBasicMaterial({ map: reloj.tex, transparent: true, toneMapped: false }));
  relojMesh.position.set(-0.4, 5.4, -3.9);
  mundo.add(relojMesh);

  // calendario de pared
  const cal = textura(256, 300, (ctx, w) => {
    ctx.fillStyle = "#f6f2ea";
    ctx.beginPath();
    ctx.roundRect(0, 0, w, 300, 14);
    ctx.fill();
    ctx.fillStyle = "#e85c0d";
    ctx.fillRect(0, 0, w, 62);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 34px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("FERIADOS", w / 2, 43);
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 7; c++) {
        const marcado = (r === 2 && c === 3) || (r === 4 && c === 0);
        if (marcado) {
          ctx.fillStyle = "#e85c0d";
          ctx.beginPath();
          ctx.arc(24 + c * 34, 98 + r * 38, 14, 0, 7);
          ctx.fill();
        }
        ctx.fillStyle = marcado ? "#fff" : "#444";
        ctx.font = "16px sans-serif";
        ctx.fillText(String(r * 7 + c + 1), 24 + c * 34, 104 + r * 38);
      }
  });
  const calMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.64), new THREE.MeshBasicMaterial({ map: cal.tex, toneMapped: false }));
  calMesh.position.set(-0.4, 3.65, -3.9);
  mundo.add(calMesh);

  // tablero de la pared (TV) con el estado real de los avisos
  const info = { abiertos: 0, altas: 0, operarios: 0, feriado: "" };
  const tv = textura(640, 360, () => {});
  const dibujarTV = (t) => {
    const { ctx } = tv;
    ctx.fillStyle = "#0d1017";
    ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = "#e85c0d";
    ctx.fillRect(0, 0, 640, 56);
    if (logoListo) ctx.drawImage(logo, 12, 6, 44, 44);
    ctx.fillStyle = "#fff";
    ctx.font = "800 28px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("RRHH · Tablero de Lía", 68, 38);
    for (let i = 0; i < 9; i++) {
      const alto = 40 + 130 * (0.5 + 0.5 * Math.sin(t * 0.7 + i * 0.8)) * (0.55 + 0.45 * ((i * 37) % 5) / 5);
      ctx.fillStyle = i % 3 === 0 ? "#ffd60a" : "#3b82f6";
      ctx.fillRect(28 + i * 36, 330 - alto, 26, alto);
    }
    ctx.textAlign = "right";
    ctx.font = "800 120px sans-serif";
    ctx.fillStyle = info.altas > 0 ? "#ff5d5d" : info.abiertos > 0 ? "#ffd60a" : "#4ade80";
    ctx.fillText(String(info.abiertos), 610, 190);
    ctx.font = "600 26px sans-serif";
    ctx.fillStyle = "#b8bcc8";
    ctx.fillText(info.abiertos === 1 ? "aviso abierto" : "avisos abiertos", 610, 230);
    ctx.font = "600 22px sans-serif";
    ctx.fillStyle = "#8a90a0";
    if (info.operarios) ctx.fillText(`${info.operarios} operarios controlados`, 610, 266);
    tv.tex.needsUpdate = true;
  };
  dibujarTV(0);
  conLogo(() => dibujarTV(0));
  const tvMarco = caja(3.0, 1.75, 0.16, plastico(0x101115), 0.06);
  tvMarco.position.set(5.7, 3.8, -3.85);
  mundo.add(tvMarco);
  const tvPantalla = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.575), new THREE.MeshBasicMaterial({ map: tv.tex, toneMapped: false }));
  tvPantalla.position.set(5.7, 3.8, -3.76);
  mundo.add(tvPantalla);

  // ----- puesto de trabajo -----
  const Y_TRABAJO = -1.45; // hacia dónde mira cuando trabaja (derecha y un poco hacia nosotros)
  const POS_SILLA = new THREE.Vector3(1.9, 0, 0.5);
  const dirT = new THREE.Vector3(Math.sin(Y_TRABAJO), 0, Math.cos(Y_TRABAJO));
  const escritorio = new THREE.Group();
  escritorio.position.copy(POS_SILLA).addScaledVector(dirT, 1.3);
  escritorio.rotation.y = Y_TRABAJO + Math.PI;
  mundo.add(escritorio);
  const tablero = caja(3.6, 0.22, 1.6, plastico(0xe9e4d8), 0.08);
  tablero.position.y = 1.45;
  escritorio.add(tablero);
  const franja = caja(3.62, 0.06, 1.62, plastico(COLOR.naranja), 0.03);
  franja.position.y = 1.36;
  escritorio.add(franja);
  const pataI = caja(0.22, 1.35, 1.4, plastico(COLOR.naranja), 0.06);
  pataI.position.set(-1.65, 0.68, 0);
  escritorio.add(pataI);
  const cajonera = caja(1.2, 1.35, 1.4, plastico(COLOR.amarillo), 0.08);
  cajonera.position.set(1.15, 0.68, 0);
  escritorio.add(cajonera);
  for (const y of [0.35, 0.95]) {
    const t = caja(0.55, 0.1, 0.08, plastico(0x333333), 0.03);
    t.position.set(1.15, y, 0.72);
    escritorio.add(t);
  }
  // monitor (su espalda lleva el logo, como una compu de diseño)
  const monitor = new THREE.Group();
  monitor.position.set(-0.3, 1.56, -0.25);
  monitor.scale.setScalar(0.8);
  escritorio.add(monitor);
  const marcoM = caja(2.1, 1.35, 0.14, plastico(0x15161b), 0.06);
  marcoM.position.y = 0.95;
  monitor.add(marcoM);
  const pie = cilindro(0.1, 0.12, 0.5, plastico(0x15161b), 20);
  pie.position.y = 0.25;
  monitor.add(pie);
  const base = cilindro(0.5, 0.5, 0.06, plastico(0x15161b), 32);
  base.position.y = 0.03;
  monitor.add(base);
  const pantalla = textura(512, 320, () => {});
  const vid = new THREE.Mesh(new THREE.PlaneGeometry(1.94, 1.2), new THREE.MeshBasicMaterial({ map: pantalla.tex, toneMapped: false }));
  vid.position.set(0, 0.95, 0.075);
  monitor.add(vid);
  const logoEspalda = new THREE.Mesh(new THREE.CircleGeometry(0.26, 40), new THREE.MeshBasicMaterial({ map: discoLogo.tex, transparent: true, toneMapped: false }));
  logoEspalda.rotation.y = Math.PI;
  logoEspalda.position.set(0, 0.95, -0.08);
  monitor.add(logoEspalda);
  let escribiendoPantalla = 0;
  const dibujarPantalla = (t) => {
    const { ctx } = pantalla;
    ctx.fillStyle = "#0e1117";
    ctx.fillRect(0, 0, 512, 320);
    ctx.fillStyle = "#e85c0d";
    ctx.fillRect(0, 0, 512, 40);
    if (logoListo) ctx.drawImage(logo, 8, 4, 32, 32);
    ctx.fillStyle = "#fff";
    ctx.font = "800 22px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Liquidación de sueldos", 50, 28);
    ctx.fillStyle = "#1b2230";
    ctx.fillRect(16, 56, 480, 30);
    ctx.fillStyle = "#6ea8ff";
    ctx.font = "600 16px sans-serif";
    ctx.fillText("Operario        Horas      Extras      Presentismo", 24, 77);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? "#141a26" : "#0e1117";
      ctx.fillRect(16, 90 + i * 34, 480, 34);
      ctx.fillStyle = "#cfd6e4";
      ctx.fillRect(26, 102 + i * 34, 70 + ((i * 29) % 40), 9);
      ctx.fillStyle = "#ffd60a";
      ctx.fillRect(190, 102 + i * 34, 26 + ((i * 17 + Math.floor(t * 2)) % 30), 9);
      ctx.fillStyle = (i + Math.floor(t / 3)) % 4 === 0 ? "#ff5d5d" : "#4ade80";
      ctx.fillRect(380, 100 + i * 34, 16, 14);
    }
    if (Math.sin(t * 6) > 0 && escribiendoPantalla > 0) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(300, 300, 3, 14);
    }
    pantalla.tex.needsUpdate = true;
  };
  dibujarPantalla(0);
  conLogo(() => dibujarPantalla(0));
  // teclado, taza, papeles, lámpara, plantita, placa con nombre
  const teclado = caja(1.4, 0.07, 0.42, plastico(0x2a2c35), 0.03);
  teclado.position.set(-0.3, 1.59, 0.38);
  escritorio.add(teclado);
  const mouse = caja(0.2, 0.07, 0.3, plastico(0x2a2c35), 0.05);
  mouse.position.set(0.7, 1.59, 0.4);
  escritorio.add(mouse);
  const tazaEscr = new THREE.Group();
  tazaEscr.position.set(-1.35, 1.56, 0.3);
  const cuerpoTaza = cilindro(0.17, 0.15, 0.3, plastico(COLOR.blanco), 28);
  cuerpoTaza.position.y = 0.15;
  tazaEscr.add(cuerpoTaza);
  const asa = sombra(new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.03, 8, 16, Math.PI), plastico(COLOR.blanco)));
  asa.rotation.z = -Math.PI / 2;
  asa.position.set(0.19, 0.16, 0);
  tazaEscr.add(asa);
  const cafe = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), new THREE.MeshBasicMaterial({ color: 0x3b1f10 }));
  cafe.rotation.x = -Math.PI / 2;
  cafe.position.y = 0.29;
  tazaEscr.add(cafe);
  escritorio.add(tazaEscr);
  const papeles = caja(0.75, 0.14, 0.95, plastico(0xffffff), 0.02);
  papeles.position.set(1.15, 1.63, 0.1);
  papeles.rotation.y = 0.2;
  escritorio.add(papeles);
  const lamparaBase = cilindro(0.2, 0.22, 0.08, plastico(0x333333), 20);
  lamparaBase.position.set(-1.45, 1.6, -0.45);
  escritorio.add(lamparaBase);
  const brazoL = cilindro(0.03, 0.03, 0.8, plastico(0x333333), 8);
  brazoL.position.set(-1.45, 2.0, -0.45);
  brazoL.rotation.z = 0.25;
  escritorio.add(brazoL);
  const pantallaL = sombra(new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.3, 24, 1, true), plastico(COLOR.naranja, { side: THREE.DoubleSide })));
  pantallaL.position.set(-1.33, 2.42, -0.45);
  pantallaL.rotation.z = 0.25;
  escritorio.add(pantallaL);
  const bombita = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
  bombita.position.set(-1.33, 2.32, -0.45);
  escritorio.add(bombita);
  const placa = textura(256, 64, (ctx, w, h) => {
    ctx.fillStyle = "#0f1015";
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 10);
    ctx.fill();
    ctx.fillStyle = "#ffd60a";
    ctx.font = "800 30px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("LÍA · RRHH", w / 2, 43);
  });
  const placaMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshBasicMaterial({ map: placa.tex, toneMapped: false }));
  placaMesh.position.set(0.55, 1.64, 0.7);
  placaMesh.rotation.x = -Math.PI / 2 + 0.25;
  escritorio.add(placaMesh);

  // planta y archivero decorativos
  const planta = new THREE.Group();
  planta.position.set(6.1, 0, -2.6);
  mundo.add(planta);
  const maceta = cilindro(0.55, 0.42, 0.85, plastico(COLOR.naranja), 32);
  maceta.position.y = 0.43;
  planta.add(maceta);
  const verde = plastico(0x2fae4a, { roughness: 0.4 });
  for (const [x, y, z, s] of [[0, 1.45, 0, 0.62], [-0.3, 1.15, 0.12, 0.42], [0.3, 1.2, -0.1, 0.45], [0.05, 1.9, 0.05, 0.38]]) {
    const hoja = sombra(new THREE.Mesh(new THREE.IcosahedronGeometry(s, 2), verde));
    hoja.position.set(x, y, z);
    planta.add(hoja);
  }
  const archivero = new THREE.Group();
  archivero.position.set(-3.3, 0, -3.3);
  mundo.add(archivero);
  const cuerpoArch = caja(1.5, 2.3, 1.1, plastico(0x3b3f52), 0.08);
  cuerpoArch.position.y = 1.15;
  archivero.add(cuerpoArch);
  for (const y of [0.55, 1.2, 1.85]) {
    const t = caja(1.3, 0.5, 0.08, plastico(COLOR.amarillo), 0.03);
    t.position.set(0, y, 0.57);
    archivero.add(t);
    const m = caja(0.4, 0.08, 0.06, plastico(0x222222), 0.02);
    m.position.set(0, y, 0.63);
    archivero.add(m);
  }
  const ladrillo = (w, d, color, x, z, ry = 0) => {
    // cajas de cartón de archivo (el color ya no importa: son todas de cartón)
    void color;
    const g = new THREE.Group();
    const b = caja(w * 0.8, 0.62, d * 0.8, plastico(0xb38a5a, { roughness: 0.9 }), 0.03);
    b.position.y = 0.31;
    g.add(b);
    const cinta = caja(w * 0.8 + 0.01, 0.01, 0.12, plastico(0xd8c9a5, { roughness: 0.5 }), 0.004);
    cinta.position.y = 0.625;
    g.add(cinta);
    g.position.set(x, 0.0, z);
    g.rotation.y = ry;
    mundo.add(g);
    return g;
  };
  ladrillo(4, 2, COLOR.naranja, 5.7, 2.6, -0.4);
  ladrillo(2, 2, COLOR.amarillo, 6.3, 1.2, 0.5);
  ladrillo(2, 1, 0x2e6bff, -2.8, 3.2, 0.3);
  ladrillo(3, 1, 0xe03a3a, -1.9, 3.9, -0.15);

  // ----- silla giratoria (la base queda fija; asiento y respaldo giran con Lía) -----
  const matSilla = plastico(0x3a3e52);
  const base5 = new THREE.Group();
  base5.position.copy(POS_SILLA);
  mundo.add(base5);
  for (let i = 0; i < 3; i++) {
    const brazo = caja(1.5, 0.1, 0.16, plastico(0x20222a), 0.04);
    brazo.rotation.y = (i * Math.PI) / 3;
    brazo.position.y = 0.12;
    base5.add(brazo);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rueda = sombra(new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), plastico(0x111111)));
    rueda.position.set(Math.cos(a) * 0.72, 0.1, Math.sin(a) * 0.72);
    base5.add(rueda);
  }
  const columna = cilindro(0.12, 0.14, 0.3, plastico(0x20222a), 20);
  columna.position.y = 0.28;
  base5.add(columna);

  // ----- Lía -----
  const lia = new THREE.Group();
  lia.position.set(POS_SILLA.x, -0.1, POS_SILLA.z); // sentada: la cadera apoya en el asiento (alto 0.55)
  mundo.add(lia);
  const asiento = caja(1.75, 0.2, 1.7, matSilla, 0.09);
  asiento.position.set(0, 0.95, 0.25);
  asiento.scale.set(0.62, 1, 0.6);
  lia.add(asiento);
  const respaldo = caja(1.6, 1.15, 0.2, matSilla, 0.1);
  respaldo.position.set(0, 1.62, -0.5);
  respaldo.scale.x = 0.62;
  respaldo.rotation.x = -0.1;
  lia.add(respaldo);
  const franjaResp = caja(1.2, 0.12, 0.06, plastico(COLOR.naranja), 0.03);
  franjaResp.position.set(0, 1.98, -0.38);
  franjaResp.scale.x = 0.62;
  franjaResp.rotation.x = -0.1;
  lia.add(franjaResp);

  // personaje de plastilina: rige el mismo árbol (caderas > tronco > cabeza / brazos) que usan las animaciones
  const pj = crearPersonajeArcilla({
    sentada: true,
    piel: 0xf2bb92,
    saco: 0x233a78,
    camisa: 0xa9cbea,
    pantalon: 0x1f2740,
    pelo: 0x5c3a29,
    peloTipo: "colita",
    iris: "#6b3f23",
    ceja: "#5a3320",
    credencial: true,
  });
  lia.add(pj.raiz);
  const { tronco, brazoI, brazoD, cabeza, ec, refrescarCara } = pj;
  vestirConFBX(pj, { carpeta: `${import.meta.env.BASE_URL}modelos/agentes/business1`, prefijo: "f014", sentada: true, altura: 3.7 }).catch((e) => console.warn("[agentes] modelo 3D no disponible, se usa el de respaldo:", e.message));

  // objetos que toma en la mano (solo se ven cuando los usa)
  const tazaMano = tazaEscr.clone(true);
  tazaMano.position.set(0.0, -0.15, 0.12);
  tazaMano.rotation.set(0, 0, 0);
  tazaMano.scale.setScalar(1);
  tazaMano.visible = false;
  brazoD.mano.add(tazaMano);
  const celu = new THREE.Group();
  const cuerpoCelu = caja(0.42, 0.74, 0.07, plastico(0x16171c), 0.05);
  celu.add(cuerpoCelu);
  const pantCelu = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.66), new THREE.MeshBasicMaterial({ color: 0x4aa3ff, toneMapped: false }));
  pantCelu.position.z = 0.04;
  celu.add(pantCelu);
  celu.position.set(0, -0.1, 0.2);
  celu.visible = false;
  brazoI.mano.add(celu);
  const hojaMano = caja(0.95, 1.2, 0.04, plastico(0xffffff), 0.01);
  hojaMano.position.set(0, 1.05, 0.95);
  hojaMano.rotation.x = -0.5;
  hojaMano.visible = false;
  tronco.add(hojaMano);

  // burbujas de pensamiento
  const burbujas = new THREE.Group();
  const matBurb = plastico(0xffffff, { roughness: 0.2 });
  [0.12, 0.17, 0.25].forEach((r, i) => {
    const b = sombra(new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), matBurb));
    b.position.set(0.9 + i * 0.35, 5.4 + i * 0.35, 0);
    burbujas.add(b);
  });
  burbujas.visible = false;
  lia.add(burbujas);

  // confeti de ladrillitos (para cuando todo está en orden)
  const NCONF = 40;
  const confeti = new THREE.InstancedMesh(new RoundedBoxGeometry(0.22, 0.14, 0.22, 2, 0.03), plastico(0xffffff), NCONF);
  confeti.castShadow = true;
  const coloresConf = [0xe85c0d, 0xffd60a, 0x2e6bff, 0x4ade80, 0xe03a3a, 0xffffff];
  for (let i = 0; i < NCONF; i++) confeti.setColorAt(i, new THREE.Color(coloresConf[i % coloresConf.length]));
  confeti.visible = false;
  mundo.add(confeti);
  const parts = Array.from({ length: NCONF }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), vr: new THREE.Vector3(), vida: 0 }));
  let confetiT = 0;
  const lanzarConfeti = () => {
    confetiT = 3.2;
    confeti.visible = true;
    for (const q of parts) {
      q.p.set(POS_SILLA.x + rnd(-0.3, 0.3), 3.8, POS_SILLA.z + rnd(-0.3, 0.3));
      q.v.set(rnd(-2.2, 2.2), rnd(3.5, 6.5), rnd(-1.8, 1.8));
      q.r.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
      q.vr.set(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6));
      q.vida = rnd(2.2, 3.2);
    }
  };
  const dummy = new THREE.Object3D();

  // ----- actividades de oficina -----
  const POSE0 = () => ({
    torsoPitch: 0, torsoRoll: 0, cabYaw: 0, cabPitch: 0, cabRoll: 0,
    iX: -0.5, iZ: 0.12, dX: -0.5, dZ: -0.12, rebote: 0,
    boca: 0, sonrisa: 0.5, ceja: 0, mirarX: 0, mirarY: 0, guiño: 0,
    giro: Y_TRABAJO, // hacia dónde mira el cuerpo (yaw absoluto)
  });
  const haciaCamara = () => Math.atan2(camera.position.x - POS_SILLA.x, camera.position.z - POS_SILLA.z);
  const haciaPared = (x, z) => Math.atan2(x - POS_SILLA.x, z - POS_SILLA.z);

  // Cada actividad: dur (s), texto(info), pose(u, o) modifica el objetivo `o` en el segundo `u`.
  const ACTIVIDADES = {
    teclear: {
      dur: [9, 15],
      texto: (i) => (i.operarios ? `Cargando las horas de ${i.operarios} operarios en la planilla` : "Cargando horas en la planilla de liquidación"),
      pose(u, o) {
        const glance = Math.sin(u * 0.7) > 0.8;
        o.iX = -0.98 + Math.sin(u * 9) * 0.05;
        o.dX = -0.98 + Math.sin(u * 9 + 2) * 0.05;
        o.iZ = -0.16;
        o.dZ = 0.16;
        o.torsoPitch = 0.07;
        o.cabPitch = glance ? 0.3 : 0.04;
        o.cabYaw = glance ? 0 : Math.sin(u * 0.4) * 0.05;
        o.mirarY = glance ? -0.7 : 0;
        o.sonrisa = 0.35;
        escribiendoPantalla = 1;
      },
    },
    revisar: {
      dur: [8, 12],
      texto: () => "Revisando las fichadas de la quincena",
      pose(u, o) {
        o.dX = -1.0 + Math.sin(u * 1.6) * 0.07;
        o.dZ = 0.12;
        o.iX = -0.5;
        o.iZ = -0.05;
        o.cabYaw = Math.sin(u * 0.9) * 0.14;
        o.cabPitch = 0.05 + Math.sin(u * 0.5) * 0.05;
        o.mirarX = Math.sin(u * 1.4) * 0.8;
        o.ceja = 0.15;
        o.torsoPitch = 0.05;
      },
    },
    cafe: {
      dur: [8, 9],
      texto: () => "Pausa para el café",
      mugEnMano: true,
      pose(u, o) {
        const sube = pulso(u, 0.3, 1.5) * (1 - pulso(u, 5.2, 6.4));
        o.dX = -0.98 + (-1.05) * sube;
        o.dZ = 0.2 * sube;
        o.iX = -0.5;
        o.cabPitch = -0.12 * sube * (Math.sin(u * 3) > 0 ? 1 : 0.6);
        o.torsoPitch = -0.04 * sube;
        o.giro = Y_TRABAJO + 0.5 * pulso(u, 0.2, 1.2) * (1 - pulso(u, 6.4, 7.6));
        o.boca = 0;
        o.sonrisa = 0.8;
        o.guiño = sube > 0.9 && u > 5 && u < 5.5 ? 1 : 0;
      },
    },
    estirar: {
      dur: [6, 7],
      texto: () => "Estirándose: lleva rato liquidando",
      pose(u, o) {
        const s = pulso(u, 0.4, 1.4) * (1 - pulso(u, 4.6, 5.8));
        o.iX = -0.5 + (-2.45) * s;
        o.dX = -0.5 + (-2.45) * s;
        o.iZ = 0.12 + 0.45 * s;
        o.dZ = -0.12 - 0.45 * s;
        o.torsoPitch = -0.2 * s;
        o.cabPitch = -0.22 * s;
        o.sonrisa = 0.2 + 0.7 * s;
        o.boca = s > 0.7 ? 0.35 + Math.sin(u * 5) * 0.1 : 0;
        o.giro = haciaCamara() * 0.5 + Y_TRABAJO * 0.5;
      },
    },
    girar: {
      dur: [3.4, 3.6],
      texto: () => "Girando en la silla mientras esperan nuevas fichadas",
      pose(u, o) {
        const e = pulso(u, 0.3, 2.9);
        o.giro = Y_TRABAJO + e * Math.PI * 2;
        o.iZ = 0.2 + 0.9 * Math.sin(e * Math.PI);
        o.dZ = -0.2 - 0.9 * Math.sin(e * Math.PI);
        o.iX = -0.2;
        o.dX = -0.2;
        o.sonrisa = 1;
        o.boca = 0.4 + 0.2 * Math.sin(u * 8);
        o.rebote = 0.02;
        o.cabRoll = Math.sin(e * Math.PI) * 0.15;
      },
    },
    calendario: {
      dur: [6, 8],
      texto: (i) => (i.feriado ? `Mirando el calendario: próximo feriado: ${i.feriado}` : "Mirando el calendario de feriados"),
      pose(u, o) {
        const g = pulso(u, 0.2, 1.4) * (1 - pulso(u, 5.6, 6.8));
        o.giro = Y_TRABAJO + difAngulo(Y_TRABAJO, haciaPared(-0.4, -3.9)) * g;
        o.iX = -0.5 + (-1.15) * g;
        o.iZ = 0.12 + 0.35 * g;
        o.cabPitch = -0.2 * g;
        o.cabYaw = 0.15 * g;
        o.ceja = 0.5 * g;
      },
    },
    tablero: {
      dur: [6, 8],
      texto: (i) => (i.abiertos ? `Controlando el tablero: ${i.abiertos} ${i.abiertos === 1 ? "aviso abierto" : "avisos abiertos"}` : "Controlando el tablero de RRHH"),
      pose(u, o) {
        const g = pulso(u, 0.2, 1.4) * (1 - pulso(u, 5.6, 6.8));
        o.giro = Y_TRABAJO + difAngulo(Y_TRABAJO, haciaPared(5.7, -3.8)) * g;
        o.cabPitch = -0.16 * g;
        o.ceja = 0.3 * g;
        o.dX = -0.5 + (-0.9) * g;
        o.dZ = -0.12 - 0.5 * g;
      },
    },
    pensar: {
      dur: [6, 8],
      texto: () => "Controlando el presentismo del mes",
      pose(u, o) {
        const g = pulso(u, 0.3, 1.1) * (1 - pulso(u, 5.4, 6.2));
        o.giro = Y_TRABAJO + difAngulo(Y_TRABAJO, haciaCamara()) * 0.7 * g;
        o.iX = -0.5 + -1.25 * g;
        o.iZ = 0.12 - 1.0 * g;
        o.cabRoll = -0.14 * g;
        o.cabPitch = -0.1 * g;
        o.mirarX = 0.7 * g;
        o.mirarY = -0.7 * g;
        o.ceja = 0.5 * g;
        o.sonrisa = 0.15;
      },
    },
    papeles: {
      dur: [8, 10],
      texto: () => "Ordenando recibos y comprobantes",
      papel: true,
      pose(u, o) {
        const g = pulso(u, 0.3, 1.2) * (1 - pulso(u, 7, 8));
        o.giro = Y_TRABAJO + difAngulo(Y_TRABAJO, haciaCamara()) * 0.55 * g;
        o.iX = -0.5 + -0.75 * g;
        o.dX = -0.5 + -0.75 * g;
        o.iZ = 0.12 - 0.5 * g;
        o.dZ = -0.12 + 0.5 * g;
        o.cabPitch = 0.22 * g;
        o.mirarY = -0.6 * g;
        o.mirarX = Math.sin(u * 2.5) * 0.7 * g;
      },
    },
    celular: {
      dur: [6, 8],
      texto: () => "Chequeando mensajes de RRHH",
      celu: true,
      pose(u, o) {
        const g = pulso(u, 0.3, 1.1) * (1 - pulso(u, 5.2, 6));
        o.giro = Y_TRABAJO + difAngulo(Y_TRABAJO, haciaCamara()) * 0.5 * g;
        o.iX = -0.5 + -1.35 * g;
        o.iZ = 0.12 - 0.5 * g;
        o.cabPitch = 0.2 * g;
        o.sonrisa = 0.6 + 0.3 * Math.sin(u * 3);
        o.mirarY = -0.7 * g;
      },
    },
    relajar: {
      dur: [5, 6],
      texto: () => "Tomándose un respiro",
      pose(u, o) {
        const g = pulso(u, 0.4, 1.4) * (1 - pulso(u, 4, 5));
        o.torsoPitch = -0.12 * g;
        o.cabPitch = -0.25 * g;
        o.iX = -0.5 + 0.4 * g;
        o.dX = -0.5 + 0.4 * g;
        o.iZ = 0.12 + 0.5 * g;
        o.dZ = -0.12 - 0.5 * g;
        o.sonrisa = 0.5;
        o.boca = g > 0.8 ? 0.25 : 0;
        o.mirarY = 0.8 * g;
      },
    },
    brazos: {
      dur: [5, 6],
      texto: () => "Esperando que lleguen las fichadas de hoy",
      pose(u, o) {
        const g = pulso(u, 0.3, 1.0) * (1 - pulso(u, 4.2, 5));
        o.giro = Y_TRABAJO + difAngulo(Y_TRABAJO, haciaCamara()) * 0.8 * g;
        o.iX = -0.5 + -0.8 * g;
        o.dX = -0.5 + -0.8 * g;
        o.iZ = 0.12 - 1.05 * g;
        o.dZ = -0.12 + 1.05 * g;
        o.cabRoll = 0.1 * g;
        o.ceja = 0.4 * g;
        o.sonrisa = 0.6;
        o.guiño = g > 0.9 && Math.sin(u * 2) > 0.7 ? 1 : 0;
      },
    },
    saludar: {
      dur: [4, 4.5],
      texto: () => "Te saluda",
      pose(u, o) {
        const g = pulso(u, 0.2, 0.9) * (1 - pulso(u, 3.2, 4));
        o.giro = Y_TRABAJO + difAngulo(Y_TRABAJO, haciaCamara()) * g;
        o.iX = -0.5 + 0.5 * g;
        o.iZ = 0.12 + (2.45 + Math.sin(u * 11) * 0.3) * g;
        o.sonrisa = 0.9;
        o.ceja = 0.6;
        o.boca = g > 0.8 ? 0.25 : 0;
        o.guiño = u > 2.4 && u < 2.9 ? 1 : 0;
      },
    },
    preocupada: {
      dur: [6, 8],
      texto: (i) => `Atenta: ${i.altas} ${i.altas === 1 ? "aviso urgente sin resolver" : "avisos urgentes sin resolver"}`,
      pose(u, o) {
        const g = pulso(u, 0.3, 1.1) * (1 - pulso(u, 5.4, 6.2));
        o.giro = Y_TRABAJO + difAngulo(Y_TRABAJO, haciaCamara()) * 0.6 * g;
        o.iX = -0.5 + -1.9 * g;
        o.iZ = 0.12 - 0.95 * g;
        o.ceja = -0.8 * g;
        o.sonrisa = 0.5 - 1.0 * g;
        o.cabRoll = Math.sin(u * 5) * 0.05 * g;
        o.cabPitch = 0.1 * g;
      },
    },
    celebrar: {
      dur: [4.5, 5],
      texto: () => "Todo en orden: sin avisos pendientes",
      pose(u, o) {
        const g = pulso(u, 0.1, 0.6) * (1 - pulso(u, 3.8, 4.5));
        o.giro = Y_TRABAJO + difAngulo(Y_TRABAJO, haciaCamara()) * g;
        o.iX = -0.5 + (-2.3 + Math.sin(u * 9) * 0.4) * g;
        o.dX = -0.5 + (-2.3 + Math.sin(u * 9 + Math.PI) * 0.4) * g;
        o.iZ = 0.12 + 0.3 * g;
        o.dZ = -0.12 - 0.3 * g;
        o.sonrisa = 1;
        o.boca = 0.5 + Math.sin(u * 9) * 0.15;
        o.ceja = 0.9;
        o.rebote = 0.07 * Math.abs(Math.sin(u * 7)) * g;
        o.cabPitch = -0.1 * g;
      },
    },
  };

  const elegirActividad = (anterior) => {
    const pesos = { teclear: 5, revisar: 3, cafe: 2, estirar: 1.3, girar: 1.3, calendario: 1.4, tablero: 1.6, pensar: 2, papeles: 1.6, celular: 1.2, relajar: 1, brazos: 1, saludar: 0.8 };
    if (info.altas > 0) pesos.preocupada = 3.5;
    if (info.abiertos === 0) pesos.celebrar = 1.4;
    delete pesos[anterior];
    const total = Object.values(pesos).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const [k, w] of Object.entries(pesos)) if ((r -= w) <= 0) return k;
    return "teclear";
  };

  // ----- animación -----
  const ctrl = { estado: "idle", hablando: false, saludo: 0, pulso: 0, nivelExterno: -1, parpT: 2.5, parpV: 0, rasgoT: 0 };
  const act = { id: "teclear", t: 0, dur: 10, previa: "" };
  const pose = POSE0();
  pose.giro = Y_TRABAJO;
  lia.rotation.y = Y_TRABAJO;
  let girosAcum = Y_TRABAJO;
  const puntero = { x: 0, y: 0, dentro: false };
  let t = 0;
  let id = 0;
  let visible = true;
  let destruido = false;
  let textoActual = "";
  let zoom = 1;
  let ultimoReloj = 0;

  const textoEstado = () => {
    if (ctrl.estado === "thinking") return "Armando tu respuesta";
    if (ctrl.hablando || ctrl.estado === "speaking") return "Te está respondiendo";
    if (ctrl.estado === "listening") return "Te está escuchando";
    return ACTIVIDADES[act.id].texto(info);
  };
  const avisarTexto = () => {
    const tx = textoEstado();
    if (tx !== textoActual) {
      textoActual = tx;
      onActividad?.(tx);
    }
  };
  const empezar = (nombre) => {
    if (act.id === "girar") pose.giro = Y_TRABAJO + difAngulo(Y_TRABAJO, pose.giro); // la vuelta completa no se "desenrosca"
    act.previa = act.id;
    act.id = nombre;
    act.t = 0;
    const [a, b] = ACTIVIDADES[nombre].dur;
    act.dur = rnd(a, b);
  };
  const lanzar = (nombre) => {
    empezar(nombre);
    avisarTexto();
  };

  function actualizar(dt) {
    t += dt;
    const atiende = ctrl.estado !== "idle";
    const o = POSE0();
    const a = ACTIVIDADES[act.id];
    let mugEnMano = false;
    let papel = false;
    let celuVisible = false;

    if (atiende) {
      const cam = haciaCamara();
      o.giro = Y_TRABAJO + difAngulo(Y_TRABAJO, cam);
      if (ctrl.estado === "listening") {
        // manos juntas al frente, se inclina, asiente
        o.torsoPitch = 0.14;
        o.cabPitch = 0.06 + Math.max(0, Math.sin(t * 2.1)) * 0.12;
        o.cabRoll = 0.13 + Math.sin(t * 0.8) * 0.03;
        o.ceja = 0.8;
        o.sonrisa = 0.7;
        o.iX = -1.0;
        o.dX = -1.0;
        o.iZ = -0.5;
        o.dZ = 0.5;
        o.mirarY = 0.15;
      } else if (ctrl.estado === "thinking") {
        o.giro += Math.sin(t * 1.3) * 0.35;
        o.cabRoll = -0.15;
        o.cabPitch = -0.1;
        o.cabYaw = 0.25;
        o.ceja = 0.6;
        o.sonrisa = 0.15;
        o.iX = -1.75 + Math.sin(t * 2) * 0.05;
        o.iZ = -0.95;
        o.mirarX = 0.7 * Math.sign(Math.sin(t * 0.7) || 1);
        o.mirarY = -0.8;
        o.torsoPitch = 0.04;
      } else {
        // hablando: gestos que cambian cada ~1,6 s (abre manos, señala, cuenta, encoge hombros)
        const k = Math.floor(t / 1.6) % 4;
        const s = Math.sin(t * 2.6);
        if (k === 0) {
          o.iX = -0.95 + s * 0.4;
          o.iZ = 0.2 + s * 0.2;
          o.dX = -0.7;
          o.dZ = -0.2;
        } else if (k === 1) {
          o.iX = -0.9 + s * 0.25;
          o.dX = -0.9 - s * 0.25;
          o.iZ = 0.7;
          o.dZ = -0.7;
        } else if (k === 2) {
          o.dX = -1.3 + s * 0.3;
          o.dZ = -0.15 + s * 0.15;
          o.iX = -0.5;
        } else {
          o.iX = -0.7 + s * 0.2;
          o.dX = -0.7 - s * 0.2;
          o.iZ = 0.5;
          o.dZ = -0.5;
          o.torsoPitch = -0.03;
        }
        o.cabPitch = Math.sin(t * 3.1) * 0.06;
        o.cabRoll = Math.sin(t * 1.3) * 0.08;
        o.cabYaw = Math.sin(t * 0.9) * 0.12;
        o.torsoPitch += 0.03 + Math.sin(t * 2.4) * 0.025;
        o.sonrisa = 0.65;
        o.ceja = 0.25 + Math.max(0, Math.sin(t * 2.6)) * 0.4;
      }
      escribiendoPantalla = 0;
    } else {
      act.t += dt;
      escribiendoPantalla = 0;
      a.pose(act.t, o);
      mugEnMano = !!a.mugEnMano && act.t > 0.5 && act.t < 6.6;
      papel = !!a.papel && act.t > 0.8 && act.t < 7.4;
      celuVisible = !!a.celu && act.t > 0.6 && act.t < 5.6;
      if (act.t >= act.dur) {
        if (act.id === "celebrar" || act.id === "preocupada" || act.id === "saludar") empezar("teclear");
        else empezar(elegirActividad(act.id));
        avisarTexto();
      }
      if (ctrl.saludo > 0) {
        ctrl.saludo -= dt;
        o.giro = Y_TRABAJO + difAngulo(Y_TRABAJO, haciaCamara());
        o.iZ = 2.5 + Math.sin(t * 11) * 0.3;
        o.iX = 0;
        o.sonrisa = 1;
        o.ceja = 0.7;
        o.cabRoll = 0.12;
      }
    }
    if (ctrl.saludo > 0 && atiende) ctrl.saludo = 0;

    // boca: con la voz real (nivel del audio) o con un ritmo de sílabas
    if (ctrl.hablando) {
      if (ctrl.nivelExterno >= 0) o.boca = clamp(ctrl.nivelExterno * 1.6, 0, 1);
      else {
        const silaba = 0.5 + 0.5 * Math.sin(t * 13 + Math.sin(t * 3.1) * 2);
        const pausa = 0.55 + 0.45 * Math.sin(t * 4.7);
        o.boca = clamp(silaba * pausa * 1.15 + ctrl.pulso * 0.5, 0, 1);
      }
      o.forma = Math.sin(t * 7.3) > 0.55 ? 1 : 0;
    } else o.forma = 0;
    ctrl.pulso = Math.max(0, ctrl.pulso - dt * 4);

    // mirada hacia el puntero cuando está de cara a la cámara
    if (puntero.dentro && (atiende || Math.abs(difAngulo(pose.giro, haciaCamara())) < 0.5) && ctrl.estado !== "thinking") {
      o.cabYaw += puntero.x * 0.6;
      o.cabPitch += -puntero.y * 0.22;
      o.mirarX += puntero.x * 0.8;
      o.mirarY += -puntero.y * 0.6;
    }
    // respiración y microgestos
    o.torsoPitch += Math.sin(t * 1.6) * 0.012;
    o.cabRoll += Math.sin(t * 0.55) * 0.02;

    for (const k of Object.keys(o)) {
      if (k === "giro") continue;
      pose[k] = amortiguar(pose[k] ?? 0, o[k], k === "boca" ? 24 : k === "guiño" ? 30 : 8, dt);
    }
    // el giro de la silla se interpola por el camino corto, o directo si es una vuelta completa
    const objetivoGiro = o.giro;
    pose.giro = amortiguar(pose.giro, objetivoGiro, act.id === "girar" && !atiende ? 30 : 5, dt);
    girosAcum = pose.giro;
    lia.rotation.y = girosAcum;

    // aplicar
    tronco.rotation.x = pose.torsoPitch;
    tronco.rotation.z = pose.torsoRoll;
    tronco.position.y = 1.55 + pose.rebote;
    cabeza.rotation.set(pose.cabPitch, pose.cabYaw, pose.cabRoll);
    brazoI.pivote.rotation.set(pose.iX, 0, pose.iZ);
    brazoD.pivote.rotation.set(pose.dX, 0, pose.dZ);
    tazaMano.visible = mugEnMano;
    tazaEscr.visible = !mugEnMano;
    celu.visible = celuVisible;
    hojaMano.visible = papel;
    burbujas.visible = ctrl.estado === "thinking";
    if (burbujas.visible) burbujas.children.forEach((b, i) => (b.position.y = 5.4 + i * 0.35 + Math.sin(t * 3 + i) * 0.06));
    burbujas.rotation.y = -lia.rotation.y;

    // cara
    ctrl.parpT -= dt;
    if (ctrl.parpT <= 0) {
      ctrl.parpV = 0.16;
      ctrl.parpT = rnd(2, 5);
    }
    if (ctrl.parpV > 0) ctrl.parpV -= dt;
    ec.parp = ctrl.parpV > 0 ? clamp(1 - Math.abs(ctrl.parpV / 0.08 - 1), 0, 1) : 0;
    ec.boca = pose.boca;
    ec.forma = o.forma;
    ec.sonrisa = pose.sonrisa;
    ec.ceja = pose.ceja;
    ec.mirarX = pose.mirarX;
    ec.mirarY = pose.mirarY;
    ec.guiño = pose.guiño;
    pj.actualizar?.(dt);
    refrescarCara(false);

    // monitor, tablero, reloj
    if (t - ultimoReloj > 0.5) {
      ultimoReloj = t;
      dibujarPantalla(t);
      dibujarTV(t);
    }
    if (Math.floor(t / 30) !== Math.floor((t - dt) / 30)) {
      dibujarReloj();
      dibujarCielo();
    }

    // confeti
    if (confetiT > 0) {
      confetiT -= dt;
      parts.forEach((q, i) => {
        q.vida -= dt;
        q.v.y -= 9 * dt;
        q.p.addScaledVector(q.v, dt);
        q.r.addScaledVector(q.vr, dt);
        if (q.p.y < 0.2) {
          q.p.y = 0.2;
          q.v.set(0, 0, 0);
          q.vr.multiplyScalar(0.2);
        }
        dummy.position.copy(q.p);
        dummy.rotation.set(q.r.x, q.r.y, q.r.z);
        dummy.scale.setScalar(q.vida > 0.4 ? 1 : Math.max(0.001, q.vida / 0.4));
        dummy.updateMatrix();
        confeti.setMatrixAt(i, dummy.matrix);
      });
      confeti.instanceMatrix.needsUpdate = true;
      if (confetiT <= 0) confeti.visible = false;
    }

    // cámara: acercamiento suave cuando habla y un balanceo sutil si nadie la mueve
    zoom = amortiguar(zoom, ctrl.hablando ? 1.1 : atiende ? 1.05 : 1, 2.5, dt);
    camera.zoom = zoom * (window.__liaZoomBase || 1.5);
    camera.updateProjectionMatrix();
    if (performance.now() / 1000 - ultimoToque > 6) controles.target.x = TARGET.x + Math.sin(t * 0.25) * 0.15;
    controles.update();
  }

  function ajustar() {
    const w = contenedor.clientWidth || 1;
    const h = contenedor.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // en formatos angostos abre el campo para que entren Lía y su escritorio
    // encuadre automático: siempre entran Lía, su escritorio, el logo y el calendario, sea cual sea la forma del recuadro
    camera.fov = camera.aspect >= 1.15 ? 32 : Math.min(52, 32 + (1.15 - camera.aspect) * 28);
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max(3.7 / tanV, 3.3 / (tanV * camera.aspect)) * 1.06 + 1.2;
    controles.minDistance = dist * 0.55;
    controles.maxDistance = dist * 1.3;
    camera.position.copy(controles.target).addScaledVector(DIR_CAM, dist);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(ajustar);
  ro.observe(contenedor);
  ajustar();

  const reloj3 = new THREE.Clock();
  function bucle() {
    id = requestAnimationFrame(bucle);
    if (!visible || document.hidden) {
      reloj3.getDelta();
      return;
    }
    actualizar(Math.min(window.__liaDtMax || 0.05, reloj3.getDelta()));
    renderer.render(scene, camera);
  }
  const io = new IntersectionObserver((e) => (visible = e[0]?.isIntersecting !== false));
  io.observe(contenedor);
  avisarTexto();
  bucle();

  // puntero: mirada + clic en Lía para saludar
  const rayo = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let inicio = null;
  const calcNdc = (ev) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    return ndc;
  };
  const alMover = (ev) => {
    const p = calcNdc(ev);
    puntero.x = p.x;
    puntero.y = p.y;
    puntero.dentro = true;
  };
  const alSalir = () => (puntero.dentro = false);
  const alBajar = (ev) => (inicio = { x: ev.clientX, y: ev.clientY, t: performance.now() });
  const alSubir = (ev) => {
    if (!inicio) return;
    const mov = Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y);
    const dur = performance.now() - inicio.t;
    inicio = null;
    if (mov > 7 || dur > 450) return;
    rayo.setFromCamera(calcNdc(ev), camera);
    if (rayo.intersectObject(lia, true).length) {
      if (ctrl.estado === "idle") lanzar("saludar");
      onSaludo?.();
    }
  };
  const el = renderer.domElement;
  el.addEventListener("pointermove", alMover);
  el.addEventListener("pointerleave", alSalir);
  el.addEventListener("pointerdown", alBajar);
  el.addEventListener("pointerup", alSubir);

  return {
    setEstado(e) {
      if (e === ctrl.estado) return;
      const venia = ctrl.estado;
      ctrl.estado = e;
      if (e === "idle" && venia !== "idle") empezar("teclear");
      avisarTexto();
    },
    hablando(b) {
      ctrl.hablando = !!b;
      if (!b) ctrl.nivelExterno = -1;
      avisarTexto();
    },
    nivelVoz(n) {
      ctrl.nivelExterno = n;
    },
    pulso() {
      ctrl.pulso = 1;
    },
    saludar() {
      if (ctrl.estado === "idle") lanzar("saludar");
    },
    celebrar() {
      lanzarConfeti();
      if (ctrl.estado === "idle") lanzar("celebrar");
    },
    setInfo(i) {
      const antes = info.abiertos;
      info.abiertos = Number(i?.abiertos) || 0;
      info.altas = Number(i?.altas) || 0;
      info.operarios = Number(i?.operarios) || 0;
      info.feriado = i?.feriado || "";
      dibujarTV(t);
      if (antes > 0 && info.abiertos === 0) {
        lanzarConfeti();
        if (ctrl.estado === "idle") lanzar("celebrar");
      }
      avisarTexto();
    },
    destruir() {
      if (destruido) return;
      destruido = true;
      cancelAnimationFrame(id);
      ro.disconnect();
      io.disconnect();
      el.removeEventListener("pointermove", alMover);
      el.removeEventListener("pointerleave", alSalir);
      el.removeEventListener("pointerdown", alBajar);
      el.removeEventListener("pointerup", alSubir);
      controles.dispose();
      scene.traverse((ob) => {
        if (ob.geometry) ob.geometry.dispose();
        const mats = Array.isArray(ob.material) ? ob.material : ob.material ? [ob.material] : [];
        for (const m of mats) {
          m.map?.dispose?.();
          m.dispose();
        }
      });
      entorno.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    },
  };
}
