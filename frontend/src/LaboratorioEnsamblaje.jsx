import React, { useState, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  Wrench,
  Image as ImageIcon,
  Trash2,
  Layers,
  Box,
  CheckCircle2,
  Unlink,
  RotateCw,
  Tag,
  Sparkles,
} from "lucide-react";

// Precios base configurables
const PRECIO_CONO = 24500;
const PRECIO_PALETA = 15300;
const PRECIO_GRAFICA = 7400;

const CATALOGO = [
  {
    id: "CONO_ESTANDAR",
    nombre: "Cono Semiflexible 70cm",
    tipo: "BASE",
    precio: PRECIO_CONO,
    color: 0x0055ff,
    url: "/models/cono.glb",
  },
  {
    id: "PALETA_CIRCULAR",
    nombre: "Paleta Cartel Vial",
    tipo: "ACCESORIO",
    precio: PRECIO_PALETA,
    color: 0xff0000,
    url: "/models/paleta.glb",
  },
];

export default function LaboratorioEnsamblaje() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const objectsRef = useRef([]);
  const animacionesRef = useRef([]);
  const pulseRef = useRef(null);

  const [itemsEnMesa, setItemsEnMesa] = useState([]);
  const [selectedMesh, setSelectedMesh] = useState(null);
  const [ensambladoStatus, setEnsambladoStatus] = useState("ESPERANDO PIEZAS");
  const [tieneGrafica, setTieneGrafica] = useState(false);

  // Estados de precio con conteo animado
  const [precioTotal, setPrecioTotal] = useState(0);
  const [precioAnimado, setPrecioAnimado] = useState(0);
  const [precioPulso, setPrecioPulso] = useState(false);

  // Verificación de qué elementos están presentes
  const tieneCono = useMemo(
    () => itemsEnMesa.some((i) => i.tipo === "BASE"),
    [itemsEnMesa],
  );
  const tienePaleta = useMemo(
    () => itemsEnMesa.some((i) => i.tipo === "ACCESORIO"),
    [itemsEnMesa],
  );

  // Cálculo del precio total según configuración activa
  useEffect(() => {
    let total = 0;
    if (tieneCono) total += PRECIO_CONO;
    if (tienePaleta) total += PRECIO_PALETA;
    if (tieneGrafica) total += PRECIO_GRAFICA;

    setPrecioTotal(total);
    setPrecioPulso(true);
    const timer = setTimeout(() => setPrecioPulso(false), 500);
    return () => clearTimeout(timer);
  }, [tieneCono, tienePaleta, tieneGrafica]);

  // Animación suave del contador numérico (odómetro)
  useEffect(() => {
    let start = precioAnimado;
    let end = precioTotal;
    if (start === end) return;

    let startTime = performance.now();
    let duration = 650; // ms
    let animFrame;

    const tick = (now) => {
      let progress = Math.min((now - startTime) / duration, 1);
      // Easing out quart
      let ease = 1 - Math.pow(1 - progress, 4);
      setPrecioAnimado(Math.round(start + (end - start) * ease));
      if (progress < 1) {
        animFrame = requestAnimationFrame(tick);
      }
    };

    animFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrame);
  }, [precioTotal]);

  // ==========================================
  // INICIALIZACIÓN DEL ENTORNO 3D
  // ==========================================
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050507);
    sceneRef.current = scene;

    // 1. CÁMARA AJUSTADA (Encuadre total del ensamble)
    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 1.4, 4.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Iluminación de estudio
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.3);
    scene.add(ambientLight);

    const spotLight = new THREE.SpotLight(0xffffff, 4.5);
    spotLight.position.set(0, 6, 2.5);
    spotLight.angle = Math.PI / 5;
    spotLight.penumbra = 0.5;
    spotLight.castShadow = true;
    scene.add(spotLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 2.0);
    rimLight.position.set(-3, 2, -3);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xff5a00, 1.5);
    fillLight.position.set(3, 1, 3);
    scene.add(fillLight);

    // Suelo tecnológico
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0c,
      roughness: 0.15,
      metalness: 0.5,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(10, 20, 0x38bdf8, 0x111111);
    grid.position.y = 0.001;
    grid.material.opacity = 0.18;
    grid.material.transparent = true;
    scene.add(grid);

    // Onda expansiva de ensamble
    const pulseGeo = new THREE.RingGeometry(0.3, 0.35, 32);
    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const pulse = new THREE.Mesh(pulseGeo, pulseMat);
    pulse.rotation.x = -Math.PI / 2;
    pulse.position.y = 0.01;
    scene.add(pulse);
    pulseRef.current = pulse;

    // OrbitControls con centro elevado a la mitad del ensamble (y = 0.75m)
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 0.75, 0);
    orbit.enablePan = false;
    orbit.minDistance = 1.0;
    orbit.maxDistance = 12.0; // Zoom amplio sin trabas
    orbit.maxPolarAngle = Math.PI / 2 - 0.05;
    orbit.update();

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (event) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(objectsRef.current, true);

      if (intersects.length > 0) {
        let object = intersects[0].object;
        while (object.parent && object.userData.tipo === undefined) {
          if (object.parent.type === "Scene") break;
          object = object.parent;
        }

        if (object.userData && object.userData.id) {
          setSelectedMesh(object);
        }
      } else {
        setSelectedMesh(null);
      }
    };
    container.addEventListener("pointerdown", onPointerDown);

    // ==========================================
    // BUCLE DE RENDER Y ANIMACIÓN (1.8s + Vibración)
    // ==========================================
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      const now = performance.now();

      // Secuenciador cinemático de acoplamiento
      for (let i = animacionesRef.current.length - 1; i >= 0; i--) {
        const anim = animacionesRef.current[i];
        const elapsed = now - anim.startTime;
        const progress = Math.min(elapsed / anim.duration, 1);

        if (progress < 0.72) {
          // Fase 1: Descenso gravitatorio suave (1.3 seg)
          const t = progress / 0.72;
          const ease =
            t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          anim.obj.position.y =
            anim.startY + (anim.targetY - anim.startY) * ease;
          // Leve oscilación de levitación
          anim.obj.position.x = Math.sin(now * 0.015) * 0.003 * (1 - ease);
          anim.obj.position.z = Math.cos(now * 0.015) * 0.003 * (1 - ease);
        } else if (progress < 0.96) {
          // Fase 2: Calce mecánico y micro-vibración de bloqueo (450 ms)
          const vibeProgress = (progress - 0.72) / 0.24;
          const decay = Math.exp(-vibeProgress * 4.5);

          // Temblores milimétricos hácticos
          anim.obj.position.x = Math.sin(now * 0.09) * 0.01 * decay;
          anim.obj.position.z = Math.cos(now * 0.08) * 0.01 * decay;
          anim.obj.position.y =
            anim.targetY + Math.abs(Math.sin(now * 0.06)) * 0.008 * decay;

          if (!anim.pulseFired) {
            anim.pulseFired = true;
            triggerPulse();
          }
        } else {
          // Fase 3: Bloqueo estático final
          anim.obj.position.set(0, anim.targetY, 0);
          anim.onComplete();
          animacionesRef.current.splice(i, 1);
        }
      }

      // Animación de la onda expansiva en el suelo
      if (pulseRef.current && pulseRef.current.material.opacity > 0) {
        pulseRef.current.scale.addScalar(0.09);
        pulseRef.current.material.opacity -= 0.025;
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("pointerdown", onPointerDown);
      cancelAnimationFrame(animId);
      orbit.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement))
        container.removeChild(renderer.domElement);
    };
  }, []);

  const triggerPulse = () => {
    if (pulseRef.current) {
      pulseRef.current.scale.set(1, 1, 1);
      pulseRef.current.material.opacity = 0.9;
      setEnsambladoStatus("ENSAMBLAJE BLOQUEADO [OK]");
      setTimeout(() => setEnsambladoStatus("CONFIGURACIÓN COMPLETA"), 3000);
    }
  };

  // ==========================================
  // CARGADOR Y ENSAMBLAJE
  // ==========================================
  const handleSpawnItem = (itemConfig) => {
    if (!sceneRef.current) return;

    const id = `${itemConfig.id}_${Date.now()}`;
    const loader = new GLTFLoader();

    const procesarModelo = (model) => {
      model.userData = { id, tipo: itemConfig.tipo, nombre: itemConfig.nombre };
      model.name = id;

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      if (itemConfig.tipo === "BASE") {
        // Cono apoyado al piso estrictamente
        model.position.set(0, 0, 0);
        model.updateMatrixWorld(true);
        const bbox = new THREE.Box3().setFromObject(model);
        model.position.y = -bbox.min.y;

        sceneRef.current.add(model);
        objectsRef.current.push(model);
        setSelectedMesh(model);
        setItemsEnMesa((prev) => [...prev, model.userData]);
        setEnsambladoStatus("CONO BASE LISTO");
      } else if (itemConfig.tipo === "ACCESORIO") {
        // Paleta proporcionada (escala 0.78)
        model.scale.setScalar(0.78);

        const conos = objectsRef.current.filter(
          (m) => m.userData.tipo === "BASE",
        );

        if (conos.length > 0) {
          const conoObjetivo = conos[conos.length - 1];
          conoObjetivo.updateMatrixWorld(true);
          const conoBox = new THREE.Box3().setFromObject(conoObjetivo);

          model.position.set(0, 0, 0);
          model.updateMatrixWorld(true);
          const paletaBox = new THREE.Box3().setFromObject(model);
          const paletaBottomOffset = paletaBox.min.y;

          // Nace en el aire para la animación
          const startY = conoBox.max.y + 1.2;
          model.position.set(0, startY, 0);
          sceneRef.current.add(model);

          setEnsambladoStatus("ACOPLANDO CON PRECISIÓN...");

          // Profundidad de encastre (-0.36m para entrar hasta la mitad del orificio)
          const targetY = conoBox.max.y - paletaBottomOffset - 0.36;

          animacionesRef.current.push({
            obj: model,
            targetObj: conoObjetivo,
            startY: startY,
            targetY: targetY,
            startTime: performance.now(),
            duration: 1800, // 1.8 segundos de animación cinematográfica
            pulseFired: false,
            onComplete: () => {
              conoObjetivo.add(model);
              model.position.set(0, targetY - conoObjetivo.position.y, 0);
              objectsRef.current.push(model);
              setSelectedMesh(model);
              setItemsEnMesa((prev) => [...prev, model.userData]);
            },
          });
        } else {
          model.position.set(0, 0, 0);
          model.updateMatrixWorld(true);
          const bbox = new THREE.Box3().setFromObject(model);
          model.position.y = -bbox.min.y;

          sceneRef.current.add(model);
          objectsRef.current.push(model);
          setSelectedMesh(model);
          setItemsEnMesa((prev) => [...prev, model.userData]);
          setEnsambladoStatus("FALTA CONO BASE");
        }
      }
    };

    loader.load(
      itemConfig.url,
      (gltf) => {
        procesarModelo(gltf.scene);
      },
      undefined,
      () => {
        // Fallback procedural
        const group = new THREE.Group();
        if (itemConfig.tipo === "BASE") {
          const matNaranja = new THREE.MeshStandardMaterial({
            color: 0xff6600,
            roughness: 0.3,
          });
          const matNegro = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.8,
          });
          const base = new THREE.Mesh(
            new THREE.BoxGeometry(0.35, 0.05, 0.35),
            matNegro,
          );
          base.position.y = 0.025;
          const cono = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.12, 0.7, 32),
            matNaranja,
          );
          cono.position.y = 0.4;
          group.add(base, cono);
        } else {
          const matCartel = new THREE.MeshStandardMaterial({
            color: 0xffcc00,
            roughness: 0.4,
          });
          const circulo = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.18, 0.02, 32),
            matCartel,
          );
          circulo.rotation.x = Math.PI / 2;
          circulo.position.y = 0.3;
          const poste = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.035, 0.4, 16),
            matCartel,
          );
          poste.position.y = 0;
          group.add(circulo, poste);
        }
        procesarModelo(group);
      },
    );
  };

  // ==========================================
  // ADHERENCIA DE GRÁFICA CON RAYCASTER Y CIRCLEGEOMETRY
  // ==========================================
  const handleImageUpload = (event) => {
    if (!selectedMesh || selectedMesh.userData.tipo !== "ACCESORIO") return;
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(e.target.result, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;

        selectedMesh.updateMatrixWorld(true);
        const bboxWorld = new THREE.Box3().setFromObject(selectedMesh);
        const anchoWorld = bboxWorld.max.x - bboxWorld.min.x;

        // Disparo de rayo óptico directo hacia la cara del plato
        const targetCenterY = bboxWorld.max.y - anchoWorld * 0.53;
        const targetCenterX = (bboxWorld.min.x + bboxWorld.max.x) / 2;

        const rayOrigin = new THREE.Vector3(
          targetCenterX,
          targetCenterY,
          bboxWorld.max.z + 1.0,
        );
        const rayDir = new THREE.Vector3(0, 0, -1);
        const raycaster = new THREE.Raycaster(rayOrigin, rayDir);
        const hits = raycaster.intersectObject(selectedMesh, true);

        let hitPointWorld;
        if (hits.length > 0) {
          hitPointWorld = hits[0].point
            .clone()
            .add(new THREE.Vector3(0, 0, 0.002));
        } else {
          hitPointWorld = new THREE.Vector3(
            targetCenterX,
            targetCenterY,
            bboxWorld.max.z + 0.002,
          );
        }

        // Posicionamiento en el sistema de coordenadas local de la paleta
        const localPos = selectedMesh.worldToLocal(hitPointWorld);
        const radioLocal = (anchoWorld * 0.385) / selectedMesh.scale.x;

        // Limpiar sticker previo si ya existía
        const stickerPrevio = selectedMesh.getObjectByName(
          "StickerPlatoGrafica",
        );
        if (stickerPrevio) selectedMesh.remove(stickerPrevio);

        // Geometría plana en el plano XY (sin rotaciones de 90° forzadas)
        const stickerGeo = new THREE.CircleGeometry(radioLocal, 64);
        const stickerMat = new THREE.MeshStandardMaterial({
          map: texture,
          transparent: true,
          roughness: 0.2,
          metalness: 0.05,
          side: THREE.DoubleSide,
        });

        const stickerMesh = new THREE.Mesh(stickerGeo, stickerMat);
        stickerMesh.name = "StickerPlatoGrafica";
        stickerMesh.position.copy(localPos);

        selectedMesh.add(stickerMesh);
        setTieneGrafica(true);
      });
    };
    reader.readAsDataURL(file);
  };

  // Botón para rotar la imagen 90° si vino horizontal
  const girarGrafica = () => {
    if (!selectedMesh) return;
    const sticker = selectedMesh.getObjectByName("StickerPlatoGrafica");
    if (sticker) {
      sticker.rotation.z -= Math.PI / 2;
    }
  };

  const desensamblar = () => {
    if (
      !selectedMesh ||
      !selectedMesh.parent ||
      selectedMesh.parent.type === "Scene"
    )
      return;
    const worldPos = new THREE.Vector3();
    selectedMesh.getWorldPosition(worldPos);
    sceneRef.current.add(selectedMesh);

    selectedMesh.position.set(worldPos.x + 0.6, worldPos.y, worldPos.z);
    setEnsambladoStatus("PIEZA DESACOPLADA");
  };

  const handleRemoveSelected = () => {
    if (!selectedMesh) return;

    if (selectedMesh.userData.tipo === "BASE") {
      selectedMesh.traverse((child) => {
        if (child.userData && child.userData.id) {
          setItemsEnMesa((prev) =>
            prev.filter((i) => i.id !== child.userData.id),
          );
        }
      });
    } else {
      setItemsEnMesa((prev) =>
        prev.filter((i) => i.id !== selectedMesh.userData.id),
      );
      setTieneGrafica(false);
    }

    if (selectedMesh.parent && selectedMesh.parent.type !== "Scene") {
      selectedMesh.parent.remove(selectedMesh);
    } else {
      sceneRef.current.remove(selectedMesh);
    }

    selectedMesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material))
          child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });

    objectsRef.current = objectsRef.current.filter((m) => m !== selectedMesh);
    setSelectedMesh(null);
    if (objectsRef.current.length === 0)
      setEnsambladoStatus("ESPERANDO PIEZAS");
  };

  const vaciarMesa = () => {
    objectsRef.current.forEach((mesh) => {
      sceneRef.current.remove(mesh);
      mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material))
            child.material.forEach((m) => m.dispose());
          else child.material.dispose();
        }
      });
    });
    objectsRef.current = [];
    setItemsEnMesa([]);
    setSelectedMesh(null);
    setTieneGrafica(false);
    setEnsambladoStatus("MESA LIMPIA");
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full min-h-0 bg-black font-sans text-zinc-200 overflow-hidden">
      {/* PANEL IZQUIERDO: CATÁLOGO */}
      <div className="w-full md:w-72 bg-[#050505] border-r border-zinc-800 flex flex-col shrink-0 z-20">
        <div className="p-5 border-b border-zinc-800 bg-[#080808]">
          <h2 className="text-lg font-extrabold italic text-white uppercase tracking-tighter flex items-center gap-2">
            <Wrench size={18} className="text-[#38bdf8]" /> LABORATORIO 3D
          </h2>
          <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
            Ensamblaje e Inspección Visual
          </p>
        </div>

        <div className="p-5 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">
          <span className="text-[10px] font-black tracking-widest text-[#38bdf8] uppercase block mb-1">
            CATÁLOGO DE MODELOS
          </span>

          <div className="grid gap-3">
            {CATALOGO.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSpawnItem(item)}
                className="bg-[#0A0A0A] hover:bg-[#111] border border-zinc-800 hover:border-[#38bdf8] p-3 rounded-xl flex items-center gap-3 text-left transition-all cursor-pointer group shadow-lg"
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center border border-zinc-800 group-hover:border-[#38bdf8]/50 ${
                    item.tipo === "BASE"
                      ? "bg-blue-500/10 text-blue-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {item.tipo === "BASE" ? (
                    <Layers size={18} />
                  ) : (
                    <Box size={18} />
                  )}
                </div>
                <div>
                  <span className="block text-xs font-bold text-white uppercase tracking-wider">
                    {item.nombre}
                  </span>
                  <span className="text-[9px] text-emerald-400 font-mono font-bold block">
                    ${item.precio.toLocaleString("es-AR")} ARS
                  </span>
                  <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest group-hover:text-[#38bdf8] mt-0.5 block">
                    AÑADIR A LA MESA
                  </span>
                </div>
              </button>
            ))}
          </div>

          <hr className="border-zinc-800 mt-2 mb-1" />

          <button
            onClick={vaciarMesa}
            disabled={itemsEnMesa.length === 0}
            className="w-full bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-400 font-bold uppercase tracking-widest py-3 text-[10px] rounded-xl transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 size={14} /> VACIAR MESA
          </button>
        </div>
      </div>

      {/* LIENZO 3D */}
      <div className="flex-1 relative bg-black flex flex-col overflow-hidden">
        {/* BARRA SUPERIOR DE ESTADO */}
        <div className="absolute top-4 left-4 z-10 bg-[#050505]/95 border border-zinc-800 backdrop-blur-md p-1.5 px-4 rounded-xl shadow-2xl flex items-center gap-3 pointer-events-none">
          <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">
            ESTADO:
          </span>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded">
            <CheckCircle2 size={13} /> {ensambladoStatus}
          </div>
        </div>

        {/* WIDGET DE PRECIO EN VIVO (ODÓMETRO CON EFECTO GAMING) */}
        <div
          className={`absolute top-4 right-4 z-10 bg-[#070709]/95 border transition-all duration-300 backdrop-blur-xl p-4 rounded-2xl shadow-2xl min-w-[260px] pointer-events-none ${
            precioPulso
              ? "border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.35)] scale-105"
              : "border-zinc-800 shadow-2xl scale-100"
          }`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800 mb-2.5">
            <span className="text-[9px] font-black tracking-widest text-zinc-400 uppercase flex items-center gap-1.5">
              <Tag size={12} className="text-emerald-400" /> COTIZADOR EN VIVO
            </span>
            <span className="text-[9px] font-bold text-zinc-500 uppercase">
              ARS + IVA
            </span>
          </div>

          {/* Desglose dinámico */}
          <div className="space-y-1.5 text-xs font-semibold">
            <div className="flex justify-between items-center">
              <span
                className={
                  tieneCono ? "text-zinc-200" : "text-zinc-600 line-through"
                }
              >
                Cono 70cm con base
              </span>
              <span
                className={`font-mono text-[11px] ${
                  tieneCono ? "text-zinc-300 font-bold" : "text-zinc-700"
                }`}
              >
                ${PRECIO_CONO.toLocaleString("es-AR")}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span
                className={
                  tienePaleta ? "text-zinc-200" : "text-zinc-600 line-through"
                }
              >
                Paleta Cartel 2071
              </span>
              <span
                className={`font-mono text-[11px] ${
                  tienePaleta ? "text-zinc-300 font-bold" : "text-zinc-700"
                }`}
              >
                +${PRECIO_PALETA.toLocaleString("es-AR")}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span
                className={
                  tieneGrafica
                    ? "text-emerald-400"
                    : "text-zinc-600 line-through"
                }
              >
                Gráfica reflectiva
              </span>
              <span
                className={`font-mono text-[11px] ${
                  tieneGrafica ? "text-emerald-400 font-bold" : "text-zinc-700"
                }`}
              >
                +${PRECIO_GRAFICA.toLocaleString("es-AR")}
              </span>
            </div>
          </div>

          {/* TOTAL FINAL CON ANIMACIÓN ODÓMETRO */}
          <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-baseline justify-between">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
              TOTAL:
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-emerald-400 font-mono tracking-tight drop-shadow-[0_0_12px_rgba(16,185,129,0.4)]">
                ${precioAnimado.toLocaleString("es-AR")}
              </span>
              <span className="text-[10px] text-zinc-500 font-bold">ARS</span>
            </div>
          </div>
        </div>

        <div ref={mountRef} className="flex-1 w-full h-full" />

        {/* PANEL INFERIOR DE PROPIEDADES */}
        {selectedMesh && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#070707]/95 border border-[#38bdf8]/50 backdrop-blur-md p-3 px-5 rounded-2xl shadow-[0_0_30px_rgba(56,189,248,0.15)] flex flex-col md:flex-row items-center gap-4 z-20 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center gap-2 border-r border-zinc-800 pr-4">
              <span className="text-[10px] font-black text-[#38bdf8] tracking-widest uppercase flex items-center gap-1.5">
                {selectedMesh.userData.tipo === "BASE" ? (
                  <Layers size={14} />
                ) : (
                  <Box size={14} />
                )}
                {selectedMesh.userData.nombre}
              </span>
            </div>

            {selectedMesh.parent && selectedMesh.parent.type !== "Scene" && (
              <button
                onClick={desensamblar}
                className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
              >
                <Unlink size={13} /> DESACOPLAR
              </button>
            )}

            {selectedMesh.userData.tipo === "ACCESORIO" && (
              <div className="flex items-center gap-2 border-r border-zinc-800 pr-4">
                <label className="bg-[#121212] hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 hover:border-emerald-500/50 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer transition shadow-md">
                  <ImageIcon size={14} className="text-emerald-400" />
                  APLICAR GRÁFICA EN PLATO
                  <input
                    type="file"
                    accept="image/png, image/jpeg"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </label>

                {tieneGrafica && (
                  <button
                    onClick={girarGrafica}
                    className="bg-[#121212] hover:bg-zinc-800 text-[#FFD700] border border-zinc-700 hover:border-[#FFD700] px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
                    title="Gira la gráfica 90° si vino horizontal"
                  >
                    <RotateCw size={13} /> GIRAR 90°
                  </button>
                )}
              </div>
            )}

            <button
              onClick={handleRemoveSelected}
              className="px-3 py-2 text-[10px] font-bold tracking-widest uppercase transition-all flex items-center gap-1.5 bg-black text-[#FF0055] border border-zinc-800 hover:bg-[#FF0055]/10 rounded-lg cursor-pointer"
            >
              <Trash2 size={13} /> ELIMINAR PIEZA
            </button>
          </div>
        )}

        {/* INSTRUCCIONES INFERIORES */}
        <div className="absolute bottom-4 left-4 pointer-events-none">
          <span className="bg-black/90 border border-zinc-800 px-4 py-2 text-[9.5px] font-bold text-zinc-400 uppercase tracking-widest rounded-lg flex items-center gap-2 shadow-lg">
            <span className="text-[#38bdf8]">● Rotar cámara:</span> Clic y
            arrastrar |{" "}
            <span className="text-emerald-400">Clic en objeto:</span>{" "}
            Seleccionar / Aplicar gráfica
          </span>
        </div>
      </div>
    </div>
  );
}
