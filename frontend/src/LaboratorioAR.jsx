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
  CheckCircle2,
} from "lucide-react";

const _mPose = new THREE.Matrix4();
const _vPos = new THREE.Vector3();
const _qRot = new THREE.Quaternion();

export default function LaboratorioAR() {
  const mountRef = useRef(null);
  const overlayRef = useRef(null);

  const [arSupported, setArSupported] = useState(true);
  const [enModoAR, setEnModoAR] = useState(false);

  // Estados: ESPERANDO -> BUSCANDO -> FIJADO -> CONO -> PALETA
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

  // Alturas calibradas 1:1 en metros
  const ALTURA_CONO = 0.7; // 70 cm
  const ALTURA_PALETA = 0.6; // 60 cm
  const HUNDIMIENTO = 0.15; // 15 cm (Total ensamblado: 1.15 m)

  const conoInstanciaRef = useRef(null);
  const paletaInstanciaRef = useRef(null);
  const animacionesRef = useRef([]);

  // Variables de control de Hit-Test en tiempo real
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

    // 1. ESCENA Y CÁMARA CALIBRADA
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.05,
      25.0,
    );
    cameraRef.current = camera;

    // 2. RENDERIZADOR OPTIMIZADO PARA MÓVILES (Zero Overhead)
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
    renderer.shadowMap.enabled = false;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // 3. ILUMINACIÓN AMBIENTE LIGERA
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
    hemiLight.position.set(0, 5, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(1, 3, 1);
    scene.add(dirLight);

    // 4. RETÍCULA DE ANCLAJE
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

    // 5. MOTOR DE OPTIMIZACIÓN Y ALIVIO PARA EL GLB DE 10MB
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

      // Conversión de materiales pesados a Gouraud shading para fluidez total
      gltfScene.traverse((child) => {
        if (child.isMesh) {
          child.frustumCulled = false;
          const origMat = child.material;

          if (origMat) {
            const texturaColor = origMat.map || null;
            const colorBase = origMat.color
              ? origMat.color.clone()
              : new THREE.Color(0xffffff);

            // MeshLambertMaterial consume 4 veces menos procesamiento que MeshStandard/Physical
            child.material = new THREE.MeshLambertMaterial({
              map: texturaColor,
              color: colorBase,
              reflectivity: 0.1,
              depthWrite: true,
              depthTest: true,
            });

            if (origMat.dispose) origMat.dispose();
          }

          if (child.geometry) {
            // Eliminar canales no utilizados que sobrecargan la memoria RAM
            if (child.geometry.attributes.tangent)
              child.geometry.deleteAttribute("tangent");
            if (child.geometry.attributes.color)
              child.geometry.deleteAttribute("color");
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
        // Fallback procedural ultra liviano
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

    // 7. BUCLE PRINCIPAL (Solo procesa Hit-Test durante el escaneo)
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

        // Si estamos escaneando, actualizamos la mira
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

      // Animaciones de interpolación directa
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

  // ==========================================
  // ANCLAJE INAMOVIBLE Y ACCIONES
  // ==========================================
  const fijarObjetivo = () => {
    if (!reticleRef.current || !reticleRef.current.visible) return;

    // Congelar color de la retícula en naranja
    reticleRef.current.material.color.setHex(0xff5a00);

    // Apagar temporalmente el flujo de cálculo del hit-test
    cambiarFase("FIJADO", "MIRA BLOQUEADA");
  };

  const colocarCono = () => {
    if (!sceneRef.current || !modeloConoRef.current || !reticleRef.current)
      return;

    const cono = modeloConoRef.current.clone(true);
    cono.traverse((c) => (c.frustumCulled = false));

    // Copiar la posición y orientación fija de la retícula
    cono.position.copy(reticleRef.current.position);
    cono.quaternion.copy(reticleRef.current.quaternion);

    // BLOQUEO MATRICIAL: Congela el cono para que no sufra reajustes de ARCore
    cono.matrixAutoUpdate = false;
    cono.updateMatrix();

    sceneRef.current.add(cono);
    conoInstanciaRef.current = cono;

    // Ocultar retícula
    reticleRef.current.visible = false;

    // Cancelar el rayo de Hit-Test en el dispositivo para liberar GPU y CPU
    if (hitTestSourceRef.current) {
      try {
        hitTestSourceRef.current.cancel();
      } catch (e) {}
      hitTestSourceRef.current = null;
    }

    cambiarFase("CONO", "CONO ANCLADO 100% FIJO");
  };

  const alternarPaleta = () => {
    if (!sceneRef.current || !conoInstanciaRef.current) return;

    if (faseUI === "CONO") {
      const paleta = modeloPaletaRef.current.clone(true);
      paleta.traverse((c) => (c.frustumCulled = false));

      _vPos.setFromMatrixPosition(conoInstanciaRef.current.matrix);
      _qRot.setFromRotationMatrix(conoInstanciaRef.current.matrix);

      // Posición inicial: 40 cm por encima del tope
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
          // Congelar posición final de la paleta
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

    // Reactivar búsqueda de suelo
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
        {/* BARRA SUPERIOR DE ESTADO */}
        <div className="text-center pt-2">
          <div className="inline-flex items-center gap-2 bg-black/85 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full text-[11px] font-bold tracking-widest text-white shadow-lg">
            <ScanFace size={15} className="text-[#FF5A00]" />
            {mensajeEstado}
          </div>
        </div>

        {/* CONTROLES TÁCTILES */}
        {enModoAR && (
          <div className="flex flex-col items-center gap-3 pb-8 pointer-events-auto">
            {faseUI === "BUSCANDO" && (
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={fijarObjetivo}
                  disabled={!reticulaVisible}
                  className={`font-extrabold uppercase tracking-widest text-xs px-8 py-4 rounded-full flex items-center gap-2 transition-all ${
                    reticulaVisible
                      ? "bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg active:scale-95 cursor-pointer"
                      : "bg-zinc-800 text-zinc-500 opacity-50 cursor-not-allowed"
                  }`}
                >
                  <Target size={18} /> FIJAR OBJETIVO
                </button>
                {!reticulaVisible && (
                  <span className="text-[9px] text-zinc-300 font-semibold bg-black/70 px-3 py-1.5 rounded-lg text-center backdrop-blur-md border border-zinc-700">
                    Buscando piso... mové el celular suavemente
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

      {/* PANTALLA INICIAL WEB */}
      <div className="absolute inset-0 bg-[#050507] z-40 flex flex-col items-center justify-center p-6 text-center pointer-events-auto">
        <div className="w-20 h-20 bg-[#FF5A00]/10 rounded-full flex items-center justify-center border border-[#FF5A00]/30 mb-6">
          <Smartphone size={36} className="text-[#FF5A00]" />
        </div>
        <h1 className="text-3xl font-extrabold italic text-white uppercase tracking-tighter mb-2">
          REALIDAD AUMENTADA
        </h1>
        <p className="text-zinc-400 text-sm max-w-md mb-8">
          Rendimiento optimizado a 60 FPS con bloqueo matricial permanente
          (1.15m total).
        </p>

        {!arSupported && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs max-w-md flex items-start gap-3 text-left mb-6">
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
            <p>
              <strong>Navegador sin ARCore:</strong> Usá Google Chrome en
              Android con los Servicios de RA actualizados.
            </p>
          </div>
        )}
      </div>

      <div
        ref={mountRef}
        className="absolute inset-0 z-10 pointer-events-auto"
      />
    </div>
  );
}
