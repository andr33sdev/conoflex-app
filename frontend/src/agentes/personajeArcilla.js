// Personajes "de plastilina" de las agentes: cabeza grande y redonda, ojos con brillo, mejillas rosadas, saco blando,
// pelo con volumen. Todas comparten esta construcción y cambian por "estilo" (piel, ropa, peinado, color de ojos).
// La jerarquía es la misma que usaban las minifiguras (caderas > tronco > cabeza / brazos) para que las escenas sigan
// animándolas igual: rotan `tronco`, `cabeza` y los `pivote` de los brazos, y mueven la cara con `ec`.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const sombra = (m) => {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};
const elipse = (ctx, x, y, rx, ry) => {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
};

function lienzo(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { canvas, ctx, tex, w, h };
}

// Granito fino para que el material se vea como arcilla modelada y no como plástico liso.
let _bump = null;
function texturaGranito() {
  if (_bump) return _bump;
  const t = lienzo(256, 256);
  const { ctx } = t;
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5200; i++) {
    const v = 90 + Math.random() * 90;
    ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, 0.8 + Math.random() * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  t.tex.colorSpace = THREE.NoColorSpace;
  t.tex.wrapS = t.tex.wrapT = THREE.RepeatWrapping;
  t.tex.repeat.set(3, 3);
  _bump = t.tex;
  return _bump;
}

export const arcilla = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0, bumpMap: texturaGranito(), bumpScale: 0.9, ...extra });

const caja = (w, h, d, mat, r = 0.08) => sombra(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 5, Math.min(r, w / 2.1, h / 2.1, d / 2.1)), mat));
const esfera = (r, mat, sx = 1, sy = 1, sz = 1) => {
  const m = sombra(new THREE.Mesh(new THREE.SphereGeometry(r, 36, 28), mat));
  m.scale.set(sx, sy, sz);
  return m;
};
const capsula = (r, largo, mat) => sombra(new THREE.Mesh(new THREE.CapsuleGeometry(r, largo, 10, 24), mat));

/** Tubo que se afina hacia la punta (para la colita y las mechas): puntos = [[x,y,z],...]. */
export function mechaAfinada(puntos, radioIni, radioFin, mat, seg = 36) {
  const curva = new THREE.CatmullRomCurve3(puntos.map((p) => new THREE.Vector3(...p)));
  const radial = 16;
  const g = new THREE.TubeGeometry(curva, seg, 1, radial, false);
  const pos = g.attributes.position;
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const c = curva.getPointAt(u);
    const k = (radioIni + (radioFin - radioIni) * Math.pow(u, 0.85)) * (1 + 0.16 * Math.sin(u * Math.PI)); // panza en el medio
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      pos.setXYZ(idx, c.x + (pos.getX(idx) - c.x) * k, c.y + (pos.getY(idx) - c.y) * k, c.z + (pos.getZ(idx) - c.z) * k);
    }
  }
  g.computeVertexNormals();
  return sombra(new THREE.Mesh(g, mat));
}

