// Escena 3D de Lía: una minifigura estilo LEGO en una oficina de ladrillos.
// Se carga recién cuando se abre el módulo (import dinámico), así three.js no pesa en el resto de la app.
//
// Estados: "idle" (hace sus cosas, camina por la oficina), "listening" (el usuario está escribiendo o dictando:
// se acerca, se inclina, toma nota y asiente), "thinking" (procesando), "speaking" (habla con gestos y boca).
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export function soportaWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

// ---------- utilidades ----------
const COLOR = {
  piel: 0xf2cd37,
  pelo: 0x6a3a1f,
  saco: 0x2b2e3b,
  pantalon: 0x1c1d24,
  naranja: 0xff5a00,
  amarillo: 0xffd60a,
  blanco: 0xf4f1ea,
  suelo: 0x17181d,
  pared: 0x1d1f27,
};

const plastico = (color, extra = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.34, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.3, ...extra });

const sombra = (m) => {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};
const caja = (w, h, d, mat, r = 0.06) => sombra(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), mat));
const cilindro = (rt, rb, h, mat, seg = 32) => sombra(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat));
const amortiguar = (actual, objetivo, k, dt) => actual + (objetivo - actual) * (1 - Math.exp(-k * dt));
const difAngulo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const rnd = (a, b) => a + Math.random() * (b - a);

function textura(w, h, dibujar) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  dibujar(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { canvas, ctx, tex };
}

function elipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

// ---------- cara (se redibuja al parpadear, hablar o mirar) ----------
function dibujarCara(ctx, W, H, e) {
  ctx.clearRect(0, 0, W, H);
  // mejillas
  ctx.fillStyle = "rgba(255,110,100,0.32)";
  elipse(ctx, W * 0.2, H * 0.64, 30, 15);
  ctx.fill();
  elipse(ctx, W * 0.8, H * 0.64, 30, 15);
  ctx.fill();
  for (const sx of [0.35, 0.65]) {
    const dir = sx < 0.5 ? -1 : 1;
    const x = W * sx + e.mirarX * 7;
    const y = H * 0.45 + e.mirarY * 6;
    const ry = Math.max(2.5, 17 * (1 - e.parp));
    ctx.fillStyle = "#1b1410";
    elipse(ctx, x, y, 12.5, ry);
    ctx.fill();
    if (e.parp < 0.5) {
      ctx.fillStyle = "#fff";
      elipse(ctx, x - 4, y - 6, 3.6, 3.6);
      ctx.fill();
    }
    // pestañas
    ctx.strokeStyle = "#1b1410";
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    for (const [dx, dy] of [[12, -8], [15, -1], [11, -14]]) {
      ctx.beginPath();
      ctx.moveTo(x + dir * 10, y - ry * 0.45);
      ctx.lineTo(x + dir * dx + dir * 6, y - ry - 2 + dy * 0.6);
      ctx.stroke();
    }
    // cejas
    const yb = H * 0.285 - e.ceja * 16;
    ctx.strokeStyle = "#4a2813";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x - 24, yb + 5 + e.ceja * 2 * -dir * 0);
    ctx.quadraticCurveTo(x, yb - 7 - e.ceja * 6, x + 24, yb + 4 - e.ceja * 4 * dir);
    ctx.stroke();
    // anteojos
    ctx.strokeStyle = "#2a1a12";
    ctx.lineWidth = 5;
    elipse(ctx, W * sx, H * 0.45, 37, 31);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fill();
  }
  ctx.strokeStyle = "#2a1a12";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(W * 0.5 - 15, H * 0.43);
  ctx.quadraticCurveTo(W * 0.5, H * 0.4, W * 0.5 + 15, H * 0.43);
  ctx.stroke();
  // boca
  const cx = W * 0.5;
  const cy = H * 0.74;
  const ancho = 36 + e.sonrisa * 26;
  if (e.boca > 0.1) {
    const abre = 7 + e.boca * 25;
    ctx.fillStyle = "#4d101a";
    ctx.beginPath();
    ctx.moveTo(cx - ancho * 0.8, cy - 2);
    ctx.quadraticCurveTo(cx, cy - 6 + (e.sonrisa * 3), cx + ancho * 0.8, cy - 2);
    ctx.quadraticCurveTo(cx, cy + abre * 2 - 2, cx - ancho * 0.8, cy - 2);
    ctx.fill();
    if (e.boca > 0.35) {
      ctx.fillStyle = "#ff8a80";
      elipse(ctx, cx, cy + abre * 1.25, ancho * 0.36, abre * 0.32);
      ctx.fill();
    }
    ctx.strokeStyle = "#c0262c";
    ctx.lineWidth = 6;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(cx - ancho * 0.8, cy - 2);
    ctx.quadraticCurveTo(cx, cy - 6 + e.sonrisa * 3, cx + ancho * 0.8, cy - 2);
    ctx.quadraticCurveTo(cx, cy + abre * 2 - 2, cx - ancho * 0.8, cy - 2);
    ctx.stroke();
  } else {
    ctx.strokeStyle = "#c0262c";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(cx - ancho, cy - e.sonrisa * 2);
    ctx.quadraticCurveTo(cx, cy + 6 + 26 * e.sonrisa, cx + ancho, cy - e.sonrisa * 2);
    ctx.stroke();
  }
}

