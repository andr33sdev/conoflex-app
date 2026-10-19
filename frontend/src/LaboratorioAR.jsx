import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ScanFace, Smartphone, Info, AlertTriangle } from "lucide-react";

export default function LaboratorioAR() {
  const mountRef = useRef(null);
  const overlayRef = useRef(null);
  const [arSupported, setArSupported] = useState(true);
  const [estadoAR, setEstadoAR] = useState("ESPERANDO");

  useEffect(() => {
    // Verificar soporte de WebXR
    if ("xr" in navigator) {
      navigator.xr.isSessionSupported("immersive-ar").then((supported) => {
        setArSupported(supported);
      });
    } else {
      setArSupported(false);
    }

    const container = mountRef.current;
    if (!container) return;

    // 1. ESCENA BASE
    const scene = new THREE.Scene();

    // 2. CÁMARA
    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      20,
    );

    // 3. RENDERIZADOR (Alpha true es vital para ver la cámara del celular)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true; // HABILITAMOS WEBXR
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 4. LUCES PARA REALIDAD AUMENTADA
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(2, 5, 2);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // 5. BOTÓN NATIVO DE AR (Con Hit-Test)
    const arButton = ARButton.createButton(renderer, {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: overlayRef.current },
    });
    // Estilizamos el botón por defecto de Three.js
    arButton.style.bottom = "40px";
    arButton.style.padding = "16px 32px";
    arButton.style.fontWeight = "bold";
    arButton.style.borderRadius = "12px";
    arButton.style.backgroundColor = "#FF5A00";
    arButton.style.color = "#000";
    arButton.style.border = "none";
    arButton.style.boxShadow = "0 10px 25px rgba(255, 90, 0, 0.4)";
    container.appendChild(arButton);

    // 6. LA MIRA (Retícula para encontrar el piso real)
    const reticleGeo = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(
      -Math.PI / 2,
    );
    const reticleMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const reticle = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // Material de sombra invisible (Atrapa la sombra y la proyecta en el mundo real)
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.5 });
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      shadowMat,
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.receiveShadow = true;
    shadowPlane.visible = false; // Se hace visible al poner el cono
    scene.add(shadowPlane);

    // 7. VARIABLES DE ESTADO Y MODELOS
    let hitTestSource = null;
    let hitTestSourceRequested = false;

    let conoInstancia = null;
    let paletaInstancia = null;
    let animaciones = [];
    let etapa = 0; // 0 = Buscando piso, 1 = Cono puesto, 2 = Paleta puesta

    // GENERADOR DE MODELOS (Fallback Procedural a Escala 1:1 en metros)
    const crearCono = () => {
      const grupo = new THREE.Group();
      const matNaranja = new THREE.MeshStandardMaterial({
        color: 0xff6600,
        roughness: 0.3,
      });
      const matNegro = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.8,
      });
      const matBlanco = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.1,
      });

      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.05, 0.35),
        matNegro,
      );
      base.position.y = 0.025;
      base.castShadow = true;

      const cono = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.12, 0.7, 32),
        matNaranja,
      );
      cono.position.y = 0.4;
      cono.castShadow = true;

      const banda = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.08, 0.1, 32),
        matBlanco,
      );
      banda.position.y = 0.45;

      grupo.add(base, cono, banda);
      return grupo;
    };

    const crearPaleta = () => {
      const grupo = new THREE.Group();
      const matCartel = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        roughness: 0.4,
      });
      const matPoste = new THREE.MeshStandardMaterial({
        color: 0x0055ff,
        roughness: 0.3,
      });

      const circulo = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 0.02, 32),
        matCartel,
      );
      circulo.rotation.x = Math.PI / 2;
      circulo.position.y = 0.25;
      circulo.castShadow = true;

      const poste = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.04, 0.3, 16),
        matPoste,
      );
      poste.position.y = 0;
      poste.castShadow = true;

      grupo.add(circulo, poste);
      grupo.scale.setScalar(0.85); // Escala como en la versión web
      return grupo;
    };

    // 8. CONTROLADOR DE EVENTOS AR (Toques en la pantalla)
    const controller = renderer.xr.getController(0);
    controller.addEventListener("select", () => {
      if (!reticle.visible) return;

      if (etapa === 0) {
        // TAP 1: Colocar el Cono en el piso real
        if (!conoInstancia) conoInstancia = crearCono();

        conoInstancia.position.setFromMatrixPosition(reticle.matrix);
        scene.add(conoInstancia);

        // Colocamos el plano de sombras debajo del cono
        shadowPlane.position.copy(conoInstancia.position);
        shadowPlane.visible = true;

        etapa = 1;
        setEstadoAR("TOQUE PARA ENSAMBLAR PALETA");
        reticle.visible = false; // Ocultamos la mira
      } else if (etapa === 1) {
        // TAP 2: Dejar caer la paleta
        if (!paletaInstancia) paletaInstancia = crearPaleta();

        // Nace en el cielo (1.2m arriba del cono)
        paletaInstancia.position.set(
          conoInstancia.position.x,
          conoInstancia.position.y + 1.2,
          conoInstancia.position.z,
        );
        scene.add(paletaInstancia);

        // Destino de encastre (altura tope del cono = 0.7m. Restamos 0.18m para hundir la paleta)
        const targetY = conoInstancia.position.y + 0.7 - 0.18;

        setEstadoAR("ENSAMBLANDO...");

        animaciones.push({
          obj: paletaInstancia,
          targetPos: new THREE.Vector3(
            conoInstancia.position.x,
            targetY,
            conoInstancia.position.z,
          ),
          onComplete: () => {
            setEstadoAR("¡ENSAMBLE PERFECTO! (TOQUE PARA REINICIAR)");
            etapa = 2;
          },
        });
      } else if (etapa === 2) {
        // TAP 3: Reiniciar escena
        scene.remove(conoInstancia);
        scene.remove(paletaInstancia);
        shadowPlane.visible = false;
        etapa = 0;
        setEstadoAR("BUSQUE EL PISO CON LA CÁMARA");
      }
    });
    scene.add(controller);

    // 9. BUCLE DE RENDER AR (Acá se calcula el piso y las animaciones)
    renderer.setAnimationLoop((timestamp, frame) => {
      if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        if (!hitTestSourceRequested) {
          session.requestReferenceSpace("viewer").then((refSpace) => {
            session.requestHitTestSource({ space: refSpace }).then((source) => {
              hitTestSource = source;
            });
          });
          hitTestSourceRequested = true;
          setEstadoAR("BUSQUE EL PISO CON LA CÁMARA");
        }

        if (hitTestSource && etapa === 0) {
          const hitTestResults = frame.getHitTestResults(hitTestSource);
          if (hitTestResults.length > 0) {
            const hit = hitTestResults[0];
            reticle.visible = true;
            reticle.matrix.fromArray(
              hit.getPose(referenceSpace).transform.matrix,
            );
            setEstadoAR("TOQUE PARA COLOCAR EL CONO");
          } else {
            reticle.visible = false;
            setEstadoAR("BUSQUE EL PISO CON LA CÁMARA");
          }
        }
      }

      // Procesar animaciones (Caída de la paleta)
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
      window.removeEventListener("resize", handleResize);
      renderer.setAnimationLoop(null);
      if (container.contains(renderer.domElement))
        container.removeChild(renderer.domElement);
      if (container.contains(arButton)) container.removeChild(arButton);
    };
  }, []);

  return (
    <div className="flex-1 relative bg-zinc-950 font-sans text-zinc-200 overflow-hidden flex flex-col">
      {/* CAPA DOM SUPERPUESTA PARA AR */}
      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none z-50 flex flex-col justify-between"
      >
        {/* HEADER DE ESTADO EN AR */}
        <div className="p-6 text-center">
          <div className="inline-flex items-center gap-2 bg-black/50 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full text-xs font-bold tracking-widest text-white shadow-xl">
            <ScanFace size={16} className="text-[#FF5A00]" />
            {estadoAR}
          </div>
        </div>
      </div>

      {/* PANTALLA INICIAL (ANTES DE ENTRAR A AR) */}
      <div className="absolute inset-0 bg-[#050507] z-40 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-[#FF5A00]/10 rounded-full flex items-center justify-center border border-[#FF5A00]/30 mb-6 shadow-[0_0_40px_rgba(255,90,0,0.2)]">
          <Smartphone size={36} className="text-[#FF5A00]" />
        </div>

        <h1 className="text-3xl font-extrabold italic text-white uppercase tracking-tighter mb-2">
          REALIDAD AUMENTADA
        </h1>
        <p className="text-zinc-400 text-sm max-w-md mb-8">
          Proyectá los modelos Conoflex a escala real en tu entorno físico para
          comprobar su impacto visual y tamaño.
        </p>

        {!arSupported && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs max-w-md flex items-start gap-3 text-left">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <p>
              <strong>Dispositivo no compatible.</strong> Para ver esto en AR
              necesitás un celular Android con Google Chrome o un iPhone (iOS
              17+) compatible con WebXR.
            </p>
          </div>
        )}

        <div className="mt-8 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl text-xs text-zinc-400 flex flex-col gap-2 text-left max-w-md w-full">
          <div className="flex items-center gap-2 font-bold text-zinc-300">
            <Info size={14} className="text-[#38bdf8]" /> INSTRUCCIONES:
          </div>
          <p>1. Tocá el botón "ENTER AR" que aparecerá abajo.</p>
          <p>2. Apuntá con tu cámara al piso y mové el celular despacio.</p>
          <p>3. Tocá la pantalla para colocar el cono.</p>
          <p>4. Volvé a tocar para ensamblar la paleta.</p>
        </div>

        {/* Contenedor invisible donde Three.js inyectará el botón nativo de "ENTER AR" */}
        <div ref={mountRef} className="absolute inset-0 pointer-events-none" />
      </div>
    </div>
  );
}
