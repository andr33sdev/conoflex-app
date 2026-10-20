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
  ShoppingCart,
  Sparkles,
  Palette,
} from "lucide-react";

// Precios base configurables
const PRECIO_CONO = 24500;
const PRECIO_PALETA = 15300;
const PRECIO_GRAFICA = 7400;

const CATALOGO = [
  {
    id: "CONO_ESTANDAR",
    nombre: "Cono Semiflexible 70cm",
    codigo: "2071LE-2R",
    tipo: "BASE",
    precio: PRECIO_CONO,
    url: "/models/cono.glb",
  },
  {
    id: "PALETA_CIRCULAR",
    nombre: "Paleta Cartel Vial",
    codigo: "PAL-01",
    tipo: "ACCESORIO",
    precio: PRECIO_PALETA,
    url: "/models/paleta.glb",
  },
];

const COLORES_PALETA = [
  { id: "naranja", nombre: "Naranja Conoflex", hex: "#e16c22" },
  { id: "amarillo", nombre: "Amarillo Vial", hex: "#eab308" },
  { id: "rojo", nombre: "Rojo Seguridad", hex: "#dc2626" },
  { id: "azul", nombre: "Azul Vial", hex: "#2563eb" },
  { id: "blanco", nombre: "Blanco Puro", hex: "#f8fafc" },
];

