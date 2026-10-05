import { useState, useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Cpu,
  Flame,
  Zap,
  Layers,
  Settings,
  Sliders,
  X,
  Search,
  Plus,
  Trash2,
  Save,
  ShoppingBag,
  Warehouse,
  PackageSearch,
} from "lucide-react";

// ==============================================================================
// CONFIGURACIÓN DE URL DEL BACKEND (FEROZO / LOCALHOST)
// Si no usás VITE_API_URL en el .env, podés poner acá la URL de Ferozo entre comillas.
// Ejemplo: const API_BASE_URL = "https://ventas.conoflex.com.ar";
// Si dejás "", usará rutas relativas /api/...
// ==============================================================================
const API_BASE_URL = import.meta.env?.VITE_API_URL || "";

const getApiUrl = (path) => {
  const cleanPath = path.startsWith("/") ? path : "/" + path;
  return `${API_BASE_URL}${cleanPath}`;
};

// ESTADO INICIAL DE MÁQUINAS
const MAQUINAS_INICIALES = [
  {
    id: "ROT-01",
    planta: "Planta 1 — Rotomoldeo",
    nombre: "Horno Rotomoldeo #1",
    tipo: "rotomoldeo",
    estado: "produciendo",
    pos3D: [-14, 0, -6],
    temp: "195°C",
    presion: "1.2 bar",
    destino: "OP",
    opNumero: "OP-4810",
    cliente: "Comasa S.A.",
    fechaPedido: "2026-09-28",
    productos: [
      {
        codigo: "2400-2R",
        nombre: "Cono Autopista 120cm",
        cantidad: 300,
        hechas: 210,
      },
    ],
  },
  {
    id: "ROT-02",
    planta: "Planta 1 — Rotomoldeo",
    nombre: "Horno Rotomoldeo #2",
    tipo: "rotomoldeo",
    estado: "produciendo",
    pos3D: [0, 0, -6],
    temp: "188°C",
    presion: "1.0 bar",
    destino: "OP",
    opNumero: "OP-4835",
    cliente: "Distribuidora Norte",
    fechaPedido: "2026-09-30",
    productos: [
      {
        codigo: "2853-3R",
        nombre: "Columna Señalización c/Base",
        cantidad: 500,
        hechas: 140,
      },
    ],
  },
  {
    id: "ROT-03",
    planta: "Planta 1 — Rotomoldeo",
    nombre: "Horno Rotomoldeo #3",
    tipo: "rotomoldeo",
    estado: "mantenimiento",
    pos3D: [14, 0, -6],
    temp: "35°C",
    presion: "0 bar",
    destino: "STOCK",
    opNumero: "-",
    cliente: "-",
    fechaPedido: "-",
    productos: [],
  },
  {
    id: "INY-01",
    planta: "Planta 1 — Inyección",
    nombre: "Inyectora Haitian",
    tipo: "inyectora",
    estado: "produciendo",
    pos3D: [0, 0, 8],
    temp: "220°C",
    presion: "145 bar",
    destino: "OP",
    opNumero: "OP-4821",
    cliente: "Vialidad Provincial BA",
    fechaPedido: "2026-10-01",
    productos: [
      {
        codigo: "BASE-35",
        nombre: "Base Pesada 35x35",
        cantidad: 1200,
        hechas: 840,
      },
    ],
  },
];

