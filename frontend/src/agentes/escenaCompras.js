// Escena 3D de Vera: minifigura LEGO con auricular y saco azul en la oficina de compras de Conoflex.
// El monitor muestra la lista de compra que está armando (datos reales), el corcho tiene a los proveedores con su
// cumplimiento y las órdenes de compra vuelan del escritorio al tablero. Se carga con import dinámico.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { arcilla, crearPersonajeArcilla } from "./personajeArcilla.js";
import { COLOR, HORA_ARG, plastico, sombra, caja, cilindro, amortiguar, rnd, clamp, suavizar, textura } from "./escenaLego.js";

export { soportaWebGL } from "./escenaLego.js";

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
  const TARGET = new THREE.Vector3(0.8, 3.2, 0);
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
  aro.position.set(-6.0, 6.0, -4.2);
  aro.scale.set(0.85, 1, 0.85);
  mundo.add(aro);
  const discoMesh = new THREE.Mesh(new THREE.CircleGeometry(0.84, 56), new THREE.MeshBasicMaterial({ map: disco.tex, transparent: true, toneMapped: false }));
  discoMesh.position.set(-6.0, 6.0, -4.1);
  discoMesh.scale.setScalar(0.85);
  mundo.add(discoMesh);

  // ---------- datos ----------
  const info = { lista: [], solicitud: null, porFirmar: 0, sinRecibir: 0, proveedores: [] };

  // ---------- corcho con los proveedores ----------
  const corcho = textura(1024, 576, () => {});
  const COLS_NOTA = ["#ffd60a", "#ff9bb5", "#8be0a7", "#8cc8ff", "#ffb066", "#d6b6ff"];
  function dibujarCorcho() {
    const { ctx, w, h } = corcho;
    ctx.fillStyle = "#b98a52";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = `rgba(${90 + (i * 37) % 70},${60 + (i * 53) % 50},30,0.18)`;
      ctx.fillRect((i * 97) % w, (i * 61) % h, 3 + (i % 5), 3 + (i % 3));
    }
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.font = "800 34px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("PROVEEDORES", 28, 54);
    const lista = info.proveedores.length ? info.proveedores.slice(0, 6) : [{ proveedor: "Sin datos aún", cumplido_pct: 0, renglones: 0 }];
    lista.forEach((p, i) => {
      const col = i % 3;
      const fila = Math.floor(i / 3);
      const x = 40 + col * 322;
      const y = 90 + fila * 220;
      ctx.save();
      ctx.translate(x + 130, y + 90);
      ctx.rotate(((i * 7) % 5 - 2) * 0.025);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(-124, -80, 270, 190);
      ctx.fillStyle = COLS_NOTA[i % COLS_NOTA.length];
      ctx.fillRect(-130, -86, 264, 186);
      ctx.fillStyle = "#c0392b";
      ctx.beginPath();
      ctx.arc(0, -78, 9, 0, 7);
      ctx.fill();
      ctx.fillStyle = "#1b1c22";
      ctx.textAlign = "center";
      ctx.font = "800 27px sans-serif";
      let n = String(p.proveedor);
      while (ctx.measureText(n).width > 240 && n.length > 4) n = n.slice(0, -2);
      ctx.fillText(n === p.proveedor ? n : n + "…", 0, -30);
      ctx.font = "900 58px sans-serif";
      ctx.fillStyle = p.cumplido_pct >= 80 ? "#157347" : p.cumplido_pct >= 50 ? "#8a6d00" : "#b02a37";
      ctx.fillText(`${p.cumplido_pct}%`, 0, 38);
      ctx.fillStyle = "#1b1c22";
      ctx.font = "600 22px sans-serif";
      ctx.fillText(`${p.renglones} renglones`, 0, 78);
      ctx.restore();
    });
    corcho.tex.needsUpdate = true;
  }
  dibujarCorcho();
  const marcoCorcho = caja(7.2, 4.1, 0.2, plastico(0x6b4423, { roughness: 0.6 }), 0.08);
  marcoCorcho.position.set(0.6, 4.0, -4.2);
  mundo.add(marcoCorcho);
  const planoCorcho = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 3.82), new THREE.MeshBasicMaterial({ map: corcho.tex, toneMapped: false }));
  planoCorcho.position.set(0.6, 4.0, -4.09);
  mundo.add(planoCorcho);

  // ---------- reloj de pared con la hora real ----------
  const reloj = textura(256, 256, () => {});
  let minutoReloj = -1;
  function dibujarReloj() {
    const { h, m } = HORA_ARG();
    if (m === minutoReloj) return;
    minutoReloj = m;
    const { ctx } = reloj;
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = "#f4f1ea";
    ctx.beginPath();
    ctx.arc(128, 128, 124, 0, 7);
    ctx.fill();
    ctx.strokeStyle = "#1b1c22";
    ctx.lineWidth = 6;
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      ctx.beginPath();
      ctx.moveTo(128 + Math.sin(a) * 100, 128 - Math.cos(a) * 100);
      ctx.lineTo(128 + Math.sin(a) * 114, 128 - Math.cos(a) * 114);
      ctx.stroke();
    }
    const mano = (ang, largo, grosor, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = grosor;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(128, 128);
      ctx.lineTo(128 + Math.sin(ang) * largo, 128 - Math.cos(ang) * largo);
      ctx.stroke();
    };
    mano(((h % 12) + m / 60) * (Math.PI / 6), 62, 10, "#1b1c22");
    mano(m * (Math.PI / 30), 92, 7, "#1b1c22");
    ctx.fillStyle = "#e85c0d";
    ctx.beginPath();
    ctx.arc(128, 128, 9, 0, 7);
    ctx.fill();
    reloj.tex.needsUpdate = true;
  }
  dibujarReloj();
  const aroReloj = cilindro(0.72, 0.72, 0.16, plastico(COLOR.naranja), 48);
  aroReloj.rotation.x = Math.PI / 2;
  aroReloj.position.set(-5.0, 4.6, -4.2);
  mundo.add(aroReloj);
  const caraReloj = new THREE.Mesh(new THREE.CircleGeometry(0.64, 48), new THREE.MeshBasicMaterial({ map: reloj.tex, toneMapped: false }));
  caraReloj.position.set(-5.0, 4.6, -4.1);
  mundo.add(caraReloj);

  // ---------- escritorio con el monitor que muestra la lista ----------
  const monitor = textura(768, 480, () => {});
  function dibujarMonitor(t = 0) {
    const { ctx, w, h } = monitor;
    ctx.fillStyle = "#0e1016";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#2457c5";
    ctx.fillRect(0, 0, w, 66);
    ctx.fillStyle = "#fff";
    ctx.font = "800 34px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(info.solicitud ? `SOLICITUD DE COMPRA #${info.solicitud}` : "SIN LISTA EN ARMADO", 22, 45);
    const items = info.lista.slice(0, 6);
    if (!items.length) {
      ctx.fillStyle = "#8b93a1";
      ctx.font = "600 30px sans-serif";
      ctx.fillText("Pedime materiales o decile a Nati", 22, 140);
      ctx.fillText("que me pase lo que falta.", 22, 184);
    }
    items.forEach((it, i) => {
      const y = 96 + i * 58;
      ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.07)";
      ctx.fillRect(14, y, w - 28, 52);
      ctx.fillStyle = it.prioridad >= 5 ? "#f43f5e" : it.prioridad === 4 ? "#ff8a4d" : "#60a5fa";
      ctx.fillRect(14, y, 8, 52);
      ctx.fillStyle = "#e5e7eb";
      ctx.font = "600 26px sans-serif";
      let n = String(it.articulo);
      while (ctx.measureText(n).width > 470 && n.length > 4) n = n.slice(0, -2);
      ctx.fillText(n === it.articulo ? n : n + "…", 36, y + 36);
      ctx.fillStyle = "#fff";
      ctx.font = "800 28px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(Number(it.cantidad).toLocaleString("es-AR", { maximumFractionDigits: 0 }), w - 28, y + 37);
      ctx.textAlign = "left";
    });
    if (info.lista.length > 6) {
      ctx.fillStyle = "#8b93a1";
      ctx.font = "600 24px sans-serif";
      ctx.fillText(`… y ${info.lista.length - 6} más`, 22, h - 18);
    }
    ctx.fillStyle = Math.floor(t * 2) % 2 ? "#60a5fa" : "#2457c5";
    ctx.fillRect(w - 30, h - 30, 14, 14);
    monitor.tex.needsUpdate = true;
  }
  dibujarMonitor();
  const escritorio = new THREE.Group();
  const tapa = caja(3.6, 0.18, 1.7, plastico(0xe9e4d8, { roughness: 0.4 }), 0.05);
  tapa.position.y = 1.55;
  escritorio.add(tapa);
  for (const [dx, dz] of [[-1.6, -0.7], [1.6, -0.7], [-1.6, 0.7], [1.6, 0.7]]) {
    const pata = caja(0.14, 1.5, 0.14, plastico(0x2457c5), 0.03);
    pata.position.set(dx, 0.75, dz);
    escritorio.add(pata);
  }
  const marcoMon = caja(2.5, 1.6, 0.12, plastico(0x16171c), 0.06);
  marcoMon.position.set(0.2, 2.55, -0.45);
  escritorio.add(marcoMon);
  const pantMon = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.44), new THREE.MeshBasicMaterial({ map: monitor.tex, toneMapped: false }));
  pantMon.position.set(0.2, 2.55, -0.38);
  escritorio.add(pantMon);
  const pie = caja(0.3, 0.7, 0.3, plastico(0x16171c), 0.04);
  pie.position.set(0.2, 1.9, -0.45);
  escritorio.add(pie);
  const teclado = caja(1.3, 0.07, 0.45, plastico(0x23252e), 0.03);
  teclado.position.set(0.1, 1.68, 0.3);
  escritorio.add(teclado);
  // pila de carpetas y taza
  [0, 1, 2].forEach((k) => {
    const c = caja(0.95, 0.12, 0.7, plastico([0xe85c0d, 0x2e6bff, 0xffd60a][k]), 0.03);
    c.position.set(-1.3, 1.7 + k * 0.13, 0.15);
    c.rotation.y = k * 0.12 - 0.1;
    escritorio.add(c);
  });
  const taza = cilindro(0.2, 0.17, 0.3, plastico(0xffffff), 24);
  taza.position.set(1.35, 1.78, 0.3);
  escritorio.add(taza);
  const telefono = caja(0.5, 0.14, 0.4, plastico(0x16171c), 0.05);
  telefono.position.set(1.3, 1.7, -0.2);
  escritorio.add(telefono);
  escritorio.position.set(3.6, 0, 0.6);
  escritorio.rotation.y = -0.18;
  mundo.add(escritorio);

  // ---------- archivero, plantas y cajas de entrega ----------
  const archivero = caja(1.4, 2.6, 1.0, plastico(0x5b6376, { roughness: 0.4 }), 0.06);
  archivero.position.set(-6.3, 1.3, -2.2);
  mundo.add(archivero);
  [0.6, 1.3, 2.0].forEach((y) => {
    const cajon = caja(1.2, 0.55, 0.06, plastico(0x70798e), 0.03);
    cajon.position.set(-6.3, y, -1.68);
    mundo.add(cajon);
    const tirador = caja(0.4, 0.06, 0.08, plastico(0xdfe6ee, { metalness: 0.6 }), 0.02);
    tirador.position.set(-6.3, y, -1.62);
    mundo.add(tirador);
  });
  const planta = (x, z, escala = 1) => {
    const g = new THREE.Group();
    const maceta = cilindro(0.42, 0.3, 0.6, plastico(COLOR.naranja), 24);
    maceta.position.y = 0.3;
    g.add(maceta);
    [[0, 1.0, 0, 0.5], [-0.25, 1.3, 0.1, 0.38], [0.28, 1.25, -0.1, 0.4]].forEach(([dx, dy, dz, r]) => {
      const hoja = sombra(new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), plastico(0x3ecf6f, { roughness: 0.5 })));
      hoja.position.set(dx, dy, dz);
      g.add(hoja);
    });
    g.position.set(x, 0, z);
    g.scale.setScalar(escala);
    mundo.add(g);
  };
  planta(-5.6, 1.6, 1.15);
  planta(7.0, -1.8, 1.0);
  [[-4.7, 2.8], [-3.9, 3.1]].forEach(([x, z], k) => {
    const c = caja(0.9, 0.7, 0.8, plastico(k ? 0xe85c0d : 0xf4f1ea, { roughness: 0.45 }), 0.07);
    c.position.set(x, 0.45, z - 0.8);
    c.rotation.y = 0.2 * (k ? 1 : -1);
    mundo.add(c);
  });

  // ---------- lámparas colgantes ----------
  const matLuz = new THREE.MeshBasicMaterial({ color: 0xfff1c9, toneMapped: false });
  [-2.6, 1.0, 4.6].forEach((x) => {
    const cable = cilindro(0.025, 0.025, 1.5, plastico(0x23252e), 8);
    cable.position.set(x, 7.4, -1.6);
    mundo.add(cable);
    const pantalla = cilindro(0.2, 0.75, 0.5, plastico(0x2457c5), 32);
    pantalla.position.set(x, 6.4, -1.6);
    mundo.add(pantalla);
    const foco = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), matLuz);
    foco.position.set(x, 6.1, -1.6);
    mundo.add(foco);
  });

  // ---------- órdenes de compra que vuelan del escritorio al corcho ----------
  const hojas = [];
  for (let k = 0; k < 4; k++) {
    const h = caja(0.55, 0.04, 0.75, plastico(0xffffff, { roughness: 0.4 }), 0.01);
    h.userData.fase = k / 4;
    scene.add(h);
    hojas.push(h);
  }

  // ---------- Vera ----------
  const vera = new THREE.Group();
  vera.position.set(0.6, 0, 2.4);
  vera.scale.setScalar(1.05);
  mundo.add(vera);
  // personaje de plastilina (mismo árbol que antes: caderas > tronco > cabeza / brazos)
  const pj = crearPersonajeArcilla({
    piel: 0xf5c9a4,
    saco: 0x2457c5,
    camisa: 0xf4f1ea,
    pantalon: 0x232a40,
    zapato: 0x2a2b33,
    pelo: 0xd7ae62,
    peloTipo: "bob",
    iris: "#3a6fa3",
    ceja: "#9a7436",
    labial: "#c75a5a",
    credencial: false,
  });
  vera.add(pj.raiz);
  const { patas, tronco, brazoI, brazoD, cabeza, ec, refrescarCara, R, ALTO_CABEZA } = pj;

  // tablet de inventario (la sostiene con la mano izquierda)
  const pantTab = textura(256, 340, () => {});
  const dibujarTablet = (ok = true, t = 0) => {
    const { ctx, w, h } = pantTab;
    ctx.fillStyle = "#0e1016";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#2457c5";
    ctx.fillRect(0, 0, w, 44);
    ctx.fillStyle = "#fff";
    ctx.font = "800 24px sans-serif";
    ctx.fillText(info.solicitud ? `LISTA #${info.solicitud}` : "SIN LISTA", 14, 31);
    for (let i = 0; i < 5; i++) {
      const it = info.lista[i];
      const col = it ? (it.prioridad >= 5 ? "#f43f5e" : it.prioridad === 4 ? "#ff8a4d" : "#60a5fa") : "#3a3f4d";
      const y = 66 + i * 54;
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.fillRect(10, y, w - 20, 44);
      ctx.fillStyle = col;
      ctx.fillRect(10, y, 8, 44);
      ctx.fillStyle = "#e5e7eb";
      ctx.font = "600 20px sans-serif";
      ctx.fillText((it?.articulo || "—").slice(0, 14), 28, y + 29);
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

  // auricular con micrófono (la luz verde parpadea cuando escucha o habla)
  const matAur = arcilla(0x16171c, { roughness: 0.45 });
  const arco = sombra(new THREE.Mesh(new THREE.TorusGeometry(R * 1.04 + 0.13, 0.055, 12, 48, Math.PI), matAur));
  arco.position.y = ALTO_CABEZA - 0.02;
  cabeza.add(arco);
  for (const lado of [1, -1]) {
    const orejera = sombra(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.16, 28), matAur));
    orejera.rotation.z = Math.PI / 2;
    orejera.position.set(lado * (R * 1.04 + 0.2), ALTO_CABEZA - 0.02, 0.02);
    cabeza.add(orejera);
  }
  const brazoMic = sombra(new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.7, 6, 12), matAur));
  brazoMic.position.set(R * 1.04 + 0.1, ALTO_CABEZA - 0.3, 0.45);
  brazoMic.rotation.set(Math.PI / 2 - 0.35, 0, -0.95);
  cabeza.add(brazoMic);
  const punta = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), new THREE.MeshBasicMaterial({ color: 0x3ecf6f, toneMapped: false }));
  punta.position.set(0.42, ALTO_CABEZA - 0.48, R * 0.92);
  cabeza.add(punta);

  // ---------- estado y animación ----------
  const ctrl = { estado: "idle", hablando: false, nivelExterno: -1, pulso: 0 };
  let t = 0;
  let visible = true;
  let id = 0;
  let destruido = false;
  let zoom = 1;
  const puntero = { x: 0, y: 0, dentro: false };

  const ACT = {
    revisar: { dur: [6, 9], texto: () => (info.lista.length ? `Revisa la lista de compra (${info.lista.length} ${info.lista.length === 1 ? "renglón" : "renglones"})` : "Revisa qué hay que comprar") },
    tablero: { dur: [5, 7], texto: () => (info.proveedores.length ? "Controla el cumplimiento de los proveedores" : "Mira el tablero de proveedores") },
    llamar: { dur: [5, 7], texto: () => (info.sinRecibir ? `Llama a un proveedor: hay ${info.sinRecibir} ${info.sinRecibir === 1 ? "renglón" : "renglones"} sin recibir` : "Atiende una llamada de un proveedor") },
    saludar: { dur: [2.2, 2.6], texto: () => "Saluda" },
    celebrar: { dur: [2.4, 3], texto: () => "¡Lista de compra cerrada!" },
  };
  let act = { id: "revisar", t0: 0, dur: 7 };
  const pasar = (nombre) => {
    const [a, b] = ACT[nombre].dur;
    act = { id: nombre, t0: t, dur: rnd(a, b) };
    avisarTexto();
  };
  function avisarTexto() {
    let txt;
    if (ctrl.estado === "listening") txt = "Te está escuchando";
    else if (ctrl.estado === "thinking") txt = "Armando la solicitud…";
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

  function actualizar(dt) {
    t += dt;
    const atiende = ctrl.estado !== "idle";
    // ritmo de actividades
    if (!atiende && t - act.t0 > act.dur) {
      const opciones = info.sinRecibir ? ["revisar", "llamar", "llamar", "tablero"] : ["revisar", "tablero", "llamar"];
      pasar(opciones[Math.floor(Math.random() * opciones.length)]);
    }
    const a = atiende ? "revisar" : act.id;
    const u = (t - act.t0) / act.dur;

    // objetivos de pose
    let objMirar = 0;
    let objBrazoI = 0.9; // tablet adelante
    let objBrazoD = 0.1;
    let objCabY = 0;
    let objCabX = 0.05;
    if (a === "revisar") {
      objCabX = 0.28;
      objBrazoI = 1.15;
      objBrazoD = Math.sin(t * 2.1) * 0.15 + 0.7 * (Math.sin(t * 1.1) > 0 ? 1 : 0.2); // desliza el dedo
    } else if (a === "tablero") {
      objMirar = -0.25;
      objCabY = -0.35 + Math.sin(t * 1.2) * 0.12;
      objCabX = -0.08;
      objBrazoD = 2.0;
    } else if (a === "llamar") {
      objBrazoD = 2.35;
      objCabY = 0.3;
      objBrazoI = 0.5 + Math.sin(t * 2) * 0.1;
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
    vera.rotation.y = pose.mirar * 0.5 + Math.sin(t * 0.3) * 0.03;
    tronco.rotation.x = 0.04 + Math.sin(t * 1.4) * 0.012;
    cabeza.rotation.y = pose.cabY;
    cabeza.rotation.x = pose.cabX;
    brazoI.pivote.rotation.x = -pose.brazoI;
    brazoI.pivote.rotation.z = 0.12;
    brazoD.pivote.rotation.x = -Math.min(pose.brazoD, 2.2);
    brazoD.pivote.rotation.z = pose.brazoD > 2.2 ? -0.35 - (pose.brazoD - 2.2) * 0.4 : -0.12;
    vera.position.y = Math.sin(t * 2.2) * 0.012;
    patas.forEach((p, i) => (p.rotation.x = Math.sin(t * 0.8 + i * 3) * 0.015));
    luzNaranja.intensity = 12 + Math.sin(t * 1.6) * 1.2;

    if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) dibujarTablet(!info.sinRecibir, t);
    if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) dibujarMonitor(t);
    if (Math.floor(t) !== Math.floor(t - dt)) dibujarReloj();

    // órdenes de compra: salen del escritorio, cruzan el aire y se "clavan" en el corcho
    hojas.forEach((h) => {
      const f = (h.userData.fase + t * 0.09) % 1;
      const k = suavizar(f);
      h.position.set(3.4 + (0.6 - 3.4) * k + Math.sin(f * 6) * 0.3, 2.2 + Math.sin(f * Math.PI) * 3.4 + f * 1.2, 2.2 + (-3.9 - 2.2) * k);
      h.rotation.set(Math.sin(f * 9) * 0.6, f * 5, Math.cos(f * 7) * 0.5);
      h.scale.setScalar(f < 0.06 ? f / 0.06 : f > 0.93 ? Math.max(0.001, (1 - f) / 0.07) : 1);
    });

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
    ec.sonrisa = a === "celebrar" ? 1 : hablando ? 0.3 : 0.55;
    ec.ceja = ctrl.estado === "thinking" ? 0.6 : info.sinRecibir && a === "llamar" ? -0.3 : 0;
    ec.mirarX = clamp(pose.cabY * -0.6, -1, 1);
    ec.mirarY = 0;
    ec.guiño = a === "saludar" && u > 0.4 && u < 0.7 ? 1 : 0;
    refrescarCara();
    punta.material.color.setHex(hablando || ctrl.estado === "listening" ? (Math.floor(t * 6) % 2 ? 0x3ecf6f : 0x1c7a43) : 0x3ecf6f);
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
    const dist = Math.max(3.4 / tanV, 6.0 / (tanV * camera.aspect)) * 1.04 + 1.0;
    controles.minDistance = dist * 0.55;
    controles.maxDistance = dist * 1.3;
    camera.position.copy(controles.target).addScaledVector(DIR_CAM, dist);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(ajustar);
  ro.observe(contenedor);
  ajustar();
  controles.update();

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
    if (rayo.intersectObject(vera, true).length) {
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

  return {
    setEstado(e) {
      if (e === ctrl.estado) return;
      const venia = ctrl.estado;
      ctrl.estado = e;
      if (e === "idle" && venia !== "idle") pasar("revisar");
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
    /** i: { panorama } con lo que devuelve /panorama de Vera: { lista, resumen, proveedores } */
    setInfo(i) {
      const d = i?.panorama || i || {};
      const antes = info.lista.length;
      info.lista = Array.isArray(d.lista?.items) ? d.lista.items : [];
      info.solicitud = d.lista?.abierta ? d.lista.solicitud_id : null;
      info.porFirmar = Number(d.resumen?.por_firmar) || 0;
      info.sinRecibir = Number(d.resumen?.sin_recibir) || 0;
      const prov = Array.isArray(d.proveedores) ? d.proveedores : [];
      if (JSON.stringify(prov) !== JSON.stringify(info.proveedores)) {
        info.proveedores = prov;
        dibujarCorcho();
      }
      dibujarMonitor(t);
      dibujarTablet(!info.sinRecibir, t);
      if (antes > 0 && info.lista.length === 0 && d.lista && !d.lista.abierta) {
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
