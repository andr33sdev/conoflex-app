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
} from "lucide-react";

const _mPose = new THREE.Matrix4();
const _vPos = new THREE.Vector3();
const _qRot = new THREE.Quaternion();

export default function LaboratorioAR() {
  const mountRef = useRef(null);
  const overlayRef = useRef(null);

  const [arSupported, setArSupported] = useState(true);
  const [enModoAR, setEnModoAR] = useState(false);

  // Estados de flujo: BUSCANDO -> FIJADO -> CONO -> PALETA
  const [faseUI, setFaseUI] = useState("ESPERANDO");
  const faseRef = useRef("ESPERANDO");

  const [reticulaVisible, setReticulaVisible] = useState(false);
  const [mensajeEstado, setMensajeEstado] = useState("INICIE AR");

  // Multiplicador de escala en vivo para emparejar con el cono real
  const [escalaFactor, setEscalaFactor] = useState(1.0);
  const escalaRef = useRef(1.0);

  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const reticleRef = useRef(null);
  const shadowMeshRef = useRef(null);

  const modeloConoRef = useRef(null);
  const modeloPaletaRef = useRef(null);

  // Alturas reales de diseño
  const ALTURA_CONO = 0.7; // 70 cm
  const ALTURA_PALETA = 0.6; // 60 cm
  const HUNDIMIENTO = 0.15; // 15 cm de encastre (Total: 1.15 m)
  const DIAMETRO_BASE = 0.37; // 37 cm (ancho de la base negra del cono real)

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
    escalaRef.current = escalaFactor;
    if (conoInstanciaRef.current) {
      conoInstanciaRef.current.scale.setScalar(escalaFactor);
    }
    if (paletaInstanciaRef.current) {
      paletaInstanciaRef.current.scale.setScalar(escalaFactor);
    }
    if (shadowMeshRef.current) {
      shadowMeshRef.current.scale.setScalar(escalaFactor);
    }
  }, [escalaFactor]);

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
      0.05,
      30.0,
    );
    cameraRef.current = camera;

    // 2. RENDERIZADOR OPTIMIZADO
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
    container.appendChild(renderer.domElement);

    // 3. ILUMINACIÓN
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x555555, 1.5);
    hemiLight.position.set(0, 5, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.3);
    dirLight.position.set(1, 4, 1);
    scene.add(dirLight);

    // 4. RETÍCULA CALIBRADA (Con las dimensiones exactas de la base negra de 37cm)
    const reticleGroup = new THREE.Group();

    // Aro exterior que calca la base
    const ringGeo = new THREE.RingGeometry(
      DIAMETRO_BASE / 2 - 0.02,
      DIAMETRO_BASE / 2,
      32,
    ).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);

    // Cruz central para apuntar a la junta de la baldosa
    const crossGeo = new THREE.PlaneGeometry(0.12, 0.01).rotateX(-Math.PI / 2);
    const crossMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const crossH = new THREE.Mesh(crossGeo, crossMat);
    const crossV = new THREE.Mesh(crossGeo, crossMat);
    crossV.rotation.y = Math.PI / 2;

    reticleGroup.add(ring, crossH, crossV);
    reticleGroup.visible = false;
    reticleGroup.frustumCulled = false;
    scene.add(reticleGroup);
    reticleRef.current = reticleGroup;

    // Sombra de contacto suave
    const canvasShadow = document.createElement("canvas");
    canvasShadow.width = 128;
    canvasShadow.height = 128;
    const ctx = canvasShadow.getContext("2d");
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(0,0,0,0.65)");
    gradient.addColorStop(0.5, "rgba(0,0,0,0.25)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const shadowTex = new THREE.CanvasTexture(canvasShadow);
    const shadowGeo = new THREE.PlaneGeometry(0.65, 0.65);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });
    const fakeShadow = new THREE.Mesh(shadowGeo, shadowMat);
    fakeShadow.rotation.x = -Math.PI / 2;
    fakeShadow.visible = false;
    fakeShadow.frustumCulled = false;
    scene.add(fakeShadow);
    shadowMeshRef.current = fakeShadow;

    // 5. CARGADOR DE MODELOS CON MEDICIÓN VÉRTICE A VÉRTICE
    const loader = new GLTFLoader();

    const prepararModelo = (gltfScene, alturaObjetivo) => {
      gltfScene.updateMatrixWorld(true);

      // Medir únicamente mallas reales ignorando luces/cámaras residuales de Blender
      const bbox = new THREE.Box3();
      gltfScene.traverse((child) => {
        if (child.isMesh && child.geometry) {
          child.geometry.computeBoundingBox();
          const b = child.geometry.boundingBox.clone();
          b.applyMatrix4(child.matrixWorld);
          bbox.union(b);
        }
      });

      const currentH = bbox.max.y - bbox.min.y;
      const factor = alturaObjetivo / (currentH || 1);

      gltfScene.scale.setScalar(factor);
      gltfScene.updateMatrixWorld(true);

      const bboxFinal = new THREE.Box3().setFromObject(gltfScene);
      gltfScene.position.x = -(bboxFinal.min.x + bboxFinal.max.x) / 2;
      gltfScene.position.z = -(bboxFinal.min.z + bboxFinal.max.z) / 2;
      gltfScene.position.y = -bboxFinal.min.y;

      gltfScene.traverse((child) => {
        child.frustumCulled = false;
        if (child.isMesh && child.material) {
          child.material.depthWrite = true;
          child.material.depthTest = true;
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
        modeloConoRef.current = prepararModelo(gltf.scene, ALTURA_CONO);
      },
      undefined,
      () => {
        // Fallback procedural con medidas reales
        const g = new THREE.Group();
        g.frustumCulled = false;
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(0.37, 0.06, 0.37),
          new THREE.MeshLambertMaterial({ color: 0x111111 }),
        );
        base.position.y = 0.03;
        base.frustumCulled = false;
        const cono = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.14, 0.64, 24),
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
          new THREE.CylinderGeometry(0.15, 0.15, 0.02, 24).rotateX(Math.PI / 2),
          new THREE.MeshLambertMaterial({ color: 0xffcc00 }),
        );
        circ.position.y = 0.45;
        circ.frustumCulled = false;
        const poste = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.035, 0.35, 16),
          new THREE.MeshLambertMaterial({ color: 0xffcc00 }),
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

    // 7. BUCLE CONTINUO DE ESCANEO
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
              reticleGroup.visible = true;
              _mPose.fromArray(pose.transform.matrix);
              reticleGroup.position.setFromMatrixPosition(_mPose);
              reticleGroup.quaternion.setFromRotationMatrix(_mPose);
              setReticulaVisible(true);
            }
          } else {
            reticleGroup.visible = false;
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
      cambiarFase("BUSCANDO", "APUNTE A LAS JUNTAS DE LAS BALDOSAS");
      ring.material.color.setHex(0x10b981);
      crossH.material.color.setHex(0x10b981);
      crossV.material.color.setHex(0x10b981);
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
  // ANCLAJE PERMANENTE
  // ==========================================
  const fijarObjetivo = () => {
    if (!reticleRef.current || !reticleRef.current.visible) return;

    reticleRef.current.children.forEach((c) => {
      if (c.material) c.material.color.setHex(0xff5a00); // Se congela en naranja
    });

    cambiarFase("FIJADO", "POSICIÓN DEL PISO BLOQUEADA");
  };

  const colocarCono = () => {
    if (!sceneRef.current || !modeloConoRef.current || !reticleRef.current)
      return;

    const cono = modeloConoRef.current.clone(true);
    cono.traverse((c) => (c.frustumCulled = false));

    // Posición exacta calculada por el sensor del piso
    cono.position.copy(reticleRef.current.position);

    // Orientación perpendicular vertical mirando al usuario
    if (cameraRef.current) {
      const angle = Math.atan2(
        cameraRef.current.position.x - cono.position.x,
        cameraRef.current.position.z - cono.position.z,
      );
      cono.rotation.set(0, angle, 0);
    }

    cono.scale.setScalar(escalaRef.current);
    sceneRef.current.add(cono);
    conoInstanciaRef.current = cono;

    // Sombra de piso
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
    cambiarFase("CONO", "CONO ANCLADO AL PISO");
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

      const escalaActual = escalaRef.current;
      paleta.scale.setScalar(escalaActual);

      // Desciende desde 40 cm por encima del tope
      paleta.position.copy(conoInstanciaRef.current.position);
      paleta.position.y += (ALTURA_CONO + 0.4) * escalaActual;
      paleta.rotation.copy(conoInstanciaRef.current.rotation);

      sceneRef.current.add(paleta);
      paletaInstanciaRef.current = paleta;

      const targetPos = conoInstanciaRef.current.position.clone();
      targetPos.y += (ALTURA_CONO - HUNDIMIENTO) * escalaActual;

      cambiarFase("ANIMANDO", "ENSAMBLANDO...");

      animacionesRef.current.push({
        obj: paleta,
        targetPos: targetPos,
        onComplete: () => {
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
    if (reticleRef.current) {
      reticleRef.current.children.forEach((c) => {
        if (c.material) c.material.color.setHex(0x10b981);
      });
    }
    cambiarFase("BUSCANDO", "APUNTE A LAS JUNTAS DE LAS BALDOSAS");
  };

  const reiniciarTodo = () => {
    if (conoInstanciaRef.current)
      sceneRef.current.remove(conoInstanciaRef.current);
    if (paletaInstanciaRef.current)
      sceneRef.current.remove(paletaInstanciaRef.current);
    if (shadowMeshRef.current) shadowMeshRef.current.visible = false;

    conoInstanciaRef.current = null;
    paletaInstanciaRef.current = null;

    if (reticleRef.current) {
      reticleRef.current.children.forEach((c) => {
        if (c.material) c.material.color.setHex(0x10b981);
      });
    }
    cambiarFase("BUSCANDO", "APUNTE A LAS JUNTAS DE LAS BALDOSAS");
  };

  return (
    <div className="flex-1 relative bg-zinc-950 font-sans text-zinc-200 overflow-hidden flex flex-col">
      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none z-50 flex flex-col justify-between p-4"
      >
        {/* Cabecera superior con estado y altura en tiempo real */}
        <div className="flex flex-col items-center gap-1.5 pt-2">
          <div className="inline-flex items-center gap-2 bg-black/85 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full text-[11px] font-bold tracking-widest text-white shadow-lg">
            <ScanFace size={15} className="text-[#FF5A00]" />
            {mensajeEstado}
          </div>

          {enModoAR && (
            <div className="bg-black/70 backdrop-blur-md border border-white/10 px-3 py-1 rounded-full text-[10px] font-mono text-zinc-300">
              Altura calculada:{" "}
              <strong className="text-emerald-400">
                {(1.15 * escalaFactor).toFixed(2)}m
              </strong>{" "}
              ({(escalaFactor * 100).toFixed(0)}%)
            </div>
          )}
        </div>

        {/* Panel de calibración rápida de escala en pantalla (Para igualar con el cono real) */}
        {enModoAR && (
          <div className="mx-auto bg-black/80 backdrop-blur-xl border border-zinc-800 p-1.5 px-3 rounded-2xl flex items-center gap-2 pointer-events-auto shadow-2xl">
            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mr-1">
              Calibrar:
            </span>

            <button
              onClick={() =>
                setEscalaFactor((e) =>
                  Math.max(0.1, Number((e * 0.1).toFixed(2))),
                )
              }
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-bold px-2 py-1 rounded-lg"
              title="Dividir tamaño por 10"
            >
              ÷10
            </button>
            <button
              onClick={() =>
                setEscalaFactor((e) => Number((e * 0.9).toFixed(2)))
              }
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-0.5"
            >
              <Minus size={11} /> 10%
            </button>
            <button
              onClick={() => setEscalaFactor(1.0)}
              className="bg-zinc-900 border border-zinc-700 text-amber-400 text-[10px] font-bold px-2 py-1 rounded-lg"
            >
              1:1
            </button>
            <button
              onClick={() =>
                setEscalaFactor((e) => Number((e * 1.1).toFixed(2)))
              }
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-0.5"
            >
              <Plus size={11} /> 10%
            </button>
            <button
              onClick={() =>
                setEscalaFactor((e) => Number((e * 10).toFixed(2)))
              }
              className="bg-zinc-800 hover:bg-zinc-700 text-emerald-400 text-[10px] font-bold px-2 py-1 rounded-lg"
              title="Multiplicar tamaño por 10"
            >
              ×10
            </button>
          </div>
        )}

        {/* Botonera de control AR */}
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
                  <Target size={18} /> FIJAR OBJETIVO EN PISO
                </button>
                {!reticulaVisible && (
                  <span className="text-[9px] text-zinc-300 font-semibold bg-black/70 px-3 py-1.5 rounded-lg text-center backdrop-blur-md border border-zinc-700">
                    Apuntá hacia las juntas oscuras entre baldosas a 45°
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
                  <MapPin size={20} /> CLAVAR CONO EN ESTA BALDOSA
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

      {/* Pantalla web previa */}
      <div className="absolute inset-0 bg-[#050507] z-40 flex flex-col items-center justify-center p-6 text-center pointer-events-auto">
        <div className="w-20 h-20 bg-[#FF5A00]/10 rounded-full flex items-center justify-center border border-[#FF5A00]/30 mb-6">
          <Smartphone size={36} className="text-[#FF5A00]" />
        </div>
        <h1 className="text-3xl font-extrabold italic text-white uppercase tracking-tighter mb-2">
          REALIDAD AUMENTADA
        </h1>
        <p className="text-zinc-400 text-sm max-w-md mb-8">
          Alineación de piso real con escala calibrable en vivo frente al
          producto físico.
        </p>
      </div>

      <div
        ref={mountRef}
        className="absolute inset-0 z-10 pointer-events-auto"
      />
    </div>
  );
}
