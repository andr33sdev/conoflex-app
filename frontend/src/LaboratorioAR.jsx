import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  ScanFace,
  Smartphone,
  MapPin,
  RotateCcw,
  Layers,
  Box,
  CheckCircle2,
  Unlink,
  Sparkles,
} from "lucide-react";

export default function LaboratorioAR() {
  const mountRef = useRef(null);
  const overlayRef = useRef(null);

  const [arSupported, setArSupported] = useState(true);
  const [enModoAR, setEnModoAR] = useState(false);

  // Estados de control de armado
  const [conoFijado, setConoFijado] = useState(false);
  const [paletaAcoplada, setPaletaAcoplada] = useState(false);
  const [pisoDetectado, setPisoDetectado] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState("BUSCANDO PISO REAL...");

  // Referencias mutables para el render loop (evita re-renders pesados en el celular)
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const reticleRef = useRef(null);
  const shadowPlaneRef = useRef(null);

  const modeloConoRef = useRef(null);
  const modeloPaletaRef = useRef(null);
  const alturaConoRef = useRef(0.7);

  const conoInstanciaRef = useRef(null);
  const paletaInstanciaRef = useRef(null);
  const animacionesRef = useRef([]);

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

    // 1. ESCENA Y CÁMARA
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      20,
    );
    cameraRef.current = camera;

    // 2. RENDERIZADOR OPTIMIZADO PARA WEBXR
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;

    // ANCLAJE FÍSICO ESTRICTO: Obliga al sensor a tomar el piso real como eje cero
    renderer.xr.setReferenceSpaceType("local-floor");

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 3. ILUMINACIÓN AMBIENTAL REALISTA
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.4);
    hemiLight.position.set(0, 5, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight.position.set(1.5, 4, 1.5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // 4. PRECARGA ASÍNCRONA DE MODELOS (.glb con fallback procedural)
    const loader = new GLTFLoader();

    const normalizarModelo = (gltfScene) => {
      gltfScene.updateMatrixWorld(true);
      const bbox = new THREE.Box3().setFromObject(gltfScene);
      const size = new THREE.Vector3();
      bbox.getSize(size);

      // Centrado perfecto y base en Y = 0
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
        modeloConoRef.current = crearConoFallback();
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
        modeloPaletaRef.current = crearPaletaFallback();
      },
    );

    function crearConoFallback() {
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
      return g;
    }

    function crearPaletaFallback() {
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
      return g;
    }

    // 5. RETÍCULA Y SOMBRA EN EL PISO
    const reticleGeo = new THREE.RingGeometry(0.12, 0.16, 32).rotateX(
      -Math.PI / 2,
    );
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
    });
    const reticle = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
    reticleRef.current = reticle;

    const dotGeo = new THREE.CircleGeometry(0.02, 16).rotateX(-Math.PI / 2);
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
      console.error("Error iniciando ARButton:", e);
    }

    let hitTestSource = null;
    let hitTestSourceRequested = false;

    // 7. BUCLE DE RENDERIZADO CON HIT-TESTING PAUSABLE
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

        // Solo procesamos el sensor de piso si todavía NO fijamos el cono
        if (hitTestSource && referenceSpace && !conoInstanciaRef.current) {
          const hitTestResults = frame.getHitTestResults(hitTestSource);
          if (hitTestResults.length > 0) {
            const hit = hitTestResults[0];
            const pose = hit.getPose(referenceSpace);
            if (pose) {
              reticle.visible = true;
              reticle.matrix.fromArray(pose.transform.matrix);
              reticle.matrixWorldNeedsUpdate = true;
              setPisoDetectado(true);
              setMensajeEstado("PISO REAL DETECTADO");
            }
          } else {
            reticle.visible = false;
            setPisoDetectado(false);
            setMensajeEstado("BUSCANDO PISO REAL (MOVER CELULAR)...");
          }
        }
      }

      // Animaciones suaves de acople
      for (let i = animacionesRef.current.length - 1; i >= 0; i--) {
        const anim = animacionesRef.current[i];
        anim.obj.position.lerp(anim.targetPos, 0.12);
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
      setMensajeEstado("ESCANEANDO SUPERFICIE...");
    });

    renderer.xr.addEventListener("sessionend", () => {
      setEnModoAR(false);
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
  // ACCIONES MANUALES POR BOTÓN (100% ESTABLES)
  // ==========================================

  // 1. Fijar el Cono en el piso detectado o frente al usuario
  const fijarConoEnPiso = () => {
    if (!sceneRef.current || !modeloConoRef.current) return;

    let posX = 0,
      posY = 0,
      posZ = -1.2;

    if (reticleRef.current && reticleRef.current.visible) {
      // Coordenadas tomadas exactamente de la mira en el piso real
      const p = new THREE.Vector3().setFromMatrixPosition(
        reticleRef.current.matrix,
      );
      posX = p.x;
      posY = p.y;
      posZ = p.z;
    } else if (cameraRef.current) {
      // Fallback a 1.2m al frente si el piso no tiene textura
      const dir = new THREE.Vector3(0, 0, -1.2).applyQuaternion(
        cameraRef.current.quaternion,
      );
      const target = cameraRef.current.position.clone().add(dir);
      posX = target.x;
      posY = cameraRef.current.position.y - 1.1; // Nivel estimado de suelo
      posZ = target.z;
    }

    const cono = modeloConoRef.current.clone(true);
    cono.position.set(posX, posY, posZ);

    // Girar hacia donde está mirando el usuario al momento de plantar el cono
    if (cameraRef.current) {
      cono.rotation.y = Math.atan2(
        cameraRef.current.position.x - posX,
        cameraRef.current.position.z - posZ,
      );
    }

    sceneRef.current.add(cono);
    conoInstanciaRef.current = cono;

    // Sombra proyectada sobre el suelo
    if (shadowPlaneRef.current) {
      shadowPlaneRef.current.position.set(posX, posY, posZ);
      shadowPlaneRef.current.visible = true;
    }

    // Desactivamos la retícula para que no consuma batería ni salte
    if (reticleRef.current) reticleRef.current.visible = false;

    setConoFijado(true);
    setMensajeEstado("CONO ANCLADO EN EL ESPACIO FÍSICO");
  };

  // 2. Acoplar la Paleta
  const alternarPaleta = () => {
    if (
      !conoInstanciaRef.current ||
      !modeloPaletaRef.current ||
      !sceneRef.current
    )
      return;

    if (!paletaAcoplada) {
      // COLOCAR PALETA
      const paleta = modeloPaletaRef.current.clone(true);
      const altCono = alturaConoRef.current || 0.7;

      // Nace 0.8m arriba del cono
      paleta.position.set(
        conoInstanciaRef.current.position.x,
        conoInstanciaRef.current.position.y + altCono + 0.8,
        conoInstanciaRef.current.position.z,
      );
      paleta.rotation.copy(conoInstanciaRef.current.rotation);
      sceneRef.current.add(paleta);
      paletaInstanciaRef.current = paleta;

      // Encastre en la boca del cono
      const targetY = conoInstanciaRef.current.position.y + altCono - 0.28;
      setMensajeEstado("ACOPLANDO PALETA...");

      animacionesRef.current.push({
        obj: paleta,
        targetPos: new THREE.Vector3(
          conoInstanciaRef.current.position.x,
          targetY,
          conoInstanciaRef.current.position.z,
        ),
        onComplete: () => {
          setPaletaAcoplada(true);
          setMensajeEstado("PRODUCTO ENSAMBLADO");
        },
      });
    } else {
      // QUITAR PALETA
      if (paletaInstanciaRef.current) {
        sceneRef.current.remove(paletaInstanciaRef.current);
        paletaInstanciaRef.current = null;
      }
      setPaletaAcoplada(false);
      setMensajeEstado("PALETA RETIRADA");
    }
  };

  // 3. Reiniciar y reposicionar
  const reiniciarEscena = () => {
    if (!sceneRef.current) return;

    if (conoInstanciaRef.current) {
      sceneRef.current.remove(conoInstanciaRef.current);
      conoInstanciaRef.current = null;
    }
    if (paletaInstanciaRef.current) {
      sceneRef.current.remove(paletaInstanciaRef.current);
      paletaInstanciaRef.current = null;
    }
    if (shadowPlaneRef.current) shadowPlaneRef.current.visible = false;

    setConoFijado(false);
    setPaletaAcoplada(false);
    setMensajeEstado("BUSCANDO PISO REAL...");
  };

  return (
    <div className="flex-1 relative bg-zinc-950 font-sans text-zinc-200 overflow-hidden flex flex-col">
      {/* CAPA OVERLAY EN REALIDAD AUMENTADA (HUD) */}
      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none z-50 flex flex-col justify-between p-4"
      >
        {/* Indicador superior flotante */}
        <div className="text-center pt-2">
          <div className="inline-flex items-center gap-2 bg-black/85 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full text-[11px] font-bold tracking-widest text-white shadow-2xl">
            <ScanFace size={15} className="text-[#FF5A00]" />
            {mensajeEstado}
          </div>
        </div>

        {/* PANEL DE CONTROL EN MODO CÁMARA (Solo los botones capturan toques) */}
        {enModoAR && (
          <div className="flex flex-col items-center gap-3 pb-8 pointer-events-auto">
            {/* ETAPA 1: FIJAR CONO */}
            {!conoFijado ? (
              <button
                onClick={fijarConoEnPiso}
                className="bg-[#FF5A00] hover:bg-white text-black font-extrabold uppercase tracking-widest text-xs px-7 py-4 rounded-full shadow-[0_0_30px_rgba(255,90,0,0.6)] flex items-center gap-2.5 active:scale-95 transition-all cursor-pointer"
              >
                <MapPin size={17} /> FIJAR CONO AQUÍ
              </button>
            ) : (
              /* ETAPA 2: CONTROL DE PALETA Y REPOSICIÓN */
              <div className="flex items-center gap-2.5 bg-black/80 backdrop-blur-xl p-2 rounded-2xl border border-zinc-800 shadow-2xl">
                <button
                  onClick={alternarPaleta}
                  className={`font-black uppercase tracking-wider text-xs px-5 py-3 rounded-xl flex items-center gap-2 transition-all cursor-pointer active:scale-95 ${
                    !paletaAcoplada
                      ? "bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/30"
                      : "bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30"
                  }`}
                >
                  {!paletaAcoplada ? (
                    <>
                      <Sparkles size={15} /> ACOPLAR PALETA
                    </>
                  ) : (
                    <>
                      <Unlink size={15} /> QUITAR PALETA
                    </>
                  )}
                </button>

                <button
                  onClick={reiniciarEscena}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold uppercase tracking-wider text-xs px-4 py-3 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                  title="Cambiar de lugar el cono"
                >
                  <RotateCcw size={14} /> MOVER
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* PANTALLA INICIAL (ANTES DE ACTIVAR LA CÁMARA) */}
      <div className="absolute inset-0 bg-[#050507] z-40 flex flex-col items-center justify-center p-6 text-center pointer-events-auto">
        <div className="w-20 h-20 bg-[#FF5A00]/10 rounded-full flex items-center justify-center border border-[#FF5A00]/30 mb-6 shadow-[0_0_40px_rgba(255,90,0,0.2)]">
          <Smartphone size={36} className="text-[#FF5A00]" />
        </div>

        <h1 className="text-3xl font-extrabold italic text-white uppercase tracking-tighter mb-2">
          REALIDAD AUMENTADA
        </h1>
        <p className="text-zinc-400 text-sm max-w-md mb-6">
          Anclaje milimétrico de productos en el piso físico con sombras de
          contacto.
        </p>

        {!arSupported && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs max-w-md flex items-start gap-3 text-left mb-6">
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
            <p>
              <strong>Requiere navegador AR:</strong> Usá Google Chrome en
              Android con Servicios de Google Play para RA instalados.
            </p>
          </div>
        )}

        <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl text-xs text-zinc-400 flex flex-col gap-2 text-left max-w-md w-full mb-12">
          <span className="font-bold text-zinc-200 uppercase tracking-wider">
            CÓMO FUNCIONA:
          </span>
          <p>
            1. Presioná el botón <strong>"START AR"</strong> de abajo.
          </p>
          <p>
            2. Apuntá hacia el suelo y tocá <strong>"FIJAR CONO AQUÍ"</strong>.
          </p>
          <p>
            3. El cono queda anclado en ese punto; podés caminar a su alrededor
            y presionar <strong>"ACOPLAR PALETA"</strong> cuando quieras.
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
