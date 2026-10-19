import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import {
  Truck,
  Move,
  RotateCw,
  Trash2,
  Plus,
  Trash,
  Box,
  Layers,
  ArrowDownToLine,
  ArrowUpToLine,
  AlignLeft,
  AlignRight,
  Magnet,
  Ruler,
  ClipboardList,
  CheckCircle2,
  Eye,
  EyeOff,
  X,
  FlipVertical,
  CopyPlus,
  Compass,
} from "lucide-react";

// Dimensiones de Semirremolque Estándar Conoflex
const TRUCK_W = 2.45; // Ancho interno (m)
const TRUCK_H = 2.6; // Alto interno (m)
const TRUCK_D = 14.5; // Largo interno (m)
const TRUCK_VOL = TRUCK_W * TRUCK_H * TRUCK_D;

const STORAGE_KEY = "conoflex_simulador_carga_3d_v5";

export default function SimuladorLogistica() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const transformRef = useRef(null);
  const objectsRef = useRef([]);
  const floorRef = useRef(null);
  const hoverMarkerRef = useRef(null);
  const hoverTimerRef = useRef(null);

  const [items, setItems] = useState([]);
  const [transformMode, setTransformMode] = useState("translate");
  const [selectedMesh, setSelectedMesh] = useState(null);
  const [hoveredData, setHoveredData] = useState(null);
  const [hoveredMeshId, setHoveredMeshId] = useState(null);
  const [mostrarBotonDuplicar, setMostrarBotonDuplicar] = useState(false);

  const [modoSnap, setModoSnap] = useState(false);
  const [rotacionGrados, setRotacionGrados] = useState(0);
  const [guardadoStatus, setGuardadoStatus] = useState("Guardado");
  const [mostrarManifiesto, setMostrarManifiesto] = useState(false);
  const [mostrarGizmo, setMostrarGizmo] = useState(true);

  // Formulario de bultos
  const [tipoCarga, setTipoCarga] = useState("PALLET");
  const [ancho, setAncho] = useState(1.0);
  const [profundidad, setProfundidad] = useState(1.2);
  const [alto, setAlto] = useState(1.5);

  const [listaProductosTemp, setListaProductosTemp] = useState([
    { articulo: "ARTÍCULO GENERAL", cantidad: 100 },
  ]);
  const [nuevoArticuloInput, setNuevoArticuloInput] = useState("");
  const [nuevaCantidadInput, setNuevaCantidadInput] = useState(100);

  const usedVol = items.reduce((acc, i) => acc + i.vol, 0);
  const remainingVol = Math.max(0, TRUCK_VOL - usedVol);
  const usedPerc = ((usedVol / TRUCK_VOL) * 100).toFixed(1);

  // ==========================================
  // CLAMPING ESTRICTO (Límites del camión)
  // ==========================================
  const clampMeshToTruck = useCallback((mesh) => {
    mesh.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(mesh);

    const minX = -TRUCK_W / 2;
    const maxX = TRUCK_W / 2;
    const minY = 0.002;
    const maxY = TRUCK_H;
    const minZ = -TRUCK_D / 2;
    const maxZ = TRUCK_D / 2;

    let deltaX = 0;
    let deltaY = 0;
    let deltaZ = 0;

    if (bbox.min.x < minX) deltaX = minX - bbox.min.x;
    else if (bbox.max.x > maxX) deltaX = maxX - bbox.max.x;

    if (bbox.min.y < minY) deltaY = minY - bbox.min.y;
    else if (bbox.max.y > maxY) deltaY = maxY - bbox.max.y;

    if (bbox.min.z < minZ) deltaZ = minZ - bbox.min.z;
    else if (bbox.max.z > maxZ) deltaZ = maxZ - bbox.max.z;

    if (deltaX !== 0 || deltaY !== 0 || deltaZ !== 0) {
      mesh.position.x += deltaX;
      mesh.position.y += deltaY;
      mesh.position.z += deltaZ;
      mesh.updateMatrixWorld(true);
    }
  }, []);

  // ==========================================
  // FÍSICA: COLISIÓN ENTRE OBJETOS (NO TRASPASAR)
  // ==========================================
  const checkAndResolveCollision = useCallback((mesh) => {
    mesh.updateMatrixWorld(true);
    // Achicamos la caja delimitadora 2 cm para que los objetos puedan rozarse o apilarse sin bloquearse
    const activeBox = new THREE.Box3()
      .setFromObject(mesh)
      .expandByScalar(-0.02);

    let colision = false;
    for (const otherMesh of objectsRef.current) {
      if (otherMesh !== mesh) {
        otherMesh.updateMatrixWorld(true);
        const otherBox = new THREE.Box3()
          .setFromObject(otherMesh)
          .expandByScalar(-0.02);

        if (activeBox.intersectsBox(otherBox)) {
          colision = true;
          break;
        }
      }
    }

    if (colision && mesh.userData.lastValidPos) {
      // Rebotar al último punto seguro
      mesh.position.copy(mesh.userData.lastValidPos);
      mesh.rotation.copy(mesh.userData.lastValidRot);
      mesh.updateMatrixWorld(true);
      return true; // Hubo colisión
    } else {
      // Guardar posición segura actual
      if (!mesh.userData.lastValidPos)
        mesh.userData.lastValidPos = mesh.position.clone();
      if (!mesh.userData.lastValidRot)
        mesh.userData.lastValidRot = mesh.rotation.clone();
      mesh.userData.lastValidPos.copy(mesh.position);
      mesh.userData.lastValidRot.copy(mesh.rotation);
      return false; // Libre
    }
  }, []);

  // ==========================================
  // RESUMEN DE MANIFIESTO
  // ==========================================
  const resumenArticulos = useMemo(() => {
    const mapa = {};
    items.forEach((it) => {
      (it.contenidos || []).forEach((c) => {
        const art = (c.articulo || "SIN ESPECIFICAR").trim().toUpperCase();
        const cant = Number(c.cantidad) || 0;
        if (!mapa[art]) {
          mapa[art] = {
            cantidadTotal: 0,
            bultosIds: new Set(),
            volumenEstimado: 0,
          };
        }
        mapa[art].cantidadTotal += cant;
        mapa[art].bultosIds.add(it.id);
        mapa[art].volumenEstimado += it.vol / Math.max(1, it.contenidos.length);
      });
    });

    return Object.entries(mapa).map(([nombre, data]) => ({
      nombre,
      cantidadTotal: data.cantidadTotal,
      bultosCount: data.bultosIds.size,
      volumenTotal: data.volumenEstimado,
    }));
  }, [items]);

  const guardarEnStorage = useCallback((itemsActuales) => {
    try {
      const serializado = itemsActuales.map((it) => {
        const mesh = objectsRef.current.find((m) => m.name === it.id);
        return {
          ...it,
          posX: mesh ? mesh.position.x : 0,
          posY: mesh ? mesh.position.y : it.h / 2,
          posZ: mesh ? mesh.position.z : 0,
          rotY: mesh ? mesh.rotation.y : 0,
          scaleY: mesh ? mesh.scale.y : 1,
          scaleZ: mesh ? mesh.scale.z : 1,
        };
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializado));
      setGuardadoStatus("Guardado");
    } catch (e) {
      console.error("Error guardando en localStorage:", e);
    }
  }, []);

  const triggerAutoSave = useCallback(() => {
    setGuardadoStatus("Guardando...");
    setItems((prev) => {
      guardarEnStorage(prev);
      return [...prev];
    });
  }, [guardarEnStorage]);

  // ==========================================
  // INICIALIZACIÓN THREE.JS
  // ==========================================
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060608);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    camera.position.set(11, 9, 17);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
    scene.add(ambientLight);
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x222222, 1.4);
    scene.add(hemiLight);
    const mainLight = new THREE.DirectionalLight(0xffffff, 2.2);
    mainLight.position.set(14, 22, 16);
    scene.add(mainLight);
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 1.4);
    fillLight.position.set(-14, 15, -14);
    scene.add(fillLight);
    const orangeRimLight = new THREE.DirectionalLight(0xff5a00, 1.8);
    orangeRimLight.position.set(0, 10, -18);
    scene.add(orangeRimLight);

    const floorGeo = new THREE.PlaneGeometry(TRUCK_W, TRUCK_D);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x141416,
      roughness: 0.4,
      metalness: 0.2,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.002;
    floor.name = "truck_floor";
    scene.add(floor);
    floorRef.current = floor;

    const truckGeo = new THREE.BoxGeometry(TRUCK_W, TRUCK_H, TRUCK_D);
    const edges = new THREE.EdgesGeometry(truckGeo);
    const truckLines = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        opacity: 0.7,
        transparent: true,
        linewidth: 2,
      }),
    );
    truckLines.position.y = TRUCK_H / 2;
    scene.add(truckLines);

    const grid = new THREE.GridHelper(30, 30, 0xff5a00, 0x202022);
    grid.position.y = 0;
    scene.add(grid);

    const markerGeo = new THREE.PlaneGeometry(0.8, 0.8);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const hoverMarker = new THREE.Mesh(markerGeo, markerMat);
    hoverMarker.rotation.x = -Math.PI / 2;
    hoverMarker.visible = false;
    scene.add(hoverMarker);
    hoverMarkerRef.current = hoverMarker;

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, TRUCK_H / 2, 0);
    orbit.update();

    const transform = new TransformControls(camera, renderer.domElement);
    transform.size = 0.48;
    transform.space = "local";

    const helper =
      typeof transform.getHelper === "function" ? transform.getHelper() : null;
    if (helper && helper.isObject3D) scene.add(helper);
    else if (transform.isObject3D) scene.add(transform);
    transformRef.current = transform;

    const gizmoNode = helper || (transform.isObject3D ? transform : null);
    if (gizmoNode) {
      gizmoNode.traverse((child) => {
        if (
          child.name &&
          (child.name.includes("XY") ||
            child.name.includes("YZ") ||
            child.name.includes("XZ") ||
            child.name.includes("XYZ"))
        ) {
          child.visible = false;
        }
        if (child.material) {
          child.material = child.material.clone();
          child.material.transparent = true;
          child.material.opacity = 0.75;
          child.material.depthTest = false;
        }
      });
    }

    transform.addEventListener("dragging-changed", (event) => {
      orbit.enabled = !event.value;
      if (!event.value) triggerAutoSave();
    });

    transform.addEventListener("change", () => {
      const activeObj = transform.object;
      if (activeObj) {
        // Primero limita al camión, luego verifica si choca con otra caja
        clampMeshToTruck(activeObj);
        checkAndResolveCollision(activeObj);

        const deg = Math.round(
          THREE.MathUtils.radToDeg(activeObj.rotation.y) % 360,
        );
        setRotacionGrados(deg < 0 ? deg + 360 : deg);
      }
    });

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDraggingGizmo = false;
    let clickPos = { x: 0, y: 0 };

    transform.addEventListener("mouseDown", () => {
      isDraggingGizmo = true;
    });
    transform.addEventListener("mouseUp", () => {
      isDraggingGizmo = false;
    });
    const onPointerDown = (e) => {
      clickPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (event) => {
      if (isDraggingGizmo) return;
      const dist = Math.hypot(
        event.clientX - clickPos.x,
        event.clientY - clickPos.y,
      );
      if (dist > 5) return;

      const rect = container.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(objectsRef.current, false);

      if (intersects.length > 0) {
        const mesh = intersects[0].object;
        transform.attach(mesh);
        setSelectedMesh(mesh);
        const deg = Math.round(THREE.MathUtils.radToDeg(mesh.rotation.y) % 360);
        setRotacionGrados(deg < 0 ? deg + 360 : deg);
      } else {
        transform.detach();
        setSelectedMesh(null);
      }
    };

    const onPointerMove = (event) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const allTargets = [...objectsRef.current, floor];
      const intersects = raycaster.intersectObjects(allTargets, false);

      if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.object !== floor) {
          const mesh = hit.object;

          if (mesh.name !== hoveredMeshId) {
            clearTimeout(hoverTimerRef.current);
            setHoveredMeshId(mesh.name);
            setMostrarBotonDuplicar(false);
            hoverTimerRef.current = setTimeout(() => {
              setMostrarBotonDuplicar(true);
            }, 3000);
          }

          mesh.updateMatrixWorld(true);
          const bbox = new THREE.Box3().setFromObject(mesh);
          const libreTecho = Math.max(0, TRUCK_H - bbox.max.y);

          const currentH = mesh.userData.h * mesh.scale.y;
          const currentD = mesh.userData.d * mesh.scale.z;

          setHoveredData({
            esVacio: false,
            tipo: mesh.userData.type,
            contenidos: mesh.userData.contenidos || [],
            medidas: `${mesh.userData.w}m × ${currentH.toFixed(2)}m × ${currentD.toFixed(2)}m`,
            vol: mesh.userData.vol.toFixed(2),
            alturaLibreSobreBulto: libreTecho.toFixed(2),
          });
          if (hoverMarkerRef.current) hoverMarkerRef.current.visible = false;
          container.style.cursor = "pointer";
        } else {
          clearTimeout(hoverTimerRef.current);
          setHoveredMeshId(null);
          setMostrarBotonDuplicar(false);

          const pt = hit.point;
          setHoveredData({
            esVacio: true,
            distFondo: (pt.z - -TRUCK_D / 2).toFixed(2),
            distPuerta: (TRUCK_D / 2 - pt.z).toFixed(2),
            distIzq: (pt.x - -TRUCK_W / 2).toFixed(2),
            distDer: (TRUCK_W / 2 - pt.x).toFixed(2),
            alturaLibreTotal: TRUCK_H.toFixed(2),
          });
          if (hoverMarkerRef.current) {
            hoverMarkerRef.current.visible = true;
            hoverMarkerRef.current.position.set(pt.x, 0.015, pt.z);
          }
          container.style.cursor = "crosshair";
        }
      } else {
        clearTimeout(hoverTimerRef.current);
        setHoveredMeshId(null);
        setMostrarBotonDuplicar(false);
        setHoveredData(null);
        if (hoverMarkerRef.current) hoverMarkerRef.current.visible = false;
        container.style.cursor = "default";
      }
    };

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointermove", onPointerMove);

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // RECUPERAR ESTADO
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const loadedItems = [];
          parsed.forEach((it) => {
            const geo = new THREE.BoxGeometry(it.w, it.h, it.d);
            let colorHex = 0xff6600;
            if (it.type === "CAJA") colorHex = 0xffd700;
            if (it.type === "SUELTO") colorHex = 0x38bdf8;

            const mat = new THREE.MeshStandardMaterial({
              color: colorHex,
              roughness: 0.35,
              metalness: 0.1,
            });
            const mesh = new THREE.Mesh(geo, mat);
            const edgeGeo = new THREE.EdgesGeometry(geo);
            const edgeLines = new THREE.LineSegments(
              edgeGeo,
              new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }),
            );
            mesh.add(edgeLines);

            mesh.position.set(it.posX || 0, it.posY || it.h / 2, it.posZ || 0);
            mesh.rotation.y = it.rotY || 0;
            mesh.scale.y = it.scaleY || 1;
            mesh.scale.z = it.scaleZ || 1;

            mesh.userData = it;
            mesh.userData.lastValidPos = mesh.position.clone();
            mesh.userData.lastValidRot = mesh.rotation.clone();
            mesh.name = it.id;

            clampMeshToTruck(mesh);
            scene.add(mesh);
            objectsRef.current.push(mesh);
            loadedItems.push(it);
          });
          setItems(loadedItems);
        }
      }
    } catch (e) {
      console.error("Error restaurando:", e);
    }

    const handleResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointermove", onPointerMove);
      clearTimeout(hoverTimerRef.current);
      cancelAnimationFrame(animId);
      transform.dispose();
      orbit.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement))
        container.removeChild(renderer.domElement);
    };
  }, [clampMeshToTruck, checkAndResolveCollision, triggerAutoSave]);

  useEffect(() => {
    if (!transformRef.current) return;
    if (modoSnap) {
      transformRef.current.setTranslationSnap(0.05);
      transformRef.current.setRotationSnap(THREE.MathUtils.degToRad(15));
    } else {
      transformRef.current.setTranslationSnap(null);
      transformRef.current.setRotationSnap(null);
    }
  }, [modoSnap]);

  useEffect(() => {
    if (transformRef.current) {
      transformRef.current.enabled = mostrarGizmo;
      const helper =
        typeof transformRef.current.getHelper === "function"
          ? transformRef.current.getHelper()
          : null;
      const targetGizmo =
        helper ||
        (transformRef.current.isObject3D ? transformRef.current : null);
      if (targetGizmo) targetGizmo.visible = mostrarGizmo;
    }
  }, [mostrarGizmo]);

  useEffect(() => {
    objectsRef.current.forEach((mesh) => {
      if (mesh === selectedMesh) mesh.material.emissive.setHex(0x552200);
      else mesh.material.emissive.setHex(0x000000);
    });
  }, [selectedMesh]);

  const handleTypeChange = (e) => {
    const val = e.target.value;
    setTipoCarga(val);
    if (val === "PALLET") {
      setAncho(1.0);
      setProfundidad(1.2);
      setAlto(1.5);
    } else if (val === "CAJA") {
      setAncho(0.6);
      setProfundidad(0.4);
      setAlto(0.4);
    } else {
      setAncho(1.0);
      setProfundidad(1.0);
      setAlto(1.0);
    }
  };

  const agregarProductoAlBulto = () => {
    if (!nuevoArticuloInput.trim()) return;
    setListaProductosTemp((prev) => [
      ...prev,
      {
        articulo: nuevoArticuloInput.trim().toUpperCase(),
        cantidad: parseInt(nuevaCantidadInput, 10) || 1,
      },
    ]);
    setNuevoArticuloInput("");
    setNuevaCantidadInput(100);
  };

  const quitarProductoDelBulto = (idx) => {
    setListaProductosTemp((prev) => prev.filter((_, i) => i !== idx));
  };

  const crearMalla3D = (
    newItem,
    colorHex,
    posX,
    posY,
    posZ,
    rotY = 0,
    scaleY = 1,
    scaleZ = 1,
  ) => {
    const geo = new THREE.BoxGeometry(newItem.w, newItem.h, newItem.d);
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.35,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const edgeGeo = new THREE.EdgesGeometry(geo);
    const edgeLines = new THREE.LineSegments(
      edgeGeo,
      new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }),
    );
    mesh.add(edgeLines);

    mesh.position.set(posX, posY, posZ);
    mesh.rotation.y = rotY;
    mesh.scale.y = scaleY;
    mesh.scale.z = scaleZ;
    mesh.userData = newItem;
    mesh.userData.lastValidPos = mesh.position.clone();
    mesh.userData.lastValidRot = mesh.rotation.clone();
    mesh.name = newItem.id;
    return mesh;
  };

  const handleAddItem = () => {
    if (!sceneRef.current) return;
    const w = parseFloat(ancho) || 1;
    const h = parseFloat(alto) || 1;
    const d = parseFloat(profundidad) || 1;
    const id = `item-${Date.now()}`;
    const vol = w * h * d;

    let contenidosFinales = [...listaProductosTemp];
    if (contenidosFinales.length === 0)
      contenidosFinales = [{ articulo: "ARTÍCULO GENERAL", cantidad: 100 }];

    const newItem = {
      id,
      type: tipoCarga,
      contenidos: contenidosFinales,
      w,
      h,
      d,
      vol,
    };
    let colorHex = 0xff6600;
    if (tipoCarga === "CAJA") colorHex = 0xffd700;
    if (tipoCarga === "SUELTO") colorHex = 0x38bdf8;

    let spawnZ = TRUCK_D / 2 - d / 2 - 0.2;
    const mesh = crearMalla3D(newItem, colorHex, 0, h / 2, spawnZ);

    // Evitar que nazca dentro de otro objeto (lo empuja hacia el fondo)
    let intentos = 0;
    while (checkAndResolveCollision(mesh) && intentos < 30) {
      spawnZ -= 0.5;
      mesh.position.z = spawnZ;
      mesh.updateMatrixWorld(true);
      mesh.userData.lastValidPos.copy(mesh.position);
      intentos++;
    }

    clampMeshToTruck(mesh);

    sceneRef.current.add(mesh);
    objectsRef.current.push(mesh);

    if (transformRef.current) {
      transformRef.current.attach(mesh);
      setSelectedMesh(mesh);
      setRotacionGrados(0);
    }
    setItems((prev) => {
      const u = [...prev, newItem];
      guardarEnStorage(u);
      return u;
    });
  };

  const handleDuplicarBulto = (meshOriginal) => {
    if (!sceneRef.current || !meshOriginal) return;

    const id = `item-${Date.now()}`;
    const newItem = { ...meshOriginal.userData, id };

    let colorHex = 0xff6600;
    if (newItem.type === "CAJA") colorHex = 0xffd700;
    if (newItem.type === "SUELTO") colorHex = 0x38bdf8;

    const cloneMesh = crearMalla3D(
      newItem,
      colorHex,
      meshOriginal.position.x,
      meshOriginal.position.y,
      meshOriginal.position.z - newItem.d * meshOriginal.scale.z - 0.1,
      meshOriginal.rotation.y,
      meshOriginal.scale.y,
      meshOriginal.scale.z,
    );

    // Evita superposición al clonar
    let intentos = 0;
    while (checkAndResolveCollision(cloneMesh) && intentos < 20) {
      cloneMesh.position.z -= 0.5;
      cloneMesh.updateMatrixWorld(true);
      cloneMesh.userData.lastValidPos.copy(cloneMesh.position);
      intentos++;
    }

    clampMeshToTruck(cloneMesh);
    sceneRef.current.add(cloneMesh);
    objectsRef.current.push(cloneMesh);

    if (transformRef.current) {
      transformRef.current.attach(cloneMesh);
      setSelectedMesh(cloneMesh);
    }
    setItems((prev) => {
      const u = [...prev, newItem];
      guardarEnStorage(u);
      return u;
    });
    setMostrarBotonDuplicar(false);
  };

  const handleSelectFromList = (id) => {
    const mesh = objectsRef.current.find((m) => m.name === id);
    if (mesh && transformRef.current) {
      transformRef.current.attach(mesh);
      setSelectedMesh(mesh);
      const deg = Math.round(THREE.MathUtils.radToDeg(mesh.rotation.y) % 360);
      setRotacionGrados(deg < 0 ? deg + 360 : deg);
    }
  };

  const handleSliderRotation = (grados) => {
    if (!selectedMesh) return;
    const degNum = parseFloat(grados);
    setRotacionGrados(degNum);
    selectedMesh.rotation.y = THREE.MathUtils.degToRad(degNum);

    clampMeshToTruck(selectedMesh);
    checkAndResolveCollision(selectedMesh);
    triggerAutoSave();
  };

  // BOTÓN "ENDEREZAR" (ALINEACIÓN A 90°)
  const enderezar = () => {
    if (!selectedMesh) return;
    const currentDeg = THREE.MathUtils.radToDeg(selectedMesh.rotation.y);
    const normalizedDeg = ((currentDeg % 360) + 360) % 360;
    const snappedDeg = Math.round(normalizedDeg / 90) * 90;

    selectedMesh.rotation.y = THREE.MathUtils.degToRad(snappedDeg);
    setRotacionGrados(snappedDeg % 360);

    clampMeshToTruck(selectedMesh);
    checkAndResolveCollision(selectedMesh);
    triggerAutoSave();
  };

  const flipMesh = () => {
    if (!selectedMesh) return;
    const prevScaleY = selectedMesh.scale.y;
    const ratioH = selectedMesh.userData.d / selectedMesh.userData.h;
    const ratioD = selectedMesh.userData.h / selectedMesh.userData.d;

    if (prevScaleY === 1) {
      selectedMesh.scale.y = ratioH;
      selectedMesh.scale.z = ratioD;
    } else {
      selectedMesh.scale.y = 1;
      selectedMesh.scale.z = 1;
    }

    selectedMesh.position.y +=
      Math.max(selectedMesh.userData.h, selectedMesh.userData.d) / 2;

    clampMeshToTruck(selectedMesh);
    checkAndResolveCollision(selectedMesh);
    triggerAutoSave();
  };

  const stackOnTop = (targetId) => {
    if (!selectedMesh) return;
    const targetMesh = objectsRef.current.find((m) => m.name === targetId);
    if (!targetMesh || targetMesh === selectedMesh) return;

    targetMesh.updateMatrixWorld(true);
    const targetBbox = new THREE.Box3().setFromObject(targetMesh);

    selectedMesh.position.x = targetMesh.position.x;
    selectedMesh.position.z = targetMesh.position.z;
    const currentH = selectedMesh.userData.h * selectedMesh.scale.y;

    // Lo colocamos justo encima (+ 1cm para evitar colisión constante y saltos)
    selectedMesh.position.y = targetBbox.max.y + currentH / 2 + 0.01;

    clampMeshToTruck(selectedMesh);
    checkAndResolveCollision(selectedMesh);
    triggerAutoSave();
  };

  const snapToFloor = () => {
    if (!selectedMesh) return;
    const currentH = selectedMesh.userData.h * selectedMesh.scale.y;
    selectedMesh.position.y = currentH / 2;
    clampMeshToTruck(selectedMesh);
    checkAndResolveCollision(selectedMesh);
    triggerAutoSave();
  };

  const snapToBack = () => {
    if (!selectedMesh) return;
    const currentD = selectedMesh.userData.d * selectedMesh.scale.z;
    selectedMesh.position.z = -TRUCK_D / 2 + currentD / 2;
    clampMeshToTruck(selectedMesh);
    checkAndResolveCollision(selectedMesh);
    triggerAutoSave();
  };

  const snapToLeft = () => {
    if (!selectedMesh) return;
    selectedMesh.position.x = -TRUCK_W / 2 + selectedMesh.userData.w / 2;
    clampMeshToTruck(selectedMesh);
    checkAndResolveCollision(selectedMesh);
    triggerAutoSave();
  };

  const snapToRight = () => {
    if (!selectedMesh) return;
    selectedMesh.position.x = TRUCK_W / 2 - selectedMesh.userData.w / 2;
    clampMeshToTruck(selectedMesh);
    checkAndResolveCollision(selectedMesh);
    triggerAutoSave();
  };

  const handleRemoveSelected = () => {
    if (!selectedMesh) return;
    sceneRef.current.remove(selectedMesh);
    selectedMesh.geometry.dispose();
    selectedMesh.material.dispose();
    objectsRef.current = objectsRef.current.filter((m) => m !== selectedMesh);
    if (transformRef.current) transformRef.current.detach();
    const rest = items.filter((item) => item.id !== selectedMesh.name);
    setItems(rest);
    guardarEnStorage(rest);
    setSelectedMesh(null);
  };

  const handleClear = () => {
    if (!window.confirm("¿Estás seguro de que querés vaciar todo el camión?"))
      return;
    objectsRef.current.forEach((mesh) => {
      sceneRef.current.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    objectsRef.current = [];
    setItems([]);
    localStorage.removeItem(STORAGE_KEY);
    if (transformRef.current) transformRef.current.detach();
    setSelectedMesh(null);
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full min-h-0 bg-black font-sans text-zinc-200 overflow-hidden selection:bg-[#FF5A00]/30">
      {/* SIDEBAR IZQUIERDA */}
      <div className="w-full md:w-80 bg-[#050505] border-r border-zinc-800 flex flex-col shrink-0 z-20">
        <div className="p-4 border-b border-zinc-800 bg-[#080808] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold italic text-white uppercase tracking-tighter flex items-center gap-2.5">
              <Truck size={20} className="text-[#FF5A00]" />
              CARGA 3D
            </h2>
            <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">
              Logística y Carga Inteligente
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
            <CheckCircle2 size={11} /> {guardadoStatus}
          </div>
        </div>

        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">
          <div className="space-y-3 bg-[#080808] p-3 border border-zinc-850 rounded-xl">
            <span className="text-[10px] font-black tracking-widest text-[#FF5A00] uppercase block">
              + ARMAR NUEVO BULTO
            </span>

            <div>
              <label className="text-[9px] text-zinc-400 uppercase tracking-widest font-bold block mb-1">
                FORMATO / TIPO:
              </label>
              <select
                value={tipoCarga}
                onChange={handleTypeChange}
                className="w-full bg-black border border-zinc-800 text-white px-3 py-2 text-xs font-bold uppercase outline-none focus:border-[#FF5A00] rounded cursor-pointer"
              >
                <option value="PALLET">Pallet Estándar</option>
                <option value="CAJA">Caja / Bulto</option>
                <option value="SUELTO">Artículo Suelto</option>
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold block mb-1 text-center">
                  ANCHO (m)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={ancho}
                  onChange={(e) => setAncho(e.target.value)}
                  className="w-full bg-black border border-zinc-800 text-[#FFD700] px-1 py-1 text-center text-xs font-bold outline-none focus:border-[#FFD700] rounded"
                />
              </div>
              <div>
                <label className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold block mb-1 text-center">
                  PROF (m)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={profundidad}
                  onChange={(e) => setProfundidad(e.target.value)}
                  className="w-full bg-black border border-zinc-800 text-[#FFD700] px-1 py-1 text-center text-xs font-bold outline-none focus:border-[#FFD700] rounded"
                />
              </div>
              <div>
                <label className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold block mb-1 text-center">
                  ALTO (m)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={alto}
                  onChange={(e) => setAlto(e.target.value)}
                  className="w-full bg-black border border-zinc-800 text-[#FFD700] px-1 py-1 text-center text-xs font-bold outline-none focus:border-[#FFD700] rounded"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-800">
              <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block mb-1.5 flex items-center justify-between">
                <span>CONTENIDO DEL BULTO:</span>
                <span className="text-zinc-600">
                  ({listaProductosTemp.length} art.)
                </span>
              </span>
              <div className="space-y-1 mb-2 max-h-28 overflow-y-auto custom-scrollbar">
                {listaProductosTemp.map((p, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center bg-black border border-zinc-800 px-2 py-1 rounded text-[10px]"
                  >
                    <span className="text-white truncate font-semibold pr-2">
                      {p.articulo}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[#FFD700] font-bold font-mono">
                        {p.cantidad} u.
                      </span>
                      <button
                        onClick={() => quitarProductoDelBulto(idx)}
                        className="text-zinc-500 hover:text-rose-400 cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Artículo..."
                  value={nuevoArticuloInput}
                  onChange={(e) => setNuevoArticuloInput(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && agregarProductoAlBulto()
                  }
                  className="flex-1 bg-black border border-zinc-800 text-white px-2 py-1.5 text-[10px] uppercase outline-none focus:border-[#FF5A00] rounded"
                />
                <input
                  type="number"
                  min="1"
                  placeholder="Cant."
                  value={nuevaCantidadInput}
                  onChange={(e) => setNuevaCantidadInput(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && agregarProductoAlBulto()
                  }
                  className="w-14 bg-black border border-zinc-800 text-[#FFD700] px-1 py-1.5 text-center text-[10px] font-bold outline-none rounded"
                />
                <button
                  onClick={agregarProductoAlBulto}
                  className="bg-zinc-800 hover:bg-[#FF5A00] hover:text-black text-white p-1.5 rounded transition cursor-pointer"
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>

            <button
              onClick={handleAddItem}
              className="w-full bg-[#FF5A00] hover:bg-white text-black font-bold uppercase tracking-widest py-2.5 text-xs rounded transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-[#FF5A00]/20 mt-1"
            >
              <Plus size={15} /> AÑADIR A LA CARGA
            </button>
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                <Layers size={13} className="text-[#FF5A00]" /> BULTOS (
                {items.length})
              </span>
              <button
                onClick={() => setMostrarManifiesto(true)}
                className="text-[9px] font-bold text-[#FFD700] hover:text-white uppercase tracking-wider flex items-center gap-1 bg-[#FFD700]/10 border border-[#FFD700]/30 px-2 py-0.5 rounded cursor-pointer transition-colors"
              >
                <ClipboardList size={11} /> MANIFIESTO
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
              {items.map((item, idx) => {
                const isSelected = selectedMesh?.name === item.id;
                const totalUnidades = (item.contenidos || []).reduce(
                  (acc, c) => acc + (Number(c.cantidad) || 0),
                  0,
                );
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectFromList(item.id)}
                    className={`p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col gap-1 ${isSelected ? "bg-[#161616] border-[#FF5A00] text-white shadow-lg shadow-[#FF5A00]/10" : "bg-[#090909] border-zinc-850 text-zinc-400 hover:text-white hover:bg-[#111111]"}`}
                  >
                    <div className="flex justify-between items-center text-xs font-bold">
                      <div className="flex items-center gap-2 truncate pr-2">
                        <div
                          className={`w-2 h-2 rounded-full shrink-0 ${item.type === "PALLET" ? "bg-[#FF5A00]" : item.type === "CAJA" ? "bg-[#FFD700]" : "bg-[#38bdf8]"}`}
                        />
                        <span className="text-white truncate">
                          {item.type} #{idx + 1}
                        </span>
                      </div>
                      <span className="text-[#FFD700] font-mono text-[11px] shrink-0">
                        {totalUnidades} u.
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-500 space-y-0.5 mt-0.5 pl-4 border-l border-zinc-800">
                      {(item.contenidos || []).map((c, i) => (
                        <div key={i} className="flex justify-between truncate">
                          <span className="truncate">{c.articulo}</span>
                          <span className="font-mono text-zinc-400 ml-1">
                            {c.cantidad} u.
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end text-[9px] text-zinc-600 font-mono mt-0.5">
                      <span>{item.vol.toFixed(2)} m³</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleClear}
            disabled={items.length === 0}
            className="w-full bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-400 font-bold uppercase tracking-widest py-2.5 text-[10px] rounded transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash size={13} /> VACIAR CAMIÓN
          </button>
        </div>
      </div>

      {/* ÁREA DERECHA: LIENZO 3D */}
      <div className="flex-1 relative bg-black flex flex-col overflow-hidden">
        <div className="absolute top-4 left-4 right-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pointer-events-none z-10">
          <div className="bg-[#050505]/95 border border-zinc-800 backdrop-blur-md p-3 px-5 rounded-xl shadow-2xl flex items-center gap-5 sm:gap-7 pointer-events-auto">
            <div className="flex flex-col">
              <span className="text-[8px] sm:text-[9px] text-zinc-500 font-bold tracking-widest uppercase">
                VOL. CAMIÓN
              </span>
              <span className="text-lg sm:text-xl font-black text-white italic tracking-tighter">
                {TRUCK_VOL.toFixed(1)}{" "}
                <span className="text-xs text-zinc-600 not-italic">m³</span>
              </span>
            </div>
            <div className="w-px h-8 bg-zinc-800" />
            <div className="flex flex-col">
              <span className="text-[8px] sm:text-[9px] text-[#FF5A00] font-bold tracking-widest uppercase">
                UTILIZADO ({usedPerc}%)
              </span>
              <span className="text-lg sm:text-xl font-black text-[#FF5A00] italic tracking-tighter">
                {usedVol.toFixed(1)}{" "}
                <span className="text-xs text-[#FF5A00]/50 not-italic">m³</span>
              </span>
            </div>
            <div className="w-px h-8 bg-zinc-800" />
            <div className="flex flex-col">
              <span className="text-[8px] sm:text-[9px] text-emerald-400 font-bold tracking-widest uppercase">
                DISPONIBLE
              </span>
              <span className="text-lg sm:text-xl font-black text-emerald-400 italic tracking-tighter">
                {remainingVol.toFixed(1)}{" "}
                <span className="text-xs text-emerald-400/50 not-italic">
                  m³
                </span>
              </span>
            </div>
          </div>

          <div className="bg-[#050505]/95 border border-zinc-800 backdrop-blur-md p-1.5 rounded-xl shadow-2xl flex items-center gap-1.5 pointer-events-auto">
            <button
              onClick={() => {
                setTransformMode("translate");
                if (transformRef.current)
                  transformRef.current.setMode("translate");
              }}
              className={`px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase rounded transition-all flex items-center gap-1.5 cursor-pointer ${transformMode === "translate" ? "bg-[#FF5A00] text-black shadow-md shadow-[#FF5A00]/20" : "bg-black text-zinc-400 hover:text-white border border-zinc-800"}`}
            >
              <Move size={12} /> MOVER
            </button>
            <button
              onClick={() => {
                setTransformMode("rotate");
                if (transformRef.current)
                  transformRef.current.setMode("rotate");
              }}
              className={`px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase rounded transition-all flex items-center gap-1.5 cursor-pointer ${transformMode === "rotate" ? "bg-[#FFD700] text-black shadow-md shadow-[#FFD700]/20" : "bg-black text-zinc-400 hover:text-white border border-zinc-800"}`}
            >
              <RotateCw size={12} /> ROTAR
            </button>

            <button
              onClick={() => setModoSnap(!modoSnap)}
              className={`px-2.5 py-1.5 text-[10px] font-bold tracking-widest uppercase rounded transition-all flex items-center gap-1 border cursor-pointer ${modoSnap ? "bg-[#38bdf8]/20 border-[#38bdf8] text-[#38bdf8]" : "bg-black border-zinc-800 text-zinc-500 hover:text-white"}`}
            >
              <Magnet size={12} /> {modoSnap ? "IMÁN" : "LIBRE"}
            </button>

            <button
              onClick={() => setMostrarGizmo(!mostrarGizmo)}
              className={`p-1.5 text-[10px] font-bold rounded transition-all border cursor-pointer ${mostrarGizmo ? "bg-black border-zinc-800 text-zinc-300 hover:text-white" : "bg-amber-500/20 border-amber-500 text-amber-300"}`}
              title="Mostrar/Ocultar flechas"
            >
              {mostrarGizmo ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>

            <div className="w-px h-5 bg-zinc-800 mx-0.5" />
            <button
              onClick={handleRemoveSelected}
              disabled={!selectedMesh}
              className="px-2.5 py-1.5 text-[10px] font-bold tracking-widest uppercase rounded transition-all flex items-center gap-1 bg-black text-[#FF0055] border border-zinc-800 hover:bg-[#FF0055]/10 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
            >
              <Trash2 size={12} /> QUITAR
            </button>
          </div>
        </div>

        <div ref={mountRef} className="flex-1 w-full h-full" />

        {/* HOVER FLOTANTE: BOTÓN DUPLICAR (3s) */}
        {mostrarBotonDuplicar && hoveredMeshId && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 animate-in zoom-in-75 fade-in duration-300 pointer-events-auto">
            <button
              onClick={() => {
                const meshClonar = objectsRef.current.find(
                  (m) => m.name === hoveredMeshId,
                );
                if (meshClonar) handleDuplicarBulto(meshClonar);
              }}
              className="bg-emerald-500 hover:bg-emerald-400 text-black border-2 border-black font-black uppercase tracking-widest px-6 py-4 rounded-full shadow-[0_0_30px_rgba(16,185,129,0.6)] flex items-center gap-2 cursor-pointer transition-all hover:scale-110 active:scale-95"
            >
              <CopyPlus size={22} />
              DUPLICAR EXACTAMENTE
            </button>
          </div>
        )}

        {/* BARRA INFERIOR DE MANIPULACIÓN */}
        {selectedMesh && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-[#070707]/95 border border-[#FF5A00]/80 backdrop-blur-md p-2.5 px-4 rounded-xl shadow-2xl flex flex-col md:flex-row items-center gap-3 z-20 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-1.5 border-r border-zinc-800 pr-3">
              <span className="text-[9.5px] font-black text-[#FF5A00] tracking-widest uppercase flex items-center gap-1 mr-1">
                <Box size={13} /> ACTIVO
              </span>
              <button
                onClick={enderezar}
                className="bg-black hover:bg-zinc-800 text-white border border-zinc-700 px-2.5 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition cursor-pointer"
                title="Centra y alinea el bulto recto en el camión"
              >
                <Compass size={11} className="text-cyan-400" /> ENDEREZAR
              </button>
              <button
                onClick={flipMesh}
                className="bg-[#FFD700]/10 hover:bg-[#FFD700]/20 text-[#FFD700] border border-[#FFD700]/30 px-2.5 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition cursor-pointer"
                title="Acostar o parar el bulto"
              >
                <FlipVertical size={11} /> ACOSTAR
              </button>
            </div>

            <div className="flex items-center gap-2 border-r border-zinc-800 pr-3">
              <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                GIRO: {rotacionGrados}°
              </span>
              <input
                type="range"
                min="0"
                max="360"
                value={rotacionGrados}
                onChange={(e) => handleSliderRotation(e.target.value)}
                className="w-20 accent-[#FF5A00] cursor-pointer"
              />
            </div>

            {items.length > 1 && (
              <div className="flex items-center gap-2 border-r border-zinc-800 pr-3">
                <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-1">
                  <ArrowUpToLine size={11} /> APILAR EN:
                </span>
                <select
                  onChange={(e) => {
                    if (e.target.value) stackOnTop(e.target.value);
                  }}
                  defaultValue=""
                  className="bg-black border border-zinc-700 text-[10px] text-cyan-300 font-bold px-2 py-1 rounded outline-none cursor-pointer max-w-[100px] truncate"
                >
                  <option value="" disabled>
                    Base...
                  </option>
                  {items
                    .filter((i) => i.id !== selectedMesh.name)
                    .map((it, idx) => (
                      <option key={it.id} value={it.id}>
                        {it.type} #{idx + 1}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-1 pl-1">
              <button
                onClick={snapToFloor}
                className="bg-black hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 px-2 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider transition cursor-pointer"
              >
                Suelo
              </button>
              <button
                onClick={snapToBack}
                className="bg-black hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 px-2 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider transition cursor-pointer"
              >
                Fondo
              </button>
              <button
                onClick={snapToLeft}
                className="bg-black hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 px-2 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider transition cursor-pointer"
              >
                P. Izq.
              </button>
              <button
                onClick={snapToRight}
                className="bg-black hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 px-2 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider transition cursor-pointer"
              >
                P. Der.
              </button>
            </div>
          </div>
        )}

        {/* PANEL DE COTAS HOVER */}
        {hoveredData && (
          <div className="absolute top-24 right-4 bg-[#0A0A0A]/95 border border-zinc-700 p-4 shadow-2xl z-50 rounded-xl flex flex-col gap-2 min-w-[240px] pointer-events-none animate-in fade-in">
            {hoveredData.esVacio ? (
              <>
                <div className="text-[10px] font-black text-[#FFD700] tracking-widest uppercase border-b border-zinc-800 pb-1.5 flex items-center gap-1.5">
                  <Ruler size={13} /> COTA DE ESPACIO VACÍO
                </div>
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-zinc-500">DIST. AL FONDO:</span>
                  <span className="text-white font-mono">
                    {hoveredData.distFondo} m
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-zinc-500">DIST. A LA PUERTA:</span>
                  <span className="text-white font-mono">
                    {hoveredData.distPuerta} m
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-zinc-500">A PAREDES (IZQ/DER):</span>
                  <span className="text-zinc-300 font-mono">
                    {hoveredData.distIzq}m / {hoveredData.distDer}m
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs font-bold pt-1.5 border-t border-zinc-800">
                  <span className="text-emerald-400">ALTURA DISPONIBLE:</span>
                  <span className="text-emerald-400 font-mono text-sm">
                    {hoveredData.alturaLibreTotal} m
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="text-[10px] font-black text-[#FF5A00] tracking-widest uppercase border-b border-zinc-800 pb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Box size={13} /> {hoveredData.tipo}
                  </span>
                  <span className="text-[9px] text-zinc-400 font-mono">
                    {hoveredData.vol} m³
                  </span>
                </div>
                <div className="space-y-1 my-1">
                  <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">
                    CONTENIDO:
                  </span>
                  {(hoveredData.contenidos || []).map((c, i) => (
                    <div
                      key={i}
                      className="flex justify-between text-xs font-semibold"
                    >
                      <span className="text-white truncate pr-2">
                        {c.articulo}
                      </span>
                      <span className="text-[#FFD700] font-mono">
                        {c.cantidad} u.
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center text-xs font-bold pt-1.5 border-t border-zinc-800">
                  <span className="text-cyan-400">LIBRE AL TECHO:</span>
                  <span className="text-cyan-400 font-mono text-sm">
                    {hoveredData.alturaLibreSobreBulto} m
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        <div className="absolute bottom-3 left-4 pointer-events-none">
          <span className="bg-black/90 border border-zinc-800 px-3.5 py-1.5 text-[9.5px] font-bold text-zinc-400 uppercase tracking-wider rounded-lg flex items-center gap-2 shadow-lg">
            <span className="text-[#FF5A00]">● Hover 3s:</span> Duplicar exacto
            | <span className="text-emerald-400">Hover piso:</span> Cotas libres
            | <span className="text-cyan-400">Rotar cámara:</span> Arrastrar
            fondo
          </span>
        </div>
      </div>

      {/* MANIFIESTO */}
      {mostrarManifiesto && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#080808] border border-zinc-800 w-full max-w-2xl p-6 rounded-2xl shadow-2xl flex flex-col gap-4 relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setMostrarManifiesto(false)}
              className="absolute top-5 right-5 text-zinc-500 hover:text-white cursor-pointer"
            >
              <X size={18} />
            </button>
            <div className="border-b border-zinc-800 pb-3">
              <span className="text-[9px] font-black tracking-widest text-[#FFD700] bg-[#FFD700]/10 border border-[#FFD700]/20 px-2 py-0.5 rounded uppercase">
                CONTROL DE CARGA
              </span>
              <h3 className="text-xl font-extrabold italic text-white uppercase tracking-tight mt-1 flex items-center gap-2">
                <ClipboardList size={20} className="text-[#FFD700]" />{" "}
                MANIFIESTO DEL CAMIÓN
              </h3>
            </div>
            <div className="max-h-80 overflow-y-auto custom-scrollbar border border-zinc-800 rounded-xl bg-black">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#101010] text-[9px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-800">
                  <tr>
                    <th className="p-3">Artículo</th>
                    <th className="p-3 text-center">Bultos</th>
                    <th className="p-3 text-right">Cant. Total</th>
                    <th className="p-3 text-right">Volumen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850">
                  {resumenArticulos.map((art) => (
                    <tr key={art.nombre} className="hover:bg-zinc-900/50">
                      <td className="p-3 font-bold text-white uppercase tracking-wide">
                        {art.nombre}
                      </td>
                      <td className="p-3 text-center text-zinc-400 font-mono">
                        {art.bultosCount}
                      </td>
                      <td className="p-3 text-right font-black text-[#FFD700] font-mono text-sm">
                        {art.cantidadTotal.toLocaleString()} u.
                      </td>
                      <td className="p-3 text-right text-emerald-400 font-mono">
                        {art.volumenTotal.toFixed(2)} m³
                      </td>
                    </tr>
                  ))}
                  {resumenArticulos.length === 0 && (
                    <tr>
                      <td
                        colSpan="4"
                        className="p-6 text-center text-zinc-500 font-bold uppercase text-xs"
                      >
                        No hay artículos cargados en el camión.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center pt-2 text-xs font-bold">
              <div className="text-zinc-400">
                TOTAL MERCADERÍA:{" "}
                <span className="text-[#FF5A00] font-mono text-sm ml-1">
                  {resumenArticulos
                    .reduce((acc, a) => acc + a.cantidadTotal, 0)
                    .toLocaleString()}{" "}
                  u.
                </span>{" "}
                en{" "}
                <span className="text-white font-mono">
                  {items.length} bultos
                </span>
              </div>
              <button
                onClick={() => setMostrarManifiesto(false)}
                className="bg-[#FF5A00] hover:bg-white text-black font-bold uppercase tracking-widest px-5 py-2 rounded text-xs transition cursor-pointer"
              >
                CERRAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
