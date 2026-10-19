import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  ScanFace,
  Smartphone,
  MapPin,
  RotateCcw,
  CheckCircle2,
  Unlink,
  Sparkles,
  Target,
  X,
} from "lucide-react";

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
  const reticleRef = useRef(null);
  const fakeShadowRef = useRef(null);

  const modeloConoRef = useRef(null);
  const modeloPaletaRef = useRef(null);

  // Medidas reales en metros (1.15m total ensamblado)
  const ALTURA_CONO = 0.7;
  const ALTURA_PALETA = 0.6;
  const HUNDIMIENTO = 0.15;

  const conoInstanciaRef = useRef(null);
  const paletaInstanciaRef = useRef(null);
  const animacionesRef = useRef([]);

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

    // 1. ESCENA Y CÁMARA CON PLANO CERCANO (NEAR CLIPPING) DE 1 CM
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      30,
    );

    // 2. RENDERIZADOR OPTIMIZADO PARA MÓVILES (0 sombras dinámicas = 60 FPS estables)
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
    renderer.shadowMap.enabled = false; // DESACTIVADO: Cero lag en móviles
    container.appendChild(renderer.domElement);

    // 3. ILUMINACIÓN AMBIENTE LIGERA
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.3);
    hemiLight.position.set(0, 5, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
    dirLight.position.set(1, 3, 1);
    scene.add(dirLight);

    // 4. SOMBRA DE CONTACTO PROCEDURAL (Fake Shadow Canvas)
    // Genera un degradé radial en memoria: 0% uso de GPU y calidad perfecta
    const canvasShadow = document.createElement("canvas");
    canvasShadow.width = 128;
    canvasShadow.height = 128;
    const ctx = canvasShadow.getContext("2d");
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(0,0,0,0.7)");
    gradient.addColorStop(0.5, "rgba(0,0,0,0.3)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const shadowTex = new THREE.CanvasTexture(canvasShadow);
    const shadowGeo = new THREE.PlaneGeometry(0.65, 0.65);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false, // CLAVE: No compite con el cono
      depthTest: true,
    });
    const fakeShadow = new THREE.Mesh(shadowGeo, shadowMat);
    fakeShadow.rotation.x = -Math.PI / 2;
    fakeShadow.visible = false;
    fakeShadow.frustumCulled = false;
    scene.add(fakeShadow);
    fakeShadowRef.current = fakeShadow;

    // 5. NORMALIZADOR Y HORNEADOR DE GEOMETRÍAS (Fix definitivo de escala y desaparición)
    const loader = new GLTFLoader();

    const hornearGeometria = (gltfScene, alturaDeseada) => {
      gltfScene.updateMatrixWorld(true);
      const bboxOrig = new THREE.Box3().setFromObject(gltfScene);
      const sizeOrig = new THREE.Vector3();
      bboxOrig.getSize(sizeOrig);

      const factor = alturaDeseada / (sizeOrig.y || 1);

      // Hornear la escala directamente en cada malla interna
      gltfScene.traverse((child) => {
        if (child.isMesh && child.geometry) {
          child.geometry = child.geometry.clone();
          child.geometry.scale(factor, factor, factor);
          child.geometry.computeVertexNormals();
          child.geometry.computeBoundingBox();
          child.geometry.computeBoundingSphere();

          // Anti-desaparición
          child.frustumCulled = false;

          // Asegurar solidez y visibilidad
          if (child.material) {
            child.material.depthWrite = true;
            child.material.depthTest = true;
          }
        }
      });

      // Recalcular posición centrada al piso (Y=0)
      const bboxFinal = new THREE.Box3().setFromObject(gltfScene);
      gltfScene.position.x = -(bboxFinal.min.x + bboxFinal.max.x) / 2;
      gltfScene.position.z = -(bboxFinal.min.z + bboxFinal.max.z) / 2;
      gltfScene.position.y = -bboxFinal.min.y;

      const wrapper = new THREE.Group();
      wrapper.frustumCulled = false;
      wrapper.add(gltfScene);
      return wrapper;
    };

    loader.load(
      "/models/cono.glb",
      (gltf) => {
        modeloConoRef.current = hornearGeometria(gltf.scene, ALTURA_CONO);
      },
      undefined,
      () => {
        const g = new THREE.Group();
        g.frustumCulled = false;
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 0.05, 0.35),
          new THREE.MeshStandardMaterial({ color: 0x111111 }),
        );
        base.position.y = 0.025;
        base.frustumCulled = false;
        const cono = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.12, 0.65, 16),
          new THREE.MeshStandardMaterial({ color: 0xff5a00 }),
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
        modeloPaletaRef.current = hornearGeometria(gltf.scene, ALTURA_PALETA);
      },
      undefined,
      () => {
        const g = new THREE.Group();
        g.frustumCulled = false;
        const circ = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.14, 0.02, 16).rotateX(Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: 0xff0000 }),
        );
        circ.position.y = 0.45;
        circ.frustumCulled = false;
        const poste = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.035, 0.35, 16),
          new THREE.MeshStandardMaterial({ color: 0x0055ff }),
        );
        poste.position.y = 0.17;
        poste.frustumCulled = false;
        g.add(circ, poste);
        modeloPaletaRef.current = g;
      },
    );

    // 6. RETÍCULA DE ANCLAJE
    const reticleGeo = new THREE.RingGeometry(0.1, 0.14, 24).rotateX(
      -Math.PI / 2,
    );
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const reticle = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    reticle.frustumCulled = false;
    scene.add(reticle);
    reticleRef.current = reticle;

    // 7. BOTÓN NATIVO WEBXR
    let arButton;
    try {
      arButton = ARButton.createButton(renderer, {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["dom-overlay"],
        domOverlay: overlayRef.current
          ? { root: overlayRef.current }
          : undefined,
      });

      arButton.style.bottom = "24px";
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

    let hitTestSource = null;
    let hitTestSourceRequested = false;

    // 8. BUCLE DE RENDERIZADO ULTRALIGERO
    renderer.setAnimationLoop((timestamp, frame) => {
      if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        if (!hitTestSourceRequested && session) {
          session.requestReferenceSpace("viewer").then((refSpace) => {
            session.requestHitTestSource({ space: refSpace }).then((source) => {
              hitTestSource = source;
            });
          });
          hitTestSourceRequested = true;
        }

        // APAGADO EN CALIENTE: Solo procesa hit-test mientras busca
        if (hitTestSource && referenceSpace && faseRef.current === "BUSCANDO") {
          const hitTestResults = frame.getHitTestResults(hitTestSource);
          if (hitTestResults.length > 0) {
            const hit = hitTestResults[0];
            const pose = hit.getPose(referenceSpace);
            if (pose) {
              reticle.visible = true;
              reticle.matrix.fromArray(pose.transform.matrix);
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
        anim.obj.position.lerp(anim.targetPos, 0.15);
        if (anim.obj.position.distanceTo(anim.targetPos) < 0.005) {
          anim.obj.position.copy(anim.targetPos);
          anim.onComplete();
          animacionesRef.current.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
    });

    renderer.xr.addEventListener("sessionstart", () => {
      setEnModoAR(true);
      cambiarFase("BUSCANDO", "APUNTE LA CÁMARA AL PISO");
      reticle.material.color.setHex(0x10b981);
    });

    renderer.xr.addEventListener("sessionend", () => {
      setEnModoAR(false);
      cambiarFase("ESPERANDO", "SESIÓN FINALIZADA");
      hitTestSource = null;
      hitTestSourceRequested = false;
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
  // CONTROL DE ESTADOS DE ANCLAJE
  // ==========================================
  const fijarObjetivo = () => {
    if (!reticleRef.current || !reticleRef.current.visible) return;
    reticleRef.current.material.color.setHex(0xff5a00); // Bloqueo en naranja
    cambiarFase("FIJADO", "OBJETIVO FIJADO EN EL PISO");
  };

  const colocarCono = () => {
    if (!sceneRef.current || !modeloConoRef.current || !reticleRef.current)
      return;

    const cono = modeloConoRef.current.clone(true);
    cono.position.setFromMatrixPosition(reticleRef.current.matrix);
    cono.quaternion.setFromRotationMatrix(reticleRef.current.matrix);

    sceneRef.current.add(cono);
    conoInstanciaRef.current = cono;

    // Colocar la sombra estática milimétricamente pegada al piso
    if (fakeShadowRef.current) {
      fakeShadowRef.current.position.set(
        cono.position.x,
        cono.position.y + 0.002,
        cono.position.z,
      );
      fakeShadowRef.current.visible = true;
    }

    reticleRef.current.visible = false;
    cambiarFase("CONO", "CONO ANCLADO ESTABLE");
  };

  const alternarPaleta = () => {
    if (!sceneRef.current || !conoInstanciaRef.current) return;

    if (faseUI === "CONO") {
      const paleta = modeloPaletaRef.current.clone(true);

      paleta.position.set(
        conoInstanciaRef.current.position.x,
        conoInstanciaRef.current.position.y + ALTURA_CONO + 0.4,
        conoInstanciaRef.current.position.z,
      );
      paleta.rotation.copy(conoInstanciaRef.current.rotation);
      sceneRef.current.add(paleta);
      paletaInstanciaRef.current = paleta;

      const targetY =
        conoInstanciaRef.current.position.y + ALTURA_CONO - HUNDIMIENTO;
      cambiarFase("ANIMANDO", "ENSAMBLANDO...");

      animacionesRef.current.push({
        obj: paleta,
        targetPos: new THREE.Vector3(
          conoInstanciaRef.current.position.x,
          targetY,
          conoInstanciaRef.current.position.z,
        ),
        onComplete: () => {
          cambiarFase("PALETA", "ENSAMBLE REAL 1.15m");
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
    cambiarFase("BUSCANDO", "APUNTE LA CÁMARA AL PISO");
  };

  const reiniciarTodo = () => {
    if (conoInstanciaRef.current)
      sceneRef.current.remove(conoInstanciaRef.current);
    if (paletaInstanciaRef.current)
      sceneRef.current.remove(paletaInstanciaRef.current);
    if (fakeShadowRef.current) fakeShadowRef.current.visible = false;
    conoInstanciaRef.current = null;
    paletaInstanciaRef.current = null;

    if (reticleRef.current) reticleRef.current.material.color.setHex(0x10b981);
    cambiarFase("BUSCANDO", "APUNTE LA CÁMARA AL PISO");
  };

  return (
    <div className="flex-1 relative bg-zinc-950 font-sans text-zinc-200 overflow-hidden flex flex-col">
      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none z-50 flex flex-col justify-between p-4"
      >
        <div className="text-center pt-2">
          <div className="inline-flex items-center gap-2 bg-black/85 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full text-[11px] font-bold tracking-widest text-white shadow-lg">
            <ScanFace size={15} className="text-[#FF5A00]" />
            {mensajeEstado}
          </div>
        </div>

        {enModoAR && (
          <div className="flex flex-col items-center gap-3 pb-8 pointer-events-auto">
            {faseUI === "BUSCANDO" && (
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
            )}

            {faseUI === "FIJADO" && (
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={colocarCono}
                  className="bg-[#FF5A00] text-black font-extrabold uppercase tracking-widest text-sm px-8 py-4 rounded-full shadow-lg flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
                >
                  <MapPin size={20} /> COLOCAR CONO AQUÍ
                </button>
                <button
                  onClick={cancelarObjetivo}
                  className="bg-black/80 border border-zinc-700 text-zinc-400 text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-full flex items-center gap-1 active:scale-95 cursor-pointer"
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
          Modelos a escala física real (1.15m) optimizados a 60 FPS.
        </p>
      </div>

      <div
        ref={mountRef}
        className="absolute inset-0 z-10 pointer-events-auto"
      />
    </div>
  );
}
