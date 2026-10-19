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

  // MÁQUINA DE ESTADOS UI: ESPERANDO -> BUSCANDO -> FIJADO -> CONO -> PALETA
  const [faseUI, setFaseUI] = useState("ESPERANDO");
  const faseRef = useRef("ESPERANDO"); // Ref para leer dentro del loop de render

  const [reticulaVisible, setReticulaVisible] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState("INICIE AR");

  const [logs, setLogs] = useState([]);
  const addLog = (msg, isError = false) => {
    setLogs((prev) => [...prev.slice(-2), { msg, isError }]);
  };

  // Referencias mutables para Three.js
  const sceneRef = useRef(null);
  const reticleRef = useRef(null);
  const shadowPlaneRef = useRef(null);

  const modeloConoRef = useRef(null);
  const modeloPaletaRef = useRef(null);
  const alturaConoRef = useRef(0.7);

  const conoInstanciaRef = useRef(null);
  const paletaInstanciaRef = useRef(null);
  const animacionesRef = useRef([]);

  // Cambia el estado tanto en React como en la variable Ref del bucle 3D
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

    // 2. RENDERIZADOR
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 3. LUCES
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.4);
    hemiLight.position.set(0, 5, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight.position.set(1.5, 4, 1.5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // 4. CARGA DE MODELOS .GLB
    const loader = new GLTFLoader();

    const normalizarModelo = (gltfScene) => {
      gltfScene.updateMatrixWorld(true);
      const bbox = new THREE.Box3().setFromObject(gltfScene);
      const size = new THREE.Vector3();
      bbox.getSize(size);

      gltfScene.position.x = -(bbox.min.x + bbox.max.x) / 2;
      gltfScene.position.z = -(bbox.min.z + bbox.max.z) / 2;
      gltfScene.position.y = -bbox.min.y;

      gltfScene.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      const wrapper = new THREE.Group();
      wrapper.add(gltfScene);
      return { wrapper, altura: size.y };
    };

    loader.load(
      "/models/cono.glb",
      (gltf) => {
        const { wrapper, altura } = normalizarModelo(gltf.scene);
        modeloConoRef.current = wrapper;
        alturaConoRef.current = altura;
      },
      undefined,
      () => {
        // Fallback procedural
        const g = new THREE.Group();
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 0.05, 0.35),
          new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }),
        );
        base.position.y = 0.025;
        base.castShadow = true;
        const cono = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.12, 0.7, 32),
          new THREE.MeshStandardMaterial({ color: 0xff5a00, roughness: 0.3 }),
        );
        cono.position.y = 0.35;
        cono.castShadow = true;
        g.add(base, cono);
        modeloConoRef.current = g;
      },
    );

    loader.load(
      "/models/paleta.glb",
      (gltf) => {
        const { wrapper } = normalizarModelo(gltf.scene);
        wrapper.scale.setScalar(0.85);
        modeloPaletaRef.current = wrapper;
      },
      undefined,
      () => {
        // Fallback procedural
        const g = new THREE.Group();
        const circ = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.14, 0.02, 32).rotateX(Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.4 }),
        );
        circ.position.y = 0.25;
        circ.castShadow = true;
        const poste = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.035, 0.35, 16),
          new THREE.MeshStandardMaterial({ color: 0x0055ff, roughness: 0.3 }),
        );
        poste.position.y = 0;
        poste.castShadow = true;
        g.add(circ, poste);
        g.scale.setScalar(0.85);
        modeloPaletaRef.current = g;
      },
    );

    // 5. MIRA (Retícula interactiva)
    const reticleGeo = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(
      -Math.PI / 2,
    );
    // Material con colores que vamos a cambiar
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const reticle = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
    reticleRef.current = reticle;

    const dotGeo = new THREE.CircleGeometry(0.03, 16).rotateX(-Math.PI / 2);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      side: THREE.DoubleSide,
    });
    reticle.add(new THREE.Mesh(dotGeo, dotMat));

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.ShadowMaterial({ opacity: 0.45 }),
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.receiveShadow = true;
    shadowPlane.visible = false;
    scene.add(shadowPlane);
    shadowPlaneRef.current = shadowPlane;

    // 6. BOTÓN AR NATIVO
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
      arButton.style.boxShadow = "0 8px 25px rgba(255, 90, 0, 0.4)";
      arButton.style.zIndex = "99999";

      document.body.appendChild(arButton);
    } catch (e) {
      addLog("Fallo ARButton: " + e.message, true);
    }

    let hitTestSource = null;
    let hitTestSourceRequested = false;

    // 7. BUCLE DE RENDERIZADO AR
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

        // Hit testing activo SOLO si estamos en fase BUSCANDO
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

      // Procesar animaciones (Paleta bajando)
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

    // EVENTOS DE SESIÓN AR
    renderer.xr.addEventListener("sessionstart", () => {
      setEnModoAR(true);
      cambiarFase("BUSCANDO", "APUNTE LA CÁMARA AL PISO");
      reticle.material.color.setHex(0x10b981); // Verde
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
  // LÓGICA DE LA INTERFAZ Y BOTONERA
  // ==========================================

  // PASO 1: El usuario vio la mira verde y la bloquea
  const fijarObjetivo = () => {
    if (!reticleRef.current || !reticleRef.current.visible) return;

    // Cambiamos el color de la mira a Naranja para mostrar que está congelada
    reticleRef.current.material.color.setHex(0xff5a00);
    cambiarFase("FIJADO", "OBJETIVO MARCADO EN EL PISO");
  };

  // PASO 2: El usuario confirma y planta el cono
  const colocarCono = () => {
    if (!sceneRef.current || !modeloConoRef.current || !reticleRef.current)
      return;

    // Crea el cono y le aplica EXACTAMENTE la posición y rotación de la mira congelada
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
    cambiarFase("CONO", "CONO ANCLADO");
  };

  // PASO 3: Ensamblar o quitar paleta
  const alternarPaleta = () => {
    if (!sceneRef.current || !conoInstanciaRef.current) return;

    if (faseUI === "CONO") {
      const paleta = modeloPaletaRef.current.clone(true);
      const altCono = alturaConoRef.current || 0.7;

      // Cae desde 1 metro arriba
      paleta.position.set(
        conoInstanciaRef.current.position.x,
        conoInstanciaRef.current.position.y + altCono + 1.0,
        conoInstanciaRef.current.position.z,
      );
      paleta.rotation.copy(conoInstanciaRef.current.rotation);
      sceneRef.current.add(paleta);
      paletaInstanciaRef.current = paleta;

      const targetY = conoInstanciaRef.current.position.y + altCono - 0.28;
      cambiarFase("ANIMANDO", "ENSAMBLANDO...");

      animacionesRef.current.push({
        obj: paleta,
        targetPos: new THREE.Vector3(
          conoInstanciaRef.current.position.x,
          targetY,
          conoInstanciaRef.current.position.z,
        ),
        onComplete: () => {
          cambiarFase("PALETA", "ENSAMBLE PERFECTO");
        },
      });
    } else if (faseUI === "PALETA") {
      sceneRef.current.remove(paletaInstanciaRef.current);
      paletaInstanciaRef.current = null;
      cambiarFase("CONO", "PALETA RETIRADA");
    }
  };

  // BOTONES CANCELAR Y REINICIAR
  const cancelarObjetivo = () => {
    if (reticleRef.current) reticleRef.current.material.color.setHex(0x10b981); // Vuelve a Verde
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
      {/* HUD AR SUPERPUESTO (Z-50) */}
      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none z-50 flex flex-col justify-between p-4"
      >
        {/* Cabecera Indicadora */}
        <div className="text-center pt-2">
          <div className="inline-flex items-center gap-2 bg-black/85 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full text-[11px] font-bold tracking-widest text-white shadow-2xl">
            <ScanFace size={15} className="text-[#FF5A00]" />
            {mensajeEstado}
          </div>
        </div>

        {/* ERRORES Y DIAGNÓSTICO */}
        {logs.length > 0 && (
          <div className="mx-auto bg-black/80 border border-yellow-500/40 rounded-lg p-2 max-w-xs text-left mb-auto mt-4 pointer-events-auto overflow-y-auto max-h-32">
            <span className="text-[9px] font-bold text-yellow-400 block mb-1">
              LOGS SISTEMA:
            </span>
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

        {/* BOTONERA TÁCTIL DEPENDIENDO DE LA FASE */}
        {enModoAR && (
          <div className="flex flex-col items-center gap-3 pb-8 pointer-events-auto">
            {faseUI === "BUSCANDO" && (
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={fijarObjetivo}
                  disabled={!reticulaVisible}
                  className={`font-extrabold uppercase tracking-widest text-xs px-8 py-4 rounded-full flex items-center gap-2 transition-all ${
                    reticulaVisible
                      ? "bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_30px_rgba(16,185,129,0.5)] active:scale-95"
                      : "bg-zinc-800 text-zinc-500 opacity-50 cursor-not-allowed"
                  }`}
                >
                  <Target size={18} /> FIJAR OBJETIVO
                </button>
                {!reticulaVisible && (
                  <span className="text-[10px] text-zinc-300 font-semibold bg-black/60 px-3 py-1 rounded-md">
                    Mueva el celular apuntando al suelo
                  </span>
                )}
              </div>
            )}

            {faseUI === "FIJADO" && (
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={colocarCono}
                  className="bg-[#FF5A00] text-black font-extrabold uppercase tracking-widest text-sm px-8 py-4 rounded-full shadow-[0_0_30px_rgba(255,90,0,0.6)] flex items-center gap-2 active:scale-95 transition-all"
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
              <div className="flex items-center gap-2.5 bg-black/80 backdrop-blur-xl p-2.5 rounded-2xl border border-zinc-800 shadow-2xl">
                <button
                  onClick={alternarPaleta}
                  className={`font-black uppercase tracking-wider text-xs px-5 py-3.5 rounded-xl flex items-center gap-2 transition-all cursor-pointer active:scale-95 ${
                    faseUI === "CONO"
                      ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/30"
                      : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                  }`}
                >
                  {faseUI === "CONO" ? (
                    <>
                      {" "}
                      <Sparkles size={16} /> ACOPLAR PALETA{" "}
                    </>
                  ) : (
                    <>
                      {" "}
                      <Unlink size={16} /> QUITAR PALETA{" "}
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

      {/* PANTALLA INICIAL (ANTES DE ARBUTTON) */}
      <div className="absolute inset-0 bg-[#050507] z-40 flex flex-col items-center justify-center p-6 text-center pointer-events-auto">
        <div className="w-20 h-20 bg-[#FF5A00]/10 rounded-full flex items-center justify-center border border-[#FF5A00]/30 mb-6 shadow-[0_0_40px_rgba(255,90,0,0.2)]">
          <Smartphone size={36} className="text-[#FF5A00]" />
        </div>

        <h1 className="text-3xl font-extrabold italic text-white uppercase tracking-tighter mb-2">
          REALIDAD AUMENTADA
        </h1>
        <p className="text-zinc-400 text-sm max-w-md mb-6">
          Anclaje milimétrico de productos en el piso físico.
        </p>

        {!arSupported && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs max-w-md flex items-start gap-3 text-left mb-6">
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
            <p>
              <strong>Requiere navegador AR:</strong> Usá Google Chrome en
              Android con Servicios de AR instalados.
            </p>
          </div>
        )}

        <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl text-xs text-zinc-400 flex flex-col gap-2 text-left max-w-md w-full mb-12">
          <span className="font-bold text-zinc-200 uppercase tracking-wider border-b border-zinc-800 pb-1">
            NUEVA MECÁNICA ESTABLE:
          </span>
          <p>
            1. Presioná <strong>START AR</strong> y escaneá el piso.
          </p>
          <p>
            2. Cuando veas el anillo verde, tocá <strong>FIJAR OBJETIVO</strong>
            .
          </p>
          <p>
            3. El anillo se bloqueará. Tocá <strong>COLOCAR CONO</strong> para
            plantarlo en esa marca exacta y ensamblá cuando gustes.
          </p>
        </div>
      </div>

      <div
        ref={mountRef}
        className="absolute inset-0 z-10 pointer-events-auto"
      />
    </div>
  );
}
