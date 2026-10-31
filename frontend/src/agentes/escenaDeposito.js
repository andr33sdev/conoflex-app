// Escena 3D de Nati: minifigura LEGO con casco y chaleco en el depósito de Conoflex.
// Los estantes se arman con el stock REAL: cada caja es una materia prima y su color/altura sale de los días de cobertura
// (rojo = crítico, amarillo = bajo, verde = bien, celeste = de sobra). Se carga con import dinámico.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { COLOR, plastico, sombra, caja, cilindro, amortiguar, rnd, clamp, textura, dibujarCara, elipse } from "./escenaLego.js";

export { soportaWebGL } from "./escenaLego.js";

const NIVEL = {
  negativo: { color: 0xb91c1c, alto: 0.25 },
  critico: { color: 0xe03a3a, alto: 0.3 },
  bajo: { color: 0xffd60a, alto: 0.55 },
  ok: { color: 0x3ecf6f, alto: 0.85 },
  exceso: { color: 0x3b9eff, alto: 1 },
  sin_demanda: { color: 0x8b93a1, alto: 0.7 },
};

export function crearEscena(contenedor, { logoUrl, onActividad, onSaludo } = {}) {
  const movil = window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 700;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 90);
  const TARGET = new THREE.Vector3(0.6, 2.5, 0);
  const DIR_CAM = new THREE.Vector3(-1.2, 1.9, 12).normalize();
  const controles = new OrbitControls(camera, renderer.domElement);
  controles.target.copy(TARGET);
  controles.enableDamping = true;
  controles.dampingFactor = 0.08;
  controles.enablePan = false;
  controles.minPolarAngle = 0.45;
  controles.maxPolarAngle = Math.PI / 2 - 0.08;
  controles.minAzimuthAngle = -1.0;
  controles.maxAzimuthAngle = 1.0;
  controles.rotateSpeed = 0.7;
  let ultimoToque = -99;
  controles.addEventListener("start", () => (ultimoToque = performance.now() / 1000));

  scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x20222a, 0.75));
  const sol = new THREE.DirectionalLight(0xfff2e0, 2.3);
  sol.position.set(4, 11, 9);
  sol.castShadow = true;
  const res = movil ? 1536 : 2048;
  sol.shadow.mapSize.set(res, res);
  Object.assign(sol.shadow.camera, { left: -10, right: 10, top: 9, bottom: -7, near: 1, far: 34 });
  sol.shadow.bias = -0.0004;
  sol.shadow.normalBias = 0.03;
  scene.add(sol);
  const luzNaranja = new THREE.PointLight(0xff8a3a, 12, 14, 2);
  luzNaranja.position.set(-2, 4.2, 2.5);
  scene.add(luzNaranja);

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

  // ---------- mundo ----------
  const mundo = new THREE.Group();
  scene.add(mundo);
  const piso = caja(15, 0.5, 9.6, plastico(0x181a20, { roughness: 0.5, clearcoat: 0.25 }), 0.2);
  piso.position.set(0.6, -0.25, 0);
  mundo.add(piso);
  // franjas amarillas de seguridad
  const franja = (x, z, w, d) => {
    const f = caja(w, 0.04, d, plastico(COLOR.amarillo, { roughness: 0.5 }), 0.02);
    f.position.set(x, 0.02, z);
    mundo.add(f);
  };
  franja(0.6, 2.9, 14, 0.12);
  franja(0.6, -1.35, 14, 0.12);
  // puntitos de ladrillo
  const studs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16), plastico(0x1f2128, { roughness: 0.45 }), 18 * 11);
  studs.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  let n = 0;
  for (let i = 0; i < 18; i++)
    for (let j = 0; j < 11; j++) {
      m4.makeTranslation(-7.2 + i * 0.8, 0.05, -4.2 + j * 0.8);
      studs.setMatrixAt(n++, m4);
    }
  mundo.add(studs);

  // pared del fondo + zócalo
  const pared = caja(15, 8, 0.5, plastico(0x1c1e26, { roughness: 0.55, clearcoat: 0.15 }), 0.15);
  pared.position.set(0.6, 4, -4.6);
  mundo.add(pared);
  const zocalo = caja(15, 0.4, 0.62, plastico(COLOR.naranja), 0.1);
  zocalo.position.set(0.6, 0.2, -4.54);
  mundo.add(zocalo);

  // cartel con el logo
  const disco = textura(512, 512, () => {});
  const dibujarDisco = () => {
    const { ctx } = disco;
    ctx.clearRect(0, 0, 512, 512);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(256, 256, 256, 0, 7);
    ctx.fill();
    if (logoListo) ctx.drawImage(logo, 0, 0, 512, 512);
    disco.tex.needsUpdate = true;
  };
  dibujarDisco();
  conLogo(dibujarDisco);
  const aro = cilindro(0.95, 0.95, 0.18, plastico(COLOR.naranja), 56);
  aro.rotation.x = Math.PI / 2;
  aro.position.set(-5.6, 6.1, -4.2);
  mundo.add(aro);
  const discoMesh = new THREE.Mesh(new THREE.CircleGeometry(0.84, 56), new THREE.MeshBasicMaterial({ map: disco.tex, transparent: true, toneMapped: false }));
  discoMesh.position.set(-5.6, 6.1, -4.1);
  mundo.add(discoMesh);

  // ---------- estantes con el stock real ----------
  const matMetal = plastico(0x3a3f4d, { roughness: 0.4 });
  const matNaranja = plastico(COLOR.naranja);
  const COL_X = [-4.2, -1.4, 1.4, 4.2];
  const NIVELES_Y = [0.55, 2.2, 3.85];
  const slots = []; // 12 lugares: cada uno guarda su caja
  const cajasGrupo = new THREE.Group();
  mundo.add(cajasGrupo);
  for (const cx of COL_X) {
    for (const px of [-1.2, 1.2]) {
      const poste = caja(0.18, 5.0, 0.18, matNaranja, 0.04);
      poste.position.set(cx + px, 2.5, -3.7);
      mundo.add(poste);
    }
    NIVELES_Y.forEach((y, k) => {
      const tabla = caja(2.6, 0.14, 1.2, matMetal, 0.04);
      tabla.position.set(cx, y, -3.7);
      mundo.add(tabla);
      slots.push({ x: cx, y: y + 0.07, z: -3.7, fila: k });
    });
  }
  const cajasMesh = []; // por slot: grupo de cajas
  slots.forEach(() => {
    const g = new THREE.Group();
    cajasGrupo.add(g);
    cajasMesh.push(g);
  });

  // etiqueta con el nombre arriba de cada caja
  function etiqueta(texto, color) {
    const t = textura(256, 96, (ctx, W, H) => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#" + color.toString(16).padStart(6, "0");
      ctx.fillRect(0, 0, 22, H);
      ctx.fillStyle = "#14151a";
      ctx.font = "800 34px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      let s = texto;
      while (ctx.measureText(s).width > W - 44 && s.length > 3) s = s.slice(0, -2);
      if (s !== texto) s += "…";
      ctx.fillText(s, 34, H / 2);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false }));
    return m;
  }

  let panorama = null;
  let claveEstantes = "";
  function armarEstantes() {
    cajasMesh.forEach((g) => {
      g.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) {
          o.material.map?.dispose?.();
          o.material.dispose?.();
        }
      });
      g.clear();
    });
    const lista = (panorama?.materias || []).slice(0, slots.length);
    lista.forEach((m, i) => {
      const s = slots[i];
      const cfg = NIVEL[m.nivel] || NIVEL.ok;
      const g = cajasMesh[i];
      const cantidad = Math.max(1, Math.round(1 + cfg.alto * 3)); // 1 a 4 cajas apiladas/en fila
      const mat = plastico(cfg.color, { roughness: 0.35 });
      for (let k = 0; k < cantidad; k++) {
        const c = caja(0.62, 0.5 + cfg.alto * 0.3, 0.8, mat, 0.07);
        const fila = k % 2;
        const capa = Math.floor(k / 2);
        c.position.set(s.x - 0.55 + fila * 0.72, s.y + 0.25 + (0.5 + cfg.alto * 0.3) * capa, s.z + 0.05);
        c.position.y = s.y + (0.5 + cfg.alto * 0.3) / 2 + capa * (0.5 + cfg.alto * 0.3);
        g.add(c);
      }
      const et = etiqueta(m.nombre || m.codigo || "—", cfg.color);
      et.position.set(s.x, s.y + 1.28, s.z + 0.62);
      et.scale.setScalar(0.82);
      g.add(et);
      if (m.nivel === "critico" || m.nivel === "negativo") {
        const alerta = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff3b30, toneMapped: false }));
        alerta.position.set(s.x + 0.95, s.y + 1.28, s.z + 0.64);
        alerta.userData.alerta = true;
        g.add(alerta);
      }
    });
  }

  // ---------- pallets en el piso ----------
  const matMadera = plastico(0xb98a52, { roughness: 0.7, clearcoat: 0.1 });
  function pallet(x, z, alto = 2) {
    const g = new THREE.Group();
    const base = caja(1.5, 0.16, 1.2, matMadera, 0.03);
    base.position.y = 0.12;
    g.add(base);
    for (let i = 0; i < alto; i++) {
      const c = caja(1.3, 0.55, 1.0, plastico([0xe85c0d, 0xf4f1ea, 0x2e6bff][(i + Math.floor(x)) % 3 < 0 ? 0 : (i + Math.abs(Math.floor(x))) % 3], { roughness: 0.4 }), 0.06);
      c.position.y = 0.48 + i * 0.57;
      g.add(c);
    }
    g.position.set(x, 0, z);
    mundo.add(g);
    return g;
  }
  pallet(-6.0, -0.6, 3);
  pallet(-6.0, 1.0, 2);
  const palletMovil = pallet(5.2, -0.4, 2);

  // ---------- autoelevador ----------
  const elevador = new THREE.Group();
  const matAmarillo = plastico(COLOR.amarillo);
  const chasis = caja(1.5, 0.6, 2.0, matAmarillo, 0.12);
  chasis.position.y = 0.55;
  elevador.add(chasis);
  const capot = caja(1.3, 0.5, 0.8, plastico(0x23252e), 0.1);
  capot.position.set(0, 0.8, -0.65);
  elevador.add(capot);
  const mastil = caja(0.14, 2.2, 0.14, plastico(0x23252e), 0.03);
  [-0.4, 0.4].forEach((dx) => {
    const m = mastil.clone();
    m.position.set(dx, 1.4, 1.1);
    elevador.add(m);
  });
  const horquilla = new THREE.Group();
  [-0.35, 0.35].forEach((dx) => {
    const d = caja(0.14, 0.08, 1.2, plastico(0x8b93a1, { metalness: 0.6 }), 0.02);
    d.position.set(dx, 0, 0.6);
    horquilla.add(d);
  });
  horquilla.position.set(0, 0.3, 1.15);
  elevador.add(horquilla);
  const jaula = new THREE.Group();
  [-0.55, 0.55].forEach((dx) => {
    const p = caja(0.08, 1.0, 0.08, plastico(0x23252e), 0.02);
    p.position.set(dx, 1.35, -0.2);
    jaula.add(p);
  });
  const techo = caja(1.3, 0.08, 0.9, plastico(0x23252e), 0.02);
  techo.position.set(0, 1.88, -0.2);
  jaula.add(techo);
  elevador.add(jaula);
  [[-0.75, 0.9], [0.75, 0.9], [-0.75, -0.7], [0.75, -0.7]].forEach(([x, z]) => {
    const r = cilindro(0.32, 0.32, 0.26, plastico(0x16171c, { roughness: 0.8 }), 24);
    r.rotation.z = Math.PI / 2;
    r.position.set(x, 0.32, z);
    elevador.add(r);
  });
  const baliza = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff8a00, toneMapped: false }));
  baliza.position.set(0, 2.0, -0.2);
  elevador.add(baliza);
  elevador.position.set(3.6, 0, 1.6);
  elevador.rotation.y = -Math.PI / 2;
  mundo.add(elevador);

  // ---------- TV del depósito (resumen en vivo) ----------
  const tv = textura(768, 432, () => {});
  const info = { criticas: 0, bajas: 0, materias: 0, compras: 0, internas: 0 };
  function dibujarTV(t = 0) {
    const { ctx, w, h } = tv;
    ctx.fillStyle = "#0e1016";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#e85c0d";
    ctx.fillRect(0, 0, w, 70);
    ctx.fillStyle = "#fff";
    ctx.font = "800 38px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("DEPÓSITO · EN VIVO", 24, 49);
    const filas = [
      ["Críticas", info.criticas, "#ff5a4d"],
      ["Bajas", info.bajas, "#ffd60a"],
      ["Compras abiertas", info.compras, "#6bb8ff"],
      ["Pedidos internos", info.internas, "#c4b5fd"],
    ];
    filas.forEach(([t1, v, c], i) => {
      const y = 130 + i * 76;
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(24, y - 44, w - 48, 62);
      ctx.fillStyle = c;
      ctx.fillRect(24, y - 44, 10, 62);
      ctx.fillStyle = "#e5e7eb";
      ctx.font = "600 34px sans-serif";
      ctx.fillText(t1, 52, y);
      ctx.fillStyle = c;
      ctx.font = "800 44px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(String(v), w - 44, y + 2);
      ctx.textAlign = "left";
    });
    const parpadea = Math.floor(t * 2) % 2 === 0;
    ctx.fillStyle = info.criticas ? (parpadea ? "#ff3b30" : "#7a1d18") : "#3ecf6f";
    ctx.beginPath();
    ctx.arc(w - 40, 35, 12, 0, 7);
    ctx.fill();
    tv.tex.needsUpdate = true;
  }
  dibujarTV();
  const marcoTV = caja(4.1, 2.45, 0.2, plastico(0x0b0c10), 0.1);
  marcoTV.position.set(5.2, 6.1, -4.2);
  mundo.add(marcoTV);
  const pantTV = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.14), new THREE.MeshBasicMaterial({ map: tv.tex, toneMapped: false }));
  pantTV.position.set(5.2, 6.1, -4.09);
  mundo.add(pantTV);

  // ---------- Nati ----------
  const nati = new THREE.Group();
  nati.position.set(-1.0, 0, 1.9);
  mundo.add(nati);
  const matPiel = plastico(COLOR.piel, { roughness: 0.3 });
  const matChaleco = plastico(0xff7a00, { roughness: 0.4 });
  const matRemera = plastico(0x2b3a67);
  const matPant = plastico(0x23252e);
  const matCasco = plastico(0xf4f1ea, { roughness: 0.25 });
  const matPelo = plastico(0x2a1a12, { roughness: 0.45 });

  const caderas = new THREE.Group();
  caderas.position.y = 1.15;
  nati.add(caderas);
  const patas = [];
  for (const lado of [1, -1]) {
    const pierna = new THREE.Group();
    pierna.position.set(lado * 0.28, 0, 0);
    const muslo = caja(0.5, 1.1, 0.7, matPant, 0.1);
    muslo.position.y = -0.55;
    pierna.add(muslo);
    const bota = caja(0.56, 0.3, 0.9, plastico(0x16171c, { roughness: 0.6 }), 0.1);
    bota.position.set(0, -1.0, 0.1);
    pierna.add(bota);
    caderas.add(pierna);
    patas.push(pierna);
  }
  const cadera = caja(1.2, 0.34, 0.74, matPant, 0.1);
  cadera.position.y = 0.05;
  caderas.add(cadera);

  const tronco = new THREE.Group();
  tronco.position.y = 0.2;
  caderas.add(tronco);
  const torso = caja(1.3, 1.45, 0.78, matRemera, 0.16);
  torso.position.y = 0.78;
  tronco.add(torso);
  // chaleco naranja con bandas reflectivas
  const chaleco = caja(1.36, 1.3, 0.84, matChaleco, 0.14);
  chaleco.position.y = 0.72;
  tronco.add(chaleco);
  const abierto = caja(0.26, 1.34, 0.9, matRemera, 0.05);
  abierto.position.set(0, 0.72, 0.01);
  tronco.add(abierto);
  const matReflec = plastico(0xdfe6ee, { roughness: 0.2, metalness: 0.5 });
  [0.46, 1.0].forEach((y) => {
    const b = caja(1.42, 0.12, 0.9, matReflec, 0.03);
    b.position.set(0, y, 0);
    tronco.add(b);
  });
  const bandaV = [-0.5, 0.5].map((x) => {
    const b = caja(0.12, 1.3, 0.88, matReflec, 0.03);
    b.position.set(x, 0.72, 0);
    tronco.add(b);
    return b;
  });
  void bandaV;
  const matAzul = plastico(0x2e6bff);
  const credencial = caja(0.26, 0.32, 0.04, plastico(0xffffff), 0.02);
  credencial.position.set(-0.32, 1.05, 0.44);
  tronco.add(credencial);
  void matAzul;

  // brazos
  const hacerBrazo = (lado) => {
    const pivote = new THREE.Group();
    pivote.position.set(lado * 0.88, 1.28, 0);
    const manga = caja(0.4, 0.8, 0.46, matRemera, 0.12);
    manga.position.y = -0.38;
    pivote.add(manga);
    const mano = new THREE.Group();
    mano.position.y = -0.85;
    const palma = cilindro(0.17, 0.17, 0.22, matPiel, 20);
    palma.rotation.z = Math.PI / 2;
    mano.add(palma);
    pivote.add(mano);
    tronco.add(pivote);
    return { pivote, mano };
  };
  const brazoI = hacerBrazo(1);
  const brazoD = hacerBrazo(-1);

  // tablet de inventario (la sostiene con la mano izquierda)
  const pantTab = textura(256, 340, () => {});
  const dibujarTablet = (ok = true, t = 0) => {
    const { ctx, w, h } = pantTab;
    ctx.fillStyle = "#0e1016";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#e85c0d";
    ctx.fillRect(0, 0, w, 44);
    ctx.fillStyle = "#fff";
    ctx.font = "800 24px sans-serif";
    ctx.fillText("INVENTARIO", 14, 31);
    for (let i = 0; i < 5; i++) {
      const lista = panorama?.materias?.[i];
      const col = lista ? "#" + (NIVEL[lista.nivel] || NIVEL.ok).color.toString(16).padStart(6, "0") : "#3a3f4d";
      const y = 66 + i * 54;
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.fillRect(10, y, w - 20, 44);
      ctx.fillStyle = col;
      ctx.fillRect(10, y, 8, 44);
      ctx.fillStyle = "#e5e7eb";
      ctx.font = "600 20px sans-serif";
      ctx.fillText((lista?.nombre || "—").slice(0, 14), 28, y + 29);
    }
    ctx.fillStyle = ok ? "#3ecf6f" : "#ff5a4d";
    ctx.fillRect(10, h - 20, ((Math.sin(t * 2) + 1) / 2) * (w - 20), 6);
    pantTab.tex.needsUpdate = true;
  };
  dibujarTablet();
  const tablet = new THREE.Group();
  const cuerpoTab = caja(0.78, 1.02, 0.07, plastico(0x16171c), 0.06);
  tablet.add(cuerpoTab);
  const caraTab = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.94), new THREE.MeshBasicMaterial({ map: pantTab.tex, toneMapped: false }));
  caraTab.position.z = 0.04;
  tablet.add(caraTab);
  tablet.position.set(0, 0.05, 0.22);
  tablet.rotation.x = -0.15;
  brazoI.mano.add(tablet);

  // láser de escaneo
  const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 8), new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.8, toneMapped: false }));
  laser.visible = false;
  scene.add(laser);

  // cabeza
  const cabeza = new THREE.Group();
  cabeza.position.y = 1.68;
  tronco.add(cabeza);
  const RH = 0.58;
  const HH = 0.8;
  const craneo = cilindro(RH, RH, HH, matPiel, 64);
  craneo.position.y = HH / 2;
  cabeza.add(craneo);
  const tacho = cilindro(0.22, 0.22, 0.14, matPiel, 24);
  tacho.position.y = HH + 0.07;
  cabeza.add(tacho);
  const cara = textura(1024, 652, () => {});
  const ec = { parp: 0, boca: 0, forma: 0, sonrisa: 0.5, ceja: 0, mirarX: 0, mirarY: 0, guiño: 0 };
  let claveCara = "";
  const refrescarCara = (forzar) => {
    const clave = [ec.parp, ec.boca, ec.forma, ec.sonrisa, ec.ceja, ec.mirarX, ec.mirarY, ec.guiño].map((v) => Math.round(v * 10)).join("|");
    if (clave === claveCara && !forzar) return;
    claveCara = clave;
    cara.ctx.save();
    cara.ctx.scale(2, 2);
    dibujarCara(cara.ctx, 512, 326, ec);
    cara.ctx.restore();
    cara.tex.needsUpdate = true;
  };
  refrescarCara(true);
  const arcoCara = (Math.PI * 2) / 3;
  const decal = new THREE.Mesh(
    new THREE.CylinderGeometry(RH + 0.004, RH + 0.004, HH, 56, 1, true, -arcoCara / 2, arcoCara),
    new THREE.MeshStandardMaterial({ map: cara.tex, transparent: true, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  decal.position.y = HH / 2;
  cabeza.add(decal);
  // pelo corto atrás + colita
  const nuca = caja(1.2, 0.95, 0.4, matPelo, 0.16);
  nuca.position.set(0, 0.28, -RH + 0.02);
  cabeza.add(nuca);
  const colita = caja(0.3, 0.7, 0.26, matPelo, 0.12);
  colita.position.set(0, 0.05, -RH - 0.3);
  colita.rotation.x = 0.25;
  cabeza.add(colita);
  // casco
  const domo = new THREE.Mesh(new THREE.SphereGeometry(RH + 0.1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), matCasco);
  sombra(domo);
  domo.scale.y = 0.8;
  domo.position.y = HH - 0.12;
  cabeza.add(domo);
  const visera = caja(1.5, 0.1, 0.55, matCasco, 0.05);
  visera.position.set(0, HH - 0.1, RH * 0.9);
  cabeza.add(visera);
  const cresta = caja(0.22, 0.14, 1.2, plastico(COLOR.naranja), 0.05);
  cresta.position.y = HH + RH * 0.8 - 0.04;
  cabeza.add(cresta);
  const luzCasco = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff3b0, toneMapped: false }));
  luzCasco.position.set(0, HH + 0.1, RH + 0.12);
  cabeza.add(luzCasco);

  // ---------- estado y animación ----------
  const ctrl = { estado: "idle", hablando: false, nivelExterno: -1, pulso: 0 };
  let t = 0;
  let visible = true;
  let id = 0;
  let destruido = false;
  let zoom = 1;
  const puntero = { x: 0, y: 0, dentro: false };

  const ACT = {
    controlar: { dur: [6, 9], texto: () => "Controla el inventario con la tablet" },
    escanear: { dur: [5, 7], texto: () => (info.criticas ? "Escanea los estantes críticos" : "Escanea los estantes") },
    mirar: { dur: [4, 6], texto: () => "Recorre el depósito con la vista" },
    saludar: { dur: [2.2, 2.6], texto: () => "Saluda" },
    celebrar: { dur: [2.4, 3], texto: () => "¡Todo en orden en el depósito!" },
  };
  let act = { id: "controlar", t0: 0, dur: 7 };
  const pasar = (nombre) => {
    const [a, b] = ACT[nombre].dur;
    act = { id: nombre, t0: t, dur: rnd(a, b) };
    avisarTexto();
  };
  function avisarTexto() {
    let txt;
    if (ctrl.estado === "listening") txt = "Te está escuchando";
    else if (ctrl.estado === "thinking") txt = "Revisando el stock…";
    else if (ctrl.estado === "speaking" || ctrl.hablando) txt = "Te está respondiendo";
    else txt = ACT[act.id].texto();
    onActividad?.(txt);
  }

  let parp = 0;
  let proxParp = 2;
  let tHabla = 0;
  let boca = 0;
  const pose = { mirar: 0, tronco: 0, brazoI: 0, brazoD: 0, tabX: 0, cabX: 0, cabY: 0 };
  let proxCambio = 0;
  let confetiT = 0;
  const NCONF = 40;
  const confeti = new THREE.InstancedMesh(new RoundedBoxGeometry(0.22, 0.14, 0.22, 2, 0.03), plastico(0xffffff), NCONF);
  const colConf = [0xe85c0d, 0xffd60a, 0x2e6bff, 0x4ade80, 0xe03a3a, 0xffffff];
  const partes = Array.from({ length: NCONF }, (_, i) => {
    confeti.setColorAt(i, new THREE.Color(colConf[i % colConf.length]));
    return { p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), vr: new THREE.Vector3(), vida: 0 };
  });
  confeti.visible = false;
  scene.add(confeti);
  const dummy = new THREE.Object3D();
  function lanzarConfeti() {
    confetiT = 3;
    confeti.visible = true;
    partes.forEach((q) => {
      q.p.set(-1 + rnd(-0.6, 0.6), 4.2, 1.9 + rnd(-0.4, 0.4));
      q.v.set(rnd(-3, 3), rnd(4, 8), rnd(-2, 3));
      q.r.set(rnd(0, 6), rnd(0, 6), 0);
      q.vr.set(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6));
      q.vida = rnd(2, 3);
    });
  }

  const tmpV = new THREE.Vector3();
  function actualizar(dt) {
    t += dt;
    const atiende = ctrl.estado !== "idle";
    // ritmo de actividades
    if (!atiende && t - act.t0 > act.dur) {
      const opciones = info.criticas ? ["controlar", "escanear", "escanear", "mirar"] : ["controlar", "mirar", "escanear"];
      pasar(opciones[Math.floor(Math.random() * opciones.length)]);
    }
    const a = atiende ? "controlar" : act.id;
    const u = (t - act.t0) / act.dur;

    // objetivos de pose
    let objMirar = 0;
    let objBrazoI = 0.9; // tablet adelante
    let objBrazoD = 0.1;
    let objCabY = 0;
    let objCabX = 0.05;
    let escanea = false;
    if (a === "controlar") {
      objCabX = 0.28;
      objBrazoI = 1.15;
      objBrazoD = Math.sin(t * 2.1) * 0.15 + 0.7 * (Math.sin(t * 1.1) > 0 ? 1 : 0.2); // tipea
    } else if (a === "escanear") {
      const vaA = Math.sin(u * Math.PI * 3);
      objMirar = vaA * 0.6;
      objCabY = vaA * 0.5;
      objBrazoD = 1.9;
      escanea = true;
    } else if (a === "mirar") {
      objMirar = Math.sin(t * 0.7) * 0.7;
      objCabY = Math.sin(t * 0.7 + 0.5) * 0.6;
      objBrazoI = 0.5;
    } else if (a === "saludar") {
      objBrazoD = 2.7 + Math.sin(t * 9) * 0.35;
      objCabY = 0.15;
    } else if (a === "celebrar") {
      objBrazoD = 2.9;
      objBrazoI = 2.9 + Math.sin(t * 10) * 0.1;
      objCabX = -0.15;
    }
    if (ctrl.estado === "listening") {
      objCabY = clamp(puntero.dentro ? puntero.x * 0.4 : 0, -0.5, 0.5);
      objCabX = 0.12;
    } else if (ctrl.estado === "thinking") {
      objCabY = Math.sin(t * 1.3) * 0.35;
      objCabX = -0.05;
      objBrazoD = 1.0;
    } else if ((ctrl.estado === "speaking" || ctrl.hablando) && a !== "celebrar") {
      objBrazoD = 0.8 + Math.sin(t * 3) * 0.25;
      objCabY = Math.sin(t * 1.4) * 0.2;
    } else if (!atiende && puntero.dentro && a === "controlar") {
      objCabY = clamp(puntero.x * 0.45, -0.5, 0.5);
    }
    pose.mirar = amortiguar(pose.mirar, objMirar, 5, dt);
    pose.cabY = amortiguar(pose.cabY, objCabY, 6, dt);
    pose.cabX = amortiguar(pose.cabX, objCabX, 6, dt);
    pose.brazoI = amortiguar(pose.brazoI, objBrazoI, 6, dt);
    pose.brazoD = amortiguar(pose.brazoD, objBrazoD, 7, dt);
    nati.rotation.y = pose.mirar * 0.5 + Math.sin(t * 0.3) * 0.03;
    tronco.rotation.x = 0.04 + Math.sin(t * 1.4) * 0.012;
    cabeza.rotation.y = pose.cabY;
    cabeza.rotation.x = pose.cabX;
    brazoI.pivote.rotation.x = -pose.brazoI;
    brazoI.pivote.rotation.z = 0.12;
    brazoD.pivote.rotation.x = -Math.min(pose.brazoD, 2.2);
    brazoD.pivote.rotation.z = pose.brazoD > 2.2 ? -0.35 - (pose.brazoD - 2.2) * 0.4 : -0.12;
    nati.position.y = Math.sin(t * 2.2) * 0.012;
    patas.forEach((p, i) => (p.rotation.x = Math.sin(t * 0.8 + i * 3) * 0.015));
    luzNaranja.intensity = 12 + Math.sin(t * 1.6) * 1.2;

    // láser
    laser.visible = escanea;
    if (escanea) {
      const mano = new THREE.Vector3();
      brazoD.mano.getWorldPosition(mano);
      const ang = pose.mirar * 1.4 + Math.sin(t * 5) * 0.05;
      const objetivo = tmpV.set(-1 + Math.sin(u * Math.PI * 3) * 4.5 + ang, 1.8 + Math.sin(t * 3) * 0.8, -3.1);
      const dir = objetivo.clone().sub(mano);
      const largo = dir.length();
      laser.scale.set(1, largo, 1);
      laser.position.copy(mano).addScaledVector(dir, 0.5);
      laser.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    }
    if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) dibujarTablet(!info.criticas, t);
    if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) dibujarTV(t);

    // alertas parpadean
    cajasGrupo.traverse((o) => {
      if (o.userData?.alerta) o.visible = Math.floor(t * 3) % 2 === 0;
    });

    // autoelevador: va y viene entre los pallets de la derecha y el centro
    const ciclo = (t % 26) / 26;
    const vaivén = ciclo < 0.5 ? ciclo * 2 : (1 - ciclo) * 2;
    const f = vaivén < 0.5 ? vaivén * 2 : (1 - vaivén) * 2 + 0;
    elevador.position.x = 5.2 - (ciclo < 0.5 ? ciclo * 2 : (1 - ciclo) * 2) * 3.0;
    elevador.rotation.y = ciclo < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    void f;
    horquilla.position.y = 0.3 + Math.max(0, Math.sin(t * 0.6)) * 0.7;
    baliza.material.color.setHex(Math.floor(t * 4) % 2 ? 0xff8a00 : 0x7a3f00);
    palletMovil.visible = ciclo > 0.5 || ciclo < 0.03;

    // cara
    parp = Math.max(0, parp - dt * 7);
    proxParp -= dt;
    if (proxParp <= 0) {
      parp = 1;
      proxParp = rnd(2.2, 5);
    }
    tHabla += dt;
    const hablando = ctrl.hablando || ctrl.estado === "speaking";
    const pul = (Math.sin(tHabla * 14) + Math.sin(tHabla * 9.3) * 0.6 + 1.6) / 3.2;
    const objBoca = hablando ? (ctrl.nivelExterno >= 0 ? clamp(ctrl.nivelExterno * 1.4, 0, 1) : Math.max(0, pul) * 0.8) : 0;
    boca = amortiguar(boca, objBoca, 25, dt);
    ec.parp = parp > 0.5 ? 1 : 0;
    ec.boca = boca;
    ec.forma = hablando ? Math.max(0, Math.sin(tHabla * 6)) : 0;
    ec.sonrisa = a === "celebrar" ? 1 : hablando ? 0.3 : info.criticas && !atiende ? 0.1 : 0.5;
    ec.ceja = ctrl.estado === "thinking" ? 0.6 : info.criticas && a === "escanear" ? -0.4 : 0;
    ec.mirarX = clamp(pose.cabY * -0.6, -1, 1);
    ec.mirarY = 0;
    ec.guiño = a === "saludar" && u > 0.4 && u < 0.7 ? 1 : 0;
    refrescarCara();
    luzCasco.material.color.setHex(Math.floor(t * 1.5) % 2 ? 0xfff3b0 : 0xd8c97a);
    if (ctrl.pulso > 0) ctrl.pulso = Math.max(0, ctrl.pulso - dt * 3);

    // confeti
    if (confetiT > 0) {
      confetiT -= dt;
      partes.forEach((q, i) => {
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

    zoom = amortiguar(zoom, ctrl.hablando ? 1.1 : atiende ? 1.05 : 1, 2.5, dt);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    if (performance.now() / 1000 - ultimoToque > 6) controles.target.x = TARGET.x + Math.sin(t * 0.25) * 0.15;
    controles.update();
  }

  function ajustar() {
    const w = contenedor.clientWidth || 1;
    const h = contenedor.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect >= 1.3 ? 32 : Math.min(54, 32 + (1.3 - camera.aspect) * 28);
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    // entran los estantes (ancho ~12) y Nati (alto ~4.5)
    const dist = Math.max(3.1 / tanV, 6.2 / (tanV * camera.aspect)) * 1.04 + 1.0;
    controles.minDistance = dist * 0.55;
    controles.maxDistance = dist * 1.3;
    camera.position.copy(controles.target).addScaledVector(DIR_CAM, dist);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(ajustar);
  ro.observe(contenedor);
  ajustar();
  controles.update();

  const reloj = new THREE.Clock();
  function bucle() {
    id = requestAnimationFrame(bucle);
    if (!visible || document.hidden) {
      reloj.getDelta();
      return;
    }
    actualizar(Math.min(window.__liaDtMax || 0.05, reloj.getDelta()));
    renderer.render(scene, camera);
  }
  const io = new IntersectionObserver((e) => (visible = e[0]?.isIntersecting !== false));
  io.observe(contenedor);
  avisarTexto();
  bucle();

  // puntero: mirada + clic en Nati para saludar
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
    if (rayo.intersectObject(nati, true).length) {
      if (ctrl.estado === "idle") pasar("saludar");
      onSaludo?.();
    }
  };
  const el = renderer.domElement;
  el.addEventListener("pointermove", alMover);
  el.addEventListener("pointerleave", alSalir);
  el.addEventListener("pointerdown", alBajar);
  el.addEventListener("pointerup", alSubir);
  void proxCambio;
  void elipse;

  return {
    setEstado(e) {
      if (e === ctrl.estado) return;
      const venia = ctrl.estado;
      ctrl.estado = e;
      if (e === "idle" && venia !== "idle") pasar("controlar");
      avisarTexto();
    },
    hablando(b) {
      ctrl.hablando = !!b;
      if (!b) ctrl.nivelExterno = -1;
      avisarTexto();
    },
    nivelVoz(v) {
      ctrl.nivelExterno = v;
    },
    pulso() {
      ctrl.pulso = 1;
    },
    saludar() {
      if (ctrl.estado === "idle") pasar("saludar");
    },
    celebrar() {
      lanzarConfeti();
      if (ctrl.estado === "idle") pasar("celebrar");
    },
    /** i: { panorama, resumen? } o directamente el objeto de /panorama */
    setInfo(i) {
      const pano = i?.panorama || i;
      const r = pano?.resumen || {};
      const antes = info.criticas;
      info.criticas = Number(r.criticas) || 0;
      info.bajas = Number(r.bajas) || 0;
      info.materias = Number(r.materias) || 0;
      info.compras = Number(r.compras_abiertas) || 0;
      info.internas = Number(r.internas_pendientes) || 0;
      const clave = JSON.stringify((pano?.materias || []).slice(0, slots.length).map((m) => [m.id, m.nivel, m.nombre]));
      if (clave !== claveEstantes) {
        claveEstantes = clave;
        panorama = pano || null;
        armarEstantes();
      }
      dibujarTV(t);
      dibujarTablet(!info.criticas, t);
      if (antes > 0 && info.criticas === 0 && info.materias > 0) {
        lanzarConfeti();
        if (ctrl.estado === "idle") pasar("celebrar");
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