// ---------- cara ----------
// e: parp (0-1), boca (0-1), forma (0 ancha, 1 redonda), sonrisa (-1..1), ceja (-1..1), mirarX/Y, guiño (0-1)
export function dibujarCaraArcilla(ctx, W, H, e, est = {}) {
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const iris = est.iris || "#6b3f23";
  const cejaColor = est.ceja || "#5a3320";
  const labial = est.labial || "#c2514a";
  // mejillas rosadas, suaves
  for (const cx of [0.15, 0.85]) {
    const g = ctx.createRadialGradient(W * cx, H * 0.66, 2, W * cx, H * 0.66, 62);
    g.addColorStop(0, "rgba(255,120,110,0.55)");
    g.addColorStop(1, "rgba(255,120,110,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  for (const sx of [0.3, 0.7]) {
    const dir = sx < 0.5 ? -1 : 1;
    const guiño = e.guiño > 0 && dir === 1 ? e.guiño : 0;
    const cierre = Math.max(e.parp, guiño);
    const x = W * sx;
    const y = H * 0.45;
    const ry = Math.max(2.5, 50 * (1 - cierre * 0.94));
    const rx = 45;
    if (cierre < 0.9) {
      // ojo: esclerótica blanca, iris, pupila y dos brillos
      ctx.save();
      elipse(ctx, x, y, rx, ry);
      ctx.fillStyle = "#fffdf8";
      ctx.fill();
      ctx.clip();
      const ox = e.mirarX * 10;
      const oy = e.mirarY * 9;
      const gi = ctx.createRadialGradient(x + ox, y + oy, 3, x + ox, y + oy, 29);
      gi.addColorStop(0, "#2a1810");
      gi.addColorStop(0.45, iris);
      gi.addColorStop(1, "#2a1810");
      ctx.fillStyle = gi;
      elipse(ctx, x + ox, y + oy, 28, 30);
      ctx.fill();
      ctx.fillStyle = "#0e0806";
      elipse(ctx, x + ox, y + oy, 14, 15);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      elipse(ctx, x + ox - 9, y + oy - 11, 8, 8);
      ctx.fill();
      elipse(ctx, x + ox + 10, y + oy + 10, 3.6, 3.6);
      ctx.fill();
      // sombra del párpado sobre el ojo
      const gs = ctx.createLinearGradient(0, y - ry, 0, y - ry + 22);
      gs.addColorStop(0, "rgba(60,30,20,0.35)");
      gs.addColorStop(1, "rgba(60,30,20,0)");
      ctx.fillStyle = gs;
      ctx.fillRect(x - rx, y - ry, rx * 2, 24);
      ctx.restore();
      ctx.strokeStyle = "rgba(70,40,28,0.7)";
      ctx.lineWidth = 3.5;
      elipse(ctx, x, y, rx, ry);
      ctx.stroke();
    }
    // párpado superior marcado y pestañitas hacia afuera
    ctx.strokeStyle = "#2a1810";
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(x - rx - 2, y + (cierre > 0.9 ? 2 : -ry * 0.1));
    ctx.quadraticCurveTo(x, y - ry * (cierre > 0.9 ? -0.2 : 1.18) - 3, x + rx + 2, y + (cierre > 0.9 ? 2 : -ry * 0.1));
    ctx.stroke();
    ctx.lineWidth = 4.5;
    for (const [dx, dy] of [[10, -6], [16, -16], [8, -24]]) {
      ctx.beginPath();
      ctx.moveTo(x + dir * (rx - 2), y - ry * 0.35);
      ctx.lineTo(x + dir * (rx + dx), y - ry * 0.35 + dy * (cierre > 0.9 ? 0.2 : 0.55));
      ctx.stroke();
    }
    // ceja expresiva (ceja>0 sube, <0 se frunce hacia el centro)
    const yb = H * 0.27 - e.ceja * 20;
    const interior = e.ceja < 0 ? -e.ceja * 14 : 0;
    ctx.strokeStyle = cejaColor;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(x - 38, yb + 9 + (dir > 0 ? interior : 0));
    ctx.quadraticCurveTo(x - 4 * dir, yb - 13, x + 38, yb + 8 + (dir < 0 ? interior : 0));
    ctx.stroke();
  }
  // naricita: sombra suave y un brillo
  const gn = ctx.createRadialGradient(W * 0.5, H * 0.62, 1, W * 0.5, H * 0.62, 22);
  gn.addColorStop(0, "rgba(170,90,60,0.28)");
  gn.addColorStop(1, "rgba(170,90,60,0)");
  ctx.fillStyle = gn;
  ctx.fillRect(W * 0.5 - 30, H * 0.5, 60, 60);
  // boca
  const cx = W * 0.5;
  const cy = H * 0.75;
  const ancho = 36 + e.sonrisa * 26;
  if (e.boca > 0.1) {
    const abre = 7 + e.boca * 32;
    const aw = ancho * (1 - e.forma * 0.45);
    ctx.fillStyle = "#5a1a22";
    ctx.beginPath();
    ctx.moveTo(cx - aw, cy - 3);
    ctx.quadraticCurveTo(cx, cy - 8 + e.sonrisa * 4, cx + aw, cy - 3);
    ctx.quadraticCurveTo(cx + aw * 0.7, cy + abre * 1.8, cx, cy + abre * 1.9);
    ctx.quadraticCurveTo(cx - aw * 0.7, cy + abre * 1.8, cx - aw, cy - 3);
    ctx.fill();
    if (e.boca > 0.3 && e.forma < 0.5) {
      ctx.fillStyle = "#fff8ee";
      ctx.beginPath();
      ctx.roundRect(cx - aw * 0.66, cy - 5, aw * 1.32, 11, 5);
      ctx.fill();
      ctx.fillStyle = "#f08a86";
      elipse(ctx, cx, cy + abre * 1.4, aw * 0.4, abre * 0.34);
      ctx.fill();
    }
    ctx.strokeStyle = labial;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(cx - aw, cy - 3);
    ctx.quadraticCurveTo(cx, cy - 8 + e.sonrisa * 4, cx + aw, cy - 3);
    ctx.quadraticCurveTo(cx + aw * 0.7, cy + abre * 1.8, cx, cy + abre * 1.9);
    ctx.quadraticCurveTo(cx - aw * 0.7, cy + abre * 1.8, cx - aw, cy - 3);
    ctx.stroke();
  } else {
    ctx.strokeStyle = labial;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(cx - ancho, cy - e.sonrisa * 3);
    ctx.quadraticCurveTo(cx, cy + 5 + 30 * e.sonrisa, cx + ancho, cy - e.sonrisa * 3);
    ctx.stroke();
  }
}

/** Frente del torso: camisa en V, solapas y botones del saco (o nada, si lleva chaleco). */
function dibujarPecho(ctx, w, h, est) {
  ctx.clearRect(0, 0, w, h);
  if (est.atuendo === "chaleco") return;
  const camisa = est.camisaCss || "#a9cbea";
  // V de la camisa
  ctx.fillStyle = camisa;
  ctx.beginPath();
  ctx.moveTo(w * 0.34, 0);
  ctx.lineTo(w * 0.66, 0);
  ctx.lineTo(w * 0.5, h * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 3;
  ctx.stroke();
  // botones
  ctx.fillStyle = "#f4f1ea";
  for (const y of [0.18, 0.34, 0.5]) {
    elipse(ctx, w * 0.5, h * y, 6, 6);
    ctx.fill();
  }
  // credencial con el naranja de Conoflex
  if (est.credencial) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.roundRect(w * 0.68, h * 0.46, w * 0.2, h * 0.24, 8);
    ctx.fill();
    ctx.fillStyle = "#e85c0d";
    ctx.fillRect(w * 0.68, h * 0.46, w * 0.2, h * 0.06);
  }
}

/**
 * @param {object} est estilo: piel, saco, camisa, pantalon, zapato, pelo (colores hex), peloTipo ("colita"|"trenza"|"bob"),
 *   iris, ceja, labial (css), atuendo ("saco"|"chaleco"), sentada, credencial, chaleco (hex)
 */
export function crearPersonajeArcilla(est = {}) {
  const piel = est.piel ?? 0xf0b98c;
  const matPiel = arcilla(piel, { roughness: 0.6 });
  const matSaco = arcilla(est.saco ?? 0x24305e);
  const matCamisa = arcilla(est.camisa ?? 0xa9cbea);
  const matPant = arcilla(est.pantalon ?? 0x1f2740);
  const matZapa = arcilla(est.zapato ?? 0x2a2b33, { roughness: 0.55 });
  const matPelo = arcilla(est.pelo ?? 0x7a4a30, { roughness: 0.58 });
  const R = 0.82;
  const ALTO_CABEZA = 0.78; // centro de la esfera de la cabeza sobre el cuello

  const raiz = new THREE.Group();
  const caderas = new THREE.Group();
  caderas.position.y = est.sentada ? 1.1 : 1.15;
  raiz.add(caderas);

  // piernas
  const patas = [];
  for (const lado of [1, -1]) {
    const pivote = new THREE.Group();
    pivote.position.set(lado * 0.36, 0, 0);
    const muslo = capsula(0.27, 0.72, matPant);
    muslo.position.y = -0.58;
    pivote.add(muslo);
    const zapa = esfera(0.3, matZapa, 1, 0.62, 1.45);
    zapa.position.set(0, -1.12, 0.12);
    pivote.add(zapa);
    if (est.sentada) pivote.rotation.x = -Math.PI / 2 + 0.02;
    caderas.add(pivote);
    patas.push(pivote);
  }
  const pelvis = caja(1.32, 0.5, 0.86, matPant, 0.22);
  pelvis.position.y = 0.08;
  caderas.add(pelvis);

  // tronco
  const tronco = new THREE.Group();
  tronco.position.y = est.sentada ? 0.45 : 0.2;
  caderas.add(tronco);
  const chaleco = est.atuendo === "chaleco";
  const torso = caja(1.5, 1.6, 0.95, chaleco ? matCamisa : matSaco, 0.3);
  torso.position.y = 0.8;
  tronco.add(torso);
  const lienzoPecho = lienzo(512, 560);
  const dibujarP = () => {
    dibujarPecho(lienzoPecho.ctx, 512, 560, {
      ...est,
      camisaCss: `#${(est.camisa ?? 0xa9cbea).toString(16).padStart(6, "0")}`,
    });
    lienzoPecho.tex.needsUpdate = true;
  };
  dibujarP();
  if (!chaleco) {
    const pecho = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 1.1),
      new THREE.MeshStandardMaterial({ map: lienzoPecho.tex, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    pecho.position.set(0, 0.95, 0.478);
    tronco.add(pecho);
    // solapas del saco: dos tiras blandas en V
    for (const lado of [1, -1]) {
      const solapa = caja(0.3, 1.0, 0.1, matSaco, 0.05);
      solapa.position.set(lado * 0.3, 0.98, 0.5);
      solapa.rotation.z = lado * 0.3;
      tronco.add(solapa);
      const cuello = caja(0.26, 0.2, 0.1, matCamisa, 0.05);
      cuello.position.set(lado * 0.17, 1.55, 0.44);
      cuello.rotation.z = lado * -0.5;
      tronco.add(cuello);
    }
  } else {
    // chaleco naranja a cada lado y bandas reflectivas
    const matChal = arcilla(est.chaleco ?? 0xff7a00);
    const matRef = arcilla(0xdfe6ee, { roughness: 0.35, metalness: 0.3 });
    for (const lado of [1, -1]) {
      const panel = caja(0.62, 1.5, 1.0, matChal, 0.24);
      panel.position.set(lado * 0.46, 0.8, 0);
      tronco.add(panel);
    }
    for (const y of [0.45, 1.05]) {
      const banda = caja(1.56, 0.13, 1.02, matRef, 0.05);
      banda.position.set(0, y, 0);
      tronco.add(banda);
    }
    if (est.credencial) {
      const cred = caja(0.28, 0.34, 0.05, arcilla(0xffffff), 0.03);
      cred.position.set(-0.7, 1.0, 0.53);
      tronco.add(cred);
    }
  }
  const cuello = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.3, 24), matPiel);
  cuello.position.y = 1.66;
  tronco.add(cuello);

  // brazos
  const hacerBrazo = (lado) => {
    const pivote = new THREE.Group();
    pivote.position.set(lado * 0.97, 1.36, 0);
    const manga = capsula(0.23, 0.62, chaleco ? matCamisa : matSaco);
    manga.position.y = -0.48;
    pivote.add(manga);
    const mano = new THREE.Group();
    mano.position.y = -1.05;
    mano.add(esfera(0.25, matPiel));
    const pulgar = esfera(0.1, matPiel);
    pulgar.position.set(lado * -0.1, 0.02, 0.2);
    mano.add(pulgar);
    pivote.add(mano);
    tronco.add(pivote);
    return { pivote, mano };
  };
  const brazoI = hacerBrazo(1);
  const brazoD = hacerBrazo(-1);

  // cabeza
  const cabeza = new THREE.Group();
  cabeza.position.y = 1.78;
  tronco.add(cabeza);
  const craneo = esfera(R, matPiel, 1.04, 0.96, 1);
  craneo.position.y = ALTO_CABEZA;
  cabeza.add(craneo);
  // orejas
  for (const lado of [1, -1]) {
    const oreja = esfera(0.15, matPiel, 0.55, 1, 0.8);
    oreja.position.set(lado * (R * 1.04 + 0.01), ALTO_CABEZA - 0.02, 0);
    cabeza.add(oreja);
    const interior = esfera(0.08, arcilla(0xd68f6c), 0.5, 0.9, 0.7);
    interior.position.set(lado * (R * 1.04 + 0.07), ALTO_CABEZA - 0.02, 0.02);
    cabeza.add(interior);
  }
  // nariz de arcilla
  const nariz = esfera(0.095, matPiel);
  nariz.position.set(0, ALTO_CABEZA - 0.1, R * 0.98);
  cabeza.add(nariz);

  // cara dibujada sobre un parche de esfera
  const cara = lienzo(1024, 660);
  const ec = { parp: 0, boca: 0, forma: 0, sonrisa: 0.5, ceja: 0, mirarX: 0, mirarY: 0, guiño: 0 };
  let claveCara = "";
  const refrescarCara = (forzar) => {
    const clave = [ec.parp, ec.boca, ec.forma, ec.sonrisa, ec.ceja, ec.mirarX, ec.mirarY, ec.guiño].map((v) => Math.round(v * 10)).join("|");
    if (clave === claveCara && !forzar) return;
    claveCara = clave;
    cara.ctx.save();
    cara.ctx.scale(2, 2);
    dibujarCaraArcilla(cara.ctx, 512, 330, ec, { iris: est.iris, ceja: est.ceja, labial: est.labial });
    cara.ctx.restore();
    cara.tex.needsUpdate = true;
  };
  refrescarCara(true);
  const decalCara = new THREE.Mesh(
    new THREE.SphereGeometry(R + 0.006, 64, 48, Math.PI / 2 - 0.98, 1.96, 0.92, 1.34),
    new THREE.MeshStandardMaterial({ map: cara.tex, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  decalCara.scale.set(1.04, 0.96, 1);
  decalCara.position.y = ALTO_CABEZA;
  cabeza.add(decalCara);

  // ---------- pelo ----------
  const Rh = R + 0.075;
  const pelo = new THREE.Group();
  pelo.position.y = ALTO_CABEZA;
  cabeza.add(pelo);
  const parte = (geo, sx = 1.04, sy = 0.96) => {
    const m = sombra(new THREE.Mesh(geo, matPelo));
    m.scale.set(sx, sy, 1);
    pelo.add(m);
    return m;
  };
  const tipo = est.peloTipo || "colita";
  // casquete: toda la coronilla hasta la línea de la frente
  parte(new THREE.SphereGeometry(Rh, 64, 40, 0, Math.PI * 2, 0, 1.0));
  // nuca y laterales: toda la vuelta menos una ventana al frente para la cara
  const ventana = tipo === "bob" ? 1.2 : 1.12;
  const largoAtras = tipo === "bob" ? 2.55 : tipo === "trenza" ? 2.0 : 2.15;
  parte(new THREE.SphereGeometry(Rh, 64, 40, Math.PI / 2 + ventana, Math.PI * 2 - ventana * 2, 0, largoAtras));
  // dos grandes mechones que caen desde la raya al medio hasta las sienes
  for (const lado of [1, -1]) {
    if (!est.casco) {
    const mechon = esfera(0.5, matPelo, 1, 1.0, 0.62);
    mechon.position.set(lado * 0.4, 0.5, R * 0.64);
    mechon.rotation.set(0.5, lado * 0.25, lado * -0.55);
    mechon.scale.set(1.0, 0.82, 0.5);
    pelo.add(mechon);
    }
    const sien = capsula(0.17, 0.5, matPelo);
    sien.position.set(lado * (R * 1.04 - 0.02), 0.05, R * 0.34);
    sien.rotation.set(0.15, lado * -0.1, lado * 0.06);
    pelo.add(sien);
  }
  if (tipo === "colita") {
    const goma = esfera(0.17, arcilla(est.goma ?? 0xe85c0d), 1, 0.8, 1);
    goma.position.set(0.12, 1.05, -R * 0.78);
    pelo.add(goma);
    const cola = mechaAfinada(
      [[0.12, 1.05, -R * 0.78], [0.3, 1.22, -R * 1.18], [0.62, 0.7, -R * 1.5], [0.58, 0.0, -R * 1.45], [0.78, -0.5, -R * 1.3], [0.7, -1.0, -R * 1.2]],
      0.3,
      0.07,
      matPelo,
    );
    pelo.add(cola);
  } else if (tipo === "trenza") {
    const goma = esfera(0.16, arcilla(est.goma ?? 0x3ecf6f), 1, 0.8, 1);
    goma.position.set(0, -0.25, -R * 1.0);
    pelo.add(goma);
    [0, 1, 2, 3].forEach((k) => {
      const b = esfera(0.26 - k * 0.035, matPelo, 1, 1.15, 0.9);
      b.position.set(0, -0.55 - k * 0.42, -R * 1.02 - 0.12 - k * 0.04);
      pelo.add(b);
    });
    const punta = esfera(0.13, arcilla(est.goma ?? 0x3ecf6f), 1, 0.7, 1);
    punta.position.set(0, -2.25, -R * 1.22);
    pelo.add(punta);
  } else if (tipo === "bob") {
    // carré a la altura de la mandíbula, con las puntas hacia adentro
    for (const lado of [1, -1]) {
      const cortina = capsula(0.3, 0.55, matPelo);
      cortina.position.set(lado * (R * 1.02), -0.18, -0.02);
      cortina.scale.set(0.9, 1, 1.15);
      pelo.add(cortina);
    }
    const fondo = esfera(1.0, matPelo, 1.02, 0.5, 0.82);
    fondo.position.set(0, -0.42, -0.2);
    pelo.add(fondo);
  }

  const baseCabeza = new Set(cabeza.children);
  raiz.traverse((o) => {
    if (o.isMesh) o.userData.cuerpo = true; // el modelo 3D real (VRM) los reemplaza al cargar
  });
  return { baseCabeza, raiz, caderas, patas, tronco, brazoI, brazoD, cabeza, ec, refrescarCara, R, ALTO_CABEZA, pelo, mats: { piel: matPiel, saco: matSaco, pelo: matPelo, pantalon: matPant, camisa: matCamisa }, dibujarPecho: dibujarP };
}