// ---------- remera / saco con credencial ----------
function dibujarTorso(ctx, W, H) {
  ctx.clearRect(0, 0, W, H);
  // blusa en V
  ctx.fillStyle = "#f4f1ea";
  ctx.beginPath();
  ctx.moveTo(W * 0.34, 0);
  ctx.lineTo(W * 0.66, 0);
  ctx.lineTo(W * 0.5, H * 0.42);
  ctx.closePath();
  ctx.fill();
  // solapas
  ctx.fillStyle = "#363a4b";
  ctx.beginPath();
  ctx.moveTo(W * 0.34, 0);
  ctx.lineTo(W * 0.5, H * 0.42);
  ctx.lineTo(W * 0.33, H * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W * 0.66, 0);
  ctx.lineTo(W * 0.5, H * 0.42);
  ctx.lineTo(W * 0.67, H * 0.3);
  ctx.closePath();
  ctx.fill();
  // costura central y botones
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W * 0.5, H * 0.42);
  ctx.lineTo(W * 0.5, H);
  ctx.stroke();
  ctx.fillStyle = "#FF5A00";
  for (const y of [0.58, 0.76]) {
    ctx.beginPath();
    ctx.arc(W * 0.46, H * y, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // cordón naranja + credencial
  ctx.strokeStyle = "#FF5A00";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(W * 0.37, 0);
  ctx.lineTo(W * 0.62, H * 0.5);
  ctx.moveTo(W * 0.63, 0);
  ctx.lineTo(W * 0.64, H * 0.5);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.roundRect(W * 0.55, H * 0.5, W * 0.18, H * 0.2, 6);
  ctx.fill();
  ctx.fillStyle = "#FF5A00";
  ctx.fillRect(W * 0.55, H * 0.5, W * 0.18, H * 0.05);
  ctx.fillStyle = "#222";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("LÍA", W * 0.64, H * 0.64);
}

// ---------- escena ----------
export function crearEscena(contenedor, { onSaludo } = {}) {
  const movil = window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 700;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, movil ? 1.75 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:pan-y;outline:none";
  contenedor.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const entorno = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = entorno.texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  camera.position.set(1.6, 5.0, 14);
  const controles = new OrbitControls(camera, renderer.domElement);
  controles.target.set(0, 2.3, 0);
  controles.enableDamping = true;
  controles.dampingFactor = 0.08;
  controles.enablePan = false;
  controles.minDistance = 6;
  controles.maxDistance = 19;
  controles.minPolarAngle = 0.35;
  controles.maxPolarAngle = Math.PI / 2 - 0.06;
  controles.minAzimuthAngle = -1.25;
  controles.maxAzimuthAngle = 1.25;
  controles.rotateSpeed = 0.7;
  controles.update();

  // luces
  scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x20222a, 0.7));
  const sol = new THREE.DirectionalLight(0xfff2e0, 2.4);
  sol.position.set(5, 10, 7);
  sol.castShadow = true;
  const res = movil ? 1024 : 2048;
  sol.shadow.mapSize.set(res, res);
  Object.assign(sol.shadow.camera, { left: -9, right: 9, top: 8, bottom: -8, near: 1, far: 30 });
  sol.shadow.bias = -0.0005;
  sol.shadow.normalBias = 0.03;
  scene.add(sol);
  const relleno = new THREE.PointLight(0xff7a2a, 18, 14, 2);
  relleno.position.set(-3.6, 3.4, -0.6);
  scene.add(relleno);

  // ----- piso y pared de ladrillos -----
  const mundo = new THREE.Group();
  scene.add(mundo);
  const matSuelo = plastico(COLOR.suelo, { roughness: 0.5, clearcoat: 0.2 });
  const piso = caja(17, 0.5, 12, matSuelo, 0.2);
  piso.position.set(0, -0.25, -0.4);
  mundo.add(piso);
  const studGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.13, 16);
  const filasX = 20;
  const filasZ = 14;
  const studs = new THREE.InstancedMesh(studGeo, plastico(0x20222a, { roughness: 0.45 }), filasX * filasZ);
  studs.castShadow = true;
  studs.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  let n = 0;
  for (let i = 0; i < filasX; i++)
    for (let j = 0; j < filasZ; j++) {
      m4.makeTranslation(-7.6 + i * 0.8, 0.065, -5.6 + j * 0.8 + 0.1);
      studs.setMatrixAt(n++, m4);
    }
  mundo.add(studs);

  const pared = caja(17, 7.4, 0.5, plastico(COLOR.pared, { roughness: 0.55, clearcoat: 0.15 }), 0.15);
  pared.position.set(0, 3.7, -6.3);
  mundo.add(pared);
  // zócalo naranja
  const zocalo = caja(17, 0.4, 0.62, plastico(COLOR.naranja), 0.1);
  zocalo.position.set(0, 0.2, -6.25);
  mundo.add(zocalo);

  // cartel "RRHH · LIQUIDACIONES"
  const cartel = textura(512, 128, (ctx, w, h) => {
    ctx.fillStyle = "#101116";
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 22);
    ctx.fill();
    ctx.strokeStyle = "#FF5A00";
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = "#FFD60A";
    ctx.font = "800 40px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("RRHH · LIQUIDACIONES", w / 2, h * 0.64);
  });
  const cartelMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshBasicMaterial({ map: cartel.tex, toneMapped: false }));
  cartelMesh.position.set(0.2, 5.5, -6.02);
  mundo.add(cartelMesh);

  // calendario de pared
  const cal = textura(256, 300, (ctx, w, h) => {
    ctx.fillStyle = "#f4f1ea";
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 14);
    ctx.fill();
    ctx.fillStyle = "#FF5A00";
    ctx.fillRect(0, 0, w, 62);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 34px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("FERIADOS", w / 2, 43);
    ctx.fillStyle = "#333";
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 7; c++) {
        const marcado = (r === 2 && c === 3) || (r === 4 && c === 0);
        if (marcado) {
          ctx.fillStyle = "#FF5A00";
          ctx.beginPath();
          ctx.arc(24 + c * 34, 98 + r * 38, 14, 0, 7);
          ctx.fill();
        }
        ctx.fillStyle = marcado ? "#fff" : "#444";
        ctx.font = "16px sans-serif";
        ctx.fillText(String(r * 7 + c + 1), 24 + c * 34, 104 + r * 38);
      }
  });
  const calMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.2), new THREE.MeshBasicMaterial({ map: cal.tex, toneMapped: false }));
  calMesh.position.set(-6.1, 4.1, -6.02);
  mundo.add(calMesh);

  // ----- escritorio con monitor -----
  const escritorio = new THREE.Group();
  escritorio.position.set(-3.7, 0, -3.1);
  mundo.add(escritorio);
  const tablero = caja(4.0, 0.22, 1.7, plastico(0xe9e4d8), 0.08);
  tablero.position.y = 1.75;
  escritorio.add(tablero);
  for (const x of [-1.8, 1.8]) {
    const pata = caja(0.22, 1.7, 1.5, plastico(COLOR.naranja), 0.06);
    pata.position.set(x, 0.85, 0);
    escritorio.add(pata);
  }
  const cajonera = caja(1.3, 1.4, 1.5, plastico(COLOR.amarillo), 0.08);
  cajonera.position.set(1.0, 0.7, 0);
  escritorio.add(cajonera);
  for (const y of [0.35, 1.05]) {
    const tirador = caja(0.6, 0.1, 0.08, plastico(0x333333), 0.03);
    tirador.position.set(1.0, y, 0.78);
    escritorio.add(tirador);
  }
  // monitor
  const pantalla = textura(384, 240, () => {});
  const monitor = new THREE.Group();
  monitor.position.set(-0.4, 1.86, -0.1);
  escritorio.add(monitor);
  const marco = caja(2.0, 1.35, 0.14, plastico(0x16171c), 0.06);
  marco.position.y = 1.0;
  monitor.add(marco);
  const pie = cilindro(0.1, 0.12, 0.45, plastico(0x16171c));
  pie.position.y = 0.22;
  monitor.add(pie);
  const base = cilindro(0.5, 0.5, 0.06, plastico(0x16171c));
  base.position.y = 0.03;
  monitor.add(base);
  const vidrio = new THREE.Mesh(new THREE.PlaneGeometry(1.84, 1.18), new THREE.MeshBasicMaterial({ map: pantalla.tex, toneMapped: false }));
  vidrio.position.set(0, 1.0, 0.075);
  monitor.add(vidrio);
  // teclado, taza y papeles
  const teclado = caja(1.3, 0.07, 0.4, plastico(0x2a2c35), 0.03);
  teclado.position.set(-0.4, 1.89, 0.5);
  escritorio.add(teclado);
  const taza = cilindro(0.17, 0.15, 0.3, plastico(COLOR.blanco));
  taza.position.set(-1.55, 1.98, 0.3);
  escritorio.add(taza);
  const papeles = caja(0.7, 0.14, 0.9, plastico(0xffffff), 0.02);
  papeles.position.set(0.9, 1.93, 0.35);
  papeles.rotation.y = 0.2;
  escritorio.add(papeles);
  relleno.position.set(-3.5, 3.4, -1.4);

  const infoPantalla = { abiertos: 0, altas: 0 };
  let ultimaPantalla = 0;
  const dibujarPantalla = (t) => {
    const { ctx, tex } = pantalla;
    const W = 384;
    const H = 240;
    ctx.fillStyle = "#0e1117";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#FF5A00";
    ctx.fillRect(0, 0, W, 34);
    ctx.fillStyle = "#0a0a0c";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Lía · Liquidaciones", 12, 24);
    for (let i = 0; i < 7; i++) {
      const alto = 30 + 70 * (0.5 + 0.5 * Math.sin(t * 0.8 + i * 0.9)) * (0.6 + 0.4 * ((i * 37) % 5) / 5);
      ctx.fillStyle = i % 3 === 0 ? "#FFD60A" : "#2e6bff";
      ctx.fillRect(14 + i * 30, 190 - alto, 22, alto);
    }
    ctx.fillStyle = "#ccc";
    ctx.font = "15px sans-serif";
    ctx.fillText("Horas · extras · presentismo", 12, 214);
    ctx.textAlign = "right";
    ctx.font = "bold 44px sans-serif";
    ctx.fillStyle = infoPantalla.altas > 0 ? "#ff5d5d" : infoPantalla.abiertos > 0 ? "#FFD60A" : "#4ade80";
    ctx.fillText(String(infoPantalla.abiertos), W - 20, 110);
    ctx.font = "15px sans-serif";
    ctx.fillStyle = "#aaa";
    ctx.fillText(infoPantalla.abiertos === 1 ? "aviso abierto" : "avisos abiertos", W - 20, 135);
    tex.needsUpdate = true;
  };
  dibujarPantalla(0);

  // ----- planta, archivero y ladrillos -----
  const planta = new THREE.Group();
  planta.position.set(4.6, 0, -3.6);
  mundo.add(planta);
  const maceta = cilindro(0.55, 0.42, 0.85, plastico(COLOR.naranja));
  maceta.position.y = 0.43;
  planta.add(maceta);
  const verde = plastico(0x2fae4a, { roughness: 0.4 });
  for (const [x, y, z, s] of [[0, 1.45, 0, 0.62], [-0.3, 1.15, 0.12, 0.42], [0.3, 1.2, -0.1, 0.45], [0.05, 1.9, 0.05, 0.38]]) {
    const hoja = sombra(new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), verde));
    hoja.position.set(x, y, z);
    planta.add(hoja);
  }
  const archivero = new THREE.Group();
  archivero.position.set(2.6, 0, -4.6);
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
    const g = new THREE.Group();
    const b = caja(w * 0.8, 0.5, d * 0.8, plastico(color), 0.04);
    b.position.y = 0.25;
    g.add(b);
    for (let i = 0; i < w; i++)
      for (let j = 0; j < d; j++) {
        const s = cilindro(0.2, 0.2, 0.14, plastico(color), 14);
        s.position.set((i - (w - 1) / 2) * 0.8, 0.57, (j - (d - 1) / 2) * 0.8);
        g.add(s);
      }
    g.position.set(x, 0.13, z);
    g.rotation.y = ry;
    mundo.add(g);
  };
  ladrillo(4, 2, COLOR.naranja, 4.4, 1.7, -0.3);
  ladrillo(2, 2, COLOR.amarillo, 5.2, 0.4, 0.5);
  ladrillo(2, 1, 0x2e6bff, -5.4, 1.6, 0.35);
  ladrillo(3, 1, 0xe03a3a, -4.6, 2.5, -0.15);

  // ----- Lía -----
  const lia = new THREE.Group();
  mundo.add(lia);
  const matPiel = plastico(COLOR.piel);
  const matSaco = plastico(COLOR.saco);
  const matPantalon = plastico(COLOR.pantalon);
  const matPelo = plastico(COLOR.pelo, { roughness: 0.28, clearcoat: 0.7 });

  const piernas = [];
  for (const lado of [1, -1]) {
    const pivote = new THREE.Group();
    pivote.position.set(lado * 0.41, 1.1, 0);
    const pierna = caja(0.78, 1.1, 0.86, matPantalon, 0.07);
    pierna.position.y = -0.55;
    pivote.add(pierna);
    // zapatos (la minifigura lleva los pies moldeados en la pierna)
    const pie2 = caja(0.78, 0.2, 0.94, plastico(0x101012), 0.06);
    pie2.position.set(0, -1.0, 0.04);
    pivote.add(pie2);
    lia.add(pivote);
    piernas.push(pivote);
  }
  const cadera = caja(1.6, 0.5, 0.92, matPantalon, 0.07);
  cadera.position.y = 1.3;
  lia.add(cadera);

  const tronco = new THREE.Group();
  tronco.position.y = 1.55; // pivote en la cintura
  lia.add(tronco);
  const torso = caja(1.6, 1.5, 0.9, matSaco, 0.09);
  torso.position.y = 0.75;
  tronco.add(torso);
  const torsoDecal = textura(256, 240, dibujarTorso);
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(1.52, 1.42),
    new THREE.MeshStandardMaterial({ map: torsoDecal.tex, transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  decal.position.set(0, 0.75, 0.456);
  tronco.add(decal);
  const cuello = cilindro(0.22, 0.24, 0.2, matPiel, 20);
  cuello.position.y = 1.58;
  tronco.add(cuello);

  // brazos (pivote en el hombro)
  const hacerBrazo = (lado) => {
    const pivote = new THREE.Group();
    pivote.position.set(lado * 1.0, 1.38, 0);
    const manga = cilindro(0.22, 0.2, 1.0, matSaco, 24);
    manga.position.y = -0.5;
    pivote.add(manga);
    const mano = new THREE.Group();
    mano.position.y = -1.08;
    const arco = sombra(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.085, 10, 22, Math.PI * 1.6), matPiel));
    arco.rotation.set(Math.PI / 2, 0, Math.PI * 0.2);
    mano.add(arco);
    const muneca = cilindro(0.15, 0.15, 0.14, matPiel, 16);
    muneca.position.y = 0.1;
    mano.add(muneca);
    pivote.add(mano);
    tronco.add(pivote);
    return { pivote, mano };
  };
  const brazoI = hacerBrazo(1);
  const brazoD = hacerBrazo(-1);

  // carpeta con sujetapapeles en la mano derecha
  const carpeta = new THREE.Group();
  carpeta.position.set(0.03, -0.08, 0.34);
  carpeta.rotation.set(0.2, 0, 0);
  const tablaCarp = caja(0.95, 1.25, 0.08, plastico(0xb98b4f), 0.03);
  carpeta.add(tablaCarp);
  const hojaCarp = caja(0.8, 1.08, 0.03, plastico(0xffffff), 0.01);
  hojaCarp.position.z = 0.05;
  carpeta.add(hojaCarp);
  const clip = caja(0.4, 0.14, 0.07, plastico(COLOR.naranja), 0.02);
  clip.position.set(0, 0.62, 0.08);
  carpeta.add(clip);
  const lineas = textura(128, 160, (ctx, w, h) => {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#9aa";
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(14, 28 + i * 16);
      ctx.lineTo(i % 3 === 2 ? 70 : 112, 28 + i * 16);
      ctx.stroke();
    }
    ctx.fillStyle = "#FF5A00";
    ctx.fillRect(14, 12, 40, 7);
  });
  const hojaTxt = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 1.0), new THREE.MeshBasicMaterial({ map: lineas.tex, toneMapped: false }));
  hojaTxt.position.z = 0.068;
  carpeta.add(hojaTxt);
  brazoD.mano.add(carpeta);

  // cabeza (pivote en el cuello)
  const cabeza = new THREE.Group();
  cabeza.position.y = 1.68;
  tronco.add(cabeza);
  const RH = 0.58;
  const HH = 0.8;
  const craneo = cilindro(RH, RH, HH, matPiel, 48);
  craneo.position.y = HH / 2;
  cabeza.add(craneo);
  const tacho = cilindro(0.22, 0.22, 0.14, matPiel, 20);
  tacho.position.y = HH + 0.07;
  cabeza.add(tacho);
  const cara = textura(512, 326, () => {});
  const estadoCara = { parp: 0, boca: 0, sonrisa: 0.5, ceja: 0, mirarX: 0, mirarY: 0 };
  let claveCara = "";
  const refrescarCara = (forzar) => {
    const clave = [estadoCara.parp, estadoCara.boca, estadoCara.sonrisa, estadoCara.ceja, estadoCara.mirarX, estadoCara.mirarY].map((v) => Math.round(v * 8)).join("|");
    if (clave === claveCara && !forzar) return;
    claveCara = clave;
    dibujarCara(cara.ctx, 512, 326, estadoCara);
    cara.tex.needsUpdate = true;
  };
  refrescarCara(true);
  const arcoCara = (Math.PI * 2) / 3;
  const decalCara = new THREE.Mesh(
    new THREE.CylinderGeometry(RH + 0.004, RH + 0.004, HH, 40, 1, true, -arcoCara / 2, arcoCara),
    new THREE.MeshStandardMaterial({ map: cara.tex, transparent: true, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  decalCara.position.y = HH / 2;
  cabeza.add(decalCara);
  // pelo: cúpula + caída trasera + flequillo + mechones
  const domo = sombra(new THREE.Mesh(new THREE.SphereGeometry(RH + 0.06, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), matPelo));
  domo.scale.y = 0.5;
  domo.position.y = HH - 0.02;
  cabeza.add(domo);
  const nuca = sombra(new THREE.Mesh(new THREE.CylinderGeometry(RH + 0.06, RH + 0.06, HH - 0.05, 40, 1, true, (Math.PI * 70) / 180, (Math.PI * 220) / 180), matPelo));
  nuca.material = matPelo.clone();
  nuca.material.side = THREE.DoubleSide;
  nuca.position.y = (HH - 0.05) / 2 + 0.05;
  cabeza.add(nuca);
  const flequillo = sombra(new THREE.Mesh(new THREE.CylinderGeometry(RH + 0.05, RH + 0.05, 0.18, 40, 1, true, (-Math.PI * 80) / 180, (Math.PI * 160) / 180), matPelo.clone()));
  flequillo.material.side = THREE.DoubleSide;
  flequillo.position.y = HH - 0.07;
  cabeza.add(flequillo);
  const melena = caja(1.3, 1.5, 0.34, matPelo, 0.14);
  melena.position.set(0, 0.0, -RH - 0.02);
  cabeza.add(melena);
  const puntas = caja(1.2, 0.3, 0.32, matPelo, 0.13);
  puntas.position.set(0, -0.78, -RH + 0.02);
  cabeza.add(puntas);
  const tachoPelo = cilindro(0.2, 0.2, 0.12, matPelo, 18);
  tachoPelo.position.y = HH + RH * 0.5 * 0.5 + 0.12;
  cabeza.add(tachoPelo);
  const moño = caja(0.34, 0.2, 0.14, plastico(COLOR.naranja), 0.05);
  moño.position.set(0.5, HH - 0.08, 0.28);
  moño.rotation.set(0, -0.6, -0.4);
  cabeza.add(moño);

  // burbujas de "pensando"
  const burbujas = new THREE.Group();
  const matBurb = plastico(0xffffff, { roughness: 0.2 });
  [0.12, 0.17, 0.23].forEach((r, i) => {
    const b = sombra(new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), matBurb));
    b.position.set(0.85 + i * 0.35, 5.2 + i * 0.35, 0);
    burbujas.add(b);
  });
  burbujas.visible = false;
  lia.add(burbujas);

  // ----- animación -----
  const PUNTOS = {
    centro: { x: 0.2, z: 1.0, yaw: 0 },
    escritorio: { x: -3.5, z: -1.1, yaw: Math.PI, tarea: "teclear" },
    planta: { x: 4.1, z: -1.8, yaw: Math.PI * 0.85, tarea: "admirar" },
    archivero: { x: 2.3, z: -2.8, yaw: Math.PI, tarea: "archivo" },
    ventana: { x: 0.2, z: -3.2, yaw: Math.PI, tarea: "estirar" },
  };
  const nombresPuntos = ["escritorio", "planta", "archivero", "ventana", "centro"];
  const marcha = { modo: "quieta", espera: 2.5, destino: "centro", actual: "centro", tareaT: 0, fase: 0, vel: 0 };
  lia.position.set(PUNTOS.centro.x, 0, PUNTOS.centro.z);
  const ctrl = { estado: "idle", hablando: false, saludo: 0, pulso: 0, parpT: 2.5, parpV: 0, mirarT: 0, mirarObj: { x: 0, y: 0 } };
  const pose = {
    torsoPitch: 0, torsoYaw: 0, cabYaw: 0, cabPitch: 0, cabRoll: 0,
    iX: 0, iZ: 0.1, dX: -1.05, dZ: 0.25, saltito: 0, camina: 0,
    boca: 0, sonrisa: 0.5, ceja: 0, mirarX: 0, mirarY: 0,
  };
  const puntero = { x: 0, y: 0, dentro: false };

  const reloj = new THREE.Clock();
  let t = 0;
  let id = 0;
  let visible = true;
  let destruido = false;

  const yawHacia = (x, z) => Math.atan2(x - lia.position.x, z - lia.position.z);

  function actualizar(dt) {
    t += dt;
    const atiende = ctrl.estado !== "idle";

    // --- qué está haciendo (caminar / tarea / atender) ---
    if (atiende) {
      const c = PUNTOS.centro;
      if (Math.hypot(lia.position.x - c.x, lia.position.z - c.z) > 0.08) {
        marcha.modo = "ir";
        marcha.destino = "centro";
      } else marcha.modo = "atender";
    } else if (marcha.modo === "atender") {
      marcha.modo = "quieta";
      marcha.actual = "centro";
      marcha.espera = rnd(3, 6);
    }
    let yawObj = lia.rotation.y;
    let moviendo = false;
    const elegir = () => {
      const opciones = nombresPuntos.filter((p) => p !== marcha.actual);
      marcha.destino = opciones[Math.floor(Math.random() * opciones.length)];
      marcha.modo = "ir";
    };
    if (marcha.modo === "quieta") {
      marcha.espera -= dt;
      yawObj = yawHacia(camera.position.x, camera.position.z);
      if (marcha.espera <= 0) elegir();
    } else if (marcha.modo === "ir") {
      const p = PUNTOS[marcha.destino];
      const dx = p.x - lia.position.x;
      const dz = p.z - lia.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.06) {
        marcha.actual = marcha.destino;
        if (!atiende) {
          marcha.modo = p.tarea ? "tarea" : "quieta";
          marcha.tareaT = rnd(4, 7.5);
          marcha.espera = rnd(3, 6);
        }
      } else {
        yawObj = Math.atan2(dx, dz);
        // gira antes de arrancar para que no patine de costado
        const giro = Math.abs(difAngulo(lia.rotation.y, yawObj));
        const paso = Math.min(dist, (giro > 0.9 ? 0 : 2.3) * dt);
        lia.position.x += (dx / dist) * paso;
        lia.position.z += (dz / dist) * paso;
        moviendo = paso > 0;
      }
    } else if (marcha.modo === "tarea") {
      yawObj = PUNTOS[marcha.actual].yaw;
      marcha.tareaT -= dt;
      if (marcha.tareaT <= 0) elegir();
    } else if (marcha.modo === "atender") {
      yawObj = yawHacia(camera.position.x, camera.position.z);
    }
    lia.rotation.y += difAngulo(lia.rotation.y, yawObj) * (1 - Math.exp(-(moviendo ? 9 : 5) * dt));
    marcha.vel = amortiguar(marcha.vel, moviendo ? 1 : 0, 10, dt);
    if (moviendo) marcha.fase += dt * 9;
    const tarea = marcha.modo === "tarea" ? PUNTOS[marcha.actual].tarea : null;

    // --- pose objetivo ---
    const o = {
      torsoPitch: 0, torsoYaw: 0, cabYaw: 0, cabPitch: 0, cabRoll: 0,
      iX: -0.04 + Math.sin(t * 1.3) * 0.03, iZ: 0.1, dX: -1.05 + Math.sin(t * 1.1) * 0.03, dZ: 0.25,
      saltito: 0, boca: 0, sonrisa: 0.55, ceja: 0, mirarX: 0, mirarY: 0,
    };
    const hablando = ctrl.hablando;
    if (ctrl.estado === "listening") {
      o.torsoPitch = 0.16;
      o.cabPitch = 0.1 + Math.max(0, Math.sin(t * 2.1)) * 0.12;
      o.cabRoll = 0.14;
      o.ceja = 0.9;
      o.sonrisa = 0.7;
      o.iX = -1.28 + Math.sin(t * 13) * 0.04;
      o.iZ = -0.35;
      o.dX = -1.3;
      o.dZ = 0.42;
      o.mirarY = 0.2;
    } else if (ctrl.estado === "thinking") {
      o.cabRoll = -0.16;
      o.cabPitch = -0.12;
      o.cabYaw = 0.25;
      o.ceja = 0.6;
      o.sonrisa = 0.15;
      o.iX = -1.7 + Math.sin(t * 2) * 0.05;
      o.iZ = -0.9;
      o.mirarX = 0.7 * Math.sign(Math.sin(t * 0.7) || 1);
      o.mirarY = -0.8;
      o.torsoPitch = 0.04;
    } else if (hablando) {
      o.iX = -0.9 + Math.sin(t * 2.6) * 0.5;
      o.iZ = -0.05 + Math.sin(t * 1.7) * 0.25;
      o.dX = -1.0 + Math.sin(t * 1.9 + 1) * 0.1;
      o.cabPitch = Math.sin(t * 3.1) * 0.06;
      o.cabRoll = Math.sin(t * 1.3) * 0.07;
      o.cabYaw = Math.sin(t * 0.9) * 0.12;
      o.torsoPitch = 0.03 + Math.sin(t * 2.4) * 0.025;
      o.sonrisa = 0.65;
      o.ceja = 0.25 + Math.max(0, Math.sin(t * 2.6)) * 0.4;
    }
    if (hablando) {
      const silaba = 0.5 + 0.5 * Math.sin(t * 13 + Math.sin(t * 3.1) * 2);
      const pausa = 0.55 + 0.45 * Math.sin(t * 4.7);
      o.boca = Math.min(1, Math.max(0, silaba * pausa * 1.15 + ctrl.pulso * 0.5));
    }
    ctrl.pulso = Math.max(0, ctrl.pulso - dt * 4);

    if (tarea === "teclear") {
      o.iX = -1.18 + Math.sin(t * 10) * 0.07;
      o.dX = -1.18 + Math.sin(t * 10 + 2) * 0.07;
      o.iZ = -0.28;
      o.dZ = 0.28;
      o.torsoPitch = 0.07;
      o.cabYaw = 0;
      o.cabPitch = 0.02;
    } else if (tarea === "admirar") {
      o.torsoPitch = 0.2;
      o.cabPitch = 0.18;
      o.cabYaw = Math.sin(t * 0.8) * 0.2;
      o.iX = -0.7;
      o.sonrisa = 0.9;
    } else if (tarea === "archivo") {
      o.iX = -1.5 + Math.sin(t * 2) * 0.15;
      o.iZ = -0.2;
      o.cabYaw = Math.sin(t * 0.6) * 0.3;
    } else if (tarea === "estirar") {
      const s = 0.5 + 0.5 * Math.sin(t * 1.4);
      o.iZ = 0.4 + 2.3 * s;
      o.iX = 0;
      o.dX = 0;
      o.dZ = -(0.4 + 2.3 * s);
      o.torsoPitch = -0.08 * s;
      o.cabPitch = -0.15 * s;
      o.sonrisa = 0.8;
    }
    if (ctrl.saludo > 0) {
      ctrl.saludo -= dt;
      o.iX = 0;
      o.iZ = 2.5 + Math.sin(t * 11) * 0.35;
      o.sonrisa = 1;
      o.ceja = 0.7;
      o.cabRoll = 0.12;
      o.saltito = Math.abs(Math.sin(t * 6)) * 0.05;
    }
    if (moviendo || marcha.vel > 0.05) {
      const s = Math.sin(marcha.fase);
      o.iX = (hablando || ctrl.estado !== "idle") ? o.iX : -s * 0.7;
      o.saltito = Math.abs(s) * 0.06;
      o.dX = -1.05 + Math.sin(marcha.fase) * 0.05;
    }

    // cabeza sigue el puntero (cuando está quieta y mirando de frente)
    if (puntero.dentro && !tarea && !moviendo && !(ctrl.estado === "thinking")) {
      o.cabYaw += puntero.x * 0.75;
      o.cabPitch += -puntero.y * 0.28;
      o.mirarX = puntero.x * 0.9;
      o.mirarY = -puntero.y * 0.7;
    }

    for (const k of Object.keys(o)) pose[k] = amortiguar(pose[k], o[k], k.startsWith("boca") ? 22 : 8, dt);

    // --- aplicar ---
    tronco.rotation.x = pose.torsoPitch;
    tronco.position.y = 1.55 + pose.saltito;
    cabeza.rotation.set(pose.cabPitch, pose.cabYaw, pose.cabRoll);
    brazoI.pivote.rotation.set(pose.iX, 0, pose.iZ);
    brazoD.pivote.rotation.set(pose.dX, 0, pose.dZ);
    const balanceo = Math.sin(marcha.fase) * 0.65 * marcha.vel;
    piernas[0].rotation.x = balanceo;
    piernas[1].rotation.x = -balanceo;
    cadera.position.y = 1.3 + pose.saltito * 0.5;
    carpeta.visible = tarea !== "teclear";
    burbujas.visible = ctrl.estado === "thinking";
    if (burbujas.visible) burbujas.children.forEach((b, i) => (b.position.y = 5.2 + i * 0.35 + Math.sin(t * 3 + i) * 0.06));
    burbujas.rotation.y = -lia.rotation.y;

    // parpadeo y cara
    ctrl.parpT -= dt;
    if (ctrl.parpT <= 0) {
      ctrl.parpV = 0.16;
      ctrl.parpT = rnd(2, 5);
    }
    if (ctrl.parpV > 0) ctrl.parpV -= dt;
    const parp = ctrl.parpV > 0 ? 1 - Math.abs(ctrl.parpV / 0.08 - 1) : 0;
    estadoCara.parp = Math.max(0, Math.min(1, parp));
    estadoCara.boca = pose.boca;
    estadoCara.sonrisa = pose.sonrisa;
    estadoCara.ceja = pose.ceja;
    estadoCara.mirarX = pose.mirarX;
    estadoCara.mirarY = pose.mirarY;
    refrescarCara(false);

    // pantalla del monitor (poca frecuencia)
    if (t - ultimaPantalla > 0.5) {
      ultimaPantalla = t;
      dibujarPantalla(t);
    }
    // mirar la cabeza hacia la cámara cuando atiende: la orientación del cuerpo ya la sigue
    controles.update();
  }

  function ajustar() {
    const w = contenedor.clientWidth || 1;
    const h = contenedor.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // en pantallas angostas abre el campo para que entre la oficina y Lía
    camera.fov = camera.aspect >= 1.2 ? 34 : Math.min(58, 34 + (1.2 - camera.aspect) * 34);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(ajustar);
  ro.observe(contenedor);
  ajustar();

  function bucle() {
    id = requestAnimationFrame(bucle);
    if (!visible || document.hidden) {
      reloj.getDelta();
      return;
    }
    actualizar(Math.min(0.05, reloj.getDelta()));
    renderer.render(scene, camera);
  }
  const io = new IntersectionObserver((e) => (visible = e[0]?.isIntersecting !== false));
  io.observe(contenedor);
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
      ctrl.saludo = 2.2;
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
      ctrl.estado = e;
    },
    hablando(b) {
      ctrl.hablando = !!b;
    },
    pulso() {
      ctrl.pulso = 1;
    },
    saludar() {
      ctrl.saludo = 2.2;
    },
    setInfo(i) {
      infoPantalla.abiertos = Number(i?.abiertos) || 0;
      infoPantalla.altas = Number(i?.altas) || 0;
      dibujarPantalla(t);
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
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
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