export default function LaboratorioEnsamblaje() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const orbitRef = useRef(null);
  const objectsRef = useRef([]);
  const animacionesRef = useRef([]);

  const [itemsEnMesa, setItemsEnMesa] = useState([]);
  const [selectedMesh, setSelectedMesh] = useState(null);
  const [ensambladoStatus, setEnsambladoStatus] = useState("ESPERANDO PIEZAS");
  const [tieneGrafica, setTieneGrafica] = useState(false);
  const [colorActivoPaleta, setColorActivoPaleta] = useState("#e16c22");

  // Estados de precio con conteo animado
  const [precioTotal, setPrecioTotal] = useState(0);
  const [precioAnimado, setPrecioAnimado] = useState(0);

  // Verificación de elementos presentes
  const tieneCono = useMemo(
    () => itemsEnMesa.some((i) => i.tipo === "BASE"),
    [itemsEnMesa],
  );
  const tienePaleta = useMemo(
    () => itemsEnMesa.some((i) => i.tipo === "ACCESORIO"),
    [itemsEnMesa],
  );

  // Cálculo del precio total
  useEffect(() => {
    let total = 0;
    if (tieneCono) total += PRECIO_CONO;
    if (tienePaleta) total += PRECIO_PALETA;
    if (tieneGrafica) total += PRECIO_GRAFICA;

    setPrecioTotal(total);
  }, [tieneCono, tienePaleta, tieneGrafica]);

  // Odómetro suave
  useEffect(() => {
    let start = precioAnimado;
    let end = precioTotal;
    if (start === end) return;

    let startTime = performance.now();
    let duration = 650;
    let animFrame;

    const tick = (now) => {
      let progress = Math.min((now - startTime) / duration, 1);
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
    scene.background = new THREE.Color("#ffffff");
    scene.fog = new THREE.Fog("#ffffff", 6, 22);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 1.5, 5.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Piso invisible receptor de sombras
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.12 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Cuadrícula arquitectónica sutil
    const grid = new THREE.GridHelper(20, 40, 0x94a3b8, 0xe2e8f0);
    grid.position.y = 0.001;
    grid.material.transparent = true;
    grid.material.opacity = 0.3;
    scene.add(grid);

    // Tarima de apoyo
    const podiumGeo = new THREE.CylinderGeometry(0.45, 0.5, 0.03, 64);
    const podiumMat = new THREE.MeshStandardMaterial({
      color: "#f8fafc",
      roughness: 0.1,
      metalness: 0.05,
    });
    const podium = new THREE.Mesh(podiumGeo, podiumMat);
    podium.position.y = 0.015;
    podium.receiveShadow = true;
    podium.castShadow = true;
    scene.add(podium);

    // Luces
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
    fillLight.position.set(5, 4, 3);
    scene.add(fillLight);

    const mainLight = new THREE.SpotLight(0xffffff, 3.2);
    mainLight.position.set(-3, 7, 5);
    mainLight.angle = Math.PI / 4;
    mainLight.penumbra = 0.6;
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.bias = -0.0002;
    scene.add(mainLight);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 0.45, 0);
    orbit.enablePan = false;
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.05;
    orbit.minDistance = 1.0;
    orbit.maxDistance = 12.0;
    orbit.maxPolarAngle = Math.PI / 2 - 0.01;
    orbit.update();
    orbitRef.current = orbit;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (event) => {
      if (
        event.target.tagName === "BUTTON" ||
        event.target.tagName === "INPUT" ||
        event.target.closest("div.absolute")
      )
        return;

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

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const now = performance.now();

      for (let i = animacionesRef.current.length - 1; i >= 0; i--) {
        const anim = animacionesRef.current[i];
        const elapsed = now - anim.startTime;
        const progress = Math.min(elapsed / anim.duration, 1);

        const easeInOutCubic =
          progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        if (anim.tipo === "MESH") {
          if (progress < 1) {
            anim.obj.position.y =
              anim.startY + (anim.targetY - anim.startY) * easeInOutCubic;
          } else {
            anim.obj.position.set(0, anim.targetY, 0);
            if (anim.onComplete) anim.onComplete();
            animacionesRef.current.splice(i, 1);
          }
        } else if (anim.tipo === "CAMERA") {
          if (progress < 1) {
            camera.position.lerpVectors(
              anim.startCamPos,
              anim.targetCamPos,
              easeInOutCubic,
            );
            orbit.target.lerpVectors(
              anim.startTargetPos,
              anim.targetFocusPos,
              easeInOutCubic,
            );
            orbit.update();
          } else {
            camera.position.copy(anim.targetCamPos);
            orbit.target.copy(anim.targetFocusPos);
            orbit.update();
            if (anim.onComplete) anim.onComplete();
            animacionesRef.current.splice(i, 1);
          }
        } else if (anim.tipo === "COLOR") {
          if (progress < 1) {
            anim.material.color.lerpColors(
              anim.startColor,
              anim.targetColor,
              easeInOutCubic,
            );
          } else {
            anim.material.color.copy(anim.targetColor);
            animacionesRef.current.splice(i, 1);
          }
        }
      }

      orbit.update();
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

  const animarCamara = (objetivoZ, objetivoY, focoY) => {
    if (!cameraRef.current || !orbitRef.current) return;

    animacionesRef.current.push({
      tipo: "CAMERA",
      startCamPos: cameraRef.current.position.clone(),
      targetCamPos: new THREE.Vector3(0, objetivoY, objetivoZ),
      startTargetPos: orbitRef.current.target.clone(),
      targetFocusPos: new THREE.Vector3(0, focoY, 0),
      startTime: performance.now(),
      duration: 1200,
    });
  };

  // ==========================================
  // CARGADOR Y ENSAMBLAJE
  // ==========================================
  const handleSpawnItem = (itemConfig) => {
    if (!sceneRef.current) return;

    if (itemConfig.tipo === "BASE" && tieneCono) return;
    if (itemConfig.tipo === "ACCESORIO" && tienePaleta) return;

    const id = `${itemConfig.id}_${Date.now()}`;
    const loader = new GLTFLoader();

    const procesarModelo = (model) => {
      model.userData = { id, tipo: itemConfig.tipo, nombre: itemConfig.nombre };
      model.name = id;

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          if (
            itemConfig.tipo === "ACCESORIO" &&
            child.name !== "ViniloGrafica" &&
            child.material
          ) {
            child.material = child.material.clone();
            child.material.map = null;
            child.material.color.set("#e16c22");
            child.material._esClonado = true;
            child.material.needsUpdate = true;
          }
        }
      });

      if (itemConfig.tipo === "BASE") {
        model.position.set(0, 0, 0);
        model.updateMatrixWorld(true);
        const bbox = new THREE.Box3().setFromObject(model);
        model.position.y = -bbox.min.y + 0.03;

        sceneRef.current.add(model);
        objectsRef.current.push(model);
        setSelectedMesh(model);
        setItemsEnMesa((prev) => [...prev, model.userData]);
        setEnsambladoStatus("CONO BASE LISTO");

        if (!tienePaleta) animarCamara(5.5, 1.4, 0.45);
      } else if (itemConfig.tipo === "ACCESORIO") {
        model.scale.setScalar(0.78);
        setColorActivoPaleta("#e16c22");

        const conos = objectsRef.current.filter(
          (m) => m.userData.tipo === "BASE",
        );

        if (conos.length > 0) {
          const conoObjetivo = conos[0];
          conoObjetivo.updateMatrixWorld(true);
          const conoBox = new THREE.Box3().setFromObject(conoObjetivo);

          model.position.set(0, 0, 0);
          model.updateMatrixWorld(true);
          const paletaBox = new THREE.Box3().setFromObject(model);
          const paletaBottomOffset = paletaBox.min.y;

          const startY = conoBox.max.y + 0.8;
          model.position.set(0, startY, 0);
          sceneRef.current.add(model);

          setEnsambladoStatus("ENSAMBLANDO...");

          const targetY = conoBox.max.y - paletaBottomOffset - 0.36;

          animacionesRef.current.push({
            tipo: "MESH",
            obj: model,
            targetObj: conoObjetivo,
            startY: startY,
            targetY: targetY,
            startTime: performance.now(),
            duration: 900,
            onComplete: () => {
              conoObjetivo.add(model);
              model.position.set(0, targetY - conoObjetivo.position.y, 0);
              objectsRef.current.push(model);
              setSelectedMesh(model);
              setItemsEnMesa((prev) => [...prev, model.userData]);
              setEnsambladoStatus("LISTO PARA PERSONALIZAR");

              // Cámara elevada y punto focal alto para que no se corte arriba
              animarCamara(7.0, 2.5, 1.0);
            },
          });
        } else {
          setEnsambladoStatus("FALTA CONO BASE");
        }
      }
    };

    loader.load(
      itemConfig.url,
      (gltf) => procesarModelo(gltf.scene),
      undefined,
      (err) => console.error("Error al cargar modelo 3D:", err),
    );
  };

  // ==========================================
  // CAMBIO DINÁMICO DE COLOR (ANIMADO)
  // ==========================================
  const cambiarColorPaleta = (hexColor) => {
    if (!selectedMesh || selectedMesh.userData.tipo !== "ACCESORIO") return;

    setColorActivoPaleta(hexColor);
    const targetColor = new THREE.Color(hexColor);

    selectedMesh.traverse((child) => {
      if (child.isMesh && child.name !== "ViniloGrafica" && child.material) {
        if (!child.material._esClonado) {
          child.material = child.material.clone();
          child.material.map = null;
          child.material._esClonado = true;
        }

        animacionesRef.current.push({
          tipo: "COLOR",
          material: child.material,
          startColor: child.material.color.clone(),
          targetColor: targetColor,
          startTime: performance.now(),
          duration: 400,
        });
      }
    });
  };

  // ==========================================
  // ADHERENCIA DE GRÁFICA CON RAYCAST Y PROPORCIÓN EXACTA
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
        texture.center.set(0.5, 0.5);

        const imageAspect = texture.image.width / texture.image.height;
        if (imageAspect > 1) {
          texture.repeat.set(1, imageAspect);
          texture.offset.set(0, (1 - imageAspect) / 2);
        } else {
          texture.repeat.set(1 / imageAspect, 1);
          texture.offset.set((1 - 1 / imageAspect) / 2, 0);
        }

        // 1. Limpieza de sticker previo para no interferir en el rayo
        const stickerPrevio = selectedMesh.getObjectByName("ViniloGrafica");
        if (stickerPrevio) {
          selectedMesh.remove(stickerPrevio);
          if (stickerPrevio.geometry) stickerPrevio.geometry.dispose();
          if (stickerPrevio.material) stickerPrevio.material.dispose();
        }

        selectedMesh.updateMatrixWorld(true);
        const bboxWorld = new THREE.Box3().setFromObject(selectedMesh);

        const anchoWorld = bboxWorld.max.x - bboxWorld.min.x;
        const radioPlastico = anchoWorld / 2;

        const centerWorldX = (bboxWorld.min.x + bboxWorld.max.x) / 2;
        // Compensación de 13.5 cm para centrar en el disco obviando la manija
        const centerWorldY = bboxWorld.max.y - radioPlastico - 0.10;

        // 2. Detección de superficie real mediante Raycast
        const rayOrigin = new THREE.Vector3(
          centerWorldX,
          centerWorldY,
          bboxWorld.max.z + 1.0,
        );
        const rayDir = new THREE.Vector3(0, 0, -1);
        const raycaster = new THREE.Raycaster(rayOrigin, rayDir);
        const hits = raycaster.intersectObject(selectedMesh, true);

        let localPos;
        if (hits.length > 0) {
          // Tomar el punto de contacto en el plástico y despegar 0.6 mm
          const hitPoint = hits[0].point.clone();
          hitPoint.z += 0.0006;
          localPos = selectedMesh.worldToLocal(hitPoint);
        } else {
          const fallbackWorld = new THREE.Vector3(
            centerWorldX,
            centerWorldY,
            bboxWorld.max.z + 0.001,
          );
          localPos = selectedMesh.worldToLocal(fallbackWorld);
        }

        // Radio al 84% para cubrir más disco manteniendo margen
        const radioViniloLocal = (radioPlastico * 0.84) / selectedMesh.scale.x;

        const stickerGeo = new THREE.CircleGeometry(radioViniloLocal, 64);
        const stickerMat = new THREE.MeshStandardMaterial({
          map: texture,
          transparent: true,
          roughness: 0.35,
          metalness: 0.05,
          side: THREE.FrontSide,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        });

        const stickerMesh = new THREE.Mesh(stickerGeo, stickerMat);
        stickerMesh.name = "ViniloGrafica";
        stickerMesh.position.copy(localPos);

        selectedMesh.add(stickerMesh);
        setTieneGrafica(true);
      });
    };
    reader.readAsDataURL(file);
  };

  const girarGrafica = () => {
    if (!selectedMesh) return;
    const sticker = selectedMesh.getObjectByName("ViniloGrafica");
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

    selectedMesh.position.set(worldPos.x + 0.4, worldPos.y, worldPos.z + 0.4);
    setEnsambladoStatus("PIEZA DESACOPLADA");

    if (selectedMesh.userData.tipo === "ACCESORIO") {
      animarCamara(5.5, 1.4, 0.45);
    }
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
      animarCamara(5.5, 1.4, 0.45);
    } else {
      setItemsEnMesa((prev) =>
        prev.filter((i) => i.id !== selectedMesh.userData.id),
      );
      setTieneGrafica(false);
      animarCamara(5.5, 1.4, 0.45);
    }

    if (selectedMesh.parent && selectedMesh.parent.type !== "Scene") {
      selectedMesh.parent.remove(selectedMesh);
    } else {
      sceneRef.current.remove(selectedMesh);
    }

    objectsRef.current = objectsRef.current.filter((m) => m !== selectedMesh);
    setSelectedMesh(null);
    if (objectsRef.current.length === 0)
      setEnsambladoStatus("ESPERANDO PIEZAS");
  };

  const vaciarMesa = () => {
    objectsRef.current.forEach((mesh) => {
      sceneRef.current.remove(mesh);
    });
    objectsRef.current = [];
    setItemsEnMesa([]);
    setSelectedMesh(null);
    setTieneGrafica(false);
    setEnsambladoStatus("MESA LIMPIA");
    animarCamara(5.5, 1.4, 0.45);
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full min-h-0 bg-white font-sans text-slate-800 overflow-hidden border border-slate-200 rounded-2xl shadow-2xl">
      {/* PANEL LATERAL */}
      <div className="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 z-20 shadow-xl">
        <div className="p-6 border-b border-slate-200 bg-white flex flex-col justify-center h-28">
          <h2 className="text-xl font-extrabold italic text-slate-900 uppercase tracking-tighter flex items-center gap-2">
            <Wrench size={22} className="text-[#FF5A00]" /> PERSONALIZADOR 3D
          </h2>
          <p className="text-xs text-slate-500 font-medium tracking-wide mt-1">
            Diseñá tu producto a medida.
          </p>
        </div>

        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">
          <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase block mb-1">
            SELECCIONA TUS PIEZAS
          </span>

          <div className="grid gap-3">
            {CATALOGO.map((item) => {
              const isAdded =
                (item.tipo === "BASE" && tieneCono) ||
                (item.tipo === "ACCESORIO" && tienePaleta);

              return (
                <button
                  key={item.id}
                  onClick={() => handleSpawnItem(item)}
                  disabled={isAdded}
                  className={`border p-4 rounded-xl flex items-center gap-4 text-left transition-all group ${
                    isAdded
                      ? "bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed"
                      : "bg-white hover:bg-slate-50 border-slate-200 hover:border-[#FF5A00] cursor-pointer shadow-sm hover:shadow-md"
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      isAdded
                        ? "bg-slate-200 text-slate-400"
                        : "bg-[#FF5A00]/10 text-[#FF5A00] group-hover:bg-[#FF5A00] group-hover:text-white"
                    }`}
                  >
                    {item.tipo === "BASE" ? (
                      <Layers size={22} />
                    ) : (
                      <Box size={22} />
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-mono block mb-0.5">
                      {item.codigo}
                    </span>
                    <span
                      className={`block text-xs font-bold uppercase tracking-wider ${isAdded ? "text-slate-500" : "text-slate-900"}`}
                    >
                      {item.nombre}
                    </span>
                    <span className="text-xs font-bold text-slate-900 mt-1 block">
                      ${item.precio.toLocaleString("es-AR")}
                    </span>
                  </div>

                  {isAdded && (
                    <CheckCircle2
                      size={16}
                      className="text-emerald-500 ml-auto shrink-0"
                    />
                  )}
                </button>
              );
            })}
          </div>

          <hr className="border-slate-200 mt-4 mb-2" />

          <button
            onClick={vaciarMesa}
            disabled={itemsEnMesa.length === 0}
            className="w-full bg-white hover:bg-rose-50 border border-rose-200 text-rose-500 font-bold uppercase tracking-widest py-3.5 text-[10px] rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 size={15} /> VACIAR ÁREA DE TRABAJO
          </button>
        </div>
      </div>

      {/* LIENZO 3D */}
      <div className="flex-1 relative bg-transparent flex flex-col overflow-hidden">
        {/* BARRA SUPERIOR ESTATUS */}
        <div className="absolute top-6 left-6 z-10 flex items-center gap-3 pointer-events-none">
          <div className="flex items-center gap-2 bg-white/90 backdrop-blur-md border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              ESTADO:
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 flex items-center gap-1">
              {ensambladoStatus}
            </span>
          </div>
        </div>

        {/* WIDGET DE RESUMEN DE CARRITO */}
        <div className="absolute top-6 right-6 z-10 bg-white/95 border border-slate-200 backdrop-blur-xl p-5 rounded-2xl shadow-xl min-w-[280px] pointer-events-none transition-transform">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <span className="text-[11px] font-black tracking-widest text-slate-800 uppercase flex items-center gap-2">
              <ShoppingCart size={14} className="text-[#FF5A00]" /> RESUMEN DE
              ORDEN
            </span>
          </div>

          <div className="space-y-2.5 text-xs font-semibold">
            {tieneCono ? (
              <div className="flex justify-between items-center text-slate-800">
                <span>Cono 70cm c/ base</span>
                <span className="font-mono font-bold">
                  ${PRECIO_CONO.toLocaleString("es-AR")}
                </span>
              </div>
            ) : (
              <div className="flex justify-between items-center text-slate-400 line-through">
                <span>Sin base</span>
                <span className="font-mono">$0</span>
              </div>
            )}

            {tienePaleta ? (
              <div className="flex justify-between items-center text-slate-800">
                <span>Paleta Cartel</span>
                <span className="font-mono font-bold">
                  +${PRECIO_PALETA.toLocaleString("es-AR")}
                </span>
              </div>
            ) : (
              <div className="flex justify-between items-center text-slate-400 line-through">
                <span>Sin accesorio</span>
                <span className="font-mono">$0</span>
              </div>
            )}

            {tieneGrafica ? (
              <div className="flex justify-between items-center text-[#FF5A00]">
                <span className="flex items-center gap-1.5">
                  <Sparkles size={12} /> Impresión Vinilo
                </span>
                <span className="font-mono font-bold">
                  +${PRECIO_GRAFICA.toLocaleString("es-AR")}
                </span>
              </div>
            ) : (
              <div className="flex justify-between items-center text-slate-400 line-through">
                <span>Sin personalizar</span>
                <span className="font-mono">$0</span>
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
              TOTAL (ARS)
            </span>
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              ${precioAnimado.toLocaleString("es-AR")}
            </span>
          </div>
        </div>

        <div
          ref={mountRef}
          className="flex-1 w-full h-full cursor-grab active:cursor-grabbing outline-none"
          tabIndex={0}
        />

        {/* PANEL FLOTANTE DE ACCIONES INFERIOR */}
        {selectedMesh && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white/95 border border-slate-200 backdrop-blur-md p-3 px-6 rounded-full shadow-2xl flex flex-wrap items-center gap-4 z-20 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center gap-2 border-r border-slate-200 pr-4">
              <span className="text-[11px] font-bold text-slate-800 tracking-widest uppercase flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                  {selectedMesh.userData.tipo === "BASE" ? (
                    <Layers size={12} />
                  ) : (
                    <Box size={12} />
                  )}
                </div>
                {selectedMesh.userData.nombre}
              </span>
            </div>

            {/* SELECTOR DE COLORES PARA LA PALETA */}
            {selectedMesh.userData.tipo === "ACCESORIO" && (
              <div className="flex items-center gap-2 border-r border-slate-200 pr-4">
                <Palette size={14} className="text-slate-400 shrink-0" />
                <div className="flex items-center gap-1.5">
                  {COLORES_PALETA.map((col) => (
                    <button
                      key={col.id}
                      onClick={() => cambiarColorPaleta(col.hex)}
                      title={col.nombre}
                      style={{ backgroundColor: col.hex }}
                      className={`w-5 h-5 rounded-full border transition-all cursor-pointer ${
                        colorActivoPaleta === col.hex
                          ? "ring-2 ring-[#FF5A00] ring-offset-2 scale-110 border-transparent shadow-sm"
                          : "border-slate-300 hover:scale-110 opacity-80 hover:opacity-100"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {selectedMesh.parent && selectedMesh.parent.type !== "Scene" && (
              <button
                onClick={desensamblar}
                className="text-slate-500 hover:text-slate-900 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
              >
                <Unlink size={14} /> DESACOPLAR
              </button>
            )}

            {selectedMesh.userData.tipo === "ACCESORIO" && (
              <div className="flex items-center gap-3 border-r border-slate-200 pr-4">
                <label className="bg-[#FF5A00] hover:bg-[#ff6e1f] text-white px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer transition shadow-md active:scale-95">
                  <ImageIcon size={14} />
                  {tieneGrafica ? "CAMBIAR LOGO" : "SUBIR TU LOGO"}
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </label>

                {tieneGrafica && (
                  <button
                    onClick={girarGrafica}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
                    title="Gira la gráfica 90° si vino horizontal"
                  >
                    <RotateCw size={14} /> ROTAR
                  </button>
                )}
              </div>
            )}

            <button
              onClick={handleRemoveSelected}
              className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition cursor-pointer"
              title="Eliminar Pieza"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
