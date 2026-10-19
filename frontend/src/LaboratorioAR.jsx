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

  const [logs, setLogs] = useState([]);
  const addLog = (msg, isError = false) => {
    setLogs((prev) => [...prev.slice(-2), { msg, isError }]);
  };

  const sceneRef = useRef(null);
  const reticleRef = useRef(null);
  const shadowPlaneRef = useRef(null);

  const modeloConoRef = useRef(null);
  const modeloPaletaRef = useRef(null);

  // Alturas forzadas en METROS (Escala real AR)
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
    const handleGlobalError = (event) => addLog(`${event.message}`, true);
    window.addEventListener("error", handleGlobalError);

    if ("xr" in navigator) {
      navigator.xr.isSessionSupported("immersive-ar").then((supported) => {
        setArSupported(supported);
      });
    } else {
      setArSupported(false);
    }

    const container = mountRef.current;
    if (!container) return;

    // 1. ESCENA Y CÁMARA
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      20,
    );

    // 2. RENDERIZADOR EXTREMADAMENTE LIGERO (Fix de tirones y lag)
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: "high-performance", // Pide máximo rendimiento a la GPU del celular
      precision: "mediump", // Baja precisión de coma flotante (súper veloz en móviles)
      stencil: false,
      depth: true,
    });
    renderer.setPixelRatio(1); // Mantiene resolución base sin re-escalar
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType("local-floor");

    // Sombras básicas de alto rendimiento
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap; // Elimina PCF (mata-baterías)
    container.appendChild(renderer.domElement);

    // 3. LUCES LIGERAS
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    hemiLight.position.set(0, 5, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(1, 3, 1);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 256; // Sombras a bajísima resolución = velocidad
    dirLight.shadow.mapSize.height = 256;
    scene.add(dirLight);

    // 4. CARGA DE MODELOS CON FIX DE DESAPARICIÓN (Frustum Culling)
    const loader = new GLTFLoader();

    const normalizarYForzarEscala = (gltfScene, alturaDeseadaMetros) => {
      gltfScene.position.set(0, 0, 0);
      gltfScene.scale.set(1, 1, 1);
      gltfScene.rotation.set(0, 0, 0);
      gltfScene.updateMatrixWorld(true);

      const bboxOriginal = new THREE.Box3().setFromObject(gltfScene);
      const sizeOriginal = new THREE.Vector3();
      bboxOriginal.getSize(sizeOriginal);

      const factorEscala = alturaDeseadaMetros / sizeOriginal.y;
      gltfScene.scale.setScalar(factorEscala);
      gltfScene.updateMatrixWorld(true);

      const bboxFinal = new THREE.Box3().setFromObject(gltfScene);

      gltfScene.position.x = -(bboxFinal.min.x + bboxFinal.max.x) / 2;
      gltfScene.position.z = -(bboxFinal.min.z + bboxFinal.max.z) / 2;
      gltfScene.position.y = -bboxFinal.min.y;

      // EL FIX MAGNÍFICO: Apagar Frustum Culling
      gltfScene.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = false;
          child.frustumCulled = false; // IMPIDE QUE DESAPAREZCA AL ACERCARTE
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
        modeloConoRef.current = normalizarYForzarEscala(
          gltf.scene,
          ALTURA_CONO,
        );
      },
      undefined,
      () => {
        // Fallback Procedural
        const g = new THREE.Group();
        g.frustumCulled = false;
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 0.05, 0.35),
          new THREE.MeshStandardMaterial({ color: 0x111111 }),
        );
        base.position.y = 0.025;
        base.castShadow = true;
        base.frustumCulled = false;
        const cono = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.12, 0.65, 16),
          new THREE.MeshStandardMaterial({ color: 0xff5a00 }),
        );
        cono.position.y = 0.35;
        cono.castShadow = true;
        cono.frustumCulled = false;
        g.add(base, cono);
        modeloConoRef.current = g;
      },
    );

    loader.load(
      "/models/paleta.glb",
      (gltf) => {
        modeloPaletaRef.current = normalizarYForzarEscala(
          gltf.scene,
          ALTURA_PALETA,
        );
      },
      undefined,
      () => {
        // Fallback Procedural
        const g = new THREE.Group();
        g.frustumCulled = false;
        const circ = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.14, 0.02, 16).rotateX(Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: 0xff0000 }),
        );
        circ.position.y = 0.45;
        circ.castShadow = true;
        circ.frustumCulled = false;
        const poste = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.035, 0.35, 16),
          new THREE.MeshStandardMaterial({ color: 0x0055ff }),
        );
        poste.position.y = 0.17;
        poste.castShadow = true;
        poste.frustumCulled = false;
        g.add(circ, poste);
        modeloPaletaRef.current = g;
      },
    );

    // 5. MIRA Y SOMBRAS (Sin Culling)
    const reticleGeo = new THREE.RingGeometry(0.1, 0.14, 24).rotateX(
      -Math.PI / 2,
    );
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const reticle = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    reticle.frustumCulled = false;
    scene.add(reticle);
    reticleRef.current = reticle;

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.ShadowMaterial({ opacity: 0.5 }),
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.receiveShadow = true;
    shadowPlane.visible = false;
    shadowPlane.frustumCulled = false;
    scene.add(shadowPlane);
    shadowPlaneRef.current = shadowPlane;

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
      addLog("Fallo ARButton: " + e.message, true);
    }

    let hitTestSource = null;
    let hitTestSourceRequested = false;

    // 7. RENDER LOOP OPTIMIZADO EXTREMO
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

        // FIX DE ESTABILIDAD: Si ya fijamos el objetivo, IGNORAMOS el hitTest por completo.
        // Esto evita que el celular consuma CPU escaneando el piso y evita que las coordenadas salten.
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

      // Animaciones de interpolación (sin sobrecarga)
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
      window.removeEventListener("error", handleGlobalError);
      window.removeEventListener("resize", handleResize);
      renderer.setAnimationLoop(null);
      if (container.contains(renderer.domElement))
        container.removeChild(renderer.domElement);
      if (arButton && document.body.contains(arButton))
        document.body.removeChild(arButton);
    };
  }, []);

  // ==========================================
  // LÓGICA DE INTERFAZ ESTABILIZADA
  // ==========================================
  const fijarObjetivo = () => {
    if (!reticleRef.current || !reticleRef.current.visible) return;
    reticleRef.current.material.color.setHex(0xff5a00);
    cambiarFase("FIJADO", "OBJETIVO CONGELADO");
  };

  const colocarCono = () => {
    if (!sceneRef.current || !modeloConoRef.current || !reticleRef.current)
      return;

    const cono = modeloConoRef.current.clone(true);
    cono.position.setFromMatrixPosition(reticleRef.current.matrix);
    cono.quaternion.setFromRotationMatrix(reticleRef.current.matrix);

    sceneRef.current.add(cono);
    conoInstanciaRef.current = cono;

    if (shadowPlaneRef.current) {
      shadowPlaneRef.current.position.copy(cono.position);
      shadowPlaneRef.current.visible = true;
    }

    reticleRef.current.visible = false;
    cambiarFase("CONO", "CONO ANCLADO FIRMEMENTE");
  };

  const alternarPaleta = () => {
    if (!sceneRef.current || !conoInstanciaRef.current) return;

    if (faseUI === "CONO") {
      const paleta = modeloPaletaRef.current.clone(true);

      paleta.position.set(
        conoInstanciaRef.current.position.x,
        conoInstanciaRef.current.position.y + ALTURA_CONO + 0.5,
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
          cambiarFase("PALETA", "ENSAMBLE PERFECTO 1.15m");
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
    if (shadowPlaneRef.current) shadowPlaneRef.current.visible = false;
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
                className={`font-extrabold uppercase tracking-widest text-xs px-8 py-4 rounded-full flex items-center gap-2 transition-all ${reticulaVisible ? "bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg active:scale-95" : "bg-zinc-800 text-zinc-500 opacity-50"}`}
              >
                <Target size={18} /> FIJAR OBJETIVO
              </button>
            )}

            {faseUI === "FIJADO" && (
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={colocarCono}
                  className="bg-[#FF5A00] text-black font-extrabold uppercase tracking-widest text-sm px-8 py-4 rounded-full shadow-lg flex items-center gap-2 active:scale-95 transition-all"
                >
                  <MapPin size={20} /> COLOCAR CONO AQUÍ
                </button>
                <button
                  onClick={cancelarObjetivo}
                  className="bg-black/80 border border-zinc-700 text-zinc-400 text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-full flex items-center gap-1 active:scale-95"
                >
                  <X size={14} /> CANCELAR
                </button>
              </div>
            )}

            {(faseUI === "CONO" || faseUI === "PALETA") && (
              <div className="flex items-center gap-2.5 bg-black/80 backdrop-blur-xl p-2.5 rounded-2xl border border-zinc-800 shadow-xl">
                <button
                  onClick={alternarPaleta}
                  className={`font-black uppercase tracking-wider text-xs px-5 py-3.5 rounded-xl flex items-center gap-2 transition-all cursor-pointer active:scale-95 ${faseUI === "CONO" ? "bg-emerald-500 text-black" : "bg-rose-500/20 text-rose-400 border border-rose-500/40"}`}
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
                  className="bg-zinc-800 text-white font-bold uppercase tracking-wider text-[10px] px-4 py-3.5 rounded-xl flex items-center gap-1.5 active:scale-95"
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
          Experimentá los modelos estabilizados a escala 1:1.
        </p>
      </div>

      <div
        ref={mountRef}
        className="absolute inset-0 z-10 pointer-events-auto"
      />
    </div>
  );
}
