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
  Zap,
} from "lucide-react";

const _mPose = new THREE.Matrix4();
const _vPos = new THREE.Vector3();
const _qRot = new THREE.Quaternion();

export default function LaboratorioAR() {
  const mountRef = useRef(null);
  const overlayRef = useRef(null);

  const [arSupported, setArSupported] = useState(true);
  const [enModoAR, setEnModoAR] = useState(false);

  const [faseUI, setFaseUI] = useState("ESPERANDO");
  const faseRef = useRef("ESPERANDO");

  const [reticulaVisible, setReticulaVisible] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState("INICIE AR");

  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const reticleRef = useRef(null);

  const modeloConoRef = useRef(null);
  const modeloPaletaRef = useRef(null);

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

  useEffect(() => {
    if ("xr" in navigator) {
      navigator.xr.isSessionSupported("immersive-ar").then((supported) => {
        setArSupported(supported);
      });
    } else {
      setArSupported(false);
    }

    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.05,
      30.0,
    );
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
      precision: "mediump",
      depth: true,
      stencil: false,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType("local-floor");
    renderer.shadowMap.enabled = false;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
    hemiLight.position.set(0, 5, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(1, 3, 1);
    scene.add(dirLight);

    // Retícula con doble cara
    const reticleGeo = new THREE.RingGeometry(0.12, 0.16, 32).rotateX(
      -Math.PI / 2,
    );
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const reticle = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.visible = false;
    reticle.frustumCulled = false;
    scene.add(reticle);
    reticleRef.current = reticle;

    // Normalizador de GLB
    const loader = new GLTFLoader();
    const optimizarYEscalarGLB = (gltfScene, alturaDeseada) => {
      gltfScene.updateMatrixWorld(true);
      const bbox = new THREE.Box3().setFromObject(gltfScene);
      const size = new THREE.Vector3();
      bbox.getSize(size);

      const factor = alturaDeseada / (size.y || 1);
      gltfScene.scale.setScalar(factor);
      gltfScene.updateMatrixWorld(true);

      const bboxFinal = new THREE.Box3().setFromObject(gltfScene);
      gltfScene.position.x = -(bboxFinal.min.x + bboxFinal.max.x) / 2;
      gltfScene.position.z = -(bboxFinal.min.z + bboxFinal.max.z) / 2;
      gltfScene.position.y = -bboxFinal.min.y;

      gltfScene.traverse((child) => {
        if (child.isMesh) {
          child.frustumCulled = false;
          const origMat = child.material;
          if (origMat) {
            const texturaColor = origMat.map || null;
            const colorBase = origMat.color
              ? origMat.color.clone()
              : new THREE.Color(0xffffff);

            child.material = new THREE.MeshLambertMaterial({
              map: texturaColor,
              color: colorBase,
              reflectivity: 0.1,
              depthWrite: true,
              depthTest: true,
            });
            if (origMat.dispose) origMat.dispose();
          }
        }
      });

      const wrapper = new THREE.Group();
      wrapper.frustumCulled = false;
      wrapper.add(gltfScene);
      return wrapper;
    };

    loader.load(
      "/models/cono.glb",
      (gltf) => {
        modeloConoRef.current = optimizarYEscalarGLB(gltf.scene, ALTURA_CONO);
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
        modeloPaletaRef.current = optimizarYEscalarGLB(
          gltf.scene,
          ALTURA_PALETA,
        );
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

        if (
          hitTestSourceRef.current &&
          referenceSpace &&
          faseRef.current === "BUSCANDO"
        ) {
          const hitTestResults = frame.getHitTestResults(
            hitTestSourceRef.current,
          );

          if (hitTestResults.length > 0) {
            const hit = hitTestResults[0];
            const pose = hit.getPose(referenceSpace);

            if (pose) {
              reticle.visible = true;
              _mPose.fromArray(pose.transform.matrix);
              reticle.position.setFromMatrixPosition(_mPose);
              reticle.quaternion.setFromRotationMatrix(_mPose);
              setReticulaVisible(true);
            }
          } else {
            reticle.visible = false;
            setReticulaVisible(false);
          }
        }
      }

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
      cambiarFase("BUSCANDO", "APUNTE AL PISO DESPACIO");
      reticle.material.color.setHex(0x10b981);
    });

    renderer.xr.addEventListener("sessionend", () => {
      setEnModoAR(false);
      cambiarFase("ESPERANDO", "SESIÓN FINALIZADA");
      if (hitTestSourceRef.current) {
        try {
          hitTestSourceRef.current.cancel();
        } catch (err) {}
      }
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

  const fijarObjetivo = () => {
    if (!reticleRef.current || !reticleRef.current.visible) return;
    reticleRef.current.material.color.setHex(0xff5a00);
    cambiarFase("FIJADO", "MIRA BLOQUEADA");
  };

  const colocarCono = () => {
    if (!sceneRef.current || !modeloConoRef.current || !reticleRef.current)
      return;

    const cono = modeloConoRef.current.clone(true);
    cono.traverse((c) => (c.frustumCulled = false));

    cono.position.copy(reticleRef.current.position);
    cono.quaternion.copy(reticleRef.current.quaternion);

    cono.matrixAutoUpdate = false;
    cono.updateMatrix();

    sceneRef.current.add(cono);
    conoInstanciaRef.current = cono;

    reticleRef.current.visible = false;

    if (hitTestSourceRef.current) {
      try {
        hitTestSourceRef.current.cancel();
      } catch (e) {}
      hitTestSourceRef.current = null;
    }

    cambiarFase("CONO", "CONO ANCLADO 100% FIJO");
  };

  // Rescate manual: Colocar a 1.2 metros al frente sin requerir detección de textura
  const colocarForzadoAlFrente = () => {
    if (!sceneRef.current || !modeloConoRef.current || !cameraRef.current)
      return;

    const dir = new THREE.Vector3(0, 0, -1.2).applyQuaternion(
      cameraRef.current.quaternion,
    );
    const targetPos = cameraRef.current.position.clone().add(dir);
    targetPos.y = Math.min(targetPos.y, cameraRef.current.position.y - 1.1); // Nivel de suelo estimado

    const cono = modeloConoRef.current.clone(true);
    cono.traverse((c) => (c.frustumCulled = false));
    cono.position.copy(targetPos);

    cono.matrixAutoUpdate = false;
    cono.updateMatrix();

    sceneRef.current.add(cono);
    conoInstanciaRef.current = cono;

    if (reticleRef.current) reticleRef.current.visible = false;
    if (hitTestSourceRef.current) {
      try {
        hitTestSourceRef.current.cancel();
      } catch (e) {}
      hitTestSourceRef.current = null;
    }

    cambiarFase("CONO", "CONO COLOCADO AL FRENTE");
  };

  const alternarPaleta = () => {
    if (!sceneRef.current || !conoInstanciaRef.current) return;

    if (faseUI === "CONO") {
      const paleta = modeloPaletaRef.current.clone(true);
      paleta.traverse((c) => (c.frustumCulled = false));

      _vPos.setFromMatrixPosition(conoInstanciaRef.current.matrix);
      _qRot.setFromRotationMatrix(conoInstanciaRef.current.matrix);

      paleta.position.set(_vPos.x, _vPos.y + ALTURA_CONO + 0.4, _vPos.z);
      paleta.quaternion.copy(_qRot);
      sceneRef.current.add(paleta);
      paletaInstanciaRef.current = paleta;

      const targetPos = new THREE.Vector3(
        _vPos.x,
        _vPos.y + ALTURA_CONO - HUNDIMIENTO,
        _vPos.z,
      );
      cambiarFase("ANIMANDO", "ENSAMBLANDO...");

      animacionesRef.current.push({
        obj: paleta,
        targetPos: targetPos,
        onComplete: () => {
          paleta.matrixAutoUpdate = false;
          paleta.updateMatrix();
          cambiarFase("PALETA", "PRODUCTO ENSAMBLADO 1.15m");
        },
      });
    } else if (faseUI === "PALETA") {
      sceneRef.current.remove(paletaInstanciaRef.current);
      paletaInstanciaRef.current = null;
      cambiarFase("CONO", "PALETA RETIRADA");
    }
  };

  const cancelarObjetivo = () => {
    if (reticleRef.current) reticleRef.current.material.color.setHex(0x10b981);
    cambiarFase("BUSCANDO", "APUNTE AL PISO DESPACIO");
  };

  const reiniciarTodo = () => {
    if (conoInstanciaRef.current)
      sceneRef.current.remove(conoInstanciaRef.current);
    if (paletaInstanciaRef.current)
      sceneRef.current.remove(paletaInstanciaRef.current);
    conoInstanciaRef.current = null;
    paletaInstanciaRef.current = null;

    hitTestSourceRequestedRef.current = false;

    if (reticleRef.current) reticleRef.current.material.color.setHex(0x10b981);
    cambiarFase("BUSCANDO", "APUNTE AL PISO DESPACIO");
  };

  return (
    <div className="flex-1 relative bg-zinc-950 font-sans text-zinc-200 overflow-hidden flex flex-col">
      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none z-50 flex flex-col justify-between p-4"
      >
        {/* Barra superior de estado */}
        <div className="text-center pt-2">
          <div className="inline-flex items-center gap-2 bg-black/85 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full text-[11px] font-bold tracking-widest text-white shadow-lg">
            <ScanFace size={15} className="text-[#FF5A00]" />
            {mensajeEstado}
          </div>
        </div>

        {/* Controles táctiles */}
        {enModoAR && (
          <div className="flex flex-col items-center gap-3 pb-8 pointer-events-auto">
            {faseUI === "BUSCANDO" && (
              <div className="flex flex-col items-center gap-2.5">
                {reticulaVisible ? (
                  <button
                    onClick={fijarObjetivo}
                    className="bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold uppercase tracking-widest text-xs px-8 py-4 rounded-full shadow-lg active:scale-95 transition-all cursor-pointer flex items-center gap-2"
                  >
                    <Target size={18} /> FIJAR OBJETIVO
                  </button>
                ) : (
                  <button
                    onClick={colocarForzadoAlFrente}
                    className="bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase tracking-wider text-xs px-6 py-3.5 rounded-full shadow-lg active:scale-95 transition-all cursor-pointer flex items-center gap-2"
                  >
                    <Zap size={16} /> COLOCAR SIN ESPERAR PISO
                  </button>
                )}
                {!reticulaVisible && (
                  <span className="text-[9px] text-zinc-300 font-semibold bg-black/70 px-3 py-1.5 rounded-lg text-center backdrop-blur-md border border-zinc-700">
                    Buscando piso... o usá el botón amarillo para plantar
                    directo
                  </span>
                )}
              </div>
            )}

            {faseUI === "FIJADO" && (
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={colocarCono}
                  className="bg-[#FF5A00] text-black font-extrabold uppercase tracking-widest text-sm px-8 py-4 rounded-full shadow-lg flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
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
                  className={`font-black uppercase tracking-wider text-xs px-5 py-3.5 rounded-xl flex items-center gap-2 transition-all cursor-pointer active:scale-95 ${
                    faseUI === "CONO"
                      ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20"
                      : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                  }`}
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

      {/* Pantalla inicial previa */}
      <div className="absolute inset-0 bg-[#050507] z-40 flex flex-col items-center justify-center p-6 text-center pointer-events-auto">
        <div className="w-20 h-20 bg-[#FF5A00]/10 rounded-full flex items-center justify-center border border-[#FF5A00]/30 mb-6">
          <Smartphone size={36} className="text-[#FF5A00]" />
        </div>
        <h1 className="text-3xl font-extrabold italic text-white uppercase tracking-tighter mb-2">
          REALIDAD AUMENTADA
        </h1>
        <p className="text-zinc-400 text-sm max-w-md mb-8">
          Escaneo optimizado a 60 FPS con opción de colocación forzada.
        </p>
      </div>

      <div
        ref={mountRef}
        className="absolute inset-0 z-10 pointer-events-auto"
      />
    </div>
  );
}
