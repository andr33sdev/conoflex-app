// Mujeres de oficina 3D realistas (Microsoft Rocketbox, licencia MIT) para las agentes.
// Se montan sobre el "esqueleto lógico" que ya mueven las escenas (tronco, cabeza, brazos, cara `ec`): cada cuadro se copian
// esas poses a los huesos del modelo, trabajando con direcciones en el espacio del mundo (así no importa cómo estén orientados
// los ejes de cada hueso). Si el archivo no carga, queda a la vista el personaje de respaldo.
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const I = new THREE.Quaternion();

function cargarTextura(url, color) {
  const t = new THREE.TextureLoader().load(url);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * @param {object} pj  personaje de respaldo (crearPersonajeArcilla) que anima la escena
 * @param {{carpeta:string, prefijo:string, sentada?:boolean, altura?:number, giro?:number}} opt
 *   carpeta: URL de la carpeta con modelo.fbx y texturas; prefijo: "f014", "f016"...
 */
export async function vestirConFBX(pj, { carpeta, prefijo, sentada = false, altura = 6, giro = 0, desfaseZ = 0 }) {
  const base = pj.baseCabeza;
  const fbx = await new Promise((ok, mal) => new FBXLoader().load(`${carpeta}/modelo.fbx`, ok, undefined, mal));

  // texturas (el FBX las referencia como .tga; se reemplazan por JPG/PNG livianos)
  const mallas = [];
  fbx.traverse((o) => {
    if (o.isSkinnedMesh || o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
      mallas.push(o);
      for (const m of [].concat(o.material)) {
        const n = m.name || "";
        const parte = ["body", "head", "opacity"].find((p) => n.endsWith(p));
        if (!parte) continue;
        const f = (suf) => `${carpeta}/${prefijo}_${parte}_${suf}`;
        m.map = cargarTextura(parte === "opacity" ? f("color.png") : f("color.jpg"), true);
        if (parte !== "opacity") {
          m.normalMap = cargarTextura(f("normal.jpg"), false);
          m.normalScale?.set(0.8, 0.8);
          m.specularMap = cargarTextura(f("specular.jpg"), false);
          m.specular?.setScalar(0.12);
          m.shininess = 18;
        } else {
          m.transparent = true;
          m.alphaTest = 0.4;
          m.depthWrite = true;
          m.side = THREE.DoubleSide;
        }
        m.color?.setScalar(1);
        m.needsUpdate = true;
      }
    }
  });

  const hoja = new THREE.Group(); // envoltorio: acá se escala, se orienta y se ubica
  hoja.add(fbx);
  hoja.rotation.y = giro;
  pj.raiz.add(hoja);
  hoja.updateMatrixWorld(true);
  const caja = new THREE.Box3().setFromObject(fbx);
  const alto = Math.max(0.01, caja.max.y - caja.min.y);
  const S = altura / alto;
  hoja.scale.setScalar(S);
  const bone = (n) => fbx.getObjectByName(n);
  const pelvis = bone("Bip01_Pelvis");
  const alturaCadera = pelvis.getWorldPosition(new THREE.Vector3()).y - caja.min.y * S; // (la posición del mundo ya incluye la escala)
  hoja.position.z = desfaseZ;
  hoja.position.y = sentada ? pj.caderas.position.y + 0.12 - alturaCadera : -caja.min.y * S;
  hoja.updateMatrixWorld(true);

  // huesos que se manejan, con su pose de reposo respecto de la envoltura
  const qHoja = new THREE.Quaternion();
  const qHojaInv = new THREE.Quaternion();
  hoja.getWorldQuaternion(qHoja);
  qHojaInv.copy(qHoja).invert();
  const wq = new THREE.Quaternion();
  const wp = new THREE.Vector3();
  const hojaPos = new THREE.Vector3();
  const reposo = new Map();
  const rel = (o, out) => out.copy(qHojaInv).multiply(o.getWorldQuaternion(wq));
  const posRel = (o) => o.getWorldPosition(new THREE.Vector3()).sub(hoja.getWorldPosition(wp)).applyQuaternion(qHojaInv);
  const nombres = [
    "Bip01_Spine", "Bip01_Spine1", "Bip01_Spine2", "Bip01_Neck", "Bip01_Head",
    "Bip01_L_UpperArm", "Bip01_L_Forearm", "Bip01_L_Hand", "Bip01_R_UpperArm", "Bip01_R_Forearm", "Bip01_R_Hand",
    "Bip01_Pelvis", "Bip01_L_Thigh", "Bip01_L_Calf", "Bip01_L_Foot", "Bip01_R_Thigh", "Bip01_R_Calf", "Bip01_R_Foot",
  ];
  for (const n of nombres) {
    const b = bone(n);
    if (b) reposo.set(n, { b, q: rel(b, new THREE.Quaternion()), p: posRel(b), largo: 0 });
  }
  for (const [a, b] of [["Bip01_L_UpperArm", "Bip01_L_Forearm"], ["Bip01_L_Forearm", "Bip01_L_Hand"], ["Bip01_R_UpperArm", "Bip01_R_Forearm"], ["Bip01_R_Forearm", "Bip01_R_Hand"]])
    reposo.get(a).largo = reposo.get(b).p.distanceTo(reposo.get(a).p);
  const dirReposo = (a, b) => reposo.get(b).p.clone().sub(reposo.get(a).p).normalize();
  const dirBrazo = { L: dirReposo("Bip01_L_UpperArm", "Bip01_L_Forearm"), R: dirReposo("Bip01_R_UpperArm", "Bip01_R_Forearm") };
  const dirAntebrazo = { L: dirReposo("Bip01_L_Forearm", "Bip01_L_Hand"), R: dirReposo("Bip01_R_Forearm", "Bip01_R_Hand") };
  const dirMuslo = { L: dirReposo("Bip01_L_Thigh", "Bip01_L_Calf"), R: dirReposo("Bip01_R_Thigh", "Bip01_R_Calf") };
  const dirPierna = { L: dirReposo("Bip01_L_Calf", "Bip01_L_Foot"), R: dirReposo("Bip01_R_Calf", "Bip01_R_Foot") };

  // lo que sostiene en la mano (tablet, taza, celular) pasa a la mano del modelo, con la orientación del brazo lógico
  const adaptadores = {};
  for (const [lado, rig] of [["L", pj.brazoI], ["R", pj.brazoD]]) {
    const hueso = bone(`Bip01_${lado}_Hand`);
    const punta = new THREE.Object3D(); // dónde tiene la mano el esqueleto lógico: hacia ahí estira el brazo del modelo
    punta.position.copy(rig.mano.position);
    rig.mano.parent.add(punta);
    const largoRig = Math.max(0.01, rig.mano.position.distanceTo(rig.pivote.position));
    const adaptador = new THREE.Group();
    adaptador.scale.setScalar(1 / S);
    hueso.add(adaptador);
    adaptador.add(rig.mano);
    rig.mano.position.set(0, -0.1, 0);
    adaptadores[lado] = { adaptador, rig, hueso, punta, largoRig };
  }
  // lo que ya no hace falta del respaldo
  pj.raiz.traverse((o) => {
    if (o.userData?.cuerpo) o.visible = false;
  });
  for (const c of pj.cabeza.children) if (!base.has(c)) c.visible = false;

  // morph targets de la cara (nombres tipo ARKit / visemas)
  const morph = {};
  for (const m of mallas) {
    if (!m.morphTargetDictionary) continue;
    for (const [n, i] of Object.entries(m.morphTargetDictionary)) {
      const corto = n.split(".").pop();
      (morph[corto] ||= []).push([m, i]);
    }
  }
  const fijar = (nombre, v) => {
    for (const [m, i] of morph[nombre] || []) m.morphTargetInfluences[i] = clamp(v, 0, 1);
  };

  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const pq = new THREE.Quaternion();
  const w = new THREE.Vector3();
  const FRENTE = new THREE.Vector3(0, 0, 1);
  const rigRel = (o, out) => out.copy(qHojaInv).multiply(o.getWorldQuaternion(wq));

  // pone el hueso para que su orientación respecto de la envoltura sea `qDeseada`
  const orientar = (n, qDeseada) => {
    const r = reposo.get(n);
    if (!r) return;
    r.b.parent.updateWorldMatrix(true, false);
    r.b.parent.getWorldQuaternion(pq);
    pq.premultiply(qHojaInv).invert();
    r.b.quaternion.copy(pq).multiply(qDeseada);
  };
  // hace que el hueso apunte (su dirección de reposo) hacia `dir`
  const apuntar = (n, dirRep, dir) => {
    q.setFromUnitVectors(dirRep, dir);
    orientar(n, q.multiply(reposo.get(n).q));
  };

  pj.fbx = fbx;
  // vida propia continua: respiración, balanceo, micro-movimientos de cabeza, mirada que se mueve sola y parpadeo
  let t = Math.random() * 50;
  let sacX = 0, sacY = 0, sacMX = 0, sacMY = 0, sacT = 0, parpT = 2 + Math.random() * 3, parpU = -1;
  const EX = new THREE.Vector3(1, 0, 0), EY = new THREE.Vector3(0, 1, 0), EZ = new THREE.Vector3(0, 0, 1);
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion();
  const rot = (out, x, y, z) => out.setFromAxisAngle(EX, x).multiply(qa.setFromAxisAngle(EY, y)).multiply(qb.setFromAxisAngle(EZ, z));
  pj.actualizar = (dt = 0.016) => {
    const { ec } = pj;
    t += dt;
    sacT -= dt;
    if (sacT <= 0) {
      sacT = 0.6 + Math.random() * 2.2;
      sacMX = (Math.random() - 0.5) * 0.5;
      sacMY = (Math.random() - 0.5) * 0.3;
    }
    sacX += (sacMX - sacX) * Math.min(1, dt * 18);
    sacY += (sacMY - sacY) * Math.min(1, dt * 18);
    parpT -= dt;
    if (parpT <= 0 && parpU < 0) parpU = 0;
    let parpropio = 0;
    if (parpU >= 0) {
      parpU += dt / 0.16;
      parpropio = Math.sin(Math.min(1, parpU) * Math.PI);
      if (parpU >= 1) {
        parpU = -1;
        parpT = 1.8 + Math.random() * 4.5;
      }
    }
    const resp = Math.sin(t * 1.55);
    pj.raiz.updateMatrixWorld(true);
    hoja.getWorldQuaternion(qHoja);
    qHojaInv.copy(qHoja).invert();
    hoja.getWorldPosition(hojaPos);

    // columna, cuello y cabeza: la rotación (respecto del reposo) del esqueleto lógico se reparte entre los huesos
    const rt = rigRel(pj.tronco, new THREE.Quaternion());
    const rc = rigRel(pj.cabeza, new THREE.Quaternion());
    const hablando = ec.boca > 0.15 ? 1 : 0;
    rt.multiply(rot(qc, resp * 0.012 + Math.sin(t * 0.37) * 0.006, 0, Math.sin(t * 0.29) * 0.012));
    rc.multiply(rot(qc, Math.sin(t * 0.41 + 1) * 0.02 + resp * 0.006 + hablando * Math.sin(t * 5.1) * 0.025, Math.sin(t * 0.53) * 0.035 + Math.sin(t * 1.3) * 0.01, Math.sin(t * 0.33) * 0.02));
    if (!sentada) {
      // se apoya en una pierna y luego en la otra
      const pe = reposo.get("Bip01_Pelvis");
      const ladeo = Math.sin(t * 0.31) * 0.03;
      orientar("Bip01_Pelvis", rot(qc, 0, Math.sin(t * 0.23) * 0.03, ladeo).multiply(pe.q));
      for (const n of ["L_Thigh", "L_Calf", "L_Foot", "R_Thigh", "R_Calf", "R_Foot"]) orientar(`Bip01_${n}`, reposo.get(`Bip01_${n}`).q); // los pies no se mueven
    }
    const parte = (Q, f, n) => orientar(n, q2.copy(I).slerp(Q, f).multiply(reposo.get(n).q));
    parte(rt, 0.35, "Bip01_Spine");
    parte(rt, 0.7, "Bip01_Spine1");
    parte(rt, 1, "Bip01_Spine2");
    parte(rc, 0.45, "Bip01_Neck");
    parte(rc, 1, "Bip01_Head");

    // brazos: cinemática inversa de dos huesos. La mano del modelo va adonde el esqueleto lógico tiene la suya
    // (medido desde el hombro y escalado al largo de brazo del modelo), así tocan el teclado, la tablet, la taza, etc.
    for (const [lado, a] of Object.entries(adaptadores)) {
      const sg = lado === "L" ? 1 : -1;
      const nu = `Bip01_${lado}_UpperArm`;
      const nf = `Bip01_${lado}_Forearm`;
      const l1 = reposo.get(nu).largo;
      const l2 = reposo.get(nf).largo;
      reposo.get(nu).b.parent.updateWorldMatrix(true, false);
      const hombro = reposo.get(nu).b.getWorldPosition(new THREE.Vector3()).sub(hojaPos).applyQuaternion(qHojaInv);
      const hombroRig = a.rig.pivote.getWorldPosition(new THREE.Vector3());
      const manoRig = a.punta.getWorldPosition(new THREE.Vector3());
      const meta = manoRig.sub(hombroRig).applyQuaternion(qHojaInv).multiplyScalar(((l1 + l2) / a.largoRig) * 0.98).add(hombro);
      // el codo cae hacia abajo y un poco hacia afuera y atrás
      const eje = meta.clone().sub(hombro);
      const d = clamp(eje.length(), 0.05, (l1 + l2) * 0.995);
      eje.normalize();
      const polo = new THREE.Vector3(sg * 0.45, -1, -0.35);
      polo.addScaledVector(eje, -polo.dot(eje)).normalize();
      const aa = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
      const hh = Math.sqrt(Math.max(0, l1 * l1 - aa * aa));
      const codo = hombro.clone().addScaledVector(eje, aa).addScaledVector(polo, hh);
      const dUp = codo.clone().sub(hombro).normalize();
      const dFo = hombro.clone().addScaledVector(eje, d).sub(codo).normalize();
      apuntar(nu, dirBrazo[lado], dUp);
      apuntar(nf, dirAntebrazo[lado], dFo);
      // antebrazo en pronación (palma hacia abajo) a medida que el brazo se adelanta
      const adelante = clamp(dFo.dot(FRENTE), 0, 1);
      if (adelante > 0.01) {
        q2.setFromAxisAngle(dFo, sg * 1.25 * adelante);
        const rf = reposo.get(nf).b;
        rf.parent.updateWorldMatrix(true, false);
        rf.parent.getWorldQuaternion(pq);
        pq.premultiply(qHojaInv);
        const actual = pq.clone().multiply(rf.quaternion);
        orientar(nf, q2.multiply(actual));
      }
    }
    // piernas
    if (sentada) {
      for (const lado of ["L", "R"]) {
        const sg = lado === "L" ? 1 : -1;
        w.set(sg * 0.06, -0.04, 1).normalize();
        apuntar(`Bip01_${lado}_Thigh`, dirMuslo[lado], w);
        w.set(sg * 0.02, -1, 0.12).normalize();
        apuntar(`Bip01_${lado}_Calf`, dirPierna[lado], w);
      }
    }
    // cosas en la mano: misma orientación que el brazo lógico
    fbx.updateMatrixWorld(true);
    for (const a of Object.values(adaptadores)) {
      a.hueso.getWorldQuaternion(wq);
      a.adaptador.quaternion.copy(wq).invert().multiply(a.rig.pivote.getWorldQuaternion(q2));
    }

    // cara
    const abre = ec.boca * (1 - ec.forma);
    const redonda = ec.boca * ec.forma;
    const parp = Math.max(ec.parp, parpropio);
    fijar("AK_09_EyeBlinkLeft", parp);
    fijar("AK_10_EyeBlinkRight", parp);
    fijar("AK_25_JawOpen", abre * 0.7 + redonda * 0.25);
    fijar("AA_VI_10_aa", abre * 0.8);
    fijar("AA_VI_13_O", redonda * 0.9);
    fijar("AK_32_MouthFunnel", redonda * 0.4);
    const sonrisa = clamp((ec.sonrisa - 0.2) * 0.9, 0, 0.85);
    fijar("AK_44_MouthSmileLeft", sonrisa);
    fijar("AK_45_MouthSmileRight", sonrisa);
    fijar("AK_07_CheekSquintLeft", sonrisa * 0.4);
    fijar("AK_08_CheekSquintRight", sonrisa * 0.4);
    fijar("AK_01_BrowDownLeft", clamp(-ec.ceja, 0, 1) * 0.6);
    fijar("AK_02_BrowDownRight", clamp(-ec.ceja, 0, 1) * 0.6);
    fijar("AK_03_BrowInnerUp", clamp(ec.ceja, 0, 1) * 0.6);
    // mirada
    const x = clamp(ec.mirarX + sacX, -1, 1), y = clamp(ec.mirarY + sacY, -1, 1);
    fijar("AK_15_EyeLookOutLeft", x > 0 ? x : 0);
    fijar("AK_14_EyeLookInRight", x > 0 ? x : 0);
    fijar("AK_13_EyeLookInLeft", x < 0 ? -x : 0);
    fijar("AK_16_EyeLookOutRight", x < 0 ? -x : 0);
    fijar("AK_17_EyeLookUpLeft", y > 0 ? y : 0);
    fijar("AK_18_EyeLookUpRight", y > 0 ? y : 0);
    fijar("AK_11_EyeLookDownLeft", y < 0 ? -y : 0);
    fijar("AK_12_EyeLookDownRight", y < 0 ? -y : 0);
  };
  return fbx;
}
