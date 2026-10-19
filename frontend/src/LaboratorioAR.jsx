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
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

export default function LaboratorioAR() {
  const mountRef = useRef(null);
  const overlayRef = useRef(null);

  const [arSupported, setArSupported] = useState(true);
  const [enModoAR, setEnModoAR] = useState(false);

  // Fases de interacción: ESPERANDO -> BUSCANDO -> FIJADO -> CONO -> PALETA
  const [faseUI, setFaseUI] = useState("ESPERANDO");
  const faseRef = useRef("ESPERANDO");

  const [reticulaVisible, setReticulaVisible] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState("INICIE AR");

  const [logs, setLogs] = useState([]);
  const addLog = (msg, isError = false) => {
    setLogs((prev) => [...prev.slice(-3), { msg, isError }]);
  };

  // Referencias Three.js
  const sceneRef = useRef(null);
  const reticleRef = useRef(null);
  const fakeShadowRef = useRef(null);

  const modeloConoRef = useRef(null);
  const modeloPaletaRef = useRef(null);

  // Medidas estrictas en Metros (1.15m total ensamblado)
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

    // Far plane extendido a 1000m para evitar que desaparezca a la distancia
    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      1000,
    );

    // 2. RENDERIZADOR BLINDADO (Sin anti-alias, máxima potencia)
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
      precision: "mediump",
    });
    renderer.setPixelRatio(1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;

    // Anclaje local (Mucho más estable en Android que local-floor para evitar derrapes)
    renderer.xr.setReferenceSpaceType("local");

    // Apagamos las sombras dinámicas nativas (matan la batería y los FPS)
    renderer.shadowMap.enabled = false;
    container.appendChild(renderer.domElement);

    // 3. LUCES LIVIANAS
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.4);
    hemiLight.position.set(0, 5, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(1, 3, 1);
    scene.add(dirLight);

    // 4. SOMBRA ARTIFICIAL (Rendimiento 100%, 0 lag)
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
      depthWrite: false, // Evita conflictos visuales con el piso
    });
    const fakeShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      shadowMat,
    );
    fakeShadow.rotation.x = -Math.PI / 2;
    fakeShadow.visible = false;
    fakeShadow.frustumCulled = false;
    scene.add(fakeShadow);
    fakeShadowRef.current = fakeShadow;

    // 5. CARGA DE MODELOS CON PROTECCIÓN MATRICIAL (Evita saltos de tamaño)
    const loader = new GLTFLoader();

    const prepararModeloEstable = (gltfScene, alturaDeseada) => {
      // Forzamos actualización de matrices base
      gltfScene.updateMatrixWorld(true);
      const bbox = new THREE.Box3().setFromObject(gltfScene);
      const size = new THREE.Vector3();
      bbox.getSize(size);

      const factor = alturaDeseada / (size.y || 1);

      // PIVOTE 1: Centra el objeto al origen 0,0,0
      const pivot = new THREE.Group();
      gltfScene.position.x = -(bbox.min.x + bbox.max.x) / 2;
      gltfScene.position.z = -(bbox.min.z + bbox.max.z) / 2;
      gltfScene.position.y = -bbox.min.y;
      pivot.add(gltfScene);

      // PIVOTE 2: Escala el grupo (evita distorsionar las mallas internamente)
      const scaler = new THREE.Group();
      scaler.add(pivot);
      scaler.scale.setScalar(factor);

      // BLINDAJE TOTAL ANTI-DESAPARICIÓN
      scaler.traverse((child) => {
        child.frustumCulled = false; // Jamás desaparecerá
        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });
      scaler.frustumCulled = false;

      return scaler;
    };

    loader.load(
      "/models/cono.glb",
      (gltf) => {
        modeloConoRef.current = prepararModeloEstable(gltf.scene, ALTURA_CONO);
        addLog("cono.glb cargado OK");
      },
      undefined,
      () => {
        const g = new THREE.Group();
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
        g.frustumCulled = false;
        modeloConoRef.current = g;
      },
    );

    loader.load(
      "/models/paleta.glb",
      (gltf) => {
        modeloPaletaRef.current = prepararModeloEstable(
          gltf.scene,
          ALTURA_PALETA,
        );
        addLog("paleta.glb cargada OK");
      },
      undefined,
      () => {
        const g = new THREE.Group();
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
        g.frustumCulled = false;
        modeloPaletaRef.current = g;
      },
    );

    // 6. MIRA DE ALTA VISIBILIDAD
    const reticleGroup = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide }),
    );
    const centerDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.04, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide }),
    );
    reticleGroup.add(ring, centerDot);
    reticleGroup.matrixAutoUpdate = false;
    reticleGroup.visible = false;

    // Apagamos culling de la mira para que no titile
    reticleGroup.traverse((c) => (c.frustumCulled = false));
    scene.add(reticleGroup);
    reticleRef.current = reticleGroup;

    // 7. BOTÓN AR NATIVO
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

    // 8. BUCLE DE RENDER (El motor principal)
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

        // Hit-test activo SOLO durante la fase "BUSCANDO"
        if (hitTestSource && referenceSpace && faseRef.current === "BUSCANDO") {
          const hitTestResults = frame.getHitTestResults(hitTestSource);

          if (hitTestResults.length > 0) {
            const hit = hitTestResults[0];
            const pose = hit.getPose(referenceSpace);

            if (pose) {
              reticleGroup.visible = true;
              reticleGroup.matrix.fromArray(pose.transform.matrix);
              setReticulaVisible(true);
            }
          } else {
            reticleGroup.visible = false;
            setReticulaVisible(false);
          }
        }
      }

      // Procesador de animaciones fluido
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
      cambiarFase("BUSCANDO", "APUNTE LENTAMENTE AL PISO");
      reticleGroup.children.forEach((c) => c.material.color.setHex(0x10b981));
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
  // LÓGICA DE BOTONES (UI MÓVIL)
  // ==========================================
  const fijarObjetivo = () => {
    if (!reticleRef.current || !reticleRef.current.visible) return;

    // Congelamos la mira cambiando a color naranja
    reticleRef.current.children.forEach((c) =>
      c.material.color.setHex(0xff5a00),
    );
    cambiarFase("FIJADO", "MIRA CONGELADA");
  };

  const colocarCono = () => {
    if (!sceneRef.current || !modeloConoRef.current || !reticleRef.current)
      return;

    // Se clona el modelo asegurando que mantenga la propiedad anti-culling
    const cono = modeloConoRef.current.clone(true);
    cono.traverse((c) => (c.frustumCulled = false));

    // Toma las coordenadas exactas de la mira congelada
    cono.position.setFromMatrixPosition(reticleRef.current.matrix);
    cono.quaternion.setFromRotationMatrix(reticleRef.current.matrix);

    sceneRef.current.add(cono);
    conoInstanciaRef.current = cono;

    // Ponemos la sombra procedural en el piso real (ligeramente levantada para no titilar)
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
      paleta.traverse((c) => (c.frustumCulled = false));

      // Cae desde 0.5 metros por encima del cono
      paleta.position.set(
        conoInstanciaRef.current.position.x,
        conoInstanciaRef.current.position.y + ALTURA_CONO + 0.5,
        conoInstanciaRef.current.position.z,
      );
      paleta.rotation.copy(conoInstanciaRef.current.rotation);
      sceneRef.current.add(paleta);
      paletaInstanciaRef.current = paleta;

      // El encastre matemático perfecto
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
    if (reticleRef.current)
      reticleRef.current.children.forEach((c) =>
        c.material.color.setHex(0x10b981),
      );
    cambiarFase("BUSCANDO", "APUNTE LENTAMENTE AL PISO");
  };

  const reiniciarTodo = () => {
    if (conoInstanciaRef.current)
      sceneRef.current.remove(conoInstanciaRef.current);
    if (paletaInstanciaRef.current)
      sceneRef.current.remove(paletaInstanciaRef.current);
    if (fakeShadowRef.current) fakeShadowRef.current.visible = false;
    conoInstanciaRef.current = null;
    paletaInstanciaRef.current = null;

    if (reticleRef.current)
      reticleRef.current.children.forEach((c) =>
        c.material.color.setHex(0x10b981),
      );
    cambiarFase("BUSCANDO", "APUNTE LENTAMENTE AL PISO");
  };

  return (
    <div className="flex-1 relative bg-zinc-950 font-sans text-zinc-200 overflow-hidden flex flex-col">
      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none z-50 flex flex-col justify-between p-4"
      >
        {/* TOP STATUS BAR */}
        <div className="text-center pt-2">
          <div className="inline-flex items-center gap-2 bg-black/85 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full text-[11px] font-bold tracking-widest text-white shadow-lg">
            <ScanFace size={15} className="text-[#FF5A00]" />
            {mensajeEstado}
          </div>
        </div>

        {/* LOGS MÓVILES */}
        {logs.length > 0 && (
          <div className="mx-auto bg-black/80 border border-yellow-500/40 rounded-lg p-2 max-w-xs text-left mb-auto mt-4 pointer-events-auto">
            {logs.map((l, i) => (
              <p
                key={i}
                className={`text-[9px] font-mono leading-tight ${l.isError ? "text-red-400 font-bold" : "text-emerald-400"}`}
              >
                &gt; {l.msg}
              </p>
            ))}
          </div>
        )}

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
                    Buscando piso... mové el celular despacio
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
                  <MapPin size={20} /> COLOCAR CONO AQUÍ
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

      {/* PANTALLA INICIAL (ANTES DE AR) */}
      <div className="absolute inset-0 bg-[#050507] z-40 flex flex-col items-center justify-center p-6 text-center pointer-events-auto">
        <div className="w-20 h-20 bg-[#FF5A00]/10 rounded-full flex items-center justify-center border border-[#FF5A00]/30 mb-6">
          <Smartphone size={36} className="text-[#FF5A00]" />
        </div>
        <h1 className="text-3xl font-extrabold italic text-white uppercase tracking-tighter mb-2">
          REALIDAD AUMENTADA
        </h1>
        <p className="text-zinc-400 text-sm max-w-md mb-8">
          Experiencia estabilizada de ultra-bajo consumo con escalas forzadas.
        </p>

        {!arSupported && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs max-w-md flex items-start gap-3 text-left mb-6">
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
            <p>
              <strong>Navegador sin ARCore:</strong> Instalá Google Chrome o
              Safari actualizado para disfrutar WebXR.
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
