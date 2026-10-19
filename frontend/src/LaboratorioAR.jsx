import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  ScanFace,
  Smartphone,
  MapPin,
  RotateCcw,
  Unlink,
  Sparkles,
  Target,
  X,
  Plus,
  Minus,
  Maximize,
  Minimize,
} from "lucide-react";

// Vectores globales para ultra-rendimiento a 60FPS
const _mPose = new THREE.Matrix4();
const _vPos = new THREE.Vector3();
const _qRot = new THREE.Quaternion();

export default function LaboratorioAR() {
  const mountRef = useRef(null);
  const overlayRef = useRef(null);

  const [arSupported, setArSupported] = useState(true);
  const [enModoAR, setEnModoAR] = useState(false);

  // Fases: ESPERANDO -> BUSCANDO -> FIJADO -> CONO -> PALETA
  const [faseUI, setFaseUI] = useState("ESPERANDO");
  const faseRef = useRef("ESPERANDO");

  const [pisoDetectado, setPisoDetectado] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState("INICIE AR");

  // Calibrador en vivo
  const [escalaFactor, setEscalaFactor] = useState(1.0);
  const escalaRef = useRef(1.0);

  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const reticleRef = useRef(null);
  const shadowMeshRef = useRef(null);

  const modeloConoRef = useRef(null);
  const modeloPaletaRef = useRef(null);

  // Alturas Teóricas
  const ALTURA_CONO = 0.7;
  const ALTURA_PALETA = 0.6;
  const HUNDIMIENTO = 0.15;

  const conoInstanciaRef = useRef(null);
  const paletaInstanciaRef = useRef(null);
  const animacionesRef = useRef([]);

  const hitTestSourceRef = useRef(null);
  const hitTestSourceRequestedRef = useRef(false);

  const cambiarFase = (nuevaFase, mensaje) => {
    faseRef.current = nuevaFase;
    setFaseUI(nuevaFase);
    if (mensaje) setMensajeEstado(mensaje);
  };

  // Propaga la escala instantáneamente
  useEffect(() => {
    escalaRef.current = escalaFactor;
    if (conoInstanciaRef.current)
      conoInstanciaRef.current.scale.setScalar(escalaFactor);
    if (paletaInstanciaRef.current)
      paletaInstanciaRef.current.scale.setScalar(escalaFactor);
    if (shadowMeshRef.current)
      shadowMeshRef.current.scale.setScalar(escalaFactor);
  }, [escalaFactor]);

  useEffect(() => {
    if ("xr" in navigator) {
      navigator.xr.isSessionSupported("immersive-ar").then(setArSupported);
    } else {
      setArSupported(false);
    }

    const container = mountRef.current;
    if (!container) return;

    // 1. ESCENA
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.05,
      30.0,
    );
    cameraRef.current = camera;

    // 2. RENDERIZADOR
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
      precision: "mediump",
    });
    renderer.setPixelRatio(1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType("local-floor");
    renderer.shadowMap.enabled = false;
    container.appendChild(renderer.domElement);

    // 3. LUCES
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x555555, 1.5);
    hemiLight.position.set(0, 5, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(1, 4, 1);
    scene.add(dirLight);

    // 4. RETÍCULA DE BUSCADOR INTELIGENTE (Estilo Instagram)
    const reticleGroup = new THREE.Group();

    // Anillo exterior
    const ringGeo = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);

    // Cruz de objetivo
    const crossGeo = new THREE.PlaneGeometry(0.08, 0.01).rotateX(-Math.PI / 2);
    const crossMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    const crossH = new THREE.Mesh(crossGeo, crossMat);
    const crossV = new THREE.Mesh(crossGeo, crossMat);
    crossV.rotation.y = Math.PI / 2;

    reticleGroup.add(ring, crossH, crossV);
    reticleGroup.visible = false;
    reticleGroup.frustumCulled = false;
    // Permite que la matriz se calcule manualmente para el efecto de flotación
    reticleGroup.matrixAutoUpdate = true;
    scene.add(reticleGroup);
    reticleRef.current = reticleGroup;

    // Sombra falsa optimizada
    const canvasShadow = document.createElement("canvas");
    canvasShadow.width = 128;
    canvasShadow.height = 128;
    const ctx = canvasShadow.getContext("2d");
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(0,0,0,0.6)");
    gradient.addColorStop(0.5, "rgba(0,0,0,0.2)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const shadowTex = new THREE.CanvasTexture(canvasShadow);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });
    const fakeShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.6),
      shadowMat,
    );
    fakeShadow.rotation.x = -Math.PI / 2;
    fakeShadow.visible = false;
    fakeShadow.frustumCulled = false;
    scene.add(fakeShadow);
    shadowMeshRef.current = fakeShadow;

    // 5. CARGADOR Y LIMPIADOR DE CAJAS OCULTAS
    const loader = new GLTFLoader();

    const prepararModelo = (gltfScene, alturaObjetivo) => {
      gltfScene.updateMatrixWorld(true);

      // Calculamos la caja limitante SOLO de las mallas visibles (ignora luces/cámaras fantasma)
      const bbox = new THREE.Box3();
      let hasMesh = false;
      gltfScene.traverse((child) => {
        if (child.isMesh && child.geometry) {
          hasMesh = true;
          child.geometry.computeBoundingBox();
          const b = child.geometry.boundingBox.clone();
          b.applyMatrix4(child.matrixWorld);
          bbox.union(b);
          // Shader ultra ligero
          if (child.material) {
            child.material = new THREE.MeshLambertMaterial({
              color: child.material.color || 0xffffff,
              map: child.material.map || null,
            });
          }
        }
      });

      // Si el modelo está vacío o corrupto, asumimos tamaño 1
      const currentH = hasMesh ? bbox.max.y - bbox.min.y : 1;
      const factor = alturaObjetivo / (currentH || 1);

      gltfScene.scale.setScalar(factor);
      gltfScene.updateMatrixWorld(true);

      const bboxFinal = new THREE.Box3().setFromObject(gltfScene);
      gltfScene.position.x = -(bboxFinal.min.x + bboxFinal.max.x) / 2;
      gltfScene.position.z = -(bboxFinal.min.z + bboxFinal.max.z) / 2;
      gltfScene.position.y = -bboxFinal.min.y;

      gltfScene.traverse((c) => (c.frustumCulled = false));
      const wrapper = new THREE.Group();
      wrapper.frustumCulled = false;
      wrapper.add(gltfScene);
      return wrapper;
    };

    loader.load(
      "/models/cono.glb",
      (gltf) => {
        modeloConoRef.current = prepararModelo(gltf.scene, ALTURA_CONO);
      },
      undefined,
      () => {
        const g = new THREE.Group();
        g.frustumCulled = false;
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 0.05, 0.35),
          new THREE.MeshLambertMaterial({ color: 0x111111 }),
        );
        base.position.y = 0.025;
        base.frustumCulled = false;
        const cono = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.12, 0.65, 16),
          new THREE.MeshLambertMaterial({ color: 0xff5a00 }),
        );
        cono.position.y = 0.35;
        cono.frustumCulled = false;
        g.add(base, cono);
        modeloConoRef.current = g;
      },
    );

    loader.load(
      "/models/paleta.glb",
      (gltf) => {
        modeloPaletaRef.current = prepararModelo(gltf.scene, ALTURA_PALETA);
      },
      undefined,
      () => {
        const g = new THREE.Group();
        g.frustumCulled = false;
        const circ = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.14, 0.02, 16).rotateX(Math.PI / 2),
          new THREE.MeshLambertMaterial({ color: 0xff0000 }),
        );
        circ.position.y = 0.45;
        circ.frustumCulled = false;
        const poste = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.035, 0.35, 16),
          new THREE.MeshLambertMaterial({ color: 0x0055ff }),
        );
        poste.position.y = 0.17;
        poste.frustumCulled = false;
        g.add(circ, poste);
        modeloPaletaRef.current = g;
      },
    );

    // 6. BOTÓN AR
    let arButton;
    try {
      arButton = ARButton.createButton(renderer, {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["dom-overlay"],
        domOverlay: overlayRef.current
          ? { root: overlayRef.current }
          : undefined,
      });

      arButton.style.bottom = "28px";
      arButton.style.padding = "14px 28px";
      arButton.style.fontWeight = "bold";
      arButton.style.borderRadius = "14px";
      arButton.style.backgroundColor = "#FF5A00";
      arButton.style.color = "#000";
      arButton.style.border = "none";
      arButton.style.zIndex = "99999";
      document.body.appendChild(arButton);
    } catch (e) {
      console.error(e);
    }

    // 7. BUCLE CONTINUO (Con efecto de buscador)
    renderer.setAnimationLoop((timestamp, frame) => {
      if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        if (!hitTestSourceRequestedRef.current && session) {
          session.requestReferenceSpace("viewer").then((refSpace) => {
            session.requestHitTestSource({ space: refSpace }).then((source) => {
              hitTestSourceRef.current = source;
            });
          });
          hitTestSourceRequestedRef.current = true;
        }

        if (faseRef.current === "BUSCANDO") {
          let pisoEncontrado = false;

          if (hitTestSourceRef.current && referenceSpace) {
            const hitTestResults = frame.getHitTestResults(
              hitTestSourceRef.current,
            );
            if (hitTestResults.length > 0) {
              const hit = hitTestResults[0];
              const pose = hit.getPose(referenceSpace);

              if (pose) {
                // SE ENCONTRÓ EL PISO REAL: El aro se pega a la baldosa y se vuelve verde
                reticleGroup.visible = true;

                // Aplicamos la matriz físicamente
                reticleGroup.matrixAutoUpdate = false;
                reticleGroup.matrix.fromArray(pose.transform.matrix);

                ring.material.color.setHex(0x10b981); // Verde brillante
                ring.material.opacity = 0.9;
                crossH.material.color.setHex(0x10b981);
                crossV.material.color.setHex(0x10b981);

                pisoEncontrado = true;
              }
            }
          }

          // SI NO ENCUENTRA PISO: El aro flota frente al celular en blanco semitransparente
          if (!pisoEncontrado) {
            reticleGroup.visible = true;
            reticleGroup.matrixAutoUpdate = true; // Liberamos la matriz para flotar

            // Lo forzamos a aparecer 1.5m al frente de la cámara, mirándonos
            const dir = new THREE.Vector3(0, -0.2, -1.5).applyQuaternion(
              camera.quaternion,
            );
            reticleGroup.position.copy(camera.position).add(dir);

            // Animación de rotación lenta para indicar "Buscando..."
            reticleGroup.rotation.x = Math.PI / 8;
            reticleGroup.rotation.y += 0.02;

            ring.material.color.setHex(0xffffff); // Blanco transparente
            ring.material.opacity = 0.3;
            crossH.material.color.setHex(0xffffff);
            crossV.material.color.setHex(0xffffff);
          }

          setPisoDetectado(pisoEncontrado);
        }
      }

      // Animaciones suaves
      for (let i = animacionesRef.current.length - 1; i >= 0; i--) {
        const anim = animacionesRef.current[i];
        anim.obj.position.lerp(anim.targetPos, 0.18);
        if (anim.obj.position.distanceTo(anim.targetPos) < 0.003) {
          anim.obj.position.copy(anim.targetPos);
          anim.onComplete();
          animacionesRef.current.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
    });

    renderer.xr.addEventListener("sessionstart", () => {
      setEnModoAR(true);
      cambiarFase("BUSCANDO", "MUEVA LA CÁMARA PARA DETECTAR EL PISO");
    });

    renderer.xr.addEventListener("sessionend", () => {
      setEnModoAR(false);
      cambiarFase("ESPERANDO", "SESIÓN FINALIZADA");
      hitTestSourceRef.current = null;
      hitTestSourceRequestedRef.current = false;
    });

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      renderer.setAnimationLoop(null);
      if (container.contains(renderer.domElement))
        container.removeChild(renderer.domElement);
      if (arButton && document.body.contains(arButton))
        document.body.removeChild(arButton);
    };
  }, []);

  // ==========================================
  // LÓGICA DE FIJACIÓN Y ENSAMBLAJE
  // ==========================================
  const fijarObjetivo = () => {
    if (!reticleRef.current || !pisoDetectado) return;

    // Congelar visualmente
    reticleRef.current.children.forEach((c) =>
      c.material.color.setHex(0xff5a00),
    );
    cambiarFase("FIJADO", "BALDOSA BLOQUEADA");
  };

  const colocarCono = () => {
    if (!sceneRef.current || !modeloConoRef.current || !reticleRef.current)
      return;

    const cono = modeloConoRef.current.clone(true);
    cono.traverse((c) => (c.frustumCulled = false));

    // Tomar coordenadas exactas de la mira
    cono.position.setFromMatrixPosition(reticleRef.current.matrix);

    // Apuntar el cono hacia el usuario
    if (cameraRef.current) {
      const angle = Math.atan2(
        cameraRef.current.position.x - cono.position.x,
        cameraRef.current.position.z - cono.position.z,
      );
      cono.rotation.set(0, angle, 0);
    }

    cono.scale.setScalar(escalaRef.current);

    // Congelar matriz para máxima eficiencia en celular
    cono.matrixAutoUpdate = false;
    cono.updateMatrix();

    sceneRef.current.add(cono);
    conoInstanciaRef.current = cono;

    if (shadowMeshRef.current) {
      shadowMeshRef.current.position.set(
        cono.position.x,
        cono.position.y + 0.002,
        cono.position.z,
      );
      shadowMeshRef.current.scale.setScalar(escalaRef.current);
      shadowMeshRef.current.visible = true;
    }

    reticleRef.current.visible = false;
    cambiarFase("CONO", "CONO ANCLADO 100% FIJO");
  };

  const alternarPaleta = () => {
    if (
      !sceneRef.current ||
      !conoInstanciaRef.current ||
      !modeloPaletaRef.current
    )
      return;

    if (faseUI === "CONO") {
      const paleta = modeloPaletaRef.current.clone(true);
      paleta.traverse((c) => (c.frustumCulled = false));

      const esc = escalaRef.current;
      paleta.scale.setScalar(esc);

      // Desciende desde 40 cm por encima del tope
      paleta.position.setFromMatrixPosition(conoInstanciaRef.current.matrix);
      paleta.position.y += (ALTURA_CONO + 0.4) * esc;
      paleta.quaternion.setFromRotationMatrix(conoInstanciaRef.current.matrix);

      sceneRef.current.add(paleta);
      paletaInstanciaRef.current = paleta;

      const targetPos = new THREE.Vector3().setFromMatrixPosition(
        conoInstanciaRef.current.matrix,
      );
      targetPos.y += (ALTURA_CONO - HUNDIMIENTO) * esc;

      cambiarFase("ANIMANDO", "ENSAMBLANDO...");

      animacionesRef.current.push({
        obj: paleta,
        targetPos: targetPos,
        onComplete: () => {
          paleta.matrixAutoUpdate = false;
          paleta.updateMatrix();
          cambiarFase("PALETA", "PRODUCTO ENSAMBLADO");
        },
      });
    } else if (faseUI === "PALETA") {
      sceneRef.current.remove(paletaInstanciaRef.current);
      paletaInstanciaRef.current = null;
      cambiarFase("CONO", "PALETA RETIRADA");
    }
  };

  const cancelarObjetivo = () => {
    cambiarFase("BUSCANDO", "MUEVA LA CÁMARA PARA DETECTAR EL PISO");
  };

  const reiniciarTodo = () => {
    if (conoInstanciaRef.current)
      sceneRef.current.remove(conoInstanciaRef.current);
    if (paletaInstanciaRef.current)
      sceneRef.current.remove(paletaInstanciaRef.current);
    if (shadowMeshRef.current) shadowMeshRef.current.visible = false;

    conoInstanciaRef.current = null;
    paletaInstanciaRef.current = null;

    cambiarFase("BUSCANDO", "MUEVA LA CÁMARA PARA DETECTAR EL PISO");
  };

  return (
    <div className="flex-1 relative bg-zinc-950 font-sans text-zinc-200 overflow-hidden flex flex-col">
      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none z-50 flex flex-col justify-between p-4"
      >
        {/* HEADER */}
        <div className="flex flex-col items-center gap-2 pt-2">
          <div
            className={`inline-flex items-center gap-2 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full text-[11px] font-bold tracking-widest text-white shadow-lg transition-colors ${pisoDetectado && faseUI === "BUSCANDO" ? "bg-emerald-600/90" : "bg-black/85"}`}
          >
            <ScanFace
              size={15}
              className={
                pisoDetectado && faseUI === "BUSCANDO"
                  ? "text-white"
                  : "text-[#FF5A00]"
              }
            />
            {mensajeEstado}
          </div>
        </div>

        {/* CALIBRADOR DE TAMAÑO MANUAL (Siempre a mano por si el .glb viene desescalado) */}
        {enModoAR && (faseUI === "CONO" || faseUI === "PALETA") && (
          <div className="mx-auto bg-black/80 backdrop-blur-xl border border-zinc-700 p-2 rounded-2xl flex flex-col items-center gap-2 pointer-events-auto shadow-2xl mb-4">
            <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">
              ¿Tamaño incorrecto? Calibrar:
            </span>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setEscalaFactor((e) =>
                    Math.max(0.1, Number((e - 0.5).toFixed(2))),
                  )
                }
                className="bg-zinc-800 hover:bg-zinc-700 text-rose-400 font-bold px-3 py-2 rounded-xl flex items-center gap-1 active:scale-95"
              >
                <Minus size={14} /> 50%
              </button>
              <button
                onClick={() =>
                  setEscalaFactor((e) => Number((e - 0.1).toFixed(2)))
                }
                className="bg-zinc-800 hover:bg-zinc-700 text-rose-300 font-bold px-3 py-2 rounded-xl flex items-center gap-1 active:scale-95"
              >
                <Minimize size={14} /> 10%
              </button>
              <button
                onClick={() =>
                  setEscalaFactor((e) => Number((e + 0.1).toFixed(2)))
                }
                className="bg-zinc-800 hover:bg-zinc-700 text-emerald-300 font-bold px-3 py-2 rounded-xl flex items-center gap-1 active:scale-95"
              >
                <Maximize size={14} /> 10%
              </button>
              <button
                onClick={() =>
                  setEscalaFactor((e) => Number((e + 0.5).toFixed(2)))
                }
                className="bg-zinc-800 hover:bg-zinc-700 text-emerald-400 font-bold px-3 py-2 rounded-xl flex items-center gap-1 active:scale-95"
              >
                <Plus size={14} /> 50%
              </button>
            </div>
          </div>
        )}

        {/* BOTONERA TÁCTIL PRINCIPAL */}
        {enModoAR && (
          <div className="flex flex-col items-center gap-3 pb-8 pointer-events-auto">
            {faseUI === "BUSCANDO" && (
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={fijarObjetivo}
                  disabled={!pisoDetectado}
                  className={`font-extrabold uppercase tracking-widest text-xs px-8 py-4 rounded-full flex items-center gap-2 transition-all ${
                    pisoDetectado
                      ? "bg-emerald-500 text-black shadow-[0_0_30px_rgba(16,185,129,0.5)] active:scale-95 cursor-pointer"
                      : "bg-zinc-800 text-zinc-500 opacity-50 cursor-not-allowed"
                  }`}
                >
                  <Target size={18} /> FIJAR EN ESTE PISO
                </button>
              </div>
            )}

            {faseUI === "FIJADO" && (
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={colocarCono}
                  className="bg-[#FF5A00] text-black font-extrabold uppercase tracking-widest text-sm px-8 py-4 rounded-full shadow-[0_0_20px_rgba(255,90,0,0.5)] flex items-center gap-2 active:scale-95 cursor-pointer"
                >
                  <MapPin size={20} /> CLAVAR CONO AQUÍ
                </button>
                <button
                  onClick={cancelarObjetivo}
                  className="bg-black/80 border border-zinc-700 text-zinc-400 text-[10px] font-bold uppercase tracking-widest px-5 py-2.5 rounded-full flex items-center gap-1 active:scale-95 cursor-pointer"
                >
                  <X size={14} /> CANCELAR
                </button>
              </div>
            )}

            {(faseUI === "CONO" || faseUI === "PALETA") && (
              <div className="flex items-center gap-2.5 bg-black/85 backdrop-blur-xl p-2.5 rounded-2xl border border-zinc-800 shadow-xl">
                <button
                  onClick={alternarPaleta}
                  className={`font-black uppercase tracking-wider text-xs px-5 py-3.5 rounded-xl flex items-center gap-2 active:scale-95 cursor-pointer ${faseUI === "CONO" ? "bg-emerald-500 text-black" : "bg-rose-500/20 text-rose-400 border border-rose-500/40"}`}
                >
                  {faseUI === "CONO" ? (
                    <>
                      <Sparkles size={16} /> ACOPLAR PALETA
                    </>
                  ) : (
                    <>
                      <Unlink size={16} /> QUITAR PALETA
                    </>
                  )}
                </button>

                <button
                  onClick={reiniciarTodo}
                  className="bg-zinc-800 text-white font-bold uppercase tracking-wider text-[10px] px-4 py-3.5 rounded-xl flex items-center gap-1.5 active:scale-95 cursor-pointer"
                >
                  <RotateCcw size={14} /> REPOSICIONAR
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="absolute inset-0 bg-[#050507] z-40 flex flex-col items-center justify-center p-6 text-center pointer-events-auto">
        <div className="w-20 h-20 bg-[#FF5A00]/10 rounded-full flex items-center justify-center border border-[#FF5A00]/30 mb-6">
          <Smartphone size={36} className="text-[#FF5A00]" />
        </div>
        <h1 className="text-3xl font-extrabold italic text-white uppercase tracking-tighter mb-2">
          REALIDAD AUMENTADA
        </h1>
        <p className="text-zinc-400 text-sm max-w-md mb-8">
          Buscador holográfico activo y panel de calibración de escalas en
          tiempo real.
        </p>
      </div>

      <div
        ref={mountRef}
        className="absolute inset-0 z-10 pointer-events-auto"
      />
    </div>
  );
}
