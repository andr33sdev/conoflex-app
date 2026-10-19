import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  ScanFace,
  Smartphone,
  Info,
  AlertTriangle,
  MapPin,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";

export default function LaboratorioAR() {
  const mountRef = useRef(null);
  const overlayRef = useRef(null);

  const [arSupported, setArSupported] = useState(true);
  const [estadoAR, setEstadoAR] = useState("CARGANDO MODELOS 3D...");
  const [enModoAR, setEnModoAR] = useState(false);
  const [etapaActual, setEtapaActual] = useState(0); // 0: buscando piso, 1: cono puesto, 2: paleta acoplada
  const [modelosCargados, setModelosCargados] = useState(false);

  // Consola de diagnóstico
  const [logs, setLogs] = useState([]);
  const addLog = (msg, isError = false) => {
    setLogs((prev) => [...prev.slice(-3), { msg, isError }]);
  };

  // Referencias a los modelos 3D precargados
  const modeloConoRef = useRef(null);
  const modeloPaletaRef = useRef(null);
  const alturaConoRef = useRef(0.7); // Altura calculada del cono en metros

  // Disparadores de botones táctiles
  const colocarDirectoRef = useRef(null);
  const ensamblarPaletaRef = useRef(null);
  const reiniciarRef = useRef(null);

  useEffect(() => {
    const handleGlobalError = (event) => addLog(`${event.message}`, true);
    window.addEventListener("error", handleGlobalError);

    // 1. VERIFICAR SOPORTE WEBXR
    if ("xr" in navigator) {
      navigator.xr
        .isSessionSupported("immersive-ar")
        .then((supported) => setArSupported(supported))
        .catch((err) => addLog("Error WebXR: " + err.message, true));
    } else {
      setArSupported(false);
    }

    const container = mountRef.current;
    if (!container) return;

    // 2. CONFIGURACIÓN THREE.JS
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      20,
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Iluminación para AR
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.4);
    hemiLight.position.set(0, 5, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight.position.set(1.5, 4, 1.5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // 3. PRECARGA DE TUS ARCHIVOS .GLB REALES
    const loader = new GLTFLoader();

    // Normalizador de mallas para que tengan base en Y=0 y sombras
    const normalizarModelo = (gltfScene) => {
      gltfScene.updateMatrixWorld(true);
      const bbox = new THREE.Box3().setFromObject(gltfScene);
      const size = new THREE.Vector3();
      bbox.getSize(size);

      // Centrar en X y Z, y plantar la base exactamente en Y = 0
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

    // A. Cargar cono.glb
    loader.load(
      "/models/cono.glb",
      (gltf) => {
        const { wrapper, altura } = normalizarModelo(gltf.scene);
        modeloConoRef.current = wrapper;
        alturaConoRef.current = altura;
        addLog(`cono.glb cargado (Alt: ${altura.toFixed(2)}m)`);
        verificarCargaCompleta();
      },
      undefined,
      (err) => {
        addLog("No se halló /models/cono.glb (Usando fallback)", true);
        // Fallback procedural en caso de error 404
        modeloConoRef.current = crearConoFallback();
        verificarCargaCompleta();
      },
    );

    // B. Cargar paleta.glb
    loader.load(
      "/models/paleta.glb",
      (gltf) => {
        const { wrapper } = normalizarModelo(gltf.scene);
        wrapper.scale.setScalar(0.85); // Proporción estética
        modeloPaletaRef.current = wrapper;
        addLog("paleta.glb cargado con éxito");
        verificarCargaCompleta();
      },
      undefined,
      (err) => {
        addLog("No se halló /models/paleta.glb (Usando fallback)", true);
        modeloPaletaRef.current = crearPaletaFallback();
        verificarCargaCompleta();
      },
    );

    const verificarCargaCompleta = () => {
      if (modeloConoRef.current && modeloPaletaRef.current) {
        setModelosCargados(true);
        setEstadoAR("MODELOS LISTOS — INICIE AR");
      }
    };

    // 4. MODELOS PROCEDURALES DE RESPALDO (Por si la ruta 404 falla)
    function crearConoFallback() {
      const g = new THREE.Group();
      const cono = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.12, 0.7, 32),
        new THREE.MeshStandardMaterial({ color: 0xff5a00, roughness: 0.3 }),
      );
      cono.position.y = 0.35;
      cono.castShadow = true;
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.05, 0.35),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }),
      );
      base.position.y = 0.025;
      base.castShadow = true;
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
      const poste = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.035, 0.35, 16),
        new THREE.MeshStandardMaterial({ color: 0x0055ff, roughness: 0.3 }),
      );
      poste.position.y = 0;
      g.add(circ, poste);
      g.scale.setScalar(0.85);
      return g;
    }

    // 5. BOTÓN NATIVO ARBUTTON
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
      addLog("Fallo al crear ARButton: " + e.message, true);
    }

    // 6. RETÍCULA Y PLANO DE SOMBRAS
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

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.ShadowMaterial({ opacity: 0.45 }),
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.receiveShadow = true;
    shadowPlane.visible = false;
    scene.add(shadowPlane);

    let hitTestSource = null;
    let hitTestSourceRequested = false;

    let conoInstancia = null;
    let paletaInstancia = null;
    let animaciones = [];
    let etapa = 0;

    // COLOCAR CONO
    const spawnCono = (x, y, z) => {
      if (!modeloConoRef.current) return;
      conoInstancia = modeloConoRef.current.clone(true);
      conoInstancia.position.set(x, y, z);
      scene.add(conoInstancia);

      shadowPlane.position.copy(conoInstancia.position);
      shadowPlane.visible = true;

      etapa = 1;
      setEtapaActual(1);
      setEstadoAR("CONO FIJADO — TOQUE PARA PALETA");
      reticle.visible = false;
    };

    // ENSAMBLAR PALETA
    const ensamblarPaleta = () => {
      if (!conoInstancia || !modeloPaletaRef.current) return;
      paletaInstancia = modeloPaletaRef.current.clone(true);

      const altCono = alturaConoRef.current || 0.7;
      // Nace 1 metro arriba del cono
      paletaInstancia.position.set(
        conoInstancia.position.x,
        conoInstancia.position.y + altCono + 1.0,
        conoInstancia.position.z,
      );
      scene.add(paletaInstancia);

      // Destino: encastre dentro de la boca del cono (-0.28m de profundidad)
      const targetY = conoInstancia.position.y + altCono - 0.28;
      setEstadoAR("ACOPLANDO PALETA...");

      animaciones.push({
        obj: paletaInstancia,
        targetPos: new THREE.Vector3(
          conoInstancia.position.x,
          targetY,
          conoInstancia.position.z,
        ),
        onComplete: () => {
          setEstadoAR("PRODUCTO ENSAMBLADO [OK]");
          etapa = 2;
          setEtapaActual(2);
        },
      });
    };

    const reiniciar = () => {
      if (conoInstancia) scene.remove(conoInstancia);
      if (paletaInstancia) scene.remove(paletaInstancia);
      shadowPlane.visible = false;
      conoInstancia = null;
      paletaInstancia = null;
      etapa = 0;
      setEtapaActual(0);
      setEstadoAR("BUSQUE EL PISO CON LA CÁMARA");
    };

    // Asignación de disparadores
    colocarDirectoRef.current = () => {
      const dir = new THREE.Vector3(0, 0, -1.2).applyQuaternion(
        camera.quaternion,
      );
      const targetPos = camera.position.clone().add(dir);
      const pisoEstimado = Math.max(camera.position.y - 1.1, -1.5);
      spawnCono(targetPos.x, pisoEstimado, targetPos.z);
    };
    ensamblarPaletaRef.current = ensamblarPaleta;
    reiniciarRef.current = reiniciar;

    // Toques en pantalla (Controller XR)
    const controller = renderer.xr.getController(0);
    controller.addEventListener("select", () => {
      if (etapa === 0 && reticle.visible) {
        const pos = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
        spawnCono(pos.x, pos.y, pos.z);
      } else if (etapa === 1) {
        ensamblarPaleta();
      } else if (etapa === 2) {
        reiniciar();
      }
    });
    scene.add(controller);

    renderer.xr.addEventListener("sessionstart", () => {
      setEnModoAR(true);
      setEstadoAR("BUSQUE EL PISO CON LA CÁMARA");
    });
    renderer.xr.addEventListener("sessionend", () => {
      setEnModoAR(false);
      hitTestSource = null;
      hitTestSourceRequested = false;
    });

    // 7. BUCLE DE RENDERIZADO
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

        if (hitTestSource && referenceSpace && etapa === 0) {
          const hitTestResults = frame.getHitTestResults(hitTestSource);
          if (hitTestResults.length > 0) {
            const hit = hitTestResults[0];
            const pose = hit.getPose(referenceSpace);
            if (pose) {
              reticle.visible = true;
              reticle.matrix.fromArray(pose.transform.matrix);
              reticle.matrixWorldNeedsUpdate = true;
              setEstadoAR("PISO DETECTADO — TOQUE PARA COLOCAR");
            }
          } else {
            reticle.visible = false;
          }
        }
      }

      for (let i = animaciones.length - 1; i >= 0; i--) {
        const anim = animaciones[i];
        anim.obj.position.lerp(anim.targetPos, 0.12);
        if (anim.obj.position.distanceTo(anim.targetPos) < 0.005) {
          anim.obj.position.copy(anim.targetPos);
          anim.onComplete();
          animaciones.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
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

  return (
    <div className="flex-1 relative bg-zinc-950 font-sans text-zinc-200 overflow-hidden flex flex-col">
      {/* CAPA OVERLAY EN REALIDAD AUMENTADA */}
      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none z-50 flex flex-col justify-between p-4"
      >
        <div className="text-center pt-2">
          <div className="inline-flex items-center gap-2 bg-black/80 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full text-[11px] font-bold tracking-widest text-white shadow-2xl">
            <ScanFace size={15} className="text-[#FF5A00]" />
            {estadoAR}
          </div>
        </div>

        {logs.length > 0 && (
          <div className="mx-auto bg-black/85 border border-yellow-500/40 rounded-lg p-2 max-w-xs text-left">
            <span className="text-[9px] font-bold text-yellow-400 block mb-1">
              ESTADO DE ARCHIVOS 3D:
            </span>
            {logs.map((l, i) => (
              <p
                key={i}
                className={`text-[9px] font-mono leading-tight ${
                  l.isError ? "text-amber-400 font-bold" : "text-emerald-400"
                }`}
              >
                &gt; {l.msg}
              </p>
            ))}
          </div>
        )}

        {enModoAR && (
          <div className="flex flex-col items-center gap-2.5 pb-6 pointer-events-auto">
            {etapaActual === 0 && (
              <button
                onClick={() =>
                  colocarDirectoRef.current && colocarDirectoRef.current()
                }
                className="bg-[#FF5A00] hover:bg-white text-black font-extrabold uppercase tracking-widest text-xs px-6 py-3.5 rounded-full shadow-[0_0_25px_rgba(255,90,0,0.5)] flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
              >
                <MapPin size={16} /> COLOCAR AQUÍ DIRECTO
              </button>
            )}

            {etapaActual === 1 && (
              <button
                onClick={() =>
                  ensamblarPaletaRef.current && ensamblarPaletaRef.current()
                }
                className="bg-emerald-400 hover:bg-white text-black font-extrabold uppercase tracking-widest text-xs px-6 py-3.5 rounded-full shadow-[0_0_25px_rgba(16,185,129,0.5)] flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
              >
                ENSAMBLAR PALETA
              </button>
            )}

            {etapaActual === 2 && (
              <button
                onClick={() => reiniciarRef.current && reiniciarRef.current()}
                className="bg-zinc-800 border border-zinc-700 text-white font-bold uppercase tracking-wider text-xs px-5 py-2.5 rounded-full flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
              >
                <RotateCcw size={14} /> REINICIAR
              </button>
            )}
          </div>
        )}
      </div>

      {/* PANTALLA INICIAL (ANTES DE START AR) */}
      <div className="absolute inset-0 bg-[#050507] z-40 flex flex-col items-center justify-center p-6 text-center pointer-events-auto">
        <div className="w-20 h-20 bg-[#FF5A00]/10 rounded-full flex items-center justify-center border border-[#FF5A00]/30 mb-6 shadow-[0_0_40px_rgba(255,90,0,0.2)]">
          <Smartphone size={36} className="text-[#FF5A00]" />
        </div>

        <h1 className="text-3xl font-extrabold italic text-white uppercase tracking-tighter mb-2">
          REALIDAD AUMENTADA
        </h1>
        <p className="text-zinc-400 text-sm max-w-md mb-4">
          Visualizá tus modelos reales `.glb` a escala 1:1 en el piso físico.
        </p>

        <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3.5 py-1.5 rounded-full text-xs font-mono text-zinc-300 mb-6">
          <CheckCircle2
            size={13}
            className={modelosCargados ? "text-emerald-400" : "text-amber-400"}
          />
          {modelosCargados
            ? "Modelos 3D cargados en memoria"
            : "Cargando archivos .glb..."}
        </div>

        {!arSupported && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs max-w-md flex items-start gap-3 text-left mb-6">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <p>
              <strong>Dispositivo incompatible.</strong> Para usar WebXR
              necesitás Chrome en Android con los Servicios de Google Play para
              RA instalados.
            </p>
          </div>
        )}

        <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl text-xs text-zinc-400 flex flex-col gap-2 text-left max-w-md w-full mb-12">
          <div className="flex items-center gap-2 font-bold text-zinc-300">
            <Info size={14} className="text-[#38bdf8]" /> PASOS:
          </div>
          <p>1. Presioná el botón "START AR" abajo.</p>
          <p>2. Apuntá hacia el piso o usá "Colocar aquí directo".</p>
          <p>3. Tocá para ver cómo la paleta real desciende y se acopla.</p>
        </div>
      </div>

      <div
        ref={mountRef}
        className="absolute inset-0 z-10 pointer-events-auto"
      />
    </div>
  );
}