export default function ProduccionPlanta() {
  const mountRef = useRef(null);
  const [maquinas, setMaquinas] = useState(MAQUINAS_INICIALES);
  const [modoVista, setVistaModo] = useState("3D");

  // HOVER 3D
  const [hoveredId, setHoveredId] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // ESTADOS DEL MODAL DE EDICIÓN DE CARGA
  const [maquinaEditando, setMaquinaEditando] = useState(null);
  const [draftConfig, setDraftConfig] = useState(null);
  const [searchOP, setSearchOP] = useState("");
  const [buscandoOP, setBuscandoOP] = useState(false);
  const [errorOP, setErrorOP] = useState("");

  const [searchSemi, setSearchSemi] = useState("");
  const [semiResults, setSemiResults] = useState([]);
  const [semielaboradosDB, setSemielaboradosDB] = useState([]);

  const maquinasRef = useRef(maquinas);
  useEffect(() => {
    maquinasRef.current = maquinas;
  }, [maquinas]);

  // ==========================================
  // LÓGICA CONEXIÓN A BASE DE DATOS (FEROZO)
  // ==========================================

  // 1. Cargar semielaborados desde Ferozo
  useEffect(() => {
    const fetchSemielaborados = async () => {
      try {
        const url = getApiUrl("/api/semielaborados");
        const res = await fetch(url);
        if (!res.ok) return;

        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) return;

        const data = await res.json();
        const list = data.semielaborados || data.productos || data || [];
        setSemielaboradosDB(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error("No se pudo sincronizar semielaborados:", err);
      }
    };

    fetchSemielaborados();
  }, []);

  // 2. Buscador de OP en tiempo real a Ferozo
  const handleBuscarOP = async () => {
    if (!searchOP) return;
    setBuscandoOP(true);
    setErrorOP("");

    try {
      let res = await fetch(getApiUrl("/api/pedidos"));
      if (!res.ok) {
        res = await fetch(getApiUrl("/api/estado-pedidos"));
      }

      if (!res.ok) {
        throw new Error(`El servidor respondió con código HTTP ${res.status}`);
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("La API no devolvió una estructura JSON válida.");
      }

      const data = await res.json();
      const pedidos = data.pedidos || data.estado_pedidos || data || [];

      // Filtro de coincidencia sobre campos habituales
      const pFound = pedidos.find(
        (p) =>
          (p.numero_op &&
            p.numero_op.toString().toLowerCase() === searchOP.toLowerCase()) ||
          (p.op && p.op.toString().toLowerCase() === searchOP.toLowerCase()) ||
          (p.id && p.id.toString() === searchOP) ||
          (p.numero_orden &&
            p.numero_orden.toString().toLowerCase() === searchOP.toLowerCase()),
      );

      if (pFound) {
        let prodsPedido = [];

        try {
          if (pFound.contenido && typeof pFound.contenido === "string") {
            if (pFound.contenido.trim().startsWith("[")) {
              const parsed = JSON.parse(pFound.contenido);
              prodsPedido = parsed.map((p) => ({
                codigo: p.codigo || "S/C",
                nombre: p.nombre || p.descripcion || "Producto",
                cantidad: Number(p.cantidad) || 1,
                hechas: 0,
              }));
            } else {
              prodsPedido = [
                {
                  codigo: "VARIO",
                  nombre: pFound.contenido,
                  cantidad: 1,
                  hechas: 0,
                },
              ];
            }
          }
        } catch (e) {
          prodsPedido = [
            {
              codigo: "VARIO",
              nombre: "Productos del Pedido",
              cantidad: 1,
              hechas: 0,
            },
          ];
        }

        const fechaFormat = pFound.fecha_pedido
          ? pFound.fecha_pedido.split("T")[0]
          : pFound.fecha
            ? pFound.fecha.split("T")[0]
            : new Date().toISOString().split("T")[0];

        setDraftConfig((prev) => ({
          ...prev,
          destino: "OP",
          opNumero: pFound.numero_op || pFound.op || searchOP.toUpperCase(),
          cliente:
            pFound.cliente || pFound.emailCliente || "Cliente Registrado",
          fechaPedido: fechaFormat,
          productos: prodsPedido.length > 0 ? prodsPedido : prev.productos,
        }));
      } else {
        setErrorOP(`No se encontró la OP "${searchOP}" en la base de datos.`);
      }
    } catch (error) {
      console.error("Error al buscar OP:", error);
      setErrorOP("Error consultando el servidor Ferozo.");
    } finally {
      setBuscandoOP(false);
    }
  };

  // 3. Filtrado dinámico de Semielaborados
  useEffect(() => {
    if (searchSemi.length < 2) {
      setSemiResults([]);
      return;
    }

    const query = searchSemi.toLowerCase();
    const resultados = semielaboradosDB
      .filter(
        (s) =>
          (s.nombre && s.nombre.toLowerCase().includes(query)) ||
          (s.codigo && s.codigo.toLowerCase().includes(query)),
      )
      .slice(0, 8);

    setSemiResults(resultados);
  }, [searchSemi, semielaboradosDB]);

  const agregarProductoStock = (prod) => {
    setDraftConfig((prev) => ({
      ...prev,
      productos: [
        ...prev.productos,
        {
          codigo: prod.codigo || "S/C",
          nombre: prod.nombre,
          cantidad: 100,
          hechas: 0,
        },
      ],
    }));
    setSearchSemi("");
    setSemiResults([]);
  };

  const eliminarProducto = (index) => {
    setDraftConfig((prev) => {
      const prods = [...prev.productos];
      prods.splice(index, 1);
      return { ...prev, productos: prods };
    });
  };

  const guardarConfiguracion = () => {
    setMaquinas((prev) =>
      prev.map((m) => (m.id === draftConfig.id ? draftConfig : m)),
    );
    setMaquinaEditando(null);
  };

  // ==========================================
  // MOTOR 3D PROCEDURAL Y ESPECTACULAR
  // ==========================================
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    container.innerHTML = "";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060913);
    scene.fog = new THREE.FogExp2(0x060913, 0.008);

    const width = container.clientWidth;
    const height = container.clientHeight;
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
    camera.position.set(38, 30, 42);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.minDistance = 15;
    controls.maxDistance = 90;

    const ambientLight = new THREE.AmbientLight(0x475569, 2.0);
    scene.add(ambientLight);

    const mainDirLight = new THREE.DirectionalLight(0xffffff, 3.5);
    mainDirLight.position.set(20, 50, 20);
    mainDirLight.castShadow = true;
    mainDirLight.shadow.mapSize.width = 2048;
    mainDirLight.shadow.mapSize.height = 2048;
    mainDirLight.shadow.bias = -0.0005;
    scene.add(mainDirLight);

    const fillLight = new THREE.DirectionalLight(0x0ea5e9, 1.5);
    fillLight.position.set(-30, 20, -30);
    scene.add(fillLight);

    const gridHelper = new THREE.GridHelper(80, 80, 0x1e293b, 0x0f172a);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    const createSectorPad = (x, z, w, d, colorHex) => {
      const geo = new THREE.BoxGeometry(w, 0.15, d);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.8,
        metalness: 0.5,
      });
      const pad = new THREE.Mesh(geo, mat);
      pad.position.set(x, -0.08, z);
      pad.receiveShadow = true;
      scene.add(pad);

      const edgeGeo = new THREE.BoxGeometry(w + 0.2, 0.04, d + 0.2);
      const edgeMat = new THREE.MeshBasicMaterial({ color: colorHex });
      const edge = new THREE.Mesh(edgeGeo, edgeMat);
      edge.position.set(x, -0.12, z);
      scene.add(edge);
    };

    createSectorPad(0, -6, 42, 12, 0xd97706);
    createSectorPad(0, 8, 22, 10, 0x10b981);

    const matSteel = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.8,
      roughness: 0.3,
    });
    const matChrome = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 1.0,
      roughness: 0.1,
    });
    const matDarkMetal = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.6,
      roughness: 0.6,
    });
    const matOrange = new THREE.MeshStandardMaterial({
      color: 0xea580c,
      metalness: 0.3,
      roughness: 0.4,
    });
    const matGreen = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      metalness: 0.2,
      roughness: 0.3,
    });
    const matCyan = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      metalness: 0.4,
      roughness: 0.2,
    });

    const animatables = [];
    const statusReactors = [];

    MAQUINAS_INICIALES.forEach((maq) => {
      const group = new THREE.Group();
      group.position.set(...maq.pos3D);
      group.userData = { id: maq.id };

      const isWorking = maq.estado === "produciendo";
      const statusColor = isWorking
        ? 0x10b981
        : maq.estado === "mantenimiento"
          ? 0xf59e0b
          : 0xf43f5e;

      const holoGeo = new THREE.OctahedronGeometry(0.35, 0);
      const holoMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x10b981,
        emissiveIntensity: 0.8,
        wireframe: true,
        transparent: true,
        opacity: 0.8,
      });
      const hologram = new THREE.Mesh(holoGeo, holoMat);
      hologram.position.set(0, 4.6, 0);
      group.add(hologram);

      const beaconGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.6, 12);
      const beaconMat = new THREE.MeshBasicMaterial({ color: statusColor });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(-2.0, 4.0, -1.2);
      group.add(beacon);

      statusReactors.push({ id: maq.id, beaconMat, hologram, holoMat });

      if (maq.tipo === "rotomoldeo") {
        const ovenBodyGeo = new THREE.BoxGeometry(3.6, 2.8, 3.2);
        const oven = new THREE.Mesh(ovenBodyGeo, matDarkMetal);
        oven.position.set(0, 1.8, 0);
        oven.castShadow = true;
        oven.receiveShadow = true;
        group.add(oven);

        const roofGeo = new THREE.BoxGeometry(4.0, 0.35, 3.5);
        const roof = new THREE.Mesh(roofGeo, matOrange);
        roof.position.set(0, 3.3, 0);
        roof.castShadow = true;
        group.add(roof);

        const ovenLight = new THREE.PointLight(0xf59e0b, 0, 8);
        ovenLight.position.set(0, 1.8, 0);
        group.add(ovenLight);
        statusReactors.push({
          id: maq.id,
          isOvenLight: true,
          light: ovenLight,
        });

        const carGeo = new THREE.BoxGeometry(1.6, 0.8, 2.2);
        const carLeft = new THREE.Mesh(carGeo, matOrange);
        carLeft.position.set(-4.0, 0.5, 0);
        carLeft.castShadow = true;
        group.add(carLeft);

        const shaftGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.4, 16);
        shaftGeo.rotateZ(Math.PI / 2);
        const shaftLeft = new THREE.Mesh(shaftGeo, matChrome);
        shaftLeft.position.set(-2.6, 1.4, 0);
        group.add(shaftLeft);

        const spiderPivotLeft = new THREE.Group();
        spiderPivotLeft.position.set(-1.3, 1.4, 0);
        const spiderRingGeo = new THREE.TorusGeometry(0.85, 0.06, 12, 24);
        const ringL = new THREE.Mesh(spiderRingGeo, matCyan);
        ringL.rotateY(Math.PI / 2);
        spiderPivotLeft.add(ringL);
        group.add(spiderPivotLeft);

        for (let i = 0; i < 4; i++) {
          const moldGeo = new THREE.ConeGeometry(0.28, 0.8, 16);
          const mold = new THREE.Mesh(moldGeo, matGreen);
          const angle = (i * Math.PI) / 2;
          mold.position.set(0, Math.sin(angle) * 0.85, Math.cos(angle) * 0.85);
          mold.rotation.x = angle;
          spiderPivotLeft.add(mold);
        }

        const carRight = new THREE.Mesh(carGeo, matOrange);
        carRight.position.set(4.0, 0.5, 0);
        carRight.castShadow = true;
        group.add(carRight);

        const shaftRight = new THREE.Mesh(shaftGeo, matChrome);
        shaftRight.position.set(2.6, 1.4, 0);
        group.add(shaftRight);

        const spiderPivotRight = new THREE.Group();
        spiderPivotRight.position.set(1.3, 1.4, 0);
        const ringR = new THREE.Mesh(spiderRingGeo, matCyan);
        ringR.rotateY(Math.PI / 2);
        spiderPivotRight.add(ringR);
        group.add(spiderPivotRight);

        const bladePivotL = new THREE.Group();
        bladePivotL.position.set(-4.0, 1.8, -1.6);
        const bladePivotR = new THREE.Group();
        bladePivotR.position.set(4.0, 1.8, -1.6);

        const shroudGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.25, 16);
        shroudGeo.rotateX(Math.PI / 2);
        const shroudL = new THREE.Mesh(shroudGeo, matDarkMetal);
        shroudL.position.copy(bladePivotL.position);
        group.add(shroudL);
        const shroudR = new THREE.Mesh(shroudGeo, matDarkMetal);
        shroudR.position.copy(bladePivotR.position);
        group.add(shroudR);

        const bladeGeo = new THREE.BoxGeometry(0.42, 0.08, 0.02);
        for (let b = 0; b < 3; b++) {
          const bladeL = new THREE.Mesh(bladeGeo, matCyan);
          bladeL.rotation.z = (b * Math.PI * 2) / 3;
          bladePivotL.add(bladeL);
          const bladeR = new THREE.Mesh(bladeGeo, matCyan);
          bladeR.rotation.z = (b * Math.PI * 2) / 3;
          bladePivotR.add(bladeR);
        }
        group.add(bladePivotL, bladePivotR);

        animatables.push({
          id: maq.id,
          update: (t, isWorking) => {
            if (!isWorking) return;
            spiderPivotLeft.rotation.x = t * 0.8;
            spiderPivotLeft.rotation.y = t * 0.5;
            spiderPivotRight.rotation.x = t * 0.7;
            spiderPivotRight.rotation.z = t * 0.4;
            bladePivotL.rotation.z = t * 15;
            bladePivotR.rotation.z = t * 15;
          },
        });
      }

      if (maq.tipo === "inyectora") {
        const bedGeo = new THREE.BoxGeometry(7.2, 0.8, 2.6);
        const machineBed = new THREE.Mesh(bedGeo, matDarkMetal);
        machineBed.position.set(0, 0.4, 0);
        machineBed.castShadow = true;
        machineBed.receiveShadow = true;
        group.add(machineBed);

        const platenGeo = new THREE.BoxGeometry(1.2, 2.2, 2.2);
        const fixedPlaten = new THREE.Mesh(platenGeo, matSteel);
        fixedPlaten.position.set(-0.8, 1.9, 0);
        fixedPlaten.castShadow = true;
        group.add(fixedPlaten);

        const movingPlaten = new THREE.Mesh(platenGeo, matSteel);
        movingPlaten.position.set(1.4, 1.9, 0);
        movingPlaten.castShadow = true;
        group.add(movingPlaten);

        for (let i = 0; i < 4; i++) {
          const tieBarGeo = new THREE.CylinderGeometry(0.1, 0.1, 4.8, 16);
          tieBarGeo.rotateZ(Math.PI / 2);
          const tieBar = new THREE.Mesh(tieBarGeo, matChrome);
          const yOff = 1.1 + (i % 2) * 1.6;
          const zOff = -0.8 + Math.floor(i / 2) * 1.6;
          tieBar.position.set(0, yOff, zOff);
          group.add(tieBar);
        }

        const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 2.6, 16);
        barrelGeo.rotateZ(Math.PI / 2);
        const barrel = new THREE.Mesh(barrelGeo, matSteel);
        barrel.position.set(-2.6, 1.9, 0);
        group.add(barrel);

        const heaterMat = new THREE.MeshStandardMaterial({
          color: 0xf97316,
          emissive: 0xf97316,
          emissiveIntensity: 0,
        });
        const bandGeo = new THREE.TorusGeometry(0.46, 0.06, 12, 24);
        for (let b = 0; b < 4; b++) {
          const band = new THREE.Mesh(bandGeo, heaterMat);
          band.rotateY(Math.PI / 2);
          band.position.set(-3.4 + b * 0.5, 1.9, 0);
          group.add(band);
        }
        statusReactors.push({ id: maq.id, isHeater: true, mat: heaterMat });

        const hopperGeo = new THREE.ConeGeometry(0.8, 1.4, 16);
        const hopper = new THREE.Mesh(hopperGeo, matCyan);
        hopper.position.set(-2.8, 3.3, 0);
        group.add(hopper);

        animatables.push({
          id: maq.id,
          update: (t, isWorking) => {
            if (!isWorking) return;
            movingPlaten.position.x = 0.6 + Math.abs(Math.sin(t * 1.5)) * 0.8;
          },
        });
      }

      scene.add(group);
    });

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      if (intersects.length > 0) {
        let parent = intersects[0].object;
        while (parent && !parent.userData?.id) {
          parent = parent.parent;
        }

        if (parent && parent.userData?.id) {
          setHoveredId(parent.userData.id);

          const worldPos = new THREE.Vector3();
          parent.getWorldPosition(worldPos);
          worldPos.y += 4.5;
          worldPos.project(camera);

          const screenX = ((worldPos.x + 1) * container.clientWidth) / 2;
          const screenY = ((-worldPos.y + 1) * container.clientHeight) / 2;

          setTooltipPos({ x: screenX, y: screenY });
          container.style.cursor = "pointer";
          return;
        }
      }
      setHoveredId(null);
      container.style.cursor = "default";
    };

    container.addEventListener("mousemove", handleMouseMove);

    let animationFrameId;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();
      const currentMaquinas = maquinasRef.current;

      statusReactors.forEach((reactor) => {
        const maqData = currentMaquinas.find((m) => m.id === reactor.id);
        if (!maqData) return;

        const isWorking = maqData.estado === "produciendo";
        const isMant = maqData.estado === "mantenimiento";
        const colorHex = isWorking ? 0x10b981 : isMant ? 0xf59e0b : 0xf43f5e;

        if (reactor.beaconMat) reactor.beaconMat.color.setHex(colorHex);

        if (reactor.hologram) {
          reactor.hologram.visible = isWorking;
          if (isWorking) {
            reactor.hologram.rotation.y = elapsedTime * 2;
            reactor.hologram.position.y = 4.8 + Math.sin(elapsedTime * 3) * 0.2;
          }
        }

        if (reactor.isOvenLight) {
          reactor.light.intensity = isWorking
            ? 4.0 + Math.sin(elapsedTime * 10) * 1.5
            : 0;
        }

        if (reactor.isHeater) {
          reactor.mat.emissiveIntensity = isWorking
            ? 1.0 + Math.sin(elapsedTime * 2) * 0.5
            : 0;
        }
      });

      animatables.forEach((anim) => {
        const maqData = currentMaquinas.find((m) => m.id === anim.id);
        const isWorking = maqData?.estado === "produciendo";
        anim.update(elapsedTime, isWorking);
      });

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
    };
  }, []);

  const maqHoverData = hoveredId
    ? maquinas.find((m) => m.id === hoveredId)
    : null;

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#070a12] border border-slate-800/80 rounded-2xl font-sans text-slate-200 shadow-2xl overflow-hidden relative">
      <div className="bg-[#0f172a]/90 border-b border-slate-800/80 p-4 flex flex-wrap items-center justify-between gap-4 shrink-0 backdrop-blur-xl z-20">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.15)]">
            <Cpu size={22} className="text-emerald-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xs font-bold text-white tracking-widest uppercase font-mono">
                PLANTA ISOMÉTRICA VIVA 3D
              </h2>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              3 Hornos Rotomoldeo en Fila & 1 Inyectora Haitian
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <button
            onClick={() => setVistaModo("3D")}
            className={`px-3.5 py-1.5 rounded-xl border transition cursor-pointer font-bold ${
              modoVista === "3D"
                ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                : "bg-[#090d16] border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            Vista 3D Isométrica
          </button>
          <button
            onClick={() => setVistaModo("CONFIG")}
            className={`px-3.5 py-1.5 rounded-xl border transition cursor-pointer flex items-center gap-1.5 ${
              modoVista === "CONFIG"
                ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold"
                : "bg-[#090d16] border-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <Settings size={14} />
            <span>Configuración</span>
          </button>
        </div>
      </div>

      <div className="flex-1 relative bg-[#070a12] overflow-hidden">
        <div
          ref={mountRef}
          className={`absolute inset-0 transition-opacity duration-300 ${
            modoVista === "3D"
              ? "opacity-100 z-0"
              : "opacity-0 -z-10 pointer-events-none"
          }`}
        />

        {modoVista === "3D" && maqHoverData && (
          <div
            style={{
              left: `${tooltipPos.x}px`,
              top: `${tooltipPos.y}px`,
              transform: "translate(-50%, -100%)",
            }}
            className="absolute z-20 pointer-events-none bg-[#0e1422]/95 border border-emerald-500/50 p-3.5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.9)] backdrop-blur-md font-mono text-xs animate-in fade-in zoom-in-95 max-w-[280px] space-y-1.5"
          >
            <div className="flex justify-between items-center gap-3 border-b border-slate-800 pb-1.5">
              <span className="text-amber-400 font-bold">
                [{maqHoverData.id}]
              </span>
              <span className="text-[10px] text-emerald-400 font-bold uppercase bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                {maqHoverData.estado}
              </span>
            </div>
            <h4 className="text-white font-bold font-sans truncate">
              {maqHoverData.nombre}
            </h4>

            {maqHoverData.productos.length > 0 ? (
              <div className="pt-1 text-[11px] text-slate-200 space-y-1">
                <span className="text-slate-400 block text-[10px]">
                  {maqHoverData.destino === "OP"
                    ? `OP: ${maqHoverData.opNumero} (${maqHoverData.cliente})`
                    : "PRODUCCIÓN PARA STOCK:"}
                </span>
                {maqHoverData.productos.map((p, i) => (
                  <div
                    key={i}
                    className="flex justify-between border-b border-slate-800/60 pb-1"
                  >
                    <span className="text-emerald-300 truncate max-w-[150px]">
                      {p.nombre}
                    </span>
                    <span className="font-bold text-white ml-2">
                      {p.hechas || 0}/{p.cantidad || 100}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-[10px] italic pt-1">
                Sin productos asignados.
              </p>
            )}

            <div className="flex justify-between text-[11px] text-emerald-300 pt-1 border-t border-slate-800/60">
              <span>Temp: {maqHoverData.temp}</span>
              <span>Presión: {maqHoverData.presion}</span>
            </div>
          </div>
        )}

        {modoVista === "CONFIG" && (
          <div className="absolute inset-0 z-10 bg-[#070a12] p-6 flex flex-col font-sans animate-in fade-in">
            <div className="shrink-0 mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                <Sliders size={15} className="text-emerald-400" />
                MATRIZ DE CONFIGURACIÓN DIRECTA
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Edición estructural de planta. Para modificar los
                productos/órdenes, utilizá el botón "Administrar Carga".
              </p>
            </div>

            <div className="flex-1 bg-[#0e1422] border border-slate-800/80 rounded-xl overflow-hidden shadow-2xl flex flex-col">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#090d16] text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                  <tr>
                    <th className="p-3 w-40">Máquina</th>
                    <th className="p-3 w-36">Estado</th>
                    <th className="p-3 w-24">Temp</th>
                    <th className="p-3 w-24">Presión</th>
                    <th className="p-3">Carga Actual (Resumen)</th>
                    <th className="p-3 w-40 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-[#070a12]/30 font-mono">
                  {maquinas.map((m) => (
                    <tr
                      key={m.id}
                      className="hover:bg-[#121824] transition-colors h-16"
                    >
                      <td className="p-3">
                        <span className="font-bold text-amber-400 text-[11px] block">
                          [{m.id}]
                        </span>
                        <span className="text-slate-200 text-[11px] font-sans font-bold leading-tight block truncate">
                          {m.nombre}
                        </span>
                      </td>

                      <td className="p-2.5">
                        <select
                          value={m.estado}
                          onChange={(e) => {
                            const newMaquinas = maquinas.map((maq) =>
                              maq.id === m.id
                                ? { ...maq, estado: e.target.value }
                                : maq,
                            );
                            setMaquinas(newMaquinas);
                          }}
                          className={`w-full border text-[11px] font-mono font-bold rounded-lg px-2.5 py-1.5 outline-none cursor-pointer ${
                            m.estado === "produciendo"
                              ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                              : m.estado === "mantenimiento"
                                ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                                : "bg-rose-500/10 text-rose-300 border-rose-500/30"
                          }`}
                        >
                          <option
                            value="produciendo"
                            className="bg-[#0e1422] text-emerald-400"
                          >
                            🟢 Produciendo
                          </option>
                          <option
                            value="mantenimiento"
                            className="bg-[#0e1422] text-amber-400"
                          >
                            🟡 Mantenimiento
                          </option>
                          <option
                            value="detenida"
                            className="bg-[#0e1422] text-rose-400"
                          >
                            🔴 Detenida
                          </option>
                        </select>
                      </td>

                      <td className="p-2.5">
                        <input
                          type="text"
                          value={m.temp}
                          onChange={(e) => {
                            const newMaquinas = maquinas.map((maq) =>
                              maq.id === m.id
                                ? { ...maq, temp: e.target.value }
                                : maq,
                            );
                            setMaquinas(newMaquinas);
                          }}
                          className="w-full bg-[#070a12] border border-slate-700 text-slate-200 text-[11px] px-2 py-1.5 rounded-lg outline-none focus:border-emerald-500/50"
                        />
                      </td>
                      <td className="p-2.5">
                        <input
                          type="text"
                          value={m.presion}
                          onChange={(e) => {
                            const newMaquinas = maquinas.map((maq) =>
                              maq.id === m.id
                                ? { ...maq, presion: e.target.value }
                                : maq,
                            );
                            setMaquinas(newMaquinas);
                          }}
                          className="w-full bg-[#070a12] border border-slate-700 text-slate-200 text-[11px] px-2 py-1.5 rounded-lg outline-none focus:border-emerald-500/50"
                        />
                      </td>

                      <td className="p-3">
                        {m.productos.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {m.productos.map((p, i) => (
                              <span
                                key={i}
                                className="bg-[#1e293b] text-cyan-300 border border-slate-700 px-2 py-1 rounded text-[9px]"
                              >
                                {p.codigo} (x{p.cantidad || 100})
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic text-[10px]">
                            Sin carga
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-center">
                        <button
                          onClick={() => {
                            setDraftConfig(JSON.parse(JSON.stringify(m)));
                            setSearchOP("");
                            setErrorOP("");
                            setMaquinaEditando(m.id);
                          }}
                          className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold px-3 py-1.5 rounded-lg transition-all text-[11px] inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Settings size={12} /> Adm. Carga
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {maquinaEditando && draftConfig && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[300] flex items-center justify-center p-4 font-sans animate-in fade-in duration-200">
          <div className="bg-[#0e1422] border border-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col relative text-xs">
            <div className="bg-[#090d16] border-b border-slate-800 p-5 flex items-center justify-between">
              <div>
                <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 mr-2">
                  [{draftConfig.id}]
                </span>
                <span className="text-sm font-bold text-white uppercase tracking-wider">
                  Administrar Carga de Producción
                </span>
              </div>
              <button
                onClick={() => setMaquinaEditando(null)}
                className="p-2 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-xl cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex gap-4 border-b border-slate-800 pb-4">
                <button
                  onClick={() =>
                    setDraftConfig({ ...draftConfig, destino: "OP" })
                  }
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold font-mono transition-all ${
                    draftConfig.destino === "OP"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                      : "bg-[#070a12] text-slate-500 border border-slate-800 hover:text-slate-300"
                  }`}
                >
                  <ShoppingBag size={14} /> Producción para Pedido (OP)
                </button>
                <button
                  onClick={() =>
                    setDraftConfig({ ...draftConfig, destino: "STOCK" })
                  }
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold font-mono transition-all ${
                    draftConfig.destino === "STOCK"
                      ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
                      : "bg-[#070a12] text-slate-500 border border-slate-800 hover:text-slate-300"
                  }`}
                >
                  <Warehouse size={14} /> Producción para Stock Mínimo
                </button>
              </div>

              {draftConfig.destino === "OP" && (
                <div className="space-y-4 bg-[#070a12] border border-emerald-500/20 p-4 rounded-xl relative">
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-400 font-mono block mb-1">
                        BUSCAR N° OP EN BASE DE DATOS
                      </label>
                      <div className="relative">
                        <Search
                          size={14}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                        />
                        <input
                          type="text"
                          value={searchOP}
                          onChange={(e) => setSearchOP(e.target.value)}
                          placeholder="Ej: 12251"
                          className={`w-full bg-[#0e1422] border text-white font-mono text-xs pl-9 pr-3 py-2 rounded-lg outline-none transition-colors ${
                            errorOP
                              ? "border-rose-500"
                              : "border-slate-700 focus:border-emerald-500"
                          }`}
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleBuscarOP}
                      disabled={buscandoOP || !searchOP}
                      className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                    >
                      {buscandoOP ? "Buscando..." : "Sincronizar OP"}
                    </button>
                  </div>

                  {errorOP && (
                    <span className="text-rose-400 text-[10px] absolute -bottom-5 left-4 font-mono">
                      {errorOP}
                    </span>
                  )}

                  {draftConfig.opNumero !== "-" &&
                    draftConfig.opNumero !== "" &&
                    !errorOP && (
                      <div className="bg-[#090d16] border border-slate-800 p-3 rounded-lg flex flex-wrap items-center gap-6 font-mono text-[11px] mt-2">
                        <div>
                          <span className="text-slate-500">OP Asignada:</span>{" "}
                          <strong className="text-emerald-400">
                            {draftConfig.opNumero}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Fecha:</span>{" "}
                          <strong className="text-white">
                            {draftConfig.fechaPedido}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Cliente:</span>{" "}
                          <strong className="text-cyan-400">
                            {draftConfig.cliente}
                          </strong>
                        </div>
                      </div>
                    )}
                </div>
              )}

              <div className="space-y-3">
                <label className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                  <span>PRODUCTOS A FABRICAR EN ESTA MÁQUINA</span>
                </label>

                <div className="relative">
                  <PackageSearch
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    type="text"
                    value={searchSemi}
                    onChange={(e) => setSearchSemi(e.target.value)}
                    placeholder="Buscar producto en tabla de Semielaborados para agregar..."
                    className="w-full bg-[#070a12] border border-slate-700 text-white font-sans text-xs pl-9 pr-3 py-2 rounded-lg outline-none focus:border-cyan-500"
                  />

                  {semiResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#0e1422] border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden max-h-48 overflow-y-auto">
                      {semiResults.map((s, idx) => (
                        <div
                          key={idx}
                          onClick={() => agregarProductoStock(s)}
                          className="px-3 py-2 hover:bg-[#1e293b] flex items-center justify-between cursor-pointer border-b border-slate-800/50 last:border-0"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-cyan-400">
                              [{s.codigo || "S/C"}]
                            </span>
                            <span className="text-white font-sans text-xs">
                              {s.nombre || "Semielaborado"}
                            </span>
                          </div>
                          <Plus size={14} className="text-emerald-400" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-[#070a12] border border-slate-800 rounded-xl overflow-hidden mt-2">
                  {draftConfig.productos.length > 0 ? (
                    <table className="w-full text-left">
                      <thead className="bg-[#090d16] font-mono text-[9px] text-slate-500 uppercase border-b border-slate-800">
                        <tr>
                          <th className="p-2 w-24">Código</th>
                          <th className="p-2">Descripción</th>
                          <th className="p-2 w-24 text-center">A Fabricar</th>
                          <th className="p-2 w-10 text-center">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {draftConfig.productos.map((p, idx) => (
                          <tr
                            key={idx}
                            className="hover:bg-[#121824] transition-colors"
                          >
                            <td className="p-2 font-mono text-amber-400 font-bold">
                              {p.codigo}
                            </td>
                            <td className="p-2 text-white">{p.nombre}</td>
                            <td className="p-2">
                              <input
                                type="number"
                                value={p.cantidad}
                                onChange={(e) => {
                                  const prods = [...draftConfig.productos];
                                  prods[idx].cantidad = Number(e.target.value);
                                  setDraftConfig({
                                    ...draftConfig,
                                    productos: prods,
                                  });
                                }}
                                className="w-full bg-[#0e1422] border border-slate-700 text-center text-white text-xs px-2 py-1 rounded-md outline-none focus:border-emerald-500"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <button
                                onClick={() => eliminarProducto(idx)}
                                className="text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-6 text-center text-slate-500 italic font-mono text-[11px]">
                      Sin productos asignados a la máquina.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-[#090d16] border-t border-slate-800 p-4 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setMaquinaEditando(null)}
                className="text-slate-400 hover:text-white px-4 py-2 font-mono font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={guardarConfiguracion}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-6 py-2 rounded-xl transition flex items-center gap-2 cursor-pointer"
              >
                <Save size={14} /> Aplicar Carga
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
