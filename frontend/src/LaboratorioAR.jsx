import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";
import { ScanFace, Smartphone, Info, AlertTriangle, Bug } from "lucide-react";

export default function LaboratorioAR() {
  const mountRef = useRef(null);
  const overlayRef = useRef(null);

  const [arSupported, setArSupported] = useState(true);
  const [estadoAR, setEstadoAR] = useState("ESPERANDO");

  // CONSOLA EN PANTALLA PARA EL CELULAR
  const [logsMobiles, setLogsMobiles] = useState([]);
  const addLog = (msg, isError = false) => {
    setLogsMobiles((prev) => [...prev.slice(-4), { msg, isError }]);
  };

  useEffect(() => {
    // 1. Interceptar errores globales para que aparezcan en la pantalla del celular
    const handleGlobalError = (event) => {
      addLog(`${event.message} at ${event.filename}:${event.lineno}`, true);
    };
    window.addEventListener("error", handleGlobalError);

    try {
      if ("xr" in navigator) {
        navigator.xr
          .isSessionSupported("immersive-ar")
          .then((supported) => {
            setArSupported(supported);
            if (!supported)
              addLog("Tu navegador no soporta immersive-ar.", true);
          })
          .catch((err) =>
            addLog("Error consultando WebXR: " + err.message, true),
          );
      } else {
        setArSupported(false);
        addLog("El objeto navigator.xr no existe en este navegador.", true);
      }

      const container = mountRef.current;
      if (!container) throw new Error("Contenedor 3D no montado.");

      const scene = new THREE.Scene();

      const camera = new THREE.PerspectiveCamera(
        70,
        window.innerWidth / window.innerHeight,
        0.01,
        20,
      );

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
      });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.xr.enabled = true;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);

      const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
      light.position.set(0.5, 1, 0.25);
      scene.add(light);

      const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
      dirLight.position.set(2, 5, 2);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      scene.add(dirLight);

      // CREACIÓN DEL BOTÓN AR BLINDADA
      // Lo adjuntamos directamente al document.body para evitar conflictos de z-index
      let arButton;
      try {
        arButton = ARButton.createButton(renderer, {
          requiredFeatures: ["hit-test"],
          // Hacemos el dom-overlay opcional por si el navegador lo rechaza
          optionalFeatures: ["dom-overlay"],
          domOverlay: overlayRef.current
            ? { root: overlayRef.current }
            : undefined,
        });

        arButton.style.bottom = "40px";
        arButton.style.padding = "16px 32px";
        arButton.style.fontWeight = "bold";
        arButton.style.borderRadius = "12px";
        arButton.style.backgroundColor = "#FF5A00";
        arButton.style.color = "#000";
        arButton.style.border = "none";
        arButton.style.boxShadow = "0 10px 25px rgba(255, 90, 0, 0.4)";
        arButton.style.zIndex = "99999"; // Fuerte por encima de todo

        document.body.appendChild(arButton);
        addLog("Motor 3D y WebXR iniciados con éxito.");
      } catch (err) {
        addLog("Fallo al crear ARButton: " + err.message, true);
      }

      const reticleGeo = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(
        -Math.PI / 2,
      );
      const reticleMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
      const reticle = new THREE.Mesh(reticleGeo, reticleMat);
      reticle.matrixAutoUpdate = false;
      reticle.visible = false;
      scene.add(reticle);

      const shadowMat = new THREE.ShadowMaterial({ opacity: 0.5 });
      const shadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(3, 3),
        shadowMat,
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
        grupo.scale.setScalar(0.85);
        return grupo;
      };

      const controller = renderer.xr.getController(0);
      controller.addEventListener("select", () => {
        if (!reticle.visible) return;

        if (etapa === 0) {
          if (!conoInstancia) conoInstancia = crearCono();
          conoInstancia.position.setFromMatrixPosition(reticle.matrix);
          scene.add(conoInstancia);

          shadowPlane.position.copy(conoInstancia.position);
          shadowPlane.visible = true;

          etapa = 1;
          setEstadoAR("TOQUE PARA ENSAMBLAR PALETA");
          reticle.visible = false;
        } else if (etapa === 1) {
          if (!paletaInstancia) paletaInstancia = crearPaleta();

          paletaInstancia.position.set(
            conoInstancia.position.x,
            conoInstancia.position.y + 1.2,
            conoInstancia.position.z,
          );
          scene.add(paletaInstancia);

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
          scene.remove(conoInstancia);
          scene.remove(paletaInstancia);
          shadowPlane.visible = false;
          etapa = 0;
          setEstadoAR("BUSQUE EL PISO CON LA CÁMARA");
        }
      });
      scene.add(controller);

      renderer.setAnimationLoop((timestamp, frame) => {
        if (frame) {
          const referenceSpace = renderer.xr.getReferenceSpace();
          const session = renderer.xr.getSession();

          if (!hitTestSourceRequested) {
            session.requestReferenceSpace("viewer").then((refSpace) => {
              session
                .requestHitTestSource({ space: refSpace })
                .then((source) => {
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
    } catch (e) {
      addLog("Cuelgue Crítico: " + e.message, true);
    }
  }, []);

  return (
    <div className="flex-1 relative bg-zinc-950 font-sans text-zinc-200 overflow-hidden flex flex-col">
      {/* CAPA OVERLAY EN REALIDAD AUMENTADA */}
      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none z-50 flex flex-col justify-between"
      >
        <div className="p-6 text-center">
          <div className="inline-flex items-center gap-2 bg-black/50 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full text-xs font-bold tracking-widest text-white shadow-xl">
            <ScanFace size={16} className="text-[#FF5A00]" />
            {estadoAR}
          </div>
        </div>
      </div>

      {/* PANTALLA INICIAL (INTERFAZ WEB) */}
      <div className="absolute inset-0 bg-[#050507] z-40 flex flex-col items-center justify-center p-6 text-center pointer-events-auto">
        <div className="w-20 h-20 bg-[#FF5A00]/10 rounded-full flex items-center justify-center border border-[#FF5A00]/30 mb-6 shadow-[0_0_40px_rgba(255,90,0,0.2)]">
          <Smartphone size={36} className="text-[#FF5A00]" />
        </div>

        <h1 className="text-3xl font-extrabold italic text-white uppercase tracking-tighter mb-2">
          REALIDAD AUMENTADA
        </h1>
        <p className="text-zinc-400 text-sm max-w-md mb-6">
          Proyectá los modelos Conoflex a escala real en tu entorno físico para
          comprobar su impacto visual.
        </p>

        {/* CONSOLA DE ERRORES FLOTANTE (Solo visible si hay logs) */}
        {logsMobiles.length > 0 && (
          <div className="w-full max-w-md bg-black border border-yellow-500/50 rounded-xl p-3 mb-6 text-left shadow-2xl">
            <h3 className="text-[10px] text-yellow-500 font-bold uppercase tracking-widest border-b border-zinc-800 pb-2 mb-2 flex items-center gap-2">
              <Bug size={14} /> Consola de Debugging (Móvil)
            </h3>
            <div className="space-y-1">
              {logsMobiles.map((log, i) => (
                <p
                  key={i}
                  className={`text-[10px] font-mono leading-tight ${log.isError ? "text-red-400 font-bold" : "text-emerald-400"}`}
                >
                  &gt; {log.msg}
                </p>
              ))}
            </div>
          </div>
        )}

        {!arSupported && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-xs max-w-md flex items-start gap-3 text-left mb-6">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <p>
              <strong>Dispositivo no compatible.</strong> Para ver esto en AR
              necesitás un celular Android con Google Chrome o un dispositivo
              compatible con WebXR.
            </p>
          </div>
        )}

        <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl text-xs text-zinc-400 flex flex-col gap-2 text-left max-w-md w-full">
          <div className="flex items-center gap-2 font-bold text-zinc-300">
            <Info size={14} className="text-[#38bdf8]" /> INSTRUCCIONES:
          </div>
          <p>1. Tocá el botón "ENTER AR" que aparecerá abajo.</p>
          <p>2. Apuntá con tu cámara al piso y mové el celular despacio.</p>
          <p>3. Tocá la pantalla para colocar el cono.</p>
          <p>4. Volvé a tocar para ensamblar la paleta.</p>
        </div>
      </div>

      {/* Contenedor del Canvas 3D. Le pusimos pointer-events-auto y z-index 10 por si las moscas */}
      <div
        ref={mountRef}
        className="absolute inset-0 z-10 pointer-events-auto"
      />
    </div>
  );
}
